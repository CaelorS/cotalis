/* Cotalia - page d'accueil : e-mail de contact, liste des estimations (navigateur + compte). */
(function () {
  'use strict';
  const CFG = window.COTALIA_CONFIG || {};
  const C = window.COTALIA || {};
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
  const eur = v => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(v);
  const KIND = { appart: 'Appartement', maison: 'Maison', immeuble: 'Immeuble' };
  if (CFG.contactEmail) document.getElementById('foot-contact').innerHTML = '<a href="mailto:' + esc(CFG.contactEmail) + '">' + esc(CFG.contactEmail) + '</a>';

  function localItems() {
    const items = [];
    try {
      const cur = JSON.parse(localStorage.getItem('cotalia-tunnel-v2') || 'null');
      if (cur && cur.kind && (cur.maxIdx || 0) < 6) items.push({ resume: true, href: 'estimation.html', label: 'Reprendre l\'estimation en cours', when: '', amt: '→' });
      JSON.parse(localStorage.getItem('cotalia-projects') || '[]').filter(p => p.done).forEach(p => items.push({ pid: p.pid, href: 'estimation.html?p=' + encodeURIComponent(p.pid), label: p.label, at: p.at, amt: p.ttc ? eur(p.ttc) : '' }));
    } catch (e) {}
    return items;
  }
  async function accountItems(A) {
    if (!A.user || !A.sb) return [];
    try {
      const { data } = await A.sb.from('projects').select('id,data,updated_at').eq('user_id', A.user.id).order('updated_at', { ascending: false }).limit(50);
      return (data || []).map(r => {
        const d = r.data || {};
        const label = (KIND[d.kind] || 'Projet') + (d.ville ? ' · ' + d.ville : (d.adresse ? ' · ' + d.adresse : '')) + (d.surface ? ' · ' + (+d.surface).toLocaleString('fr-FR') + ' m²' : '');
        return { pid: r.id, href: 'estimation.html?p=' + encodeURIComponent(r.id), label, at: r.updated_at, amt: '' };
      });
    } catch (e) { return []; }
  }
  function render(items) {
    const seen = new Set(), list = [];
    items.forEach(it => { const k = it.pid || it.href; if (seen.has(k)) return; seen.add(k); list.push(it); });
    list.sort((a, b) => (a.resume ? -1 : b.resume ? 1 : String(b.at || '').localeCompare(String(a.at || ''))));
    const ul = document.getElementById('mine-list'), sec = document.getElementById('mine');
    if (!list.length) { sec.classList.add('hidden'); return; }
    ul.innerHTML = list.map(it => `<li${it.resume ? ' class="resume"' : ''}><a href="${it.href}"><span class="lbl">${esc(it.label)}</span><span class="when">${it.at ? esc(new Date(it.at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })) : ''}</span><span class="amt">${esc(it.amt || '')}</span></a></li>`).join('');
    sec.classList.remove('hidden');
  }
  render(localItems());
  if (C.auth) C.auth.onChange(async A => { render(localItems().concat(await accountItems(A))); });
})();
