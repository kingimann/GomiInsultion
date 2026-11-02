import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, extname, normalize } from 'node:path';
import { openDb } from './db.js';
import { hashPassword, verifyPassword, createSessionStore, SESSION_SECONDS } from './auth.js';
import * as v from './views.js';
import { createHmac } from 'node:crypto';
import { stripeEnabled, createCheckoutSession, verifyWebhook } from './stripe.js';

const PUBLIC = join(fileURLToPath(new URL('.', import.meta.url)), '..', 'public');
const FREE_SHIP_CENTS = Number(process.env.FREE_SHIPPING_CENTS ?? 50000);
const SHIP_CENTS = Number(process.env.SHIPPING_CENTS ?? 1500);
const TYPES = { '.css': 'text/css', '.js': 'text/javascript', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };

export function createApp(db = openDb()) {
  const sessions = createSessionStore(db);
  const attempts = new Map(); // ip -> [timestamps] for login throttling

  const throttled = (ip) => {
    const now = Date.now();
    const list = (attempts.get(ip) || []).filter((t) => now - t < 15 * 60_000);
    attempts.set(ip, list);
    return list.length >= 10;
  };

  const handler = async (req, res) => {
    const url = new URL(req.url, 'http://x');
    const path = url.pathname;
    const method = req.method;

    // static files
    if (method === 'GET' && !path.includes('..') && extname(path)) {
      const f = normalize(join(PUBLIC, path));
      if (f.startsWith(PUBLIC) && existsSync(f)) {
        res.writeHead(200, { 'Content-Type': TYPES[extname(f)] || 'application/octet-stream', 'Cache-Control': 'public, max-age=3600' });
        return res.end(readFileSync(f));
      }
    }

    // session
    const cookies = Object.fromEntries((req.headers.cookie || '').split(/;\s*/).filter(Boolean).map((c) => { const i = c.indexOf('='); return [c.slice(0, i), c.slice(i + 1)]; }));
    let token = cookies.sid;
    let sess = sessions.get(token);
    if (!sess) { token = sessions.create(); sess = sessions.get(token); }
    const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
    const cookie = `sid=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_SECONDS}${secure}`;
    const user = sess.user_id ? db.prepare('SELECT id,email,name,is_admin FROM users WHERE id = ?').get(sess.user_id) : null;
    const cart = JSON.parse(sess.cart);
    const cartCount = Object.values(cart).reduce((a, b) => a + b, 0);

    let flashMsg = null;
    if (cookies.flash) { try { flashMsg = JSON.parse(decodeURIComponent(cookies.flash)); } catch {} }
    const extra = [];
    if (flashMsg) extra.push('flash=; Path=/; Max-Age=0');

    const send = (status, body, headers = {}) => {
      res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8', 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Set-Cookie': [cookie, ...extra], ...headers });
      res.end(String(body));
    };
    const page = (title, body, status = 200, flash = flashMsg) => send(status, v.layout({ title, user, cartCount, flash, body }));
    const redirect = (to, flash) => {
      if (flash) extra.push(`flash=${encodeURIComponent(JSON.stringify(flash))}; Path=/; Max-Age=60`);
      send(302, '', { Location: to });
    };
    const notFound = () => page('Not found', v.h`<h1>Not found</h1><p><a href="/">Back home</a></p>`, 404);

    // body
    let form = {};
    let rawBody = '';
    if (method === 'POST') {
      const chunks = []; let size = 0;
      for await (const c of req) { size += c.length; if (size > 100_000) { res.writeHead(413); return res.end(); } chunks.push(c); }
      rawBody = Buffer.concat(chunks).toString();
      form = Object.fromEntries(new URLSearchParams(rawBody));
      const origin = req.headers.origin;
      if (origin && new URL(origin).host !== req.headers.host) { res.writeHead(403); return res.end('Bad origin'); }
    }

    const getCartLines = () => {
      const lines = [];
      for (const [id, qty] of Object.entries(cart)) {
        const p = db.prepare('SELECT * FROM products WHERE id = ? AND active = 1').get(id);
        if (p && p.stock > 0) lines.push({ ...p, qty: Math.min(qty, p.stock) });
      }
      return lines;
    };
    const totalsOf = (lines) => {
      const subtotal = lines.reduce((a, l) => a + l.price_cents * l.qty, 0);
      const shipping = !lines.length || subtotal >= FREE_SHIP_CENTS ? 0 : SHIP_CENTS;
      return { subtotal, shipping, total: subtotal + shipping };
    };
    const requireAdmin = () => {
      if (!user) { redirect('/login?next=/admin'); return false; }
      if (!user.is_admin) { page('Forbidden', v.h`<h1>Forbidden</h1>`, 403); return false; }
      return true;
    };
    const login = (u) => { // rotate session on login to prevent fixation, keep cart
      const newToken = sessions.create(u.id);
      sessions.setCart(newToken, cart);
      sessions.destroy(token);
      extra.push(`sid=${newToken}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_SECONDS}${secure}`);
    };

    const safeNext = (n) => (typeof n === 'string' && /^\/[^/\\]/.test(n) ? n : '/account');
    let m;

    try {
      // ---------- storefront ----------
      if (method === 'GET' && path === '/') {
        const featured = db.prepare('SELECT * FROM products WHERE active = 1 ORDER BY id LIMIT 8').all();
        const cats = db.prepare('SELECT DISTINCT category FROM products WHERE active = 1 ORDER BY category').all().map((r) => r.category);
        return page('', v.home(featured, cats));
      }
      if (method === 'GET' && path === '/shop') {
        const category = url.searchParams.get('category') || '';
        const q = url.searchParams.get('q') || '';
        const like = `%${q.replace(/[%_]/g, '')}%`;
        const products = db.prepare(`SELECT * FROM products WHERE active = 1 AND (? = '' OR category = ?) AND (name LIKE ? OR description LIKE ? OR category LIKE ?) ORDER BY name`).all(category, category, like, like, like);
        const cats = db.prepare('SELECT DISTINCT category FROM products WHERE active = 1 ORDER BY category').all().map((r) => r.category);
        return page('Shop', v.shop(products, cats, { category, q }));
      }
      if (method === 'GET' && (m = path.match(/^\/product\/([\w-]+)$/))) {
        const p = db.prepare('SELECT * FROM products WHERE slug = ? AND active = 1').get(m[1]);
        return p ? page(p.name, v.product(p)) : notFound();
      }

      // ---------- cart ----------
      if (method === 'POST' && path === '/cart/add') {
        const p = db.prepare('SELECT * FROM products WHERE id = ? AND active = 1').get(form.id);
        const qty = Math.max(1, Math.min(999, parseInt(form.qty, 10) || 1));
        if (!p || p.stock < 1) return redirect('/shop', { type: 'error', msg: 'That product is unavailable.' });
        cart[p.id] = Math.min((cart[p.id] || 0) + qty, p.stock);
        sessions.setCart(token, cart);
        return redirect('/cart', { type: 'ok', msg: `Added ${p.name} to your cart.` });
      }
      if (method === 'GET' && path === '/cart') { const l = getCartLines(); return page('Cart', v.cart(l, totalsOf(l))); }
      if (method === 'POST' && path === '/cart/update') {
        for (const id of Object.keys(cart)) {
          const q = parseInt(form[`qty_${id}`], 10);
          if (Number.isFinite(q)) { if (q <= 0) delete cart[id]; else cart[id] = Math.min(q, 999); }
        }
        sessions.setCart(token, cart);
        return redirect('/cart');
      }

      // ---------- checkout ----------
      if (path === '/checkout') {
        const lines = getCartLines();
        if (!lines.length) return redirect('/cart', { type: 'error', msg: 'Your cart is empty.' });
        const totals = totalsOf(lines);
        if (method === 'GET') return page('Checkout', v.checkout(lines, totals, user));
        const need = ['name', 'email', 'address', 'city', 'postcode'];
        if (need.some((k) => !String(form[k] || '').trim()) || !/^\S+@\S+\.\S+$/.test(form.email)) {
          return page('Checkout', v.checkout(lines, totals, user, form), 400, { type: 'error', msg: 'Please fill in all required fields.' });
        }
        let orderId;
        db.exec('BEGIN IMMEDIATE');
        try {
          // re-check stock inside the transaction
          for (const l of lines) {
            const cur = db.prepare('SELECT stock FROM products WHERE id = ?').get(l.id);
            if (cur.stock < l.qty) throw Object.assign(new Error('stock'), { name: l.name });
          }
          const r = db.prepare(`INSERT INTO orders (user_id,email,name,phone,address,city,postcode,notes,subtotal_cents,shipping_cents,total_cents)
            VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(user?.id ?? null, form.email.trim(), form.name.trim(), (form.phone || '').trim(), form.address.trim(), form.city.trim(), form.postcode.trim(), (form.notes || '').trim(), totals.subtotal, totals.shipping, totals.total);
          orderId = Number(r.lastInsertRowid);
          for (const l of lines) {
            db.prepare('INSERT INTO order_items (order_id,product_id,name,price_cents,qty) VALUES (?,?,?,?,?)').run(orderId, l.id, l.name, l.price_cents, l.qty);
            db.prepare('UPDATE products SET stock = stock - ? WHERE id = ?').run(l.qty, l.id);
          }
          db.exec('COMMIT');
        } catch (e) {
          db.exec('ROLLBACK');
          if (e.message === 'stock') return redirect('/cart', { type: 'error', msg: `Sorry, ${e.name} no longer has enough stock.` });
          throw e;
        }
        sessions.setCart(token, {});
        const guestKey = `?k=${orderKey(orderId)}`;
        if (stripeEnabled()) {
          try {
            const origin = process.env.PUBLIC_URL || `http://${req.headers.host}`;
            const sUrl = await createCheckoutSession({ orderId, lines, shipping: totals.shipping, email: form.email.trim(), successUrl: `${origin}/order/${orderId}${guestKey}&paid=1`, cancelUrl: `${origin}/order/${orderId}${guestKey}` });
            return send(303, '', { Location: sUrl });
          } catch (e) {
            console.error('stripe', e);
            return redirect(`/order/${orderId}${guestKey}`, { type: 'error', msg: 'We could not start the payment. Your order is saved; we will contact you to arrange payment.' });
          }
        }
        return redirect(`/order/${orderId}${guestKey}`, { type: 'ok', msg: `Thanks! Order #${orderId} received. We'll email you an invoice shortly.` });
      }
      if (method === 'POST' && path === '/stripe/webhook') {
        const evt = verifyWebhook(rawBody, req.headers['stripe-signature']);
        if (!evt) { res.writeHead(400); return res.end('bad signature'); }
        const oid = evt.data?.object?.metadata?.order_id;
        const o = oid && db.prepare('SELECT * FROM orders WHERE id = ?').get(oid);
        if (o && evt.type === 'checkout.session.completed' && o.status === 'pending') {
          db.prepare("UPDATE orders SET status = 'paid' WHERE id = ?").run(o.id);
        } else if (o && evt.type === 'checkout.session.expired' && o.status === 'pending') {
          for (const i of db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(o.id)) db.prepare('UPDATE products SET stock = stock + ? WHERE id = ?').run(i.qty, i.product_id);
          db.prepare("UPDATE orders SET status = 'cancelled' WHERE id = ?").run(o.id);
        }
        res.writeHead(200); return res.end('ok');
      }
      if (method === 'GET' && (m = path.match(/^\/order\/(\d+)$/))) {
        const o = db.prepare('SELECT * FROM orders WHERE id = ?').get(m[1]);
        const allowed = o && ((user && (user.is_admin || o.user_id === user.id)) || url.searchParams.get('k') === orderKey(o.id));
        if (!allowed) return notFound();
        return page(`Order #${o.id}`, v.orderDetail(o, db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(o.id)));
      }

      // ---------- accounts ----------
      if (path === '/register') {
        if (method === 'GET') return page('Sign up', v.authForm('register'));
        const email = String(form.email || '').trim().toLowerCase();
        if (!form.name?.trim() || !/^\S+@\S+\.\S+$/.test(email) || (form.password || '').length < 8) {
          return page('Sign up', v.authForm('register', form), 400, { type: 'error', msg: 'Enter your name, a valid email and a password of 8+ characters.' });
        }
        if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(email)) {
          return page('Sign up', v.authForm('register', form), 400, { type: 'error', msg: 'An account with that email already exists.' });
        }
        const r = db.prepare('INSERT INTO users (email,name,password_hash) VALUES (?,?,?)').run(email, form.name.trim(), hashPassword(form.password));
        login({ id: Number(r.lastInsertRowid) });
        return redirect('/account', { type: 'ok', msg: 'Welcome! Your account is ready.' });
      }
      if (path === '/login') {
        if (method === 'GET') return page('Log in', v.authForm('login'));
        const ip = req.socket.remoteAddress;
        if (throttled(ip)) return page('Log in', v.authForm('login'), 429, { type: 'error', msg: 'Too many attempts. Try again later.' });
        const u = db.prepare('SELECT * FROM users WHERE email = ?').get(String(form.email || '').trim().toLowerCase());
        if (!u || !verifyPassword(form.password || '', u.password_hash)) {
          attempts.get(ip).push(Date.now());
          return page('Log in', v.authForm('login', { email: form.email }), 401, { type: 'error', msg: 'Incorrect email or password.' });
        }
        login(u);
        return redirect(safeNext(url.searchParams.get('next')), { type: 'ok', msg: 'Logged in.' });
      }
      if (method === 'POST' && path === '/logout') {
        sessions.destroy(token);
        extra.push(`sid=; HttpOnly; Path=/; Max-Age=0`);
        return redirect('/');
      }
      if (method === 'GET' && path === '/account') {
        if (!user) return redirect('/login');
        return page('My account', v.account(user, db.prepare('SELECT * FROM orders WHERE user_id = ? ORDER BY id DESC').all(user.id)));
      }

      // ---------- admin ----------
      if (path.startsWith('/admin')) {
        if (!requireAdmin()) return;
        if (method === 'GET' && path === '/admin') {
          const stats = {
            orders: db.prepare('SELECT COUNT(*) c FROM orders').get().c,
            pending: db.prepare("SELECT COUNT(*) c FROM orders WHERE status = 'pending'").get().c,
            revenue: db.prepare("SELECT COALESCE(SUM(total_cents),0) s FROM orders WHERE status NOT IN ('cancelled')").get().s,
            customers: db.prepare('SELECT COUNT(*) c FROM users WHERE is_admin = 0').get().c,
          };
          return page('Admin', v.adminHome(stats, db.prepare('SELECT * FROM products WHERE stock <= 10 ORDER BY stock LIMIT 10').all()));
        }
        if (method === 'GET' && path === '/admin/orders') return page('Orders', v.h`<h1>Orders</h1>${v.orderList(db.prepare('SELECT * FROM orders ORDER BY id DESC').all(), '/admin/orders')}`);
        if ((m = path.match(/^\/admin\/orders\/(\d+)$/))) {
          const o = db.prepare('SELECT * FROM orders WHERE id = ?').get(m[1]);
          if (!o) return notFound();
          if (method === 'POST') {
            if (!v.STATUSES.includes(form.status)) return redirect(path, { type: 'error', msg: 'Invalid status.' });
            if (form.status === 'cancelled' && o.status !== 'cancelled') { // restock
              for (const i of db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(o.id)) db.prepare('UPDATE products SET stock = stock + ? WHERE id = ?').run(i.qty, i.product_id);
            } else if (o.status === 'cancelled' && form.status !== 'cancelled') {
              for (const i of db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(o.id)) db.prepare('UPDATE products SET stock = MAX(0, stock - ?) WHERE id = ?').run(i.qty, i.product_id);
            }
            db.prepare('UPDATE orders SET status = ? WHERE id = ?').run(form.status, o.id);
            return redirect(path, { type: 'ok', msg: 'Order updated.' });
          }
          return page(`Order #${o.id}`, v.orderDetail(o, db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(o.id), { admin: true }));
        }
        if (method === 'GET' && path === '/admin/customers') {
          return page('Customers', v.adminCustomers(db.prepare('SELECT u.*, (SELECT COUNT(*) FROM orders o WHERE o.user_id = u.id) orders FROM users u ORDER BY u.id DESC').all()));
        }
        if (method === 'GET' && path === '/admin/products') return page('Products', v.adminProducts(db.prepare('SELECT * FROM products ORDER BY name').all()));
        m = null;
        if (path === '/admin/products/new' || (m = path.match(/^\/admin\/products\/(\d+)$/))) {
          const existing = m ? db.prepare('SELECT * FROM products WHERE id = ?').get(m[1]) : null;
          if (m && !existing) return notFound();
          if (method === 'GET') return page(existing ? 'Edit product' : 'New product', v.productForm(existing || {}));
          const price = Math.round(parseFloat(form.price) * 100);
          const stock = parseInt(form.stock, 10);
          if (!form.name?.trim() || !form.category?.trim() || !form.unit?.trim() || !(price >= 0) || !(stock >= 0)) {
            return page('Product', v.productForm({ ...form, price_cents: price, id: existing?.id }), 400, { type: 'error', msg: 'Check the required fields.' });
          }
          const imageUrl = /^(https?:\/\/|\/)/.test(form.image_url || '') ? form.image_url.trim() : '';
          const vals = [form.name.trim(), form.category.trim(), form.description || '', price, form.unit.trim(), (form.r_value || '').trim(), stock, imageUrl, form.active ? 1 : 0];
          if (existing) {
            db.prepare('UPDATE products SET name=?,category=?,description=?,price_cents=?,unit=?,r_value=?,stock=?,image_url=?,active=? WHERE id=?').run(...vals, existing.id);
          } else {
            let slug = form.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'product';
            while (db.prepare('SELECT 1 FROM products WHERE slug = ?').get(slug)) slug += '-' + Math.floor(Math.random() * 1000);
            db.prepare('INSERT INTO products (name,category,description,price_cents,unit,r_value,stock,image_url,active,slug) VALUES (?,?,?,?,?,?,?,?,?,?)').run(...vals, slug);
          }
          return redirect('/admin/products', { type: 'ok', msg: 'Product saved.' });
        }
      }

      return notFound();
    } catch (err) {
      console.error(err);
      if (res.headersSent) return res.end();
      return page('Error', v.h`<h1>Something went wrong</h1>`, 500);
    }
  };

  const secret = db.prepare("SELECT value FROM settings WHERE key = 'order_secret'").get().value;
  function orderKey(id) { return createHmacHex(secret, String(id)); }

  const server = createServer(handler);
  const timer = setInterval(() => sessions.sweep(), 3600_000); timer.unref();
  return server;
}

function createHmacHex(secret, data) { return createHmac('sha256', secret).update(data).digest('hex').slice(0, 24); }

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 3000);
  createApp().listen(port, () => console.log(`Gomi Insulation store running at http://localhost:${port}`));
}
