import { NavLink, Outlet, Navigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';


import { LoadingState } from '@/components/common/LoadingState';
import { ADMIN_ROUTES, ADMIN_PANEL_URL } from '@/router/routes';

const NAV = [
  { to: ADMIN_ROUTES.overview, label: '📊 Overview', end: true },
  { to: ADMIN_ROUTES.orders, label: '📦 Orders', end: false },
  { to: ADMIN_ROUTES.products, label: '🛍️ Products', end: false },
  { to: ADMIN_ROUTES.users, label: '👥 Users', end: false },
  { to: ADMIN_ROUTES.coupons, label: '🏷️ Coupons', end: false },
  { to: ADMIN_ROUTES.notifications, label: '🔔 Notifications', end: false },
  { to: '/system-status', label: '🟢 System Status', end: false },
];

export function AdminLayout() {
  const { user, isAuthenticated, isLoading, isAdmin, logout: doLogout } = useAuth();
  

  if (isLoading && !user) return <LoadingState label="Checking admin access..." />;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (!isAdmin) return <Navigate to="/dashboard" replace />;

  async function handleLogout() {
    await doLogout();
    window.location.assign('/login');
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#f0f2f5' }}>
      {/* ---- Sidebar ---- */}
      <aside style={{
        width: 240,
        background: '#131921',
        color: '#fff',
        display: 'flex',
        flexDirection: 'column',
        flexShrink: 0,
        position: 'sticky',
        top: 0,
        height: '100vh',
        overflowY: 'auto',
      }}>
        {/* Logo */}
        <div style={{
          padding: 'var(--space-5)',
          borderBottom: '1px solid rgba(255,255,255,0.1)',
        }}>
          <div style={{ fontSize: 'var(--text-xl)', fontWeight: 700, color: '#febd69' }}>Muni Admin</div>
          <div style={{ fontSize: 'var(--text-xs)', color: '#999', marginTop: 4 }}>Seller Central</div>
        </div>

        {/* Nav items */}
        <nav style={{ flex: 1, padding: 'var(--space-3)' }}>
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              style={({ isActive }) => ({
                display: 'block',
                padding: 'var(--space-3) var(--space-4)',
                borderRadius: 'var(--radius-md)',
                marginBottom: 'var(--space-1)',
                fontSize: 'var(--text-sm)',
                fontWeight: isActive ? 700 : 400,
                background: isActive ? 'rgba(254,189,105,0.15)' : 'transparent',
                color: isActive ? '#febd69' : '#ddd',
                textDecoration: 'none',
                borderLeft: isActive ? '3px solid #febd69' : '3px solid transparent',
              })}
            >
              {item.label}
            </NavLink>
          ))}

          <a
            href={ADMIN_PANEL_URL}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: 'var(--space-3) var(--space-4)',
              borderRadius: 'var(--radius-md)',
              marginTop: 'var(--space-3)',
              borderTop: '1px solid rgba(255,255,255,0.1)',
              paddingTop: 'calc(var(--space-3) + var(--space-3))',
              fontSize: 'var(--text-sm)',
              color: '#ddd',
              textDecoration: 'none',
            }}
          >
            <span>🧭 Full Admin Panel</span>
            <span style={{ fontSize: 'var(--text-xs)', color: '#999' }}>↗</span>
          </a>
        </nav>

        {/* Bottom user bar */}
        <div style={{
          padding: 'var(--space-4)',
          borderTop: '1px solid rgba(255,255,255,0.1)',
          fontSize: 'var(--text-xs)',
        }}>
          <div style={{ color: '#999', marginBottom: 4 }}>Logged in as</div>
          <div style={{ fontWeight: 700, marginBottom: 'var(--space-2)', color: '#fff' }}>
            {user?.firstName} {user?.lastName}
          </div>
          <button
            onClick={handleLogout}
            style={{
              background: 'transparent',
              border: '1px solid rgba(255,255,255,0.3)',
              color: '#ccc',
              padding: '4px 12px',
              borderRadius: 'var(--radius-sm)',
              cursor: 'pointer',
              fontSize: 'var(--text-xs)',
            }}
          >
            Sign out
          </button>
        </div>
      </aside>

      {/* ---- Main content ---- */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {/* Top header */}
        <div style={{
          background: '#fff',
          borderBottom: '1px solid #e0e0e0',
          padding: 'var(--space-3) var(--space-5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          position: 'sticky',
          top: 0,
          zIndex: 10,
        }}>
          <div style={{ fontSize: 'var(--text-sm)', color: '#666' }}>
            Muni Seller Central · Admin Panel
          </div>
          <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'center' }}>
            <span style={{ fontSize: 'var(--text-xs)', color: '#666' }}>Uganda, EAT</span>
            <span style={{
              background: '#e8f5e9',
              color: '#2e7d32',
              fontSize: 'var(--text-xs)',
              fontWeight: 700,
              padding: '2px 8px',
              borderRadius: 'var(--radius-sm)',
            }}>
              ● Live
            </span>
          </div>
        </div>

        <main style={{ flex: 1, padding: 'var(--space-5)' }}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
