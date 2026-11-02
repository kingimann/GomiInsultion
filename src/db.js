import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomBytes } from 'node:crypto';
import { hashPassword } from './auth.js';

export function openDb(file = process.env.DB_FILE || 'data/store.db') {
  if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY, email TEXT UNIQUE NOT NULL, name TEXT NOT NULL,
      password_hash TEXT NOT NULL, is_admin INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY, user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      cart TEXT NOT NULL DEFAULT '{}', expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY, slug TEXT UNIQUE NOT NULL, name TEXT NOT NULL,
      category TEXT NOT NULL, description TEXT NOT NULL DEFAULT '',
      price_cents INTEGER NOT NULL, unit TEXT NOT NULL DEFAULT 'each',
      r_value TEXT NOT NULL DEFAULT '', stock INTEGER NOT NULL DEFAULT 0,
      image_url TEXT NOT NULL DEFAULT '', active INTEGER NOT NULL DEFAULT 1);
    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY, user_id INTEGER REFERENCES users(id),
      email TEXT NOT NULL, name TEXT NOT NULL, phone TEXT NOT NULL DEFAULT '',
      address TEXT NOT NULL, city TEXT NOT NULL, postcode TEXT NOT NULL,
      notes TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'pending',
      subtotal_cents INTEGER NOT NULL, shipping_cents INTEGER NOT NULL,
      total_cents INTEGER NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS order_items (
      id INTEGER PRIMARY KEY, order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      product_id INTEGER REFERENCES products(id), name TEXT NOT NULL,
      price_cents INTEGER NOT NULL, qty INTEGER NOT NULL);
  `);
  db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)').run('order_secret', randomBytes(32).toString('hex'));
  seed(db);
  return db;
}

const SAMPLE = [
  ['fiberglass-batts-r13', 'Fiberglass Batts R-13', 'Batts & Rolls', 'Classic unfaced fiberglass batts for 2x4 walls. Easy to cut and fit, great value for interior walls and floors.', 4999, 'bundle (88 sq ft)', 'R-13', 120],
  ['fiberglass-batts-r19', 'Fiberglass Batts R-19', 'Batts & Rolls', 'Fits 2x6 framing and standard floor joists. Non-combustible, sound dampening.', 6999, 'bundle (80 sq ft)', 'R-19', 90],
  ['mineral-wool-r15', 'Mineral Wool Batts R-15', 'Batts & Rolls', 'Fire resistant to over 1000°C, water repellent and excellent acoustic performance.', 8999, 'bundle (60 sq ft)', 'R-15', 60],
  ['spray-foam-kit-600', 'Closed-Cell Spray Foam Kit (600 bf)', 'Spray Foam', 'Two-component kit for sealing gaps, rim joists and small walls. Air and vapour barrier in one.', 52900, 'kit', 'R-6.5/in', 25],
  ['spray-foam-can', 'Expanding Foam Sealant Can', 'Spray Foam', 'Fill gaps and cracks around windows, doors and penetrations.', 899, 'can (500 ml)', '', 300],
  ['xps-board-2in', 'XPS Rigid Foam Board 2"', 'Rigid Board', 'Moisture-resistant extruded polystyrene for foundations, basements and under slabs. 4x8 ft sheet.', 3499, 'sheet (4x8)', 'R-10', 150],
  ['polyiso-board-1in', 'Polyiso Foil-Faced Board 1"', 'Rigid Board', 'Highest R-value per inch of any rigid board. Ideal for roofs and exterior walls.', 2899, 'sheet (4x8)', 'R-6', 110],
  ['blown-cellulose', 'Blown-In Cellulose', 'Loose Fill', 'Recycled-content attic insulation. Covers about 40 sq ft at R-19.', 2199, 'bag (25 lb)', 'R-3.7/in', 200],
  ['attic-baffles', 'Attic Rafter Vent Baffles', 'Accessories', 'Keeps soffit vents clear when adding attic insulation. Fits 16" and 24" spacing.', 249, 'each', '', 500],
  ['vapour-barrier-6mil', 'Poly Vapour Barrier 6 mil', 'Accessories', 'Clear polyethylene sheeting, 10 x 100 ft roll.', 6499, 'roll', '', 70],
  ['sealing-tape', 'Acoustic Sealant & Tape Kit', 'Accessories', 'Sealing tape and acoustical sealant for air-tight assemblies.', 1999, 'kit', '', 80],
];

function seed(db) {
  const hasAdmin = db.prepare('SELECT 1 FROM users WHERE is_admin = 1').get();
  if (!hasAdmin) {
    const email = process.env.ADMIN_EMAIL || 'admin@gomiinsulation.com';
    const password = process.env.ADMIN_PASSWORD || randomBytes(9).toString('base64url');
    db.prepare('INSERT INTO users (email, name, password_hash, is_admin) VALUES (?, ?, ?, 1)')
      .run(email.toLowerCase(), 'Store Admin', hashPassword(password));
    if (!process.env.ADMIN_PASSWORD && process.env.NODE_ENV !== 'test') {
      console.log(`\n  Created admin account\n    email:    ${email}\n    password: ${password}\n  (set ADMIN_EMAIL / ADMIN_PASSWORD env vars to choose your own)\n`);
    }
  }
  if (db.prepare('SELECT COUNT(*) c FROM products').get().c === 0) {
    const ins = db.prepare('INSERT INTO products (slug,name,category,description,price_cents,unit,r_value,stock) VALUES (?,?,?,?,?,?,?,?)');
    for (const p of SAMPLE) ins.run(...p);
  }
}
