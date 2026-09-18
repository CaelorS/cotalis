// Connexion de l'agenda Google de Simon (OAuth). Déployer avec verify_jwt = false : Google revient sans jeton Supabase.
import { createClient } from "npm:@supabase/supabase-js@2";
import { CORS, json, env, ACCOUNT, serviceClient } from "../_shared/google.ts";

const SCOPES = "openid email https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.readonly";
const redirectUri = () => env("SUPABASE_URL") + "/functions/v1/gcal-auth";
const site = () => env("SITE_URL") || "https://cotalia.fr";

async function hmac(msg: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(env("SUPABASE_SERVICE_ROLE_KEY")), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(msg));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const url = new URL(req.url);

  // 1. un administrateur demande l'URL de consentement Google
  if (req.method === "POST") {
    const auth = req.headers.get("Authorization") ?? "";
    const user = createClient(env("SUPABASE_URL"), env("SUPABASE_ANON_KEY"), { global: { headers: { Authorization: auth } }, auth: { persistSession: false } });
    const { data: isAdmin } = await user.rpc("is_admin");
    if (!isAdmin) return json({ error: "réservé aux administrateurs" }, 403);
    const ts = String(Date.now());
    const state = ts + "." + await hmac(ts);
    const p = new URLSearchParams({ client_id: env("GOOGLE_CLIENT_ID"), redirect_uri: redirectUri(), response_type: "code", scope: SCOPES, access_type: "offline", prompt: "consent", include_granted_scopes: "true", state });
    return json({ url: "https://accounts.google.com/o/oauth2/v2/auth?" + p.toString() });
  }

  // 2. retour de Google avec le code
  const code = url.searchParams.get("code"), state = url.searchParams.get("state") ?? "";
  const [ts, sig] = state.split(".");
  if (!code || !ts || sig !== await hmac(ts) || Date.now() - +ts > 15 * 60e3) return Response.redirect(site() + "/admin/?agenda=erreur", 302);
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ code, client_id: env("GOOGLE_CLIENT_ID"), client_secret: env("GOOGLE_CLIENT_SECRET"), redirect_uri: redirectUri(), grant_type: "authorization_code" }),
  });
  const tok = await r.json();
  if (!tok.refresh_token) return Response.redirect(site() + "/admin/?agenda=erreur", 302);
  const info = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", { headers: { Authorization: "Bearer " + tok.access_token } }).then((x) => x.json()).catch(() => ({}));
  await serviceClient().from("calendar_accounts").upsert({ id: ACCOUNT, email: info.email ?? null, refresh_token: tok.refresh_token, updated_at: new Date().toISOString() });
  return Response.redirect(site() + "/admin/?agenda=ok", 302);
});
