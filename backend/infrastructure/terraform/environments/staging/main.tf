terraform {
  required_version = ">= 1.5.0"
  required_providers {
    aws = { source = "hashicorp/aws", version = "~> 5.0" }
    random = { source = "hashicorp/random", version = "~> 3.0" }
  }
}

provider "aws" {
  region = var.aws_region
  default_tags {
    tags = {
      Project     = "muni"
      Environment = var.environment
      ManagedBy   = "terraform"
    }
  }
}

module "vpc" {
  source             = "../../modules/vpc"
  project_name       = "muni"
  environment        = var.environment
  vpc_cidr           = "10.0.0.0/16"
  availability_zones = ["af-south-1a", "af-south-1b", "af-south-1c"]
}

module "eks" {
  source          = "../../modules/eks"
  cluster_name    = "muni-cluster-${var.environment}"
  vpc_id          = module.vpc.vpc_id
  subnet_ids      = module.vpc.private_subnet_ids
  node_subnet_ids = module.vpc.private_subnet_ids
  environment     = var.environment
}

module "rds" {
  source                       = "../../modules/rds"
  project_name                 = "muni"
  environment                  = var.environment
  vpc_id                       = module.vpc.vpc_id
  database_subnet_ids          = module.vpc.database_subnet_ids
  eks_node_security_group_id   = module.eks.node_security_group_id
  db_name                      = "muni_db"
  db_username                  = "muni_admin"
}

module "elasticache" {
  source                       = "../../modules/elasticache"
  project_name                 = "muni"
  environment                  = var.environment
  vpc_id                       = module.vpc.vpc_id
  private_subnet_ids           = module.vpc.private_subnet_ids
  eks_node_security_group_id   = module.eks.node_security_group_id
}

module "msk" {
  source                       = "../../modules/msk"
  project_name                 = "muni"
  environment                  = var.environment
  vpc_id                       = module.vpc.vpc_id
  private_subnet_ids           = module.vpc.private_subnet_ids
  eks_node_security_group_id   = module.eks.node_security_group_id
  kafka_version                = "3.6.0"
  number_of_broker_nodes       = 3
}

module "s3" {
  source       = "../../modules/s3"
  project_name = "muni"
  environment  = var.environment
}

module "cloudfront" {
  source                   = "../../modules/cloudfront"
  project_name             = "muni"
  environment              = var.environment
  s3_bucket_domain_name    = module.s3.media_bucket_regional_domain_name
  s3_bucket_arn            = module.s3.media_bucket_arn
  acm_certificate_arn      = var.acm_certificate_arn
  waf_web_acl_arn          = ""
}

module "ecr" {
  source            = "../../modules/ecr"
  project_name      = "muni"
  environment       = var.environment
  eks_node_role_arn = module.eks.node_role_arn
}
