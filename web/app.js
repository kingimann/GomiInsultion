const C = window.GOMI;
const sb = supabase.createClient(C.SUPABASE_URL, C.SUPABASE_ANON_KEY);
const $app = document.getElementById('app');
const STATUSES = ['pending', 'paid', 'shipped', 'delivered', 'cancelled'];
const FREE_SHIP = 50000, SHIP = 1500;

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
  const brand = document.querySelector('.brand'); if (brand) brand.textContent = '🏠 ' + name;
  const fb = document.querySelector('footer .foot b'); if (fb) fb.textContent = '🏠 ' + name;
  const text = typeof theme.announce === 'string' ? theme.announce.trim() : window.GOMI.ANNOUNCEMENT;
  let el = document.querySelector('.announce');
  if (text) { if (!el) { el = document.createElement('div'); el.className = 'announce'; document.body.prepend(el); } el.textContent = text; } else el?.remove();
}
window.matchMedia?.('(prefers-color-scheme: dark)').addEventListener?.('change', applyTheme);
applyTheme();
async function loadSiteTheme() {
  const { data } = await sb.from('site_settings').select('value').eq('key', 'theme').maybeSingle();
  if (data) { theme = data.value || {}; applyTheme(); }
}
async function saveSiteTheme() {
  if (!profile?.is_admin) return;
  const { error } = await sb.from('site_settings').upsert({ key: 'theme', value: theme, updated_at: new Date().toISOString() });
  error ? fail(error) : flash('Site style saved for all visitors.');
}
function buildStylePanel() {
  const el = document.getElementById('stylepanel'); if (!el) return;
  el.innerHTML = `<h3>🎨 Site style</h3><p class="muted" style="margin:-4px 0 10px;font-size:.85rem">Changes apply to every visitor (admins only).</p>
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
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = (c) => `${C.CURRENCY}${(c / 100).toFixed(2)}`;
const safeUrl = (u) => (/^(https?:\/\/|\/)/.test(u || '') ? u : '');
let session = null, profile = null;
let unread = { all: 0, msg: 0 }, notifChan = null, threadChan = [];
const getCart = () => { try { return JSON.parse(localStorage.getItem('cart') || '{}'); } catch { return {}; } };
const setCart = (c) => { localStorage.setItem('cart', JSON.stringify(c)); renderNav(); };
function flash(msg, type = 'ok') {
  const f = document.getElementById('flash'); f.textContent = msg; f.className = `flash ${type}`; f.hidden = false;
  clearTimeout(flash.t); flash.t = setTimeout(() => (f.hidden = true), 5000);
}
const img = (p, big) => (safeUrl(p.image_url) ? `<img class="${big ? 'big' : ''}" src="${esc(safeUrl(p.image_url))}" alt="${esc(p.name)}">` : `<div class="ph ${big ? 'big' : ''}">${esc(p.r_value || '🧱')}</div>`);
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
  return `<div class="compare"><h3>💲 Price comparison</h3><table><tr><th>Retailer</th><th>Price</th><th>Difference</th><th>Checked</th></tr><tr class="us"><td><b>${esc(theme.name || 'Gomi Insulation')}</b></td><td><b>${money(p.price_cents)}</b></td><td></td><td></td></tr>${rows}</table>
  <p class="muted" style="font-size:.8rem;margin:6px 0 0">Other retailers' prices were checked by us on the dates shown and may have changed. Sizes, brands and pack contents can differ, so compare the item listed. Retailer names belong to their owners; we are not affiliated with them.</p></div>`;
};
const getWish = () => { try { return JSON.parse(localStorage.getItem('wish') || '[]'); } catch { return []; } };
document.addEventListener('click', (e) => {
  const b = e.target.closest('.heart'); if (!b) return;
  const id = Number(b.dataset.id); let w = getWish();
  w = w.includes(id) ? w.filter((x) => x !== id) : [...w, id]; localStorage.setItem('wish', JSON.stringify(w));
  b.textContent = w.includes(id) ? '♥' : '♡'; b.style.color = w.includes(id) ? '#dc2626' : ''; renderNav(); if (location.hash.startsWith('#/wishlist')) route();
});
const card = (p) => `<article class="card">${p.stock <= 0 ? '<span class="badge">Sold out</span>' : p.stock <= 10 ? '<span class="badge warn">Low stock</span>' : ''}<button class="heart" data-id="${p.id}" aria-label="Save to wishlist" style="${getWish().includes(p.id) ? 'color:#dc2626' : ''}">${getWish().includes(p.id) ? '♥' : '♡'}</button><a href="#/product/${esc(p.slug)}">${img(p)}</a><div class="pad"><span class="tag">${esc(p.category)}</span>
  <h3><a href="#/product/${esc(p.slug)}">${esc(p.name)}</a></h3><p class="muted">${p.r_value ? esc(p.r_value) + ' · ' : ''}per ${esc(p.unit)}</p>${ratingLine(p)}${saveBadge(p)}<p class="price">${money(p.price_cents)}</p></div></article>`;
const getPromo = () => { try { return JSON.parse(localStorage.getItem('promo') || 'null'); } catch { return null; } };
const totals = (sub) => { const pr = getPromo(), disc = pr && sub ? Math.floor(sub * pr.percent / 100) : 0; const ship = !sub || sub - disc >= FREE_SHIP ? 0 : SHIP; return { sub, disc, code: disc ? pr.code : '', ship, total: sub - disc + ship }; };
const totalsHtml = (t) => `<dl class="totals"><dt>Subtotal</dt><dd>${money(t.sub)}</dd>${t.disc ? `<dt>Discount${t.code ? ' (' + esc(t.code) + ')' : ''}</dt><dd>−${money(t.disc)}</dd>` : ''}<dt>Shipping</dt><dd>${t.ship ? money(t.ship) : 'Free'}</dd><dt>Total</dt><dd><strong>${money(t.total)}</strong></dd></dl>`;
const fail = (e) => { console.error(e); flash(e.message || 'Something went wrong', 'error'); };
const dateOf = (s) => new Date(s).toLocaleString();

async function loadSession() {
  const { data } = await sb.auth.getSession(); session = data.session; profile = null;
  if (session) { const r = await sb.from('profiles').select('*').eq('id', session.user.id).maybeSingle(); profile = r.data; }
  renderNav(); startRealtime(); refreshUnread();
  if (!profile?.is_admin) { const pn = document.getElementById('stylepanel'); if (pn) pn.hidden = true; }
}
function renderNav() {
  const n = Object.values(getCart()).reduce((a, b) => a + b, 0);
  document.getElementById('cartlink').innerHTML = (session ? `<button class="stylebtn bell" id="bellbtn" aria-label="Notifications">🔔${unread.all ? `<span class="dot">${unread.all > 99 ? '99+' : unread.all}</span>` : ''}</button> ` : '') + `<a class="cart" href="#/cart">🛒 Cart (${n})</a>`;
  document.getElementById('nav').innerHTML = `<a href="#/shop">Shop</a>${sitePages.filter((x) => x.show_in_nav).map((x) => `<a href="#/page/${esc(x.slug)}">${esc(x.title)}</a>`).join('')}<a href="#/quote">Get a quote</a><a href="#/wishlist">♡ ${getWish().length}</a>` + (session ? `<a href="#/messages">💬 Messages${unread.msg ? ` <span class="dot">${unread.msg}</span>` : ''}</a>` : '') + (session
    ? `${profile?.is_admin ? '<a href="#/admin">Admin</a>' : ''}<a href="#/account">${esc((profile?.name || 'Account').split(' ')[0])}</a><button class="link" id="logout">Log out</button>`
    : `<a href="#/login">Log in</a><a href="#/register">Sign up</a>`) + `${profile?.is_admin ? '<button class="stylebtn" id="stylebtn" aria-label="Customize site style">🎨 Style</button>' : ''}`;
  document.getElementById('logout')?.addEventListener('click', async () => { await sb.auth.signOut(); location.hash = '#/'; });
}
const setMenu = (open) => { document.body.classList.toggle('menu-open', open); document.getElementById('menubtn').setAttribute('aria-expanded', String(open)); document.getElementById('menubtn').textContent = open ? '✕' : '☰'; };
document.getElementById('menubtn').addEventListener('click', () => setMenu(!document.body.classList.contains('menu-open')));
document.getElementById('nav').addEventListener('click', (e) => { if (e.target.closest('a,button.link')) setMenu(false); });
document.getElementById('search').addEventListener('submit', (e) => { e.preventDefault(); location.hash = `#/shop?q=${encodeURIComponent(new FormData(e.target).get('q'))}`; });

