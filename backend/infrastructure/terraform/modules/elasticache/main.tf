resource "aws_security_group" "redis_sg" {
  name        = "${var.project_name}-redis-sg-${var.environment}"
  description = "Security group for ElastiCache Redis"
  vpc_id      = var.vpc_id

  ingress {
    from_port       = 6379
    to_port         = 6379
    protocol        = "tcp"
    security_groups = [var.eks_node_security_group_id]
  }

  tags = {
    Name        = "${var.project_name}-redis-sg-${var.environment}"
    Environment = var.environment
  }
}

resource "aws_elasticache_subnet_group" "redis" {
  name       = "${var.project_name}-redis-subnet-group-${var.environment}"
  subnet_ids = var.private_subnet_ids
}

resource "aws_elasticache_parameter_group" "redis" {
  name   = "${var.project_name}-redis-pg-${var.environment}"
  family = "redis7"

  parameter {
    name  = "maxmemory-policy"
    value = "allkeys-lru"
  }
  
  parameter {
    name  = "cluster-enabled"
    value = "yes"
  }
}

resource "aws_elasticache_replication_group" "redis" {
  replication_group_id          = "${var.project_name}-redis-${var.environment}"
  description                   = "Redis cluster for ${var.project_name} ${var.environment}"
  node_type                     = "cache.r7g.large"
  engine                        = "redis"
  engine_version                = "7.1"
  port                          = 6379
  parameter_group_name          = aws_elasticache_parameter_group.redis.name
  subnet_group_name             = aws_elasticache_subnet_group.redis.name
  security_group_ids            = [aws_security_group.redis_sg.id]
  
  automatic_failover_enabled    = true
  multi_az_enabled              = true
  
  at_rest_encryption_enabled    = true
  transit_encryption_enabled    = true
  
  snapshot_retention_limit      = 7
  snapshot_window               = "03:00-04:00"
  maintenance_window            = "sun:05:00-sun:06:00"

  cluster_mode {
    replicas_per_node_group = 2
    num_node_groups         = 2
  }

  tags = {
    Name        = "${var.project_name}-redis-${var.environment}"
    Environment = var.environment
  }
}
