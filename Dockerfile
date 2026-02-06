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
# basePath must be known at build time for correct asset URLs / routing.
# Default remains empty; VPS deploy can pass NEXT_BASE_PATH=/daa.
ARG NEXT_BASE_PATH=""
ENV NEXT_BASE_PATH=$NEXT_BASE_PATH

COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm build

FROM base AS runner
# Next.js runtime
ENV PORT=3000
# Keep runtime basePath aligned with build (mainly for clarity/debugging).
ENV NEXT_BASE_PATH=""
EXPOSE 3000

COPY --from=build /app/.next ./.next
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/next.config.js ./next.config.js

CMD ["node", "node_modules/next/dist/bin/next", "start", "-p", "3000"]
