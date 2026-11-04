import type { Conversation, Message } from '@/types/messaging.types';
import { randomId, randomInt, randomBool, randomDateBetween, pickOne } from './mockUtils';

const BUYER_NAMES = [
  'Nakato Sarah', 'Ssebunya James', 'Apio Grace', 'Otieno David', 'Namukasa Fiona',
  'Kintu Robert', 'Achieng Patricia', 'Mugisha Brian', 'Nabirye Joan', 'Okello Peter',
  'Auma Christine', 'Byaruhanga Emma', 'Nantongo Ruth', 'Wasswa Isaac', 'Kagwa Diana',
];

const SUBJECTS = [
  'Question about delivery time',
  'Is this item still available?',
  'Warranty and return policy',
  'Order arrived damaged',
  'Can you offer a discount?',
  'Product color / size availability',
  'Shipping to Entebbe',
  'Payment confirmation issue',
  'Where is my package?',
  'Product authenticity question',
];

const BUYER_MESSAGE_TEMPLATES = [
  'Hi, is this item still in stock?',
  'How long does delivery usually take to my area?',
  'Does this come with a warranty?',
  'Can you do a better price if I buy two?',
  'I received the wrong item, can you help?',
  'What courier do you use for delivery?',
  'Is this an original / authentic product?',
  'Can I pick this up in person instead?',
  'Thanks for the quick reply!',
  'When will my order be dispatched?',
];

const SELLER_MESSAGE_TEMPLATES = [
  'Hi! Yes, this item is currently in stock and ready to ship.',
  'Delivery typically takes 2-4 business days depending on your location.',
  'Yes, this product comes with a 12-month manufacturer warranty.',
  'I can offer a small discount for bulk orders, let me check for you.',
  'I am very sorry about that, let me sort this out right away.',
  'We use our standard courier partner for all deliveries.',
  'Yes, we only sell 100% authentic, brand-new products.',
  'Pickup is available, I will share the store location with you.',
  'You are welcome! Let me know if you need anything else.',
  'Your order is being packed and will be dispatched today.',
];

function generateMessages(conversationId: string, count: number): Message[] {
  const start = new Date('2026-07-10T00:00:00Z');
  const end = new Date('2026-08-14T12:00:00Z');
  const messages: Message[] = [];
  let cursor = start;

  for (let i = 0; i < count; i++) {
    const senderType: Message['senderType'] = i % 2 === 0 ? 'buyer' : 'seller';
    const sentAt = randomDateBetween(cursor, end);
    cursor = new Date(sentAt);
    messages.push({
      id: randomId('msg'),
      conversationId,
      senderType,
      text: senderType === 'buyer' ? pickOne(BUYER_MESSAGE_TEMPLATES) : pickOne(SELLER_MESSAGE_TEMPLATES),
      sentAt,
      isRead: senderType === 'seller' ? true : randomBool(0.55),
    });
  }

  return messages.sort((a, b) => new Date(a.sentAt).getTime() - new Date(b.sentAt).getTime());
}

export function generateConversations(count = 12): Conversation[] {
  return Array.from({ length: count }, () => {
    const id = randomId('conv');
    const messageCount = randomInt(2, 8);
    const messages = generateMessages(id, messageCount);
    const lastMessage = messages[messages.length - 1];
    const unreadCount = messages.filter((m) => m.senderType === 'buyer' && !m.isRead).length;

    return {
      id,
      buyerName: pickOne(BUYER_NAMES),
      orderId: randomBool(0.7) ? `ORD-${randomInt(10000, 99999)}` : undefined,
      subject: pickOne(SUBJECTS),
      lastMessageAt: lastMessage.sentAt,
      unreadCount,
      messages,
    };
  });
}
