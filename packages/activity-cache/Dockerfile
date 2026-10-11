# Build from the repo root:
#   docker build -f packages/activity-cache/Dockerfile -t activity-cache .
#
# SQLite is Node's built-in `node:sqlite` (via @effect/sql-sqlite-node), so
# there's no native module to compile. Node runs the TypeScript source
# directly; only @repo/atproto-client needs building.

FROM node:26-alpine AS base
ARG PNPM_VERSION=12.4.1
ENV PNPM_HOME=/pnpm \
    TURBO_TELEMETRY_DISABLED=1
ENV PATH="$PNPM_HOME:$PATH"
RUN npm install -g pnpm@$PNPM_VERSION
WORKDIR /app

# ---
# A partial monorepo with only activity-cache and its workspace dependencies,
# and a lockfile pruned to match, so unrelated changes don't bust the cache.
FROM base AS prepare
RUN apk add --no-cache curl
ARG TURBO_VERSION=2.11.7
RUN set -eu; \
    case "$(uname -m)" in \
      x86_64) target=x86_64-unknown-linux-musl ;; \
      aarch64) target=aarch64-unknown-linux-musl ;; \
      *) echo 'Unsupported architecture' >&2; exit 1 ;; \
    esac; \
    archive="turbo-$TURBO_VERSION-$target.tar.gz"; \
    release="https://github.com/vercel/turborepo/releases/download/v$TURBO_VERSION"; \
    cd /tmp; \
    curl -fsSL "$release/SHA256SUMS" -o SHA256SUMS; \
    curl -fsSL "$release/$archive" -o "$archive"; \
    awk -v name="$archive" '$2 == name && NF == 2 { print }' SHA256SUMS > turbo-checksum; \
    [ "$(wc -l < turbo-checksum)" -eq 1 ]; \
    sha256sum -c turbo-checksum; \
    [ "$(tar -tzf "$archive")" = turbo ]; \
    tar -xzf "$archive" -C /usr/local/bin turbo; \
    chmod 755 /usr/local/bin/turbo; \
    rm SHA256SUMS turbo-checksum "$archive"
COPY . .
RUN turbo prune @repo/activity-cache --docker

# ---
FROM base AS builder
COPY --from=prepare /app/out/json/ .
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile
COPY --from=prepare /app/out/full/ .
RUN pnpm turbo run build --filter=@repo/activity-cache...

# ---
# Production dependencies only, without the build tooling.
FROM base AS deps
COPY --from=prepare /app/out/json/ .
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --prod \
      --config.public-hoist-pattern=@atproto/lex \
      --config.public-hoist-pattern=effect

# ---
FROM node:26-alpine AS runner
ENV NODE_ENV=production \
    PORT=3001 \
    DATABASE_PATH=/data/activity.db
WORKDIR /app
COPY --from=deps /app/ .
COPY --from=builder /app/packages/atproto-client/src packages/atproto-client/src
COPY --from=builder /app/packages/activity-cache/src packages/activity-cache/src
# The database is disposable but durable across restarts, so keep it on a volume.
RUN mkdir /data && chown node:node /data
VOLUME /data
USER node
WORKDIR /app/packages/activity-cache
EXPOSE 3001
CMD ["node", "src/main.ts"]
