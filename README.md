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

## Custom pages
**Admin → Pages** lets admins create and edit content pages (About, FAQ, Shipping…) with a Markdown editor, toolbar, image upload and live preview. Each page has a link (`#/page/<name>`), can be a draft or published, and can be added to the menu and/or footer. Content is rendered by a small built-in renderer that escapes everything and only allows safe formatting and links.

## Locations, inventory, sales and point of sale
- **Admin → Locations:** add warehouses, stores or showrooms with address, hours and contact details. One is the *default* (online delivery orders are fulfilled from it first); any active location can be offered for **customer pickup** at checkout.
- **Admin → Inventory:** a products × locations grid — edit any quantity inline, **transfer stock** between locations, filter, export CSV, and see a log of every change (adjustments, sales, cancellations, transfers). Product stock is always the sum across locations, and cancelling an order returns stock to exactly the locations it came from.
- **Checkout:** customers choose **Delivery** or **Pickup** at a location that has everything in their cart (pickup is free).
- **Admin → Point of sale:** record in-person sales at a location (stock is taken from that location). Orders show where they were fulfilled and whether they were online or in store.
- **Admin → Sales:** revenue, orders, units and average order for 7/30/90 days, 12 months or all time, filterable by location and channel, with a chart, by-location and top-product tables and CSV export.
- **Dashboard:** things needing attention, period-over-period KPIs, revenue chart, revenue by location, top products, recent orders, low stock and quick links.

## Competitor price comparison
**Admin → Price compare** is a grid of products × retailers (Home Depot, Réno-Dépôt and Home Hardware are pre-loaded; you can add or hide retailers). Type what a competitor charges for a comparable item; each product also has a details page for the link, the exact comparable item and stock status.
Customers see a **Price comparison** table on product pages (your price vs theirs, how much they save, date checked, link) and a "Save X%" badge on product cards when you are cheaper than every compared retailer. Prices older than `COMPARE_MAX_DAYS` (30 by default, in `web/config.js`) are hidden automatically, and the table says retailers' prices may have changed.
Prices are entered by hand on purpose: these retailers offer no public price feed, and scraping their sites breaks their terms of use and gets blocked. Where a competitor is cheaper the table says so — it only shows what you entered.

## Hosting on Netlify or Cloudflare Pages
The site is static files in `web/` (no build). **Netlify:** Add new site → Import from Git → pick this repo → leave the build command empty (`netlify.toml` sets the publish folder to `web`). **Cloudflare Pages:** build command empty, output directory `web`.
Both redeploy on every push to `main` and build preview links for other branches/pull requests. Afterwards add the new site address to Supabase → Authentication → URL Configuration (Site URL + Redirect URLs as `https://YOUR-SITE/**`) and update the `SITE_URL` secret used by the Supabase functions.

