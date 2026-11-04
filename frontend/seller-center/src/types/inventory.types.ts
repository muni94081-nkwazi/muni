export interface InventoryItem {
  productId: string;
  productName: string;
  sku: string;
  inStock: number;
  lowStockThreshold: number;
}

export interface StockUpdate {
  productId: string;
  quantityChange: number;
}
