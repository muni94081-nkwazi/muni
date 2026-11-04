#!/bin/bash
# =============================================================================
# MUNI Phase 7 — Database Setup Script
# Sets up PostgreSQL databases and runs Prisma migrations
# Run from: C:\PROJECTS\Projects\MUNI\backend
# =============================================================================

set -e

echo "🔧 MUNI Phase 7 — Database Setup"
echo "================================="

# ── Step 1: Start infrastructure ──────────────────────────────────────────────
echo ""
echo "▶ Step 1: Starting infrastructure (postgres, redis, elasticsearch)..."
docker compose up -d postgres redis elasticsearch

echo "   Waiting 10 seconds for PostgreSQL to be ready..."
sleep 10

# ── Step 2: Create the muni_products database ─────────────────────────────────
echo ""
echo "▶ Step 2: Creating muni_products database..."
docker exec muni-postgres psql -U muni -c "CREATE DATABASE muni_products;" 2>/dev/null \
  && echo "   ✅ Database 'muni_products' created" \
  || echo "   ℹ️  Database 'muni_products' already exists"

# Grant privileges
docker exec muni-postgres psql -U muni -c "GRANT ALL PRIVILEGES ON DATABASE muni_products TO muni;" 2>/dev/null || true

# ── Step 3: Copy .env for product-service ─────────────────────────────────────
echo ""
echo "▶ Step 3: Setting up product-service .env..."
PRODUCT_ENV="./services/product-service/.env"
if [ ! -f "$PRODUCT_ENV" ]; then
  cp ./services/product-service/.env.example "$PRODUCT_ENV"
  echo "   ✅ Created .env from .env.example"
else
  echo "   ℹ️  .env already exists — skipping copy"
fi

# Ensure DATABASE_URL points to muni_products
sed -i 's|muni_auth|muni_products|g' "$PRODUCT_ENV" 2>/dev/null || true

# ── Step 4: Install dependencies ──────────────────────────────────────────────
echo ""
echo "▶ Step 4: Installing product-service dependencies..."
cd services/product-service
npm install
echo "   ✅ Dependencies installed"

# ── Step 5: Generate Prisma client ────────────────────────────────────────────
echo ""
echo "▶ Step 5: Generating Prisma client..."
npx prisma generate
echo "   ✅ Prisma client generated"

# ── Step 6: Run migrations ────────────────────────────────────────────────────
echo ""
echo "▶ Step 6: Running database migrations..."
DATABASE_URL="postgresql://muni:muni_secret@localhost:5432/muni_products" \
  npx prisma migrate dev --name phase7_product_catalog_upgrade
echo "   ✅ Migrations complete"

# ── Step 7: Seed the database ─────────────────────────────────────────────────
echo ""
echo "▶ Step 7: Seeding database with products, categories, and variants..."
DATABASE_URL="postgresql://muni:muni_secret@localhost:5432/muni_products" \
  npm run db:seed
echo "   ✅ Seed complete"

cd ../..

# ── Step 8: Generate Prisma client for inventory-service ──────────────────────
echo ""
echo "▶ Step 8: Installing inventory-service dependencies..."
cd services/inventory-service
npm install
cd ../..
echo "   ✅ inventory-service dependencies installed"

# ── Done ──────────────────────────────────────────────────────────────────────
echo ""
echo "🎉 Phase 7 Database Setup Complete!"
echo ""
echo "Next steps:"
echo "  1. Start product-service:   npm run dev --workspace=@muni/product-service"
echo "  2. Start inventory-service: npm run dev --workspace=@muni/inventory-service"
echo "  3. View Prisma Studio:      cd services/product-service && npx prisma studio"
echo "  4. Test API:                curl http://localhost:4002/api/v1/categories"
echo ""
