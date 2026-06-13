import { createServerFn } from "@tanstack/react-start";

export type CheckoutMethod = "pix" | "card";

interface InfoInput { token: string }
interface CardInput {
  token: string;
  cardToken: string;
  paymentMethodId: string;
  installments: number;
  issuerId?: string;
  payerEmail: string;
  payerDocType?: string;
  payerDocNumber?: string;
}

async function loadChargeByToken(token: string) {
  if (!token || typeof token !== "string") throw new Error("token inválido");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("charges")
    .select("id,group_id,participant_id,description,amount,due_date,status,provider,provider_charge_id,pix_copy_paste,pix_qr_code,payment_link,payment_method,paid_at,public_token")
    .eq("public_token", token)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Cobrança não encontrada");
  return { supabaseAdmin, charge: data as any };
}

async function loadAccountForGroup(supabaseAdmin: any, groupId: string, provider: string) {
  const { data: ppc } = await supabaseAdmin
    .from("payment_provider_configs")
    .select("payment_account_id,is_active")
    .eq("group_id", groupId)
    .eq("provider", provider)
    .maybeSingle();
  if (!ppc?.payment_account_id || !ppc.is_active) return null;
  const { data: acct } = await supabaseAdmin
    .from("payment_accounts")
    .select("id,access_token,public_key,is_active")
    .eq("id", ppc.payment_account_id)
    .maybeSingle();
  if (!acct || !acct.is_active) return null;
  return acct as { id: string; access_token: string; public_key: string | null };
}

export const getCheckoutInfo = createServerFn({ method: "POST" })
  .inputValidator((data: InfoInput) => ({ token: String(data?.token ?? "") }))
  .handler(async ({ data }) => {
    const { supabaseAdmin, charge } = await loadChargeByToken(data.token);

    // Provider efetivo: usa charges.provider (snapshot) ou cai pra config do grupo
    let provider: string = charge.provider || "pix_manual";
    let publicKey: string | null = null;
    let methods: CheckoutMethod[] = ["pix"];

    if (provider === "mercado_pago" || provider === "stripe") {
      const acct = await loadAccountForGroup(supabaseAdmin, charge.group_id, provider);
      if (acct) {
        publicKey = acct.public_key;
        methods = publicKey ? ["pix", "card"] : ["pix"];
      } else {
        // Conta foi desconectada — só Pix manual seria possível, mas sem dados.
        methods = ["pix"];
      }
    }

    return {
      charge: {
        id: charge.id,
        description: charge.description,
        amount: Number(charge.amount),
        due_date: charge.due_date,
        status: charge.status,
        pix_copy_paste: charge.pix_copy_paste,
        pix_qr_code: charge.pix_qr_code,
        payment_link: charge.payment_link,
        payment_method: charge.payment_method,
        paid_at: charge.paid_at,
      },
      provider,
      methods,
      publicKey,
    };
  });

export const payWithCard = createServerFn({ method: "POST" })
  .inputValidator((data: CardInput) => {
    const out = {
      token: String(data?.token ?? ""),
      cardToken: String(data?.cardToken ?? ""),
      paymentMethodId: String(data?.paymentMethodId ?? ""),
      installments: Math.max(1, Math.min(12, Number(data?.installments ?? 1))),
      issuerId: data?.issuerId ? String(data.issuerId) : undefined,
      payerEmail: String(data?.payerEmail ?? "").trim(),
      payerDocType: data?.payerDocType ? String(data.payerDocType) : undefined,
      payerDocNumber: data?.payerDocNumber ? String(data.payerDocNumber).replace(/\D/g, "") : undefined,
    };
    if (!out.token) throw new Error("token obrigatório");
    if (!out.cardToken) throw new Error("cardToken obrigatório");
    if (!out.paymentMethodId) throw new Error("paymentMethodId obrigatório");
    if (!/^\S+@\S+\.\S+$/.test(out.payerEmail)) throw new Error("Email do pagador inválido");
    return out;
  })
  .handler(async ({ data }) => {
    const { supabaseAdmin, charge } = await loadChargeByToken(data.token);
    if (charge.status === "pago") return { status: "pago" };
    if (charge.status === "cancelado") throw new Error("Cobrança cancelada");
    if (charge.provider !== "mercado_pago") {
      throw new Error("Pagamento com cartão indisponível para este organizador");
    }
    const acct = await loadAccountForGroup(supabaseAdmin, charge.group_id, "mercado_pago");
    if (!acct) throw new Error("Conta do organizador não encontrada");

    const { mpCreateCardPayment, mapMpStatus } = await import("./mercado-pago.server");
    const result = await mpCreateCardPayment({
      accessToken: acct.access_token,
      amount: Number(charge.amount),
      description: charge.description,
      externalId: charge.id,
      cardToken: data.cardToken,
      installments: data.installments,
      paymentMethodId: data.paymentMethodId,
      issuerId: data.issuerId,
      payerEmail: data.payerEmail,
      payerDocType: data.payerDocType,
      payerDocNumber: data.payerDocNumber,
    });

    const localStatus = mapMpStatus(result.status);
    await supabaseAdmin
      .from("charges")
      .update({
        provider_charge_id: result.providerChargeId,
        payment_method: "card",
        installments: data.installments,
        card_brand: result.cardBrand ?? null,
        card_last4: result.cardLast4 ?? null,
        status: localStatus,
        paid_at: localStatus === "pago" ? new Date().toISOString() : null,
      })
      .eq("id", charge.id);

    return {
      status: localStatus,
      mpStatus: result.status,
      statusDetail: result.statusDetail ?? null,
    };
  });
