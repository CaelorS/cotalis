// Créneaux de visite disponibles pour les trois prochaines semaines, tous agendas confondus.
import { CORS, json, loadRules, offersFor, leadOf, listAccounts, label } from "../_shared/google.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    if (!(await listAccounts()).length) return json({ error: "agenda non connecté" }, 503);
    const rules = await loadRules();
    const lead = await leadOf(body.project_id, body.token);
    const offers = await offersFor(lead, rules);
    if (!offers.length) console.error("gcal-slots: aucun créneau, agendas sans autorisation complète ou sans disponibilité");
    const who: Record<string, string> = {};
    offers.forEach((o) => { who[new Date(o.t).toISOString()] = label(o.account); });
    return json({ slots: offers.map((o) => new Date(o.t).toISOString()), who, duration: rules.duration, tz: "Europe/Paris" });
  } catch (e) {
    return json({ error: String(e?.message ?? e) }, 500);
  }
});
