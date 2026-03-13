import { env } from "./env.js";

/**
 * Record a paid API call to the gateway stats.
 * Fires-and-forgets; logs errors instead of swallowing them.
 */
export function recordCall(agentName: string, service: string, price: number) {
  fetch(`${env.GATEWAY_URL}/stats/record`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ agent: agentName, service, price }),
  }).catch((e: any) => {
    console.warn(`[${agentName}] Failed to record call: ${e.message}`);
  });
}

/**
 * Simple request logger middleware.
 * Returns a standard (req, res, next) function compatible with app.use().
 */
export function requestLogger(agentName: string): (req: any, res: any, next: any) => void {
  return (req: any, res: any, next: any) => {
    const start = Date.now();
    res.on("finish", () => {
      const ms = Date.now() - start;
      const status = res.statusCode;
      // Skip health checks to reduce noise
      if (req.path === "/health") return;
      console.log(`[${agentName}] ${req.method} ${req.path} → ${status} (${ms}ms)`);
    });
    next();
  };
}

/**
 * Graceful shutdown handler.
 * Call with the http.Server instance returned by app.listen().
 */
export function setupGracefulShutdown(server: any, agentName: string) {
  const shutdown = () => {
    console.log(`\n[${agentName}] Shutting down gracefully...`);
    server.close(() => {
      console.log(`[${agentName}] Closed.`);
      process.exit(0);
    });
    // Force exit after 5s
    setTimeout(() => process.exit(1), 5000);
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}
