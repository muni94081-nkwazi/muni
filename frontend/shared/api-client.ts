/**
 * MUNI E-Commerce Platform — Unified API Client
 * Single client connecting frontend apps to all 28 microservices via API Gateway.
 */

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  message?: string;
  meta?: Record<string, unknown>;
}

export class MuniApiClient {
  private baseUrl: string;
  private token?: string;

  constructor(baseUrl = 'http://localhost:4000/api/v1') {
    this.baseUrl = baseUrl;
  }

  setAuthToken(token: string): void {
    this.token = token;
  }

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<ApiResponse<T>> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string>),
    };

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      ...options,
      headers,
    });

    const data = await response.json();
    return data as ApiResponse<T>;
  }

  // ─── 1. Auth & Users (auth-service: 4001) ───────────────────────────────────
  login(credentials: unknown) { return this.request('/auth/login', { method: 'POST', body: JSON.stringify(credentials) }); }
  register(userData: unknown) { return this.request('/auth/register', { method: 'POST', body: JSON.stringify(userData) }); }

  // ─── 2. Catalog & Products (product-service: 4002) ──────────────────────────
  getProducts(params?: string) { return this.request(`/products?${params || ''}`); }
  getProductById(id: string) { return this.request(`/products/${id}`); }

  // ─── 3. Search Service (search-service: 4010 - Elasticsearch) ────────────────
  searchProducts(query: string) { return this.request(`/search?q=${encodeURIComponent(query)}`); }
  getSponsoredProducts(keyword: string) { return this.request(`/advertising/sponsored-products?keyword=${encodeURIComponent(keyword)}`); }

  // ─── 4. Live Chat (chat-service: 4025) ──────────────────────────────────────
  getConversations() { return this.request('/chat/conversations'); }
  sendMessage(conversationId: string, content: string) {
    return this.request(`/chat/conversations/${conversationId}/messages`, {
      method: 'POST',
      body: JSON.stringify({ content }),
    });
  }

  // ─── 5. Buyer Protection & Disputes (buyer-protection: 4026, dispute: 4021) ─
  getBuyerProtectionPolicy() { return this.request('/buyer-protection/policy'); }
  checkProtectionEligibility(body: unknown) { return this.request('/buyer-protection/check-eligibility', { method: 'POST', body: JSON.stringify(body) }); }
  getDisputes() { return this.request('/disputes'); }
  respondToDispute(id: string, responseContent: string) { return this.request(`/disputes/${id}/respond`, { method: 'POST', body: JSON.stringify({ responseContent }) }); }

  // ─── 6. Escrow & Payments (payment-service: 4005) ────────────────────────────
  getEscrowStatus(orderId: string) { return this.request(`/payments/escrow/${orderId}`); }
  releaseEscrow(orderId: string) { return this.request('/payments/escrow/release', { method: 'POST', body: JSON.stringify({ orderId }) }); }

  // ─── 7. Seller Growth & Tiers (marketplace: 4022, seller-education: 4028) ───
  getSellerTier(sellerId: string) { return this.request(`/marketplace/seller-tier/${sellerId}`); }
  getSellerAcademyCourses() { return this.request('/seller-education/courses'); }
  getOnboardingProgress(sellerId: string) { return this.request(`/seller-education/onboarding/${sellerId}`); }
}

export const muniApi = new MuniApiClient();
