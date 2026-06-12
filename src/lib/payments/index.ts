import type { IPaymentProvider, ProviderId } from "./types";
import { PixManualProvider } from "./pix-manual";

export type { IPaymentProvider, ProviderId, CreateChargeInput, CreateChargeResult, ChargeStatus } from "./types";

export interface ProviderConfig {
  provider: ProviderId;
  config: Record<string, unknown>;
}

/**
 * Factory — devolve a implementação do gateway baseado na config do grupo.
 * Novos gateways (Asaas, MercadoPago, Stripe, InfinitePay) entram aqui.
 */
export function getProvider(p: ProviderConfig): IPaymentProvider {
  switch (p.provider) {
    case "pix_manual":
      return new PixManualProvider({
        pixKey: String(p.config.pix_key ?? ""),
        recipientName: String(p.config.recipient_name ?? ""),
        city: p.config.city ? String(p.config.city) : undefined,
      });
    case "asaas":
    case "mercado_pago":
    case "stripe":
    case "infinitepay":
      throw new Error(`Gateway ${p.provider} ainda não configurado. Plugue a implementação no factory.`);
  }
}

export const PROVIDER_LABELS: Record<ProviderId, string> = {
  pix_manual: "Pix Manual",
  asaas: "Asaas",
  mercado_pago: "Mercado Pago",
  stripe: "Stripe",
  infinitepay: "InfinitePay",
};