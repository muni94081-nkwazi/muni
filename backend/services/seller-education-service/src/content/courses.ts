import type { EducationalCourse } from '../models/seller-education.model.js';

// ─── Course catalogue ─────────────────────────────────────────────────────────
//
// Read-only editorial content. Nothing writes to this at runtime — getCourses
// and getCourseById are the only readers — so a restart loses nothing and
// there is no state here to persist. It lives in code, versioned alongside the
// UI that renders it, rather than in the database next to the seller progress
// that genuinely does change.

export const COURSES: EducationalCourse[] = [
  {
    id: 'course-onboarding-101',
    title: 'MUNI Seller Masterclass: Setting Up Your Store & First Listing',
    category: 'onboarding',
    description: 'Learn how to verify your business, upload high-converting products, and receive your first payout.',
    thumbnailUrl: 'https://images.unsplash.com/photo-1556761175-5973dc0f32e7',
    level: 'beginner',
    lessons: [
      {
        id: 'les-1',
        title: 'Step 1: Completing Business Verification',
        durationMinutes: 8,
        videoUrl: 'https://muni.ug/videos/verification.mp4',
        contentMarkdown: '# Business Verification Guide\nUpload your National ID or URCS certificate.',
      },
      {
        id: 'les-2',
        title: 'Step 2: Publishing Product Variants & Inventory',
        durationMinutes: 12,
        videoUrl: 'https://muni.ug/videos/products.mp4',
        contentMarkdown: '# Product Upload Guide\nAdd high-resolution product photos and clear SKU descriptions.',
      },
      {
        id: 'les-3',
        title: 'Step 3: Setting Up Mobile Money Payouts',
        durationMinutes: 6,
        videoUrl: 'https://muni.ug/videos/payouts.mp4',
        contentMarkdown: '# Payout Setup Guide\nLink your MTN MoMo or Airtel Money merchant code.',
      },
    ],
  },
  {
    id: 'course-growth-201',
    title: 'PPC Advertising & Flash Sale Strategies',
    category: 'sales_growth',
    description: 'Boost product visibility using Sponsored Search Ads and seasonal Flash Sales.',
    thumbnailUrl: 'https://images.unsplash.com/photo-1460925895917-afdab827c52f',
    level: 'intermediate',
    lessons: [
      {
        id: 'les-4',
        title: 'How to Launch High-ROI Sponsored Product Campaigns',
        durationMinutes: 15,
        videoUrl: 'https://muni.ug/videos/ppc.mp4',
        contentMarkdown: '# Sponsored Products PPC Guide\nTarget high-intent keywords.',
      },
    ],
  },
];
