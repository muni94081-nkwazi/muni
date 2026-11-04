variable "project_name" {
  type = string
}

variable "environment" {
  type = string
}

variable "vpc_id" {
  type = string
}

variable "private_subnet_ids" {
  type = list(string)
}

variable "eks_node_security_group_id" {
  type = string
}

variable "kafka_version" {
  type = string
  default = "3.6.0"
}

variable "number_of_broker_nodes" {
  type = number
  default = 3
}
