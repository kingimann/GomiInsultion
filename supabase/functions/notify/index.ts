// Sends transactional emails through Resend. Called by Postgres triggers (see supabase/schema.sql) with a shared secret.
// Secrets: RESEND_API_KEY, FROM_EMAIL (e.g. "Gomi Insulation <orders@yourdomain.com>"), ADMIN_EMAIL, NOTIFY_SECRET, SITE_URL
// Deploy with --no-verify-jwt (we authenticate with x-notify-secret instead).
import { createClient } from 'npm:@supabase/supabase-js@2';

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const money = (c: number) => `$${(c / 100).toFixed(2)}`;

type Res = { ok: boolean; detail: string };
type Att = { filename: string; content: string };
async function sendEmail(to: string, subject: string, html: string, replyTo?: string, attachments?: Att[]): Promise<Res> {
  const key = Deno.env.get('RESEND_API_KEY'), from = Deno.env.get('FROM_EMAIL');
  if (!key || !from) return { ok: false, detail: 'Email is not connected yet: add the RESEND_API_KEY and FROM_EMAIL secrets' };
  if (!to) return { ok: false, detail: 'No email address' };
  try {
    const r = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ from, to, subject, html, ...(replyTo ? { reply_to: replyTo } : {}), ...(attachments?.length ? { attachments } : {}) }) });
    if (r.ok) return { ok: true, detail: 'Delivered to the email service' };
    const t = await r.text(); console.error('resend', r.status, t); let m = t; try { m = JSON.parse(t).message || t; } catch { /* keep text */ }
    return { ok: false, detail: `Email service said: ${String(m).slice(0, 220)}` };
  } catch (e) { return { ok: false, detail: `Could not reach the email service: ${e}` }; }
}
const send = async (to: string, subject: string, html: string, replyTo?: string) => { await sendEmail(to, subject, html, replyTo); };
function e164(raw: string): string | null {
  const d = String(raw || '').replace(/[^0-9+]/g, ''); if (d.startsWith('+')) return d.length >= 9 ? d : null;
  const digits = d.replace(/\D/g, ''), cc = (Deno.env.get('SMS_DEFAULT_COUNTRY_CODE') || '1').replace(/\D/g, '');
  if (digits.length === 10) return `+${cc}${digits}`; if (digits.length === 11 && digits.startsWith(cc)) return `+${digits}`; return digits.length >= 8 ? `+${digits}` : null;
}
async function sendSms(to: string, text: string): Promise<Res> {
  const sid = Deno.env.get('TWILIO_ACCOUNT_SID'), tok = Deno.env.get('TWILIO_AUTH_TOKEN'), from = Deno.env.get('TWILIO_FROM'), svc = Deno.env.get('TWILIO_MESSAGING_SERVICE_SID');
  if (!sid || !tok || (!from && !svc)) return { ok: false, detail: 'Text messaging is not connected yet: add the TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and TWILIO_FROM secrets' };
  const num = e164(to); if (!num) return { ok: false, detail: 'That phone number does not look valid' };
  try {
    const p = new URLSearchParams({ To: num, Body: text.slice(0, 1500) }); if (svc) p.set('MessagingServiceSid', svc); else p.set('From', from!);
    const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, { method: 'POST', body: p, headers: { Authorization: 'Basic ' + btoa(`${sid}:${tok}`), 'Content-Type': 'application/x-www-form-urlencoded' } });
    const j = await r.json().catch(() => ({}));
    return r.ok ? { ok: true, detail: 'Handed to the text-message carrier' } : { ok: false, detail: `Text service said: ${String(j.message || r.status).slice(0, 220)}` };
  } catch (e) { return { ok: false, detail: `Could not reach the text service: ${e}` }; }
}

