import { PrismaClient } from '../src/generated/prisma/index.js';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  // 1. Create Categories
  const catElectronics = await prisma.category.upsert({
    where: { slug: 'electronics' },
    update: {},
    create: { slug: 'electronics', name: 'Electronics', level: 0, path: '/electronics' }
  });

  const catPhones = await prisma.category.upsert({
    where: { slug: 'electronics-phones' },
    update: {},
    create: { slug: 'electronics-phones', name: 'Phones', parentId: catElectronics.id, level: 1, path: '/electronics/phones' }
  });

  const catAndroid = await prisma.category.upsert({
    where: { slug: 'electronics-phones-android' },
    update: {},
    create: { slug: 'electronics-phones-android', name: 'Android Phones', parentId: catPhones.id, level: 2, path: '/electronics/phones/android' }
  });

  const catFashion = await prisma.category.upsert({
    where: { slug: 'fashion' },
    update: {},
    create: { slug: 'fashion', name: 'Fashion', level: 0, path: '/fashion' }
  });

  const catHome = await prisma.category.upsert({
    where: { slug: 'home-garden' },
    update: {},
    create: { slug: 'home-garden', name: 'Home & Garden', level: 0, path: '/home-garden' }
  });

  const catSports = await prisma.category.upsert({
    where: { slug: 'sports' },
    update: {},
    create: { slug: 'sports', name: 'Sports', level: 0, path: '/sports' }
  });

  const catToys = await prisma.category.upsert({
    where: { slug: 'toys' },
    update: {},
    create: { slug: 'toys', name: 'Toys', level: 0, path: '/toys' }
  });

  const catBeauty = await prisma.category.upsert({
    where: { slug: 'beauty' },
    update: {},
    create: { slug: 'beauty', name: 'Beauty', level: 0, path: '/beauty' }
  });

  const catComputers = await prisma.category.upsert({
    where: { slug: 'electronics-computers' },
    update: {},
    create: { slug: 'electronics-computers', name: 'Computers', parentId: catElectronics.id, level: 1, path: '/electronics/computers' }
  });

  // 2. Create Products
  const products = Array.from({ length: 17 }, (_, i) => ({
    slug: `product-${i + 1}`,
    name: `Product ${i + 1}`,
    description: `Description for Product ${i + 1}`,
    sellerId: 'seller-1',
    categoryId: i % 2 === 0 ? catAndroid.id : catFashion.id,
    basePrice: 1000 + i * 100,
    currency: 'UGX',
    brand: 'Generic',
  }));

  for (const prod of products) {
    const createdProduct = await prisma.product.upsert({
      where: { slug: prod.slug },
      update: {},
      create: prod,
    });

    // 3. Create Variants
    await prisma.productVariant.upsert({
      where: { sku: `${prod.slug}-var-1` },
      update: {},
      create: {
        productId: createdProduct.id,
        sku: `${prod.slug}-var-1`,
        price: prod.basePrice,
        stock: 50,
        attributes: { size: 'S', color: 'Red' }
      }
    });

    await prisma.productVariant.upsert({
      where: { sku: `${prod.slug}-var-2` },
      update: {},
      create: {
        productId: createdProduct.id,
        sku: `${prod.slug}-var-2`,
        price: prod.basePrice + 50,
        stock: 30,
        attributes: { size: 'M', color: 'Blue' }
      }
    });
  }

  console.log('Seeding complete.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
