import type { IPaymentProvider, CreateChargeInput, CreateChargeResult } from "./types";

/**
 * Pix Manual — organizador informa chave e nome do recebedor.
 * Sistema gera o "copia-e-cola" no padrão BR Code (simplificado) e o
 * organizador confirma o pagamento manualmente no dashboard.
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
    return "pendente" as const; // confirmação é manual
  }

  async cancelCharge() {
    // nada a fazer remotamente
  }
}

// Monta um BR Code Pix estático (EMV) compatível com qualquer app bancário BR.
// re-exported from ./pix-payload
  key: string;
  name: string;
  city: string;
  amount: number;
  txid: string;
}) {
  const fmt = (id: string, value: string) =>
    `${id}${value.length.toString().padStart(2, "0")}${value}`;

  const mai = fmt("00", "br.gov.bcb.pix") + fmt("01", args.key);
  const merchantAccountInfo = fmt("26", mai);
  const merchantCategoryCode = fmt("52", "0000");
  const currency = fmt("53", "986");
  const amount = fmt("54", args.amount.toFixed(2));
  const country = fmt("58", "BR");
  const name = fmt("59", sanitize(args.name).slice(0, 25));
  const city = fmt("60", sanitize(args.city).slice(0, 15));
  const txid = fmt("62", fmt("05", args.txid || "***"));

  const payload =
    fmt("00", "01") +
    fmt("01", "11") +
    merchantAccountInfo +
    merchantCategoryCode +
    currency +
    amount +
    country +
    name +
    city +
    txid +
    "6304";
  return payload + crc16(payload);
}

function sanitize(s: string) {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
}

function crc16(payload: string) {
  let crc = 0xffff;
  for (let i = 0; i < payload.length; i++) {
    crc ^= payload.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      crc = crc & 0x8000 ? (crc << 1) ^ 0x1021 : crc << 1;
      crc &= 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}