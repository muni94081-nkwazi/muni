import { logger } from '../utils/logger.js';
import { PrismaClient } from '../generated/prisma/index.js';
import { Kafka, type Producer } from 'kafkajs';
import { publishEvent, ROUTING_KEYS } from '../../../../shared/rabbitmq/index.js';

const prisma = new PrismaClient();

const kafka    = new Kafka({ clientId: 'inventory-service', brokers: (process.env.KAFKA_BROKERS ?? 'localhost:9092').split(',') });
let producer: Producer | null = null;

async function getProducer(): Promise<Producer> {
  if (!producer) {
    producer = kafka.producer();
    await producer.connect();
  }
  return producer;
}

export async function publishLowStockAlert(variantId: string): Promise<void> {
  const variant = await prisma.productVariant.findUnique({
    where:   { id: variantId },
    include: { product: { select: { name: true, sellerId: true } } },
  });
  if (!variant) return;

  const available = variant.stock - variant.reserved;
  if (available > variant.lowStockThreshold) return;  // No longer low stock

  const p = await getProducer();
  await p.send({
    topic:    'inventory-events',
    messages: [{
      key:   variantId,
      value: JSON.stringify({
        eventType:  'inventory.low_stock',
        occurredAt: new Date().toISOString(),
        data: {
          variantId,
          sku:            variant.sku,
          productId:      variant.productId,
          productName:    variant.product?.name,
          sellerId:       variant.product?.sellerId,
          availableStock: available,
          threshold:      variant.lowStockThreshold,
        },
      }),
    }],
  });

  void publishEvent(
    ROUTING_KEYS.INVENTORY_LOW_STOCK,
    {
      variantId,
      sku:            variant.sku,
      productId:      variant.productId,
      sellerId:       variant.product?.sellerId,
      availableStock: available,
      threshold:      variant.lowStockThreshold,
    },
    { correlationId: variantId, service: 'inventory-service' },
  );

  logger.info(`Alert published for SKU ${variant.sku} (${available} left)`);
}

export async function closeLowStockProducer(): Promise<void> {
  await producer?.disconnect();
}
