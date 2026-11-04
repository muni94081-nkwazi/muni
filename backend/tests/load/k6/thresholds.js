// Service-level objectives for MUNI platform
export const SLO = {
  // API latency SLOs
  latency: {
    p50: 100,   // ms
    p95: 500,   // ms
    p99: 1000,  // ms
    checkout_p95: 3000,  // ms (checkout can be slower)
  },
  // Availability SLOs
  availability: {
    normal: 0.999,   // 99.9% uptime
    spike: 0.95,     // 95% during spike
    error_rate: 0.01, // max 1% errors normally
  },
  // Throughput SLOs
  throughput: {
    min_rps: 100,    // minimum requests per second
    search_rps: 500, // search service target
  },
};

// Pre-built threshold objects for each scenario
export const THRESHOLDS = {
  browse: {
    http_req_duration: [`p(95)<${SLO.latency.p95}`, `p(99)<${SLO.latency.p99}`],
    http_req_failed: [`rate<${SLO.availability.error_rate}`],
  },
  checkout: {
    http_req_duration: [`p(95)<${SLO.latency.checkout_p95}`],
    http_req_failed: ['rate<0.02'],
  },
  spike: {
    http_req_failed: [`rate<${1 - SLO.availability.spike}`],
  },
};
