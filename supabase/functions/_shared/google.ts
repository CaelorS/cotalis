// Cotalia - agendas Google des personnes qui font les visites : jetons, disponibilités, règles, attribution.
import { createClient } from "npm:@supabase/supabase-js@2";

export const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};
export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

export const env = (k: string) => Deno.env.get(k) ?? "";
export const TZ = "Europe/Paris";

export function serviceClient() {
  return createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });
}

/* ---------- règles de prise de rendez-vous (modifiables dans pricing_settings, clé AGENDA) ---------- */
export type Rules = { duration: number; buffer: number; minDelayH: number; maxPerDay: number; horizonDays: number; step: number; mode: string; days: Record<string, [number, number]> };
export const DEFAULT_RULES: Rules = {
  duration: 60, buffer: 90, minDelayH: 48, maxPerDay: 2, horizonDays: 21, step: 30, mode: "zones",
  days: { "1": [9, 18], "2": [9, 18], "3": [9, 18], "4": [9, 18], "5": [9, 18] },
};
export async function loadRules(): Promise<Rules> {
  try {
    const { data } = await serviceClient().from("pricing_settings").select("value").eq("key", "AGENDA").maybeSingle();
    if (data?.value && typeof data.value === "object") return { ...DEFAULT_RULES, ...data.value, days: data.value.days && Object.keys(data.value.days).length ? data.value.days : DEFAULT_RULES.days };
  } catch (_) { /* valeurs par défaut */ }
  return DEFAULT_RULES;
}

/* ---------- comptes ---------- */
export type Account = { id: string; email: string | null; name: string | null; user_id: string | null; refresh_token: string; active: boolean; sort_order: number; zones: string | null; buffer: number | null };
export const label = (a: Account) => (a.name || a.email || "Cotalia").trim();

export async function listAccounts(): Promise<Account[]> {
  const { data } = await serviceClient().from("calendar_accounts").select("*").eq("active", true).order("sort_order").order("updated_at");
  return (data ?? []) as Account[];
}

export async function tokenFor(a: Account): Promise<string | null> {
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: env("GOOGLE_CLIENT_ID"), client_secret: env("GOOGLE_CLIENT_SECRET"), refresh_token: a.refresh_token, grant_type: "refresh_token" }),
  });
  if (!r.ok) return null;
  return (await r.json()).access_token ?? null;
}

/** Département d'un code postal : 2 chiffres, 3 pour l'outre-mer. */
export const dept = (cp?: string | null) => { const c = String(cp ?? "").trim(); return /^9[78]/.test(c) ? c.slice(0, 3) : c.slice(0, 2); };
const zonesOf = (a: Account) => String(a.zones ?? "").split(/[\s,;]+/).map((z) => z.trim().toUpperCase()).filter(Boolean);

/** Ordre de préférence des agendas pour un dossier, selon le mode d'attribution. */
export function orderAccounts(accounts: Account[], lead: { cp?: string | null; assigned_to?: string | null } | null, rules: Rules, upcoming: Record<string, number>): Account[] {
  const base = accounts.slice().sort((a, b) => a.sort_order - b.sort_order);
  const first = (pred: (a: Account) => boolean) => base.filter(pred).concat(base.filter((a) => !pred(a)));
  if (rules.mode === "responsable" && lead?.assigned_to) return first((a) => a.user_id === lead.assigned_to);
  if (rules.mode === "equilibre") return base.sort((a, b) => (upcoming[a.id] || 0) - (upcoming[b.id] || 0) || a.sort_order - b.sort_order);
  if (rules.mode === "zones" && lead?.cp) { const d = dept(lead.cp).toUpperCase(); return first((a) => zonesOf(a).includes(d)); }
  return base;
}

/* ---------- fuseau de Paris ---------- */
function tzOffsetMs(d: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: TZ, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }).formatToParts(d);
  const g = (t: string) => +(parts.find((p) => p.type === t)?.value ?? 0);
  return Date.UTC(g("year"), g("month") - 1, g("day"), g("hour"), g("minute"), g("second")) - d.getTime();
}
/** Date UTC correspondant à y-m-d h:min heure de Paris. */
export function parisDate(y: number, m: number, d: number, h: number, min = 0): Date {
  const guess = new Date(Date.UTC(y, m - 1, d, h, min));
  return new Date(guess.getTime() - tzOffsetMs(guess));
}
export function parisParts(d: Date) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: TZ, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", weekday: "short" }).formatToParts(d);
  const g = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const wd = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[g("weekday")] ?? 0;
  return { y: +g("year"), m: +g("month"), d: +g("day"), h: +g("hour"), min: +g("minute"), wd, key: `${g("year")}-${g("month")}-${g("day")}` };
}

