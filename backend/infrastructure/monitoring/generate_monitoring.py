import os
import json

base_dir = r"C:\PROJECTS\Projects\MUNI\backend\infrastructure\monitoring"

files = {
    "prometheus/prometheus.yml": """global:
  scrape_interval: 15s
  evaluation_interval: 15s
  external_labels:
    cluster: muni
    environment: production

alerting:
  alertmanagers:
    - static_configs:
        - targets: ['alertmanager:9093']

rule_files:
  - "alerts/services.yml"
  - "alerts/infrastructure.yml"
  - "alerts/business.yml"

scrape_configs:
  - job_name: 'prometheus'
    static_configs:
      - targets: ['localhost:9090']

  - job_name: 'kubernetes-pods'
    kubernetes_sd_configs:
      - role: pod
    relabel_configs:
      - source_labels: [__meta_kubernetes_pod_annotation_prometheus_io_scrape]
        action: keep
        regex: true
      - source_labels: [__meta_kubernetes_pod_annotation_prometheus_io_port]
        action: replace
        target_label: __metrics_path__
        regex: (.+)
      - source_labels: [__meta_kubernetes_pod_annotation_prometheus_io_path]
        action: replace
        target_label: __metrics_path__
        regex: (.+)
      - action: labelmap
        regex: __meta_kubernetes_pod_label_(.+)
      - source_labels: [__meta_kubernetes_namespace]
        action: replace
        target_label: namespace
      - source_labels: [__meta_kubernetes_pod_name]
        action: replace
        target_label: pod

  - job_name: 'kubernetes-nodes'
    kubernetes_sd_configs:
      - role: node

  - job_name: 'kubernetes-apiservers'
    kubernetes_sd_configs:
      - role: endpoints
    scheme: https
    tls_config:
      ca_file: /var/run/secrets/kubernetes.io/serviceaccount/ca.crt
      insecure_skip_verify: true
    bearer_token_file: /var/run/secrets/kubernetes.io/serviceaccount/token
    relabel_configs:
      - source_labels: [__meta_kubernetes_namespace, __meta_kubernetes_service_name, __meta_kubernetes_endpoint_port_name]
        action: keep
        regex: default;kubernetes;https

  - job_name: 'api-gateway'
    static_configs:
      - targets: ['api-gateway.muni.svc.cluster.local:8080']
  - job_name: 'auth-service'
    static_configs:
      - targets: ['auth-service.muni.svc.cluster.local:4001']
  - job_name: 'product-service'
    static_configs:
      - targets: ['product-service.muni.svc.cluster.local:4002']
  - job_name: 'order-service'
    static_configs:
      - targets: ['order-service.muni.svc.cluster.local:4003']
  - job_name: 'payment-service'
    static_configs:
      - targets: ['payment-service.muni.svc.cluster.local:4004']
  - job_name: 'shipping-service'
    static_configs:
      - targets: ['shipping-service.muni.svc.cluster.local:4005']
  - job_name: 'notification-service'
    static_configs:
      - targets: ['notification-service.muni.svc.cluster.local:4007']
  - job_name: 'analytics-service'
    static_configs:
      - targets: ['analytics-service.muni.svc.cluster.local:4008']
  - job_name: 'search-service'
    static_configs:
      - targets: ['search-service.muni.svc.cluster.local:4010']
  - job_name: 'inventory-service'
    static_configs:
      - targets: ['inventory-service.muni.svc.cluster.local:4011']
  - job_name: 'review-service'
    static_configs:
      - targets: ['review-service.muni.svc.cluster.local:4012']
  - job_name: 'currency-service'
    static_configs:
      - targets: ['currency-service.muni.svc.cluster.local:4013']
  - job_name: 'tax-service'
    static_configs:
      - targets: ['tax-service.muni.svc.cluster.local:4014']
  - job_name: 'discount-service'
    static_configs:
      - targets: ['discount-service.muni.svc.cluster.local:4015']
  - job_name: 'wishlist-service'
    static_configs:
      - targets: ['wishlist-service.muni.svc.cluster.local:4016']
  - job_name: 'cart-service'
    static_configs:
      - targets: ['cart-service.muni.svc.cluster.local:4017']
  - job_name: 'media-service'
    static_configs:
      - targets: ['media-service.muni.svc.cluster.local:4018']
  - job_name: 'fraud-service'
    static_configs:
      - targets: ['fraud-service.muni.svc.cluster.local:4019']
  - job_name: 'return-service'
    static_configs:
      - targets: ['return-service.muni.svc.cluster.local:4020']
  - job_name: 'dispute-service'
    static_configs:
      - targets: ['dispute-service.muni.svc.cluster.local:4021']
  - job_name: 'marketplace-service'
    static_configs:
      - targets: ['marketplace-service.muni.svc.cluster.local:4022']
  - job_name: 'fulfillment-service'
    static_configs:
      - targets: ['fulfillment-service.muni.svc.cluster.local:4023']
  - job_name: 'checkout-service'
    static_configs:
      - targets: ['checkout-service.muni.svc.cluster.local:4024']

  - job_name: 'kafka-exporter'
    static_configs:
      - targets: ['kafka-exporter.muni-monitoring:9308']
  - job_name: 'redis-exporter'
    static_configs:
      - targets: ['redis-exporter.muni-monitoring:9121']
  - job_name: 'elasticsearch-exporter'
    static_configs:
      - targets: ['es-exporter.muni-monitoring:9114']
  - job_name: 'postgres-exporter'
    static_configs:
      - targets: ['postgres-exporter.muni-monitoring:9187']
  - job_name: 'node-exporter'
    kubernetes_sd_configs:
      - role: node
    relabel_configs:
      - source_labels: [__address__]
        regex: (.+):(.+)
        target_label: __address__
        replacement: $1:9100
  - job_name: 'kube-state-metrics'
    static_configs:
      - targets: ['kube-state-metrics.muni-monitoring:8080']
""",
    "prometheus/alerts/services.yml": """groups:
- name: muni.services
  rules:
  # Service down for 2+ minutes
  - alert: ServiceDown
    expr: up{job=~"api-gateway|auth-service|product-service|order-service|payment-service|checkout-service"} == 0
    for: 2m
    labels:
      severity: critical
      team: platform
    annotations:
      summary: "Critical service {{ $labels.job }} is DOWN"
      description: "Service {{ $labels.job }} has been unreachable for 2+ minutes. Pod: {{ $labels.pod }}"
      runbook: "https://runbooks.muni.ug/service-down"

  # High error rate (5xx) > 5%
  - alert: HighErrorRate
    expr: |
      sum(rate(http_requests_total{status=~"5.."}[5m])) by (job)
      /
      sum(rate(http_requests_total[5m])) by (job)
      > 0.05
    for: 3m
    labels:
      severity: warning
    annotations:
      summary: "High 5xx error rate on {{ $labels.job }}: {{ $value | humanizePercentage }}"

  # p95 latency > 2 seconds
  - alert: HighLatencyP95
    expr: histogram_quantile(0.95, sum(rate(http_request_duration_seconds_bucket[5m])) by (le, job)) > 2
    for: 5m
    labels:
      severity: warning
    annotations:
      summary: "High p95 latency on {{ $labels.job }}: {{ $value }}s"

  # API Gateway high latency (stricter threshold)
  - alert: GatewayHighLatency
    expr: histogram_quantile(0.99, sum(rate(http_request_duration_seconds_bucket{job="api-gateway"}[5m])) by (le)) > 1
    for: 3m
    labels:
      severity: critical
    annotations:
      summary: "API Gateway p99 latency exceeds 1s: {{ $value }}s"

  # Memory usage > 80% of limit
  - alert: HighMemoryUsage
    expr: |
      container_memory_working_set_bytes{namespace="muni", container!=""}
      /
      container_spec_memory_limit_bytes{namespace="muni", container!=""}
      > 0.8
    for: 5m
    labels:
      severity: warning
    annotations:
      summary: "High memory: {{ $labels.container }} at {{ $value | humanizePercentage }}"

  # CPU throttling > 50%
  - alert: HighCPUThrottling
    expr: |
      rate(container_cpu_cfs_throttled_seconds_total{namespace="muni"}[5m])
      /
      rate(container_cpu_cfs_periods_total{namespace="muni"}[5m])
      > 0.5
    for: 5m
    labels:
      severity: warning
    annotations:
      summary: "CPU throttling > 50% on {{ $labels.container }}"

  # Pod restart loop
  - alert: PodCrashLooping
    expr: increase(kube_pod_container_status_restarts_total{namespace="muni"}[15m]) > 3
    for: 0m
    labels:
      severity: critical
    annotations:
      summary: "Pod {{ $labels.pod }} is crash-looping ({{ $value }} restarts in 15m)"

  # Checkout service specific: saga timeout
  - alert: CheckoutSagaHighFailureRate
    expr: |
      sum(rate(checkout_saga_failures_total[5m]))
      /
      sum(rate(checkout_saga_started_total[5m]))
      > 0.1
    for: 3m
    labels:
      severity: critical
      team: checkout
    annotations:
      summary: "Checkout saga failure rate > 10%: {{ $value | humanizePercentage }}"

  # Fraud Service Block Rate High
  - alert: FraudServiceHighBlockRate
    expr: |
      sum(rate(fraud_requests_blocked_total[5m]))
      /
      sum(rate(fraud_requests_total[5m]))
      > 0.20
    for: 5m
    labels:
      severity: warning
    annotations:
      summary: "Fraud Service blocking > 20% of requests"

  # Payment Service Down
  - alert: PaymentServiceDown
    expr: up{job="payment-service"} == 0
    for: 2m
    labels:
      severity: critical
      pagerduty: "true"
    annotations:
      summary: "Payment Service is DOWN"

  # Auth Service Error Rate
  - alert: AuthServiceHighErrorRate
    expr: |
      sum(rate(http_requests_total{job="auth-service", status=~"5.."}[5m]))
      /
      sum(rate(http_requests_total{job="auth-service"}[5m]))
      > 0.01
    for: 5m
    labels:
      severity: warning
    annotations:
      summary: "Auth Service error rate > 1%"

  # Search Service Down
  - alert: SearchServiceDown
    expr: up{job="search-service"} == 0
    for: 2m
    labels:
      severity: warning
    annotations:
      summary: "Search Service is DOWN"
""",
    "prometheus/alerts/infrastructure.yml": """groups:
- name: muni.infrastructure
  rules:
  - alert: KafkaConsumerGroupLagWarning
    expr: consumer_group_lag > 1000
    for: 5m
    labels:
      severity: warning
    annotations:
      summary: "Kafka consumer group lag is high"
      
  - alert: KafkaConsumerGroupLagCritical
    expr: consumer_group_lag > 10000
    for: 5m
    labels:
      severity: critical
    annotations:
      summary: "Kafka consumer group lag is critical"
      
  - alert: KafkaUnderReplicatedPartitions
    expr: kafka_topic_partition_under_replicated_partition > 0
    for: 2m
    labels:
      severity: critical
    annotations:
      summary: "Kafka under-replicated partitions detected"
      
  - alert: RedisMemoryUsage
    expr: redis_memory_used_bytes / redis_total_system_memory_bytes > 0.85
    for: 5m
    labels:
      severity: warning
    annotations:
      summary: "Redis memory usage > 85%"
      
  - alert: RedisConnectionsHigh
    expr: redis_connected_clients > 500
    for: 5m
    labels:
      severity: warning
    annotations:
      summary: "Redis connected clients > 500"
      
  - alert: ElasticsearchClusterStatusRed
    expr: elasticsearch_cluster_health_status{color="red"} == 1
    for: 2m
    labels:
      severity: critical
    annotations:
      summary: "Elasticsearch cluster health is RED"
      
  - alert: ElasticsearchClusterStatusYellow
    expr: elasticsearch_cluster_health_status{color="yellow"} == 1
    for: 5m
    labels:
      severity: warning
    annotations:
      summary: "Elasticsearch cluster health is YELLOW"
      
  - alert: ElasticsearchDiskUsageHighWarning
    expr: (elasticsearch_fs_total_bytes - elasticsearch_fs_free_bytes) / elasticsearch_fs_total_bytes > 0.8
    for: 5m
    labels:
      severity: warning
    annotations:
      summary: "Elasticsearch disk usage > 80%"
      
  - alert: ElasticsearchDiskUsageHighCritical
    expr: (elasticsearch_fs_total_bytes - elasticsearch_fs_free_bytes) / elasticsearch_fs_total_bytes > 0.9
    for: 5m
    labels:
      severity: critical
    annotations:
      summary: "Elasticsearch disk usage > 90%"
      
  - alert: PostgresConnectionsExhausted
    expr: pg_stat_activity_count / pg_settings_max_connections > 0.8
    for: 5m
    labels:
      severity: warning
    annotations:
      summary: "PostgreSQL connections > 80% capacity"
      
  - alert: PostgresReplicationLag
    expr: pg_replication_lag > 30
    for: 5m
    labels:
      severity: warning
    annotations:
      summary: "PostgreSQL replication lag > 30s"
      
  - alert: KubernetesNodeNotReady
    expr: kube_node_status_condition{condition="Ready",status="true"} == 0
    for: 2m
    labels:
      severity: critical
    annotations:
      summary: "Kubernetes node not ready"
      
  - alert: PersistentVolumeUsageHigh
    expr: kubelet_volume_stats_used_bytes / kubelet_volume_stats_capacity_bytes > 0.85
    for: 5m
    labels:
      severity: warning
    annotations:
      summary: "Persistent volume usage > 85%"
""",
    "prometheus/alerts/business.yml": """groups:
- name: muni.business
  rules:
  - alert: OrderCreationFailureRate
    expr: rate(orders_created_failures_total[5m]) / rate(orders_created_total[5m]) > 0.02
    for: 3m
    labels:
      severity: critical
    annotations:
      summary: "Order creation failure rate > 2%"
      
  - alert: PaymentFailureRateHigh
    expr: rate(payment_failures_total[5m]) / rate(payment_attempts_total[5m]) > 0.05
    for: 5m
    labels:
      severity: critical
    annotations:
      summary: "Payment failure rate > 5%"
      
  - alert: FraudBlockRateAbnormal
    expr: rate(fraud_blocks_total[1h]) > 100
    for: 1m
    labels:
      severity: warning
    annotations:
      summary: "Abnormally high fraud block rate (>100/hr) - potential attack"
      
  - alert: GMVDropAlert
    expr: rate(payment_revenue_total[1h]) < (avg_over_time(rate(payment_revenue_total[1h])[7d:1h]) * 0.5)
    for: 30m
    labels:
      severity: critical
    annotations:
      summary: "GMV dropped by more than 50% compared to historical average"
      
  - alert: CartAbandonmentHigh
    expr: (cart_checkouts_abandoned_total / cart_checkouts_started_total) > 0.8
    for: 10m
    labels:
      severity: warning
    annotations:
      summary: "Cart abandonment rate > 80%"
      
  - alert: SellerRegistrationSpike
    expr: rate(seller_registrations_total[10m]) > 10
    for: 1m
    labels:
      severity: info
    annotations:
      summary: "Seller registration spike detected (>10 in 10m)"
""",
    "prometheus/k8s/namespace.yaml": """apiVersion: v1
kind: Namespace
metadata:
  name: muni-monitoring
""",
    "prometheus/k8s/rbac.yaml": """apiVersion: v1
kind: ServiceAccount
metadata:
  name: prometheus
  namespace: muni-monitoring
---
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  name: prometheus
rules:
- apiGroups: [""]
  resources:
  - nodes
  - nodes/proxy
  - services
  - endpoints
  - pods
  verbs: ["get", "list", "watch"]
- apiGroups: ["extensions"]
  resources:
  - ingresses
  verbs: ["get", "list", "watch"]
---
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRoleBinding
metadata:
  name: prometheus
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: ClusterRole
  name: prometheus
subjects:
- kind: ServiceAccount
  name: prometheus
  namespace: muni-monitoring
""",
    "prometheus/k8s/configmap.yaml": """apiVersion: v1
kind: ConfigMap
metadata:
  name: prometheus-config
  namespace: muni-monitoring
data:
  prometheus.yml: |
    global:
      scrape_interval: 15s
      evaluation_interval: 15s
      external_labels:
        cluster: muni
        environment: production
    
    alerting:
      alertmanagers:
        - static_configs:
            - targets: ['alertmanager:9093']
    
    rule_files:
      - "/etc/prometheus/alerts/services.yml"
      - "/etc/prometheus/alerts/infrastructure.yml"
      - "/etc/prometheus/alerts/business.yml"
    
    scrape_configs:
      - job_name: 'prometheus'
        static_configs:
          - targets: ['localhost:9090']
    
      - job_name: 'kubernetes-pods'
        kubernetes_sd_configs:
          - role: pod
        relabel_configs:
          - source_labels: [__meta_kubernetes_pod_annotation_prometheus_io_scrape]
            action: keep
            regex: true
          - source_labels: [__meta_kubernetes_pod_annotation_prometheus_io_port]
            action: replace
            target_label: __metrics_path__
            regex: (.+)
          - source_labels: [__meta_kubernetes_pod_annotation_prometheus_io_path]
            action: replace
            target_label: __metrics_path__
            regex: (.+)
          - action: labelmap
            regex: __meta_kubernetes_pod_label_(.+)
          - source_labels: [__meta_kubernetes_namespace]
            action: replace
            target_label: namespace
          - source_labels: [__meta_kubernetes_pod_name]
            action: replace
            target_label: pod
    
      - job_name: 'kubernetes-nodes'
        kubernetes_sd_configs:
          - role: node
    
      - job_name: 'kubernetes-apiservers'
        kubernetes_sd_configs:
          - role: endpoints
        scheme: https
        tls_config:
          ca_file: /var/run/secrets/kubernetes.io/serviceaccount/ca.crt
          insecure_skip_verify: true
        bearer_token_file: /var/run/secrets/kubernetes.io/serviceaccount/token
        relabel_configs:
          - source_labels: [__meta_kubernetes_namespace, __meta_kubernetes_service_name, __meta_kubernetes_endpoint_port_name]
            action: keep
            regex: default;kubernetes;https
    
      - job_name: 'api-gateway'
        static_configs:
          - targets: ['api-gateway.muni.svc.cluster.local:8080']
      - job_name: 'auth-service'
        static_configs:
          - targets: ['auth-service.muni.svc.cluster.local:4001']
      - job_name: 'product-service'
        static_configs:
          - targets: ['product-service.muni.svc.cluster.local:4002']
      - job_name: 'order-service'
        static_configs:
          - targets: ['order-service.muni.svc.cluster.local:4003']
      - job_name: 'payment-service'
        static_configs:
          - targets: ['payment-service.muni.svc.cluster.local:4004']
      - job_name: 'shipping-service'
        static_configs:
          - targets: ['shipping-service.muni.svc.cluster.local:4005']
      - job_name: 'notification-service'
        static_configs:
          - targets: ['notification-service.muni.svc.cluster.local:4007']
      - job_name: 'analytics-service'
        static_configs:
          - targets: ['analytics-service.muni.svc.cluster.local:4008']
      - job_name: 'search-service'
        static_configs:
          - targets: ['search-service.muni.svc.cluster.local:4010']
      - job_name: 'inventory-service'
        static_configs:
          - targets: ['inventory-service.muni.svc.cluster.local:4011']
      - job_name: 'review-service'
        static_configs:
          - targets: ['review-service.muni.svc.cluster.local:4012']
      - job_name: 'currency-service'
        static_configs:
          - targets: ['currency-service.muni.svc.cluster.local:4013']
      - job_name: 'tax-service'
        static_configs:
          - targets: ['tax-service.muni.svc.cluster.local:4014']
      - job_name: 'discount-service'
        static_configs:
          - targets: ['discount-service.muni.svc.cluster.local:4015']
      - job_name: 'wishlist-service'
        static_configs:
          - targets: ['wishlist-service.muni.svc.cluster.local:4016']
      - job_name: 'cart-service'
        static_configs:
          - targets: ['cart-service.muni.svc.cluster.local:4017']
      - job_name: 'media-service'
        static_configs:
          - targets: ['media-service.muni.svc.cluster.local:4018']
      - job_name: 'fraud-service'
        static_configs:
          - targets: ['fraud-service.muni.svc.cluster.local:4019']
      - job_name: 'return-service'
        static_configs:
          - targets: ['return-service.muni.svc.cluster.local:4020']
      - job_name: 'dispute-service'
        static_configs:
          - targets: ['dispute-service.muni.svc.cluster.local:4021']
      - job_name: 'marketplace-service'
        static_configs:
          - targets: ['marketplace-service.muni.svc.cluster.local:4022']
      - job_name: 'fulfillment-service'
        static_configs:
          - targets: ['fulfillment-service.muni.svc.cluster.local:4023']
      - job_name: 'checkout-service'
        static_configs:
          - targets: ['checkout-service.muni.svc.cluster.local:4024']
    
      - job_name: 'kafka-exporter'
        static_configs:
          - targets: ['kafka-exporter.muni-monitoring:9308']
      - job_name: 'redis-exporter'
        static_configs:
          - targets: ['redis-exporter.muni-monitoring:9121']
      - job_name: 'elasticsearch-exporter'
        static_configs:
          - targets: ['es-exporter.muni-monitoring:9114']
      - job_name: 'postgres-exporter'
        static_configs:
          - targets: ['postgres-exporter.muni-monitoring:9187']
      - job_name: 'node-exporter'
        kubernetes_sd_configs:
          - role: node
        relabel_configs:
          - source_labels: [__address__]
            regex: (.+):(.+)
            target_label: __address__
            replacement: $1:9100
      - job_name: 'kube-state-metrics'
        static_configs:
          - targets: ['kube-state-metrics.muni-monitoring:8080']
""",
    "prometheus/k8s/deployment.yaml": """apiVersion: apps/v1
kind: Deployment
metadata:
  name: prometheus
  namespace: muni-monitoring
spec:
  replicas: 1
  selector:
    matchLabels:
      app: prometheus
  template:
    metadata:
      labels:
        app: prometheus
    spec:
      serviceAccountName: prometheus
      containers:
      - name: prometheus
        image: prom/prometheus:v2.52.0
        args:
        - --config.file=/etc/prometheus/prometheus.yml
        - --storage.tsdb.path=/prometheus
        - --storage.tsdb.retention.time=15d
        - --web.enable-lifecycle
        - --web.enable-admin-api
        ports:
        - containerPort: 9090
        resources:
          requests:
            cpu: 250m
            memory: 512Mi
          limits:
            cpu: 2000m
            memory: 4Gi
        volumeMounts:
        - name: config-volume
          mountPath: /etc/prometheus/prometheus.yml
          subPath: prometheus.yml
        - name: alerts-volume
          mountPath: /etc/prometheus/alerts
        - name: storage-volume
          mountPath: /prometheus
      volumes:
      - name: config-volume
        configMap:
          name: prometheus-config
      - name: alerts-volume
        configMap:
          name: prometheus-alerts-config
      - name: storage-volume
        persistentVolumeClaim:
          claimName: prometheus-pvc
""",
    "prometheus/k8s/service.yaml": """apiVersion: v1
kind: Service
metadata:
  name: prometheus
  namespace: muni-monitoring
spec:
  selector:
    app: prometheus
  ports:
  - port: 9090
    targetPort: 9090
  type: ClusterIP
""",
    "prometheus/k8s/pvc.yaml": """apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: prometheus-pvc
  namespace: muni-monitoring
spec:
  accessModes:
  - ReadWriteOnce
  storageClassName: gp3
  resources:
    requests:
      storage: 50Gi
""",
    "alertmanager/alertmanager.yml": """global:
  resolve_timeout: 5m
  slack_api_url: '${SLACK_WEBHOOK_URL}'
  smtp_smarthost: 'email-smtp.af-south-1.amazonaws.com:587'
  smtp_from: 'alerts@muni.ug'
  smtp_auth_username: '${SMTP_USER}'
  smtp_auth_password: '${SMTP_PASS}'

templates:
  - '/etc/alertmanager/templates/*.tmpl'

route:
  group_by: ['alertname', 'cluster', 'service']
  group_wait: 30s
  group_interval: 5m
  repeat_interval: 4h
  receiver: slack-default
  routes:
  - match:
      severity: critical
    receiver: pagerduty-critical
    continue: true
  - match:
      severity: critical
    receiver: slack-critical
  - match:
      severity: warning
    receiver: slack-warnings
  - match:
      team: checkout
    receiver: checkout-team

receivers:
- name: slack-default
  slack_configs:
  - channel: '#muni-alerts'
    title: '[{{ .Status | toUpper }}] {{ .GroupLabels.alertname }}'
    text: '{{ range .Alerts }}{{ .Annotations.summary }}\\n{{ end }}'
    send_resolved: true

- name: slack-critical
  slack_configs:
  - channel: '#muni-critical'
    color: '{{ if eq .Status "firing" }}danger{{ else }}good{{ end }}'
    title: '🚨 CRITICAL: {{ .GroupLabels.alertname }}'
    text: '{{ range .Alerts }}{{ .Annotations.description }}\\nRunbook: {{ .Annotations.runbook }}{{ end }}'
    send_resolved: true

- name: slack-warnings
  slack_configs:
  - channel: '#muni-warnings'
    title: '⚠️ WARNING: {{ .GroupLabels.alertname }}'
    text: '{{ range .Alerts }}{{ .Annotations.summary }}{{ end }}'
    send_resolved: true

- name: pagerduty-critical
  pagerduty_configs:
  - routing_key: '${PAGERDUTY_ROUTING_KEY}'
    description: '{{ .GroupLabels.alertname }}: {{ range .Alerts }}{{ .Annotations.summary }}{{ end }}'
    severity: critical
    client: 'MUNI Platform'
    client_url: 'https://grafana.muni.ug'

- name: checkout-team
  slack_configs:
  - channel: '#checkout-alerts'
    title: '{{ .GroupLabels.alertname }}'
    text: '{{ range .Alerts }}{{ .Annotations.summary }}{{ end }}'
  email_configs:
  - to: 'checkout-team@muni.ug'
    subject: '[MUNI Alert] {{ .GroupLabels.alertname }}'
    body: '{{ range .Alerts }}{{ .Annotations.description }}{{ end }}'

inhibit_rules:
- source_match:
    severity: critical
  target_match:
    severity: warning
  equal: ['alertname', 'cluster', 'service']
""",
    "alertmanager/k8s/deployment.yaml": """apiVersion: apps/v1
kind: Deployment
metadata:
  name: alertmanager
  namespace: muni-monitoring
spec:
  replicas: 1
  selector:
    matchLabels:
      app: alertmanager
  template:
    metadata:
      labels:
        app: alertmanager
    spec:
      containers:
      - name: alertmanager
        image: prom/alertmanager:v0.27.0
        ports:
        - containerPort: 9093
        resources:
          requests:
            cpu: 50m
            memory: 64Mi
          limits:
            cpu: 500m
            memory: 512Mi
        volumeMounts:
        - name: config-volume
          mountPath: /etc/alertmanager/alertmanager.yml
          subPath: alertmanager.yml
      volumes:
      - name: config-volume
        configMap:
          name: alertmanager-config
""",
    "alertmanager/k8s/configmap.yaml": """apiVersion: v1
kind: ConfigMap
metadata:
  name: alertmanager-config
  namespace: muni-monitoring
data:
  alertmanager.yml: |
    global:
      resolve_timeout: 5m
      slack_api_url: '${SLACK_WEBHOOK_URL}'
      smtp_smarthost: 'email-smtp.af-south-1.amazonaws.com:587'
      smtp_from: 'alerts@muni.ug'
      smtp_auth_username: '${SMTP_USER}'
      smtp_auth_password: '${SMTP_PASS}'
    
    templates:
      - '/etc/alertmanager/templates/*.tmpl'
    
    route:
      group_by: ['alertname', 'cluster', 'service']
      group_wait: 30s
      group_interval: 5m
      repeat_interval: 4h
      receiver: slack-default
      routes:
      - match:
          severity: critical
        receiver: pagerduty-critical
        continue: true
      - match:
          severity: critical
        receiver: slack-critical
      - match:
          severity: warning
        receiver: slack-warnings
      - match:
          team: checkout
        receiver: checkout-team
    
    receivers:
    - name: slack-default
      slack_configs:
      - channel: '#muni-alerts'
        title: '[{{ .Status | toUpper }}] {{ .GroupLabels.alertname }}'
        text: '{{ range .Alerts }}{{ .Annotations.summary }}\\n{{ end }}'
        send_resolved: true
    
    - name: slack-critical
      slack_configs:
      - channel: '#muni-critical'
        color: '{{ if eq .Status "firing" }}danger{{ else }}good{{ end }}'
        title: '🚨 CRITICAL: {{ .GroupLabels.alertname }}'
        text: '{{ range .Alerts }}{{ .Annotations.description }}\\nRunbook: {{ .Annotations.runbook }}{{ end }}'
        send_resolved: true
    
    - name: slack-warnings
      slack_configs:
      - channel: '#muni-warnings'
        title: '⚠️ WARNING: {{ .GroupLabels.alertname }}'
        text: '{{ range .Alerts }}{{ .Annotations.summary }}{{ end }}'
        send_resolved: true
    
    - name: pagerduty-critical
      pagerduty_configs:
      - routing_key: '${PAGERDUTY_ROUTING_KEY}'
        description: '{{ .GroupLabels.alertname }}: {{ range .Alerts }}{{ .Annotations.summary }}{{ end }}'
        severity: critical
        client: 'MUNI Platform'
        client_url: 'https://grafana.muni.ug'
    
    - name: checkout-team
      slack_configs:
      - channel: '#checkout-alerts'
        title: '{{ .GroupLabels.alertname }}'
        text: '{{ range .Alerts }}{{ .Annotations.summary }}{{ end }}'
      email_configs:
      - to: 'checkout-team@muni.ug'
        subject: '[MUNI Alert] {{ .GroupLabels.alertname }}'
        body: '{{ range .Alerts }}{{ .Annotations.description }}{{ end }}'
    
    inhibit_rules:
    - source_match:
        severity: critical
      target_match:
        severity: warning
      equal: ['alertname', 'cluster', 'service']
""",
    "alertmanager/k8s/service.yaml": """apiVersion: v1
kind: Service
metadata:
  name: alertmanager
  namespace: muni-monitoring
spec:
  selector:
    app: alertmanager
  ports:
  - port: 9093
    targetPort: 9093
  type: ClusterIP
""",
    "grafana/k8s/deployment.yaml": """apiVersion: apps/v1
kind: Deployment
metadata:
  name: grafana
  namespace: muni-monitoring
spec:
  replicas: 1
  selector:
    matchLabels:
      app: grafana
  template:
    metadata:
      labels:
        app: grafana
    spec:
      containers:
      - name: grafana
        image: grafana/grafana:11.1.0
        ports:
        - containerPort: 3000
        env:
        - name: GF_SECURITY_ADMIN_PASSWORD
          valueFrom:
            secretKeyRef:
              name: grafana-secrets
              key: admin-password
              optional: true
        - name: GF_SERVER_ROOT_URL
          value: "https://grafana.muni.ug"
        - name: GF_INSTALL_PLUGINS
          value: "grafana-piechart-panel,grafana-clock-panel"
        resources:
          requests:
            cpu: 100m
            memory: 256Mi
          limits:
            cpu: 1000m
            memory: 1Gi
        volumeMounts:
        - name: grafana-storage
          mountPath: /var/lib/grafana
        - name: grafana-datasources
          mountPath: /etc/grafana/provisioning/datasources
        - name: grafana-dashboards-config
          mountPath: /etc/grafana/provisioning/dashboards
        - name: grafana-dashboards
          mountPath: /var/lib/grafana/dashboards
      volumes:
      - name: grafana-storage
        persistentVolumeClaim:
          claimName: grafana-pvc
      - name: grafana-datasources
        configMap:
          name: grafana-datasources
      - name: grafana-dashboards-config
        configMap:
          name: grafana-dashboards-config
      - name: grafana-dashboards
        configMap:
          name: grafana-dashboards
""",
    "grafana/k8s/service.yaml": """apiVersion: v1
kind: Service
metadata:
  name: grafana
  namespace: muni-monitoring
spec:
  selector:
    app: grafana
  ports:
  - port: 3000
    targetPort: 3000
  type: ClusterIP
""",
    "grafana/k8s/pvc.yaml": """apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: grafana-pvc
  namespace: muni-monitoring
spec:
  accessModes:
  - ReadWriteOnce
  storageClassName: gp3
  resources:
    requests:
      storage: 10Gi
""",
    "grafana/k8s/ingress.yaml": """apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: grafana-ingress
  namespace: muni-monitoring
  annotations:
    cert-manager.io/cluster-issuer: "letsencrypt-prod"
spec:
  tls:
  - hosts:
    - grafana.muni.ug
    secretName: grafana-tls
  rules:
  - host: grafana.muni.ug
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: grafana
            port:
              number: 3000
""",
    "grafana/provisioning/datasources.yaml": """apiVersion: 1
datasources:
- name: Prometheus
  type: prometheus
  uid: prometheus
  url: http://prometheus.muni-monitoring:9090
  isDefault: true
  editable: false
  jsonData:
    timeInterval: 15s
    queryTimeout: 60s
    httpMethod: POST

- name: Loki
  type: loki
  uid: loki
  url: http://loki.muni-monitoring:3100
  editable: false
  jsonData:
    maxLines: 1000
    derivedFields:
    - datasourceUid: jaeger
      matcherRegex: '"correlationId":"([^"]+)"'
      name: correlationId
      url: '${__value.raw}'

- name: Jaeger
  type: jaeger
  uid: jaeger
  url: http://jaeger-query.muni-monitoring:16686
  editable: false

- name: Elasticsearch
  type: elasticsearch
  uid: elasticsearch
  url: http://elasticsearch.muni:9200
  editable: false
  jsonData:
    index: muni-logs-*
    timeField: "@timestamp"
    esVersion: "8.0.0"
    logMessageField: message
    logLevelField: level
""",
    "grafana/provisioning/dashboards.yaml": """apiVersion: 1
providers:
- name: muni-dashboards
  type: file
  options:
    path: /var/lib/grafana/dashboards
  updateIntervalSeconds: 30
  allowUiUpdates: true
""",
    "grafana/dashboards/platform-overview.json": '''{
  "title": "MUNI Platform Overview",
  "time": {
    "from": "now-1h",
    "to": "now"
  },
  "refresh": "30s",
  "panels": [
    {
      "type": "stat",
      "title": "Total Services Up",
      "gridPos": { "h": 4, "w": 6, "x": 0, "y": 0 },
      "targets": [{ "expr": "count(up{namespace=\\"muni\\"} == 1)", "refId": "A" }],
      "fieldConfig": { "defaults": { "color": { "mode": "value", "fixedColor": "green" } } }
    },
    {
      "type": "stat",
      "title": "Total Services Down",
      "gridPos": { "h": 4, "w": 6, "x": 6, "y": 0 },
      "targets": [{ "expr": "count(up{namespace=\\"muni\\"} == 0)", "refId": "A" }],
      "fieldConfig": { "defaults": { "thresholds": { "mode": "absolute", "steps": [{ "value": null, "color": "green" }, { "value": 1, "color": "red" }] } } }
    },
    {
      "type": "stat",
      "title": "API Gateway RPS",
      "gridPos": { "h": 4, "w": 6, "x": 12, "y": 0 },
      "targets": [{ "expr": "sum(rate(http_requests_total{job=\\"api-gateway\\"}[5m]))", "refId": "A" }]
    },
    {
      "type": "stat",
      "title": "Overall Error Rate",
      "gridPos": { "h": 4, "w": 6, "x": 18, "y": 0 },
      "targets": [{ "expr": "sum(rate(http_requests_total{status=~\\"5..\\"}[5m])) / sum(rate(http_requests_total[5m]))", "refId": "A" }],
      "fieldConfig": { "defaults": { "unit": "percentunit", "thresholds": { "mode": "absolute", "steps": [{ "value": null, "color": "green" }, { "value": 0.05, "color": "red" }] } } }
    },
    {
      "type": "timeseries",
      "title": "Traffic RPS per Service",
      "gridPos": { "h": 8, "w": 24, "x": 0, "y": 4 },
      "targets": [{ "expr": "sum(rate(http_requests_total[5m])) by (job)", "legendFormat": "{{job}}" }]
    },
    {
      "type": "heatmap",
      "title": "HTTP Latency (p50/p95/p99)",
      "gridPos": { "h": 8, "w": 24, "x": 0, "y": 12 },
      "targets": [{ "expr": "sum(rate(http_request_duration_seconds_bucket[5m])) by (le)", "format": "heatmap" }]
    },
    {
      "type": "timeseries",
      "title": "Kafka Lag & Redis Memory",
      "gridPos": { "h": 8, "w": 12, "x": 0, "y": 20 },
      "targets": [
        { "expr": "consumer_group_lag", "legendFormat": "Kafka Lag" },
        { "expr": "redis_memory_used_bytes", "legendFormat": "Redis Memory" }
      ]
    },
    {
      "type": "timeseries",
      "title": "Orders & Revenue per Minute",
      "gridPos": { "h": 8, "w": 12, "x": 12, "y": 20 },
      "targets": [
        { "expr": "sum(rate(orders_created_total[1m])) * 60", "legendFormat": "Orders/min" },
        { "expr": "sum(rate(payment_revenue_total[1m])) * 60", "legendFormat": "Revenue/min" }
      ]
    }
  ]
}''',
    "grafana/dashboards/business-metrics.json": '''{
  "title": "MUNI Business Metrics",
  "time": {
    "from": "now-24h",
    "to": "now"
  },
  "refresh": "1m",
  "panels": [
    {
      "type": "stat",
      "title": "GMV (Last 24h)",
      "gridPos": { "h": 4, "w": 6, "x": 0, "y": 0 },
      "targets": [{ "expr": "sum(increase(payment_revenue_total[24h]))", "refId": "A" }],
      "fieldConfig": { "defaults": { "unit": "currencyUSD" } }
    },
    {
      "type": "stat",
      "title": "Orders per Hour",
      "gridPos": { "h": 4, "w": 6, "x": 6, "y": 0 },
      "targets": [{ "expr": "sum(increase(orders_created_total[1h]))", "refId": "A" }]
    },
    {
      "type": "stat",
      "title": "Payment Success Rate",
      "gridPos": { "h": 4, "w": 6, "x": 12, "y": 0 },
      "targets": [{ "expr": "sum(rate(payment_successes_total[5m])) / sum(rate(payment_attempts_total[5m]))", "refId": "A" }],
      "fieldConfig": { "defaults": { "unit": "percentunit" } }
    },
    {
      "type": "stat",
      "title": "Fraud Blocks per Hour",
      "gridPos": { "h": 4, "w": 6, "x": 18, "y": 0 },
      "targets": [{ "expr": "sum(increase(fraud_blocks_total[1h]))", "refId": "A" }]
    },
    {
      "type": "timeseries",
      "title": "Active Cart Sessions",
      "gridPos": { "h": 8, "w": 12, "x": 0, "y": 4 },
      "targets": [{ "expr": "cart_active_sessions", "legendFormat": "Active Sessions" }]
    },
    {
      "type": "timeseries",
      "title": "Checkout Conversion Rate",
      "gridPos": { "h": 8, "w": 12, "x": 12, "y": 4 },
      "targets": [{ "expr": "sum(rate(orders_created_total[5m])) / sum(rate(cart_checkouts_started_total[5m]))", "legendFormat": "Conversion Rate" }],
      "fieldConfig": { "defaults": { "unit": "percentunit" } }
    },
    {
      "type": "table",
      "title": "Top Product Categories",
      "gridPos": { "h": 8, "w": 12, "x": 0, "y": 12 },
      "targets": [{ "expr": "topk(10, sum(increase(product_views_total[1h])) by (category))", "format": "table" }]
    },
    {
      "type": "stat",
      "title": "Seller Registrations Today",
      "gridPos": { "h": 8, "w": 12, "x": 12, "y": 12 },
      "targets": [{ "expr": "sum(increase(seller_registrations_total[24h]))", "refId": "A" }]
    }
  ]
}'''
}

# Update configmap for prometheus-alerts-config
files["prometheus/k8s/alerts-configmap.yaml"] = """apiVersion: v1
kind: ConfigMap
metadata:
  name: prometheus-alerts-config
  namespace: muni-monitoring
data:
  services.yml: |
""" + "\n".join(["    " + line for line in files["prometheus/alerts/services.yml"].split("\\n")]) + """
  infrastructure.yml: |
""" + "\n".join(["    " + line for line in files["prometheus/alerts/infrastructure.yml"].split("\\n")]) + """
  business.yml: |
""" + "\n".join(["    " + line for line in files["prometheus/alerts/business.yml"].split("\\n")])

for filepath, content in files.items():
    full_path = os.path.join(base_dir, filepath)
    os.makedirs(os.path.dirname(full_path), exist_ok=True)
    with open(full_path, "w", encoding="utf-8") as f:
        f.write(content)

print(f"Created {len(files)} files successfully.")
