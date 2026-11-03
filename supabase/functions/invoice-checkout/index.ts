// Creates a Stripe Checkout session so a customer can pay an invoice online (their private invoice link is the credential).
import { createClient } from 'npm:@supabase/supabase-js@2';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const { invoice_id, key, amount_cents } = await req.json();
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data: inv } = await admin.from('invoices').select('*').eq('id', invoice_id).maybeSingle();
    if (!inv || inv.view_key !== key || inv.status !== 'sent') return json({ error: 'Invoice not payable' }, 400);
    const balance = inv.total_cents - inv.paid_cents;
    if (balance < 50) return json({ error: 'Nothing to pay' }, 400);
    // partial payments: allowed unless the owner switched them off in Settings
    const { data: st } = await admin.from('site_settings').select('value').eq('key', 'store').maybeSingle();
    const allowPartial = st?.value?.invoice_allow_partial !== false;
    let amount = balance;
    if (allowPartial && amount_cents != null) {
      amount = Math.round(Number(amount_cents));
      if (!Number.isFinite(amount) || amount < 50) return json({ error: 'The minimum online payment is 0.50' }, 400);
      if (amount > balance) return json({ error: 'That is more than the balance due' }, 400);
      if (balance - amount > 0 && balance - amount < 50) return json({ error: 'The remaining balance would be too small to pay online — please pay the full balance' }, 400);
    }
    const site = Deno.env.get('SITE_URL')!.replace(/\/$/, '');
    const p = new URLSearchParams({
      mode: 'payment', 'metadata[invoice_id]': String(inv.id), 'payment_intent_data[metadata][invoice_id]': String(inv.id),
      success_url: `${site}/#/invoice/${inv.id}?k=${key}&paid=1`, cancel_url: `${site}/#/invoice/${inv.id}?k=${key}`,
      'line_items[0][quantity]': '1', 'line_items[0][price_data][currency]': (Deno.env.get('CURRENCY') || 'usd').toLowerCase(),
      'line_items[0][price_data][unit_amount]': String(amount), 'line_items[0][price_data][product_data][name]': `Invoice ${inv.number}${amount < balance ? ' (partial payment)' : ''}`,
    });
    if (inv.customer_email) p.set('customer_email', inv.customer_email);
    const r = await fetch('https://api.stripe.com/v1/checkout/sessions', { method: 'POST', body: p,
      headers: { Authorization: `Bearer ${Deno.env.get('STRIPE_SECRET_KEY')}`, 'Content-Type': 'application/x-www-form-urlencoded' } });
    const s = await r.json();
    if (!r.ok) return json({ error: s.error?.message || 'Stripe error' }, 502);
    return json({ url: s.url });
  } catch (e) { return json({ error: String(e) }, 500); }
});
