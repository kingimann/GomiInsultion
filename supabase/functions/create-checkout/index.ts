// Creates a Stripe Checkout session for an existing pending order.
// Prices come from the database order, never from the browser.
import { createClient } from 'npm:@supabase/supabase-js@2';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const { order_id, key } = await req.json();
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data: order } = await admin.from('orders').select('*, order_items(*)').eq('id', order_id).maybeSingle();
    if (!order || order.status !== 'pending') return json({ error: 'Order not payable' }, 400);

    let allowed = key && key === order.guest_key;
    if (!allowed && order.user_id) {
      const token = (req.headers.get('Authorization') || '').replace('Bearer ', '');
      const { data } = await admin.auth.getUser(token);
      allowed = data.user?.id === order.user_id;
    }
    if (!allowed) return json({ error: 'Not allowed' }, 403);

    const site = Deno.env.get('SITE_URL')!.replace(/\/$/, '');
    const cur = (Deno.env.get('CURRENCY') || 'usd').toLowerCase();
    const p = new URLSearchParams({
      mode: 'payment', customer_email: order.email, 'metadata[order_id]': String(order.id),
      success_url: `${site}/#/order/${order.id}?${key ? `k=${key}&` : ''}paid=1`,
      cancel_url: `${site}/#/order/${order.id}${key ? `?k=${key}` : ''}`,
      expires_at: String(Math.floor(Date.now() / 1000) + 31 * 60),
    });
    const lines = order.order_items.map((i: any) => ({ name: i.name, amount: i.price_cents, qty: i.qty }));
    if (order.shipping_cents) lines.push({ name: 'Shipping', amount: order.shipping_cents, qty: 1 });
    lines.forEach((l: any, n: number) => {
      p.set(`line_items[${n}][quantity]`, String(l.qty));
      p.set(`line_items[${n}][price_data][currency]`, cur);
      p.set(`line_items[${n}][price_data][unit_amount]`, String(l.amount));
      p.set(`line_items[${n}][price_data][product_data][name]`, l.name);
    });
    const r = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST', body: p,
      headers: { Authorization: `Bearer ${Deno.env.get('STRIPE_SECRET_KEY')}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    });
    const s = await r.json();
    if (!r.ok) return json({ error: s.error?.message || 'Stripe error' }, 502);
    return json({ url: s.url });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
