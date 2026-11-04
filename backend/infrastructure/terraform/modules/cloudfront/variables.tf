variable "project_name" {
  type = string
}

variable "environment" {
  type = string
}

variable "s3_bucket_domain_name" {
  type = string
}

variable "s3_bucket_arn" {
  type = string
}

variable "acm_certificate_arn" {
  type    = string
  default = ""
}

variable "waf_web_acl_arn" {
  type    = string
  default = ""
}
