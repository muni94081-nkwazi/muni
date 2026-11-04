resource "random_password" "master_password" {
  length           = 16
  special          = true
  override_special = "!#$%&*()-_=+[]{}<>:?"
}

resource "aws_secretsmanager_secret" "db_password" {
  name        = "${var.project_name}-${var.environment}-aurora-password"
  description = "Aurora PostgreSQL master password"
}

resource "aws_secretsmanager_secret_version" "db_password" {
  secret_id     = aws_secretsmanager_secret.db_password.id
  secret_string = random_password.master_password.result
}

resource "aws_security_group" "rds_sg" {
  name        = "${var.project_name}-rds-sg-${var.environment}"
  description = "Security group for RDS Aurora cluster"
  vpc_id      = var.vpc_id

  ingress {
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [var.eks_node_security_group_id]
  }

  tags = {
    Name        = "${var.project_name}-rds-sg-${var.environment}"
    Environment = var.environment
  }
}

resource "aws_db_subnet_group" "aurora" {
  name       = "${var.project_name}-aurora-subnet-group-${var.environment}"
  subnet_ids = var.database_subnet_ids

  tags = {
    Name        = "${var.project_name}-aurora-subnet-group-${var.environment}"
    Environment = var.environment
  }
}

resource "aws_rds_cluster_parameter_group" "aurora" {
  name        = "${var.project_name}-aurora-pg-${var.environment}"
  family      = "aurora-postgresql15"
  description = "Parameter group for Aurora PostgreSQL"

  parameter {
    name  = "log_connections"
    value = "1"
  }

  parameter {
    name  = "log_min_duration_statement"
    value = "1000"
  }
}

resource "aws_rds_cluster" "aurora" {
  cluster_identifier              = "${var.project_name}-aurora-${var.environment}"
  engine                          = "aurora-postgresql"
  engine_mode                     = "provisioned"
  engine_version                  = "15.4"
  database_name                   = var.db_name
  master_username                 = var.db_username
  master_password                 = random_password.master_password.result
  db_subnet_group_name            = aws_db_subnet_group.aurora.name
  vpc_security_group_ids          = [aws_security_group.rds_sg.id]
  db_cluster_parameter_group_name = aws_rds_cluster_parameter_group.aurora.name
  backup_retention_period         = 7
  preferred_backup_window         = "02:00-03:00"
  storage_encrypted               = true
  deletion_protection             = var.environment == "prod" ? true : false

  serverlessv2_scaling_configuration {
    max_capacity = 16.0
    min_capacity = 0.5
  }

  tags = {
    Name        = "${var.project_name}-aurora-${var.environment}"
    Environment = var.environment
  }
}

resource "aws_rds_cluster_instance" "aurora_instances" {
  count              = 2
  identifier         = "${var.project_name}-aurora-instance-${count.index + 1}-${var.environment}"
  cluster_identifier = aws_rds_cluster.aurora.id
  instance_class     = "db.serverless"
  engine             = aws_rds_cluster.aurora.engine
  engine_version     = aws_rds_cluster.aurora.engine_version
  
  performance_insights_enabled = true
  
  tags = {
    Name        = "${var.project_name}-aurora-instance-${count.index + 1}-${var.environment}"
    Environment = var.environment
  }
}
