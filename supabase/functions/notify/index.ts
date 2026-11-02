// Sends transactional emails through Resend. Called by Postgres triggers (see supabase/schema.sql) with a shared secret.
// Secrets: RESEND_API_KEY, FROM_EMAIL (e.g. "Gomi Insulation <orders@yourdomain.com>"), ADMIN_EMAIL, NOTIFY_SECRET, SITE_URL
// Deploy with --no-verify-jwt (we authenticate with x-notify-secret instead).
import { createClient } from 'npm:@supabase/supabase-js@2';

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const money = (c: number) => `$${(c / 100).toFixed(2)}`;

async function send(to: string, subject: string, html: string, replyTo?: string) {
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${Deno.env.get('RESEND_API_KEY')}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: Deno.env.get('FROM_EMAIL'), to, subject, html, ...(replyTo ? { reply_to: replyTo } : {}) }),
  });
  if (!r.ok) console.error('resend', r.status, await r.text());
}

Deno.serve(async (req) => {
  if (req.headers.get('x-notify-secret') !== Deno.env.get('NOTIFY_SECRET')) return new Response('forbidden', { status: 403 });
  const body = await req.json();
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const site = (Deno.env.get('SITE_URL') || '').replace(/\/$/, '');
  const owner = Deno.env.get('ADMIN_EMAIL')!;

  if (body.kind === 'low_stock') {
    const { data: p } = await admin.from('products').select('name,stock').eq('id', body.product_id).single();
    if (p) await send(owner, `Low stock: ${p.name}`, `<p><b>${esc(p.name)}</b> is down to <b>${p.stock}</b> in stock.</p><p><a href="${site}/#/admin/products">Manage products</a></p>`);
    return new Response('ok');
  }

  if (body.kind === 'form_submitted') {
    const { data: sub } = await admin.from('form_submissions').select('*, forms(*)').eq('id', body.submission_id).single();
    if (!sub) return new Response('no submission', { status: 404 });
    const fields = sub.forms.fields as any[];
    const rows = fields.map((f) => {
      let v = sub.data[f.id]; if (f.type === 'checkbox') v = v ? 'Yes' : 'No';
      if (f.type === 'file' && v) v = `${String(v).split('/').pop()!.replace(/^[0-9a-f-]{36}-/, '')} (download from the admin page)`;
      return `<tr><td valign="top"><b>${esc(f.label)}</b></td><td style="white-space:pre-wrap">${esc(v ?? '')}</td></tr>`;
    }).join('');
    const replyTo = fields.filter((f) => f.type === 'email').map((f) => sub.data[f.id]).find((v) => v);
    await send(owner, `New response: ${sub.forms.title}`, `<h2>New response to "${esc(sub.forms.title)}"</h2><table cellpadding="6">${rows}</table><p><a href="${site}/#/admin/forms/${sub.form_id}/responses">Open responses</a></p>`, replyTo);
    return new Response('ok');
  }

  const { data: o } = await admin.from('orders').select('*, order_items(*)').eq('id', body.order_id).single();
  if (!o) return new Response('no order', { status: 404 });
  const link = `${site}/#/order/${o.id}?k=${o.guest_key}`;
  const rows = o.order_items.map((i: any) => `<tr><td>${esc(i.name)}</td><td>${i.qty}</td><td>${money(i.price_cents * i.qty)}</td></tr>`).join('');
  const table = `<table cellpadding="6" style="border-collapse:collapse"><tr><th align="left">Item</th><th>Qty</th><th align="right">Total</th></tr>${rows}</table>
    ${o.discount_cents ? `<p>Discount: −${money(o.discount_cents)}</p>` : ''}<p>Shipping: ${money(o.shipping_cents)}<br><b>Total: ${money(o.total_cents)}</b></p>`;

  if (body.kind === 'order_created') {
    await send(o.email, `We got your order #${o.id}`, `<h2>Thanks, ${esc(o.name)}!</h2><p>We received order #${o.id}.</p>${table}<p>Delivering to ${esc(o.address)}, ${esc(o.city)} ${esc(o.postcode)}.</p><p><a href="${link}">View your order</a></p>`);
    await send(owner, `New order #${o.id} · ${money(o.total_cents)}`, `<p>${esc(o.name)} (${esc(o.email)}, ${esc(o.phone)}) placed an order.</p>${table}<p><a href="${site}/#/admin/orders/${o.id}">Open in admin</a></p>`);
  } else if (['order_paid', 'order_shipped', 'order_delivered'].includes(body.kind)) {
    const what = { order_paid: 'Payment received', order_shipped: 'Your order has shipped', order_delivered: 'Your order was delivered' }[body.kind as string];
    await send(o.email, `${what} · order #${o.id}`, `<h2>${what}</h2><p>Order #${o.id} is now <b>${body.kind.replace('order_', '')}</b>.</p><p><a href="${link}">View your order</a></p>`);
  }
  return new Response('ok');
});
