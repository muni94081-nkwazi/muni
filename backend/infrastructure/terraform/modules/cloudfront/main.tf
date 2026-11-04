resource "aws_cloudfront_origin_access_control" "s3_oac" {
  name                              = "${var.project_name}-oac-${var.environment}"
  description                       = "OAC for ${var.project_name} media bucket"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

resource "aws_cloudfront_distribution" "media_cdn" {
  origin {
    domain_name              = var.s3_bucket_domain_name
    origin_id                = "S3-${var.project_name}-media-${var.environment}"
    origin_access_control_id = aws_cloudfront_origin_access_control.s3_oac.id
  }

  enabled             = true
  is_ipv6_enabled     = true
  price_class         = "PriceClass_All"
  web_acl_id          = var.waf_web_acl_arn != "" ? var.waf_web_acl_arn : null

  aliases = var.acm_certificate_arn != "" ? ["cdn.muni.ug"] : []

  default_cache_behavior {
    allowed_methods  = ["GET", "HEAD", "OPTIONS"]
    cached_methods   = ["GET", "HEAD"]
    target_origin_id = "S3-${var.project_name}-media-${var.environment}"

    forwarded_values {
      query_string = false

      cookies {
        forward = "none"
      }
    }

    viewer_protocol_policy = "redirect-to-https"
    min_ttl                = 0
    default_ttl            = 3600
    max_ttl                = 86400
  }

  dynamic "ordered_cache_behavior" {
    for_each = ["/images/*", "/videos/*", "/documents/*"]
    content {
      path_pattern     = ordered_cache_behavior.value
      allowed_methods  = ["GET", "HEAD", "OPTIONS"]
      cached_methods   = ["GET", "HEAD"]
      target_origin_id = "S3-${var.project_name}-media-${var.environment}"

      forwarded_values {
        query_string = false
        cookies {
          forward = "none"
        }
      }

      viewer_protocol_policy = "redirect-to-https"
      min_ttl                = 0
      default_ttl            = 86400
      max_ttl                = 31536000
    }
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    acm_certificate_arn            = var.acm_certificate_arn
    ssl_support_method             = "sni-only"
    minimum_protocol_version       = "TLSv1.2_2021"
    cloudfront_default_certificate = var.acm_certificate_arn == "" ? true : false
  }

  custom_error_response {
    error_code            = 403
    response_code         = 404
    response_page_path    = "/404.html"
    error_caching_min_ttl = 300
  }
}
