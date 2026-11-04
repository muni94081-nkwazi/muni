#!/usr/bin/env bash
#
# Scaffold the mechanical half of moving a service off an in-memory Map and
# onto Postgres. Everything this writes is identical across services; the
# schema, the repositories and the service refactor are hand-written per
# service because those are where the actual decisions are.
#
# Writes / edits:
#   src/db/prisma.ts                 singleton + connectDB fatal on failure
#   jest.config.mjs                  ts-jest + native ESM, if absent
#   package.json                     @prisma/client dep, prisma devDep,
#                                    db:generate / db:migrate scripts,
#                                    hoisted jest binary path
#   Dockerfile                       openssl in both stages, db:generate before
#                                    tsc, generated client copied into dist
#   .env.example                     DATABASE_URL
#
# Idempotent: re-running on an already-scaffolded service changes nothing.
#
# Usage: ./scripts/scaffold-persistence.sh <service-dir-name> <db-name>
#   e.g. ./scripts/scaffold-persistence.sh return-service muni_return

set -euo pipefail
cd "$(dirname "$0")/.."

SVC="${1:?usage: scaffold-persistence.sh <service-dir-name> <db-name>}"
DB="${2:?usage: scaffold-persistence.sh <service-dir-name> <db-name>}"
DIR="backend/services/$SVC"

[[ -d "$DIR" ]] || { echo "no such service: $DIR" >&2; exit 1; }

# Strip the -service suffix and camel-case it for the globalThis cache key.
SHORT="${SVC%-service}"
CAMEL="$(echo "$SHORT" | awk -F- '{printf "%s", $1; for(i=2;i<=NF;i++) printf "%s%s", toupper(substr($i,1,1)), substr($i,2)}')"

echo "── $SVC → $DB"

# ── src/db/prisma.ts ─────────────────────────────────────────────────────────
mkdir -p "$DIR/src/db" "$DIR/src/types" "$DIR/src/repositories" "$DIR/src/__tests__"
if [[ ! -f "$DIR/src/db/prisma.ts" ]]; then
  cat > "$DIR/src/db/prisma.ts" <<EOF
import { PrismaClient } from '../generated/prisma/index.js';

// ─── Singleton Prisma Client ──────────────────────────────────────────────────
//
// One PrismaClient per process; Prisma manages its own pool (default 10). Tune
// with the DATABASE_URL query param: ?connection_limit=20
//
// Attached to globalThis in development so \`tsx watch\` does not open a fresh
// pool on every file change.

const globalWithPrisma = globalThis as typeof globalThis & {
  __${CAMEL}Prisma?: PrismaClient;
};

function createPrismaClient(): PrismaClient {
  return new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });
}

export const prisma: PrismaClient =
  globalWithPrisma.__${CAMEL}Prisma ?? (globalWithPrisma.__${CAMEL}Prisma = createPrismaClient());

/**
 * Connect on startup, before app.listen(). A missing database is fatal: a
 * service that accepts writes it cannot durably record is worse than one that
 * is plainly down, because nobody finds out until the data is needed.
 */
export async function connectDB(): Promise<void> {
  await prisma.\$connect();
  console.log('[$SVC] ✅ PostgreSQL connected via Prisma');
}

export async function disconnectDB(): Promise<void> {
  await prisma.\$disconnect();
  console.log('[$SVC] PostgreSQL disconnected');
}
EOF
  echo "   + src/db/prisma.ts"
fi

# ── jest.config.mjs ──────────────────────────────────────────────────────────
# Any existing jest config wins — some services ship a jest.config.js, others
# put the config in package.json, and jest refuses to start when it finds two.
has_jest_config() {
  compgen -G "$DIR/jest.config.*" > /dev/null && return 0
  node -e "process.exit(require('./' + process.argv[1] + '/package.json').jest ? 0 : 1)" "$DIR"
}

if ! has_jest_config; then
  cp backend/services/dispute-service/jest.config.mjs "$DIR/jest.config.mjs"
  echo "   + jest.config.mjs"
fi

