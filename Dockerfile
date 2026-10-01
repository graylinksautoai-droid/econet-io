# ── Stage 1: build the Vite frontend ─────────────────────────────────────────
# Use an explicit Node 20 LTS patch that satisfies engines: >=20.19.0.
# node:20-alpine without a patch tag can resolve to an older minor on some
# registries. Pinning to 20-alpine3.20 guarantees >=20.19.x on Node 20.
# Alternatively, node:22-alpine (Node 22 LTS) is also >=20.19.0-compatible.
FROM node:22-alpine AS frontend

WORKDIR /app

# Copy the root-level package files only (not the server/ sub-package).
COPY package.json package-lock.json ./

# Install ALL dependencies — including devDependencies (Vite, Tailwind, etc.)
# --include=dev is explicit and not affected by NODE_ENV at all.
# npm ci ensures the lockfile is honoured exactly.
RUN npm ci --include=dev

# Copy the rest of the source tree (node_modules excluded via .dockerignore).
COPY . .

# Build the Vite frontend. Produces /app/dist.
RUN npm run build

# ── Stage 2: serve the built assets with nginx ────────────────────────────────
FROM nginx:stable-alpine

# Copy built static files into the nginx document root.
COPY --from=frontend /app/dist /usr/share/nginx/html

# Copy the project nginx configuration (SPA routing + API proxy).
COPY nginx.conf /etc/nginx/nginx.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
