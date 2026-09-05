FROM node:20-bookworm-slim AS build
WORKDIR /app
COPY package.json tsconfig.json ./
RUN npm install
COPY src ./src
RUN npm run build

FROM node:20-bookworm-slim

# git + docker-ce-cli + docker-buildx-plugin (no dockerd - buildx talks to a
# remote BuildKit daemon over TCP) + the devcontainers CLI itself.
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl git gnupg \
    && install -m 0755 -d /etc/apt/keyrings \
    && curl -fsSL https://download.docker.com/linux/debian/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg \
    && chmod a+r /etc/apt/keyrings/docker.gpg \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/debian $(. /etc/os-release && echo "$VERSION_CODENAME") stable" > /etc/apt/sources.list.d/docker.list \
    && apt-get update \
    && apt-get install -y --no-install-recommends docker-ce-cli docker-buildx-plugin \
    && npm install -g @devcontainers/cli \
    && apt-get purge -y gnupg \
    && apt-get autoremove -y \
    && rm -rf /var/lib/apt/lists/*

RUN useradd --create-home --uid 1000 builder
USER builder
WORKDIR /home/builder/app

COPY --from=build --chown=builder:builder /app/dist ./dist
COPY --from=build --chown=builder:builder /app/node_modules ./node_modules
COPY --from=build --chown=builder:builder /app/package.json ./package.json

ENV PORT=8080
EXPOSE 8080

CMD ["node", "dist/server.js"]
