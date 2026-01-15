#!/bin/bash

# Home Calendar Docker Build Script
# This script builds the Docker image with appropriate tags

set -e

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
IMAGE_NAME="${1:-home-calendar}"
IMAGE_TAG="${2:-latest}"
FULL_IMAGE_NAME="${IMAGE_NAME}:${IMAGE_TAG}"

echo -e "${BLUE}=================================${NC}"
echo -e "${BLUE}Home Calendar Docker Build${NC}"
echo -e "${BLUE}=================================${NC}"
echo ""
echo "Image Name: $IMAGE_NAME"
echo "Image Tag:  $IMAGE_TAG"
echo "Full Name:  $FULL_IMAGE_NAME"
echo ""

# Check if Dockerfile exists
if [ ! -f "Dockerfile" ]; then
  echo "Error: Dockerfile not found in current directory"
  exit 1
fi

# Check if .dockerignore exists
if [ ! -f ".dockerignore" ]; then
  echo "Warning: .dockerignore not found, creating default..."
fi

# Check if buildx is available
if ! docker buildx version > /dev/null 2>&1; then
  echo "Error: docker buildx is not available. Please install Docker buildx."
  exit 1
fi

# Create/use a buildx builder if needed
if ! docker buildx ls | grep -q "^home-calendar"; then
  echo "Creating docker buildx builder..."
  docker buildx create --name home-calendar --use
else
  docker buildx use home-calendar
fi

# Get current platform
CURRENT_PLATFORM=$(docker info --format '{{.OSType}}/{{.Architecture}}')
echo -e "${BLUE}Building Docker image for current platform: $CURRENT_PLATFORM${NC}"

# Build for current platform
docker buildx build --no-cache \
  --platform "$CURRENT_PLATFORM" \
  -t "$FULL_IMAGE_NAME" \
  --load \
  .

echo ""
echo -e "${GREEN}✓ Build complete!${NC}"
echo ""
echo "You can now run the container with:"
echo "  docker run -p 5500:5500 --env-file .env $FULL_IMAGE_NAME"
echo ""
echo "Or with Docker Compose:"
echo "  docker-compose up -d"
echo ""

# Show image info
echo -e "${BLUE}Image Info:${NC}"
docker images | grep "$IMAGE_NAME"
