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

Payments are not wired up yet: orders are placed as "pending" and invoiced manually. Stripe checkout is the natural next step.
