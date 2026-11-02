// Tiny auto-escaping template helper.
class Raw { constructor(s) { this.s = s; } toString() { return this.s; } }
export const raw = (s) => new Raw(String(s));
export const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const part = (v) => (v instanceof Raw ? v.s : Array.isArray(v) ? v.map(part).join('') : esc(v));
export function h(strings, ...vals) {
  let out = strings[0];
  vals.forEach((v, i) => { out += part(v) + strings[i + 1]; });
  return new Raw(out);
}
export const money = (cents) => `${process.env.CURRENCY_SYMBOL || '$'}${(cents / 100).toFixed(2)}`;
