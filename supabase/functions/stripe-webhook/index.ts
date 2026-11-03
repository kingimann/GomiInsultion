// Receives Stripe events. Deploy with --no-verify-jwt (Stripe has no Supabase token); we verify Stripe's signature instead.
import { createClient } from 'npm:@supabase/supabase-js@2';

const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');

async function verify(raw: string, header: string | null, secret: string) {
  if (!header) return false;
  const parts = Object.fromEntries(header.split(',').map((x) => x.split('=')));
  if (!parts.t || !parts.v1 || Math.abs(Date.now() / 1000 - Number(parts.t)) > 300) return false;
  const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const expected = hex(await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(`${parts.t}.${raw}`)));
  if (expected.length !== parts.v1.length) return false;
  let diff = 0; for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ parts.v1.charCodeAt(i);
  return diff === 0;
}

Deno.serve(async (req) => {
  const raw = await req.text();
  if (!(await verify(raw, req.headers.get('stripe-signature'), Deno.env.get('STRIPE_WEBHOOK_SECRET')!))) return new Response('bad signature', { status: 400 });
  const evt = JSON.parse(raw);
  const iid = Number(evt.data?.object?.metadata?.invoice_id);
  if (iid && evt.type === 'checkout.session.completed') {
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    await admin.rpc('record_invoice_payment_system', { iid, amount: Number(evt.data.object.amount_total) || 0, pay_method: 'Card (Stripe)', ref: String(evt.data.object.id) });
  }
  const oid = Number(evt.data?.object?.metadata?.order_id);
  if (oid) {
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    if (evt.type === 'checkout.session.completed') await admin.rpc('mark_order_paid', { oid });
    if (evt.type === 'checkout.session.expired') await admin.rpc('cancel_unpaid_order', { oid });
  }
  return new Response('ok');
});
