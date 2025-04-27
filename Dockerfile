# Build stage
FROM node:20-slim AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY . .

# Build the application using tsc instead of vite
RUN npx tsc

# Production stage
FROM node:20-slim

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install production dependencies only
RUN npm ci --production

# Copy built files from builder stage
COPY --from=builder /app/dist ./dist

# Copy the tsconfig files (needed for module resolution)
COPY --from=builder /app/tsconfig*.json ./

# Expose the port the app runs on
EXPOSE 3000

# Start the application
CMD ["node", "--es-module-specifier-resolution=node", "dist/index.js"] 