import { randomUUID } from 'node:crypto';
import type {
  ContainerModel,
  CreateContainerInput,
  ContainerProductItem,
  ContainerRuleItem,
  SellerSubmission,
  RuleType,
} from '../models/container.model.js';

// Product metadata lookup for auto-rule evaluation. Populated at runtime via
// addProductToContainer/bulkAddProductsToContainer — not seeded with demo data.
const CATALOG_PRODUCTS: Array<{
  id: string;
  name: string;
  slug: string;
  price: number;
  originalPrice?: number;
  currency: string;
  rating: number;
  reviewsCount: number;
  image: string;
  category?: string;
  inStock: boolean;
  badge?: string;
  sellerName?: string;
}> = [];

// In-Memory Storage for Containers, Products, Rules, Submissions
const containersStore = new Map<string, ContainerModel>();
const sellerSubmissionsStore = new Map<string, SellerSubmission>();

// Initial Seed Containers
function seedInitialContainers() {
  const allContainers: ContainerModel[] = [
    {
      id: 'c-trending',
      slug: 'trending-now',
      name: '🔥 Trending Products',
      description: 'Most popular items flying off the shelves this week',
      type: 'TRENDING',
      icon: '🔥',
      displayMode: 'carousel',
      itemsPerRow: 4,
      maxItems: 8,
      isActive: true,
      sortOrder: 1,
      bgColor: '#ffffff',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      products: [],
      rules: [],
    },
    {
      id: 'c-deals',
      slug: 'daily-deals',
      name: '⚡ Limited Time Deals',
      description: 'Unbeatable price cuts guaranteed on top rated brands',
      type: 'DEALS',
      icon: '⚡',
      displayMode: 'grid',
      itemsPerRow: 4,
      maxItems: 8,
      isActive: true,
      sortOrder: 2,
      bgColor: '#fff8f6',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      products: [],
      rules: [{ id: 'cr-1', containerId: 'c-deals', ruleType: 'DISCOUNT_PERCENTAGE', value: { minDiscount: 10 }, sortOrder: 1, isActive: true, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }],
    },
    {
      id: 'c-new',
      slug: 'new-arrivals',
      name: '✨ New Arrivals',
      description: 'Fresh products just added to MUNI platform across East Africa',
      type: 'NEW_ARRIVALS',
      icon: '✨',
      displayMode: 'carousel',
      itemsPerRow: 4,
      maxItems: 8,
      isActive: true,
      sortOrder: 3,
      bgColor: '#ffffff',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      products: [],
      rules: [],
    },
    {
      id: 'c-department',
      slug: 'shop-by-department',
      name: '🏬 Shop by Department',
      description: 'Browse top departments and category hubs',
      type: 'CATEGORY',
      icon: '🏬',
      displayMode: 'grid',
      itemsPerRow: 4,
      maxItems: 8,
      isActive: true,
      sortOrder: 4,
      bgColor: '#ffffff',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      products: [],
      rules: [],
    },
    {
      id: 'c-top-picks',
      slug: 'top-picks',
      name: '⭐ Top Picks',
      description: 'Highly rated customer favorites across all categories',
      type: 'RECOMMENDED',
      icon: '⭐',
      displayMode: 'carousel',
      itemsPerRow: 4,
      maxItems: 8,
      isActive: true,
      sortOrder: 5,
      bgColor: '#ffffff',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      products: [],
      rules: [],
    },
    {
      id: 'c-appliances',
      slug: 'appliances',
      name: '🔌 Appliances',
      description: 'Kitchen electronics, air fryers & smart home devices',
      type: 'CATEGORY',
      icon: '🔌',
      displayMode: 'grid',
      itemsPerRow: 4,
      maxItems: 8,
      isActive: true,
      sortOrder: 6,
      bgColor: '#ffffff',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      products: [],
      rules: [{ id: 'cr-2', containerId: 'c-appliances', ruleType: 'CATEGORY', value: { category: 'Appliances' }, sortOrder: 1, isActive: true, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }],
    },
    {
      id: 'c-fashion',
      slug: 'fashion',
      name: '👗 Fashion',
      description: 'Trending shoes, apparel, watches and accessories',
      type: 'CATEGORY',
      icon: '👗',
      displayMode: 'grid',
      itemsPerRow: 4,
      maxItems: 8,
      isActive: true,
      sortOrder: 7,
      bgColor: '#ffffff',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      products: [],
      rules: [{ id: 'cr-3', containerId: 'c-fashion', ruleType: 'CATEGORY', value: { category: 'Fashion' }, sortOrder: 1, isActive: true, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }],
    },
    {
      id: 'c-home',
      slug: 'home-kitchen',
      name: '🛋️ Home & Kitchen',
      description: 'Ergonomic furniture & home decor',
      type: 'CATEGORY',
      icon: '🛋️',
      displayMode: 'grid',
      itemsPerRow: 4,
      maxItems: 8,
      isActive: true,
      sortOrder: 8,
      bgColor: '#ffffff',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      products: [],
      rules: [{ id: 'cr-4', containerId: 'c-home', ruleType: 'CATEGORY', value: { category: 'Home & Kitchen' }, sortOrder: 1, isActive: true, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }],
    },
    {
      id: 'c-beauty',
      slug: 'beauty',
      name: '💄 Beauty',
      description: 'Skincare, cosmetics & grooming',
      type: 'CATEGORY',
      icon: '💄',
      displayMode: 'grid',
      itemsPerRow: 4,
      maxItems: 8,
      isActive: true,
      sortOrder: 9,
      bgColor: '#ffffff',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      products: [],
      rules: [{ id: 'cr-5', containerId: 'c-beauty', ruleType: 'CATEGORY', value: { category: 'Beauty' }, sortOrder: 1, isActive: true, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }],
    },
    {
      id: 'c-sports',
      slug: 'sports',
      name: '⚽ Sports',
      description: 'Athletic equipment, gym gear & activewear',
      type: 'CATEGORY',
      icon: '⚽',
      displayMode: 'grid',
      itemsPerRow: 4,
      maxItems: 8,
      isActive: true,
      sortOrder: 10,
      bgColor: '#ffffff',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      products: [],
      rules: [{ id: 'cr-6', containerId: 'c-sports', ruleType: 'CATEGORY', value: { category: 'Sports' }, sortOrder: 1, isActive: true, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }],
    },
  ];

  for (const c of allContainers) {
    containersStore.set(c.id, c);
  }
}

