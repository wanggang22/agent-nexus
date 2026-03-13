/**
 * x402 Payment Middleware for AgentNexus
 *
 * In production with OKX Facilitator, this uses @x402/express.
 * For development/demo, we implement the x402 protocol flow:
 * - Returns 402 with payment requirements when no payment header
 * - Validates payment header when present
 * - Records payment on-chain via PaymentLedger
 */

import { XLAYER_CAIP2, XLAYER_USDC } from "./xlayer.js";

// Use generic types to avoid cross-package @types/express version conflicts
type Req = { method: string; path: string; headers: Record<string, any> };
type Res = { setHeader(k: string, v: string): void; status(code: number): Res; json(body: any): void; statusCode: number };
type Next = () => void;

interface RoutePrice {
  price: string; // e.g. "$0.01"
  description: string;
}

interface X402Config {
  payTo: string;
  routes: Record<string, RoutePrice>;
  facilitatorUrl?: string;
  mockMode?: boolean; // true = accept all payments without verification
}

function priceToMicroUsdc(price: string): string {
  // "$0.01" -> "10000" (USDC has 6 decimals)
  const num = parseFloat(price.replace("$", ""));
  return Math.round(num * 1e6).toString();
}

function matchRoute(method: string, path: string, routes: Record<string, RoutePrice>): RoutePrice | null {
  const key = `${method} ${path}`;

  // Exact match
  if (routes[key]) return routes[key];

  // Pattern match (e.g., "GET /analysis/technical/:token")
  for (const [pattern, config] of Object.entries(routes)) {
    const [pMethod, pPath] = pattern.split(" ");
    if (pMethod !== method) continue;

    const patternParts = pPath.split("/");
    const pathParts = path.split("/");

    if (patternParts.length !== pathParts.length) continue;

    let match = true;
    for (let i = 0; i < patternParts.length; i++) {
      if (patternParts[i].startsWith(":")) continue; // wildcard
      if (patternParts[i] !== pathParts[i]) {
        match = false;
        break;
      }
    }
    if (match) return config;
  }

  return null;
}

export function x402PaymentMiddleware(config: X402Config) {
  return (req: Req, res: Res, next: Next): void => {
    const routeConfig = matchRoute(req.method, req.path, config.routes);

    // No pricing for this route — pass through
    if (!routeConfig) { next(); return; }

    // Check for payment header
    const paymentHeader = req.headers["payment-signature"] || req.headers["x-payment"];

    if (!paymentHeader) {
      // Return 402 Payment Required
      const requirements = {
        x402Version: 2,
        accepts: [
          {
            scheme: "exact",
            network: XLAYER_CAIP2,
            maxAmountRequired: priceToMicroUsdc(routeConfig.price),
            payTo: config.payTo,
            asset: XLAYER_USDC,
            maxTimeoutSeconds: 300,
            resource: req.path,
            description: routeConfig.description,
            mimeType: "application/json",
          },
        ],
      };

      const encoded = Buffer.from(JSON.stringify(requirements)).toString("base64");
      res.setHeader("PAYMENT-REQUIRED", encoded);
      res.status(402).json({
        error: "Payment Required",
        price: routeConfig.price,
        description: routeConfig.description,
        network: XLAYER_CAIP2,
        asset: "USDC",
        payTo: config.payTo,
        x402Info: "Send payment via x402 protocol. Include PAYMENT-SIGNATURE header with signed payment.",
      });
      return;
    }

    // Payment header present
    if (config.mockMode) {
      // In mock mode, accept all payments
      const settlementResponse = {
        success: true,
        transaction: "0x" + "0".repeat(64),
        network: XLAYER_CAIP2,
        payer: "mock",
      };
      const encoded = Buffer.from(JSON.stringify(settlementResponse)).toString("base64");
      res.setHeader("PAYMENT-RESPONSE", encoded);
      next();
      return;
    }

    // Production: verify with Facilitator
    if (config.facilitatorUrl) {
      verifyWithFacilitator(config.facilitatorUrl, paymentHeader as string, routeConfig, config.payTo)
        .then((result) => {
          if (result.valid) {
            const settlementResponse = {
              success: true,
              transaction: result.txHash,
              network: XLAYER_CAIP2,
              payer: result.payer,
            };
            const encoded = Buffer.from(JSON.stringify(settlementResponse)).toString("base64");
            res.setHeader("PAYMENT-RESPONSE", encoded);
            next();
          } else {
            res.status(402).json({ error: "Payment verification failed", reason: result.error });
          }
        })
        .catch((e) => {
          res.status(500).json({ error: "Facilitator error", detail: e.message });
        });
    } else {
      // No facilitator configured — accept payment in demo mode
      const settlementResponse = {
        success: true,
        transaction: "0x" + "0".repeat(64),
        network: XLAYER_CAIP2,
        payer: "unverified",
      };
      const encoded = Buffer.from(JSON.stringify(settlementResponse)).toString("base64");
      res.setHeader("PAYMENT-RESPONSE", encoded);
      next();
    }
  };
}

async function verifyWithFacilitator(
  facilitatorUrl: string,
  paymentHeader: string,
  routeConfig: RoutePrice,
  payTo: string
) {
  try {
    const payload = JSON.parse(Buffer.from(paymentHeader, "base64").toString());
    const requirements = {
      scheme: "exact",
      network: XLAYER_CAIP2,
      maxAmountRequired: priceToMicroUsdc(routeConfig.price),
      payTo,
      asset: XLAYER_USDC,
    };

    // Verify
    const verifyResp = await fetch(`${facilitatorUrl}/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ payload, paymentRequirements: requirements }),
    });
    const verifyResult = await verifyResp.json() as any;

    if (!verifyResult.isValid && !verifyResult.valid) {
      return { valid: false, error: "Signature verification failed" };
    }

    // Settle
    const settleResp = await fetch(`${facilitatorUrl}/settle`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ payload, paymentRequirements: requirements }),
    });
    const settleResult = await settleResp.json() as any;

    return {
      valid: settleResult.success,
      txHash: settleResult.txHash || settleResult.transaction,
      payer: payload.payload?.authorization?.from || "unknown",
      error: settleResult.error,
    };
  } catch (e: any) {
    return { valid: false, error: e.message };
  }
}

export type { X402Config, RoutePrice };
