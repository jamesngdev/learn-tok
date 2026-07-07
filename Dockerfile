# DailyTok — single image used by both the web and crawler services.
FROM node:22-bookworm-slim

# Build tools for the better-sqlite3 native module.
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install dependencies first for better layer caching.
COPY package.json package-lock.json* ./
RUN npm ci

# Copy the source and build the Next.js production bundle.
COPY . .
RUN npm run build

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

# Overridden by the crawler service in docker-compose.
CMD ["npm", "start"]
