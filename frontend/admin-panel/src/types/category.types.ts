export interface Category {
  id: string;
  name: string;
  slug: string;
  parentId: string | null;
  sortOrder: number;
  imageUrl?: string;
  isActive: boolean;
  createdAt: string;
  /** Commission percentage (0-100) charged to sellers listing under this category. */
  commissionFeePercent: number;
}

/** Category augmented with its resolved children, used by tree-building UI. */
export interface CategoryTreeNode extends Category {
  children: CategoryTreeNode[];
  /** 1-based nesting depth; root categories are depth 1. */
  depth: number;
}
