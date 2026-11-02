// Minimal Stripe Checkout integration using fetch (no SDK needed).
import { createHmac, timingSafeEqual } from 'node:crypto';

export const stripeEnabled = () => Boolean(process.env.STRIPE_SECRET_KEY);

export async function createCheckoutSession({ orderId, lines, shipping, email, successUrl, cancelUrl }) {
  const cur = (process.env.CURRENCY || 'usd').toLowerCase();
  const p = new URLSearchParams({ mode: 'payment', success_url: successUrl, cancel_url: cancelUrl, customer_email: email, 'metadata[order_id]': String(orderId) });
  const items = lines.map((l) => ({ name: l.name, amount: l.price_cents, qty: l.qty }));
  if (shipping) items.push({ name: 'Shipping', amount: shipping, qty: 1 });
  items.forEach((it, i) => {
    p.set(`line_items[${i}][quantity]`, String(it.qty));
    p.set(`line_items[${i}][price_data][currency]`, cur);
    p.set(`line_items[${i}][price_data][unit_amount]`, String(it.amount));
    p.set(`line_items[${i}][price_data][product_data][name]`, it.name);
  });
  const r = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST', body: p, headers: { Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`, 'Content-Type': 'application/x-www-form-urlencoded' },
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error?.message || `Stripe ${r.status}`);
  return j.url;
}

// Verifies the Stripe-Signature header; returns the parsed event or null.
export function verifyWebhook(raw, header, secret = process.env.STRIPE_WEBHOOK_SECRET) {
  if (!secret || !header) return null;
  const parts = Object.fromEntries(header.split(',').map((x) => x.split('=')));
  if (!parts.t || !parts.v1 || Math.abs(Date.now() / 1000 - Number(parts.t)) > 300) return null;
  const expected = createHmac('sha256', secret).update(`${parts.t}.${raw}`).digest('hex');
  const a = Buffer.from(expected), b = Buffer.from(parts.v1);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try { return JSON.parse(raw); } catch { return null; }
}
