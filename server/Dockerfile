# Backend Dockerfile
# Use the same Node major as the frontend build to avoid engine mismatch.
FROM node:22-alpine

WORKDIR /app

# Build tools required by native addons (bcrypt uses node-gyp).
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    && ln -sf python3 /usr/bin/python

# Copy server package files.
COPY package*.json ./

# Install production dependencies only.
# --omit=dev is the current npm equivalent of the deprecated --only=production.
RUN npm ci --omit=dev

# Copy server source code.
COPY . .

# Create uploads directory so multer has a place to write files.
RUN mkdir -p uploads

EXPOSE 5000

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://localhost:5000/ || exit 1

CMD ["node", "index.js"]
