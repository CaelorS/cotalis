// Créneaux de visite disponibles pour les trois prochaines semaines, tous agendas confondus.
import { CORS, json, loadRules, offersFor, leadOf, listAccounts, label } from "../_shared/google.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const t0 = Date.now();
    const [accounts, rules, lead] = await Promise.all([listAccounts(), loadRules(), leadOf(body.project_id, body.token)]);
    if (!accounts.length) return json({ error: "agenda non connecté" }, 503);
    const offers = await offersFor(lead, rules, undefined, accounts);
    if (Date.now() - t0 > 4000) console.error("gcal-slots: réponse lente", Date.now() - t0, "ms");
    if (!offers.length) console.error("gcal-slots: aucun créneau, agendas sans autorisation complète ou sans disponibilité");
    const who: Record<string, string> = {};
    offers.forEach((o) => { who[new Date(o.t).toISOString()] = label(o.account); });
    return json({ slots: offers.map((o) => new Date(o.t).toISOString()), who, duration: rules.duration, tz: "Europe/Paris" });
  } catch (e) {
    return json({ error: String(e?.message ?? e) }, 500);
  }
});
