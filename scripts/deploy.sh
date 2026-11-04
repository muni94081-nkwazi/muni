#!/bin/bash
# Docker build and deploy script
# 1. Build all Docker images
# 2. Tag with git commit hash
# 3. Push to registry (configurable via DOCKER_REGISTRY env var)
# 4. Apply kubectl deployments

REGISTRY=${DOCKER_REGISTRY:-registry.example.com/muni}
TAG=$(git rev-parse --short HEAD)

for service in api-gateway auth-service product-service order-service user-service payment-service shipping-service notification-service recommendation-service analytics-service; do
  echo "Building $service..."
  docker build -t $REGISTRY/$service:$TAG backend/services/$service
  docker tag $REGISTRY/$service:$TAG $REGISTRY/$service:latest
  echo "Pushing $service..."
  docker push $REGISTRY/$service:$TAG
  docker push $REGISTRY/$service:latest
done

echo "Applying Kubernetes deployments..."
kubectl apply -f backend/infrastructure/kubernetes/deployments/
kubectl apply -f backend/infrastructure/kubernetes/services/
kubectl apply -f backend/infrastructure/kubernetes/ingress/
