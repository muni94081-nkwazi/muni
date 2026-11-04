import { Router, type RequestHandler } from 'express';
import type { NextFunction, Request, Response } from 'express';
import { sellerVerifySchema } from '../../../../shared/validators/common.js';
import * as sellerService from '../services/seller.service.js';
import * as rbacService from '../services/rbac.service.js';
import { requireAuth } from '../../../../shared/http/service-auth.middleware.js';
import * as auth from '../services/auth.service.js';
import type { VerificationStatus } from '../generated/prisma/index.js';

// ─── Admin Guards ─────────────────────────────────────────────────────────────
//
// Identity comes from `requireAuth` (shared/http/service-auth.middleware), which
// verifies the gateway's signed assertion when INTERNAL_IDENTITY_SECRET is
// configured and falls back to the stamped headers when it is not.
//
// This used to read `x-user-roles` straight off the request. That is only safe
// while the gateway strips inbound copies AND nothing else can reach this
// service — so a request arriving on the pod's port with a hand-written
// `x-user-roles: ROLE_ADMIN` header was an admin. Everything here can approve
// sellers and reassign roles, which makes it the last place to trust a header.

function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  requireAuth(req, res, () => {
    const roles = (res.locals.roles as string[]) ?? [];
    if (!roles.includes('ROLE_ADMIN') && !roles.includes('ROLE_SUPER_ADMIN')) {
      res.status(403).json({ message: 'Admin access required' });
      return;
    }
    next();
  });
}

// ─── Router ───────────────────────────────────────────────────────────────────

export const adminRouter = Router();

// Apply admin guard to ALL routes on this router
adminRouter.use(requireAdmin as RequestHandler);

// ─── GET /api/v1/admin/stats ──────────────────────────────────────────────────
// Identity-side slice of the admin dashboard: user, customer and seller counts.
//
// Called server-to-server by the gateway's /api/v1/admin/dashboard/stats
// aggregator (which forwards the caller's x-user-id / x-user-roles, so the
// requireAdmin guard above still applies), not by the browser directly.

adminRouter.get(
  '/admin/stats',
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      res.json({ success: true, data: await sellerService.getIdentityStats() });
    } catch (e) { next(e); }
  },
);

// ─── GET /api/v1/admin/dashboard/recent-sellers ───────────────────────────────
// Newest seller applications for the dashboard feed. Defaults to the pending
// queue — a verified seller from six months ago is not "recent activity" an
// admin needs to act on.

adminRouter.get(
  '/admin/dashboard/recent-sellers',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const limit = Math.min(50, Math.max(1, Number(req.query.limit ?? 10)));
      const statusParam = req.query.status as string | undefined;

      const valid: VerificationStatus[] = ['pending', 'verified', 'rejected', 'suspended'];
      // 'all' is an explicit opt-out of the pending default rather than a
      // missing value, so it is distinguishable from `?status=` typo'd away.
      const status =
        statusParam === 'all'
          ? undefined
          : valid.includes(statusParam as VerificationStatus)
            ? (statusParam as VerificationStatus)
            : 'pending';

      const result = await sellerService.listSellers({ status, page: 1, limit });
      res.json({
        data: result.sellers,
        meta: { total: result.total, page: result.page, perPage: result.limit },
      });
    } catch (e) { next(e); }
  },
);

// ─── GET /api/v1/admin/sellers/pending ────────────────────────────────────────
// Paginated list of sellers awaiting KYC review.

adminRouter.get(
  '/admin/sellers/pending',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const page  = Math.max(1, Number(req.query.page  ?? 1));
      const limit = Math.min(100, Number(req.query.limit ?? 20));
      const result = await sellerService.listSellers({ status: 'pending', page, limit });
      res.json(result);
    } catch (e) { next(e); }
  },
);

// ─── GET /api/v1/admin/sellers ────────────────────────────────────────────────
// All sellers. Optional ?status=pending|verified|rejected|suspended

adminRouter.get(
  '/admin/sellers',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const page   = Math.max(1, Number(req.query.page  ?? 1));
      const limit  = Math.min(100, Number(req.query.limit ?? 20));
      const status = req.query.status as VerificationStatus | undefined;

      const valid: VerificationStatus[] = ['pending', 'verified', 'rejected', 'suspended'];
      if (status && !valid.includes(status)) {
        res.status(400).json({ message: `status must be one of: ${valid.join(', ')}` });
        return;
      }

      const result = await sellerService.listSellers({ status, page, limit });
      res.json(result);
    } catch (e) { next(e); }
  },
);

// ─── GET /api/v1/admin/sellers/:id ───────────────────────────────────────────
// Single seller profile by sellerId (SellerProfile.id, not userId).