## Roles & permissions
**Admin → Team & roles** assigns a role to anyone who has signed up. Roles: **owner** and **admin** (full access; only an owner can create or change owners/admins, and the last owner can't be removed), **manager** (orders, refunds, products, inventory, purchasing, content, customers, reports), **staff** (POS/in-store sales; view orders, customers, stock; messages), **warehouse** (ship orders, manage stock and purchase orders), **accountant** (invoicing, reports, view orders/customers) and **support** (messages; view orders/customers).
Permissions are enforced by the database (row-level security and permission checks inside every admin function), so a role can't reach data or actions it doesn't have even by calling the API directly. The menus and dashboard also adapt to each role.

## Invoicing (QuickBooks-style) — owner, admin and accountant
**Admin → Invoices**: create invoices for anyone (pick an existing customer or type a new one) with custom line items (qty, rate, taxable or not, or pick a product), discount, tax and terms; automatic numbering (prefix configurable); mark as sent (emails the customer a link when email is set up); record full or partial payments (method, reference, date); void or delete; receivables **aging** (current, 1–30, 31–60, 61–90, 90+), outstanding/overdue totals, search and CSV export; a printable invoice page (customer link `#/invoice/<id>?k=…`) with your business details and "how to pay" instructions from **Settings**.

## Store settings, purchasing, refunds, activity
- **Settings:** delivery fee and free-delivery threshold, sales tax (name + rate, applied online and in store), business details for invoices, invoice prefix/terms/payment info.
- **Products:** unit cost (profit and margin appear on **Sales**), reorder point and reorder quantity.
- **Purchasing & suppliers:** purchase orders with receiving (adds stock at the chosen location and updates product cost), plus reorder suggestions for low-stock products.
- **Orders:** search, status filters, bulk status updates, internal notes, refunds (reduce revenue reports), printable packing slip/invoice.
- **Customers:** detail page with lifetime spend, private notes and tags.
- **Activity log:** who changed what (orders, prices, invoices and payments, stock receipts, roles, settings).

## Estimates, recurring invoices and online payment
- **Estimates** (Admin → Estimates): same editor as invoices, with a "valid until" date. Mark as sent to email the customer a private link where they can **accept or decline**; you get a notification. **Convert to invoice** copies the lines, notes, terms and tax into a new invoice in one click.
- **Recurring invoices** (Admin → Invoices → Recurring): pick a customer, line items and a schedule (weekly, monthly, quarterly, yearly, every N periods, optional end date). A daily job (06:15 UTC) creates each invoice as a draft, or sends it automatically if you choose; missed periods are caught up. "Run due now" is there if you want it immediately.
- **Pay online:** with Stripe set up, the customer's invoice page shows **Pay by card** for the balance due; the Stripe webhook records the payment on the invoice automatically (duplicate-safe).
  Setup, in addition to the order-payment steps above: `supabase functions deploy invoice-checkout`, redeploy `stripe-webhook`, and make sure `SITE_URL` and `STRIPE_SECRET_KEY` are set. The webhook already listens for `checkout.session.completed`.

## Messages upgrade

Chat now supports photo/file attachments (private `message-files` bucket, signed links), order reference cards, internal staff-only notes, saved quick replies, unsend (10 min), link detection, a "New messages" divider, an Unread/Closed filter + search for staff, a customer context panel (orders, spend, amount owing) and topic starters for new customers.

## Shop open / closed

**Admin → Settings → Shop status** (or the *Close shop* button on the dashboard) turns online ordering off. A banner shows on every page, customers can still browse and fill a cart, but checkout is blocked — enforced in the database too (a trigger on `orders` rejects online orders while closed). In-store POS sales and invoices keep working. Add an optional message customers will see.

## SEO tools

- **Admin → SEO**: a search-health score for every live product/page (title & description length, photo alt text), site-wide settings (site name, home title, default description, share image, public website address, hide-from-search switch) and a Google-style preview.
- **Product and page editors** have an SEO box (title, description, live Google preview with length hints) and products have photo alt text.
- **On every page** the app sets title, description, Open Graph/Twitter tags, a canonical link and — for products — `Product` structured data. Cart, checkout, account, admin etc. are `noindex`.
- **`scripts/build-seo.mjs`** (Node 18+) generates `sitemap.xml`, `robots.txt` and a static, crawlable page for each product and published page. It runs automatically in the GitHub Pages workflow (on push and daily) and as Netlify's build command. Set `SITE_URL` (a repository variable on GitHub, or an env var on Netlify) or fill in *Public website address* in Admin → SEO, then submit `/sitemap.xml` in Google Search Console. Locally: `SITE_URL=https://yoursite.com node scripts/build-seo.mjs` (output is git-ignored).

## Page editor

Templates (About, FAQ, Shipping, Contact), extra blocks (tables, FAQ accordions, callouts, YouTube video, product cards, H3, numbered lists, dividers), desktop/mobile preview with word count and reading time, autosaved drafts with restore, unsaved-changes warning, Ctrl+S / Ctrl+B / Ctrl+I, version history with restore (last 25 saves), and publish/unpublish/duplicate from the pages list.

## Sale pricing, price filters, back-in-stock list

Set an **Original price** on a product to show a strikethrough price and a “-X%” badge (the normal price is what customers pay). The shop has price-range and “On sale” filters, cards show “Only N left” when stock is 5 or less, and sold-out products offer a “Notify me” email box — the list is stored in `stock_alerts` and shown as a *Waiting* count in Admin → Products (emails are collected, not sent automatically yet). Admin → Products also has search, category/low-stock/sale/hidden filters and CSV export.

## Discount code limits & mobile buy bar

Discount codes can now have a **usage limit** and an **expiry date** (enforced by the database when an order is placed, with a live "used" counter), plus delete and status labels (Active / Off / Expired / Used up). On phones, product pages show a sticky **Add to cart** bar once the main button scrolls out of view.

## Invoice & estimate PDFs

Every invoice and estimate page (admin view and the customer's public link) has a **Download PDF** button that builds a clean A4 PDF in the browser — business details, bill-to, line items, discount/tax/totals, payments received, notes, terms, how-to-pay, page numbers and a PAID stamp when settled. Admins can also **Duplicate** an invoice into a new draft.

## PDF attached to emailed invoices

When an admin sends an invoice or estimate by email from the send panel, the browser builds the PDF, stores it in the private `doc-pdfs` bucket and the `notify` function attaches it to the email (only if it was created in the last 5 minutes, so an old file can never go out). Texts still send the link. Recurring invoices that send automatically (no admin browser involved) go out with the link only. Requires the Resend setup described above; redeploy `supabase/functions/notify` if you change it.

## Customers upgrade & quick search

**Admin → Customers** now shows new/repeat/lifetime-value KPIs, search (name, email, tag), segments (Top 10%, New, Repeat, Inactive 90d+, No orders), sorting, last-order column and CSV export; a customer's page also lists their invoices. Press **Ctrl/Cmd+K** anywhere in the admin (or the Search button on the dashboard) to jump to any section or find a customer, product, order or invoice.

The invoice PDF library is bundled in `web/vendor/` (no external CDN needed).

## Packing slips & reopen date

Print a **packing slip** (items and quantities, no prices, with a "packed" tick box, delivery/pickup details and customer notes) from any order, or tick several orders and press *Packing slips* to print them one per page. **Settings → Shop status** can also take a **reopen date**: online ordering switches back on by itself that day (enforced in the database too), and the banner tells customers when you're back.

## Bundles vs bags (pack pricing) & inventory upgrade

In the product editor, **Bundles & pack prices** lets you say how many bags are in a bundle (it varies per product, e.g. 2–6) and the bundle's price; a live line shows the price per bag and what the customer saves versus buying bags separately. Stock is still counted in bags. The product page shows a **Choose your size** table (single price, bundle price per bag, total and % saved) with one-click add buttons; shop cards show the bundle saving; the cart mixes prices automatically (10 bags with an 8-bag bundle = 8 at the bundle price + 2 at the normal price) and nudges customers ("add 3 more to get the bundle price"). The database applies the same rule when an order is placed, and records the bundle-priced and normal-priced bags as separate order lines. Works at the point of sale too.

**Inventory** now has stock-value KPIs (at cost and retail), a status per product (OK / Low / Out, using each product's reorder point), value, **days of stock left** (based on the last 30 days' sales), status filters, sorting and a fuller CSV export.

## Brands

Products now have a **brand**. Anyone who can manage the catalog *or* the inventory (managers and warehouse staff) can add brands: pick or type one in the product editor, or use the **Brand** dropdown on each row of **Admin → Inventory** (with “+ New brand…”) and the *Brands* panel there to add, rename or delete brands. Customers see the brand on product cards and pages, can filter the shop by brand, and search matches brand names. The brand is also included in the product structured data for Google. Permissions are enforced in the database (accountants and customers are refused).

## Shop layout

The shop now has a filter sidebar (category and brand with product counts, price range, in stock, on sale), a sort menu, grid/list view toggle (remembered), removable filter chips with "Clear all", and on phones the filters open as a bottom sheet from a *Filters* button. Facet counts update with the other filters you've applied.

## Bundles + bags in inventory

Stock is stored in bags. Each product can have **Bags / bundle** (it varies, e.g. 2–6) — set it right in **Admin → Inventory**. The table then shows every total as "3 bundles + 5 bags", and the **Bundles + bags** switch lets you count stock as bundles plus loose bags (the app converts to bags and records the change in the activity log). Changing a product's bundle size also updates its selling bundle (price per bag stays the same, so the bundle total changes). Products sold only as bags just leave it empty. Warehouse and catalog staff can edit it.
