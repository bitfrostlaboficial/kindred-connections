import { createFileRoute } from "@tanstack/react-router";

interface ChargesBody {
  groupId: string;
  participantIds: string[];
  description: string;
  amount: number;
  dueDate: string; // yyyy-mm-dd
}

export const Route = createFileRoute("/api/charges")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          // ---- Auth: valida o Bearer token do usuário ----
          const authHeader = request.headers.get("authorization");
          if (!authHeader?.startsWith("Bearer ")) {
            return Response.json({ error: "Não autenticado" }, { status: 401 });
          }
          const token = authHeader.slice("Bearer ".length);

          const { createClient } = await import("@supabase/supabase-js");
          const SUPABASE_URL = process.env.SUPABASE_URL!;
          const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY!;

          const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
            global: { headers: { Authorization: `Bearer ${token}` } },
            auth: { persistSession: false, autoRefreshToken: false },
          });

          const { data: claimsData, error: claimsErr } = await supabase.auth.getClaims(token);
          if (claimsErr || !claimsData?.claims?.sub) {
            return Response.json({ error: "Sessão inválida" }, { status: 401 });
          }
          const userId = claimsData.claims.sub as string;

          // ---- Validação do body ----
          const body = (await request.json()) as ChargesBody;
          if (!body?.groupId) return Response.json({ error: "groupId obrigatório" }, { status: 400 });
          if (!Array.isArray(body.participantIds) || body.participantIds.length === 0)
            return Response.json({ error: "Selecione ao menos um jogador" }, { status: 400 });
          if (!body.description || body.description.length > 255)
            return Response.json({ error: "Descrição inválida" }, { status: 400 });
          if (!(body.amount > 0) || body.amount > 1_000_000)
            return Response.json({ error: "Valor inválido" }, { status: 400 });
          if (!/^\d{4}-\d{2}-\d{2}$/.test(body.dueDate))
            return Response.json({ error: "Vencimento inválido" }, { status: 400 });

          // ---- Carrega participantes (RLS garante posse do grupo) ----
          const { data: participants, error: pErr } = await supabase
            .from("participants")
            .select("id,name,email,group_id")
            .in("id", body.participantIds)
            .eq("group_id", body.groupId);
          if (pErr) return Response.json({ error: pErr.message }, { status: 400 });
          if (!participants || participants.length === 0)
            return Response.json({ error: "Jogadores não encontrados" }, { status: 404 });

          // ---- Resolve a conta MP do organizador vinculada a este grupo ----
          const { data: ppc, error: ppcErr } = await supabase
            .from("payment_provider_configs")
            .select("payment_account_id, is_active")
            .eq("group_id", body.groupId)
            .eq("provider", "mercado_pago")
            .maybeSingle();
          if (ppcErr) return Response.json({ error: ppcErr.message }, { status: 400 });
          if (!ppc || !(ppc as any).payment_account_id || !ppc.is_active) {
            return Response.json({ error: "Conecte uma conta Mercado Pago nas Configurações Financeiras do grupo." }, { status: 412 });
          }

          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { data: acct, error: aErr } = await supabaseAdmin
            .from("payment_accounts" as any)
            .select("id, access_token, refresh_token, expires_at, is_active")
            .eq("id", (ppc as any).payment_account_id)
            .maybeSingle();
          if (aErr || !acct) return Response.json({ error: "Conta MP não encontrada" }, { status: 412 });
          if (!(acct as any).is_active) return Response.json({ error: "Conta MP desativada" }, { status: 412 });

          let accessToken = (acct as any).access_token as string;
          const expiresAt = (acct as any).expires_at ? new Date((acct as any).expires_at).getTime() : 0;
          if (expiresAt && expiresAt < Date.now() && (acct as any).refresh_token) {
            try {
              const { refreshMPToken } = await import("@/lib/payments/mercado-pago-oauth.server");
              const refreshed = await refreshMPToken((acct as any).refresh_token);
              accessToken = refreshed.access_token;
              await supabaseAdmin.from("payment_accounts" as any).update({
                access_token: refreshed.access_token,
                refresh_token: refreshed.refresh_token ?? (acct as any).refresh_token,
                expires_at: new Date(Date.now() + (refreshed.expires_in - 60) * 1000).toISOString(),
              }).eq("id", (acct as any).id);
            } catch (e) {
              console.warn("[charges] refresh MP token falhou", e);
            }
          }

          const { mpCreatePixPayment } = await import("@/lib/payments/mercado-pago.server");

          const dueIso = new Date(`${body.dueDate}T23:59:59-03:00`).toISOString();

          const created: Array<Record<string, unknown>> = [];

          for (const p of participants as Array<{ id: string; name: string; email: string | null }>) {
            const { data: inserted, error: insErr } = await supabase
              .from("charges")
              .insert({
                group_id: body.groupId,
                participant_id: p.id,
                description: body.description,
                amount: body.amount,
                due_date: body.dueDate,
                status: "pendente",
                provider: "mercado_pago",
                created_by: userId,
              })
              .select("id,public_token")
              .single();
            if (insErr || !inserted) {
              console.error("[API/charges] insert error", insErr);
              return Response.json({ error: insErr?.message ?? "Erro ao criar cobrança" }, { status: 500 });
            }

            try {
              const mp = await mpCreatePixPayment({
                accessToken,
                amount: Number(body.amount),
                description: body.description,
                externalId: inserted.id,
                payerName: p.name,
                payerEmail: p.email ?? undefined,
                dueDateISO: dueIso,
              });

              await supabase
                .from("charges")
                .update({
                  provider_charge_id: mp.providerChargeId,
                  pix_copy_paste: mp.qrCode,
                  pix_qr_code: mp.qrCodeBase64,
                  payment_link: mp.ticketUrl ?? null,
                })
                .eq("id", inserted.id);

              created.push({
                id: inserted.id,
                participant_id: p.id,
                participant_name: p.name,
                amount: Number(body.amount),
                description: body.description,
                status: "pendente",
                pix_copy_paste: mp.qrCode,
                pix_qr_code: mp.qrCodeBase64,
                payment_link: mp.ticketUrl ?? null,
                provider_charge_id: mp.providerChargeId,
                public_token: inserted.public_token,
              });
            } catch (err) {
              const msg = err instanceof Error ? err.message : "Erro Mercado Pago";
              console.error("[API/charges] MP error", inserted.id, msg);
              await supabase.from("charges").update({ status: "cancelado" }).eq("id", inserted.id);
              created.push({
                id: inserted.id,
                participant_id: p.id,
                participant_name: p.name,
                amount: Number(body.amount),
                description: body.description,
                status: "cancelado",
                pix_copy_paste: null,
                pix_qr_code: null,
                payment_link: null,
                provider_charge_id: null,
                public_token: inserted.public_token,
                error: msg,
              });
            }
          }

          return Response.json({ charges: created });
        } catch (err) {
          const msg = err instanceof Error ? err.message : "Erro interno";
          console.error("[API/charges] fatal", msg);
          return Response.json({ error: msg }, { status: 500 });
        }
      },
    },
  },
});
