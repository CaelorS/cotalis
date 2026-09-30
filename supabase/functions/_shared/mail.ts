// Cotalia - envoi d'e-mails transactionnels via Resend, gabarit aux couleurs du site, journal en base.
import { env, serviceClient, TZ } from "./google.ts";

export const SITE = () => env("SITE_URL") || "https://cotalia.fr";
export const mailConfigured = () => !!env("RESEND_API_KEY");
export const eur = (v: number) => Math.round(v || 0).toLocaleString("fr-FR") + " €";
export const fmtDate = (d: Date) => new Intl.DateTimeFormat("fr-FR", { timeZone: TZ, weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }).format(d);
export const esc = (s: unknown) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));

/** Gabarit : en-tête bleu, carte blanche, pied de page. Tout en styles en ligne pour les messageries. */
export function layout(title: string, body: string, preheader = ""): string {
  return `<!doctype html><html lang="fr"><body style="margin:0;padding:0;background:#EEF1F5;font-family:Helvetica,Arial,sans-serif;color:#17212B">
<span style="display:none;max-height:0;overflow:hidden;color:transparent">${esc(preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#EEF1F5;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%">
<tr><td style="padding:0 0 14px 4px;font-size:22px;font-weight:700;letter-spacing:.14em;color:#2457A6">COTALIA</td></tr>
<tr><td style="background:#FFFFFF;border:1px solid #D3DAE1;border-radius:8px;padding:28px 28px 24px">
<h1 style="margin:0 0 14px;font-size:24px;line-height:1.2;color:#17212B">${title}</h1>
${body}
</td></tr>
<tr><td style="padding:16px 6px 0;font-size:12px;line-height:1.5;color:#7B8794">Cotalia · estimation, rénovation, financement et chasse immobilière pour investisseurs.<br>Ce message a été envoyé à la suite d'une action sur cotalia.fr. Les montants sont indicatifs et ne constituent pas un devis.</td></tr>
</table></td></tr></table></body></html>`;
}
export const p = (s: string) => `<p style="margin:0 0 12px;font-size:15.5px;line-height:1.55;color:#2B3642">${s}</p>`;
export const btn = (href: string, label: string, primary = true) => `<a href="${href}" style="display:inline-block;margin:6px 8px 6px 0;padding:11px 18px;border-radius:5px;font-size:15px;font-weight:600;text-decoration:none;${primary ? "background:#2457A6;color:#FFFFFF" : "background:#FFFFFF;color:#2457A6;border:1px solid #2457A6"}">${label}</a>`;
export const kv = (rows: Array<[string, string]>) => `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin:8px 0 16px;border-top:1px solid #E6EAF0">${rows.map(([k, v]) => `<tr><td style="padding:8px 0;border-bottom:1px solid #E6EAF0;font-size:14px;color:#7B8794">${k}</td><td align="right" style="padding:8px 0;border-bottom:1px solid #E6EAF0;font-size:14.5px;color:#17212B;font-weight:600">${v}</td></tr>`).join("")}</table>`;
export const big = (v: string, sub: string) => `<div style="margin:6px 0 16px;padding:16px 18px;background:#E3ECF9;border-radius:8px"><div style="font-size:30px;font-weight:700;color:#2457A6;line-height:1.1">${v}</div><div style="margin-top:4px;font-size:13.5px;color:#4A5866">${sub}</div></div>`;

export type Attachment = { filename: string; content: string };   // contenu en base64

