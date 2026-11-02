const C = window.GOMI;
const sb = supabase.createClient(C.SUPABASE_URL, C.SUPABASE_ANON_KEY);
const $app = document.getElementById('app');
const STATUSES = ['pending', 'paid', 'shipped', 'delivered', 'cancelled'];
const FREE_SHIP = 50000, SHIP = 1500;

// ---- helpers ----
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = (c) => `${C.CURRENCY}${(c / 100).toFixed(2)}`;
const safeUrl = (u) => (/^(https?:\/\/|\/)/.test(u || '') ? u : '');
let session = null, profile = null;
const getCart = () => { try { return JSON.parse(localStorage.getItem('cart') || '{}'); } catch { return {}; } };
const setCart = (c) => { localStorage.setItem('cart', JSON.stringify(c)); renderNav(); };
function flash(msg, type = 'ok') {
  const f = document.getElementById('flash'); f.textContent = msg; f.className = `flash ${type}`; f.hidden = false;
  clearTimeout(flash.t); flash.t = setTimeout(() => (f.hidden = true), 5000);
}
const img = (p, big) => (safeUrl(p.image_url) ? `<img class="${big ? 'big' : ''}" src="${esc(safeUrl(p.image_url))}" alt="${esc(p.name)}">` : `<div class="ph ${big ? 'big' : ''}">${esc(p.r_value || '🧱')}</div>`);
const getWish = () => { try { return JSON.parse(localStorage.getItem('wish') || '[]'); } catch { return []; } };
document.addEventListener('click', (e) => {
  const b = e.target.closest('.heart'); if (!b) return;
  const id = Number(b.dataset.id); let w = getWish();
  w = w.includes(id) ? w.filter((x) => x !== id) : [...w, id]; localStorage.setItem('wish', JSON.stringify(w));
  b.textContent = w.includes(id) ? '♥' : '♡'; b.style.color = w.includes(id) ? '#dc2626' : ''; renderNav(); if (location.hash.startsWith('#/wishlist')) route();
});
const card = (p) => `<article class="card">${p.stock <= 0 ? '<span class="badge">Sold out</span>' : p.stock <= 10 ? '<span class="badge warn">Low stock</span>' : ''}<button class="heart" data-id="${p.id}" aria-label="Save to wishlist" style="${getWish().includes(p.id) ? 'color:#dc2626' : ''}">${getWish().includes(p.id) ? '♥' : '♡'}</button><a href="#/product/${esc(p.slug)}">${img(p)}</a><div class="pad"><span class="tag">${esc(p.category)}</span>
  <h3><a href="#/product/${esc(p.slug)}">${esc(p.name)}</a></h3><p class="muted">${p.r_value ? esc(p.r_value) + ' · ' : ''}per ${esc(p.unit)}</p><p class="price">${money(p.price_cents)}</p></div></article>`;
const totals = (sub) => { const ship = !sub || sub >= FREE_SHIP ? 0 : SHIP; return { sub, ship, total: sub + ship }; };
const totalsHtml = (t) => `<dl class="totals"><dt>Subtotal</dt><dd>${money(t.sub)}</dd><dt>Shipping</dt><dd>${t.ship ? money(t.ship) : 'Free'}</dd><dt>Total</dt><dd><strong>${money(t.total)}</strong></dd></dl>`;
const fail = (e) => { console.error(e); flash(e.message || 'Something went wrong', 'error'); };
const dateOf = (s) => new Date(s).toLocaleString();

async function loadSession() {
  const { data } = await sb.auth.getSession(); session = data.session; profile = null;
  if (session) { const r = await sb.from('profiles').select('*').eq('id', session.user.id).maybeSingle(); profile = r.data; }
  renderNav();
}
function renderNav() {
  const n = Object.values(getCart()).reduce((a, b) => a + b, 0);
  document.getElementById('nav').innerHTML = `<a href="#/shop">Shop</a><a href="#/quote">Get a quote</a><a href="#/wishlist">♡ ${getWish().length}</a>` + (session
    ? `${profile?.is_admin ? '<a href="#/admin">Admin</a>' : ''}<a href="#/account">${esc((profile?.name || 'Account').split(' ')[0])}</a><button class="link" id="logout">Log out</button>`
    : `<a href="#/login">Log in</a><a href="#/register">Sign up</a>`) + `<a class="cart" href="#/cart">Cart (${n})</a>`;
  document.getElementById('logout')?.addEventListener('click', async () => { await sb.auth.signOut(); location.hash = '#/'; });
}
document.getElementById('search').addEventListener('submit', (e) => { e.preventDefault(); location.hash = `#/shop?q=${encodeURIComponent(new FormData(e.target).get('q'))}`; });

