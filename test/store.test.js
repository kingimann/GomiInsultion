import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
process.env.NODE_ENV = 'test';
process.env.ADMIN_EMAIL = 'boss@x.com';
process.env.ADMIN_PASSWORD = 'adminpass123';
const { openDb } = await import('../src/db.js');
const { createApp } = await import('../src/server.js');

let server, base;
before(async () => {
  server = createApp(openDb(':memory:'));
  await new Promise((r) => server.listen(0, r));
  base = `http://localhost:${server.address().port}`;
});
after(() => { server.closeAllConnections(); server.close(); });

function client() {
  let sid = '';
  return async (path, opts = {}) => {
    const body = opts.form ? new URLSearchParams(opts.form).toString() : undefined;
    const res = await fetch(base + path, { method: opts.form ? 'POST' : 'GET', redirect: 'manual', body, signal: AbortSignal.timeout(5000),
      headers: { cookie: sid, ...(body ? { 'content-type': 'application/x-www-form-urlencoded' } : {}) } });
    for (const c of res.headers.getSetCookie()) if (c.startsWith('sid=')) sid = c.split(';')[0].startsWith('sid=;') ? '' : c.split(';')[0];
    return { status: res.status, loc: res.headers.get('location'), text: await res.text() };
  };
}

test('catalog and search', async () => {
  const c = client();
  assert.match((await c('/')).text, /Gomi Insulation/);
  assert.match((await c('/shop?q=spray')).text, /Spray Foam/);
  assert.equal((await c('/product/nope')).status, 404);
});

test('register, cart, checkout, order history', async () => {
  const c = client();
  assert.equal((await c('/register', { form: { name: 'Sam', email: 'sam@x.com', password: 'password1' } })).status, 302);
  assert.match((await c('/account')).text, /sam@x.com/);
  await c('/cart/add', { form: { id: 1, qty: 3 } });
  assert.match((await c('/cart')).text, /Fiberglass Batts R-13/);
  const r = await c('/checkout', { form: { name: 'Sam', email: 'sam@x.com', address: '1 Main', city: 'X', postcode: '123' } });
  assert.match(r.loc, /^\/order\/1/);
  assert.match((await c('/account')).text, /#1/);
  assert.match((await c('/product/fiberglass-batts-r13')).text, /In stock/);
});

test('guest cannot see orders or admin', async () => {
  const c = client();
  assert.equal((await c('/order/1')).status, 404);
  assert.equal((await c('/admin')).status, 302);
});

test('admin login, edit product, update order, XSS escaped', async () => {
  const c = client();
  await c('/login', { form: { email: 'boss@x.com', password: 'adminpass123' } });
  assert.equal((await c('/admin')).status, 200);
  const r = await c('/admin/products/new', { form: { name: '<script>x</script>', category: 'Test', price: '9.99', unit: 'each', stock: '5', active: 'on' } });
  assert.equal(r.status, 302);
  const list = (await c('/admin/products')).text;
  assert.ok(!list.includes('<script>x'));
  assert.match(list, /&lt;script&gt;/);
  assert.equal((await c('/admin/orders/1', { form: { status: 'shipped' } })).status, 302);
  assert.match((await c('/admin/orders/1')).text, /shipped/);
});

test('bad login rejected; customer blocked from admin', async () => {
  const c = client();
  assert.equal((await c('/login', { form: { email: 'sam@x.com', password: 'wrong' } })).status, 401);
  await c('/login', { form: { email: 'sam@x.com', password: 'password1' } });
  assert.equal((await c('/admin')).status, 403);
});

test('stripe webhook marks order paid; rejects bad signature', async () => {
  const { createHmac } = await import('node:crypto');
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test';
  const c = client();
  await c('/cart/add', { form: { id: 2, qty: 1 } });
  const r = await c('/checkout', { form: { name: 'P', email: 'p@x.com', address: 'a', city: 'c', postcode: '1' } });
  const id = r.loc.match(/order\/(\d+)/)[1];
  const raw = JSON.stringify({ type: 'checkout.session.completed', data: { object: { metadata: { order_id: id } } } });
  const t = Math.floor(Date.now() / 1000);
  const sig = createHmac('sha256', 'whsec_test').update(`${t}.${raw}`).digest('hex');
  const hook = (s) => fetch(`${base}/stripe/webhook`, { method: 'POST', body: raw, headers: { 'stripe-signature': `t=${t},v1=${s}` } });
  assert.equal((await hook('0'.repeat(64))).status, 400);
  assert.equal((await hook(sig)).status, 200);
  const admin = client();
  await admin('/login', { form: { email: 'boss@x.com', password: 'adminpass123' } });
  assert.match((await admin(`/admin/orders/${id}`)).text, /status paid/);
});
