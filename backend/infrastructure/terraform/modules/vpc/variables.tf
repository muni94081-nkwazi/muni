variable "vpc_cidr" {
  type        = string
  description = "CIDR block for the VPC"
}

variable "project_name" {
  type        = string
  description = "Project name for resource naming"
}

variable "environment" {
  type        = string
  description = "Deployment environment (e.g., dev, staging, prod)"
}

variable "availability_zones" {
  type        = list(string)
  description = "List of availability zones to use"
}

variable "aws_region" {
  type        = string
  description = "AWS region"
  default     = "af-south-1"
}
