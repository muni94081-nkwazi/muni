variable "cluster_name" {
  type        = string
  description = "EKS cluster name"
}

variable "k8s_version" {
  type        = string
  description = "Kubernetes version"
  default     = "1.30"
}

variable "vpc_id" {
  type        = string
  description = "VPC ID"
}

variable "subnet_ids" {
  type        = list(string)
  description = "Subnet IDs for cluster control plane"
}

variable "node_subnet_ids" {
  type        = list(string)
  description = "Subnet IDs for node groups"
}

variable "environment" {
  type        = string
  description = "Deployment environment"
}
