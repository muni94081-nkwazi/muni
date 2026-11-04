resource "aws_s3_bucket" "logs" {
  bucket = "${var.project_name}-logs-${var.environment}"
}

resource "aws_s3_bucket_lifecycle_configuration" "logs" {
  bucket = aws_s3_bucket.logs.id

  rule {
    id     = "delete_after_90_days"
    status = "Enabled"

    expiration {
      days = 90
    }
  }
}

resource "aws_s3_bucket" "media" {
  bucket = "${var.project_name}-media-${var.environment}"
}

resource "aws_s3_bucket_versioning" "media" {
  bucket = aws_s3_bucket.media.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "media" {
  bucket = aws_s3_bucket.media.id

  rule {
    id     = "transition_to_ia_and_glacier"
    status = "Enabled"

    transition {
      days          = 90
      storage_class = "STANDARD_IA"
    }

    transition {
      days          = 365
      storage_class = "GLACIER"
    }
  }
}

resource "aws_s3_bucket_cors_configuration" "media" {
  bucket = aws_s3_bucket.media.id

  cors_rule {
    allowed_headers = ["*"]
    allowed_methods = ["GET"]
    allowed_origins = ["https://*.muni.ug", "https://muni.ug"]
    max_age_seconds = 3000
  }
}

resource "aws_s3_bucket_public_access_block" "media" {
  bucket = aws_s3_bucket.media.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_server_side_encryption_configuration" "media" {
  bucket = aws_s3_bucket.media.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_logging" "media" {
  bucket        = aws_s3_bucket.media.id
  target_bucket = aws_s3_bucket.logs.id
  target_prefix = "s3-media-logs/"
}

# State Bucket (only created in prod but configured to allow for one shared state bucket)
resource "aws_s3_bucket" "terraform_state" {
  count  = var.environment == "prod" ? 1 : 0
  bucket = "${var.project_name}-terraform-state"
}

resource "aws_s3_bucket_versioning" "terraform_state" {
  count  = var.environment == "prod" ? 1 : 0
  bucket = aws_s3_bucket.terraform_state[0].id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "terraform_state" {
  count  = var.environment == "prod" ? 1 : 0
  bucket = aws_s3_bucket.terraform_state[0].id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_dynamodb_table" "terraform_locks" {
  count        = var.environment == "prod" ? 1 : 0
  name         = "${var.project_name}-terraform-locks"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "LockID"

  attribute {
    name = "LockID"
    type = "S"
  }
}

resource "aws_s3_bucket_policy" "media_cloudfront_policy" {
  count  = var.cloudfront_oac_arn != "" ? 1 : 0
  bucket = aws_s3_bucket.media.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect    = "Allow"
        Principal = { Service = "cloudfront.amazonaws.com" }
        Action    = "s3:GetObject"
        Resource  = "${aws_s3_bucket.media.arn}/*"
        Condition = {
          StringEquals = {
            "AWS:SourceArn" = var.cloudfront_oac_arn
          }
        }
      }
    ]
  })
}
