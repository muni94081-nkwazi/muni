import type { QaAnswer, QaThread } from '@/types/messaging.types';
import { randomBool, randomDateBetween, randomId, pickOne } from './mockUtils';

const PRODUCTS = [
  { id: 'p-201', name: 'Android Smartphone' },
  { id: 'p-202', name: '55" Smart TV' },
  { id: 'p-203', name: 'Bluetooth Earbuds' },
  { id: 'p-204', name: 'Running Shoes' },
  { id: 'p-205', name: 'Fitness Watch' },
  { id: 'p-206', name: 'Non-stick Frying Pan Set' },
  { id: 'p-207', name: "Men's Polo Shirt" },
  { id: 'p-208', name: 'Ugandan Coffee Beans 500g' },
];

const QUESTION_TEMPLATES = [
  'Does this support 5G networks on MTN and Airtel Uganda?',
  'What is the exact size / dimensions of this product?',
  'Is a charger included in the box?',
  'How long is the battery life under normal use?',
  'Does this come in other colors?',
  'Is this compatible with iPhone as well as Android?',
  'What material is this made from?',
  'Can this be used outdoors / is it water resistant?',
  'Does it come with an official warranty card?',
  'What is the recommended washing / care instruction?',
];

const ASKER_NAMES = [
  'MUNI Customer', 'Tumusiime Alex', 'Nabatanzi Joy', 'Ochieng Mark', 'Namusoke Ivy',
  'Kato Daniel', 'Aciro Vivian', 'Ssekandi Paul', 'Nakimuli Beatrice', 'Wandera Tom',
];

const ANSWER_TEMPLATES = [
  'Yes, this product fully supports 5G on all major Ugandan networks.',
  'The dimensions are listed in the product description, but happy to confirm specifics if needed.',
  'Yes, the charger and cable are included in the box.',
  'Under normal use, the battery lasts approximately 1-2 days per charge.',
  'Yes, we currently stock this in a few different colors, please check the listing.',
  'Yes, it works with both iPhone and Android devices.',
  'This is made from premium, durable materials suitable for daily use.',
  'It is splash resistant and safe for light outdoor use.',
  'Yes, an official manufacturer warranty card is included.',
  'We recommend gentle hand washing to preserve quality.',
];

export function generateQaThreads(count = 15): QaThread[] {
  return Array.from({ length: count }, () => {
    const product = pickOne(PRODUCTS);
    const askedAt = randomDateBetween(new Date('2026-06-01T00:00:00Z'), new Date('2026-08-14T12:00:00Z'));
    const isAnswered = randomBool(0.55);

    const answer: QaAnswer | undefined = isAnswered
      ? {
          id: randomId('ans'),
          answerText: pickOne(ANSWER_TEMPLATES),
          answeredAt: randomDateBetween(new Date(askedAt), new Date('2026-08-14T12:00:00Z')),
        }
      : undefined;

    return {
      id: randomId('qa'),
      productId: product.id,
      productName: product.name,
      question: pickOne(QUESTION_TEMPLATES),
      askedByName: pickOne(ASKER_NAMES),
      askedAt,
      answer,
    };
  });
}
