variable "project_name" {
  type        = string
}

variable "environment" {
  type        = string
}

variable "vpc_id" {
  type        = string
}

variable "database_subnet_ids" {
  type        = list(string)
}

variable "eks_node_security_group_id" {
  type        = string
}

variable "db_name" {
  type        = string
}

variable "db_username" {
  type        = string
}
