import { h, raw, money } from './html.js';
export { h };

export const STATUSES = ['pending', 'paid', 'shipped', 'delivered', 'cancelled'];
export const STORE = process.env.STORE_NAME || 'Gomi Insulation';

export function layout({ title, user, cartCount = 0, flash, body }) {
  return h`<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title ? `${title} · ` : ''}${STORE}</title>
<link rel="stylesheet" href="/style.css"></head>
<body>
<header class="top"><div class="wrap bar">
  <a class="brand" href="/">🏠 ${STORE}</a>
  <form class="search" action="/shop"><input name="q" placeholder="Search insulation…" aria-label="Search"></form>
  <nav>
    <a href="/shop">Shop</a>
    ${user ? h`${user.is_admin ? h`<a href="/admin">Admin</a>` : ''}<a href="/account">${user.name.split(' ')[0]}</a>
      <form method="post" action="/logout" class="inline"><button class="link">Log out</button></form>`
      : h`<a href="/login">Log in</a><a href="/register">Sign up</a>`}
    <a class="cart" href="/cart">Cart (${cartCount})</a>
  </nav></div></header>
${flash ? h`<div class="wrap"><p class="flash ${flash.type}">${flash.msg}</p></div>` : ''}
<main class="wrap">${body}</main>
<footer><div class="wrap">© ${new Date().getFullYear()} ${STORE} · Quality insulation, delivered.</div></footer>
</body></html>`;
}

export const productCard = (p) => h`<article class="card">
  <a href="/product/${p.slug}">${imageOf(p)}</a>
  <div class="pad"><span class="tag">${p.category}</span>
  <h3><a href="/product/${p.slug}">${p.name}</a></h3>
  <p class="muted">${p.r_value ? `${p.r_value} · ` : ''}per ${p.unit}</p>
  <p class="price">${money(p.price_cents)}</p></div></article>`;

export const imageOf = (p, big = false) => p.image_url
  ? h`<img class="${big ? 'big' : ''}" src="${p.image_url}" alt="${p.name}" loading="lazy">`
  : h`<div class="ph ${big ? 'big' : ''}">${p.r_value || '🧱'}</div>`;

export function home(products, categories) {
  return h`<section class="hero"><h1>Insulation for every build.</h1>
  <p>Batts, spray foam, rigid board and more. Order online and get it delivered to your site.</p>
  <a class="btn" href="/shop">Shop all products</a></section>
  <h2>Shop by category</h2>
  <div class="chips">${categories.map((c) => h`<a class="chip" href="/shop?category=${encodeURIComponent(c)}">${c}</a>`)}</div>
  <h2>Featured</h2><div class="grid">${products.map(productCard)}</div>`;
}

export function shop(products, categories, { category, q }) {
  return h`<h1>${category || 'All products'}</h1>
  <div class="chips"><a class="chip ${!category ? 'on' : ''}" href="/shop">All</a>
  ${categories.map((c) => h`<a class="chip ${c === category ? 'on' : ''}" href="/shop?category=${encodeURIComponent(c)}">${c}</a>`)}</div>
  ${q ? h`<p class="muted">Results for “${q}”</p>` : ''}
  ${products.length ? h`<div class="grid">${products.map(productCard)}</div>` : h`<p>No products found.</p>`}`;
}

export function product(p) {
  const max = Math.min(p.stock, 999);
  return h`<div class="detail"><div>${imageOf(p, true)}</div><div>
  <span class="tag">${p.category}</span><h1>${p.name}</h1>
  <p class="price big">${money(p.price_cents)} <small>per ${p.unit}</small></p>
  ${p.r_value ? h`<p><strong>R-value:</strong> ${p.r_value}</p>` : ''}
  <p>${p.description}</p>
  ${p.stock > 0 ? h`<form method="post" action="/cart/add" class="row">
    <input type="hidden" name="id" value="${p.id}">
    <input type="number" name="qty" value="1" min="1" max="${max}" aria-label="Quantity">
    <button class="btn">Add to cart</button></form>
    <p class="muted">${p.stock <= 10 ? `Only ${p.stock} left` : 'In stock'}</p>`
    : h`<p class="flash error">Out of stock</p>`}
  </div></div>`;
}

