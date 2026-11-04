output "cluster_endpoint" {
  value = aws_rds_cluster.aurora.endpoint
}

output "reader_endpoint" {
  value = aws_rds_cluster.aurora.reader_endpoint
}

output "port" {
  value = aws_rds_cluster.aurora.port
}

output "secret_arn" {
  value = aws_secretsmanager_secret.db_password.arn
}

output "security_group_id" {
  value = aws_security_group.rds_sg.id
}
