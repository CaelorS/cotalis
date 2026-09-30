// E-mails à l'envoi d'un dossier : estimation prête (client + équipe), demande de rappel (client + équipe).
// Appelée par le tunnel avec le projet et son jeton ; un même mail n'est envoyé qu'une fois par dossier.
import { CORS, json, leadOf } from "../_shared/google.ts";
import { SITE, sendMail, teamEmails, alreadySent, layout, p, btn, kv, big, eur, esc, leadName, leadBien, mailConfigured } from "../_shared/mail.ts";

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
        btn(link, "Voir mon estimation") + btn(link + "#visite", "Planifier la visite technique", false) +
        p("<span style=\"color:#7B8794;font-size:13.5px\">Estimation indicative établie sans visite. Un devis ferme est remis après visite technique.</span>"),
        "Estimation centrale " + eur(lead.estimation_ttc) + " TTC");
      out = await sendMail({ to: lead.email, subject: "Votre estimation travaux Cotalia : " + eur(lead.estimation_ttc) + " TTC", html, text: `Votre estimation travaux : ${eur(lead.estimation_ttc)} TTC (fourchette ${eur(lead.estimation_basse)} à ${eur(lead.estimation_haute)}). Détail : ${link}`, leadId: lead.id, kind });
      if (team.length) await sendMail({ to: team, subject: "Nouvelle estimation · " + name + " · " + eur(lead.estimation_ttc), html: layout("Nouvelle estimation", kv([["Client", esc(name)], ["E-mail", esc(lead.email)], ["Téléphone", esc(lead.tel || "—")], ["Bien", esc(bien)], ["Adresse", esc(lead.adresse || "—")], ["Travaux TTC", eur(lead.estimation_ttc)], ["Financement", esc(lead.finance || "—")]]) + btn(admin, "Ouvrir le back-office") + btn(link, "Voir l'estimation", false)), leadId: lead.id, kind: "equipe" });
    } else {
      const html = layout(`Bien reçu${prenom ? ", " + esc(prenom) : ""}`,
        p("Votre demande de rappel est enregistrée. Un membre de l'équipe Cotalia vous appelle rapidement au <b>" + esc(lead.tel || "numéro indiqué") + "</b> pour affiner votre projet : <b>" + esc(bien) + "</b>.") +
        p("En attendant, votre estimation reste consultable ici :") + btn(link, "Voir mon estimation"),
        "Demande de rappel enregistrée");
      out = await sendMail({ to: lead.email, subject: "Cotalia : votre demande de rappel est enregistrée", html, text: "Votre demande de rappel est enregistrée. Estimation : " + link, leadId: lead.id, kind });
      if (team.length) await sendMail({ to: team, subject: "Demande de rappel · " + name + " · " + (lead.tel || ""), html: layout("Demande de rappel", p("<b>" + esc(name) + "</b> souhaite être rappelé.") + kv([["Téléphone", esc(lead.tel || "—")], ["E-mail", esc(lead.email)], ["Bien", esc(bien)], ["Travaux TTC", eur(lead.estimation_ttc)]]) + btn(admin, "Ouvrir le back-office")), leadId: lead.id, kind: "equipe" });
    }
    return json({ ok: out.ok, error: out.error });
  } catch (e) {
    console.error("mail-lead: échec", String(e?.message ?? e));
    return json({ error: String(e?.message ?? e).slice(0, 300) }, 500);
  }
});