seedInitialContainers();

export class ContainerService {
  async listContainers(): Promise<ContainerModel[]> {
    return [...containersStore.values()]
      .filter((c) => c.isActive)
      .sort((a, b) => a.sortOrder - b.sortOrder);
  }

  async getContainerBySlug(slug: string): Promise<ContainerModel | null> {
    const container = [...containersStore.values()].find((c) => c.slug === slug);
    return container || null;
  }

  async createContainer(input: CreateContainerInput): Promise<ContainerModel> {
    const id = `c-${randomUUID().slice(0, 8)}`;
    const now = new Date().toISOString();

    const container: ContainerModel = {
      id,
      slug: input.slug,
      name: input.name,
      description: input.description || null,
      type: input.type,
      icon: input.icon || '📌',
      displayMode: input.displayMode || 'grid',
      itemsPerRow: input.itemsPerRow || 4,
      maxItems: input.maxItems || 12,
      isActive: input.isActive ?? true,
      sortOrder: input.sortOrder || containersStore.size + 1,
      bgColor: input.bgColor || '#ffffff',
      createdAt: now,
      updatedAt: now,
      products: [],
      rules: [],
    };

    containersStore.set(id, container);
    return container;
  }

  async updateContainer(id: string, updates: Partial<ContainerModel>): Promise<ContainerModel> {
    const container = containersStore.get(id);
    if (!container) {
      throw new Error(`Container with ID ${id} not found`);
    }

    const updated: ContainerModel = {
      ...container,
      ...updates,
      updatedAt: new Date().toISOString(),
    };

    containersStore.set(id, updated);
    return updated;
  }

  async deleteContainer(id: string): Promise<boolean> {
    return containersStore.delete(id);
  }

  async addProductToContainer(
    containerId: string,
    productId: string,
    addedBy = 'ADMIN',
    reason?: string
  ): Promise<ContainerProductItem> {
    const container = containersStore.get(containerId);
    if (!container) {
      throw new Error(`Container ${containerId} not found`);
    }

    const productMeta = CATALOG_PRODUCTS.find((p) => p.id === productId) || {
      id: productId,
      name: `Custom Product ${productId}`,
      slug: `custom-product-${productId}`,
      price: 250000,
      currency: 'UGX',
      rating: 4.5,
      reviewsCount: 10,
      image: 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=400&q=80',
      inStock: true,
    };

    const newItem: ContainerProductItem = {
      id: `cp-${randomUUID().slice(0, 6)}`,
      containerId,
      productId,
      sortOrder: container.products.length + 1,
      addedBy,
      addedAt: new Date().toISOString(),
      reason: reason || 'Manually Pinned',
      productDetails: productMeta,
    };

    // Prevent duplicates
    container.products = container.products.filter((p) => p.productId !== productId);
    container.products.push(newItem);
    container.updatedAt = new Date().toISOString();

    containersStore.set(containerId, container);
    return newItem;
  }