export function cart(lines, totals) {
  if (!lines.length) return h`<h1>Your cart</h1><p>Your cart is empty. <a href="/shop">Keep shopping</a></p>`;
  return h`<h1>Your cart</h1>
  <form method="post" action="/cart/update"><table>
  <tr><th>Product</th><th>Price</th><th>Qty</th><th>Total</th></tr>
  ${lines.map((l) => h`<tr><td><a href="/product/${l.slug}">${l.name}</a></td><td>${money(l.price_cents)}</td>
    <td><input type="number" name="qty_${l.id}" value="${l.qty}" min="0" max="${l.stock}"></td>
    <td>${money(l.price_cents * l.qty)}</td></tr>`)}
  </table><button class="btn alt">Update quantities</button> <span class="muted">(set 0 to remove)</span></form>
  ${totalsBlock(totals)}
  <a class="btn" href="/checkout">Checkout</a>`;
}

const totalsBlock = (t) => h`<dl class="totals"><dt>Subtotal</dt><dd>${money(t.subtotal)}</dd>
  <dt>Shipping</dt><dd>${t.shipping ? money(t.shipping) : 'Free'}</dd>
  <dt>Total</dt><dd><strong>${money(t.total)}</strong></dd></dl>`;

export function checkout(lines, totals, user, v = {}) {
  const f = (name, label, def = '', extra = '') => h`<label>${label}<input name="${name}" value="${v[name] ?? def ?? ''}" ${raw(extra)}></label>`;
  return h`<h1>Checkout</h1><div class="two">
  <form method="post" action="/checkout" class="stack">
    ${f('name', 'Full name', user?.name, 'required')}
    ${f('email', 'Email', user?.email, 'type="email" required')}
    ${f('phone', 'Phone')}
    ${f('address', 'Delivery address', '', 'required')}
    ${f('city', 'City', '', 'required')}
    ${f('postcode', 'Postal / ZIP code', '', 'required')}
    <label>Order notes<textarea name="notes">${v.notes ?? ''}</textarea></label>
    <p class="muted">${process.env.STRIPE_SECRET_KEY ? 'You will be taken to a secure Stripe page to pay by card.' : "Payment: we'll email you an invoice and payment options once your order is confirmed."}</p>
    <button class="btn">${process.env.STRIPE_SECRET_KEY ? 'Continue to payment' : 'Place order'}</button></form>
  <aside><h3>Order summary</h3>
  <ul>${lines.map((l) => h`<li>${l.qty} × ${l.name} <span>${money(l.qty * l.price_cents)}</span></li>`)}</ul>
  ${totalsBlock(totals)}</aside></div>`;
}

export function orderDetail(o, items, { admin } = {}) {
  return h`<h1>Order #${o.id}</h1>
  <p><span class="status ${o.status}">${o.status}</span> · placed ${o.created_at} UTC</p>
  <table><tr><th>Item</th><th>Price</th><th>Qty</th><th>Total</th></tr>
  ${items.map((i) => h`<tr><td>${i.name}</td><td>${money(i.price_cents)}</td><td>${i.qty}</td><td>${money(i.price_cents * i.qty)}</td></tr>`)}</table>
  ${totalsBlock({ subtotal: o.subtotal_cents, shipping: o.shipping_cents, total: o.total_cents })}
  <h3>Delivery</h3><p>${o.name}<br>${o.address}<br>${o.city} ${o.postcode}<br>${o.email} ${o.phone}</p>
  ${o.notes ? h`<p><em>${o.notes}</em></p>` : ''}
  ${admin ? h`<form method="post" action="/admin/orders/${o.id}" class="row"><select name="status">
    ${STATUSES.map((s) => h`<option ${s === o.status ? raw('selected') : ''}>${s}</option>`)}</select>
    <button class="btn alt">Update status</button></form>` : ''}`;
}

