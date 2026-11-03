const C = window.GOMI;
const sb = supabase.createClient(C.SUPABASE_URL, C.SUPABASE_ANON_KEY);
const $app = document.getElementById('app');
const STATUSES = ['pending', 'paid', 'shipped', 'delivered', 'cancelled', 'refunded'];
let FREE_SHIP = 50000, SHIP = 1500;
let SEO = {};
let STORE = { ship_flat_cents: 1500, free_over_cents: 50000, tax_rate: 0, tax_label: 'Tax', biz: {} };
function applyStoreCfg(v) { STORE = { ...STORE, ...(v || {}) }; FREE_SHIP = Number(STORE.free_over_cents) || 0; SHIP = Number(STORE.ship_flat_cents) || 0; renderClosedBar(); }
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
  const root = document.documentElement;
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
  (Array.isArray(data) ? data : []).forEach((r) => { if (r.key === 'theme') { theme = r.value || {}; applyTheme(); } else if (r.key === 'store') applyStoreCfg(r.value); else if (r.key === 'seo') SEO = r.value || {}; });
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
const setCart = (c) => { localStorage.setItem('cart', JSON.stringify(c)); renderNav(); };
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
const packRow = (k, i, p) => `<div class="packedit" data-i="${i}"><label>Name<input data-f="label" value="${esc(k.label || '')}" placeholder="Bundle of 8" maxlength="60"></label><label>${esc(su(p?.unit) || 'Units')} in it<input data-f="units" type="number" min="2" step="1" value="${k.units || ''}" placeholder="8"></label><label>Price per ${esc(su(p?.unit) || 'unit')} ($)<input data-f="price" type="number" min="0" step="0.01" value="${k.unit_price_cents != null ? (k.unit_price_cents / 100).toFixed(2) : ''}" placeholder="${p?.price_cents ? (p.price_cents / 100 * 0.9).toFixed(2) : ''}"></label><button type="button" class="ibtn danger rmpack" aria-label="Remove">:ic-x:</button></div>`;
const packTable = (p) => { const ks = (p.packs || []).filter((k) => k.unit_price_cents < p.price_cents); if (!ks.length) return '';
  return `<div class="packs"><h3>Choose your size</h3><div class="packrow"><div><b>Single ${esc(su(p.unit))}</b><small class="muted">${money(p.price_cents)} each</small></div><span></span>${p.stock > 0 ? `<button type="button" class="btn ghost" data-addqty="1">Add 1</button>` : ''}</div>
    ${ks.map((k) => `<div class="packrow best"><div><b>${esc(k.label)}</b><small class="muted">${k.units} × ${esc(su(p.unit))} · ${money(k.unit_price_cents)} per ${esc(su(p.unit))} · <b>${money(k.units * k.unit_price_cents)}</b> total</small></div><span class="savepill">Save ${packSave(p, k)}% per ${esc(su(p.unit))}</span>${p.stock >= k.units ? `<button type="button" class="btn" data-addqty="${k.units}">Add ${esc(k.label)}</button>` : '<small class="muted">Not enough stock</small>'}</div>`).join('')}
    <small class="muted">Buy more than one bundle, or a bundle plus extra ${esc(su(p.unit))}s — the cart mixes the prices automatically.</small></div>`; };
const packHint = (p) => { const ks = (p.packs || []).filter((k) => k.unit_price_cents < p.price_cents).sort((a, b) => a.unit_price_cents - b.unit_price_cents); return ks.length ? `<small class="packhint">${esc(ks[0].label)}: ${money(ks[0].unit_price_cents)} per ${esc(su(p.unit))} · save ${packSave(p, ks[0])}%</small>` : ''; };
const onSale = (p) => p.compare_at_cents > p.price_cents;
const salePct = (p) => Math.round((1 - p.price_cents / p.compare_at_cents) * 100);
const priceHtml = (p) => onSale(p) ? `<span class="was">${money(p.compare_at_cents)}</span> <span class="now">${money(p.price_cents)}</span>` : money(p.price_cents);
const card = (p) => `<article class="card">${p.stock <= 0 ? '<span class="badge">Sold out</span>' : onSale(p) ? `<span class="badge sale">-${salePct(p)}%</span>` : p.stock <= 5 ? `<span class="badge warn">Only ${p.stock} left</span>` : p.stock <= 10 ? '<span class="badge warn">Low stock</span>' : ''}<button class="heart" data-id="${p.id}" aria-label="Save to wishlist" style="${getWish().includes(p.id) ? 'color:#dc2626' : ''}">${getWish().includes(p.id) ? ':ic-heart-fill:' : ':ic-heart:'}</button><a href="#/product/${esc(p.slug)}">${img(p)}</a><div class="pad"><span class="tag">${esc(p.category)}</span>
  <h3><a href="#/product/${esc(p.slug)}">${esc(p.name)}</a></h3><p class="muted">${p.r_value ? esc(p.r_value) + ' · ' : ''}per ${esc(p.unit)}</p>${ratingLine(p)}${saveBadge(p)}${packHint(p)}<div class="cardfoot"><p class="price">${priceHtml(p)}</p>${p.stock > 0 ? `<button class="addbtn" data-id="${p.id}" data-stock="${p.stock}" data-name="${esc(p.name)}" aria-label="Add ${esc(p.name)} to cart">+ Add</button>` : '<span class="muted" style="font-size:.85rem">Sold out</span>'}</div></div></article>`;
const getPromo = () => { try { return JSON.parse(localStorage.getItem('promo') || 'null'); } catch { return null; } };
const totals = (sub, pickup = false) => { const pr = getPromo(), disc = pr && sub ? Math.floor(sub * pr.percent / 100) : 0; const ship = pickup || !sub || (FREE_SHIP > 0 && sub - disc >= FREE_SHIP) ? 0 : SHIP; const base = sub - disc + ship, tax = Math.round(base * (Number(STORE.tax_rate) || 0) / 100); return { sub, disc, code: disc ? pr.code : '', ship, tax, taxLabel: STORE.tax_label || 'Tax', total: base + tax }; };
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
function renderNav() {
  const n = Object.values(getCart()).reduce((a, b) => a + b, 0);
  document.getElementById('cartlink').innerHTML = (session ? `<button class="stylebtn bell" id="bellbtn" aria-label="Notifications">:ic-bell:${unread.all ? `<span class="dot">${unread.all > 99 ? '99+' : unread.all}</span>` : ''}</button> ` : '') + `<a class="cart" href="#/cart" aria-label="Cart, ${n} item${n === 1 ? '' : 's'}">:ic-cart: <span class="cl">Cart </span>(${n})</a>`;
  const first = esc((profile?.name || 'Account').split(' ')[0]);
  document.getElementById('nav').innerHTML = `<a href="#/shop">Shop</a>${sitePages.filter((x) => x.show_in_nav).map((x) => `<a href="#/page/${esc(x.slug)}">${esc(x.title)}</a>`).join('')}<a href="#/quote">Get a quote</a><a href="#/wishlist" aria-label="Wishlist">:ic-heart:${getWish().length ? ' ' + getWish().length : ''}</a>`
    + (session ? `<a href="#/messages" class="msglink">:ic-chat:<span class="lbl"> Messages</span>${unread.msg ? ` <span class="dot">${unread.msg}</span>` : ''}</a>
      <div class="usermenu"><button class="userbtn" id="userbtn" aria-haspopup="true" aria-expanded="false">${avatar(profile?.name || 'U')}<span class="uname">${first}</span><span class="caret">:ic-chevron-down:</span></button>
      <div class="umpanel" id="umpanel"><div class="umhead"><b>${esc(profile?.name || 'Account')}</b>${profile?.username ? `<small class="muted">@${esc(profile.username)}</small>` : ''}<small class="muted">${esc(session.user.email)}${profile?.role && profile.role !== 'customer' ? ' · ' + esc(profile.role) : ''}</small></div>
        <a href="#/account">My account</a><a href="#/account">My orders</a><a href="#/notifications">Notifications</a>${isStaff() ? '<a href="#/admin">Admin dashboard</a>' : ''}${profile?.is_admin ? '<button class="link" id="stylebtn">:ic-sliders: Site style</button>' : ''}<button class="link" id="logout">Log out</button></div></div>`
      : `<a href="#/login">Log in</a><a href="#/register" class="signup">Sign up</a>`);
  document.getElementById('logout')?.addEventListener('click', async () => { await sb.auth.signOut(); location.hash = '#/'; });
}
document.addEventListener('click', (e) => {
  const ub = e.target.closest('#userbtn'), um = document.querySelector('.usermenu');
  if (ub) { const open = !um.classList.contains('open'); um.classList.toggle('open', open); ub.setAttribute('aria-expanded', String(open)); return; }
  if (um && (!e.target.closest('.umpanel') || e.target.closest('.umpanel a, .umpanel button'))) um.classList.remove('open');
});
const setMenu = (open) => { document.body.classList.toggle('menu-open', open); document.getElementById('menubtn').setAttribute('aria-expanded', String(open)); document.getElementById('menubtn').innerHTML = open ? ':ic-x:' : ':ic-menu:'; };
document.getElementById('menubtn').addEventListener('click', () => setMenu(!document.body.classList.contains('menu-open')));
document.getElementById('nav').addEventListener('click', (e) => { if (e.target.closest('a,button.link')) setMenu(false); });
const sugg = document.getElementById('sugg'), sinput = document.querySelector('#search input[name=q]'); let stm = null;
sinput.addEventListener('input', () => {
  clearTimeout(stm); const t = sinput.value.trim().replace(/[%,()]/g, ''); if (t.length < 2) { sugg.hidden = true; return; }
  stm = setTimeout(async () => {
    const { data } = await sb.from('products').select('slug,name,price_cents,category').eq('active', true).or(`name.ilike.%${t}%,category.ilike.%${t}%`).order('name').limit(6);
    sugg.innerHTML = (data || []).length ? data.map((x) => `<a href="#/product/${esc(x.slug)}"><span>${esc(x.name)}<small>${esc(x.category)}</small></span><b>${money(x.price_cents)}</b></a>`).join('') + `<a class="all" href="#/shop?q=${encodeURIComponent(t)}">See all results for “${esc(t)}” →</a>` : '<p class="muted" style="padding:10px 14px;margin:0">No matches</p>';
    sugg.hidden = false;
  }, 180);
});
sinput.addEventListener('keydown', (e) => { if (e.key === 'Escape') sugg.hidden = true; });
document.addEventListener('click', (e) => { if (!e.target.closest('#search') || e.target.closest('#sugg a')) sugg.hidden = true; });
document.getElementById('search').addEventListener('submit', (e) => { e.preventDefault(); location.hash = `#/shop?q=${encodeURIComponent(new FormData(e.target).get('q'))}`; });