  async removeProductFromContainer(containerId: string, productId: string): Promise<void> {
    const container = containersStore.get(containerId);
    if (!container) return;

    container.products = container.products.filter((p) => p.productId !== productId);
    container.updatedAt = new Date().toISOString();
    containersStore.set(containerId, container);
  }

  async addRuleToContainer(
    containerId: string,
    ruleType: RuleType,
    value: Record<string, any>
  ): Promise<ContainerRuleItem> {
    const container = containersStore.get(containerId);
    if (!container) throw new Error(`Container ${containerId} not found`);

    const newRule: ContainerRuleItem = {
      id: `cr-${randomUUID().slice(0, 6)}`,
      containerId,
      ruleType,
      value,
      sortOrder: container.rules.length + 1,
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    container.rules.push(newRule);
    container.updatedAt = new Date().toISOString();
    containersStore.set(containerId, container);
    return newRule;
  }

  // Seller Submissions
  async getSellerSubmissions(sellerId?: string): Promise<SellerSubmission[]> {
    const all = [...sellerSubmissionsStore.values()];
    if (sellerId) {
      return all.filter((s) => s.sellerId === sellerId);
    }
    return all;
  }

  async submitSellerProduct(input: {
    sellerId: string;
    sellerName: string;
    containerId: string;
    productId: string;
    productName: string;
    pitch: string;
    proposedPrice?: number;
  }): Promise<SellerSubmission> {
    const container = containersStore.get(input.containerId);
    const id = `sub-${randomUUID().slice(0, 6)}`;

    const submission: SellerSubmission = {
      id,
      sellerId: input.sellerId,
      sellerName: input.sellerName,
      containerId: input.containerId,
      containerName: container ? container.name : 'Homepage Section',
      productId: input.productId,
      productName: input.productName,
      pitch: input.pitch,
      proposedPrice: input.proposedPrice,
      status: 'PENDING',
      createdAt: new Date().toISOString(),
    };

    sellerSubmissionsStore.set(id, submission);
    return submission;
  }

  async evaluateSubmission(id: string, status: 'APPROVED' | 'REJECTED'): Promise<SellerSubmission> {
    const sub = sellerSubmissionsStore.get(id);
    if (!sub) throw new Error(`Submission ${id} not found`);

    sub.status = status;
    sellerSubmissionsStore.set(id, sub);

    if (status === 'APPROVED') {
      await this.addProductToContainer(sub.containerId, sub.productId, sub.sellerId, `Seller Pitch: ${sub.pitch}`);
    }

    return sub;
  }

  // Method 2 (CSV/Excel Import) & Method 3 (Direct Database Insert) Bulk Pinning
  async bulkAddProductsToContainer(
    containerId: string,
    productsList: Array<{
      productId: string;
      name?: string;
      price?: number;
      currency?: string;
      image?: string;
      category?: string;
      reason?: string;
    }>,
    addedBy = 'ADMIN_BULK_IMPORT'
  ): Promise<ContainerProductItem[]> {
    const container = containersStore.get(containerId);
    if (!container) {
      throw new Error(`Container with ID ${containerId} not found`);
    }

    const addedItems: ContainerProductItem[] = [];

    for (const item of productsList) {
      const pId = item.productId;
      const productMeta = CATALOG_PRODUCTS.find((p) => p.id === pId) || {
        id: pId,
        name: item.name || `Product ${pId}`,
        slug: `product-${pId}`,
        price: item.price || 150000,
        currency: item.currency || 'UGX',
        rating: 4.8,
        reviewsCount: 24,
        image: item.image || 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=400&q=80',
        category: item.category || 'General',
        inStock: true,
      };

      const newItem: ContainerProductItem = {
        id: `cp-${randomUUID().slice(0, 6)}`,
        containerId,
        productId: pId,
        sortOrder: container.products.length + 1,
        addedBy,
        addedAt: new Date().toISOString(),
        reason: item.reason || 'Bulk Local Storage Import (CSV/DB)',
        productDetails: productMeta,
      };

      container.products = container.products.filter((p) => p.productId !== pId);
      container.products.push(newItem);
      addedItems.push(newItem);
    }

    container.updatedAt = new Date().toISOString();
    containersStore.set(containerId, container);
    return addedItems;
  }
}

export const containerService = new ContainerService();
