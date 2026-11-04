export interface Review {
  id: string;
  productId: string;
  userId: string;
  userName: string;
  rating: number; // 1-5
  title: string;
  body: string;
  verifiedPurchase: boolean;
  helpful: number;
  createdAt: string;
}
