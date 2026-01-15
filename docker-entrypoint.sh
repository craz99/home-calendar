#!/bin/sh

set -e

echo "=== Home Calendar Docker Container ==="
echo "Environment: $NODE_ENV"
echo "Port: $PORT"

# Validate required environment variables
if [ -z "$OPENWEATHER_API_KEY" ]; then
  echo "WARNING: OPENWEATHER_API_KEY not set. Weather features will not work."
  echo "Please set OPENWEATHER_API_KEY environment variable."
fi

# Check if public-config.json exists
if [ ! -f "/app/public-config.json" ]; then
  echo "ERROR: public-config.json not found!"
  echo "Please mount public-config.json to /app/public-config.json"
  exit 1
fi

# Ensure cache directory exists and is writable
if [ ! -d "/app/cache" ]; then
  mkdir -p /app/cache
fi

# Set cache permissions if running as non-root
if [ -w "/app/cache" ]; then
  echo "Cache directory ready: /app/cache"
else
  echo "WARNING: Cache directory may not be writable"
fi

echo "Starting Home Calendar application..."
echo ""

# Execute the main command using exec to replace shell process
# This ensures signals (SIGTERM, SIGINT) are properly forwarded to Node.js
exec "$@"
