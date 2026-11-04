variable "aws_region" {
  type    = string
  default = "af-south-1"
}

variable "environment" {
  type    = string
  default = "staging"
}

variable "acm_certificate_arn" {
  type    = string
  default = ""
}
