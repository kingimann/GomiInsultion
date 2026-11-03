const C = window.GOMI;
const sb = supabase.createClient(C.SUPABASE_URL, C.SUPABASE_ANON_KEY);
const $app = document.getElementById('app');
const STATUSES = ['pending', 'paid', 'shipped', 'delivered', 'cancelled', 'refunded'];
let FREE_SHIP = 50000, SHIP = 1500;
let SEO = {};
let STORE = { ship_flat_cents: 1500, free_over_cents: 50000, tax_rate: 0, tax_label: 'Tax', biz: {} };
function applyStoreCfg(v) { STORE = { ...STORE, ...(v || {}) }; FREE_SHIP = Number(STORE.free_over_cents) || 0; SHIP = Number(STORE.ship_flat_cents) || 0; renderClosedBar(); renderFooter(); }
const shopClosed = () => !!STORE.closed && (!STORE.closed_until || STORE.closed_until > new Date().toISOString().slice(0, 10));
const closedMsg = () => (STORE.closed_message || '').trim() || 'We are not taking online orders right now. You can still browse and fill your cart — please check back soon.';
const reopenNote = () => STORE.closed_until ? ` We reopen on ${new Date(STORE.closed_until + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}.` : '';
function renderClosedBar() {
  let el = document.querySelector('.closedbar');
  if (!shopClosed()) { el?.remove(); return; }
  if (!el) { el = document.createElement('div'); el.className = 'closedbar'; el.setAttribute('role', 'status'); const an = document.querySelector('.announce'); an ? an.after(el) : document.body.prepend(el); }
  el.innerHTML = ':ic-lock: <b>Shop closed</b> — ' + esc(closedMsg()) + esc(reopenNote()) + (profile && isStaff() ? ' <a href="#/admin/settings">Reopen</a>' : '');
}
async function setShopClosed(closed, message) {
  const { data } = await sb.from('site_settings').select('value').eq('key', 'store').maybeSingle();
  const value = { ...(data?.value || {}), closed: !!closed, closed_until: closed ? '' : (data?.value?.closed_until || '') }; if (message !== undefined) value.closed_message = message;
  const { error } = await sb.from('site_settings').upsert({ key: 'store', value, updated_at: new Date().toISOString() }); if (error) return fail(error);
  applyStoreCfg(value); flash(closed ? 'Shop closed — online ordering is off.' : 'Shop open — online ordering is on.'); route();
}

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// ---- themes ----
const THEME_OPTS = {
  mode: { label: 'Mode', vals: [['', 'Auto'], ['light', 'Light'], ['dark', 'Dark']] },
  accent: { label: 'Colour', swatch: true, vals: [['', '#ea580c'], ['amber', '#d97706'], ['rose', '#e11d48'], ['pink', '#db2777'], ['purple', '#7c3aed'], ['blue', '#2563eb'], ['teal', '#0d9488'], ['green', '#16a34a'], ['slate', '#334155']] },
  header: { label: 'Header', vals: [['', 'Light'], ['brand', 'Brand colour'], ['dark', 'Dark']] },
  hero: { label: 'Home banner', vals: [['', 'Gradient'], ['solid', 'Solid'], ['minimal', 'Minimal']] },
  cards: { label: 'Cards', vals: [['', 'Soft'], ['flat', 'Flat'], ['outlined', 'Outlined'], ['lifted', 'Lifted']] },
  buttons: { label: 'Buttons', vals: [['', 'Solid'], ['outline', 'Outline'], ['gradient', 'Gradient']] },
  radius: { label: 'Corners', vals: [['sharp', 'Sharp'], ['', 'Rounded'], ['pill', 'Pill']] },
  font: { label: 'Font', vals: [['', 'Modern'], ['rounded', 'Rounded'], ['classic', 'Classic'], ['elegant', 'Elegant'], ['technical', 'Technical']] },
  size: { label: 'Text size', vals: [['small', 'Small'], ['', 'Normal'], ['large', 'Large']] },
  density: { label: 'Spacing', vals: [['', 'Comfortable'], ['compact', 'Compact']] },
  width: { label: 'Page width', vals: [['narrow', 'Narrow'], ['', 'Standard'], ['wide', 'Wide']] },
};
const PRESETS = {
  Default: {}, Sunrise: { accent: 'amber', header: 'brand', hero: 'solid', buttons: 'gradient', radius: 'pill' },
  Ocean: { accent: 'blue', header: 'brand', radius: 'pill' }, Forest: { accent: 'green', font: 'classic', hero: 'minimal' },
  Fresh: { accent: 'teal', header: 'brand', cards: 'flat', font: 'rounded' }, Midnight: { mode: 'dark', accent: 'purple', header: 'dark' },
  Boutique: { accent: 'rose', font: 'elegant', cards: 'outlined', hero: 'minimal', radius: 'sharp' }, Playful: { accent: 'pink', font: 'rounded', radius: 'pill', buttons: 'gradient', cards: 'lifted' },
  Workshop: { accent: 'slate', radius: 'sharp', font: 'technical', density: 'compact' },
};
// The theme is site-wide: only admins can change it (saved in the database); everyone else just receives it.
// A cached copy is applied immediately to avoid a flash of the default look.
let theme = {};
try { theme = JSON.parse(localStorage.getItem('site_theme') || 'null') || window.GOMI.DEFAULT_THEME || {}; } catch { theme = window.GOMI.DEFAULT_THEME || {}; }
const HEX = /^#[0-9a-f]{6}$/i;
const isDark = () => document.documentElement.dataset.mode === 'dark' || (!document.documentElement.dataset.mode && window.matchMedia?.('(prefers-color-scheme: dark)').matches);
function applyTheme() {
  const root = document.documentElement; setTimeout(applyVisitorMode, 0);
  for (const [k, o] of Object.entries(THEME_OPTS)) { const v = theme[k]; if (v && o.vals.some(([x]) => x === v)) root.dataset[k] = v; else delete root.dataset[k]; }
  const custom = ['--brand', '--brand-d', '--brand-soft', '--hero-a', '--hero-b', '--hero-c', '--hero-fg', '--ph-a', '--ph-b', '--ph-fg'];
  custom.forEach((v) => root.style.removeProperty(v));
  if (HEX.test(theme.custom || '')) {
    const c = theme.custom, mix = (pct, w) => `color-mix(in srgb, ${c} ${pct}%, ${w})`;
    root.style.setProperty('--brand', c); root.style.setProperty('--brand-d', mix(82, '#000'));
    root.style.setProperty('--ph-a', mix(35, '#fff')); root.style.setProperty('--ph-b', mix(75, '#fff')); root.style.setProperty('--ph-fg', mix(45, '#000'));
    if (!isDark()) { root.style.setProperty('--brand-soft', mix(14, '#fff')); root.style.setProperty('--hero-a', mix(55, '#fff')); root.style.setProperty('--hero-b', mix(32, '#fff')); root.style.setProperty('--hero-c', mix(10, '#fff')); root.style.setProperty('--hero-fg', mix(28, '#000')); }
  }
  try { localStorage.setItem('site_theme', JSON.stringify(theme)); } catch {}
  applyBranding();
}
function applyBranding() {
  const name = (theme.name || '').trim() || 'Gomi Insulation';
  const brand = document.querySelector('.brand'); if (brand) brand.innerHTML = ':ic-home: ' + esc(name);
  const fb = document.querySelector('footer .foot b'); if (fb) fb.innerHTML = ':ic-home: ' + esc(name);
  const text = typeof theme.announce === 'string' ? theme.announce.trim() : window.GOMI.ANNOUNCEMENT;
  let el = document.querySelector('.announce');
  if (text) { if (!el) { el = document.createElement('div'); el.className = 'announce'; document.body.prepend(el); } el.textContent = text; } else el?.remove();
}
window.matchMedia?.('(prefers-color-scheme: dark)').addEventListener?.('change', applyTheme);
applyTheme();
async function loadSiteTheme() {
  const { data } = await sb.from('site_settings').select('key,value').in('key', ['theme', 'store', 'seo']);
  (Array.isArray(data) ? data : []).forEach((r) => { if (r.key === 'theme') { theme = r.value || {}; applyTheme(); } else if (r.key === 'store') applyStoreCfg(r.value); else if (r.key === 'seo') { SEO = r.value || {}; applyTracking(); } });
}
async function saveSiteTheme() {
  if (!profile?.is_admin) return;
  const { error } = await sb.from('site_settings').upsert({ key: 'theme', value: theme, updated_at: new Date().toISOString() });
  error ? fail(error) : flash('Site style saved for all visitors.');
}
function buildStylePanel() {
  const el = document.getElementById('stylepanel'); if (!el) return;
  el.innerHTML = `<h3>:ic-sliders: Site style</h3><p class="muted" style="margin:-4px 0 10px;font-size:.85rem">Changes apply to every visitor (admins only).</p>
  <fieldset><legend>Presets</legend><div class="opts">${Object.keys(PRESETS).map((n) => `<button data-preset="${n}">${n}</button>`).join('')}</div></fieldset>
  ${Object.entries(THEME_OPTS).map(([k, o]) => `<fieldset><legend>${o.label}</legend><div class="opts">${o.vals.map(([v, l]) => o.swatch
    ? `<button class="sw" data-k="${k}" data-v="${v}" style="background:${l}" aria-label="${v || 'orange'}" aria-pressed="${!theme.custom && (theme[k] || '') === v}"></button>`
    : `<button data-k="${k}" data-v="${v}" aria-pressed="${(theme[k] || '') === v}">${l}</button>`).join('')}</div>
    ${k === 'accent' ? `<div class="row" style="margin-top:8px"><label class="muted" style="display:flex;gap:8px;align-items:center">Custom <input type="color" id="customcolor" value="${HEX.test(theme.custom || '') ? theme.custom : '#ea580c'}" style="width:48px;height:34px;padding:2px"></label>${theme.custom ? '<button class="link" id="clearcolor" style="color:var(--brand)">Use preset colour</button>' : ''}</div>` : ''}</fieldset>`).join('')}
  <fieldset><legend>Store name</legend><input id="storename" maxlength="40" value="${esc(theme.name || '')}" placeholder="Gomi Insulation" style="width:100%"></fieldset>
  <fieldset><legend>Announcement bar</legend><input id="announce" maxlength="200" value="${esc(typeof theme.announce === 'string' ? theme.announce : (window.GOMI.ANNOUNCEMENT || ''))}" placeholder="Leave empty to hide the bar" style="width:100%"></fieldset>`;
}
document.addEventListener('click', (e) => {
  const panel = document.getElementById('stylepanel');
  if (e.target.closest('#stylebtn')) { if (!profile?.is_admin) return; buildStylePanel(); panel.hidden = !panel.hidden; return; }
  if (panel && !panel.hidden && !e.target.closest('#stylepanel')) panel.hidden = true;
  const b = e.target.closest('#stylepanel button'); if (!b || !profile?.is_admin) return;
  if (b.id === 'clearcolor') delete theme.custom;
  else if (b.dataset.preset) { const keep = {}; if ('name' in theme) keep.name = theme.name; if ('announce' in theme) keep.announce = theme.announce; theme = { ...keep, ...PRESETS[b.dataset.preset] }; }
  else if (b.dataset.k) { theme = { ...theme, [b.dataset.k]: b.dataset.v }; if (b.dataset.k === 'accent') delete theme.custom; }
  else return;
  applyTheme(); buildStylePanel(); saveSiteTheme();
});
document.addEventListener('input', (e) => { if (e.target.id === 'customcolor' && profile?.is_admin) { theme = { ...theme, custom: e.target.value }; applyTheme(); } });
document.addEventListener('change', (e) => {
  if (!profile?.is_admin) return;
  if (e.target.id === 'customcolor') { theme = { ...theme, custom: e.target.value }; applyTheme(); buildStylePanel(); saveSiteTheme(); }
  else if (e.target.id === 'storename') { theme = { ...theme, name: e.target.value.trim().slice(0, 40) }; applyTheme(); saveSiteTheme(); }
  else if (e.target.id === 'announce') { theme = { ...theme, announce: e.target.value.trim().slice(0, 200) }; applyTheme(); saveSiteTheme(); }
});

// ---- helpers ----
const money = (c) => `${c < 0 ? '-' : ''}${C.CURRENCY}${(Math.abs(c) / 100).toFixed(2)}`;
const safeUrl = (u) => (/^(https?:\/\/|\/)/.test(u || '') ? u : '');
let session = null, profile = null;
let unread = { all: 0, msg: 0 }, notifChan = null, threadChan = [], perms = [];
const can = (p) => !!profile && profile.role !== 'customer' && (profile.role === 'owner' || perms.includes('*') || perms.includes(p));
const isStaff = () => !!profile && profile.role && profile.role !== 'customer';
const getCart = () => { try { return JSON.parse(localStorage.getItem('cart') || '{}'); } catch { return {}; } };
const setCart = (c) => { localStorage.setItem('cart', JSON.stringify(c)); renderNav(); syncCart(); };
// Keep a server copy of carts we can contact (logged-in customers, or guests who typed an email at checkout) so the team hears about abandoned carts.
const cartKey = () => { let k = localStorage.getItem('cart_key'); if (!k) { k = crypto.randomUUID(); localStorage.setItem('cart_key', k); } return k; };
let cartSyncT = null;
function syncCart() {
  clearTimeout(cartSyncT);
  cartSyncT = setTimeout(async () => { try {
    const items = Object.entries(getCart()).map(([id, qty]) => ({ id: Number(id), qty })), email = session?.user.email || localStorage.getItem('cart_email') || '';
    if (!items.length) { if (localStorage.getItem('cart_key')) await sb.rpc('clear_cart', { skey: cartKey() }); return; }
    if (!email) return;
    await sb.rpc('save_cart', { skey: cartKey(), items, contact: { email, name: profile?.name || localStorage.getItem('cart_name') || '', phone: localStorage.getItem('cart_phone') || '' } });
  } catch { /* never get in the way of shopping */ } }, 4000);
}
function flash(msg, type = 'ok') {
  const f = document.getElementById('flash'); f.textContent = msg; f.className = `flash ${type}`; f.hidden = false;
  clearTimeout(flash.t); flash.t = setTimeout(() => (f.hidden = true), 5000);
}
const img = (p, big) => (safeUrl(p.image_url) ? `<img class="${big ? 'big' : ''}" src="${esc(safeUrl(p.image_url))}" alt="${esc(p.name)}">` : `<div class="ph ${big ? 'big' : ''}"><span>${esc(p.r_value || ':ic-grid:')}</span></div>`);
let RATINGS = {};
const loadRatings = async () => { const [{ data }] = await Promise.all([sb.from('product_ratings').select('*'), loadCompare()]); RATINGS = Object.fromEntries((data || []).map((r) => [r.product_id, r])); };
const stars = (n) => `<span class="stars" aria-label="${n} out of 5">${'★'.repeat(Math.round(n))}${'☆'.repeat(5 - Math.round(n))}</span>`;
const ratingLine = (p) => (RATINGS[p.id] ? `<p class="rating">${stars(RATINGS[p.id].avg)} <span class="muted">(${RATINGS[p.id].count})</span></p>` : '');
let COMPARE = {};
const CMP_DAYS = () => window.GOMI.COMPARE_MAX_DAYS || 30;
async function loadCompare() {
  const { data } = await sb.from('competitor_prices').select('*, competitors(name,active,sort)'); COMPARE = {};
  const cut = Date.now() - CMP_DAYS() * 864e5; // prices older than this are never shown to customers
  (data || []).filter((r) => r.competitors?.active && new Date(r.checked_at) >= cut).forEach((r) => (COMPARE[r.product_id] = COMPARE[r.product_id] || []).push({ ...r, name: r.competitors.name, sort: r.competitors.sort }));
  Object.values(COMPARE).forEach((a) => a.sort((x, y) => x.sort - y.sort));
}
const saveBadge = (p) => {
  const c = COMPARE[p.id]; if (!c?.length) return ''; const min = Math.min(...c.map((x) => x.price_cents));
  const pct = Math.round((min - p.price_cents) / min * 100); return pct >= 1 && p.price_cents < min ? `<span class="savebadge">Save ${pct}% vs ${c.length > 1 ? 'other retailers' : esc(c[0].name)}</span>` : '';
};
const compareHtml = (p) => {
  const c = COMPARE[p.id]; if (!c?.length) return '';
  const rows = c.map((x) => { const diff = x.price_cents - p.price_cents, pct = Math.round(Math.abs(diff) / x.price_cents * 100);
    const verdict = diff > 0 ? `<b class="up">You save ${money(diff)} (${pct}%)</b>` : diff < 0 ? `<span class="muted">${esc(x.name)} is ${money(-diff)} lower</span>` : '<span class="muted">Same price</span>';
    return `<tr><td>${esc(x.name)}${x.in_stock ? '' : ' <small class="muted">(out of stock)</small>'}${x.note ? `<br><small class="muted">${esc(x.note)}</small>` : ''}</td><td>${money(x.price_cents)}</td><td>${verdict}</td><td><small class="muted">${new Date(x.checked_at).toLocaleDateString()}</small>${x.url ? `<br><a href="${esc(x.url)}" target="_blank" rel="noopener nofollow">View ↗</a>` : ''}</td></tr>`; }).join('');
  return `<div class="compare"><h3>:ic-dollar: Price comparison</h3><table><tr><th>Retailer</th><th>Price</th><th>Difference</th><th>Checked</th></tr><tr class="us"><td><b>${esc(theme.name || 'Gomi Insulation')}</b></td><td><b>${money(p.price_cents)}</b></td><td></td><td></td></tr>${rows}</table>
  <p class="muted" style="font-size:.8rem;margin:6px 0 0">Other retailers' prices were checked by us on the dates shown and may have changed. Sizes, brands and pack contents can differ, so compare the item listed. Retailer names belong to their owners; we are not affiliated with them.</p></div>`;
};
const getRV = () => { try { return JSON.parse(localStorage.getItem('rv') || '[]'); } catch { return []; } };
const pushRV = (id) => { try { localStorage.setItem('rv', JSON.stringify([id, ...getRV().filter((x) => x !== id)].slice(0, 10))); } catch {} };
async function recentHtml(excludeId) {
  const ids = getRV().filter((x) => x !== excludeId).slice(0, 4); if (!ids.length) return '';
  const { data } = await sb.from('products').select('*').in('id', ids).eq('active', true); if (!data?.length) return '';
  data.sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id));
  return `<div class="sect"><h2>Recently viewed</h2></div><div class="grid">${data.map(card).join('')}</div>`;
}
const getWish = () => { try { return JSON.parse(localStorage.getItem('wish') || '[]'); } catch { return []; } };
document.addEventListener('click', (e) => {
  const ab = e.target.closest('.addbtn');
  if (ab) { const id = ab.dataset.id, c = getCart(), n = Math.min((c[id] || 0) + 1, Number(ab.dataset.stock) || 1); c[id] = n; setCart(c); flash(`Added ${ab.dataset.name} to your cart.`); ab.innerHTML = ':ic-check: Added'; ab.classList.add('done'); setTimeout(() => { ab.textContent = '+ Add'; ab.classList.remove('done'); }, 1500); return; }
  const q = e.target.closest('.qty [data-d]');
  if (q) { const inp = q.parentElement.querySelector('input'); const v = (parseInt(inp.value, 10) || 0) + Number(q.dataset.d); inp.value = Math.max(Number(inp.min) || 0, Math.min(v, Number(inp.max) || 999)); inp.dispatchEvent(new Event('change', { bubbles: true })); return; }
  const b = e.target.closest('.heart'); if (!b) return;
  const id = Number(b.dataset.id); let w = getWish();
  w = w.includes(id) ? w.filter((x) => x !== id) : [...w, id]; localStorage.setItem('wish', JSON.stringify(w));
  b.innerHTML = w.includes(id) ? ':ic-heart-fill:' : ':ic-heart:'; b.style.color = w.includes(id) ? '#dc2626' : ''; renderNav(); if (location.hash.startsWith('#/wishlist')) route();
});
const zoneRow = (z = {}) => `<div class="zoneedit"><label>Zone name<input data-f="label" value="${esc(z.label || '')}" placeholder="e.g. Toronto" maxlength="40"></label><label>Postal codes starting with <small class="muted">comma separated</small><input data-f="prefixes" value="${esc((z.prefixes || []).join(', '))}" placeholder="M, L4, L5"></label><label>Fee ($)<input data-f="fee" type="number" min="0" step="0.01" value="${z.fee_cents != null ? (z.fee_cents / 100).toFixed(2) : ''}"></label><button type="button" class="ibtn danger rmzone" aria-label="Remove zone">:ic-x:</button></div>`;
const SPEC_HINTS = ['Weight', 'Dimensions', 'Thickness', 'Coverage', 'R-value per inch', 'Material', 'Fire rating', 'Moisture resistance', 'Color', 'Made in', 'Pieces per pack'];
const specRow = (k = {}) => `<div class="kvedit specedit"><input data-f="k" list="spechints" value="${esc(k.k || '')}" placeholder="e.g. Weight" maxlength="60" aria-label="Detail name"><input data-f="v" value="${esc(k.v || '')}" placeholder="e.g. 25 lb" maxlength="200" aria-label="Detail value"><button type="button" class="ibtn danger rmkv" aria-label="Remove">:ic-x:</button></div>`;
const docRow = (d = {}) => `<div class="kvedit docedit"><input data-f="label" value="${esc(d.label || '')}" placeholder="e.g. Installation guide" maxlength="80" aria-label="Document name"><input data-f="url" type="url" value="${esc(d.url || '')}" placeholder="https://…" maxlength="500" aria-label="Document link"><button type="button" class="ibtn danger rmkv" aria-label="Remove">:ic-x:</button></div>`;
const ytId = (u) => (/(?:v=|youtu\.be\/|embed\/)([\w-]{11})/.exec(u || '') || [])[1] || '';
const detailTabs = (p) => {
  const feats = (p.features || []).filter(Boolean), specs = [...(p.sku ? [{ k: 'SKU', v: p.sku }] : []), ...(p.brand ? [{ k: 'Brand', v: p.brand }] : []), ...(p.r_value ? [{ k: 'R-value', v: p.r_value }] : []), ...(p.specs || []).filter((x) => x.k && x.v)], docs = (p.documents || []).filter((d) => d.label && safeUrl(d.url));
  const vid = ytId(p.video_url), hasDetails = feats.length || p.long_description || vid || p.warranty;
  const tabs = [hasDetails && ['details', 'Details'], specs.length > 1 && ['specs', 'Specifications'], docs.length && ['docs', 'Documents']].filter(Boolean); if (!tabs.length) return '';
  return `<section class="ptabs"><div class="seg" role="tablist" id="ptablist">${tabs.map(([id, l], i) => `<button type="button" role="tab" class="${i ? '' : 'on'}" data-tab="${id}">${l}</button>`).join('')}</div>
  ${hasDetails ? `<div class="ptab prose" data-pane="details" ${tabs[0][0] === 'details' ? '' : 'hidden'}>${feats.length ? `<h3>Key features</h3><ul class="featlist">${feats.map((f) => `<li>${esc(f)}</li>`).join('')}</ul>` : ''}${p.long_description ? md(p.long_description) : ''}${vid ? `<div class="mdvideo"><iframe src="https://www.youtube-nocookie.com/embed/${vid}" title="Product video" loading="lazy" allowfullscreen></iframe></div>` : ''}${p.warranty ? `<p class="warranty">:ic-shield: <b>Warranty:</b> ${esc(p.warranty)}</p>` : ''}</div>` : ''}
  ${specs.length > 1 ? `<div class="ptab" data-pane="specs" ${tabs[0][0] === 'specs' ? '' : 'hidden'}><div class="tablewrap"><table class="spectable">${specs.map((x) => `<tr><th>${esc(x.k)}</th><td>${esc(x.v)}</td></tr>`).join('')}</table></div></div>` : ''}
  ${docs.length ? `<div class="ptab" data-pane="docs" ${tabs[0][0] === 'docs' ? '' : 'hidden'}><ul class="doclist">${docs.map((d) => `<li><a href="${esc(safeUrl(d.url))}" target="_blank" rel="noopener">:ic-file: ${esc(d.label)}</a></li>`).join('')}</ul></div>` : ''}</section>`;
};
const packRow = (k, i, p) => { const u = su(p?.unit) || 'bag', tot = k.unit_price_cents != null && k.units ? (k.unit_price_cents * k.units / 100).toFixed(2) : '', per = k.unit_price_cents != null ? (k.unit_price_cents / 100).toFixed(2) : ''; return `<div class="packedit" data-i="${i}"><label>${u.charAt(0).toUpperCase() + u.slice(1)}s in the bundle<input data-f="units" type="number" min="2" max="1000" step="1" value="${k.units || ''}" placeholder="2–6"></label><label>Price per ${u} in bundle ($)<input data-f="per" type="number" min="0" step="0.01" value="${per}"></label><label>Price per bundle ($)<input data-f="price" type="number" min="0" step="0.01" value="${tot}"></label><label>Name <small class="muted">optional</small><input data-f="label" value="${esc(k.label || '')}" placeholder="auto: ${Bw(p)} of N ${u}s" maxlength="60"></label><button type="button" class="ibtn danger rmpack" aria-label="Remove">:ic-x:</button><small class="packcalc muted"></small></div>`; };
const packCalc = (row, single) => { const u = parseInt(row.querySelector('[data-f=units]').value, 10), t = parseFloat(row.querySelector('[data-f=price]').value), out = row.querySelector('.packcalc'); if (!(u >= 2) || !(t >= 0)) { out.textContent = ''; return; }
  const per = Math.round(t * 100 / u), real = per * u, alone = single * u, diff = alone - real; out.innerHTML = `= <b>${money(per)}</b> per bag${real !== Math.round(t * 100) ? ` (bundle will be ${money(real)})` : ''} · ${u} single bags cost ${money(alone)} → ${diff > 0 ? `<b style="color:var(--ok)">customer saves ${money(diff)} (${Math.round(diff / alone * 100)}%)</b>` : diff < 0 ? '<b style="color:var(--err)">bundle costs MORE than buying bags separately</b>' : 'same price'}`; };
const packName = (k, p) => k.label || `${Bw(p)} of ${k.units} ${su(p.unit)}s`;
const bundleN = (p) => p.bags_per_bundle || [...(p.packs || [])].map((k) => k.units).sort((a, b) => a - b)[0] || 0;
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
// "2 bundles + 1 bag" — what the customer asked for, never converted to a bag total
const qtyText = (p, q = p.qty) => { const N = bundleN(p); if (!N || q < N) return plural(q, su(p.unit) || 'bag'); const b = Math.floor(q / N), l = q % N; return plural(b, bw(p)) + (l ? ' + ' + plural(l, su(p.unit) || 'bag') : ''); };
const bundlePrice = (p) => { const N = bundleN(p), k = (p.packs || []).find((x) => x.units === N && x.unit_price_cents < p.price_cents); return N ? (k ? k.unit_price_cents : p.price_cents) * N : 0; };
function rememberBundles(list) { try { const m = JSON.parse(localStorage.getItem('bn') || '{}'); list.forEach((x) => { const N = bundleN(x); if (N) m[x.id] = N; else delete m[x.id]; }); localStorage.setItem('bn', JSON.stringify(m)); } catch {} }
const cartCount = () => { let m = {}; try { m = JSON.parse(localStorage.getItem('bn') || '{}'); } catch {} return Object.entries(getCart()).reduce((a, [id, q]) => a + (m[id] ? Math.floor(q / m[id]) + (q % m[id]) : q), 0); };
// order lines: bundle-priced rows show as bundles
const oiLine = (i) => { const base = String(i.name).replace(/ \((.*) price\)$/, ''), lab = (/ \((.*) price\)$/.exec(i.name) || [])[1] || '', bs = i.bundle_size || 0;
  let sub;
  if (i.pack_units) sub = `${plural(i.qty / i.pack_units, 'bundle')} × ${money(i.price_cents * i.pack_units)}${lab ? ' · ' + esc(lab) : ''}`;
  else if (bs && i.qty >= bs) sub = `${plural(Math.floor(i.qty / bs), 'bundle')}${i.qty % bs ? ' + ' + plural(i.qty % bs, 'bag') : ''} · ${money(i.price_cents)} per bag`;
  else sub = `${money(i.price_cents)} × ${i.qty}`;
  return `<div class="citem oi"><div class="cinfo"><b>${esc(base)}</b><small class="muted">${sub}</small></div><b class="ctotal">${money(i.price_cents * i.qty)}</b></div>`; };
const bundleOptions = (p) => { const ks = (p.packs || []).filter((k) => k.unit_price_cents < p.price_cents).map((k) => ({ ...k })); const n = p.bags_per_bundle;
  if (n && !(p.packs || []).some((k) => k.units === n)) ks.push({ units: n, unit_price_cents: p.price_cents, label: `${Bw(p)} of ${n} ${su(p.unit)}s`, same: true }); return ks.sort((a, b) => a.units - b.units); };
const stepper = (cls, max) => `<div class="qty sm"><button type="button" data-step="-1" aria-label="Less">−</button><input class="${cls}" type="number" value="1" min="1" max="${max}" aria-label="Quantity"><button type="button" data-step="1" aria-label="More">+</button></div>`;
const packTable = (p) => { const ks = bundleOptions(p); if (!ks.length) return ''; const u = su(p.unit);
  return `<div class="packs"><h3>Buy by the ${esc(u)} or by the ${bw(p)}</h3><div class="packrow"><div><b>1 ${esc(u)}</b><small class="muted">${money(p.price_cents)} each</small></div><span></span>${p.stock > 0 ? `${stepper('packqty', p.stock)}<button type="button" class="btn ghost" data-addqty="1">Add ${esc(u)}</button>` : ''}</div>
    ${ks.map((k) => { const alone = p.price_cents * k.units, tot = k.unit_price_cents * k.units, maxb = Math.floor(p.stock / k.units); return `<div class="packrow ${k.same ? '' : 'best'}"><div><b>1 ${esc(packName(k, p).replace(/^(Bundle|Pack) of \d+ .*$/i, bw(p)))} <span class="muted">(${k.units} ${esc(u)}s)</span></b><small class="muted"><b>${money(tot)}</b> per ${bw(p)}${k.same ? '' : ` · ${money(k.unit_price_cents)} per ${esc(u)}`}</small>${k.same ? '' : `<small class="muted">${k.units} single ${esc(u)}s would be ${money(alone)} — you save ${money(alone - tot)}</small>`}</div>${k.same ? '' : `<span class="savepill">Save ${packSave(p, k)}%</span>`}${maxb >= 1 ? `${stepper('packqty', maxb)}<button type="button" class="btn" data-addqty="${k.units}">Add ${bw(p)}</button>` : '<small class="muted">Not enough stock for a ${bw(p)}</small>'}</div>`; }).join('')}
    <small class="muted">Mix and match — ${bw(p)}s and loose ${esc(u)}s can be in the same order${bundleOptions(p).some((k) => !k.same) ? '; the cart works out the best price' : ''}.</small></div>`; };
const packHint = (p) => { const ks = (p.packs || []).filter((k) => k.unit_price_cents < p.price_cents).sort((a, b) => a.unit_price_cents - b.unit_price_cents); return ks.length ? `<small class="packhint">${esc(packName(ks[0], p))}: ${money(ks[0].unit_price_cents * ks[0].units)} (${money(ks[0].unit_price_cents)} each · save ${packSave(p, ks[0])}%)</small>` : ''; };
const onSale = (p) => p.compare_at_cents > p.price_cents;
const salePct = (p) => Math.round((1 - p.price_cents / p.compare_at_cents) * 100);
const priceHtml = (p) => onSale(p) ? `<span class="was">${money(p.compare_at_cents)}</span> <span class="now">${money(p.price_cents)}</span>` : money(p.price_cents);
const card = (p) => `<article class="card">${p.stock <= 0 ? '<span class="badge">Sold out</span>' : onSale(p) ? `<span class="badge sale">-${salePct(p)}%</span>` : p.stock <= 5 ? `<span class="badge warn">Only ${p.stock} left</span>` : p.stock <= 10 ? '<span class="badge warn">Low stock</span>' : ''}<button class="heart" data-id="${p.id}" aria-label="Save to wishlist" style="${getWish().includes(p.id) ? 'color:#dc2626' : ''}">${getWish().includes(p.id) ? ':ic-heart-fill:' : ':ic-heart:'}</button><a href="#/product/${esc(p.slug)}">${img(p)}</a><div class="pad"><span class="tag">${esc(p.category)}</span>${p.brand && p.brand !== p.category ? `<a class="brandtag" href="#/shop?brand=${encodeURIComponent(p.brand)}">${esc(p.brand)}</a>` : ''}
  <h3><a href="#/product/${esc(p.slug)}">${esc(p.name)}</a></h3><p class="muted">${p.r_value ? esc(p.r_value) + ' · ' : ''}per ${esc(p.unit)}</p>${ratingLine(p)}${saveBadge(p)}${packHint(p)}<div class="cardtools"><label class="cmpchk" title="Compare this product"><input type="checkbox" class="cmpbox" data-id="${p.id}"> Compare</label><button type="button" class="qvbtn" data-id="${p.id}">:ic-eye: Quick view</button></div><div class="cardfoot"><p class="price">${priceHtml(p)}</p>${p.stock > 0 ? `<button class="addbtn" data-id="${p.id}" data-stock="${p.stock}" data-name="${esc(p.name)}" aria-label="Add ${esc(p.name)} to cart">+ Add</button>` : '<span class="muted" style="font-size:.85rem">Sold out</span>'}</div></div></article>`;
const getPromo = () => { try { return JSON.parse(localStorage.getItem('promo') || 'null'); } catch { return null; } };
const zoneFee = (pc) => { const n = String(pc || '').toUpperCase().replace(/\s+/g, ''); let best = -1, fee = null; (STORE.ship_zones || []).forEach((z) => (z.prefixes || []).forEach((x) => { const pre = String(x).toUpperCase().replace(/\s+/g, ''); if (pre && n.startsWith(pre) && pre.length > best) { best = pre.length; fee = Math.max(0, Number(z.fee_cents) || 0); } })); return fee === null ? SHIP : fee; };
const zoneLabel = (pc) => { const n = String(pc || '').toUpperCase().replace(/\s+/g, ''); let best = -1, lab = ''; (STORE.ship_zones || []).forEach((z) => (z.prefixes || []).forEach((x) => { const pre = String(x).toUpperCase().replace(/\s+/g, ''); if (pre && n.startsWith(pre) && pre.length > best) { best = pre.length; lab = z.label || ''; } })); return lab; };
const totals = (sub, pickup = false, fee = SHIP) => { const pr = getPromo(), disc = pr && sub ? Math.floor(sub * pr.percent / 100) : 0; const ship = pickup || !sub || (FREE_SHIP > 0 && sub - disc >= FREE_SHIP) ? 0 : fee; const base = sub - disc + ship, tax = Math.round(base * (Number(STORE.tax_rate) || 0) / 100); return { sub, disc, code: disc ? pr.code : '', ship, tax, taxLabel: STORE.tax_label || 'Tax', total: base + tax }; };
const totalsHtml = (t) => `<dl class="totals"><dt>Subtotal</dt><dd>${money(t.sub)}</dd>${t.disc ? `<dt>Discount${t.code ? ' (' + esc(t.code) + ')' : ''}</dt><dd>−${money(t.disc)}</dd>` : ''}<dt>Shipping</dt><dd>${t.ship ? money(t.ship) : 'Free'}</dd>${t.tax ? `<dt>${esc(t.taxLabel || 'Tax')}</dt><dd>${money(t.tax)}</dd>` : ''}<dt>Total</dt><dd><strong>${money(t.total)}</strong></dd>${t.refunded ? `<dt>Refunded</dt><dd>−${money(t.refunded)}</dd>` : ''}</dl>`;
const fail = (e) => { console.error(e); flash(e.message || 'Something went wrong', 'error'); };
const dateOf = (s) => new Date(s).toLocaleString();

async function loadSession() {
  const { data } = await sb.auth.getSession(); session = data.session; profile = null;
  perms = [];
  if (session) { const r = await sb.from('profiles').select('*').eq('id', session.user.id).maybeSingle(); profile = r.data; if (profile && profile.role && profile.role !== 'customer') perms = (await sb.rpc('my_perms')).data || []; }
  renderNav(); startRealtime(); refreshUnread();
  if (!profile?.is_admin) { const pn = document.getElementById('stylepanel'); if (pn) pn.hidden = true; }
}
// ---- app-style bottom tab bar (phones) ----
function renderTabbar() {
  const tb = document.getElementById('tabbar'); if (!tb) return; const n = cartCount(), hash = location.hash.slice(1) || '/', on = (...pre) => pre.some((x) => (x === '/' ? hash === '/' || hash === '' : hash === x || hash.startsWith(x + '/') || hash.startsWith(x + '?')));
  const tabs = [['#/', 'Home', 'home', on('/')], ['#/shop', 'Shop', 'grid', on('/shop', '/product')], ['#/cart', 'Cart', 'cart', on('/cart', '/checkout'), n], [session ? '#/account' : '#/login', session ? 'Account' : 'Log in', 'users', on('/account', '/login', '/register', '/order', '/wishlist', '/notifications', '/messages')], ...(isStaff() ? [['#/admin', 'Admin', 'sliders', on('/admin')]] : [])];
  tb.innerHTML = tabs.map(([h, l, ic, act, badge]) => `<a href="${h}" class="${act ? 'on' : ''}" ${act ? 'aria-current="page"' : ''}><span class="ti">:ic-${ic}:${badge ? `<i class="tbadge">${badge > 99 ? '99+' : badge}</i>` : ''}</span><span>${l}</span></a>`).join('') + `<button type="button" id="tabmore" class="${document.body.classList.contains('menu-open') ? 'on' : ''}"><span class="ti">:ic-menu:</span><span>More</span></button>`;
}
// ---- opening hours ----
const DAYKEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'], DAYNAMES = { sun: 'Sunday', mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday', sat: 'Saturday' };
const t12 = (hm) => { const [h, m] = String(hm).split(':').map(Number); return `${((h + 11) % 12) + 1}${m ? ':' + String(m).padStart(2, '0') : ''} ${h < 12 ? 'AM' : 'PM'}`; };
const parseRange = (v) => { const m = /^(\d{1,2}:\d{2})-(\d{1,2}:\d{2})$/.exec(v || ''); if (!m) return null; const mins = (x) => { const [h, mm] = x.split(':').map(Number); return h * 60 + mm; }; return { a: mins(m[1]), b: mins(m[2]), from: m[1], to: m[2] }; };
function openStatus() {
  const h = STORE.hours; if (!h || !Object.values(h).some(Boolean)) return null;
  try { const parts = new Intl.DateTimeFormat('en-US', { timeZone: STORE.tz || 'America/Toronto', weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new Date()), g = (t) => parts.find((x) => x.type === t).value;
    const di = DAYKEYS.indexOf(g('weekday').slice(0, 3).toLowerCase()), mins = (Number(g('hour')) % 24) * 60 + Number(g('minute')), today = parseRange(h[DAYKEYS[di]]);
    if (today && mins >= today.a && mins < today.b) return { open: true, text: `Open now · until ${t12(today.to)}` };
    for (let k = 0; k < 8; k++) { const idx = (di + k) % 7, r = parseRange(h[DAYKEYS[idx]]); if (!r || (k === 0 && mins >= r.a)) continue; return { open: false, text: `Closed · opens ${k === 0 ? 'today' : k === 1 ? 'tomorrow' : DAYNAMES[DAYKEYS[idx]]} at ${t12(r.from)}` }; }
    return { open: false, text: 'Closed' }; } catch { return null; }
}
function hoursLines(h) { const order = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'], out = []; let i = 0; while (i < 7) { const v = h[order[i]] || ''; let j = i; while (j + 1 < 7 && (h[order[j + 1]] || '') === v) j++; const lab = i === j ? DAYNAMES[order[i]].slice(0, 3) : `${DAYNAMES[order[i]].slice(0, 3)}–${DAYNAMES[order[j]].slice(0, 3)}`, r = parseRange(v); out.push(`${lab}: ${r ? `${t12(r.from)} – ${t12(r.to)}` : 'Closed'}`); i = j + 1; } return out; }
function renderFooter() {
  const b = STORE.biz || {}, el = document.querySelector('footer .foot > div:first-child'); if (!el) return; const nm = esc((theme.name || b.legal_name || 'Gomi Insulation'));
  el.innerHTML = `<b>${nm}</b><p>Insulation supply — delivered to your site or ready for pickup.</p>${b.phone ? `<p style="margin:6px 0"><a href="tel:${esc(String(b.phone).replace(/[^+\d]/g, ''))}">${esc(b.phone)}</a></p>` : ''}${b.address ? `<p class="muted" style="margin:0;white-space:pre-line">${esc(b.address)}</p>` : ''}${STORE.hours && Object.values(STORE.hours).some(Boolean) ? `<div class="foothours"><b>Hours</b>${hoursLines(STORE.hours).map((l) => `<span>${esc(l)}</span>`).join('')}</div>` : ''}`;
}
// visitor light/dark switch (overrides the site default for this browser only)
const getVMode = () => { try { return localStorage.getItem('visitor_mode') || ''; } catch { return ''; } };
const modeLabel = () => (isDark() ? ':ic-sun: Light mode' : ':ic-moon: Dark mode');
function applyVisitorMode() { const m = getVMode(); if (m) document.documentElement.dataset.mode = m; }
document.addEventListener('click', (e) => { if (!e.target.closest('#modeswitch')) return; const next = isDark() ? 'light' : 'dark'; try { localStorage.setItem('visitor_mode', next); } catch {} document.documentElement.dataset.mode = next; const b = document.getElementById('modeswitch'); if (b) b.innerHTML = modeLabel(); });
function renderNav() {
  const n = cartCount();
  document.getElementById('cartlink').innerHTML = (session ? `<button class="stylebtn bell" id="bellbtn" aria-label="Notifications">:ic-bell:${unread.all ? `<span class="dot">${unread.all > 99 ? '99+' : unread.all}</span>` : ''}</button> ` : '') + `<a class="cart" href="#/cart" aria-label="Cart, ${n} item${n === 1 ? '' : 's'}">:ic-cart: <span class="cl">Cart </span>(${n})</a>`;
  const first = esc((profile?.name || 'Account').split(' ')[0]);
  document.getElementById('nav').innerHTML = `<a href="#/shop">Shop</a>${sitePages.filter((x) => x.show_in_nav).map((x) => `<a href="#/page/${esc(x.slug)}">${esc(x.title)}</a>`).join('')}<a href="#/calculator">Calculator</a><a href="#/quote">Get a quote</a><a href="#/wishlist" aria-label="Wishlist">:ic-heart:${getWish().length ? ' ' + getWish().length : ''}</a>`
    + (session ? `<a href="#/messages" class="msglink">:ic-chat:<span class="lbl"> Messages</span>${unread.msg ? ` <span class="dot">${unread.msg}</span>` : ''}</a>
      <div class="usermenu"><button class="userbtn" id="userbtn" aria-haspopup="true" aria-expanded="false">${avatar(profile?.name || 'U')}<span class="uname">${first}</span><span class="caret">:ic-chevron-down:</span></button>
      <div class="umpanel" id="umpanel"><div class="umhead"><b>${esc(profile?.name || 'Account')}</b>${profile?.username ? `<small class="muted">@${esc(profile.username)}</small>` : ''}<small class="muted">${esc(session.user.email)}${profile?.role && profile.role !== 'customer' ? ' · ' + esc(profile.role) : ''}</small></div>
        <a href="#/account">My account</a><a href="#/account">My orders</a><a href="#/notifications">Notifications</a>${isStaff() ? '<a href="#/admin">Admin dashboard</a>' : ''}${profile?.is_admin ? '<button class="link" id="stylebtn">:ic-sliders: Site style</button>' : ''}<button class="link" id="logout">Log out</button></div></div>`
      : `<a href="#/login">Log in</a><a href="#/register" class="signup">Sign up</a>`) + `<button type="button" class="link modeswitch" id="modeswitch" aria-label="Switch light or dark appearance">${modeLabel()}</button>`;
  document.getElementById('logout')?.addEventListener('click', async () => { await sb.auth.signOut(); location.hash = '#/'; });
  renderTabbar();
}
document.addEventListener('click', (e) => {
  const ub = e.target.closest('#userbtn'), um = document.querySelector('.usermenu');
  if (ub) { const open = !um.classList.contains('open'); um.classList.toggle('open', open); ub.setAttribute('aria-expanded', String(open)); return; }
  if (um && (!e.target.closest('.umpanel') || e.target.closest('.umpanel a, .umpanel button'))) um.classList.remove('open');
});
const setMenu = (open) => { document.body.classList.toggle('menu-open', open); document.getElementById('menubtn').setAttribute('aria-expanded', String(open)); document.getElementById('menubtn').innerHTML = open ? ':ic-x:' : ':ic-menu:'; };
document.getElementById('menubtn').addEventListener('click', () => setMenu(!document.body.classList.contains('menu-open')));
document.getElementById('nav').addEventListener('click', (e) => { if (e.target.closest('a,button.link')) setMenu(false); });
document.getElementById('msearchbtn').innerHTML = ':ic-search:';
document.getElementById('msearchbtn').addEventListener('click', () => { const on = !document.body.classList.contains('msearch'); document.body.classList.toggle('msearch', on); if (on) { setMenu(false); document.querySelector('#search input').focus(); } });
document.getElementById('tabbar').addEventListener('click', (e) => { if (e.target.closest('#tabmore')) { setMenu(!document.body.classList.contains('menu-open')); renderTabbar(); } else { if (document.body.classList.contains('menu-open')) setMenu(false); document.body.classList.remove('msearch'); } });
window.addEventListener('hashchange', () => { document.body.classList.remove('msearch'); renderTabbar(); });
document.addEventListener('click', (e) => { if (e.target.isConnected && document.body.classList.contains('menu-open') && !e.target.closest('#nav, #tabbar, #menubtn')) { setMenu(false); renderTabbar(); } });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && document.body.classList.contains('menu-open')) { setMenu(false); renderTabbar(); } });
// ---- search: every word must match (name, category, brand, SKU); suggestions with keyboard, recent searches, clear button ----
const searchWords = (t) => String(t || '').toLowerCase().split(/\s+/).map((w) => w.replace(/[%,()*\\]/g, '')).filter(Boolean).slice(0, 6);
const applySearch = (req, term, cols = ['name', 'category', 'brand', 'sku']) => { searchWords(term).forEach((w) => { req = req.or(cols.map((c) => `${c}.ilike.%${w}%`).join(',')); }); return req; };
const markHit = (text, words) => { let h = esc(text); words.forEach((w) => { h = h.replace(new RegExp('(' + w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'ig'), '<mark>$1</mark>'); }); return h; };
const getRecent = () => { try { return JSON.parse(localStorage.getItem('recent_search') || '[]'); } catch { return []; } };
const addRecent = (t) => { t = t.trim(); if (!t) return; try { localStorage.setItem('recent_search', JSON.stringify([t, ...getRecent().filter((x) => x.toLowerCase() !== t.toLowerCase())].slice(0, 5))); } catch {} };
const sugg = document.getElementById('sugg'), sinput = document.querySelector('#search input[name=q]'), sform = document.getElementById('search'); let stm = null, sseq = 0, hl = -1;
const sclear = document.createElement('button'); sclear.type = 'button'; sclear.className = 'sclear'; sclear.hidden = true; sclear.setAttribute('aria-label', 'Clear search'); sclear.innerHTML = ':ic-x:'; sform.appendChild(sclear);
sinput.setAttribute('role', 'combobox'); sinput.setAttribute('aria-expanded', 'false'); sinput.setAttribute('aria-autocomplete', 'list'); sinput.setAttribute('enterkeyhint', 'search'); sinput.type = 'search'; sinput.setAttribute('autocapitalize', 'none');
const openSugg = (html) => { sugg.innerHTML = html; sugg.hidden = false; sinput.setAttribute('aria-expanded', 'true'); hl = -1; };
const closeSugg = () => { sugg.hidden = true; sinput.setAttribute('aria-expanded', 'false'); hl = -1; };
const showRecent = () => { const r = getRecent(); if (!r.length) return closeSugg(); openSugg(`<p class="sgh">Recent searches <button type="button" class="link" id="sclr">Clear</button></p>${r.map((x) => `<a href="#/shop?q=${encodeURIComponent(x)}"><span>:ic-clock: ${esc(x)}</span></a>`).join('')}`); };
const runSuggest = async () => {
  const t = sinput.value.trim().replace(/[%,()]/g, ''); sclear.hidden = !sinput.value; if (t.length < 2) { t.length ? closeSugg() : showRecent(); return; }
  const my = ++sseq; let req = sb.from('products').select('slug,name,price_cents,category,brand,sku,stock').eq('active', true); req = applySearch(req, t);
  const { data } = await req.order('name').limit(6); if (my !== sseq) return; const ws = searchWords(t);
  openSugg((data || []).length ? data.map((x) => `<a href="#/product/${esc(x.slug)}"><span>${markHit(x.name, ws)}<small>${esc([x.brand, x.category].filter(Boolean).join(' · '))}${x.stock <= 0 ? ' · sold out' : ''}</small></span><b>${money(x.price_cents)}</b></a>`).join('') + `<a class="all" href="#/shop?q=${encodeURIComponent(t)}">See all results for “${esc(t)}” →</a>` : `<p class="muted sgh">No products match “${esc(t)}”.</p><a class="all" href="#/quote">Can't find it? Request a quote →</a>`);
};
sinput.addEventListener('input', () => { clearTimeout(stm); sclear.hidden = !sinput.value; stm = setTimeout(runSuggest, 160); });
sinput.addEventListener('focus', () => { if (!sinput.value.trim()) showRecent(); else if (sugg.innerHTML) sugg.hidden = false; });
sclear.addEventListener('click', () => { sinput.value = ''; sclear.hidden = true; sinput.focus(); showRecent(); if (location.hash.startsWith('#/shop') && new URLSearchParams(location.hash.split('?')[1] || '').get('q')) { const n = new URLSearchParams(location.hash.split('?')[1]); n.delete('q'); location.hash = '#/shop' + (n.toString() ? '?' + n : ''); } });
sinput.addEventListener('keydown', (e) => {
  const items = [...sugg.querySelectorAll('a')];
  if (e.key === 'Escape') { closeSugg(); sinput.blur(); }
  else if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && !sugg.hidden && items.length) { e.preventDefault(); hl = e.key === 'ArrowDown' ? (hl + 1) % items.length : (hl - 1 + items.length) % items.length; items.forEach((a, i) => a.classList.toggle('hl', i === hl)); items[hl].scrollIntoView({ block: 'nearest' }); }
  else if (e.key === 'Enter' && hl >= 0 && items[hl]) { e.preventDefault(); location.hash = items[hl].getAttribute('href'); closeSugg(); }
});
sugg.addEventListener('click', (e) => { if (e.target.closest('#sclr')) { e.preventDefault(); e.stopPropagation(); try { localStorage.removeItem('recent_search'); } catch {} closeSugg(); return; } const a = e.target.closest('a'); if (a) { const m = /[?&]q=([^&]*)/.exec(a.getAttribute('href') || ''); if (m && a.classList.contains('all')) addRecent(decodeURIComponent(m[1])); closeSugg(); } });
document.addEventListener('click', (e) => { if (!e.target.closest('#search')) closeSugg(); });
sform.addEventListener('submit', (e) => { e.preventDefault(); const v = String(new FormData(e.target).get('q') || '').trim(); closeSugg(); sinput.blur(); if (!v) { location.hash = '#/shop'; return; } addRecent(v); location.hash = `#/shop?q=${encodeURIComponent(v)}`; });

// ---- pages ----
const pages = {};
pages.home = async () => {
  await loadRatings();
  const { data, error } = await sb.from('products').select('*').eq('active', true).order('id').limit(8); if (data) await attachPacks(data); if (error) throw error;
  const catCount = {}; ((await sb.from('products').select('category').eq('active', true)).data || []).forEach((r) => (catCount[r.category] = (catCount[r.category] || 0) + 1));
  const cats = Object.keys(catCount).sort();
  const biz = STORE.biz || {}, tel = String(biz.phone || '').replace(/[^+\d]/g, '');
  return `<section class="hero"><div class="hero-art" aria-hidden="true"></div><h1>Insulation, delivered to your job site.</h1><p>Batts, spray foam, rigid board and loose fill from stock. Order online, pick up, or call us for trade pricing.</p>
  <div class="herobtns"><a class="btn" href="#/shop">Shop the catalogue</a><a class="btn ghost" href="#/quote">Get a quote</a>${tel ? `<a class="btn ghost" href="tel:${esc(tel)}">Call ${esc(biz.phone)}</a>` : ''}</div>${(() => { const st = openStatus(); return st ? `<p class="openstat ${st.open ? 'on' : ''}"><i></i>${esc(st.text)}</p>` : ''; })()}</section>
  <ul class="facts"><li><b>${FREE_SHIP > 0 ? `Free delivery over ${money(FREE_SHIP)}` : `Delivery ${money(SHIP)} flat`}</b><span>${(STORE.ship_zones || []).length ? 'Fee depends on your postal code' : 'Or pick up at our location, free'}</span></li><li><a href="#/calculator" class="factlink"><b>Insulation calculator</b><span>Tells you how many you need →</span></a></li><li><b>Trade pricing</b><span>Ask for a quote on big jobs</span></li></ul>
  <div class="sect"><h2>Shop by category</h2><a href="#/shop">All products</a></div><div class="tiles">${cats.map((c) => `<a class="tile" href="#/shop?category=${encodeURIComponent(c)}"><b>${esc(c)}</b><small>${catCount[c]}</small></a>`).join('')}</div>
  <div class="sect"><h2>Featured products</h2><a href="#/shop">View all</a></div><div class="grid">${data.map(card).join('')}</div>${await recentHtml(0)}`;
};
// ---- compare products (customers) ----
const getCmp = () => { try { return JSON.parse(localStorage.getItem('cmp') || '[]'); } catch { return []; } };
const setCmp = (a) => { try { localStorage.setItem('cmp', JSON.stringify(a.slice(0, 3))); } catch {} renderCmpBar(); syncCmpBoxes(); };
function syncCmpBoxes() { const c = getCmp(); document.querySelectorAll('.cmpbox').forEach((b) => { b.checked = c.includes(Number(b.dataset.id)); }); }
function renderCmpBar() {
  let bar = document.getElementById('cmpbar'); const c = getCmp();
  if (!c.length || location.hash.startsWith('#/compare') || /^#\/(admin|checkout|messages)/.test(location.hash)) { bar?.remove(); return; }
  if (!bar) { bar = document.createElement('div'); bar.id = 'cmpbar'; bar.className = 'cmpbar noprint'; document.body.appendChild(bar); }
  bar.innerHTML = `<span><b>${c.length}</b> product${c.length === 1 ? '' : 's'} to compare <small class="muted">(max 3)</small></span><span class="row" style="flex-wrap:nowrap"><button type="button" class="link" id="cmpclear">Clear</button><a class="btn" href="#/compare">Compare${c.length < 2 ? ' (add one more)' : ''}</a></span>`;
}
document.addEventListener('change', (e) => { const b = e.target.closest?.('.cmpbox'); if (!b) return; const id = Number(b.dataset.id); let c = getCmp(); if (b.checked) { if (c.length >= 3) { b.checked = false; flash('You can compare up to 3 products at a time.', 'error'); return; } c = [...c, id]; } else c = c.filter((x) => x !== id); setCmp(c); });
document.addEventListener('click', (e) => { if (e.target.closest('#cmpclear')) setCmp([]); });
pages.compare = async (_, q) => {
  const ids = (q.get('ids') ? q.get('ids').split(',').map(Number) : getCmp()).filter(Boolean).slice(0, 3);
  if (ids.length < 2) return `<div class="empty"><div style="font-size:3rem">:ic-grid:</div><h1>Compare products</h1><p class="muted">Tick “Compare” on 2 or 3 products in the shop to see them side by side.</p><a class="btn" href="#/shop">Browse products</a></div>`;
  const { data } = await sb.from('products').select('*').in('id', ids).eq('active', true); const list = ids.map((i) => (data || []).find((x) => x.id === i)).filter(Boolean); await attachPacks(list);
  const cov = (x) => coverageOf(x), perSq = (x) => (cov(x) ? x.price_cents / cov(x) : null), best = Math.min(...list.map(perSq).filter((v) => v !== null), Infinity);
  const keys = [...new Set(list.flatMap((x) => (x.specs || []).map((k) => k.k)))];
  const row = (label, fn, cls = '') => `<tr class="${cls}"><th>${label}</th>${list.map((x) => `<td>${fn(x)}</td>`).join('')}</tr>`;
  return `<div class="sechead"><h1 style="margin:0">Compare products</h1><button class="btn ghost" id="cmpreset" type="button">Start over</button></div>
  <div class="tablewrap cmptable"><table><tr><th></th>${list.map((x) => `<td><div class="cmphead"><a href="#/product/${esc(x.slug)}" class="cthumb">${img(x)}</a><b>${esc(x.name)}</b><button type="button" class="link cmpdrop" data-id="${x.id}">Remove</button></div></td>`).join('')}</tr>
  ${row('Price', (x) => `<b class="cmpprice">${priceHtml(x)}</b><small class="muted"> per ${esc(su(x.unit) || x.unit)}</small>`)}
  ${row('Brand', (x) => esc(x.brand || '—'))}${row('R-value', (x) => esc(x.r_value || '—'))}
  ${row('Coverage', (x) => (cov(x) ? `${cov(x)} sq ft per ${esc(su(x.unit))}` : '—'))}
  ${row('Price per sq ft', (x) => (perSq(x) === null ? '—' : `<span class="${perSq(x) === best && list.filter((y) => perSq(y) !== null).length > 1 ? 'up' : ''}">${money(Math.round(perSq(x)))}/sq ft${perSq(x) === best && list.filter((y) => perSq(y) !== null).length > 1 ? ' · best value' : ''}</span>`))}
  ${row('Category', (x) => esc(x.category))}${row('Availability', (x) => (x.stock > 0 ? `<span class="up">In stock${x.stock <= 10 ? ` (${x.stock} left)` : ''}</span>` : '<span class="down">Out of stock</span>'))}
  ${keys.map((k) => row(esc(k), (x) => esc(((x.specs || []).find((y) => y.k === k) || {}).v || '—'))).join('')}
  ${row('', (x) => (x.stock > 0 ? `<button class="btn cmpadd" data-id="${x.id}" data-stock="${x.stock}" data-name="${esc(x.name)}" type="button">Add to cart</button>` : '<span class="muted">Sold out</span>'), 'cmpactions')}</table></div>`;
};
pages.compare.after = () => {
  document.getElementById('cmpreset')?.addEventListener('click', () => { setCmp([]); location.hash = '#/shop'; });
  document.querySelectorAll('.cmpdrop').forEach((b) => b.addEventListener('click', () => { setCmp(getCmp().filter((x) => x !== Number(b.dataset.id))); route(); }));
  document.querySelectorAll('.cmpadd').forEach((b) => b.addEventListener('click', () => { const c = getCart(), id = Number(b.dataset.id); c[id] = Math.min((c[id] || 0) + 1, Number(b.dataset.stock)); setCart(c); flash(`Added ${b.dataset.name} to your cart.`); }));
};
// ---- insulation calculator ----
const rNum = (r) => { const m = /(\d+(?:\.\d+)?)/.exec(String(r || '')); return m && !/\/\s*in/i.test(r) ? Number(m[1]) : 0; };
pages.calculator = async (_, q) => {
  const area = Math.max(0, parseFloat(q.get('area')) || 0), target = Number(q.get('r')) || 0, waste = Math.min(30, Math.max(0, q.get('waste') === null ? 10 : parseFloat(q.get('waste')) || 0));
  const parts = [['Attic floor', 38], ['Exterior walls (2×4)', 13], ['Exterior walls (2×6)', 20], ['Basement walls', 12], ['Floors over crawlspace', 25], ['Cathedral ceiling', 30]];
  let results = '';
  if (area > 0 && target > 0) {
    const { data } = await sb.from('products').select('*').eq('active', true); const need = area * (1 + waste / 100);
    const rows = (data || []).filter((x) => rNum(x.r_value) >= target && coverageOf(x) > 0).map((x) => { const n = Math.ceil(need / coverageOf(x)); return { x, n, cost: n * x.price_cents, ok: x.stock >= n }; }).sort((a, b) => a.cost - b.cost);
    results = rows.length ? `<h2>Options for ${area.toLocaleString()} sq ft at R-${target}+ <small class="muted">(includes ${waste}% extra for cuts and waste)</small></h2><div class="tablewrap"><table class="calctable"><tr><th>Product</th><th>R-value</th><th>You need</th><th>Total</th><th></th></tr>${rows.map((r, i) => `<tr class="${i === 0 ? 'bestrow' : ''}"><td><a href="#/product/${esc(r.x.slug)}"><b>${esc(r.x.name)}</b></a>${i === 0 ? ' <span class="status paid">Lowest cost</span>' : ''}<small class="muted" style="display:block">${coverageOf(r.x)} sq ft per ${esc(su(r.x.unit))} · ${money(r.x.price_cents)} each</small></td><td>${esc(r.x.r_value)}</td><td><b>${r.n}</b> ${esc(su(r.x.unit))}${r.n === 1 ? '' : 's'}</td><td><b>${money(r.cost)}</b></td><td>${r.ok ? `<button class="btn calcadd" data-id="${r.x.id}" data-n="${r.n}" type="button">Add to cart</button>` : `<small class="muted">${r.x.stock > 0 ? `Only ${r.x.stock} in stock` : 'Out of stock'}</small>`}</td></tr>`).join('')}</table></div><p class="muted">Estimates only. Check your local building code for the R-value required in your area, and ask us for a quote on big jobs.</p>`
      : `<p class="flash error" style="margin-top:16px">No products with a coverage listed meet R-${target}. <a href="#/quote">Ask us for a quote</a> — we can often special-order it.</p>`;
  }
  return `<div class="calcwrap"><h1>Insulation calculator</h1><p class="muted" style="margin-top:0">Tell us the area and the R-value you're aiming for, and we'll work out what to order.</p>
  <form id="calcform" class="cs stack"><div><b>Where are you insulating?</b><div class="chips" id="calcparts" style="margin:8px 0 0">${parts.map(([l, r]) => `<button type="button" class="chip ${target === r ? 'on' : ''}" data-r="${r}">${l} <small>R-${r}</small></button>`).join('')}</div></div>
    <div class="two2"><label>Area (sq ft)<input name="area" type="number" min="1" step="1" required value="${area || ''}" placeholder="e.g. 1200"></label><label>Target R-value<input name="r" type="number" min="1" max="80" step="1" required value="${target || ''}" placeholder="e.g. 38"></label></div>
    <label>Extra for cuts &amp; waste (%)<input name="waste" type="number" min="0" max="30" value="${waste}"></label><button class="btn">Calculate</button></form>${results}</div>`;
};
pages.calculator.after = () => {
  const f = document.getElementById('calcform'); document.getElementById('calcparts')?.addEventListener('click', (e) => { const b = e.target.closest('[data-r]'); if (!b) return; f.elements.r.value = b.dataset.r; document.querySelectorAll('#calcparts .chip').forEach((x) => x.classList.toggle('on', x === b)); });
  f?.addEventListener('submit', (e) => { e.preventDefault(); const d = new FormData(f); location.hash = `#/calculator?area=${encodeURIComponent(d.get('area'))}&r=${encodeURIComponent(d.get('r'))}&waste=${encodeURIComponent(d.get('waste') || 0)}`; });
  document.querySelectorAll('.calcadd').forEach((b) => b.addEventListener('click', () => { const c = getCart(), id = Number(b.dataset.id); c[id] = (c[id] || 0) + Number(b.dataset.n); setCart(c); flash('Added to your cart.'); location.hash = '#/cart'; }));
};
// ---- quick view ----
async function openQuickView(id) {
  const { data: p } = await sb.from('products').select('*').eq('id', id).maybeSingle(); if (!p) return; await attachPacks([p]);
  const prev = document.activeElement; document.getElementById('qv')?.remove();
  const el = document.createElement('div'); el.id = 'qv'; el.className = 'qv'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-label', p.name);
  const opts = bundleOptions(p), u = su(p.unit) || 'unit', feats = (p.features || []).slice(0, 4);
  const actions = p.stock <= 0 ? '<p class="flash error" style="margin:0">Out of stock</p>' : opts.length ? `<div class="stack" style="gap:8px"><button class="btn" data-qvadd="1">Add 1 ${esc(u)} — ${money(p.price_cents)}</button>${opts.filter((k) => p.stock >= k.units).map((k) => `<button class="btn ghost" data-qvadd="${k.units}">Add 1 ${bw(p)} (${k.units} ${esc(u)}s) — ${money(k.unit_price_cents * k.units)}</button>`).join('')}</div>` : `<div class="row" style="flex-wrap:nowrap"><div class="qty"><button type="button" data-d="-1" aria-label="Less">−</button><input type="number" id="qvqty" value="1" min="1" max="${p.stock}" aria-label="Quantity"><button type="button" data-d="1" aria-label="More">+</button></div><button class="btn" data-qvadd="1" style="flex:1">Add to cart</button></div>`;
  el.innerHTML = `<div class="qvbox"><button type="button" class="qvclose" aria-label="Close">:ic-x:</button><div class="qvimg">${img(p)}</div><div class="qvinfo"><span class="tag">${esc(p.category)}${p.brand && p.brand !== p.category ? ' · ' + esc(p.brand) : ''}</span><h2>${esc(p.name)}</h2><p class="price">${priceHtml(p)} <small class="muted">per ${esc(u)}</small></p>
    ${p.r_value ? `<p style="margin:4px 0"><b>R-value:</b> ${esc(p.r_value)}</p>` : ''}${p.sku ? `<small class="muted">SKU ${esc(p.sku)}</small>` : ''}<p>${esc(clip(p.description, 220))}</p>${feats.length ? `<ul class="featlist">${feats.map((f) => `<li>${esc(f)}</li>`).join('')}</ul>` : ''}
    <p class="stockpill ${p.stock <= 10 ? 'low' : ''}" style="margin:6px 0"><i></i>${p.stock <= 0 ? 'Out of stock' : p.stock <= 10 ? `Only ${p.stock} left` : 'In stock'}</p>${actions}<a class="qvfull" href="#/product/${esc(p.slug)}">View full details →</a></div></div>`;
  document.body.appendChild(el); document.body.classList.add('noscroll'); el.querySelector('.qvclose').focus();
  const close = () => { el.remove(); document.body.classList.remove('noscroll'); document.removeEventListener('keydown', onKey); prev?.focus?.(); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  el.addEventListener('click', (e) => { if (e.target === el || e.target.closest('.qvclose') || e.target.closest('.qvfull')) { close(); return; } const a = e.target.closest('[data-qvadd]'); if (!a) return;
    const n = (document.getElementById('qvqty') ? Math.max(1, parseInt(document.getElementById('qvqty').value, 10) || 1) : 1) * Number(a.dataset.qvadd), c = getCart(); c[p.id] = Math.min((c[p.id] || 0) + n, p.stock); setCart(c); flash(`Added to your cart: ${p.name}.`); close(); });
}
document.addEventListener('click', (e) => { const b = e.target.closest('.qvbtn'); if (b) { e.preventDefault(); openQuickView(Number(b.dataset.id)); } });
const SHOP_PAGE = 24; let SHOWN = [], SHOWN_N = 0;
pages.shop = async (_, q) => {
  await loadRatings();
  const category = q.get('category') || '', brand = q.get('brand') || '', term = (q.get('q') || '').replace(/[%,()]/g, ''), sort = q.get('sort') || 'name';
  const rmin = Number(q.get('rmin')) || 0, instock = q.get('instock') === '1', sale = q.get('sale') === '1', pmin = Math.round((parseFloat(q.get('min')) || 0) * 100), pmax = Math.round((parseFloat(q.get('max')) || 0) * 100);
  let req = sb.from('products').select('*').eq('active', true).limit(1000);
  if (term) req = applySearch(req, term, ['name', 'description', 'category', 'brand', 'sku']);
  const { data: all, error } = await req; if (error) throw error; await attachPacks(all);
  const pass = (p, skip) => (skip === 'category' || !category || p.category === category) && (skip === 'brand' || !brand || p.brand === brand) && (!instock || p.stock > 0) && (!sale || onSale(p)) && (!pmin || p.price_cents >= pmin) && (!pmax || p.price_cents <= pmax) && (!rmin || rNum(p.r_value) >= rmin);
  const cmp = { name: (a, b) => a.name.localeCompare(b.name), price_asc: (a, b) => a.price_cents - b.price_cents, price_desc: (a, b) => b.price_cents - a.price_cents, stock: (a, b) => b.stock - a.stock, newest: (a, b) => b.id - a.id, rating: (a, b) => ((RATINGS[b.id]?.avg || 0) - (RATINGS[a.id]?.avg || 0)) || a.name.localeCompare(b.name), sqft: (a, b) => { const f = (x) => (coverageOf(x) ? x.price_cents / coverageOf(x) : 1e12); return f(a) - f(b); }, saving: (a, b) => (onSale(b) ? salePct(b) : 0) - (onSale(a) ? salePct(a) : 0) }[sort] || ((a, b) => a.name.localeCompare(b.name));
  const shown = all.filter((x) => pass(x)).sort(cmp); SHOWN = shown; SHOWN_N = Math.min(SHOP_PAGE, shown.length);
  const count = (key, skip) => { const m = {}; all.filter((x) => pass(x, skip)).forEach((x) => { if (x[key]) m[x[key]] = (m[x[key]] || 0) + 1; }); return m; };
  const cats = count('category', 'category'), brands = count('brand', 'brand');
  const link = (ch) => { const n = new URLSearchParams(q); Object.entries(ch).forEach(([k, v]) => (v ? n.set(k, v) : n.delete(k))); const t = n.toString(); return '#/shop' + (t ? '?' + t : ''); };
  const pills = [category && ['Category: ' + category, { category: '' }], brand && ['Brand: ' + brand, { brand: '' }], instock && ['In stock', { instock: '' }], sale && ['On sale', { sale: '' }], rmin && [`R-${rmin} or higher`, { rmin: '' }], (pmin || pmax) && [`Price ${pmin ? money(pmin) : ''}–${pmax ? money(pmax) : ''}`, { min: '', max: '' }], term && [`“${term}”`, { q: '' }]].filter(Boolean);
  const facet = (title, map, cur, key) => Object.keys(map).length || cur ? `<fieldset class="facet"><legend>${title}</legend>${Object.entries(map).sort((a, b) => a[0].localeCompare(b[0])).map(([k, n]) => `<a class="fitem ${k === cur ? 'on' : ''}" href="${link({ [key]: k === cur ? '' : k })}"><span>${esc(k)}</span><small>${n}</small></a>`).join('')}</fieldset>` : '';
  const nfilters = pills.length - (term ? 1 : 0);
  return `<div class="shophead"><div><h1 style="margin:0">${esc(brand || category || 'All products')}</h1><p class="muted" style="margin:2px 0 0">${shown.length} product${shown.length === 1 ? '' : 's'}${shown.length !== all.length ? ` of ${all.length}` : ''}</p></div>
    <div class="row shopctl"><button type="button" class="btn ghost filterbtn" id="filterbtn">:ic-sliders: Filters${nfilters ? ` (${nfilters})` : ''}</button>
      <label class="sortlbl"><span class="muted">Sort</span><select name="sort" id="shopsort" aria-label="Sort">${[['name', 'Name A–Z'], ['price_asc', 'Price: low to high'], ['price_desc', 'Price: high to low'], ['newest', 'Newest'], ['rating', 'Top rated'], ['sqft', 'Lowest price per sq ft'], ['saving', 'Biggest saving'], ['stock', 'Most in stock']].map(([v, l]) => `<option value="${v}" ${v === sort ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      <div class="seg viewseg" id="viewseg" role="group" aria-label="Layout"><button type="button" data-view="grid" aria-label="Grid view" title="Grid">:ic-grid:</button><button type="button" data-view="list" aria-label="List view" title="List">:ic-clipboard:</button></div></div></div>
  ${pills.length ? `<div class="pills">${pills.map(([l, ch]) => `<a class="pill" href="${link(ch)}">${esc(l)} <span aria-hidden="true">×</span><span class="sr">remove filter</span></a>`).join('')}<a class="link" href="#/shop">Clear all</a></div>` : ''}
  <div class="shoplayout"><aside class="filters" id="filters" aria-label="Filters"><div class="fhead"><b>Filters</b><button type="button" class="ibtn" id="filterclose" aria-label="Close filters">:ic-x:</button></div>
    ${facet('Category', cats, category, 'category')}${facet('Brand', brands, brand, 'brand')}
    <fieldset class="facet"><legend>Price</legend><div class="pricerange"><input name="min" type="number" min="0" step="1" placeholder="Min $" value="${q.get('min') || ''}" aria-label="Minimum price"><span>–</span><input name="max" type="number" min="0" step="1" placeholder="Max $" value="${q.get('max') || ''}" aria-label="Maximum price"></div></fieldset>
    <fieldset class="facet"><legend>Minimum R-value</legend><select name="rmin" aria-label="Minimum R-value">${[[0, 'Any'], [10, 'R-10 or higher'], [13, 'R-13 or higher'], [19, 'R-19 or higher'], [22, 'R-22 or higher'], [30, 'R-30 or higher'], [38, 'R-38 or higher']].map(([v, l]) => `<option value="${v}" ${v === rmin ? 'selected' : ''}>${l}</option>`).join('')}</select></fieldset>
    <fieldset class="facet"><legend>Availability</legend><label class="check"><input type="checkbox" name="instock" ${instock ? 'checked' : ''}> In stock only</label><label class="check"><input type="checkbox" name="sale" ${sale ? 'checked' : ''}> On sale</label></fieldset>
    <button type="button" class="btn block" id="filterdone">Show ${shown.length} product${shown.length === 1 ? '' : 's'}</button></aside>
  <div class="shopmain">${shown.length ? `<div class="grid shopgrid" id="shopgrid">${shown.slice(0, SHOP_PAGE).map(card).join('')}</div>${shown.length > SHOP_PAGE ? `<div class="morewrap"><button type="button" class="btn ghost" id="shopmore">Show ${Math.min(SHOP_PAGE, shown.length - SHOP_PAGE)} more <small>(${shown.length - SHOP_PAGE} left)</small></button></div>` : ''}` : `<div class="emptyq">:ic-search:<p><b>No products match</b></p><p class="muted">Try removing a filter or searching for something else.</p><a class="btn" href="#/shop">Clear all filters</a></div>`}</div></div>`;
};
document.addEventListener('submit', async (e) => {
  if (e.target.id !== 'alertform') return; e.preventDefault();
  const { error } = await sb.rpc('notify_when_back', { pid: Number(e.target.dataset.id), addr: new FormData(e.target).get('email') });
  error ? fail(error) : (flash("Got it — we'll record your email for this product."), e.target.innerHTML = '<span class="muted">:ic-check-circle: You are on the list.</span>');
});
pages.shop.after = (_, q) => {
  const grid = document.getElementById('shopgrid'), setView = (v) => { grid?.classList.toggle('list', v === 'list'); document.querySelectorAll('#viewseg button').forEach((b) => b.classList.toggle('on', b.dataset.view === v)); };
  let view = 'grid'; try { view = localStorage.getItem('shopview') || 'grid'; } catch {} setView(view);
  document.getElementById('viewseg')?.addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; try { localStorage.setItem('shopview', b.dataset.view); } catch {} setView(b.dataset.view); });
  const apply = () => { const n = new URLSearchParams(q), g = (name) => document.querySelector(`.shophead [name=${name}], #filters [name=${name}]`);
    n.set('sort', g('sort').value); ['instock', 'sale'].forEach((k) => (g(k).checked ? n.set(k, '1') : n.delete(k))); ['min', 'max'].forEach((k) => (g(k).value ? n.set(k, g(k).value) : n.delete(k))); Number(g('rmin').value) ? n.set('rmin', g('rmin').value) : n.delete('rmin'); location.hash = `#/shop?${n}`; };
  document.getElementById('shopsort')?.addEventListener('change', apply);
  document.getElementById('shopmore')?.addEventListener('click', (e) => { const g = document.getElementById('shopgrid'), next = SHOWN.slice(SHOWN_N, SHOWN_N + SHOP_PAGE); g.insertAdjacentHTML('beforeend', next.map(card).join('')); SHOWN_N += next.length; syncCmpBoxes(); const left = SHOWN.length - SHOWN_N; if (left <= 0) e.currentTarget.closest('.morewrap').remove(); else e.currentTarget.innerHTML = `Show ${Math.min(SHOP_PAGE, left)} more <small>(${left} left)</small>`; });
  document.getElementById('filters')?.addEventListener('change', (e) => { if (e.target.matches('input, select')) apply(); });
  const panel = document.getElementById('filters'), setOpen = (o) => { panel.classList.toggle('open', o); document.body.classList.toggle('noscroll', o && window.innerWidth < 900); };
  document.getElementById('filterbtn')?.addEventListener('click', () => setOpen(true)); document.getElementById('filterclose')?.addEventListener('click', () => setOpen(false)); document.getElementById('filterdone')?.addEventListener('click', () => setOpen(false));
  window.addEventListener('hashchange', () => document.body.classList.remove('noscroll'), { once: true });
};
pages.product = async ([slug]) => {
  const { data: p } = await sb.from('products').select('*').eq('slug', slug).maybeSingle();
  if (!p) return '<h1>Not found</h1>';
  await attachPacks([p]); rememberBundles([p]);
  await loadRatings();
  const revs = (await sb.from('reviews').select('*').eq('product_id', p.id).order('created_at', { ascending: false })).data || [];
  const mine = session && revs.find((r) => r.user_id === session.user.id);
  const canMod = can('content.manage'), shownRevs = revs.filter((r) => !r.hidden || canMod || r.user_id === session?.user.id);
  const dist = [5, 4, 3, 2, 1].map((n) => [n, revs.filter((r) => !r.hidden && r.rating === n).length]), tot = dist.reduce((a, [, c]) => a + c, 0);
  const reviewsHtml = `${RATINGS[p.id] ? `<div class="revsum"><div class="revbig"><b>${RATINGS[p.id].avg}</b>${stars(RATINGS[p.id].avg)}<small class="muted">${RATINGS[p.id].count} review${RATINGS[p.id].count === 1 ? '' : 's'}</small></div><div class="revbars">${dist.map(([n, c]) => `<div class="revbar"><span>${n}★</span><i><b style="width:${tot ? Math.round(c / tot * 100) : 0}%"></b></i><small class="muted">${c}</small></div>`).join('')}</div></div>` : '<p class="muted">No reviews yet — be the first to share what you thought.</p>'}
  ${shownRevs.map((r) => `<div class="review ${r.hidden ? 'hiddenrev' : ''}"><div class="revhead">${stars(r.rating)} <b>${esc(r.author)}</b>${r.verified ? ' <span class="vbadge" title="This customer bought this product from us">:ic-check-circle: Verified purchase</span>' : ''} <span class="muted">· ${new Date(r.created_at).toLocaleDateString()}</span>${r.hidden ? ' <span class="status pending">hidden</span>' : ''}${session && r.user_id === session.user.id ? ` <button class="link delrev" data-id="${r.id}" style="color:var(--err)">Delete</button>` : ''}</div>${r.comment ? `<p>${esc(r.comment)}</p>` : ''}${(r.photos || []).length ? `<div class="revphotos">${r.photos.filter((u) => safeUrl(u)).map((u) => `<button type="button" class="revph" data-src="${esc(u)}" aria-label="Open photo"><img src="${esc(u)}" alt="Customer photo" loading="lazy"></button>`).join('')}</div>` : ''}${r.reply ? `<div class="revreply"><b>Reply from ${esc(theme.name || 'the store')}</b><p>${esc(r.reply)}</p></div>` : ''}${canMod ? `<div class="revmod noprint"><button class="link revhide" data-id="${r.id}" data-hide="${r.hidden ? '' : '1'}">${r.hidden ? 'Show again' : 'Hide'}</button> · <button class="link revreply-btn" data-id="${r.id}" data-reply="${esc(r.reply || '')}">${r.reply ? 'Edit reply' : 'Reply'}</button> · <button class="link delrev" data-id="${r.id}" style="color:var(--err)">Delete</button></div>` : ''}</div>`).join('')}
  ${!session ? '<p><a href="#/login">Log in</a> to write a review.</p>' : mine ? '' : `<form id="rf" class="stack narrow"><label>Your rating<select name="rating"><option value="5">★★★★★ Excellent</option><option value="4">★★★★ Good</option><option value="3">★★★ OK</option><option value="2">★★ Poor</option><option value="1">★ Bad</option></select></label>
  <label>Comment<textarea name="comment" rows="3" maxlength="2000"></textarea></label>
  <div><label class="btn ghost" style="cursor:pointer">:ic-image: Add photos <small>(up to 4)</small><input type="file" id="rphotos" accept="image/jpeg,image/png,image/webp" multiple hidden></label><div class="pend" id="rpend" hidden style="padding:8px 0 0"></div></div><button class="btn">Post review</button></form>`}`;
  const related = (await sb.from('products').select('*').eq('active', true).neq('id', p.id).limit(40)).data
    .sort((a, b) => (b.category === p.category) - (a.category === p.category)).slice(0, 4);
  const extra = (await sb.from('product_images').select('url').eq('product_id', p.id).order('position')).data || [];
  const pics = [p.image_url, ...extra.map((x) => x.url)].filter((u) => safeUrl(u));
  const recent = await recentHtml(p.id); pushRV(p.id); setSeo({ title: p.seo_title || `${p.name}${p.r_value && !p.name.includes(p.r_value) ? ' ' + p.r_value : ''}`, description: p.seo_description || p.description, image: pics[0], type: 'product', path: '/product/' + p.slug + '/', jsonld: [productLd(p, pics), { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [{ '@type': 'ListItem', position: 1, name: 'Shop', item: seoBase() + '/#/shop' }, { '@type': 'ListItem', position: 2, name: p.category, item: seoBase() + '/#/shop?category=' + encodeURIComponent(p.category) }, { '@type': 'ListItem', position: 3, name: p.name }] }] });
  const gallery = pics.length ? `<div class="gallery"><img class="big" id="mainpic" src="${esc(pics[0])}" alt="${esc(p.image_alt || p.name)}">${pics.length > 1 ? `<div class="thumbs">${pics.map((u, i) => `<img src="${esc(u)}" alt="Photo ${i + 1}" class="${i ? '' : 'on'}">`).join('')}</div>` : ''}</div>` : img(p, true);
  return `<div class="crumbs" role="navigation" aria-label="Breadcrumb"><a href="#/shop">Shop</a> › <a href="#/shop?category=${encodeURIComponent(p.category)}">${esc(p.category)}</a> › <span>${esc(p.name)}</span></div>
  <div class="detail"><div>${gallery}</div><div><span class="tag">${esc(p.category)}</span>${p.brand && p.brand !== p.category ? ` <a class="brandtag" href="#/shop?brand=${encodeURIComponent(p.brand)}">${esc(p.brand)}</a>` : ''}<h1>${esc(p.name)}</h1>
  <p class="price big">${priceHtml(p)} <small>per ${esc(p.unit)}</small>${onSale(p) ? ` <span class="savepill">Save ${salePct(p)}%</span>` : ''}</p>${p.r_value ? `<p><strong>R-value:</strong> ${esc(p.r_value)}</p>` : ''}<p>${esc(p.description)}</p>
  ${p.sku ? `<p class="muted skuline">SKU: ${esc(p.sku)}</p>` : ''}${packTable(p)}
  ${p.stock > 0 && !bundleOptions(p).length ? `<form class="row" id="add"><div class="qty"><button type="button" data-d="-1" aria-label="Less">−</button><input type="number" name="qty" value="1" min="1" max="${p.stock}" aria-label="Quantity"><button type="button" data-d="1" aria-label="More">+</button></div><button class="btn">Add to cart</button></form>
  <p class="stockpill ${p.stock <= 10 ? 'low' : ''}"><i></i>${p.stock <= 10 ? `Only ${p.stock} left` : 'In stock'}</p>` : `<p class="flash error" style="margin-bottom:8px">Out of stock</p><form id="alertform" class="row" data-id="${p.id}" style="flex-wrap:nowrap"><input name="email" type="email" required placeholder="Email me when it's back" value="${esc(session?.user.email || '')}" aria-label="Email"><button class="btn">:ic-bell: Notify me</button></form>`}
  <p class="pickinfo" id="pickinfo" data-id="${p.id}"></p><ul class="trust"><li>:ic-truck: ${FREE_SHIP > 0 ? `Free shipping on orders over ${money(FREE_SHIP)}` : `Flat ${money(SHIP)} delivery`}</li><li>:ic-chat: Questions? <a href="#/messages">Message us</a> or <a href="#/quote">request a quote</a></li></ul>
  ${compareHtml(p)}
  ${coverageOf(p) ? `<div class="calc"><h3>:ic-ruler: How many do I need?</h3><div class="row"><label>Area (sq ft) <input type="number" id="area" min="1" value="200"></label>
  <label>Waste % <input type="number" id="waste" min="0" max="30" value="10"></label></div><p class="out" id="calcout"></p></div>` : ''}</div></div>
  ${detailTabs(p)}
  <h2>Customer reviews</h2>${reviewsHtml}
  ${related.length ? `<h2>You might also need</h2><div class="grid">${related.map(card).join('')}</div>` : ''}${recent}`;
};
const coverageOf = (p) => { const m = /(\d+)\s*sq\s*ft/i.exec(p.unit); return m ? Number(m[1]) : 0; };
let RPH = [];
document.addEventListener('change', (e) => { if (e.target.id !== 'rphotos') return; for (const f of e.target.files) { if (RPH.length >= 4) { flash('You can add up to 4 photos.', 'error'); break; } if (f.size > 25 * 1024 * 1024) { flash(`"${f.name}" is too big.`, 'error'); continue; } RPH.push(f); } e.target.value = ''; drawRPH(); });
function drawRPH() { const el = document.getElementById('rpend'); if (!el) return; el.hidden = !RPH.length; el.innerHTML = RPH.map((f, i) => `<span class="pchip">:ic-image: ${esc(f.name.slice(0, 22))}<button type="button" data-rpx="${i}" aria-label="Remove photo">:ic-x:</button></span>`).join(''); }
document.addEventListener('click', (e) => {
  const x = e.target.closest('[data-rpx]'); if (x) { RPH.splice(Number(x.dataset.rpx), 1); drawRPH(); return; }
  const ph = e.target.closest('.revph'); if (ph) { const lb = document.createElement('div'); lb.className = 'lightbox'; lb.setAttribute('role', 'dialog'); lb.setAttribute('aria-label', 'Photo'); lb.innerHTML = `<img src="${esc(ph.dataset.src)}" alt="Customer photo"><button type="button" aria-label="Close">:ic-x:</button>`; const close = () => { lb.remove(); document.removeEventListener('keydown', k); }; const k = (ev) => { if (ev.key === 'Escape') close(); }; document.addEventListener('keydown', k); lb.addEventListener('click', close); document.body.appendChild(lb); }
});
function bindReviewMod() {
  document.querySelectorAll('.revhide').forEach((b) => b.addEventListener('click', async () => { const { error } = await sb.from('reviews').update({ hidden: !!b.dataset.hide }).eq('id', b.dataset.id); error ? fail(error) : (flash(b.dataset.hide ? 'Review hidden from customers.' : 'Review is visible again.'), route()); }));
  document.querySelectorAll('.revreply-btn').forEach((b) => b.addEventListener('click', async () => { const t = prompt('Your public reply to this review (leave empty to remove):', b.dataset.reply || ''); if (t === null) return; const { error } = await sb.from('reviews').update({ reply: t.trim().slice(0, 1000), replied_at: t.trim() ? new Date().toISOString() : null }).eq('id', b.dataset.id); error ? fail(error) : (flash('Reply saved.'), route()); }));
}
pages.product.after = ([slug]) => {
  RPH = [];
  (async () => { const box = document.getElementById('pickinfo'); if (!box) return; const { data } = await sb.rpc('pickup_locations', { items: [{ id: Number(box.dataset.id), qty: 1 }] }); const ok = (data || []).filter((l) => l.available);
    box.innerHTML = ok.length ? `:ic-store: <span><b>Free pickup</b> — in stock at ${ok.map((l) => esc(l.name)).join(', ')}</span>` : (data || []).length ? ':ic-store: <span class="muted">Not available for pickup right now</span>' : ''; })();
  document.getElementById('ptablist')?.addEventListener('click', (e) => { const b = e.target.closest('[data-tab]'); if (!b) return; document.querySelectorAll('#ptablist button').forEach((x) => x.classList.toggle('on', x === b)); document.querySelectorAll('.ptab').forEach((x) => (x.hidden = x.dataset.pane !== b.dataset.tab)); });
  const buy = document.getElementById('add') || (document.querySelector('.packs [data-addqty]') ? document.querySelector('.packs') : null); if (buy && window.IntersectionObserver) {
    const bar = document.createElement('div'); bar.className = 'buybar'; bar.hidden = true;
    bar.innerHTML = `<span><b>${esc(document.querySelector('h1')?.textContent || '')}</b><small>${document.querySelector('.price.big')?.textContent.replace(/\s+/g, ' ').trim() || ''}</small></span><button class="btn" type="button">Add to cart</button>`;
    document.body.appendChild(bar); bar.querySelector('button').addEventListener('click', () => (buy.requestSubmit ? buy.requestSubmit() : buy.scrollIntoView({ behavior: 'smooth', block: 'center' })));
    const io = new IntersectionObserver(([en]) => { bar.hidden = en.isIntersecting; }, { threshold: 0 }); io.observe(buy);
    const gone = () => { bar.remove(); io.disconnect(); window.removeEventListener('hashchange', gone); }; window.addEventListener('hashchange', gone);
  }
  document.querySelectorAll('.thumbs img').forEach((t) => t.addEventListener('click', () => {
    document.getElementById('mainpic').src = t.src; document.querySelectorAll('.thumbs img').forEach((x) => x.classList.toggle('on', x === t));
  }));
  document.getElementById('rf')?.addEventListener('submit', async (e) => {
    e.preventDefault(); const f = Object.fromEntries(new FormData(e.target));
    const { data: p } = await sb.from('products').select('id').eq('slug', slug).single();
    const btn = e.target.querySelector('button.btn:not(.ghost)'); btn.disabled = true; const photos = [];
    try { for (let file of RPH) { file = await prepImage(file, 1400); const path = `${session.user.id}/${crypto.randomUUID()}.${(file.type.split('/')[1] || 'jpg').replace('jpeg', 'jpg')}`; const up = await sb.storage.from('review-photos').upload(path, file, { contentType: file.type }); if (up.error) throw up.error; photos.push(sb.storage.from('review-photos').getPublicUrl(path).data.publicUrl); } } catch (err) { btn.disabled = false; return fail(err); }
    const { error } = await sb.from('reviews').insert({ product_id: p.id, rating: Number(f.rating), comment: f.comment.trim(), photos }); RPH = []; btn.disabled = false;
    error ? fail(error) : (flash('Thanks for your review!'), route());
  });
  bindReviewMod();
  document.querySelectorAll('.delrev').forEach((b) => b.addEventListener('click', async () => {
    const old = (await sb.from('reviews').select('photos').eq('id', b.dataset.id).maybeSingle()).data;
    const { error } = await sb.from('reviews').delete().eq('id', b.dataset.id); if (error) return fail(error);
    const paths = (old?.photos || []).map((u) => decodeURIComponent(String(u).split('/review-photos/')[1] || '')).filter(Boolean); if (paths.length) sb.storage.from('review-photos').remove(paths);
    route();
  }));
  const area = document.getElementById('area'); if (area) {
    sb.from('products').select('*').eq('slug', slug).single().then(({ data: p }) => {
      if (!document.getElementById('waste')) return; // navigated away
      const upd = () => {
        const need = Math.ceil((Number(area.value) || 0) * (1 + (Number(document.getElementById('waste').value) || 0) / 100) / coverageOf(p));
        const out = document.getElementById('calcout');
        out.innerHTML = need > 0 ? `You need <b>${need}</b> × ${esc(p.unit)} = <b>${money(need * p.price_cents)}</b> ${need <= p.stock ? '<button class="btn" id="addcalc" type="button">Add to cart</button>' : '<span class="muted">(only ' + p.stock + ' in stock)</span>'}` : '';
        document.getElementById('addcalc')?.addEventListener('click', () => { const c = getCart(); c[p.id] = Math.min(need, p.stock); setCart(c); location.hash = '#/cart'; });
      };
      area.addEventListener('input', upd); document.getElementById('waste').addEventListener('input', upd); upd();
    });
  }
  document.querySelectorAll('.packs [data-step]').forEach((b) => b.addEventListener('click', () => { const inp = b.closest('.qty').querySelector('input'), max = Number(inp.max) || 9999; inp.value = Math.min(max, Math.max(1, (parseInt(inp.value, 10) || 1) + Number(b.dataset.step))); }));
  document.querySelectorAll('[data-addqty]').forEach((b) => b.addEventListener('click', async () => {
    const { data: p } = await sb.from('products').select('id,stock,name').eq('slug', slug).single(); const cart = getCart(), n = Math.max(1, parseInt(b.closest('.packrow')?.querySelector('.packqty')?.value, 10) || 1), mult = Number(b.dataset.addqty);
    cart[p.id] = Math.min((cart[p.id] || 0) + n * mult, p.stock); setCart(cart); flash(`Added to your cart: ${n} × ${b.textContent.replace(/^Add\s*/, '')} of ${p.name}.`); location.hash = '#/cart';
  }));
  document.getElementById('add')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const { data: p } = await sb.from('products').select('id,stock,name').eq('slug', slug).single();
  const cart = getCart(); const qty = Math.max(1, parseInt(new FormData(e.target).get('qty'), 10) || 1);
  cart[p.id] = Math.min((cart[p.id] || 0) + qty, p.stock); setCart(cart); flash(`Added ${p.name} to your cart.`); location.hash = '#/cart';
});
};

// Pack pricing: bags vs bundles. Mirrors the database's pack_split(): biggest packs first, remainder at the normal price.
const packSplit = (p, q) => { let rest = q; const out = []; [...(p.packs || [])].filter((k) => k.unit_price_cents < p.price_cents).sort((a, b) => b.units - a.units).forEach((k) => { const n = Math.floor(rest / k.units); if (n > 0) { out.push({ qty: n * k.units, price: k.unit_price_cents, label: k.label }); rest -= n * k.units; } }); if (rest > 0) out.push({ qty: rest, price: p.price_cents, label: '' }); return out; };
const lineTotal = (p, q = p.qty) => packSplit(p, q).reduce((a, r) => a + r.qty * r.price, 0);
const su = (u) => String(u || '').replace(/\s*\(.*?\)\s*/g, ' ').trim();
const bw = (p) => (su(p?.unit).toLowerCase() === 'bundle' ? 'pack' : 'bundle'), Bw = (p) => bw(p)[0].toUpperCase() + bw(p).slice(1);
const packSave = (p, k) => Math.round((1 - k.unit_price_cents / p.price_cents) * 100);
async function attachPacks(list) { const ids = list.map((x) => x.id); if (!ids.length) return list; const { data } = await sb.from('product_packs').select('*').in('product_id', ids).order('units'); list.forEach((x) => (x.packs = (data || []).filter((k) => k.product_id === x.id))); return list; }
async function cartLines() {
  const cart = getCart(), ids = Object.keys(cart); if (!ids.length) return [];
  const { data } = await sb.from('products').select('*').in('id', ids).eq('active', true);
  const live = data.filter((p) => p.stock > 0); await attachPacks(live); rememberBundles(live); return live.map((p) => ({ ...p, qty: Math.min(cart[p.id], p.stock) }));
}
const cartLineHtml = (l) => { const N = bundleN(l), head = `<a href="#/product/${esc(l.slug)}" class="cthumb">${img(l)}</a>`, rm = `<button type="button" class="crm" data-id="${l.id}" aria-label="Remove ${esc(l.name)}">:ic-x:</button>`, tot = `<b class="ctotal">${money(lineTotal(l))}</b>`;
  const step = (name, val, max, label) => `<div class="qty"><button type="button" data-d="-1" aria-label="Fewer ${label}">−</button><input type="number" name="${name}" value="${val}" min="0" max="${max}" aria-label="${label}"><button type="button" data-d="1" aria-label="More ${label}">+</button></div>`;
  if (!N) return `<div class="citem">${head}<div class="cinfo"><a class="cname" href="#/product/${esc(l.slug)}">${esc(l.name)}</a><small class="muted">${packSplit(l, l.qty).map((r) => `${r.qty} × ${money(r.price)}`).join(' + ')} per ${esc(su(l.unit) || 'unit')}</small></div><div class="qty"><button type="button" data-d="-1" aria-label="Less">−</button><input type="number" name="${l.id}" value="${l.qty}" min="0" max="${l.stock}" aria-label="Quantity"><button type="button" data-d="1" aria-label="More">+</button></div>${tot}${rm}</div>`;
  const b = Math.floor(l.qty / N), lo = l.qty % N, u = su(l.unit) || 'bag', nudge = (l.packs || []).filter((k) => k.units > l.qty && k.unit_price_cents < l.price_cents).sort((a, c) => a.units - c.units)[0];
  return `<div class="citem bundled">${head}<div class="cinfo"><a class="cname" href="#/product/${esc(l.slug)}">${esc(l.name)}</a><small class="muted">1 ${bw(l)} = ${N} ${esc(u)}s</small>${nudge ? `<small class="packnudge">Add ${nudge.units - l.qty} more ${esc(u)}s for the ${esc(packName(nudge, l))} price</small>` : ''}</div>
    <div class="qtys"><input type="hidden" name="n_${l.id}" value="${N}">
      <div class="qrow"><span class="ql"><b>${bw(l)[0].toUpperCase() + bw(l).slice(1)}s</b><small class="muted">${money(bundlePrice(l))} each</small></span>${step('b_' + l.id, b, Math.floor(l.stock / N), bw(l) + 's')}</div>
      <div class="qrow"><span class="ql"><b>${esc(u[0].toUpperCase() + u.slice(1))}s</b><small class="muted">${money(l.price_cents)} each</small></span>${step('l_' + l.id, lo, l.stock, u + 's')}</div></div>${tot}${rm}</div>`; };
pages.cart = async () => {
  const lines = await cartLines();
  if (!lines.length) return '<div class="empty"><div style="font-size:3rem">:ic-cart:</div><h1>Your cart is empty</h1><p class="muted">Browse our insulation and add what you need.</p><a class="btn" href="#/shop">Start shopping</a></div>';
  const t = totals(lines.reduce((a, l) => a + lineTotal(l), 0));
  const left = FREE_SHIP > 0 ? FREE_SHIP - (t.sub - t.disc) : 0;
  return `<h1>Your cart</h1><div class="cartwrap"><form id="cartform"><div class="citems">${lines.map(cartLineHtml).join('')}</div></form>
  <aside class="summary"><h3>Order summary</h3>${(STORE.ship_zones || []).length ? '<p class="muted" style="margin:0">Delivery fee depends on your postal code — you will see it at checkout.</p>' : ''}${FREE_SHIP > 0 ? `<p class="muted" style="margin:0">${left > 0 ? `Add <b>${money(left)}</b> more for free shipping` : ':ic-award: You qualify for free shipping!'}</p><div class="progress"><i style="width:${Math.min(100, (t.sub - t.disc) / FREE_SHIP * 100)}%"></i></div>` : ''}
  <form id="promo" class="row" style="flex-wrap:nowrap"><input name="code" placeholder="Discount code" value="${esc(getPromo()?.code || '')}" aria-label="Discount code" style="flex:1;min-width:0"><button class="btn ghost">Apply</button></form>
  ${totalsHtml(t)}<a class="btn block" href="#/checkout">Checkout</a><a class="muted" href="#/shop" style="text-align:center;display:block;margin-top:10px">← Continue shopping</a></aside></div>`;
};
pages.cart.after = () => {
  document.getElementById('promo')?.addEventListener('submit', async (e) => {
    e.preventDefault(); const code = new FormData(e.target).get('code').trim().toUpperCase();
    if (!code) { localStorage.removeItem('promo'); return route(); }
    const sub = (await cartLines()).reduce((a, l) => a + lineTotal(l), 0);
    const { data } = await sb.rpc('check_code', { c: code, subtotal: sub });
    if (!data) { localStorage.removeItem('promo'); flash('That code is not valid for this order.', 'error'); return route(); }
    localStorage.setItem('promo', JSON.stringify({ code, percent: data })); flash(`Code ${code} applied: ${data}% off.`); route();
  });
  const cf = document.getElementById('cartform'); let tm = null;
  cf?.addEventListener('change', () => { clearTimeout(tm); tm = setTimeout(() => cf.requestSubmit(), 350); });
  cf?.addEventListener('click', (e) => { const bd = e.target.closest('[data-bd]'); if (bd) { const inp = cf.querySelector(`input[name="${bd.dataset.id}"]`), max = Number(inp.max) || 9999; inp.value = Math.max(0, Math.min(max, (parseInt(inp.value, 10) || 0) + Number(bd.dataset.bd) * Number(bd.dataset.n))); cf.requestSubmit(); return; } const r = e.target.closest('.crm'); if (r) { cf.querySelectorAll(`input[name="${r.dataset.id}"], input[name="b_${r.dataset.id}"], input[name="l_${r.dataset.id}"]`).forEach((i) => (i.value = 0)); cf.requestSubmit(); } });
  document.getElementById('cartform')?.addEventListener('submit', (e) => {
  e.preventDefault(); const cart = {};
  const fd = new FormData(e.target), bundled = new Set();
  for (const [k, v] of fd) { const m = /^[bln]_(\d+)$/.exec(k); if (m) { bundled.add(m[1]); continue; } const q = parseInt(v, 10); if (q > 0) cart[k] = q; }
  bundled.forEach((id) => { const q = (parseInt(fd.get('b_' + id), 10) || 0) * (parseInt(fd.get('n_' + id), 10) || 1) + (parseInt(fd.get('l_' + id), 10) || 0); if (q > 0) cart[id] = q; });
  setCart(cart); route();
});
};

let SAVED = [], CHK = null;
pages.checkout = async () => {
  const lines = await cartLines(); if (!lines.length) return '<h1>Checkout</h1><p>Your cart is empty.</p>';
  if (shopClosed()) return `<div class="authcard"><div class="authicon">:ic-lock:</div><h1>The shop is closed</h1><p class="muted">${esc(closedMsg())}${esc(reopenNote())}</p><a class="btn" href="#/cart">Back to cart</a> <a class="btn ghost" href="#/products">Keep browsing</a></div>`;
  SAVED = session ? (await sb.from('addresses').select('*').order('is_default', { ascending: false }).order('id')).data || [] : [];
  const d = SAVED[0] || {};
  const t = totals(lines.reduce((a, l) => a + lineTotal(l), 0), false, zoneFee(d.postcode));
  const pk = (await sb.rpc('pickup_locations', { items: lines.map((l) => ({ id: l.id, qty: l.qty })) })).data || [];
  CHK = { lines, t, pk };
  const f = (n, l, v = '', x = '') => `<label>${l}<input name="${n}" value="${esc(v)}" ${x}></label>`;
  const hasPk = pk.length > 0;
  return `<h1>Checkout</h1><ol class="steps2"><li class="done">Cart</li><li class="on">Your details</li><li>Confirmation</li></ol>
  <div class="cartwrap"><form id="co" class="stack">
  <section class="cs"><h3><span class="num">1</span> Contact</h3>
    ${f('name', 'Full name', d.name || profile?.name, 'required')}${f('email', 'Email', session?.user.email, 'type="email" required')}${f('phone', 'Phone', d.phone)}</section>
  <section class="cs"><h3><span class="num">2</span> ${hasPk ? 'Delivery or pickup' : 'Delivery'}</h3>
  ${hasPk ? `<div class="choicecards"><label class="cc"><input type="radio" name="fulfillment" value="delivery" checked><span><b>:ic-truck: Delivery</b><small>To your address</small></span></label><label class="cc"><input type="radio" name="fulfillment" value="pickup"><span><b>:ic-store: Pickup</b><small>Free · collect in store</small></span></label></div>
  <div id="pickbox" hidden class="stack">${pk.map((l, i) => `<label class="check pk ${l.available ? '' : 'na'}"><input type="radio" name="location_id" value="${l.id}" ${l.available ? '' : 'disabled'} ${l.available && !pk.slice(0, i).some((x) => x.available) ? 'checked' : ''}> <span><b>${esc(l.name)}</b>${l.available ? '' : ' — not enough stock here'}<br><small class="muted">${esc([l.address, l.city].filter(Boolean).join(', '))}${l.hours ? ' · ' + esc(l.hours) : ''}${l.phone ? ' · ' + esc(l.phone) : ''}</small></span></label>`).join('')}</div>` : ''}
  <div id="addrbox" class="stack">${SAVED.length ? `<label>Use a saved address<select id="savedaddr">${SAVED.map((a, i) => `<option value="${i}">${esc(a.label)} — ${esc(a.address)}, ${esc(a.city)}</option>`).join('')}<option value="">Enter a new address</option></select></label>` : ''}
  ${f('address', 'Delivery address', d.address, 'required')}<div class="two2">${f('city', 'City', d.city, 'required')}${f('postcode', 'Postal / ZIP code', d.postcode, 'required')}</div><p class="muted" id="zonenote" style="margin:0"></p></div></section>
  <section class="cs"><h3><span class="num">3</span> Notes &amp; payment</h3><label>Order notes (optional)<textarea name="notes" rows="3" placeholder="Gate code, delivery instructions…"></textarea></label>
  <p class="muted" style="margin:0">${C.PAYMENTS ? ':ic-lock: You will be taken to a secure Stripe page to pay by card.' : "Payment: we'll email you an invoice and payment options once your order is confirmed."}</p>
  <button class="btn block">${C.PAYMENTS ? 'Continue to payment' : 'Place order'}</button></section></form>
  <aside class="summary"><h3>Order summary</h3><ul class="olist">${lines.map((l) => `<li><span class="cthumb sm">${img(l)}</span><span>${esc(qtyText(l))} × ${esc(l.name)}</span><b>${money(lineTotal(l))}</b></li>`).join('')}</ul>${totalsHtml(t)}<a class="muted" href="#/cart" style="text-align:center;display:block">← Edit cart</a></aside></div>`;
};
pages.checkout.after = () => {
  document.getElementById('savedaddr')?.addEventListener('change', (e) => {
    const a = SAVED[e.target.value] || { name: '', phone: '', address: '', city: '', postcode: '' };
    for (const k of ['name', 'phone', 'address', 'city', 'postcode']) document.querySelector(`#co [name=${k}]`).value = a[k] || '';
  });
  const setFulfil = () => {
    const pick = document.querySelector('#co input[name=fulfillment]:checked')?.value === 'pickup';
    const ab = document.getElementById('addrbox'), pb = document.getElementById('pickbox'); if (!ab) return;
    ab.hidden = pick; if (pb) pb.hidden = !pick; ab.querySelectorAll('input').forEach((i) => (i.required = !pick));
    const pc = document.querySelector('#co [name=postcode]')?.value || '', fee = zoneFee(pc);
    document.querySelector('aside .totals')?.replaceWith(Object.assign(document.createElement('div'), { innerHTML: totalsHtml(totals(CHK.t.sub, pick, fee)) }).firstElementChild);
    const note = document.getElementById('zonenote'); if (note) note.textContent = !pick && (STORE.ship_zones || []).length ? (pc.trim() ? `Delivery to ${pc.toUpperCase()}${zoneLabel(pc) ? ' (' + zoneLabel(pc) + ')' : ''}: ${money(fee)}` : 'Enter your postal code to see your delivery fee.') : '';
  };
  document.querySelectorAll('#co input[name=fulfillment]').forEach((r) => r.addEventListener('change', setFulfil));
  ['email', 'name', 'phone'].forEach((k) => document.querySelector(`#co [name=${k}]`)?.addEventListener('change', (e) => { try { localStorage.setItem('cart_' + k, e.target.value.trim()); } catch {} syncCart(); }));
  document.querySelector('#co [name=postcode]')?.addEventListener('input', setFulfil); document.getElementById('savedaddr')?.addEventListener('change', setFulfil); setFulfil();
  document.getElementById('co')?.addEventListener('submit', async (e) => {
  e.preventDefault(); const btn = e.target.querySelector('button'); btn.disabled = true;
  const customer = { ...Object.fromEntries(new FormData(e.target)), code: getPromo()?.code || '' };
  if (customer.fulfillment === 'pickup' && !customer.location_id) { btn.disabled = false; return fail(new Error('Choose a pickup location.')); }
  const items = Object.entries(getCart()).map(([id, qty]) => ({ id: Number(id), qty }));
  const { data, error } = await sb.rpc('place_order', { items, customer });
  btn.disabled = false; if (error) return fail(error);
  setCart({}); localStorage.removeItem('promo');
  if (C.PAYMENTS) {
    const pay = await sb.functions.invoke('create-checkout', { body: { order_id: data.id, key: session ? null : data.key } });
    if (pay.data?.url) return (location.href = pay.data.url);
    flash('Order saved, but we could not start the payment. We will contact you to arrange it.', 'error');
  } else flash(`Thanks! Order #${data.id} received. We'll email you an invoice shortly.`);
  location.hash = `#/order/${data.id}` + (session ? '' : `?k=${data.key}`);
  });
};

const CARRIERS = {
  'Canada Post': (n) => `https://www.canadapost-postescanada.ca/track-reperage/en#/search?searchFor=${n}`, UPS: (n) => `https://www.ups.com/track?tracknum=${n}`,
  FedEx: (n) => `https://www.fedex.com/fedextrack/?trknbr=${n}`, Purolator: (n) => `https://www.purolator.com/en/shipping/tracker?pin=${n}`,
  DHL: (n) => `https://www.dhl.com/en/express/tracking.html?AWB=${n}`, USPS: (n) => `https://tools.usps.com/go/TrackConfirmAction?tLabels=${n}` };
const trackLink = (c, n) => (CARRIERS[c] ? CARRIERS[c](encodeURIComponent(n)) : '');
const orderHtml = (o, items, admin) => {
  const steps = ['pending', 'paid', 'shipped', 'delivered'], idx = steps.indexOf(o.status);
  const kind = o.source === 'in_store' ? 'In-store sale' : o.fulfillment === 'pickup' ? 'Pickup' : 'Delivery';
  const link = o.tracking_number ? trackLink(o.tracking_carrier, o.tracking_number) : '';
  return `<div class="printonly"><h2>${esc(STORE.biz?.legal_name || theme.name || 'Gomi Insulation')}</h2><p>${[STORE.biz?.address, STORE.biz?.phone, STORE.biz?.email].filter(Boolean).map(esc).join(' · ')}${STORE.biz?.tax_number ? `<br>${esc(STORE.tax_label || 'Tax')} no. ${esc(STORE.biz.tax_number)}` : ''}</p><p><b>Invoice for order #${o.id}</b> · ${dateOf(o.created_at)}</p></div>
  <div class="ohead"><div><h1 style="margin:0">Order #${o.id}</h1><p class="muted" style="margin:2px 0 0">Placed ${dateOf(o.created_at)} · ${kind}</p></div><span class="status big ${esc(o.status)}">${esc(o.status)}</span></div>
  ${o.status === 'cancelled' ? '' : `<ol class="timeline">${steps.map((st, i) => `<li class="${i < idx ? 'done' : i === idx ? 'on' : ''}"><i></i><span>${st}</span></li>`).join('')}</ol>`}
  ${o.tracking_number ? `<div class="trackbox">:ic-package: <span><b>${esc(o.tracking_carrier || 'Tracking number')}</b> · ${esc(o.tracking_number)}</span>${link ? `<a class="btn ghost noprint" href="${esc(link)}" target="_blank" rel="noopener nofollow">Track package ↗</a>` : ''}</div>` : ''}
  <div class="cartwrap"><div><div class="citems">${items.map(oiLine).join('')}</div>
  ${o.notes ? `<p class="muted"><em>Notes: ${esc(o.notes)}</em></p>` : ''}</div>
  <aside class="summary">${totalsHtml({ sub: o.subtotal_cents, disc: o.discount_cents, code: o.promo_code, ship: o.shipping_cents, tax: o.tax_cents, taxLabel: o.tax_label, total: o.total_cents, refunded: o.refunded_cents })}
    <div><h3 style="margin:0 0 4px">${kind === 'Delivery' ? 'Delivering to' : kind === 'Pickup' ? 'Pickup' : 'Sold at'}</h3><p style="margin:0">${esc(o.name)}<br>${esc(o.address)}<br>${esc(o.city)} ${esc(o.postcode)}<br><span class="muted">${esc(o.email)} ${esc(o.phone)}</span></p>${o.payment_method ? `<p class="muted" style="margin:6px 0 0">Paid by ${esc(o.payment_method)}</p>` : ''}</div>
    ${admin === 'ro' ? '<button class="btn ghost noprint" id="printbtn" type="button">:ic-print: Print</button>' : admin ? `<form class="stack" id="status"><label>Status<select name="status">${STATUSES.map((s) => `<option ${s === o.status ? 'selected' : ''}>${s}</option>`).join('')}</select></label><button class="btn alt">Update status</button></form>
    <form class="stack" id="trackform"><label>Carrier<select name="carrier">${['', ...Object.keys(CARRIERS), 'Other'].map((c) => `<option value="${c}" ${c === (o.tracking_carrier || '') ? 'selected' : ''}>${c || '— none —'}</option>`).join('')}</select></label><label>Tracking number<input name="number" maxlength="60" value="${esc(o.tracking_number || '')}"></label><button class="btn ghost">Save tracking</button></form><button class="btn ghost noprint" id="printbtn" type="button">:ic-print: Print / packing slip</button>`
      : `<div class="row noprint"><button class="btn ghost" id="printbtn" type="button">:ic-print: Print invoice</button><button class="btn" id="reorder" type="button" data-items="${esc(JSON.stringify(items.filter((i) => i.product_id).map((i) => [i.product_id, i.qty])))}">:ic-refresh: Order again</button></div>`}</aside></div>`;
};
pages.order = async ([id], q) => {
  if (q.get('paid')) flash('Payment received. Thank you! Your order will update to "paid" in a moment.');
  let o, items;
  if (q.get('k')) { const { data } = await sb.rpc('get_guest_order', { oid: Number(id), k: q.get('k') }); if (data) { o = data; items = data.items; } }
  else { o = (await sb.from('orders').select('*').eq('id', id).maybeSingle()).data; if (o) items = (await sb.from('order_items').select('*').eq('order_id', id)).data; }
  return o ? orderHtml(o, items, false) : '<h1>Order not found</h1>';
};
pages.order.after = () => {
  document.getElementById('printbtn')?.addEventListener('click', () => window.print());
  document.getElementById('reorder')?.addEventListener('click', async (e) => {
    const ids = JSON.parse(e.currentTarget.dataset.items || '[]'); if (!ids.length) return;
    const { data } = await sb.from('products').select('id,stock').in('id', ids.map((x) => x[0])).eq('active', true);
    const cart = getCart(); let added = 0, skipped = 0;
    ids.forEach(([pid, qty]) => { const pr = (data || []).find((x) => x.id === pid); if (!pr || pr.stock < 1) { skipped++; return; } cart[pid] = Math.min((cart[pid] || 0) + qty, pr.stock); added++; });
    setCart(cart); flash(added ? `Added ${added} item${added === 1 ? '' : 's'} to your cart${skipped ? ` (${skipped} no longer available)` : ''}.` : 'Those items are no longer available.', added ? 'ok' : 'error'); if (added) location.hash = '#/cart';
  });
};
pages.track = (a, q) => `<div class="authcard"><div class="authicon">:ic-package:</div><h1>Track your order</h1><p class="muted">Enter your order number and the email you used when ordering.</p>
  <form id="trk" class="stack"><label>Order number<input name="oid" inputmode="numeric" required placeholder="e.g. 1042" value="${esc(q.get('order') || '')}"></label><label>Email<input name="email" type="email" required autocomplete="email"></label><button class="btn block">Find my order</button></form></div><div id="trkout" style="margin-top:24px"></div>`;
pages.track.after = () => document.getElementById('trk')?.addEventListener('submit', async (e) => {
  e.preventDefault(); const f = Object.fromEntries(new FormData(e.target)); const out = document.getElementById('trkout');
  const { data } = await sb.rpc('track_order', { oid: Number(String(f.oid).replace(/\D/g, '')) || 0, mail: f.email });
  if (!data) { out.innerHTML = '<p class="flash error">We couldn\'t find an order with that number and email. Check both and try again.</p>'; return; }
  out.innerHTML = orderHtml(data, data.items, false); pages.order.after();
});

// Anti-bot: a hidden field real people never see, plus the time the form appeared (bots submit instantly)
const honeypot = () => `<div class="hpfield" aria-hidden="true"><label>Leave this empty<input type="text" name="website" tabindex="-1" autocomplete="off"></label></div>`;
const FORM_SHOWN = {}; const markShown = (k) => { FORM_SHOWN[k] = Date.now(); };
const authForm = (reg) => {
  const perks = [[':ic-receipt:', 'Track every order', 'See status, tracking and past invoices.'], [':ic-package:', 'Reorder in one click', 'Repeat a previous job without searching.'], [':ic-map-pin:', 'Saved delivery addresses', 'Check out faster next time.'], [':ic-chat:', 'Message our team', 'Questions about a product or delivery.']];
  const cart = Object.keys(getCart()).length;
  return `<div class="authwrap"><aside class="authside"><div><div class="authbrand">${esc((theme.name || 'Gomi Insulation'))}</div><h2>${reg ? 'Create a free account' : 'Welcome back'}</h2><p>${reg ? 'It takes a minute and makes ordering easier.' : 'Log in to pick up where you left off.'}</p></div>
    <ul class="authperks">${perks.map(([i, t, d]) => `<li><span>${i}</span><div><b>${t}</b><small>${d}</small></div></li>`).join('')}</ul></aside>
  <section class="authmain"><div class="seg authtabs" role="tablist"><a role="tab" class="${reg ? '' : 'on'}" href="#/login">Log in</a><a role="tab" class="${reg ? 'on' : ''}" href="#/register">Create account</a></div>
  <form id="auth" class="stack authform" novalidate>
    ${reg ? `<label>Full name<input name="name" required autocomplete="name" autofocus></label>
      <label>Username<input name="username" required minlength="3" maxlength="30" pattern="[A-Za-z0-9][A-Za-z0-9_.\\-]{2,29}" autocomplete="username" placeholder="e.g. sam_builds" autocapitalize="none" spellcheck="false"><small id="unhint" class="muted">3–30 letters, numbers, dots, dashes or underscores. You can log in with it.</small></label>
      <label>Email<input type="email" name="email" required autocomplete="email" inputmode="email"></label>` : `<label>Email or username<input name="email" required autocomplete="username" autocapitalize="none" spellcheck="false" autofocus></label>`}
    <label class="pwlabel"><span class="pwtop">Password${reg ? '' : '<a href="#/forgot" class="forgot">Forgot password?</a>'}</span><span class="pwfield"><input type="password" name="password" id="pw" required minlength="${reg ? 8 : 1}" autocomplete="${reg ? 'new-password' : 'current-password'}"><button type="button" class="pwtoggle" id="pwtoggle" aria-label="Show password" aria-pressed="false">:ic-eye:</button></span>
      ${reg ? '<span class="meter" id="pwmeter" aria-hidden="true"><i></i><i></i><i></i><i></i></span><small class="muted" id="pwhint">At least 8 characters. A mix of letters and numbers is stronger.</small>' : ''}</label>
    ${reg ? honeypot() : ''}<p class="autherr" id="autherr" role="alert" hidden></p>
    <button class="btn block" id="authgo">${reg ? 'Create my account' : 'Log in'}</button>
  </form>
  ${reg ? '<p class="muted authfine">We only use your details to process orders and contact you about them.</p>' : (cart ? '<p class="authguest">In a hurry? <a href="#/checkout">Check out as a guest</a> — no account needed.</p>' : '')}
  <p class="authswitch">${reg ? 'Already have an account? <a href="#/login">Log in</a>' : 'New here? <a href="#/register">Create an account</a>'}</p></section></div>`; };
pages.forgot = () => `<div class="authcard"><div class="authicon">:ic-key:</div><h1>Reset your password</h1><p class="muted">Enter your email and we'll send you a link to choose a new password.</p>
  <form id="ff" class="stack"><label>Email<input type="email" name="email" required autocomplete="email"></label><button class="btn">Send reset link</button></form><p><a href="#/login">Back to log in</a></p></div>`;
pages.forgot.after = () => document.getElementById('ff')?.addEventListener('submit', async (e) => {
  e.preventDefault(); const email = new FormData(e.target).get('email').trim();
  const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname });
  if (error) return fail(error);
  e.target.outerHTML = '<p class="flash ok">If an account exists for that email, a reset link is on its way. Check your inbox (and spam).</p>';
});
pages.reset = () => !session ? '<div class="narrow"><h1>Link expired</h1><p>This reset link is invalid or has expired. <a href="#/forgot">Request a new one</a>.</p></div>'
  : `<div class="narrow"><h1>Choose a new password</h1><form id="rp" class="stack"><label>New password<input type="password" name="password" minlength="8" required autocomplete="new-password"></label>
  <label>Confirm password<input type="password" name="confirm" minlength="8" required autocomplete="new-password"></label><button class="btn">Update password</button></form></div>`;
pages.reset.after = () => document.getElementById('rp')?.addEventListener('submit', async (e) => {
  e.preventDefault(); const f = Object.fromEntries(new FormData(e.target));
  if (f.password !== f.confirm) return fail(new Error('Passwords do not match.'));
  const { error } = await sb.auth.updateUser({ password: f.password });
  if (error) return fail(error); flash('Password updated.'); location.hash = '#/account';
});
pages.login = () => authForm(false); pages.register = () => authForm(true);
const UN_RE = /^[A-Za-z0-9][A-Za-z0-9_.-]{2,29}$/;
const checkUsername = async (u, hint) => {
  if (!UN_RE.test(u)) { hint.textContent = u ? '3–30 letters, numbers, dots, dashes or underscores — start with a letter or number' : ''; hint.className = 'muted'; return false; }
  const { data } = await sb.rpc('username_available', { u }); hint.innerHTML = data ? `:ic-check: @${esc(u)} is available` : `:ic-x-circle: @${esc(u)} is taken or reserved`; hint.className = data ? 'up' : 'down'; return !!data;
};
const edgeError = async (error, data) => { let m = data?.error; if (!m && error?.context?.json) { try { m = (await error.context.json()).error; } catch {} } return m || (error?.context?.status === 404 ? "Username sign-in isn't available yet — please use your email address." : error?.message) || 'Could not sign in.'; };
let PREV_HASH = '';
const authAfter = (reg) => () => {
  const eb = document.getElementById('autherr'), show = (m) => { eb.textContent = m; eb.hidden = !m; }, goBtn = document.getElementById('authgo'), label0 = goBtn.textContent;
  document.getElementById('pwtoggle')?.addEventListener('click', (e) => { const pw = document.getElementById('pw'), on = pw.type === 'password'; pw.type = on ? 'text' : 'password'; e.currentTarget.setAttribute('aria-pressed', String(on)); e.currentTarget.setAttribute('aria-label', on ? 'Hide password' : 'Show password'); e.currentTarget.innerHTML = on ? ':ic-eye-off:' : ':ic-eye:'; });
  document.getElementById('pwmeter') && document.getElementById('pw').addEventListener('input', (e) => { const v = e.target.value; let sc = 0; if (v.length >= 8) sc++; if (v.length >= 12) sc++; if (/[a-z]/.test(v) && /[A-Z]/.test(v)) sc++; if (/\d/.test(v) && /[^A-Za-z0-9]|[A-Za-z]/.test(v)) sc++; if (!v) sc = 0;
    const m = document.getElementById('pwmeter'); m.className = 'meter s' + sc; document.getElementById('pwhint').textContent = !v ? 'At least 8 characters. A mix of letters and numbers is stronger.' : ['Too short', 'Weak — add more characters', 'Okay', 'Good', 'Strong'][sc] || ''; });
  document.getElementById('auth')?.querySelectorAll('input').forEach((i) => i.addEventListener('input', () => show('')));
  const hint = document.getElementById('unhint'), un = document.querySelector('#auth [name=username]'); let t = null;
  un?.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => checkUsername(un.value.trim(), hint), 300); });
  document.getElementById('auth')?.addEventListener('submit', async (e) => {
    e.preventDefault(); const f = Object.fromEntries(new FormData(e.target)), btn = e.target.querySelector('button'); if (!e.target.checkValidity()) { e.target.reportValidity(); return; } btn.disabled = true; btn.textContent = reg ? 'Creating account…' : 'Logging in…'; show(''); let r;
    try {
      if (reg) {
        if (f.website || Date.now() - (FORM_SHOWN.signup || 0) < 2500) { await new Promise((r) => setTimeout(r, 1200)); return show('Please take a moment to check your details and try again.'); }
        if (!(await checkUsername(f.username.trim(), hint))) return show('Please choose a different username.');
        r = await sb.auth.signUp({ email: f.email.trim(), password: f.password, options: { data: { name: f.name, username: f.username.trim() } } });
      } else if (f.email.includes('@')) r = await sb.auth.signInWithPassword({ email: f.email.trim(), password: f.password });
      else {
        const { data, error } = await sb.functions.invoke('username-login', { body: { identifier: f.email.trim(), password: f.password } });
        if (!data?.access_token) return show(await edgeError(error, data));
        r = await sb.auth.setSession({ access_token: data.access_token, refresh_token: data.refresh_token });
      }
      if (r.error) return show(/invalid login/i.test(r.error.message) ? 'That email/username and password do not match.' : /database error|saving new user/i.test(r.error.message) ? 'We could not create that account. Please use a permanent email address (not a temporary/disposable one) and try again.' : /rate limit|too many/i.test(r.error.message) ? 'Too many attempts. Please wait a few minutes and try again.' : r.error.message);
      if (reg && !r.data.session) { flash('Check your email to confirm your account, then log in with your email or username.'); return (location.hash = '#/login'); }
      await loadSession(); flash(reg ? 'Welcome! Your account is ready.' : 'Logged in.'); location.hash = /^#\/(checkout|cart|messages|account|order|admin|wishlist)/.test(PREV_HASH) ? PREV_HASH : '#/account';
    } catch (err) { show(err.message || 'Something went wrong. Please try again.'); } finally { btn.disabled = false; btn.textContent = label0; }
  });
};
pages.login.after = authAfter(false); pages.register.after = () => { markShown('signup'); authAfter(true)(); };

const ordersTable = (os, base, locNames) => os.length ? `<table><tr><th>Order</th><th>Date</th>${locNames ? '<th>Location</th>' : ''}<th>Status</th><th>Total</th></tr>${os.map((o) => `<tr><td><a href="${base}/${o.id}">#${o.id}</a>${base.includes('admin') ? ' · ' + esc(o.name) : ''}</td><td>${dateOf(o.created_at)}</td>${locNames ? `<td>${esc(locNames[o.location_id] || '')}${o.source === 'in_store' ? ' · in store' : o.fulfillment === 'pickup' ? ' · pickup' : ''}</td>` : ''}<td><span class="status ${esc(o.status)}">${esc(o.status)}</span></td><td>${money(o.total_cents)}</td></tr>`).join('')}</table>` : '<p>No orders yet.</p>';
const setDefault = async (id) => { await sb.from('addresses').update({ is_default: false }).neq('id', id); await sb.from('addresses').update({ is_default: true }).eq('id', id); };
pages.account = async () => {
  if (!session) { location.hash = '#/login'; return ''; }
  const { data } = await sb.from('orders').select('*').eq('user_id', session.user.id).order('id', { ascending: false });
  const addrs = (await sb.from('addresses').select('*').order('is_default', { ascending: false }).order('id')).data;
  const wl = getWish().length;
  const myInv = (await sb.from('invoices').select('id,number,due_date,status,total_cents,paid_cents').or(`customer_id.eq.${session.user.id},customer_email.ilike.${String(session.user.email).replace(/[,()]/g, '')}`).order('id', { ascending: false })).data || [];
  return `<div class="acchead">${avatar(profile?.name || 'U')}<div><h1 style="margin:0">${esc(profile?.name || 'My account')}</h1><span class="muted">${profile?.username ? `@${esc(profile.username)} · ` : ''}${esc(session.user.email)}</span></div></div>
  ${profile?.username ? '' : '<p class="flash ok" style="margin:0 0 14px">:ic-smile: Choose a username below — you can then log in with it instead of your email.</p>'}
  <div class="attn"><a class="attnc" href="#/account"><span>:ic-receipt:</span><b>${data.length}</b><small>orders</small></a><a class="attnc ${unread.msg ? 'on' : ''}" href="#/messages"><span>:ic-chat:</span><b>${unread.msg}</b><small>unread messages</small></a><a class="attnc ${unread.all ? 'on' : ''}" href="#/notifications"><span>:ic-bell:</span><b>${unread.all}</b><small>notifications</small></a><a class="attnc" href="#/wishlist"><span>:ic-heart:</span><b>${wl}</b><small>saved items</small></a></div>
  <section class="cs"><h3>Order history</h3>${ordersTable(data, '#/order')}</section>
  ${myInv.length ? `<section class="cs"><h3>Invoices</h3><table><tr><th>Invoice</th><th>Due</th><th>Total</th><th>Balance</th><th>Status</th></tr>${myInv.map((i) => `<tr><td><a href="#/invoice/${i.id}"><b>${esc(i.number)}</b></a></td><td>${esc(i.due_date)}</td><td>${money(i.total_cents)}</td><td>${money(invBal(i))}</td><td><span class="status ${invEff(i) === 'overdue' ? 'cancelled' : invEff(i)}">${invEff(i)}</span></td></tr>`).join('')}</table></section>` : ''}
  <section class="cs"><h3>Saved addresses</h3>${addrs.length ? addrs.map((a) => `<div class="addr"><b>${esc(a.label)}</b>${a.is_default ? ' <span class="status paid">default</span>' : ''}<br>${esc(a.name)}<br>${esc(a.address)}, ${esc(a.city)} ${esc(a.postcode)}${a.phone ? '<br>' + esc(a.phone) : ''}<br>
  ${a.is_default ? '' : `<button class="link defaddr" data-id="${a.id}" style="color:var(--brand)">Make default</button> · `}<button class="link deladdr" data-id="${a.id}" style="color:var(--err)">Delete</button></div>`).join('') : '<p class="muted">No saved addresses yet.</p>'}
  <details class="more"><summary>+ Add an address</summary><form id="af" class="stack narrow" style="margin-top:10px"><label>Label<input name="label" value="Home" maxlength="60"></label><label>Full name<input name="name" required value="${esc(profile?.name || '')}"></label><label>Phone<input name="phone"></label>
  <label>Address<input name="address" required></label><label>City<input name="city" required></label><label>Postal / ZIP code<input name="postcode" required></label>
  <label class="check"><input type="checkbox" name="is_default" ${addrs.length ? '' : 'checked'}> Make this my default</label><button class="btn">Save address</button></form></details></section>
  <section class="cs"><h3>Username</h3><form id="unform" class="stack narrow"><label>${profile?.username ? 'Your username' : 'Choose a username'}<input name="username" value="${esc(profile?.username || '')}" required minlength="3" maxlength="30" pattern="[A-Za-z0-9][A-Za-z0-9_.\\-]{2,29}" autocomplete="username" autocapitalize="none" spellcheck="false"><small id="unhint" class="muted">3–30 letters, numbers, dots, dashes or underscores. You can log in with this or your email.</small></label><button class="btn ghost">Save username</button></form></section>
  <section class="cs"><h3>Password</h3><form id="cpw" class="row"><input type="password" name="password" minlength="8" placeholder="New password (8+ characters)" autocomplete="new-password" required><button class="btn ghost">Change password</button></form></section>`;
};

const FIELD_TYPES = { text: 'Short text', textarea: 'Long text', email: 'Email', tel: 'Phone', url: 'Website link', number: 'Number', date: 'Date', time: 'Time', select: 'Dropdown', radio: 'Single choice (radio buttons)', multi: 'Multiple choice (checkboxes)', checkbox: 'Checkbox (yes/no)', rating: 'Rating (1–5 stars)', file: 'File upload', heading: 'Heading (display only)', paragraph: 'Text block (display only)', divider: 'Divider (display only)' };
const DISPLAY_TYPES = ['heading', 'paragraph', 'divider'], CHOICE_TYPES = ['select', 'radio', 'multi'];
const dataFields = (f) => (f.fields || []).filter((x) => !DISPLAY_TYPES.includes(x.type));
const showVal = (x, v) => (v == null || v === '' ? '' : Array.isArray(v) ? v.join(', ') : x.type === 'checkbox' ? (v ? 'Yes' : 'No') : x.type === 'rating' ? '★'.repeat(Number(v)) + '☆'.repeat(5 - Number(v)) : String(v));
const UPLOAD_ACCEPT = 'image/jpeg,image/png,image/webp,image/gif,application/pdf,.txt,.csv,.doc,.docx,.xls,.xlsx';
const MAX_UPLOAD = 10 * 1024 * 1024;
const csvCell = (v) => { v = String(v ?? ''); if (/^[=+\-@]/.test(v)) v = "'" + v; return `"${v.replace(/"/g, '""')}"`; };
const fieldHtml = (f) => {
  const id = `ff_${esc(f.id)}`, n = esc(f.id), req = f.required ? 'required' : '', star = f.required ? ' *' : '';
  const ph = f.placeholder ? `placeholder="${esc(f.placeholder)}"` : '', help = f.help ? `<small class="muted">${esc(f.help)}</small>` : '';
  const opts = (f.options || []);
  switch (f.type) {
    case 'heading': return `<h3 style="margin:10px 0 0">${esc(f.label)}</h3>`;
    case 'paragraph': return `<p class="muted" style="white-space:pre-wrap;margin:0">${esc(f.label)}</p>`;
    case 'divider': return '<hr style="border:0;border-top:1px solid var(--line);width:100%;margin:6px 0">';
    case 'textarea': return `<label>${esc(f.label)}${star}<textarea id="${id}" name="${n}" rows="5" maxlength="${Number(f.maxlength) || 5000}" ${req} ${ph}></textarea>${help}</label>`;
    case 'select': return `<label>${esc(f.label)}${star}<select id="${id}" name="${n}" ${req}><option value="">Choose…</option>${opts.map((o) => `<option>${esc(o)}</option>`).join('')}</select>${help}</label>`;
    case 'radio': return `<fieldset class="choices"><legend>${esc(f.label)}${star}</legend>${opts.map((o, i) => `<label class="check"><input type="radio" name="${n}" value="${esc(o)}" ${i === 0 && f.required ? 'required' : ''}> ${esc(o)}</label>`).join('')}${help}</fieldset>`;
    case 'multi': return `<fieldset class="choices"><legend>${esc(f.label)}${star}</legend>${opts.map((o) => `<label class="check"><input type="checkbox" name="${n}" value="${esc(o)}"> ${esc(o)}</label>`).join('')}${help}</fieldset>`;
    case 'rating': return `<fieldset class="choices"><legend>${esc(f.label)}${star}</legend><div class="rate">${[5, 4, 3, 2, 1].map((v) => `<input type="radio" id="${id}_${v}" name="${n}" value="${v}" ${v === 5 && f.required ? 'required' : ''}><label for="${id}_${v}" title="${v} star${v > 1 ? 's' : ''}">★</label>`).join('')}</div>${help}</fieldset>`;
    case 'checkbox': return `<label class="check"><input type="checkbox" id="${id}" name="${n}" ${req}> ${esc(f.label)}${star}</label>${help}`;
    case 'file': return `<label>${esc(f.label)}${star}<input type="file" id="${id}" name="${n}" accept="${UPLOAD_ACCEPT}" ${req}><span class="muted" style="font-weight:400;font-size:.85rem">Images, PDF, Word, Excel, text or CSV — up to 10 MB</span>${help}</label>`;
    default: {
      const t = { email: 'email', tel: 'tel', number: 'number', date: 'date', time: 'time', url: 'url' }[f.type] || 'text';
      const extra = t === 'number' ? `step="any" ${f.min !== undefined && f.min !== '' ? `min="${esc(f.min)}"` : ''} ${f.max !== undefined && f.max !== '' ? `max="${esc(f.max)}"` : ''}` : (['date', 'time'].includes(t) ? '' : `maxlength="${Number(f.maxlength) || 5000}"`);
      return `<label>${esc(f.label)}${star}<input type="${t}" id="${id}" name="${n}" ${extra} ${req} ${ph}>${help}</label>`;
    }
  }
};
let CURFORM = null;
pages.form = async ([slug]) => {
  const { data: f } = await sb.from('forms').select('*').eq('slug', slug).eq('active', true).maybeSingle();
  if (!f) return '<div class="formcard"><h1>Form not found</h1><p><a href="#/">Back home</a></p></div>';
  const st = (await sb.rpc('form_status', { form_slug: slug })).data || { open: true };
  const head = `<div class="fhdr"><h1>${esc(f.title)}</h1>${f.description ? `<p class="muted" style="white-space:pre-wrap;margin:6px 0 0">${esc(f.description)}</p>` : ''}${f.closes_at && st.open ? `<p class="muted" style="margin:8px 0 0;font-size:.88rem">:ic-clock: Open until ${new Date(f.closes_at).toLocaleString()}</p>` : ''}</div>`;
  if (!st.open) return `<div class="formcard">${head}<p class="flash error" style="margin:0">${st.reason === 'full' ? 'This form has reached its response limit.' : 'This form is closed and is no longer accepting responses.'}</p></div>`;
  if (f.require_login && !session) return `<div class="formcard">${head}<p style="margin:0">Please <a href="#/login">log in</a> or <a href="#/register">create an account</a> to fill in this form.</p></div>`;
  CURFORM = f;
  return `<div class="formcard">${head}<form id="cf2" class="stack" data-shown="${Date.now()}" data-slug="${esc(f.slug)}" data-ok="${esc(f.success_message)}">${f.fields.map(fieldHtml).join('')}${honeypot()}<button class="btn block">${esc(f.submit_label || 'Submit')}</button></form></div>`;
};
pages.form.after = () => document.getElementById('cf2')?.addEventListener('submit', async (e) => {
  e.preventDefault(); const form = e.target, answers = {}; const btn = form.querySelector('button'); btn.disabled = true;
  const stop = (msg) => { btn.disabled = false; fail(new Error(msg)); };
  for (const fl of dataFields(CURFORM)) {
    const q = `[name="${CSS.escape(fl.id)}"]`;
    if (fl.type === 'file') {
      const file = form.querySelector(q).files[0]; if (!file) { answers[fl.id] = ''; continue; }
      if (file.size > MAX_UPLOAD) return stop(`"${file.name}" is over 10 MB.`);
      const path = `${form.dataset.slug}/${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9.]+/g, '-').slice(-80)}`;
      const up = await sb.storage.from('form-uploads').upload(path, file, { contentType: file.type || 'application/octet-stream' });
      if (up.error) { btn.disabled = false; return fail(up.error); }
      answers[fl.id] = path;
    } else if (fl.type === 'multi') {
      const vals = [...form.querySelectorAll(`${q}:checked`)].map((x) => x.value);
      if (fl.required && !vals.length) return stop(`"${fl.label}" is required.`);
      answers[fl.id] = vals;
    } else if (fl.type === 'radio' || fl.type === 'rating') answers[fl.id] = form.querySelector(`${q}:checked`)?.value || '';
    else if (fl.type === 'checkbox') answers[fl.id] = form.querySelector(q).checked;
    else answers[fl.id] = form.querySelector(q).value;
  }
  answers._hp = form.querySelector('[name=website]')?.value || ''; answers._t = Number(form.dataset.shown) || 0;
  const { error } = await sb.rpc('submit_form', { form_slug: form.dataset.slug, answers });
  btn.disabled = false; if (error) return fail(error);
  form.outerHTML = `<div class="fdone"><div class="authicon">:ic-check-circle:</div><h2 style="margin:0">${esc(form.dataset.ok)}</h2><p class="muted" style="margin:0">Your response has been received.</p></div>`;
});
pages.wishlist = async () => {
  await loadRatings();
  const ids = getWish(); if (!ids.length) return '<h1>Wishlist</h1><p>Nothing saved yet. Tap the :ic-heart: on a product.</p>';
  const { data } = await sb.from('products').select('*').in('id', ids).eq('active', true);
  return `<h1>Wishlist</h1><div class="grid">${data.map(card).join('')}</div>`;
};
pages.quote = () => `<div class="narrow"><h1>Request a quote</h1><p class="muted">Big project or trade order? Tell us what you need and we'll get back to you with pricing.</p>
  <form id="qf" class="stack"><label>Name<input name="name" required value="${esc(profile?.name || '')}"></label>
  <label>Email<input type="email" name="email" required value="${esc(session?.user.email || '')}"></label><label>Phone<input name="phone"></label>
  <label>What do you need?<textarea name="message" rows="6" required maxlength="4000" placeholder="e.g. 1,500 sq ft attic, R-38, delivery to Austin TX"></textarea></label>${honeypot()}<button class="btn">Send request</button></form></div>`;
pages.quote.after = () => { markShown('quote'); document.getElementById('qf')?.addEventListener('submit', async (e) => {
  e.preventDefault(); const f = Object.fromEntries(new FormData(e.target));
  if (f.website || Date.now() - (FORM_SHOWN.quote || 0) < 2500) { flash("Thanks! We'll be in touch soon."); location.hash = '#/'; return; }   // looks like a bot: act as if sent, send nothing
  delete f.website; const { error } = await sb.from('quotes').insert({ ...f, user_id: session?.user.id ?? null });
  if (error) return fail(error); flash("Thanks! We'll be in touch soon."); location.hash = '#/';
}); };

pages.account.after = () => {
  const un = document.querySelector('#unform [name=username]'), hint = document.getElementById('unhint'); let ut = null;
  un?.addEventListener('input', () => { clearTimeout(ut); ut = setTimeout(() => { if (un.value.trim().toLowerCase() !== (profile?.username || '').toLowerCase()) checkUsername(un.value.trim(), hint); }, 300); });
  document.getElementById('unform')?.addEventListener('submit', async (e) => {
    e.preventDefault(); const v = un.value.trim(); if (v === profile?.username) return;
    const { error } = await sb.rpc('set_username', { u: v }); if (error) return fail(error); await loadSession(); flash('Username saved.'); route();
  });
  document.getElementById('cpw')?.addEventListener('submit', async (e) => {
    e.preventDefault(); const { error } = await sb.auth.updateUser({ password: new FormData(e.target).get('password') });
    error ? fail(error) : (flash('Password changed.'), e.target.reset());
  });
  document.getElementById('af')?.addEventListener('submit', async (e) => {
    e.preventDefault(); const f = Object.fromEntries(new FormData(e.target)); const makeDef = !!f.is_default; delete f.is_default;
    const { data, error } = await sb.from('addresses').insert(f).select('id').single(); if (error) return fail(error);
    if (makeDef) await setDefault(data.id); flash('Address saved.'); route();
  });
  document.querySelectorAll('.deladdr').forEach((b) => b.addEventListener('click', async () => { await sb.from('addresses').delete().eq('id', b.dataset.id); route(); }));
  document.querySelectorAll('.defaddr').forEach((b) => b.addEventListener('click', async () => { await setDefault(b.dataset.id); route(); }));
};


// ---- admin command palette (Ctrl/Cmd+K) ----
const CMD_LINKS = [['Dashboard', '#/admin', 'orders.view'], ['Orders', '#/admin/orders', 'orders.view'], ['Point of sale', '#/admin/pos', 'pos'], ['Products', '#/admin/products', 'catalog.manage'], ['New product', '#/admin/products/new', 'catalog.manage'], ['Inventory', '#/admin/inventory', 'inventory.view'], ['Customers', '#/admin/customers', 'customers.view'], ['Invoices', '#/admin/invoices', 'invoices.view'], ['New invoice', '#/admin/invoices/new', 'invoices.manage'], ['Estimates', '#/admin/estimates', 'invoices.view'], ['Tax report', '#/admin/tax', 'invoices.view'], ['Expenses', '#/admin/expenses', 'expenses.view'], ['Profit & loss', '#/admin/profit', 'expenses.view'], ['Purchasing', '#/admin/purchasing', 'purchasing.view'], ['Messages', '#/messages', 'messages'], ['Forms', '#/admin/forms', 'content.manage'], ['Pages', '#/admin/pages', 'content.manage'], ['SEO', '#/admin/seo', 'content.manage'], ['Discount codes', '#/admin/codes', 'content.manage'], ['Quotes', '#/admin/quotes', 'customers.view'], ['Reviews', '#/admin/reviews', 'content.manage'], ['Abandoned carts', '#/admin/carts', 'orders.view'], ['Spam & safety', '#/admin/spam', 'team.manage'], ['Settings', '#/admin/settings', 'team.manage'], ['Team & roles', '#/admin/team', 'team.manage'], ['Activity log', '#/admin/activity', 'team.manage']];
function openPalette() {
  if (!isStaff() || document.getElementById('cmdk')) return;
  const el = document.createElement('div'); el.id = 'cmdk'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', 'Quick search');
  el.innerHTML = '<div class="cmdbox"><input id="cmdq" placeholder="Jump to… or search customers, products, orders, invoices" autocomplete="off" aria-label="Search"><div id="cmdlist" role="listbox"></div><div class="cmdfoot muted">↑↓ to move · Enter to open · Esc to close</div></div>';
  document.body.appendChild(el); const q = el.querySelector('#cmdq'), list = el.querySelector('#cmdlist'); let items = [], sel = 0, seq = 0;
  const close = () => { el.remove(); document.removeEventListener('keydown', onKey, true); };
  const draw = () => { list.innerHTML = items.length ? items.map((x, i) => `<a role="option" class="cmditem ${i === sel ? 'on' : ''}" href="${x.href}" data-i="${i}"><span class="cmdk">${esc(x.kind)}</span><span class="cmdt"><b>${esc(x.label)}</b>${x.sub ? `<small class="muted">${esc(x.sub)}</small>` : ''}</span></a>`).join('') : '<p class="muted" style="padding:14px">No matches.</p>'; list.querySelector('.on')?.scrollIntoView({ block: 'nearest' }); };
  const base = (t) => CMD_LINKS.filter(([l, , perm]) => can(perm) && l.toLowerCase().includes(t)).map(([l, h]) => ({ kind: 'Go to', label: l, href: h }));
  const run = async () => {
    const t = q.value.trim().toLowerCase(), my = ++seq; items = base(t).slice(0, t ? 5 : 12); sel = 0; draw(); if (t.length < 2) return;
    const like = t.replace(/[%,()]/g, ''), num = /^#?\d+$/.test(t) ? Number(t.replace('#', '')) : null, jobs = [];
    if (can('customers.view')) jobs.push(sb.from('profiles').select('id,name,email').or(`name.ilike.%${like}%,email.ilike.%${like}%`).limit(5).then((r) => (r.data || []).map((u) => ({ kind: 'Customer', label: u.name || u.email, sub: u.email, href: `#/admin/customers/${u.id}` }))));
    if (can('catalog.manage')) jobs.push(sb.from('products').select('id,name,category,sku').or(`name.ilike.%${like}%,sku.ilike.%${like}%`).limit(5).then((r) => (r.data || []).map((x) => ({ kind: 'Product', label: x.name, sub: x.category, href: `#/admin/products/${x.id}` }))));
    if (can('orders.view')) jobs.push(sb.from('orders').select('id,name,total_cents,status').or(num ? `id.eq.${num},name.ilike.%${like}%` : `name.ilike.%${like}%,email.ilike.%${like}%`).order('id', { ascending: false }).limit(5).then((r) => (r.data || []).map((o) => ({ kind: 'Order', label: `#${o.id} · ${o.name}`, sub: `${o.status} · ${money(o.total_cents)}`, href: `#/admin/orders/${o.id}` }))));
    if (can('invoices.view')) jobs.push(sb.from('invoices').select('id,number,customer_name,total_cents').or(`number.ilike.%${like}%,customer_name.ilike.%${like}%`).limit(5).then((r) => (r.data || []).map((i) => ({ kind: 'Invoice', label: `${i.number} · ${i.customer_name}`, sub: money(i.total_cents), href: `#/admin/invoices/${i.id}` }))));
    const res = (await Promise.all(jobs.map((j) => j.catch(() => [])))).flat(); if (my !== seq) return; items = [...items, ...res]; draw();
  };
  const go = (i) => { const x = items[i]; if (x) { close(); location.hash = x.href; } };
  const onKey = (e) => { if (e.key === 'Escape') { e.preventDefault(); close(); } else if (e.key === 'ArrowDown') { e.preventDefault(); sel = Math.min(items.length - 1, sel + 1); draw(); } else if (e.key === 'ArrowUp') { e.preventDefault(); sel = Math.max(0, sel - 1); draw(); } else if (e.key === 'Enter' && document.activeElement === q) { e.preventDefault(); go(sel); } };
  document.addEventListener('keydown', onKey, true); let tm; q.addEventListener('input', () => { clearTimeout(tm); tm = setTimeout(run, 160); });
  el.addEventListener('click', (e) => { if (e.target === el) close(); else if (e.target.closest('.cmditem')) close(); }); run(); q.focus();
}
// back-to-top button
{ const up = document.createElement('button'); up.className = 'totop noprint'; up.type = 'button'; up.hidden = true; up.setAttribute('aria-label', 'Back to top'); up.innerHTML = ':ic-arrow-up:'; document.body.appendChild(up);
  up.addEventListener('click', () => window.scrollTo({ top: 0, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }));
  let tk = false; window.addEventListener('scroll', () => { if (tk) return; tk = true; requestAnimationFrame(() => { up.hidden = window.scrollY < 700; tk = false; }); }, { passive: true }); }
document.addEventListener('keydown', (e) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k' && isStaff()) { e.preventDefault(); openPalette(); } });
// Staff keyboard shortcuts: g then d/o/p/i/c/e/m, and ? for help
{ let gAt = 0; const GO = { d: '#/admin', o: '#/admin/orders', p: '#/admin/products', i: '#/admin/invoices', c: '#/admin/customers', e: '#/admin/expenses', m: '#/messages', n: '#/admin/invoices/new' };
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey || !isStaff() || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.target.isContentEditable) return;
    if (e.key === '?') { const old = document.getElementById('kbhelp'); if (old) return old.remove(); document.body.insertAdjacentHTML('beforeend', `<div id="kbhelp" class="modalbg" role="dialog" aria-label="Keyboard shortcuts"><div class="modalbox"><h3 style="margin-top:0">Keyboard shortcuts</h3><ul class="plain"><li><span><kbd>Ctrl</kbd> <kbd>K</kbd></span><span>Search anything</span></li>${Object.entries({ d: 'Dashboard', o: 'Orders', p: 'Products', i: 'Invoices', n: 'New invoice', c: 'Customers', e: 'Expenses', m: 'Messages' }).map(([k, v]) => `<li><span><kbd>g</kbd> <kbd>${k}</kbd></span><span>${v}</span></li>`).join('')}<li><span><kbd>?</kbd></span><span>This help</span></li></ul><button class="btn" type="button">Close</button></div></div>`); const b = document.getElementById('kbhelp'); b.addEventListener('click', (ev) => { if (ev.target === b || ev.target.closest('button')) b.remove(); }); return; }
    if (e.key === 'Escape') return document.getElementById('kbhelp')?.remove();
    if (e.key === 'g') { gAt = Date.now(); return; }
    if (gAt && Date.now() - gAt < 1200 && GO[e.key]) { gAt = 0; location.hash = GO[e.key]; }
  }); }
document.addEventListener('click', (e) => { if (e.target.closest('.openpalette')) openPalette(); });

// ---- admin section bar (shown on every admin sub-page) ----
function adminNavHtml(sub) {
  const items = CMD_LINKS.filter(([l, , perm]) => can(perm) && !/^New /.test(l)); if (!sub || !items.length) return '';
  const cur = '#/admin/' + sub;
  return `<nav class="adminbar noprint" aria-label="Admin sections"><a href="#/admin" class="ab-home">:ic-home: Dashboard</a>${items.filter(([l]) => l !== 'Dashboard').map(([l, h]) => `<a href="${h}" ${h === cur || h.startsWith(cur + '/') ? 'class="on" aria-current="page"' : ''}>${esc(l)}</a>`).join('')}</nav>`;
}
// ---- CSV helpers ----
function parseCsv(text) { const rows = []; let row = [], cell = '', q = false; text = String(text).replace(/^\uFEFF/, '');
  for (let i = 0; i < text.length; i++) { const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; }
    else if (c === '"') q = true; else if (c === ',') { row.push(cell); cell = ''; } else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cell); cell = ''; if (row.some((x) => x.trim() !== '')) rows.push(row); row = []; } else cell += c; }
  row.push(cell); if (row.some((x) => x.trim() !== '')) rows.push(row); return rows; }
// ---- admin ----
const needAdmin = () => { if (!profile?.is_admin) { $app.innerHTML = '<h1>Forbidden</h1>'; return false; } return true; };
const salesChart = (orders) => {
  const days = Array.from({ length: 14 }, (_, i) => { const d = new Date(Date.now() - (13 - i) * 864e5); return { k: d.toISOString().slice(0, 10), label: d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }), v: 0 }; });
  orders.forEach((o) => { const d = days.find((x) => x.k === o.created_at.slice(0, 10)); if (d) d.v += o.total_cents; });
  const max = Math.max(...days.map((d) => d.v), 1);
  return `<svg viewBox="0 0 700 200" role="img" aria-label="Sales per day" style="width:100%;background:var(--card);border:1px solid var(--line);border-radius:14px;padding:8px">
  ${days.map((d, i) => { const h = d.v / max * 140; return `<g><title>${d.label}: ${money(d.v)}</title><rect x="${i * 49 + 12}" y="${160 - h}" width="34" height="${Math.max(h, 2)}" rx="5" fill="var(--brand)" opacity="${d.v ? 1 : .25}"/><text x="${i * 49 + 29}" y="182" font-size="10" text-anchor="middle" fill="var(--muted)">${d.label}</text></g>`; }).join('')}</svg>`;
};
const RESP_STATUS = { new: 'New', in_progress: 'In progress', done: 'Done' };
let FB = null, PG = null;
const SECTION_PERM = { orders: 'orders.view', products: 'catalog.manage', inventory: 'inventory.view', locations: 'inventory.view', sales: 'reports.view', pos: 'pos', customers: 'customers.view', forms: 'content.manage', pages: 'content.manage', codes: 'content.manage',
  compare: 'catalog.manage', purchasing: 'purchasing.view', suppliers: 'purchasing.view', invoices: 'invoices.view', team: 'team.manage', settings: 'team.manage', activity: 'team.manage', quotes: 'customers.view', estimates: 'invoices.view', seo: 'content.manage', reviews: 'content.manage', carts: 'orders.view', spam: 'team.manage', statements: 'invoices.view', tax: 'invoices.view', expenses: 'expenses.view', profit: 'expenses.view' };
const ROLES = { owner: 'Owner — full access, including who is an admin', admin: 'Admin — full access (cannot change owners/admins)', manager: 'Manager — orders, refunds, products, inventory, purchasing, content, customers, reports',
  staff: 'Staff — in-store sales (POS), view orders, customers and stock, messages', warehouse: 'Warehouse — pick & ship orders, manage stock and purchase orders', accountant: 'Accountant — invoicing, reports, view orders and customers',
  support: 'Support — messages, view orders and customers', customer: 'Customer — no admin access' }; // form being edited in the builder
const form_inv = (f) => [...f.querySelectorAll('input[name^="inv_"]')];
const slugify = (t) => t.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
const formUrl = (slug) => `${location.origin}${location.pathname}#/form/${slug}`;
const TYPE_ICON = { text: 'edit', textarea: 'file', email: 'mail', tel: 'chat', url: 'link', number: 'chart', date: 'clock', time: 'clock', select: 'chevron-down', radio: 'check-circle', multi: 'clipboard', checkbox: 'check', rating: 'star', file: 'image', heading: 'tag', paragraph: 'file', divider: 'menu' };
const shortType = (t) => FIELD_TYPES[t].replace(/ \(.*\)$/, '');
function fieldRows() {
  const NUMERIC = ['text', 'textarea', 'email', 'tel', 'url', 'number'];
  return FB.fields.map((f, i) => { const disp = DISPLAY_TYPES.includes(f.type);
    return `<div class="fld" data-i="${i}"><div class="fldtop"><span class="fnum">${i + 1}</span>
    ${f.type === 'paragraph' ? `<textarea class="flabel" data-f="label" rows="2" placeholder="Text to show">${esc(f.label)}</textarea>` : `<input class="flabel" data-f="label" value="${esc(f.label)}" placeholder="${f.type === 'heading' ? 'Heading text' : 'Type your question'}" aria-label="Question">`}
    <select data-f="type" class="ftype" aria-label="Question type">${Object.entries(FIELD_TYPES).map(([k, l]) => `<option value="${k}" ${k === f.type ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
    ${CHOICE_TYPES.includes(f.type) ? `<label class="opts"><span class="muted">Choices — one per line</span><textarea data-f="options" rows="${Math.min(6, Math.max(3, (f.options || []).length + 1))}" placeholder="Option 1&#10;Option 2">${esc((f.options || []).join('\n'))}</textarea></label>` : ''}
    <div class="fldbar">${disp ? '<span class="muted">Display only — visitors don’t answer this</span>' : `<label class="switch"><input type="checkbox" data-f="required" ${f.required ? 'checked' : ''}><span class="track"></span><span>Required</span></label>`}<span class="grow"></span>
      <button type="button" class="ibtn" data-act="up" aria-label="Move up" ${i === 0 ? 'disabled' : ''}>:ic-arrow-up:</button><button type="button" class="ibtn" data-act="down" aria-label="Move down" ${i === FB.fields.length - 1 ? 'disabled' : ''}>:ic-arrow-down:</button>
      <button type="button" class="ibtn" data-act="dup" aria-label="Duplicate question" title="Duplicate">:ic-clipboard:</button><button type="button" class="ibtn danger" data-act="del" aria-label="Delete question" title="Delete">:ic-x:</button></div>
    ${disp ? '' : `<details class="more"><summary>More options</summary><div class="row" style="margin-top:8px">
      <input data-f="help" value="${esc(f.help || '')}" placeholder="Help text (shown under the question)" style="flex:1;min-width:200px">
      ${NUMERIC.includes(f.type) && f.type !== 'number' ? `<input data-f="placeholder" value="${esc(f.placeholder || '')}" placeholder="Placeholder">` : ''}
      ${f.type === 'number' ? `<input data-f="min" type="number" step="any" value="${esc(f.min ?? '')}" placeholder="Min" style="width:100px"><input data-f="max" type="number" step="any" value="${esc(f.max ?? '')}" placeholder="Max" style="width:100px">` : ''}
      ${['text', 'textarea', 'email', 'tel', 'url'].includes(f.type) ? `<input data-f="maxlength" type="number" min="1" max="5000" value="${esc(f.maxlength ?? '')}" placeholder="Max length" style="width:120px">` : ''}</div></details>`}</div>`; }).join('')
    || '<div class="emptyq">:ic-clipboard:<p><b>No questions yet</b></p><p class="muted">Pick a question type below to get started.</p></div>';
}
const toLocalInput = (d) => { const t = new Date(d); return new Date(t - t.getTimezoneOffset() * 60000).toISOString().slice(0, 16); };
pages.admin = async ([sub, id, extra], q = new URLSearchParams()) => {
  if (!isStaff()) return '<h1>Forbidden</h1>';
  if (sub && SECTION_PERM[sub] && !can(SECTION_PERM[sub])) return `<h1>No access</h1><p class="muted">Your role (${esc(profile.role)}) doesn't include this area. Ask an owner or admin if you need it.</p><p><a class="btn ghost" href="#/admin">← Dashboard</a></p>`;
  if (sub === 'orders' && (id === 'slips' || extra === 'slip')) {
    const ids = id === 'slips' ? (q.get('ids') || '').split(',').map(Number).filter(Boolean).slice(0, 50) : [Number(id)];
    const [os, its] = await Promise.all([sb.from('orders').select('*').in('id', ids), sb.from('order_items').select('*').in('order_id', ids)]);
    const biz = STORE.biz || {}, byId = Object.fromEntries((os.data || []).map((o) => [o.id, o]));
    return `<div class="row noprint" style="justify-content:space-between;margin-bottom:12px"><a href="#/admin/orders${id === 'slips' ? '' : '/' + id}">← Back</a><button class="btn" id="printbtn" type="button">:ic-print: Print ${ids.length > 1 ? ids.length + ' packing slips' : 'packing slip'}</button></div>
    ${ids.filter((i) => byId[i]).map((i) => { const o = byId[i], items = (its.data || []).filter((x) => x.order_id === i), pick = o.fulfillment === 'pickup';
      return `<section class="slip"><div class="invtop"><div><h2 style="margin:0">${esc(biz.legal_name || theme.name || 'Gomi Insulation')}</h2><p class="muted" style="margin:4px 0 0">${[biz.address, biz.phone].filter(Boolean).map(esc).join('<br>')}</p></div><div class="invmeta"><h1 style="margin:0">PACKING SLIP</h1><p style="margin:4px 0 0">Order <b>#${o.id}</b><br>${new Date(o.created_at).toLocaleDateString()}</p></div></div>
      <div class="two2" style="margin:18px 0"><div><small class="muted">${pick ? 'PICKUP FOR' : 'SHIP TO'}</small><br><b>${esc(o.name)}</b><br>${esc(o.address)}<br>${esc(o.city)} ${esc(o.postcode)}<br>${esc(o.phone || '')}</div><div><small class="muted">METHOD</small><br><b>${pick ? 'Pickup' : 'Delivery'}</b>${o.tracking_number ? `<br>${esc(o.tracking_carrier || 'Tracking')}: ${esc(o.tracking_number)}` : ''}</div></div>
      <table class="invitems"><tr><th style="width:36px">Packed</th><th>Item</th><th class="r">Qty</th></tr>${items.map((x) => `<tr><td><span class="tick"></span></td><td>${esc(x.name)}</td><td class="r"><b>${x.pack_units ? plural(x.qty / x.pack_units, 'bundle') : x.qty}</b>${x.pack_units ? `<small class="muted" style="display:block">${x.qty} bags</small>` : ''}</td></tr>`).join('')}</table>
      ${o.notes ? `<p style="white-space:pre-wrap"><b>Customer notes</b><br>${esc(o.notes)}</p>` : ''}<p class="muted" style="margin-top:24px">Thank you for your order! Questions? ${[biz.phone, biz.email].filter(Boolean).map(esc).join(' · ')}</p></section>`; }).join('') || '<p>No orders found.</p>'}`;
  }
  if (sub === 'orders' && id) {
    const o = (await sb.from('orders').select('*').eq('id', id).single()).data;
    const evR = await sb.from('order_events').select('*').eq('order_id', id).order('id', { ascending: false });
    const [itemsR, notesR, refR] = await Promise.all([sb.from('order_items').select('*').eq('order_id', id), sb.from('order_notes').select('*').eq('order_id', id).order('id', { ascending: false }), sb.from('refunds').select('*').eq('order_id', id).order('id', { ascending: false })]);
    const remaining = o.total_cents - (o.refunded_cents || 0);
    return `<div class="row noprint" style="justify-content:flex-end;margin-bottom:8px">${can('invoices.manage') ? `<a class="btn ghost" href="#/admin/invoices/new?order=${o.id}">:ic-receipt: Create invoice</a>` : ''}<a class="btn ghost" href="#/admin/orders/${o.id}/slip">:ic-clipboard: Packing slip</a></div>${orderHtml(o, itemsR.data, can('orders.manage') ? true : 'ro')}
    <section class="cs" style="margin-top:16px"><h3>History</h3>${(evR.data || []).length ? `<ol class="evlist">${evR.data.map((e) => `<li class="ev-${esc(e.kind)}"><span class="evdot"></span><div><b>${esc(e.detail)}</b><small class="muted">${esc(e.actor || '—')} · ${dateOf(e.created_at)}</small></div></li>`).join('')}</ol>` : '<p class="muted" style="margin:0">No history yet.</p>'}</section>
    <section class="cs" style="margin-top:16px"><h3>Internal notes <small class="muted" style="font-weight:400">(only admins can see these)</small></h3>
      ${(notesR.data || []).map((n) => `<div class="addr"><div style="white-space:pre-wrap">${esc(n.note)}</div><small class="muted">${esc(n.author)} · ${ago(n.created_at)}</small></div>`).join('') || '<p class="muted" style="margin:0">No notes yet.</p>'}
      <form id="noteform" class="row" style="flex-wrap:nowrap"><input name="note" maxlength="2000" placeholder="Add a note (e.g. customer called, will collect Friday)" required style="flex:1;min-width:0"><button class="btn ghost">Add note</button></form></section>
    <section class="cs" style="margin-top:16px"><h3>Refunds</h3>
      ${(refR.data || []).map((r) => `<div class="addr"><b>${money(r.amount_cents)}</b> refunded · ${esc(r.reason || 'no reason given')}<br><small class="muted">${esc(r.author)} · ${dateOf(r.created_at)}</small></div>`).join('') || '<p class="muted" style="margin:0">No refunds on this order.</p>'}
      ${remaining > 0 && can('orders.refund') ? `<form id="refundform" class="row"><input name="amount" type="number" step="0.01" min="0.01" max="${(remaining / 100).toFixed(2)}" placeholder="Amount (up to ${money(remaining)})" required style="width:210px"><input name="reason" maxlength="300" placeholder="Reason" style="flex:1;min-width:160px"><button class="btn ghost" style="color:var(--err)">Issue refund</button></form><small class="muted">Recording a refund doesn't move money — refund the customer through your payment provider, then record it here. It lowers your revenue reports.</small>` : '<p class="muted" style="margin:0">Fully refunded.</p>'}</section>`;
  }
  if (sub === 'forms' && id && extra === 'responses') {
    const f = (await sb.from('forms').select('*').eq('id', id).single()).data, view = q.get('view') === 'table' ? 'table' : 'cards';
    const all = (await sb.from('form_submissions').select('*').eq('form_id', id).order('id', { ascending: false })).data || [];
    const filter = q.get('status') || '', rows = filter ? all.filter((r) => r.status === filter) : all, cnt = (st) => all.filter((r) => r.status === st).length, df = dataFields(f);
    const nameOf = (r) => { const fl = df.find((x) => ['text', 'email'].includes(x.type) && r.data[x.id]); return fl ? r.data[fl.id] : `Response #${r.id}`; };
    const statusSel = (r) => `<select class="rstatus" data-id="${r.id}" aria-label="Status">${Object.entries(RESP_STATUS).map(([k, l]) => `<option value="${k}" ${k === r.status ? 'selected' : ''}>${l}</option>`).join('')}</select>`;
    const answer = (x, v) => (x.type === 'file' ? `<button class="link dlfile" data-path="${esc(v)}" style="color:var(--brand)">:ic-download: ${esc(String(v).split('/').pop().replace(/^[0-9a-f-]{36}-/, ''))}</button>` : esc(showVal(x, v)));
    const link = (extra2) => { const n = new URLSearchParams(q); Object.entries(extra2).forEach(([k, v]) => (v ? n.set(k, v) : n.delete(k))); const t = n.toString(); return `#/admin/forms/${f.id}/responses${t ? '?' + t : ''}`; };
    const cardsHtml = rows.map((r) => `<article class="rcard"><div class="rhead"><div><b>${esc(nameOf(r))}</b><br><small class="muted" title="${esc(dateOf(r.created_at))}">${ago(r.created_at)}</small></div><div class="row" style="flex-wrap:nowrap">${statusSel(r)}<button class="link delresp" data-id="${r.id}" style="color:var(--err)" aria-label="Delete response">:ic-x:</button></div></div>
      <dl class="ans">${df.map((x) => (r.data[x.id] == null || r.data[x.id] === '' ? '' : `<div class="${x.type === 'textarea' ? 'wide' : ''}"><dt>${esc(x.label)}</dt><dd>${answer(x, r.data[x.id])}</dd></div>`)).join('')}</dl>
      <textarea class="rnotes" data-id="${r.id}" rows="2" maxlength="5000" placeholder="Add a private note…" aria-label="Notes">${esc(r.notes)}</textarea></article>`).join('');
    const tableHtml = `<table><tr><th>Received</th>${df.map((x) => `<th>${esc(x.label)}</th>`).join('')}<th>Status</th><th>Notes</th><th></th></tr>${rows.map((r) => `<tr><td>${dateOf(r.created_at)}</td>${df.map((x) => `<td style="white-space:pre-wrap">${r.data[x.id] ? answer(x, r.data[x.id]) : ''}</td>`).join('')}<td>${statusSel(r)}</td><td><textarea class="rnotes" data-id="${r.id}" rows="2" maxlength="5000" placeholder="Add a note…" aria-label="Notes">${esc(r.notes)}</textarea></td><td><button class="link delresp" data-id="${r.id}" style="color:var(--err)">Delete</button></td></tr>`).join('')}</table>`;
    return `<div class="dashhead"><div><h1 style="margin:0">${esc(f.title)}</h1><p class="muted" style="margin:2px 0 0">${all.length} response${all.length === 1 ? '' : 's'} · ${cnt('new')} new</p></div><div class="row"><a class="btn ghost" href="#/admin/forms">← All forms</a><a class="btn ghost" href="#/admin/forms/${f.id}">:ic-edit: Edit form</a><button class="btn ghost" id="fcsv" data-id="${f.id}">:ic-download: Export CSV</button></div></div>
    <div class="row" style="justify-content:space-between;margin-bottom:12px"><div class="chips" style="margin:0"><a class="chip ${!filter ? 'on' : ''}" href="${link({ status: '' })}">All (${all.length})</a>${Object.entries(RESP_STATUS).map(([k, l]) => `<a class="chip ${filter === k ? 'on' : ''}" href="${link({ status: k })}">${l} (${cnt(k)})</a>`).join('')}</div>
      <div class="seg"><a class="${view === 'cards' ? 'on' : ''}" href="${link({ view: '' })}">Cards</a><a class="${view === 'table' ? 'on' : ''}" href="${link({ view: 'table' })}">Table</a></div></div>
    ${rows.length ? (view === 'table' ? tableHtml : `<div class="rgrid">${cardsHtml}</div>`) : `<div class="emptyq">:ic-clipboard:<p><b>${all.length ? 'No responses with this status' : 'No responses yet'}</b></p><p class="muted">${all.length ? 'Try another filter.' : 'Share the form link to start collecting responses.'}</p></div>`}`;
  }
  if (sub === 'forms' && id) {
    const f = id === 'new' ? { title: '', slug: '', description: '', success_message: 'Thanks! We received your response.', active: true, notify: true, submit_label: 'Submit', closes_at: null, max_responses: null, require_login: false, fields: [] } : (await sb.from('forms').select('*').eq('id', id).single()).data;
    FB = { ...f, fields: (f.fields || []).map((x) => ({ ...x })) }; const url = f.slug ? formUrl(f.slug) : '';
    const sw = (idn, label, on, hint = '') => `<label class="switch row2"><input type="checkbox" id="${idn}" ${on ? 'checked' : ''}><span class="track"></span><span><b>${label}</b>${hint ? `<br><small class="muted">${hint}</small>` : ''}</span></label>`;
    return `<div class="dashhead"><div><h1 style="margin:0">${f.id ? 'Edit form' : 'New form'}</h1><p class="muted" style="margin:2px 0 0">${f.id ? `Link: <code>${esc(url)}</code>` : 'Add your questions, check the preview, then publish.'}</p></div>
      <div class="row"><a class="btn ghost" href="#/admin/forms">← All forms</a>${f.id ? `<a class="btn ghost" href="${esc(url)}" target="_blank" rel="noopener">View form ↗</a><a class="btn ghost" href="#/admin/forms/${f.id}/responses">Responses</a>` : ''}</div></div>
    <div class="fbwrap" id="fbuilder">
      <div class="fbmain"><section class="cs"><div class="sechead"><h3 style="margin:0">Questions <span class="muted" id="qcount" style="font-weight:400"></span></h3></div><div id="fields">${fieldRows()}</div>
        <div><div class="muted" style="margin:6px 0 8px;font-weight:600">Add a question</div><div class="palette">${Object.keys(FIELD_TYPES).map((k) => `<button type="button" class="ptype" data-addtype="${k}">:ic-${TYPE_ICON[k]}: ${esc(shortType(k))}</button>`).join('')}</div></div></section></div>
      <aside class="fbside"><div class="tabs" role="tablist"><button type="button" class="tab on" data-tab="settings" role="tab">Settings</button><button type="button" class="tab" data-tab="preview" role="tab">Preview</button></div>
        <div id="tab_settings" class="cs"><label>Title<input id="fb_title" value="${esc(f.title)}" maxlength="200" placeholder="e.g. Request a site survey"></label>
          <label>Link name<input id="fb_slug" value="${esc(f.slug)}" maxlength="60" placeholder="auto from title"><small class="muted">Letters, numbers and dashes — becomes the form’s web address.</small></label>
          <label>Description <small class="muted">(optional)</small><textarea id="fb_desc" rows="3" maxlength="2000">${esc(f.description)}</textarea></label>
          <label>Message after submitting<input id="fb_ok" value="${esc(f.success_message)}" maxlength="1000"></label><label>Submit button text<input id="fb_submit" value="${esc(f.submit_label || 'Submit')}" maxlength="60"></label>
          <div class="two2"><label>Closes on <small class="muted">(optional)</small><input type="datetime-local" id="fb_closes" value="${f.closes_at ? toLocalInput(f.closes_at) : ''}"></label><label>Response limit <small class="muted">(optional)</small><input type="number" id="fb_max" min="1" value="${f.max_responses ?? ''}"></label></div>
          <div class="switches">${sw('fb_active', 'Published', f.active, 'Visitors can open the form')}${sw('fb_login', 'Require login', f.require_login, 'Only logged-in customers can submit')}${sw('fb_notify', 'Email me new responses', f.notify !== false)}</div></div>
        <div id="tab_preview" class="cs" hidden><div class="formcard flat" id="fb_preview" inert></div></div></aside></div>
    <div class="savebar"><button class="btn" id="fb_save" type="button">Save form</button><span class="muted">${f.id ? 'Changes go live as soon as you save.' : 'Nothing is public until you save and publish.'}</span></div>`;
  }
  if (sub === 'forms') {
    const fs = (await sb.from('forms').select('*').order('id', { ascending: false })).data || [];
    const counts = {}, fresh = {}; ((await sb.from('form_submissions').select('form_id,status')).data || []).forEach((r) => { counts[r.form_id] = (counts[r.form_id] || 0) + 1; if (r.status === 'new') fresh[r.form_id] = (fresh[r.form_id] || 0) + 1; });
    const totalNew = Object.values(fresh).reduce((a, v) => a + v, 0);
    return `<div class="dashhead"><div><h1 style="margin:0">Forms</h1><p class="muted" style="margin:2px 0 0">Contact forms, surveys, site-visit requests — build your own and share the link.</p></div><a class="btn" href="#/admin/forms/new">+ New form</a></div>
    <div class="kpis"><div class="kpi"><span class="lbl">Forms</span><b>${fs.length}</b></div><div class="kpi"><span class="lbl">Published</span><b>${fs.filter((x) => x.active).length}</b></div><div class="kpi"><span class="lbl">New responses</span><b class="${totalNew ? 'up' : ''}">${totalNew}</b></div></div>
    ${fs.length ? `<div class="formgrid">${fs.map((f) => `<article class="fcard"><div class="fcardhead"><h3><a href="#/admin/forms/${f.id}">${esc(f.title)}</a></h3><span class="status ${f.active ? 'paid' : ''}">${f.active ? 'Published' : 'Draft'}</span></div>
      <p class="muted" style="margin:0">${(f.fields || []).filter((x) => !DISPLAY_TYPES.includes(x.type)).length} question${(f.fields || []).filter((x) => !DISPLAY_TYPES.includes(x.type)).length === 1 ? '' : 's'}${f.description ? ' · ' + esc(f.description.slice(0, 70)) + (f.description.length > 70 ? '…' : '') : ''}</p>
      <div class="flink"><code>#/form/${esc(f.slug)}</code><button type="button" class="btn ghost copyform" data-url="${esc(formUrl(f.slug))}" style="padding:4px 10px;min-height:0">:ic-link: Copy</button></div>
      <a class="fstat" href="#/admin/forms/${f.id}/responses"><b>${counts[f.id] || 0}</b><span>response${(counts[f.id] || 0) === 1 ? '' : 's'}</span>${fresh[f.id] ? `<span class="status pending">${fresh[f.id]} new</span>` : ''}<span class="grow"></span>:ic-chevron-down:</a>
      <div class="row"><a class="btn ghost" href="#/admin/forms/${f.id}">:ic-edit: Edit</a><a class="btn ghost" href="#/form/${esc(f.slug)}" target="_blank" rel="noopener">View ↗</a><button class="link dupform" data-id="${f.id}">Duplicate</button><button class="link delform" data-id="${f.id}" data-title="${esc(f.title)}" style="color:var(--err);margin-left:auto">Delete</button></div></article>`).join('')}</div>`
      : '<div class="emptyq">:ic-clipboard:<p><b>No forms yet</b></p><p class="muted">Create your first form — for example a “Request a quote” or “Book a site visit” form.</p><a class="btn" href="#/admin/forms/new">+ New form</a></div>'}`;
  }
  if (sub === 'seo') {
    const tab = ['overview', 'content', 'redirects', 'settings'].includes(q.get('tab')) ? q.get('tab') : 'overview', o = { site_title: '', description: '', og_image: '', site_url: '', noindex: false, home_title: '', gsc: '', ga4: '', twitter: '', ...SEO };
    const [pr, pgs, rds] = await Promise.all([sb.from('products').select('id,name,slug,description,image_url,image_alt,seo_title,seo_description,focus_keyword,active,brand,r_value').order('name'), sb.from('pages').select('id,title,slug,body,seo_title,seo_description,focus_keyword,published').order('title'), sb.from('seo_redirects').select('*').order('id', { ascending: false })]);
    const norm = (t) => String(t || '').trim().toLowerCase();
    const items = [...(pr.data || []).filter((x) => x.active).map((x) => ({ t: 'products', kind: 'Product', id: x.id, name: x.name, title: x.seo_title || x.name, desc: x.seo_description || x.description, hasDesc: !!x.seo_description, seoTitle: x.seo_title || '', seoDesc: x.seo_description || '', kw: x.focus_keyword || '', slug: x.slug, alt: x.image_alt || '', photo: !!safeUrl(x.image_url), body: `${x.name} ${x.description}`, brand: x.brand, rv: x.r_value, href: `#/admin/products/${x.id}` })),
      ...(pgs.data || []).filter((x) => x.published).map((x) => ({ t: 'pages', kind: 'Page', id: x.id, name: x.title, title: x.seo_title || x.title, desc: x.seo_description || x.body, hasDesc: !!x.seo_description, seoTitle: x.seo_title || '', seoDesc: x.seo_description || '', kw: x.focus_keyword || '', slug: x.slug, body: `${x.title} ${x.body}`, href: `#/admin/pages/${x.id}` }))];
    const dupT = {}, dupD = {}; items.forEach((x) => { dupT[norm(x.title)] = (dupT[norm(x.title)] || 0) + 1; if (x.hasDesc) dupD[norm(x.seoDesc)] = (dupD[norm(x.seoDesc)] || 0) + 1; });
    items.forEach((x) => { const is = [], tl = x.title.length, dl = x.desc.length;
      if (!x.hasDesc && !x.desc) is.push('No meta description'); else if (dl < 70) is.push('Description too short'); else if (dl > 160) is.push('Description too long');
      if (tl < 15) is.push('Title too short'); else if (tl > 60) is.push('Title too long');
      if (dupT[norm(x.title)] > 1) is.push('Duplicate title'); if (x.hasDesc && dupD[norm(x.seoDesc)] > 1) is.push('Duplicate description');
      if (x.kind === 'Product') { if (!x.photo) is.push('No photo'); else if (!x.alt) is.push('No photo alt text'); }
      if (x.kw) { const k = norm(x.kw); if (!norm(x.title).includes(k)) is.push('Keyword not in title'); if (!norm(x.desc).includes(k)) is.push('Keyword not in description'); }
      x.issues = is; });
    const good = items.filter((r) => !r.issues.length).length, score = items.length ? Math.round((good / items.length) * 100) : 100, issueCount = items.reduce((a, r) => a + r.issues.length, 0);
    const tabs = [['overview', 'Overview'], ['content', `Content${items.length - good ? ` (${items.length - good})` : ''}`], ['redirects', `Redirects${(rds.data || []).length ? ` (${rds.data.length})` : ''}`], ['settings', 'Settings']];
    const head = `<div class="sechead"><h1 style="margin:0">SEO</h1><span class="muted">Help customers find you on Google</span></div><div class="seg seotabs" role="tablist">${tabs.map(([k, l]) => `<a class="${k === tab ? 'on' : ''}" role="tab" href="#/admin/seo?tab=${k}">${l}</a>`).join('')}</div>`;
    if (tab === 'overview') {
      const tc = (id, label, ok, fix) => `<li data-check="${id}" class="${ok === true ? 'ok' : ok === false ? 'bad' : 'wait'}"><span class="ci">${ok === true ? ':ic-check-circle:' : ok === false ? ':ic-alert:' : ':ic-clock:'}</span><div><b>${label}</b>${fix ? `<small class="muted">${fix}</small>` : ''}</div></li>`;
      return `${head}<div class="seogrid"><div class="stack"><section class="cs"><h3>Content health</h3><div class="scorewrap"><div class="score ${score >= 80 ? 'good' : score >= 50 ? 'mid' : 'bad'}">${score}</div><div><b>${good} of ${items.length}</b> live products and pages are fully optimised<br><small class="muted">${issueCount} thing${issueCount === 1 ? '' : 's'} to fix.</small></div></div><a class="btn" href="#/admin/seo?tab=content">Fix content issues</a></section>
      <section class="cs"><h3>Top issues</h3>${(() => { const c = {}; items.forEach((r) => r.issues.forEach((x) => (c[x] = (c[x] || 0) + 1))); const t = Object.entries(c).sort((a, b) => b[1] - a[1]).slice(0, 6); return t.length ? `<ul class="plain">${t.map(([k, n]) => `<li><span>${esc(k)}</span><b>${n}</b></li>`).join('')}</ul>` : '<p class="muted" style="margin:0">Nothing to fix. :ic-check-circle:</p>'; })()}</section></div>
      <section class="cs"><h3>Technical checks</h3><ul class="checks" id="techchecks">
        ${tc('url', 'Public website address is set', !!o.site_url, o.site_url ? '' : 'Add it in Settings — needed for the sitemap and canonical links.')}${tc('index', 'Search engines are allowed to index the site', !o.noindex, o.noindex ? 'The site is hidden from search engines. Turn that off in Settings.' : '')}
        ${tc('title', 'Site name and home page title are set', !!(o.site_title || o.home_title), 'Set them in Settings.')}${tc('desc', 'Default description is set', !!o.description, 'Shown when a page has no description of its own.')}${tc('og', 'Social share image is set', !!o.og_image, 'Makes links look good on Facebook, WhatsApp and Slack.')}
        ${tc('gsc', 'Google Search Console verified', !!o.gsc, 'Add your verification code in Settings, then submit the sitemap.')}${tc('https', 'Site uses HTTPS', location.protocol === 'https:' || location.hostname === 'localhost', '')}
        ${tc('sitemap', 'sitemap.xml is reachable', null, '')}${tc('robots', 'robots.txt is reachable', null, '')}</ul>
        <p class="muted" style="margin-bottom:0">Submit <code>${esc(seoBase())}/sitemap.xml</code> in <a href="https://search.google.com/search-console" target="_blank" rel="noopener">Google Search Console</a>. The sitemap is rebuilt on every deploy and once a day.</p></section></div>`;
    }
    if (tab === 'content') return `${head}<section class="cs"><div class="toolbar"><input id="seoq" type="search" placeholder="Filter…" aria-label="Filter" style="max-width:260px"><div class="chips" id="seofilter" style="margin:0"><button type="button" class="chip on" data-f="">All</button><button type="button" class="chip" data-f="issues">Needs work</button><button type="button" class="chip" data-f="Product">Products</button><button type="button" class="chip" data-f="Page">Pages</button></div></div>
      <div class="tablewrap"><table class="seotable"><tr><th>Item</th><th>Title</th><th>Description</th><th>To fix</th><th></th></tr>${items.sort((a, b) => b.issues.length - a.issues.length).map((r) => `<tr class="seorow" data-key="${r.t}:${r.id}" data-q="${esc((r.name + ' ' + r.kind).toLowerCase())}" data-kind="${r.kind}" data-issues="${r.issues.length}"><td><b>${esc(r.name)}</b><small class="muted" style="display:block">${r.kind}</small></td><td>${lenHint(r.title.length, 30, 60).replace('lenhint', 'lenhint')}</td><td>${lenHint(r.desc.length, 70, 160)}</td><td>${r.issues.length ? r.issues.map((i) => `<span class="status pending">${esc(i)}</span>`).join(' ') : '<span class="status paid">Good</span>'}</td><td><button type="button" class="btn ghost qe" data-key="${r.t}:${r.id}">Quick edit</button></td></tr>
        <tr class="qerow" data-for="${r.t}:${r.id}" hidden><td colspan="5"><form class="stack qeform" data-t="${r.t}" data-id="${r.id}" data-name="${esc(r.name)}" data-brand="${esc(r.brand || '')}" data-rv="${esc(r.rv || '')}" data-desc="${esc(r.desc.slice(0, 400))}">
          <label>Focus keyword <small class="muted">the phrase people would search for</small><input name="focus_keyword" maxlength="80" value="${esc(r.kw)}"></label>
          <label>Page title<input name="seo_title" maxlength="120" value="${esc(r.seoTitle)}" placeholder="${esc(r.name)}"></label><label>Meta description<textarea name="seo_description" rows="2" maxlength="320">${esc(r.seoDesc)}</textarea></label>${r.kind === 'Product' ? `<label>Photo description (alt text)<input name="image_alt" maxlength="200" value="${esc(r.alt)}" placeholder="e.g. Roll of R-13 fiberglass batt insulation"></label>` : ''}
          <div class="row"><button type="button" class="btn ghost suggest">:ic-star: Suggest</button><button class="btn">Save</button><a class="link" href="${r.href}">Open full editor</a></div></form></td></tr>`).join('')}</table></div></section>`;
    if (tab === 'redirects') return `${head}<section class="cs"><h3 style="margin-top:0">Redirects</h3><p class="muted">Send old links to the right page (for example when you rename or remove a product). They are written into the site on the next deploy (<code>_redirects</code> for Netlify, plus a small forwarding page that works anywhere).</p>
      <form id="rdform" class="row" style="align-items:end"><label style="flex:1;min-width:180px">Old path<input name="from" placeholder="/old-product/" required maxlength="200"></label><label style="flex:1;min-width:180px">Send to<input name="to" placeholder="/product/new-product/ or https://…" required maxlength="300"></label><button class="btn">Add redirect</button></form>
      ${(rds.data || []).length ? `<div class="tablewrap"><table><tr><th>From</th><th>To</th><th>Added</th><th></th></tr>${rds.data.map((r) => `<tr><td><code>${esc(r.from_path)}</code></td><td><code>${esc(r.to_path)}</code></td><td>${new Date(r.created_at).toLocaleDateString()}</td><td><button class="link rddel" data-id="${r.id}" style="color:var(--err)">Delete</button></td></tr>`).join('')}</table></div>` : '<p class="muted" style="margin-bottom:0">No redirects yet.</p>'}</section>`;
    return `${head}<form id="seoform" class="cs stack narrow"><h3 style="margin:0">Site settings</h3>
      <label>Site name in search results<input name="site_title" maxlength="80" value="${esc(o.site_title)}" placeholder="${esc(theme.name || 'Gomi Insulation')}"></label>
      <label>Home page title<input name="home_title" maxlength="80" value="${esc(o.home_title)}" placeholder="Insulation supplies delivered to your site"></label>
      <label>Default description<textarea name="description" rows="3" maxlength="300" placeholder="Quality insulation, delivered. Batts, rolls, foam and more.">${esc(o.description)}</textarea></label>
      <label>Social share image URL <small class="muted">shown when your link is shared (1200×630 works best)</small><input name="og_image" type="url" value="${esc(o.og_image)}" placeholder="https://…"></label>
      <label>Public website address <small class="muted">used in the sitemap and canonical links</small><input name="site_url" type="url" value="${esc(o.site_url)}" placeholder="https://www.gomiinsulation.com"></label>
      <label>Twitter / X handle <small class="muted">optional</small><input name="twitter" maxlength="40" value="${esc(o.twitter)}" placeholder="@gomiinsulation"></label>
      <fieldset class="cmpset"><legend>Tracking &amp; verification</legend><label>Google Search Console verification code <small class="muted">just the code from the “HTML tag” method</small><input name="gsc" maxlength="120" value="${esc(o.gsc)}" placeholder="abc123…"></label>
      <label>Google Analytics 4 measurement ID <small class="muted">optional — adds Google's tracking script</small><input name="ga4" maxlength="20" value="${esc(o.ga4)}" placeholder="G-XXXXXXXXXX" pattern="G-[A-Za-z0-9]+"></label></fieldset>
      <label class="switch"><input type="checkbox" name="noindex" ${o.noindex ? 'checked' : ''}><span class="track"></span><span>Hide the whole site from search engines</span></label>
      <div class="serpwrap">${serp(o.home_title || seoSite(), o.description, '')}</div><button class="btn">Save SEO settings</button></form>`;
  }
  if (sub === 'pages' && id) {
    const pg = id === 'new' ? { title: '', slug: '', body: PAGE_TEMPLATES.blank[1], published: false, show_in_nav: false, show_in_footer: true, sort: 0 } : (await sb.from('pages').select('*').eq('id', id).single()).data;
    PG = { ...pg };
    PG.versions = pg.id ? (await sb.from('page_versions').select('id,title,body,author,created_at').eq('page_id', pg.id).order('id', { ascending: false }).limit(25)).data || [] : [];
    return `<div class="sechead"><h1 style="margin:0">${pg.id ? 'Edit page' : 'New page'}</h1><span class="muted" id="pg_state">${pg.updated_at ? 'Last saved ' + ago(pg.updated_at) : 'Not saved yet'}</span></div><p style="margin:4px 0 12px"><a href="#/admin/pages">← All pages</a></p><div id="pg_draft" class="flash" hidden></div><div class="pgedit">
    <div class="stack">
      ${pg.id ? '' : `<label>Start from a template<select id="pg_tpl">${Object.entries(PAGE_TEMPLATES).map(([k, v]) => `<option value="${k}">${v[0]}</option>`).join('')}</select></label>`}
      <label>Title<input id="pg_title" value="${esc(pg.title)}" maxlength="200"></label>
      <label>Link name<input id="pg_slug" value="${esc(pg.slug)}" maxlength="60" placeholder="auto from title"></label>
      <div class="row"><label class="check"><input type="checkbox" id="pg_pub" ${pg.published ? 'checked' : ''}> Published</label>
      <label class="check"><input type="checkbox" id="pg_nav" ${pg.show_in_nav ? 'checked' : ''}> Show in menu</label>
      <label class="check"><input type="checkbox" id="pg_foot" ${pg.show_in_footer ? 'checked' : ''}> Show in footer</label>
      <label class="check">Order <input type="number" id="pg_sort" value="${pg.sort ?? 0}" style="width:80px"></label></div>
      <div class="two2"><label>Subtitle <small class="muted">shown under the title</small><input id="pg_sub" maxlength="200" value="${esc(pg.subtitle || '')}" placeholder="e.g. Fast, friendly delivery across the region"></label><label>Layout<select id="pg_layout"><option value="narrow" ${pg.layout === 'narrow' || !pg.layout ? 'selected' : ''}>Narrow (easy reading)</option><option value="wide" ${pg.layout === 'wide' ? 'selected' : ''}>Wide</option><option value="full" ${pg.layout === 'full' ? 'selected' : ''}>Full width</option></select></label></div>
      <div class="curphoto" style="align-items:flex-start"><div class="stack" style="flex:1;gap:8px"><b>Cover image <small class="muted">(optional banner at the top)</small></b><input id="pg_cover" type="url" value="${esc(pg.cover_url || '')}" placeholder="https://… or upload below"><div class="row"><label class="btn ghost" style="cursor:pointer">:ic-image: Upload cover<input type="file" id="pg_coverfile" accept="image/jpeg,image/png,image/webp" hidden></label><button type="button" class="link" id="pg_coverclear">Remove cover</button></div></div>${pg.cover_url ? `<img src="${esc(safeUrl(pg.cover_url))}" alt="" style="width:120px;height:80px;object-fit:cover;border-radius:6px">` : ''}</div>
      <details class="more" ${pg.publish_at || pg.unpublish_at ? 'open' : ''}><summary>Schedule publishing</summary><div class="two2" style="margin-top:8px"><label>Go live on <small class="muted">needs “Published” ticked</small><input type="datetime-local" id="pg_pubat" value="${pg.publish_at ? new Date(new Date(pg.publish_at) - new Date(pg.publish_at).getTimezoneOffset() * 6e4).toISOString().slice(0, 16) : ''}"></label><label>Hide on<input type="datetime-local" id="pg_unpubat" value="${pg.unpublish_at ? new Date(new Date(pg.unpublish_at) - new Date(pg.unpublish_at).getTimezoneOffset() * 6e4).toISOString().slice(0, 16) : ''}"></label></div></details>
      <div class="mdbar row"><button type="button" class="btn ghost" data-md="# ">H1</button><button type="button" class="btn ghost" data-md="## ">H2</button><button type="button" class="btn ghost" data-wrap="**">B</button><button type="button" class="btn ghost" data-wrap="*"><i>I</i></button>
      <button type="button" class="btn ghost" data-md="- ">• List</button><button type="button" class="btn ghost" data-md="> ">:ic-quote: Quote</button><button type="button" class="btn ghost" data-ins="[link text](https://)">:ic-link: Link</button>
      <button type="button" class="btn ghost" data-md="### ">H3</button><button type="button" class="btn ghost" data-md="1. ">1. List</button><button type="button" class="btn ghost" data-ins="\n---\n">Divider</button><button type="button" class="btn ghost" data-ins="\n| Column A | Column B |\n| --- | --- |\n| One | Two |\n">Table</button>
      <button type="button" class="btn ghost" data-ins="\n{{faq: Question? | Answer.}}\n">FAQ</button><button type="button" class="btn ghost" data-ins="\n{{callout: Important note}}\n">Callout</button><button type="button" class="btn ghost" data-ins="\n{{youtube: https://www.youtube.com/watch?v=VIDEO_ID}}\n">Video</button><button type="button" class="btn ghost" id="pg_prodbtn">Product</button>
      <button type="button" class="btn ghost" data-ins="{{button: Label | #/shop}}">Button</button>
      <button type="button" class="btn ghost" data-ins="\n{{columns: First column text | Second column text | Third column text}}\n">Columns</button><button type="button" class="btn ghost" data-ins="\n{{image: https://… | Caption}}\n">Image+caption</button><button type="button" class="btn ghost" data-ins="\n{{products: category=Batts &amp; Rolls | limit=4}}\n">Product grid</button><button type="button" class="btn ghost" data-ins="\n{{contact}}\n">Contact box</button><button type="button" class="btn ghost" data-ins="\n{{quote: Great service and fast delivery. | Customer name}}\n">Testimonial</button><label class="btn ghost" style="cursor:pointer">:ic-image: Image<input type="file" id="pg_img" accept="image/jpeg,image/png,image/webp,image/gif" hidden></label></div>
       <textarea id="pg_body" rows="18" style="font-family:ui-monospace,Menlo,monospace;font-size:.9rem" maxlength="100000">${esc(pg.body)}</textarea>
      ${seoFields(pg, pg.title, '/page/' + (pg.slug || 'your-page') + '/')}
      <div class="row"><button type="button" class="btn" id="pg_save">Save page</button>${pg.id ? `<a class="btn ghost" href="#/page/${esc(pg.slug)}" target="_blank" rel="noopener">View ↗</a>` : ''}</div>
      ${PG.versions.length ? `<details class="more"><summary>Version history (${PG.versions.length})</summary><div class="stack" style="gap:6px;margin-top:8px">${PG.versions.map((v) => `<div class="row" style="justify-content:space-between;flex-wrap:nowrap"><span><b>${esc(v.title)}</b> <small class="muted">${ago(v.created_at)}${v.author ? ' · ' + esc(v.author) : ''} · ${v.body.length} chars</small></span><button type="button" class="link pg_restore" data-id="${v.id}">Restore</button></div>`).join('')}</div></details>` : ''}
      <details class="more"><summary>Formatting help</summary><p class="muted" style="white-space:pre-wrap"># Heading   ## Smaller heading
**bold**  *italic*  [link](https://…)  ![image](https://…)
- bullet list      1. numbered list      &gt; quote      --- divider
{{button: Shop now | #/shop}}  (a button link)
{{faq: Question? | Answer}}  {{callout: note}}  {{product: product-link-name}}  {{youtube: video url}}
{{columns: A | B | C}}  {{image: url | caption}}  {{products: category=Name | brand=Name | limit=4}}  {{contact}}  {{quote: text | author}}
| A | B |  then  | --- | --- |  then rows (table)  ·  Ctrl+S saves, Ctrl+B / Ctrl+I bold / italic</p></details></div>
    <div><div class="sechead"><h3 style="margin:0">Preview</h3><span class="muted" id="pg_stats">${wordStats(pg.body)}</span><div class="seg" id="pg_dev"><button type="button" class="on" data-w="">Desktop</button><button type="button" data-w="390px">Mobile</button></div></div><div class="prevframe" id="pg_frame"><article class="prose preview" id="pg_preview">${md(pg.body)}</article></div></div></div>`;
  }
  if (sub === 'pages') {
    const ps = (await sb.from('pages').select('*').order('sort').order('title')).data;
    return `<div class="sechead"><h1 style="margin:0">Pages</h1><a class="btn" href="#/admin/pages/new">+ New page</a></div>${ps.length ? `<table><tr><th>Page</th><th>Link</th><th>Status</th><th>Menu</th><th>Footer</th><th></th></tr>${ps.map((x) => `<tr><td><a href="#/admin/pages/${x.id}">${esc(x.title)}</a></td><td><code>#/page/${esc(x.slug)}</code></td><td>${x.published ? 'Published' : 'Draft'}</td><td>${x.show_in_nav ? ':ic-check:' : ''}</td><td>${x.show_in_footer ? ':ic-check:' : ''}</td><td><a href="#/page/${esc(x.slug)}">View</a> · <button class="link pubpage" data-id="${x.id}" data-pub="${x.published ? '' : '1'}">${x.published ? 'Unpublish' : 'Publish'}</button> · <button class="link duppage" data-id="${x.id}">Duplicate</button> · <button class="link delpage" data-id="${x.id}" data-title="${esc(x.title)}" style="color:var(--err)">Delete</button></td></tr>`).join('')}</table>` : '<p>No pages yet.</p>'}`;
  }
  if (sub === 'locations' && id) {
    const l = id === 'new' ? { name: '', kind: 'store', address: '', city: '', postcode: '', phone: '', email: '', hours: '', active: true, pickup_enabled: true, is_default: false } : (await sb.from('locations').select('*').eq('id', id).single()).data;
    LOC = { ...l };
    const t = (n, lab, x = '') => `<label>${lab}<input name="${n}" value="${esc(l[n] ?? '')}" ${x}></label>`;
    return `<h1>${l.id ? 'Edit location' : 'New location'}</h1><p><a href="#/admin/locations">← All locations</a></p><form id="lf" class="stack narrow">${t('name', 'Name', 'required maxlength="100"')}
    <label>Type<select name="kind">${Object.entries(KINDS).map(([k, v]) => `<option value="${k}" ${k === l.kind ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
    ${t('address', 'Street address')}${t('city', 'City')}${t('postcode', 'Postal / ZIP code')}${t('phone', 'Phone')}${t('email', 'Email', 'type="email"')}
    <label>Opening hours<textarea name="hours" rows="3" placeholder="Mon–Fri 8–5, Sat 9–1">${esc(l.hours)}</textarea></label>
    <label class="check"><input type="checkbox" name="active" ${l.active ? 'checked' : ''}> Active</label>
    <label class="check"><input type="checkbox" name="pickup_enabled" ${l.pickup_enabled ? 'checked' : ''}> Customers can pick up orders here (shown at checkout, address becomes public)</label>
    ${l.is_default ? '<p class="muted">This is the default location: online delivery orders are fulfilled from here first.</p>' : '<label class="check"><input type="checkbox" name="make_default"> Make this the default location (online delivery orders are fulfilled from here first)</label>'}
    <div class="row"><button class="btn">Save location</button>${l.id && !l.is_default ? '<button type="button" class="btn ghost" id="delloc" style="color:var(--err)">Delete</button>' : ''}</div></form>`;
  }
  if (sub === 'locations') {
    const ls = (await sb.from('locations').select('*').order('is_default', { ascending: false }).order('name')).data;
    const units = {}; ((await sb.from('inventory').select('location_id,qty')).data || []).forEach((r) => (units[r.location_id] = (units[r.location_id] || 0) + r.qty));
    return `<h1>Locations</h1><p><a class="btn" href="#/admin/locations/new">+ New location</a> <a class="btn ghost" href="#/admin/inventory">Inventory</a></p>
    <table><tr><th>Name</th><th>Type</th><th>Address</th><th>Units in stock</th><th>Pickup</th><th>Status</th></tr>${ls.map((l) => `<tr><td><a href="#/admin/locations/${l.id}">${esc(l.name)}</a>${l.is_default ? ' <span class="status paid">default</span>' : ''}</td><td>${KINDS[l.kind] || ''}</td><td>${esc([l.address, l.city, l.postcode].filter(Boolean).join(', '))}</td><td>${units[l.id] || 0}</td><td>${l.pickup_enabled ? ':ic-check:' : ''}</td><td>${l.active ? 'Active' : 'Inactive'}</td></tr>`).join('')}</table>`;
  }
  if (sub === 'inventory') {
    const [prods, locs, inv, log, sold, brandsR] = await Promise.all([sb.from('products').select('id,name,category,brand,active,cost_cents,price_cents,reorder_point,bags_per_bundle').order('name'), sb.from('locations').select('*').order('is_default', { ascending: false }).order('name'),
      sb.from('inventory').select('*'), sb.from('inventory_log').select('*').order('id', { ascending: false }).limit(40),
      sb.from('order_items').select('product_id,qty,orders!inner(created_at,status)').neq('orders.status', 'cancelled').gte('orders.created_at', new Date(Date.now() - 30 * 864e5).toISOString()).limit(5000), sb.from('brands').select('name').order('name')]);
    const P = prods.data, L = locs.data, qty = {}; inv.data.forEach((r) => (qty[`${r.product_id}:${r.location_id}`] = r.qty));
    const pname = Object.fromEntries(P.map((x) => [x.id, x.name])), lname = Object.fromEntries(L.map((x) => [x.id, x.name]));
    const KIND_L = { adjust: 'Adjusted', sale: 'Sale', restock: 'Restocked', transfer_in: 'Transfer in', transfer_out: 'Transfer out' };
    return `<h1>Inventory</h1><p><a class="btn ghost" href="#/admin/locations">Manage locations</a> <button class="btn ghost" id="invcsv">:ic-download: Export CSV</button></p>
    ${(() => { const sold30 = {}; (sold.data || []).forEach((r) => (sold30[r.product_id] = (sold30[r.product_id] || 0) + r.qty)); INVSOLD = sold30;
      const rows = P.map((x) => { const tot = L.reduce((a, l) => a + (qty[`${x.id}:${l.id}`] || 0), 0); return { x, tot, st: tot === 0 ? 'out' : tot <= (x.reorder_point ?? 10) ? 'low' : 'ok' }; }), live = rows.filter((r) => r.x.active);
      return `<div class="kpis"><div class="kpi"><span class="lbl">Products</span><b>${live.length}</b></div><div class="kpi"><span class="lbl">Bags on hand</span><b>${live.reduce((a, r) => a + r.tot, 0).toLocaleString()}</b><small class="muted">${live.reduce((a, r) => a + (r.x.bags_per_bundle ? Math.floor(r.tot / r.x.bags_per_bundle) : 0), 0).toLocaleString()} full bundles</small></div><div class="kpi"><span class="lbl">Stock value (cost)</span><b>${money(live.reduce((a, r) => a + r.tot * (r.x.cost_cents || 0), 0))}</b><small class="muted">${money(live.reduce((a, r) => a + r.tot * r.x.price_cents, 0))} at retail</small></div><div class="kpi"><span class="lbl">Needs attention</span><b class="${rows.some((r) => r.st !== 'ok') ? 'down' : ''}">${live.filter((r) => r.st === 'low').length} low · ${live.filter((r) => r.st === 'out').length} out</b></div></div>`; })()}
    ${(() => { const bl = (brandsR.data || []).map((b) => b.name), cb = can('inventory.manage') || can('catalog.manage'); INVBRANDS = bl;
      return `<details class="more" style="margin-top:14px"><summary>Brands (${bl.length})</summary><div class="brandbox"><div class="brandlist" id="brandlist2">${bl.length ? bl.map((b) => `<span class="brandpill"><b>${esc(b)}</b>${cb ? `<button type="button" class="ren" data-b="${esc(b)}">Rename</button><button type="button" class="del" data-b="${esc(b)}" aria-label="Delete ${esc(b)}">:ic-x:</button>` : ''}</span>`).join('') : '<span class="muted">No brands yet.</span>'}</div>
      ${cb ? '<form id="brandadd" class="row"><input name="brand" placeholder="New brand (e.g. Rockwool)" maxlength="60" required style="max-width:280px"><button class="btn">Add brand</button></form>' : ''}<small class="muted">Brands can be assigned to each product in the table below, or in the product editor. Deleting a brand leaves its products without one.</small></div></details>`; })()}
    <div class="toolbar" style="margin:14px 0 8px"><input id="invsearch" placeholder="Filter products…" aria-label="Filter products" style="flex:1;max-width:320px"><select id="invbrandf" aria-label="Brand"><option value="">All brands</option><option value="__none">No brand</option>${(brandsR.data || []).map((b) => `<option>${esc(b.name)}</option>`).join('')}</select><div class="chips" id="invst" style="margin:0">${[['', 'All'], ['low', 'Low'], ['out', 'Out of stock'], ['ok', 'Healthy']].map(([v, l], i) => `<button type="button" class="chip ${i ? '' : 'on'}" data-st="${v}">${l}</button>`).join('')}</div><div class="seg" id="invmode" role="group" aria-label="Count stock in"><button type="button" data-mode="bags">Bags only</button><button type="button" class="on" data-mode="bundles">Bundles + bags</button></div><select id="invsort" aria-label="Sort"><option value="name">A–Z</option><option value="stock">Lowest stock</option><option value="cover">Least days of cover</option><option value="value">Highest value</option></select></div>
    <p class="howto">:ic-package: <span><b>How to count:</b> enter <b>Bags in a bundle</b> for each product, then type how many <b>bundles</b> and how many <b>loose bags</b> you have at each location. Stock is saved as total bags.</span></p>
    <div class="tablewrap"><table id="invtable" class="bymode"><tr><th>Product</th><th>Brand</th><th title="How many bags are in one bundle of this product">Bags in a bundle</th>${L.map((l) => `<th>${esc(l.name)}${l.active ? '' : ' (inactive)'}</th>`).join('')}<th>Total</th><th>Status</th><th>Value</th><th title="Stock on hand ÷ average daily sales over the last 30 days">Days left</th></tr>
    ${P.map((x) => { const tot = L.reduce((a, l) => a + (qty[`${x.id}:${l.id}`] || 0), 0), st = tot === 0 ? 'out' : tot <= (x.reorder_point ?? 10) ? 'low' : 'ok', s30 = INVSOLD[x.id] || 0, cover = s30 > 0 ? Math.round(tot / (s30 / 30)) : 9999;  const cbr = can('inventory.manage') || can('catalog.manage'); return `<tr data-name="${esc(x.name.toLowerCase())}" data-brand="${esc(x.brand || '')}"  data-n="${x.bags_per_bundle || ''}" data-st="${st}" data-stock="${tot}" data-cover="${cover}" data-value="${tot * (x.cost_cents || 0)}"><td><b>${esc(x.name)}</b>${x.active ? '' : ' <span class="muted">(hidden)</span>'}<br><small class="muted">${esc(x.category)}</small></td><td>${cbr ? `<select class="invbrand" data-p="${x.id}" aria-label="Brand for ${esc(x.name)}"><option value="">— none —</option>${(brandsR.data || []).map((b) => `<option ${b.name === x.brand ? 'selected' : ''}>${esc(b.name)}</option>`).join('')}<option value="__new">+ New brand…</option></select>` : esc(x.brand || '—')}</td><td>${cbr ? `<input type="number" class="invn" min="2" max="1000" data-p="${x.id}" value="${x.bags_per_bundle || ''}" placeholder="—" aria-label="Bags per bundle for ${esc(x.name)}" title="Bags in one bundle (leave empty if sold only as bags)">` : (x.bags_per_bundle || '—')}</td>${L.map((l) => { const q0 = qty[`${x.id}:${l.id}`] || 0, N = x.bags_per_bundle; return `<td class="invcell"><div class="invbags"><input type="number" min="0" class="invq" data-p="${x.id}" data-l="${l.id}" data-n="${N || ''}" value="${q0}" aria-label="${esc(x.name)} bags at ${esc(l.name)}"><small class="muted">bags</small></div>${N ? `<div class="invbund"><label class="bbox"><small class="muted">Bundles</small><input type="number" min="0" class="invb" aria-label="${esc(x.name)} bundles at ${esc(l.name)}" value="${Math.floor(q0 / N)}"></label><label class="bbox"><small class="muted">Loose bags</small><input type="number" min="0" class="invl" aria-label="${esc(x.name)} loose bags at ${esc(l.name)}" value="${q0 % N}"></label></div><small class="invsub muted">${Math.floor(q0 / N)} bundles + ${q0 % N} bags</small>` : (cbr ? '<small class="muted nobsize">set “Bags in a bundle” to count bundles</small>' : '')}</td>`; }).join('')}<td><span class="invtot ${st !== 'ok' ? 'lowtot' : ''}">${tot}</span>${x.bags_per_bundle ? `<small class="invtotsub muted">${Math.floor(tot / x.bags_per_bundle)} bundles + ${tot % x.bags_per_bundle} bags</small>` : '<small class="invtotsub muted">bags</small>'}</td><td><span class="status ${st === 'out' ? 'cancelled' : st === 'low' ? 'pending' : 'paid'}">${st === 'out' ? 'Out' : st === 'low' ? 'Low' : 'OK'}</span></td><td>${money(tot * (x.cost_cents || 0))}</td><td>${cover === 9999 ? '<span class="muted">no sales</span>' : cover + ' d'}</td></tr>`; }).join('')}</table></div>
    <h2>Transfer stock between locations</h2>${L.length < 2 ? '<p class="muted">Add a second location to transfer stock.</p>' : `<form id="tf" class="row"><select name="pid" required><option value="">Product…</option>${P.map((x) => `<option value="${x.id}">${esc(x.name)}</option>`).join('')}</select>
    <select name="from" required><option value="">From…</option>${L.map((l) => `<option value="${l.id}">${esc(l.name)}</option>`).join('')}</select><select name="to" required><option value="">To…</option>${L.map((l) => `<option value="${l.id}">${esc(l.name)}</option>`).join('')}</select>
    <input name="amount" type="number" min="1" placeholder="Qty" required style="width:90px"><input name="note" placeholder="Note (optional)" style="flex:1;min-width:160px"><button class="btn">Transfer</button></form>`}
    <h2>Recent activity</h2>${log.data.length ? `<table><tr><th>When</th><th>Product</th><th>Location</th><th>Change</th><th>Type</th><th>Note</th></tr>${log.data.map((e) => `<tr><td>${dateOf(e.created_at)}</td><td>${esc(pname[e.product_id] || '')}</td><td>${esc(lname[e.location_id] || '')}</td><td><b style="color:${e.delta < 0 ? 'var(--err)' : 'var(--ok)'}">${e.delta > 0 ? '+' : ''}${e.delta}</b> → ${e.qty_after}</td><td>${KIND_L[e.kind] || esc(e.kind)}${e.order_id ? ` <a href="#/admin/orders/${e.order_id}">#${e.order_id}</a>` : ''}</td><td>${esc(e.note)}</td></tr>`).join('')}</table>` : '<p class="muted">No activity yet.</p>'}`;
  }
  if (sub === 'sales') {
    const days = q.get('days') || '30', locF = q.get('loc') || '', srcF = q.get('source') || '';
    const since = days === 'all' ? null : new Date(Date.now() - Number(days) * 864e5).toISOString();
    const locs = (await sb.from('locations').select('id,name').order('name')).data || [], lname = Object.fromEntries(locs.map((l) => [l.id, l.name]));
    let oq = sb.from('orders').select('id,created_at,status,total_cents,tax_cents,refunded_cents,location_id,source,name').neq('status', 'cancelled').order('created_at');
    let iq = sb.from('order_items').select('name,qty,price_cents,cost_cents,orders!inner(created_at,status,location_id,source)').neq('orders.status', 'cancelled');
    if (since) { oq = oq.gte('created_at', since); iq = iq.gte('orders.created_at', since); }
    if (locF) { oq = oq.eq('location_id', locF); iq = iq.eq('orders.location_id', locF); }
    if (srcF) { oq = oq.eq('source', srcF); iq = iq.eq('orders.source', srcF); }
    const [orders, items] = [(await oq).data || [], (await iq).data || []];
    const revenue = orders.reduce((a, o) => a + net(o), 0), taxTotal = orders.reduce((a, o) => a + (o.tax_cents || 0), 0), refundTotal = orders.reduce((a, o) => a + (o.refunded_cents || 0), 0), units = items.reduce((a, i) => a + i.qty, 0);
    const itemRev = items.reduce((a, i) => a + i.qty * i.price_cents, 0), profit = items.reduce((a, i) => a + i.qty * (i.price_cents - (i.cost_cents || 0)), 0), hasCost = items.some((i) => i.cost_cents > 0);
    const byLoc = {}; orders.forEach((o) => { const k = o.location_id || 0; (byLoc[k] = byLoc[k] || { n: 0, rev: 0, units: 0 }); byLoc[k].n++; byLoc[k].rev += net(o); });
    items.forEach((i) => { const k = i.orders.location_id || 0; (byLoc[k] = byLoc[k] || { n: 0, rev: 0, units: 0 }); byLoc[k].units += i.qty; });
    const bySrc = { online: 0, in_store: 0 }; orders.forEach((o) => (bySrc[o.source] = (bySrc[o.source] || 0) + net(o)));
    const top = {}; items.forEach((i) => { const t = (top[i.name] = top[i.name] || { units: 0, rev: 0, profit: 0 }); t.units += i.qty; t.rev += i.qty * i.price_cents; t.profit += i.qty * (i.price_cents - (i.cost_cents || 0)); });
    const topRows = Object.entries(top).sort((a, b) => b[1].rev - a[1].rev).slice(0, 10);
    const mk = (extra) => { const n = new URLSearchParams(q); Object.entries(extra).forEach(([k, v]) => (v ? n.set(k, v) : n.delete(k))); return `#/admin/sales?${n}`; };
    SALES_ROWS = orders.map((o) => [o.id, o.created_at, lname[o.location_id] || '', o.source, o.status, o.name, (net(o) / 100).toFixed(2)]);
    return `<h1>Sales</h1>${rangeChips('#/admin/sales', q)}
    <div class="row" style="margin-bottom:14px"><select id="salesloc" aria-label="Location"><option value="">All locations</option>${locs.map((l) => `<option value="${l.id}" ${String(l.id) === locF ? 'selected' : ''}>${esc(l.name)}</option>`).join('')}</select>
    <select id="salessrc" aria-label="Channel"><option value="">All channels</option><option value="online" ${srcF === 'online' ? 'selected' : ''}>Online</option><option value="in_store" ${srcF === 'in_store' ? 'selected' : ''}>In store</option></select>
    <button class="btn ghost" id="salescsv">:ic-download: Export orders CSV</button></div>
    <div class="stats"><div><b>${money(revenue)}</b>revenue (excl. tax, after refunds)</div><div><b>${orders.length}</b>orders</div><div><b>${units}</b>units sold</div><div><b>${money(orders.length ? Math.round(revenue / orders.length) : 0)}</b>average order</div>
    ${hasCost ? `<div><b>${money(profit)}</b>gross profit (est.)</div><div><b>${itemRev ? Math.round(profit / itemRev * 100) : 0}%</b>margin</div>` : ''}${taxTotal ? `<div><b>${money(taxTotal)}</b>tax collected</div>` : ''}${refundTotal ? `<div><b>${money(refundTotal)}</b>refunded</div>` : ''}</div>
    ${hasCost ? '' : '<p class="muted">Add a unit cost to your products to see profit and margin here.</p>'}
    <h2>Revenue over time</h2>${barChart(bucketize(orders, days))}
    <div class="two" style="margin-top:8px"><div><h2>By location</h2>${Object.keys(byLoc).length ? `<table><tr><th>Location</th><th>Orders</th><th>Units</th><th>Revenue</th></tr>${Object.entries(byLoc).sort((a, b) => b[1].rev - a[1].rev).map(([k, v]) => `<tr><td>${esc(lname[k] || 'Unassigned')}</td><td>${v.n}</td><td>${v.units}</td><td>${money(v.rev)}</td></tr>`).join('')}</table>` : '<p class="muted">No sales in this period.</p>'}
    <h2>By channel</h2><table><tr><th>Channel</th><th>Revenue</th></tr><tr><td>Online</td><td>${money(bySrc.online || 0)}</td></tr><tr><td>In store</td><td>${money(bySrc.in_store || 0)}</td></tr></table></div>
    <div><h2>Top products</h2>${topRows.length ? `<table><tr><th>Product</th><th>Units</th><th>Revenue</th>${hasCost ? '<th>Profit</th>' : ''}</tr>${topRows.map(([n, v]) => `<tr><td>${esc(n)}</td><td>${v.units}</td><td>${money(v.rev)}</td>${hasCost ? `<td>${money(v.profit)}</td>` : ''}</tr>`).join('')}</table>` : '<p class="muted">No sales in this period.</p>'}</div></div>
`;
  }
  if (sub === 'pos') {
    const [locs, prods, inv] = await Promise.all([sb.from('locations').select('*').eq('active', true).order('is_default', { ascending: false }).order('name'), sb.from('products').select('id,name,price_cents,unit,category').eq('active', true).order('name').then(async (r) => { if (r.data) await attachPacks(r.data); return r; }), sb.from('inventory').select('*')]);
    if (!locs.data.length) return '<h1>Point of sale</h1><p>Add a location first.</p>';
    POS = { locs: locs.data, prods: prods.data, inv: inv.data, loc: POS?.loc && locs.data.some((l) => l.id === POS.loc) ? POS.loc : locs.data[0].id, cart: {} };
    return `<h1>Point of sale</h1><p class="muted">Record a sale made in person. Stock is taken from the location you pick.</p>
    <div class="pos"><div><div class="row" style="margin-bottom:10px"><select id="posloc" aria-label="Location">${POS.locs.map((l) => `<option value="${l.id}" ${l.id === POS.loc ? 'selected' : ''}>${esc(l.name)}</option>`).join('')}</select><input id="possearch" placeholder="Search products…" style="flex:1;min-width:160px"></div><div id="posgrid" class="posgrid"></div></div>
    <aside><h3 style="margin-top:0">Current sale</h3><div id="poscart"></div>
    <div class="stack" style="margin-top:12px"><input id="pos_name" placeholder="Customer name (optional)"><input id="pos_email" type="email" placeholder="Email for receipt (optional)"><input id="pos_phone" placeholder="Phone (optional)">
    <select id="pos_pay"><option>Cash</option><option>Card</option><option>Cheque</option><option>Other</option></select><button class="btn" id="pos_done">Complete sale</button></div></aside></div>`;
  }
  if (sub === 'compare' && id) {
    const [pr, comps, prices] = await Promise.all([sb.from('products').select('id,name,price_cents').eq('id', id).single(), sb.from('competitors').select('*').order('sort'), sb.from('competitor_prices').select('*').eq('product_id', id)]);
    const prod = pr.data; CMPP = prod;
    return `<h1>Competitor prices</h1><p><a href="#/admin/compare">← All products</a></p><p><b>${esc(prod.name)}</b> — our price ${money(prod.price_cents)}</p>
    <form id="cmpform" class="stack narrow">${comps.data.map((c) => { const r = prices.data.find((x) => x.competitor_id === c.id) || {};
      return `<fieldset class="cmpset" data-c="${c.id}"><legend>${esc(c.name)}${c.active ? '' : ' (hidden)'}</legend>
      <label>Price<input name="price" type="number" step="0.01" min="0" value="${r.price_cents != null ? (r.price_cents / 100).toFixed(2) : ''}" placeholder="Leave empty if not sold there"></label>
      <label>Link to their product page (https://…)<input name="url" type="url" value="${esc(r.url || '')}" pattern="https://.*"></label>
      <label>Comparable item (what you compared)<input name="note" maxlength="200" value="${esc(r.note || '')}" placeholder="e.g. Owens Corning R-13 batt, 88 sq ft"></label>
      <label class="check"><input type="checkbox" name="in_stock" ${r.in_stock === false ? '' : 'checked'}> In stock there</label>${r.checked_at ? `<small class="muted">Last checked ${dateOf(r.checked_at)}</small>` : ''}</fieldset>`; }).join('')}
    <button class="btn">Save (marks prices as checked today)</button></form>`;
  }
  if (sub === 'compare') {
    const [prods, comps, prices] = await Promise.all([sb.from('products').select('id,name,price_cents,category').order('name'), sb.from('competitors').select('*').order('sort'), sb.from('competitor_prices').select('*')]);
    const map = {}; prices.data.forEach((r) => (map[`${r.product_id}:${r.competitor_id}`] = r)); const cut = Date.now() - CMP_DAYS() * 864e5;
    const staleN = prices.data.filter((r) => new Date(r.checked_at) < cut).length;
    return `<h1>Price comparison</h1><p class="muted">Enter what competitors charge for a comparable item. Customers see these on product pages (with the date checked) only while they are less than ${CMP_DAYS()} days old.</p>
    ${staleN ? `<p class="flash error" style="margin-top:0">${staleN} price${staleN === 1 ? ' is' : 's are'} older than ${CMP_DAYS()} days and hidden from customers until re-checked.</p>` : ''}
    <div class="row" style="margin-bottom:10px"><input id="cmpsearch" placeholder="Filter products…" style="flex:1;max-width:300px"><button class="btn ghost" id="cmpall">:ic-check: Mark all as checked today</button></div>
    <table id="cmptable"><tr><th>Product</th><th>Our price</th>${comps.data.map((c) => `<th>${esc(c.name)}${c.active ? '' : ' (hidden)'}</th>`).join('')}<th></th></tr>
    ${prods.data.map((x) => `<tr data-name="${esc(x.name.toLowerCase())}"><td><b>${esc(x.name)}</b><br><small class="muted">${esc(x.category)}</small></td><td>${money(x.price_cents)}</td>${comps.data.map((c) => { const r = map[`${x.id}:${c.id}`]; const stale = r && new Date(r.checked_at) < cut;
      return `<td><input type="number" step="0.01" min="0" class="cmpq" data-p="${x.id}" data-c="${c.id}" value="${r ? (r.price_cents / 100).toFixed(2) : ''}" placeholder="—" aria-label="${esc(x.name)} at ${esc(c.name)}">${r ? `<br><small class="${stale ? 'down' : 'muted'}">${stale ? 'stale · ' : ''}${new Date(r.checked_at).toLocaleDateString()}</small>` : ''}</td>`; }).join('')}<td><a href="#/admin/compare/${x.id}">Details</a></td></tr>`).join('')}</table>
    <h2>Retailers</h2><table><tr><th>Name</th><th>Status</th><th></th></tr>${comps.data.map((c) => `<tr><td>${esc(c.name)}</td><td>${c.active ? 'Shown' : 'Hidden'}</td><td><button class="link togcomp" data-id="${c.id}" data-active="${c.active}" style="color:var(--brand)">${c.active ? 'Hide' : 'Show'}</button></td></tr>`).join('')}</table>
    <form id="addcomp" class="row"><input name="name" placeholder="Add a retailer (e.g. Lowe's)" maxlength="80" required><button class="btn ghost">Add</button></form>`;
  }
  if (sub === 'settings') {
    const b = STORE.biz || {}, msgReady = (await sb.rpc('messaging_ready')).data === true, msgLog = (await sb.from('message_log').select('*').order('id', { ascending: false }).limit(8)).data || [];
    return `<h1>Store settings</h1><p class="muted">These apply to the whole store: shipping and tax at checkout, and the details printed on invoices.</p>
    <form id="setf" class="stack narrow"><fieldset class="cmpset"><legend>Opening hours</legend><p class="muted" style="margin:0">Shown on the home page ("Open now"), the footer and the contact box.</p>
      ${['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map((d) => { const r = parseRange((STORE.hours || {})[d]); return `<div class="hrow" data-d="${d}"><b>${DAYNAMES[d].slice(0, 3)}</b><label class="check"><input type="checkbox" class="hclosed" ${r ? '' : 'checked'}> Closed</label><input type="time" class="hfrom" value="${r ? r.from.padStart(5, '0') : '08:00'}" ${r ? '' : 'disabled'} aria-label="${DAYNAMES[d]} opens"><span>to</span><input type="time" class="hto" value="${r ? r.to.padStart(5, '0') : '17:00'}" ${r ? '' : 'disabled'} aria-label="${DAYNAMES[d]} closes"></div>`; }).join('')}
      <label>Time zone<select name="tz">${[['America/Toronto', 'Eastern (Toronto / New York)'], ['America/Winnipeg', 'Central (Winnipeg / Chicago)'], ['America/Edmonton', 'Mountain (Edmonton / Denver)'], ['America/Vancouver', 'Pacific (Vancouver / Los Angeles)'], ['America/Halifax', 'Atlantic (Halifax)'], ['America/St_Johns', 'Newfoundland']].map(([v, l]) => `<option value="${v}" ${(STORE.tz || 'America/Toronto') === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label></fieldset>
    <fieldset class="cmpset"><legend>Shop status</legend>
      <label class="switch"><input type="checkbox" name="closed" ${STORE.closed ? 'checked' : ''}><span class="track"></span><span>Shop closed — turn off online ordering</span></label>
      <label>Message shown to customers<textarea name="closed_message" rows="2" maxlength="300" placeholder="We're closed for the holidays and will reopen Monday.">${esc(STORE.closed_message || '')}</textarea></label>
      <label>Reopens automatically on <small class="muted">optional</small><input type="date" name="closed_until" value="${esc(STORE.closed_until || '')}"></label><small class="muted">While closed, customers can browse and fill a cart but cannot check out. In-store sales (POS) and invoices still work for your team.</small></fieldset>
    <fieldset class="cmpset"><legend>Shipping</legend>
      <label>Flat delivery fee ($)<input name="ship" type="number" step="0.01" min="0" value="${((STORE.ship_flat_cents || 0) / 100).toFixed(2)}"></label>
      <label>Free delivery on orders over ($) <small class="muted">0 = never free</small><input name="free" type="number" step="0.01" min="0" value="${((STORE.free_over_cents || 0) / 100).toFixed(2)}"></label>
      <div><b>Delivery zones</b> <small class="muted">different delivery fee by postal code — the flat fee above applies everywhere else</small><div id="zonerows">${(STORE.ship_zones || []).map(zoneRow).join('')}</div><button type="button" class="btn ghost" id="addzone">+ Add a delivery zone</button></div></fieldset>
    <fieldset class="cmpset"><legend>Sales tax</legend>
      <div class="two2"><label>Tax name<input name="tax_label" maxlength="30" value="${esc(STORE.tax_label || 'Tax')}" placeholder="GST/HST"></label><label>Rate (%)<input name="tax_rate" type="number" step="0.001" min="0" max="50" value="${Number(STORE.tax_rate) || 0}"></label></div>
      <small class="muted">Added to online and in-store orders (on goods + delivery, after discounts). Set 0 for no tax. Check your local rules — this is a single flat rate.</small></fieldset>
    <fieldset class="cmpset"><legend>Business details (shown on invoices)</legend>
      <label>Legal / trading name<input name="legal_name" maxlength="120" value="${esc(b.legal_name || '')}"></label><label>Address<input name="address" maxlength="200" value="${esc(b.address || '')}"></label>
      <div class="two2"><label>Phone<input name="phone" maxlength="40" value="${esc(b.phone || '')}"></label><label>Email<input name="email" type="email" maxlength="120" value="${esc(b.email || '')}"></label></div>
      <label>Tax / GST registration number<input name="tax_number" maxlength="40" value="${esc(b.tax_number || '')}"></label></fieldset>
    <fieldset class="cmpset"><legend>Invoicing</legend>
      <div class="two2"><label>Invoice number prefix<input name="invoice_prefix" maxlength="10" value="${esc(STORE.invoice_prefix || 'INV')}"></label><label>Default days until due<input name="invoice_due_days" type="number" min="0" max="365" value="${Number(STORE.invoice_due_days) || 14}"></label></div>
      <label>Default terms<textarea name="invoice_terms" rows="2" maxlength="1000" placeholder="e.g. Payment due within 14 days. Late balances accrue 2% monthly.">${esc(STORE.invoice_terms || '')}</textarea></label>
      <label class="check"><input type="checkbox" name="invoice_allow_partial" ${STORE.invoice_allow_partial === false ? '' : 'checked'}> Let customers pay part of an invoice online</label>
      <label>How customers can pay<textarea name="invoice_pay_info" rows="3" maxlength="1000" placeholder="e-Transfer to pay@yourshop.com, or cheque payable to…">${esc(STORE.invoice_pay_info || '')}</textarea></label></fieldset>
    <button class="btn">Save settings</button></form>
    <section class="cs" style="margin-top:20px;max-width:760px"><h3>Messaging — email &amp; text</h3>
      <p style="margin:0">${msgReady ? ':ic-check-circle: The database is connected to the sending service.' : ':ic-alert: The sending service isn’t connected yet.'} Emails and texts to customers (invoices, estimates, statements) go through two providers you control:</p>
      <ul class="plain"><li><span><b>Email</b> — <a href="https://resend.com" target="_blank" rel="noopener">Resend</a> (free tier). Add secrets <code>RESEND_API_KEY</code> and <code>FROM_EMAIL</code> (e.g. <code>${esc(theme.name || 'Gomi Insulation')} &lt;invoices@yourdomain.com&gt;</code>). Verify your domain in Resend to email any customer; until then Resend only delivers to your own address.</span></li>
        <li><span><b>Text messages</b> — <a href="https://www.twilio.com" target="_blank" rel="noopener">Twilio</a>. Add <code>TWILIO_ACCOUNT_SID</code>, <code>TWILIO_AUTH_TOKEN</code> and <code>TWILIO_FROM</code> (your Twilio number). Optional: <code>SMS_DEFAULT_COUNTRY_CODE</code> (default 1).</span></li></ul>
      <p class="muted" style="margin:0">Add secrets in Supabase → <b>Edge Functions → Secrets</b> (they’re never shown to the website). Then send yourself a test:</p>
      <form id="msgtest" class="row"><select name="channel" aria-label="Channel"><option value="email">Email</option><option value="sms">Text</option></select><input name="to" required placeholder="your email or mobile number" style="flex:1;min-width:180px"><button class="btn ghost">Send test</button></form>
      ${logHtml(msgLog)}</section>`;
  }
  if (sub === 'team') {
    const term = (q.get('search') || '').trim().replace(/[%,()]/g, '');
    let uq = sb.from('profiles').select('id,name,email,username,role,created_at').limit(300); if (term) uq = uq.or(`name.ilike.%${term}%,email.ilike.%${term}%,username.ilike.%${term}%`);
    const us = ((await uq).data || []).sort((a, b) => (a.role === 'customer') - (b.role === 'customer') || (a.name || a.email).localeCompare(b.name || b.email)), meOwner = profile.role === 'owner';
    return `<h1>Team &amp; roles</h1><p class="muted">Give people on your team the access they need — and nothing more. They sign up on the site like a customer first, then you assign a role here. These limits are enforced by the database, not just hidden menus.</p>
    <section class="cs"><h3>What each role can do</h3><ul class="plain">${Object.entries(ROLES).filter(([r]) => r !== 'customer').map(([r, d]) => `<li><span><b style="text-transform:capitalize">${r}</b> — ${esc(d.split(' — ')[1])}</span></li>`).join('')}</ul></section>
    <form id="teamsearch" class="row" style="margin:16px 0 10px;flex-wrap:nowrap"><input name="search" value="${esc(term)}" placeholder="Find a person by name, username or email…" style="flex:1;min-width:0"><button class="btn ghost">Search</button></form>
    <table><tr><th>Person</th><th>Role</th><th>Joined</th></tr>${us.map((u) => { const locked = !meOwner && (u.role === 'owner' || u.role === 'admin');
      return `<tr><td><b>${esc(u.name || u.email)}</b><br><small class="muted">${u.username ? '@' + esc(u.username) + ' · ' : ''}${esc(u.email)}${u.id === session.user.id ? ' · you' : ''}</small></td><td><select class="rolesel" data-id="${u.id}" ${locked ? 'disabled' : ''} aria-label="Role for ${esc(u.email)}">${Object.keys(ROLES).map((r) => `<option value="${r}" ${r === u.role ? 'selected' : ''} ${!meOwner && (r === 'owner' || r === 'admin') ? 'disabled' : ''}>${r}</option>`).join('')}</select></td><td>${new Date(u.created_at).toLocaleDateString()}</td></tr>`; }).join('')}</table>
    ${meOwner ? '' : '<p class="muted">Only an owner can create or change owners and admins.</p>'}`;
  }
  if (sub === 'activity') {
    const ent = q.get('entity') || '', ents = ['order', 'product', 'invoice', 'purchase_order', 'user', 'settings'];
    let aq = sb.from('audit_log').select('*').order('id', { ascending: false }).limit(200); if (ent) aq = aq.eq('entity', ent);
    const rows = (await aq).data || [];
    return `<h1>Activity log</h1><p class="muted">Who changed what — orders, products and prices, invoices and payments, stock receipts, roles and settings.</p>
    <div class="chips"><a class="chip ${!ent ? 'on' : ''}" href="#/admin/activity">Everything</a>${ents.map((e) => `<a class="chip ${ent === e ? 'on' : ''}" href="#/admin/activity?entity=${e}">${e.replace('_', ' ')}</a>`).join('')}</div>
    ${rows.length ? `<table><tr><th>When</th><th>Who</th><th>What</th></tr>${rows.map((a) => `<tr><td>${dateOf(a.created_at)}</td><td>${esc(a.actor)}</td><td>${fmtAudit(a)}</td></tr>`).join('')}</table>` : '<p class="muted">Nothing recorded yet.</p>'}`;
  }
  if (sub === 'invoices' && id === 'recurring' && !extra) {
    if (can('invoices.manage')) await sb.rpc('run_recurring_invoices');
    const rs = (await sb.from('recurring_invoices').select('*').order('id', { ascending: false })).data || [], mng = can('invoices.manage');
    const every = (r) => `Every ${r.every > 1 ? r.every + ' ' : ''}${{ weekly: 'week', monthly: 'month', quarterly: 'quarter', yearly: 'year' }[r.frequency]}${r.every > 1 ? 's' : ''}`;
    return `<div class="dashhead"><div><h1 style="margin:0">Recurring invoices</h1><p class="muted" style="margin:2px 0 0">Invoices that create themselves on a schedule (checked every morning).</p></div><div class="row"><a class="btn ghost" href="#/admin/invoices">← Invoices</a>${mng ? '<button class="btn ghost" id="runrec" type="button">Run due now</button><a class="btn" href="#/admin/invoices/recurring/new">+ New recurring invoice</a>' : ''}</div></div>
    ${rs.length ? `<table><tr><th>Name</th><th>Customer</th><th>Schedule</th><th>Next invoice</th><th>Ends</th><th>Sent automatically</th><th>Invoices made</th><th></th></tr>${rs.map((r) => `<tr><td><b>${esc(r.name)}</b>${r.active ? '' : ' <span class="status">paused</span>'}</td><td>${esc(r.customer_name)}</td><td>${every(r)}</td><td>${r.active ? esc(r.next_run) : '—'}</td><td>${esc(r.end_date || 'never')}</td><td>${r.auto_send ? 'Yes' : 'No (drafts)'}</td><td>${r.runs}</td>
      <td>${mng ? `<a href="#/admin/invoices/recurring/${r.id}">Edit</a> · <button class="link togrec" data-id="${r.id}" data-on="${r.active}" style="color:var(--brand)">${r.active ? 'Pause' : 'Resume'}</button> · <button class="link delrec" data-id="${r.id}" style="color:var(--err)">Delete</button>` : ''}</td></tr>`).join('')}</table>` : '<p class="muted">No recurring invoices yet. Use them for retainers, maintenance contracts or monthly supply orders.</p>'}`;
  }
  if (sub === 'invoices' && id === 'recurring') return editorPage('recurring', extra);
  if (sub === 'invoices' && (id === 'new' || extra === 'edit')) return editorPage('invoice', id, q);
  if (sub === 'estimates' && (id === 'new' || extra === 'edit')) return editorPage('estimate', id, q);
  if (sub === 'estimates' && id) {
    const [er, ir] = await Promise.all([sb.from('estimates').select('*').eq('id', id).single(), sb.from('estimate_items').select('*').eq('estimate_id', id).order('sort')]);
    const e = er.data, mng = can('invoices.manage'), link = `${location.origin}${location.pathname}#/estimate/${e.id}?k=${e.view_key}`;
    const ready = mng ? (await sb.rpc('messaging_ready')).data === true : true, logs = (await sb.from('message_log').select('*').eq('kind', 'estimate').eq('ref_id', e.id).order('id', { ascending: false }).limit(8)).data || [];
    return `<p><a href="#/admin/estimates">← All estimates</a></p>${mng ? `<div class="row noprint" style="margin-bottom:12px">${['draft', 'sent'].includes(e.status) ? `<a class="btn ghost" href="#/admin/estimates/${e.id}/edit">:ic-edit: Edit</a>` : ''}
      ${e.status === 'draft' ? '<button class="btn" id="opensend" type="button">:ic-mail: Send…</button><button class="btn ghost" data-estact="sent">Mark as sent (without sending)</button>' : ''}${e.status === 'sent' ? '<button class="btn" id="opensend" type="button">:ic-mail: Send / re-send…</button><button class="btn ghost" data-estact="accepted">Mark accepted</button><button class="btn ghost" data-estact="declined">Mark declined</button>' : ''}
      ${e.status !== 'converted' ? '<button class="btn" id="estconvert" style="background:var(--ok)">→ Convert to invoice</button>' : `<a class="btn ghost" href="#/admin/invoices/${e.invoice_id}">View invoice</a>`}${e.status !== 'converted' ? '<button class="btn ghost" id="estdel" style="color:var(--err)">Delete</button>' : ''}<button class="btn ghost" id="printbtn" type="button">:ic-print: Print</button></div>
      ${['draft', 'sent'].includes(e.status) ? sendPanel(e, 'estimate', ready, q.get('send') === '1') : ''}` : ''}
      ${invDoc(e, ir.data || [], [])}${mng ? `<section class="cs noprint" style="margin-top:14px"><h3>Delivery</h3>${logHtml(logs)}</section>` : ''}${e.status !== 'draft' ? `<div class="noprint" style="margin-top:12px"><small class="muted">Customer link (they can accept or decline there)</small><input readonly value="${esc(link)}" onclick="this.select()" style="width:100%;font-size:.85rem"></div>` : ''}`;
  }
  if (sub === 'estimates') {
    const es = (await sb.from('estimates').select('*').order('id', { ascending: false }).limit(500)).data || [], filter = q.get('status') || '', eff = (e) => (e.status === 'sent' && e.expires_on < todayStr() ? 'expired' : e.status);
    const rows = es.filter((e) => !filter || eff(e) === filter), open = es.filter((e) => e.status === 'sent' && e.expires_on >= todayStr());
    return `<div class="dashhead"><div><h1 style="margin:0">Estimates</h1><p class="muted" style="margin:2px 0 0">Send a price before the work. When the customer accepts, convert it to an invoice in one click.</p></div><div class="row"><a class="btn ghost" href="#/admin/invoices">Invoices</a>${can('invoices.manage') ? '<a class="btn" href="#/admin/estimates/new">+ New estimate</a>' : ''}</div></div>
    <div class="kpis"><div class="kpi"><span class="lbl">Awaiting answer</span><b>${open.length}</b><small class="muted">${money(open.reduce((a, e) => a + e.total_cents, 0))} quoted</small></div><div class="kpi"><span class="lbl">Accepted</span><b>${es.filter((e) => e.status === 'accepted').length}</b></div><div class="kpi"><span class="lbl">Converted to invoices</span><b>${es.filter((e) => e.status === 'converted').length}</b></div><div class="kpi"><span class="lbl">Drafts</span><b>${es.filter((e) => e.status === 'draft').length}</b></div></div>
    <div class="chips" style="margin-top:14px">${[['', 'All'], ['draft', 'Draft'], ['sent', 'Sent'], ['accepted', 'Accepted'], ['declined', 'Declined'], ['expired', 'Expired'], ['converted', 'Converted']].map(([v, l]) => `<a class="chip ${filter === v ? 'on' : ''}" href="#/admin/estimates${v ? '?status=' + v : ''}">${l}</a>`).join('')}</div>
    ${rows.length ? `<table><tr><th>Number</th><th>Customer</th><th>Issued</th><th>Valid until</th><th>Total</th><th>Status</th></tr>${rows.map((e) => { const st = eff(e); return `<tr><td><a href="#/admin/estimates/${e.id}"><b>${esc(e.number)}</b></a></td><td>${esc(e.customer_name)}</td><td>${esc(e.issue_date)}</td><td>${esc(e.expires_on)}</td><td>${money(e.total_cents)}</td><td><span class="status ${['expired', 'declined'].includes(st) ? 'cancelled' : ['accepted', 'converted'].includes(st) ? 'paid' : st}">${st}</span></td></tr>`; }).join('')}</table>` : '<p class="muted">No estimates match.</p>'}`;
  }
  if (sub === 'invoices' && id) {
    const [ir, itr, pr] = await Promise.all([sb.from('invoices').select('*').eq('id', id).single(), sb.from('invoice_items').select('*').eq('invoice_id', id).order('sort'), sb.from('invoice_payments').select('*').eq('invoice_id', id).order('id')]);
    const inv = ir.data, items = itr.data || [], pays = pr.data || [], bal = invBal(inv), mng = can('invoices.manage'), link = `${location.origin}${location.pathname}#/invoice/${inv.id}?k=${inv.view_key}`;
    const ready = mng ? (await sb.rpc('messaging_ready')).data === true : true, logs = (await sb.from('message_log').select('*').eq('kind', 'invoice').eq('ref_id', inv.id).order('id', { ascending: false }).limit(8)).data || [];
    return `<p><a href="#/admin/invoices">← All invoices</a></p>
    ${mng ? `<div class="row noprint" style="margin-bottom:12px">${inv.status === 'draft' ? `<a class="btn ghost" href="#/admin/invoices/${inv.id}/edit">:ic-edit: Edit</a><button class="btn" id="opensend" type="button">:ic-mail: Send…</button><button class="btn ghost" data-invact="sent">Mark as sent (without sending)</button>` : ''}${inv.status === 'sent' ? `<a class="btn ghost" href="#/admin/invoices/${inv.id}/edit">:ic-edit: Edit</a><button class="btn" id="opensend" type="button">:ic-mail: Send / re-send…</button>` : ''}${inv.status === 'paid' ? '<button class="btn ghost" id="opensend" type="button">:ic-mail: Send a copy…</button>' : ''}
      <button class="btn ghost dupinv" type="button">Duplicate</button>
      ${inv.status === 'void' ? '<button class="btn ghost" data-invact="draft">Reopen as draft</button>' : inv.status !== 'paid' && !inv.paid_cents ? '<button class="btn ghost" data-invact="void" style="color:var(--err)">Void</button>' : ''}${['draft', 'void'].includes(inv.status) ? '<button class="btn ghost" id="invdel" style="color:var(--err)">Delete</button>' : ''}<button class="btn ghost" id="printbtn" type="button">:ic-print: Print</button></div>
    ${inv.status === 'void' ? '' : sendPanel(inv, 'invoice', ready, q.get('send') === '1')}` : '<div class="row noprint"><button class="btn ghost" id="printbtn" type="button">:ic-print: Print</button></div>'}
    <div class="cartwrap"><div>${invDoc(inv, items, pays.map((x) => ({ ...x })))}</div><aside class="summary noprint">
      <h3>Payments</h3>${pays.length ? pays.map((x) => `<div class="addr"><b>${money(x.amount_cents)}</b> · ${esc(x.method || 'payment')} · ${esc(x.paid_on)}${x.reference ? `<br><small class="muted">Ref ${esc(x.reference)}</small>` : ''}${mng ? `<br><button class="link delpay" data-id="${x.id}" style="color:var(--err)">Remove</button>` : ''}</div>`).join('') : '<p class="muted" style="margin:0">No payments yet.</p>'}
      ${mng && inv.status !== 'void' && bal > 0 ? `<form id="payform" class="stack"><label>Amount ($)<input name="amount" type="number" step="0.01" min="0.01" max="${(bal / 100).toFixed(2)}" value="${(bal / 100).toFixed(2)}" required></label><label>Method<select name="method"><option>E-transfer</option><option>Cheque</option><option>Cash</option><option>Card</option><option>Bank transfer</option><option>Other</option></select></label>
      <label>Reference<input name="ref" maxlength="80"></label><label>Date received<input name="paid" type="date" value="${todayStr()}"></label><button class="btn">Record payment</button></form>` : ''}
      ${mng ? `<h3 style="margin-bottom:0">Delivery</h3>${logHtml(logs)}` : ''}
      ${inv.status !== 'draft' ? `<div><small class="muted">Customer link</small><input readonly value="${esc(link)}" onclick="this.select()" style="width:100%;font-size:.8rem"></div>` : ''}</aside></div>`;
  }
  if (sub === 'invoices') {
    if (can('invoices.manage')) await sb.rpc('run_recurring_invoices');
    const [ir, pr] = await Promise.all([sb.from('invoices').select('*').order('id', { ascending: false }).limit(500), sb.from('invoice_payments').select('amount_cents,paid_on').gte('paid_on', addDays(todayStr(), -30))]);
    const all = ir.data || [], filter = q.get('status') || '', term = (q.get('search') || '').trim().toLowerCase();
    const rows = all.filter((i) => (!filter || invEff(i) === filter) && (!term || i.number.toLowerCase().includes(term) || i.customer_name.toLowerCase().includes(term)));
    const open = all.filter((i) => i.status === 'sent' && invBal(i) > 0), t0 = todayStr(), past = (i) => Math.floor((new Date(t0) - new Date(i.due_date)) / 864e5);
    const bucket = (lo, hi) => open.filter((i) => past(i) >= lo && past(i) <= hi).reduce((a, i) => a + invBal(i), 0);
    const aging = [['Current', open.filter((i) => past(i) <= 0).reduce((a, i) => a + invBal(i), 0)], ['1–30 days', bucket(1, 30)], ['31–60', bucket(31, 60)], ['61–90', bucket(61, 90)], ['90+', bucket(91, 99999)]];
    const link = (st) => `#/admin/invoices${st ? '?status=' + st : ''}`;
    return `<div class="dashhead"><h1 style="margin:0">Invoices</h1><div class="row"><a class="btn ghost" href="#/admin/estimates">Estimates</a><a class="btn ghost" href="#/admin/invoices/recurring">Recurring</a><a class="btn ghost" href="#/admin/tax">Tax report</a>${can('invoices.manage') ? '<a class="btn" href="#/admin/invoices/new">+ New invoice</a>' : ''}</div></div>
    <div class="kpis"><div class="kpi"><span class="lbl">Outstanding</span><b>${money(open.reduce((a, i) => a + invBal(i), 0))}</b><small class="muted">${open.length} open invoice${open.length === 1 ? '' : 's'}</small></div><div class="kpi"><span class="lbl">Overdue</span><b class="${aging.slice(1).some((a) => a[1]) ? 'down' : ''}">${money(aging.slice(1).reduce((a, x) => a + x[1], 0))}</b></div>
      <div class="kpi"><span class="lbl">Paid in last 30 days</span><b>${money((pr.data || []).reduce((a, x) => a + x.amount_cents, 0))}</b></div><div class="kpi"><span class="lbl">Drafts</span><b>${all.filter((i) => i.status === 'draft').length}</b></div></div>
    <h2>Receivables aging</h2><table class="aging"><tr>${aging.map((a) => `<th>${a[0]}</th>`).join('')}</tr><tr>${aging.map((a) => `<td><b>${money(a[1])}</b></td>`).join('')}</tr></table>
    <div class="chips" style="margin-top:14px">${[['', 'All'], ['draft', 'Draft'], ['sent', 'Sent'], ['overdue', 'Overdue'], ['paid', 'Paid'], ['void', 'Void']].map(([v, l]) => `<a class="chip ${filter === v ? 'on' : ''}" href="${link(v)}">${l}</a>`).join('')}</div>
    <div class="row" style="margin-bottom:10px"><form id="invsearch" class="row" style="flex:1;flex-wrap:nowrap"><input name="search" value="${esc(q.get('search') || '')}" placeholder="Search by number or customer…" style="flex:1;min-width:0"><button class="btn ghost">Search</button></form><button class="btn ghost" id="invcsv" type="button">:ic-download: CSV</button>${can('invoices.manage') && rows.some((i) => invEff(i) === 'overdue' && i.customer_email) ? `<button class="btn" id="remindall" type="button" data-ids="${rows.filter((i) => invEff(i) === 'overdue' && i.customer_email).map((i) => i.id).join(',')}">Remind all overdue</button>` : ''}</div>
    ${rows.length ? `<table id="invtable"><tr><th>Number</th><th>Customer</th><th>Issued</th><th>Due</th><th>Total</th><th>Balance</th><th>Late</th><th>Status</th></tr>${rows.map((i) => { const e = invEff(i); return `<tr data-csv='${esc(JSON.stringify([i.number, i.customer_name, i.issue_date, i.due_date, (i.total_cents / 100).toFixed(2), (invBal(i) / 100).toFixed(2), e]))}'><td><a href="#/admin/invoices/${i.id}"><b>${esc(i.number)}</b></a></td><td>${esc(i.customer_name)}</td><td>${esc(i.issue_date)}</td><td>${esc(i.due_date)}</td><td>${money(i.total_cents)}</td><td>${money(invBal(i))}</td><td>${e === 'overdue' ? `<b class="down">${past(i)}d</b>` : ''}</td><td><span class="status ${e === 'overdue' ? 'cancelled' : e}">${e}</span>${e === 'overdue' && can('invoices.manage') ? ` <a class="link" href="#/admin/invoices/${i.id}?send=1">Remind</a>` : ''}</td></tr>`; }).join('')}</table>` : '<p class="muted">No invoices match. Create your first invoice with “New invoice”.</p>'}`;
  }
  if (sub === 'suppliers') {
    const sups = (await sb.from('suppliers').select('*').order('name')).data || [], mng = can('purchasing.manage');
    const f = (s) => `<form class="supform stack" data-id="${s.id || ''}"><label>Name<input name="name" value="${esc(s.name || '')}" required maxlength="120"></label><div class="two2"><label>Contact<input name="contact_name" value="${esc(s.contact_name || '')}"></label><label>Phone<input name="phone" value="${esc(s.phone || '')}"></label></div>
      <label>Email<input name="email" type="email" value="${esc(s.email || '')}"></label><label>Notes<textarea name="notes" rows="2">${esc(s.notes || '')}</textarea></label><label class="check"><input type="checkbox" name="active" ${s.active === false ? '' : 'checked'}> Active</label><button class="btn">${s.id ? 'Save' : 'Add supplier'}</button></form>`;
    return `<h1>Suppliers</h1><p><a class="btn ghost" href="#/admin/purchasing">← Purchasing</a></p>${sups.map((s) => `<details class="cs" style="margin-bottom:10px"><summary><b>${esc(s.name)}</b>${s.active ? '' : ' <span class="muted">(inactive)</span>'} <small class="muted">${esc([s.contact_name, s.email, s.phone].filter(Boolean).join(' · '))}</small></summary>${mng ? f(s) : ''}</details>`).join('') || '<p class="muted">No suppliers yet.</p>'}${mng ? `<section class="cs"><h3>Add a supplier</h3>${f({})}</section>` : ''}`;
  }
  if (sub === 'purchasing' && id) {
    const isNew = id === 'new';
    const [sups, locs, prods, ex, exItems] = await Promise.all([sb.from('suppliers').select('id,name').eq('active', true).order('name'), sb.from('locations').select('id,name,is_default').eq('active', true).order('is_default', { ascending: false }), sb.from('products').select('id,name,cost_cents,stock,reorder_point,reorder_qty').order('name'),
      isNew ? { data: null } : sb.from('purchase_orders').select('*').eq('id', id).single(), isNew ? { data: [] } : sb.from('purchase_order_items').select('*').eq('po_id', id)]);
    const P = prods.data || []; let lines = (exItems.data || []).map((x) => ({ product_id: x.product_id, qty: x.qty, unit_cost: x.unit_cost_cents / 100 }));
    if (isNew && q.get('from') === 'low') lines = P.filter((x) => x.stock <= x.reorder_point).map((x) => ({ product_id: x.id, qty: x.reorder_qty || Math.max(x.reorder_point * 2 - x.stock, 1), unit_cost: x.cost_cents / 100 }));
    if (isNew && !lines.length) lines = [{ product_id: '', qty: 1, unit_cost: 0 }];
    PO = { id: isNew ? null : Number(id), status: ex.data?.status || 'draft', supplier_id: ex.data?.supplier_id || '', location_id: ex.data?.location_id || (locs.data?.[0]?.id ?? ''), expected_at: ex.data?.expected_at || '', notes: ex.data?.notes || '', lines, prods: P };
    const ro = !['draft', 'ordered'].includes(PO.status), sname = (sups.data || []).find((x) => x.id === PO.supplier_id)?.name, lname = (locs.data || []).find((x) => x.id === PO.location_id)?.name;
    return `<h1>${isNew ? 'New purchase order' : `Purchase order PO-${id} <span class="status ${PO.status === 'received' ? 'paid' : PO.status === 'cancelled' ? 'cancelled' : 'pending'}">${PO.status}</span>`}</h1><p><a href="#/admin/purchasing">← All purchase orders</a></p>
    ${ro ? `<section class="cs"><p>Supplier: <b>${esc(sname || '—')}</b> · Delivered to: <b>${esc(lname || '—')}</b>${PO.expected_at ? ` · Expected ${esc(PO.expected_at)}` : ''}${ex.data?.received_at ? ` · Received ${dateOf(ex.data.received_at)}` : ''}</p>
      <table>${'<tr><th>Product</th><th>Qty</th><th>Unit cost</th><th>Line total</th></tr>'}${lines.map((l) => `<tr><td>${esc(P.find((x) => x.id === l.product_id)?.name || '')}</td><td>${l.qty}</td><td>${money(Math.round(l.unit_cost * 100))}</td><td>${money(Math.round(l.qty * l.unit_cost * 100))}</td></tr>`).join('')}</table>${PO.notes ? `<p class="muted">${esc(PO.notes)}</p>` : ''}</section>` : `<div class="invedit">
    <section class="cs"><div class="two2"><label>Supplier<select id="po_sup"><option value="">— choose —</option>${(sups.data || []).map((x) => `<option value="${x.id}" ${x.id === PO.supplier_id ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select></label><label>Deliver to (stock goes here)<select id="po_loc">${(locs.data || []).map((x) => `<option value="${x.id}" ${x.id === PO.location_id ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select></label></div>
      <div class="two2"><label>Expected on<input id="po_exp" type="date" value="${esc(PO.expected_at)}"></label><label>Notes<input id="po_notes" value="${esc(PO.notes)}" maxlength="500"></label></div></section>
    <section class="cs"><h3>Items</h3><table class="invlines"><tr><th>Product</th><th>Qty</th><th>Unit cost ($)</th><th class="r">Line total</th><th></th></tr><tbody id="po_lines"></tbody></table><div class="row"><button type="button" class="btn ghost" id="po_add">+ Add line</button><span id="po_total" style="margin-left:auto;font-weight:700"></span></div></section>
    <div class="row"><button class="btn" id="po_save" type="button">Save</button>${PO.id ? '<button class="btn ghost" id="po_order" type="button">Mark as ordered</button><button class="btn" id="po_receive" type="button" style="background:var(--ok)">:ic-check: Receive stock</button><button class="btn ghost" id="po_cancel" type="button" style="color:var(--err)">Cancel PO</button>' : ''}</div></div>`}`;
  }
  if (sub === 'purchasing') {
    const [pos, sups, locs, items, prods] = await Promise.all([sb.from('purchase_orders').select('*').order('id', { ascending: false }).limit(200), sb.from('suppliers').select('id,name'), sb.from('locations').select('id,name'), sb.from('purchase_order_items').select('po_id,qty,unit_cost_cents'), sb.from('products').select('id,name,stock,reorder_point,reorder_qty,cost_cents').eq('active', true).order('stock')]);
    const sn = Object.fromEntries((sups.data || []).map((x) => [x.id, x.name])), ln = Object.fromEntries((locs.data || []).map((x) => [x.id, x.name])), tot = {}, cnt = {}; (items.data || []).forEach((x) => { tot[x.po_id] = (tot[x.po_id] || 0) + x.qty * x.unit_cost_cents; cnt[x.po_id] = (cnt[x.po_id] || 0) + 1; });
    const low = (prods.data || []).filter((x) => x.stock <= x.reorder_point);
    return `<div class="dashhead"><h1 style="margin:0">Purchasing</h1><div class="row"><a class="btn ghost" href="#/admin/suppliers">Suppliers</a>${can('purchasing.manage') ? '<a class="btn" href="#/admin/purchasing/new">+ New purchase order</a>' : ''}</div></div>
    <section class="cs"><h3>Reorder suggestions ${low.length ? `<span class="dot">${low.length}</span>` : ''}</h3>${low.length ? `<table><tr><th>Product</th><th>In stock</th><th>Reorder at</th><th>Suggested qty</th></tr>${low.map((x) => `<tr><td><a href="#/admin/products/${x.id}">${esc(x.name)}</a></td><td class="${x.stock === 0 ? 'down' : ''}">${x.stock}</td><td>${x.reorder_point}</td><td>${x.reorder_qty || Math.max(x.reorder_point * 2 - x.stock, 1)}</td></tr>`).join('')}</table>${can('purchasing.manage') ? '<a class="btn" href="#/admin/purchasing/new?from=low">Create a purchase order from these</a>' : ''}` : '<p class="muted" style="margin:0">Nothing is below its reorder point. :ic-check-circle: Set each product’s reorder point in the product editor.</p>'}</section>
    <h2>Purchase orders</h2>${(pos.data || []).length ? `<table><tr><th>PO</th><th>Supplier</th><th>Deliver to</th><th>Items</th><th>Cost</th><th>Expected</th><th>Status</th></tr>${pos.data.map((x) => `<tr><td><a href="#/admin/purchasing/${x.id}"><b>PO-${x.id}</b></a></td><td>${esc(sn[x.supplier_id] || '—')}</td><td>${esc(ln[x.location_id] || '—')}</td><td>${cnt[x.id] || 0}</td><td>${money(Math.round(tot[x.id] || 0))}</td><td>${esc(x.expected_at || '')}</td><td><span class="status ${x.status === 'received' ? 'paid' : x.status === 'cancelled' ? 'cancelled' : 'pending'}">${x.status}</span></td></tr>`).join('')}</table>` : '<p class="muted">No purchase orders yet.</p>'}`;
  }
  if (sub === 'statements' && id) {
    const key = decodeURIComponent(id), all = (await sb.from('invoices').select('*').in('status', ['sent', 'paid']).limit(2000)).data || [];
    const mine = all.filter((i) => custKey(i) === key); if (!mine.length) return '<h1>Statement</h1><p class="muted">No sent invoices for this customer yet.</p><p><a class="btn ghost" href="#/admin/statements">← All customers</a></p>';
    const pays = ((await sb.from('invoice_payments').select('*').in('invoice_id', mine.map((i) => i.id)).order('paid_on')).data || []), num = Object.fromEntries(mine.map((i) => [i.id, i.number]));
    const fromQ = q.get('from') || addDays(todayStr(), -90), from = fromQ === 'all' ? '0000-00-00' : fromQ;
    const ledger = [...mine.map((i) => ({ date: i.issue_date, ref: i.number, text: 'Invoice ' + i.number, debit: i.total_cents, credit: 0, ord: 0 })), ...pays.map((x) => ({ date: x.paid_on, ref: num[x.invoice_id], text: `Payment received${x.method ? ' — ' + x.method : ''} (${num[x.invoice_id]})`, debit: 0, credit: x.amount_cents, ord: 1 }))].sort((a, b) => a.date.localeCompare(b.date) || a.ord - b.ord);
    const opening = ledger.filter((l) => l.date < from).reduce((a, l) => a + l.debit - l.credit, 0); let run = opening;
    const rows = ledger.filter((l) => l.date >= from).map((l) => { run += l.debit - l.credit; return { ...l, bal: run }; });
    const open = mine.filter((i) => i.status === 'sent' && invBal(i) > 0), totalDue = open.reduce((a, i) => a + invBal(i), 0), c = mine[0], b = STORE.biz || {};
    STMT = { cid: c.customer_id || null, mail: c.customer_email || '', name: c.customer_name };
    return `<p class="noprint"><a href="#/admin/statements">← All customers</a></p><div class="row noprint" style="margin-bottom:12px"><label class="muted" style="display:flex;gap:8px;align-items:center">From <input id="stmtfrom" type="date" value="${fromQ === 'all' ? '' : fromQ}"></label><a class="btn ghost" href="#/admin/statements/${encodeURIComponent(key)}?from=all">All time</a>
      ${can('invoices.manage') && (c.customer_id || c.customer_email) ? '<button class="btn ghost" id="sendstmt" type="button">:ic-mail: Email statement (open invoices)</button>' : ''}<button class="btn ghost" id="printbtn" type="button">:ic-print: Print</button></div>
    <div class="invdoc"><div class="invtop"><div><h2 style="margin:0">${esc(b.legal_name || theme.name || 'Gomi Insulation')}</h2><p class="muted" style="margin:4px 0 0">${[b.address, b.phone, b.email].filter(Boolean).map(esc).join('<br>')}</p></div><div class="invmeta"><h1 style="margin:0">STATEMENT</h1><table><tr><td>Date</td><td><b>${todayStr()}</b></td></tr><tr><td>Balance due</td><td><b>${money(totalDue)}</b></td></tr></table></div></div>
      <div class="billto"><small class="muted">CUSTOMER</small><br><b>${esc(c.customer_name)}</b>${c.customer_email ? '<br>' + esc(c.customer_email) : ''}</div>
      <table class="invitems"><tr><th>Date</th><th>Details</th><th class="r">Charges</th><th class="r">Payments</th><th class="r">Balance</th></tr>${fromQ !== 'all' ? `<tr><td></td><td><i>Balance brought forward</i></td><td></td><td></td><td class="r">${money(opening)}</td></tr>` : ''}
      ${rows.map((l) => `<tr><td>${esc(l.date)}</td><td>${esc(l.text)}</td><td class="r">${l.debit ? money(l.debit) : ''}</td><td class="r">${l.credit ? money(l.credit) : ''}</td><td class="r">${money(l.bal)}</td></tr>`).join('') || '<tr><td colspan="5" class="muted">No activity in this period.</td></tr>'}</table>
      ${open.length ? `<h3 style="margin-bottom:6px">Open invoices</h3><table class="invitems"><tr><th>Invoice</th><th>Due</th><th class="r">Balance</th></tr>${open.map((i) => `<tr><td>${esc(i.number)}</td><td>${esc(i.due_date)}${i.due_date < todayStr() ? ' <b style="color:#b42318">overdue</b>' : ''}</td><td class="r">${money(invBal(i))}</td></tr>`).join('')}</table>
      <table class="aging"><tr>${ageBuckets(open).map((a) => `<th>${a[0]}</th>`).join('')}</tr><tr>${ageBuckets(open).map((a) => `<td><b>${money(a[1])}</b></td>`).join('')}</tr></table>` : '<p><b>Nothing is owing — thank you!</b></p>'}
      <dl class="totals" style="margin-left:auto"><dt><b>Total due</b></dt><dd><b style="font-size:1.2rem">${money(totalDue)}</b></dd></dl>${totalDue > 0 && STORE.invoice_pay_info ? `<div class="trackbox"><span style="white-space:pre-wrap"><b>How to pay</b><br>${esc(STORE.invoice_pay_info)}</span></div>` : ''}</div>`;
  }
  if (sub === 'tax') {
    const since = new Date(); since.setMonth(since.getMonth() - 11, 1); const s0 = since.toISOString().slice(0, 10);
    const [orR, ivR] = await Promise.all([sb.from('orders').select('created_at,tax_cents,tax_label,total_cents').neq('status', 'cancelled').gt('tax_cents', 0).gte('created_at', s0), sb.from('invoices').select('issue_date,tax_cents,total_cents,status').in('status', ['sent', 'paid']).gt('tax_cents', 0).gte('issue_date', s0)]);
    const by = {}; const add = (m, k, v, t) => { const r = (by[m] = by[m] || { o: 0, i: 0, sales: 0 }); r[k] += v; r.sales += t; };
    (orR.data || []).forEach((o) => add(o.created_at.slice(0, 7), 'o', o.tax_cents, o.total_cents - o.tax_cents)); (ivR.data || []).forEach((i) => add(i.issue_date.slice(0, 7), 'i', i.tax_cents, i.total_cents - i.tax_cents));
    const months = Object.keys(by).sort().reverse(), tot = months.reduce((a, m) => a + by[m].o + by[m].i, 0), q4 = {};
    months.forEach((m) => { const k = m.slice(0, 4) + ' Q' + (Math.floor((Number(m.slice(5)) - 1) / 3) + 1); q4[k] = (q4[k] || 0) + by[m].o + by[m].i; });
    return `<div class="dashhead"><h1 style="margin:0">Tax report</h1><div class="row"><a class="btn ghost" href="#/admin/invoices">← Invoices</a><button class="btn ghost" id="taxcsv" type="button">:ic-download: CSV</button></div></div>
    <p class="muted">Tax charged on online/in-store orders and on sent or paid invoices over the last 12 months. Refunds are not netted out — check Orders for refunded sales.</p>
    <div class="kpis"><div class="kpi"><span class="lbl">Tax collected (12 mo)</span><b>${money(tot)}</b></div>${Object.entries(q4).slice(0, 3).map(([k, v]) => `<div class="kpi"><span class="lbl">${k}</span><b>${money(v)}</b></div>`).join('')}</div>
    ${months.length ? `<table id="taxtable"><tr><th>Month</th><th>Sales (before tax)</th><th>Tax on orders</th><th>Tax on invoices</th><th>Total tax</th></tr>${months.map((m) => { const r = by[m]; return `<tr data-csv='${esc(JSON.stringify([m, (r.sales / 100).toFixed(2), (r.o / 100).toFixed(2), (r.i / 100).toFixed(2), ((r.o + r.i) / 100).toFixed(2)]))}'><td><b>${m}</b></td><td>${money(r.sales)}</td><td>${money(r.o)}</td><td>${money(r.i)}</td><td><b>${money(r.o + r.i)}</b></td></tr>`; }).join('')}</table>` : '<p class="muted">No taxed sales in the last 12 months.</p>'}`;
  }
  if (sub === 'statements') {
    const all = (await sb.from('invoices').select('id,number,customer_id,customer_name,customer_email,status,total_cents,paid_cents,due_date').in('status', ['sent', 'paid']).limit(2000)).data || [], g = {};
    all.forEach((i) => { const k = custKey(i), c = (g[k] = g[k] || { name: i.customer_name, email: i.customer_email, billed: 0, open: 0, overdue: 0, n: 0, oldest: '' });
      c.billed += i.total_cents; if (i.status === 'sent' && invBal(i) > 0) { c.open += invBal(i); c.n++; if (i.due_date < todayStr()) c.overdue += invBal(i); if (!c.oldest || i.due_date < c.oldest) c.oldest = i.due_date; } });
    const rows = Object.entries(g).sort((a, b) => b[1].open - a[1].open || a[1].name.localeCompare(b[1].name));
    return `<div class="dashhead"><div><h1 style="margin:0">Customer statements</h1><p class="muted" style="margin:2px 0 0">A running account of invoices and payments per customer, ready to print or email.</p></div><a class="btn ghost" href="#/admin/invoices">← Invoices</a></div>
    ${rows.length ? `<table><tr><th>Customer</th><th>Open invoices</th><th>Balance due</th><th>Overdue</th><th>Oldest due</th><th>Total billed</th></tr>${rows.map(([k, c]) => `<tr><td><a href="#/admin/statements/${encodeURIComponent(k)}"><b>${esc(c.name)}</b></a>${c.email ? `<br><small class="muted">${esc(c.email)}</small>` : ''}</td><td>${c.n}</td><td><b>${money(c.open)}</b></td><td class="${c.overdue ? 'down' : ''}">${c.overdue ? money(c.overdue) : '—'}</td><td>${esc(c.oldest || '—')}</td><td>${money(c.billed)}</td></tr>`).join('')}</table>` : '<p class="muted">No sent invoices yet.</p>'}`;
  }
  if (sub === 'expenses') {
    const [from, to] = periodRange(q.get('p') || 'this_month'), mng = can('expenses.manage');
    const rows = (await sb.from('expenses').select('*').gte('spent_on', from).lte('spent_on', to).order('spent_on', { ascending: false }).order('id', { ascending: false })).data || [];
    const byCat = {}; rows.forEach((x) => (byCat[x.category] = (byCat[x.category] || 0) + x.amount_cents)); const total = rows.reduce((a, x) => a + x.amount_cents, 0), taxPaid = rows.reduce((a, x) => a + x.tax_cents, 0);
    const used = [...new Set([...EXP_CATS, ...rows.map((x) => x.category)])];
    return `<div class="dashhead"><div><h1 style="margin:0">Expenses</h1><p class="muted" style="margin:2px 0 0">Record what the business spends. Together with sales and product costs this drives your profit &amp; loss report.</p></div><div class="row"><a class="btn ghost" href="#/admin/profit">:ic-chart: Profit &amp; loss</a><button class="btn ghost" id="expcsv" type="button">:ic-download: CSV</button></div></div>
    ${mng ? `<details class="cs" id="expadd" ${rows.length ? '' : 'open'}><summary><b>+ Add an expense</b></summary><form id="expform" class="stack" style="margin-top:12px"><div class="two2"><label>Date<input name="spent_on" type="date" value="${todayStr()}" required></label><label>Vendor<input name="vendor" maxlength="120" placeholder="Who you paid"></label></div>
      <div class="two2"><label>Category<input name="category" list="expcats" required maxlength="60" placeholder="Choose or type your own"></label><datalist id="expcats">${used.map((c) => `<option value="${esc(c)}">`).join('')}</datalist><label>Paid with<select name="payment_method"><option value="">—</option><option>Card</option><option>Cash</option><option>Bank transfer</option><option>Cheque</option><option>Other</option></select></label></div>
      <div class="two2"><label>Total amount ($) <small class="muted">including tax</small><input name="amount" type="number" step="0.01" min="0.01" required></label><label>Of which sales tax ($)<input name="tax" type="number" step="0.01" min="0" value="0"></label></div>
      <label>Description<input name="description" maxlength="500"></label><label>Receipt (photo or PDF, optional)<input name="receipt" type="file" accept="image/jpeg,image/png,image/webp,application/pdf"></label><button class="btn">Save expense</button></form></details>` : ''}
    <div class="row" style="margin:14px 0 0;justify-content:space-between">${periodBar('#/admin/expenses', q)}</div>
    <div class="kpis"><div class="kpi"><span class="lbl">Total spent</span><b>${money(total)}</b><small class="muted">${rows.length} expense${rows.length === 1 ? '' : 's'}</small></div><div class="kpi"><span class="lbl">Sales tax paid</span><b>${money(taxPaid)}</b></div><div class="kpi"><span class="lbl">Net of tax</span><b>${money(total - taxPaid)}</b></div></div>
    ${Object.keys(byCat).length ? `<h2>By category</h2>${Object.entries(byCat).sort((a, b) => b[1] - a[1]).map(([c, v]) => `<div class="locbar"><span>${esc(c)}</span><div class="progress"><i style="width:${v / total * 100}%"></i></div><b>${money(v)}</b></div>`).join('')}` : ''}
    <h2>Expenses</h2>${rows.length ? `<table id="exptable"><tr><th>Date</th><th>Vendor</th><th>Category</th><th>Description</th><th>Amount</th><th>Tax</th><th></th></tr>${rows.map((x) => `<tr data-csv='${esc(JSON.stringify([x.spent_on, x.vendor, x.category, x.description, (x.amount_cents / 100).toFixed(2), (x.tax_cents / 100).toFixed(2), x.payment_method]))}'><td>${esc(x.spent_on)}</td><td>${esc(x.vendor)}</td><td>${esc(x.category)}</td><td>${esc(x.description)}</td><td><b>${money(x.amount_cents)}</b></td><td>${x.tax_cents ? money(x.tax_cents) : ''}</td>
      <td>${x.receipt_path ? `<button class="link viewrec" data-path="${esc(x.receipt_path)}" style="color:var(--brand)">Receipt</button>` : ''}${mng ? ` <button class="link delexp" data-id="${x.id}" data-path="${esc(x.receipt_path)}" style="color:var(--err)">Delete</button>` : ''}</td></tr>`).join('')}</table>` : '<p class="muted">No expenses in this period.</p>'}`;
  }
  if (sub === 'profit') {
    const key = q.get('p') || 'this_month', [from, to] = key === 'custom' ? [q.get('from') || periodRange('this_month')[0], q.get('to') || periodRange('this_month')[1]] : periodRange(key), toEnd = addDays(to, 1);
    const [oR, oiR, iR, iiR, eR, pR] = await Promise.all([
      sb.from('orders').select('created_at,status,total_cents,tax_cents,refunded_cents').neq('status', 'cancelled').gte('created_at', from).lt('created_at', toEnd).limit(5000),
      sb.from('order_items').select('qty,cost_cents,orders!inner(created_at,status)').neq('orders.status', 'cancelled').gte('orders.created_at', from).lt('orders.created_at', toEnd).limit(10000),
      sb.from('invoices').select('issue_date,status,total_cents,tax_cents').in('status', ['sent', 'paid']).gte('issue_date', from).lte('issue_date', to).limit(5000),
      sb.from('invoice_items').select('qty,product_id,invoices!inner(issue_date,status)').in('invoices.status', ['sent', 'paid']).gte('invoices.issue_date', from).lte('invoices.issue_date', to).limit(10000),
      sb.from('expenses').select('spent_on,category,amount_cents,tax_cents').gte('spent_on', from).lte('spent_on', to).limit(5000), sb.from('products').select('id,cost_cents')]);
    const cost = Object.fromEntries((pR.data || []).map((x) => [x.id, x.cost_cents])), mon = (d) => String(d).slice(0, 7), M = {}, bump = (d, k, v) => { const m = (M[mon(d)] = M[mon(d)] || { inc: 0, cogs: 0, exp: 0 }); m[k] += v; };
    let incO = 0, incI = 0, cogsO = 0, cogsI = 0, taxColl = 0, taxPaid = 0; const exp = {};
    (oR.data || []).forEach((o) => { const v = net(o); incO += v; taxColl += o.tax_cents || 0; bump(o.created_at, 'inc', v); });
    (oiR.data || []).forEach((i) => { const v = i.qty * (i.cost_cents || 0); cogsO += v; bump(i.orders.created_at, 'cogs', v); });
    (iR.data || []).forEach((i) => { const v = i.total_cents - (i.tax_cents || 0); incI += v; taxColl += i.tax_cents || 0; bump(i.issue_date, 'inc', v); });
    (iiR.data || []).forEach((i) => { const v = i.product_id ? Math.round(Number(i.qty) * (cost[i.product_id] || 0)) : 0; cogsI += v; bump(i.invoices.issue_date, 'cogs', v); });
    (eR.data || []).forEach((x) => { const v = x.amount_cents - x.tax_cents; exp[x.category] = (exp[x.category] || 0) + v; taxPaid += x.tax_cents; bump(x.spent_on, 'exp', v); });
    const income = incO + incI, cogs = cogsO + cogsI, gross = income - cogs, expTotal = Object.values(exp).reduce((a, v) => a + v, 0), netP = gross - expTotal, pct = (v) => (income ? Math.round(v / income * 1000) / 10 : 0);
    PNL = [['Income', ''], ['Online & in-store sales (excl. tax, after refunds)', incO], ['Invoiced sales & services (excl. tax)', incI], ['Total income', income], ['Cost of goods sold', cogs], ['Gross profit', gross], ...Object.entries(exp).sort((a, b) => b[1] - a[1]).map(([c, v]) => ['Expense: ' + c, v]), ['Total expenses', expTotal], ['Net profit', netP]].map(([a, b]) => [a, b === '' ? '' : (b / 100).toFixed(2)]);
    const months = Object.keys(M).sort(), mtr = (label, v, strong) => `<tr class="${strong ? 'pl-strong' : ''}"><td>${label}</td><td class="r">${v === '' ? '' : money(v)}</td></tr>`;
    return `<div class="dashhead"><div><h1 style="margin:0">Profit &amp; loss</h1><p class="muted" style="margin:2px 0 0">${esc(from)} to ${esc(to)}</p></div><div class="row noprint"><a class="btn ghost" href="#/admin/expenses">Expenses</a><button class="btn ghost" id="plcsv" type="button">:ic-download: CSV</button><button class="btn ghost" id="printbtn" type="button">:ic-print: Print</button></div></div>
    <div class="chips noprint">${PERIODS.map(([v, l]) => `<a class="chip ${key === v ? 'on' : ''}" href="#/admin/profit?p=${v}">${l}</a>`).join('')}</div>
    <form id="plrange" class="row noprint" style="margin-bottom:14px"><label class="muted" style="display:flex;gap:6px;align-items:center">From <input name="from" type="date" value="${from}"></label><label class="muted" style="display:flex;gap:6px;align-items:center">To <input name="to" type="date" value="${to}"></label><button class="btn ghost">Custom range</button></form>
    <div class="kpis"><div class="kpi"><span class="lbl">Income</span><b>${money(income)}</b></div><div class="kpi"><span class="lbl">Gross profit</span><b>${money(gross)}</b><small class="muted">${pct(gross)}% margin</small></div><div class="kpi"><span class="lbl">Expenses</span><b>${money(expTotal)}</b></div><div class="kpi"><span class="lbl">Net profit</span><b class="${netP < 0 ? 'down' : 'up'}">${money(netP)}</b><small class="muted">${pct(netP)}% of income</small></div></div>
    <div class="cartwrap" style="margin-top:16px"><section class="cs"><h3>Statement</h3><table class="pl"><tr><th colspan="2">Income</th></tr>${mtr('Online &amp; in-store sales <small class="muted">(excl. tax, after refunds)</small>', incO)}${mtr('Invoiced sales &amp; services <small class="muted">(excl. tax)</small>', incI)}${mtr('Total income', income, true)}
      <tr><th colspan="2">Cost of goods sold</th></tr>${mtr('Product cost of items sold', cogs)}${mtr('Gross profit', gross, true)}<tr><th colspan="2">Expenses <small class="muted">(excl. recoverable sales tax)</small></th></tr>
      ${Object.entries(exp).sort((a, b) => b[1] - a[1]).map(([c, v]) => mtr(esc(c), v)).join('') || '<tr><td colspan="2" class="muted">No expenses recorded for this period.</td></tr>'}${mtr('Total expenses', expTotal, true)}${mtr('Net profit', netP, true)}</table>
      ${cogs === 0 && income > 0 ? '<p class="muted" style="margin:8px 0 0">Tip: add a unit cost to your products so cost of goods sold (and true profit) shows up here.</p>' : ''}</section>
    <aside class="summary"><h3>Sales tax summary</h3><dl class="totals" style="margin:0"><dt>Collected from customers</dt><dd>${money(taxColl)}</dd><dt>Paid on expenses</dt><dd>${money(taxPaid)}</dd><dt><b>Net tax to remit</b></dt><dd><b>${money(taxColl - taxPaid)}</b></dd></dl><small class="muted">An estimate to help with filing — confirm with your accountant.</small></aside></div>
    ${months.length > 1 ? `<h2>By month</h2><table><tr><th>Month</th><th class="r">Income</th><th class="r">Product cost</th><th class="r">Expenses</th><th class="r">Net profit</th></tr>${months.map((m) => { const x = M[m], np = x.inc - x.cogs - x.exp; return `<tr><td>${m}</td><td class="r">${money(x.inc)}</td><td class="r">${money(x.cogs)}</td><td class="r">${money(x.exp)}</td><td class="r ${np < 0 ? 'down' : ''}"><b>${money(np)}</b></td></tr>`; }).join('')}</table>` : ''}
    <p class="muted" style="font-size:.85rem">Based on sales dated in the period (not when cash arrived), at each product's current unit cost for invoice lines linked to products.</p>`;
  }
  if (sub === 'codes') {
    const cs = (await sb.from('discount_codes').select('*').order('code')).data || [];
    const state = (c) => !c.active ? ['Off', ''] : c.expires_at && new Date(c.expires_at) < new Date() ? ['Expired', 'cancelled'] : c.max_uses && c.uses >= c.max_uses ? ['Used up', 'cancelled'] : ['Active', 'paid'];
    return `<div class="sechead"><h1 style="margin:0">Discount codes</h1><span class="muted">${cs.filter((c) => state(c)[0] === 'Active').length} active</span></div>
    <div class="tablewrap"><table><tr><th>Code</th><th>Off</th><th>Min order</th><th>Used</th><th>Expires</th><th>Status</th><th></th></tr>${cs.map((c) => { const [lab, cls] = state(c); return `<tr><td><b>${esc(c.code)}</b></td><td>${c.percent}%</td><td>${money(c.min_cents)}</td><td>${c.uses}${c.max_uses ? ' / ' + c.max_uses : ''}</td><td>${c.expires_at ? dateOf(c.expires_at) : '—'}</td><td><span class="status ${cls}">${lab}</span></td><td><button class="link togcode" data-code="${esc(c.code)}" data-active="${c.active}">${c.active ? 'Disable' : 'Enable'}</button> · <button class="link delcode" data-code="${esc(c.code)}" style="color:var(--err)">Delete</button></td></tr>`; }).join('')}</table></div>
    <section class="cs"><h3 style="margin-top:0">New code</h3><form id="cf" class="stack narrow"><div class="two2"><label>Code<input name="code" placeholder="SUMMER15" required maxlength="30" style="text-transform:uppercase"></label><label>% off<input name="percent" type="number" min="1" max="100" required></label></div>
    <div class="two2"><label>Minimum order ($)<input name="min" type="number" min="0" step="0.01" value="0"></label><label>Usage limit <small class="muted">0 = unlimited</small><input name="max_uses" type="number" min="0" value="0"></label></div>
    <label>Expires <small class="muted">optional — last day it works</small><input name="expires" type="date"></label><button class="btn">Add code</button></form></section>`;
  }
  if (sub === 'reviews') {
    const f = ['all', 'new', 'low', 'unanswered', 'hidden'].includes(q.get('f')) ? q.get('f') : 'new';
    const [rv, pr] = await Promise.all([sb.from('reviews').select('*').order('created_at', { ascending: false }).limit(300), sb.from('products').select('id,name,slug')]);
    const names = Object.fromEntries((pr.data || []).map((x) => [x.id, x])), all = rv.data || [], week = Date.now() - 7 * 864e5;
    const flt = { all: () => true, new: (r) => new Date(r.created_at).getTime() > week, low: (r) => r.rating <= 2, unanswered: (r) => !r.reply && !r.hidden, hidden: (r) => r.hidden }, rows = all.filter(flt[f]);
    const cnt = (k) => all.filter(flt[k]).length, avg = all.filter((r) => !r.hidden).length ? (all.filter((r) => !r.hidden).reduce((a, r) => a + r.rating, 0) / all.filter((r) => !r.hidden).length).toFixed(1) : '—';
    return `<div class="sechead"><h1 style="margin:0">Reviews</h1><span class="muted">Moderate and reply to customer reviews</span></div>
    <div class="kpis"><div class="kpi"><span class="lbl">Average rating</span><b>${avg}</b><small class="muted">${all.filter((r) => !r.hidden).length} visible reviews</small></div><div class="kpi"><span class="lbl">New this week</span><b>${cnt('new')}</b></div><div class="kpi"><span class="lbl">Need a reply</span><b class="${cnt('unanswered') ? 'down' : ''}">${cnt('unanswered')}</b></div><div class="kpi"><span class="lbl">Low ratings (1–2★)</span><b>${cnt('low')}</b></div></div>
    <div class="chips" style="margin-top:14px">${[['new', 'New'], ['unanswered', 'Unanswered'], ['low', 'Low ratings'], ['hidden', 'Hidden'], ['all', 'All']].map(([k, l]) => `<a class="chip ${f === k ? 'on' : ''}" href="#/admin/reviews?f=${k}">${l} (${cnt(k)})</a>`).join('')}</div>
    ${rows.length ? rows.map((r) => `<div class="review ${r.hidden ? 'hiddenrev' : ''}" style="margin-bottom:10px"><div class="revhead">${stars(r.rating)} <b>${esc(r.author)}</b>${r.verified ? ' <span class="vbadge">:ic-check-circle: Verified purchase</span>' : ''} <span class="muted">· ${ago(r.created_at)} · on <a href="#/product/${esc(names[r.product_id]?.slug || '')}">${esc(names[r.product_id]?.name || 'a product')}</a></span>${r.hidden ? ' <span class="status pending">hidden</span>' : ''}</div>${r.comment ? `<p>${esc(r.comment)}</p>` : '<p class="muted">(no comment)</p>'}${(r.photos || []).length ? `<div class="revphotos">${r.photos.filter((u) => safeUrl(u)).map((u) => `<button type="button" class="revph" data-src="${esc(u)}" aria-label="Open photo"><img src="${esc(u)}" alt="Customer photo" loading="lazy"></button>`).join('')}</div>` : ''}${r.reply ? `<div class="revreply"><b>Your reply</b><p>${esc(r.reply)}</p></div>` : ''}
      <div class="revmod"><button class="link revhide" data-id="${r.id}" data-hide="${r.hidden ? '' : '1'}">${r.hidden ? 'Show again' : 'Hide'}</button> · <button class="link revreply-btn" data-id="${r.id}" data-reply="${esc(r.reply || '')}">${r.reply ? 'Edit reply' : 'Reply'}</button></div></div>`).join('') : '<div class="emptyq">:ic-star:<p><b>No reviews here</b></p><p class="muted">Customers can review products they\'ve viewed; verified buyers get a badge.</p></div>'}`;
  }
  if (sub === 'carts') {
    const f = ['abandoned', 'active', 'recovered', 'handled'].includes(q.get('f')) ? q.get('f') : 'abandoned', hourAgo = Date.now() - 36e5;
    const all = (await sb.from('carts').select('*').order('updated_at', { ascending: false }).limit(300)).data || [];
    const cls = (c) => c.recovered ? 'recovered' : c.handled ? 'handled' : new Date(c.updated_at).getTime() < hourAgo ? 'abandoned' : 'active', counts = {}; all.forEach((c) => (counts[cls(c)] = (counts[cls(c)] || 0) + 1));
    const ab = all.filter((c) => cls(c) === 'abandoned'), rec = all.filter((c) => c.recovered), rows = all.filter((c) => cls(c) === f);
    const sum = (a) => a.reduce((x, c) => x + c.total_cents, 0), link = location.origin + location.pathname + '#/cart';
    return `<div class="sechead"><h1 style="margin:0">Abandoned carts</h1><span class="muted">Customers who added items and didn't order</span></div>
    <div class="kpis"><div class="kpi"><span class="lbl">Waiting now</span><b>${ab.length}</b><small class="muted">${money(sum(ab))} left behind</small></div><div class="kpi"><span class="lbl">Still shopping</span><b>${counts.active || 0}</b><small class="muted">active in the last hour</small></div><div class="kpi"><span class="lbl">Came back &amp; ordered</span><b>${rec.length}</b><small class="muted">${money(sum(rec))}</small></div></div>
    <p class="howto">:ic-clock: <span>We keep a copy of a cart only when we can contact the customer — they're logged in, or typed their email at checkout. You get a notification when a cart has been idle for 2 hours. Carts are removed when the customer orders or empties them.</span></p>
    <div class="chips">${[['abandoned', 'Abandoned'], ['active', 'Still shopping'], ['recovered', 'Ordered'], ['handled', 'Handled']].map(([k, l]) => `<a class="chip ${f === k ? 'on' : ''}" href="#/admin/carts?f=${k}">${l}${counts[k] ? ` (${counts[k]})` : ''}</a>`).join('')}</div>
    ${rows.length ? `<div class="tablewrap"><table><tr><th>Customer</th><th>Items</th><th>Value</th><th>Last activity</th><th></th></tr>${rows.map((c) => { const items = (c.items || []), who = c.name || c.email;
      const body = `Hi${c.name ? ' ' + c.name.split(' ')[0] : ''},\n\nYou left ${c.item_count} item${c.item_count === 1 ? '' : 's'} in your cart at ${theme.name || 'Gomi Insulation'}. Your cart is saved: ${link}\n\nIf you have questions about quantities, delivery or trade pricing, just reply to this email.\n\nThanks!`;
      return `<tr><td><b>${esc(who)}</b>${c.name && c.email ? `<small class="muted" style="display:block">${esc(c.email)}</small>` : ''}${c.phone ? `<small class="muted" style="display:block">${esc(c.phone)}</small>` : ''}</td><td>${items.slice(0, 3).map((i) => `${i.qty} × ${esc(i.name)}`).join('<br>')}${items.length > 3 ? `<br><small class="muted">+${items.length - 3} more</small>` : ''}</td><td><b>${money(c.total_cents)}</b></td><td>${ago(c.updated_at)}</td>
        <td><div class="row" style="flex-wrap:nowrap;gap:6px">${c.email ? `<a class="btn ghost" href="mailto:${esc(c.email)}?subject=${encodeURIComponent('You left something in your cart')}&body=${encodeURIComponent(body)}">:ic-mail: Email</a>` : ''}${c.user_id ? `<a class="btn ghost" href="#/messages/new?to=${c.user_id}">:ic-chat:</a>` : ''}${f === 'abandoned' && can('orders.manage') ? `<button class="btn ghost cartdone" data-id="${c.id}" title="Mark as handled">:ic-check:</button>` : ''}${can('orders.manage') ? `<button class="ibtn danger cartdel" data-id="${c.id}" aria-label="Delete">:ic-x:</button>` : ''}</div></td></tr>`; }).join('')}</table></div>` : `<div class="emptyq">:ic-cart:<p><b>Nothing here</b></p><p class="muted">${f === 'abandoned' ? 'No abandoned carts right now.' : 'No carts in this list.'}</p></div>`}`;
  }
  if (sub === 'spam') {
    const [log, doms, rev] = await Promise.all([sb.from('spam_log').select('*').order('id', { ascending: false }).limit(60), sb.from('blocked_email_domains').select('domain').order('domain'), sb.rpc('spam_review')]);
    const logs = log.data || [], day = Date.now() - 864e5, flagged = (rev.data || []).filter((u) => u.flags.length && !u.orders);
    return `<div class="sechead"><h1 style="margin:0">Spam &amp; safety</h1><span class="muted">What's protecting your store</span></div>
    <div class="kpis"><div class="kpi"><span class="lbl">Bot form posts blocked (24h)</span><b>${logs.filter((l) => new Date(l.created_at).getTime() > day).length}</b></div><div class="kpi"><span class="lbl">Accounts to review</span><b class="${flagged.length ? 'down' : ''}">${flagged.length}</b></div><div class="kpi"><span class="lbl">Blocked email domains</span><b>${(doms.data || []).length}</b></div></div>
    <section class="cs" style="margin-top:16px"><h3 style="margin-top:0">Protections that are on</h3><ul class="checks">${[['Sign-ups', 'Disposable / temporary email domains are refused, names containing links are refused, and sign-ups are paused if 40 accounts appear in 10 minutes.'], ['Forms, quotes and reviews', 'Hidden bot trap + "too fast" check, links limited, and a cap per visitor (forms 12/h, quotes 5/h, reviews 6/h). Bot submissions are dropped silently.'], ['Orders and carts', 'Guest orders are limited to 8 per hour per visitor; cart saving is rate-limited.'], ['Messages', 'Customers can send at most 40 messages per 5 minutes. Your team is never limited.']].map(([t, d]) => `<li class="ok"><span class="ci">:ic-check-circle:</span><div><b>${t}</b><small class="muted">${d}</small></div></li>`).join('')}</ul>
      <p class="muted" style="margin-bottom:0">For the strongest protection against fake accounts, also switch on a CAPTCHA (Cloudflare Turnstile or hCaptcha) in Supabase → Authentication → Attack Protection. That needs a key from your CAPTCHA account, so it's done there, not here.</p></section>
    <div class="seogrid" style="margin-top:16px"><section class="cs"><div class="sechead"><h3 style="margin:0">New accounts</h3>${flagged.length ? `<button class="btn" id="spamdel" type="button">Delete ${flagged.length} flagged</button>` : ''}</div>
      <div class="tablewrap"><table id="spamtable"><tr><th>Account</th><th>Joined</th><th>Orders</th><th>Flags</th></tr>${(rev.data || []).slice(0, 80).map((u) => `<tr data-id="${u.id}" data-flagged="${u.flags.length && !u.orders ? 1 : ''}"><td><b>${esc(u.name || '—')}</b><small class="muted" style="display:block">${esc(u.email)}${u.username ? ' · @' + esc(u.username) : ''}</small></td><td>${ago(u.created_at)}</td><td>${u.orders}</td><td>${u.flags.length ? u.flags.map((x) => `<span class="status pending">${esc(x)}</span>`).join(' ') : '<span class="muted">—</span>'}</td></tr>`).join('')}</table></div><p class="muted" style="margin-bottom:0">Accounts with orders are never deleted from here.</p></section>
    <div class="stack"><section class="cs"><h3 style="margin-top:0">Blocked email domains</h3><form id="domform" class="row" style="flex-wrap:nowrap"><input name="domain" placeholder="spamdomain.com" required style="flex:1;min-width:0"><button class="btn ghost">Block</button></form><div class="brandlist" style="margin-top:10px">${(doms.data || []).map((d) => `<span class="brandpill"><b>${esc(d.domain)}</b><button type="button" class="del domdel" data-d="${esc(d.domain)}" aria-label="Unblock ${esc(d.domain)}">:ic-x:</button></span>`).join('')}</div></section>
      <section class="cs"><h3 style="margin-top:0">Blocked form posts</h3>${logs.length ? `<ul class="plain">${logs.slice(0, 12).map((l) => `<li><span>${esc(l.detail)}</span><small class="muted">${ago(l.created_at)}</small></li>`).join('')}</ul>` : '<p class="muted" style="margin:0">Nothing blocked yet.</p>'}</section></div></div>`;
  }
  if (sub === 'quotes') {
    const qs = (await sb.from('quotes').select('*').order('id', { ascending: false })).data;
    return `<h1>Quote requests</h1>${qs.length ? qs.map((x) => `<aside style="margin:10px 0"><b>${esc(x.name)}</b> · <a href="mailto:${esc(x.email)}">${esc(x.email)}</a> ${esc(x.phone)} · <span class="muted">${dateOf(x.created_at)}</span><p style="white-space:pre-wrap">${esc(x.message)}</p><div class="row">${can('invoices.manage') ? `<a class="btn ghost" href="#/admin/estimates/new?name=${encodeURIComponent(x.name)}&email=${encodeURIComponent(x.email || '')}&phone=${encodeURIComponent(x.phone || '')}&note=${encodeURIComponent('Quote request: ' + String(x.message || '').slice(0, 400))}">:ic-receipt: Create estimate</a>` : ''}${x.email ? `<a class="btn ghost" href="mailto:${esc(x.email)}?subject=${encodeURIComponent('Your quote request')}">:ic-mail: Reply</a>` : ''}</div></aside>`).join('') : '<div class="emptyq">:ic-clipboard:<p><b>No quote requests yet</b></p><p class="muted">Requests from the “Get a quote” page show up here.</p></div>'}`;
  }
  if (sub === 'orders') {
    const locs = (await sb.from('locations').select('id,name').order('name')).data || [], locF = q.get('loc') || '', statusF = q.get('status') || '', term = (q.get('search') || '').trim().replace(/[%,()]/g, '');
    let oq = sb.from('orders').select('*').order('id', { ascending: false }).limit(300);
    if (locF) oq = oq.eq('location_id', locF); if (statusF) oq = oq.eq('status', statusF);
    if (term) oq = /^\d+$/.test(term) ? oq.or(`id.eq.${term},name.ilike.%${term}%,email.ilike.%${term}%`) : oq.or(`name.ilike.%${term}%,email.ilike.%${term}%`);
    const os = (await oq).data || [], lnames = Object.fromEntries(locs.map((l) => [l.id, l.name]));
    const link = (extra) => { const n = new URLSearchParams(q); Object.entries(extra).forEach(([k, v]) => (v ? n.set(k, v) : n.delete(k))); const t = n.toString(); return '#/admin/orders' + (t ? '?' + t : ''); };
    return `<h1>Orders</h1><div class="row" style="margin-bottom:10px"><form id="ordsearch" class="row" style="flex:1;min-width:220px;flex-wrap:nowrap"><input name="search" value="${esc(term)}" placeholder="Search order #, name or email…" aria-label="Search orders" style="flex:1;min-width:0"><button class="btn ghost">Search</button></form>
      <select id="ordloc" aria-label="Filter by location"><option value="">All locations</option>${locs.map((l) => `<option value="${l.id}" ${String(l.id) === locF ? 'selected' : ''}>${esc(l.name)}</option>`).join('')}</select><button class="btn ghost" id="csv">:ic-download: CSV</button><a class="btn" href="#/admin/pos">+ In-store sale</a></div>
    <div class="chips"><a class="chip ${!statusF ? 'on' : ''}" href="${link({ status: '' })}">All</a>${STATUSES.map((st) => `<a class="chip ${statusF === st ? 'on' : ''}" href="${link({ status: st })}">${st}</a>`).join('')}</div>
    ${os.length ? `<div class="row bulk" style="margin-bottom:8px"><span class="muted"><span id="selcount">0</span> selected</span><button type="button" class="btn ghost" id="bulkslips">:ic-clipboard: Packing slips</button><select id="bulkstatus" aria-label="New status">${STATUSES.map((st) => `<option>${st}</option>`).join('')}</select><button class="btn ghost" id="bulkapply">Apply to selected</button></div>
    <table id="ordtable"><tr><th><input type="checkbox" id="selall" aria-label="Select all"></th><th>Order</th><th>Date</th><th>Location</th><th>Status</th><th>Total</th></tr>${os.map((o) => `<tr><td><input type="checkbox" class="osel" value="${o.id}" aria-label="Select order ${o.id}"></td><td><a href="#/admin/orders/${o.id}">#${o.id}</a> · ${esc(o.name)}</td><td>${dateOf(o.created_at)}</td><td>${esc(lnames[o.location_id] || '')}${o.source === 'in_store' ? ' · in store' : o.fulfillment === 'pickup' ? ' · pickup' : ''}</td><td><span class="status ${esc(o.status)}">${esc(o.status)}</span></td><td>${money(o.total_cents)}${o.refunded_cents ? `<br><small class="down">−${money(o.refunded_cents)} refunded</small>` : ''}</td></tr>`).join('')}</table>` : '<p class="muted">No orders match.</p>'}`;
  }
  if (sub === 'customers' && id) {
    const [pr, ords, info, invR] = await Promise.all([sb.from('profiles').select('*').eq('id', id).single(), sb.from('orders').select('*').eq('user_id', id).order('id', { ascending: false }), sb.from('customer_info').select('*').eq('user_id', id).maybeSingle(), can('invoices.view') ? sb.from('invoices').select('id,number,total_cents,paid_cents,status,due_date').eq('customer_id', id).order('id', { ascending: false }) : { data: [] }]);
    const u = pr.data, os = ords.data || [], live = os.filter((o) => o.status !== 'cancelled'), spent = live.reduce((a, o) => a + net(o), 0), ci = info.data || { notes: '', tags: [] };
    return `<p><a href="#/admin/customers">← All customers</a></p><div class="acchead">${avatar(u.name || u.email)}<div><h1 style="margin:0">${esc(u.name || u.email)}${u.is_admin ? ' <span class="status paid">admin</span>' : ''}</h1><span class="muted">${u.username ? '@' + esc(u.username) + ' · ' : ''}${esc(u.email)} · joined ${new Date(u.created_at).toLocaleDateString()}</span></div>
      <a class="btn ghost" href="#/messages/new?to=${u.id}" style="margin-left:auto">:ic-chat: Message</a></div>
    <div class="kpis"><div class="kpi"><span class="lbl">Orders</span><b>${live.length}</b></div><div class="kpi"><span class="lbl">Lifetime spend</span><b>${money(spent)}</b></div><div class="kpi"><span class="lbl">Average order</span><b>${money(live.length ? Math.round(spent / live.length) : 0)}</b></div><div class="kpi"><span class="lbl">Last order</span><b style="font-size:1.1rem">${os[0] ? new Date(os[0].created_at).toLocaleDateString() : '—'}</b></div></div>
    <section class="cs" style="margin-top:16px"><h3>Notes &amp; tags <small class="muted" style="font-weight:400">(private)</small></h3><form id="custform" class="stack" data-id="${u.id}"><label>Tags (comma separated)<input name="tags" value="${esc((ci.tags || []).join(', '))}" placeholder="contractor, wholesale, VIP"></label><label>Notes<textarea name="notes" rows="4" maxlength="5000">${esc(ci.notes)}</textarea></label><button class="btn">Save</button></form></section>
    ${can('invoices.view') ? `<section class="cs" style="margin-top:16px"><div class="sechead"><h3 style="margin:0">Invoices</h3>${can('invoices.manage') ? `<a class="btn ghost" href="#/admin/invoices/new">+ New invoice</a>` : ''}</div>${(invR.data || []).length ? `<div class="tablewrap"><table><tr><th>Number</th><th>Total</th><th>Balance</th><th>Due</th><th>Status</th></tr>${invR.data.map((i) => `<tr><td><a href="#/admin/invoices/${i.id}"><b>${esc(i.number)}</b></a></td><td>${money(i.total_cents)}</td><td>${money(i.total_cents - i.paid_cents)}</td><td>${esc(i.due_date)}</td><td><span class="status ${invEff(i) === 'overdue' ? 'cancelled' : i.status === 'paid' ? 'paid' : ''}">${invEff(i)}</span></td></tr>`).join('')}</table></div>` : '<p class="muted" style="margin:0">No invoices linked to this customer.</p>'}</section>` : ''}
    <section class="cs" style="margin-top:16px"><h3>Orders</h3>${ordersTable(os, '#/admin/orders')}</section>`;
  }
  if (sub === 'customers') {
    const us = (await sb.from('profiles').select('*').order('created_at', { ascending: false })).data || [];
    const cst = {}; ((await sb.from('orders').select('user_id,total_cents,tax_cents,refunded_cents,status,created_at')).data || []).forEach((o) => { if (!o.user_id || o.status === 'cancelled') return; const c = (cst[o.user_id] = cst[o.user_id] || { n: 0, spent: 0, last: '' }); c.n++; c.spent += net(o); if (o.created_at > c.last) c.last = o.created_at; });
    const tagsBy = {}; ((await sb.from('customer_info').select('user_id,tags')).data || []).forEach((r) => (tagsBy[r.user_id] = r.tags || []));
    const people = us.filter((u) => !u.is_admin), spends = people.map((u) => cst[u.id]?.spent || 0).sort((a, b) => b - a), vipCut = Math.max(spends[Math.floor(spends.length * 0.1)] || 0, 1), d30 = new Date(Date.now() - 30 * 864e5).toISOString(), d90 = new Date(Date.now() - 90 * 864e5).toISOString();
    const segs = (u) => { const c = cst[u.id], out = []; if (c && c.spent >= vipCut && c.n >= 1) out.push('vip'); if (u.created_at > d30) out.push('new'); if (c?.n >= 2) out.push('repeat'); if (c && c.last < d90) out.push('inactive'); if (!c) out.push('none'); return out; };
    const repeatRate = people.filter((u) => cst[u.id]).length ? Math.round(people.filter((u) => cst[u.id]?.n >= 2).length / people.filter((u) => cst[u.id]).length * 100) : 0;
    const total = people.reduce((a, u) => a + (cst[u.id]?.spent || 0), 0);
    return `<div class="sechead"><h1 style="margin:0">Customers</h1><button class="btn ghost" id="custcsv" type="button">:ic-download: Export CSV</button></div>
    <div class="kpis"><div class="kpi"><span class="lbl">Customers</span><b>${people.length}</b></div><div class="kpi"><span class="lbl">New (30 days)</span><b>${people.filter((u) => u.created_at > d30).length}</b></div><div class="kpi"><span class="lbl">Repeat buyers</span><b>${repeatRate}%</b><small class="muted">of those who ordered</small></div><div class="kpi"><span class="lbl">Avg lifetime value</span><b>${money(people.length ? Math.round(total / people.length) : 0)}</b></div></div>
    <div class="toolbar" style="margin-top:14px"><input id="custq" type="search" placeholder="Search name, email or tag…" aria-label="Search customers" style="max-width:280px"><div class="chips" id="custseg" style="margin:0">${[['', 'All'], ['vip', 'Top 10%'], ['new', 'New'], ['repeat', 'Repeat'], ['inactive', 'Inactive 90d+'], ['none', 'No orders']].map(([v, l], k) => `<button type="button" class="chip ${k ? '' : 'on'}" data-seg="${v}">${l}</button>`).join('')}</div>
      <select id="custsort" aria-label="Sort"><option value="joined">Newest</option><option value="spent">Highest spend</option><option value="orders">Most orders</option><option value="last">Recent order</option></select><span class="muted grow" id="custcount"></span></div>
    <div class="tablewrap"><table id="custtable"><tr><th>Name</th><th>Email</th><th>Orders</th><th>Spent</th><th>Last order</th><th>Joined</th><th></th></tr>${us.map((u) => { const c = cst[u.id] || { n: 0, spent: 0, last: '' }, tg = tagsBy[u.id] || [];
      return `<tr data-q="${esc((u.name + ' ' + u.email + ' ' + (u.username || '') + ' ' + tg.join(' ')).toLowerCase())}" data-seg="${segs(u).join(' ')}" data-joined="${u.created_at}" data-spent="${c.spent}" data-orders="${c.n}" data-last="${c.last}" data-csv='${esc(JSON.stringify([u.name, u.email, c.n, (c.spent / 100).toFixed(2), c.last.slice(0, 10), u.created_at.slice(0, 10), tg.join('; ')]))}'><td><a href="#/admin/customers/${u.id}">${esc(u.name || u.email)}</a>${u.is_admin ? ' <span class="status paid">team</span>' : ''}${segs(u).includes('vip') ? ' <span class="status shipped">VIP</span>' : ''}${tg.map((t) => ` <span class="status">${esc(t)}</span>`).join('')}</td><td>${esc(u.email)}</td><td>${c.n}</td><td>${money(c.spent)}</td><td>${c.last ? ago(c.last) : '—'}</td><td>${new Date(u.created_at).toLocaleDateString()}</td><td>${u.is_admin ? '' : `<a href="#/messages/new?to=${u.id}">Message</a>`}</td></tr>`; }).join('')}</table></div>`;
  }
  if (sub === 'products' && (id === 'new' || id)) {
    const p = id === 'new' ? {} : (await sb.from('products').select('*').eq('id', id).single()).data;
    const extras = id === 'new' ? [] : (await sb.from('product_images').select('*').eq('product_id', id).order('position')).data;
    const brandsAll = await sb.from('brands').select('name').order('name');
    const packs = id === 'new' ? [] : (await sb.from('product_packs').select('*').eq('product_id', id).order('units')).data || [];
    const locsAll = (await sb.from('locations').select('id,name,active').order('is_default', { ascending: false }).order('name')).data || [];
    const invRows = id === 'new' ? [] : (await sb.from('inventory').select('*').eq('product_id', id)).data || [];
    const stockFields = `<fieldset class="choices stockbox"><legend>Stock by location</legend>
      <label>Bags in one bundle <small class="muted">leave empty if you only sell single bags</small><input name="bags_per_bundle" type="number" min="2" max="1000" step="1" value="${p.bags_per_bundle || ''}" placeholder="e.g. 6"></label>
      ${locsAll.map((l) => { const q0 = invRows.find((r) => r.location_id === l.id)?.qty ?? 0; return `<div class="stockrow" data-orig="${q0}"><b>${esc(l.name)}${l.active ? '' : ' (inactive)'}</b>
        <label class="sbags">Bags<input type="number" min="0" class="sbagin" value="${q0}"></label>
        <label class="sbund" hidden>Bundles<input type="number" min="0" class="sbundin" value="0"></label><label class="sbund" hidden>Loose bags<input type="number" min="0" class="slooin" value="0"></label>
        <input type="hidden" name="inv_${l.id}" data-orig="${q0}" value="${q0}"><small class="muted sbtot"></small></div>`; }).join('')}
      <small class="muted">Total stock is the sum across locations (counted in bags). Move stock between locations on the <a href="#/admin/inventory">Inventory</a> page.</small></fieldset>`;
    const t = (n, l, x = '') => `<label>${l}<input name="${n}" value="${esc(p[n] ?? '')}" ${x}></label>`;
    return `<h1>${p.id ? 'Edit product' : 'New product'}</h1><form id="pf" class="stack narrow" data-id="${p.id || ''}">${t('name', 'Name', 'required')}${t('category', 'Category', 'required')}<label>Brand <small class="muted">pick one or type a new brand</small><input name="brand" list="brandlist" maxlength="60" value="${esc(p.brand || '')}" placeholder="e.g. Owens Corning" autocomplete="off"><datalist id="brandlist">${(brandsAll.data || []).map((b) => `<option value="${esc(b.name)}">`).join('')}</datalist></label>
    <label>Short description <small class="muted">shown on cards and search results</small><textarea name="description" rows="3">${esc(p.description)}</textarea></label>
    <fieldset class="cmpset detailbox"><legend>:ic-clipboard: Product details</legend>
      <div class="two2"><label>SKU / item number<input name="sku" maxlength="60" value="${esc(p.sku || '')}" placeholder="e.g. OC-R22-15"></label><label>Barcode (UPC / EAN)<input name="barcode" maxlength="60" value="${esc(p.barcode || '')}" inputmode="numeric" placeholder="optional"></label></div>
      <label>Key features <small class="muted">one per line — shown as bullets</small><textarea name="features" rows="4" maxlength="3000" placeholder="Faster install&#10;Fire resistant&#10;Soft to the touch">${esc((p.features || []).join('\n'))}</textarea></label>
      <label>Full description <small class="muted">optional — supports **bold**, lists, headings, links</small><textarea name="long_description" rows="6" maxlength="20000" style="font-family:ui-monospace,Menlo,monospace;font-size:.9rem">${esc(p.long_description || '')}</textarea></label>
      <div><b>Specifications</b> <small class="muted">label and value, e.g. Weight — 25 lb</small><datalist id="spechints">${SPEC_HINTS.map((h) => `<option value="${h}">`).join('')}</datalist><div id="specrows">${(p.specs || []).map(specRow).join('')}</div><button type="button" class="btn ghost" id="addspec">+ Add a detail</button></div>
      <div><b>Documents</b> <small class="muted">spec sheets, installation guides (PDF)</small><div id="docrows">${(p.documents || []).map(docRow).join('')}</div><div class="row"><button type="button" class="btn ghost" id="adddoc">+ Add a link</button><label class="btn ghost" style="cursor:pointer">:ic-download: Upload a file<input type="file" id="docfile" accept="application/pdf,.pdf,.doc,.docx,image/jpeg,image/png" hidden></label></div></div>
      <div class="two2"><label>Video <small class="muted">YouTube link</small><input name="video_url" type="url" maxlength="300" value="${esc(p.video_url || '')}" placeholder="https://www.youtube.com/watch?v=…"></label><label>Warranty<input name="warranty" maxlength="500" value="${esc(p.warranty || '')}" placeholder="e.g. Limited lifetime warranty"></label></div>
    </fieldset>
    <div class="two2"><label>Price per bag / unit<input name="price" type="number" step="0.01" min="0" required value="${p.price_cents != null ? (p.price_cents / 100).toFixed(2) : ''}"></label><label>Original price <small class="muted">shows a sale badge</small><input name="compare_at" type="number" step="0.01" min="0" value="${p.compare_at_cents ? (p.compare_at_cents / 100).toFixed(2) : ''}" placeholder="optional"></label></div>
    ${t('unit', 'Unit (e.g. bundle, roll)', 'required')}${t('r_value', 'R-value')}
    <div class="two2"><label>Unit cost ($) <small class="muted">what you pay</small><input name="cost" type="number" step="0.01" min="0" value="${((p.cost_cents || 0) / 100).toFixed(2)}"></label><label>Reorder when stock ≤<input name="reorder_point" type="number" min="0" value="${p.reorder_point ?? 10}"></label></div>
    <fieldset class="cmpset" id="packbox"><legend>Bag &amp; bundle prices</legend><p class="muted" style="margin:0"><b>Price per bag</b> is the field above. Here, say how many bags are in a bundle (usually 2–6) and price it either <b>per bag</b> or <b>per bundle</b> — type one and the other fills in. Customers see both prices and what they save. Stock is still counted in bags.</p>
      <div id="packrows">${(packs.length ? packs : p.bags_per_bundle ? [{ units: p.bags_per_bundle }] : []).map((k, i) => packRow(k, i, p)).join('')}</div><button type="button" class="btn ghost" id="addpack">+ Add a bundle size</button></fieldset>
    <label>Usual reorder quantity<input name="reorder_qty" type="number" min="0" value="${p.reorder_qty ?? 0}"></label>${stockFields}
    ${p.image_url ? `<div class="curphoto"><img src="${esc(safeUrl(p.image_url))}" alt="Current photo"><div class="stack" style="gap:6px"><b>Current photo</b><label class="check" style="color:var(--err)"><input type="checkbox" name="remove_image"> Remove this photo when I save</label><small class="muted">Choose a new file below to replace it instead.</small></div></div>` : ''}
    <label>Photo (JPG, PNG or WebP — big photos are resized automatically)<input type="file" name="image" accept="image/jpeg,image/png,image/webp,image/gif"></label>
    <input type="hidden" name="image_url" value="${esc(p.image_url || '')}">
    ${extras.length ? `<div class="extras">${extras.map((x) => `<figure><img src="${esc(x.url)}" alt=""><button type="button" class="link delimg" data-id="${x.id}" style="color:var(--err)">Remove</button></figure>`).join('')}</div>` : ''}
    <label>More photos for the gallery (optional, you can pick several)<input type="file" name="extras" accept="image/jpeg,image/png,image/webp,image/gif" multiple></label><label>Photo description (alt text) <small class="muted">for accessibility and image search</small><input name="image_alt" maxlength="200" value="${esc(p.image_alt || '')}" placeholder="e.g. Roll of R-13 fiberglass batt insulation"></label>${seoFields(p, p.name, '/product/' + (p.slug || 'your-product') + '/')}<label class="check"><input type="checkbox" name="active" ${p.id && !p.active ? '' : 'checked'}> Visible in store</label><button class="btn">Save</button></form>`;
  }
  if (sub === 'products') {
    const [psR, alR] = await Promise.all([sb.from('products').select('*').order('name'), sb.from('stock_alerts').select('product_id')]);
    const ps = psR.data || [], waiting = {}; (alR.data || []).forEach((a) => (waiting[a.product_id] = (waiting[a.product_id] || 0) + 1));
    const cats = [...new Set(ps.map((x) => x.category))].sort();
    return `<div class="sechead"><h1 style="margin:0">Products</h1><div class="row"><label class="btn ghost" style="cursor:pointer" title="Add or update many products from a spreadsheet (CSV)">:ic-clipboard: Import CSV<input type="file" id="prodimport" accept=".csv,text/csv" hidden></label><button class="btn ghost" id="prodtemplate" type="button">Template</button><button class="btn ghost" id="optimg" type="button" title="Shrinks photos that are too big, so pages load faster">:ic-image: Optimize photos</button><button class="btn ghost" id="prodcsv" type="button">:ic-download: Export CSV</button><a class="btn" href="#/admin/products/new">+ New product</a></div></div>
    <div class="toolbar"><input id="prodq" type="search" placeholder="Search products…" aria-label="Search products" style="max-width:280px"><select id="prodcat" aria-label="Category"><option value="">All categories</option>${cats.map((c) => `<option>${esc(c)}</option>`).join('')}</select><select id="prodbrand" aria-label="Brand"><option value="">All brands</option>${[...new Set(ps.map((x) => x.brand).filter(Boolean))].sort().map((b) => `<option>${esc(b)}</option>`).join('')}</select>
    <select id="prodview" aria-label="Show"><option value="">All</option><option value="low">Low or out of stock</option><option value="sale">On sale</option><option value="hidden">Hidden</option></select><label class="check"><input type="checkbox" id="prodall2"> Select all shown</label><span class="muted grow" id="prodcount"></span></div>
    <div class="bulkbar" id="prodbulk" hidden><b><span id="prodsel">0</span> selected</b>
      <label>Change price <select id="bk_op"><option value="">—</option><option value="pct">by %</option><option value="amt">by $</option></select></label><input id="bk_val" type="number" step="0.01" placeholder="e.g. 5 or -10" style="width:110px">
      <select id="bk_vis" aria-label="Visibility"><option value="">Visibility…</option><option value="1">Show in store</option><option value="0">Hide from store</option></select><input id="bk_brand" list="bk_brands" placeholder="Set brand…" style="width:150px"><datalist id="bk_brands">${[...new Set(ps.map((x) => x.brand).filter(Boolean))].map((b) => `<option value="${esc(b)}">`).join('')}</datalist><input id="bk_cat" list="bk_cats" placeholder="Set category…" style="width:150px"><datalist id="bk_cats">${cats.map((c) => `<option value="${esc(c)}">`).join('')}</datalist>
      <button class="btn" id="bk_apply" type="button">Apply to selected</button></div>
    <p class="muted" id="prodimpmsg" hidden></p>
    <table id="prodtable"><tr><th style="width:32px"><input type="checkbox" id="prodall" aria-label="Select all shown"></th><th>Name</th><th>Brand</th><th>Category</th><th>Price</th><th>Stock</th><th>Waiting</th><th>Status</th></tr>
    ${ps.map((p) => `<tr data-name="${esc((p.name + ' ' + (p.brand || '') + ' ' + (p.sku || '')).toLowerCase())}" data-cat="${esc(p.category)}" data-brand="${esc(p.brand || '')}" data-low="${p.stock <= (p.reorder_point ?? 10) ? 1 : ''}" data-sale="${onSale(p) ? 1 : ''}" data-id="${p.id}" data-price="${p.price_cents}" data-hidden="${p.active ? '' : 1}" data-csv='${esc(JSON.stringify([p.name, p.brand || '', p.category, (p.price_cents / 100).toFixed(2), ((p.cost_cents || 0) / 100).toFixed(2), p.stock, p.unit, p.active ? 'live' : 'hidden']))}'><td><input type="checkbox" class="psel" value="${p.id}" aria-label="Select ${esc(p.name)}"></td><td><a href="#/admin/products/${p.id}">${esc(p.name)}</a></td><td>${esc(p.brand || '—')}</td><td>${esc(p.category)}</td><td>${priceHtml(p)}</td><td class="${p.stock === 0 ? 'down' : ''}">${p.stock}</td><td>${waiting[p.id] ? `<span class="status pending">${waiting[p.id]}</span>` : ''}</td><td>${p.active ? 'Live' : 'Hidden'}</td></tr>`).join('')}</table>`;
  }
  // ---- dashboard ----
  const days = [7, 30, 90].includes(Number(q.get('days'))) ? Number(q.get('days')) : 30, now = Date.now(), cutCur = now - days * 864e5;
  const cartAb = can('orders.view') ? await sb.from('carts').select('id', { count: 'exact', head: true }).eq('recovered', false).eq('handled', false).lt('updated_at', new Date(Date.now() - 36e5).toISOString()) : { count: 0 };
  const [ordRes, itemRes, locRes, custRes, pendRes, formRes, lowRes, recentRes, quoteRes, invRes] = await Promise.all([
    sb.from('orders').select('id,created_at,status,total_cents,tax_cents,refunded_cents,location_id,source').neq('status', 'cancelled').gte('created_at', new Date(now - 2 * days * 864e5).toISOString()),
    sb.from('order_items').select('name,qty,price_cents,orders!inner(created_at,status)').neq('orders.status', 'cancelled').gte('orders.created_at', new Date(cutCur).toISOString()),
    sb.from('locations').select('id,name'), sb.from('profiles').select('created_at').eq('is_admin', false).gte('created_at', new Date(now - 2 * days * 864e5).toISOString()),
    sb.from('orders').select('id', { count: 'exact', head: true }).eq('status', 'pending'), sb.from('form_submissions').select('id', { count: 'exact', head: true }).eq('status', 'new'),
    sb.from('products').select('id,name,stock').lte('stock', 10).eq('active', true).order('stock').limit(8),
    sb.from('orders').select('id,name,created_at,status,total_cents,source').order('id', { ascending: false }).limit(8),
    sb.from('quotes').select('id', { count: 'exact', head: true }).gte('created_at', new Date(now - 7 * 864e5).toISOString()),
    sb.from('invoices').select('id,total_cents,paid_cents,due_date').eq('status', 'sent')]);
  const all = ordRes.data || [], cur = all.filter((o) => new Date(o.created_at) >= cutCur), prev = all.filter((o) => new Date(o.created_at) < cutCur);
  const sum = (a) => a.reduce((x, o) => x + net(o), 0), revCur = sum(cur), revPrev = sum(prev);
  const custCur = (custRes.data || []).filter((u) => new Date(u.created_at) >= cutCur).length, custPrev = (custRes.data || []).length - custCur;
  const todayRev = sum(all.filter((o) => sameDay(o.created_at, now)));
  const delta = (c, p) => (p ? `<small class="${c >= p ? 'up' : 'down'}">${c >= p ? ':ic-trending-up:' : ':ic-trending-down:'} ${Math.abs(Math.round((c - p) / p * 100))}% vs previous ${days} days</small>` : `<small class="muted">${c ? 'New activity' : 'No data yet'}</small>`);
  const kpi = (label, value, d) => `<div class="kpi"><span class="lbl">${label}</span><b>${value}</b>${d}</div>`;
  const lname = Object.fromEntries((locRes.data || []).map((l) => [l.id, l.name]));
  const byLoc = {}; cur.forEach((o) => { const k = o.location_id || 0; byLoc[k] = (byLoc[k] || 0) + net(o); });
  const locRows = Object.entries(byLoc).sort((a, b) => b[1] - a[1]), maxLoc = Math.max(...locRows.map((r) => r[1]), 1);
  const top = {}; (itemRes.data || []).forEach((i) => { const t = (top[i.name] = top[i.name] || { u: 0, r: 0 }); t.u += i.qty; t.r += i.qty * i.price_cents; });
  const topRows = Object.entries(top).sort((a, b) => b[1].r - a[1].r).slice(0, 5);
  const hr = new Date().getHours(), first = (profile?.name || '').split(' ')[0];
  const today0 = new Date().toISOString().slice(0, 10), overdue = (invRes.data || []).filter((i) => i.due_date < today0 && i.total_cents > i.paid_cents), rep = can('reports.view');
  const attn = [[':ic-receipt:', pendRes.count || 0, 'pending orders', '#/admin/orders', 'orders.view'], [':ic-chat:', unread.msg, 'unread messages', '#/messages', 'messages'], [':ic-edit:', formRes.count || 0, 'new form responses', '#/admin/forms', 'content.manage'], [':ic-package:', (lowRes.data || []).length, 'low-stock products', '#/admin/inventory', 'inventory.view'],
    [':ic-clipboard:', quoteRes.count || 0, 'quote requests this week', '#/admin/quotes', 'customers.view'], [':ic-card:', overdue.length, 'overdue invoices', '#/admin/invoices', 'invoices.view'], [':ic-cart:', cartAb.count || 0, 'abandoned carts', '#/admin/carts', 'orders.view']].filter((a) => can(a[4]));
  const links = [[':ic-receipt:', 'Orders', '#/admin/orders'], [':ic-store:', 'Products', '#/admin/products'], [':ic-package:', 'Inventory', '#/admin/inventory'], [':ic-map-pin:', 'Locations', '#/admin/locations'], [':ic-trending-up:', 'Sales', '#/admin/sales'], [':ic-store:', 'Point of sale', '#/admin/pos'],
    [':ic-receipt:', 'Invoices', '#/admin/invoices'], [':ic-edit:', 'Estimates', '#/admin/estimates'], [':ic-book:', 'Statements', '#/admin/statements'], [':ic-wallet:', 'Expenses', '#/admin/expenses'], [':ic-chart:', 'Profit & loss', '#/admin/profit'], [':ic-truck:', 'Purchasing', '#/admin/purchasing'], [':ic-briefcase:', 'Suppliers', '#/admin/suppliers'], [':ic-shield:', 'Team & roles', '#/admin/team'], [':ic-clock:', 'Activity log', '#/admin/activity'],
    [':ic-users:', 'Customers', '#/admin/customers'], [':ic-chart:', 'SEO', '#/admin/seo'], [':ic-chat:', 'Messages', '#/messages'], [':ic-edit:', 'Forms', '#/admin/forms'], [':ic-file:', 'Pages', '#/admin/pages'], [':ic-dollar:', 'Price compare', '#/admin/compare'], [':ic-tag:', 'Discount codes', '#/admin/codes'], [':ic-settings:', 'Settings', '#/admin/settings'], [':ic-clipboard:', 'Quotes', '#/admin/quotes']];
  const linkOk = ([, , h]) => { const sec = h.split('/')[2]; return h.startsWith('#/messages') ? can('messages') : !SECTION_PERM[sec] || can(SECTION_PERM[sec]); };
  const groups = [['Sell', ['Orders', 'Point of sale', 'Products', 'Inventory', 'Locations', 'Discount codes', 'Price compare']], ['Money', ['Invoices', 'Estimates', 'Statements', 'Expenses', 'Profit & loss', 'Sales']], ['Customers & content', ['Customers', 'Messages', 'Forms', 'Pages', 'Quotes', 'SEO']], ['Business', ['Purchasing', 'Suppliers', 'Team & roles', 'Activity log', 'Settings']]];
  const linkBy = Object.fromEntries(links.map((l) => [l[1], l])), manage = groups.map(([g, names]) => [g, names.map((n) => linkBy[n]).filter(Boolean).filter(linkOk)]).filter(([, ls]) => ls.length);
  const card = (title, body, action = '') => `<section class="cs dcard"><div class="sechead"><h3 style="margin:0">${title}</h3>${action}</div>${body}</section>`;
  const recent = (recentRes.data || []).slice(0, 8);
  const invOpen = (invRes.data || []).filter((i) => i.total_cents > i.paid_cents), bal = (i) => i.total_cents - i.paid_cents, wk = new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10);
  const recvCard = can('invoices.view') ? card('Receivables', `<ul class="plain"><li><span>Outstanding</span><b>${money(invOpen.reduce((a, i) => a + bal(i), 0))}</b></li><li><span>Overdue <small class="muted">(${overdue.length})</small></span><b class="${overdue.length ? 'down' : ''}">${money(overdue.reduce((a, i) => a + bal(i), 0))}</b></li><li><span>Due in 7 days</span><b>${money(invOpen.filter((i) => i.due_date >= today0 && i.due_date <= wk).reduce((a, i) => a + bal(i), 0))}</b></li></ul>`, '<a href="#/admin/invoices">View</a>') : '';
  const taskRes = can('orders.view') || can('invoices.view') ? await sb.from('admin_tasks').select('*').order('done').order('id', { ascending: false }).limit(25) : { data: [] };
  const tasks = taskRes.data || [];
  const tasksCard = can('orders.view') || can('invoices.view') ? card('Team to-do', `<form id="taskform" class="row" style="flex-wrap:nowrap;margin-bottom:8px"><input name="title" maxlength="200" placeholder="Add a task…" required style="flex:1;min-width:0"><input name="due" type="date" aria-label="Due" style="width:auto"><button class="btn ghost">Add</button></form>${tasks.length ? `<ul class="plain tasklist">${tasks.map((t) => `<li class="${t.done ? 'done' : ''}"><label class="check" style="margin:0"><input type="checkbox" class="tasktoggle" data-id="${t.id}" ${t.done ? 'checked' : ''}> <span>${esc(t.title)}</span></label><span>${t.due_on && !t.done ? `<small class="${t.due_on < today0 ? 'down' : 'muted'}">${esc(t.due_on)}</small> ` : ''}<button class="link taskdel" data-id="${t.id}" aria-label="Delete task">×</button></span></li>`).join('')}</ul>` : '<p class="muted" style="margin:0">Nothing to do — add a reminder for the team.</p>'}`) : '';
  const actRes = can('team.manage') ? await sb.from('audit_log').select('*').order('id', { ascending: false }).limit(6) : { data: [] };
  const actCard = can('team.manage') ? card('Recent activity', (actRes.data || []).length ? `<ul class="plain">${actRes.data.map((a) => `<li><span>${fmtAudit(a)}<br><small class="muted">${esc(a.actor || '—')} · ${ago(a.created_at)}</small></span></li>`).join('')}</ul>` : '<p class="muted" style="margin:0">No activity yet.</p>', '<a href="#/admin/activity">All</a>') : '';
  return `<div class="dashhead"><div><h1 style="margin:0">Good ${hr < 12 ? 'morning' : hr < 18 ? 'afternoon' : 'evening'}${first ? ', ' + esc(first) : ''}</h1><p class="muted" style="margin:2px 0 0">${new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })} · ${money(todayRev)} sold today</p></div>
    <div class="row"><button type="button" class="btn ghost openpalette" aria-label="Quick search">:ic-search: Search <kbd>Ctrl K</kbd></button>${can(SECTION_PERM.settings) ? `<button type="button" class="btn ghost shoptoggle" id="shoptoggle">${shopClosed() ? ':ic-store: Reopen shop' : ':ic-lock: Close shop'}</button>` : ''}<a class="btn" href="#/admin/pos">:ic-store: In-store sale</a><a class="btn ghost" href="#/admin/products/new">+ Product</a></div></div>
  ${attn.length ? `<div class="attn">${attn.map(([i, n, l, h]) => `<a class="attnc ${n ? 'on' : ''}" href="${h}"><span>${i}</span><b>${n}</b><small>${l}</small></a>`).join('')}</div>` : ''}
  ${rep ? `<div class="sechead dsec"><h2 style="margin:0">Performance</h2><div class="seg">${[7, 30, 90].map((d) => `<a class="${d === days ? 'on' : ''}" href="#/admin?days=${d}">${d} days</a>`).join('')}</div></div>
  <div class="kpis">${kpi('Revenue', money(revCur), delta(revCur, revPrev))}${kpi('Orders', cur.length, delta(cur.length, prev.length))}${kpi('Average order', money(cur.length ? Math.round(revCur / cur.length) : 0), delta(cur.length ? revCur / cur.length : 0, prev.length ? revPrev / prev.length : 0))}${kpi('New customers', custCur, delta(custCur, custPrev))}</div>` : ''}
  <div class="dgrid">
    <div class="dmain">${rep ? `${card('Revenue', barChart(bucketize(cur, days)), `<small class="muted">last ${days} days</small>`)}
      <div class="dpair">${card('By location', locRows.length ? locRows.map(([k, v]) => `<div class="locbar"><span>${esc(lname[k] || 'Unassigned')}</span><div class="progress"><i style="width:${v / maxLoc * 100}%"></i></div><b>${money(v)}</b></div>`).join('') : '<p class="muted" style="margin:0">No sales in this period.</p>')}
        ${card('Top products', topRows.length ? `<ul class="plain">${topRows.map(([n, v], i) => `<li><span><span class="rank">${i + 1}</span>${esc(n)}</span><span><b>${money(v.r)}</b> <small class="muted">· ${v.u} sold</small></span></li>`).join('')}</ul>` : '<p class="muted" style="margin:0">No sales in this period.</p>')}</div>` : ''}</div>
    <div class="dside">${recvCard}${tasksCard}${can('orders.view') ? card('Recent orders', recent.length ? `<div class="olist2">${recent.map((o) => `<a class="orow" href="#/admin/orders/${o.id}"><span class="oid"><b>#${o.id}</b></span><span class="oname"><span class="nm">${esc(o.name)}${o.source === 'in_store' ? ' :ic-store:' : ''}</span><small class="muted">${ago(o.created_at)}</small></span><span class="status ${esc(o.status)}">${esc(o.status)}</span><b class="ototal">${money(o.total_cents)}</b></a>`).join('')}</div>` : '<p class="muted" style="margin:0">No orders yet.</p>', '<a href="#/admin/orders" style="font-size:.9rem">View all →</a>') : ''}
      ${can('inventory.view') ? card('Low stock', (lowRes.data || []).length ? `<ul class="plain">${lowRes.data.map((x) => `<li><a href="#/admin/products/${x.id}">${esc(x.name)}</a><b class="${x.stock === 0 ? 'down' : ''}">${x.stock === 0 ? 'Out of stock' : x.stock + ' left'}</b></li>`).join('')}</ul>` : '<p class="muted" style="margin:0">Everything is well stocked.</p>', '<a href="#/admin/inventory" style="font-size:.9rem">Inventory →</a>') : ''}${actCard}</div></div>
  <h2 class="dsec">Manage</h2><div class="mgroups">${manage.map(([g, ls]) => `<div class="mgroup"><h4>${g}</h4><div class="qlinks">${ls.map(([i, l, h]) => `<a href="${h}"><span>${i}</span>${l}</a>`).join('')}</div></div>`).join('')}</div>`;
};
pages.admin.after = ([sub, id, extra], q = new URLSearchParams()) => {
  document.getElementById('optimg')?.addEventListener('click', async (e) => {
    const btn = e.currentTarget; if (!confirm('Check every product photo and shrink the ones that are too big (over 1600px or 400 KB)? Smaller copies replace them; this can take a minute.')) return;
    btn.disabled = true; const PUB = '/storage/v1/object/public/product-images/'; let done = 0, saved = 0, skipped = 0, failed = 0;
    try {
      const prods = (await sb.from('products').select('id,image_url')).data || [], extras = (await sb.from('product_images').select('id,url')).data || [];
      const jobs = [...prods.filter((x) => x.image_url).map((x) => ({ t: 'products', id: x.id, col: 'image_url', url: x.image_url })), ...extras.map((x) => ({ t: 'product_images', id: x.id, col: 'url', url: x.url }))];
      for (const j of jobs) { btn.textContent = `Optimizing ${++done} of ${jobs.length}…`;
        try {
          const r = await fetch(j.url); if (!r.ok) throw new Error('fetch'); const blob = await r.blob(); const f = new File([blob], 'photo.' + (blob.type.split('/')[1] || 'jpg'), { type: blob.type });
          const out = await prepImage(f); if (out === f || out.size >= f.size) { skipped++; continue; }
          const path = `opt/${Date.now()}-${j.id}.webp`, up = await sb.storage.from('product-images').upload(path, out, { contentType: 'image/webp' }); if (up.error) throw up.error;
          const url = sb.storage.from('product-images').getPublicUrl(path).data.publicUrl, u = await sb.from(j.t).update({ [j.col]: url }).eq('id', j.id); if (u.error) throw u.error;
          saved += f.size - out.size; if (j.url.includes(PUB)) sb.storage.from('product-images').remove([decodeURIComponent(j.url.split(PUB)[1])]);
        } catch { failed++; }
      }
      flash(`Photos checked: ${jobs.length - skipped - failed} shrunk (saved ${(saved / 1048576).toFixed(1)} MB), ${skipped} already fine${failed ? `, ${failed} could not be changed (for example photos hosted on other websites)` : ''}.`, failed ? 'error' : 'ok');
    } catch (err) { fail(err); } finally { btn.disabled = false; btn.innerHTML = ':ic-image: Optimize photos'; }
  });
  if (document.getElementById('prodtable')) {
    const sel = () => [...document.querySelectorAll('.psel:checked')], bar = document.getElementById('prodbulk');
    const upd = () => { const n = sel().length; document.getElementById('prodsel').textContent = n; bar.hidden = !n; };
    ['prodall', 'prodall2'].forEach((id) => document.getElementById(id).addEventListener('change', (e) => { document.querySelectorAll('#prodtable tr:not([hidden]) .psel').forEach((c) => (c.checked = e.target.checked)); document.getElementById('prodall').checked = document.getElementById('prodall2').checked = e.target.checked; upd(); }));
    document.getElementById('prodtable').addEventListener('change', (e) => { if (e.target.classList.contains('psel')) upd(); });
    document.getElementById('bk_apply').addEventListener('click', async (e) => {
      const ids = sel().map((c) => Number(c.value)); if (!ids.length) return;
      const op = document.getElementById('bk_op').value, val = parseFloat(document.getElementById('bk_val').value), vis = document.getElementById('bk_vis').value, brand = document.getElementById('bk_brand').value.trim(), cat = document.getElementById('bk_cat').value.trim();
      if (!op && !vis && !brand && !cat) return fail(new Error('Choose what to change first.')); if (op && !isFinite(val)) return fail(new Error('Enter the amount for the price change.'));
      if (!confirm(`Apply these changes to ${ids.length} product${ids.length === 1 ? '' : 's'}?`)) return; e.target.disabled = true; let bad = 0;
      try { const common = {}; if (vis) common.active = vis === '1'; if (brand) common.brand = brand; if (cat) common.category = cat;
        if (brand) await sb.rpc('add_brand', { nm: brand });
        for (const id of ids) { const tr = document.querySelector(`#prodtable tr[data-id="${id}"]`), upd2 = { ...common };
          if (op) { const cur = Number(tr.dataset.price), next = op === 'pct' ? Math.round(cur * (1 + val / 100)) : cur + Math.round(val * 100); upd2.price_cents = Math.max(0, next); }
          const { error } = await sb.from('products').update(upd2).eq('id', id); if (error) bad++; } } finally { e.target.disabled = false; }
      flash(bad ? `${ids.length - bad} updated, ${bad} failed.` : `${ids.length} product${ids.length === 1 ? '' : 's'} updated.`, bad ? 'error' : 'ok'); route();
    });
    document.getElementById('prodimport').addEventListener('change', async (e) => {
      const f = e.target.files[0]; e.target.value = ''; if (!f) return; const rows = parseCsv(await f.text()); if (rows.length < 2) return fail(new Error('That file has no product rows.'));
      const heads = rows[0].map((h) => h.trim().toLowerCase().replace(/[^a-z]+/g, '_')), col = (...names) => heads.findIndex((h) => names.includes(h)), ix = { name: col('name', 'product'), category: col('category'), brand: col('brand'), price: col('price'), unit: col('unit'), sku: col('sku'), description: col('description'), stock: col('stock', 'quantity', 'qty'), cost: col('cost') };
      if (ix.name < 0 || ix.price < 0) return fail(new Error('The file needs at least "name" and "price" columns. Use "Download template" for an example.'));
      const existing = (await sb.from('products').select('id,name,sku')).data || [], byName = new Map(existing.map((x) => [x.name.toLowerCase(), x])), bySku = new Map(existing.filter((x) => x.sku).map((x) => [x.sku.toLowerCase(), x]));
      const g = (r, k) => (ix[k] >= 0 ? (r[ix[k]] || '').trim() : ''); let add = 0, upd = 0, bad = 0; const lines = rows.slice(1);
      if (!confirm(`Import ${lines.length} row${lines.length === 1 ? '' : 's'}? Products that already exist (same SKU or name) are updated; new ones are added.`)) return;
      const lid = (await sb.from('locations').select('id').eq('is_default', true).maybeSingle()).data?.id;
      for (const r of lines) { const name = g(r, 'name'), price = Math.round((parseFloat(g(r, 'price').replace(/[$,]/g, '')) || 0) * 100); if (!name) continue;
        const fields = { name, price_cents: price, ...(g(r, 'category') ? { category: g(r, 'category') } : {}), ...(g(r, 'brand') ? { brand: g(r, 'brand') } : {}), ...(g(r, 'unit') ? { unit: g(r, 'unit') } : {}), ...(g(r, 'sku') ? { sku: g(r, 'sku') } : {}), ...(g(r, 'description') ? { description: g(r, 'description') } : {}), ...(g(r, 'cost') ? { cost_cents: Math.round((parseFloat(g(r, 'cost')) || 0) * 100) } : {}) };
        if (fields.brand) await sb.rpc('add_brand', { nm: fields.brand });
        const hit = (fields.sku && bySku.get(fields.sku.toLowerCase())) || byName.get(name.toLowerCase());
        if (hit) { const { error } = await sb.from('products').update(fields).eq('id', hit.id); error ? bad++ : upd++; }
        else { const slug = (name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'product') + '-' + Math.floor(Math.random() * 1000);
          const { data, error } = await sb.from('products').insert({ category: 'General', unit: 'each', ...fields, slug }).select('id').single(); if (error) { bad++; continue; } add++;
          const st = parseInt(g(r, 'stock'), 10); if (st > 0 && lid) await sb.rpc('set_inventory', { pid: data.id, lid, new_qty: st, note: 'CSV import' }); } }
      flash(`Import finished: ${add} added, ${upd} updated${bad ? `, ${bad} failed` : ''}.`, bad ? 'error' : 'ok'); route();
    });
  }
  document.getElementById('prodtemplate')?.addEventListener('click', () => download('product-import-template.csv', [['name', 'category', 'brand', 'price', 'unit', 'sku', 'cost', 'stock', 'description'], ['Example batt R-13', 'Batts & Rolls', 'Owens Corning', '49.99', 'bundle', 'OC-R13', '30.00', '20', 'Unfaced fiberglass batts']]));
  if (document.getElementById('custtable')) {
    const tb = document.getElementById('custtable'), rows = () => [...tb.querySelectorAll('tr[data-q]')]; let seg = '';
    const run = () => { const t = document.getElementById('custq').value.toLowerCase().trim(), so = document.getElementById('custsort').value, rs = rows(); let n = 0;
      const key = { joined: (r) => r.dataset.joined, spent: (r) => Number(r.dataset.spent), orders: (r) => Number(r.dataset.orders), last: (r) => r.dataset.last }[so];
      rs.sort((a, b) => (key(a) < key(b) ? 1 : key(a) > key(b) ? -1 : 0)).forEach((r) => { tb.appendChild(r); const ok = (!t || r.dataset.q.includes(t)) && (!seg || r.dataset.seg.split(' ').includes(seg)); r.hidden = !ok; if (ok) n++; });
      document.getElementById('custcount').textContent = `${n} customer${n === 1 ? '' : 's'}`; };
    document.getElementById('custq').addEventListener('input', run); document.getElementById('custsort').addEventListener('change', run);
    document.getElementById('custseg').addEventListener('click', (e) => { const b = e.target.closest('[data-seg]'); if (!b) return; seg = b.dataset.seg; document.querySelectorAll('#custseg .chip').forEach((x) => x.classList.toggle('on', x === b)); run(); }); run();
    document.getElementById('custcsv').addEventListener('click', () => download('customers.csv', [['Name', 'Email', 'Orders', 'Spent', 'Last order', 'Joined', 'Tags'], ...rows().filter((r) => !r.hidden).map((r) => JSON.parse(r.dataset.csv))]));
  }
  if (document.getElementById('prodtable')) {
    const rows = () => [...document.querySelectorAll('#prodtable tr[data-name]')];
    const filt = () => { const t = document.getElementById('prodq').value.toLowerCase().trim(), c = document.getElementById('prodcat').value, bb = document.getElementById('prodbrand').value, v = document.getElementById('prodview').value; let n = 0;
      rows().forEach((r) => { const ok = (!t || r.dataset.name.includes(t)) && (!c || r.dataset.cat === c) && (!bb || r.dataset.brand === bb) && (!v || (v === 'low' ? r.dataset.low : v === 'sale' ? r.dataset.sale : r.dataset.hidden)); r.hidden = !ok; if (ok) n++; });
      document.getElementById('prodcount').textContent = `${n} product${n === 1 ? '' : 's'}`; };
    ['prodq', 'prodcat', 'prodbrand', 'prodview'].forEach((i) => document.getElementById(i).addEventListener('input', filt)); filt();
    document.getElementById('prodcsv').addEventListener('click', () => download('products.csv', [['Name', 'Brand', 'Category', 'Price', 'Cost', 'Stock', 'Unit', 'Status'], ...rows().filter((r) => !r.hidden).map((r) => JSON.parse(r.dataset.csv))]));
  }
  document.querySelectorAll('.invbrand').forEach((sel) => sel.addEventListener('change', async () => {
    let v = sel.value; if (v === '__new') { v = (prompt('New brand name:') || '').trim(); if (!v) { route(); return; } }
    const { error } = await sb.rpc('set_product_brand', { pid: Number(sel.dataset.p), nm: v }); if (error) { fail(error); return route(); }
    flash(v ? `Brand set to ${v}.` : 'Brand cleared.'); route();
  }));
  document.getElementById('brandadd')?.addEventListener('submit', async (e) => { e.preventDefault(); const { error } = await sb.rpc('add_brand', { nm: new FormData(e.target).get('brand') }); error ? fail(error) : (flash('Brand added.'), route()); });
  document.getElementById('brandlist2')?.addEventListener('click', async (e) => {
    const r = e.target.closest('.ren'), d = e.target.closest('.del');
    if (r) { const n = (prompt('Rename brand:', r.dataset.b) || '').trim(); if (!n || n === r.dataset.b) return; const { error } = await sb.rpc('rename_brand', { old_nm: r.dataset.b, new_nm: n }); error ? fail(error) : (flash('Brand renamed.'), route()); }
    if (d && confirm(`Delete the brand "${d.dataset.b}"? Its products will have no brand.`)) { const { error } = await sb.rpc('delete_brand', { nm: d.dataset.b }); error ? fail(error) : (flash('Brand deleted.'), route()); }
  });
  if (document.querySelector('.stockbox')) {
    const box = document.querySelector('.stockbox'), bpb = box.querySelector('[name=bags_per_bundle]'), N = () => { const n = parseInt(bpb.value, 10); return n >= 2 ? n : 0; };
    const draw = (row, total) => { const n = N(), bag = row.querySelector('.sbagin'), bi = row.querySelector('.sbundin'), li = row.querySelector('.slooin'); row.querySelectorAll('.sbund').forEach((x) => (x.hidden = !n)); row.querySelector('.sbags').hidden = !!n;
      if (n) { bi.value = Math.floor(total / n); li.value = total % n; } bag.value = total; row.querySelector('[name^=inv_]').value = total; row.querySelector('.sbtot').textContent = n ? `= ${total} bags (${Math.floor(total / n)} bundles + ${total % n} bags)` : ''; };
    const rows = [...box.querySelectorAll('.stockrow')], totalOf = (row) => (N() ? (parseInt(row.querySelector('.sbundin').value, 10) || 0) * N() + (parseInt(row.querySelector('.slooin').value, 10) || 0) : parseInt(row.querySelector('.sbagin').value, 10) || 0);
    rows.forEach((r) => { draw(r, parseInt(r.dataset.orig, 10) || 0); r.addEventListener('input', () => draw(r, Math.max(0, totalOf(r)))); });
    bpb.addEventListener('input', () => rows.forEach((r) => draw(r, parseInt(r.querySelector('[name^=inv_]').value, 10) || 0)));
  }
  if (document.getElementById('techchecks')) {
    const mark = (id, ok, msg) => { const li = document.querySelector(`#techchecks [data-check=${id}]`); if (!li) return; li.className = ok ? 'ok' : 'bad'; li.querySelector('.ci').innerHTML = ok ? ':ic-check-circle:' : ':ic-alert:'; if (!ok) li.querySelector('div').insertAdjacentHTML('beforeend', `<small class="muted">${msg}</small>`); };
    const probe = async (file, id, label, hint) => { try { const r = await fetch(file, { cache: 'no-store' }), t = r.ok ? await r.text() : ''; const ok = r.ok && !/<!doctype html/i.test(t.slice(0, 200)); mark(id, ok, ok ? '' : hint); } catch { mark(id, false, hint); } };
    probe('sitemap.xml', 'sitemap', 'sitemap', 'Not found yet — it is created when the site is deployed. Check that your deploy runs the build step.'); probe('robots.txt', 'robots', 'robots', 'Not found yet — it is created when the site is deployed.');
    document.querySelectorAll('#techchecks li.wait').forEach((li) => (li.className = 'wait'));
  }
  if (document.querySelector('.seotable')) {
    const run = () => { const t = document.getElementById('seoq').value.toLowerCase().trim(), f = document.querySelector('#seofilter .on').dataset.f; document.querySelectorAll('.seorow').forEach((r) => { const ok = (!t || r.dataset.q.includes(t)) && (!f || (f === 'issues' ? Number(r.dataset.issues) > 0 : r.dataset.kind === f)); r.hidden = !ok; const q2 = document.querySelector(`.qerow[data-for="${r.dataset.key}"]`); if (!ok && q2) q2.hidden = true; }); };
    document.getElementById('seoq').addEventListener('input', run); document.getElementById('seofilter').addEventListener('click', (e) => { const b = e.target.closest('[data-f]'); if (!b) return; document.querySelectorAll('#seofilter .chip').forEach((x) => x.classList.toggle('on', x === b)); run(); });
    document.querySelector('.seotable').addEventListener('click', (e) => {
      const qe = e.target.closest('.qe'); if (qe) { const row = document.querySelector(`.qerow[data-for="${qe.dataset.key}"]`); row.hidden = !row.hidden; return; }
      const sg = e.target.closest('.suggest'); if (sg) { const f = sg.closest('form'), name = f.dataset.name, brand = f.dataset.brand, rv = f.dataset.rv;
        let title = `${brand && !name.toLowerCase().includes(brand.toLowerCase()) ? brand + ' ' : ''}${name}${rv && !name.includes(rv) ? ' ' + rv : ''}`; if (title.length > 60) title = title.slice(0, 59).trimEnd() + '…';
        const base = clip(f.dataset.desc || name, 110), desc = clip(`${base}${/[.!?]$/.test(base) ? '' : '.'} Order online from ${seoSite()}.`, 160);
        if (!f.elements.seo_title.value) f.elements.seo_title.value = title; if (!f.elements.seo_description.value) f.elements.seo_description.value = desc; if (!f.elements.focus_keyword.value) f.elements.focus_keyword.value = name.toLowerCase().slice(0, 80); flash('Suggestions filled in — adjust and save.'); }
    });
    document.querySelector('.seotable').addEventListener('submit', async (e) => {
      const f = e.target.closest('.qeform'); if (!f) return; e.preventDefault(); const d = Object.fromEntries(new FormData(f)), upd = { seo_title: d.seo_title.trim(), seo_description: d.seo_description.trim(), focus_keyword: d.focus_keyword.trim() }; if ('image_alt' in d) upd.image_alt = d.image_alt.trim();
      const { error } = await sb.from(f.dataset.t).update(upd).eq('id', f.dataset.id); error ? fail(error) : (flash('Saved.'), route());
    });
  }
  document.getElementById('rdform')?.addEventListener('submit', async (e) => { e.preventDefault(); const f = Object.fromEntries(new FormData(e.target)); let from = f.from.trim(), to = f.to.trim();
    if (!from.startsWith('/')) from = '/' + from; if (!/^https?:\/\//i.test(to) && !to.startsWith('/')) to = '/' + to; if (from.replace(/\/+$/, '') === to.replace(/\/+$/, '')) return fail(new Error('Old and new address are the same.'));
    const { error } = await sb.from('seo_redirects').insert({ from_path: from, to_path: to }); error ? fail(error.code === '23505' ? new Error('That old path already has a redirect.') : error) : (flash('Redirect added — it goes live on the next deploy.'), route()); });
  document.querySelectorAll('.rddel').forEach((b) => b.addEventListener('click', async () => { if (!confirm('Delete this redirect?')) return; const { error } = await sb.from('seo_redirects').delete().eq('id', b.dataset.id); error ? fail(error) : route(); }));
  document.querySelectorAll('.cartdone').forEach((b) => b.addEventListener('click', async () => { const { error } = await sb.from('carts').update({ handled: true }).eq('id', b.dataset.id); error ? fail(error) : route(); }));
  document.querySelectorAll('.cartdel').forEach((b) => b.addEventListener('click', async () => { if (!confirm('Delete this saved cart?')) return; const { error } = await sb.from('carts').delete().eq('id', b.dataset.id); error ? fail(error) : route(); }));
  document.getElementById('spamdel')?.addEventListener('click', async () => { const ids = [...document.querySelectorAll('#spamtable tr[data-flagged="1"]')].map((r) => r.dataset.id); if (!ids.length || !confirm(`Permanently delete ${ids.length} flagged account${ids.length === 1 ? '' : 's'}? Accounts with orders are skipped.`)) return; const { data, error } = await sb.rpc('delete_spam_users', { ids }); error ? fail(error) : (flash(`${data} account${data === 1 ? '' : 's'} deleted.`), route()); });
  document.getElementById('domform')?.addEventListener('submit', async (e) => { e.preventDefault(); const d = new FormData(e.target).get('domain').trim().toLowerCase().replace(/^.*@/, '').replace(/^https?:\/\//, '').replace(/\/.*$/, ''); const { error } = await sb.from('blocked_email_domains').insert({ domain: d }); error ? fail(error.code === '23505' ? new Error('Already blocked.') : error) : (flash(`${d} blocked.`), route()); });
  document.querySelectorAll('.domdel').forEach((b) => b.addEventListener('click', async () => { const { error } = await sb.from('blocked_email_domains').delete().eq('domain', b.dataset.d); error ? fail(error) : route(); }));
  document.getElementById('setf')?.addEventListener('change', (e) => { const c = e.target.closest('.hclosed'); if (c) c.closest('.hrow').querySelectorAll('input[type=time]').forEach((x) => (x.disabled = c.checked)); });
  if (document.querySelector('.revmod')) bindReviewMod();
  document.getElementById('addzone')?.addEventListener('click', () => document.getElementById('zonerows').insertAdjacentHTML('beforeend', zoneRow()));
  document.getElementById('zonerows')?.addEventListener('click', (e) => e.target.closest('.rmzone')?.closest('.zoneedit').remove());
  document.getElementById('addspec')?.addEventListener('click', () => document.getElementById('specrows').insertAdjacentHTML('beforeend', specRow()));
  document.getElementById('adddoc')?.addEventListener('click', () => document.getElementById('docrows').insertAdjacentHTML('beforeend', docRow()));
  document.querySelector('.detailbox')?.addEventListener('click', (e) => e.target.closest('.rmkv')?.closest('.kvedit').remove());
  document.getElementById('docfile')?.addEventListener('change', async (e) => {
    const f = e.target.files[0]; e.target.value = ''; if (!f) return; if (f.size > 15 * 1024 * 1024) return fail(new Error('Documents must be under 15 MB.'));
    const path = `${Date.now()}-${f.name.replace(/[^a-zA-Z0-9.]+/g, '-').slice(-70)}`, up = await sb.storage.from('product-docs').upload(path, f, { contentType: f.type || 'application/pdf' }); if (up.error) return fail(up.error);
    document.getElementById('docrows').insertAdjacentHTML('beforeend', docRow({ label: f.name.replace(/\.[^.]+$/, ''), url: sb.storage.from('product-docs').getPublicUrl(path).data.publicUrl })); flash('File uploaded — remember to save the product.');
  });
  document.getElementById('addpack')?.addEventListener('click', () => { const box = document.getElementById('packrows'); box.insertAdjacentHTML('beforeend', packRow({}, box.children.length, { unit: document.querySelector('[name=unit]')?.value || 'unit', price_cents: Math.round((parseFloat(document.querySelector('[name=price]')?.value) || 0) * 100) })); });
  document.getElementById('packbox')?.addEventListener('click', (e) => e.target.closest('.rmpack')?.closest('.packedit').remove());
  document.getElementById('packbox')?.addEventListener('input', (e) => { const f = e.target.dataset?.f; if (!['units', 'per', 'price'].includes(f)) return; const r = e.target.closest('.packedit'), q = (n) => r.querySelector(`[data-f=${n}]`), u = parseInt(q('units').value, 10), cents = (v) => Math.round((parseFloat(v) || 0) * 100);
    if (!(u >= 2)) return;
    if (f === 'per' && q('per').value !== '') q('price').value = (cents(q('per').value) * u / 100).toFixed(2);
    else if (f === 'price' && q('price').value !== '') q('per').value = (Math.round(cents(q('price').value) / u) / 100).toFixed(2);
    else if (f === 'units') { if (q('per').value !== '') q('price').value = (cents(q('per').value) * u / 100).toFixed(2); else if (q('price').value !== '') q('per').value = (Math.round(cents(q('price').value) / u) / 100).toFixed(2); } });
  const calcAll = () => { const single = Math.round((parseFloat(document.querySelector('[name=price]')?.value) || 0) * 100); document.querySelectorAll('.packedit').forEach((r) => packCalc(r, single)); };
  document.getElementById('packbox')?.addEventListener('input', calcAll); document.querySelector('[name=price]')?.addEventListener('input', calcAll); calcAll();
  document.getElementById('seoform')?.addEventListener('submit', async (e) => {
    e.preventDefault(); const f = Object.fromEntries(new FormData(e.target));
    const value = { site_title: f.site_title.trim(), home_title: f.home_title.trim(), description: f.description.trim(), og_image: safeUrl(f.og_image.trim()), site_url: f.site_url.trim().replace(/\/+$/, ''), twitter: (f.twitter || '').trim(), gsc: (f.gsc || '').trim().replace(/[^\w-]/g, ''), ga4: /^G-[A-Za-z0-9]+$/.test((f.ga4 || '').trim()) ? f.ga4.trim() : '', noindex: f.noindex === 'on' };
    const { error } = await sb.from('site_settings').upsert({ key: 'seo', value, updated_at: new Date().toISOString() }); if (error) return fail(error);
    SEO = value; flash('SEO settings saved.'); route();
  });
  wireSeoBox(document, sub === 'pages' ? '#pg_title' : '[name=name]', sub === 'pages' ? '#pg_body' : '[name=name], [name=description], [name=long_description]');
  document.getElementById('shoptoggle')?.addEventListener('click', () => { if (shopClosed()) setShopClosed(false); else { const m = prompt('Message for customers (optional):', STORE.closed_message || ''); if (m !== null) setShopClosed(true, m.trim().slice(0, 300)); } });
  // team
  document.getElementById('teamsearch')?.addEventListener('submit', (e) => { e.preventDefault(); const v = new FormData(e.target).get('search').trim(); location.hash = '#/admin/team' + (v ? '?search=' + encodeURIComponent(v) : ''); });
  document.querySelectorAll('.rolesel').forEach((el) => el.addEventListener('change', async () => {
    const { error } = await sb.rpc('set_role', { uid: el.dataset.id, new_role: el.value }); if (error) fail(error); else flash('Role updated.'); route();
  }));
  // invoices (list + detail)
  document.getElementById('invsearch')?.addEventListener('submit', (e) => { e.preventDefault(); const n = new URLSearchParams(q); const v = new FormData(e.target).get('search').trim(); v ? n.set('search', v) : n.delete('search'); location.hash = '#/admin/invoices?' + n; });
  document.getElementById('taskform')?.addEventListener('submit', async (e) => { e.preventDefault(); const f = new FormData(e.target); const { error } = await sb.from('admin_tasks').insert({ title: String(f.get('title')).trim(), due_on: f.get('due') || null }); if (error) return fail(error); route(); });
  document.querySelectorAll('.tasktoggle').forEach((c) => c.addEventListener('change', async () => { const { error } = await sb.from('admin_tasks').update({ done: c.checked, done_at: c.checked ? new Date().toISOString() : null }).eq('id', c.dataset.id); if (error) return fail(error); route(); }));
  document.querySelectorAll('.taskdel').forEach((b) => b.addEventListener('click', async () => { const { error } = await sb.from('admin_tasks').delete().eq('id', b.dataset.id); if (error) return fail(error); route(); }));
  document.getElementById('taxcsv')?.addEventListener('click', () => download('tax-report.csv', [['Month', 'Sales before tax', 'Tax on orders', 'Tax on invoices', 'Total tax'], ...[...document.querySelectorAll('#taxtable tr[data-csv]')].map((tr) => JSON.parse(tr.dataset.csv))]));
  document.getElementById('remindall')?.addEventListener('click', async (e) => {
    const ids = e.currentTarget.dataset.ids.split(',').map(Number); if (!confirm(`Email a payment reminder to ${ids.length} customer${ids.length === 1 ? '' : 's'} with an overdue invoice?`)) return;
    e.currentTarget.disabled = true; let ok = 0, bad = 0;
    for (const iid of ids) { const { error } = await sb.rpc('send_invoice', { iid, via_email: true, via_sms: false, base: location.origin + location.pathname, to_email: null, to_phone: null }); error ? bad++ : ok++; }
    flash(`Reminders queued: ${ok}${bad ? `, ${bad} failed` : ''}.`, bad ? 'error' : 'ok'); route();
  });
  document.getElementById('invcsv')?.addEventListener('click', () => download('invoices.csv', [['Number', 'Customer', 'Issued', 'Due', 'Total', 'Balance', 'Status'], ...[...document.querySelectorAll('#invtable tr[data-csv]')].map((r) => JSON.parse(r.dataset.csv))]));
  document.querySelector('.dupinv')?.addEventListener('click', async () => {
    if (!LASTDOC) return; const { inv, items } = LASTDOC, d = (n) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10), days = Math.max(0, Math.round((new Date(inv.due_date) - new Date(inv.issue_date)) / 864e5)) || 14;
    const { data, error } = await sb.rpc('save_invoice', { inv: { id: null, customer_id: inv.customer_id || null, customer_name: inv.customer_name, customer_email: inv.customer_email, customer_address: inv.customer_address, notes: inv.notes, terms: inv.terms, discount_cents: inv.discount_cents, tax_rate: inv.tax_rate, tax_label: inv.tax_label, issue_date: d(0), due_date: d(days) },
      items: items.map((i) => ({ description: i.description, qty: i.qty, unit_price_cents: i.unit_price_cents, taxable: i.taxable, product_id: i.product_id || null })) });
    error ? fail(error) : (flash('Invoice duplicated as a draft.'), location.hash = `#/admin/invoices/${data}`);
  });
  document.querySelectorAll('[data-invact]').forEach((b) => b.addEventListener('click', async () => {
    const act = b.dataset.invact; if (act === 'void' && !confirm('Void this invoice?')) return;
    const { error } = await sb.rpc('set_invoice_status', { iid: Number(id), new_status: act }); error ? fail(error) : (flash(act === 'sent' ? 'Invoice marked as sent — the customer has been emailed if email is set up.' : 'Invoice updated.'), route());
  }));
  document.getElementById('invdel')?.addEventListener('click', async () => { if (!confirm('Delete this invoice permanently?')) return; const { error } = await sb.rpc('delete_invoice', { iid: Number(id) }); error ? fail(error) : (flash('Invoice deleted.'), (location.hash = '#/admin/invoices')); });
  document.getElementById('payform')?.addEventListener('submit', async (e) => {
    e.preventDefault(); const f = Object.fromEntries(new FormData(e.target));
    const { error } = await sb.rpc('record_invoice_payment', { iid: Number(id), amount: Math.round(parseFloat(f.amount) * 100), pay_method: f.method, ref: f.ref || '', paid: f.paid || todayStr(), memo: '' }); error ? fail(error) : (flash('Payment recorded.'), route());
  });
  document.querySelectorAll('.delpay').forEach((b) => b.addEventListener('click', async () => { if (!confirm('Remove this payment?')) return; const { error } = await sb.rpc('delete_invoice_payment', { pid: Number(b.dataset.id) }); error ? fail(error) : route(); }));
  // statements / expenses / P&L
  document.getElementById('stmtfrom')?.addEventListener('change', (e) => { location.hash = `#/admin/statements/${id}?from=${e.target.value || 'all'}`; });
  document.getElementById('sendstmt')?.addEventListener('click', async () => { const { data, error } = await sb.rpc('send_statement', { cid: STMT.cid, mail: STMT.mail, nm: STMT.name, base: location.origin + location.pathname }); if (error) return fail(error); flash(data.ready ? 'Statement is on its way — see the delivery log under Settings → Messaging.' : 'Sending isn’t connected yet — connect it in Settings → Messaging.', data.ready ? 'ok' : 'error'); });
  document.getElementById('plrange')?.addEventListener('submit', (e) => { e.preventDefault(); const f = Object.fromEntries(new FormData(e.target)); if (!f.from || !f.to || f.from > f.to) return fail(new Error('Choose a valid date range.')); location.hash = `#/admin/profit?p=custom&from=${f.from}&to=${f.to}`; });
  document.getElementById('plcsv')?.addEventListener('click', () => download('profit-and-loss.csv', [['Line', 'Amount'], ...PNL]));
  document.getElementById('expcsv')?.addEventListener('click', () => download('expenses.csv', [['Date', 'Vendor', 'Category', 'Description', 'Amount', 'Tax', 'Paid with'], ...[...document.querySelectorAll('#exptable tr[data-csv]')].map((r) => JSON.parse(r.dataset.csv))]));
  document.getElementById('expform')?.addEventListener('submit', async (e) => {
    e.preventDefault(); const f = new FormData(e.target), btn = e.target.querySelector('button'); btn.disabled = true; const file = f.get('receipt'); let path = '';
    if (file && file.size) { if (file.size > 10 * 1024 * 1024) { btn.disabled = false; return fail(new Error('Receipt must be under 10 MB.')); }
      path = `${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9.]+/g, '-').slice(-60)}`; const up = await sb.storage.from('expense-receipts').upload(path, file, { contentType: file.type }); if (up.error) { btn.disabled = false; return fail(up.error); } }
    const cents = (v) => Math.round((parseFloat(v) || 0) * 100), amount = cents(f.get('amount')), tax = cents(f.get('tax'));
    if (tax > amount) { btn.disabled = false; return fail(new Error('Sales tax cannot be more than the total.')); }
    const { error } = await sb.from('expenses').insert({ spent_on: f.get('spent_on'), vendor: f.get('vendor').trim(), category: f.get('category').trim(), description: f.get('description').trim(), amount_cents: amount, tax_cents: tax, payment_method: f.get('payment_method'), receipt_path: path });
    btn.disabled = false; error ? fail(error) : (flash('Expense saved.'), route());
  });
  document.querySelectorAll('.viewrec').forEach((b) => b.addEventListener('click', async () => { const w = window.open('', '_blank'); const { data, error } = await sb.storage.from('expense-receipts').createSignedUrl(b.dataset.path, 60); if (error) { w?.close(); return fail(error); } if (w) w.location = data.signedUrl; else location.href = data.signedUrl; }));
  document.querySelectorAll('.delexp').forEach((b) => b.addEventListener('click', async () => { if (!confirm('Delete this expense?')) return; const { error } = await sb.from('expenses').delete().eq('id', b.dataset.id); if (error) return fail(error); if (b.dataset.path) await sb.storage.from('expense-receipts').remove([b.dataset.path]); route(); }));
  // sending invoices / estimates
  const box = document.getElementById('sendbox');
  if (box) {
    const kind = box.dataset.kind, docId = Number(box.dataset.id), enc = encodeURIComponent, $ = (i) => document.getElementById(i);
    const refresh = () => { $('sd_mailto').href = `mailto:${$('sd_to').value.trim()}?subject=${enc(box.dataset.subject)}&body=${enc(box.dataset.text)}`; $('sd_smslink').href = `sms:${$('sd_phone').value.replace(/[^0-9+]/g, '')}?&body=${enc(box.dataset.text)}`; };
    $('sd_to').addEventListener('input', () => { $('sd_email').checked = !!$('sd_to').value.trim(); refresh(); }); $('sd_phone').addEventListener('input', () => { if ($('sd_phone').value.trim()) $('sd_sms').checked = true; refresh(); });
    document.getElementById('opensend')?.addEventListener('click', () => { box.hidden = !box.hidden; if (!box.hidden) box.scrollIntoView({ behavior: 'smooth', block: 'center' }); });
    $('sd_copy').addEventListener('click', async () => { try { await navigator.clipboard.writeText(box.dataset.link); flash('Link copied — paste it into any message.'); } catch { prompt('Copy this link:', box.dataset.link); } });
    $('sd_share').addEventListener('click', () => navigator.share?.({ title: box.dataset.subject, text: box.dataset.text, url: box.dataset.link }).catch(() => {}));
    const sendNow = async () => {
      const em = $('sd_email').checked, sm = $('sd_sms').checked; if (!em && !sm) return fail(new Error('Tick email, text, or both — or use the buttons below to send it yourself.'));
      const btn = $('sd_go'); btn.disabled = true;
      let attached = false;
      if (em) { try { const r = await buildPdf(); if (r) { const up = await sb.storage.from('doc-pdfs').upload(`${r.kind}/${r.id}.pdf`, r.doc.output('blob'), { contentType: 'application/pdf', upsert: true }); attached = !up.error; if (up.error) console.warn('PDF not attached:', up.error.message); } } catch (err) { console.warn('PDF not attached:', err); } }
      const args = { via_email: em, via_sms: sm, base: location.origin + location.pathname, to_email: $('sd_to').value.trim() || null, to_phone: $('sd_phone').value.trim() || null };
      const { data, error } = await sb.rpc(kind === 'invoice' ? 'send_invoice' : 'send_estimate', kind === 'invoice' ? { iid: docId, ...args } : { eid: docId, ...args }); btn.disabled = false;
      if (error) return fail(error);
      flash(data.ready ? `Sending${attached ? ' with the PDF attached' : ''}… the delivery log below will show the result.` : 'Marked as sent, but sending isn’t connected yet — use the buttons below to send it yourself, or connect it in Settings.', data.ready ? 'ok' : 'error'); route();
      if (data.ready) setTimeout(() => { if (location.hash.includes(`/${kind === 'invoice' ? 'invoices' : 'estimates'}/${docId}`)) route(); }, 4000);
    };
    $('sd_go').addEventListener('click', sendNow);
    for (const aid of ['sd_mailto', 'sd_smslink']) $(aid).addEventListener('click', () => { flash('Opened — once you’ve sent it, click “Mark as sent” so your records match.'); });
  }
  // messaging settings
  document.getElementById('msgtest')?.addEventListener('submit', async (e) => {
    e.preventDefault(); const f = Object.fromEntries(new FormData(e.target));
    const { data, error } = await sb.rpc('send_test_message', { channel: f.channel, to_addr: f.to, base: location.origin + location.pathname }); if (error) return fail(error);
    flash(data.ready ? 'Test sent — checking the result…' : 'The sending service isn’t connected yet.', data.ready ? 'ok' : 'error'); setTimeout(route, 3500);
  });
  // estimates + recurring
  document.querySelectorAll('[data-estact]').forEach((b) => b.addEventListener('click', async () => { const { error } = await sb.rpc('set_estimate_status', { eid: Number(id), new_status: b.dataset.estact }); error ? fail(error) : (flash('Estimate updated.'), route()); }));
  document.getElementById('estconvert')?.addEventListener('click', async () => { if (!confirm('Convert this estimate into an invoice?')) return; const { data, error } = await sb.rpc('convert_estimate', { eid: Number(id) }); error ? fail(error) : (flash('Invoice created from the estimate.'), (location.hash = `#/admin/invoices/${data}`)); });
  document.getElementById('estdel')?.addEventListener('click', async () => { if (!confirm('Delete this estimate?')) return; const { error } = await sb.rpc('delete_estimate', { eid: Number(id) }); error ? fail(error) : (location.hash = '#/admin/estimates'); });
  document.getElementById('runrec')?.addEventListener('click', async () => { const { data, error } = await sb.rpc('run_recurring_invoices'); error ? fail(error) : (flash(data ? `${data} invoice${data === 1 ? '' : 's'} created.` : 'Nothing was due.'), route()); });
  document.querySelectorAll('.togrec').forEach((b) => b.addEventListener('click', async () => { const { error } = await sb.rpc('set_recurring_active', { rid: Number(b.dataset.id), on_off: b.dataset.on !== 'true' }); error ? fail(error) : route(); }));
  document.querySelectorAll('.delrec').forEach((b) => b.addEventListener('click', async () => { if (!confirm('Delete this recurring invoice? Invoices already created are kept.')) return; const { error } = await sb.rpc('delete_recurring', { rid: Number(b.dataset.id) }); error ? fail(error) : route(); }));
  // invoice editor
  const ivl = document.getElementById('ivlines');
  if (ivl && INV) {
    const blank = () => ({ description: '', qty: 1, unit_price_cents: 0, taxable: true, product_id: null });
    const retot = () => { document.getElementById('iv_totals').innerHTML = invTotalsHtml(); ivl.querySelectorAll('tr').forEach((tr, i) => { tr.querySelector('.amt').textContent = money(Math.round(INV.items[i].qty * INV.items[i].unit_price_cents)); }); };
    const redraw = () => { ivl.innerHTML = INV.items.map(invLineRow).join(''); retot(); };
    ivl.addEventListener('input', (e) => { const tr = e.target.closest('tr'), k = e.target.dataset.k; if (!tr || !k) return; const l = INV.items[Number(tr.dataset.i)];
      if (k === 'description') l.description = e.target.value; else if (k === 'qty') l.qty = parseFloat(e.target.value) || 0; else if (k === 'price') l.unit_price_cents = Math.round((parseFloat(e.target.value) || 0) * 100); else if (k === 'taxable') l.taxable = e.target.checked; retot(); });
    ivl.addEventListener('click', (e) => { const d = e.target.closest('[data-del]'); if (!d) return; INV.items.splice(Number(d.dataset.del), 1); if (!INV.items.length) INV.items.push(blank()); redraw(); });
    document.getElementById('iv_add').addEventListener('click', () => { INV.items.push(blank()); redraw(); });
    document.getElementById('iv_prod').addEventListener('change', (e) => { const pr = INV.prods.find((x) => String(x.id) === e.target.value); if (pr) { INV.items = INV.items.filter((l) => l.description.trim() || l.unit_price_cents); INV.items.push({ description: pr.name, qty: 1, unit_price_cents: pr.price_cents, taxable: true, product_id: pr.id }); redraw(); } e.target.value = ''; });
    document.getElementById('iv_preset')?.addEventListener('change', (e) => { const p = INV.presets.find((x) => String(x.id) === e.target.value); if (p) { INV.items = INV.items.filter((l) => l.description.trim() || l.unit_price_cents); INV.items.push({ description: p.description, qty: 1, unit_price_cents: p.unit_price_cents, taxable: p.taxable, product_id: null }); redraw(); } e.target.value = ''; });
    document.getElementById('iv_savepreset')?.addEventListener('click', async () => { const l = [...INV.items].reverse().find((x) => x.description.trim()); if (!l) return fail(new Error('Fill in a line first.'));
      const { data, error } = await sb.from('invoice_presets').insert({ description: l.description.trim().slice(0, 300), unit_price_cents: l.unit_price_cents, taxable: l.taxable }).select().single(); if (error) return fail(error);
      INV.presets.push(data); const sel = document.getElementById('iv_preset'); sel.insertAdjacentHTML('beforeend', `<option value="${data.id}">${esc(data.description)} — ${money(data.unit_price_cents)}</option>`); flash('Saved — it’s now in the “Saved item” list.'); });
    document.getElementById('iv_disc').addEventListener('input', (e) => { INV.discount_cents = Math.round((parseFloat(e.target.value) || 0) * 100); retot(); });
    document.getElementById('iv_trate').addEventListener('input', (e) => { INV.tax_rate = parseFloat(e.target.value) || 0; retot(); });
    document.getElementById('iv_tlabel').addEventListener('input', (e) => { INV.tax_label = e.target.value; retot(); });
    document.getElementById('iv_name').addEventListener('input', (e) => { const c = INV.custs.find((x) => (x.name || x.email) === e.target.value); INV.customer_id = c ? c.id : ''; if (c) document.getElementById('iv_email').value = c.email; });
    document.querySelectorAll('.duebtn').forEach((b) => b.addEventListener('click', () => { document.getElementById('iv_due').value = addDays(document.getElementById('iv_issue')?.value || todayStr(), Number(b.dataset.n)); }));
    const save = async (send) => {
      const v = (i) => document.getElementById(i)?.value ?? '', items = INV.items.filter((l) => l.description.trim()).map((l) => ({ description: l.description.trim(), qty: l.qty, unit_price_cents: l.unit_price_cents, taxable: l.taxable, product_id: l.product_id }));
      if (!v('iv_name').trim()) return fail(new Error('Enter the customer name.')); if (!items.length) return fail(new Error('Add at least one line item with a description.')); if (items.some((l) => !(l.qty > 0))) return fail(new Error('Quantities must be above zero.'));
      const base = { id: INV.id, customer_id: INV.customer_id || null, customer_name: v('iv_name').trim(), customer_email: v('iv_email').trim(), customer_address: v('iv_addr'), notes: v('iv_notes'), terms: v('iv_terms'), discount_cents: INV.discount_cents, tax_rate: Number(INV.tax_rate) || 0, tax_label: INV.tax_label };
      if (INV.kind === 'recurring') {
        if (!v('rc_name').trim()) return fail(new Error('Give this recurring invoice a name.'));
        const rec = { ...base, name: v('rc_name').trim(), frequency: v('rc_freq'), every: parseInt(v('rc_every'), 10) || 1, next_run: v('rc_next'), end_date: v('rc_end') || null, due_days: parseInt(v('rc_due'), 10) || 0, auto_send: document.getElementById('rc_auto').checked };
        const { data, error } = await sb.rpc('save_recurring', { rec, items }); if (error) return fail(error); await sb.rpc('set_doc_phone', { doc: 'recurring', did: data, phone: v('iv_phone') }); flash('Recurring invoice saved.'); location.hash = '#/admin/invoices/recurring'; return;
      }
      if (INV.kind === 'estimate') {
        const { data, error } = await sb.rpc('save_estimate', { est: { ...base, issue_date: v('iv_issue'), expires_on: v('iv_due') }, items }); if (error) return fail(error);
        await sb.rpc('set_doc_phone', { doc: 'estimate', did: data, phone: v('iv_phone') });
        flash(send ? 'Estimate saved — choose how to send it.' : 'Estimate saved.'); location.hash = `#/admin/estimates/${data}${send ? '?send=1' : ''}`; return;
      }
      const { data, error } = await sb.rpc('save_invoice', { inv: { ...base, issue_date: v('iv_issue'), due_date: v('iv_due') }, items }); if (error) return fail(error);
      await sb.rpc('set_doc_phone', { doc: 'invoice', did: data, phone: v('iv_phone') });
      flash(send ? 'Invoice saved — choose how to send it.' : 'Invoice saved.'); location.hash = `#/admin/invoices/${data}${send ? '?send=1' : ''}`;
    };
    document.getElementById('iv_save').addEventListener('click', () => save(false)); document.getElementById('iv_send')?.addEventListener('click', () => save(true));
  }
  // suppliers
  document.querySelectorAll('.supform').forEach((fm) => fm.addEventListener('submit', async (e) => {
    e.preventDefault(); const f = new FormData(fm), row = { name: f.get('name').trim(), contact_name: f.get('contact_name').trim(), phone: f.get('phone').trim(), email: f.get('email').trim(), notes: f.get('notes').trim(), active: f.has('active') };
    const r = fm.dataset.id ? await sb.from('suppliers').update(row).eq('id', fm.dataset.id) : await sb.from('suppliers').insert(row);
    r.error ? fail(r.error.code === '23505' ? new Error('A supplier with that name already exists.') : r.error) : (flash('Supplier saved.'), route());
  }));
  // purchase orders
  const pol = document.getElementById('po_lines');
  if (pol && PO) {
    const tot = () => (document.getElementById('po_total').textContent = 'Total ' + money(Math.round(PO.lines.reduce((a, l) => a + (Number(l.qty) || 0) * (Number(l.unit_cost) || 0) * 100, 0))));
    const draw = () => { pol.innerHTML = PO.lines.map((l, i) => `<tr data-i="${i}"><td><select data-k="product"><option value="">— choose a product —</option>${PO.prods.map((x) => `<option value="${x.id}" ${x.id === l.product_id ? 'selected' : ''}>${esc(x.name)} (${x.stock} in stock)</option>`).join('')}</select></td><td><input data-k="qty" type="number" min="1" value="${l.qty}" style="width:90px"></td><td><input data-k="cost" type="number" step="0.01" min="0" value="${Number(l.unit_cost).toFixed(2)}" style="width:104px"></td><td class="r amt">${money(Math.round((Number(l.qty) || 0) * (Number(l.unit_cost) || 0) * 100))}</td><td><button type="button" class="crm" data-del="${i}" aria-label="Remove line">:ic-x:</button></td></tr>`).join(''); tot(); };
    draw();
    pol.addEventListener('input', (e) => { const tr = e.target.closest('tr'), k = e.target.dataset.k; if (!tr || !k) return; const l = PO.lines[Number(tr.dataset.i)];
      if (k === 'product') { l.product_id = Number(e.target.value) || ''; const pr = PO.prods.find((x) => x.id === l.product_id); if (pr && !Number(l.unit_cost)) l.unit_cost = pr.cost_cents / 100; draw(); return; }
      if (k === 'qty') l.qty = parseInt(e.target.value, 10) || 0; else l.unit_cost = parseFloat(e.target.value) || 0; tr.querySelector('.amt').textContent = money(Math.round((Number(l.qty) || 0) * (Number(l.unit_cost) || 0) * 100)); tot(); });
    pol.addEventListener('click', (e) => { const d = e.target.closest('[data-del]'); if (!d) return; PO.lines.splice(Number(d.dataset.del), 1); if (!PO.lines.length) PO.lines.push({ product_id: '', qty: 1, unit_cost: 0 }); draw(); });
    document.getElementById('po_add').addEventListener('click', () => { PO.lines.push({ product_id: '', qty: 1, unit_cost: 0 }); draw(); });
    const savePO = async () => {
      const lines = PO.lines.filter((l) => l.product_id && l.qty > 0); if (!lines.length) { fail(new Error('Add at least one product.')); return null; }
      const row = { supplier_id: Number(document.getElementById('po_sup').value) || null, location_id: Number(document.getElementById('po_loc').value) || null, expected_at: document.getElementById('po_exp').value || null, notes: document.getElementById('po_notes').value };
      const r = PO.id ? await sb.from('purchase_orders').update(row).eq('id', PO.id).select('id').single() : await sb.from('purchase_orders').insert(row).select('id').single(); if (r.error) { fail(r.error); return null; }
      const pid = r.data.id; await sb.from('purchase_order_items').delete().eq('po_id', pid);
      const ins = await sb.from('purchase_order_items').insert(lines.map((l) => ({ po_id: pid, product_id: l.product_id, qty: l.qty, unit_cost_cents: Math.round(Number(l.unit_cost) * 100) }))); if (ins.error) { fail(ins.error); return null; }
      PO.id = pid; return pid;
    };
    document.getElementById('po_save').addEventListener('click', async () => { const pid = await savePO(); if (pid) { flash('Purchase order saved.'); location.hash = `#/admin/purchasing/${pid}`; } });
    document.getElementById('po_order')?.addEventListener('click', async () => { const pid = await savePO(); if (!pid) return; const { error } = await sb.from('purchase_orders').update({ status: 'ordered' }).eq('id', pid); error ? fail(error) : (flash('Marked as ordered.'), route()); });
    document.getElementById('po_receive')?.addEventListener('click', async () => {
      if (!confirm('Receive this order? The quantities will be added to stock at the delivery location and unit costs update your product costs.')) return;
      const pid = await savePO(); if (!pid) return; const { error } = await sb.rpc('receive_purchase_order', { poid: pid }); error ? fail(error) : (flash('Stock received.'), route());
    });
    document.getElementById('po_cancel')?.addEventListener('click', async () => { if (!confirm('Cancel this purchase order?')) return; const { error } = await sb.from('purchase_orders').update({ status: 'cancelled' }).eq('id', PO.id); error ? fail(error) : route(); });
  }
  document.getElementById('ordsearch')?.addEventListener('submit', (e) => { e.preventDefault(); const n = new URLSearchParams(q); const v = new FormData(e.target).get('search').trim(); v ? n.set('search', v) : n.delete('search'); location.hash = '#/admin/orders?' + n; });
  const upd = () => { const c = document.querySelectorAll('.osel:checked').length; const el = document.getElementById('selcount'); if (el) el.textContent = c; };
  document.getElementById('selall')?.addEventListener('change', (e) => { document.querySelectorAll('.osel').forEach((x) => (x.checked = e.target.checked)); upd(); });
  document.querySelectorAll('.osel').forEach((x) => x.addEventListener('change', upd));
  document.getElementById('bulkslips')?.addEventListener('click', () => { const ids = [...document.querySelectorAll('.osel:checked')].map((x) => x.value); if (!ids.length) return fail(new Error('Select at least one order.')); location.hash = `#/admin/orders/slips?ids=${ids.join(',')}`; });
  document.getElementById('bulkapply')?.addEventListener('click', async () => {
    const ids = [...document.querySelectorAll('.osel:checked')].map((x) => Number(x.value)), st = document.getElementById('bulkstatus').value;
    if (!ids.length) return fail(new Error('Select at least one order.')); if (!confirm(`Mark ${ids.length} order${ids.length === 1 ? '' : 's'} as ${st}?`)) return;
    let bad = 0; for (const oid of ids) { const { error } = await sb.rpc('set_order_status', { oid, new_status: st }); if (error) bad++; }
    flash(bad ? `${ids.length - bad} updated, ${bad} failed.` : `${ids.length} order${ids.length === 1 ? '' : 's'} updated.`, bad ? 'error' : 'ok'); route();
  });
  document.getElementById('printbtn')?.addEventListener('click', () => window.print());
  document.getElementById('noteform')?.addEventListener('submit', async (e) => {
    e.preventDefault(); const { error } = await sb.from('order_notes').insert({ order_id: Number(id), note: new FormData(e.target).get('note').trim(), author: profile?.name || '' }); error ? fail(error) : route();
  });
  document.getElementById('refundform')?.addEventListener('submit', async (e) => {
    e.preventDefault(); const f = Object.fromEntries(new FormData(e.target)), amount = Math.round(parseFloat(f.amount) * 100);
    if (!confirm(`Record a refund of ${money(amount)}?`)) return;
    const { error } = await sb.rpc('refund_order', { oid: Number(id), amount, why: f.reason || '' }); error ? fail(error) : (flash('Refund recorded.'), route());
  });
  document.getElementById('custform')?.addEventListener('submit', async (e) => {
    e.preventDefault(); const f = Object.fromEntries(new FormData(e.target)), tags = f.tags.split(',').map((t) => t.trim()).filter(Boolean).slice(0, 12);
    const { error } = await sb.from('customer_info').upsert({ user_id: e.target.dataset.id, notes: f.notes, tags, updated_at: new Date().toISOString() }); error ? fail(error) : flash('Saved.');
  });
  document.getElementById('setf')?.addEventListener('submit', async (e) => {
    e.preventDefault(); const f = Object.fromEntries(new FormData(e.target)), cents = (v) => Math.max(0, Math.round((parseFloat(v) || 0) * 100));
    const hours = {}; document.querySelectorAll('#setf .hrow').forEach((r) => { hours[r.dataset.d] = r.querySelector('.hclosed').checked ? '' : `${r.querySelector('.hfrom').value}-${r.querySelector('.hto').value}`; });
    const value = { hours, tz: f.tz || 'America/Toronto', closed: f.closed === 'on', closed_message: (f.closed_message || '').trim().slice(0, 300), closed_until: f.closed_until || '', ship_zones: [...document.querySelectorAll('#zonerows .zoneedit')].map((r) => ({ label: r.querySelector('[data-f=label]').value.trim(), prefixes: r.querySelector('[data-f=prefixes]').value.split(',').map((x) => x.trim()).filter(Boolean), fee_cents: cents(r.querySelector('[data-f=fee]').value) })).filter((z) => z.prefixes.length).slice(0, 30), ship_flat_cents: cents(f.ship), free_over_cents: cents(f.free), tax_rate: Math.min(50, Math.max(0, parseFloat(f.tax_rate) || 0)), tax_label: (f.tax_label || 'Tax').trim().slice(0, 30),
      biz: { legal_name: f.legal_name.trim(), address: f.address.trim(), phone: f.phone.trim(), email: f.email.trim(), tax_number: f.tax_number.trim() },
      invoice_prefix: (f.invoice_prefix || 'INV').trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10) || 'INV', invoice_due_days: Math.min(365, Math.max(0, parseInt(f.invoice_due_days, 10) || 14)), invoice_terms: f.invoice_terms.trim(), invoice_pay_info: f.invoice_pay_info.trim(), invoice_allow_partial: !!f.invoice_allow_partial };
    const { error } = await sb.from('site_settings').upsert({ key: 'store', value, updated_at: new Date().toISOString() }); if (error) return fail(error);
    applyStoreCfg(value); flash('Settings saved.'); route();
  });
  document.getElementById('trackform')?.addEventListener('submit', async (e) => {
    e.preventDefault(); const f = Object.fromEntries(new FormData(e.target));
    const { error } = await sb.rpc('set_order_tracking', { oid: Number(id), carrier: f.carrier, number: f.number }); error ? fail(error) : (flash('Tracking saved.'), route());
  });
  document.getElementById('ordloc')?.addEventListener('change', (e) => { location.hash = e.target.value ? `#/admin/orders?loc=${e.target.value}` : '#/admin/orders'; });
  // competitor prices
  document.getElementById('cmpsearch')?.addEventListener('input', (e) => { const t = e.target.value.toLowerCase(); document.querySelectorAll('#cmptable tr[data-name]').forEach((r) => (r.hidden = !r.dataset.name.includes(t))); });
  document.querySelectorAll('.cmpq').forEach((el) => el.addEventListener('change', async () => {
    const pid = Number(el.dataset.p), cid = Number(el.dataset.c);
    if (el.value.trim() === '') { const { error } = await sb.from('competitor_prices').delete().eq('product_id', pid).eq('competitor_id', cid); return error ? fail(error) : (flash('Price removed.'), route()); }
    const v = parseFloat(el.value); if (!(v >= 0)) return fail(new Error('Enter a valid price.'));
    const { error } = await sb.from('competitor_prices').upsert({ product_id: pid, competitor_id: cid, price_cents: Math.round(v * 100), checked_at: new Date().toISOString() }, { onConflict: 'product_id,competitor_id' });
    error ? fail(error) : (flash('Price saved.'), route());
  }));
  document.getElementById('cmpall')?.addEventListener('click', async () => {
    if (!confirm('Mark every competitor price as checked today? Only do this if you have actually re-checked them.')) return;
    const { error } = await sb.from('competitor_prices').update({ checked_at: new Date().toISOString() }).gte('product_id', 0); error ? fail(error) : (flash('All prices marked as checked.'), route());
  });
  document.querySelectorAll('.togcomp').forEach((b) => b.addEventListener('click', async () => { const { error } = await sb.from('competitors').update({ active: b.dataset.active !== 'true' }).eq('id', b.dataset.id); error ? fail(error) : route(); }));
  document.getElementById('addcomp')?.addEventListener('submit', async (e) => {
    e.preventDefault(); const name = new FormData(e.target).get('name').trim(); if (!name) return;
    const { error } = await sb.from('competitors').insert({ name, sort: 100 }); error ? fail(error.code === '23505' ? new Error('That retailer already exists.') : error) : (flash('Retailer added.'), route());
  });
  document.getElementById('cmpform')?.addEventListener('submit', async (e) => {
    e.preventDefault(); const now = new Date().toISOString();
    for (const fs of e.target.querySelectorAll('.cmpset')) {
      const cid = Number(fs.dataset.c), price = fs.querySelector('[name=price]').value.trim(), url = fs.querySelector('[name=url]').value.trim();
      if (url && !/^https:\/\//i.test(url)) return fail(new Error('Links must start with https://'));
      if (price === '') { await sb.from('competitor_prices').delete().eq('product_id', CMPP.id).eq('competitor_id', cid); continue; }
      const { error } = await sb.from('competitor_prices').upsert({ product_id: CMPP.id, competitor_id: cid, price_cents: Math.round(parseFloat(price) * 100), url, note: fs.querySelector('[name=note]').value.trim(), in_stock: fs.querySelector('[name=in_stock]').checked, checked_at: now }, { onConflict: 'product_id,competitor_id' });
      if (error) return fail(error);
    }
    flash('Competitor prices saved.'); location.hash = '#/admin/compare';
  });
  // locations
  document.getElementById('lf')?.addEventListener('submit', async (e) => {
    e.preventDefault(); const f = new FormData(e.target), g = (k) => (f.get(k) || '').toString().trim();
    const row = { name: g('name'), kind: g('kind'), address: g('address'), city: g('city'), postcode: g('postcode'), phone: g('phone'), email: g('email'), hours: g('hours'), active: f.has('active'), pickup_enabled: f.has('pickup_enabled') };
    if (!row.name) return fail(new Error('Give the location a name.'));
    const res = LOC.id ? await sb.from('locations').update(row).eq('id', LOC.id).select('id').single() : await sb.from('locations').insert(row).select('id').single();
    if (res.error) return fail(res.error);
    if (f.has('make_default')) { const d = await sb.rpc('set_default_location', { lid: res.data.id }); if (d.error) return fail(d.error); }
    flash('Location saved.'); location.hash = '#/admin/locations';
  });
  document.getElementById('delloc')?.addEventListener('click', async () => {
    const n = (await sb.from('orders').select('id', { count: 'exact', head: true }).eq('location_id', LOC.id)).count;
    if (n) return fail(new Error(`This location has ${n} order${n === 1 ? '' : 's'} — mark it inactive instead of deleting.`));
    if (!confirm(`Delete "${LOC.name}" and its stock records?`)) return;
    const { error } = await sb.from('locations').delete().eq('id', LOC.id); error ? fail(error) : (flash('Location deleted.'), (location.hash = '#/admin/locations'));
  });
  // inventory
  if (document.getElementById('invst')) {
    const tb = document.getElementById('invtable'); let st = '';
    const run = () => { const t = (document.getElementById('invsearch').value || '').toLowerCase(), bf = document.getElementById('invbrandf').value, so = document.getElementById('invsort').value, key = { name: (r) => r.dataset.name, stock: (r) => Number(r.dataset.stock), cover: (r) => Number(r.dataset.cover), value: (r) => -Number(r.dataset.value) }[so];
      [...tb.querySelectorAll('tr[data-name]')].sort((a, b) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0)).forEach((r) => { tb.appendChild(r); r.hidden = !((r.dataset.name.includes(t) || r.dataset.brand.toLowerCase().includes(t)) && (!st || r.dataset.st === st) && (!bf || (bf === '__none' ? !r.dataset.brand : r.dataset.brand === bf))); }); };
    document.getElementById('invsearch').addEventListener('input', run); document.getElementById('invsort').addEventListener('change', run); document.getElementById('invbrandf').addEventListener('change', run);
    document.getElementById('invst').addEventListener('click', (e) => { const b = e.target.closest('[data-st]'); if (!b) return; st = b.dataset.st; document.querySelectorAll('#invst .chip').forEach((x) => x.classList.toggle('on', x === b)); run(); });
  }
  const refreshRow = (row) => { const N = Number(row.dataset.n) || 0, tot = [...row.querySelectorAll('.invq')].reduce((a, x) => a + (parseInt(x.value, 10) || 0), 0);
    row.querySelectorAll('.invcell').forEach((c) => { const q = parseInt(c.querySelector('.invq').value, 10) || 0; if (N) { c.querySelector('.invb').value = Math.floor(q / N); c.querySelector('.invl').value = q % N; c.querySelector('.invsub').textContent = `${Math.floor(q / N)} bundles + ${q % N} bags`; } });
    const t = row.querySelector('.invtot'); t.textContent = tot; t.classList.toggle('lowtot', tot <= 10); row.querySelector('.invtotsub').textContent = N ? `${Math.floor(tot / N)} bundles + ${tot % N} bags` : 'bags'; };
  const saveQty = async (el, v) => { const { error } = await sb.rpc('set_inventory', { pid: Number(el.dataset.p), lid: Number(el.dataset.l), new_qty: v, note: 'Manual adjustment' }); if (error) return fail(error); el.value = v; refreshRow(el.closest('tr')); flash('Stock updated.'); };
  document.querySelectorAll('.invq').forEach((el) => el.addEventListener('change', async () => { const v = parseInt(el.value, 10); if (!(v >= 0)) { el.value = 0; return fail(new Error('Quantity must be 0 or more.')); } await saveQty(el, v); }));
  document.querySelectorAll('.invb, .invl').forEach((el) => el.addEventListener('change', async () => { const c = el.closest('.invcell'), row = el.closest('tr'), N = Number(row.dataset.n), b = parseInt(c.querySelector('.invb').value, 10), l = parseInt(c.querySelector('.invl').value, 10);
    if (!(b >= 0) || !(l >= 0)) { refreshRow(row); return fail(new Error('Counts must be 0 or more.')); } await saveQty(c.querySelector('.invq'), b * N + l); }));
  document.querySelectorAll('.invn').forEach((el) => el.addEventListener('change', async () => {
    const raw = el.value.trim(), n = raw === '' ? null : parseInt(raw, 10); if (raw !== '' && !(n >= 2 && n <= 1000)) { fail(new Error('Bags per bundle must be a whole number from 2 to 1000 (or empty).')); return route(); }
    const { data, error } = await sb.rpc('set_bags_per_bundle', { pid: Number(el.dataset.p), n }); if (error) { fail(error); return route(); }
    flash(n ? `A bundle is now ${n} bags.${data?.selling_bundle_updated ? ' The selling bundle was updated to match (price per bag unchanged).' : ''}` : 'Bundle size cleared.'); route();
  }));
  document.getElementById('invmode')?.addEventListener('click', (e) => { const b = e.target.closest('[data-mode]'); if (!b) return; document.getElementById('invtable').classList.toggle('bymode', b.dataset.mode === 'bundles'); document.querySelectorAll('#invmode button').forEach((x) => x.classList.toggle('on', x === b)); });
  document.getElementById('tf')?.addEventListener('submit', async (e) => {
    e.preventDefault(); const f = Object.fromEntries(new FormData(e.target));
    const { error } = await sb.rpc('transfer_inventory', { pid: Number(f.pid), from_loc: Number(f.from), to_loc: Number(f.to), amount: parseInt(f.amount, 10), note: f.note || '' });
    error ? fail(error) : (flash('Stock transferred.'), route());
  });
  document.getElementById('invcsv')?.addEventListener('click', () => {
    const heads = [...document.querySelectorAll('#invtable tr:first-child th')].map((x) => x.textContent);
    const rows = [...document.querySelectorAll('#invtable tr[data-name]')].map((r) => [r.querySelector('b').textContent, r.dataset.brand, r.dataset.n, ...[...r.querySelectorAll('.invq')].map((i) => i.value), r.querySelector('.invtot').textContent, r.dataset.st, (Number(r.dataset.value) / 100).toFixed(2), r.dataset.cover === '9999' ? '' : r.dataset.cover]);
    download('inventory.csv', [heads, ...rows]);
  });
  // sales
  const nav = (extra) => { const n = new URLSearchParams(q); Object.entries(extra).forEach(([k, v]) => (v ? n.set(k, v) : n.delete(k))); location.hash = `#/admin/sales?${n}`; };
  document.getElementById('salesloc')?.addEventListener('change', (e) => nav({ loc: e.target.value }));
  document.getElementById('salessrc')?.addEventListener('change', (e) => nav({ source: e.target.value }));
  document.getElementById('salescsv')?.addEventListener('click', () => download('orders.csv', [['Order', 'Date', 'Location', 'Channel', 'Status', 'Customer', 'Total'], ...SALES_ROWS]));
  // point of sale
  if (document.getElementById('posgrid')) {
    const stockAt = (pid) => POS.inv.find((r) => r.product_id === pid && r.location_id === POS.loc)?.qty || 0;
    const drawGrid = () => {
      const term = (document.getElementById('possearch').value || '').toLowerCase();
      document.getElementById('posgrid').innerHTML = POS.prods.filter((x) => !term || x.name.toLowerCase().includes(term)).map((x) => { const st = stockAt(x.id); return `<button type="button" class="posbtn" data-id="${x.id}" ${st < 1 ? 'disabled' : ''}><b>${esc(x.name)}</b><span>${money(x.price_cents)} / ${esc(x.unit)}</span><small class="muted">${st} here</small></button>`; }).join('') || '<p class="muted">No products.</p>';
    };
    const drawCart = () => {
      const lines = Object.entries(POS.cart).map(([id, qty]) => ({ p: POS.prods.find((x) => x.id === Number(id)), qty })).filter((l) => l.p);
      const total = lines.reduce((a, l) => a + lineTotal(l.p, l.qty), 0);
      document.getElementById('poscart').innerHTML = lines.length ? `${lines.map((l) => `<div class="posline"><span>${esc(l.p.name)}</span><span class="row" style="flex-wrap:nowrap"><button type="button" class="btn ghost" data-q="-1" data-id="${l.p.id}" aria-label="Less">−</button><b>${l.qty}</b><button type="button" class="btn ghost" data-q="1" data-id="${l.p.id}" aria-label="More">+</button></span><span>${money(lineTotal(l.p, l.qty))}</span></div>`).join('')}<div class="posline" style="font-size:1.2rem"><b>Total</b><span></span><b>${money(total)}</b></div>` : '<p class="muted">Tap a product to add it.</p>';
    };
    drawGrid(); drawCart();
    document.getElementById('posloc').addEventListener('change', (e) => { POS.loc = Number(e.target.value); POS.cart = {}; drawGrid(); drawCart(); });
    document.getElementById('possearch').addEventListener('input', drawGrid);
    document.getElementById('posgrid').addEventListener('click', (e) => { const b = e.target.closest('.posbtn'); if (!b) return; const id = Number(b.dataset.id); POS.cart[id] = Math.min((POS.cart[id] || 0) + 1, stockAt(id)); drawCart(); });
    document.getElementById('poscart').addEventListener('click', (e) => { const b = e.target.closest('[data-q]'); if (!b) return; const id = Number(b.dataset.id); const n = (POS.cart[id] || 0) + Number(b.dataset.q); if (n <= 0) delete POS.cart[id]; else POS.cart[id] = Math.min(n, stockAt(id)); drawCart(); });
    document.getElementById('pos_done').addEventListener('click', async (e) => {
      const items = Object.entries(POS.cart).map(([id, qty]) => ({ id: Number(id), qty })); if (!items.length) return fail(new Error('Add at least one product.'));
      e.target.disabled = true;
      const customer = { name: document.getElementById('pos_name').value.trim(), email: document.getElementById('pos_email').value.trim(), phone: document.getElementById('pos_phone').value.trim() };
      const { data, error } = await sb.rpc('record_sale', { loc_id: POS.loc, items, customer, payment: document.getElementById('pos_pay').value });
      e.target.disabled = false; if (error) return fail(error);
      flash(`Sale #${data} recorded.`); location.hash = `#/admin/orders/${data}`;
    });
  }
  document.querySelectorAll('.pubpage').forEach((b) => b.addEventListener('click', async () => { const { error } = await sb.from('pages').update({ published: !!b.dataset.pub }).eq('id', b.dataset.id); error ? fail(error) : (loadPages(), route()); }));
  document.querySelectorAll('.duppage').forEach((b) => b.addEventListener('click', async () => {
    const { data: o } = await sb.from('pages').select('*').eq('id', b.dataset.id).single(); const { id: _i, created_at: _c, updated_at: _u, ...rest } = o;
    const { error } = await sb.from('pages').insert({ ...rest, title: o.title + ' (copy)', slug: (o.slug + '-copy-' + Math.floor(Math.random() * 900 + 100)).slice(0, 60), published: false, show_in_nav: false }); error ? fail(error) : (flash('Page duplicated as a draft.'), loadPages(), route());
  }));
  document.querySelectorAll('.delpage').forEach((b) => b.addEventListener('click', async () => {
    if (!confirm(`Delete the page "${b.dataset.title}"?`)) return; const { error } = await sb.from('pages').delete().eq('id', b.dataset.id); error ? fail(error) : (loadPages(), route());
  }));
  const body = document.getElementById('pg_body');
  if (body) {
    const prev = document.getElementById('pg_preview'); let t = null;
    const draftKey = 'pgdraft_' + (PG.id || 'new'); let dirty = false;
    const refresh = () => { clearTimeout(t); t = setTimeout(() => { prev.innerHTML = md(body.value); hydrateMd(prev); const st = document.getElementById('pg_stats'); if (st) st.textContent = wordStats(body.value); }, 150);
      dirty = true; const ps = document.getElementById('pg_state'); if (ps) ps.textContent = 'Unsaved changes'; try { localStorage.setItem(draftKey, JSON.stringify({ title: document.getElementById('pg_title').value, body: body.value, at: Date.now() })); } catch {} };
    body.addEventListener('input', refresh); document.getElementById('pg_title')?.addEventListener('input', () => { dirty = true; });
    window.onbeforeunload = () => (dirty ? 'You have unsaved changes.' : undefined); window.addEventListener('hashchange', () => { window.onbeforeunload = null; }, { once: true });
    hydrateMd(prev);
    try { const d = JSON.parse(localStorage.getItem(draftKey) || 'null'); if (d && d.body !== body.value) { const bx = document.getElementById('pg_draft'); bx.hidden = false; bx.innerHTML = `Unsaved draft from ${ago(new Date(d.at).toISOString())} found. <button type="button" class="link" id="pg_usedraft">Restore it</button> · <button type="button" class="link" id="pg_dropdraft">Discard</button>`;
      bx.addEventListener('click', (e) => { if (e.target.id === 'pg_usedraft') { document.getElementById('pg_title').value = d.title; body.value = d.body; refresh(); bx.hidden = true; } if (e.target.id === 'pg_dropdraft') { localStorage.removeItem(draftKey); bx.hidden = true; } }); } } catch {}
    document.getElementById('pg_tpl')?.addEventListener('change', (e) => { const tp = PAGE_TEMPLATES[e.target.value]; if (body.value.trim() && !PAGE_TEMPLATES[Object.keys(PAGE_TEMPLATES).find((k) => PAGE_TEMPLATES[k][1] === body.value)] && !confirm('Replace what you have written with this template?')) return; body.value = tp[1]; const ti = document.getElementById('pg_title'); if (!ti.value) ti.value = tp[0] === 'Blank page' ? '' : tp[0]; refresh(); });
    document.getElementById('pg_dev')?.addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; document.querySelectorAll('#pg_dev button').forEach((x) => x.classList.toggle('on', x === b)); document.getElementById('pg_frame').style.maxWidth = b.dataset.w || ''; });
    document.getElementById('pg_prodbtn')?.addEventListener('click', async () => { const { data } = await sb.from('products').select('name,slug').eq('active', true).order('name').limit(100); const slug = prompt('Which product? Type its link name:\n' + (data || []).map((x) => x.slug).join(', ')); if (slug) insert(`\n{{product: ${slug.trim()}}}\n`); });
    document.querySelectorAll('.pg_restore').forEach((b) => b.addEventListener('click', () => { const v = PG.versions.find((x) => x.id === Number(b.dataset.id)); if (v && confirm('Load this older version into the editor? (Save to keep it.)')) { document.getElementById('pg_title').value = v.title; body.value = v.body; refresh(); } }));
    body.addEventListener('keydown', (e) => { if (!(e.ctrlKey || e.metaKey)) return; const k = e.key.toLowerCase(); if (k === 's') { e.preventDefault(); document.getElementById('pg_save').click(); } else if (k === 'b' || k === 'i') { e.preventDefault(); const w = k === 'b' ? '**' : '*', a = body.selectionStart, z = body.selectionEnd; insert(w + (body.value.slice(a, z) || 'text') + w); } });
    const insert = (text, selectInside) => { const a = body.selectionStart, z = body.selectionEnd; body.setRangeText(text, a, z, 'end'); body.focus(); refresh(); };
    document.querySelector('.mdbar')?.addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return; const a = body.selectionStart, z = body.selectionEnd, sel = body.value.slice(a, z);
      if (b.dataset.md) { const ls = body.value.lastIndexOf('\n', a - 1) + 1; body.setRangeText(b.dataset.md, ls, ls, 'end'); body.focus(); body.selectionStart = body.selectionEnd = a + b.dataset.md.length; refresh(); }
      else if (b.dataset.wrap) insert(b.dataset.wrap + (sel || 'text') + b.dataset.wrap);
      else if (b.dataset.ins) insert(b.dataset.ins);
    });
    document.getElementById('pg_coverclear')?.addEventListener('click', () => { document.getElementById('pg_cover').value = ''; flash('Cover removed — save the page to keep this.'); });
    document.getElementById('pg_coverfile')?.addEventListener('change', async (e) => { let f = e.target.files[0]; if (!f) return; f = await prepImage(f, 2000); if (f.size > 5 * 1024 * 1024) return fail(new Error('Image is still over 5 MB after resizing.')); const path = `pages/cover-${Date.now()}-${f.name.replace(/[^a-zA-Z0-9.]+/g, '-').slice(-50)}`; const up = await sb.storage.from('product-images').upload(path, f, { contentType: f.type }); if (up.error) return fail(up.error); document.getElementById('pg_cover').value = sb.storage.from('product-images').getPublicUrl(path).data.publicUrl; e.target.value = ''; flash('Cover uploaded — save the page to keep it.'); });
    document.getElementById('pg_img')?.addEventListener('change', async (e) => {
      let file = e.target.files[0]; if (!file) return; if (file.size > 30 * 1024 * 1024) return fail(new Error('Image must be under 30 MB.')); file = await prepImage(file); if (file.size > 5 * 1024 * 1024) return fail(new Error('Image is still over 5 MB after resizing.'));
      const path = `pages/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.]+/g, '-').slice(-60)}`;
      const up = await sb.storage.from('product-images').upload(path, file, { contentType: file.type }); if (up.error) return fail(up.error);
      insert(`![${file.name.replace(/\.[^.]+$/, '')}](${sb.storage.from('product-images').getPublicUrl(path).data.publicUrl})`); e.target.value = '';
    });
    document.getElementById('pg_save')?.addEventListener('click', async () => {
      const title = document.getElementById('pg_title').value.trim(); if (!title) return fail(new Error('Give the page a title.'));
      const row = { title, slug: slugify(document.getElementById('pg_slug').value || title) || 'page-' + Date.now(), body: body.value, published: document.getElementById('pg_pub').checked,
        show_in_nav: document.getElementById('pg_nav').checked, show_in_footer: document.getElementById('pg_foot').checked, sort: parseInt(document.getElementById('pg_sort').value, 10) || 0, subtitle: document.getElementById('pg_sub').value.trim(), layout: document.getElementById('pg_layout').value, cover_url: safeUrl(document.getElementById('pg_cover').value.trim()), publish_at: document.getElementById('pg_pubat').value ? new Date(document.getElementById('pg_pubat').value).toISOString() : null, unpublish_at: document.getElementById('pg_unpubat').value ? new Date(document.getElementById('pg_unpubat').value).toISOString() : null, seo_title: document.querySelector('[name=seo_title]').value.trim(), seo_description: document.querySelector('[name=seo_description]').value.trim(), focus_keyword: document.querySelector('[name=focus_keyword]').value.trim(), updated_at: new Date().toISOString() };
      const res = PG.id ? await sb.from('pages').update(row).eq('id', PG.id).select('id').single() : await sb.from('pages').insert(row).select('id').single();
      if (res.error) return fail(res.error.code === '23505' ? new Error('That link name is already used by another page.') : res.error);
      try { localStorage.removeItem('pgdraft_' + (PG.id || 'new')); } catch {} window.onbeforeunload = null; flash('Page saved.'); loadPages(); location.hash = '#/admin/pages';
    });
  }
  document.querySelectorAll('.rstatus').forEach((el) => el.addEventListener('change', async () => {
    const { error } = await sb.from('form_submissions').update({ status: el.value }).eq('id', el.dataset.id); error ? fail(error) : flash('Status updated.');
  }));
  document.querySelectorAll('.rnotes').forEach((el) => el.addEventListener('change', async () => {
    const { error } = await sb.from('form_submissions').update({ notes: el.value }).eq('id', el.dataset.id); error ? fail(error) : flash('Note saved.');
  }));
  document.querySelectorAll('.dlfile').forEach((b) => b.addEventListener('click', async () => {
    const name = b.dataset.path.split('/').pop().replace(/^[0-9a-f-]{36}-/, '');
    const { data, error } = await sb.storage.from('form-uploads').createSignedUrl(b.dataset.path, 60, { download: name });
    if (error) return fail(error); const a = document.createElement('a'); a.href = data.signedUrl; a.download = name; a.click();
  }));
  document.querySelectorAll('.delform').forEach((b) => b.addEventListener('click', async () => {
    if (!confirm(`Delete "${b.dataset.title}" and all its responses (including uploaded files)?`)) return;
    const f = (await sb.from('forms').select('fields').eq('id', b.dataset.id).single()).data;
    const fileKeys = (f?.fields || []).filter((x) => x.type === 'file').map((x) => x.id);
    const rows = fileKeys.length ? (await sb.from('form_submissions').select('data').eq('form_id', b.dataset.id)).data : [];
    const paths = rows.flatMap((r) => fileKeys.map((k) => r.data[k])).filter(Boolean);
    const { error } = await sb.from('forms').delete().eq('id', b.dataset.id); if (error) return fail(error);
    if (paths.length) await sb.storage.from('form-uploads').remove(paths);
    route();
  }));
  document.querySelectorAll('.delresp').forEach((b) => b.addEventListener('click', async () => {
    if (!confirm('Delete this response (and any uploaded files)?')) return;
    const paths = [...b.closest('tr, .rcard').querySelectorAll('.dlfile')].map((x) => x.dataset.path);
    const { error } = await sb.from('form_submissions').delete().eq('id', b.dataset.id); if (error) return fail(error);
    if (paths.length) await sb.storage.from('form-uploads').remove(paths);
    route();
  }));
  document.getElementById('fcsv')?.addEventListener('click', async (e) => {
    const f = (await sb.from('forms').select('*').eq('id', e.target.dataset.id).single()).data;
    const rows = (await sb.from('form_submissions').select('*').eq('form_id', f.id).order('id')).data;
    const head = ['Received', ...dataFields(f).map((x) => x.label), 'Status', 'Notes'].map(csvCell).join(',');
    const body = rows.map((r) => [r.created_at, ...dataFields(f).map((x) => showVal(x, r.data[x.id])), RESP_STATUS[r.status] || r.status, r.notes].map(csvCell).join(','));
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([[head, ...body].join('\n')], { type: 'text/csv' })); a.download = `${f.slug}-responses.csv`; a.click();
  });
  const fields = document.getElementById('fields');
  if (fields && FB) {
    const redraw = () => { fields.innerHTML = fieldRows(); preview(); };
    const val = (i) => document.getElementById(i)?.value ?? '';
    const preview = () => {
      const qc = document.getElementById('qcount'), pv = document.getElementById('fb_preview'); if (!qc || !pv) return; /* left the builder */ const t = val('fb_title') || 'Untitled form', fl = FB.fields; qc.textContent = fl.filter((x) => !DISPLAY_TYPES.includes(x.type)).length ? `(${fl.filter((x) => !DISPLAY_TYPES.includes(x.type)).length})` : '';
      pv.innerHTML = `<div class="fhdr"><h1>${esc(t)}</h1>${val('fb_desc') ? `<p class="muted" style="white-space:pre-wrap;margin:6px 0 0">${esc(val('fb_desc'))}</p>` : ''}</div><div class="stack">${fl.length ? fl.map((x) => fieldHtml({ ...x, label: x.label || 'Untitled question' })).join('') : '<p class="muted">Add a question to see it here.</p>'}<button class="btn block" type="button">${esc(val('fb_submit') || 'Submit')}</button></div>`;
    };
    preview();
    document.querySelectorAll('#fbuilder .tab').forEach((tb) => tb.addEventListener('click', () => {
      document.querySelectorAll('#fbuilder .tab').forEach((x) => x.classList.toggle('on', x === tb)); document.getElementById('tab_settings').hidden = tb.dataset.tab !== 'settings'; document.getElementById('tab_preview').hidden = tb.dataset.tab !== 'preview'; if (tb.dataset.tab === 'preview') preview();
    }));
    let pt = null; document.getElementById('fbuilder').addEventListener('input', () => { clearTimeout(pt); pt = setTimeout(preview, 200); });
    fields.addEventListener('input', (e) => {
      const row = e.target.closest('.fld'); const f = FB.fields[Number(row?.dataset.i)]; const k = e.target.dataset.f; if (!f || !k) return;
      if (k === 'required') f.required = e.target.checked; else if (k === 'options') f.options = e.target.value.split('\n').map((x) => x.trim()).filter(Boolean); else f[k] = e.target.value;
      if (k === 'type') { if (CHOICE_TYPES.includes(f.type) && !f.options) f.options = []; redraw(); }
    });
    fields.addEventListener('click', (e) => {
      const act = e.target.closest('[data-act]')?.dataset.act; if (!act) return; const i = Number(e.target.closest('.fld').dataset.i);
      if (act === 'del') FB.fields.splice(i, 1);
      else if (act === 'dup') { if (FB.fields.length >= 40) return fail(new Error('A form can have up to 40 questions.')); FB.fields.splice(i + 1, 0, { ...FB.fields[i], id: 'q' + Math.random().toString(36).slice(2, 9), options: FB.fields[i].options ? [...FB.fields[i].options] : undefined }); }
      else { const j = act === 'up' ? i - 1 : i + 1; if (j < 0 || j >= FB.fields.length) return; [FB.fields[i], FB.fields[j]] = [FB.fields[j], FB.fields[i]]; }
      redraw();
    });
    document.querySelectorAll('[data-addtype]').forEach((bt) => bt.addEventListener('click', () => {
      if (FB.fields.length >= 40) return fail(new Error('A form can have up to 40 questions.'));
      const type = bt.dataset.addtype;
      FB.fields.push({ id: 'q' + Math.random().toString(36).slice(2, 9), type, label: '', required: false, ...(CHOICE_TYPES.includes(type) ? { options: [] } : {}) }); redraw();
      const last = fields.querySelector('.fld:last-child .flabel'); last?.focus(); last?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }));
    document.getElementById('fb_save').addEventListener('click', async () => {
      const title = document.getElementById('fb_title').value.trim(); if (!title) return fail(new Error('Give the form a title.'));
      if (!FB.fields.length) return fail(new Error('Add at least one question.'));
      if (FB.fields.some((x) => !x.label.trim())) return fail(new Error('Every question needs a label.'));
      if (FB.fields.some((x) => CHOICE_TYPES.includes(x.type) && !(x.options || []).length)) return fail(new Error('Dropdown, single-choice and multiple-choice questions need at least one option.'));
      if (!FB.fields.some((x) => !DISPLAY_TYPES.includes(x.type))) return fail(new Error('Add at least one question people can answer.'));
      const row = { title, slug: slugify(document.getElementById('fb_slug').value || title) || 'form-' + Date.now(), description: document.getElementById('fb_desc').value,
        success_message: document.getElementById('fb_ok').value.trim() || 'Thanks!', active: document.getElementById('fb_active').checked, notify: document.getElementById('fb_notify').checked, submit_label: document.getElementById('fb_submit').value.trim() || 'Submit', closes_at: document.getElementById('fb_closes').value ? new Date(document.getElementById('fb_closes').value).toISOString() : null, max_responses: document.getElementById('fb_max').value ? parseInt(document.getElementById('fb_max').value, 10) : null, require_login: document.getElementById('fb_login').checked,
        fields: FB.fields.map((x) => ({ ...x, label: x.label.trim() })) };
      const res = FB.id ? await sb.from('forms').update(row).eq('id', FB.id).select('id').single() : await sb.from('forms').insert(row).select('id').single();
      if (res.error) return fail(res.error.code === '23505' ? new Error('That link name is already used by another form.') : res.error);
      flash('Form saved.'); location.hash = '#/admin/forms';
    });
  }
  document.querySelectorAll('.copyform').forEach((bt) => bt.addEventListener('click', async () => { try { await navigator.clipboard.writeText(bt.dataset.url); flash('Form link copied.'); } catch { prompt('Copy this link:', bt.dataset.url); } }));
  document.querySelectorAll('.dupform').forEach((bt) => bt.addEventListener('click', async () => {
    const f = (await sb.from('forms').select('*').eq('id', bt.dataset.id).single()).data; if (!f) return; const { id: _i, created_at: _c, ...rest } = f;
    const { error } = await sb.from('forms').insert({ ...rest, title: f.title + ' (copy)', slug: (f.slug + '-copy-' + Math.floor(Math.random() * 900 + 100)).slice(0, 60), active: false }); error ? fail(error) : (flash('Form duplicated as a draft.'), route());
  }));
  document.getElementById('cf')?.addEventListener('submit', async (e) => {
    e.preventDefault(); const f = Object.fromEntries(new FormData(e.target));
    const { error } = await sb.from('discount_codes').insert({ code: f.code.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, ''), percent: Number(f.percent), min_cents: Math.round(Number(f.min || 0) * 100), max_uses: Math.max(0, parseInt(f.max_uses, 10) || 0), expires_at: f.expires ? new Date(f.expires + 'T23:59:59').toISOString() : null });
    error ? fail(error) : (flash('Code added.'), route());
  });
  document.querySelectorAll('.togcode').forEach((b) => b.addEventListener('click', async () => {
    const { error } = await sb.from('discount_codes').update({ active: b.dataset.active !== 'true' }).eq('code', b.dataset.code); error ? fail(error) : route();
  }));
  document.querySelectorAll('.delcode').forEach((b) => b.addEventListener('click', async () => { if (!confirm(`Delete code ${b.dataset.code}?`)) return; const { error } = await sb.from('discount_codes').delete().eq('code', b.dataset.code); error ? fail(error) : route(); }));
  document.getElementById('csv')?.addEventListener('click', async () => {
    const os = (await sb.from('orders').select('*').order('id')).data, cols = ['id', 'created_at', 'status', 'name', 'email', 'phone', 'address', 'city', 'postcode', 'subtotal_cents', 'shipping_cents', 'total_cents'];
    const cell = (v) => { v = String(v ?? ''); if (/^[=+\-@]/.test(v)) v = "'" + v; return `"${v.replace(/"/g, '""')}"`; };
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([[cols.join(','), ...os.map((o) => cols.map((c) => cell(o[c])).join(','))].join('\n')], { type: 'text/csv' }));
    a.download = 'orders.csv'; a.click();
  });
  document.getElementById('status')?.addEventListener('submit', async (e) => {
    e.preventDefault(); const { error } = await sb.rpc('set_order_status', { oid: Number(id), new_status: new FormData(e.target).get('status') });
    error ? fail(error) : (flash('Order updated.'), route());
  });
  document.querySelectorAll('.delimg').forEach((b) => b.addEventListener('click', async () => { const { error } = await sb.from('product_images').delete().eq('id', b.dataset.id); error ? fail(error) : route(); }));
  document.getElementById('pf')?.addEventListener('submit', async (e) => {
    e.preventDefault(); const f = Object.fromEntries(new FormData(e.target)), pid = e.target.dataset.id;
    let file = f.image; delete f.image; delete f.extras;
    const extraFiles = new FormData(e.target).getAll('extras').filter((x) => x && x.size);
    if (file && file.size) {
      if (file.size > 30 * 1024 * 1024) return fail(new Error('Photo must be under 30 MB.')); file = await prepImage(file); if (file.size > 5 * 1024 * 1024) return fail(new Error('Photo is still over 5 MB after resizing.'));
      const path = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.]+/g, '-').slice(-60)}`;
      const up = await sb.storage.from('product-images').upload(path, file, { contentType: file.type });
      if (up.error) return fail(up.error);
      f.image_url = sb.storage.from('product-images').getPublicUrl(path).data.publicUrl;
    }
    const removedOld = !!f.remove_image && !(file && file.size) ? f.image_url : ''; if (f.remove_image && !(file && file.size)) f.image_url = '';
    const row = { name: f.name.trim(), category: f.category.trim(), description: f.description, price_cents: Math.round(parseFloat(f.price) * 100), unit: f.unit.trim(),
      r_value: f.r_value.trim(), image_url: safeUrl(f.image_url.trim()), active: !!f.active, cost_cents: Math.round((parseFloat(f.cost) || 0) * 100), reorder_point: parseInt(f.reorder_point, 10) || 0, reorder_qty: parseInt(f.reorder_qty, 10) || 0, compare_at_cents: Math.round((parseFloat(f.compare_at) || 0) * 100), brand: (f.brand || '').trim(), bags_per_bundle: (() => { const n = parseInt(f.bags_per_bundle, 10); return n >= 2 && n <= 1000 ? n : null; })(), sku: (f.sku || '').trim(), barcode: (f.barcode || '').trim(), long_description: f.long_description || '', features: (f.features || '').split('\n').map((x) => x.trim()).filter(Boolean).slice(0, 30),
      specs: [...e.target.querySelectorAll('.specedit')].map((r) => ({ k: r.querySelector('[data-f=k]').value.trim(), v: r.querySelector('[data-f=v]').value.trim() })).filter((x) => x.k && x.v).slice(0, 40),
      documents: [...e.target.querySelectorAll('.docedit')].map((r) => ({ label: r.querySelector('[data-f=label]').value.trim(), url: safeUrl(r.querySelector('[data-f=url]').value.trim()) })).filter((x) => x.label && x.url).slice(0, 20),
      video_url: ytId(f.video_url) ? f.video_url.trim() : '', warranty: (f.warranty || '').trim(), seo_title: (f.seo_title || '').trim(), seo_description: (f.seo_description || '').trim(), focus_keyword: (f.focus_keyword || '').trim(), image_alt: (f.image_alt || '').trim() };
    if (!pid) row.slug = (row.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'product') + '-' + Math.floor(Math.random() * 1000);
    const res = pid ? await sb.from('products').update(row).eq('id', pid).select('id').single() : await sb.from('products').insert(row).select('id').single();
    if (res.error) return fail(res.error);
    if (row.brand) await sb.rpc('add_brand', { nm: row.brand });
    if (removedOld && removedOld.includes('/product-images/')) sb.storage.from('product-images').remove([decodeURIComponent(removedOld.split('/product-images/')[1])]);
    { const rows = [...e.target.querySelectorAll('.packedit')].map((r) => ({ units: parseInt(r.querySelector('[data-f=units]').value, 10), label: r.querySelector('[data-f=label]').value.trim(), total: Math.round((parseFloat(r.querySelector('[data-f=price]').value) || 0) * 100) })).filter((r) => r.units >= 2 && r.total > 0).map((r) => ({ label: r.label || `${su(row.unit).toLowerCase() === 'bundle' ? 'Pack' : 'Bundle'} of ${r.units} ${su(row.unit)}s`, units: r.units, unit_price_cents: Math.round(r.total / r.units) }));
      if (rows.length) { const bad = rows.find((r) => r.unit_price_cents >= row.price_cents); if (bad) flash(`"${bad.label}" costs the same or more per unit than the single price, so it will not be used.`, 'error'); }
      const del = await sb.from('product_packs').delete().eq('product_id', res.data.id); if (del.error) return fail(del.error);
      if (rows.length) PACKROWS_MIN = Math.min(...rows.map((r) => r.units));
      if (rows.length) { const ins = await sb.from('product_packs').insert(rows.map((r) => ({ ...r, product_id: res.data.id }))); if (ins.error) return fail(ins.error.code === '23505' ? new Error('Two bundle sizes have the same number of units.') : ins.error); } }
    if (typeof PACKROWS_MIN === 'number') { if (!row.bags_per_bundle) await sb.from('products').update({ bags_per_bundle: PACKROWS_MIN }).eq('id', res.data.id); PACKROWS_MIN = undefined; }
    for (const el of form_inv(e.target)) { // stock per location
      if (el.value === el.dataset.orig && pid) continue; const v = parseInt(el.value, 10); if (!(v >= 0) || (!pid && v === 0)) continue;
      const r = await sb.rpc('set_inventory', { pid: res.data.id, lid: Number(el.name.slice(4)), new_qty: v, note: pid ? 'Set from product editor' : 'Initial stock' }); if (r.error) return fail(r.error);
    }
    for (let [n, xf] of extraFiles.entries()) {
      if (xf.size > 30 * 1024 * 1024) { flash('A gallery photo was over 30 MB and was skipped.', 'error'); continue; } xf = await prepImage(xf); if (xf.size > 5 * 1024 * 1024) { flash('A gallery photo was still over 5 MB after resizing and was skipped.', 'error'); continue; }
      const path = `${Date.now()}-${n}-${xf.name.replace(/[^a-zA-Z0-9.]+/g, '-').slice(-60)}`;
      const up = await sb.storage.from('product-images').upload(path, xf, { contentType: xf.type });
      if (up.error) return fail(up.error);
      await sb.from('product_images').insert({ product_id: res.data.id, url: sb.storage.from('product-images').getPublicUrl(path).data.publicUrl, position: n });
    }
    flash('Product saved.'); location.hash = '#/admin/products';
  });
};

// ---- notifications & private messaging ----
const ago = (d) => { const sec = Math.max(1, (Date.now() - new Date(d)) / 1000); if (sec < 60) return 'just now'; if (sec < 3600) return `${Math.floor(sec / 60)}m ago`; if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`; return new Date(d).toLocaleDateString(); };
const safeLink = (l) => (/^#\/[\w\-/?=&.%]*$/.test(l || '') ? l : '#/');
async function refreshUnread() {
  if (!session) { unread = { all: 0, msg: 0 }; return renderNav(); }
  const { data } = await sb.from('notifications').select('kind').eq('read', false).limit(500);
  unread = { all: (data || []).length, msg: (data || []).filter((n) => n.kind === 'message').length }; renderNav();
}
function startRealtime() {
  if (notifChan) { sb.removeChannel(notifChan); notifChan = null; }
  if (!session) return;
  notifChan = sb.channel('notif-' + session.user.id).on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${session.user.id}` }, (payload) => {
    const n = payload.new; unread.all++; if (n.kind === 'message') unread.msg++; renderNav();
    flash(n.title);
    if (document.hidden && 'Notification' in window && Notification.permission === 'granted') new Notification(n.title, { body: n.body });
    if (!document.getElementById('notifpanel').hidden) buildNotifPanel();
    if (location.hash.startsWith('#/notifications')) route();
  }).subscribe();
}
const notifRow = (n) => `<a class="notif ${n.read ? '' : 'unread'}" href="${esc(safeLink(n.link))}" data-id="${n.id}"><b>${esc(n.title)}</b>${n.body ? `<span>${esc(n.body)}</span>` : ''}<small class="muted">${ago(n.created_at)}</small></a>`;
async function buildNotifPanel() {
  const el = document.getElementById('notifpanel'); if (!el || !session) return;
  const { data } = await sb.from('notifications').select('*').order('id', { ascending: false }).limit(12);
  el.innerHTML = `<div class="row" style="justify-content:space-between"><h3 style="margin:0">Notifications</h3><button class="link" id="markall" style="color:var(--brand)">Mark all read</button></div>
  ${(data || []).length ? data.map(notifRow).join('') : '<p class="muted">Nothing yet.</p>'}<p style="margin:10px 0 0"><a href="#/notifications">See all notifications</a></p>`;
}
document.addEventListener('click', async (e) => {
  const panel = document.getElementById('notifpanel');
  if (e.target.closest('#bellbtn')) { panel.hidden = !panel.hidden; if (!panel.hidden) buildNotifPanel(); return; }
  if (e.target.closest('#markall')) { await sb.from('notifications').update({ read: true }).eq('read', false); await refreshUnread(); buildNotifPanel(); if (location.hash.startsWith('#/notifications')) route(); return; }
  const n = e.target.closest('.notif');
  if (n) { if (n.classList.contains('unread')) { await sb.from('notifications').update({ read: true }).eq('id', n.dataset.id); refreshUnread(); } panel.hidden = true; return; }
  if (panel && !panel.hidden && !e.target.closest('#notifpanel')) panel.hidden = true;
});
pages.notifications = async () => {
  if (!session) { location.hash = '#/login'; return ''; }
  const { data } = await sb.from('notifications').select('*').order('id', { ascending: false }).limit(100);
  const perm = 'Notification' in window ? Notification.permission : 'unsupported';
  return `<h1>Notifications</h1><div class="row" style="margin-bottom:12px"><button class="btn ghost" id="markall">Mark all read</button><button class="btn ghost" id="clearall">Clear all</button>
  ${perm === 'default' ? '<button class="btn ghost" id="desktopn">:ic-bell: Enable desktop alerts</button>' : perm === 'granted' ? '<span class="muted">Desktop alerts on</span>' : ''}</div>
  <div class="notifs">${data.length ? data.map(notifRow).join('') : '<p class="muted">No notifications yet.</p>'}</div>`;
};
pages.notifications.after = () => {
  document.getElementById('clearall')?.addEventListener('click', async () => { if (!confirm('Delete all notifications?')) return; await sb.from('notifications').delete().gte('id', 0); await refreshUnread(); route(); });
  document.getElementById('desktopn')?.addEventListener('click', async () => { await Notification.requestPermission(); route(); });
};

// ---- DM-style messaging ----
const initials = (n) => (n || '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '?';
const avatar = (n, cls = '') => `<span class="avatar ${cls}" aria-hidden="true">${esc(initials(n))}</span>`;
const sameDay = (a, b) => new Date(a).toDateString() === new Date(b).toDateString();
const dayLabel = (d) => (sameDay(d, Date.now()) ? 'Today' : sameDay(d, Date.now() - 864e5) ? 'Yesterday' : new Date(d).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }));
const timeOf = (d) => new Date(d).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
let DM = null; // current chat state
const isMine = (m) => (DM.isStaff ? m.sender_id !== DM.conv.customer_id : m.sender_id === DM.conv.customer_id);
const fmtSize = (n) => (n > 1e6 ? (n / 1e6).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1e3)) + ' KB');
const linkify = (t) => esc(t).replace(/(https?:\/\/[^\s<]+)/g, (m) => { const tail = (m.match(/[.,;:!?)]+$/) || [''])[0], url = tail ? m.slice(0, -tail.length) : m; return `<a href="${url}" target="_blank" rel="noopener nofollow">${url}</a>${tail}`; });
const CHAT_FILES = 'image/jpeg,image/png,image/webp,image/gif,application/pdf,.txt,.csv,.doc,.docx,.xls,.xlsx';
function msgBody(m) {
  if (m.deleted_at) return '<div class="mt muted"><i>This message was unsent</i></div>';
  const o = m.order_id && DM.orders[m.order_id], atts = Array.isArray(m.attachments) ? m.attachments : [];
  return `${o ? `<a class="ocard" href="${DM.isStaff ? '#/admin/orders/' : '#/order/'}${o.id}"><span class="ico">:ic-package:</span><span><b>Order #${o.id}</b><small>${esc(o.status)} · ${money(o.total_cents)}</small></span>:ic-chevron-down:</a>` : m.order_id ? '<div class="ocard"><span class="ico">:ic-package:</span><span><b>Order #' + m.order_id + '</b></span></div>' : ''}
    ${atts.length ? `<div class="atts">${atts.map((a) => (String(a.type).startsWith('image/') ? `<a class="att img" data-path="${esc(a.path)}" data-name="${esc(a.name)}" href="#"><img data-path="${esc(a.path)}" alt="${esc(a.name)}" ${DM.urls[a.path] ? `src="${esc(DM.urls[a.path])}"` : ''}></a>` : `<a class="att file" data-path="${esc(a.path)}" data-name="${esc(a.name)}" href="#">:ic-download:<span><b>${esc(a.name)}</b><small>${fmtSize(a.size || 0)}</small></span></a>`)).join('')}</div>` : ''}
    ${m.body ? `<div class="mt">${linkify(m.body)}</div>` : ''}`;
}
function threadHtml() {
  if (!DM.msgs.length) return `<div class="empty-chat">:ic-chat:<p><b>${DM.isStaff ? 'No messages yet' : 'Say hi!'}</b></p><p class="muted">${DM.isStaff ? 'Write the first message below.' : 'Ask us anything about products, orders or delivery. Replies show up here.'}</p>${DM.isStaff ? '' : `<div class="topics">${['Where is my order?', 'I have a delivery question', 'Which product is right for my project?', 'I would like a quote'].map((t) => `<button type="button" class="topic">${esc(t)}</button>`).join('')}</div>`}</div>`;
  let out = '', i = 0; const grp = (m) => (m.internal ? 'n' : isMine(m) ? 'm' : 't');
  while (i < DM.msgs.length) {
    const first = DM.msgs[i], g = grp(first);
    if (i === 0 || !sameDay(DM.msgs[i - 1].created_at, first.created_at)) out += `<div class="day"><span>${dayLabel(first.created_at)}</span></div>`;
    if (DM.firstUnread && first.id === DM.firstUnread) out += '<div class="newdiv"><span>New messages</span></div>';
    let j = i, bubbles = '';
    while (j < DM.msgs.length && grp(DM.msgs[j]) === g && sameDay(DM.msgs[j].created_at, first.created_at) && (j === i || (DM.msgs[j].id !== DM.firstUnread && new Date(DM.msgs[j].created_at) - new Date(DM.msgs[j - 1].created_at) < 10 * 60000))) {
      const m = DM.msgs[j], un = m.sender_id === session.user.id && !m.deleted_at && Date.now() - new Date(m.created_at) < 10 * 60000;
      bubbles += `<div class="msg ${m.internal ? 'internal' : ''} ${m.deleted_at ? 'gone' : ''}" data-id="${m.id}" title="${esc(new Date(m.created_at).toLocaleString())}">${m.internal ? '<div class="inlabel">:ic-lock: Internal note — only your team can see this</div>' : ''}${msgBody(m)}${un ? `<button class="un" data-id="${m.id}" aria-label="Unsend message" title="Unsend">:ic-x:</button>` : ''}</div>`; j++;
    }
    const lastM = DM.msgs[j - 1];
    out += `<div class="grp ${g === 'm' ? 'mine' : g === 'n' ? 'mine note' : 'theirs'}">${g === 't' ? avatar(DM.peerName, DM.isStaff ? '' : 'store') : ''}<div class="bstack">${bubbles}<small class="meta">${g === 'n' ? 'Note · ' : ''}${timeOf(lastM.created_at)}</small></div></div>`;
    i = j;
  }
  const lastMine = [...DM.msgs].reverse().find((m) => isMine(m) && !m.internal && !m.deleted_at);
  if (lastMine?.read_at) out += `<div class="seen">Seen ${ago(lastMine.read_at)}</div>`;
  return out;
}
async function hydrateThread() {
  const orderIds = [...new Set(DM.msgs.map((m) => m.order_id).filter((x) => x && !DM.orders[x]))];
  const paths = [...new Set(DM.msgs.flatMap((m) => (m.deleted_at ? [] : (m.attachments || []).map((a) => a.path))).filter((p) => p && !DM.urls[p]))];
  if (!orderIds.length && !paths.length) return;
  const [o, u] = await Promise.all([orderIds.length ? sb.from('orders').select('id,status,total_cents').in('id', orderIds) : { data: [] }, paths.length ? sb.storage.from('message-files').createSignedUrls(paths, 3600) : { data: [] }]);
  (o.data || []).forEach((x) => (DM.orders[x.id] = x)); (u.data || []).forEach((x) => { if (x.signedUrl) DM.urls[x.path] = x.signedUrl; });
  renderThread(false, true);
}
function renderThread(forceBottom, noHydrate) {
  const t = document.getElementById('thread'); if (!t) return;
  const nearBottom = forceBottom || t.scrollHeight - t.scrollTop - t.clientHeight < 140;
  t.innerHTML = threadHtml(); if (nearBottom) t.scrollTop = t.scrollHeight; if (!noHydrate) hydrateThread();
}
function renderPending() {
  const el = document.getElementById('pend'); if (!el) return;
  el.innerHTML = DM.pending.map((f, i) => `<span class="pchip">:ic-image: ${esc(f.name)} <small class="muted">${fmtSize(f.size)}</small><button type="button" data-rm="${i}" aria-label="Remove ${esc(f.name)}">:ic-x:</button></span>`).join('') + (DM.pendingOrder ? `<span class="pchip">:ic-package: Order #${DM.pendingOrder}<button type="button" data-rmorder aria-label="Remove order">:ic-x:</button></span>` : '');
  el.hidden = !el.innerHTML;
}
async function markRead() {
  if (!DM?.conv) return;
  await sb.rpc('mark_conversation_read', { cid: DM.conv.id });
  await sb.from('notifications').update({ read: true }).eq('link', `#/messages/${DM.conv.id}`).eq('read', false); refreshUnread();
}
async function loadInbox(asCustomer = false) {
  const convs = (await sb.from('conversations').select('*').order('last_message_at', { ascending: false }).limit(200)).data || [];
  const ids = convs.map((c) => c.id), last = {}, unreadBy = {};
  if (ids.length) ((await sb.from('messages').select('conversation_id,body,sender_id,created_at,read_at,internal,attachments,deleted_at').in('conversation_id', ids).order('id', { ascending: false }).limit(800)).data || []).forEach((m) => {
    if (!last[m.conversation_id]) last[m.conversation_id] = m;
    const c = convs.find((x) => x.id === m.conversation_id); if (c && !m.internal && (asCustomer ? m.sender_id !== c.customer_id : m.sender_id === c.customer_id) && !m.read_at && !m.deleted_at) unreadBy[c.id] = (unreadBy[c.id] || 0) + 1;
  });
  const names = {}; if (convs.length) ((await sb.from('profiles').select('id,name,email').in('id', [...new Set(convs.map((c) => c.customer_id))])).data || []).forEach((u) => (names[u.id] = u.name || u.email));
  return { convs, last, unreadBy, names };
}
const previewOf = (m, c) => (!m ? 'No messages yet' : m.deleted_at ? 'Message unsent' : (m.internal ? 'Note: ' : m.sender_id !== c.customer_id ? 'You: ' : '') + (m.body ? m.body.slice(0, 70) : (m.attachments || []).length ? 'Sent an attachment' : 'Shared an order'));
const convTitle = (c) => (c.subject && c.subject !== 'Direct message' ? c.subject : 'Store team');
const listHtml = (inbox, selected, filter = '', mode = '', cust = false) => {
  const f = filter.toLowerCase(), nameOf = (c) => (cust ? convTitle(c) : inbox.names[c.customer_id] || 'Customer'), rows = inbox.convs.filter((c) => (!f || nameOf(c).toLowerCase().includes(f) || (c.subject || '').toLowerCase().includes(f) || (inbox.last[c.id]?.body || '').toLowerCase().includes(f)) && (mode === 'unread' ? inbox.unreadBy[c.id] : mode === 'closed' ? c.closed : true));
  return rows.length ? rows.map((c) => { const nm = nameOf(c), lm = inbox.last[c.id], un = inbox.unreadBy[c.id] || 0;
    const prev = cust ? (!lm ? 'No messages yet' : lm.deleted_at ? 'Message unsent' : (lm.sender_id === c.customer_id ? 'You: ' : '') + (lm.body ? lm.body.slice(0, 70) : (lm.attachments || []).length ? 'Sent an attachment' : 'Shared an order')) : previewOf(lm, c);
    return `<a class="dmrow ${String(selected) === String(c.id) ? 'on' : ''} ${un ? 'unread' : ''}" href="#/messages/${c.id}">${avatar(nm, cust ? 'store' : '')}<div class="dmtxt"><div class="row" style="justify-content:space-between;flex-wrap:nowrap"><b>${esc(nm)}</b><small class="muted">${lm ? ago(lm.created_at) : ''}</small></div>
    ${!cust && c.subject && c.subject !== 'Direct message' ? `<small class="dmsub">${esc(c.subject)}</small>` : ''}<span class="muted prev">${esc(prev)}</span></div>${un ? `<span class="dot">${un}</span>` : c.closed ? '<small class="muted">closed</small>' : ''}</a>`; }).join('')
    : '<p class="muted" style="padding:16px">No conversations found.</p>';
};
let NM = null;
const MSG_TOPICS = ['Question about an order', 'Delivery or pickup', 'Product advice', 'Pricing or a quote', 'Something else'];
async function newMessagePage(isStaff, q) {
  const orders = isStaff ? [] : (await sb.from('orders').select('id,status,total_cents').eq('user_id', session.user.id).order('id', { ascending: false }).limit(15)).data || [];
  NM = { isStaff, orders, cust: null, files: [], preOrder: q.get('order') || '' };
  return `<div class="newmsg" id="newmsg"><a class="muted" href="#/messages">← Messages</a><h1>New message</h1><p class="muted" style="margin-top:0">${isStaff ? 'Start a conversation with a customer.' : 'Ask us anything — we usually reply within a day.'}</p>
  <form id="nmform" class="stack" novalidate>
    ${isStaff ? `<label>Customer<input id="nm_cust" placeholder="Search by name or email…" autocomplete="off"></label><div id="nm_res" class="nmres" hidden></div><p id="nm_sel" class="nmsel" hidden></p>` : ''}
    <div><b>What's it about?</b><div class="chips" id="nm_topics" style="margin:8px 0 0">${MSG_TOPICS.map((t) => `<button type="button" class="chip" data-t="${esc(t)}">${esc(t)}</button>`).join('')}</div></div>
    <label>Subject<input name="subject" required maxlength="100" value="${esc(q.get('subject') || '')}" placeholder="e.g. Delivery date for my order"></label>
    <label>Message<textarea name="body" rows="6" required maxlength="5000" placeholder="Write your message…"></textarea></label>
    <div class="row"><select id="nm_order" aria-label="Attach an order" ${isStaff ? 'hidden' : ''}><option value="">Attach an order (optional)…</option>${orders.map((o) => `<option value="${o.id}" ${String(o.id) === NM.preOrder ? 'selected' : ''}>Order #${o.id} · ${esc(o.status)} · ${money(o.total_cents)}</option>`).join('')}</select>
      <label class="btn ghost" style="cursor:pointer">:ic-paperclip: Attach photos or files<input type="file" id="nm_files" accept="${CHAT_FILES}" multiple hidden></label></div>
    <div class="pend" id="nm_pend" hidden></div>
    <p class="autherr" id="nm_err" role="alert" hidden></p>
    <button class="btn" id="nm_go">Send message</button></form></div>`;
}
function initCompose() {
  const $ = (i) => document.getElementById(i), err = (m) => { $('nm_err').textContent = m || ''; $('nm_err').hidden = !m; };
  $('nm_topics').addEventListener('click', (e) => { const b = e.target.closest('[data-t]'); if (!b) return; document.querySelectorAll('#nm_topics .chip').forEach((x) => x.classList.toggle('on', x === b)); const sub = $('nmform').elements.subject; if (!sub.value.trim() || MSG_TOPICS.includes(sub.value)) sub.value = b.dataset.t; });
  const drawPend = () => { const el = $('nm_pend'); el.hidden = !NM.files.length; el.innerHTML = NM.files.map((f, i) => `<span class="pchip">:ic-image: ${esc(f.name)} <small class="muted">${fmtSize(f.size)}</small><button type="button" data-rm="${i}" aria-label="Remove ${esc(f.name)}">:ic-x:</button></span>`).join(''); };
  $('nm_files').addEventListener('change', (e) => { for (const f of e.target.files) { if (NM.files.length >= 6) { err('You can attach up to 6 files.'); break; } if (f.size > 25 * 1024 * 1024) { err(`"${f.name}" is too big (25 MB max).`); continue; } NM.files.push(f); } e.target.value = ''; drawPend(); });
  $('nm_pend').addEventListener('click', (e) => { const rm = e.target.closest('[data-rm]'); if (rm) { NM.files.splice(Number(rm.dataset.rm), 1); drawPend(); } });
  if (NM.isStaff) {
    let t = null; const inp = $('nm_cust'), res = $('nm_res');
    inp.addEventListener('input', () => { clearTimeout(t); const v = inp.value.trim().replace(/[%,()]/g, ''); if (v.length < 2) { res.hidden = true; return; }
      t = setTimeout(async () => { const { data } = await sb.from('profiles').select('id,name,email').or(`name.ilike.%${v}%,email.ilike.%${v}%`).eq('role', 'customer').limit(8); res.hidden = false; res.innerHTML = (data || []).length ? data.map((u) => `<button type="button" class="nmpick" data-id="${u.id}" data-name="${esc(u.name || u.email)}" data-email="${esc(u.email)}">${avatar(u.name || u.email)}<span><b>${esc(u.name || '—')}</b><small class="muted">${esc(u.email)}</small></span></button>`).join('') : '<p class="muted" style="margin:8px">No customers found.</p>'; }, 250); });
    res.addEventListener('click', async (e) => { const b = e.target.closest('.nmpick'); if (!b) return; NM.cust = { id: b.dataset.id, name: b.dataset.name }; res.hidden = true; inp.value = ''; $('nm_sel').hidden = false; $('nm_sel').innerHTML = `To: <b>${esc(b.dataset.name)}</b> <small class="muted">${esc(b.dataset.email)}</small> <button type="button" class="link" id="nm_clear">change</button>`;
      const { data } = await sb.from('orders').select('id,status,total_cents').eq('user_id', b.dataset.id).order('id', { ascending: false }).limit(15); const sel = $('nm_order'); sel.hidden = !(data || []).length; sel.innerHTML = '<option value="">Attach an order (optional)…</option>' + (data || []).map((o) => `<option value="${o.id}">Order #${o.id} · ${esc(o.status)} · ${money(o.total_cents)}</option>`).join(''); });
    document.getElementById('newmsg').addEventListener('click', (e) => { if (e.target.id === 'nm_clear') { NM.cust = null; $('nm_sel').hidden = true; inp.focus(); } });
  }
  $('nmform').addEventListener('submit', async (e) => {
    e.preventDefault(); err(''); const f = e.target.elements, subject = f.subject.value.trim(), body = f.body.value.trim(), btn = $('nm_go');
    if (NM.isStaff && !NM.cust) return err('Choose a customer first.'); if (!subject) return err('Add a subject.'); if (!body && !NM.files.length) return err('Write a message.');
    btn.disabled = true; btn.textContent = 'Sending…';
    try {
      const cid = NM.isStaff ? NM.cust.id : session.user.id, c = await sb.from('conversations').insert({ customer_id: cid, subject }).select('id').single(); if (c.error) throw c.error;
      const attachments = []; for (let file of NM.files) { file = await prepImage(file); const path = `conv_${c.data.id}/${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9.]+/g, '-').slice(-70)}`; const up = await sb.storage.from('message-files').upload(path, file, { contentType: file.type || 'application/octet-stream' }); if (up.error) throw up.error; attachments.push({ path, name: file.name, type: file.type || 'application/octet-stream', size: file.size }); }
      const m = await sb.from('messages').insert({ conversation_id: c.data.id, body, attachments, order_id: $('nm_order').value ? Number($('nm_order').value) : null, internal: false }); if (m.error) throw m.error;
      location.hash = `#/messages/${c.data.id}`;
    } catch (ex) { err(ex.message || 'Could not send your message. Please try again.'); btn.disabled = false; btn.textContent = 'Send message'; }
  });
}
pages.messages = async ([id], q) => {
  if (!session) { location.hash = '#/login'; return ''; }
  const isStaff = can('messages');
  if (id === 'new') {
    if (isStaff && q.get('to') && !q.get('compose')) { // staff shortcut: open (or create) the thread with this customer
      let c = (await sb.from('conversations').select('id').eq('customer_id', q.get('to')).order('id', { ascending: false }).limit(1).maybeSingle()).data;
      if (!c) { const r = await sb.from('conversations').insert({ customer_id: q.get('to'), subject: 'Direct message' }).select('id').single(); if (r.error) throw r.error; c = r.data; }
      location.hash = `#/messages/${c.id}`; return '';
    }
    return await newMessagePage(isStaff, q);
  }
  let inbox = await loadInbox(!isStaff), conv = null, selected = id && /^\d+$/.test(id) ? id : null;
  const showList = isStaff || inbox.convs.length > 1, wide = !window.matchMedia('(max-width:760px)').matches;
  if (!isStaff && !inbox.convs.length) { location.hash = '#/messages/new'; return ''; }
  if (!selected && !isStaff && (!showList || wide)) selected = inbox.convs[0].id;
  if (selected) conv = (await sb.from('conversations').select('*').eq('id', selected).maybeSingle()).data;
  const msgs = conv ? (await sb.from('messages').select('*').eq('conversation_id', conv.id).order('id')).data || [] : [];
  const custId = isStaff ? conv?.customer_id : session.user.id;
  const myOrders = custId ? (await sb.from('orders').select('id,status,total_cents,created_at').eq('user_id', custId).order('id', { ascending: false }).limit(15)).data || [] : [];
  const replies = isStaff ? (await sb.from('canned_replies').select('*').order('title')).data || [] : [];
  const peerName = isStaff ? (inbox.names[conv?.customer_id] || 'Customer') : (conv ? convTitle(conv) : 'Store team');
  const firstUnread = msgs.find((m) => !m.internal && !m.deleted_at && !m.read_at && (isStaff ? m.sender_id === conv?.customer_id : m.sender_id !== conv?.customer_id))?.id || null;
  DM = { conv, msgs, isStaff, showList, peerName, inbox, online: false, orders: {}, urls: {}, pending: [], pendingOrder: null, internal: false, firstUnread, myOrders, replies, filter: '' };
  myOrders.forEach((o) => (DM.orders[o.id] = o));
  const closedCust = !isStaff && conv?.closed;
  const chat = (showList && !conv) ? `<div class="empty-chat">:ic-chat:<p><b>Select a conversation</b></p><p class="muted">${isStaff ? 'Pick a customer on the left, or start a new message.' : 'Pick a conversation, or start a new message.'}</p><a class="btn" href="#/messages/new${isStaff ? '?compose=1' : ''}">:ic-edit: New message</a></div>`
    : `<header class="dmhead"><a class="backbtn" href="${isStaff || showList ? '#/messages' : '#/'}" aria-label="${isStaff || showList ? 'Back to conversations' : 'Back'}">:ic-chevron-down:</a>${avatar(peerName, isStaff ? '' : 'store')}<div style="min-width:0"><b>${esc(peerName)}</b><div class="dmstatus muted" id="dmstatus">${isStaff ? 'Customer' : (peerName === 'Store team' ? 'Replies usually within a day' : 'Store team · replies within a day')}</div></div>
      <span class="grow"></span>${isStaff ? '' : '<a class="btn ghost newmsgbtn" href="#/messages/new" title="Start a new message">:ic-edit: <span>New message</span></a>'}${isStaff ? `<button type="button" class="ibtn" id="ctxtoggle" aria-label="Customer details" title="Customer details">:ic-users:</button>${conv ? `<button type="button" class="btn ghost" id="closeconv" style="padding:6px 12px;min-height:0">${conv.closed ? 'Reopen' : 'Close'} conversation</button>` : ''}` : ''}</header>
    <div class="thread" id="thread"></div><div class="typing" id="typing" hidden>${esc(peerName)} is typing<span>.</span><span>.</span><span>.</span></div>
    ${closedCust ? '<p class="closednote">:ic-lock: This conversation was closed by the store team. <a href="#/messages/new">Start a new message</a> if you need anything else.</p>' : `<div class="composer2" id="composer2"><div class="pend" id="pend" hidden></div>
      <div class="ctools"><button type="button" class="ibtn" id="attachbtn" aria-label="Attach a file" title="Attach photos or files">:ic-paperclip:</button><input type="file" id="dmfile" accept="${CHAT_FILES}" multiple hidden>
        ${myOrders.length ? `<select id="orderpick" aria-label="Attach an order"><option value="">Attach an order…</option>${myOrders.map((o) => `<option value="${o.id}">Order #${o.id} · ${esc(o.status)} · ${money(o.total_cents)}</option>`).join('')}</select>` : ''}
        ${isStaff ? `<span class="grow"></span><div class="qrwrap"><button type="button" class="btn ghost qrbtn" id="qrbtn">:ic-chat: Quick replies</button><div class="qr" id="qr" hidden><div id="qrlist"></div><form id="qradd" class="stack"><b style="font-size:.85rem">Save a new quick reply</b><input name="title" placeholder="Title (e.g. Delivery times)" maxlength="60" required><textarea name="body" rows="2" placeholder="Message text" maxlength="2000" required></textarea><button class="btn ghost">Save quick reply</button></form></div></div>
        <label class="switch" title="Only your team can see internal notes"><input type="checkbox" id="dminternal"><span class="track"></span><span>Internal note</span></label>` : ''}</div>
      <form id="dmform" class="composer"><button type="button" class="plusbtn" id="plusbtn" aria-label="Attachments and more" aria-expanded="false">:ic-paperclip:</button><textarea name="body" rows="1" maxlength="5000" placeholder="Message ${esc(isStaff ? peerName : 'the store team')}…" aria-label="Message"></textarea><button class="send" aria-label="Send message">:ic-send:</button></form></div>`}`;
  return `<div class="dm ${showList ? '' : 'solo'} ${conv && showList ? 'has-chat' : ''} ${isStaff ? 'withctx' : ''}">${showList ? `<aside class="dmlist"><div class="dmlist-head"><div class="row" style="justify-content:space-between;flex-wrap:nowrap"><b>Messages</b><a class="btn newmsgbtn" href="#/messages/new${isStaff ? '?compose=1' : ''}">:ic-edit: <span>New message</span></a></div><input id="dmsearch" placeholder="${isStaff ? 'Search customers or messages…' : 'Search your messages…'}" aria-label="Search"><div class="chips" style="margin:0"><button type="button" class="chip on" data-mode="">All</button><button type="button" class="chip" data-mode="unread">Unread</button>${isStaff ? '<button type="button" class="chip" data-mode="closed">Closed</button>' : ''}</div></div><div id="dmrows">${listHtml(inbox, selected, '', '', !isStaff)}</div></aside>` : ''}<section class="dmchat">${chat}</section>${isStaff && conv ? '<aside class="dmctx" id="dmctx"><p class="muted" style="padding:16px">Loading customer…</p></aside>' : ''}</div>`;
};
async function loadContext() {
  const el = document.getElementById('dmctx'); if (!el || !DM?.conv) return; const cid = DM.conv.customer_id;
  const [pr, ords, info, inv] = await Promise.all([sb.from('profiles').select('name,email,username,created_at').eq('id', cid).maybeSingle(), sb.from('orders').select('id,status,total_cents,tax_cents,refunded_cents,created_at').eq('user_id', cid).order('id', { ascending: false }).limit(100), sb.from('customer_info').select('*').eq('user_id', cid).maybeSingle(), sb.from('invoices').select('id,total_cents,paid_cents,status').eq('customer_id', cid)]);
  const u = pr.data || {}, os = (ords.data || []).filter((o) => o.status !== 'cancelled'), spent = os.reduce((a, o) => a + net(o), 0), ci = info.data || { tags: [], notes: '' }, owing = (inv.data || []).filter((i) => i.status === 'sent').reduce((a, i) => a + i.total_cents - i.paid_cents, 0);
  el.innerHTML = `<div class="ctxhead">${avatar(u.name || u.email || '?')}<div style="min-width:0"><b>${esc(u.name || 'Customer')}</b><small class="muted" style="display:block;overflow-wrap:anywhere">${u.username ? '@' + esc(u.username) + ' · ' : ''}${esc(u.email || '')}</small></div></div>
    ${(ci.tags || []).length ? `<div class="chips" style="margin:0">${ci.tags.map((t) => `<span class="status">${esc(t)}</span>`).join('')}</div>` : ''}
    <div class="ctxstats"><div><b>${os.length}</b><small>orders</small></div><div><b>${money(spent)}</b><small>spent</small></div><div><b class="${owing ? 'down' : ''}">${money(owing)}</b><small>owing</small></div></div>
    <h4>Recent orders</h4>${(ords.data || []).slice(0, 5).map((o) => `<a class="orow" href="#/admin/orders/${o.id}"><span class="oid"><b>#${o.id}</b></span><span class="oname"><small class="muted">${ago(o.created_at)}</small></span><span class="status ${esc(o.status)}">${esc(o.status)}</span><b class="ototal">${money(o.total_cents)}</b></a>`).join('') || '<p class="muted" style="margin:0">No orders yet.</p>'}
    ${ci.notes ? `<h4>Private notes</h4><p style="white-space:pre-wrap;margin:0;font-size:.92rem">${esc(ci.notes)}</p>` : ''}
    <div class="stack" style="gap:8px;margin-top:6px"><a class="btn ghost" href="#/admin/customers/${cid}">View customer</a>${can('invoices.manage') ? `<a class="btn ghost" href="#/admin/invoices/new">New invoice</a><a class="btn ghost" href="#/admin/estimates/new">New estimate</a>` : ''}</div>`;
}
pages.messages.after = () => {
  if (document.getElementById('newmsg')) { document.body.classList.remove('chatfull'); initCompose(); return; }
  if (!DM) return;
  { const full = window.matchMedia('(max-width:760px)').matches && !!DM.conv; document.body.classList.toggle('chatfull', full);
    if (full && window.visualViewport) { const setVh = () => { const el = document.querySelector('.dm'); if (!el) return; el.style.setProperty('--vvh', window.visualViewport.height + 'px'); const t = document.getElementById('thread'); if (t) t.scrollTop = t.scrollHeight; }; setVh(); window.visualViewport.addEventListener('resize', setVh); const off = () => { window.visualViewport.removeEventListener('resize', setVh); window.removeEventListener('hashchange', off); }; window.addEventListener('hashchange', off); } }
  document.getElementById('plusbtn')?.addEventListener('click', (e) => { const c = document.getElementById('composer2'); const on = c.classList.toggle('opentools'); e.currentTarget.setAttribute('aria-expanded', String(on)); });
  document.getElementById('thread')?.addEventListener('click', (e) => { const m = e.target.closest('.msg'); if (!m || e.target.closest('a,button,.un')) return; const was = m.classList.contains('sel'); document.querySelectorAll('.msg.sel').forEach((x) => x.classList.remove('sel')); if (!was && m.querySelector('.un')) m.classList.add('sel'); });
  const $ = (i) => document.getElementById(i), listEl = $('dmrows'); let mode = '';
  const redrawList = () => { if (listEl) listEl.innerHTML = listHtml(DM.inbox, DM.conv?.id, $('dmsearch')?.value || '', mode, !DM.isStaff); };
  $('dmsearch')?.addEventListener('input', redrawList);
  document.querySelectorAll('.dmlist-head [data-mode]').forEach((b) => b.addEventListener('click', () => { mode = b.dataset.mode; document.querySelectorAll('.dmlist-head [data-mode]').forEach((x) => x.classList.toggle('on', x === b)); redrawList(); }));
  if (DM.showList) threadChan.push(sb.channel('inbox').on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, async () => { DM.inbox = await loadInbox(!DM.isStaff); redrawList(); }).subscribe());
  $('ctxtoggle')?.addEventListener('click', () => document.querySelector('.dm').classList.toggle('showctx'));
  $('closeconv')?.addEventListener('click', async () => { const { error } = await sb.from('conversations').update({ closed: !DM.conv.closed }).eq('id', DM.conv.id); error ? fail(error) : route(); });
  loadContext();
  const form = $('dmform');
  if (!form && !$('thread')) return;
  renderThread(true); markRead();
  const thread = $('thread');
  thread?.addEventListener('click', async (e) => {
    const un = e.target.closest('.un'); if (un) { const { error } = await sb.rpc('delete_message', { mid: Number(un.dataset.id) }); if (error) fail(error); else { const m = DM.msgs.find((x) => x.id === Number(un.dataset.id)); if (m) { m.deleted_at = new Date().toISOString(); m.body = ''; m.attachments = []; m.order_id = null; renderThread(); } } return; }
    const t = e.target.closest('.topic'); if (t && form) { form.elements.body.value = t.textContent; form.elements.body.focus(); return; }
    const att = e.target.closest('a.att'); if (att) { e.preventDefault(); let url = DM.urls[att.dataset.path]; if (!url) { const r = await sb.storage.from('message-files').createSignedUrl(att.dataset.path, 3600); url = r.data?.signedUrl; if (url) DM.urls[att.dataset.path] = url; } if (!url) return fail(new Error('Could not open that file.')); if (att.classList.contains('img')) window.open(url, '_blank', 'noopener'); else { const a = document.createElement('a'); a.href = url; a.download = att.dataset.name; a.click(); } }
  });
  if (!form) return;
  const ta = form.elements.body, mine = DM.isStaff ? 'admin' : 'customer';
  const grow = () => { ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight, 140) + 'px'; };
  let typingChan = null, lastTyping = 0, hideTyping = null;
  const joinChannel = () => {
    if (!DM.conv || typingChan) return; const cid = DM.conv.id;
    typingChan = sb.channel('dm-' + cid, { config: { broadcast: { self: false }, presence: { key: session.user.id } } })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${cid}` }, (pl) => {
        if (!DM.msgs.some((m) => m.id === pl.new.id)) DM.msgs.push(pl.new);
        renderThread(isMine(pl.new)); if (!isMine(pl.new) && !pl.new.internal) { $('typing').hidden = true; markRead(); }
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages', filter: `conversation_id=eq.${cid}` }, (pl) => { const m = DM.msgs.find((x) => x.id === pl.new.id); if (m) { Object.assign(m, pl.new); renderThread(); } })
      .on('broadcast', { event: 'typing' }, () => { const t = $('typing'); if (!t) return; t.hidden = false; thread.scrollTop = thread.scrollHeight; clearTimeout(hideTyping); hideTyping = setTimeout(() => (t.hidden = true), 3000); })
      .on('presence', { event: 'sync' }, () => {
        const st = typingChan.presenceState(); DM.online = Object.values(st).flat().some((x) => x.role !== mine); const el = $('dmstatus');
        if (el) { if (DM.online) el.innerHTML = '<span class="onl"></span> Online'; else el.textContent = DM.isStaff ? 'Customer' : 'Replies usually within a day'; }
      })
      .subscribe((status) => { if (status === 'SUBSCRIBED') typingChan.track({ role: mine }); });
    threadChan.push(typingChan);
  };
  joinChannel();
  ta.addEventListener('input', () => { grow(); if (typingChan && !DM.internal && Date.now() - lastTyping > 2000) { lastTyping = Date.now(); typingChan.send({ type: 'broadcast', event: 'typing', payload: {} }); } });
  const coarse = window.matchMedia?.('(pointer: coarse)').matches;
  ta.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey && !coarse) { e.preventDefault(); form.requestSubmit(); } });
  // attachments, order reference, internal note, quick replies
  $('attachbtn')?.addEventListener('click', () => $('dmfile').click());
  $('dmfile')?.addEventListener('change', (e) => {
    for (const f of e.target.files) { if (DM.pending.length >= 6) { fail(new Error('You can attach up to 6 files per message.')); break; } if (f.size > 10 * 1024 * 1024) { fail(new Error(`"${f.name}" is over 10 MB.`)); continue; } DM.pending.push(f); }
    e.target.value = ''; renderPending();
  });
  $('orderpick')?.addEventListener('change', (e) => { DM.pendingOrder = e.target.value ? Number(e.target.value) : null; e.target.value = ''; renderPending(); });
  $('pend')?.addEventListener('click', (e) => { const rm = e.target.closest('[data-rm]'); if (rm) DM.pending.splice(Number(rm.dataset.rm), 1); else if (e.target.closest('[data-rmorder]')) DM.pendingOrder = null; else return; renderPending(); });
  $('dminternal')?.addEventListener('change', (e) => { DM.internal = e.target.checked; $('composer2').classList.toggle('isnote', DM.internal); ta.placeholder = DM.internal ? 'Internal note — only your team will see this' : `Message ${DM.peerName}…`; });
  const drawReplies = () => { $('qrlist').innerHTML = DM.replies.length ? DM.replies.map((r) => `<div class="qritem"><button type="button" class="qruse" data-id="${r.id}"><b>${esc(r.title)}</b><small class="muted">${esc(r.body.slice(0, 90))}</small></button><button type="button" class="ibtn danger qrdel" data-id="${r.id}" aria-label="Delete quick reply">:ic-x:</button></div>`).join('') : '<p class="muted" style="margin:6px 4px">No quick replies yet — add one below.</p>'; };
  if ($('qr')) {
    drawReplies();
    $('qrbtn').addEventListener('click', () => { $('qr').hidden = !$('qr').hidden; });
    $('qr').addEventListener('click', async (e) => {
      const use = e.target.closest('.qruse'), del = e.target.closest('.qrdel');
      if (use) { const r = DM.replies.find((x) => x.id === Number(use.dataset.id)); ta.value = (ta.value ? ta.value + '\n' : '') + r.body; grow(); ta.focus(); $('qr').hidden = true; }
      if (del && confirm('Delete this quick reply?')) { const { error } = await sb.from('canned_replies').delete().eq('id', Number(del.dataset.id)); if (error) return fail(error); DM.replies = DM.replies.filter((x) => x.id !== Number(del.dataset.id)); drawReplies(); }
    });
    $('qradd').addEventListener('submit', async (e) => { e.preventDefault(); const f = Object.fromEntries(new FormData(e.target)); const { data, error } = await sb.from('canned_replies').insert({ title: f.title.trim(), body: f.body.trim() }).select('*').single(); if (error) return fail(error); DM.replies.push(data); drawReplies(); e.target.reset(); });
  }
  form.addEventListener('submit', async (e) => {
    e.preventDefault(); const body = ta.value.trim(); if (!body && !DM.pending.length && !DM.pendingOrder) return; const btn = form.querySelector('.send'); btn.disabled = true;
    try {
      if (!DM.conv) { const r = await sb.from('conversations').insert({ customer_id: session.user.id, subject: 'Direct message' }).select('*').single(); if (r.error) throw r.error; DM.conv = r.data; joinChannel(); }
      const attachments = [];
      for (let f of DM.pending) {
        f = await prepImage(f);
        const path = `conv_${DM.conv.id}/${crypto.randomUUID()}-${f.name.replace(/[^a-zA-Z0-9.]+/g, '-').slice(-70)}`;
        const up = await sb.storage.from('message-files').upload(path, f, { contentType: f.type || 'application/octet-stream' }); if (up.error) throw up.error;
        attachments.push({ path, name: f.name, type: f.type || 'application/octet-stream', size: f.size });
      }
      const { data, error } = await sb.from('messages').insert({ conversation_id: DM.conv.id, body, attachments, order_id: DM.pendingOrder, internal: DM.internal }).select('*').single(); if (error) throw error;
      ta.value = ''; grow(); DM.pending = []; DM.pendingOrder = null; renderPending();
      if (!DM.msgs.some((m) => m.id === data.id)) DM.msgs.push(data); renderThread(true); ta.focus();
    } catch (err) { fail(err); } finally { btn.disabled = false; }
  });
  if (!coarse) ta.focus();
};

// ---- custom pages (admin-editable) ----
let sitePages = [];
async function loadPages() {
  const { data } = await sb.from('pages').select('id,slug,title,show_in_nav,show_in_footer,sort,publish_at,unpublish_at').eq('published', true).order('sort').order('title');
  const nowIso = new Date().toISOString(); sitePages = (data || []).filter((x) => (!x.publish_at || x.publish_at <= nowIso) && (!x.unpublish_at || x.unpublish_at > nowIso)); renderNav();
  const f = document.getElementById('footpages'); if (f) f.innerHTML = sitePages.filter((x) => x.show_in_footer).length ? `<b>Info</b><br>${sitePages.filter((x) => x.show_in_footer).map((x) => `<a href="#/page/${esc(x.slug)}">${esc(x.title)}</a>`).join('<br>')}` : '';
}
const okUrl = (u) => /^(https?:\/\/|mailto:|#\/|\/)[^\s"'<>]*$/.test(u);
// Small, safe Markdown renderer: everything is escaped first, only whitelisted formatting is produced.
function md(src) {
  const inline = (t) => {
    t = esc(t);
    t = t.replace(/!\[([^\]]*)\]\((https?:\/\/[^\s)]+|\/[^\s)]*)\)/g, (m, a, u) => `<img src="${u}" alt="${a}" loading="lazy">`);
    t = t.replace(/\[([^\]]+)\]\(((?:https?:\/\/|mailto:|#\/|\/)[^\s)]*)\)/g, (m, a, u) => `<a href="${u}"${/^https?:/.test(u) ? ' target="_blank" rel="noopener"' : ''}>${a}</a>`);
    return t.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>').replace(/`([^`]+)`/g, '<code>$1</code>');
  };
  const lines = String(src || '').replace(/\r/g, '').split('\n'); let out = '', i = 0;
  while (i < lines.length) {
    const L = lines[i]; let m;
    if (!L.trim()) { i++; continue; }
    if ((m = /^(#{1,3})\s+(.*)$/.exec(L))) { out += `<h${m[1].length}>${inline(m[2])}</h${m[1].length}>`; i++; }
    else if (/^(-{3,}|\*{3,})\s*$/.test(L)) { out += '<hr>'; i++; }
    else if ((m = /^\{\{button:\s*(.+?)\s*\|\s*(\S+?)\s*\}\}\s*$/.exec(L))) { out += okUrl(m[2]) ? `<p><a class="btn" href="${esc(m[2])}"${/^https?:/.test(m[2]) ? ' target="_blank" rel="noopener"' : ''}>${esc(m[1])}</a></p>` : ''; i++; }
    else if ((m = /^\{\{columns:\s*(.+?)\s*\}\}\s*$/.exec(L))) { const cols = m[1].split('|').map((x) => x.trim()).filter(Boolean).slice(0, 4); out += `<div class="mdcols c${cols.length}">${cols.map((c) => `<div>${inline(c)}</div>`).join('')}</div>`; i++; }
    else if ((m = /^\{\{image:\s*(\S+?)\s*(?:\|\s*(.*?))?\s*\}\}\s*$/.exec(L))) { out += /^(https?:\/\/|\/)/.test(m[1]) ? `<figure class="mdfig"><img src="${esc(m[1])}" alt="${esc(m[2] || '')}" loading="lazy">${m[2] ? `<figcaption>${esc(m[2])}</figcaption>` : ''}</figure>` : ''; i++; }
    else if ((m = /^\{\{products:\s*(.*?)\s*\}\}\s*$/.exec(L))) { const o = {}; m[1].split('|').forEach((kv) => { const [k, ...v] = kv.split('='); if (k && v.length) o[k.trim().toLowerCase()] = v.join('=').trim(); }); out += `<div class="mdgrid" data-category="${esc(o.category || '')}" data-brand="${esc(o.brand || '')}" data-limit="${Math.min(12, Math.max(1, parseInt(o.limit, 10) || 4))}"></div>`; i++; }
    else if (/^\{\{contact\}\}\s*$/.test(L)) { const b = STORE.biz || {}; out += `<div class="mdcontact"><b>${esc(b.legal_name || theme.name || 'Contact us')}</b>${b.phone ? `<a href="tel:${esc(String(b.phone).replace(/[^+\d]/g, ''))}">${esc(b.phone)}</a>` : ''}${b.email ? `<a href="mailto:${esc(b.email)}">${esc(b.email)}</a>` : ''}${b.address ? `<span style="white-space:pre-line">${esc(b.address)}</span>` : ''}${STORE.hours && Object.values(STORE.hours).some(Boolean) ? `<small class="muted">${hoursLines(STORE.hours).map(esc).join('<br>')}</small>` : ''}${(() => { const st = openStatus(); return st ? `<small class="openstat ${st.open ? 'on' : ''}"><i></i>${esc(st.text)}</small>` : ''; })()}</div>`; i++; }
    else if ((m = /^\{\{quote:\s*(.+?)\s*(?:\|\s*(.*?))?\s*\}\}\s*$/.exec(L))) { out += `<blockquote class="mdquote">“${inline(m[1])}”${m[2] ? `<cite>— ${esc(m[2])}</cite>` : ''}</blockquote>`; i++; }
    else if ((m = /^\{\{youtube:\s*(\S+?)\s*\}\}\s*$/.exec(L))) { const id = (/(?:v=|youtu\.be\/|embed\/)([\w-]{11})/.exec(m[1]) || [])[1]; out += id ? `<div class="mdvideo"><iframe src="https://www.youtube-nocookie.com/embed/${id}" title="Video" loading="lazy" allowfullscreen></iframe></div>` : ''; i++; }
    else if ((m = /^\{\{product:\s*([a-z0-9-]+)\s*\}\}\s*$/.exec(L))) { out += `<div class="mdprod" data-slug="${m[1]}"></div>`; i++; }
    else if ((m = /^\{\{callout:\s*(.+?)\s*\}\}\s*$/.exec(L))) { out += `<div class="mdcallout">:ic-alert: <span>${inline(m[1])}</span></div>`; i++; }
    else if (/^\{\{faq:/.test(L)) { let it = []; while (i < lines.length && (m = /^\{\{faq:\s*(.+?)\s*\|\s*(.+?)\s*\}\}\s*$/.exec(lines[i]))) { it.push(m); i++; } if (!it.length) i++; out += it.map((x) => `<details class="mdfaq"><summary>${inline(x[1])}</summary><p>${inline(x[2])}</p></details>`).join(''); }
    else if (/^\|.*\|\s*$/.test(L) && /^\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(lines[i + 1] || '')) {
      const cells = (r) => r.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim()); const head = cells(L); i += 2; let rows = [];
      while (i < lines.length && /^\|.*\|\s*$/.test(lines[i])) rows.push(cells(lines[i++]));
      out += `<div class="tablewrap"><table class="mdtable"><tr>${head.map((c) => `<th>${inline(c)}</th>`).join('')}</tr>${rows.map((r) => `<tr>${head.map((_, k) => `<td>${inline(r[k] || '')}</td>`).join('')}</tr>`).join('')}</table></div>`; }
    else if (/^>\s?/.test(L)) { let q = []; while (i < lines.length && /^>\s?/.test(lines[i])) q.push(lines[i++].replace(/^>\s?/, '')); out += `<blockquote>${q.map(inline).join('<br>')}</blockquote>`; }
    else if (/^[-*]\s+/.test(L)) { let it = []; while (i < lines.length && /^[-*]\s+/.test(lines[i])) it.push(lines[i++].replace(/^[-*]\s+/, '')); out += `<ul>${it.map((x) => `<li>${inline(x)}</li>`).join('')}</ul>`; }
    else if (/^\d+\.\s+/.test(L)) { let it = []; while (i < lines.length && /^\d+\.\s+/.test(lines[i])) it.push(lines[i++].replace(/^\d+\.\s+/, '')); out += `<ol>${it.map((x) => `<li>${inline(x)}</li>`).join('')}</ol>`; }
    else { let para = []; while (i < lines.length && lines[i].trim() && !/^(#{1,3}\s|>\s?|[-*]\s+|\d+\.\s+|-{3,}\s*$|\{\{|\|.*\|\s*$)/.test(lines[i])) para.push(lines[i++]); out += `<p>${para.map(inline).join('<br>')}</p>`; }
  }
  return out;
}
async function hydrateGrids(root) {
  for (const el of [...root.querySelectorAll('.mdgrid:not([data-done])')]) { el.dataset.done = '1';
    let req = sb.from('products').select('*').eq('active', true).limit(Number(el.dataset.limit) || 4); if (el.dataset.category) req = req.eq('category', el.dataset.category); if (el.dataset.brand) req = req.eq('brand', el.dataset.brand);
    const { data } = await req.order('name'); await attachPacks(data || []); el.innerHTML = (data || []).length ? `<div class="grid">${data.map(card).join('')}</div>` : '<small class="muted">No products match this block.</small>'; syncCmpBoxes(); }
}
async function hydrateMd(root) {
  hydrateGrids(root);
  const els = [...root.querySelectorAll('.mdprod:not([data-done])')]; if (!els.length) return;
  const slugs = [...new Set(els.map((e) => e.dataset.slug))]; const { data } = await sb.from('products').select('name,slug,price_cents,unit,image_url,active').in('slug', slugs);
  els.forEach((el) => { el.dataset.done = '1'; const p = (data || []).find((x) => x.slug === el.dataset.slug && x.active);
    el.innerHTML = p ? `<a class="mdcard" href="#/product/${esc(p.slug)}">${safeUrl(p.image_url) ? `<img src="${esc(p.image_url)}" alt="" loading="lazy">` : ''}<span><b>${esc(p.name)}</b><small>${money(p.price_cents)} / ${esc(p.unit)}</small></span><span class="btn">View</span></a>` : `<small class="muted">Product “${esc(el.dataset.slug)}” not found.</small>`; });
}
const PAGE_TEMPLATES = {
  blank: ['Blank page', '# Page title\n\nWrite your content here.'],
  about: ['About us', "# About us\n\nTell your story: who you are, how long you've been insulating homes, and what makes you different.\n\n## Why choose us\n\n- Quality materials from trusted brands\n- Fast delivery to your site\n- Friendly advice from people who know insulation\n\n{{button: Shop now | #/shop}}"],
  faq: ['FAQ', '# Frequently asked questions\n\n{{faq: How long does delivery take? | Most orders arrive within 3–5 business days.}}\n{{faq: Can I pick up my order? | Yes — choose pickup at checkout and we will email you when it is ready.}}\n{{faq: Which R-value do I need? | It depends on your climate zone and where you are insulating. Ask us for a quote.}}\n\n{{button: Ask a question | #/quote}}'],
  shipping: ['Shipping & returns', '# Shipping & returns\n\n## Delivery\n\n| Order size | Cost | Time |\n| --- | --- | --- |\n| Under $500 | Flat rate | 3–5 days |\n| $500 and over | Free | 3–5 days |\n\n## Returns\n\n{{callout: Unopened products can be returned within 30 days.}}\n\nContact us to arrange a return.'],
  contact: ['Contact', '# Contact us\n\nWe would love to hear from you.\n\n{{contact}}\n\n{{button: Request a quote | #/quote}}'],
  landing: ['Landing page', '## Why choose us\n\n{{columns: **Stocked locally** — most orders ship within days. | **Trade pricing** — ask for a quote on big jobs. | **Expert advice** — we help you pick the right R-value.}}\n\n## Popular products\n\n{{products: limit=4}}\n\n{{quote: Fast delivery and the right product the first time. | A happy customer}}\n\n{{button: Shop the catalogue | #/shop}}'],
  install: ['Installation guide', '# Installation guide\n\n{{callout: Wear gloves, a mask and eye protection when handling insulation.}}\n\n## Before you start\n\n1. Measure the area\n2. Use the [insulation calculator](#/calculator)\n3. Seal air leaks first\n\n{{youtube: https://www.youtube.com/watch?v=VIDEO_ID}}\n\n{{faq: Can I install over old insulation? | Usually yes if it is dry and in good condition.}}'],
};
const wordStats = (t) => { const w = (t.trim().match(/\S+/g) || []).length; return `${w} word${w === 1 ? '' : 's'} · ${Math.max(1, Math.round(w / 200))} min read`; };
pages.page = async ([slug]) => {
  const { data: pg } = await sb.from('pages').select('*').eq('slug', slug).maybeSingle();
  if (!pg) return '<h1>Page not found</h1><p><a href="#/">Back home</a></p>';
  setSeo({ title: pg.seo_title || pg.title, description: pg.seo_description || clip(pg.body.replace(/[#*>\[\]()`_{}|!-]+/g, ' '), 200), path: '/page/' + pg.slug + '/', noindex: !pg.published || !((!pg.publish_at || new Date(pg.publish_at) <= new Date()) && (!pg.unpublish_at || new Date(pg.unpublish_at) > new Date())) });
  const live = pg.published && (!pg.publish_at || new Date(pg.publish_at) <= new Date()) && (!pg.unpublish_at || new Date(pg.unpublish_at) > new Date());
  const note = !pg.published ? 'Draft — only admins can see this page.' : !live ? (pg.publish_at && new Date(pg.publish_at) > new Date() ? `Scheduled — goes live ${new Date(pg.publish_at).toLocaleString()}. Only admins can see it now.` : 'Expired — no longer public. Only admins can see it.') : '';
  const cover = safeUrl(pg.cover_url || '');
  return `${cover || pg.subtitle ? `<header class="pagecover ${cover ? 'has-img' : ''}" ${cover ? `style="background-image:url('${esc(cover)}')"` : ''}><div><h1>${esc(pg.title)}</h1>${pg.subtitle ? `<p>${esc(pg.subtitle)}</p>` : ''}</div></header>` : ''}<article class="prose ${pg.layout === 'wide' ? 'wide' : pg.layout === 'full' ? 'full' : ''}">${note ? `<p class="flash error" style="margin-top:0">${esc(note)}</p>` : ''}${profile?.is_admin ? `<p style="text-align:right"><a class="btn ghost" href="#/admin/pages/${pg.id}">:ic-edit: Edit page</a></p>` : ''}${cover || pg.subtitle ? '' : ''}${md(pg.body)}</article>`;
};
pages.page.after = () => hydrateMd(document);

// ---- locations, inventory, sales, point of sale (admin) ----
const net = (o) => o.total_cents - (o.tax_cents || 0) - (o.refunded_cents || 0);
const KINDS = { warehouse: 'Warehouse', store: 'Store', showroom: 'Showroom', other: 'Other' };
let LOC = null, POS = null, SALES_ROWS = [], CMPP = null;
const download = (name, rows) => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([rows.map((r) => r.map(csvCell).join(',')).join('\n')], { type: 'text/csv' })); a.download = name; a.click(); };
const isoDay = (d) => { const t = new Date(d); return new Date(t - t.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };
function bucketize(orders, days) {
  const mode = days === 'all' ? 'month' : Number(days) <= 31 ? 'day' : Number(days) <= 120 ? 'week' : 'month';
  const n = mode === 'day' ? Number(days) : mode === 'week' ? 13 : (days === 'all' ? 24 : 12), now = new Date(), bs = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now); if (mode === 'day') d.setDate(d.getDate() - i); else if (mode === 'week') d.setDate(d.getDate() - i * 7); else d.setMonth(d.getMonth() - i, 1);
    bs.push({ d, v: 0, label: mode === 'month' ? d.toLocaleDateString(undefined, { month: 'short' }) : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) });
  }
  const keyOf = (d) => { const t = new Date(d); if (mode === 'day') return isoDay(t); if (mode === 'month') return t.getFullYear() * 12 + t.getMonth(); return Math.floor((t - bs[0].d) / (7 * 864e5)); };
  orders.forEach((o) => { const k = keyOf(o.created_at); const idx = mode === 'week' ? Math.min(Math.max(k, 0), n - 1) : bs.findIndex((b) => keyOf(b.d) === k); if (idx >= 0) bs[idx].v += net(o); });
  return bs;
}
function barChart(bs) {
  const max = Math.max(...bs.map((b) => b.v), 1), L = 74, R = 10, W = 1000, top = 14, base = 176, ph = base - top, w = (W - L - R) / bs.length, step = Math.ceil(bs.length / 14);
  const nice = (v) => (v >= 1e5 ? money(Math.round(v / 1e4) * 1e4).replace('.00', '') : money(Math.round(v)).replace('.00', ''));
  return `<svg viewBox="0 0 ${W} 216" role="img" aria-label="Sales chart" style="width:100%;height:auto"><g stroke="var(--line)" stroke-width="1">${[0, .5, 1].map((f) => `<line x1="${L}" x2="${W - R}" y1="${base - ph * f}" y2="${base - ph * f}"/>`).join('')}</g>
    <g font-size="15" fill="var(--muted)" text-anchor="end">${[0, .5, 1].map((f) => `<text x="${L - 8}" y="${base - ph * f + 4}">${nice(max * f)}</text>`).join('')}</g>
    ${bs.map((b, i) => { const h = b.v / max * ph, x = L + i * w; return `<g><title>${b.label}: ${money(b.v)}</title><rect x="${x + 3}" y="${base - h}" width="${Math.max(w - 6, 2)}" height="${Math.max(h, 2)}" rx="3" fill="var(--brand)" opacity="${b.v ? 1 : .25}"/>${i % step === 0 ? `<text x="${x + w / 2}" y="203" font-size="15" text-anchor="middle" fill="var(--muted)">${b.label}</text>` : ''}</g>`; }).join('')}</svg>`;
}
const rangeChips = (base, q) => `<div class="chips">${[['7', '7 days'], ['30', '30 days'], ['90', '90 days'], ['365', '12 months'], ['all', 'All time']].map(([v, l]) => { const n = new URLSearchParams(q); n.set('days', v); return `<a class="chip ${(q.get('days') || '30') === v ? 'on' : ''}" href="${base}?${n}">${l}</a>`; }).join('')}</div>`;

// ---- invoicing, purchasing, team, activity ----
let INV = null, PO = null, STMT = null, PNL = [];
const todayStr = () => new Date().toISOString().slice(0, 10);
const addDays = (d, n) => { const t = new Date(d + 'T12:00:00'); t.setDate(t.getDate() + n); return t.toISOString().slice(0, 10); };
const invBal = (i) => i.total_cents - i.paid_cents;
const invEff = (i) => (i.status === 'sent' && invBal(i) > 0 && i.due_date < todayStr() ? 'overdue' : i.status);
const calcInv = (lines, discCents, rate) => {
  let sub = 0, tsub = 0; lines.forEach((l) => { const amt = Math.round((Number(l.qty) || 0) * (Number(l.unit_price_cents) || 0)); sub += amt; if (l.taxable) tsub += amt; });
  const disc = Math.min(Math.max(discCents || 0, 0), sub), taxable = sub ? tsub - Math.round(disc * tsub / sub) : 0, tax = Math.round(taxable * (Number(rate) || 0) / 100);
  return { sub, disc, tax, total: sub - disc + tax };
};
let LASTDOC = null;
function loadScript(src) { return new Promise((res, rej) => { if (document.querySelector(`script[src="${src}"]`)) return res(); const sc = document.createElement('script'); sc.src = src; sc.onload = res; sc.onerror = () => rej(new Error('Could not load the PDF tools (' + src + '). Refresh the page and try again.')); document.head.appendChild(sc); }); }
// Shrinks big photos before upload (max 1600px on the longest side, WebP). GIFs/SVGs and already-small images are left alone.
async function prepImage(file, max = 1600, quality = 0.85) {
  if (!file || !/^image\/(jpeg|png|webp)$/.test(file.type)) return file;
  try {
    const bmp = await createImageBitmap(file), scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
    if (scale === 1 && file.size < 400 * 1024) { bmp.close?.(); return file; }
    const w = Math.max(1, Math.round(bmp.width * scale)), h = Math.max(1, Math.round(bmp.height * scale)), cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    const cx = cv.getContext('2d'); cx.imageSmoothingQuality = 'high'; cx.drawImage(bmp, 0, 0, w, h); bmp.close?.();
    const blob = await new Promise((res) => cv.toBlob(res, 'image/webp', quality)); if (!blob || blob.size >= file.size && scale === 1) return file;
    return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.webp', { type: 'image/webp' });
  } catch { return file; }
}
async function buildPdf() {
  if (!LASTDOC) return null; const { inv, items, pays } = LASTDOC, est = 'expires_on' in inv, b = STORE.biz || {};
  await loadScript('vendor/jspdf.umd.min.js'); await loadScript('vendor/jspdf.plugin.autotable.min.js');
  const { jsPDF } = window.jspdf, doc = new jsPDF({ unit: 'pt', format: 'a4' }), W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight(), M = 44;
  const hex = (getComputedStyle(document.documentElement).getPropertyValue('--brand') || '#ea580c').trim(), rgb = /^#[0-9a-f]{6}$/i.test(hex) ? [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) : [234, 88, 12];
  const m = (c) => money(c).replace(/\u2212/g, '-'), bal = est ? 0 : invBal(inv), paidFull = !est && bal <= 0 && inv.total_cents > 0;
  doc.setFillColor(...rgb); doc.rect(0, 0, W, 8, 'F');
  doc.setFont('helvetica', 'bold').setFontSize(16).setTextColor(20); doc.text(b.legal_name || theme.name || 'Gomi Insulation', M, 46);
  doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(100);
  const biz = [...(b.address || '').split('\n'), b.phone, b.email, b.tax_number ? `${inv.tax_label || STORE.tax_label || 'Tax'} no. ${b.tax_number}` : ''].filter(Boolean); biz.forEach((l, i) => doc.text(String(l), M, 62 + i * 12));
  doc.setFont('helvetica', 'bold').setFontSize(24).setTextColor(...rgb); doc.text(est ? 'ESTIMATE' : 'INVOICE', W - M, 48, { align: 'right' });
  doc.setFontSize(9).setTextColor(60); const meta = [['Number', inv.number], ['Issued', inv.issue_date], [est ? 'Valid until' : 'Due', est ? inv.expires_on : inv.due_date]];
  meta.forEach(([k, v], i) => { doc.setFont('helvetica', 'normal').setTextColor(120).text(k, W - M - 120, 68 + i * 14); doc.setFont('helvetica', 'bold').setTextColor(20).text(String(v), W - M, 68 + i * 14, { align: 'right' }); });
  let y = Math.max(62 + biz.length * 12, 68 + meta.length * 14) + 26;
  doc.setFont('helvetica', 'bold').setFontSize(8).setTextColor(120).text('BILL TO', M, y); doc.setFontSize(11).setTextColor(20).text(inv.customer_name || '', M, y + 15);
  doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(70); const to = [...(inv.customer_address || '').split('\n'), inv.customer_email].filter(Boolean); to.forEach((l, i) => doc.text(String(l), M, y + 29 + i * 12)); y += 36 + to.length * 12;
  doc.autoTable({ startY: y, margin: { left: M, right: M, bottom: 60 }, head: [['Description', 'Qty', 'Rate', 'Amount']], body: items.map((i) => [i.description + (i.taxable ? '' : ' (no tax)'), String(Number(i.qty)), m(i.unit_price_cents), m(Math.round(Number(i.qty) * i.unit_price_cents))]),
    styles: { font: 'helvetica', fontSize: 9.5, cellPadding: 7, textColor: 30 }, headStyles: { fillColor: rgb, textColor: 255 }, didParseCell: (d) => { if (d.section === 'head' && d.column.index > 0) d.cell.styles.halign = 'right'; }, alternateRowStyles: { fillColor: [249, 248, 246] }, columnStyles: { 1: { halign: 'right', cellWidth: 50 }, 2: { halign: 'right', cellWidth: 80 }, 3: { halign: 'right', cellWidth: 90 } } });
  y = doc.lastAutoTable.finalY + 16; const need = (h) => { if (y + h > H - 60) { doc.addPage(); y = 50; } };
  const row = (k, v, bold) => { need(18); doc.setFont('helvetica', bold ? 'bold' : 'normal').setFontSize(bold ? 12 : 10).setTextColor(bold ? 20 : 80); doc.text(k, W - M - 170, y); doc.text(v, W - M, y, { align: 'right' }); y += bold ? 20 : 16; };
  row('Subtotal', m(inv.subtotal_cents)); if (inv.discount_cents) row('Discount', '-' + m(inv.discount_cents)); if (inv.tax_cents) row(`${inv.tax_label || 'Tax'} (${Number(inv.tax_rate)}%)`, m(inv.tax_cents)); row('Total', m(inv.total_cents), true);
  if (!est) { if (inv.paid_cents) row('Paid', '-' + m(inv.paid_cents)); doc.setTextColor(...rgb); row('Balance due', m(bal), true); }
  if (!est && (pays || []).length) { y += 8; need(40); doc.setFont('helvetica', 'bold').setFontSize(10).setTextColor(20).text('Payments received', M, y); doc.autoTable({ startY: y + 6, margin: { left: M, right: M }, body: pays.map((p) => [p.paid_on, p.method || 'Payment', m(p.amount_cents)]), styles: { fontSize: 9, cellPadding: 5 }, theme: 'plain', columnStyles: { 2: { halign: 'right' } } }); y = doc.lastAutoTable.finalY + 10; }
  const block = (title, text) => { if (!text) return; const lines = doc.setFont('helvetica', 'normal').setFontSize(9).splitTextToSize(String(text), W - 2 * M); need(16 + lines.length * 12); doc.setFont('helvetica', 'bold').setTextColor(20).text(title, M, y); doc.setFont('helvetica', 'normal').setTextColor(80).text(lines, M, y + 13); y += 22 + lines.length * 12; };
  block('Notes', inv.notes); block('Terms', inv.terms); if (!est && bal > 0) block('How to pay', STORE.invoice_pay_info);
  const pages = doc.getNumberOfPages(); for (let i = 1; i <= pages; i++) { doc.setPage(i); doc.setFontSize(8).setTextColor(150).text(`${inv.number} · Page ${i} of ${pages}`, W / 2, H - 24, { align: 'center' });
    if (paidFull && i === 1) { doc.setTextColor(22, 163, 74).setFont('helvetica', 'bold').setFontSize(40); doc.saveGraphicsState(); doc.setGState(new doc.GState({ opacity: 0.25 })); doc.text('PAID', W - M - 10, 130, { align: 'right', angle: 12 }); doc.restoreGraphicsState(); } }
  return { doc, filename: `${est ? 'Estimate' : 'Invoice'}-${inv.number}.pdf`, kind: est ? 'estimate' : 'invoice', id: inv.id };
}
async function downloadPdf() { const r = await buildPdf(); if (r) r.doc.save(r.filename); }
document.addEventListener('click', async (e) => { if (!e.target.closest('.pdfbtn')) return; const btn = e.target.closest('.pdfbtn'); btn.disabled = true; try { await downloadPdf(); } catch (err) { fail(err); } finally { btn.disabled = false; } });
function addPdfButtons() {
  const doc = document.querySelector('.invdoc'); if (!doc) return;
  document.querySelectorAll('#printbtn').forEach((p) => { if (!p.previousElementSibling?.classList.contains('pdfbtn')) p.insertAdjacentHTML('beforebegin', '<button class="btn ghost pdfbtn noprint" type="button">:ic-download: Download PDF</button>'); });
  if (!document.querySelector('.pdfbtn')) doc.insertAdjacentHTML('beforebegin', '<div class="row noprint" style="justify-content:flex-end;margin-bottom:10px"><button class="btn ghost pdfbtn" type="button">:ic-download: Download PDF</button></div>');
}
const invDoc = (inv, items, pays) => {
  LASTDOC = { inv, items, pays };
  const est = 'expires_on' in inv, b = STORE.biz || {}, bal = est ? 0 : invBal(inv), eff = est ? (inv.status === 'sent' && inv.expires_on < todayStr() ? 'expired' : inv.status) : invEff(inv);
  return `<div class="invdoc"><div class="invtop"><div><h2 style="margin:0">${esc(b.legal_name || theme.name || 'Gomi Insulation')}</h2><p class="muted" style="margin:4px 0 0">${[b.address, b.phone, b.email].filter(Boolean).map(esc).join('<br>')}${b.tax_number ? `<br>${esc(inv.tax_label || STORE.tax_label || 'Tax')} no. ${esc(b.tax_number)}` : ''}</p></div>
    <div class="invmeta"><h1 style="margin:0">${est ? 'ESTIMATE' : 'INVOICE'}</h1><table><tr><td>Number</td><td><b>${esc(inv.number)}</b></td></tr><tr><td>Issued</td><td>${esc(inv.issue_date)}</td></tr><tr><td>${est ? 'Valid until' : 'Due'}</td><td>${esc(est ? inv.expires_on : inv.due_date)}</td></tr><tr><td>Status</td><td><span class="status ${['overdue', 'expired', 'declined'].includes(eff) ? 'cancelled' : eff === 'accepted' || eff === 'converted' ? 'paid' : eff}">${eff}</span></td></tr></table></div></div>
    <div class="billto"><small class="muted">BILL TO</small><br><b>${esc(inv.customer_name)}</b>${inv.customer_address ? '<br>' + esc(inv.customer_address).replace(/\n/g, '<br>') : ''}${inv.customer_email ? '<br>' + esc(inv.customer_email) : ''}</div>
    <table class="invitems"><tr><th>Description</th><th class="r">Qty</th><th class="r">Rate</th><th class="r">Amount</th></tr>${items.map((i) => `<tr><td>${esc(i.description)}${i.taxable ? '' : ' <small class="muted">(no tax)</small>'}</td><td class="r">${Number(i.qty)}</td><td class="r">${money(i.unit_price_cents)}</td><td class="r">${money(Math.round(Number(i.qty) * i.unit_price_cents))}</td></tr>`).join('')}</table>
    <dl class="totals" style="margin-left:auto"><dt>Subtotal</dt><dd>${money(inv.subtotal_cents)}</dd>${inv.discount_cents ? `<dt>Discount</dt><dd>−${money(inv.discount_cents)}</dd>` : ''}${inv.tax_cents ? `<dt>${esc(inv.tax_label || 'Tax')} (${Number(inv.tax_rate)}%)</dt><dd>${money(inv.tax_cents)}</dd>` : ''}<dt>Total</dt><dd><b style="${est ? 'font-size:1.2rem' : ''}">${money(inv.total_cents)}</b></dd>${est ? '' : `${inv.paid_cents ? `<dt>Paid</dt><dd>−${money(inv.paid_cents)}</dd>` : ''}<dt><b>Balance due</b></dt><dd><b style="font-size:1.2rem">${money(bal)}</b></dd>`}</dl>
    ${(pays || []).length ? `<h3 style="margin-bottom:6px">Payments received</h3><table class="invitems">${pays.map((p) => `<tr><td>${esc(p.paid_on)}</td><td>${esc(p.method || 'Payment')}</td><td class="r">${money(p.amount_cents)}</td></tr>`).join('')}</table>` : ''}
    ${inv.notes ? `<p style="white-space:pre-wrap"><b>Notes</b><br>${esc(inv.notes)}</p>` : ''}${inv.terms ? `<p class="muted" style="white-space:pre-wrap"><b>Terms</b><br>${esc(inv.terms)}</p>` : ''}${bal > 0 && STORE.invoice_pay_info ? `<div class="trackbox"><span style="white-space:pre-wrap"><b>How to pay</b><br>${esc(STORE.invoice_pay_info)}</span></div>` : ''}</div>`;
};
pages.invoice = async ([id], q) => {
  let inv, items, pays;
  if (q.get('k')) { const { data } = await sb.rpc('get_invoice_public', { iid: Number(id), k: q.get('k') }); if (data) { inv = data; items = data.items; pays = data.payments; } }
  else if (session) { inv = (await sb.from('invoices').select('*').eq('id', id).maybeSingle()).data; if (inv) { items = (await sb.from('invoice_items').select('*').eq('invoice_id', id).order('sort')).data || []; pays = (await sb.from('invoice_payments').select('*').eq('invoice_id', id).order('id')).data || []; } }
  if (!inv) return '<h1>Invoice not found</h1><p class="muted">The link may be wrong, or you may need to <a href="#/login">log in</a>.</p>';
  document.title = `Invoice ${inv.number}`; INVPUB = { id: inv.id, key: q.get('k') || inv.view_key || '' };
  if (q.get('paid')) flash('Thank you — your payment is being processed. This page updates once it is confirmed.');
  const canPay = C.PAYMENTS && INVPUB.key && inv.status === 'sent' && invBal(inv) >= 50, partial = STORE.invoice_allow_partial !== false;
  return `<div class="row noprint" style="justify-content:flex-end;margin-bottom:10px">${canPay ? `<form id="payform2" class="row" style="margin-right:auto">${partial ? `<label class="muted" style="display:flex;gap:8px;align-items:center">Amount to pay <input id="payamt" type="number" step="0.01" min="0.5" max="${(invBal(inv) / 100).toFixed(2)}" value="${(invBal(inv) / 100).toFixed(2)}" style="width:130px"></label>` : ''}<button class="btn" id="payonline">:ic-card: Pay by card</button></form>` : ''}<button class="btn ghost" id="printbtn" type="button">:ic-print: Print / save as PDF</button></div>${invDoc(inv, items, pays)}`;
};
let INVPUB = null, ESTPUB = null, INVSOLD = {}, INVBRANDS = [], PACKROWS_MIN;
pages.invoice.after = () => {
  document.getElementById('printbtn')?.addEventListener('click', () => window.print());
  document.getElementById('payform2')?.addEventListener('submit', async (e) => {
    e.preventDefault(); const btn = document.getElementById('payonline'), amt = document.getElementById('payamt'); btn.disabled = true;
    const body = { invoice_id: INVPUB.id, key: INVPUB.key }; if (amt) body.amount_cents = Math.round(parseFloat(amt.value) * 100);
    const { data, error } = await sb.functions.invoke('invoice-checkout', { body }); btn.disabled = false;
    if (data?.url) location.href = data.url; else { let m = data?.error; if (!m && error?.context?.json) { try { m = (await error.context.json()).error; } catch {} } fail(new Error(m || error?.message || 'Could not start the payment.')); }
  });
};
pages.estimate = async ([id], q) => {
  let est, items;
  if (q.get('k')) { const { data } = await sb.rpc('get_estimate_public', { eid: Number(id), k: q.get('k') }); if (data) { est = data; items = data.items; } }
  else if (session) { est = (await sb.from('estimates').select('*').eq('id', id).maybeSingle()).data; if (est) items = (await sb.from('estimate_items').select('*').eq('estimate_id', id).order('sort')).data || []; }
  if (!est) return '<h1>Estimate not found</h1><p class="muted">The link may be wrong, or you may need to <a href="#/login">log in</a>.</p>';
  document.title = `Estimate ${est.number}`; ESTPUB = { id: est.id, key: q.get('k') || '' };
  const open = est.status === 'sent' && est.expires_on >= todayStr() && ESTPUB.key;
  const msg = est.status === 'accepted' ? '<p class="flash ok" style="margin-top:0">:ic-check-circle: You accepted this estimate. We will be in touch to schedule the work.</p>' : est.status === 'declined' ? '<p class="flash error" style="margin-top:0">You declined this estimate.</p>' : est.status === 'sent' && est.expires_on < todayStr() ? '<p class="flash error" style="margin-top:0">This estimate has expired — contact us for an updated one.</p>' : '';
  return `${msg}<div class="row noprint" style="justify-content:flex-end;margin-bottom:10px">${open ? '<button class="btn" id="est_accept" type="button">:ic-check: Accept estimate</button><button class="btn ghost" id="est_decline" type="button">Decline</button>' : ''}<button class="btn ghost" id="printbtn" type="button">:ic-print: Print</button></div>${invDoc(est, items, [])}`;
};
pages.estimate.after = () => {
  document.getElementById('printbtn')?.addEventListener('click', () => window.print());
  for (const [id, yes] of [['est_accept', true], ['est_decline', false]]) document.getElementById(id)?.addEventListener('click', async () => {
    if (!yes && !confirm('Decline this estimate?')) return; const { error } = await sb.rpc('respond_estimate', { eid: ESTPUB.id, k: ESTPUB.key, accept: yes }); error ? fail(error) : route();
  });
};

const invLineRow = (l, i) => `<tr data-i="${i}"><td><input data-k="description" value="${esc(l.description)}" placeholder="Description" maxlength="500" required></td><td><input data-k="qty" type="number" step="0.001" min="0.001" value="${l.qty}" style="width:84px"></td>
  <td><input data-k="price" type="number" step="0.01" min="0" value="${(l.unit_price_cents / 100).toFixed(2)}" style="width:104px"></td><td class="c"><input data-k="taxable" type="checkbox" ${l.taxable ? 'checked' : ''} aria-label="Taxable"></td><td class="r amt">${money(Math.round(l.qty * l.unit_price_cents))}</td><td><button type="button" class="crm" data-del="${i}" aria-label="Remove line">:ic-x:</button></td></tr>`;
const invTotalsHtml = () => { const t = calcInv(INV.items, INV.discount_cents, INV.tax_rate); return `<dl class="totals" style="margin-left:auto"><dt>Subtotal</dt><dd>${money(t.sub)}</dd>${t.disc ? `<dt>Discount</dt><dd>−${money(t.disc)}</dd>` : ''}<dt>${esc(INV.tax_label || 'Tax')} (${Number(INV.tax_rate) || 0}%)</dt><dd>${money(t.tax)}</dd><dt><b>Total</b></dt><dd><b>${money(t.total)}</b></dd></dl>`; };

const editorPage = async (kind, id, q = new URLSearchParams()) => {
  const tbl = { invoice: 'invoices', estimate: 'estimates', recurring: 'recurring_invoices' }[kind], isNew = !id || id === 'new';
  const ex = isNew ? null : (await sb.from(tbl).select('*').eq('id', id).single()).data;
  const toLine = (x) => ({ description: x.description, qty: Number(x.qty), unit_price_cents: x.unit_price_cents, taxable: x.taxable, product_id: x.product_id || null });
  let exItems = []; if (ex) exItems = kind === 'recurring' ? (ex.items || []).map(toLine) : ((await sb.from(kind === 'invoice' ? 'invoice_items' : 'estimate_items').select('*').eq(kind === 'invoice' ? 'invoice_id' : 'estimate_id', id).order('sort')).data || []).map(toLine);
  const back = kind === 'invoice' ? '#/admin/invoices' : kind === 'estimate' ? '#/admin/estimates' : '#/admin/invoices/recurring', word = { invoice: 'invoice', estimate: 'estimate', recurring: 'recurring invoice' }[kind];
  if (ex && ((kind === 'invoice' && ['paid', 'void'].includes(ex.status)) || (kind === 'estimate' && !['draft', 'sent'].includes(ex.status)))) return `<h1>${esc(ex.number)}</h1><p class="flash error" style="margin-top:0">A ${ex.status} ${word} can't be edited.</p><p><a class="btn ghost" href="${back}/${ex.id}">← Back</a></p>`;
  const [custs, prods, presets] = await Promise.all([sb.from('profiles').select('id,name,email').eq('role', 'customer').order('name').limit(300), sb.from('products').select('id,name,price_cents').eq('active', true).order('name'), sb.from('invoice_presets').select('*').order('description')]);
  INV = { kind, id: ex?.id || null, customer_id: ex?.customer_id || '', customer_name: ex?.customer_name || '', customer_email: ex?.customer_email || '', customer_phone: ex?.customer_phone || '', customer_address: ex?.customer_address || '',
    issue_date: ex?.issue_date || todayStr(), due_date: kind === 'estimate' ? (ex?.expires_on || addDays(todayStr(), 30)) : (ex?.due_date || addDays(todayStr(), Number(STORE.invoice_due_days) || 14)), notes: ex?.notes || '', terms: ex ? ex.terms : (STORE.invoice_terms || ''),
    discount_cents: ex?.discount_cents || 0, tax_rate: ex ? Number(ex.tax_rate) : (Number(STORE.tax_rate) || 0), tax_label: ex?.tax_label || STORE.tax_label || 'Tax',
    items: ex ? exItems : [{ description: '', qty: 1, unit_price_cents: 0, taxable: true, product_id: null }], custs: custs.data || [], prods: prods.data || [], presets: presets.data || [] };
  if (isNew && q.get('name')) { INV.customer_name = q.get('name').slice(0, 120); INV.customer_email = (q.get('email') || '').slice(0, 200); INV.customer_phone = (q.get('phone') || '').slice(0, 40); INV.notes = (q.get('note') || '').slice(0, 1000); }
  if (isNew && kind === 'invoice' && q.get('order')) {
    const [orr, oir] = await Promise.all([sb.from('orders').select('*').eq('id', q.get('order')).single(), sb.from('order_items').select('*').eq('order_id', q.get('order'))]);
    const od = orr.data; if (od) {
      INV.customer_name = od.name || ''; INV.customer_email = od.email || ''; INV.customer_phone = od.phone || ''; INV.customer_address = [od.address, od.city, od.postcode].filter(Boolean).join('\n'); INV.customer_id = od.user_id || '';
      INV.items = (oir.data || []).map((x) => ({ description: x.name, qty: x.qty, unit_price_cents: x.price_cents, taxable: true, product_id: x.product_id || null }));
      if (od.shipping_cents) INV.items.push({ description: 'Shipping', qty: 1, unit_price_cents: od.shipping_cents, taxable: false, product_id: null });
      INV.discount_cents = od.discount_cents || 0; INV.notes = `For order #${od.id}`; if (!INV.items.length) INV.items = [{ description: '', qty: 1, unit_price_cents: 0, taxable: true, product_id: null }];
    }
  }
  const meta = kind === 'recurring' ? `<section class="cs"><h3>Schedule</h3><label>Name <small class="muted">(for your own reference)</small><input id="rc_name" value="${esc(ex?.name || '')}" maxlength="120" placeholder="e.g. Monthly maintenance — Acme" required></label>
      <div class="two2"><label>Repeats<select id="rc_freq">${[['weekly', 'Weekly'], ['monthly', 'Monthly'], ['quarterly', 'Quarterly'], ['yearly', 'Yearly']].map(([v, l]) => `<option value="${v}" ${(ex?.frequency || 'monthly') === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label><label>Every (how many periods)<input id="rc_every" type="number" min="1" max="24" value="${ex?.every || 1}"></label></div>
      <div class="two2"><label>First invoice on<input id="rc_next" type="date" value="${ex?.next_run || todayStr()}"></label><label>Stop after (optional)<input id="rc_end" type="date" value="${ex?.end_date || ''}"></label></div>
      <div class="two2"><label>Payment due after (days)<input id="rc_due" type="number" min="0" max="365" value="${ex?.due_days ?? (Number(STORE.invoice_due_days) || 14)}"></label><label class="check" style="align-self:end"><input id="rc_auto" type="checkbox" ${ex?.auto_send ? 'checked' : ''}> Send each invoice to the customer automatically</label></div></section>` : '';
  const dates = kind === 'recurring' ? '' : `<div class="two2"><label>Billing address<textarea id="iv_addr" rows="3">${esc(INV.customer_address)}</textarea></label><div class="stack"><label>${kind === 'estimate' ? 'Valid until' : 'Due date'}<input id="iv_due" type="date" value="${INV.due_date}"></label><div class="row"><small class="muted">${kind === 'estimate' ? 'Valid for:' : 'Quick terms:'}</small>${(kind === 'estimate' ? [14, 30, 60] : [7, 14, 30, 60]).map((n) => `<button type="button" class="btn ghost duebtn" data-n="${n}" style="padding:4px 10px;min-height:0">${kind === 'estimate' ? n + ' days' : 'Net ' + n}</button>`).join('')}</div></div></div>`;
  return `<h1>${ex ? 'Edit ' + (ex.number ? esc(ex.number) : word) : 'New ' + word}</h1><p><a href="${back}${ex && kind !== 'recurring' ? '/' + ex.id : ''}">← Cancel</a></p><div class="invedit">${meta}
    <section class="cs"><h3>Customer</h3><label>Name <small class="muted">(type to pick an existing customer, or enter anyone)</small><input id="iv_name" list="custlist" value="${esc(INV.customer_name)}" required autocomplete="off"></label>
    <datalist id="custlist">${INV.custs.map((c) => `<option value="${esc(c.name || c.email)}">${esc(c.email)}</option>`).join('')}</datalist>
    <div class="two2"><label>Email<input id="iv_email" type="email" value="${esc(INV.customer_email)}"></label><label>Mobile phone <small class="muted">(to text it)</small><input id="iv_phone" type="tel" value="${esc(INV.customer_phone)}" autocomplete="off"></label></div>
    <div class="two2">${kind === 'recurring' ? `<label>Billing address<textarea id="iv_addr" rows="2">${esc(INV.customer_address)}</textarea></label>` : `<label>Issue date<input id="iv_issue" type="date" value="${INV.issue_date}"></label>`}</div>${dates}</section>
    <section class="cs"><h3>Line items</h3><table class="invlines"><tr><th>Description</th><th>Qty</th><th>Rate ($)</th><th>Tax</th><th class="r">Amount</th><th></th></tr><tbody id="ivlines">${INV.items.map(invLineRow).join('')}</tbody></table>
    <div class="row"><button type="button" class="btn ghost" id="iv_add">+ Add line</button><select id="iv_preset" aria-label="Add a saved item"><option value="">+ Saved item…</option>${INV.presets.map((x) => `<option value="${x.id}">${esc(x.description)} — ${money(x.unit_price_cents)}</option>`).join('')}</select><button type="button" class="btn ghost" id="iv_savepreset" title="Save the last line as a reusable item">Save line as item</button><select id="iv_prod" aria-label="Add a product"><option value="">+ Add a product…</option>${INV.prods.map((x) => `<option value="${x.id}">${esc(x.name)} — ${money(x.price_cents)}</option>`).join('')}</select></div>
    <div class="two2"><div class="stack"><label>Discount ($)<input id="iv_disc" type="number" step="0.01" min="0" value="${(INV.discount_cents / 100).toFixed(2)}"></label><div class="two2"><label>Tax name<input id="iv_tlabel" value="${esc(INV.tax_label)}" maxlength="30"></label><label>Rate (%)<input id="iv_trate" type="number" step="0.001" min="0" max="50" value="${INV.tax_rate}"></label></div></div><div id="iv_totals">${invTotalsHtml()}</div></div></section>
    <section class="cs"><h3>Notes &amp; terms</h3><label>Notes (shown to the customer)<textarea id="iv_notes" rows="3" maxlength="3000">${esc(INV.notes)}</textarea></label><label>Terms<textarea id="iv_terms" rows="3" maxlength="3000">${esc(INV.terms)}</textarea></label></section>
    <div class="row"><button class="btn" id="iv_save" type="button">${kind === 'recurring' ? 'Save recurring invoice' : 'Save draft'}</button>${kind === 'recurring' ? '' : '<button class="btn ghost" id="iv_send" type="button">Save &amp; send…</button>'}</div></div>`;
};
const logChip = (st) => `<span class="status ${st === 'sent' ? 'paid' : st === 'failed' ? 'cancelled' : st === 'skipped' ? 'cancelled' : 'pending'}">${st === 'sent' ? 'delivered :ic-check:' : st}</span>`;
const logHtml = (logs) => (logs || []).length ? `<div class="msglog">${logs.map((l) => `<div class="addr"><div class="row" style="justify-content:space-between;flex-wrap:nowrap"><span>${l.channel === 'sms' ? ':ic-chat: Text' : ':ic-mail: Email'} to <b>${esc(l.to_address || '—')}</b></span>${logChip(l.status)}</div>${l.detail ? `<small class="${l.status === 'sent' ? 'muted' : 'down'}">${esc(l.detail)}</small><br>` : ''}<small class="muted">${ago(l.created_at)}</small></div>`).join('')}</div>` : '<p class="muted" style="margin:0">Nothing has been sent yet.</p>';
const sendPanel = (doc, kind, ready, open) => {
  const isInv = kind === 'invoice', bal = isInv ? invBal(doc) : doc.total_cents, store = STORE.biz?.legal_name || theme.name || 'Gomi Insulation';
  const link = `${location.origin}${location.pathname}#/${kind}/${doc.id}?k=${doc.view_key}`, enc = encodeURIComponent;
  const subject = `${isInv ? 'Invoice' : 'Estimate'} ${doc.number} from ${store}`;
  const text = isInv ? `Hi ${doc.customer_name}, here is invoice ${doc.number} for ${money(bal)}${bal > 0 ? ` (due ${doc.due_date})` : ''}. View${bal > 0 ? ' & pay' : ''} it here: ${link}` : `Hi ${doc.customer_name}, here is estimate ${doc.number} for ${money(doc.total_cents)} (valid until ${doc.expires_on}). Review and accept it here: ${link}`;
  return `<section class="cs noprint" id="sendbox" data-kind="${kind}" data-id="${doc.id}" data-subject="${esc(subject)}" data-text="${esc(text)}" data-link="${esc(link)}" ${open ? '' : 'hidden'}><h3>Send this ${kind}</h3>
    ${ready ? '' : '<p class="flash error" style="margin:0">:ic-alert: Email and text sending aren’t connected yet, so “Send now” will only mark it as sent. Use the buttons below to send it yourself right now, or connect sending in <a href="#/admin/settings">Settings → Messaging</a>.</p>'}
    <div class="two2"><label class="check" style="align-self:end"><input type="checkbox" id="sd_email" ${doc.customer_email ? 'checked' : ''}> Email it to</label><label>&nbsp;<input id="sd_to" type="email" value="${esc(doc.customer_email)}" placeholder="customer@example.com"></label></div>
    <div class="two2"><label class="check" style="align-self:end"><input type="checkbox" id="sd_sms" ${doc.customer_phone && !doc.customer_email ? 'checked' : ''}> Text it to</label><label>&nbsp;<input id="sd_phone" type="tel" value="${esc(doc.customer_phone || '')}" placeholder="Mobile number"></label></div>
    <button class="btn" id="sd_go" type="button">Send now</button>
    <p class="muted" style="margin:6px 0 0">Or send it yourself from your own email or phone:</p>
    <div class="row"><a class="btn ghost" id="sd_mailto" href="mailto:${esc(doc.customer_email)}?subject=${enc(subject)}&body=${enc(text)}">:ic-mail: Open in my email app</a><a class="btn ghost" id="sd_smslink" href="sms:${esc((doc.customer_phone || '').replace(/[^0-9+]/g, ''))}?&body=${enc(text)}">:ic-chat: Text from my phone</a><button class="btn ghost" id="sd_copy" type="button">:ic-link: Copy link</button><button class="btn ghost" id="sd_share" type="button" ${navigator.share ? '' : 'hidden'}>Share…</button></div></section>`;
};
const fmtAudit = (a) => {
  const d = a.detail || {}, mv = (x) => (Array.isArray(x) ? `${typeof x[0] === 'number' ? money(x[0]) : esc(x[0])} → ${typeof x[1] === 'number' ? money(x[1]) : esc(x[1])}` : esc(x));
  switch (a.action) {
    case 'order.status': return `Order #${esc(a.entity_id)}: ${esc(d.from)} → ${esc(d.to)}`;
    case 'order.refund': return `Refunded ${money(d.amount_cents)} on order #${esc(a.entity_id)}${d.reason ? ' — ' + esc(d.reason) : ''}`;
    case 'product.updated': return `Product “${esc(d.product || '')}”: ${Object.entries(d).filter(([k]) => k !== 'product').map(([k, v]) => `${k} ${mv(v)}`).join(', ')}`;
    case 'product.created': return `Product created: ${esc(d.name)}`; case 'product.deleted': return `Product deleted: ${esc(d.name)}`;
    case 'team.role_changed': return `${esc(d.email)}: ${esc(d.from)} → ${esc(d.to)}`;
    case 'invoice.payment': return `Payment ${money(d.amount_cents)} on invoice #${esc(a.entity_id)}${d.method ? ' (' + esc(d.method) + ')' : ''}`;
    case 'purchase.received': return `Received purchase order #${esc(a.entity_id)} into stock`;
    default: return esc(a.action.replace('.', ' ')) + (a.entity_id ? ` #${esc(a.entity_id)}` : '');
  }
};

// ---- statements, expenses, profit & loss ----
const EXP_CATS = ['Rent', 'Utilities', 'Wages', 'Vehicle & fuel', 'Shipping & freight', 'Marketing', 'Insurance', 'Software & subscriptions', 'Office supplies', 'Equipment', 'Professional fees', 'Bank & card fees', 'Taxes & licences', 'Other'];
const ymd = (d) => new Date(d - new Date(d).getTimezoneOffset() * 60000).toISOString().slice(0, 10);
function periodRange(key, from, to) {
  const n = new Date(), y = n.getFullYear(), m = n.getMonth();
  const P = { this_month: [new Date(y, m, 1), new Date(y, m + 1, 0)], last_month: [new Date(y, m - 1, 1), new Date(y, m, 0)], this_quarter: [new Date(y, Math.floor(m / 3) * 3, 1), new Date(y, Math.floor(m / 3) * 3 + 3, 0)],
    ytd: [new Date(y, 0, 1), n], last_year: [new Date(y - 1, 0, 1), new Date(y - 1, 11, 31)], last_12: [new Date(y, m - 11, 1), n] };
  if (key === 'custom' && from && to) return [from, to];
  const r = P[key] || P.this_month; return [ymd(r[0]), ymd(r[1])];
}
const PERIODS = [['this_month', 'This month'], ['last_month', 'Last month'], ['this_quarter', 'This quarter'], ['ytd', 'Year to date'], ['last_year', 'Last year'], ['last_12', 'Last 12 months']];
const periodBar = (base, q) => { const k = q.get('p') || 'this_month'; return `<div class="chips">${PERIODS.map(([v, l]) => `<a class="chip ${k === v ? 'on' : ''}" href="${base}?p=${v}">${l}</a>`).join('')}</div>`; };
const custKey = (i) => (i.customer_id ? 'id:' + i.customer_id : i.customer_email ? 'email:' + i.customer_email.toLowerCase() : 'name:' + i.customer_name.toLowerCase());
const ageBuckets = (open) => { const t0 = todayStr(), past = (i) => Math.floor((new Date(t0) - new Date(i.due_date)) / 864e5), b = (lo, hi) => open.filter((i) => past(i) >= lo && past(i) <= hi).reduce((a, i) => a + invBal(i), 0);
  return [['Current', open.filter((i) => past(i) <= 0).reduce((a, i) => a + invBal(i), 0)], ['1–30 days', b(1, 30)], ['31–60', b(31, 60)], ['61–90', b(61, 90)], ['90+', b(91, 99999)]]; };

// ---- router ----

// ---- SEO: head tags, structured data, SERP previews ----
const seoSite = () => (SEO.site_title || '').trim() || theme.name || 'Gomi Insulation';
const seoBase = () => ((SEO.site_url || '').trim().replace(/\/+$/, '')) || (location.origin + location.pathname.replace(/\/[^/]*$/, ''));
const clip = (t, n) => { t = String(t || '').replace(/\s+/g, ' ').trim(); return t.length > n ? t.slice(0, n - 1).trimEnd() + '…' : t; };
function setMeta(attr, key, val) {
  let el = document.head.querySelector(`meta[${attr}="${key}"]`);
  if (!val) { el?.remove(); return; }
  if (!el) { el = document.createElement('meta'); el.setAttribute(attr, key); document.head.appendChild(el); }
  el.setAttribute('content', val);
}
function applyTracking() {
  const code = String(SEO.gsc || '').replace(/[^\w-]/g, ''); let m = document.head.querySelector('meta[name="google-site-verification"]');
  if (code) { if (!m) { m = document.createElement('meta'); m.name = 'google-site-verification'; document.head.appendChild(m); } m.content = code; } else m?.remove();
  const id = /^G-[A-Za-z0-9]+$/.test(SEO.ga4 || '') ? SEO.ga4 : ''; if (id && !document.getElementById('ga4s') && !/^(localhost|127\.)/.test(location.hostname)) { const sc = document.createElement('script'); sc.id = 'ga4s'; sc.async = true; sc.src = 'https://www.googletagmanager.com/gtag/js?id=' + id; document.head.appendChild(sc); window.dataLayer = window.dataLayer || []; window.gtag = function () { window.dataLayer.push(arguments); }; window.gtag('js', new Date()); window.gtag('config', id); }
}
function setSeo({ title, description, image, type = 'website', path = '', jsonld, noindex } = {}) {
  const site = seoSite(), full = title ? `${title} · ${site}` : site; document.title = full;
  const desc = clip(description || SEO.description || '', 300), url = path ? seoBase() + path : '';
  setMeta('name', 'description', desc);
  setMeta('name', 'robots', noindex || SEO.noindex ? 'noindex, nofollow' : '');
  setMeta('property', 'og:title', title || site); setMeta('property', 'og:description', desc); setMeta('property', 'og:type', type);
  setMeta('property', 'og:site_name', site); setMeta('property', 'og:url', url);
  const img = safeUrl(image || SEO.og_image || ''); setMeta('property', 'og:image', img);
  setMeta('name', 'twitter:card', img ? 'summary_large_image' : 'summary'); setMeta('name', 'twitter:site', SEO.twitter || ''); setMeta('name', 'twitter:title', title || site); setMeta('name', 'twitter:description', desc);
  let link = document.head.querySelector('link[rel="canonical"]');
  if (url) { if (!link) { link = document.createElement('link'); link.rel = 'canonical'; document.head.appendChild(link); } link.href = url; } else link?.remove();
  document.head.querySelector('script#ldjson')?.remove();
  if (jsonld) { const sc = document.createElement('script'); sc.type = 'application/ld+json'; sc.id = 'ldjson'; sc.textContent = JSON.stringify(jsonld).replace(/</g, '\\u003c'); document.head.appendChild(sc); }
}
const serp = (title, desc, path) => `<div class="serp" aria-label="Search result preview"><div class="serpurl">${esc(seoBase().replace(/^https?:\/\//, ''))}${esc(path ? ' › ' + path.replace(/^\//, '').split('/').join(' › ') : '')}</div><div class="serptitle">${esc(clip(title, 60)) || 'Page title'}</div><div class="serpdesc">${esc(clip(desc, 160)) || 'Add a description — this is the text people see under your link in Google.'}</div></div>`;
const lenHint = (n, lo, hi) => `<span class="lenhint ${n === 0 ? '' : n < lo || n > hi ? 'warn' : 'good'}">${n} chars · aim for ${lo}–${hi}</span>`;
function seoFields(o, fallbackTitle, path) {
  return `<fieldset class="cmpset seobox" data-path="${esc(path)}"><legend>:ic-search: Search engines (SEO)</legend>
    <label>Focus keyword <small class="muted">the phrase customers would search for, e.g. “R-22 fiberglass insulation”</small><input name="focus_keyword" maxlength="80" value="${esc(o.focus_keyword || '')}" data-seo="kw"></label>
    <ul class="kwcheck" data-seo="kwlist"></ul>
    <label>Page title <small class="muted">defaults to “${esc(fallbackTitle || '')}”</small><input name="seo_title" maxlength="120" value="${esc(o.seo_title || '')}" data-seo="title">${lenHint((o.seo_title || fallbackTitle || '').length, 30, 60)}</label>
    <label>Meta description<textarea name="seo_description" rows="3" maxlength="320" data-seo="desc">${esc(o.seo_description || '')}</textarea>${lenHint((o.seo_description || '').length, 70, 160)}</label>
    <div class="row"><button type="button" class="btn ghost" data-seo="suggest">:ic-star: Suggest title &amp; description</button></div>
    <div class="serpwrap" data-seo="preview">${serp(o.seo_title || fallbackTitle, o.seo_description, path)}</div>
    <div class="socialprev" data-seo="social"></div></fieldset>`;
}
function wireSeoBox(root, titleSel, bodySel) {
  const box = root.querySelector?.('.seobox'); if (!box) return;
  const t = box.querySelector('[data-seo=title]'), d = box.querySelector('[data-seo=desc]'), pv = box.querySelector('[data-seo=preview]'), kw = box.querySelector('[data-seo=kw]'), kl = box.querySelector('[data-seo=kwlist]'), soc = box.querySelector('[data-seo=social]'), path = box.dataset.path;
  const val = (sel) => (sel ? [...document.querySelectorAll(sel)].map((x) => x.value).join(' ') : '');
  const upd = () => { const ft = titleSel ? (document.querySelector(titleSel)?.value || '') : '', tt = t.value || ft, body = val(bodySel);
    pv.innerHTML = serp(tt, d.value, path);
    const hints = box.querySelectorAll('.lenhint'), set = (el, n, lo, hi) => { el.textContent = `${n} chars · aim for ${lo}–${hi}`; el.className = 'lenhint ' + (n === 0 ? '' : n < lo || n > hi ? 'warn' : 'good'); };
    set(hints[0], tt.length, 30, 60); set(hints[1], d.value.length, 70, 160);
    const k = kw.value.trim().toLowerCase(); const has = (x) => String(x || '').toLowerCase().includes(k), slugish = (path || '').toLowerCase().replace(/-/g, ' ');
    kl.innerHTML = k ? [['In the page title', has(tt)], ['In the meta description', has(d.value)], ['In the page address', slugish.includes(k.replace(/[^a-z0-9]+/g, ' ').trim())], ['In the page text', has(body)]].map(([l, ok]) => `<li class="${ok ? 'ok' : 'bad'}">${ok ? ':ic-check-circle:' : ':ic-alert:'} ${l}</li>`).join('') : '<li class="muted">Add a focus keyword to see a checklist.</li>';
    const img = safeUrl(SEO.og_image || ''); soc.innerHTML = `<div class="soccard">${img ? `<img src="${esc(img)}" alt="">` : '<div class="socph">Social image</div>'}<div><small>${esc(seoBase().replace(/^https?:\/\//, ''))}</small><b>${esc(clip(tt, 70))}</b><span>${esc(clip(d.value, 110))}</span></div></div><small class="muted">How it looks when shared on Facebook or WhatsApp.</small>`; };
  [t, d, kw].forEach((x) => x.addEventListener('input', upd)); [titleSel, bodySel].forEach((sel) => sel && document.querySelectorAll(sel).forEach((x) => x.addEventListener('input', upd)));
  box.querySelector('[data-seo=suggest]')?.addEventListener('click', () => { const ft = (titleSel ? document.querySelector(titleSel)?.value : '') || '', body = val(bodySel).replace(/\s+/g, ' ').trim();
    if (!t.value) t.value = clip(ft, 60); if (!d.value) d.value = clip(`${clip(body.replace(ft, '').trim() || ft, 110)} Order online from ${seoSite()}.`, 160); if (!kw.value) kw.value = ft.toLowerCase().slice(0, 80); upd(); });
  upd();
}
const productLd = (p, pics) => ({ '@context': 'https://schema.org', '@type': 'Product', name: p.name, description: clip(p.description, 500), image: pics.slice(0, 4), category: p.category, ...(p.brand ? { brand: { '@type': 'Brand', name: p.brand } } : {}), sku: p.sku || 'P' + p.id, ...(p.barcode ? { gtin: p.barcode } : {}),
  offers: { '@type': 'Offer', priceCurrency: window.GOMI.CURRENCY || 'USD', price: (p.price_cents / 100).toFixed(2), availability: p.stock > 0 ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock', url: seoBase() + '/product/' + p.slug + '/' } });

let LAST_NONAUTH = '';
async function route() {
  document.body.classList.remove('chatfull');
  { const cur = location.hash; if (/^#\/(login|register|forgot|reset)/.test(cur)) PREV_HASH = LAST_NONAUTH; else LAST_NONAUTH = cur; }
  threadChan.forEach((c) => sb.removeChannel(c)); threadChan = [];
  let h = location.hash.slice(1); if (!h.startsWith('/')) h = '/'; // e.g. #access_token=… after email confirmation
  const [path, qs] = h.split('?'); const q = new URLSearchParams(qs || '');
  const [name = 'home', ...args] = path.split('/').filter(Boolean); const page = pages[name === '' ? 'home' : name];
  const TITLES = { calculator: 'Insulation calculator', compare: 'Compare products', shop: 'Shop', cart: 'Cart', checkout: 'Checkout', account: 'My account', messages: 'Messages', notifications: 'Notifications', login: 'Log in', register: 'Sign up', quote: 'Request a quote', wishlist: 'Wishlist', track: 'Track an order', admin: 'Admin', forgot: 'Reset password', reset: 'New password' };
  const PRIVATE = ['cart', 'checkout', 'account', 'messages', 'notifications', 'login', 'register', 'admin', 'invoice', 'estimate', 'reset', 'track', 'wishlist'];
  setSeo({ title: name === 'home' || name === '' ? (SEO.home_title || '') : TITLES[name] || '', description: '', noindex: PRIVATE.includes(name), path: name === 'shop' ? '/#/shop' : '', jsonld: name === 'home' || name === '' ? [{ '@context': 'https://schema.org', '@type': 'WebSite', name: seoSite(), url: seoBase() + '/', potentialAction: { '@type': 'SearchAction', target: seoBase() + '/#/shop?q={search_term_string}', 'query-input': 'required name=search_term_string' } }, { '@context': 'https://schema.org', '@type': 'Organization', name: (STORE.biz?.legal_name || seoSite()), url: seoBase() + '/', ...(STORE.biz?.phone ? { telephone: STORE.biz.phone } : {}), ...(STORE.biz?.email ? { email: STORE.biz.email } : {}), ...(SEO.og_image ? { logo: SEO.og_image } : {}) }] : undefined });
  if (name === 'shop') { const tq = q.get('q') || ''; if (document.activeElement !== sinput) { sinput.value = tq; sclear.hidden = !tq; } } else if (name !== 'product' && document.activeElement !== sinput) { sinput.value = ''; sclear.hidden = true; }
  if (!page) { $app.innerHTML = '<h1>Not found</h1>'; return; }
  try { $app.classList.remove('in'); $app.innerHTML = '<div class="skeleton"></div>'; $app.innerHTML = await page(args, q); if (name === 'admin' && args[0]) $app.insertAdjacentHTML('afterbegin', adminNavHtml(args[0])); setMenu(false);
    $app.querySelectorAll('table').forEach((t) => { if (!t.parentElement.classList.contains('tablewrap') && !t.closest('.invdoc, .tablewrap')) { const w = document.createElement('div'); w.className = 'tablewrap'; t.replaceWith(w); w.appendChild(t); }
      // label cells so tables can stack into cards on phones
      const heads = [...t.querySelectorAll('th')].map((x) => x.textContent);
      t.querySelectorAll('tr').forEach((tr) => [...tr.children].forEach((td, i) => { if (td.tagName === 'TD') td.dataset.label = heads[i] || ''; }));
    });
    void $app.offsetWidth; $app.classList.add('in'); addPdfButtons(); renderTabbar(); syncCmpBoxes(); renderCmpBar(); page.after?.(args, q); window.scrollTo(0, 0); } catch (e) { fail(e); $app.innerHTML = '<h1>Something went wrong</h1>'; }
}
window.addEventListener('hashchange', route);
sb.auth.onAuthStateChange((ev) => {
  if (ev === 'PASSWORD_RECOVERY') setTimeout(async () => { await loadSession(); location.hash = '#/reset'; route(); }, 0);
  else if (ev === 'SIGNED_IN' && /type=signup/.test(location.hash)) setTimeout(async () => { await loadSession(); flash('Email confirmed. Welcome!'); location.hash = '#/account'; }, 0);
  if (ev === 'SIGNED_OUT') { session = null; profile = null; unread = { all: 0, msg: 0 }; if (notifChan) { sb.removeChannel(notifChan); notifChan = null; } renderNav(); }
});
applyBranding();
document.getElementById('menubtn').innerHTML = ':ic-menu:';
Promise.allSettled([loadSiteTheme(), loadPages(), loadSession()]).then(() => { route(); if (Object.keys(getCart()).length) syncCart(); });
