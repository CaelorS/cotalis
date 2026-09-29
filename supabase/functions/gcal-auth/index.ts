// Connexion de l'agenda Google d'un administrateur (OAuth). Déployer avec verify_jwt = false : Google revient sans jeton Supabase.
import { createClient } from "npm:@supabase/supabase-js@2";
import { CORS, json, env, serviceClient } from "../_shared/google.ts";

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

  // 1. un administrateur demande l'URL de consentement Google, pour relier SON agenda
  if (req.method === "POST") {
    const auth = req.headers.get("Authorization") ?? "";
    const user = createClient(env("SUPABASE_URL"), env("SUPABASE_ANON_KEY"), { global: { headers: { Authorization: auth } }, auth: { persistSession: false } });
    const { data: isAdmin } = await user.rpc("is_admin");
    const { data: me } = await user.auth.getUser(auth.replace(/^Bearer\s+/i, ""));
    if (!isAdmin || !me?.user) return json({ error: "réservé aux administrateurs" }, 403);
    const payload = Date.now() + "." + me.user.id;
    const state = payload + "." + await hmac(payload);
    const p = new URLSearchParams({ client_id: env("GOOGLE_CLIENT_ID"), redirect_uri: redirectUri(), response_type: "code", scope: SCOPES, access_type: "offline", prompt: "consent", include_granted_scopes: "true", state });
    return json({ url: "https://accounts.google.com/o/oauth2/v2/auth?" + p.toString() });
  }

  // 2. retour de Google avec le code
  const code = url.searchParams.get("code"), state = url.searchParams.get("state") ?? "";
  const [ts, uid, sig] = state.split(".");
  if (!code || !ts || !uid || sig !== await hmac(ts + "." + uid) || Date.now() - +ts > 15 * 60e3) return Response.redirect(site() + "/admin/?agenda=erreur", 302);
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ code, client_id: env("GOOGLE_CLIENT_ID"), client_secret: env("GOOGLE_CLIENT_SECRET"), redirect_uri: redirectUri(), grant_type: "authorization_code" }),
  });
  const tok = await r.json();
  if (!tok.refresh_token) return Response.redirect(site() + "/admin/?agenda=erreur", 302);
  const info = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", { headers: { Authorization: "Bearer " + tok.access_token } }).then((x) => x.json()).catch(() => ({}));
  const db = serviceClient();
  const { data: prof } = await db.from("profiles").select("prenom, nom").eq("id", uid).maybeSingle();
  const { data: existing } = await db.from("calendar_accounts").select("id").eq("id", uid).maybeSingle();
  if (existing) {
    await db.from("calendar_accounts").update({ email: info.email ?? null, refresh_token: tok.refresh_token, updated_at: new Date().toISOString() }).eq("id", uid);
  } else {
    const { count } = await db.from("calendar_accounts").select("id", { count: "exact", head: true });
    await db.from("calendar_accounts").insert({ id: uid, user_id: uid, email: info.email ?? null, name: [prof?.prenom, prof?.nom].filter(Boolean).join(" ") || (info.email ?? null), refresh_token: tok.refresh_token, active: true, sort_order: count ?? 0, updated_at: new Date().toISOString() });
  }
  return Response.redirect(site() + "/admin/?agenda=ok", 302);
});