/* ---------- occupations et créneaux ---------- */
export async function freeBusy(token: string, timeMin: Date, timeMax: Date): Promise<Array<[number, number]>> {
  const r = await fetch("https://www.googleapis.com/calendar/v3/freeBusy", {
    method: "POST", headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
    body: JSON.stringify({ timeMin: timeMin.toISOString(), timeMax: timeMax.toISOString(), timeZone: TZ, items: [{ id: "primary" }] }),
  });
  if (!r.ok) throw new Error("freeBusy " + r.status + " " + await r.text());
  const j = await r.json();
  return (j.calendars?.primary?.busy ?? []).map((b: { start: string; end: string }) => [Date.parse(b.start), Date.parse(b.end)]);
}

/** Visites à venir : par agenda, total et par jour. */
export async function upcomingVisits(): Promise<{ total: Record<string, number>; perDay: Record<string, Record<string, number>> }> {
  const total: Record<string, number> = {}, perDay: Record<string, Record<string, number>> = {};
  const { data } = await serviceClient().from("leads").select("visite_at, visite_with").not("visite_at", "is", null).gte("visite_at", new Date().toISOString());
  (data ?? []).forEach((l: { visite_at: string; visite_with: string | null }) => {
    const id = l.visite_with || "?", k = parisParts(new Date(l.visite_at)).key;
    total[id] = (total[id] || 0) + 1; (perDay[id] = perDay[id] || {})[k] = (perDay[id][k] || 0) + 1;
  });
  return { total, perDay };
}

/** Créneaux libres d'un agenda : la visite plus le trajet avant et après ne doivent croiser aucune occupation. */
export function computeSlots(busy: Array<[number, number]>, rules: Rules, bufferMin: number, perDay: Record<string, number>, now = new Date()): number[] {
  const slots: number[] = [];
  const earliest = now.getTime() + rules.minDelayH * 3600e3;
  const dur = rules.duration * 60e3, buf = bufferMin * 60e3, step = rules.step * 60e3;
  const start = parisParts(now);
  for (let i = 0; i <= rules.horizonDays; i++) {
    const day = new Date(Date.UTC(start.y, start.m - 1, start.d + i, 12));
    const p = parisParts(day);
    const win = rules.days[String(p.wd)]; if (!win) continue;
    if ((perDay[p.key] || 0) >= rules.maxPerDay) continue;
    const open = parisDate(p.y, p.m, p.d, win[0]).getTime(), close = parisDate(p.y, p.m, p.d, win[1]).getTime();
    for (let t = open; t + dur <= close; t += step) {
      if (t < earliest) continue;
      const a = t - buf, b = t + dur + buf;
      if (busy.some(([s, e]) => s < b && e > a)) continue;
      slots.push(t);
    }
  }
  return slots;
}

export type Offer = { t: number; account: Account; token: string; buffer: number };
/** Créneaux proposés à un dossier : pour chaque heure, le premier agenda libre dans l'ordre de préférence. */
export async function offersFor(lead: { cp?: string | null; assigned_to?: string | null } | null, rules: Rules, until?: Date): Promise<Offer[]> {
  const accounts = await listAccounts();
  if (!accounts.length) return [];
  const up = await upcomingVisits();
  const ordered = orderAccounts(accounts, lead, rules, up.total);
  const now = new Date(), max = until ?? new Date(now.getTime() + (rules.horizonDays + 1) * 864e5);
  const per = await Promise.all(ordered.map(async (a) => {
    try {
      const token = await tokenFor(a); if (!token) return null;
      const buffer = a.buffer == null ? rules.buffer : a.buffer;
      const busy = await freeBusy(token, now, max);
      return { a, token, buffer, slots: computeSlots(busy, rules, buffer, up.perDay[a.id] || {}, now) };
    } catch (_) { return null; }
  }));
  const byTime = new Map<number, Offer>();
  per.forEach((x) => { if (!x) return; x.slots.forEach((t) => { if (!byTime.has(t)) byTime.set(t, { t, account: x.a, token: x.token, buffer: x.buffer }); }); });
  return [...byTime.values()].sort((a, b) => a.t - b.t);
}

/** Dossier lié à un projet, après vérification du jeton du propriétaire. */
export async function leadOf(project_id?: string, token?: string) {
  if (!project_id || !token) return null;
  const db = serviceClient();
  const { data: proj } = await db.from("projects").select("id").eq("id", project_id).eq("owner_token", token).maybeSingle();
  if (!proj) return null;
  const { data: lead } = await db.from("leads").select("*").eq("project_id", project_id).order("created_at", { ascending: false }).limit(1).maybeSingle();
  return lead ?? null;
}
