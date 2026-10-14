# The Workspace fake, published as ghcr.io/cyc-seattle/workspace-fake. This repo's tests start it in process instead.
FROM node:22-slim AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY tsconfig.build.json ./
COPY src ./src
RUN pnpm run build

# The fake needs only Node's built-ins, so no node_modules.
FROM node:22-slim
WORKDIR /app
COPY --from=build /app/package.json ./
COPY --from=build /app/dist/fake ./dist/fake
# A numeric uid, so Kubernetes can check runAsNonRoot. The fake writes no files.
USER 1000
ENV PORT=8080
EXPOSE 8080
CMD ["node", "dist/fake/main.js"]