// ---- pages ----
const pages = {};
pages.home = async () => {
  await loadRatings();
  const { data, error } = await sb.from('products').select('*').eq('active', true).order('id').limit(8); if (data) await attachPacks(data); if (error) throw error;
  const catCount = {}; ((await sb.from('products').select('category').eq('active', true)).data || []).forEach((r) => (catCount[r.category] = (catCount[r.category] || 0) + 1));
  const cats = Object.keys(catCount).sort();
  return `<section class="hero"><div class="hero-art" aria-hidden="true"></div><h1>Insulation for every build.</h1><p>Batts, spray foam, rigid board and more. Order online and get it delivered to your site.</p>
  <div><a class="btn" href="#/shop">Shop all products</a><a class="btn ghost" href="#/quote">Request a quote</a></div><p class="hero-note">${FREE_SHIP > 0 ? `:ic-check: Free shipping over ${money(FREE_SHIP)} &nbsp;·&nbsp; ` : ''}:ic-check: Trade pricing on request</p></section>
  <div class="perks"><div class="perk"><span class="pi">:ic-truck:</span><div>${FREE_SHIP > 0 ? `<b>Free shipping</b><small>On orders over ${money(FREE_SHIP)}</small>` : `<b>Delivered to your site</b><small>Flat ${money(SHIP)} delivery or free pickup</small>`}</div></div><div class="perk"><span class="pi">:ic-ruler:</span><div><b>Coverage calculator</b><small>Know exactly how much you need</small></div></div><div class="perk"><span class="pi">:ic-tool:</span><div><b>Bulk &amp; trade pricing</b><small>Ask for a custom quote</small></div></div></div>
  <div class="sect"><h2>Shop by category</h2><a href="#/shop">All products →</a></div><div class="tiles">${cats.map((c) => `<a class="tile" href="#/shop?category=${encodeURIComponent(c)}"><b>${esc(c)}</b><small>${catCount[c]} product${catCount[c] === 1 ? '' : 's'}</small><span aria-hidden="true">→</span></a>`).join('')}</div>
  <div class="sect"><h2>Featured</h2><a href="#/shop">View all →</a></div><div class="grid">${data.map(card).join('')}</div>${await recentHtml(0)}`;
};
pages.shop = async (_, q) => {
  await loadRatings();
  const category = q.get('category') || '', term = (q.get('q') || '').replace(/[%,()]/g, '');
  const sort = q.get('sort') || 'name', instock = q.get('instock') === '1';
  const ord = { name: ['name', true], price_asc: ['price_cents', true], price_desc: ['price_cents', false], stock: ['stock', false] }[sort] || ['name', true];
  let req = sb.from('products').select('*').eq('active', true).order(ord[0], { ascending: ord[1] });
  const pmin = Math.round((parseFloat(q.get('min')) || 0) * 100), pmax = Math.round((parseFloat(q.get('max')) || 0) * 100), sale = q.get('sale') === '1';
  if (instock) req = req.gt('stock', 0); if (pmin) req = req.gte('price_cents', pmin); if (pmax) req = req.lte('price_cents', pmax);
  if (category) req = req.eq('category', category);
  if (term) req = req.or(`name.ilike.%${term}%,description.ilike.%${term}%,category.ilike.%${term}%`);
  let { data, error } = await req; if (error) throw error; if (sale) data = data.filter(onSale); await attachPacks(data);
  const cats = [...new Set((await sb.from('products').select('category').eq('active', true)).data.map((r) => r.category))].sort();
  return `<h1>${esc(category || 'All products')}</h1><div class="chips"><a class="chip ${!category ? 'on' : ''}" href="#/shop">All</a>
  ${cats.map((c) => `<a class="chip ${c === category ? 'on' : ''}" href="#/shop?category=${encodeURIComponent(c)}">${esc(c)}</a>`).join('')}</div>
  <form class="toolbar" id="filters"><span class="muted grow">${data.length} product${data.length === 1 ? '' : 's'}</span>
  <label><input type="checkbox" name="instock" ${instock ? 'checked' : ''}> In stock only</label><label><input type="checkbox" name="sale" ${sale ? 'checked' : ''}> On sale</label>
  <span class="pricerange"><input name="min" type="number" min="0" step="1" placeholder="Min $" value="${q.get('min') || ''}" aria-label="Minimum price"><span>–</span><input name="max" type="number" min="0" step="1" placeholder="Max $" value="${q.get('max') || ''}" aria-label="Maximum price"></span>
  <select name="sort" aria-label="Sort">${[['name', 'Name'], ['price_asc', 'Price: low to high'], ['price_desc', 'Price: high to low'], ['stock', 'Most in stock']].map(([v, l]) => `<option value="${v}" ${v === sort ? 'selected' : ''}>${l}</option>`).join('')}</select></form>
  ${term ? `<p class="muted">Results for “${esc(term)}”</p>` : ''}${data.length ? `<div class="grid">${data.map(card).join('')}</div>` : '<p>No products found.</p>'}`;
};
document.addEventListener('submit', async (e) => {
  if (e.target.id !== 'alertform') return; e.preventDefault();
  const { error } = await sb.rpc('notify_when_back', { pid: Number(e.target.dataset.id), addr: new FormData(e.target).get('email') });
  error ? fail(error) : (flash("Got it — we'll record your email for this product."), e.target.innerHTML = '<span class="muted">:ic-check-circle: You are on the list.</span>');
});
pages.shop.after = (_, q) => document.getElementById('filters')?.addEventListener('change', (e) => {
  const f = new FormData(e.currentTarget), n = new URLSearchParams(q);
  n.set('sort', f.get('sort')); f.get('instock') ? n.set('instock', '1') : n.delete('instock'); f.get('sale') ? n.set('sale', '1') : n.delete('sale'); ['min', 'max'].forEach((k) => (f.get(k) ? n.set(k, f.get(k)) : n.delete(k))); location.hash = `#/shop?${n}`;
});
pages.product = async ([slug]) => {
  const { data: p } = await sb.from('products').select('*').eq('slug', slug).maybeSingle();
  if (!p) return '<h1>Not found</h1>';
  await attachPacks([p]);
  await loadRatings();
  const revs = (await sb.from('reviews').select('*').eq('product_id', p.id).order('created_at', { ascending: false })).data || [];
  const mine = session && revs.find((r) => r.user_id === session.user.id);
  const reviewsHtml = `${RATINGS[p.id] ? `<p>${stars(RATINGS[p.id].avg)} <b>${RATINGS[p.id].avg}</b> from ${RATINGS[p.id].count} review${RATINGS[p.id].count === 1 ? '' : 's'}</p>` : '<p class="muted">No reviews yet.</p>'}
  ${revs.map((r) => `<div class="review"><div>${stars(r.rating)} <b>${esc(r.author)}</b> <span class="muted">· ${new Date(r.created_at).toLocaleDateString()}</span>${session && (r.user_id === session.user.id || profile?.is_admin) ? ` <button class="link delrev" data-id="${r.id}" style="color:var(--err)">Delete</button>` : ''}</div>${r.comment ? `<p>${esc(r.comment)}</p>` : ''}</div>`).join('')}
  ${!session ? '<p><a href="#/login">Log in</a> to write a review.</p>' : mine ? '' : `<form id="rf" class="stack narrow"><label>Your rating<select name="rating"><option value="5">★★★★★ Excellent</option><option value="4">★★★★ Good</option><option value="3">★★★ OK</option><option value="2">★★ Poor</option><option value="1">★ Bad</option></select></label>
  <label>Comment<textarea name="comment" rows="3" maxlength="2000"></textarea></label><button class="btn">Post review</button></form>`}`;
  const related = (await sb.from('products').select('*').eq('active', true).neq('id', p.id).limit(40)).data
    .sort((a, b) => (b.category === p.category) - (a.category === p.category)).slice(0, 4);
  const extra = (await sb.from('product_images').select('url').eq('product_id', p.id).order('position')).data || [];
  const pics = [p.image_url, ...extra.map((x) => x.url)].filter((u) => safeUrl(u));
  const recent = await recentHtml(p.id); pushRV(p.id); setSeo({ title: p.seo_title || `${p.name}${p.r_value && !p.name.includes(p.r_value) ? ' ' + p.r_value : ''}`, description: p.seo_description || p.description, image: pics[0], type: 'product', path: '/product/' + p.slug + '/', jsonld: productLd(p, pics) });
  const gallery = pics.length ? `<div class="gallery"><img class="big" id="mainpic" src="${esc(pics[0])}" alt="${esc(p.image_alt || p.name)}">${pics.length > 1 ? `<div class="thumbs">${pics.map((u, i) => `<img src="${esc(u)}" alt="Photo ${i + 1}" class="${i ? '' : 'on'}">`).join('')}</div>` : ''}</div>` : img(p, true);
  return `<div class="crumbs" role="navigation" aria-label="Breadcrumb"><a href="#/shop">Shop</a> › <a href="#/shop?category=${encodeURIComponent(p.category)}">${esc(p.category)}</a> › <span>${esc(p.name)}</span></div>
  <div class="detail"><div>${gallery}</div><div><span class="tag">${esc(p.category)}</span><h1>${esc(p.name)}</h1>
  <p class="price big">${priceHtml(p)} <small>per ${esc(p.unit)}</small>${onSale(p) ? ` <span class="savepill">Save ${salePct(p)}%</span>` : ''}</p>${p.r_value ? `<p><strong>R-value:</strong> ${esc(p.r_value)}</p>` : ''}<p>${esc(p.description)}</p>
  ${packTable(p)}
  ${p.stock > 0 ? `<form class="row" id="add"><div class="qty"><button type="button" data-d="-1" aria-label="Less">−</button><input type="number" name="qty" value="1" min="1" max="${p.stock}" aria-label="Quantity"><button type="button" data-d="1" aria-label="More">+</button></div><button class="btn">Add to cart</button></form>
  <p class="stockpill ${p.stock <= 10 ? 'low' : ''}"><i></i>${p.stock <= 10 ? `Only ${p.stock} left` : 'In stock'}</p>` : `<p class="flash error" style="margin-bottom:8px">Out of stock</p><form id="alertform" class="row" data-id="${p.id}" style="flex-wrap:nowrap"><input name="email" type="email" required placeholder="Email me when it's back" value="${esc(session?.user.email || '')}" aria-label="Email"><button class="btn">:ic-bell: Notify me</button></form>`}
  <ul class="trust"><li>:ic-truck: ${FREE_SHIP > 0 ? `Free shipping on orders over ${money(FREE_SHIP)}` : `Flat ${money(SHIP)} delivery`}</li><li>:ic-chat: Questions? <a href="#/messages">Message us</a> or <a href="#/quote">request a quote</a></li></ul>
  ${compareHtml(p)}
  ${coverageOf(p) ? `<div class="calc"><h3>:ic-ruler: How many do I need?</h3><div class="row"><label>Area (sq ft) <input type="number" id="area" min="1" value="200"></label>
  <label>Waste % <input type="number" id="waste" min="0" max="30" value="10"></label></div><p class="out" id="calcout"></p></div>` : ''}</div></div>
  <h2>Customer reviews</h2>${reviewsHtml}
  ${related.length ? `<h2>You might also need</h2><div class="grid">${related.map(card).join('')}</div>` : ''}${recent}`;
};
const coverageOf = (p) => { const m = /(\d+)\s*sq\s*ft/i.exec(p.unit); return m ? Number(m[1]) : 0; };
pages.product.after = ([slug]) => {
  const buy = document.getElementById('add'); if (buy && window.IntersectionObserver) {
    const bar = document.createElement('div'); bar.className = 'buybar'; bar.hidden = true;
    bar.innerHTML = `<span><b>${esc(document.querySelector('h1')?.textContent || '')}</b><small>${document.querySelector('.price.big')?.textContent.replace(/\s+/g, ' ').trim() || ''}</small></span><button class="btn" type="button">Add to cart</button>`;
    document.body.appendChild(bar); bar.querySelector('button').addEventListener('click', () => buy.requestSubmit());
    const io = new IntersectionObserver(([en]) => { bar.hidden = en.isIntersecting; }, { threshold: 0 }); io.observe(buy);
    const gone = () => { bar.remove(); io.disconnect(); window.removeEventListener('hashchange', gone); }; window.addEventListener('hashchange', gone);
  }
  document.querySelectorAll('.thumbs img').forEach((t) => t.addEventListener('click', () => {
    document.getElementById('mainpic').src = t.src; document.querySelectorAll('.thumbs img').forEach((x) => x.classList.toggle('on', x === t));
  }));
  document.getElementById('rf')?.addEventListener('submit', async (e) => {
    e.preventDefault(); const f = Object.fromEntries(new FormData(e.target));
    const { data: p } = await sb.from('products').select('id').eq('slug', slug).single();
    const { error } = await sb.from('reviews').insert({ product_id: p.id, rating: Number(f.rating), comment: f.comment.trim() });
    error ? fail(error) : (flash('Thanks for your review!'), route());
  });
  document.querySelectorAll('.delrev').forEach((b) => b.addEventListener('click', async () => { const { error } = await sb.from('reviews').delete().eq('id', b.dataset.id); error ? fail(error) : route(); }));
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
  document.querySelectorAll('[data-addqty]').forEach((b) => b.addEventListener('click', async () => {
    const { data: p } = await sb.from('products').select('id,stock,name').eq('slug', slug).single(); const cart = getCart();
    cart[p.id] = Math.min((cart[p.id] || 0) + Number(b.dataset.addqty), p.stock); setCart(cart); flash(`Added to your cart: ${b.textContent.replace(/^Add\s*/, '') || '1'} of ${p.name}.`); location.hash = '#/cart';
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
const packSave = (p, k) => Math.round((1 - k.unit_price_cents / p.price_cents) * 100);
async function attachPacks(list) { const ids = list.map((x) => x.id); if (!ids.length) return list; const { data } = await sb.from('product_packs').select('*').in('product_id', ids).order('units'); list.forEach((x) => (x.packs = (data || []).filter((k) => k.product_id === x.id))); return list; }
async function cartLines() {
  const cart = getCart(), ids = Object.keys(cart); if (!ids.length) return [];
  const { data } = await sb.from('products').select('*').in('id', ids).eq('active', true);
  const live = data.filter((p) => p.stock > 0); await attachPacks(live); return live.map((p) => ({ ...p, qty: Math.min(cart[p.id], p.stock) }));
}
pages.cart = async () => {
  const lines = await cartLines();
  if (!lines.length) return '<div class="empty"><div style="font-size:3rem">:ic-cart:</div><h1>Your cart is empty</h1><p class="muted">Browse our insulation and add what you need.</p><a class="btn" href="#/shop">Start shopping</a></div>';
  const t = totals(lines.reduce((a, l) => a + lineTotal(l), 0));
  const left = FREE_SHIP > 0 ? FREE_SHIP - (t.sub - t.disc) : 0;
  return `<h1>Your cart</h1><div class="cartwrap"><form id="cartform"><div class="citems">${lines.map((l) => `<div class="citem"><a href="#/product/${esc(l.slug)}" class="cthumb">${img(l)}</a>
    <div class="cinfo"><a class="cname" href="#/product/${esc(l.slug)}">${esc(l.name)}</a><small class="muted">${packSplit(l, l.qty).map((r) => `${r.qty} × ${money(r.price)}${r.label ? ' (' + esc(r.label) + ')' : ''}`).join(' + ')} per ${esc(l.unit)}</small>${(l.packs || []).some((k) => k.units > l.qty && k.unit_price_cents < l.price_cents) ? (() => { const k = l.packs.filter((x) => x.units > l.qty && x.unit_price_cents < l.price_cents).sort((a, b) => a.units - b.units)[0]; return `<small class="packnudge">Add ${k.units - l.qty} more to get the ${esc(k.label)} price (save ${packSave(l, k)}% per ${esc(su(l.unit))})</small>`; })() : ''}</div>
    <div class="qty"><button type="button" data-d="-1" aria-label="Less">−</button><input type="number" name="${l.id}" value="${l.qty}" min="0" max="${l.stock}" aria-label="Quantity"><button type="button" data-d="1" aria-label="More">+</button></div>
    <b class="ctotal">${money(lineTotal(l))}</b><button type="button" class="crm" data-id="${l.id}" aria-label="Remove ${esc(l.name)}">:ic-x:</button></div>`).join('')}</div></form>
  <aside class="summary"><h3>Order summary</h3>${FREE_SHIP > 0 ? `<p class="muted" style="margin:0">${left > 0 ? `Add <b>${money(left)}</b> more for free shipping` : ':ic-award: You qualify for free shipping!'}</p><div class="progress"><i style="width:${Math.min(100, (t.sub - t.disc) / FREE_SHIP * 100)}%"></i></div>` : ''}
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
  cf?.addEventListener('click', (e) => { const r = e.target.closest('.crm'); if (r) { cf.querySelector(`input[name="${r.dataset.id}"]`).value = 0; cf.requestSubmit(); } });
  document.getElementById('cartform')?.addEventListener('submit', (e) => {
  e.preventDefault(); const cart = {};
  for (const [id, v] of new FormData(e.target)) { const q = parseInt(v, 10); if (q > 0) cart[id] = q; }
  setCart(cart); route();
});
};

let SAVED = [], CHK = null;
pages.checkout = async () => {
  const lines = await cartLines(); if (!lines.length) return '<h1>Checkout</h1><p>Your cart is empty.</p>';
  if (shopClosed()) return `<div class="authcard"><div class="authicon">:ic-lock:</div><h1>The shop is closed</h1><p class="muted">${esc(closedMsg())}${esc(reopenNote())}</p><a class="btn" href="#/cart">Back to cart</a> <a class="btn ghost" href="#/products">Keep browsing</a></div>`;
  SAVED = session ? (await sb.from('addresses').select('*').order('is_default', { ascending: false }).order('id')).data || [] : [];
  const d = SAVED[0] || {};
  const t = totals(lines.reduce((a, l) => a + lineTotal(l), 0));
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
  ${f('address', 'Delivery address', d.address, 'required')}<div class="two2">${f('city', 'City', d.city, 'required')}${f('postcode', 'Postal / ZIP code', d.postcode, 'required')}</div></div></section>
  <section class="cs"><h3><span class="num">3</span> Notes &amp; payment</h3><label>Order notes (optional)<textarea name="notes" rows="3" placeholder="Gate code, delivery instructions…"></textarea></label>
  <p class="muted" style="margin:0">${C.PAYMENTS ? ':ic-lock: You will be taken to a secure Stripe page to pay by card.' : "Payment: we'll email you an invoice and payment options once your order is confirmed."}</p>
  <button class="btn block">${C.PAYMENTS ? 'Continue to payment' : 'Place order'}</button></section></form>
  <aside class="summary"><h3>Order summary</h3><ul class="olist">${lines.map((l) => `<li><span class="cthumb sm">${img(l)}</span><span>${l.qty} × ${esc(l.name)}</span><b>${money(lineTotal(l))}</b></li>`).join('')}</ul>${totalsHtml(t)}<a class="muted" href="#/cart" style="text-align:center;display:block">← Edit cart</a></aside></div>`;
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
    document.querySelector('aside .totals')?.replaceWith(Object.assign(document.createElement('div'), { innerHTML: totalsHtml(totals(CHK.t.sub, pick)) }).firstElementChild);
  };
  document.querySelectorAll('#co input[name=fulfillment]').forEach((r) => r.addEventListener('change', setFulfil));
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
  <div class="cartwrap"><div><div class="citems">${items.map((i) => `<div class="citem oi"><div class="cinfo"><b>${esc(i.name)}</b><small class="muted">${money(i.price_cents)} × ${i.qty}</small></div><b class="ctotal">${money(i.price_cents * i.qty)}</b></div>`).join('')}</div>
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

const authForm = (reg) => `<div class="authcard"><div class="authicon">${reg ? ':ic-star:' : ':ic-smile:'}</div><h1>${reg ? 'Create your account' : 'Welcome back'}</h1><p class="muted" style="margin-top:-6px">${reg ? 'Track orders, save addresses and message our team.' : 'Log in to see your orders and messages.'}</p><form id="auth" class="stack">
  ${reg ? '<label>Name<input name="name" required autocomplete="name"></label><label>Username<input name="username" required minlength="3" maxlength="30" pattern="[A-Za-z0-9][A-Za-z0-9_.\\-]{2,29}" autocomplete="username" placeholder="e.g. sam_builds" autocapitalize="none" spellcheck="false"><small id="unhint" class="muted">3–30 letters, numbers, dots, dashes or underscores</small></label><label>Email<input type="email" name="email" required autocomplete="email"></label>' : '<label>Email or username<input name="email" required autocomplete="username" autocapitalize="none" spellcheck="false"></label>'}
  <label>Password<input type="password" name="password" required minlength="${reg ? 8 : 1}"></label><button class="btn block">${reg ? 'Sign up' : 'Log in'}</button></form>
  ${reg ? '' : '<p><a href="#/forgot">Forgot your password?</a></p>'}
  <p>${reg ? 'Have an account? <a href="#/login">Log in</a>' : 'New here? <a href="#/register">Create an account</a>'}</p></div>`;
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
const authAfter = (reg) => () => {
  const hint = document.getElementById('unhint'), un = document.querySelector('#auth [name=username]'); let t = null;
  un?.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => checkUsername(un.value.trim(), hint), 300); });
  document.getElementById('auth')?.addEventListener('submit', async (e) => {
    e.preventDefault(); const f = Object.fromEntries(new FormData(e.target)), btn = e.target.querySelector('button'); btn.disabled = true; let r;
    try {
      if (reg) {
        if (!(await checkUsername(f.username.trim(), hint))) return fail(new Error('Please choose a different username.'));
        r = await sb.auth.signUp({ email: f.email.trim(), password: f.password, options: { data: { name: f.name, username: f.username.trim() } } });
      } else if (f.email.includes('@')) r = await sb.auth.signInWithPassword({ email: f.email.trim(), password: f.password });
      else {
        const { data, error } = await sb.functions.invoke('username-login', { body: { identifier: f.email.trim(), password: f.password } });
        if (!data?.access_token) return fail(new Error(await edgeError(error, data)));
        r = await sb.auth.setSession({ access_token: data.access_token, refresh_token: data.refresh_token });
      }
      if (r.error) return fail(r.error);
      if (reg && !r.data.session) { flash('Check your email to confirm your account, then log in with your email or username.'); return (location.hash = '#/login'); }
      await loadSession(); flash(reg ? 'Welcome! Your account is ready.' : 'Logged in.'); location.hash = '#/account';
    } finally { btn.disabled = false; }
  });
};
pages.login.after = authAfter(false); pages.register.after = authAfter(true);

const ordersTable = (os, base, locNames) => os.length ? `<table><tr><th>Order</th><th>Date</th>${locNames ? '<th>Location</th>' : ''}<th>Status</th><th>Total</th></tr>${os.map((o) => `<tr><td><a href="${base}/${o.id}">#${o.id}</a>${base.includes('admin') ? ' · ' + esc(o.name) : ''}</td><td>${dateOf(o.created_at)}</td>${locNames ? `<td>${esc(locNames[o.location_id] || '')}${o.source === 'in_store' ? ' · in store' : o.fulfillment === 'pickup' ? ' · pickup' : ''}</td>` : ''}<td><span class="status ${esc(o.status)}">${esc(o.status)}</span></td><td>${money(o.total_cents)}</td></tr>`).join('')}</table>` : '<p>No orders yet.</p>';
const setDefault = async (id) => { await sb.from('addresses').update({ is_default: false }).neq('id', id); await sb.from('addresses').update({ is_default: true }).eq('id', id); };
pages.account = async () => {
  if (!session) { location.hash = '#/login'; return ''; }
  const { data } = await sb.from('orders').select('*').eq('user_id', session.user.id).order('id', { ascending: false });
  const addrs = (await sb.from('addresses').select('*').order('is_default', { ascending: false }).order('id')).data;
  const wl = getWish().length;
  const myInv = (await sb.from('invoices').select('id,number,due_date,status,total_cents,paid_cents').eq('customer_id', session.user.id).order('id', { ascending: false })).data || [];
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
  return `<div class="formcard">${head}<form id="cf2" class="stack" data-slug="${esc(f.slug)}" data-ok="${esc(f.success_message)}">${f.fields.map(fieldHtml).join('')}<button class="btn block">${esc(f.submit_label || 'Submit')}</button></form></div>`;
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
  <label>What do you need?<textarea name="message" rows="6" required placeholder="e.g. 1,500 sq ft attic, R-38, delivery to Austin TX"></textarea></label><button class="btn">Send request</button></form></div>`;
pages.quote.after = () => document.getElementById('qf')?.addEventListener('submit', async (e) => {
  e.preventDefault(); const f = Object.fromEntries(new FormData(e.target));
  const { error } = await sb.from('quotes').insert({ ...f, user_id: session?.user.id ?? null });
  if (error) return fail(error); flash("Thanks! We'll be in touch soon."); location.hash = '#/';
});

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
const CMD_LINKS = [['Dashboard', '#/admin', 'orders.view'], ['Orders', '#/admin/orders', 'orders.view'], ['Point of sale', '#/admin/pos', 'pos'], ['Products', '#/admin/products', 'catalog.manage'], ['New product', '#/admin/products/new', 'catalog.manage'], ['Inventory', '#/admin/inventory', 'inventory.view'], ['Customers', '#/admin/customers', 'customers.view'], ['Invoices', '#/admin/invoices', 'invoices.view'], ['New invoice', '#/admin/invoices/new', 'invoices.manage'], ['Estimates', '#/admin/estimates', 'invoices.view'], ['Expenses', '#/admin/expenses', 'expenses.view'], ['Profit & loss', '#/admin/profit', 'expenses.view'], ['Purchasing', '#/admin/purchasing', 'purchasing.view'], ['Messages', '#/messages', 'messages'], ['Forms', '#/admin/forms', 'content.manage'], ['Pages', '#/admin/pages', 'content.manage'], ['SEO', '#/admin/seo', 'content.manage'], ['Discount codes', '#/admin/codes', 'content.manage'], ['Quotes', '#/admin/quotes', 'customers.view'], ['Settings', '#/admin/settings', 'team.manage'], ['Team & roles', '#/admin/team', 'team.manage'], ['Activity log', '#/admin/activity', 'team.manage']];
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
    if (can('catalog.manage')) jobs.push(sb.from('products').select('id,name,category').ilike('name', `%${like}%`).limit(5).then((r) => (r.data || []).map((x) => ({ kind: 'Product', label: x.name, sub: x.category, href: `#/admin/products/${x.id}` }))));
    if (can('orders.view')) jobs.push(sb.from('orders').select('id,name,total_cents,status').or(num ? `id.eq.${num},name.ilike.%${like}%` : `name.ilike.%${like}%,email.ilike.%${like}%`).order('id', { ascending: false }).limit(5).then((r) => (r.data || []).map((o) => ({ kind: 'Order', label: `#${o.id} · ${o.name}`, sub: `${o.status} · ${money(o.total_cents)}`, href: `#/admin/orders/${o.id}` }))));
    if (can('invoices.view')) jobs.push(sb.from('invoices').select('id,number,customer_name,total_cents').or(`number.ilike.%${like}%,customer_name.ilike.%${like}%`).limit(5).then((r) => (r.data || []).map((i) => ({ kind: 'Invoice', label: `${i.number} · ${i.customer_name}`, sub: money(i.total_cents), href: `#/admin/invoices/${i.id}` }))));
    const res = (await Promise.all(jobs.map((j) => j.catch(() => [])))).flat(); if (my !== seq) return; items = [...items, ...res]; draw();
  };
  const go = (i) => { const x = items[i]; if (x) { close(); location.hash = x.href; } };
  const onKey = (e) => { if (e.key === 'Escape') { e.preventDefault(); close(); } else if (e.key === 'ArrowDown') { e.preventDefault(); sel = Math.min(items.length - 1, sel + 1); draw(); } else if (e.key === 'ArrowUp') { e.preventDefault(); sel = Math.max(0, sel - 1); draw(); } else if (e.key === 'Enter' && document.activeElement === q) { e.preventDefault(); go(sel); } };
  document.addEventListener('keydown', onKey, true); let tm; q.addEventListener('input', () => { clearTimeout(tm); tm = setTimeout(run, 160); });
  el.addEventListener('click', (e) => { if (e.target === el) close(); else if (e.target.closest('.cmditem')) close(); }); run(); q.focus();
}
document.addEventListener('keydown', (e) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k' && isStaff()) { e.preventDefault(); openPalette(); } });
document.addEventListener('click', (e) => { if (e.target.closest('.openpalette')) openPalette(); });

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
  compare: 'catalog.manage', purchasing: 'purchasing.view', suppliers: 'purchasing.view', invoices: 'invoices.view', team: 'team.manage', settings: 'team.manage', activity: 'team.manage', quotes: 'customers.view', estimates: 'invoices.view', seo: 'content.manage', statements: 'invoices.view', expenses: 'expenses.view', profit: 'expenses.view' };
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
      <table class="invitems"><tr><th style="width:36px">Packed</th><th>Item</th><th class="r">Qty</th></tr>${items.map((x) => `<tr><td><span class="tick"></span></td><td>${esc(x.name)}</td><td class="r"><b>${x.qty}</b></td></tr>`).join('')}</table>
      ${o.notes ? `<p style="white-space:pre-wrap"><b>Customer notes</b><br>${esc(o.notes)}</p>` : ''}<p class="muted" style="margin-top:24px">Thank you for your order! Questions? ${[biz.phone, biz.email].filter(Boolean).map(esc).join(' · ')}</p></section>`; }).join('') || '<p>No orders found.</p>'}`;
  }
  if (sub === 'orders' && id) {
    const o = (await sb.from('orders').select('*').eq('id', id).single()).data;
    const [itemsR, notesR, refR] = await Promise.all([sb.from('order_items').select('*').eq('order_id', id), sb.from('order_notes').select('*').eq('order_id', id).order('id', { ascending: false }), sb.from('refunds').select('*').eq('order_id', id).order('id', { ascending: false })]);
    const remaining = o.total_cents - (o.refunded_cents || 0);
    return `<div class="row noprint" style="justify-content:flex-end;margin-bottom:8px"><a class="btn ghost" href="#/admin/orders/${o.id}/slip">:ic-clipboard: Packing slip</a></div>${orderHtml(o, itemsR.data, can('orders.manage') ? true : 'ro')}
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
    const [pr, pgs] = await Promise.all([sb.from('products').select('id,name,slug,description,image_url,image_alt,seo_title,seo_description,active').order('name'), sb.from('pages').select('id,title,slug,body,seo_title,seo_description,published').order('title')]);
    const chk = (t, d, extra = []) => { const issues = [], tl = (t || '').length, dl = (d || '').length;
      if (!dl) issues.push('No meta description'); else if (dl < 70) issues.push('Description too short'); else if (dl > 160) issues.push('Description too long');
      if (tl < 15) issues.push('Title too short'); else if (tl > 60) issues.push('Title too long'); return [...issues, ...extra]; };
    const rows = [...(pr.data || []).filter((x) => x.active).map((x) => ({ kind: 'Product', name: x.name, href: `#/admin/products/${x.id}`, issues: chk(x.seo_title || x.name, x.seo_description || x.description, [...(safeUrl(x.image_url) ? (x.image_alt ? [] : ['No photo alt text']) : ['No photo'])]) })),
      ...(pgs.data || []).filter((x) => x.published).map((x) => ({ kind: 'Page', name: x.title, href: `#/admin/pages/${x.id}`, issues: chk(x.seo_title || x.title, x.seo_description || x.body, []) }))];
    const good = rows.filter((r) => !r.issues.length).length, score = rows.length ? Math.round((good / rows.length) * 100) : 100;
    const o = { site_title: '', description: '', og_image: '', site_url: '', noindex: false, home_title: '', ...SEO };
    return `<div class="sechead"><h1 style="margin:0">SEO</h1><span class="muted">Help customers find you on Google</span></div>
    <div class="seogrid"><div class="stack"><section class="cs"><h3>Search health</h3><div class="scorewrap"><div class="score ${score >= 80 ? 'good' : score >= 50 ? 'mid' : 'bad'}">${score}</div><div><b>${good} of ${rows.length}</b> live items are fully optimised<br><small class="muted">Checks title and description length, photo alt text.</small></div></div>
      ${rows.length ? `<div class="tablewrap"><table><tr><th>Item</th><th>Type</th><th>To fix</th><th></th></tr>${rows.sort((a, b) => b.issues.length - a.issues.length).map((r) => `<tr><td>${esc(r.name)}</td><td>${r.kind}</td><td>${r.issues.length ? r.issues.map((i) => `<span class="status pending">${esc(i)}</span>`).join(' ') : '<span class="status paid">Good</span>'}</td><td><a href="${r.href}">Edit</a></td></tr>`).join('')}</table></div>` : '<p class="muted">Nothing to check yet.</p>'}</section>
    <section class="cs"><h3>Sitemap &amp; indexing</h3><p class="muted" style="margin-top:0">A build step creates <code>sitemap.xml</code>, <code>robots.txt</code> and a static page for every product and page (with titles, descriptions and structured data) so search engines can read them. It runs on every deploy and once a day — run it now from GitHub → Actions → “Deploy store to GitHub Pages” → Run workflow, or trigger your Netlify deploy. Then submit <code>${esc(seoBase())}/sitemap.xml</code> in Google Search Console.</p></section></div>
    <form id="seoform" class="cs stack"><h3 style="margin:0">Site settings</h3>
      <label>Site name in search results<input name="site_title" maxlength="80" value="${esc(o.site_title)}" placeholder="${esc(theme.name || 'Gomi Insulation')}"></label>
      <label>Home page title<input name="home_title" maxlength="80" value="${esc(o.home_title)}" placeholder="Insulation supplies delivered to your site"></label>
      <label>Default description<textarea name="description" rows="3" maxlength="300" placeholder="Quality insulation, delivered. Batts, rolls, foam and more.">${esc(o.description)}</textarea></label>
      <label>Social share image URL <small class="muted">shown when your link is shared (1200×630 works best)</small><input name="og_image" type="url" value="${esc(o.og_image)}" placeholder="https://…"></label>
      <label>Public website address <small class="muted">used in the sitemap and canonical links</small><input name="site_url" type="url" value="${esc(o.site_url)}" placeholder="https://www.gomiinsulation.com"></label>
      <label class="switch"><input type="checkbox" name="noindex" ${o.noindex ? 'checked' : ''}><span class="track"></span><span>Hide the whole site from search engines</span></label>
      <div class="serpwrap">${serp(o.home_title || seoSite(), o.description, '')}</div><button class="btn">Save SEO settings</button></form></div>`;
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
      <div class="mdbar row"><button type="button" class="btn ghost" data-md="# ">H1</button><button type="button" class="btn ghost" data-md="## ">H2</button><button type="button" class="btn ghost" data-wrap="**">B</button><button type="button" class="btn ghost" data-wrap="*"><i>I</i></button>
      <button type="button" class="btn ghost" data-md="- ">• List</button><button type="button" class="btn ghost" data-md="> ">:ic-quote: Quote</button><button type="button" class="btn ghost" data-ins="[link text](https://)">:ic-link: Link</button>
      <button type="button" class="btn ghost" data-md="### ">H3</button><button type="button" class="btn ghost" data-md="1. ">1. List</button><button type="button" class="btn ghost" data-ins="\n---\n">Divider</button><button type="button" class="btn ghost" data-ins="\n| Column A | Column B |\n| --- | --- |\n| One | Two |\n">Table</button>
      <button type="button" class="btn ghost" data-ins="\n{{faq: Question? | Answer.}}\n">FAQ</button><button type="button" class="btn ghost" data-ins="\n{{callout: Important note}}\n">Callout</button><button type="button" class="btn ghost" data-ins="\n{{youtube: https://www.youtube.com/watch?v=VIDEO_ID}}\n">Video</button><button type="button" class="btn ghost" id="pg_prodbtn">Product</button>
      <button type="button" class="btn ghost" data-ins="{{button: Label | #/shop}}">Button</button><label class="btn ghost" style="cursor:pointer">:ic-image: Image<input type="file" id="pg_img" accept="image/jpeg,image/png,image/webp,image/gif" hidden></label></div>
       <textarea id="pg_body" rows="18" style="font-family:ui-monospace,Menlo,monospace;font-size:.9rem" maxlength="100000">${esc(pg.body)}</textarea>
      ${seoFields(pg, pg.title, '/page/' + (pg.slug || 'your-page') + '/')}
      <div class="row"><button type="button" class="btn" id="pg_save">Save page</button>${pg.id ? `<a class="btn ghost" href="#/page/${esc(pg.slug)}" target="_blank" rel="noopener">View ↗</a>` : ''}</div>
      ${PG.versions.length ? `<details class="more"><summary>Version history (${PG.versions.length})</summary><div class="stack" style="gap:6px;margin-top:8px">${PG.versions.map((v) => `<div class="row" style="justify-content:space-between;flex-wrap:nowrap"><span><b>${esc(v.title)}</b> <small class="muted">${ago(v.created_at)}${v.author ? ' · ' + esc(v.author) : ''} · ${v.body.length} chars</small></span><button type="button" class="link pg_restore" data-id="${v.id}">Restore</button></div>`).join('')}</div></details>` : ''}
      <details class="more"><summary>Formatting help</summary><p class="muted" style="white-space:pre-wrap"># Heading   ## Smaller heading
