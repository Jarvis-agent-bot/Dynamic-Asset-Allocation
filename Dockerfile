# DAA Next.js app (pnpm)
# - production image
# - uses Next build output

FROM node:20-alpine AS base
WORKDIR /app
ENV NODE_ENV=production

# Enable pnpm via corepack
RUN corepack enable

FROM base AS deps
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

FROM base AS build

COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm build

FROM base AS runner
# Next.js runtime
ENV PORT=3000
EXPOSE 3000

COPY --from=build /app/.next ./.next
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/next.config.js ./next.config.js
COPY --from=build /app/public ./public
# Standalone scripts (e.g. alpacaWsNewsDaemon.mjs) — reuse this image with a different CMD
# in the daa-ws-news service.
COPY --from=build /app/scripts ./scripts

CMD ["node", "node_modules/next/dist/bin/next", "start", "-p", "3000"]
