#!/bin/bash

# Home Calendar Docker Deployment Helper
# Usage: ./docker-deploy.sh <target-host> <remote-user> <platform>
# Example: ./docker-deploy.sh 192.168.1.100 ubuntu arm64

set -e

if [ $# -lt 3 ]; then
  echo "Usage: $0 <target-host> <remote-user> <platform>"
  echo "Example: $0 192.168.1.100 ubuntu arm64"
  echo "Example: $0 192.168.1.100 ubuntu amd64"
  echo ""
  echo "Platform options: amd64, arm64"
  exit 1
fi

TARGET_HOST=$1
REMOTE_USER=$2
PLATFORM=$3
DEPLOYMENT_DIR="/opt/docker/home-calendar"
IMAGE_NAME="home-calendar:latest"
ARCHIVE="home-calendar.tar.gz"

echo "=================================="
echo "Home Calendar Docker Deployment"
echo "=================================="
echo "Target: $REMOTE_USER@$TARGET_HOST"
echo "Deployment directory: $DEPLOYMENT_DIR"
echo "Platform: $PLATFORM"
echo ""

# Step 1: Build image locally for specified platform
echo "Step 1/4: Building Docker image for $PLATFORM..."

# Set platform string for buildx
if [ "$PLATFORM" = "both" ]; then
  echo "ERROR: Multi-platform builds require pushing to a registry."
  echo "Specify either 'amd64' or 'arm64' to build for that platform locally."
  exit 1
elif [ "$PLATFORM" = "amd64" ]; then
  BUILD_PLATFORMS="linux/amd64"
  echo "Building for amd64..."
elif [ "$PLATFORM" = "arm64" ]; then
  BUILD_PLATFORMS="linux/arm64"
  echo "Building for arm64..."
else
  echo "ERROR: Invalid platform '$PLATFORM'. Use 'amd64' or 'arm64'"
  exit 1
fi

# Ensure buildx builder exists (for single-platform builds)
if ! docker buildx ls | grep -q "^home-calendar"; then
  echo "Creating docker buildx builder..."
  docker buildx create --name home-calendar --use
else
  docker buildx use home-calendar
fi

# Build with buildx (single platform can use --load)
docker buildx build --no-cache \
  --platform "$BUILD_PLATFORMS" \
  -t "$IMAGE_NAME" \
  --load \
  .

echo "✓ Image ready for $BUILD_PLATFORMS"
echo ""

# Step 2: Save image
echo "Step 2/4: Saving image to archive..."
docker save "$IMAGE_NAME" | gzip > "$ARCHIVE"
echo "✓ Saved to $ARCHIVE"
echo ""

# Step 3: Transfer image and required files to host
echo "Step 3/4: Transferring image and config files to host..."
scp "$ARCHIVE" "$REMOTE_USER@$TARGET_HOST:/tmp/"
scp docker-compose.yml "$REMOTE_USER@$TARGET_HOST:/tmp/"
scp .env.docker "$REMOTE_USER@$TARGET_HOST:/tmp/"
scp public-config.template.json "$REMOTE_USER@$TARGET_HOST:/tmp/"
echo "✓ Transferred"
echo ""

# Step 4: Load image and setup on remote host
echo "Step 4/4: Loading image and setting up on remote host..."
ssh "$REMOTE_USER@$TARGET_HOST" "
  # Load the image
  docker load < /tmp/$ARCHIVE && rm /tmp/$ARCHIVE
  echo '✓ Image loaded'

  # Create deployment directory if it doesn't exist
  mkdir -p $DEPLOYMENT_DIR
  cd $DEPLOYMENT_DIR

  # On first deployment, create files from templates
  # On re-deployment, preserve all user customizations
  if [ ! -f docker-compose.yml ]; then
    mv /tmp/docker-compose.yml ./
    echo '✓ Created docker-compose.yml'
  else
    # Save new version for reference in case user wants to manually merge
    mv /tmp/docker-compose.yml ./docker-compose.new.yml
    echo '✓ Kept existing docker-compose.yml (new version saved as docker-compose.new.yml)'
  fi

  if [ ! -f public-config.json ]; then
    mv /tmp/public-config.template.json ./public-config.json
    echo '✓ Created public-config.json'
  else
    # Update template reference
    mv /tmp/public-config.template.json ./
    echo '✓ Kept existing public-config.json (template updated)'
  fi

  if [ ! -f .env ]; then
    mv /tmp/.env.docker ./.env
    echo '✓ Created .env from template'
  else
    rm /tmp/.env.docker
    echo '✓ Kept existing .env'
  fi

  echo '✓ Setup complete - all user customizations preserved'
"
echo ""

# Cleanup local archive
rm "$ARCHIVE"

echo "=================================="
echo "Deployment Complete!"
echo "=================================="
echo ""
echo "Next steps on $TARGET_HOST:"
echo "  1. SSH to host: ssh $REMOTE_USER@$TARGET_HOST"
echo "  2. Edit configuration: cd $DEPLOYMENT_DIR"
echo "     nano .env                      # Add API keys, coordinates, etc."
echo "     nano public-config.json        # (optional) Add custom calendars"
echo "  3. Verify and start:"
echo "     docker compose up -d"
echo "     docker compose logs -f"
echo ""
echo "Then access: http://$TARGET_HOST:5500"