/** Envoi via Resend. Sans clé configurée : rien n'est envoyé, on le dit. */
export async function sendMail(opts: { to: string | string[]; subject: string; html: string; text?: string; attachments?: Attachment[]; replyTo?: string; leadId?: number | null; kind: string }): Promise<{ ok: boolean; id?: string; error?: string }> {
  const to = Array.isArray(opts.to) ? opts.to : [opts.to];
  const db = serviceClient();
  const log = async (ok: boolean, id?: string, error?: string) => { try { await db.from("mail_log").insert({ lead_id: opts.leadId ?? null, kind: opts.kind, recipient: to.join(", "), ok, provider_id: id ?? null, error: error ?? null }); } catch (_) { /* journal facultatif */ } };
  if (!mailConfigured()) { await log(false, undefined, "envoi non configuré (RESEND_API_KEY absent)"); return { ok: false, error: "envoi non configuré" }; }
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST", headers: { Authorization: "Bearer " + env("RESEND_API_KEY"), "Content-Type": "application/json" },
      body: JSON.stringify({ from: env("MAIL_FROM") || "Cotalia <onboarding@resend.dev>", to, subject: opts.subject, html: opts.html, text: opts.text, reply_to: opts.replyTo || env("MAIL_REPLY_TO") || undefined, attachments: opts.attachments }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { const err = (j && (j.message || j.error)) || ("HTTP " + r.status); console.error("mail: refusé", opts.kind, err); await log(false, undefined, String(err).slice(0, 300)); return { ok: false, error: String(err) }; }
    await log(true, j.id);
    return { ok: true, id: j.id };
  } catch (e) {
    const err = String(e?.message ?? e); console.error("mail: échec", opts.kind, err); await log(false, undefined, err.slice(0, 300)); return { ok: false, error: err };
  }
}

/** Adresses de l'équipe : administrateurs et propriétaire, plus MAIL_TEAM (séparées par des virgules). */
export async function teamEmails(): Promise<string[]> {
  const set = new Set<string>();
  try { const { data } = await serviceClient().from("profiles").select("email, role").in("role", ["admin", "owner"]); (data ?? []).forEach((x: { email: string | null }) => { if (x.email) set.add(x.email.toLowerCase()); }); } catch (_) { /* rien */ }
  env("MAIL_TEAM").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean).forEach((e) => set.add(e));
  return [...set];
}

/** A-t-on déjà envoyé ce type de mail pour ce dossier ? (évite les doublons quand le client recharge) */
export async function alreadySent(leadId: number, kind: string): Promise<boolean> {
  const { data } = await serviceClient().from("mail_log").select("id").eq("lead_id", leadId).eq("kind", kind).eq("ok", true).limit(1);
  return !!(data && data.length);
}

/** Fichier iCal d'une visite, en base64, pour pièce jointe. */
export function icsFor(opts: { uid: string; start: Date; end: Date; title: string; location: string; description: string }): string {
  const z = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const x = (v: string) => v.replace(/\\/g, "\\\\").replace(/[,;]/g, (m) => "\\" + m).replace(/\n/g, "\\n");
  const ics = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Cotalia//Visite technique//FR", "CALSCALE:GREGORIAN", "METHOD:PUBLISH", "BEGIN:VEVENT", "UID:" + opts.uid, "DTSTAMP:" + z(new Date()), "DTSTART:" + z(opts.start), "DTEND:" + z(opts.end), "SUMMARY:" + x(opts.title), "LOCATION:" + x(opts.location), "DESCRIPTION:" + x(opts.description), "BEGIN:VALARM", "TRIGGER:-P1D", "ACTION:DISPLAY", "DESCRIPTION:" + x(opts.title), "END:VALARM", "END:VEVENT", "END:VCALENDAR"].join("\r\n");
  return btoa(unescape(encodeURIComponent(ics)));
}
export const KIND_LABEL: Record<string, string> = { appart: "Appartement", maison: "Maison", immeuble: "Immeuble" };
export const leadName = (l: { prenom?: string | null; nom?: string | null }) => [l.prenom, l.nom].filter(Boolean).join(" ").trim();
export const leadBien = (l: { type_bien?: string | null; surface?: number | null; ville?: string | null; adresse?: string | null }) => [KIND_LABEL[l.type_bien ?? ""] ?? l.type_bien, l.surface ? l.surface + " m²" : "", l.ville || l.adresse || ""].filter(Boolean).join(" · ");
