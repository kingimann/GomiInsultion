// Generates SEO files into web/: sitemap.xml, robots.txt and a static, crawlable page for every product and
// published page (title, description, Open Graph, JSON-LD, readable content). Humans are sent on to the app.
// Usage: node scripts/build-seo.mjs   (Node 18+, reads Supabase URL/key from web/config.js; optional SITE_URL env)
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'web');
const cfgSrc = readFileSync(join(root, 'config.js'), 'utf8');
const pick = (k) => (cfgSrc.match(new RegExp(k + "\\s*:\\s*['\"]([^'\"]+)['\"]")) || [])[1];
const URL_ = pick('SUPABASE_URL'), KEY = pick('SUPABASE_ANON_KEY');
if (!URL_ || !KEY) throw new Error('Could not read SUPABASE_URL / SUPABASE_ANON_KEY from web/config.js');
const get = async (t) => { const r = await fetch(`${URL_}/rest/v1/${t}`, { headers: { apikey: KEY, Authorization: 'Bearer ' + KEY } }); if (!r.ok) throw new Error(t + ': ' + r.status); return r.json(); };
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clip = (t, n) => { t = String(t || '').replace(/\s+/g, ' ').trim(); return t.length > n ? t.slice(0, n - 1).trimEnd() + '…' : t; };
const safe = (u) => (/^https?:\/\//i.test(u || '') ? u : '');

const settings = Object.fromEntries((await get('site_settings?select=key,value&key=in.(theme,seo,store)')).map((r) => [r.key, r.value]));
const seo = settings.seo || {}, site = seo.site_title || settings.theme?.name || 'Gomi Insulation';
const base = (process.env.SITE_URL || seo.site_url || '').replace(/\/+$/, '');
if (!base) console.warn('! No site URL set (Admin → SEO → Public website address, or SITE_URL). Sitemap links will be relative.');
const products = await get('products?select=*&active=eq.true&order=id');
const pages = await get('pages?select=*&published=eq.true');
const cur = (cfgSrc.match(/CURRENCY\s*:\s*['"]([A-Z]{3})['"]/) || [])[1] || 'USD';

for (const d of ['product', 'page']) rmSync(join(root, d), { recursive: true, force: true });
const pre = base ? base + '/' : '../../';
const shell = ({ title, desc, image, type, path, ld, body, hash }) => `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)} · ${esc(site)}</title><meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${esc(base + path)}">${seo.noindex ? '\n<meta name="robots" content="noindex, nofollow">' : ''}
<meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}"><meta property="og:type" content="${type}"><meta property="og:site_name" content="${esc(site)}"><meta property="og:url" content="${esc(base + path)}">${image ? `<meta property="og:image" content="${esc(image)}">` : ''}
<meta name="twitter:card" content="${image ? 'summary_large_image' : 'summary'}">
<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, '\\u003c')}</script>
<meta http-equiv="refresh" content="0; url=${esc(pre + hash)}"><link rel="stylesheet" href="${esc(pre)}style.css"></head>
<body><main class="wrap prose">${body}<p><a href="${esc(pre + hash)}">Continue to the store →</a></p></main>
<script>location.replace(${JSON.stringify(pre + hash)});</script></body></html>`;
const out = (rel, html) => { const f = join(root, rel, 'index.html'); mkdirSync(dirname(f), { recursive: true }); writeFileSync(f, html); };

const urls = [{ loc: '/', pr: '1.0' }, { loc: '/#/shop', pr: '0.8' }];
for (const p of products) {
  const path = `/product/${p.slug}/`, img = safe(p.image_url), desc = p.seo_description || clip(p.description, 160) || `${p.name} — ${p.category}`;
  out(`product/${p.slug}`, shell({ title: p.seo_title || p.name, desc, image: img, type: 'product', path, hash: `#/product/${p.slug}`,
    ld: { '@context': 'https://schema.org', '@type': 'Product', name: p.name, description: clip(p.description, 500), image: img ? [img] : undefined, category: p.category, ...(p.brand ? { brand: { '@type': 'Brand', name: p.brand } } : {}), sku: 'P' + p.id,
      offers: { '@type': 'Offer', priceCurrency: cur, price: (p.price_cents / 100).toFixed(2), availability: p.stock > 0 ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock', url: base + path } },
    body: `<h1>${esc(p.name)}</h1>${img ? `<img src="${esc(img)}" alt="${esc(p.image_alt || p.name)}" style="max-width:100%">` : ''}<p><b>$${(p.price_cents / 100).toFixed(2)}</b> / ${esc(p.unit)} · ${esc(p.category)}</p><p>${esc(p.description)}</p>` }));
  urls.push({ loc: path, pr: '0.7' });
}
for (const g of pages) {
  const path = `/page/${g.slug}/`, desc = g.seo_description || clip(g.body.replace(/[#*>\[\]()`_{}|!-]+/g, ' '), 160);
  out(`page/${g.slug}`, shell({ title: g.seo_title || g.title, desc, type: 'article', path, hash: `#/page/${g.slug}`,
    ld: { '@context': 'https://schema.org', '@type': 'WebPage', name: g.title, description: desc, url: base + path },
    body: `<h1>${esc(g.title)}</h1>${g.body.split(/\n{2,}/).map((x) => `<p>${esc(x.replace(/^#+\s*/, ''))}</p>`).join('')}` }));
  urls.push({ loc: path, pr: '0.5' });
}
writeFileSync(join(root, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u) => `  <url><loc>${esc(base + u.loc)}</loc><priority>${u.pr}</priority></url>`).join('\n')}\n</urlset>\n`);
writeFileSync(join(root, 'robots.txt'), seo.noindex ? 'User-agent: *\nDisallow: /\n' : `User-agent: *\nAllow: /\nDisallow: /#/admin\n${base ? `Sitemap: ${base}/sitemap.xml\n` : ''}`);
// Cache-bust the app files so visitors always get the newest version after a deploy.
{ const f = join(root, 'index.html'); let h = readFileSync(f, 'utf8'); const v = Date.now().toString(36);
  h = h.replace(/(href="style\.css|src="(?:config|icons|app)\.js)(\?v=\w+)?"/g, `$1?v=${v}"`); writeFileSync(f, h); }
console.log(`SEO build: ${products.length} products, ${pages.length} pages, ${urls.length} sitemap URLs`);
