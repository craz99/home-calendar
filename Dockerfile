# Build stage
FROM node:25-alpine AS builder

WORKDIR /app

# Copy root package files
COPY package*.json ./

# Install root dependencies with increased timeout for multi-arch builds
RUN npm ci --omit=dev --fetch-timeout=60000 --fetch-retry-mintimeout=20000 --fetch-retry-maxtimeout=120000

# Copy entire client directory
COPY client/ client/

# Install client dependencies and build with increased timeout for multi-arch builds
WORKDIR /app/client
RUN npm ci --fetch-timeout=60000 --fetch-retry-mintimeout=20000 --fetch-retry-maxtimeout=120000 && npm run build

# Production stage
FROM node:25-alpine

WORKDIR /app

# Copy node_modules from builder
COPY --from=builder /app/node_modules ./node_modules

# Copy application code
COPY package.json .
COPY server.js .
COPY services/ ./services/

# Copy public configuration template (user must provide their own public-config.json)
COPY public-config.template.json ./public-config.json

# Copy built client
COPY --from=builder /app/client/build ./client/build

# Create cache directory and set permissions
RUN mkdir -p cache && chown -R node:node /app

# Switch to non-root user for security
USER node

# Expose port (can be overridden via environment variable)
EXPOSE 5500

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:5500/api/config', (r) => r.statusCode === 200 ? process.exit(0) : process.exit(1)).on('error', () => process.exit(1))"

# Start the application
CMD ["node", "server.js"]
