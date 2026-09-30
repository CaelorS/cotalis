// Réservation d'une visite technique : crée le rendez-vous et les blocs de trajet dans l'agenda attribué,
// invite le client, met le dossier en « Visite planifiée ».
import { CORS, json, env, TZ, serviceClient, loadRules, offersFor, leadOf, parisParts, label } from "../_shared/google.ts";
import { SITE, sendMail, layout, p, btn, kv, icsFor, esc, leadBien, mailConfigured, callLine } from "../_shared/mail.ts";

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
    const [lead, rules] = await Promise.all([leadOf(project_id, token), loadRules()]);
    if (!lead) { console.error("gcal-book: projet ou dossier introuvable", project_id); return json({ error: "projet inconnu" }, 403); }
    if (!lead.email) return json({ error: "coordonnées introuvables" }, 400);

    const at = new Date(start);
    const offers = await offersFor(lead, rules, new Date(at.getTime() + 864e5));
    if (!offers.length) return json({ error: "agenda non connecté" }, 503);
    const offer = offers.find((o) => o.t === at.getTime());
    if (!offer) { console.error("gcal-book: créneau indisponible", start, "offres", offers.length); return json({ error: "créneau plus disponible" }, 409); }

    const end = new Date(at.getTime() + rules.duration * 60e3);
    const who = [lead.prenom, lead.nom].filter(Boolean).join(" ");
    const bien = [KIND[lead.type_bien] ?? lead.type_bien, lead.surface ? lead.surface + " m²" : ""].filter(Boolean).join(" · ");
    const lien = (env("SITE_URL") || "https://cotalia.fr") + "/estimation/?p=" + encodeURIComponent(project_id);
    const main = await createEvent(offer.token, {
      summary: "Visite technique · " + who,
      location: lead.adresse ?? "",
      description: `${bien}\nEstimation travaux : ${Math.round(lead.estimation_ttc ?? 0).toLocaleString("fr-FR")} € TTC\nTéléphone : ${lead.tel ?? ""}\nDossier : ${lien}`,
      start: { dateTime: at.toISOString(), timeZone: TZ }, end: { dateTime: end.toISOString(), timeZone: TZ },
      attendees: [{ email: lead.email, displayName: who }],
      reminders: { useDefault: false, overrides: [{ method: "popup", minutes: 24 * 60 }, { method: "email", minutes: 24 * 60 }] },
    }, true);
    if (offer.buffer > 0) {
      const b = offer.buffer * 60e3;
      await createEvent(offer.token, { summary: "Trajet · visite " + who, start: { dateTime: new Date(at.getTime() - b).toISOString(), timeZone: TZ }, end: { dateTime: at.toISOString(), timeZone: TZ }, colorId: "8" }, false);
      await createEvent(offer.token, { summary: "Trajet retour · visite " + who, start: { dateTime: end.toISOString(), timeZone: TZ }, end: { dateTime: new Date(end.getTime() + b).toISOString(), timeZone: TZ }, colorId: "8" }, false);
    }
    const rank = ["nouveau", "contacte", "relance", "visite", "devis", "signe", "perdu"];
    const p = parisParts(at);
    const patch: Record<string, unknown> = { visite_at: at.toISOString(), visite_event: main.id, visite_with: offer.account.id, next_action: `${p.y}-${String(p.m).padStart(2, "0")}-${String(p.d).padStart(2, "0")}` };
    if (rank.indexOf(lead.status ?? "nouveau") < rank.indexOf("visite")) patch.status = "visite";
    if (!lead.assigned_to && offer.account.user_id) patch.assigned_to = offer.account.user_id;
    await serviceClient().from("leads").update(patch).eq("id", lead.id);
    // confirmation à la marque Cotalia, avec le fichier d'agenda ; l'invitation Google part en parallèle
    if (mailConfigured()) {
      const q = encodeURIComponent, z = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
      const title = "Visite technique Cotalia", txt = "Visite technique de votre bien avec " + label(offer.account) + ". Estimation : " + lien;
      const gcal = "https://calendar.google.com/calendar/render?action=TEMPLATE&text=" + q(title) + "&dates=" + z(at) + "/" + z(end) + "&details=" + q(txt) + "&location=" + q(lead.adresse ?? "");
      const html = layout("Votre visite est confirmée",
        p("Bonjour " + esc(lead.prenom || "") + ", rendez-vous est pris pour la visite technique de votre bien.") +
        kv([["Date", esc(fmt(at))], ["Adresse", esc(lead.adresse || "—")], ["Avec", esc(label(offer.account))], ["Durée", "environ " + rules.duration + " min"]]) +
        p("Le fichier joint ajoute la visite à votre agenda. Pour la déplacer ou l'annuler, passez par votre page d'estimation.") +
        btn(lien, "Voir mon estimation") + btn(gcal, "Ajouter à Google Agenda", false) + callLine(),
        "Visite le " + fmt(at));
      await sendMail({ to: lead.email, subject: "Visite technique confirmée · " + fmt(at), html, text: `Visite technique confirmée le ${fmt(at)} à ${lead.adresse ?? ""}, avec ${label(offer.account)}. Estimation : ${lien}`, attachments: [{ filename: "visite-cotalia.ics", content: icsFor({ uid: "visite-" + project_id + "@cotalia.fr", start: at, end, title, location: lead.adresse ?? "", description: txt }) }], leadId: lead.id, kind: "visite" });
    }
    return json({ ok: true, start: at.toISOString(), end: end.toISOString(), label: fmt(at), email: lead.email, with: label(offer.account) });
  } catch (e) {
    console.error("gcal-book: échec", String(e?.message ?? e));
    return json({ error: String(e?.message ?? e).slice(0, 300) }, 500);
  }
});
