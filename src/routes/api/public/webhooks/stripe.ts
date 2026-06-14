import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/webhooks/stripe")({
  server: {
    handlers: {
      GET: async () => new Response("ok"),
      POST: async ({ request }) => {
        const raw = await request.text();
        const sigHeader = request.headers.get("stripe-signature");
        let evt: any = {};
        try { evt = JSON.parse(raw); } catch { return new Response("bad json", { status: 400 }); }

        const obj = evt?.data?.object;
        if (!obj?.id) return new Response("ok");
        const externalId: string | undefined = obj?.metadata?.external_id;
        if (!externalId) {
          console.warn("[Stripe] WEBHOOK_NO_EXTERNAL_ID", evt?.type, obj?.id);
          return new Response("ok");
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { verifyStripeSignature, stripeGetPaymentIntent, mapStripeStatus } = await import(
          "@/lib/payments/stripe.server"
        );

        // Carrega charge + conta do organizador para validar assinatura com o webhook_secret dele.
        const { data: charge } = await supabaseAdmin
          .from("charges")
          .select("id, group_id, status")
          .eq("id", externalId)
          .maybeSingle();
        if (!charge) return new Response("ok");

        const { data: ppc } = await supabaseAdmin
          .from("payment_provider_configs")
          .select("payment_account_id, config")
          .eq("group_id", (charge as any).group_id)
          .eq("provider", "stripe")
          .maybeSingle();
        const webhookSecret = (ppc as any)?.config?.webhook_secret as string | undefined;
        const accountId = (ppc as any)?.payment_account_id as string | undefined;
        if (!accountId) return new Response("ok");

        if (webhookSecret) {
          const ok = await verifyStripeSignature(raw, sigHeader, webhookSecret);
          if (!ok) {
            console.warn("[Stripe] WEBHOOK_BAD_SIG", evt?.type);
            return new Response("invalid signature", { status: 401 });
          }
        } else {
          console.warn("[Stripe] WEBHOOK_NO_SECRET — accepting unverified (organizer didn't configure secret)");
        }

        const { data: acct } = await supabaseAdmin
          .from("payment_accounts")
          .select("access_token")
          .eq("id", accountId)
          .maybeSingle();
        if (!acct) return new Response("ok");

        // Reconsulta status atual no Stripe — fonte da verdade.
        let piId: string = obj.id;
        if (evt?.type?.startsWith("charge.")) {
          piId = obj.payment_intent ?? piId;
        }
        try {
          const pi = await stripeGetPaymentIntent((acct as any).access_token, piId);
          const localStatus = mapStripeStatus(pi.status);
          const charges = pi?.charges?.data?.[0] ?? pi?.latest_charge ?? null;
          const card = charges?.payment_method_details?.card ?? null;
          await supabaseAdmin
            .from("charges")
            .update({
              provider_charge_id: pi.id,
              status: localStatus,
              paid_at: localStatus === "pago" ? new Date().toISOString() : null,
              card_brand: card?.brand ?? undefined,
              card_last4: card?.last4 ?? undefined,
            })
            .eq("id", externalId);
          console.log("[Stripe] WEBHOOK_APPLIED", evt?.type, pi.id, localStatus);
        } catch (e: any) {
          console.error("[Stripe] WEBHOOK_PI_FETCH_FAIL", e?.message);
        }

        return new Response("ok");
      },
    },
  },
});
