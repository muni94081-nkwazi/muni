-- One delivery job per sub-order.
--
-- Stage 8 made order-service book a job automatically when a seller accepts a
-- sub-order. Anything automatic gets retried — by a failed HTTP call, a
-- restart mid-write, or a seller double-clicking Accept — and two jobs for one
-- parcel means two riders can claim it and two cash collections can be recorded
-- against the same order.
--
-- Application-level checks lose that race; a unique index does not. Partial,
-- because sub_order_id is nullable: a manually booked ops job that names no
-- sub-order is still allowed, and several of them do not collide with each
-- other under this index.
CREATE UNIQUE INDEX IF NOT EXISTS "Fulfillment_sub_order_id_key"
  ON "fulfillments" ("sub_order_id")
  WHERE "sub_order_id" IS NOT NULL;
