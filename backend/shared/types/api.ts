export interface ApiEnvelope<T> { data: T }

export interface PaginationMeta {
  current_page: number;
  last_page: number;
  per_page: number;
  total: number;
}

export interface Paginated<T> extends ApiEnvelope<T[]> { meta: PaginationMeta }

export interface AuthenticatedRequest {
  userId?: string;
  roles?: string[];
}