// ---- pages ----
const pages = {};
pages.home = async () => {
  const { data, error } = await sb.from('products').select('*').eq('active', true).order('id').limit(8); if (error) throw error;
  const cats = [...new Set((await sb.from('products').select('category').eq('active', true)).data.map((r) => r.category))].sort();
  return `<section class="hero"><h1>Insulation for every build.</h1><p>Batts, spray foam, rigid board and more. Order online and get it delivered to your site.</p><a class="btn" href="#/shop">Shop all products</a><a class="btn ghost" href="#/quote">Request a quote</a></section>
  <div class="perks"><div><b>🚚 Free shipping</b>On orders over ${money(FREE_SHIP)}</div><div><b>📐 Coverage calculator</b>Know exactly how much you need</div><div><b>🏗️ Bulk &amp; trade pricing</b>Ask for a custom quote</div></div>
  <h2>Shop by category</h2><div class="chips">${cats.map((c) => `<a class="chip" href="#/shop?category=${encodeURIComponent(c)}">${esc(c)}</a>`).join('')}</div>
  <h2>Featured</h2><div class="grid">${data.map(card).join('')}</div>`;
};
pages.shop = async (_, q) => {
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
  const related = (await sb.from('products').select('*').eq('active', true).neq('id', p.id).limit(40)).data
    .sort((a, b) => (b.category === p.category) - (a.category === p.category)).slice(0, 4);
  return `<div class="detail"><div>${img(p, true)}</div><div><span class="tag">${esc(p.category)}</span><h1>${esc(p.name)}</h1>
  <p class="price big">${money(p.price_cents)} <small>per ${esc(p.unit)}</small></p>${p.r_value ? `<p><strong>R-value:</strong> ${esc(p.r_value)}</p>` : ''}<p>${esc(p.description)}</p>
  ${p.stock > 0 ? `<form class="row" id="add"><input type="number" name="qty" value="1" min="1" max="${p.stock}" aria-label="Quantity"><button class="btn">Add to cart</button></form>
  <p class="muted">${p.stock <= 10 ? `Only ${p.stock} left` : 'In stock'}</p>` : '<p class="flash error">Out of stock</p>'}
  ${coverageOf(p) ? `<div class="calc"><h3>📐 How many do I need?</h3><div class="row"><label>Area (sq ft) <input type="number" id="area" min="1" value="200"></label>
  <label>Waste % <input type="number" id="waste" min="0" max="30" value="10"></label></div><p class="out" id="calcout"></p></div>` : ''}</div></div>
  ${related.length ? `<h2>You might also need</h2><div class="grid">${related.map(card).join('')}</div>` : ''}`;
};
const coverageOf = (p) => { const m = /(\d+)\s*sq\s*ft/i.exec(p.unit); return m ? Number(m[1]) : 0; };
pages.product.after = ([slug]) => {
  const area = document.getElementById('area'); if (area) {
    sb.from('products').select('*').eq('slug', slug).single().then(({ data: p }) => {
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
  <button class="btn alt">Update quantities</button> <span class="muted">(set 0 to remove)</span></form>${totalsHtml(t)}<a class="btn" href="#/checkout">Checkout</a>`;
};
pages.cart.after = () => document.getElementById('cartform')?.addEventListener('submit', (e) => {
  e.preventDefault(); const cart = {};
  for (const [id, v] of new FormData(e.target)) { const q = parseInt(v, 10); if (q > 0) cart[id] = q; }
  setCart(cart); route();
});

pages.checkout = async () => {
  const lines = await cartLines(); if (!lines.length) return '<h1>Checkout</h1><p>Your cart is empty.</p>';
  const t = totals(lines.reduce((a, l) => a + l.price_cents * l.qty, 0));
  const f = (n, l, v = '', x = '') => `<label>${l}<input name="${n}" value="${esc(v)}" ${x}></label>`;
  return `<h1>Checkout</h1><div class="two"><form id="co" class="stack">
  ${f('name', 'Full name', profile?.name, 'required')}${f('email', 'Email', session?.user.email, 'type="email" required')}${f('phone', 'Phone')}
  ${f('address', 'Delivery address', '', 'required')}${f('city', 'City', '', 'required')}${f('postcode', 'Postal / ZIP code', '', 'required')}
  <label>Order notes<textarea name="notes"></textarea></label>
  <p class="muted">Payment: we'll email you an invoice and payment options once your order is confirmed.</p><button class="btn">Place order</button></form>
  <aside><h3>Order summary</h3><ul>${lines.map((l) => `<li>${l.qty} × ${esc(l.name)} <span>${money(l.qty * l.price_cents)}</span></li>`).join('')}</ul>${totalsHtml(t)}</aside></div>`;
};
pages.checkout.after = () => document.getElementById('co')?.addEventListener('submit', async (e) => {
  e.preventDefault(); const btn = e.target.querySelector('button'); btn.disabled = true;
  const customer = Object.fromEntries(new FormData(e.target));
  const items = Object.entries(getCart()).map(([id, qty]) => ({ id: Number(id), qty }));
  const { data, error } = await sb.rpc('place_order', { items, customer });
  btn.disabled = false; if (error) return fail(error);
  setCart({}); flash(`Thanks! Order #${data.id} received. We'll email you an invoice shortly.`);
  location.hash = `#/order/${data.id}` + (session ? '' : `?k=${data.key}`);
});

const orderHtml = (o, items, admin) => `<h1>Order #${o.id}</h1><p><span class="status ${esc(o.status)}">${esc(o.status)}</span> · placed ${dateOf(o.created_at)}</p>
  ${o.status === 'cancelled' ? '' : `<div class="steps">${['pending', 'paid', 'shipped', 'delivered'].map((st, i) => `<span class="${i <= ['pending', 'paid', 'shipped', 'delivered'].indexOf(o.status) ? 'done' : ''}">${st}</span>`).join('')}</div>`}
  <table><tr><th>Item</th><th>Price</th><th>Qty</th><th>Total</th></tr>${items.map((i) => `<tr><td>${esc(i.name)}</td><td>${money(i.price_cents)}</td><td>${i.qty}</td><td>${money(i.price_cents * i.qty)}</td></tr>`).join('')}</table>
  ${totalsHtml({ sub: o.subtotal_cents, ship: o.shipping_cents, total: o.total_cents })}
  <h3>Delivery</h3><p>${esc(o.name)}<br>${esc(o.address)}<br>${esc(o.city)} ${esc(o.postcode)}<br>${esc(o.email)} ${esc(o.phone)}</p>${o.notes ? `<p><em>${esc(o.notes)}</em></p>` : ''}
  ${admin ? `<form class="row" id="status"><select name="status">${STATUSES.map((s) => `<option ${s === o.status ? 'selected' : ''}>${s}</option>`).join('')}</select><button class="btn alt">Update status</button></form>` : ''}`;
pages.order = async ([id], q) => {
  let o, items;
  if (q.get('k')) { const { data } = await sb.rpc('get_guest_order', { oid: Number(id), k: q.get('k') }); if (data) { o = data; items = data.items; } }
  else { o = (await sb.from('orders').select('*').eq('id', id).maybeSingle()).data; if (o) items = (await sb.from('order_items').select('*').eq('order_id', id)).data; }
  return o ? orderHtml(o, items, false) : '<h1>Order not found</h1>';
};

const authForm = (reg) => `<div class="narrow"><h1>${reg ? 'Create account' : 'Log in'}</h1><form id="auth" class="stack">
  ${reg ? '<label>Name<input name="name" required></label>' : ''}<label>Email<input type="email" name="email" required></label>
  <label>Password<input type="password" name="password" required minlength="${reg ? 8 : 1}"></label><button class="btn">${reg ? 'Sign up' : 'Log in'}</button></form>
  <p>${reg ? 'Have an account? <a href="#/login">Log in</a>' : 'New here? <a href="#/register">Create an account</a>'}</p></div>`;
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

const ordersTable = (os, base) => os.length ? `<table><tr><th>Order</th><th>Date</th><th>Status</th><th>Total</th></tr>${os.map((o) => `<tr><td><a href="${base}/${o.id}">#${o.id}</a>${base.includes('admin') ? ' · ' + esc(o.name) : ''}</td><td>${dateOf(o.created_at)}</td><td><span class="status ${esc(o.status)}">${esc(o.status)}</span></td><td>${money(o.total_cents)}</td></tr>`).join('')}</table>` : '<p>No orders yet.</p>';
pages.account = async () => {
  if (!session) { location.hash = '#/login'; return ''; }
  const { data } = await sb.from('orders').select('*').eq('user_id', session.user.id).order('id', { ascending: false });
  return `<h1>My account</h1><p>${esc(profile?.name)} · ${esc(session.user.email)}</p><h2>Order history</h2>${ordersTable(data, '#/order')}`;
};

pages.wishlist = async () => {
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

// ---- admin ----
const needAdmin = () => { if (!profile?.is_admin) { $app.innerHTML = '<h1>Forbidden</h1>'; return false; } return true; };
pages.admin = async ([sub, id]) => {
  if (!profile?.is_admin) return '<h1>Forbidden</h1>';
  if (sub === 'orders' && id) {
    const o = (await sb.from('orders').select('*').eq('id', id).single()).data;
    return orderHtml(o, (await sb.from('order_items').select('*').eq('order_id', id)).data, true);
  }
  if (sub === 'quotes') {
    const qs = (await sb.from('quotes').select('*').order('id', { ascending: false })).data;
    return `<h1>Quote requests</h1>${qs.length ? qs.map((x) => `<aside style="margin:10px 0"><b>${esc(x.name)}</b> · <a href="mailto:${esc(x.email)}">${esc(x.email)}</a> ${esc(x.phone)} · <span class="muted">${dateOf(x.created_at)}</span><p style="white-space:pre-wrap">${esc(x.message)}</p></aside>`).join('') : '<p>No requests yet.</p>'}`;
  }
  if (sub === 'orders') return `<h1>Orders</h1><p><button class="btn ghost" id="csv">⬇ Export CSV</button></p>${ordersTable((await sb.from('orders').select('*').order('id', { ascending: false })).data, '#/admin/orders')}`;
  if (sub === 'customers') {
    const us = (await sb.from('profiles').select('*').order('created_at', { ascending: false })).data;
    return `<h1>Customers</h1><table><tr><th>Name</th><th>Email</th><th>Joined</th></tr>${us.map((u) => `<tr><td>${esc(u.name)}${u.is_admin ? ' (admin)' : ''}</td><td>${esc(u.email)}</td><td>${dateOf(u.created_at)}</td></tr>`).join('')}</table>`;
  }
  if (sub === 'products' && (id === 'new' || id)) {
    const p = id === 'new' ? {} : (await sb.from('products').select('*').eq('id', id).single()).data;
    const t = (n, l, x = '') => `<label>${l}<input name="${n}" value="${esc(p[n] ?? '')}" ${x}></label>`;
    return `<h1>${p.id ? 'Edit product' : 'New product'}</h1><form id="pf" class="stack narrow" data-id="${p.id || ''}">${t('name', 'Name', 'required')}${t('category', 'Category', 'required')}
    <label>Description<textarea name="description" rows="5">${esc(p.description)}</textarea></label>
    <label>Price<input name="price" type="number" step="0.01" min="0" required value="${p.price_cents != null ? (p.price_cents / 100).toFixed(2) : ''}"></label>
    ${t('unit', 'Unit (e.g. bundle, roll)', 'required')}${t('r_value', 'R-value')}<label>Stock<input name="stock" type="number" min="0" required value="${p.stock ?? 0}"></label>
    ${p.image_url ? `<img src="${esc(safeUrl(p.image_url))}" alt="" style="max-width:160px;border-radius:10px">` : ''}
    <label>Photo (JPG, PNG, WebP, up to 5 MB)<input type="file" name="image" accept="image/jpeg,image/png,image/webp,image/gif"></label>
    <input type="hidden" name="image_url" value="${esc(p.image_url || '')}"><label class="check"><input type="checkbox" name="active" ${p.id && !p.active ? '' : 'checked'}> Visible in store</label><button class="btn">Save</button></form>`;
  }
  if (sub === 'products') {
    const ps = (await sb.from('products').select('*').order('name')).data;
    return `<h1>Products</h1><p><a class="btn" href="#/admin/products/new">+ New product</a></p><table><tr><th>Name</th><th>Category</th><th>Price</th><th>Stock</th><th>Status</th></tr>
    ${ps.map((p) => `<tr><td><a href="#/admin/products/${p.id}">${esc(p.name)}</a></td><td>${esc(p.category)}</td><td>${money(p.price_cents)}</td><td>${p.stock}</td><td>${p.active ? 'Live' : 'Hidden'}</td></tr>`).join('')}</table>`;
  }
  const [oc, pc, rev, cc, low] = await Promise.all([
    sb.from('orders').select('*', { count: 'exact', head: true }), sb.from('orders').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
    sb.from('orders').select('total_cents').neq('status', 'cancelled'), sb.from('profiles').select('*', { count: 'exact', head: true }).eq('is_admin', false),
    sb.from('products').select('*').lte('stock', 10).order('stock').limit(10)]);
  const revenue = rev.data.reduce((a, o) => a + o.total_cents, 0);
  return `<h1>Admin</h1><div class="stats"><div><b>${oc.count}</b>orders</div><div><b>${pc.count}</b>pending</div><div><b>${money(revenue)}</b>revenue</div><div><b>${cc.count}</b>customers</div></div>
  <p><a class="btn" href="#/admin/orders">Orders</a> <a class="btn" href="#/admin/products">Products</a> <a class="btn" href="#/admin/customers">Customers</a> <a class="btn" href="#/admin/quotes">Quotes</a></p>
  <h2>Low stock</h2>${low.data.length ? `<ul>${low.data.map((p) => `<li><a href="#/admin/products/${p.id}">${esc(p.name)}</a> — ${p.stock} left</li>`).join('')}</ul>` : '<p>All good.</p>'}`;
};
pages.admin.after = ([sub, id]) => {
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
  document.getElementById('pf')?.addEventListener('submit', async (e) => {
    e.preventDefault(); const f = Object.fromEntries(new FormData(e.target)), pid = e.target.dataset.id;
    const file = f.image; delete f.image;
    if (file && file.size) {
      if (file.size > 5 * 1024 * 1024) return fail(new Error('Photo must be under 5 MB.'));
      const path = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.]+/g, '-').slice(-60)}`;
      const up = await sb.storage.from('product-images').upload(path, file, { contentType: file.type });
      if (up.error) return fail(up.error);
      f.image_url = sb.storage.from('product-images').getPublicUrl(path).data.publicUrl;
    }
    const row = { name: f.name.trim(), category: f.category.trim(), description: f.description, price_cents: Math.round(parseFloat(f.price) * 100), unit: f.unit.trim(),
      r_value: f.r_value.trim(), stock: parseInt(f.stock, 10), image_url: safeUrl(f.image_url.trim()), active: !!f.active };
    if (!pid) row.slug = (row.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'product') + '-' + Math.floor(Math.random() * 1000);
    const { error } = pid ? await sb.from('products').update(row).eq('id', pid) : await sb.from('products').insert(row);
    error ? fail(error) : (flash('Product saved.'), (location.hash = '#/admin/products'));
  });
};

// ---- router ----
async function route() {
  const [path, qs] = (location.hash.slice(1) || '/').split('?'); const q = new URLSearchParams(qs || '');
  const [name = 'home', ...args] = path.split('/').filter(Boolean); const page = pages[name === '' ? 'home' : name];
  if (!page) { $app.innerHTML = '<h1>Not found</h1>'; return; }
  try { $app.innerHTML = await page(args, q); page.after?.(args, q); window.scrollTo(0, 0); } catch (e) { fail(e); $app.innerHTML = '<h1>Something went wrong</h1>'; }
}
window.addEventListener('hashchange', route);
sb.auth.onAuthStateChange((ev) => { if (ev === 'SIGNED_OUT') { session = null; profile = null; renderNav(); } });
loadSession().then(route);
