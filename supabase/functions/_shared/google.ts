// Cotalia - accès à l'agenda Google de Simon : jeton, disponibilités, règles de créneaux.
import { createClient } from "npm:@supabase/supabase-js@2";

export const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};
export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

export const env = (k: string) => Deno.env.get(k) ?? "";
export const ACCOUNT = "simon";
export const TZ = "Europe/Paris";

export function serviceClient() {
  return createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });
}

/* ---------- règles de prise de rendez-vous (modifiables dans pricing_settings, clé AGENDA) ---------- */
export type Rules = { duration: number; buffer: number; minDelayH: number; maxPerDay: number; horizonDays: number; step: number; days: Record<string, [number, number]> };
export const DEFAULT_RULES: Rules = {
  duration: 60, buffer: 90, minDelayH: 48, maxPerDay: 2, horizonDays: 21, step: 30,
  days: { "1": [9, 18], "2": [9, 18], "3": [9, 18], "4": [9, 18], "5": [9, 18] },
};
export async function loadRules(): Promise<Rules> {
  try {
    const { data } = await serviceClient().from("pricing_settings").select("value").eq("key", "AGENDA").maybeSingle();
    if (data?.value && typeof data.value === "object") return { ...DEFAULT_RULES, ...data.value, days: { ...DEFAULT_RULES.days, ...(data.value.days || {}) } };
  } catch (_) { /* valeurs par défaut */ }
  return DEFAULT_RULES;
}

/* ---------- jeton d'accès à partir du refresh token stocké ---------- */
export async function accessToken(): Promise<{ token: string; email: string } | null> {
  const { data } = await serviceClient().from("calendar_accounts").select("email, refresh_token").eq("id", ACCOUNT).maybeSingle();
  if (!data?.refresh_token) return null;
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: env("GOOGLE_CLIENT_ID"), client_secret: env("GOOGLE_CLIENT_SECRET"), refresh_token: data.refresh_token, grant_type: "refresh_token" }),
  });
  if (!r.ok) return null;
  const j = await r.json();
  return { token: j.access_token, email: data.email };
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

export async function bookedPerDay(): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  const { data } = await serviceClient().from("leads").select("visite_at").not("visite_at", "is", null).gte("visite_at", new Date().toISOString());
  (data ?? []).forEach((l: { visite_at: string }) => { const k = parisParts(new Date(l.visite_at)).key; out[k] = (out[k] || 0) + 1; });
  return out;
}

/** Créneaux libres : la visite plus le tampon de trajet avant et après ne doivent croiser aucune occupation. */
export function computeSlots(busy: Array<[number, number]>, rules: Rules, perDay: Record<string, number>, now = new Date()): Date[] {
  const slots: Date[] = [];
  const earliest = now.getTime() + rules.minDelayH * 3600e3;
  const dur = rules.duration * 60e3, buf = rules.buffer * 60e3, step = rules.step * 60e3;
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
      slots.push(new Date(t));
    }
  }
  return slots;
}
