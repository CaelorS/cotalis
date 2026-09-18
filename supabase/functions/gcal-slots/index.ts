// Créneaux de visite disponibles pour les trois prochaines semaines.
import { CORS, json, accessToken, loadRules, freeBusy, bookedPerDay, computeSlots } from "../_shared/google.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const acc = await accessToken();
    if (!acc) return json({ error: "agenda non connecté" }, 503);
    const rules = await loadRules();
    const now = new Date(), max = new Date(now.getTime() + (rules.horizonDays + 1) * 864e5);
    const [busy, perDay] = await Promise.all([freeBusy(acc.token, now, max), bookedPerDay()]);
    const slots = computeSlots(busy, rules, perDay, now);
    return json({ slots: slots.map((d) => d.toISOString()), duration: rules.duration, tz: "Europe/Paris" });
  } catch (e) {
    return json({ error: String(e?.message ?? e) }, 500);
  }
});
