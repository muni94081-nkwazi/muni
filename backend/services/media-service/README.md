# Media Service

Image and file upload, resizing, WebP conversion, CDN delivery.

## Ports
4018

## Storage
- Local storage for development
- AWS S3 + CloudFront for production

## Kafka
- Topic: `media-events` (Events: `media.uploaded`, `media.deleted`)
