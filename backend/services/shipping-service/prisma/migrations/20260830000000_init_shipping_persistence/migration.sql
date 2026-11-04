-- CreateEnum
CREATE TYPE "Region" AS ENUM ('KAMPALA', 'ENTEBBE', 'JINJA', 'UPCOUNTRY');

-- CreateEnum
CREATE TYPE "PickupStationStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'FULL');

-- CreateEnum
CREATE TYPE "PackageHoldStatus" AS ENUM ('AWAITING_PICKUP', 'COLLECTED');

-- CreateEnum
CREATE TYPE "ShipmentStatus" AS ENUM ('order_placed', 'picked_up', 'in_transit', 'out_for_delivery', 'delivered', 'failed', 'returned');

-- CreateTable
CREATE TABLE "shipments" (
    "id" TEXT NOT NULL,
    "shipment_id" TEXT NOT NULL,
    "tracking_number" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "sub_order_id" TEXT,
    "from_location" TEXT NOT NULL,
    "to_location" TEXT NOT NULL,
    "weight_kg" DECIMAL(10,3) NOT NULL,
    "service_level" TEXT NOT NULL,
    "carrier" TEXT,
    "status" "ShipmentStatus" NOT NULL DEFAULT 'in_transit',
    "label_url" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shipments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shipment_events" (
    "id" TEXT NOT NULL,
    "shipment_id" TEXT NOT NULL,
    "status" "ShipmentStatus" NOT NULL,
    "description" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "carrier" TEXT,
    "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shipment_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "delivery_proofs" (
    "id" TEXT NOT NULL,
    "shipment_id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "image_url" TEXT,
    "signature_url" TEXT,
    "recipient_name" TEXT NOT NULL,
    "captured_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "delivery_proofs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pickup_stations" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "region" "Region" NOT NULL,
    "address" TEXT NOT NULL,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "contact_phone" TEXT NOT NULL,
    "operating_hours" JSONB NOT NULL,
    "capacity" INTEGER NOT NULL,
    "current_load" INTEGER NOT NULL DEFAULT 0,
    "status" "PickupStationStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pickup_stations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "package_holds" (
    "id" TEXT NOT NULL,
    "station_id" TEXT NOT NULL,
    "tracking_number" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "recipient_name" TEXT NOT NULL,
    "recipient_phone" TEXT NOT NULL,
    "shelf_code" TEXT,
    "status" "PackageHoldStatus" NOT NULL DEFAULT 'AWAITING_PICKUP',
    "pickup_code_hash" TEXT NOT NULL,
    "checked_in_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "checked_in_by" TEXT NOT NULL,
    "checked_out_at" TIMESTAMP(3),
    "checked_out_by" TEXT,

    CONSTRAINT "package_holds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "station_code_sequences" (
    "region" "Region" NOT NULL,
    "seq" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "station_code_sequences_pkey" PRIMARY KEY ("region")
);

-- CreateIndex
CREATE UNIQUE INDEX "shipments_shipment_id_key" ON "shipments"("shipment_id");

-- CreateIndex
CREATE UNIQUE INDEX "shipments_tracking_number_key" ON "shipments"("tracking_number");

-- CreateIndex
CREATE INDEX "shipments_order_id_idx" ON "shipments"("order_id");

-- CreateIndex
CREATE INDEX "shipments_status_created_at_idx" ON "shipments"("status", "created_at");

-- CreateIndex
CREATE INDEX "shipment_events_shipment_id_occurred_at_idx" ON "shipment_events"("shipment_id", "occurred_at");

-- CreateIndex
CREATE UNIQUE INDEX "delivery_proofs_shipment_id_key" ON "delivery_proofs"("shipment_id");

-- CreateIndex
CREATE INDEX "delivery_proofs_order_id_idx" ON "delivery_proofs"("order_id");

-- CreateIndex
CREATE UNIQUE INDEX "pickup_stations_code_key" ON "pickup_stations"("code");

-- CreateIndex
CREATE INDEX "pickup_stations_region_status_idx" ON "pickup_stations"("region", "status");

-- CreateIndex
CREATE INDEX "package_holds_station_id_status_idx" ON "package_holds"("station_id", "status");

-- CreateIndex
CREATE INDEX "package_holds_order_id_idx" ON "package_holds"("order_id");

-- CreateIndex
CREATE INDEX "package_holds_tracking_number_idx" ON "package_holds"("tracking_number");

-- AddForeignKey
ALTER TABLE "shipment_events" ADD CONSTRAINT "shipment_events_shipment_id_fkey" FOREIGN KEY ("shipment_id") REFERENCES "shipments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_proofs" ADD CONSTRAINT "delivery_proofs_shipment_id_fkey" FOREIGN KEY ("shipment_id") REFERENCES "shipments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "package_holds" ADD CONSTRAINT "package_holds_station_id_fkey" FOREIGN KEY ("station_id") REFERENCES "pickup_stations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ── One active hold per parcel, per station ──────────────────────────────────
--
-- checkOutPackage resolves "the AWAITING_PICKUP hold for this tracking number
-- at this station" and assumed exactly one existed. Nothing enforced that: two
-- concurrent check-ins of the same parcel produced two holds, the second
-- silently unreachable, and the station's currentLoad double-counted.
--
-- Partial rather than a plain composite unique, because a parcel that has been
-- COLLECTED may legitimately be lodged again later (a failed handover, a
-- return). Prisma's schema language cannot express a WHERE clause on an index,
-- so this is written by hand — `prisma migrate diff` will not reproduce it, and
-- it must be carried forward if this migration is ever regenerated.
CREATE UNIQUE INDEX "package_holds_active_unique"
  ON "package_holds" ("station_id", "tracking_number")
  WHERE "status" = 'AWAITING_PICKUP';
