import axios from 'axios';

export interface ServiceHealth {
  name: string;
  url: string;
  status: 'up' | 'down' | 'checking';
  latencyMs: number | null;
}

/**
 * Direct URLs to each service's own health endpoint, NOT routed through
 * the gateway — this page exists specifically to show whether each
 * underlying service is reachable, independent of gateway routing. In
 * a real deployment these would need to be reachable from the browser
 * (e.g. via an internal network the dev machine can reach, or this
 * page would run server-side); for local docker-compose development
 * every port is published on localhost, so this works directly.
 */
export const MONITORED_SERVICES: Array<{ name: string; url: string }> = [
  { name: 'API Gateway', url: 'http://localhost:8080/actuator/health' },
  { name: 'User Service', url: 'http://localhost:8081/api/v1/actuator/health' },
  { name: 'Product Service', url: 'http://localhost:8082/api/v1/actuator/health' },
  { name: 'Order Service', url: 'http://localhost:8083/api/v1/health' },
  { name: 'Payment Service', url: 'http://localhost:8084/api/v1/health' },
  { name: 'Notification Service', url: 'http://localhost:8085/api/v1/health' },
  { name: 'Cart Service', url: 'http://localhost:8086/api/v1/health' },
  { name: 'Coupon Service', url: 'http://localhost:8087/api/v1/health' },
];

export async function checkServiceHealth(name: string, url: string): Promise<ServiceHealth> {
  const startedAt = performance.now();
  try {
    await axios.get(url, { timeout: 5000 });
    return { name, url, status: 'up', latencyMs: Math.round(performance.now() - startedAt) };
  } catch {
    return { name, url, status: 'down', latencyMs: null };
  }
}