adminRouter.get(
  '/admin/sellers/:id',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Fetch single seller — reuse listSellers with a direct Prisma call for now
      const { prisma } = await import('../db/prisma.js');
      const profile = await prisma.sellerProfile.findUnique({
        where:   { id: String(req.params['id']) },
        include: { documents: true, user: { select: { email: true, firstName: true, lastName: true } } },
      });
      if (!profile) {
        res.status(404).json({ message: 'Seller not found' });
        return;
      }
      res.json(profile);
    } catch (e) { next(e); }
  },
);

// ─── PUT /api/v1/admin/sellers/:id/verify ────────────────────────────────────
// Approve / reject / suspend / reinstate a seller.
// Body: { action: 'approve'|'reject'|'suspend'|'reinstate', reason?: string }

adminRouter.put(
  '/admin/sellers/:id/verify',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const adminId = String(res.locals.userId ?? '');
      const { action, reason } = sellerVerifySchema.parse(req.body);

      const updated = await sellerService.verifySeller(
        String(req.params['id']),
        adminId,
        action,
        reason,
      );

      const messages: Record<string, string> = {
        approve:   'Seller approved — ROLE_SELLER granted',
        reject:    'Seller application rejected',
        suspend:   'Seller account suspended',
        reinstate: 'Seller account reinstated',
      };

      res.json({ message: messages[action] ?? 'Done', seller: updated });
    } catch (e) { next(e); }
  },
);

// ─── RBAC: roles, permissions and staff ───────────────────────────────────────
//
// These back the admin panel's role governance screens, which were previously
// driven entirely by an in-memory mock — a randomly generated roster whose
// role changes survived until the next page reload and affected nobody's
// actual access.

// ─── GET /api/v1/admin/roles ──────────────────────────────────────────────────
// The role catalogue: what each role is called, which department owns it, and
// what it grants.

adminRouter.get(
  '/admin/roles',
  (_req: Request, res: Response) => {
    res.json({ success: true, data: rbacService.listRoles() });
  },
);

// ─── GET /api/v1/admin/permissions ────────────────────────────────────────────
// The permission matrix — each permission and the roles that hold it.

adminRouter.get(
  '/admin/permissions',
  (_req: Request, res: Response) => {
    res.json({ success: true, data: rbacService.listPermissions() });
  },
);

// ─── GET /api/v1/admin/staff ──────────────────────────────────────────────────
// Internal staff: users holding an admin role. Never marketplace customers.

adminRouter.get(
  '/admin/staff',
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      res.json({ success: true, data: await rbacService.listStaff() });
    } catch (e) { next(e); }
  },
);

// ─── PUT /api/v1/admin/staff/:userId/role ─────────────────────────────────────
// Reassign a staff member's role. This rewrites their platform roles, so it
// changes what they can actually do — not just what the panel displays.
//
// Restricted to super admins: a catalog moderator who could grant themselves
// finance access would make the whole role model decorative.

adminRouter.put(
  '/admin/staff/:userId/role',
  (req: Request, res: Response, next: NextFunction) => {
    const roles = (res.locals.roles as string[]) ?? [];
    if (!roles.includes('ROLE_SUPER_ADMIN')) {
      res.status(403).json({ message: 'Only a super admin can assign roles' });
      return;
    }
    next();
  },
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const role = String(req.body?.role ?? '');
      if (!rbacService.isAdminRole(role)) {
        res.status(400).json({
          message: `role must be one of: ${rbacService.listRoles().map((r) => r.id).join(', ')}`,
        });
        return;
      }

      const staff = await rbacService.assignRole(String(req.params['userId']), role);

      res.json({
        success: true,
        data: {
          staff,
          // The panel renders this straight into its activity feed; deriving it
          // here keeps the audit wording consistent with what actually changed.
          logEntry: {
            actorId:           res.locals.userId as string,
            action:            'role.assigned',
            targetDescription: `${staff.firstName} ${staff.lastName} → ${staff.role}`,
            timestamp:         new Date().toISOString(),
          },
        },
      });
    } catch (e) { next(e); }
  },
);

// ─── GET /api/v1/users ────────────────────────────────────────────────────────
//
// The full user directory. It lives on this router — rather than beside
// /users/me in app.ts, where it was declared with only `requireUser` — because
// every row it returns is another person's email, phone number and roles.
//
// It WAS already reachable only by an admin, but by accident of mount order:
// `app.use('/api/v1', adminRouter)` runs this router's blanket requireAdmin for
// every /api/v1/* request that no earlier route handled, and the old
// `app.get('/api/v1/users')` was declared after that mount. Move either line
// and the guard silently disappears. Declaring the route on the guarded router
// makes the protection a property of the route instead of a property of the
// file's line ordering.
//
// The URL is unchanged (adminRouter is mounted at /api/v1), so admin-panel and
// the gateway's /users mapping keep working.
adminRouter.get(
  '/users',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await auth.listUsers({
        page:  Number(req.query.page  ?? 1),
        limit: Number(req.query.limit ?? 20),
      });
      res.json(result);
    } catch (e) { next(e); }
  },
);
