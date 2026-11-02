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
