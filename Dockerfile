# ── Stage 1: build the React frontend ──────────────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build


# ── Stage 2: production image ───────────────────────────────────────────────
FROM node:22-alpine AS production

WORKDIR /app

# Install only production dependencies
COPY package*.json ./
RUN npm ci --omit=dev

# Copy built frontend and backend source
COPY --from=builder /app/dist ./dist
COPY src ./src
COPY shared ./shared

# SQLite database lives here; mount a volume to persist it
VOLUME ["/app/data"]

EXPOSE 3002

ENV NODE_ENV=production \
    PORT=3002 \
    DB_PATH=/app/data/big10survivor.db

CMD ["node", "src/index.js"]
