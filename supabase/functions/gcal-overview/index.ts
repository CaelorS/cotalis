// Planning pour le back-office : par agenda relié, les occupations Google et les créneaux réservables.
// Réservé aux administrateurs (vérifié ici, la fonction est déployée sans contrôle de JWT).
import { createClient } from "npm:@supabase/supabase-js@2";
import { CORS, json, env, loadRules, listAccounts, tokenFor, freeBusy, computeSlots, upcomingVisits, label } from "../_shared/google.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const auth = req.headers.get("Authorization") ?? "";
    const user = createClient(env("SUPABASE_URL"), env("SUPABASE_ANON_KEY"), { global: { headers: { Authorization: auth } }, auth: { persistSession: false } });
    const { data: isAdmin } = await user.rpc("is_admin");
    if (!isAdmin) return json({ error: "réservé aux administrateurs" }, 403);

    const rules = await loadRules();
    const accounts = await listAccounts();
    const up = await upcomingVisits();
    const now = new Date(), max = new Date(now.getTime() + (rules.horizonDays + 1) * 864e5);
    const out = await Promise.all(accounts.map(async (a) => {
      const base = { id: a.id, name: label(a), email: a.email, zones: a.zones, buffer: a.buffer == null ? rules.buffer : a.buffer };
      try {
        const token = await tokenFor(a);
        if (!token) return { ...base, error: "connexion Google expirée, à reconnecter", busy: [], slots: [] };
        const busy = await freeBusy(token, now, max);
        return { ...base, busy, slots: computeSlots(busy, rules, base.buffer, up.perDay[a.id] || {}, now) };
      } catch (e) {
        return { ...base, error: String(e?.message ?? e).slice(0, 120), busy: [], slots: [] };
      }
    }));
    return json({ rules, accounts: out, now: now.getTime() });
  } catch (e) {
    return json({ error: String(e?.message ?? e) }, 500);
  }
});
