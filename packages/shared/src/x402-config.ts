import { XLAYER_CAIP2, XLAYER_USDC } from "./xlayer.js";

export interface ServicePricing {
  route: string;
  method: string;
  price: string;
  description: string;
  mimeType: string;
}

export function createPaymentConfig(payTo: string, services: ServicePricing[]) {
  const routes: Record<string, any> = {};

  for (const svc of services) {
    routes[`${svc.method} ${svc.route}`] = {
      accepts: [
        {
          scheme: "exact",
          price: svc.price,
          network: XLAYER_CAIP2,
          asset: XLAYER_USDC,
          payTo,
        },
      ],
      description: svc.description,
      mimeType: svc.mimeType,
    };
  }

  return routes;
}
