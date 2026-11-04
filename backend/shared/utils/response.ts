// Standardized response helpers:
export function success<T>(data: T) { return { data }; }
export function paginated<T>(data: T[], meta: { current_page: number; last_page: number; per_page: number; total: number }) { return { data, meta }; }
export function error(message: string, errors?: Record<string, string>) { return { message, errors }; }