export function authForm(kind, v = {}) {
  const reg = kind === 'register';
  return h`<div class="narrow"><h1>${reg ? 'Create account' : 'Log in'}</h1>
  <form method="post" class="stack">
    ${reg ? h`<label>Name<input name="name" required value="${v.name ?? ''}"></label>` : ''}
    <label>Email<input type="email" name="email" required value="${v.email ?? ''}"></label>
    <label>Password<input type="password" name="password" required ${reg ? raw('minlength="8"') : ''}></label>
    <button class="btn">${reg ? 'Sign up' : 'Log in'}</button></form>
  <p>${reg ? h`Have an account? <a href="/login">Log in</a>` : h`New here? <a href="/register">Create an account</a>`}</p></div>`;
}

export const orderList = (orders, base) => orders.length ? h`<table>
  <tr><th>Order</th><th>Date</th><th>Status</th><th>Total</th></tr>
  ${orders.map((o) => h`<tr><td><a href="${base}/${o.id}">#${o.id}</a>${o.name ? h` · ${o.name}` : ''}</td><td>${o.created_at}</td>
  <td><span class="status ${o.status}">${o.status}</span></td><td>${money(o.total_cents)}</td></tr>`)}</table>` : h`<p>No orders yet.</p>`;

export const account = (user, orders) => h`<h1>My account</h1><p>${user.name} · ${user.email}</p><h2>Order history</h2>${orderList(orders, '/order')}`;

export function adminHome(stats, low) {
  return h`<h1>Admin</h1><div class="stats">
  <div><b>${stats.orders}</b>orders</div><div><b>${stats.pending}</b>pending</div>
  <div><b>${money(stats.revenue)}</b>revenue</div><div><b>${stats.customers}</b>customers</div></div>
  <p><a class="btn" href="/admin/orders">Orders</a> <a class="btn" href="/admin/products">Products</a> <a class="btn" href="/admin/customers">Customers</a></p>
  <h2>Low stock</h2>${low.length ? h`<ul>${low.map((p) => h`<li><a href="/admin/products/${p.id}">${p.name}</a> — ${p.stock} left</li>`)}</ul>` : h`<p>All good.</p>`}`;
}

export const adminProducts = (ps) => h`<h1>Products</h1><p><a class="btn" href="/admin/products/new">+ New product</a></p>
  <table><tr><th>Name</th><th>Category</th><th>Price</th><th>Stock</th><th>Status</th></tr>
  ${ps.map((p) => h`<tr><td><a href="/admin/products/${p.id}">${p.name}</a></td><td>${p.category}</td>
  <td>${money(p.price_cents)}</td><td>${p.stock}</td><td>${p.active ? 'Live' : 'Hidden'}</td></tr>`)}</table>`;

export function productForm(p = {}) {
  const t = (n, l, extra = '') => h`<label>${l}<input name="${n}" value="${p[n] ?? ''}" ${raw(extra)}></label>`;
  return h`<h1>${p.id ? 'Edit product' : 'New product'}</h1>
  <form method="post" class="stack narrow">
    ${t('name', 'Name', 'required')}${t('category', 'Category', 'required')}
    <label>Description<textarea name="description" rows="5">${p.description ?? ''}</textarea></label>
    <label>Price<input name="price" type="number" step="0.01" min="0" required value="${p.price_cents != null ? (p.price_cents / 100).toFixed(2) : ''}"></label>
    ${t('unit', 'Unit (e.g. bundle, roll)', 'required')}${t('r_value', 'R-value')}
    <label>Stock<input name="stock" type="number" min="0" required value="${p.stock ?? 0}"></label>
    ${t('image_url', 'Image URL (optional)')}
    <label class="check"><input type="checkbox" name="active" ${p.id && !p.active ? '' : raw('checked')}> Visible in store</label>
    <button class="btn">Save</button></form>`;
}

export const adminCustomers = (us) => h`<h1>Customers</h1><table><tr><th>Name</th><th>Email</th><th>Orders</th><th>Joined</th></tr>
  ${us.map((u) => h`<tr><td>${u.name}${u.is_admin ? ' (admin)' : ''}</td><td>${u.email}</td><td>${u.orders}</td><td>${u.created_at}</td></tr>`)}</table>`;
