output "media_bucket_name" {
  value = aws_s3_bucket.media.id
}

output "media_bucket_arn" {
  value = aws_s3_bucket.media.arn
}

output "log_bucket_name" {
  value = aws_s3_bucket.logs.id
}

output "media_bucket_regional_domain_name" {
  value = aws_s3_bucket.media.bucket_regional_domain_name
}
