// Réservation d'une visite technique : crée le rendez-vous et les blocs de trajet dans l'agenda de Simon,
// invite le client, met le dossier en « Visite planifiée ».
import { CORS, json, env, TZ, serviceClient, accessToken, loadRules, freeBusy, bookedPerDay, computeSlots, parisParts } from "../_shared/google.ts";

const KIND: Record<string, string> = { appart: "Appartement", maison: "Maison", immeuble: "Immeuble" };
const fmt = (d: Date) => new Intl.DateTimeFormat("fr-FR", { timeZone: TZ, weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }).format(d);

async function createEvent(token: string, ev: unknown, notify: boolean) {
  const r = await fetch("https://www.googleapis.com/calendar/v3/calendars/primary/events?sendUpdates=" + (notify ? "all" : "none"), {
    method: "POST", headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" }, body: JSON.stringify(ev),
  });
  if (!r.ok) throw new Error("création " + r.status + " " + await r.text());
  return await r.json();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "méthode" }, 405);
  try {
    const { project_id, token, start } = await req.json();
    if (!project_id || !token || !start) return json({ error: "paramètres manquants" }, 400);
    const db = serviceClient();
    const { data: proj } = await db.from("projects").select("id").eq("id", project_id).eq("owner_token", token).maybeSingle();
    if (!proj) return json({ error: "projet inconnu" }, 403);
    const { data: lead } = await db.from("leads").select("*").eq("project_id", project_id).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (!lead?.email) return json({ error: "coordonnées introuvables" }, 400);

    const acc = await accessToken();
    if (!acc) return json({ error: "agenda non connecté" }, 503);
    const rules = await loadRules();
    const at = new Date(start);
    const now = new Date(), max = new Date(at.getTime() + 864e5);
    const [busy, perDay] = await Promise.all([freeBusy(acc.token, now, max), bookedPerDay()]);
    if (!computeSlots(busy, rules, perDay, now).some((s) => s.getTime() === at.getTime())) return json({ error: "créneau plus disponible" }, 409);

    const end = new Date(at.getTime() + rules.duration * 60e3);
    const who = [lead.prenom, lead.nom].filter(Boolean).join(" ");
    const bien = [KIND[lead.type_bien] ?? lead.type_bien, lead.surface ? lead.surface + " m²" : ""].filter(Boolean).join(" · ");
    const lien = (env("SITE_URL") || "https://cotalia.fr") + "/estimation/?p=" + encodeURIComponent(project_id);
    const main = await createEvent(acc.token, {
      summary: "Visite technique · " + who,
      location: lead.adresse ?? "",
      description: `${bien}\nEstimation travaux : ${Math.round(lead.estimation_ttc ?? 0).toLocaleString("fr-FR")} € TTC\nTéléphone : ${lead.tel ?? ""}\nDossier : ${lien}`,
      start: { dateTime: at.toISOString(), timeZone: TZ }, end: { dateTime: end.toISOString(), timeZone: TZ },
      attendees: [{ email: lead.email, displayName: who }],
      reminders: { useDefault: false, overrides: [{ method: "popup", minutes: 24 * 60 }, { method: "email", minutes: 24 * 60 }] },
    }, true);
    if (rules.buffer > 0) {
      const b = rules.buffer * 60e3;
      await createEvent(acc.token, { summary: "Trajet · visite " + who, start: { dateTime: new Date(at.getTime() - b).toISOString(), timeZone: TZ }, end: { dateTime: at.toISOString(), timeZone: TZ }, colorId: "8" }, false);
      await createEvent(acc.token, { summary: "Trajet retour · visite " + who, start: { dateTime: end.toISOString(), timeZone: TZ }, end: { dateTime: new Date(end.getTime() + b).toISOString(), timeZone: TZ }, colorId: "8" }, false);
    }
    const rank = ["nouveau", "contacte", "relance", "visite", "devis", "signe", "perdu"];
    const p = parisParts(at);
    const patch: Record<string, unknown> = { visite_at: at.toISOString(), visite_event: main.id, next_action: `${p.y}-${String(p.m).padStart(2, "0")}-${String(p.d).padStart(2, "0")}` };
    if (rank.indexOf(lead.status ?? "nouveau") < rank.indexOf("visite")) patch.status = "visite";
    await db.from("leads").update(patch).eq("id", lead.id);
    return json({ ok: true, start: at.toISOString(), end: end.toISOString(), label: fmt(at), email: lead.email });
  } catch (e) {
    return json({ error: String(e?.message ?? e) }, 500);
  }
});
