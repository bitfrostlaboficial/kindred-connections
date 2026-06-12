import { createFileRoute, redirect } from "@tanstack/react-router";
import { buildAuthorizeUrl, signState } from "@/lib/payments/mercado-pago-oauth.server";

export const Route = createFileRoute("/api/oauth/mercadopago/start")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const groupId = url.searchParams.get("group_id");
        if (!groupId) return new Response("group_id obrigatório", { status: 400 });

        // Valida usuário a partir do bearer (sent by client via fetch wrapper) ou cookie
        const auth = request.headers.get("authorization");
        const token = auth?.startsWith("Bearer ") ? auth.slice(7) : null;
        if (!token) return new Response("Não autenticado", { status: 401 });

        const { createClient } = await import("@supabase/supabase-js");
        const supa = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
          global: { headers: { Authorization: `Bearer ${token}` } },
          auth: { persistSession: false, autoRefreshToken: false },
        });
        const { data: claims, error } = await supa.auth.getClaims(token);
        if (error || !claims?.claims?.sub) return new Response("Sessão inválida", { status: 401 });
        const userId = claims.claims.sub as string;

        // Confirma que o usuário é membro do grupo
        const { data: gm } = await supa.from("group_members").select("user_id").eq("group_id", groupId).eq("user_id", userId).maybeSingle();
        if (!gm) return new Response("Sem acesso ao grupo", { status: 403 });

        const clientId = process.env.MP_CLIENT_ID;
        if (!clientId) return new Response("MP_CLIENT_ID ausente", { status: 500 });

        const redirectUri = `${url.origin}/api/oauth/mercadopago/callback`;
        const state = signState({ uid: userId, gid: groupId, n: crypto.randomUUID(), exp: Date.now() + 10 * 60_000 });
        const authorizeUrl = buildAuthorizeUrl({ clientId, redirectUri, state });

        // Devolve URL pra o cliente abrir (evita cross-origin issues com fetch + redirect)
        return Response.json({ authorizeUrl });
      },
    },
  },
});