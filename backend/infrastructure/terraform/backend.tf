terraform {
  backend "s3" {
    bucket         = "muni-terraform-state"
    key            = "platform/terraform.tfstate"
    region         = "af-south-1"
    dynamodb_table = "muni-terraform-locks"
    encrypt        = true
  }
}
