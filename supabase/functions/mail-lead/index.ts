// E-mails à l'envoi d'un dossier : estimation prête (client + équipe), demande de rappel (client + équipe).
// Appelée par le tunnel avec le projet et son jeton ; un même mail n'est envoyé qu'une fois par dossier.
import { CORS, json, leadOf, env } from "../_shared/google.ts";
import { SITE, sendMail, teamEmails, alreadySent, layout, p, btn, kv, big, eur, esc, leadName, leadBien, mailConfigured, callLine, PHONE, KIND_LABEL } from "../_shared/mail.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "méthode" }, 405);
  try {
    const { project_id, token, kind } = await req.json();
    if (!["estimation", "rappel"].includes(kind)) return json({ error: "type inconnu" }, 400);
    const lead = await leadOf(project_id, token);
    if (!lead || !lead.email) return json({ error: "dossier introuvable" }, 403);
    if (!mailConfigured()) return json({ ok: false, skipped: "envoi non configuré" });
    if (await alreadySent(lead.id, kind)) return json({ ok: true, skipped: "déjà envoyé" });

    const name = leadName(lead), prenom = lead.prenom || "", bien = leadBien(lead);
    const link = SITE() + "/estimation/?p=" + encodeURIComponent(project_id);
    const admin = SITE() + "/admin/";
    const team = lead.kind === "test" ? [] : await teamEmails();   // un dossier de test ne dérange pas l'équipe
    let out;
    if (kind === "estimation") {
      const html = layout(`Votre estimation est prête${prenom ? ", " + esc(prenom) : ""}`,
        p("Merci pour vos réponses. Voici l'estimation des travaux pour votre bien : <b>" + esc(bien) + "</b>.") +
        big(eur(lead.estimation_ttc), "travaux TTC, estimation centrale · fourchette de " + eur(lead.estimation_basse) + " à " + eur(lead.estimation_haute)) +
        p("Le détail par lot, les hypothèses et la synthèse de financement sont sur votre page d'estimation, que vous pouvez partager ou télécharger en PDF.") +
        btn(link, "Voir mon estimation") + btn(link + "#visite", "Planifier la visite technique", false) + callLine() +
        p("<span style=\"color:#7B8794;font-size:13.5px\">Estimation indicative établie sans visite. Un devis ferme est remis après visite technique.</span>"),
        "Estimation centrale " + eur(lead.estimation_ttc) + " TTC");
      out = await sendMail({ to: lead.email, subject: "Votre estimation travaux Cotalia : " + eur(lead.estimation_ttc) + " TTC", html, text: `Votre estimation travaux : ${eur(lead.estimation_ttc)} TTC (fourchette ${eur(lead.estimation_basse)} à ${eur(lead.estimation_haute)}). Détail : ${link}. Une question ? ${PHONE()}`, leadId: lead.id, kind });
      if (team.length) await sendMail({ to: team, subject: "Nouvelle estimation · " + name + " · " + eur(lead.estimation_ttc), html: layout("Nouvelle estimation", kv([["Client", esc(name)], ["E-mail", esc(lead.email)], ["Téléphone", esc(lead.tel || "—")], ["Bien", esc(bien)], ["Adresse", esc(lead.adresse || "—")], ["Travaux TTC", eur(lead.estimation_ttc)], ["Financement", esc(lead.finance || "—")]]) + btn(admin, "Ouvrir le back-office") + btn(link, "Voir l'estimation", false)), leadId: lead.id, kind: "equipe" });
    } else {
      const html = layout(`Bien reçu${prenom ? ", " + esc(prenom) : ""}`,
        p("Votre demande de rappel est enregistrée. Un membre de l'équipe Cotalia vous appelle rapidement au <b>" + esc(lead.tel || "numéro indiqué") + "</b> pour affiner votre projet : <b>" + esc(bien) + "</b>.") +
        p("En attendant, votre estimation reste consultable ici :") + btn(link, "Voir mon estimation") + callLine(),
        "Demande de rappel enregistrée");
      out = await sendMail({ to: lead.email, subject: "Cotalia : votre demande de rappel est enregistrée", html, text: "Votre demande de rappel est enregistrée. Estimation : " + link, leadId: lead.id, kind });
      // fiche complète pour la personne qui rappelle (MAIL_RAPPEL, Simon par défaut) ; le reste de l'équipe reçoit l'avis court
      const callers = lead.kind === "test" ? [lead.email] : (env("MAIL_RAPPEL") || "simon.lorphelin@gmail.com").split(",").map((x) => x.trim().toLowerCase()).filter(Boolean);
      if (callers.length) await sendMail({ to: callers, subject: "À rappeler · " + name + " · " + (lead.tel || "") + " · " + eur(lead.estimation_ttc), html: callSheet(lead, link, admin), replyTo: lead.email, leadId: lead.id, kind: "rappel-fiche" });
      const others = team.filter((x) => !callers.includes(x));
      if (others.length) await sendMail({ to: others, subject: "Demande de rappel · " + name + " · " + (lead.tel || ""), html: layout("Demande de rappel", p("<b>" + esc(name) + "</b> souhaite être rappelé.") + kv([["Téléphone", esc(lead.tel || "—")], ["E-mail", esc(lead.email)], ["Bien", esc(bien)], ["Travaux TTC", eur(lead.estimation_ttc)]]) + btn(admin, "Ouvrir le back-office")), leadId: lead.id, kind: "equipe" });
    }
    return json({ ok: out.ok, error: out.error });
  } catch (e) {
    console.error("mail-lead: échec", String(e?.message ?? e));
    return json({ error: String(e?.message ?? e).slice(0, 300) }, 500);
  }
});