**bold**  *italic*  [link](https://…)  ![image](https://…)
- bullet list      1. numbered list      &gt; quote      --- divider
{{button: Shop now | #/shop}}  (a button link)
{{faq: Question? | Answer}}  {{callout: note}}  {{product: product-link-name}}  {{youtube: video url}}
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
    const [prods, locs, inv, log, sold] = await Promise.all([sb.from('products').select('id,name,category,active,cost_cents,price_cents,reorder_point').order('name'), sb.from('locations').select('*').order('is_default', { ascending: false }).order('name'),
      sb.from('inventory').select('*'), sb.from('inventory_log').select('*').order('id', { ascending: false }).limit(40),
      sb.from('order_items').select('product_id,qty,orders!inner(created_at,status)').neq('orders.status', 'cancelled').gte('orders.created_at', new Date(Date.now() - 30 * 864e5).toISOString()).limit(5000)]);
    const P = prods.data, L = locs.data, qty = {}; inv.data.forEach((r) => (qty[`${r.product_id}:${r.location_id}`] = r.qty));
    const pname = Object.fromEntries(P.map((x) => [x.id, x.name])), lname = Object.fromEntries(L.map((x) => [x.id, x.name]));
    const KIND_L = { adjust: 'Adjusted', sale: 'Sale', restock: 'Restocked', transfer_in: 'Transfer in', transfer_out: 'Transfer out' };
    return `<h1>Inventory</h1><p><a class="btn ghost" href="#/admin/locations">Manage locations</a> <button class="btn ghost" id="invcsv">:ic-download: Export CSV</button></p>
    ${(() => { const sold30 = {}; (sold.data || []).forEach((r) => (sold30[r.product_id] = (sold30[r.product_id] || 0) + r.qty)); INVSOLD = sold30;
      const rows = P.map((x) => { const tot = L.reduce((a, l) => a + (qty[`${x.id}:${l.id}`] || 0), 0); return { x, tot, st: tot === 0 ? 'out' : tot <= (x.reorder_point ?? 10) ? 'low' : 'ok' }; }), live = rows.filter((r) => r.x.active);
      return `<div class="kpis"><div class="kpi"><span class="lbl">Products</span><b>${live.length}</b></div><div class="kpi"><span class="lbl">Units on hand</span><b>${live.reduce((a, r) => a + r.tot, 0).toLocaleString()}</b></div><div class="kpi"><span class="lbl">Stock value (cost)</span><b>${money(live.reduce((a, r) => a + r.tot * (r.x.cost_cents || 0), 0))}</b><small class="muted">${money(live.reduce((a, r) => a + r.tot * r.x.price_cents, 0))} at retail</small></div><div class="kpi"><span class="lbl">Needs attention</span><b class="${rows.some((r) => r.st !== 'ok') ? 'down' : ''}">${live.filter((r) => r.st === 'low').length} low · ${live.filter((r) => r.st === 'out').length} out</b></div></div>`; })()}
    <div class="toolbar" style="margin:14px 0 8px"><input id="invsearch" placeholder="Filter products…" aria-label="Filter products" style="flex:1;max-width:320px"><div class="chips" id="invst" style="margin:0">${[['', 'All'], ['low', 'Low'], ['out', 'Out of stock'], ['ok', 'Healthy']].map(([v, l], i) => `<button type="button" class="chip ${i ? '' : 'on'}" data-st="${v}">${l}</button>`).join('')}</div><select id="invsort" aria-label="Sort"><option value="name">A–Z</option><option value="stock">Lowest stock</option><option value="cover">Least days of cover</option><option value="value">Highest value</option></select></div>
    <div class="tablewrap"><table id="invtable"><tr><th>Product</th>${L.map((l) => `<th>${esc(l.name)}${l.active ? '' : ' (inactive)'}</th>`).join('')}<th>Total</th><th>Status</th><th>Value</th><th title="Stock on hand ÷ average daily sales over the last 30 days">Days left</th></tr>
    ${P.map((x) => { const tot = L.reduce((a, l) => a + (qty[`${x.id}:${l.id}`] || 0), 0), st = tot === 0 ? 'out' : tot <= (x.reorder_point ?? 10) ? 'low' : 'ok', s30 = INVSOLD[x.id] || 0, cover = s30 > 0 ? Math.round(tot / (s30 / 30)) : 9999; return `<tr data-name="${esc(x.name.toLowerCase())}" data-st="${st}" data-stock="${tot}" data-cover="${cover}" data-value="${tot * (x.cost_cents || 0)}"><td><b>${esc(x.name)}</b>${x.active ? '' : ' <span class="muted">(hidden)</span>'}<br><small class="muted">${esc(x.category)}</small></td>${L.map((l) => `<td><input type="number" min="0" class="invq" data-p="${x.id}" data-l="${l.id}" value="${qty[`${x.id}:${l.id}`] || 0}" aria-label="${esc(x.name)} at ${esc(l.name)}"></td>`).join('')}<td class="invtot ${st !== 'ok' ? 'lowtot' : ''}">${tot}</td><td><span class="status ${st === 'out' ? 'cancelled' : st === 'low' ? 'pending' : 'paid'}">${st === 'out' ? 'Out' : st === 'low' ? 'Low' : 'OK'}</span></td><td>${money(tot * (x.cost_cents || 0))}</td><td>${cover === 9999 ? '<span class="muted">no sales</span>' : cover + ' d'}</td></tr>`; }).join('')}</table></div>
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
    <form id="setf" class="stack narrow"><fieldset class="cmpset"><legend>Shop status</legend>
      <label class="switch"><input type="checkbox" name="closed" ${STORE.closed ? 'checked' : ''}><span class="track"></span><span>Shop closed — turn off online ordering</span></label>
      <label>Message shown to customers<textarea name="closed_message" rows="2" maxlength="300" placeholder="We're closed for the holidays and will reopen Monday.">${esc(STORE.closed_message || '')}</textarea></label>
      <label>Reopens automatically on <small class="muted">optional</small><input type="date" name="closed_until" value="${esc(STORE.closed_until || '')}"></label><small class="muted">While closed, customers can browse and fill a cart but cannot check out. In-store sales (POS) and invoices still work for your team.</small></fieldset>
    <fieldset class="cmpset"><legend>Shipping</legend>
      <label>Flat delivery fee ($)<input name="ship" type="number" step="0.01" min="0" value="${((STORE.ship_flat_cents || 0) / 100).toFixed(2)}"></label>
      <label>Free delivery on orders over ($) <small class="muted">0 = never free</small><input name="free" type="number" step="0.01" min="0" value="${((STORE.free_over_cents || 0) / 100).toFixed(2)}"></label></fieldset>
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
  if (sub === 'invoices' && (id === 'new' || extra === 'edit')) return editorPage('invoice', id);
  if (sub === 'estimates' && (id === 'new' || extra === 'edit')) return editorPage('estimate', id);
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
    return `<div class="dashhead"><h1 style="margin:0">Invoices</h1><div class="row"><a class="btn ghost" href="#/admin/estimates">Estimates</a><a class="btn ghost" href="#/admin/invoices/recurring">Recurring</a>${can('invoices.manage') ? '<a class="btn" href="#/admin/invoices/new">+ New invoice</a>' : ''}</div></div>
    <div class="kpis"><div class="kpi"><span class="lbl">Outstanding</span><b>${money(open.reduce((a, i) => a + invBal(i), 0))}</b><small class="muted">${open.length} open invoice${open.length === 1 ? '' : 's'}</small></div><div class="kpi"><span class="lbl">Overdue</span><b class="${aging.slice(1).some((a) => a[1]) ? 'down' : ''}">${money(aging.slice(1).reduce((a, x) => a + x[1], 0))}</b></div>
      <div class="kpi"><span class="lbl">Paid in last 30 days</span><b>${money((pr.data || []).reduce((a, x) => a + x.amount_cents, 0))}</b></div><div class="kpi"><span class="lbl">Drafts</span><b>${all.filter((i) => i.status === 'draft').length}</b></div></div>
    <h2>Receivables aging</h2><table class="aging"><tr>${aging.map((a) => `<th>${a[0]}</th>`).join('')}</tr><tr>${aging.map((a) => `<td><b>${money(a[1])}</b></td>`).join('')}</tr></table>
    <div class="chips" style="margin-top:14px">${[['', 'All'], ['draft', 'Draft'], ['sent', 'Sent'], ['overdue', 'Overdue'], ['paid', 'Paid'], ['void', 'Void']].map(([v, l]) => `<a class="chip ${filter === v ? 'on' : ''}" href="${link(v)}">${l}</a>`).join('')}</div>
    <div class="row" style="margin-bottom:10px"><form id="invsearch" class="row" style="flex:1;flex-wrap:nowrap"><input name="search" value="${esc(q.get('search') || '')}" placeholder="Search by number or customer…" style="flex:1;min-width:0"><button class="btn ghost">Search</button></form><button class="btn ghost" id="invcsv" type="button">:ic-download: CSV</button></div>
    ${rows.length ? `<table id="invtable"><tr><th>Number</th><th>Customer</th><th>Issued</th><th>Due</th><th>Total</th><th>Balance</th><th>Status</th></tr>${rows.map((i) => { const e = invEff(i); return `<tr data-csv='${esc(JSON.stringify([i.number, i.customer_name, i.issue_date, i.due_date, (i.total_cents / 100).toFixed(2), (invBal(i) / 100).toFixed(2), e]))}'><td><a href="#/admin/invoices/${i.id}"><b>${esc(i.number)}</b></a></td><td>${esc(i.customer_name)}</td><td>${esc(i.issue_date)}</td><td>${esc(i.due_date)}</td><td>${money(i.total_cents)}</td><td>${money(invBal(i))}</td><td><span class="status ${e === 'overdue' ? 'cancelled' : e}">${e}</span></td></tr>`; }).join('')}</table>` : '<p class="muted">No invoices match. Create your first invoice with “New invoice”.</p>'}`;
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
  if (sub === 'quotes') {
    const qs = (await sb.from('quotes').select('*').order('id', { ascending: false })).data;
    return `<h1>Quote requests</h1>${qs.length ? qs.map((x) => `<aside style="margin:10px 0"><b>${esc(x.name)}</b> · <a href="mailto:${esc(x.email)}">${esc(x.email)}</a> ${esc(x.phone)} · <span class="muted">${dateOf(x.created_at)}</span><p style="white-space:pre-wrap">${esc(x.message)}</p></aside>`).join('') : '<p>No requests yet.</p>'}`;
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
    const packs = id === 'new' ? [] : (await sb.from('product_packs').select('*').eq('product_id', id).order('units')).data || [];
    const locsAll = (await sb.from('locations').select('id,name,active').order('is_default', { ascending: false }).order('name')).data || [];
    const invRows = id === 'new' ? [] : (await sb.from('inventory').select('*').eq('product_id', id)).data || [];
    const stockFields = `<fieldset class="choices"><legend>Stock by location</legend>${locsAll.map((l) => { const q0 = invRows.find((r) => r.location_id === l.id)?.qty ?? 0; return `<label>${esc(l.name)}${l.active ? '' : ' (inactive)'}<input type="number" min="0" name="inv_${l.id}" data-orig="${q0}" value="${q0}"></label>`; }).join('')}<small class="muted">Total stock is the sum across locations. Move stock between locations on the <a href="#/admin/inventory">Inventory</a> page.</small></fieldset>`;
    const t = (n, l, x = '') => `<label>${l}<input name="${n}" value="${esc(p[n] ?? '')}" ${x}></label>`;
    return `<h1>${p.id ? 'Edit product' : 'New product'}</h1><form id="pf" class="stack narrow" data-id="${p.id || ''}">${t('name', 'Name', 'required')}${t('category', 'Category', 'required')}
    <label>Description<textarea name="description" rows="5">${esc(p.description)}</textarea></label>
    <div class="two2"><label>Price<input name="price" type="number" step="0.01" min="0" required value="${p.price_cents != null ? (p.price_cents / 100).toFixed(2) : ''}"></label><label>Original price <small class="muted">shows a sale badge</small><input name="compare_at" type="number" step="0.01" min="0" value="${p.compare_at_cents ? (p.compare_at_cents / 100).toFixed(2) : ''}" placeholder="optional"></label></div>
    ${t('unit', 'Unit (e.g. bundle, roll)', 'required')}${t('r_value', 'R-value')}
    <div class="two2"><label>Unit cost ($) <small class="muted">what you pay</small><input name="cost" type="number" step="0.01" min="0" value="${((p.cost_cents || 0) / 100).toFixed(2)}"></label><label>Reorder when stock ≤<input name="reorder_point" type="number" min="0" value="${p.reorder_point ?? 10}"></label></div>
    <fieldset class="cmpset" id="packbox"><legend>Bundles &amp; pack prices</legend><p class="muted" style="margin:0">Sell by the ${esc(p.unit || 'unit')} (e.g. bag) and give a lower price per ${esc(p.unit || 'unit')} when customers buy a bundle. Stock is still counted in ${esc(p.unit || 'unit')}s.</p>
      <div id="packrows">${packs.map((k, i) => packRow(k, i, p)).join('')}</div><button type="button" class="btn ghost" id="addpack">+ Add a bundle size</button></fieldset>
    <label>Usual reorder quantity<input name="reorder_qty" type="number" min="0" value="${p.reorder_qty ?? 0}"></label>${stockFields}
    ${p.image_url ? `<img src="${esc(safeUrl(p.image_url))}" alt="" style="max-width:160px;border-radius:10px">` : ''}
    <label>Photo (JPG, PNG, WebP, up to 5 MB)<input type="file" name="image" accept="image/jpeg,image/png,image/webp,image/gif"></label>
    <input type="hidden" name="image_url" value="${esc(p.image_url || '')}">
    ${extras.length ? `<div class="extras">${extras.map((x) => `<figure><img src="${esc(x.url)}" alt=""><button type="button" class="link delimg" data-id="${x.id}" style="color:var(--err)">Remove</button></figure>`).join('')}</div>` : ''}
    <label>More photos for the gallery (optional, you can pick several)<input type="file" name="extras" accept="image/jpeg,image/png,image/webp,image/gif" multiple></label><label>Photo description (alt text) <small class="muted">for accessibility and image search</small><input name="image_alt" maxlength="200" value="${esc(p.image_alt || '')}" placeholder="e.g. Roll of R-13 fiberglass batt insulation"></label>${seoFields(p, p.name, '/product/' + (p.slug || 'your-product') + '/')}<label class="check"><input type="checkbox" name="active" ${p.id && !p.active ? '' : 'checked'}> Visible in store</label><button class="btn">Save</button></form>`;
  }
  if (sub === 'products') {
    const [psR, alR] = await Promise.all([sb.from('products').select('*').order('name'), sb.from('stock_alerts').select('product_id')]);
    const ps = psR.data || [], waiting = {}; (alR.data || []).forEach((a) => (waiting[a.product_id] = (waiting[a.product_id] || 0) + 1));
    const cats = [...new Set(ps.map((x) => x.category))].sort();
    return `<div class="sechead"><h1 style="margin:0">Products</h1><div class="row"><button class="btn ghost" id="prodcsv" type="button">:ic-download: Export CSV</button><a class="btn" href="#/admin/products/new">+ New product</a></div></div>
    <div class="toolbar"><input id="prodq" type="search" placeholder="Search products…" aria-label="Search products" style="max-width:280px"><select id="prodcat" aria-label="Category"><option value="">All categories</option>${cats.map((c) => `<option>${esc(c)}</option>`).join('')}</select>
    <select id="prodview" aria-label="Show"><option value="">All</option><option value="low">Low or out of stock</option><option value="sale">On sale</option><option value="hidden">Hidden</option></select><span class="muted grow" id="prodcount"></span></div>
    <table id="prodtable"><tr><th>Name</th><th>Category</th><th>Price</th><th>Stock</th><th>Waiting</th><th>Status</th></tr>
    ${ps.map((p) => `<tr data-name="${esc(p.name.toLowerCase())}" data-cat="${esc(p.category)}" data-low="${p.stock <= (p.reorder_point ?? 10) ? 1 : ''}" data-sale="${onSale(p) ? 1 : ''}" data-hidden="${p.active ? '' : 1}" data-csv='${esc(JSON.stringify([p.name, p.category, (p.price_cents / 100).toFixed(2), ((p.cost_cents || 0) / 100).toFixed(2), p.stock, p.unit, p.active ? 'live' : 'hidden']))}'><td><a href="#/admin/products/${p.id}">${esc(p.name)}</a></td><td>${esc(p.category)}</td><td>${priceHtml(p)}</td><td class="${p.stock === 0 ? 'down' : ''}">${p.stock}</td><td>${waiting[p.id] ? `<span class="status pending">${waiting[p.id]}</span>` : ''}</td><td>${p.active ? 'Live' : 'Hidden'}</td></tr>`).join('')}</table>`;
  }
  // ---- dashboard ----
  const days = [7, 30, 90].includes(Number(q.get('days'))) ? Number(q.get('days')) : 30, now = Date.now(), cutCur = now - days * 864e5;
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
    [':ic-clipboard:', quoteRes.count || 0, 'quote requests this week', '#/admin/quotes', 'customers.view'], [':ic-card:', overdue.length, 'overdue invoices', '#/admin/invoices', 'invoices.view']].filter((a) => can(a[4]));
  const links = [[':ic-receipt:', 'Orders', '#/admin/orders'], [':ic-store:', 'Products', '#/admin/products'], [':ic-package:', 'Inventory', '#/admin/inventory'], [':ic-map-pin:', 'Locations', '#/admin/locations'], [':ic-trending-up:', 'Sales', '#/admin/sales'], [':ic-store:', 'Point of sale', '#/admin/pos'],
    [':ic-receipt:', 'Invoices', '#/admin/invoices'], [':ic-edit:', 'Estimates', '#/admin/estimates'], [':ic-book:', 'Statements', '#/admin/statements'], [':ic-wallet:', 'Expenses', '#/admin/expenses'], [':ic-chart:', 'Profit & loss', '#/admin/profit'], [':ic-truck:', 'Purchasing', '#/admin/purchasing'], [':ic-briefcase:', 'Suppliers', '#/admin/suppliers'], [':ic-shield:', 'Team & roles', '#/admin/team'], [':ic-clock:', 'Activity log', '#/admin/activity'],
    [':ic-users:', 'Customers', '#/admin/customers'], [':ic-chart:', 'SEO', '#/admin/seo'], [':ic-chat:', 'Messages', '#/messages'], [':ic-edit:', 'Forms', '#/admin/forms'], [':ic-file:', 'Pages', '#/admin/pages'], [':ic-dollar:', 'Price compare', '#/admin/compare'], [':ic-tag:', 'Discount codes', '#/admin/codes'], [':ic-settings:', 'Settings', '#/admin/settings'], [':ic-clipboard:', 'Quotes', '#/admin/quotes']];
  const linkOk = ([, , h]) => { const sec = h.split('/')[2]; return h.startsWith('#/messages') ? can('messages') : !SECTION_PERM[sec] || can(SECTION_PERM[sec]); };
  const groups = [['Sell', ['Orders', 'Point of sale', 'Products', 'Inventory', 'Locations', 'Discount codes', 'Price compare']], ['Money', ['Invoices', 'Estimates', 'Statements', 'Expenses', 'Profit & loss', 'Sales']], ['Customers & content', ['Customers', 'Messages', 'Forms', 'Pages', 'Quotes', 'SEO']], ['Business', ['Purchasing', 'Suppliers', 'Team & roles', 'Activity log', 'Settings']]];
  const linkBy = Object.fromEntries(links.map((l) => [l[1], l])), manage = groups.map(([g, names]) => [g, names.map((n) => linkBy[n]).filter(Boolean).filter(linkOk)]).filter(([, ls]) => ls.length);
  const card = (title, body, action = '') => `<section class="cs dcard"><div class="sechead"><h3 style="margin:0">${title}</h3>${action}</div>${body}</section>`;
  const recent = (recentRes.data || []).slice(0, 8);
  return `<div class="dashhead"><div><h1 style="margin:0">Good ${hr < 12 ? 'morning' : hr < 18 ? 'afternoon' : 'evening'}${first ? ', ' + esc(first) : ''}</h1><p class="muted" style="margin:2px 0 0">${new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })} · ${money(todayRev)} sold today</p></div>
    <div class="row"><button type="button" class="btn ghost openpalette" aria-label="Quick search">:ic-search: Search <kbd>Ctrl K</kbd></button>${can(SECTION_PERM.settings) ? `<button type="button" class="btn ghost shoptoggle" id="shoptoggle">${shopClosed() ? ':ic-store: Reopen shop' : ':ic-lock: Close shop'}</button>` : ''}<a class="btn" href="#/admin/pos">:ic-store: In-store sale</a><a class="btn ghost" href="#/admin/products/new">+ Product</a></div></div>
  ${attn.length ? `<div class="attn">${attn.map(([i, n, l, h]) => `<a class="attnc ${n ? 'on' : ''}" href="${h}"><span>${i}</span><b>${n}</b><small>${l}</small></a>`).join('')}</div>` : ''}
  ${rep ? `<div class="sechead dsec"><h2 style="margin:0">Performance</h2><div class="seg">${[7, 30, 90].map((d) => `<a class="${d === days ? 'on' : ''}" href="#/admin?days=${d}">${d} days</a>`).join('')}</div></div>
  <div class="kpis">${kpi('Revenue', money(revCur), delta(revCur, revPrev))}${kpi('Orders', cur.length, delta(cur.length, prev.length))}${kpi('Average order', money(cur.length ? Math.round(revCur / cur.length) : 0), delta(cur.length ? revCur / cur.length : 0, prev.length ? revPrev / prev.length : 0))}${kpi('New customers', custCur, delta(custCur, custPrev))}</div>` : ''}
  <div class="dgrid">
    <div class="dmain">${rep ? `${card('Revenue', barChart(bucketize(cur, days)), `<small class="muted">last ${days} days</small>`)}
      <div class="dpair">${card('By location', locRows.length ? locRows.map(([k, v]) => `<div class="locbar"><span>${esc(lname[k] || 'Unassigned')}</span><div class="progress"><i style="width:${v / maxLoc * 100}%"></i></div><b>${money(v)}</b></div>`).join('') : '<p class="muted" style="margin:0">No sales in this period.</p>')}
        ${card('Top products', topRows.length ? `<ul class="plain">${topRows.map(([n, v], i) => `<li><span><span class="rank">${i + 1}</span>${esc(n)}</span><span><b>${money(v.r)}</b> <small class="muted">· ${v.u} sold</small></span></li>`).join('')}</ul>` : '<p class="muted" style="margin:0">No sales in this period.</p>')}</div>` : ''}</div>
    <div class="dside">${can('orders.view') ? card('Recent orders', recent.length ? `<div class="olist2">${recent.map((o) => `<a class="orow" href="#/admin/orders/${o.id}"><span class="oid"><b>#${o.id}</b></span><span class="oname"><span class="nm">${esc(o.name)}${o.source === 'in_store' ? ' :ic-store:' : ''}</span><small class="muted">${ago(o.created_at)}</small></span><span class="status ${esc(o.status)}">${esc(o.status)}</span><b class="ototal">${money(o.total_cents)}</b></a>`).join('')}</div>` : '<p class="muted" style="margin:0">No orders yet.</p>', '<a href="#/admin/orders" style="font-size:.9rem">View all →</a>') : ''}
      ${can('inventory.view') ? card('Low stock', (lowRes.data || []).length ? `<ul class="plain">${lowRes.data.map((x) => `<li><a href="#/admin/products/${x.id}">${esc(x.name)}</a><b class="${x.stock === 0 ? 'down' : ''}">${x.stock === 0 ? 'Out of stock' : x.stock + ' left'}</b></li>`).join('')}</ul>` : '<p class="muted" style="margin:0">Everything is well stocked.</p>', '<a href="#/admin/inventory" style="font-size:.9rem">Inventory →</a>') : ''}</div></div>
  <h2 class="dsec">Manage</h2><div class="mgroups">${manage.map(([g, ls]) => `<div class="mgroup"><h4>${g}</h4><div class="qlinks">${ls.map(([i, l, h]) => `<a href="${h}"><span>${i}</span>${l}</a>`).join('')}</div></div>`).join('')}</div>`;
};
pages.admin.after = ([sub, id, extra], q = new URLSearchParams()) => {
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
    const filt = () => { const t = document.getElementById('prodq').value.toLowerCase().trim(), c = document.getElementById('prodcat').value, v = document.getElementById('prodview').value; let n = 0;
      rows().forEach((r) => { const ok = (!t || r.dataset.name.includes(t)) && (!c || r.dataset.cat === c) && (!v || (v === 'low' ? r.dataset.low : v === 'sale' ? r.dataset.sale : r.dataset.hidden)); r.hidden = !ok; if (ok) n++; });
      document.getElementById('prodcount').textContent = `${n} product${n === 1 ? '' : 's'}`; };
    ['prodq', 'prodcat', 'prodview'].forEach((i) => document.getElementById(i).addEventListener('input', filt)); filt();
    document.getElementById('prodcsv').addEventListener('click', () => download('products.csv', [['Name', 'Category', 'Price', 'Cost', 'Stock', 'Unit', 'Status'], ...rows().filter((r) => !r.hidden).map((r) => JSON.parse(r.dataset.csv))]));
  }
  document.getElementById('addpack')?.addEventListener('click', () => { const box = document.getElementById('packrows'); box.insertAdjacentHTML('beforeend', packRow({}, box.children.length, { unit: document.querySelector('[name=unit]')?.value || 'unit', price_cents: Math.round((parseFloat(document.querySelector('[name=price]')?.value) || 0) * 100) })); });
  document.getElementById('packbox')?.addEventListener('click', (e) => e.target.closest('.rmpack')?.closest('.packedit').remove());
  document.getElementById('seoform')?.addEventListener('submit', async (e) => {
    e.preventDefault(); const f = Object.fromEntries(new FormData(e.target));
    const value = { site_title: f.site_title.trim(), home_title: f.home_title.trim(), description: f.description.trim(), og_image: safeUrl(f.og_image.trim()), site_url: f.site_url.trim().replace(/\/+$/, ''), noindex: f.noindex === 'on' };
    const { error } = await sb.from('site_settings').upsert({ key: 'seo', value, updated_at: new Date().toISOString() }); if (error) return fail(error);
    SEO = value; flash('SEO settings saved.'); route();
  });
  wireSeoBox(document, sub === 'pages' ? '#pg_title' : "[name=name]");
  document.getElementById('shoptoggle')?.addEventListener('click', () => { if (shopClosed()) setShopClosed(false); else { const m = prompt('Message for customers (optional):', STORE.closed_message || ''); if (m !== null) setShopClosed(true, m.trim().slice(0, 300)); } });
  // team
  document.getElementById('teamsearch')?.addEventListener('submit', (e) => { e.preventDefault(); const v = new FormData(e.target).get('search').trim(); location.hash = '#/admin/team' + (v ? '?search=' + encodeURIComponent(v) : ''); });
  document.querySelectorAll('.rolesel').forEach((el) => el.addEventListener('change', async () => {
    const { error } = await sb.rpc('set_role', { uid: el.dataset.id, new_role: el.value }); if (error) fail(error); else flash('Role updated.'); route();
  }));
  // invoices (list + detail)
  document.getElementById('invsearch')?.addEventListener('submit', (e) => { e.preventDefault(); const n = new URLSearchParams(q); const v = new FormData(e.target).get('search').trim(); v ? n.set('search', v) : n.delete('search'); location.hash = '#/admin/invoices?' + n; });
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
    const value = { closed: f.closed === 'on', closed_message: (f.closed_message || '').trim().slice(0, 300), closed_until: f.closed_until || '', ship_flat_cents: cents(f.ship), free_over_cents: cents(f.free), tax_rate: Math.min(50, Math.max(0, parseFloat(f.tax_rate) || 0)), tax_label: (f.tax_label || 'Tax').trim().slice(0, 30),
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
    const run = () => { const t = (document.getElementById('invsearch').value || '').toLowerCase(), so = document.getElementById('invsort').value, key = { name: (r) => r.dataset.name, stock: (r) => Number(r.dataset.stock), cover: (r) => Number(r.dataset.cover), value: (r) => -Number(r.dataset.value) }[so];
      [...tb.querySelectorAll('tr[data-name]')].sort((a, b) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0)).forEach((r) => { tb.appendChild(r); r.hidden = !(r.dataset.name.includes(t) && (!st || r.dataset.st === st)); }); };
    document.getElementById('invsearch').addEventListener('input', run); document.getElementById('invsort').addEventListener('change', run);
    document.getElementById('invst').addEventListener('click', (e) => { const b = e.target.closest('[data-st]'); if (!b) return; st = b.dataset.st; document.querySelectorAll('#invst .chip').forEach((x) => x.classList.toggle('on', x === b)); run(); });
  }
  document.querySelectorAll('.invq').forEach((el) => el.addEventListener('change', async () => {
    const v = parseInt(el.value, 10); if (!(v >= 0)) { el.value = 0; return fail(new Error('Quantity must be 0 or more.')); }
    const { error } = await sb.rpc('set_inventory', { pid: Number(el.dataset.p), lid: Number(el.dataset.l), new_qty: v, note: 'Manual adjustment' }); if (error) return fail(error);
    const row = el.closest('tr'), tot = [...row.querySelectorAll('.invq')].reduce((a, x) => a + (parseInt(x.value, 10) || 0), 0), cell = row.querySelector('.invtot'); cell.textContent = tot; cell.classList.toggle('lowtot', tot <= 10); flash('Stock updated.');
  }));
  document.getElementById('tf')?.addEventListener('submit', async (e) => {
    e.preventDefault(); const f = Object.fromEntries(new FormData(e.target));
    const { error } = await sb.rpc('transfer_inventory', { pid: Number(f.pid), from_loc: Number(f.from), to_loc: Number(f.to), amount: parseInt(f.amount, 10), note: f.note || '' });
    error ? fail(error) : (flash('Stock transferred.'), route());
  });
  document.getElementById('invcsv')?.addEventListener('click', () => {
    const heads = [...document.querySelectorAll('#invtable tr:first-child th')].map((x) => x.textContent);
    const rows = [...document.querySelectorAll('#invtable tr[data-name]')].map((r) => [r.querySelector('b').textContent, ...[...r.querySelectorAll('.invq')].map((i) => i.value), r.querySelector('.invtot').textContent, r.dataset.st, (Number(r.dataset.value) / 100).toFixed(2), r.dataset.cover === '9999' ? '' : r.dataset.cover]);
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
    document.getElementById('pg_img')?.addEventListener('change', async (e) => {
      const file = e.target.files[0]; if (!file) return; if (file.size > 5 * 1024 * 1024) return fail(new Error('Image must be under 5 MB.'));
      const path = `pages/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.]+/g, '-').slice(-60)}`;
      const up = await sb.storage.from('product-images').upload(path, file, { contentType: file.type }); if (up.error) return fail(up.error);
      insert(`![${file.name.replace(/\.[^.]+$/, '')}](${sb.storage.from('product-images').getPublicUrl(path).data.publicUrl})`); e.target.value = '';
    });
    document.getElementById('pg_save')?.addEventListener('click', async () => {
      const title = document.getElementById('pg_title').value.trim(); if (!title) return fail(new Error('Give the page a title.'));
      const row = { title, slug: slugify(document.getElementById('pg_slug').value || title) || 'page-' + Date.now(), body: body.value, published: document.getElementById('pg_pub').checked,
        show_in_nav: document.getElementById('pg_nav').checked, show_in_footer: document.getElementById('pg_foot').checked, sort: parseInt(document.getElementById('pg_sort').value, 10) || 0, seo_title: document.querySelector('[name=seo_title]').value.trim(), seo_description: document.querySelector('[name=seo_description]').value.trim(), updated_at: new Date().toISOString() };
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
    const file = f.image; delete f.image; delete f.extras;
    const extraFiles = new FormData(e.target).getAll('extras').filter((x) => x && x.size);
    if (file && file.size) {
      if (file.size > 5 * 1024 * 1024) return fail(new Error('Photo must be under 5 MB.'));
      const path = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.]+/g, '-').slice(-60)}`;
      const up = await sb.storage.from('product-images').upload(path, file, { contentType: file.type });
      if (up.error) return fail(up.error);
      f.image_url = sb.storage.from('product-images').getPublicUrl(path).data.publicUrl;
    }
    const row = { name: f.name.trim(), category: f.category.trim(), description: f.description, price_cents: Math.round(parseFloat(f.price) * 100), unit: f.unit.trim(),
      r_value: f.r_value.trim(), image_url: safeUrl(f.image_url.trim()), active: !!f.active, cost_cents: Math.round((parseFloat(f.cost) || 0) * 100), reorder_point: parseInt(f.reorder_point, 10) || 0, reorder_qty: parseInt(f.reorder_qty, 10) || 0, compare_at_cents: Math.round((parseFloat(f.compare_at) || 0) * 100), seo_title: (f.seo_title || '').trim(), seo_description: (f.seo_description || '').trim(), image_alt: (f.image_alt || '').trim() };
    if (!pid) row.slug = (row.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'product') + '-' + Math.floor(Math.random() * 1000);
    const res = pid ? await sb.from('products').update(row).eq('id', pid).select('id').single() : await sb.from('products').insert(row).select('id').single();
    if (res.error) return fail(res.error);
    { const rows = [...e.target.querySelectorAll('.packedit')].map((r) => ({ label: r.querySelector('[data-f=label]').value.trim(), units: parseInt(r.querySelector('[data-f=units]').value, 10), unit_price_cents: Math.round((parseFloat(r.querySelector('[data-f=price]').value) || 0) * 100) })).filter((r) => r.label && r.units >= 2);
      if (rows.length) { const bad = rows.find((r) => r.unit_price_cents >= row.price_cents); if (bad) flash(`"${bad.label}" costs the same or more per unit than the single price, so it will not be used.`, 'error'); }
      const del = await sb.from('product_packs').delete().eq('product_id', res.data.id); if (del.error) return fail(del.error);
      if (rows.length) { const ins = await sb.from('product_packs').insert(rows.map((r) => ({ ...r, product_id: res.data.id }))); if (ins.error) return fail(ins.error.code === '23505' ? new Error('Two bundle sizes have the same number of units.') : ins.error); } }
    for (const el of form_inv(e.target)) { // stock per location
      if (el.value === el.dataset.orig && pid) continue; const v = parseInt(el.value, 10); if (!(v >= 0) || (!pid && v === 0)) continue;
      const r = await sb.rpc('set_inventory', { pid: res.data.id, lid: Number(el.name.slice(4)), new_qty: v, note: pid ? 'Set from product editor' : 'Initial stock' }); if (r.error) return fail(r.error);
    }
    for (const [n, xf] of extraFiles.entries()) {
      if (xf.size > 5 * 1024 * 1024) { flash('A gallery photo was over 5 MB and was skipped.', 'error'); continue; }
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
async function loadInbox() {
  const convs = (await sb.from('conversations').select('*').order('last_message_at', { ascending: false }).limit(200)).data || [];
  const ids = convs.map((c) => c.id), last = {}, unreadBy = {};
  if (ids.length) ((await sb.from('messages').select('conversation_id,body,sender_id,created_at,read_at,internal,attachments,deleted_at').in('conversation_id', ids).order('id', { ascending: false }).limit(800)).data || []).forEach((m) => {
    if (!last[m.conversation_id]) last[m.conversation_id] = m;
    const c = convs.find((x) => x.id === m.conversation_id); if (c && !m.internal && m.sender_id === c.customer_id && !m.read_at && !m.deleted_at) unreadBy[c.id] = (unreadBy[c.id] || 0) + 1;
  });
  const names = {}; if (convs.length) ((await sb.from('profiles').select('id,name,email').in('id', [...new Set(convs.map((c) => c.customer_id))])).data || []).forEach((u) => (names[u.id] = u.name || u.email));
  return { convs, last, unreadBy, names };
}
const previewOf = (m, c) => (!m ? 'No messages yet' : m.deleted_at ? 'Message unsent' : (m.internal ? 'Note: ' : m.sender_id !== c.customer_id ? 'You: ' : '') + (m.body ? m.body.slice(0, 70) : (m.attachments || []).length ? 'Sent an attachment' : 'Shared an order'));
const listHtml = (inbox, selected, filter = '', mode = '') => {
  const f = filter.toLowerCase(), rows = inbox.convs.filter((c) => (!f || (inbox.names[c.customer_id] || '').toLowerCase().includes(f) || (inbox.last[c.id]?.body || '').toLowerCase().includes(f)) && (mode === 'unread' ? inbox.unreadBy[c.id] : mode === 'closed' ? c.closed : true));
  return rows.length ? rows.map((c) => { const nm = inbox.names[c.customer_id] || 'Customer', lm = inbox.last[c.id], un = inbox.unreadBy[c.id] || 0;
    return `<a class="dmrow ${String(selected) === String(c.id) ? 'on' : ''} ${un ? 'unread' : ''}" href="#/messages/${c.id}">${avatar(nm)}<div class="dmtxt"><div class="row" style="justify-content:space-between;flex-wrap:nowrap"><b>${esc(nm)}</b><small class="muted">${lm ? ago(lm.created_at) : ''}</small></div>
    <span class="muted prev">${esc(previewOf(lm, c))}</span></div>${un ? `<span class="dot">${un}</span>` : c.closed ? '<small class="muted">closed</small>' : ''}</a>`; }).join('')
    : '<p class="muted" style="padding:16px">No conversations found.</p>';
};
pages.messages = async ([id], q) => {
  if (!session) { location.hash = '#/login'; return ''; }
  const isStaff = can('messages');
  if (id === 'new') { // find or create the DM with a customer, then open it
    const to = isStaff ? q.get('to') : session.user.id; if (!to) { location.hash = '#/messages'; return ''; }
    let c = (await sb.from('conversations').select('id').eq('customer_id', to).order('id', { ascending: false }).limit(1).maybeSingle()).data;
    if (!c) { const r = await sb.from('conversations').insert({ customer_id: to, subject: 'Direct message' }).select('id').single(); if (r.error) throw r.error; c = r.data; }
    location.hash = `#/messages/${c.id}`; return '';
  }
  let inbox = null, conv = null, selected = id && /^\d+$/.test(id) ? id : null;
  if (isStaff) inbox = await loadInbox();
  else { const r = await sb.from('conversations').select('*').eq('customer_id', session.user.id).order('id', { ascending: false }).limit(1).maybeSingle(); conv = r.data; selected = conv?.id ?? 'solo'; }
  if (isStaff && selected) conv = (await sb.from('conversations').select('*').eq('id', selected).maybeSingle()).data;
  const msgs = conv ? (await sb.from('messages').select('*').eq('conversation_id', conv.id).order('id')).data || [] : [];
  const custId = isStaff ? conv?.customer_id : session.user.id;
  const myOrders = custId ? (await sb.from('orders').select('id,status,total_cents,created_at').eq('user_id', custId).order('id', { ascending: false }).limit(15)).data || [] : [];
  const replies = isStaff ? (await sb.from('canned_replies').select('*').order('title')).data || [] : [];
  const peerName = isStaff ? (inbox.names[conv?.customer_id] || 'Customer') : 'Store team';
  const firstUnread = msgs.find((m) => !m.internal && !m.deleted_at && !m.read_at && (isStaff ? m.sender_id === conv?.customer_id : m.sender_id !== conv?.customer_id))?.id || null;
  DM = { conv, msgs, isStaff, peerName, inbox, online: false, orders: {}, urls: {}, pending: [], pendingOrder: null, internal: false, firstUnread, myOrders, replies, filter: '' };
  myOrders.forEach((o) => (DM.orders[o.id] = o));
  const closedCust = !isStaff && conv?.closed;
  const chat = (isStaff && !conv) ? '<div class="empty-chat">:ic-chat:<p><b>Select a conversation</b></p><p class="muted">Pick a customer on the left, or start one from Admin → Customers.</p></div>'
    : `<header class="dmhead">${isStaff ? '<a class="backbtn" href="#/messages" aria-label="Back to conversations">←</a>' : ''}${avatar(peerName, isStaff ? '' : 'store')}<div style="min-width:0"><b>${esc(peerName)}</b><div class="dmstatus muted" id="dmstatus">${isStaff ? 'Customer' : 'Replies usually within a day'}</div></div>
      <span class="grow"></span>${isStaff ? `<button type="button" class="ibtn" id="ctxtoggle" aria-label="Customer details" title="Customer details">:ic-users:</button>${conv ? `<button type="button" class="btn ghost" id="closeconv" style="padding:6px 12px;min-height:0">${conv.closed ? 'Reopen' : 'Close'} conversation</button>` : ''}` : ''}</header>
    <div class="thread" id="thread"></div><div class="typing" id="typing" hidden>${esc(peerName)} is typing<span>.</span><span>.</span><span>.</span></div>
    ${closedCust ? '<p class="closednote">:ic-lock: This conversation was closed by the store team. Start a new one by contacting us from the <a href="#/quote">quote form</a>.</p>' : `<div class="composer2" id="composer2"><div class="pend" id="pend" hidden></div>
      <div class="ctools"><button type="button" class="ibtn" id="attachbtn" aria-label="Attach a file" title="Attach photos or files">:ic-paperclip:</button><input type="file" id="dmfile" accept="${CHAT_FILES}" multiple hidden>
        ${myOrders.length ? `<select id="orderpick" aria-label="Attach an order"><option value="">Attach an order…</option>${myOrders.map((o) => `<option value="${o.id}">Order #${o.id} · ${esc(o.status)} · ${money(o.total_cents)}</option>`).join('')}</select>` : ''}
        ${isStaff ? `<span class="grow"></span><div class="qrwrap"><button type="button" class="btn ghost qrbtn" id="qrbtn">:ic-chat: Quick replies</button><div class="qr" id="qr" hidden><div id="qrlist"></div><form id="qradd" class="stack"><b style="font-size:.85rem">Save a new quick reply</b><input name="title" placeholder="Title (e.g. Delivery times)" maxlength="60" required><textarea name="body" rows="2" placeholder="Message text" maxlength="2000" required></textarea><button class="btn ghost">Save quick reply</button></form></div></div>
        <label class="switch" title="Only your team can see internal notes"><input type="checkbox" id="dminternal"><span class="track"></span><span>Internal note</span></label>` : ''}</div>
      <form id="dmform" class="composer"><textarea name="body" rows="1" maxlength="5000" placeholder="Message ${esc(isStaff ? peerName : 'the store team')}…" aria-label="Message"></textarea><button class="send" aria-label="Send message">:ic-send:</button></form></div>`}`;
  return `<div class="dm ${isStaff ? '' : 'solo'} ${conv && isStaff ? 'has-chat' : ''} ${isStaff ? 'withctx' : ''}">${isStaff ? `<aside class="dmlist"><div class="dmlist-head"><b>Messages</b><input id="dmsearch" placeholder="Search customers or messages…" aria-label="Search"><div class="chips" style="margin:0"><button type="button" class="chip on" data-mode="">All</button><button type="button" class="chip" data-mode="unread">Unread</button><button type="button" class="chip" data-mode="closed">Closed</button></div></div><div id="dmrows">${listHtml(inbox, selected)}</div></aside>` : ''}<section class="dmchat">${chat}</section>${isStaff && conv ? '<aside class="dmctx" id="dmctx"><p class="muted" style="padding:16px">Loading customer…</p></aside>' : ''}</div>`;
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
  if (!DM) return;
  const $ = (i) => document.getElementById(i), listEl = $('dmrows'); let mode = '';
  const redrawList = () => { if (listEl) listEl.innerHTML = listHtml(DM.inbox, DM.conv?.id, $('dmsearch')?.value || '', mode); };
  $('dmsearch')?.addEventListener('input', redrawList);
  document.querySelectorAll('.dmlist-head [data-mode]').forEach((b) => b.addEventListener('click', () => { mode = b.dataset.mode; document.querySelectorAll('.dmlist-head [data-mode]').forEach((x) => x.classList.toggle('on', x === b)); redrawList(); }));
  if (DM.isStaff) threadChan.push(sb.channel('inbox').on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, async () => { DM.inbox = await loadInbox(); redrawList(); }).subscribe());
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
      for (const f of DM.pending) {
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
  const { data } = await sb.from('pages').select('id,slug,title,show_in_nav,show_in_footer,sort').eq('published', true).order('sort').order('title');
  sitePages = data || []; renderNav();
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
async function hydrateMd(root) {
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
  contact: ['Contact', '# Contact us\n\nWe would love to hear from you.\n\n- Phone: (555) 123-4567\n- Email: hello@example.com\n- Hours: Mon–Fri, 8am–5pm\n\n{{button: Request a quote | #/quote}}'],
};
const wordStats = (t) => { const w = (t.trim().match(/\S+/g) || []).length; return `${w} word${w === 1 ? '' : 's'} · ${Math.max(1, Math.round(w / 200))} min read`; };
pages.page = async ([slug]) => {
  const { data: pg } = await sb.from('pages').select('*').eq('slug', slug).maybeSingle();
  if (!pg) return '<h1>Page not found</h1><p><a href="#/">Back home</a></p>';
  setSeo({ title: pg.seo_title || pg.title, description: pg.seo_description || clip(pg.body.replace(/[#*>\[\]()`_{}|!-]+/g, ' '), 200), path: '/page/' + pg.slug + '/', noindex: !pg.published });
  return `<article class="prose">${!pg.published ? '<p class="flash error" style="margin-top:0">Draft — only admins can see this page.</p>' : ''}${profile?.is_admin ? `<p style="text-align:right"><a class="btn ghost" href="#/admin/pages/${pg.id}">:ic-edit: Edit page</a></p>` : ''}${md(pg.body)}</article>`;
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
let INVPUB = null, ESTPUB = null, INVSOLD = {};
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

const editorPage = async (kind, id) => {
  const tbl = { invoice: 'invoices', estimate: 'estimates', recurring: 'recurring_invoices' }[kind], isNew = !id || id === 'new';
  const ex = isNew ? null : (await sb.from(tbl).select('*').eq('id', id).single()).data;
  const toLine = (x) => ({ description: x.description, qty: Number(x.qty), unit_price_cents: x.unit_price_cents, taxable: x.taxable, product_id: x.product_id || null });
  let exItems = []; if (ex) exItems = kind === 'recurring' ? (ex.items || []).map(toLine) : ((await sb.from(kind === 'invoice' ? 'invoice_items' : 'estimate_items').select('*').eq(kind === 'invoice' ? 'invoice_id' : 'estimate_id', id).order('sort')).data || []).map(toLine);
  const back = kind === 'invoice' ? '#/admin/invoices' : kind === 'estimate' ? '#/admin/estimates' : '#/admin/invoices/recurring', word = { invoice: 'invoice', estimate: 'estimate', recurring: 'recurring invoice' }[kind];
  if (ex && ((kind === 'invoice' && ['paid', 'void'].includes(ex.status)) || (kind === 'estimate' && !['draft', 'sent'].includes(ex.status)))) return `<h1>${esc(ex.number)}</h1><p class="flash error" style="margin-top:0">A ${ex.status} ${word} can't be edited.</p><p><a class="btn ghost" href="${back}/${ex.id}">← Back</a></p>`;
  const [custs, prods] = await Promise.all([sb.from('profiles').select('id,name,email').eq('role', 'customer').order('name').limit(300), sb.from('products').select('id,name,price_cents').eq('active', true).order('name')]);
  INV = { kind, id: ex?.id || null, customer_id: ex?.customer_id || '', customer_name: ex?.customer_name || '', customer_email: ex?.customer_email || '', customer_phone: ex?.customer_phone || '', customer_address: ex?.customer_address || '',
    issue_date: ex?.issue_date || todayStr(), due_date: kind === 'estimate' ? (ex?.expires_on || addDays(todayStr(), 30)) : (ex?.due_date || addDays(todayStr(), Number(STORE.invoice_due_days) || 14)), notes: ex?.notes || '', terms: ex ? ex.terms : (STORE.invoice_terms || ''),
    discount_cents: ex?.discount_cents || 0, tax_rate: ex ? Number(ex.tax_rate) : (Number(STORE.tax_rate) || 0), tax_label: ex?.tax_label || STORE.tax_label || 'Tax',
    items: ex ? exItems : [{ description: '', qty: 1, unit_price_cents: 0, taxable: true, product_id: null }], custs: custs.data || [], prods: prods.data || [] };
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
    <div class="row"><button type="button" class="btn ghost" id="iv_add">+ Add line</button><select id="iv_prod" aria-label="Add a product"><option value="">+ Add a product…</option>${INV.prods.map((x) => `<option value="${x.id}">${esc(x.name)} — ${money(x.price_cents)}</option>`).join('')}</select></div>
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
function setSeo({ title, description, image, type = 'website', path = '', jsonld, noindex } = {}) {
  const site = seoSite(), full = title ? `${title} · ${site}` : site; document.title = full;
  const desc = clip(description || SEO.description || '', 300), url = path ? seoBase() + path : '';
  setMeta('name', 'description', desc);
  setMeta('name', 'robots', noindex || SEO.noindex ? 'noindex, nofollow' : '');
  setMeta('property', 'og:title', title || site); setMeta('property', 'og:description', desc); setMeta('property', 'og:type', type);
  setMeta('property', 'og:site_name', site); setMeta('property', 'og:url', url);
  const img = safeUrl(image || SEO.og_image || ''); setMeta('property', 'og:image', img);
  setMeta('name', 'twitter:card', img ? 'summary_large_image' : 'summary'); setMeta('name', 'twitter:title', title || site); setMeta('name', 'twitter:description', desc);
  let link = document.head.querySelector('link[rel="canonical"]');
  if (url) { if (!link) { link = document.createElement('link'); link.rel = 'canonical'; document.head.appendChild(link); } link.href = url; } else link?.remove();
  document.head.querySelector('script#ldjson')?.remove();
  if (jsonld) { const sc = document.createElement('script'); sc.type = 'application/ld+json'; sc.id = 'ldjson'; sc.textContent = JSON.stringify(jsonld).replace(/</g, '\\u003c'); document.head.appendChild(sc); }
}
const serp = (title, desc, path) => `<div class="serp" aria-label="Search result preview"><div class="serpurl">${esc(seoBase().replace(/^https?:\/\//, ''))}${esc(path ? ' › ' + path.replace(/^\//, '').split('/').join(' › ') : '')}</div><div class="serptitle">${esc(clip(title, 60)) || 'Page title'}</div><div class="serpdesc">${esc(clip(desc, 160)) || 'Add a description — this is the text people see under your link in Google.'}</div></div>`;
const lenHint = (n, lo, hi) => `<span class="lenhint ${n === 0 ? '' : n < lo || n > hi ? 'warn' : 'good'}">${n} chars · aim for ${lo}–${hi}</span>`;
function seoFields(o, fallbackTitle, path) {
  return `<fieldset class="cmpset seobox" data-path="${esc(path)}"><legend>:ic-search: Search engines (SEO)</legend>
    <label>Page title <small class="muted">defaults to “${esc(fallbackTitle || '')}”</small><input name="seo_title" maxlength="120" value="${esc(o.seo_title || '')}" data-seo="title">${lenHint((o.seo_title || fallbackTitle || '').length, 30, 60)}</label>
    <label>Meta description<textarea name="seo_description" rows="3" maxlength="320" data-seo="desc">${esc(o.seo_description || '')}</textarea>${lenHint((o.seo_description || '').length, 70, 160)}</label>
    <div class="serpwrap" data-seo="preview">${serp(o.seo_title || fallbackTitle, o.seo_description, path)}</div></fieldset>`;
}
function wireSeoBox(root, titleSel) {
  const box = root.querySelector?.('.seobox'); if (!box) return;
  const t = box.querySelector('[data-seo=title]'), d = box.querySelector('[data-seo=desc]'), pv = box.querySelector('[data-seo=preview]'), path = box.dataset.path;
  const upd = () => { const ft = titleSel ? (document.querySelector(titleSel)?.value || '') : '', tt = t.value || ft;
    pv.innerHTML = serp(tt, d.value, path);
    const hints = box.querySelectorAll('.lenhint'), set = (el, n, lo, hi) => { el.textContent = `${n} chars · aim for ${lo}–${hi}`; el.className = 'lenhint ' + (n === 0 ? '' : n < lo || n > hi ? 'warn' : 'good'); };
    set(hints[0], tt.length, 30, 60); set(hints[1], d.value.length, 70, 160); };
  [t, d].forEach((x) => x.addEventListener('input', upd)); if (titleSel) document.querySelector(titleSel)?.addEventListener('input', upd);
}
const productLd = (p, pics) => ({ '@context': 'https://schema.org', '@type': 'Product', name: p.name, description: clip(p.description, 500), image: pics.slice(0, 4), category: p.category, sku: 'P' + p.id,
  offers: { '@type': 'Offer', priceCurrency: window.GOMI.CURRENCY || 'USD', price: (p.price_cents / 100).toFixed(2), availability: p.stock > 0 ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock', url: seoBase() + '/product/' + p.slug + '/' } });

async function route() {
  threadChan.forEach((c) => sb.removeChannel(c)); threadChan = [];
  let h = location.hash.slice(1); if (!h.startsWith('/')) h = '/'; // e.g. #access_token=… after email confirmation
  const [path, qs] = h.split('?'); const q = new URLSearchParams(qs || '');
  const [name = 'home', ...args] = path.split('/').filter(Boolean); const page = pages[name === '' ? 'home' : name];
  const TITLES = { shop: 'Shop', cart: 'Cart', checkout: 'Checkout', account: 'My account', messages: 'Messages', notifications: 'Notifications', login: 'Log in', register: 'Sign up', quote: 'Request a quote', wishlist: 'Wishlist', track: 'Track an order', admin: 'Admin', forgot: 'Reset password', reset: 'New password' };
  const PRIVATE = ['cart', 'checkout', 'account', 'messages', 'notifications', 'login', 'register', 'admin', 'invoice', 'estimate', 'reset', 'track', 'wishlist'];
  setSeo({ title: name === 'home' || name === '' ? (SEO.home_title || '') : TITLES[name] || '', description: '', noindex: PRIVATE.includes(name), path: name === 'shop' ? '/#/shop' : '' });
  if (!page) { $app.innerHTML = '<h1>Not found</h1>'; return; }
  try { $app.classList.remove('in'); $app.innerHTML = '<div class="skeleton"></div>'; $app.innerHTML = await page(args, q); setMenu(false);
    $app.querySelectorAll('table').forEach((t) => { if (!t.parentElement.classList.contains('tablewrap') && !t.closest('.invdoc, .tablewrap')) { const w = document.createElement('div'); w.className = 'tablewrap'; t.replaceWith(w); w.appendChild(t); }
      // label cells so tables can stack into cards on phones
      const heads = [...t.querySelectorAll('th')].map((x) => x.textContent);
      t.querySelectorAll('tr').forEach((tr) => [...tr.children].forEach((td, i) => { if (td.tagName === 'TD') td.dataset.label = heads[i] || ''; }));
    });
    void $app.offsetWidth; $app.classList.add('in'); addPdfButtons(); page.after?.(args, q); window.scrollTo(0, 0); } catch (e) { fail(e); $app.innerHTML = '<h1>Something went wrong</h1>'; }
}
window.addEventListener('hashchange', route);
sb.auth.onAuthStateChange((ev) => {
  if (ev === 'PASSWORD_RECOVERY') setTimeout(async () => { await loadSession(); location.hash = '#/reset'; route(); }, 0);
  else if (ev === 'SIGNED_IN' && /type=signup/.test(location.hash)) setTimeout(async () => { await loadSession(); flash('Email confirmed. Welcome!'); location.hash = '#/account'; }, 0);
  if (ev === 'SIGNED_OUT') { session = null; profile = null; unread = { all: 0, msg: 0 }; if (notifChan) { sb.removeChannel(notifChan); notifChan = null; } renderNav(); }
});
applyBranding();
document.getElementById('menubtn').innerHTML = ':ic-menu:';
Promise.allSettled([loadSiteTheme(), loadPages(), loadSession()]).then(route);