// ---- pages ----
const pages = {};
pages.home = async () => {
  await loadRatings();
  const { data, error } = await sb.from('products').select('*').eq('active', true).order('id').limit(8); if (error) throw error;
  const cats = [...new Set((await sb.from('products').select('category').eq('active', true)).data.map((r) => r.category))].sort();
  return `<section class="hero"><h1>Insulation for every build.</h1><p>Batts, spray foam, rigid board and more. Order online and get it delivered to your site.</p><a class="btn" href="#/shop">Shop all products</a><a class="btn ghost" href="#/quote">Request a quote</a></section>
  <div class="perks"><div><b>🚚 Free shipping</b>On orders over ${money(FREE_SHIP)}</div><div><b>📐 Coverage calculator</b>Know exactly how much you need</div><div><b>🏗️ Bulk &amp; trade pricing</b>Ask for a custom quote</div></div>
  <h2>Shop by category</h2><div class="chips">${cats.map((c) => `<a class="chip" href="#/shop?category=${encodeURIComponent(c)}">${esc(c)}</a>`).join('')}</div>
  <h2>Featured</h2><div class="grid">${data.map(card).join('')}</div>`;
};
pages.shop = async (_, q) => {
  await loadRatings();
  const category = q.get('category') || '', term = (q.get('q') || '').replace(/[%,()]/g, '');
  const sort = q.get('sort') || 'name', instock = q.get('instock') === '1';
  const ord = { name: ['name', true], price_asc: ['price_cents', true], price_desc: ['price_cents', false], stock: ['stock', false] }[sort] || ['name', true];
  let req = sb.from('products').select('*').eq('active', true).order(ord[0], { ascending: ord[1] });
  if (instock) req = req.gt('stock', 0);
  if (category) req = req.eq('category', category);
  if (term) req = req.or(`name.ilike.%${term}%,description.ilike.%${term}%,category.ilike.%${term}%`);
  const { data, error } = await req; if (error) throw error;
  const cats = [...new Set((await sb.from('products').select('category').eq('active', true)).data.map((r) => r.category))].sort();
  return `<h1>${esc(category || 'All products')}</h1><div class="chips"><a class="chip ${!category ? 'on' : ''}" href="#/shop">All</a>
  ${cats.map((c) => `<a class="chip ${c === category ? 'on' : ''}" href="#/shop?category=${encodeURIComponent(c)}">${esc(c)}</a>`).join('')}</div>
  <form class="toolbar" id="filters"><span class="muted grow">${data.length} product${data.length === 1 ? '' : 's'}</span>
  <label><input type="checkbox" name="instock" ${instock ? 'checked' : ''}> In stock only</label>
  <select name="sort" aria-label="Sort">${[['name', 'Name'], ['price_asc', 'Price: low to high'], ['price_desc', 'Price: high to low'], ['stock', 'Most in stock']].map(([v, l]) => `<option value="${v}" ${v === sort ? 'selected' : ''}>${l}</option>`).join('')}</select></form>
  ${term ? `<p class="muted">Results for “${esc(term)}”</p>` : ''}${data.length ? `<div class="grid">${data.map(card).join('')}</div>` : '<p>No products found.</p>'}`;
};
pages.shop.after = (_, q) => document.getElementById('filters')?.addEventListener('change', (e) => {
  const f = new FormData(e.currentTarget), n = new URLSearchParams(q);
  n.set('sort', f.get('sort')); f.get('instock') ? n.set('instock', '1') : n.delete('instock'); location.hash = `#/shop?${n}`;
});
pages.product = async ([slug]) => {
  const { data: p } = await sb.from('products').select('*').eq('slug', slug).maybeSingle();
  if (!p) return '<h1>Not found</h1>';
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
  const gallery = pics.length ? `<div class="gallery"><img class="big" id="mainpic" src="${esc(pics[0])}" alt="${esc(p.name)}">${pics.length > 1 ? `<div class="thumbs">${pics.map((u, i) => `<img src="${esc(u)}" alt="Photo ${i + 1}" class="${i ? '' : 'on'}">`).join('')}</div>` : ''}</div>` : img(p, true);
  return `<div class="detail"><div>${gallery}</div><div><span class="tag">${esc(p.category)}</span><h1>${esc(p.name)}</h1>
  <p class="price big">${money(p.price_cents)} <small>per ${esc(p.unit)}</small></p>${p.r_value ? `<p><strong>R-value:</strong> ${esc(p.r_value)}</p>` : ''}<p>${esc(p.description)}</p>
  ${p.stock > 0 ? `<form class="row" id="add"><input type="number" name="qty" value="1" min="1" max="${p.stock}" aria-label="Quantity"><button class="btn">Add to cart</button></form>
  <p class="muted">${p.stock <= 10 ? `Only ${p.stock} left` : 'In stock'}</p>` : '<p class="flash error">Out of stock</p>'}
  ${compareHtml(p)}
  ${coverageOf(p) ? `<div class="calc"><h3>📐 How many do I need?</h3><div class="row"><label>Area (sq ft) <input type="number" id="area" min="1" value="200"></label>
  <label>Waste % <input type="number" id="waste" min="0" max="30" value="10"></label></div><p class="out" id="calcout"></p></div>` : ''}</div></div>
  <h2>Customer reviews</h2>${reviewsHtml}
  ${related.length ? `<h2>You might also need</h2><div class="grid">${related.map(card).join('')}</div>` : ''}`;
};
const coverageOf = (p) => { const m = /(\d+)\s*sq\s*ft/i.exec(p.unit); return m ? Number(m[1]) : 0; };
pages.product.after = ([slug]) => {
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
  document.getElementById('add')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const { data: p } = await sb.from('products').select('id,stock,name').eq('slug', slug).single();
  const cart = getCart(); const qty = Math.max(1, parseInt(new FormData(e.target).get('qty'), 10) || 1);
  cart[p.id] = Math.min((cart[p.id] || 0) + qty, p.stock); setCart(cart); flash(`Added ${p.name} to your cart.`); location.hash = '#/cart';
});
};

async function cartLines() {
  const cart = getCart(), ids = Object.keys(cart); if (!ids.length) return [];
  const { data } = await sb.from('products').select('*').in('id', ids).eq('active', true);
  return data.filter((p) => p.stock > 0).map((p) => ({ ...p, qty: Math.min(cart[p.id], p.stock) }));
}
pages.cart = async () => {
  const lines = await cartLines();
  if (!lines.length) return '<h1>Your cart</h1><p>Your cart is empty. <a href="#/shop">Keep shopping</a></p>';
  const t = totals(lines.reduce((a, l) => a + l.price_cents * l.qty, 0));
  const left = FREE_SHIP - t.sub;
  return `<h1>Your cart</h1><p>${left > 0 ? `Add <b>${money(left)}</b> more for free shipping` : '🎉 You qualify for free shipping!'}</p><div class="progress"><i style="width:${Math.min(100, t.sub / FREE_SHIP * 100)}%"></i></div><form id="cartform"><table><tr><th>Product</th><th>Price</th><th>Qty</th><th>Total</th></tr>
  ${lines.map((l) => `<tr><td><a href="#/product/${esc(l.slug)}">${esc(l.name)}</a></td><td>${money(l.price_cents)}</td>
  <td><input type="number" name="${l.id}" value="${l.qty}" min="0" max="${l.stock}"></td><td>${money(l.price_cents * l.qty)}</td></tr>`).join('')}</table>
  <button class="btn alt">Update quantities</button> <span class="muted">(set 0 to remove)</span></form>
  <form id="promo" class="row" style="margin-top:14px"><input name="code" placeholder="Discount code" value="${esc(getPromo()?.code || '')}" aria-label="Discount code"><button class="btn ghost">Apply</button></form>${totalsHtml(t)}<a class="btn" href="#/checkout">Checkout</a>`;
};
pages.cart.after = () => {
  document.getElementById('promo')?.addEventListener('submit', async (e) => {
    e.preventDefault(); const code = new FormData(e.target).get('code').trim().toUpperCase();
    if (!code) { localStorage.removeItem('promo'); return route(); }
    const sub = (await cartLines()).reduce((a, l) => a + l.price_cents * l.qty, 0);
    const { data } = await sb.rpc('check_code', { c: code, subtotal: sub });
    if (!data) { localStorage.removeItem('promo'); flash('That code is not valid for this order.', 'error'); return route(); }
    localStorage.setItem('promo', JSON.stringify({ code, percent: data })); flash(`Code ${code} applied: ${data}% off.`); route();
  });
  document.getElementById('cartform')?.addEventListener('submit', (e) => {
  e.preventDefault(); const cart = {};
  for (const [id, v] of new FormData(e.target)) { const q = parseInt(v, 10); if (q > 0) cart[id] = q; }
  setCart(cart); route();
});
};

