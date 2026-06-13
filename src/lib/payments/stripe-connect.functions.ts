import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

interface ConnectInput {
  groupId: string;
  secretKey: string;
  publishableKey?: string;
  webhookSecret?: string;
}

export const connectStripeManual = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: ConnectInput) => {
    if (!data?.groupId) throw new Error("groupId obrigatório");
    const sk = data?.secretKey?.trim() ?? "";
    if (!/^sk_(test|live)_[A-Za-z0-9]{20,}$/.test(sk)) {
      throw new Error("Secret Key inválida — use sk_test_... ou sk_live_...");
    }
    const pk = data?.publishableKey?.trim() || undefined;
    if (pk && !/^pk_(test|live)_[A-Za-z0-9]{20,}$/.test(pk)) {
      throw new Error("Publishable Key inválida — use pk_test_... ou pk_live_...");
    }
    return {
      groupId: data.groupId,
      secretKey: sk,
      publishableKey: pk,
      webhookSecret: data.webhookSecret?.trim() || undefined,
    };
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // 1. Confirma que o usuário é membro do grupo
    const { data: gm, error: gmErr } = await supabase
      .from("group_members")
      .select("user_id")
      .eq("group_id", data.groupId)
      .eq("user_id", userId)
      .maybeSingle();
    if (gmErr) throw new Error(gmErr.message);
    if (!gm) throw new Error("Você não é membro deste grupo");

    // 2. Valida a Secret Key chamando GET /v1/account
    const acctRes = await fetch("https://api.stripe.com/v1/account", {
      headers: { Authorization: `Bearer ${data.secretKey}` },
    });
    const acctJson: any = await acctRes.json().catch(() => ({}));
    if (!acctRes.ok) {
      throw new Error(
        `Stripe rejeitou a chave (${acctRes.status}): ${acctJson?.error?.message ?? "verifique se a chave é válida"}`,
      );
    }
    const externalUserId = String(acctJson.id ?? "");
    if (!externalUserId) throw new Error("Resposta do Stripe sem account id");
    const label =
      acctJson.business_profile?.name ||
      acctJson.settings?.dashboard?.display_name ||
      acctJson.email ||
      `Stripe ${externalUserId}`;
    const mode = data.secretKey.startsWith("sk_test_") ? "sandbox" : "live";

    // 3. Upsert na payment_accounts (admin)
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: acct, error: upErr } = await supabaseAdmin
      .from("payment_accounts" as any)
      .upsert(
        {
          user_id: userId,
          provider: "stripe",
          external_user_id: externalUserId,
          access_token: data.secretKey,
          public_key: data.publishableKey ?? null,
          is_active: true,
          account_label: `${label}${mode === "sandbox" ? " (test)" : ""}`,
          raw: {
            source: "manual",
            mode,
            charges_enabled: acctJson.charges_enabled,
            payouts_enabled: acctJson.payouts_enabled,
            country: acctJson.country,
            default_currency: acctJson.default_currency,
            connected_at: new Date().toISOString(),
          },
        } as any,
        { onConflict: "user_id,provider,external_user_id" },
      )
      .select("id")
      .single();
    if (upErr || !acct) throw new Error(upErr?.message ?? "Falha ao salvar conta Stripe");

    // 4. Vincula ao grupo (config guarda webhook_secret quando informado)
    const { error: ppcErr } = await supabaseAdmin
      .from("payment_provider_configs")
      .upsert(
        {
          group_id: data.groupId,
          provider: "stripe",
          is_active: true,
          payment_account_id: (acct as any).id,
          config: data.webhookSecret ? { webhook_secret: data.webhookSecret } : {},
        } as any,
        { onConflict: "group_id,provider" },
      );
    if (ppcErr) throw new Error(ppcErr.message);

    return { ok: true, accountId: (acct as any).id, label, mode };
  });
