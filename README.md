# Gomi Insulation – online store

A zero-dependency Node.js (22.13+) storefront: product catalog, search, cart, guest + account checkout,
customer accounts with order history, and an admin dashboard (products, stock, orders, customers).

```bash
npm start            # http://localhost:3000
npm test
```

On first start an admin account is created. Set `ADMIN_EMAIL` / `ADMIN_PASSWORD` to choose credentials,
otherwise a random password is printed to the console. Admin lives at `/admin`.

| Env var | Default | Purpose |
|---|---|---|
| `PORT` | 3000 | HTTP port |
| `DB_FILE` | `data/store.db` | SQLite file |
| `STORE_NAME` | Gomi Insulation | Shown in header/title |
| `CURRENCY_SYMBOL` | `$` | Price prefix |
| `SHIPPING_CENTS` / `FREE_SHIPPING_CENTS` | 1500 / 50000 | Flat shipping, free above threshold |
| `NODE_ENV=production` | | Marks cookies `Secure` (serve over HTTPS) |

## Card payments (Stripe)
Set `STRIPE_SECRET_KEY` (and optionally `CURRENCY`, default `usd`) and checkout redirects to Stripe Checkout.
Add a webhook endpoint in the Stripe dashboard pointing to `https://YOUR-DOMAIN/stripe/webhook` for the events
`checkout.session.completed` and `checkout.session.expired`, and set `STRIPE_WEBHOOK_SECRET` to its signing secret.
Orders flip to `paid` automatically; expired sessions cancel the order and restock. Set `PUBLIC_URL` to your site's URL.
Without a Stripe key, orders are placed as "pending" and invoiced manually.

## Hosting
GitHub Pages only serves static files, so it can't run this server. Deploy the repo to any Node host
(Render, Railway, Fly.io…) using the included `Dockerfile`; mount a persistent volume at `/app/data`.

## Running from GitHub (for now)
Open the repo on GitHub → **Code → Codespaces → Create codespace**. It starts the store automatically and
opens it on forwarded port 3000 (admin login is in `.devcontainer/devcontainer.json` — change the password).
Codespaces sleep when idle, so this is for testing/demos, not a public shop.

## Moving to Supabase later
All data access is in `src/db.js` and the SQL in `src/server.js`; accounts live in `src/auth.js`.
The migration would swap SQLite for Supabase Postgres, and (optionally) the custom accounts for Supabase Auth.

## Supabase + GitHub Pages version (`web/`, `supabase/`)
A static storefront (no Node server) that uses Supabase for accounts (Auth), products/orders (Postgres with row-level
security) and order placement (`place_order` RPC, which takes prices/stock from the DB). `supabase/schema.sql` creates everything.
Deploys to GitHub Pages via `.github/workflows/pages.yml` (Settings → Pages → Source: **GitHub Actions**).
To make yourself admin after signing up: `update public.profiles set is_admin = true where email = 'you@example.com';`

## Card payments on the Supabase version (Stripe)
1. Install the [Supabase CLI](https://supabase.com/docs/guides/cli) and run `supabase login`, then `supabase link --project-ref lsvcpblpycvqnagxfvlz`.
2. Set secrets (never commit these): `supabase secrets set STRIPE_SECRET_KEY=sk_... SITE_URL=https://kingimann.github.io/GomiInsultion`
3. Deploy: `supabase functions deploy create-checkout` and `supabase functions deploy stripe-webhook --no-verify-jwt`
4. In the Stripe dashboard add a webhook to `https://lsvcpblpycvqnagxfvlz.supabase.co/functions/v1/stripe-webhook`
   for `checkout.session.completed` and `checkout.session.expired`, then `supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_...`
5. Set `PAYMENTS: true` in `web/config.js` and push. Use Stripe test keys first (card 4242 4242 4242 4242).

## Order & low-stock emails (Resend)
Postgres triggers call the `notify` edge function (customer order confirmation, "paid/shipped/delivered" updates, new-order alert and low-stock alert to you).
1. Create a [Resend](https://resend.com) account, verify your sending domain, and create an API key.
2. `supabase secrets set RESEND_API_KEY=re_... FROM_EMAIL="Gomi Insulation <orders@yourdomain.com>" ADMIN_EMAIL=you@example.com NOTIFY_SECRET=<long-random-string> SITE_URL=https://kingimann.github.io/GomiInsultion`
3. `supabase functions deploy notify --no-verify-jwt`
4. Tell the database where to send them (run in the SQL editor, same secret as above):
   ```sql
   insert into public.app_config (key, value) values
     ('notify_url', 'https://lsvcpblpycvqnagxfvlz.supabase.co/functions/v1/notify'),
     ('notify_secret', '<the same NOTIFY_SECRET>')
   on conflict (key) do update set value = excluded.value;
   ```
Until step 4 is done the triggers do nothing, so orders are never affected.

## Styling
Admins see a **🎨 Style** button: pick a preset (Default, Sunrise, Ocean, Forest, Fresh, Midnight, Boutique, Playful, Workshop) or mix mode (auto/light/dark), colour (9 presets or any custom colour), header, home banner, card and button styles, corner shape, font, text size, spacing and page width. Admins can also edit the store name and the announcement bar text. The choice is saved in the database (`site_settings`) and applies to every visitor. Customers never see the button.
`DEFAULT_THEME` in `web/config.js` is only the fallback before a theme has been saved.

## Custom forms
Admins build forms in **Admin → Forms**: title, description, a custom "thank you" message and questions (short/long text, email, phone, number, date, dropdown, checkbox; optional or required; reorder freely).
Each form gets its own link (`#/form/<name>`) you can share. Responses are listed per form, deletable, and exportable as CSV. A "Contact us" form is included.
Submissions go through the `submit_form` database function, which re-checks required fields, emails, numbers and dropdown choices on the server and caps a form at 200 submissions per hour.

### Form responses: tracking and email alerts
Each response has a **status** (New / In progress / Done) and a **notes** box, with filters by status and both included in the CSV export.
"Email me when someone submits this form" (on by default, per form) uses the same email pipeline as order emails — after pulling these changes, redeploy the function:
`supabase functions deploy notify --no-verify-jwt`. The email lists every answer and uses the submitter's email (if the form has an email question) as Reply-To.

## Notifications and private messaging
- **Bell (🔔):** logged-in users get live in-app notifications (a red badge plus a pop-up the moment something happens) and a **Notifications** page; they can also opt in to desktop alerts.
  Customers are notified about their orders (received, paid, shipped…) and replies to their messages. Admins are notified about new orders, low stock, form responses, quote requests and customer messages.
- **Messages (💬):** customers send private messages to the store team (only they and admins can read the thread); admins reply from the same inbox, close/reopen conversations, and can start a conversation with any customer from **Admin → Customers**. New messages arrive live.
- Message emails reuse the `notify` function (redeploy it after pulling: `supabase functions deploy notify --no-verify-jwt`).
