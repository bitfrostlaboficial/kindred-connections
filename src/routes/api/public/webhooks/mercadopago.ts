import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { mpGetPayment, mapMpStatus } from "@/lib/payments/mercado-pago.server";
import { refreshMPToken } from "@/lib/payments/mercado-pago-oauth.server";

export const Route = createFileRoute("/api/public/webhooks/mercadopago")({
  server: {
    handlers: {
      GET: async () => new Response("ok"),
      POST: async ({ request }) => {
        let payload: any = {};
        try {
          payload = await request.json();
        } catch {
          payload = {};
        }
        const url = new URL(request.url);
        const queryId = url.searchParams.get("data.id") || url.searchParams.get("id");
        const paymentId: string | undefined =
          payload?.data?.id?.toString() ?? payload?.resource?.toString() ?? queryId ?? undefined;
        const topic: string =
          payload?.type ?? payload?.topic ?? url.searchParams.get("type") ?? url.searchParams.get("topic") ?? "";

        console.log("[MP] WEBHOOK_RECEIVED", { topic, paymentId });

        // Sempre responde 200 rápido para evitar reentrega
        if (!paymentId) return new Response("ok");
        if (topic && !topic.includes("payment")) return new Response("ok");

        try {
          // Descobre external_reference primeiro via lookup leve (querystring),
          // mas o caminho confiável é: aceitar o paymentId, buscar a charge associada
          // (provider_charge_id) ou aguardar até batermos /v1/payments com o token correto.
          // Estratégia: tenta achar a charge no banco já pelo provider_charge_id; se não achar,
          // consulta /v1/payments primeiro com qualquer token de qualquer conta MP — barato
          // só pra obter external_reference, e em seguida refaz com o token CERTO da conta.

          let chargeRow: { id: string; group_id: string } | null = null;
          {
            const { data } = await supabaseAdmin
              .from("charges")
              .select("id, group_id")
              .eq("provider", "mercado_pago")
              .eq("provider_charge_id", paymentId)
              .maybeSingle();
            if (data) chargeRow = data as any;
          }

          // Se ainda não temos a charge, resolvemos via external_reference usando qualquer token ativo.
          if (!chargeRow) {
            const { data: anyAcct } = await supabaseAdmin
              .from("payment_accounts" as any)
              .select("access_token")
              .eq("provider", "mercado_pago")
              .eq("is_active", true)
              .limit(1)
              .maybeSingle();
            if (!anyAcct) {
              console.warn("[MP webhook] nenhuma conta MP cadastrada");
              return new Response("ok");
            }
            const probe = await mpGetPayment((anyAcct as any).access_token, paymentId);
            const ref = probe.raw?.external_reference?.toString();
            if (ref) {
              const { data } = await supabaseAdmin
                .from("charges")
                .select("id, group_id")
                .eq("id", ref)
                .maybeSingle();
              if (data) chargeRow = data as any;
            }
          }

          if (!chargeRow) {
            console.warn("[MP webhook] charge não encontrada para paymentId", paymentId);
            return new Response("ok");
          }

          // Resolve a conta certa via grupo → ppc → payment_account
          const { data: ppc } = await supabaseAdmin
            .from("payment_provider_configs")
            .select("payment_account_id")
            .eq("group_id", chargeRow.group_id)
            .eq("provider", "mercado_pago")
            .maybeSingle();
          if (!ppc || !(ppc as any).payment_account_id) {
            console.warn("[MP webhook] grupo sem conta vinculada", chargeRow.group_id);
            return new Response("ok");
          }
          const { data: acct } = await supabaseAdmin
            .from("payment_accounts" as any)
            .select("id, access_token, refresh_token, expires_at")
            .eq("id", (ppc as any).payment_account_id)
            .maybeSingle();
          if (!acct) return new Response("ok");

          let accessToken = (acct as any).access_token as string;
          const expiresAt = (acct as any).expires_at ? new Date((acct as any).expires_at).getTime() : 0;
          if (expiresAt && expiresAt < Date.now() && (acct as any).refresh_token) {
            try {
              const r = await refreshMPToken((acct as any).refresh_token);
              accessToken = r.access_token;
              await supabaseAdmin.from("payment_accounts" as any).update({
                access_token: r.access_token,
                refresh_token: r.refresh_token ?? (acct as any).refresh_token,
                expires_at: new Date(Date.now() + (r.expires_in - 60) * 1000).toISOString(),
              }).eq("id", (acct as any).id);
            } catch (e) {
              console.warn("[MP webhook] refresh falhou", e);
            }
          }

          const { status, raw } = await mpGetPayment(accessToken, paymentId);
          const newStatus = mapMpStatus(status);

          const update: {
            status: "pendente" | "pago" | "vencido" | "cancelado";
            paid_at?: string | null;
            paid_amount?: number | null;
          } = { status: newStatus };
          if (newStatus === "pago") {
            update.paid_at = raw?.date_approved ?? new Date().toISOString();
            if (typeof raw?.transaction_amount === "number") update.paid_amount = raw.transaction_amount;
          }

          await supabaseAdmin.from("charges").update(update).eq("id", chargeRow.id);
        } catch (err) {
          console.error("[MP] WEBHOOK_ERROR", err);
        }

        return new Response("ok");
      },
    },
  },
});