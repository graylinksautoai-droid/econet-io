# Backend Dockerfile
#
# BUILD CONTEXT: repo root  (render.yaml: dockerContext: .)
#
# Why the build context must be the repo root:
#   server/ imports from two repo-root directories at runtime:
#     /app/infrastructure/  (CanonicalMongoConnection, EventBus, IdempotencyManager)
#     /app/engines/         (MissionEngine, CommunityEngine, AuditEngine, ...)
#   These are outside server/ and must be present in the container.
#
# Why we run npm ci twice:
#   1. At /app       — installs root package.json deps (mongoose etc.) into
#                      /app/node_modules so Node can resolve them when
#                      /app/infrastructure/* and /app/engines/* import 'mongoose'.
#   2. At /app/server — installs the Express server's own production deps.

FROM node:22-alpine

# Build tools required by native addons (bcrypt uses node-gyp).
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    && ln -sf python3 /usr/bin/python

WORKDIR /app

# Copy full repo into /app (node_modules, .env*, .git, dist excluded by
# the root .dockerignore).
COPY . .

# ── Step 1: install root-level deps ──────────────────────────────────────────
# The repo root package.json lists mongoose (and other packages) that are
# imported by /app/infrastructure/ and /app/engines/ at runtime.
# Node resolves bare specifiers by walking up from the importing file, so
# mongoose imported from /app/infrastructure/persistence/CanonicalMongoConnection.js
# needs to be in /app/node_modules/ — not only in /app/server/node_modules/.
RUN npm ci --omit=dev

# ── Step 2: install server deps ───────────────────────────────────────────────
WORKDIR /app/server
RUN npm ci --omit=dev

# Create uploads directory so multer has a place to write files.
RUN mkdir -p uploads

EXPOSE 5000

HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD wget -qO- http://localhost:${PORT:-5000}/ || exit 1

# WORKDIR is /app/server; node index.js resolves to /app/server/index.js
CMD ["node", "index.js"]
