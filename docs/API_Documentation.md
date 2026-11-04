# MUNI API Documentation

## Base URL
All API requests should be prefixed with `/api/v1` and sent to the API Gateway (`http://localhost:8080`).

## Authentication
Most endpoints require a Bearer token in the Authorization header:
`Authorization: Bearer <your_access_token>`

## Error Handling
Standard error response:
```json
{
  "message": "Error description here",
  "errors": {
    "field": "Specific validation error"
  }
}
```

## Auth Service
- `POST /api/v1/auth/register`: Register new user
- `POST /api/v1/auth/login`: Login user
- `POST /api/v1/auth/refresh`: Refresh token
- `POST /api/v1/auth/logout`: Logout
- `GET /api/v1/auth/profile`: Get user profile

## Product Service
- `GET /api/v1/products`: List products
- `GET /api/v1/products/:id`: Get product by ID
- `POST /api/v1/products`: Create product
- `PUT /api/v1/products/:id`: Update product
- `DELETE /api/v1/products/:id`: Delete product
- `GET /api/v1/products/categories`: Get product categories
- `GET /api/v1/products/:id/reviews`: Get product reviews

## Order Service
- `GET /api/v1/orders`: List orders
- `POST /api/v1/orders`: Create order
- `GET /api/v1/orders/:id`: Get order by ID
- `POST /api/v1/orders/:id/cancel`: Cancel order

## Payment Service
- `POST /api/v1/payments/initiate`: Initiate a payment
- `GET /api/v1/payments/:reference/status`: Check payment status
- `POST /api/v1/payments/:reference/refund`: Refund payment

## Shipping Service
- `GET /api/v1/shipping/rates`: Get shipping rates
- `POST /api/v1/shipping/shipments`: Create shipment
- `GET /api/v1/shipping/track/:trackingNumber`: Track shipment

## Notification Service
- `POST /api/v1/notifications/send`: Send notification
- `GET /api/v1/notifications/:userId`: Get user notifications
