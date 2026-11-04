export interface StorefrontBanner {
  id: string;
  imageUrl: string;
  headline: string;
  linkUrl: string;
  order: number;
}

export interface CarouselItem {
  id: string;
  productId: string;
  productName: string;
  imageUrl: string;
  order: number;
}

export interface StorefrontConfig {
  storeName: string;
  customUrlSlug: string;
  bannerHtml?: string;
  banners: StorefrontBanner[];
  carousel: CarouselItem[];
  themeColor: string;
}
