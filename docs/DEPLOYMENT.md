# MUNI — Production Deployment and Rollback

How a release reaches production, what happens automatically when one goes bad,
and what to do by hand when the automation cannot.

For local setup and environment variables see
[Deployment_Guide.md](./Deployment_Guide.md). For database recovery see
[DISASTER_RECOVERY.md](./DISASTER_RECOVERY.md).

---

## 1. How a release ships

Production deploys are **tag-triggered**. Pushing a `vX.Y.Z` tag runs
`.github/workflows/cd-production.yml`:

| Stage | What it does | On failure |
|---|---|---|
| `validate-staging` | `curl -f https://staging-api.muni.ug/health/live` | Stops. Nothing is built. |
| `build-production-images` | Builds and pushes all 33 images to ECR; Trivy scans each | Stops. A CRITICAL or HIGH fixable CVE fails the build. |
| `deploy-production` → *Update Deployments* | `kubectl set image` per service, then `rollout status` | **Automatic rollback** |
| `deploy-production` → *Post-deploy health check* | `/health/live`, `/health/ready`, and a real catalogue read — each retried 10× at 15s | **Automatic rollback** |
| `deploy-production` → *Roll back on failure* | `rollout undo` on every service | Alerts on-call |
| `deploy-production` → *Alert on-call* | Posts to `ONCALL_WEBHOOK_URL` | Warns if unconfigured |
| `Create GitHub Release` | Release notes | — |

```bash
git tag v1.4.0 && git push origin v1.4.0
```

### Why the health check is separate from the rollout

`kubectl rollout status` only proves the pods reached Ready. That is a statement
about a process, not about the platform. A bad environment variable, a migration
that half-applied, or an upstream the new build cannot reach all produce
perfectly healthy pods serving errors.

The health check therefore tests three different things:

- `/health/live` — the process is up (what `rollout status` already knew)
- `/health/ready` — its **dependencies** are up; this is the one that catches a
  database or Redis the new build cannot reach
- a real catalogue read — the request path end to end, through the gateway's
  auth, rate limiting and proxy, into a service

It retries rather than checking once, because pods pass readiness before caches
are warm and before every replica has rotated. A single immediate `curl` tests
timing as much as health.

> **This was the gap.** Rollback used to live *inside* the rollout step, so it
> only ever fired when `rollout status` failed. A deploy whose pods came up
> healthy and whose smoke test then failed was left running in production while
> the job went red. The rollback is now its own step, conditioned on
> `failure()`, so it covers both.

---

## 2. Automatic rollback

Fires when **either** the rollout or the health check fails.

Every service is rolled back, not just the failing one. `rollout undo` is a
no-op on a Deployment that was never updated, so this is safe — and it is the
right call regardless, because a partially-rolled-back fleet is a version-skew
problem stacked on top of an outage.

After rollback the job waits for each Deployment to stabilise and logs any that
do not, so the alert names exactly what still needs a human.

### What it does *not* do

**Database migrations are not rolled back.** Prisma migrations are
forward-only: `migrate deploy` has no `down`. Rolling the application back to
the previous image while the schema stays migrated forward is safe **only if the
migration was backward-compatible**.

This is the single sharpest edge in the whole deploy path, and it is a
constraint on how migrations are written, not something automation can fix:

- **Safe to roll back through**: adding a nullable column, adding a table,
  adding an index, adding an enum value.
- **NOT safe**: dropping or renaming a column or table, narrowing a type, adding
  a `NOT NULL` column with no default. The old image will query something that
  no longer exists.

Ship destructive changes as two releases — expand, then contract, with at least
one release in between — so there is always a version that works against both
schemas.

