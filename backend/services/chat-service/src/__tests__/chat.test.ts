import { jest, describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

const mockPublish = jest.fn<() => Promise<void>>().mockResolvedValue();

jest.unstable_mockModule('../../../../shared/kafka/producer.js', () => ({
  publish: mockPublish,
  connectProducer: jest.fn<() => Promise<void>>().mockResolvedValue(),
  disconnectProducer: jest.fn<() => Promise<void>>().mockResolvedValue(),
  isProducerReady: jest.fn<() => boolean>().mockReturnValue(true),
}));

jest.unstable_mockModule('../../../../shared/cache/redis.js', () => ({
  cache: { set: jest.fn<() => Promise<void>>().mockResolvedValue(), get: jest.fn() },
  connectCache: jest.fn<() => Promise<void>>().mockResolvedValue(),
  disconnectCache: jest.fn<() => Promise<void>>().mockResolvedValue(),
  isCacheReady: jest.fn<() => boolean>().mockReturnValue(true),
}));

const { chatService } = await import('../services/chat.service.js');
const { offerService, OfferLimitError, OfferStateError, verifyCheckoutToken } = await import(
  '../services/offer.service.js'
);
const { ConversationModel, MessageModel } = await import('../models/chat.model.js');
const { OfferModel } = await import('../models/offer.model.js');

let mongod: MongoMemoryServer;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
}, 60_000);

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

beforeEach(async () => {
  jest.clearAllMocks();
  await ConversationModel.deleteMany({});
  await MessageModel.deleteMany({});
  await OfferModel.deleteMany({});
});

describe('Live Chat Service — rooms, persistence & masking', () => {
  it('opens one room per buyer-seller-product context and reuses it', async () => {
    const first = await chatService.getOrCreateConversation({
      buyerId: 'buyer-1',
      buyerName: 'Buyer One',
      sellerId: 'seller-1',
      sellerStoreName: 'Store One',
      productId: 'phone-001',
    });
    const second = await chatService.getOrCreateConversation({
      buyerId: 'buyer-1',
      buyerName: 'Buyer One',
      sellerId: 'seller-1',
      sellerStoreName: 'Store One',
      productId: 'phone-001',
    });
    const differentProduct = await chatService.getOrCreateConversation({
      buyerId: 'buyer-1',
      buyerName: 'Buyer One',
      sellerId: 'seller-1',
      sellerStoreName: 'Store One',
      productId: 'phone-002',
    });

    expect(second.id).toBe(first.id);
    expect(differentProduct.id).not.toBe(first.id);
  });

  it('starts a conversation, sends messages and updates unread counts', async () => {
    const conv = await chatService.startConversation({
      buyerId: 'buyer-2',
      buyerName: 'Buyer Two',
      sellerId: 'seller-2',
      sellerStoreName: 'Second Store',
      productId: 'tv-001',
      initialMessage: 'Is this still available?',
    });

    expect(conv.unreadCountSeller).toBe(1);

    const reply = await chatService.sendMessage({
      conversationId: conv.id,
      senderId: 'seller-2',
      senderRole: 'seller',
      content: 'Yes, we have 10 units in stock!',
    });

    expect(reply.content).toBe('Yes, we have 10 units in stock!');

    const messages = await chatService.getMessages(conv.id);
    expect(messages).toHaveLength(2);
  });

  it('masks phone numbers, emails and links before persisting a message', async () => {
    const conv = await chatService.startConversation({
      buyerId: 'buyer-3',
      buyerName: 'Buyer Three',
      sellerId: 'seller-3',
      sellerStoreName: 'Third Store',
    });

    const msg = await chatService.sendMessage({
      conversationId: conv.id,
      senderId: 'buyer-3',
      senderRole: 'buyer',
      content: 'Call me on +256 700 123456 or email deals@example.com, also see www.dealsite.com',
    });

    expect(msg.wasMasked).toBe(true);
    expect(msg.content).not.toContain('700 123456');
    expect(msg.content).not.toContain('deals@example.com');
    expect(msg.content).not.toContain('dealsite.com');
    expect(msg.content).toContain('[phone number hidden]');
    expect(msg.content).toContain('[email hidden]');
    expect(msg.content).toContain('[link hidden]');
  });

  it('records read receipts for the recipient only', async () => {
    const conv = await chatService.startConversation({
      buyerId: 'buyer-4',
      buyerName: 'Buyer Four',
      sellerId: 'seller-4',
      sellerStoreName: 'Fourth Store',
      initialMessage: 'Hello there',
    });

    await chatService.markAsRead(conv.id, 'seller-4');

    const [msg] = await chatService.getMessages(conv.id);
    expect(msg.readBy.some((r) => r.userId === 'seller-4')).toBe(true);
    expect(msg.readBy.some((r) => r.userId === 'buyer-4')).toBe(true); // sender auto-marks own message read
  });

  it('sets user presence online and offline', async () => {
    await chatService.setPresence('buyer-1', true);
    const online = await chatService.getOnlineParticipants();
    expect(online.some((p) => p.userId === 'buyer-1')).toBe(true);

    await chatService.setPresence('buyer-1', false);
    const offline = await chatService.getOnlineParticipants();
    expect(offline.some((p) => p.userId === 'buyer-1')).toBe(false);
  });
});

