# syntax=docker/dockerfile:1

FROM node:24-bookworm AS build
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci

COPY prisma ./prisma
RUN npx prisma generate

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# Keep prisma CLI available after prune for db push on start
RUN npm prune --omit=dev && npm install prisma@5.22.0 --omit=dev --no-save


FROM node:24-bookworm-slim AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV UPLOAD_DIR=/app/uploads

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    # sharp / canvas native deps used by pdf rendering
    libvips42 \
    && rm -rf /var/lib/apt/lists/*

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/package.json ./
COPY docker-entrypoint.sh ./docker-entrypoint.sh

# Strip Windows CRLF so entrypoint works when checked out on Windows
RUN sed -i 's/\r$//' ./docker-entrypoint.sh \
    && chmod +x ./docker-entrypoint.sh \
    && mkdir -p /app/uploads \
    && chown -R node:node /app

USER node
EXPOSE 4000
ENTRYPOINT ["./docker-entrypoint.sh"]