If a rollback is needed across a destructive migration, restore the database:
[DISASTER_RECOVERY.md §3](./DISASTER_RECOVERY.md#3-runbook--restoring-postgresql).

---

## 3. Manual rollback

For when the automation could not run — the workflow itself failed, the failure
was found hours later, or the rollback was attempted and did not stabilise.

### 3.1 Kubernetes

```bash
aws eks update-kubeconfig --name muni-cluster --region af-south-1

# What is running, and what it was before
kubectl get deployments -n muni-prod -o wide
kubectl rollout history deployment/auth-service -n muni-prod

# One service
kubectl rollout undo deployment/auth-service -n muni-prod
kubectl rollout status deployment/auth-service -n muni-prod --timeout=300s

# To a specific revision
kubectl rollout undo deployment/auth-service -n muni-prod --to-revision=3

# Everything
SERVICES="api-gateway auth-service product-service order-service payment-service \
shipping-service notification-service analytics-service search-service inventory-service \
review-service currency-service tax-service discount-service wishlist-service cart-service \
media-service fraud-service return-service dispute-service marketplace-service \
fulfillment-service checkout-service"

for s in $SERVICES; do kubectl rollout undo deployment/$s -n muni-prod; done
for s in $SERVICES; do kubectl rollout status deployment/$s -n muni-prod --timeout=300s; done
```

Pinning to a known-good tag instead of stepping back one revision:

```bash
ECR=$(aws ecr describe-registry --query registryId --output text).dkr.ecr.af-south-1.amazonaws.com
for s in $SERVICES; do
  kubectl set image deployment/$s $s=$ECR/muni/$s:v1.3.0 -n muni-prod
done
```

### 3.2 Docker Compose

```bash
git checkout v1.3.0
docker compose --profile services up -d --build
docker compose ps
```

### 3.3 Verify — every time

A rollback is not finished when the pods are Ready. Same reasoning as §1.

```bash
curl -fsS https://api.muni.ug/health/live
curl -fsS https://api.muni.ug/health/ready
curl -fsS 'https://api.muni.ug/api/v1/products?limit=1'
```

Then confirm authentication, which is where a bad deploy does the most damage —
the auth checks in
[DISASTER_RECOVERY.md §4.3](./DISASTER_RECOVERY.md#43-auth-flows--the-ones-to-check-first).
An existing user signing in is the one that matters.

---

## 4. Deciding to roll back

Roll back **immediately**, without debugging first, when:

- the health check fails after a deploy
- error rate climbs sharply in Sentry against the new release
- authentication is failing for existing users
- checkout or payments are erroring

Diagnose from the rolled-back state. The system being up is worth more than the
evidence you lose, and the evidence is in Sentry and the logs anyway.

**Do not roll back** for a cosmetic bug, an issue that predates the release, or
something affecting a single non-critical endpoint. Fix forward.

---

## 5. On-call alerting

The *Alert on-call* step posts to `ONCALL_WEBHOOK_URL` on any production deploy
failure, after the automatic rollback has had its attempt — so whoever is paged
is told what already happened rather than discovering it.

Repository secrets:

| Secret | Purpose |
|---|---|
| `ONCALL_WEBHOOK_URL` | PagerDuty Events API v2 endpoint, or an Opsgenie/Slack webhook |
| `ONCALL_ROUTING_KEY` | PagerDuty integration key. Ignored by webhooks that do not use it. |

Unset, the step logs a warning and the workflow still fails visibly — the alert
is an addition to the red build, not a replacement for it.

The payload carries the tag, both step outcomes and a link to the run:

```json
{
  "routing_key": "…",
  "event_action": "trigger",
  "dedup_key": "muni-prod-deploy-v1.4.0",
  "payload": {
    "summary": "MUNI production deploy v1.4.0 FAILED — automatic rollback attempted",
    "severity": "critical",
    "custom_details": { "rollout": "success", "health_check": "failure", "run_url": "…" }
  }
}
```

`dedup_key` is the tag, so retrying a failed deploy updates the existing
incident rather than opening a second one.

---

## 6. Pre-deploy checklist

- [ ] CI green on the commit being tagged
- [ ] Staging healthy (`validate-staging` checks this, but check yourself too)
- [ ] Migrations reviewed for backward compatibility — see §2
- [ ] New environment variables added to `.env.example` **and** to the compose
      service that needs them. A variable documented only in a service's own
      `.env.example` never reaches the container.
- [ ] `npm audit --audit-level=high` clean at the root
- [ ] Someone is on call and knows a deploy is going out