Deno.serve(async (req) => {
  if (req.headers.get('x-notify-secret') !== Deno.env.get('NOTIFY_SECRET')) return new Response('forbidden', { status: 403 });
  const body = await req.json();
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const site = (Deno.env.get('SITE_URL') || '').replace(/\/$/, '');
  // The admin's browser builds the PDF when they press Send and stores it as doc-pdfs/<kind>/<id>.pdf; attach it if it is fresh.
  const pdfFor = async (kind: string, id: number, name: string): Promise<Att[]> => {
    try {
      const path = `${kind}/${id}.pdf`, dir = await admin.storage.from('doc-pdfs').list(kind, { search: `${id}.pdf` }), f = (dir.data || []).find((x: any) => x.name === `${id}.pdf`);
      if (!f || Date.now() - new Date((f as any).updated_at || (f as any).created_at).getTime() > 5 * 60 * 1000) return [];
      const dl = await admin.storage.from('doc-pdfs').download(path); if (dl.error || !dl.data) return [];
      const buf = new Uint8Array(await dl.data.arrayBuffer()); let bin = ''; for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
      return [{ filename: name, content: btoa(bin) }];
    } catch (e) { console.error('pdf attach', e); return []; }
  };
  const owner = Deno.env.get('ADMIN_EMAIL')!;

  if (body.kind === 'low_stock') {
    const { data: p } = await admin.from('products').select('name,stock').eq('id', body.product_id).single();
    if (p) await send(owner, `Low stock: ${p.name}`, `<p><b>${esc(p.name)}</b> is down to <b>${p.stock}</b> in stock.</p><p><a href="${site}/#/admin/products">Manage products</a></p>`);
    return new Response('ok');
  }

  if (body.kind === 'digest') {
    const path = String(body.path || '/').startsWith('/') ? String(body.path || '/') : '/';
    await send(String(body.to || ''), String(body.subject || 'Update').slice(0, 150), `<h2>${esc(body.heading || '')}</h2><p>${esc(body.text || '')}</p><p><a href="${site}${path}">Open the app</a></p>`);
    return new Response('ok');
  }

  // ---- sending invoices / estimates / statements (email and text) with a delivery log ----
  const siteBase = String(body.base || site || '').replace(/\/$/, '');
  const setLog = async (id: number | null | undefined, r: Res) => { if (id) await admin.from('message_log').update({ status: r.ok ? 'sent' : 'failed', detail: r.detail }).eq('id', id); };
  const mkLog = async (kind: string, ref: number | null, channel: string, to: string) => (await admin.from('message_log').insert({ kind, ref_id: ref, channel, to_address: to, status: 'queued' }).select('id').single()).data?.id as number | undefined;
  const { data: stRows } = await admin.from('site_settings').select('key,value').in('key', ['store', 'theme']);
  const cfg = Object.fromEntries((stRows || []).map((r: any) => [r.key, r.value || {}]));
  const bizName = cfg.store?.biz?.legal_name || cfg.theme?.name || 'Gomi Insulation';

  if (body.kind === 'test') {
    const r = body.channel === 'sms' ? await sendSms(String(body.to), `${bizName}: this is a test text message. Sending works!`) : await sendEmail(String(body.to), `Test email from ${bizName}`, `<h2>It works! </h2><p>This is a test email from ${esc(bizName)}. Invoices and estimates can now be emailed to customers.</p>`);
    await setLog(body.log_id, r); return new Response('ok');
  }

  if (body.kind === 'statement') {
    const { data: all } = await admin.from('invoices').select('*').eq('status', 'sent');
    const mail = String(body.email || '').toLowerCase(), nm = String(body.name || '').toLowerCase();
    const mine = (all || []).filter((i: any) => (body.customer_id && i.customer_id === body.customer_id) || (mail && String(i.customer_email || '').toLowerCase() === mail) || (!body.customer_id && !mail && nm && String(i.customer_name).toLowerCase() === nm))
      .filter((i: any) => i.total_cents - i.paid_cents > 0).sort((a: any, b: any) => String(a.due_date).localeCompare(String(b.due_date)));
    const to = body.email || mine.find((i: any) => i.customer_email)?.customer_email, lid = body.log_ids?.email;
    if (!to || !mine.length) { await setLog(lid, { ok: false, detail: !to ? 'No email address on file' : 'Nothing is owing — no statement needed' }); return new Response('nothing to send'); }
    const today = new Date().toISOString().slice(0, 10), total = mine.reduce((a: number, i: any) => a + i.total_cents - i.paid_cents, 0);
    const rows = mine.map((i: any) => { const bal = i.total_cents - i.paid_cents, late = i.due_date < today; return `<tr><td><a href="${siteBase}/#/invoice/${i.id}?k=${i.view_key}">${esc(i.number)}</a></td><td>${esc(i.issue_date)}</td><td style="${late ? 'color:#b42318;font-weight:bold' : ''}">${esc(i.due_date)}${late ? ' (overdue)' : ''}</td><td align="right">${money(i.total_cents)}</td><td align="right"><b>${money(bal)}</b></td></tr>`; }).join('');
    await setLog(lid, await sendEmail(to, `Statement of account — ${money(total)} due`, `<h2>Statement of account</h2><p>Hello ${esc(mine[0].customer_name)}, here are your open invoices with ${esc(bizName)}.</p><table cellpadding="6" style="border-collapse:collapse"><tr><th align="left">Invoice</th><th>Issued</th><th>Due</th><th align="right">Total</th><th align="right">Balance</th></tr>${rows}</table><p><b>Total due: ${money(total)}</b></p><p>Click an invoice number to view it or pay online.</p>`));
    return new Response('ok');
  }

  if (body.kind === 'estimate_sent') {
    const { data: est } = await admin.from('estimates').select('*, estimate_items(*)').eq('id', body.estimate_id).single(); if (!est) return new Response('no estimate', { status: 404 });
    const ch = body.channels || { email: true, sms: false }, ids = body.log_ids || {}, link = `${siteBase}/#/estimate/${est.id}?k=${est.view_key}`;
    if (!siteBase) { for (const c of ['email', 'sms']) if (ch[c]) await setLog(ids[c], { ok: false, detail: 'No site address known — set the SITE_URL secret' }); return new Response('no site'); }
    if (ch.email) {
      const rows = est.estimate_items.sort((x: any, y: any) => x.sort - y.sort).map((i: any) => `<tr><td>${esc(i.description)}</td><td align="right">${Number(i.qty)}</td><td align="right">${money(Math.round(Number(i.qty) * i.unit_price_cents))}</td></tr>`).join('');
      await setLog(ids.email ?? await mkLog('estimate', est.id, 'email', est.customer_email), await sendEmail(est.customer_email, `Estimate ${est.number} — ${money(est.total_cents)}`,
        `<h2>Estimate ${esc(est.number)}</h2><p>Hello ${esc(est.customer_name)}, here is the estimate ${esc(bizName)} prepared for you.</p><table cellpadding="6" style="border-collapse:collapse"><tr><th align="left">Description</th><th>Qty</th><th align="right">Amount</th></tr>${rows}</table>
         ${est.tax_cents ? `<p>${esc(est.tax_label || 'Tax')}: ${money(est.tax_cents)}</p>` : ''}<p><b>Total: ${money(est.total_cents)}</b></p><p>Valid until ${esc(est.expires_on)}.</p><p><a href="${link}">Review, accept or decline this estimate</a></p>`, undefined, await pdfFor('estimate', est.id, `Estimate-${est.number}.pdf`)));
    }
    if (ch.sms) await setLog(ids.sms ?? await mkLog('estimate', est.id, 'sms', est.customer_phone), await sendSms(est.customer_phone, `${bizName}: Estimate ${est.number} for ${money(est.total_cents)} (valid until ${est.expires_on}). Review & accept: ${link}`));
    return new Response('ok');
  }

  if (body.kind === 'invoice_sent') {
    const { data: inv } = await admin.from('invoices').select('*, invoice_items(*)').eq('id', body.invoice_id).single(); if (!inv) return new Response('no invoice', { status: 404 });
    const ch = body.channels || { email: true, sms: false }, ids = body.log_ids || {}, balance = inv.total_cents - inv.paid_cents, link = `${siteBase}/#/invoice/${inv.id}?k=${inv.view_key}`;
    if (!siteBase) { for (const c of ['email', 'sms']) if (ch[c]) await setLog(ids[c], { ok: false, detail: 'No site address known — set the SITE_URL secret' }); return new Response('no site'); }
    if (ch.email) {
      if (!inv.customer_email) await setLog(ids.email, { ok: false, detail: 'No email address on this invoice' });
      else {
        const rows = inv.invoice_items.sort((x: any, y: any) => x.sort - y.sort).map((i: any) => `<tr><td>${esc(i.description)}</td><td align="right">${Number(i.qty)}</td><td align="right">${money(Math.round(Number(i.qty) * i.unit_price_cents))}</td></tr>`).join('');
        await setLog(ids.email ?? await mkLog('invoice', inv.id, 'email', inv.customer_email), await sendEmail(inv.customer_email, `Invoice ${inv.number}${balance > 0 ? ` — ${money(balance)} due ${inv.due_date}` : ''} from ${bizName}`,
          `<h2>Invoice ${esc(inv.number)}</h2><p>Hello ${esc(inv.customer_name)}, here is your invoice from ${esc(bizName)}.</p><table cellpadding="6" style="border-collapse:collapse"><tr><th align="left">Description</th><th>Qty</th><th align="right">Amount</th></tr>${rows}</table>
           ${inv.discount_cents ? `<p>Discount: −${money(inv.discount_cents)}</p>` : ''}${inv.tax_cents ? `<p>${esc(inv.tax_label || 'Tax')}: ${money(inv.tax_cents)}</p>` : ''}<p><b>Total: ${money(inv.total_cents)}</b>${inv.paid_cents ? `<br>Paid: ${money(inv.paid_cents)}<br><b>Balance due: ${money(balance)}</b>` : ''}</p><p>Due date: ${esc(inv.due_date)}</p>
           ${inv.terms ? `<p style="white-space:pre-wrap">${esc(inv.terms)}</p>` : ''}<p><a href="${link}">View, print or pay this invoice</a></p>`, undefined, await pdfFor('invoice', inv.id, `Invoice-${inv.number}.pdf`)));
      }
    }
    if (ch.sms) await setLog(ids.sms ?? await mkLog('invoice', inv.id, 'sms', inv.customer_phone), await sendSms(inv.customer_phone, `${bizName}: Invoice ${inv.number} for ${money(balance)}${balance > 0 ? ` is due ${inv.due_date}` : ' (paid)'}. View${balance > 0 ? ' & pay' : ''}: ${link}`));
    return new Response('ok');
  }

  if (body.kind === 'new_message') {
    const { data: m } = await admin.from('messages').select('*, conversations(*)').eq('id', body.message_id).single();
    if (!m) return new Response('no message', { status: 404 });
    const c = m.conversations;
    const fromCustomer = m.sender_id === c.customer_id;
    let to = owner, heading = 'New message from a customer';
    if (!fromCustomer) {
      const { data: cust } = await admin.from('profiles').select('email').eq('id', c.customer_id).single();
      if (!cust?.email) return new Response('no recipient');
      to = cust.email; heading = 'You have a new reply from the store team';
    }
    await send(to, `${heading}: ${c.subject}`, `<h2>${esc(heading)}</h2><p><b>${esc(c.subject)}</b></p><blockquote style="white-space:pre-wrap">${esc(m.body)}</blockquote><p><a href="${site}/#/messages/${c.id}">Open the conversation</a></p>`);
    return new Response('ok');
  }

  if (body.kind === 'form_submitted') {
    const { data: sub } = await admin.from('form_submissions').select('*, forms(*)').eq('id', body.submission_id).single();
    if (!sub) return new Response('no submission', { status: 404 });
    const fields = sub.forms.fields as any[];
    const rows = fields.filter((f) => !['heading', 'paragraph', 'divider'].includes(f.type)).map((f) => {
      let v = sub.data[f.id];
      if (Array.isArray(v)) v = v.join(', ');
      else if (f.type === 'checkbox') v = v ? 'Yes' : 'No';
      else if (f.type === 'rating' && v) v = '★'.repeat(Number(v)) + '☆'.repeat(5 - Number(v));
      else if (f.type === 'file' && v) v = `${String(v).split('/').pop()!.replace(/^[0-9a-f-]{36}-/, '')} (download from the admin page)`;
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
    if (o.email && !o.email.endsWith('.local')) await send(o.email, `We got your order #${o.id}`, `<h2>Thanks, ${esc(o.name)}!</h2><p>We received order #${o.id}.</p>${table}<p>Delivering to ${esc(o.address)}, ${esc(o.city)} ${esc(o.postcode)}.</p><p><a href="${link}">View your order</a></p>`);
    await send(owner, `New order #${o.id} · ${money(o.total_cents)}`, `<p>${esc(o.name)} (${esc(o.email)}, ${esc(o.phone)}) placed an order.</p>${table}<p><a href="${site}/#/admin/orders/${o.id}">Open in admin</a></p>`);
  } else if (['order_paid', 'order_shipped', 'order_delivered'].includes(body.kind)) {
    const what = { order_paid: 'Payment received', order_shipped: 'Your order has shipped', order_delivered: 'Your order was delivered' }[body.kind as string];
    if (o.email) await send(o.email, `${what} · order #${o.id}`, `<h2>${what}</h2><p>Order #${o.id} is now <b>${body.kind.replace('order_', '')}</b>.</p><p><a href="${link}">View your order</a></p>`);
  }
  return new Response('ok');
});
