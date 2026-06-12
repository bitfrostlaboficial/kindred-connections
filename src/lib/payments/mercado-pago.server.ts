// Server-only Mercado Pago client. Never import this from client code.

export interface MPCreatePixInput {
  accessToken: string;
  amount: number;
  description: string;
  externalId: string; // charges.id — used as idempotency key + external_reference
  payerName: string;
  payerEmail?: string;
  dueDateISO?: string; // ISO datetime — Pix expiration
}

export interface MPCreatePixResult {
  providerChargeId: string;
  status: string;
  qrCode: string; // pix copy-paste
  qrCodeBase64: string; // raw base64 image (no data: prefix)
  ticketUrl?: string;
}

const MP_API = "https://api.mercadopago.com";

export async function mpCreatePixPayment(input: MPCreatePixInput): Promise<MPCreatePixResult> {
  const token = input.accessToken;
  if (!token) throw new Error("Access token do Mercado Pago ausente");

  const [firstName, ...rest] = (input.payerName || "Jogador").trim().split(/\s+/);
  const lastName = rest.join(" ") || "Peladeiro";

  const body: Record<string, unknown> = {
    transaction_amount: Number(input.amount.toFixed(2)),
    description: input.description,
    payment_method_id: "pix",
    external_reference: input.externalId,
    payer: {
      email: input.payerEmail || `jogador-${input.externalId.slice(0, 8)}@peladeiro.app`,
      first_name: firstName,
      last_name: lastName,
    },
  };
  if (input.dueDateISO) body.date_of_expiration = input.dueDateISO;

  console.log("[MP] CHARGE_CREATE_START", { externalId: input.externalId, amount: input.amount });

  const res = await fetch(`${MP_API}/v1/payments`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      "X-Idempotency-Key": input.externalId,
    },
    body: JSON.stringify(body),
  });

  const json: any = await res.json().catch(() => ({}));
  console.log("[MP] MERCADOPAGO_RESPONSE", { status: res.status, id: json?.id, mpStatus: json?.status });

  if (!res.ok) {
    console.error("[MP] CHARGE_CREATE_ERROR", json);
    const msg = json?.message || json?.error || `Mercado Pago HTTP ${res.status}`;
    throw new Error(typeof msg === "string" ? msg : JSON.stringify(msg));
  }

  const td = json?.point_of_interaction?.transaction_data ?? {};
  const result: MPCreatePixResult = {
    providerChargeId: String(json.id),
    status: String(json.status ?? "pending"),
    qrCode: String(td.qr_code ?? ""),
    qrCodeBase64: String(td.qr_code_base64 ?? ""),
    ticketUrl: td.ticket_url ? String(td.ticket_url) : undefined,
  };
  console.log("[MP] CHARGE_CREATE_SUCCESS", { providerChargeId: result.providerChargeId });
  return result;
}

export async function mpGetPayment(accessToken: string, providerChargeId: string): Promise<{ status: string; raw: any }> {
  const token = accessToken;
  if (!token) throw new Error("Access token do Mercado Pago ausente");
  const res = await fetch(`${MP_API}/v1/payments/${providerChargeId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const json: any = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.message || `MP HTTP ${res.status}`);
  return { status: String(json.status ?? "pending"), raw: json };
}

export function mapMpStatus(mpStatus: string): "pendente" | "pago" | "cancelado" | "vencido" {
  switch (mpStatus) {
    case "approved":
      return "pago";
    case "cancelled":
    case "refunded":
    case "charged_back":
      return "cancelado";
    case "rejected":
      return "cancelado";
    default:
      return "pendente";
  }
}