# ── package.json ─────────────────────────────────────────────────────────────
node - "$DIR" <<'NODE'
const fs = require('fs');
const dir = process.argv[2];
const p = `${dir}/package.json`;
const pkg = JSON.parse(fs.readFileSync(p, 'utf8'));
let touched = false;

pkg.dependencies ??= {};
pkg.devDependencies ??= {};
pkg.scripts ??= {};

if (!pkg.dependencies['@prisma/client']) { pkg.dependencies['@prisma/client'] = '^5.19.0'; touched = true; }
if (!pkg.devDependencies['prisma'])      { pkg.devDependencies['prisma'] = '^5.19.0';      touched = true; }
if (!pkg.scripts['db:generate'])         { pkg.scripts['db:generate'] = 'prisma generate';  touched = true; }
if (!pkg.scripts['db:migrate'])          { pkg.scripts['db:migrate'] = 'prisma migrate deploy'; touched = true; }

// jest is hoisted to the repo root; a bare node_modules/jest path does not
// resolve from inside a workspace.
const wantTest = 'node --experimental-vm-modules ../../../node_modules/jest/bin/jest.js --forceExit';
if (pkg.scripts.test !== wantTest) { pkg.scripts.test = wantTest; touched = true; }

// Sort dependency keys so the diff stays readable.
for (const k of ['dependencies', 'devDependencies']) {
  pkg[k] = Object.fromEntries(Object.entries(pkg[k]).sort(([a],[b]) => a.localeCompare(b)));
}

if (touched) {
  fs.writeFileSync(p, JSON.stringify(pkg, null, 2) + '\n');
  console.log('   ~ package.json');
}
NODE

# ── Dockerfile ───────────────────────────────────────────────────────────────
DF="$DIR/Dockerfile"
if [[ -f "$DF" ]] && ! grep -q 'db:generate' "$DF"; then
  export SVC

  # Single-quoted so bash leaves $ENV{SVC} for perl to read from the
  # environment; double quotes would have bash expand $ENV to nothing.
  perl -0777 -pi -e 's{^RUN apk add --no-cache python3 make g\+\+\r?$}{RUN apk add --no-cache python3 make g++ openssl}m' "$DF"

  perl -0777 -pi -e 's{(RUN npm run build --workspace=backend/services/\Q$ENV{SVC}\E)}{# The Prisma client is generated into src/generated/prisma, not node_modules,\n# so it must exist before tsc runs. Generating here also produces a linux\n# query engine rather than whatever the dev machine had.\nRUN npm run db:generate --workspace=backend/services/$ENV{SVC}\n\n$1}' "$DF"

  perl -0777 -pi -e 's{(RUN npm run build --workspace=backend/services/\Q$ENV{SVC}\E\r?\n)}{$1\n# tsc emits only what it compiled from .ts; the generated client is prebuilt\n# JS plus a native engine, so it is copied across by hand.\nRUN mkdir -p backend/services/$ENV{SVC}/dist/services/$ENV{SVC}/src \\\n && cp -R backend/services/$ENV{SVC}/src/generated backend/services/$ENV{SVC}/dist/services/$ENV{SVC}/src/generated\n}' "$DF"

  perl -0777 -pi -e 's{(# Security: run as non-root)}{# Prisma'"'"'s query engine is dynamically linked against OpenSSL on Alpine.\nRUN apk add --no-cache openssl\n\n$1}' "$DF"

  echo "   ~ Dockerfile"
fi

# ── .env.example ─────────────────────────────────────────────────────────────
ENVF="$DIR/.env.example"
if [[ -f "$ENVF" ]] && ! grep -q '^DATABASE_URL=' "$ENVF"; then
  {
    echo ""
    echo "# ── Database ─────────────────────────────────────────────────────────────────"
    echo "# $SVC owns $DB. Required: the service refuses to bind its port"
    echo "# without it, because state it cannot durably record is state that silently"
    echo "# disappears on the next restart."
    echo "DATABASE_URL=postgresql://muni:muni_secret@localhost:5432/$DB"
  } >> "$ENVF"
  echo "   ~ .env.example"
fi

echo "   done"
