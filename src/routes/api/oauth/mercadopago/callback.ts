import { createFileRoute } from "@tanstack/react-router";
import { exchangeCodeForToken, verifyState } from "@/lib/payments/mercado-pago-oauth.server";

export const Route = createFileRoute("/api/oauth/mercadopago/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state");
        const error = url.searchParams.get("error");

        if (error) return html(`<h1>Mercado Pago recusou a autorização</h1><p>${error}</p>`);
        if (!code || !state) return html("<h1>Parâmetros ausentes</h1>");

        const parsed = verifyState(state);
        if (!parsed) return html("<h1>State inválido ou expirado</h1>");

        try {
          const redirectUri = `${url.origin}/api/oauth/mercadopago/callback`;
          const tok = await exchangeCodeForToken(code, redirectUri);

          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

          const expiresAt = new Date(Date.now() + (tok.expires_in - 60) * 1000).toISOString();

          // Upsert payment_accounts
          const { data: acct, error: upErr } = await supabaseAdmin
            .from("payment_accounts" as any)
            .upsert({
              user_id: parsed.uid,
              provider: "mercado_pago",
              external_user_id: String(tok.user_id),
              access_token: tok.access_token,
              refresh_token: tok.refresh_token ?? null,
              public_key: tok.public_key ?? null,
              expires_at: expiresAt,
              scope: tok.scope,
              is_active: true,
              account_label: `MP #${tok.user_id}${tok.live_mode === false ? " (sandbox)" : ""}`,
              raw: tok as any,
            }, { onConflict: "user_id,provider,external_user_id" })
            .select("id")
            .single();

          if (upErr || !acct) throw new Error(upErr?.message ?? "Falha ao salvar conta");

          // Vincula ao grupo via payment_provider_configs
          await supabaseAdmin
            .from("payment_provider_configs")
            .upsert({
              group_id: parsed.gid,
              provider: "mercado_pago",
              is_active: true,
              payment_account_id: (acct as any).id,
              config: {},
            } as any, { onConflict: "group_id,provider" });

          // Redireciona pra súmula com flag de sucesso
          return new Response(null, {
            status: 302,
            headers: { Location: `/grupos/${parsed.gid}?mp_connected=1` },
          });
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          console.error("[MP OAuth callback]", msg);
          return html(`<h1>Falha ao conectar Mercado Pago</h1><pre>${escapeHtml(msg)}</pre><p><a href="/grupos/${parsed.gid}">Voltar</a></p>`);
        }
      },
    },
  },
});

function html(body: string) {
  return new Response(`<!doctype html><meta charset="utf-8"><title>Mercado Pago</title><body style="font-family:system-ui;padding:2rem">${body}</body>`, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
}