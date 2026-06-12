// Camada de abstração de pagamento — todo o app conversa apenas com esta interface.
// Trocar de gateway = trocar a implementação, sem mexer no resto do código.

export type ProviderId = "pix_manual" | "asaas" | "mercado_pago" | "stripe" | "infinitepay";

export interface CreateChargeInput {
  amount: number;
  description: string;
  dueDate: string; // ISO date
  payerName: string;
  payerEmail?: string;
  payerPhone?: string;
  externalId: string; // our charge id
}

export interface CreateChargeResult {
  providerChargeId: string;
  paymentLink?: string;
  pixCopyPaste?: string;
  qrCodeBase64?: string;
}

export type ChargeStatus = "pendente" | "pago" | "vencido" | "cancelado";

export interface IPaymentProvider {
  id: ProviderId;
  createCharge(input: CreateChargeInput): Promise<CreateChargeResult>;
  getChargeStatus(providerChargeId: string): Promise<ChargeStatus>;
  cancelCharge(providerChargeId: string): Promise<void>;
  // webhookHandler implementado nos /api/public/webhooks/<provider>
}