/* ---------- fiche de rappel : tout ce qu'il faut pour appeler sans ouvrir le back-office ---------- */
const FIN: Record<string, string> = { oui: "Accompagnement au financement demandé", renta: "Calcul de rentabilité seul", non: "Sans volet financement" };
const STADE: Record<string, string> = { etude: "En étude", compromis: "Sous compromis", acte: "Acte authentique signé", proprio: "Déjà propriétaire" };
const DEM: Record<string, string> = { "1": "dès que possible", "3": "sous 3 mois", "6": "sous 6 mois", later: "travaux non planifiés pour l'instant" };
const ETAT: Record<string, string> = { bon: "Bon", correct: "Correct", degrade: "Dégradé", total: "À rénover entièrement" };
const EPOQUE: Record<string, string> = { "1930": "avant 1948", "1960": "1948 à 1974", "2000": "1975 et après", "2025": "neuf, moins de 2 ans" };
const GAMME: Record<string, string> = { eco: "économique", std: "standard locatif", prem: "premium" };
const STRAT: Record<string, string> = { nue: "location nue", meuble: "location meublée", coloc: "colocation", revente: "achat-revente" };
const TRI: Record<string, string> = { oui: "oui", non: "non" };
function callSheet(lead: any, link: string, admin: string): string {
  const pl = lead.payload ?? {}, b = pl.bien ?? {}, i = pl.interne ?? {}, acq = pl.acquisition ?? {}, sit = lead.situation ?? {};
  const name = leadName(lead), tel = String(lead.tel ?? ""), telHref = "tel:" + tel.replace(/[^+\d]/g, "");
  const h = (t: string) => `<h2 style="margin:22px 0 4px;font-size:16px;color:#2457A6">${t}</h2>`;
  const opt = (rows: Array<[string, string | null | undefined | false]>) => kv(rows.filter((r) => r[1]).map((r) => [r[0], String(r[1])]) as Array<[string, string]>);
  const lines: any[] = Array.isArray(pl.lines) ? pl.lines : [];
  const lots: string[] = []; lines.forEach((x) => { if (!lots.includes(x.lot)) lots.push(x.lot); });
  const works = lines.length
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin:8px 0 16px;border-top:1px solid #E6EAF0;font-size:13.5px">${lots.map((lot) => `<tr><td colspan="3" style="padding:8px 6px;background:#F3F5F8;font-weight:700;color:#17212B">${esc(lot)}</td></tr>` + lines.filter((x) => x.lot === lot).map((x) => `<tr><td style="padding:6px 0;border-bottom:1px solid #E6EAF0;color:#2B3642">${esc(x.label)}</td><td align="right" style="padding:6px 8px;border-bottom:1px solid #E6EAF0;color:#7B8794;white-space:nowrap">${esc(x.q)} ${esc(x.unit)}</td><td align="right" style="padding:6px 0;border-bottom:1px solid #E6EAF0;color:#17212B;font-weight:600;white-space:nowrap">${eur(x.amount)}</td></tr>`).join("")).join("")}</table>`
    : p(esc(Object.keys(pl.works ?? {}).filter((k) => pl.works[k]).join(", ") || "aucun ouvrage enregistré"));
  const fin = lead.finance === "oui" || lead.finance === "renta";
  return layout("À rappeler : " + esc(name),
    `<p style="margin:0 0 14px"><a href="${telHref}" style="display:inline-block;padding:12px 20px;border-radius:5px;background:#2F855A;color:#FFFFFF;font-size:19px;font-weight:700;text-decoration:none">Appeler ${esc(tel)}</a></p>` +
    p("Demande de rappel reçue depuis son estimation" + (lead.ref ? ", réf. " + esc(lead.ref) : "") + ".") +
    h("Contact") + opt([["Nom", esc(name)], ["Téléphone", esc(tel)], ["E-mail", esc(lead.email)]]) +
    h("Bien") + opt([["Type", esc([KIND_LABEL[lead.type_bien] ?? lead.type_bien, b.type ? String(b.type).toUpperCase() : ""].filter(Boolean).join(" · "))], ["Adresse", esc(lead.adresse)], ["Surface", lead.surface ? lead.surface + " m²" : ""], ["Pièces d'eau", b.eau ? esc(b.eau) : ""], ["Étage", b.etage !== "" && b.etage != null ? esc(b.etage) + (b.ascenseur ? " · ascenseur : " + esc(TRI[b.ascenseur] ?? b.ascenseur) : "") : ""], ["Époque", esc(EPOQUE[String(b.annee)] ?? "")], ["DPE", esc(b.dpe)], ["État général", esc(ETAT[b.etat] ?? b.etat)], ["Occupé pendant les travaux", esc(TRI[b.occupe] ?? "")], ["Accès difficile", esc(TRI[b.acces] ?? "")], ["Photos et plans", (pl.files ?? []).length ? (pl.files.length + " fichier(s), visibles dans le back-office") : ""]]) +
    h("Projet") + opt([["Où il en est", esc(STADE[lead.stade] ?? lead.stade)], ["Démarrage souhaité", esc(DEM[String(lead.demarrage ?? "")] ?? "")], ["Finition visée", esc(GAMME[lead.gamme] ?? lead.gamme)]]) +
    h("Chiffrage") + big(eur(lead.estimation_ttc), "travaux TTC · fourchette de " + eur(lead.estimation_basse) + " à " + eur(lead.estimation_haute)) + opt([["Total HT", i.ht ? eur(i.ht) : ""], ["Durée probable", i.weeks ? i.weeks + " semaines" : ""], ["Prix au m²", lead.surface && lead.estimation_ttc ? eur(lead.estimation_ttc / lead.surface) + " TTC" : ""]]) +
    h("Travaux retenus") + works +
    h("Financement") + opt([["Volet financement", esc(FIN[lead.finance] ?? "non renseigné")], ["Prix d'achat", fin && lead.prix ? eur(lead.prix) : ""], ["Stratégie", fin ? esc(STRAT[lead.strat] ?? lead.strat) : ""], ["Loyer visé", fin && lead.loyer ? eur(lead.loyer) + " / mois" : ""], ["Apport", fin && acq.apport ? eur(+acq.apport) : ""], ["Taux et durée", fin && acq.taux ? acq.taux + " % sur " + (acq.duree ?? "?") + " ans" : ""], ["Coût total du projet", i.total ? eur(i.total) : ""], ["Rendement brut", i.brut ? (i.brut * 100).toFixed(1).replace(".", ",") + " %" : ""], ["Cash-flow mensuel", i.cf != null && i.total ? (i.cf >= 0 ? "+" : "−") + eur(Math.abs(i.cf)) : ""], ["Situation", esc([sit.statut, sit.revenus ? "revenus " + eur(+sit.revenus) : "", sit.credits ? "crédits " + eur(+sit.credits) : "", sit.proprietaire].filter(Boolean).join(" · "))]]) +
    btn(admin, "Ouvrir le back-office") + btn(link, "Voir son estimation", false),
    "Rappeler " + name + " au " + tel);
}
