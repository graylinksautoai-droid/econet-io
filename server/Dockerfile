# Backend Dockerfile
#
# BUILD CONTEXT: repo root (not ./server)
# The server imports modules from repo-root directories:
#   ../../engines/      (canonical domain engines)
#   ../../infrastructure/ (persistence, messaging, idempotency)
# These live outside server/ so the Docker build context must be the repo
# root to make them available. The Dockerfile then installs and runs from
# the server/ subdirectory.
#
# render.yaml sets:
#   dockerfilePath: ./server/Dockerfile
#   dockerContext:  .                    ← repo root

FROM node:22-alpine

# Build tools required by native addons (bcrypt uses node-gyp).
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    && ln -sf python3 /usr/bin/python

WORKDIR /app

# Copy the entire repo so ../../engines/ and ../../infrastructure/ are
# accessible to the server at runtime.
# node_modules, .env*, .git, dist and test files are excluded by the root
# .dockerignore, so only source is copied.
COPY . .

# Install server production dependencies from the server/ sub-package.
WORKDIR /app/server
RUN npm ci --omit=dev

# Create uploads directory so multer has a place to write files.
RUN mkdir -p uploads

EXPOSE 5000

HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD wget -qO- http://localhost:${PORT:-5000}/ || exit 1

# node index.js reads process.env.PORT (injected by Render) || 5000
CMD ["node", "index.js"]