describe('Make-an-Offer negotiation flow', () => {
  async function seedConversation() {
    return chatService.startConversation({
      buyerId: 'buyer-neg',
      buyerName: 'Negotiating Buyer',
      sellerId: 'seller-neg',
      sellerStoreName: 'Negotiation Store',
      productId: 'laptop-001',
    });
  }

  it('creates an offer with a 24-hour expiry window', async () => {
    const conv = await seedConversation();
    const before = Date.now();

    const offer = await offerService.createOffer({
      conversationId: conv.id,
      productId: 'laptop-001',
      buyerId: 'buyer-neg',
      sellerId: 'seller-neg',
      originalPrice: 2_000_000,
      offerPrice: 1_700_000,
      currency: 'UGX',
    });

    expect(offer.status).toBe('pending');
    const expiresInMs = new Date(offer.expiresAt).getTime() - before;
    expect(expiresInMs).toBeGreaterThan(23.9 * 60 * 60 * 1000);
    expect(expiresInMs).toBeLessThan(24.1 * 60 * 60 * 1000);
  });

  it('rejects an offer at or above the listed price', async () => {
    const conv = await seedConversation();
    await expect(
      offerService.createOffer({
        conversationId: conv.id,
        productId: 'laptop-001',
        buyerId: 'buyer-neg',
        sellerId: 'seller-neg',
        originalPrice: 100,
        offerPrice: 100,
      }),
    ).rejects.toThrow('below the listed price');
  });

  it('enforces a maximum of 3 offers per buyer per product', async () => {
    const conv = await seedConversation();
    const makeOffer = (price: number) =>
      offerService.createOffer({
        conversationId: conv.id,
        productId: 'laptop-001',
        buyerId: 'buyer-neg',
        sellerId: 'seller-neg',
        originalPrice: 2_000_000,
        offerPrice: price,
      });

    await makeOffer(1_900_000);
    await makeOffer(1_850_000);
    await makeOffer(1_800_000);

    await expect(makeOffer(1_750_000)).rejects.toBeInstanceOf(OfferLimitError);
  });

  it('lets the seller accept an offer and issues a discounted checkout token', async () => {
    const conv = await seedConversation();
    const offer = await offerService.createOffer({
      conversationId: conv.id,
      productId: 'laptop-001',
      buyerId: 'buyer-neg',
      sellerId: 'seller-neg',
      originalPrice: 2_000_000,
      offerPrice: 1_700_000,
    });

    const accepted = await offerService.acceptOffer(offer.id, 'seller-neg');

    expect(accepted.status).toBe('accepted');
    expect(accepted.checkoutToken).toBeDefined();

    const claims = verifyCheckoutToken(accepted.checkoutToken!);
    expect(claims.price).toBe(1_700_000);
    expect(claims.buyerId).toBe('buyer-neg');
  });

  it('rejects accept/decline from anyone other than the seller', async () => {
    const conv = await seedConversation();
    const offer = await offerService.createOffer({
      conversationId: conv.id,
      productId: 'laptop-001',
      buyerId: 'buyer-neg',
      sellerId: 'seller-neg',
      originalPrice: 2_000_000,
      offerPrice: 1_700_000,
    });

    await expect(offerService.acceptOffer(offer.id, 'buyer-neg')).rejects.toBeInstanceOf(OfferStateError);
  });

  it('lets either party counter-offer, closing out the prior round', async () => {
    const conv = await seedConversation();
    const offer = await offerService.createOffer({
      conversationId: conv.id,
      productId: 'laptop-001',
      buyerId: 'buyer-neg',
      sellerId: 'seller-neg',
      originalPrice: 2_000_000,
      offerPrice: 1_700_000,
    });

    const counter = await offerService.counterOffer(offer.id, {
      actingUserId: 'seller-neg',
      actingRole: 'seller',
      counterPrice: 1_850_000,
    });

    expect(counter.round).toBe(2);
    expect(counter.parentOfferId).toBe(offer.id);
    expect(counter.status).toBe('pending');

    const parent = await offerService.getOffer(offer.id);
    expect(parent.status).toBe('countered');
  });

  it('does not count counter-offers against the 3-offer cap', async () => {
    const conv = await seedConversation();
    const offer1 = await offerService.createOffer({
      conversationId: conv.id,
      productId: 'laptop-001',
      buyerId: 'buyer-neg',
      sellerId: 'seller-neg',
      originalPrice: 2_000_000,
      offerPrice: 1_700_000,
    });
    await offerService.counterOffer(offer1.id, { actingUserId: 'seller-neg', actingRole: 'seller', counterPrice: 1_900_000 });

    await offerService.createOffer({
      conversationId: conv.id, productId: 'laptop-001', buyerId: 'buyer-neg', sellerId: 'seller-neg',
      originalPrice: 2_000_000, offerPrice: 1_600_000,
    });
    await offerService.createOffer({
      conversationId: conv.id, productId: 'laptop-001', buyerId: 'buyer-neg', sellerId: 'seller-neg',
      originalPrice: 2_000_000, offerPrice: 1_550_000,
    });

    // 3 root offers used (offer1 + 2 more); the counter-offer round doesn't count.
    await expect(
      offerService.createOffer({
        conversationId: conv.id, productId: 'laptop-001', buyerId: 'buyer-neg', sellerId: 'seller-neg',
        originalPrice: 2_000_000, offerPrice: 1_500_000,
      }),
    ).rejects.toBeInstanceOf(OfferLimitError);
  });
});
