FROM node:20-bookworm

# Install gnome-keyring and dbus for onchainos keyring support
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    gnome-keyring \
    dbus-x11 \
    libsecret-1-0 \
    libsecret-1-dev \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install onchainos
RUN curl -sSL https://raw.githubusercontent.com/okx/onchainos-skills/main/install.sh | sh
ENV PATH="/root/.local/bin:$PATH"

WORKDIR /app

# Copy monorepo root files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/shared ./packages/shared
COPY packages/gateway ./packages/gateway

# Install dependencies
RUN npm install -g pnpm && pnpm install --frozen-lockfile || pnpm install

# Build
RUN pnpm --filter shared build 2>/dev/null || true
RUN pnpm --filter gateway build

# Entrypoint: start dbus session, unlock keyring, then run gateway
COPY packages/gateway/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 4000
CMD ["/entrypoint.sh"]
