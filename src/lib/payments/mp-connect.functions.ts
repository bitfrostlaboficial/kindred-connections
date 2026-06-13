import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

interface ConnectInput {
  groupId: string;
  accessToken: string;
  publicKey?: string;
}

export const connectMercadoPagoManual = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: ConnectInput) => {
    if (!data?.groupId) throw new Error("groupId obrigatório");
    if (!data?.accessToken || data.accessToken.trim().length < 20) {
      throw new Error("Access Token inválido");
    }
    return {
      groupId: data.groupId,
      accessToken: data.accessToken.trim(),
      publicKey: data.publicKey?.trim() || undefined,
    };
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // 1. Confirma que o usuário é membro do grupo (RLS já filtra, mas validamos explicitamente)
    const { data: gm, error: gmErr } = await supabase
      .from("group_members")
      .select("user_id")
      .eq("group_id", data.groupId)
      .eq("user_id", userId)
      .maybeSingle();
    if (gmErr) throw new Error(gmErr.message);
    if (!gm) throw new Error("Você não é membro deste grupo");

    // 2. Valida o token chamando /users/me
    const meRes = await fetch("https://api.mercadopago.com/users/me", {
      headers: { Authorization: `Bearer ${data.accessToken}` },
    });
    const meJson: any = await meRes.json().catch(() => ({}));
    if (!meRes.ok) {
      throw new Error(
        `Mercado Pago rejeitou o token (${meRes.status}): ${meJson?.message ?? "verifique se é um Access Token válido"}`,
      );
    }
    const externalUserId = String(meJson.id ?? "");
    if (!externalUserId) throw new Error("Resposta do Mercado Pago sem user id");
    const label =
      meJson.nickname ||
      [meJson.first_name, meJson.last_name].filter(Boolean).join(" ") ||
      meJson.email ||
      `MP #${externalUserId}`;

    // 3. Upsert da conta (admin — bypassa RLS pra gravar token)
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: acct, error: upErr } = await supabaseAdmin
      .from("payment_accounts" as any)
      .upsert(
        {
          user_id: userId,
          provider: "mercado_pago",
          external_user_id: externalUserId,
          access_token: data.accessToken,
          public_key: data.publicKey ?? null,
          is_active: true,
          account_label: label,
          raw: { source: "manual", connected_at: new Date().toISOString() },
        } as any,
        { onConflict: "user_id,provider,external_user_id" },
      )
      .select("id")
      .single();
    if (upErr || !acct) throw new Error(upErr?.message ?? "Falha ao salvar conta MP");

    // 4. Vincula ao grupo
    const { error: ppcErr } = await supabaseAdmin
      .from("payment_provider_configs")
      .upsert(
        {
          group_id: data.groupId,
          provider: "mercado_pago",
          is_active: true,
          payment_account_id: (acct as any).id,
          config: {},
        } as any,
        { onConflict: "group_id,provider" },
      );
    if (ppcErr) throw new Error(ppcErr.message);

    return { ok: true, accountId: (acct as any).id, label };
  });
