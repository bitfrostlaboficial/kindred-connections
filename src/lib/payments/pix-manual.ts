import type { IPaymentProvider, CreateChargeInput, CreateChargeResult } from "./types";
import { buildPixPayload } from "./pix-payload";

/**
 * Pix Manual — organizador informa chave e nome do recebedor.
 */
export class PixManualProvider implements IPaymentProvider {
  id = "pix_manual" as const;
  constructor(private cfg: { pixKey: string; recipientName: string; city?: string }) {}

  async createCharge(input: CreateChargeInput): Promise<CreateChargeResult> {
    const payload = buildPixPayload({
      key: this.cfg.pixKey,
      name: this.cfg.recipientName,
      city: this.cfg.city ?? "BRASIL",
      amount: input.amount,
      txid: input.externalId.replace(/-/g, "").slice(0, 25),
    });
    return {
      providerChargeId: `pix-manual-${input.externalId}`,
      pixCopyPaste: payload,
    };
  }

  async getChargeStatus() {
    return "pendente" as const;
  }

  async cancelCharge() {}
}
