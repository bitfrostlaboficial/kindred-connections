// Server-only. Mercado Pago OAuth helpers (multi-tenant).
import { createHmac, timingSafeEqual } from "crypto";

const MP_OAUTH_AUTHORIZE = "https://auth.mercadopago.com/authorization";
const MP_OAUTH_TOKEN = "https://api.mercadopago.com/oauth/token";
const MP_API = "https://api.mercadopago.com";

export interface MPOAuthState {
  uid: string;        // user id
  gid: string;        // group id
  n: string;          // nonce
  exp: number;        // expiration epoch ms
}

function getSecret(): string {
  const s = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.MP_CLIENT_SECRET;
  if (!s) throw new Error("State signing secret indisponível");
  return s;
}

export function signState(payload: MPOAuthState): string {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = createHmac("sha256", getSecret()).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function verifyState(state: string): MPOAuthState | null {
  const [body, sig] = state.split(".");
  if (!body || !sig) return null;
  const expected = createHmac("sha256", getSecret()).update(body).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as MPOAuthState;
    if (!parsed?.exp || parsed.exp < Date.now()) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function buildAuthorizeUrl(opts: { clientId: string; redirectUri: string; state: string }): string {
  const u = new URL(MP_OAUTH_AUTHORIZE);
  u.searchParams.set("client_id", opts.clientId);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("platform_id", "mp");
  u.searchParams.set("redirect_uri", opts.redirectUri);
  u.searchParams.set("state", opts.state);
  return u.toString();
}

export interface MPTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  scope: string;
  user_id: number | string;
  refresh_token?: string;
  public_key?: string;
  live_mode?: boolean;
}

export async function exchangeCodeForToken(code: string, redirectUri: string): Promise<MPTokenResponse> {
  const clientId = process.env.MP_CLIENT_ID;
  const clientSecret = process.env.MP_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("MP_CLIENT_ID/SECRET não configurados");

  const res = await fetch(MP_OAUTH_TOKEN, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
    }).toString(),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`MP token exchange falhou (${res.status}): ${JSON.stringify(json)}`);
  return json as MPTokenResponse;
}

export async function refreshMPToken(refreshToken: string): Promise<MPTokenResponse> {
  const clientId = process.env.MP_CLIENT_ID;
  const clientSecret = process.env.MP_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("MP_CLIENT_ID/SECRET não configurados");
  const res = await fetch(MP_OAUTH_TOKEN, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }).toString(),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`MP refresh falhou (${res.status}): ${JSON.stringify(json)}`);
  return json as MPTokenResponse;
}

/** Verifica se o usuário ainda está autorizado consultando /users/me. */
export async function mpPing(accessToken: string): Promise<{ ok: boolean; user?: any; error?: string }> {
  const res = await fetch(`${MP_API}/users/me`, { headers: { Authorization: `Bearer ${accessToken}` } });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, error: json?.message ?? `HTTP ${res.status}` };
  return { ok: true, user: json };
}