let SAVED = [], CHK = null;
pages.checkout = async () => {
  const lines = await cartLines(); if (!lines.length) return '<h1>Checkout</h1><p>Your cart is empty.</p>';
  SAVED = session ? (await sb.from('addresses').select('*').order('is_default', { ascending: false }).order('id')).data || [] : [];
  const d = SAVED[0] || {};
  const t = totals(lines.reduce((a, l) => a + l.price_cents * l.qty, 0));
  const pk = (await sb.rpc('pickup_locations', { items: lines.map((l) => ({ id: l.id, qty: l.qty })) })).data || [];
  CHK = { lines, t, pk };
  const f = (n, l, v = '', x = '') => `<label>${l}<input name="${n}" value="${esc(v)}" ${x}></label>`;
  return `<h1>Checkout</h1><div class="two"><form id="co" class="stack">
  ${SAVED.length ? `<label>Use a saved address<select id="savedaddr">${SAVED.map((a, i) => `<option value="${i}">${esc(a.label)} — ${esc(a.address)}, ${esc(a.city)}</option>`).join('')}<option value="">Enter a new address</option></select></label>` : ''}
  ${f('name', 'Full name', d.name || profile?.name, 'required')}${f('email', 'Email', session?.user.email, 'type="email" required')}${f('phone', 'Phone', d.phone)}
  ${pk.length ? `<fieldset class="choices"><legend>How would you like to get your order?</legend><label class="check"><input type="radio" name="fulfillment" value="delivery" checked> Delivery</label><label class="check"><input type="radio" name="fulfillment" value="pickup"> Pickup (free)</label></fieldset>
  <div id="pickbox" hidden class="stack">${pk.map((l, i) => `<label class="check pk ${l.available ? '' : 'na'}"><input type="radio" name="location_id" value="${l.id}" ${l.available ? '' : 'disabled'} ${l.available && !pk.slice(0, i).some((x) => x.available) ? 'checked' : ''}> <span><b>${esc(l.name)}</b>${l.available ? '' : ' — not enough stock here'}<br><small class="muted">${esc([l.address, l.city].filter(Boolean).join(', '))}${l.hours ? ' · ' + esc(l.hours) : ''}${l.phone ? ' · ' + esc(l.phone) : ''}</small></span></label>`).join('')}</div>` : ''}
  <div id="addrbox" class="stack">${f('address', 'Delivery address', d.address, 'required')}${f('city', 'City', d.city, 'required')}${f('postcode', 'Postal / ZIP code', d.postcode, 'required')}</div>
  <label>Order notes<textarea name="notes"></textarea></label>
  <p class="muted">${C.PAYMENTS ? 'You will be taken to a secure Stripe page to pay by card.' : "Payment: we'll email you an invoice and payment options once your order is confirmed."}</p><button class="btn">${C.PAYMENTS ? 'Continue to payment' : 'Place order'}</button></form>
  <aside><h3>Order summary</h3><ul>${lines.map((l) => `<li>${l.qty} × ${esc(l.name)} <span>${money(l.qty * l.price_cents)}</span></li>`).join('')}</ul>${totalsHtml(t)}</aside></div>`;
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
    document.querySelector('aside .totals')?.replaceWith(Object.assign(document.createElement('div'), { innerHTML: totalsHtml(pick ? { ...CHK.t, ship: 0, total: CHK.t.sub - CHK.t.disc } : CHK.t) }).firstElementChild);
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

const orderHtml = (o, items, admin) => `<h1>Order #${o.id}</h1><p><span class="status ${esc(o.status)}">${esc(o.status)}</span> · placed ${dateOf(o.created_at)}</p>
  ${o.status === 'cancelled' ? '' : `<div class="steps">${['pending', 'paid', 'shipped', 'delivered'].map((st, i) => `<span class="${i <= ['pending', 'paid', 'shipped', 'delivered'].indexOf(o.status) ? 'done' : ''}">${st}</span>`).join('')}</div>`}
  <table><tr><th>Item</th><th>Price</th><th>Qty</th><th>Total</th></tr>${items.map((i) => `<tr><td>${esc(i.name)}</td><td>${money(i.price_cents)}</td><td>${i.qty}</td><td>${money(i.price_cents * i.qty)}</td></tr>`).join('')}</table>
  ${totalsHtml({ sub: o.subtotal_cents, disc: o.discount_cents, code: o.promo_code, ship: o.shipping_cents, total: o.total_cents })}
  <h3>${o.source === 'in_store' ? 'In-store sale' : o.fulfillment === 'pickup' ? 'Pickup' : 'Delivery'}</h3>${o.payment_method ? `<p class="muted">Paid by ${esc(o.payment_method)}</p>` : ''}<p>${esc(o.name)}<br>${esc(o.address)}<br>${esc(o.city)} ${esc(o.postcode)}<br>${esc(o.email)} ${esc(o.phone)}</p>${o.notes ? `<p><em>${esc(o.notes)}</em></p>` : ''}
  ${admin ? `<form class="row" id="status"><select name="status">${STATUSES.map((s) => `<option ${s === o.status ? 'selected' : ''}>${s}</option>`).join('')}</select><button class="btn alt">Update status</button></form>` : ''}`;
pages.order = async ([id], q) => {
  if (q.get('paid')) flash('Payment received. Thank you! Your order will update to "paid" in a moment.');
  let o, items;
  if (q.get('k')) { const { data } = await sb.rpc('get_guest_order', { oid: Number(id), k: q.get('k') }); if (data) { o = data; items = data.items; } }
  else { o = (await sb.from('orders').select('*').eq('id', id).maybeSingle()).data; if (o) items = (await sb.from('order_items').select('*').eq('order_id', id)).data; }
  return o ? orderHtml(o, items, false) : '<h1>Order not found</h1>';
};

const authForm = (reg) => `<div class="narrow"><h1>${reg ? 'Create account' : 'Log in'}</h1><form id="auth" class="stack">
  ${reg ? '<label>Name<input name="name" required></label>' : ''}<label>Email<input type="email" name="email" required></label>
  <label>Password<input type="password" name="password" required minlength="${reg ? 8 : 1}"></label><button class="btn">${reg ? 'Sign up' : 'Log in'}</button></form>
  ${reg ? '' : '<p><a href="#/forgot">Forgot your password?</a></p>'}
  <p>${reg ? 'Have an account? <a href="#/login">Log in</a>' : 'New here? <a href="#/register">Create an account</a>'}</p></div>`;
pages.forgot = () => `<div class="narrow"><h1>Reset your password</h1><p class="muted">Enter your email and we'll send you a link to choose a new password.</p>
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
const authAfter = (reg) => () => document.getElementById('auth')?.addEventListener('submit', async (e) => {
  e.preventDefault(); const f = Object.fromEntries(new FormData(e.target));
  const r = reg ? await sb.auth.signUp({ email: f.email, password: f.password, options: { data: { name: f.name } } })
    : await sb.auth.signInWithPassword({ email: f.email, password: f.password });
  if (r.error) return fail(r.error);
  if (reg && !r.data.session) { flash('Check your email to confirm your account, then log in.'); return (location.hash = '#/login'); }
  await loadSession(); flash(reg ? 'Welcome! Your account is ready.' : 'Logged in.'); location.hash = '#/account';
});
pages.login.after = authAfter(false); pages.register.after = authAfter(true);

const ordersTable = (os, base, locNames) => os.length ? `<table><tr><th>Order</th><th>Date</th>${locNames ? '<th>Location</th>' : ''}<th>Status</th><th>Total</th></tr>${os.map((o) => `<tr><td><a href="${base}/${o.id}">#${o.id}</a>${base.includes('admin') ? ' · ' + esc(o.name) : ''}</td><td>${dateOf(o.created_at)}</td>${locNames ? `<td>${esc(locNames[o.location_id] || '')}${o.source === 'in_store' ? ' · in store' : o.fulfillment === 'pickup' ? ' · pickup' : ''}</td>` : ''}<td><span class="status ${esc(o.status)}">${esc(o.status)}</span></td><td>${money(o.total_cents)}</td></tr>`).join('')}</table>` : '<p>No orders yet.</p>';
const setDefault = async (id) => { await sb.from('addresses').update({ is_default: false }).neq('id', id); await sb.from('addresses').update({ is_default: true }).eq('id', id); };
pages.account = async () => {
  if (!session) { location.hash = '#/login'; return ''; }
  const { data } = await sb.from('orders').select('*').eq('user_id', session.user.id).order('id', { ascending: false });
  const addrs = (await sb.from('addresses').select('*').order('is_default', { ascending: false }).order('id')).data;
  return `<h1>My account</h1><p>${esc(profile?.name)} · ${esc(session.user.email)}</p><p><a class="btn ghost" href="#/messages">💬 My messages</a> <a class="btn ghost" href="#/notifications">🔔 Notifications</a></p><h2>Order history</h2>${ordersTable(data, '#/order')}
  <h2>Password</h2><form id="cpw" class="row"><input type="password" name="password" minlength="8" placeholder="New password (8+ characters)" autocomplete="new-password" required><button class="btn ghost">Change password</button></form>
  <h2>Saved addresses</h2>${addrs.length ? addrs.map((a) => `<div class="addr"><b>${esc(a.label)}</b>${a.is_default ? ' <span class="status paid">default</span>' : ''}<br>${esc(a.name)}<br>${esc(a.address)}, ${esc(a.city)} ${esc(a.postcode)}${a.phone ? '<br>' + esc(a.phone) : ''}<br>
  ${a.is_default ? '' : `<button class="link defaddr" data-id="${a.id}" style="color:var(--brand)">Make default</button> · `}<button class="link deladdr" data-id="${a.id}" style="color:var(--err)">Delete</button></div>`).join('') : '<p class="muted">No saved addresses yet.</p>'}
  <h3>Add an address</h3><form id="af" class="stack narrow"><label>Label<input name="label" value="Home" maxlength="60"></label><label>Full name<input name="name" required value="${esc(profile?.name || '')}"></label><label>Phone<input name="phone"></label>
  <label>Address<input name="address" required></label><label>City<input name="city" required></label><label>Postal / ZIP code<input name="postcode" required></label>
  <label class="check"><input type="checkbox" name="is_default" ${addrs.length ? '' : 'checked'}> Make this my default</label><button class="btn">Save address</button></form>`;
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
  if (!f) return '<h1>Form not found</h1><p><a href="#/">Back home</a></p>';
  const st = (await sb.rpc('form_status', { form_slug: slug })).data || { open: true };
  const head = `<h1>${esc(f.title)}</h1>${f.description ? `<p class="muted" style="white-space:pre-wrap">${esc(f.description)}</p>` : ''}`;
  if (!st.open) return `<div class="narrow">${head}<p class="flash error" style="margin-top:0">${st.reason === 'full' ? 'This form has reached its response limit.' : 'This form is closed and is no longer accepting responses.'}</p></div>`;
  if (f.require_login && !session) return `<div class="narrow">${head}<p>Please <a href="#/login">log in</a> or <a href="#/register">create an account</a> to fill in this form.</p></div>`;
  CURFORM = f;
  return `<div class="narrow">${head}${f.closes_at ? `<p class="muted">Open until ${new Date(f.closes_at).toLocaleString()}</p>` : ''}<form id="cf2" class="stack" data-slug="${esc(f.slug)}" data-ok="${esc(f.success_message)}">${f.fields.map(fieldHtml).join('')}<button class="btn">${esc(f.submit_label || 'Submit')}</button></form></div>`;
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
  form.outerHTML = `<p class="flash ok" style="margin-top:0">${esc(form.dataset.ok)}</p>`;
});
pages.wishlist = async () => {
  await loadRatings();
  const ids = getWish(); if (!ids.length) return '<h1>Wishlist</h1><p>Nothing saved yet. Tap the ♡ on a product.</p>';
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
let FB = null, PG = null; // form being edited in the builder
const form_inv = (f) => [...f.querySelectorAll('input[name^="inv_"]')];
const slugify = (t) => t.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
const formUrl = (slug) => `${location.origin}${location.pathname}#/form/${slug}`;
function fieldRows() {
  const NUMERIC = ['text', 'textarea', 'email', 'tel', 'url', 'number'];
  return FB.fields.map((f, i) => `<div class="fld" data-i="${i}"><div class="row">
    ${f.type === 'paragraph' ? `<textarea data-f="label" rows="2" placeholder="Text to show" style="flex:1;min-width:160px">${esc(f.label)}</textarea>` : `<input data-f="label" value="${esc(f.label)}" placeholder="${f.type === 'heading' ? 'Heading text' : 'Question'}" style="flex:1;min-width:160px">`}
    <select data-f="type">${Object.entries(FIELD_TYPES).map(([k, l]) => `<option value="${k}" ${k === f.type ? 'selected' : ''}>${l}</option>`).join('')}</select>
    ${DISPLAY_TYPES.includes(f.type) ? '' : `<label class="check"><input type="checkbox" data-f="required" ${f.required ? 'checked' : ''}> Required</label>`}
    <button type="button" class="btn ghost" data-act="up" aria-label="Move up">↑</button><button type="button" class="btn ghost" data-act="down" aria-label="Move down">↓</button>
    <button type="button" class="btn ghost" data-act="del" aria-label="Delete question" style="color:var(--err)">✕</button></div>
    ${CHOICE_TYPES.includes(f.type) ? `<textarea data-f="options" rows="3" placeholder="One option per line" style="width:100%;margin-top:8px">${esc((f.options || []).join('\n'))}</textarea>` : ''}
    ${DISPLAY_TYPES.includes(f.type) ? '' : `<details class="more"><summary>More options</summary><div class="row" style="margin-top:8px">
      <input data-f="help" value="${esc(f.help || '')}" placeholder="Help text (shown under the question)" style="flex:1;min-width:200px">
      ${NUMERIC.includes(f.type) && f.type !== 'number' ? `<input data-f="placeholder" value="${esc(f.placeholder || '')}" placeholder="Placeholder">` : ''}
      ${f.type === 'number' ? `<input data-f="min" type="number" step="any" value="${esc(f.min ?? '')}" placeholder="Min" style="width:100px"><input data-f="max" type="number" step="any" value="${esc(f.max ?? '')}" placeholder="Max" style="width:100px">` : ''}
      ${['text', 'textarea', 'email', 'tel', 'url'].includes(f.type) ? `<input data-f="maxlength" type="number" min="1" max="5000" value="${esc(f.maxlength ?? '')}" placeholder="Max length" style="width:120px">` : ''}</div></details>`}</div>`).join('') || '<p class="muted">No questions yet. Add one below.</p>';
}
const toLocalInput = (d) => { const t = new Date(d); return new Date(t - t.getTimezoneOffset() * 60000).toISOString().slice(0, 16); };
pages.admin = async ([sub, id, extra], q = new URLSearchParams()) => {
  if (!profile?.is_admin) return '<h1>Forbidden</h1>';
  if (sub === 'orders' && id) {
    const o = (await sb.from('orders').select('*').eq('id', id).single()).data;
    return orderHtml(o, (await sb.from('order_items').select('*').eq('order_id', id)).data, true);
  }
  if (sub === 'forms' && id && extra === 'responses') {
    const f = (await sb.from('forms').select('*').eq('id', id).single()).data;
    const all = (await sb.from('form_submissions').select('*').eq('form_id', id).order('id', { ascending: false })).data;
    const filter = q.get('status') || '', rows = filter ? all.filter((r) => r.status === filter) : all;
    const cnt = (st) => all.filter((r) => r.status === st).length;
    return `<h1>${esc(f.title)} — responses</h1><p><a href="#/admin/forms">← All forms</a> · <button class="btn ghost" id="fcsv" data-id="${f.id}">⬇ Export CSV</button></p>
    <div class="chips"><a class="chip ${!filter ? 'on' : ''}" href="#/admin/forms/${f.id}/responses">All (${all.length})</a>${Object.entries(RESP_STATUS).map(([k, l]) => `<a class="chip ${filter === k ? 'on' : ''}" href="#/admin/forms/${f.id}/responses?status=${k}">${l} (${cnt(k)})</a>`).join('')}</div>
    ${rows.length ? `<table><tr><th>Received</th>${dataFields(f).map((x) => `<th>${esc(x.label)}</th>`).join('')}<th>Status</th><th>Notes</th><th></th></tr>${rows.map((r) => `<tr><td>${dateOf(r.created_at)}</td>${dataFields(f).map((x) => x.type === 'file' ? `<td>${r.data[x.id] ? `<button class="link dlfile" data-path="${esc(r.data[x.id])}" style="color:var(--brand)">⬇ ${esc(r.data[x.id].split('/').pop().replace(/^[0-9a-f-]{36}-/, ''))}</button>` : ''}</td>` : `<td style="white-space:pre-wrap">${esc(showVal(x, r.data[x.id]))}</td>`).join('')}<td><select class="rstatus" data-id="${r.id}" aria-label="Status">${Object.entries(RESP_STATUS).map(([k, l]) => `<option value="${k}" ${k === r.status ? 'selected' : ''}>${l}</option>`).join('')}</select></td><td><textarea class="rnotes" data-id="${r.id}" rows="2" maxlength="5000" placeholder="Add a note…" aria-label="Notes">${esc(r.notes)}</textarea></td><td><button class="link delresp" data-id="${r.id}" style="color:var(--err)">Delete</button></td></tr>`).join('')}</table>` : '<p>No responses yet.</p>'}`;
  }
  if (sub === 'forms' && id) {
    const f = id === 'new' ? { title: '', slug: '', description: '', success_message: 'Thanks! We received your response.', active: true, notify: true, submit_label: 'Submit', closes_at: null, max_responses: null, require_login: false, fields: [] } : (await sb.from('forms').select('*').eq('id', id).single()).data;
    FB = { ...f, fields: (f.fields || []).map((x) => ({ ...x })) };
    return `<h1>${f.id ? 'Edit form' : 'New form'}</h1><div class="narrow stack" id="fbuilder">
    <label>Title<input id="fb_title" value="${esc(f.title)}" maxlength="200"></label>
    <label>Link name<input id="fb_slug" value="${esc(f.slug)}" maxlength="60" placeholder="auto from title (letters, numbers, dashes)"></label>
    <label>Description (optional)<textarea id="fb_desc" rows="3" maxlength="2000">${esc(f.description)}</textarea></label>
    <label>Message shown after submitting<input id="fb_ok" value="${esc(f.success_message)}" maxlength="1000"></label>
    <label class="check"><input type="checkbox" id="fb_active" ${f.active ? 'checked' : ''}> Published (visible to visitors)</label>
    <label>Submit button text<input id="fb_submit" value="${esc(f.submit_label || 'Submit')}" maxlength="60"></label>
    <label>Closes on (optional)<input type="datetime-local" id="fb_closes" value="${f.closes_at ? toLocalInput(f.closes_at) : ''}"></label>
    <label>Stop accepting after this many responses (optional)<input type="number" id="fb_max" min="1" value="${f.max_responses ?? ''}"></label>
    <label class="check"><input type="checkbox" id="fb_login" ${f.require_login ? 'checked' : ''}> Require visitors to be logged in</label>
    <label class="check"><input type="checkbox" id="fb_notify" ${f.notify !== false ? 'checked' : ''}> Email me when someone submits this form</label>
    <h3 style="margin-bottom:0">Questions</h3><div id="fields">${fieldRows()}</div>
    <div class="row"><select id="fb_newtype">${Object.entries(FIELD_TYPES).map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select><button type="button" class="btn alt" id="fb_add">+ Add question</button></div>
    <div class="row"><button type="button" class="btn" id="fb_save">Save form</button>${f.id ? `<a class="btn ghost" href="${esc(formUrl(f.slug))}" target="_blank" rel="noopener">View form ↗</a>` : ''}</div>
    ${f.id ? `<p class="muted">Share this link: <code>${esc(formUrl(f.slug))}</code></p>` : ''}</div>`;
  }
  if (sub === 'forms') {
    const fs = (await sb.from('forms').select('*').order('id', { ascending: false })).data;
    const counts = {}; ((await sb.from('form_submissions').select('form_id')).data || []).forEach((r) => (counts[r.form_id] = (counts[r.form_id] || 0) + 1));
    const fresh = {}; ((await sb.from('form_submissions').select('form_id').eq('status', 'new')).data || []).forEach((r) => (fresh[r.form_id] = (fresh[r.form_id] || 0) + 1));
    return `<h1>Forms</h1><p><a class="btn" href="#/admin/forms/new">+ New form</a></p>${fs.length ? `<table><tr><th>Form</th><th>Link</th><th>Status</th><th>Responses</th><th></th></tr>${fs.map((f) => `<tr><td><a href="#/admin/forms/${f.id}">${esc(f.title)}</a></td><td><code>#/form/${esc(f.slug)}</code></td><td>${f.active ? 'Published' : 'Draft'}</td><td><a href="#/admin/forms/${f.id}/responses">${counts[f.id] || 0}</a>${fresh[f.id] ? ` <span class="status pending">${fresh[f.id]} new</span>` : ''}</td><td><button class="link delform" data-id="${f.id}" data-title="${esc(f.title)}" style="color:var(--err)">Delete</button></td></tr>`).join('')}</table>` : '<p>No forms yet.</p>'}`;
  }
  if (sub === 'pages' && id) {
    const pg = id === 'new' ? { title: '', slug: '', body: '# New page\n\nWrite your content here.', published: false, show_in_nav: false, show_in_footer: true, sort: 0 } : (await sb.from('pages').select('*').eq('id', id).single()).data;
    PG = { ...pg };
    return `<h1>${pg.id ? 'Edit page' : 'New page'}</h1><div class="pgedit">
    <div class="stack">
      <label>Title<input id="pg_title" value="${esc(pg.title)}" maxlength="200"></label>
      <label>Link name<input id="pg_slug" value="${esc(pg.slug)}" maxlength="60" placeholder="auto from title"></label>
      <div class="row"><label class="check"><input type="checkbox" id="pg_pub" ${pg.published ? 'checked' : ''}> Published</label>
      <label class="check"><input type="checkbox" id="pg_nav" ${pg.show_in_nav ? 'checked' : ''}> Show in menu</label>
      <label class="check"><input type="checkbox" id="pg_foot" ${pg.show_in_footer ? 'checked' : ''}> Show in footer</label>
      <label class="check">Order <input type="number" id="pg_sort" value="${pg.sort ?? 0}" style="width:80px"></label></div>
      <div class="mdbar row"><button type="button" class="btn ghost" data-md="# ">H1</button><button type="button" class="btn ghost" data-md="## ">H2</button><button type="button" class="btn ghost" data-wrap="**">B</button><button type="button" class="btn ghost" data-wrap="*"><i>I</i></button>
      <button type="button" class="btn ghost" data-md="- ">• List</button><button type="button" class="btn ghost" data-md="> ">❝ Quote</button><button type="button" class="btn ghost" data-ins="[link text](https://)">🔗 Link</button>
      <button type="button" class="btn ghost" data-ins="{{button: Label | #/shop}}">Button</button><label class="btn ghost" style="cursor:pointer">🖼 Image<input type="file" id="pg_img" accept="image/jpeg,image/png,image/webp,image/gif" hidden></label></div>
      <textarea id="pg_body" rows="18" style="font-family:ui-monospace,Menlo,monospace;font-size:.9rem" maxlength="100000">${esc(pg.body)}</textarea>
      <div class="row"><button type="button" class="btn" id="pg_save">Save page</button>${pg.id ? `<a class="btn ghost" href="#/page/${esc(pg.slug)}" target="_blank" rel="noopener">View ↗</a>` : ''}</div>
      <details class="more"><summary>Formatting help</summary><p class="muted" style="white-space:pre-wrap"># Heading   ## Smaller heading
**bold**  *italic*  [link](https://…)  ![image](https://…)
- bullet list      1. numbered list      &gt; quote      --- divider
{{button: Shop now | #/shop}}  (a button link)</p></details></div>
    <div><h3 style="margin-top:0">Preview</h3><article class="prose preview" id="pg_preview">${md(pg.body)}</article></div></div>`;
  }
  if (sub === 'pages') {
    const ps = (await sb.from('pages').select('*').order('sort').order('title')).data;
    return `<h1>Pages</h1><p><a class="btn" href="#/admin/pages/new">+ New page</a></p>${ps.length ? `<table><tr><th>Page</th><th>Link</th><th>Status</th><th>Menu</th><th>Footer</th><th></th></tr>${ps.map((x) => `<tr><td><a href="#/admin/pages/${x.id}">${esc(x.title)}</a></td><td><code>#/page/${esc(x.slug)}</code></td><td>${x.published ? 'Published' : 'Draft'}</td><td>${x.show_in_nav ? '✓' : ''}</td><td>${x.show_in_footer ? '✓' : ''}</td><td><a href="#/page/${esc(x.slug)}">View</a> · <button class="link delpage" data-id="${x.id}" data-title="${esc(x.title)}" style="color:var(--err)">Delete</button></td></tr>`).join('')}</table>` : '<p>No pages yet.</p>'}`;
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
    <table><tr><th>Name</th><th>Type</th><th>Address</th><th>Units in stock</th><th>Pickup</th><th>Status</th></tr>${ls.map((l) => `<tr><td><a href="#/admin/locations/${l.id}">${esc(l.name)}</a>${l.is_default ? ' <span class="status paid">default</span>' : ''}</td><td>${KINDS[l.kind] || ''}</td><td>${esc([l.address, l.city, l.postcode].filter(Boolean).join(', '))}</td><td>${units[l.id] || 0}</td><td>${l.pickup_enabled ? '✓' : ''}</td><td>${l.active ? 'Active' : 'Inactive'}</td></tr>`).join('')}</table>`;
  }
  if (sub === 'inventory') {
    const [prods, locs, inv, log] = await Promise.all([sb.from('products').select('id,name,category,active').order('name'), sb.from('locations').select('*').order('is_default', { ascending: false }).order('name'),
      sb.from('inventory').select('*'), sb.from('inventory_log').select('*').order('id', { ascending: false }).limit(40)]);
    const P = prods.data, L = locs.data, qty = {}; inv.data.forEach((r) => (qty[`${r.product_id}:${r.location_id}`] = r.qty));
    const pname = Object.fromEntries(P.map((x) => [x.id, x.name])), lname = Object.fromEntries(L.map((x) => [x.id, x.name]));
    const KIND_L = { adjust: 'Adjusted', sale: 'Sale', restock: 'Restocked', transfer_in: 'Transfer in', transfer_out: 'Transfer out' };
    return `<h1>Inventory</h1><p><a class="btn ghost" href="#/admin/locations">Manage locations</a> <button class="btn ghost" id="invcsv">⬇ Export CSV</button></p>
    <div class="row" style="margin-bottom:8px"><input id="invsearch" placeholder="Filter products…" aria-label="Filter products" style="flex:1;max-width:320px"></div>
    <table id="invtable"><tr><th>Product</th>${L.map((l) => `<th>${esc(l.name)}${l.active ? '' : ' (inactive)'}</th>`).join('')}<th>Total</th></tr>
    ${P.map((x) => { const tot = L.reduce((a, l) => a + (qty[`${x.id}:${l.id}`] || 0), 0); return `<tr data-name="${esc(x.name.toLowerCase())}"><td><b>${esc(x.name)}</b>${x.active ? '' : ' <span class="muted">(hidden)</span>'}<br><small class="muted">${esc(x.category)}</small></td>${L.map((l) => `<td><input type="number" min="0" class="invq" data-p="${x.id}" data-l="${l.id}" value="${qty[`${x.id}:${l.id}`] || 0}" aria-label="${esc(x.name)} at ${esc(l.name)}"></td>`).join('')}<td class="invtot ${tot <= 10 ? 'lowtot' : ''}">${tot}</td></tr>`; }).join('')}</table>
    <h2>Transfer stock between locations</h2>${L.length < 2 ? '<p class="muted">Add a second location to transfer stock.</p>' : `<form id="tf" class="row"><select name="pid" required><option value="">Product…</option>${P.map((x) => `<option value="${x.id}">${esc(x.name)}</option>`).join('')}</select>
    <select name="from" required><option value="">From…</option>${L.map((l) => `<option value="${l.id}">${esc(l.name)}</option>`).join('')}</select><select name="to" required><option value="">To…</option>${L.map((l) => `<option value="${l.id}">${esc(l.name)}</option>`).join('')}</select>
    <input name="amount" type="number" min="1" placeholder="Qty" required style="width:90px"><input name="note" placeholder="Note (optional)" style="flex:1;min-width:160px"><button class="btn">Transfer</button></form>`}
    <h2>Recent activity</h2>${log.data.length ? `<table><tr><th>When</th><th>Product</th><th>Location</th><th>Change</th><th>Type</th><th>Note</th></tr>${log.data.map((e) => `<tr><td>${dateOf(e.created_at)}</td><td>${esc(pname[e.product_id] || '')}</td><td>${esc(lname[e.location_id] || '')}</td><td><b style="color:${e.delta < 0 ? 'var(--err)' : 'var(--ok)'}">${e.delta > 0 ? '+' : ''}${e.delta}</b> → ${e.qty_after}</td><td>${KIND_L[e.kind] || esc(e.kind)}${e.order_id ? ` <a href="#/admin/orders/${e.order_id}">#${e.order_id}</a>` : ''}</td><td>${esc(e.note)}</td></tr>`).join('')}</table>` : '<p class="muted">No activity yet.</p>'}`;
  }
  if (sub === 'sales') {
    const days = q.get('days') || '30', locF = q.get('loc') || '', srcF = q.get('source') || '';
    const since = days === 'all' ? null : new Date(Date.now() - Number(days) * 864e5).toISOString();
    const locs = (await sb.from('locations').select('id,name').order('name')).data || [], lname = Object.fromEntries(locs.map((l) => [l.id, l.name]));
    let oq = sb.from('orders').select('id,created_at,status,total_cents,location_id,source,name').neq('status', 'cancelled').order('created_at');
    let iq = sb.from('order_items').select('name,qty,price_cents,orders!inner(created_at,status,location_id,source)').neq('orders.status', 'cancelled');
    if (since) { oq = oq.gte('created_at', since); iq = iq.gte('orders.created_at', since); }
    if (locF) { oq = oq.eq('location_id', locF); iq = iq.eq('orders.location_id', locF); }
    if (srcF) { oq = oq.eq('source', srcF); iq = iq.eq('orders.source', srcF); }
    const [orders, items] = [(await oq).data || [], (await iq).data || []];
    const revenue = orders.reduce((a, o) => a + o.total_cents, 0), units = items.reduce((a, i) => a + i.qty, 0);
    const byLoc = {}; orders.forEach((o) => { const k = o.location_id || 0; (byLoc[k] = byLoc[k] || { n: 0, rev: 0, units: 0 }); byLoc[k].n++; byLoc[k].rev += o.total_cents; });
    items.forEach((i) => { const k = i.orders.location_id || 0; (byLoc[k] = byLoc[k] || { n: 0, rev: 0, units: 0 }); byLoc[k].units += i.qty; });
    const bySrc = { online: 0, in_store: 0 }; orders.forEach((o) => (bySrc[o.source] = (bySrc[o.source] || 0) + o.total_cents));
    const top = {}; items.forEach((i) => { const t = (top[i.name] = top[i.name] || { units: 0, rev: 0 }); t.units += i.qty; t.rev += i.qty * i.price_cents; });
    const topRows = Object.entries(top).sort((a, b) => b[1].rev - a[1].rev).slice(0, 10);
    const mk = (extra) => { const n = new URLSearchParams(q); Object.entries(extra).forEach(([k, v]) => (v ? n.set(k, v) : n.delete(k))); return `#/admin/sales?${n}`; };
    SALES_ROWS = orders.map((o) => [o.id, o.created_at, lname[o.location_id] || '', o.source, o.status, o.name, (o.total_cents / 100).toFixed(2)]);
    return `<h1>Sales</h1>${rangeChips('#/admin/sales', q)}
    <div class="row" style="margin-bottom:14px"><select id="salesloc" aria-label="Location"><option value="">All locations</option>${locs.map((l) => `<option value="${l.id}" ${String(l.id) === locF ? 'selected' : ''}>${esc(l.name)}</option>`).join('')}</select>
    <select id="salessrc" aria-label="Channel"><option value="">All channels</option><option value="online" ${srcF === 'online' ? 'selected' : ''}>Online</option><option value="in_store" ${srcF === 'in_store' ? 'selected' : ''}>In store</option></select>
    <button class="btn ghost" id="salescsv">⬇ Export orders CSV</button></div>
    <div class="stats"><div><b>${money(revenue)}</b>revenue</div><div><b>${orders.length}</b>orders</div><div><b>${units}</b>units sold</div><div><b>${money(orders.length ? Math.round(revenue / orders.length) : 0)}</b>average order</div></div>
    <h2>Revenue over time</h2>${barChart(bucketize(orders, days))}
    <div class="two" style="margin-top:8px"><div><h2>By location</h2>${Object.keys(byLoc).length ? `<table><tr><th>Location</th><th>Orders</th><th>Units</th><th>Revenue</th></tr>${Object.entries(byLoc).sort((a, b) => b[1].rev - a[1].rev).map(([k, v]) => `<tr><td>${esc(lname[k] || 'Unassigned')}</td><td>${v.n}</td><td>${v.units}</td><td>${money(v.rev)}</td></tr>`).join('')}</table>` : '<p class="muted">No sales in this period.</p>'}
    <h2>By channel</h2><table><tr><th>Channel</th><th>Revenue</th></tr><tr><td>Online</td><td>${money(bySrc.online || 0)}</td></tr><tr><td>In store</td><td>${money(bySrc.in_store || 0)}</td></tr></table></div>
    <div><h2>Top products</h2>${topRows.length ? `<table><tr><th>Product</th><th>Units</th><th>Revenue</th></tr>${topRows.map(([n, v]) => `<tr><td>${esc(n)}</td><td>${v.units}</td><td>${money(v.rev)}</td></tr>`).join('')}</table>` : '<p class="muted">No sales in this period.</p>'}</div></div>
`;
  }
  if (sub === 'pos') {
    const [locs, prods, inv] = await Promise.all([sb.from('locations').select('*').eq('active', true).order('is_default', { ascending: false }).order('name'), sb.from('products').select('id,name,price_cents,unit,category').eq('active', true).order('name'), sb.from('inventory').select('*')]);
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
    <div class="row" style="margin-bottom:10px"><input id="cmpsearch" placeholder="Filter products…" style="flex:1;max-width:300px"><button class="btn ghost" id="cmpall">✓ Mark all as checked today</button></div>
    <table id="cmptable"><tr><th>Product</th><th>Our price</th>${comps.data.map((c) => `<th>${esc(c.name)}${c.active ? '' : ' (hidden)'}</th>`).join('')}<th></th></tr>
    ${prods.data.map((x) => `<tr data-name="${esc(x.name.toLowerCase())}"><td><b>${esc(x.name)}</b><br><small class="muted">${esc(x.category)}</small></td><td>${money(x.price_cents)}</td>${comps.data.map((c) => { const r = map[`${x.id}:${c.id}`]; const stale = r && new Date(r.checked_at) < cut;
      return `<td><input type="number" step="0.01" min="0" class="cmpq" data-p="${x.id}" data-c="${c.id}" value="${r ? (r.price_cents / 100).toFixed(2) : ''}" placeholder="—" aria-label="${esc(x.name)} at ${esc(c.name)}">${r ? `<br><small class="${stale ? 'down' : 'muted'}">${stale ? 'stale · ' : ''}${new Date(r.checked_at).toLocaleDateString()}</small>` : ''}</td>`; }).join('')}<td><a href="#/admin/compare/${x.id}">Details</a></td></tr>`).join('')}</table>
    <h2>Retailers</h2><table><tr><th>Name</th><th>Status</th><th></th></tr>${comps.data.map((c) => `<tr><td>${esc(c.name)}</td><td>${c.active ? 'Shown' : 'Hidden'}</td><td><button class="link togcomp" data-id="${c.id}" data-active="${c.active}" style="color:var(--brand)">${c.active ? 'Hide' : 'Show'}</button></td></tr>`).join('')}</table>
    <form id="addcomp" class="row"><input name="name" placeholder="Add a retailer (e.g. Lowe's)" maxlength="80" required><button class="btn ghost">Add</button></form>`;
  }
  if (sub === 'codes') {
    const cs = (await sb.from('discount_codes').select('*').order('code')).data;
    return `<h1>Discount codes</h1><table><tr><th>Code</th><th>Off</th><th>Min order</th><th>Status</th><th></th></tr>${cs.map((c) => `<tr><td><b>${esc(c.code)}</b></td><td>${c.percent}%</td><td>${money(c.min_cents)}</td><td>${c.active ? 'Active' : 'Off'}</td><td><button class="btn ghost togcode" data-code="${esc(c.code)}" data-active="${c.active}">${c.active ? 'Disable' : 'Enable'}</button></td></tr>`).join('')}</table>
    <h3>New code</h3><form id="cf" class="row"><input name="code" placeholder="SUMMER15" required><input name="percent" type="number" min="1" max="100" placeholder="% off" required><input name="min" type="number" min="0" step="0.01" placeholder="Min order $" value="0"><button class="btn">Add</button></form>`;
  }
  if (sub === 'quotes') {
    const qs = (await sb.from('quotes').select('*').order('id', { ascending: false })).data;
    return `<h1>Quote requests</h1>${qs.length ? qs.map((x) => `<aside style="margin:10px 0"><b>${esc(x.name)}</b> · <a href="mailto:${esc(x.email)}">${esc(x.email)}</a> ${esc(x.phone)} · <span class="muted">${dateOf(x.created_at)}</span><p style="white-space:pre-wrap">${esc(x.message)}</p></aside>`).join('') : '<p>No requests yet.</p>'}`;
  }
  if (sub === 'orders') {
    const locs = (await sb.from('locations').select('id,name').order('name')).data || [], locF = q.get('loc') || '';
    let oq = sb.from('orders').select('*').order('id', { ascending: false }); if (locF) oq = oq.eq('location_id', locF);
    return `<h1>Orders</h1><div class="row" style="margin-bottom:10px"><button class="btn ghost" id="csv">⬇ Export CSV</button><select id="ordloc" aria-label="Filter by location"><option value="">All locations</option>${locs.map((l) => `<option value="${l.id}" ${String(l.id) === locF ? 'selected' : ''}>${esc(l.name)}</option>`).join('')}</select><a class="btn" href="#/admin/pos">+ In-store sale</a></div>${ordersTable((await oq).data, '#/admin/orders', Object.fromEntries(locs.map((l) => [l.id, l.name])))}`;
  }
  if (sub === 'customers') {
    const us = (await sb.from('profiles').select('*').order('created_at', { ascending: false })).data;
    return `<h1>Customers</h1><table><tr><th>Name</th><th>Email</th><th>Joined</th><th></th></tr>${us.map((u) => `<tr><td>${esc(u.name)}${u.is_admin ? ' (admin)' : ''}</td><td>${esc(u.email)}</td><td>${dateOf(u.created_at)}</td><td>${u.is_admin ? '' : `<a href="#/messages/new?to=${u.id}">💬 Message</a>`}</td></tr>`).join('')}</table>`;
  }
  if (sub === 'products' && (id === 'new' || id)) {
    const p = id === 'new' ? {} : (await sb.from('products').select('*').eq('id', id).single()).data;
    const extras = id === 'new' ? [] : (await sb.from('product_images').select('*').eq('product_id', id).order('position')).data;
    const locsAll = (await sb.from('locations').select('id,name,active').order('is_default', { ascending: false }).order('name')).data || [];
    const invRows = id === 'new' ? [] : (await sb.from('inventory').select('*').eq('product_id', id)).data || [];
    const stockFields = `<fieldset class="choices"><legend>Stock by location</legend>${locsAll.map((l) => { const q0 = invRows.find((r) => r.location_id === l.id)?.qty ?? 0; return `<label>${esc(l.name)}${l.active ? '' : ' (inactive)'}<input type="number" min="0" name="inv_${l.id}" data-orig="${q0}" value="${q0}"></label>`; }).join('')}<small class="muted">Total stock is the sum across locations. Move stock between locations on the <a href="#/admin/inventory">Inventory</a> page.</small></fieldset>`;
    const t = (n, l, x = '') => `<label>${l}<input name="${n}" value="${esc(p[n] ?? '')}" ${x}></label>`;
    return `<h1>${p.id ? 'Edit product' : 'New product'}</h1><form id="pf" class="stack narrow" data-id="${p.id || ''}">${t('name', 'Name', 'required')}${t('category', 'Category', 'required')}
    <label>Description<textarea name="description" rows="5">${esc(p.description)}</textarea></label>
    <label>Price<input name="price" type="number" step="0.01" min="0" required value="${p.price_cents != null ? (p.price_cents / 100).toFixed(2) : ''}"></label>
    ${t('unit', 'Unit (e.g. bundle, roll)', 'required')}${t('r_value', 'R-value')}${stockFields}
    ${p.image_url ? `<img src="${esc(safeUrl(p.image_url))}" alt="" style="max-width:160px;border-radius:10px">` : ''}
    <label>Photo (JPG, PNG, WebP, up to 5 MB)<input type="file" name="image" accept="image/jpeg,image/png,image/webp,image/gif"></label>
    <input type="hidden" name="image_url" value="${esc(p.image_url || '')}">
    ${extras.length ? `<div class="extras">${extras.map((x) => `<figure><img src="${esc(x.url)}" alt=""><button type="button" class="link delimg" data-id="${x.id}" style="color:var(--err)">Remove</button></figure>`).join('')}</div>` : ''}
    <label>More photos for the gallery (optional, you can pick several)<input type="file" name="extras" accept="image/jpeg,image/png,image/webp,image/gif" multiple></label><label class="check"><input type="checkbox" name="active" ${p.id && !p.active ? '' : 'checked'}> Visible in store</label><button class="btn">Save</button></form>`;
  }
  if (sub === 'products') {
    const ps = (await sb.from('products').select('*').order('name')).data;
    return `<h1>Products</h1><p><a class="btn" href="#/admin/products/new">+ New product</a></p><table><tr><th>Name</th><th>Category</th><th>Price</th><th>Stock</th><th>Status</th></tr>
    ${ps.map((p) => `<tr><td><a href="#/admin/products/${p.id}">${esc(p.name)}</a></td><td>${esc(p.category)}</td><td>${money(p.price_cents)}</td><td>${p.stock}</td><td>${p.active ? 'Live' : 'Hidden'}</td></tr>`).join('')}</table>`;
  }
  // ---- dashboard ----
  const days = [7, 30, 90].includes(Number(q.get('days'))) ? Number(q.get('days')) : 30, now = Date.now(), cutCur = now - days * 864e5;
  const [ordRes, itemRes, locRes, custRes, pendRes, formRes, lowRes, recentRes, quoteRes] = await Promise.all([
    sb.from('orders').select('id,created_at,status,total_cents,location_id,source').neq('status', 'cancelled').gte('created_at', new Date(now - 2 * days * 864e5).toISOString()),
    sb.from('order_items').select('name,qty,price_cents,orders!inner(created_at,status)').neq('orders.status', 'cancelled').gte('orders.created_at', new Date(cutCur).toISOString()),
    sb.from('locations').select('id,name'), sb.from('profiles').select('created_at').eq('is_admin', false).gte('created_at', new Date(now - 2 * days * 864e5).toISOString()),
    sb.from('orders').select('id', { count: 'exact', head: true }).eq('status', 'pending'), sb.from('form_submissions').select('id', { count: 'exact', head: true }).eq('status', 'new'),
    sb.from('products').select('id,name,stock').lte('stock', 10).eq('active', true).order('stock').limit(8),
    sb.from('orders').select('id,name,created_at,status,total_cents,source').order('id', { ascending: false }).limit(8),
    sb.from('quotes').select('id', { count: 'exact', head: true }).gte('created_at', new Date(now - 7 * 864e5).toISOString())]);
  const all = ordRes.data || [], cur = all.filter((o) => new Date(o.created_at) >= cutCur), prev = all.filter((o) => new Date(o.created_at) < cutCur);
  const sum = (a) => a.reduce((x, o) => x + o.total_cents, 0), revCur = sum(cur), revPrev = sum(prev);
  const custCur = (custRes.data || []).filter((u) => new Date(u.created_at) >= cutCur).length, custPrev = (custRes.data || []).length - custCur;
  const todayRev = sum(all.filter((o) => sameDay(o.created_at, now)));
  const delta = (c, p) => (p ? `<small class="${c >= p ? 'up' : 'down'}">${c >= p ? '▲' : '▼'} ${Math.abs(Math.round((c - p) / p * 100))}% vs previous ${days} days</small>` : `<small class="muted">${c ? 'New activity' : 'No data yet'}</small>`);
  const kpi = (label, value, d) => `<div class="kpi"><span class="lbl">${label}</span><b>${value}</b>${d}</div>`;
  const lname = Object.fromEntries((locRes.data || []).map((l) => [l.id, l.name]));
  const byLoc = {}; cur.forEach((o) => { const k = o.location_id || 0; byLoc[k] = (byLoc[k] || 0) + o.total_cents; });
  const locRows = Object.entries(byLoc).sort((a, b) => b[1] - a[1]), maxLoc = Math.max(...locRows.map((r) => r[1]), 1);
  const top = {}; (itemRes.data || []).forEach((i) => { const t = (top[i.name] = top[i.name] || { u: 0, r: 0 }); t.u += i.qty; t.r += i.qty * i.price_cents; });
  const topRows = Object.entries(top).sort((a, b) => b[1].r - a[1].r).slice(0, 5);
  const hr = new Date().getHours(), first = (profile?.name || '').split(' ')[0];
  const attn = [['🧾', pendRes.count || 0, 'pending orders', '#/admin/orders'], ['💬', unread.msg, 'unread messages', '#/messages'], ['📝', formRes.count || 0, 'new form responses', '#/admin/forms'], ['📦', (lowRes.data || []).length, 'low-stock products', '#/admin/inventory'], ['📋', quoteRes.count || 0, 'quote requests this week', '#/admin/quotes']];
  const links = [['🧾', 'Orders', '#/admin/orders'], ['🛍️', 'Products', '#/admin/products'], ['📦', 'Inventory', '#/admin/inventory'], ['📍', 'Locations', '#/admin/locations'], ['📈', 'Sales', '#/admin/sales'], ['🏪', 'Point of sale', '#/admin/pos'],
    ['👥', 'Customers', '#/admin/customers'], ['💬', 'Messages', '#/messages'], ['📝', 'Forms', '#/admin/forms'], ['📄', 'Pages', '#/admin/pages'], ['💲', 'Price compare', '#/admin/compare'], ['🏷️', 'Discount codes', '#/admin/codes'], ['📋', 'Quotes', '#/admin/quotes']];
  return `<div class="dashhead"><div><h1 style="margin:0">Good ${hr < 12 ? 'morning' : hr < 18 ? 'afternoon' : 'evening'}${first ? ', ' + esc(first) : ''} 👋</h1><p class="muted" style="margin:2px 0 0">${new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })} · ${money(todayRev)} sold today</p></div>
    <div class="row"><a class="btn" href="#/admin/pos">+ In-store sale</a><a class="btn ghost" href="#/admin/products/new">+ Product</a></div></div>
  <div class="attn">${attn.map(([i, n, l, h]) => `<a class="attnc ${n ? 'on' : ''}" href="${h}"><span>${i}</span><b>${n}</b><small>${l}</small></a>`).join('')}</div>
  <div class="chips">${[7, 30, 90].map((d) => `<a class="chip ${d === days ? 'on' : ''}" href="#/admin?days=${d}">Last ${d} days</a>`).join('')}</div>
  <div class="kpis">${kpi('Revenue', money(revCur), delta(revCur, revPrev))}${kpi('Orders', cur.length, delta(cur.length, prev.length))}${kpi('Average order', money(cur.length ? Math.round(revCur / cur.length) : 0), delta(cur.length ? revCur / cur.length : 0, prev.length ? revPrev / prev.length : 0))}${kpi('New customers', custCur, delta(custCur, custPrev))}</div>
  <h2>Revenue</h2>${barChart(bucketize(cur, days))}
  <div class="two" style="margin-top:6px"><div><h2>By location</h2>${locRows.length ? locRows.map(([k, v]) => `<div class="locbar"><span>${esc(lname[k] || 'Unassigned')}</span><div class="progress"><i style="width:${v / maxLoc * 100}%"></i></div><b>${money(v)}</b></div>`).join('') : '<p class="muted">No sales in this period.</p>'}
    <h2>Top products</h2>${topRows.length ? `<table><tr><th>Product</th><th>Units</th><th>Revenue</th></tr>${topRows.map(([n, v]) => `<tr><td>${esc(n)}</td><td>${v.u}</td><td>${money(v.r)}</td></tr>`).join('')}</table>` : '<p class="muted">No sales in this period.</p>'}</div>
  <div><h2>Recent orders</h2>${(recentRes.data || []).length ? `<table><tr><th>Order</th><th>Status</th><th>Total</th></tr>${recentRes.data.map((o) => `<tr><td><a href="#/admin/orders/${o.id}">#${o.id}</a> · ${esc(o.name)}${o.source === 'in_store' ? ' 🏪' : ''}<br><small class="muted">${ago(o.created_at)}</small></td><td><span class="status ${esc(o.status)}">${esc(o.status)}</span></td><td>${money(o.total_cents)}</td></tr>`).join('')}</table>` : '<p class="muted">No orders yet.</p>'}
    <h2>Low stock</h2>${(lowRes.data || []).length ? `<ul class="plain">${lowRes.data.map((x) => `<li><a href="#/admin/products/${x.id}">${esc(x.name)}</a> <b class="${x.stock === 0 ? 'down' : ''}">${x.stock === 0 ? 'out of stock' : x.stock + ' left'}</b></li>`).join('')}</ul>` : '<p class="muted">Everything is well stocked. ✅</p>'}</div></div>
  <h2>Manage</h2><div class="qlinks">${links.map(([i, l, h]) => `<a href="${h}"><span>${i}</span>${l}</a>`).join('')}</div>`;
};
pages.admin.after = ([sub, id, extra], q = new URLSearchParams()) => {
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
  document.getElementById('invsearch')?.addEventListener('input', (e) => { const t = e.target.value.toLowerCase(); document.querySelectorAll('#invtable tr[data-name]').forEach((r) => (r.hidden = !r.dataset.name.includes(t))); });
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
    const rows = [...document.querySelectorAll('#invtable tr[data-name]')].map((r) => [r.querySelector('b').textContent, ...[...r.querySelectorAll('.invq')].map((i) => i.value), r.querySelector('.invtot').textContent]);
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
      const total = lines.reduce((a, l) => a + l.p.price_cents * l.qty, 0);
      document.getElementById('poscart').innerHTML = lines.length ? `${lines.map((l) => `<div class="posline"><span>${esc(l.p.name)}</span><span class="row" style="flex-wrap:nowrap"><button type="button" class="btn ghost" data-q="-1" data-id="${l.p.id}" aria-label="Less">−</button><b>${l.qty}</b><button type="button" class="btn ghost" data-q="1" data-id="${l.p.id}" aria-label="More">+</button></span><span>${money(l.p.price_cents * l.qty)}</span></div>`).join('')}<div class="posline" style="font-size:1.2rem"><b>Total</b><span></span><b>${money(total)}</b></div>` : '<p class="muted">Tap a product to add it.</p>';
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
  document.querySelectorAll('.delpage').forEach((b) => b.addEventListener('click', async () => {
    if (!confirm(`Delete the page "${b.dataset.title}"?`)) return; const { error } = await sb.from('pages').delete().eq('id', b.dataset.id); error ? fail(error) : (loadPages(), route());
  }));
  const body = document.getElementById('pg_body');
  if (body) {
    const prev = document.getElementById('pg_preview'); let t = null;
    const refresh = () => { clearTimeout(t); t = setTimeout(() => (prev.innerHTML = md(body.value)), 150); };
    body.addEventListener('input', refresh);
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
        show_in_nav: document.getElementById('pg_nav').checked, show_in_footer: document.getElementById('pg_foot').checked, sort: parseInt(document.getElementById('pg_sort').value, 10) || 0, updated_at: new Date().toISOString() };
      const res = PG.id ? await sb.from('pages').update(row).eq('id', PG.id).select('id').single() : await sb.from('pages').insert(row).select('id').single();
      if (res.error) return fail(res.error.code === '23505' ? new Error('That link name is already used by another page.') : res.error);
      flash('Page saved.'); loadPages(); location.hash = '#/admin/pages';
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
    const paths = [...b.closest('tr').querySelectorAll('.dlfile')].map((x) => x.dataset.path);
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
    const redraw = () => (fields.innerHTML = fieldRows());
    fields.addEventListener('input', (e) => {
      const row = e.target.closest('.fld'); const f = FB.fields[Number(row?.dataset.i)]; const k = e.target.dataset.f; if (!f || !k) return;
      if (k === 'required') f.required = e.target.checked; else if (k === 'options') f.options = e.target.value.split('\n').map((x) => x.trim()).filter(Boolean); else f[k] = e.target.value;
      if (k === 'type') { if (CHOICE_TYPES.includes(f.type) && !f.options) f.options = []; redraw(); }
    });
    fields.addEventListener('click', (e) => {
      const act = e.target.closest('[data-act]')?.dataset.act; if (!act) return; const i = Number(e.target.closest('.fld').dataset.i);
      if (act === 'del') FB.fields.splice(i, 1);
      else { const j = act === 'up' ? i - 1 : i + 1; if (j < 0 || j >= FB.fields.length) return; [FB.fields[i], FB.fields[j]] = [FB.fields[j], FB.fields[i]]; }
      redraw();
    });
    document.getElementById('fb_add').addEventListener('click', () => {
      if (FB.fields.length >= 40) return fail(new Error('A form can have up to 40 questions.'));
      const type = document.getElementById('fb_newtype').value;
      FB.fields.push({ id: 'q' + Math.random().toString(36).slice(2, 9), type, label: '', required: false, ...(CHOICE_TYPES.includes(type) ? { options: [] } : {}) }); redraw();
    });
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
  document.getElementById('cf')?.addEventListener('submit', async (e) => {
    e.preventDefault(); const f = Object.fromEntries(new FormData(e.target));
    const { error } = await sb.from('discount_codes').insert({ code: f.code.trim().toUpperCase(), percent: Number(f.percent), min_cents: Math.round(Number(f.min || 0) * 100) });
    error ? fail(error) : (flash('Code added.'), route());
  });
  document.querySelectorAll('.togcode').forEach((b) => b.addEventListener('click', async () => {
    const { error } = await sb.from('discount_codes').update({ active: b.dataset.active !== 'true' }).eq('code', b.dataset.code); error ? fail(error) : route();
  }));
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
      r_value: f.r_value.trim(), image_url: safeUrl(f.image_url.trim()), active: !!f.active };
    if (!pid) row.slug = (row.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'product') + '-' + Math.floor(Math.random() * 1000);
    const res = pid ? await sb.from('products').update(row).eq('id', pid).select('id').single() : await sb.from('products').insert(row).select('id').single();
    if (res.error) return fail(res.error);
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
    flash(`🔔 ${n.title}`);
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
  ${perm === 'default' ? '<button class="btn ghost" id="desktopn">🔔 Enable desktop alerts</button>' : perm === 'granted' ? '<span class="muted">Desktop alerts on</span>' : ''}</div>
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
const isMine = (m) => (DM.isAdmin ? m.sender_id !== DM.conv.customer_id : m.sender_id === DM.conv.customer_id);
function threadHtml() {
  if (!DM.msgs.length) return `<div class="empty-chat"><div style="font-size:2.4rem">👋</div><p><b>${DM.isAdmin ? 'No messages yet' : 'Say hi!'}</b></p><p class="muted">${DM.isAdmin ? 'Write the first message below.' : 'Ask us anything about products, orders or delivery. Replies show up here.'}</p></div>`;
  let out = '', i = 0;
  while (i < DM.msgs.length) {
    const first = DM.msgs[i]; const mine = isMine(first);
    if (i === 0 || !sameDay(DM.msgs[i - 1].created_at, first.created_at)) out += `<div class="day"><span>${dayLabel(first.created_at)}</span></div>`;
    let j = i, bubbles = '';
    while (j < DM.msgs.length && isMine(DM.msgs[j]) === mine && sameDay(DM.msgs[j].created_at, first.created_at) && (j === i || new Date(DM.msgs[j].created_at) - new Date(DM.msgs[j - 1].created_at) < 10 * 60000)) {
      bubbles += `<div class="msg" data-id="${DM.msgs[j].id}" title="${esc(new Date(DM.msgs[j].created_at).toLocaleString())}">${esc(DM.msgs[j].body)}</div>`; j++;
    }
    const lastM = DM.msgs[j - 1];
    out += `<div class="grp ${mine ? 'mine' : 'theirs'}">${mine ? '' : avatar(DM.peerName, DM.isAdmin ? '' : 'store')}<div class="bstack">${bubbles}<small class="meta">${timeOf(lastM.created_at)}</small></div></div>`;
    i = j;
  }
  const lastMine = [...DM.msgs].reverse().find(isMine);
  if (lastMine?.read_at) out += `<div class="seen">Seen ${ago(lastMine.read_at)}</div>`;
  return out;
}
function renderThread(forceBottom) {
  const t = document.getElementById('thread'); if (!t) return;
  const nearBottom = forceBottom || t.scrollHeight - t.scrollTop - t.clientHeight < 120;
  t.innerHTML = threadHtml(); if (nearBottom) t.scrollTop = t.scrollHeight;
}
async function markRead() {
  if (!DM?.conv) return;
  await sb.rpc('mark_conversation_read', { cid: DM.conv.id });
  await sb.from('notifications').update({ read: true }).eq('link', `#/messages/${DM.conv.id}`).eq('read', false); refreshUnread();
}
async function loadInbox() {
  const convs = (await sb.from('conversations').select('*').order('last_message_at', { ascending: false }).limit(200)).data || [];
  const ids = convs.map((c) => c.id), last = {}, unreadBy = {};
  if (ids.length) ((await sb.from('messages').select('conversation_id,body,sender_id,created_at,read_at').in('conversation_id', ids).order('id', { ascending: false }).limit(600)).data || []).forEach((m) => {
    if (!last[m.conversation_id]) last[m.conversation_id] = m;
    const c = convs.find((x) => x.id === m.conversation_id); if (c && m.sender_id === c.customer_id && !m.read_at) unreadBy[c.id] = (unreadBy[c.id] || 0) + 1;
  });
  const names = {}; if (convs.length) ((await sb.from('profiles').select('id,name,email').in('id', [...new Set(convs.map((c) => c.customer_id))])).data || []).forEach((u) => (names[u.id] = u.name || u.email));
  return { convs, last, unreadBy, names };
}
const listHtml = (inbox, selected, filter = '') => {
  const rows = inbox.convs.filter((c) => !filter || (inbox.names[c.customer_id] || '').toLowerCase().includes(filter.toLowerCase()));
  return rows.length ? rows.map((c) => { const nm = inbox.names[c.customer_id] || 'Customer', lm = inbox.last[c.id], un = inbox.unreadBy[c.id] || 0;
    return `<a class="dmrow ${String(selected) === String(c.id) ? 'on' : ''} ${un ? 'unread' : ''}" href="#/messages/${c.id}">${avatar(nm)}<div class="dmtxt"><div class="row" style="justify-content:space-between;flex-wrap:nowrap"><b>${esc(nm)}</b><small class="muted">${lm ? ago(lm.created_at) : ''}</small></div>
    <span class="muted prev">${lm ? (lm.sender_id !== c.customer_id ? 'You: ' : '') + esc(lm.body.slice(0, 70)) : 'No messages yet'}</span></div>${un ? `<span class="dot">${un}</span>` : ''}</a>`; }).join('')
    : '<p class="muted" style="padding:14px">No conversations found.</p>';
};
pages.messages = async ([id], q) => {
  if (!session) { location.hash = '#/login'; return ''; }
  const isAdmin = !!profile?.is_admin;
  if (id === 'new') { // find or create the DM with a customer, then open it
    const to = isAdmin ? q.get('to') : session.user.id; if (!to) { location.hash = '#/messages'; return ''; }
    let c = (await sb.from('conversations').select('id').eq('customer_id', to).order('id', { ascending: false }).limit(1).maybeSingle()).data;
    if (!c) { const r = await sb.from('conversations').insert({ customer_id: to, subject: 'Direct message' }).select('id').single(); if (r.error) throw r.error; c = r.data; }
    location.hash = `#/messages/${c.id}`; return '';
  }
  let inbox = null, conv = null, selected = id && /^\d+$/.test(id) ? id : null;
  if (isAdmin) inbox = await loadInbox();
  else { const r = await sb.from('conversations').select('*').eq('customer_id', session.user.id).order('id', { ascending: false }).limit(1).maybeSingle(); conv = r.data; selected = conv?.id ?? 'solo'; }
  if (isAdmin && selected) conv = (await sb.from('conversations').select('*').eq('id', selected).maybeSingle()).data;
  const msgs = conv ? (await sb.from('messages').select('*').eq('conversation_id', conv.id).order('id')).data || [] : [];
  const peerName = isAdmin ? (inbox.names[conv?.customer_id] || (conv ? ((await sb.from('profiles').select('name,email').eq('id', conv.customer_id).maybeSingle()).data?.name || 'Customer') : 'Customer')) : 'Store team';
  DM = { conv, msgs, isAdmin, peerName, inbox, online: false };
  const chat = (isAdmin && !conv) ? '<div class="empty-chat"><div style="font-size:2.4rem">💬</div><p><b>Select a conversation</b></p><p class="muted">Pick a customer on the left, or start one from Admin → Customers.</p></div>'
    : `<header class="dmhead">${isAdmin ? '<a class="backbtn" href="#/messages" aria-label="Back">←</a>' : ''}${avatar(peerName, isAdmin ? '' : 'store')}<div><b>${esc(peerName)}</b><div class="dmstatus muted" id="dmstatus">${isAdmin ? esc((await sb.from('profiles').select('email').eq('id', conv.customer_id).maybeSingle()).data?.email || '') : 'Replies usually within a day'}</div></div></header>
    <div class="thread" id="thread"></div><div class="typing" id="typing" hidden>${esc(peerName)} is typing<span>.</span><span>.</span><span>.</span></div>
    <form id="dmform" class="composer"><textarea name="body" rows="1" maxlength="5000" placeholder="Message ${esc(isAdmin ? peerName : 'the store team')}…" aria-label="Message" required></textarea><button class="send" aria-label="Send">➤</button></form>`;
  return `<div class="dm ${isAdmin ? '' : 'solo'} ${conv && isAdmin ? 'has-chat' : ''}">${isAdmin ? `<aside class="dmlist"><div class="dmlist-head"><b>Messages</b><input id="dmsearch" placeholder="Search customers…" aria-label="Search customers"></div><div id="dmrows">${listHtml(inbox, selected)}</div></aside>` : ''}<section class="dmchat">${chat}</section></div>`;
};
pages.messages.after = () => {
  if (!DM) return;
  const listEl = document.getElementById('dmrows');
  document.getElementById('dmsearch')?.addEventListener('input', (e) => { if (listEl) listEl.innerHTML = listHtml(DM.inbox, DM.conv?.id, e.target.value); });
  if (DM.isAdmin) {
    threadChan.push(sb.channel('inbox').on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, async () => {
      DM.inbox = await loadInbox(); const el = document.getElementById('dmrows'); if (el) el.innerHTML = listHtml(DM.inbox, DM.conv?.id, document.getElementById('dmsearch')?.value || '');
    }).subscribe());
  }
  const form = document.getElementById('dmform'); if (!form) return;
  renderThread(true); markRead();
  const ta = form.elements.body, mine = DM.isAdmin ? 'admin' : 'customer';
  const grow = () => { ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight, 140) + 'px'; };
  let typingChan = null, lastTyping = 0, hideTyping = null;
  const joinChannel = () => {
    if (!DM.conv || typingChan) return;
    const cid = DM.conv.id;
    typingChan = sb.channel('dm-' + cid, { config: { broadcast: { self: false }, presence: { key: session.user.id } } })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${cid}` }, (pl) => {
        if (!DM.msgs.some((m) => m.id === pl.new.id)) DM.msgs.push(pl.new);
        renderThread(isMine(pl.new)); if (!isMine(pl.new)) { document.getElementById('typing').hidden = true; markRead(); }
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages', filter: `conversation_id=eq.${cid}` }, (pl) => {
        const m = DM.msgs.find((x) => x.id === pl.new.id); if (m) { m.read_at = pl.new.read_at; renderThread(); }
      })
      .on('broadcast', { event: 'typing' }, () => { const t = document.getElementById('typing'); if (!t) return; t.hidden = false; const th = document.getElementById('thread'); th.scrollTop = th.scrollHeight; clearTimeout(hideTyping); hideTyping = setTimeout(() => (t.hidden = true), 3000); })
      .on('presence', { event: 'sync' }, () => {
        const st = typingChan.presenceState(); DM.online = Object.values(st).flat().some((x) => x.role !== mine);
        const el = document.getElementById('dmstatus'); if (el) { el.dataset.online = DM.online ? '1' : '0'; if (DM.online) el.innerHTML = '<span class="onl"></span> Online'; else if (!DM.isAdmin) el.textContent = 'Replies usually within a day'; }
      })
      .subscribe((status) => { if (status === 'SUBSCRIBED') typingChan.track({ role: mine }); });
    threadChan.push(typingChan);
  };
  joinChannel();
  ta.addEventListener('input', () => { grow(); if (typingChan && Date.now() - lastTyping > 2000) { lastTyping = Date.now(); typingChan.send({ type: 'broadcast', event: 'typing', payload: {} }); } });
  const coarse = window.matchMedia?.('(pointer: coarse)').matches;
  ta.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey && !coarse) { e.preventDefault(); form.requestSubmit(); } });
  form.addEventListener('submit', async (e) => {
    e.preventDefault(); const body = ta.value.trim(); if (!body) return; const btn = form.querySelector('.send'); btn.disabled = true;
    if (!DM.conv) {
      const r = await sb.from('conversations').insert({ customer_id: session.user.id, subject: 'Direct message' }).select('*').single();
      if (r.error) { btn.disabled = false; return fail(r.error); } DM.conv = r.data; joinChannel();
    }
    const { data, error } = await sb.from('messages').insert({ conversation_id: DM.conv.id, body }).select('*').single();
    btn.disabled = false; if (error) return fail(error);
    ta.value = ''; grow(); if (!DM.msgs.some((m) => m.id === data.id)) DM.msgs.push(data); renderThread(true); ta.focus();
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
    else if (/^>\s?/.test(L)) { let q = []; while (i < lines.length && /^>\s?/.test(lines[i])) q.push(lines[i++].replace(/^>\s?/, '')); out += `<blockquote>${q.map(inline).join('<br>')}</blockquote>`; }
    else if (/^[-*]\s+/.test(L)) { let it = []; while (i < lines.length && /^[-*]\s+/.test(lines[i])) it.push(lines[i++].replace(/^[-*]\s+/, '')); out += `<ul>${it.map((x) => `<li>${inline(x)}</li>`).join('')}</ul>`; }
    else if (/^\d+\.\s+/.test(L)) { let it = []; while (i < lines.length && /^\d+\.\s+/.test(lines[i])) it.push(lines[i++].replace(/^\d+\.\s+/, '')); out += `<ol>${it.map((x) => `<li>${inline(x)}</li>`).join('')}</ol>`; }
    else { let para = []; while (i < lines.length && lines[i].trim() && !/^(#{1,3}\s|>\s?|[-*]\s+|\d+\.\s+|-{3,}\s*$|\{\{button:)/.test(lines[i])) para.push(lines[i++]); out += `<p>${para.map(inline).join('<br>')}</p>`; }
  }
  return out;
}
pages.page = async ([slug]) => {
  const { data: pg } = await sb.from('pages').select('*').eq('slug', slug).maybeSingle();
  if (!pg) return '<h1>Page not found</h1><p><a href="#/">Back home</a></p>';
  document.title = `${pg.title} · ${(theme.name || 'Gomi Insulation')}`;
  return `<article class="prose">${!pg.published ? '<p class="flash error" style="margin-top:0">Draft — only admins can see this page.</p>' : ''}${profile?.is_admin ? `<p style="text-align:right"><a class="btn ghost" href="#/admin/pages/${pg.id}">✎ Edit page</a></p>` : ''}${md(pg.body)}</article>`;
};

// ---- locations, inventory, sales, point of sale (admin) ----
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
  orders.forEach((o) => { const k = keyOf(o.created_at); const idx = mode === 'week' ? Math.min(Math.max(k, 0), n - 1) : bs.findIndex((b) => keyOf(b.d) === k); if (idx >= 0) bs[idx].v += o.total_cents; });
  return bs;
}
function barChart(bs) {
  const max = Math.max(...bs.map((b) => b.v), 1), w = 940 / bs.length, step = Math.ceil(bs.length / 14);
  return `<svg viewBox="0 0 1000 220" role="img" aria-label="Sales chart" style="width:100%;height:auto;background:var(--card);border:1px solid var(--line);border-radius:var(--r);padding:8px">${bs.map((b, i) => { const h = b.v / max * 150; const x = 30 + i * w;
    return `<g><title>${b.label}: ${money(b.v)}</title><rect x="${x + 2}" y="${175 - h}" width="${Math.max(w - 4, 2)}" height="${Math.max(h, 2)}" rx="3" fill="var(--brand)" opacity="${b.v ? 1 : .25}"/>${i % step === 0 ? `<text x="${x + w / 2}" y="200" font-size="12" text-anchor="middle" fill="var(--muted)">${b.label}</text>` : ''}</g>`; }).join('')}</svg>`;
}
const rangeChips = (base, q) => `<div class="chips">${[['7', '7 days'], ['30', '30 days'], ['90', '90 days'], ['365', '12 months'], ['all', 'All time']].map(([v, l]) => { const n = new URLSearchParams(q); n.set('days', v); return `<a class="chip ${(q.get('days') || '30') === v ? 'on' : ''}" href="${base}?${n}">${l}</a>`; }).join('')}</div>`;

// ---- router ----
async function route() {
  threadChan.forEach((c) => sb.removeChannel(c)); threadChan = [];
  let h = location.hash.slice(1); if (!h.startsWith('/')) h = '/'; // e.g. #access_token=… after email confirmation
  const [path, qs] = h.split('?'); const q = new URLSearchParams(qs || '');
  const [name = 'home', ...args] = path.split('/').filter(Boolean); const page = pages[name === '' ? 'home' : name];
  if (!page) { $app.innerHTML = '<h1>Not found</h1>'; return; }
  try { $app.classList.remove('in'); $app.innerHTML = '<div class="skeleton"></div>'; $app.innerHTML = await page(args, q); setMenu(false);
    $app.querySelectorAll('table').forEach((t) => { // label cells so tables can stack into cards on phones
      const heads = [...t.querySelectorAll('th')].map((x) => x.textContent);
      t.querySelectorAll('tr').forEach((tr) => [...tr.children].forEach((td, i) => { if (td.tagName === 'TD') td.dataset.label = heads[i] || ''; }));
    });
    void $app.offsetWidth; $app.classList.add('in'); page.after?.(args, q); window.scrollTo(0, 0); } catch (e) { fail(e); $app.innerHTML = '<h1>Something went wrong</h1>'; }
}
window.addEventListener('hashchange', route);
sb.auth.onAuthStateChange((ev) => {
  if (ev === 'PASSWORD_RECOVERY') setTimeout(async () => { await loadSession(); location.hash = '#/reset'; route(); }, 0);
  else if (ev === 'SIGNED_IN' && /type=signup/.test(location.hash)) setTimeout(async () => { await loadSession(); flash('Email confirmed. Welcome!'); location.hash = '#/account'; }, 0);
  if (ev === 'SIGNED_OUT') { session = null; profile = null; unread = { all: 0, msg: 0 }; if (notifChan) { sb.removeChannel(notifChan); notifChan = null; } renderNav(); }
});
applyBranding();
loadSiteTheme(); loadPages();
loadSession().then(route);
