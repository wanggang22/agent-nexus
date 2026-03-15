FROM node:22-slim

# Install onchainos CLI (OKX on-chain data tool)
RUN apt-get update && apt-get install -y curl ca-certificates && \
    curl -sSL https://raw.githubusercontent.com/okx/onchainos-skills/main/install.sh | sh && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

ENV PATH="/root/.local/bin:${PATH}"

WORKDIR /app

# Install pnpm
RUN npm i -g pnpm@10

# Copy all workspace files
COPY . .

# Install deps and build all packages
RUN pnpm install --frozen-lockfile && pnpm -r build

# SERVICE env var determines which service to start
# Set in Railway per service: gateway, signal-agent, analyst-agent, risk-agent, trader-agent, dashboard
ENV SERVICE=gateway

# Start script reads SERVICE env var
CMD ["sh", "-c", "if [ \"$SERVICE\" = 'gateway' ]; then node packages/gateway/dist/index.js; elif [ \"$SERVICE\" = 'signal-agent' ]; then node packages/signal-agent/dist/server.js; elif [ \"$SERVICE\" = 'analyst-agent' ]; then node packages/analyst-agent/dist/server.js; elif [ \"$SERVICE\" = 'risk-agent' ]; then node packages/risk-agent/dist/server.js; elif [ \"$SERVICE\" = 'trader-agent' ]; then node packages/trader-agent/dist/server.js; elif [ \"$SERVICE\" = 'dashboard' ]; then cd packages/dashboard && npm start; else echo 'Unknown SERVICE: '$SERVICE; fi"]
