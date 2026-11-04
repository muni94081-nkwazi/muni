export const errorMessage = (error: any): string => {
  return error?.response?.data?.message || error.message || 'An unexpected error occurred';
};

export const safeGetItem = (key: string): string | null => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};

export const safeSetItem = (key: string, value: string): void => {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Private mode and full-quota both throw here. Persistence is a
    // convenience for every caller of this helper, never a correctness
    // requirement, so failing to store is not worth surfacing.
  }
};

export const safeRemoveItem = (key: string): void => {
  try {
    localStorage.removeItem(key);
  } catch {
    // As above. A key that cannot be removed was almost certainly never
    // written, since setItem would have thrown for the same reason.
  }
};

export const generateId = () => Math.random().toString(36).substring(2, 9);
