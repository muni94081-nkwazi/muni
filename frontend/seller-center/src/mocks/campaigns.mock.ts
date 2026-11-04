// Mock data generator for Sponsored Products CPC campaigns.
import type { AdGroup, Campaign, CampaignMetrics, CampaignStatus, Keyword, MatchType } from '@/types/advertising.types';
import { pickMany, pickOne, randomBool, randomFloat, randomId, randomInt } from './mockUtils';

export const PRODUCT_POOL: { id: string; name: string }[] = [
  { id: 'prod_001', name: 'Kasese Pure Honey 1L' },
  { id: 'prod_002', name: 'Ugandan Coffee Beans 500g' },
  { id: 'prod_003', name: "Men's Polo Shirt" },
  { id: 'prod_004', name: 'Shea Butter Body Cream' },
  { id: 'prod_005', name: 'Non-stick Frying Pan' },
  { id: 'prod_006', name: 'Samsung Galaxy S24 Ultra' },
  { id: 'prod_007', name: 'Wireless Bluetooth Earbuds' },
  { id: 'prod_008', name: "Women's Ankara Dress" },
  { id: 'prod_009', name: 'Solar Power Bank 20000mAh' },
  { id: 'prod_010', name: 'Kids Educational Tablet' },
];

const KEYWORD_POOL = [
  'wireless earbuds', 'bluetooth headset', 'organic honey', 'arabica coffee',
  'cotton polo shirt', 'skincare cream', 'kitchen cookware', 'smartphone deals',
  'solar charger', 'power bank fast charging', 'ankara fashion', 'kids tablet',
  'affordable electronics', 'best coffee beans', 'natural body cream', 'men clothing',
];

const CAMPAIGN_NAME_POOL = [
  'Back to School Push', 'Holiday Season Boost', 'New Arrivals Spotlight',
  'Flash Sale Accelerator', 'Brand Awareness Drive', 'Weekend Traffic Booster',
  'Category Leader Push', 'Clearance Blowout', 'Prime Placement Campaign', 'Search Visibility Drive',
];

const MATCH_TYPES: MatchType[] = ['exact', 'phrase', 'broad'];
const STATUSES: CampaignStatus[] = ['active', 'paused', 'ended', 'draft'];

function generateKeyword(): Keyword {
  const impressions = randomInt(400, 22000);
  const clicks = randomInt(3, Math.max(4, Math.floor(impressions * 0.09)));
  const spend = +(clicks * randomFloat(0.25, 2.75)).toFixed(2);
  const sales = +(spend * randomFloat(1.2, 6.5)).toFixed(2);

  return {
    id: randomId('kw'),
    text: pickOne(KEYWORD_POOL),
    matchType: pickOne(MATCH_TYPES),
    bid: +randomFloat(0.2, 3.5).toFixed(2),
    impressions,
    clicks,
    spend,
    sales,
  };
}

function generateAdGroup(): AdGroup {
  const targetProduct = pickOne(PRODUCT_POOL);
  const keywordCount = randomInt(2, 5);

  return {
    id: randomId('ag'),
    name: `${targetProduct.name} Ad Group`,
    productIds: pickMany(PRODUCT_POOL.map((p) => p.id), randomInt(1, 3)),
    keywords: Array.from({ length: keywordCount }, generateKeyword),
  };
}

function generateHistory(days: number): Campaign['history'] {
  const history: Campaign['history'] = [];
  const end = new Date();

  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(end);
    d.setDate(d.getDate() - i);
    const spend = +randomFloat(4, 160).toFixed(2);
    const sales = +(spend * randomFloat(1.1, 7)).toFixed(2);
    const acos = sales > 0 ? +((spend / sales) * 100).toFixed(2) : 0;
    history.push({ date: d.toISOString().slice(0, 10), spend, sales, acos });
  }

  return history;
}

function computeMetrics(adGroups: AdGroup[], history: Campaign['history']): CampaignMetrics {
  const allKeywords = adGroups.flatMap((ag) => ag.keywords);
  const impressions = allKeywords.reduce((sum, k) => sum + k.impressions, 0);
  const clicks = allKeywords.reduce((sum, k) => sum + k.clicks, 0);

  // Keep spend/sales roughly consistent with the history totals (the primary source of truth
  // for the trend chart) rather than the independently-random keyword-level figures.
  const spend = +history.reduce((sum, h) => sum + h.spend, 0).toFixed(2);
  const sales = +history.reduce((sum, h) => sum + h.sales, 0).toFixed(2);

  const acos = sales > 0 ? +((spend / sales) * 100).toFixed(2) : 0;
  const roas = spend > 0 ? +(sales / spend).toFixed(2) : 0;
  const ctr = impressions > 0 ? +((clicks / impressions) * 100).toFixed(2) : 0;

  return { impressions, clicks, spend, sales, acos, roas, ctr };
}

export function generateCampaigns(count = 6): Campaign[] {
  const names = pickMany(CAMPAIGN_NAME_POOL, Math.min(count, CAMPAIGN_NAME_POOL.length));

  return Array.from({ length: count }, (_, i) => {
    const adGroups = Array.from({ length: randomInt(1, 3) }, generateAdGroup);
    const days = randomInt(14, 30);
    const history = generateHistory(days);
    const metrics = computeMetrics(adGroups, history);
    const status = pickOne(STATUSES);

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const hasEndDate = randomBool(0.35);
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + randomInt(30, 90));

    return {
      id: randomId('camp'),
      name: names[i] ?? `${pickOne(CAMPAIGN_NAME_POOL)} ${i + 1}`,
      status,
      dailyBudget: randomInt(10, 250),
      startDate: startDate.toISOString().slice(0, 10),
      endDate: hasEndDate ? endDate.toISOString().slice(0, 10) : undefined,
      adGroups,
      metrics,
      history,
    };
  });
}
