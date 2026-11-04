resource "aws_security_group" "msk_sg" {
  name        = "${var.project_name}-msk-sg-${var.environment}"
  description = "Security group for MSK Kafka"
  vpc_id      = var.vpc_id

  ingress {
    from_port       = 9092
    to_port         = 9092
    protocol        = "tcp"
    security_groups = [var.eks_node_security_group_id]
    description     = "PLAINTEXT"
  }
  
  ingress {
    from_port       = 9094
    to_port         = 9094
    protocol        = "tcp"
    security_groups = [var.eks_node_security_group_id]
    description     = "TLS"
  }

  tags = {
    Name        = "${var.project_name}-msk-sg-${var.environment}"
    Environment = var.environment
  }
}

resource "aws_msk_configuration" "kafka" {
  kafka_versions = [var.kafka_version]
  name           = "${var.project_name}-kafka-config-${var.environment}"
  
  server_properties = <<PROPERTIES
auto.create.topics.enable=false
num.partitions=3
log.retention.hours=168
PROPERTIES
}

resource "aws_cloudwatch_log_group" "msk_logs" {
  name              = "/aws/msk/${var.project_name}-kafka-${var.environment}"
  retention_in_days = 14
}

resource "aws_msk_cluster" "kafka" {
  cluster_name           = "${var.project_name}-kafka-${var.environment}"
  kafka_version          = var.kafka_version
  number_of_broker_nodes = var.number_of_broker_nodes

  broker_node_group_info {
    instance_type   = "kafka.m5.large"
    client_subnets  = var.private_subnet_ids
    security_groups = [aws_security_group.msk_sg.id]
    
    storage_info {
      ebs_storage_info {
        volume_size = 200
        provisioned_throughput {
          enabled = true
          volume_throughput = 250
        }
      }
    }
  }

  configuration_info {
    arn      = aws_msk_configuration.kafka.arn
    revision = aws_msk_configuration.kafka.latest_revision
  }

  encryption_info {
    encryption_in_transit {
      client_broker = "TLS_PLAINTEXT"
      in_cluster    = true
    }
  }

  client_authentication {
    sasl {
      iam   = true
      scram = true
    }
  }

  logging_info {
    broker_logs {
      cloudwatch_logs {
        enabled   = true
        log_group = aws_cloudwatch_log_group.msk_logs.name
      }
    }
  }

  enhanced_monitoring = "PER_TOPIC_PER_BROKER"

  tags = {
    Name        = "${var.project_name}-kafka-${var.environment}"
    Environment = var.environment
  }
}
