output "vpc_id" {
  value = module.vpc.vpc_id
}

output "eks_cluster_endpoint" {
  value = module.eks.cluster_endpoint
}

output "rds_endpoint" {
  value = module.rds.cluster_endpoint
}

output "redis_endpoint" {
  value = module.elasticache.configuration_endpoint_address
}

output "kafka_brokers" {
  value = module.msk.bootstrap_brokers_tls
}

output "cloudfront_domain" {
  value = module.cloudfront.cloudfront_domain_name
}

output "ecr_repository_urls" {
  value = module.ecr.repository_urls
}
