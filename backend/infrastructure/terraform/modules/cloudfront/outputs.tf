output "cloudfront_domain_name" {
  value = aws_cloudfront_distribution.media_cdn.domain_name
}

output "cloudfront_id" {
  value = aws_cloudfront_distribution.media_cdn.id
}

output "cloudfront_arn" {
  value = aws_cloudfront_distribution.media_cdn.arn
}
