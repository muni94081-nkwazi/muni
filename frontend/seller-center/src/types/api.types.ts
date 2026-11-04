export interface ApiEnvelope<T> {
  data: T;
  message?: string;
  success: boolean;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
}

export interface ApiError {
  message: string;
  code?: string;
  details?: any;
}
