// Annulation d'une visite : supprime le rendez-vous et ses deux blocs de trajet dans l'agenda, prévient le client,
// et libère le dossier. Appelable par le client (projet + jeton) ou par un administrateur (dossier + session).
import { createClient } from "npm:@supabase/supabase-js@2";
import { CORS, json, env, serviceClient, loadRules, grantFor, leadOf, Account } from "../_shared/google.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "méthode" }, 405);
  try {
    const body = await req.json();
    const db = serviceClient();
    let lead = await leadOf(body.project_id, body.token);
    if (!lead && body.lead_id) {
      const auth = req.headers.get("Authorization") ?? "";
      const user = createClient(env("SUPABASE_URL"), env("SUPABASE_ANON_KEY"), { global: { headers: { Authorization: auth } }, auth: { persistSession: false } });
      const { data: isAdmin } = await user.rpc("is_admin");
      if (!isAdmin) return json({ error: "réservé aux administrateurs" }, 403);
      const { data } = await db.from("leads").select("*").eq("id", body.lead_id).maybeSingle();
      lead = data ?? null;
    }
    if (!lead) return json({ error: "dossier inconnu" }, 403);
    if (!lead.visite_at) return json({ error: "aucune visite à annuler" }, 400);

    let removed = 0, note = "";
    const { data: acc } = await db.from("calendar_accounts").select("*").eq("id", lead.visite_with ?? "").maybeSingle();
    const g = acc ? await grantFor(acc as Account) : null;
    if (g && g.canWrite) {
      const rules = await loadRules();
      const at = Date.parse(lead.visite_at), end = at + rules.duration * 60e3;
      const buf = ((acc as Account).buffer == null ? rules.buffer : (acc as Account).buffer!) * 60e3;
      const who = [lead.prenom, lead.nom].filter(Boolean).join(" ");
      const q = new URLSearchParams({ timeMin: new Date(at - buf - 5 * 60e3).toISOString(), timeMax: new Date(end + buf + 5 * 60e3).toISOString(), singleEvents: "true", maxResults: "50" });
      const list = await fetch("https://www.googleapis.com/calendar/v3/calendars/primary/events?" + q, { headers: { Authorization: "Bearer " + g.token } }).then((r) => r.json());
      for (const ev of (list.items ?? [])) {
        const mine = ev.id === lead.visite_event || (typeof ev.summary === "string" && /^Trajet( retour)? · visite /.test(ev.summary) && ev.summary.endsWith(who));
        if (!mine) continue;
        const r = await fetch("https://www.googleapis.com/calendar/v3/calendars/primary/events/" + encodeURIComponent(ev.id) + "?sendUpdates=" + (ev.id === lead.visite_event ? "all" : "none"), { method: "DELETE", headers: { Authorization: "Bearer " + g.token } });
        if (r.ok || r.status === 410) removed++;
      }
    } else note = "agenda inaccessible : le rendez-vous reste à supprimer à la main dans Google Agenda";
    const patch: Record<string, unknown> = { visite_at: null, visite_event: null, visite_with: null, next_action: null };
    if (lead.status === "visite") patch.status = "contacte";
    await db.from("leads").update(patch).eq("id", lead.id);
    return json({ ok: true, removed, note });
  } catch (e) {
    console.error("gcal-cancel: échec", String(e?.message ?? e));
    return json({ error: String(e?.message ?? e).slice(0, 300) }, 500);
  }
});
