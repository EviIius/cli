FROM node:22-bookworm-slim AS build
RUN npm install --global pnpm@11.9.0
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY packages ./packages
COPY services ./services
COPY apps ./apps
COPY scripts ./scripts
COPY infra/postgres ./infra/postgres
COPY config ./config
COPY evals ./evals
RUN pnpm install --frozen-lockfile
RUN pnpm build --filter=@relay/api --filter=@relay/web

FROM node:22-bookworm-slim
ENV NODE_ENV=production
RUN npm install --global pnpm@11.9.0
WORKDIR /app
COPY --from=build --chown=node:node /app /app
EXPOSE 4100
USER node
CMD ["sh", "scripts/start-hosted.sh"]
