output "vpc_id" {
  value       = aws_vpc.main.id
  description = "The ID of the VPC"
}

output "public_subnet_ids" {
  value       = aws_subnet.public[*].id
  description = "List of IDs of public subnets"
}

output "private_subnet_ids" {
  value       = aws_subnet.private[*].id
  description = "List of IDs of private subnets"
}

output "database_subnet_ids" {
  value       = aws_subnet.database[*].id
  description = "List of IDs of database subnets"
}

output "nat_gateway_ips" {
  value       = aws_eip.nat[*].public_ip
  description = "List of Elastic IPs associated with NAT Gateways"
}
