output "configuration_endpoint_address" {
  value = aws_elasticache_replication_group.redis.configuration_endpoint_address
}

output "primary_endpoint_address" {
  value = aws_elasticache_replication_group.redis.primary_endpoint_address
}

output "port" {
  value = aws_elasticache_replication_group.redis.port
}

output "security_group_id" {
  value = aws_security_group.redis_sg.id
}
