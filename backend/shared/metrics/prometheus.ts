export interface PrometheusAlertRule {
  alertName: string;
  expression: string;
  forDuration: string;
  severity: 'critical' | 'warning' | 'info';
  description: string;
}

export const MUNI_PROMETHEUS_ALERT_RULES: PrometheusAlertRule[] = [
  {
    alertName: 'HighRequestLatencyP95',
    expression: 'histogram_quantile(0.95, sum(rate(http_request_duration_seconds_bucket[5m])) by (le)) > 0.5',
    forDuration: '2m',
    severity: 'warning',
    description: 'API p95 response latency exceeded 500ms for over 2 minutes',
  },
  {
    alertName: 'HighHttpErrorRate',
    expression: 'sum(rate(http_requests_total{status=~"5.."}[5m])) / sum(rate(http_requests_total[5m])) > 0.01',
    forDuration: '1m',
    severity: 'critical',
    description: 'HTTP 5xx error rate exceeded 1% across microservices',
  },
  {
    alertName: 'HighCpuUtilization',
    expression: '100 - (avg by (instance) (rate(node_cpu_seconds_total{mode="idle"}[5m])) * 100) > 85',
    forDuration: '5m',
    severity: 'critical',
    description: 'Node CPU utilization exceeded 85% for 5 minutes',
  },
  {
    alertName: 'LowDiskSpaceRemaining',
    expression: '(node_filesystem_avail_bytes / node_filesystem_size_bytes) < 0.10',
    forDuration: '5m',
    severity: 'critical',
    description: 'Available disk space dropped below 10%',
  },
];
