import mongoose, { Schema } from 'mongoose';

// ─── Mongoose Schemas — MUNI Order Service ─────────────────────────────────────
//
// Dates are stored as ISO strings (not BSON Date) so the schema maps 1:1 onto
// the domain types in `order.model.ts` with no conversion layer needed in the
// repository. Range queries on these fields aren't required by this service.

const OrderItemSchema = new Schema(
  {
    id:              { type: String, required: true },
    productId:       { type: String, required: true },
    variantId:       { type: String, default: null },
    sellerId:        { type: String, required: true },
    vendorId:        { type: String, default: null },
    productName:     { type: String, required: true },
    productSku:      { type: String, required: true },
    productImageUrl: { type: String, default: null },
    unitPrice:       { type: Number, required: true },
    quantity:        { type: Number, required: true, min: 1 },
    lineTotal:       { type: Number, required: true },
    weightKg:        { type: Number, default: null },
    reservationId:   { type: String, default: null },
  },
  { _id: false },
);

const ShippingSchema = new Schema(
  {
    address:  { type: String, required: true },
    city:     { type: String, required: true },
    district: { type: String, default: null },
    phone:    { type: String, required: true },
    notes:    { type: String, default: null },
  },
  { _id: false },
);

const SubOrderSchema = new Schema(
  {
    id:                    { type: String, required: true },
    subOrderNumber:        { type: String, required: true },
    masterOrderId:         { type: String, required: true },
    sellerId:              { type: String, required: true },
    sellerName:            { type: String, default: null },
    status:                { type: String, required: true, default: 'pending' },
    statusLabel:           { type: String, required: true },
    items:                 { type: [OrderItemSchema], default: [] },
    subtotal:              { type: Number, required: true },
    shippingFee:           { type: Number, required: true },
    taxAmount:             { type: Number, default: 0 },
    discountAmount:        { type: Number, default: 0 },
    totalAmount:           { type: Number, required: true },
    vendorShare:           { type: Number, required: true },
    platformCommission:    { type: Number, required: true },
    placedAt:              { type: String, required: true },
    shippedAt:             { type: String, default: null },
    deliveredAt:           { type: String, default: null },
    cancelledAt:           { type: String, default: null },
    trackingNumber:        { type: String, default: null },
    carrier:               { type: String, default: null },
    estimatedDeliveryDate: { type: String, default: null },
    updatedAt:             { type: String, required: true },
  },
  { _id: false },
);

const OrderSchema = new Schema(
  {
    _id:                { type: String, required: true }, // domain uuid, not a Mongo ObjectId
    orderNumber:        { type: String, required: true, unique: true },
    userId:             { type: String, required: true },
    status:             { type: String, required: true, default: 'pending' },
    statusLabel:        { type: String, required: true },
    subtotal:           { type: Number, required: true },
    shippingFee:        { type: Number, required: true },
    taxAmount:          { type: Number, default: 0 },
    discountAmount:     { type: Number, default: 0 },
    couponCode:         { type: String, default: null },
    totalAmount:        { type: Number, required: true },
    currency:           { type: String, default: 'UGX' },
    paymentMethod:      { type: String, default: null },
    paymentReference:   { type: String, default: null },
    shipping:           { type: ShippingSchema, required: true },
    items:              { type: [OrderItemSchema], default: [] },
    subOrders:          { type: [SubOrderSchema], default: [] },
    itemCount:          { type: Number, required: true },
    placedAt:           { type: String, default: null },
    paidAt:             { type: String, default: null },
    shippedAt:          { type: String, default: null },
    deliveredAt:        { type: String, default: null },
    cancelledAt:        { type: String, default: null },
    cancellationReason: { type: String, default: null },
    settlementPath:     { type: String, enum: ['saga', 'direct'], default: 'direct' },
    inventorySettledAt: { type: String, default: null },
    /**
     * The checkout session this order was created for — the idempotency key
     * for order creation.
     *
     * checkout-service derives one key per session and re-drives the whole
     * saga on confirm/retry. Nothing here recorded it, so a re-drive minted a
     * fresh masterOrderId and the customer ended up with two orders for one
     * payment. Persisting it lets `create()` return the original instead.
     *
     * Nullable for orders not created through checkout (direct/wholesale),
     * which is why the index below is sparse rather than a plain unique.
     */
    // No `default: null`. Mongoose applies a default when the field is absent,
    // which would write the very null the sparse index cannot tolerate more
    // than one of — undoing the omission order.service.ts now makes.
    checkoutSessionId:  { type: String },
    createdAt:          { type: String, required: true },
    updatedAt:          { type: String, required: true },
  },
  { _id: false, versionKey: false },
);

// Most common query: a user's order history, newest first
OrderSchema.index({ userId: 1, createdAt: -1 });
// Seller dashboard: this seller's sub-orders, optionally filtered by status, newest first
OrderSchema.index({ 'subOrders.sellerId': 1, 'subOrders.status': 1, 'subOrders.placedAt': -1 });
// Direct sub-order lookup by its own id
OrderSchema.index({ 'subOrders.id': 1 });
// Order-creation idempotency. `unique` is what makes this a guarantee rather
// than a best-effort check: two concurrent re-drives of the same checkout race
// on the same key and exactly one insert survives, the loser getting E11000
// (which create() turns back into the winning order). `sparse` so the many
// non-checkout orders, which OMIT this field, are not indexed at all.
//
// Omit, not null: sparse skips a document only when the field is absent. An
// explicit null is a value like any other and two of them collide, which is
// why both writers of this field — the service and the schema default — had to
// stop producing one.
OrderSchema.index({ checkoutSessionId: 1 }, { unique: true, sparse: true });

export const OrderModel = mongoose.model('Order', OrderSchema);

// ─── Atomic Order Number Counter ───────────────────────────────────────────────
// A single document with $inc avoids the race conditions and restart-resets of
// the old `let masterOrderCounter = 1000` in-process variable.

const CounterSchema = new Schema({
  _id: { type: String, required: true },
  seq: { type: Number, default: 999 },
});

export const CounterModel = mongoose.model('Counter', CounterSchema);

const ORDER_COUNTER_ID = 'masterOrderNumber';

export async function nextOrderSeq(): Promise<number> {
  const doc = await CounterModel.findByIdAndUpdate(
    ORDER_COUNTER_ID,
    { $inc: { seq: 1 } },
    { upsert: true, new: true },
  );
  return doc!.seq;
}
