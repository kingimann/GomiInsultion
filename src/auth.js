import { scryptSync, randomBytes, timingSafeEqual } from 'node:crypto';

export function hashPassword(pw) {
  const salt = randomBytes(16);
  return `${salt.toString('hex')}:${scryptSync(pw, salt, 64).toString('hex')}`;
}

export function verifyPassword(pw, stored) {
  const [salt, hash] = stored.split(':');
  const a = Buffer.from(hash, 'hex');
  const b = scryptSync(pw, Buffer.from(salt, 'hex'), 64);
  return a.length === b.length && timingSafeEqual(a, b);
}

const SESSION_MS = 1000 * 60 * 60 * 24 * 14;

export function createSessionStore(db) {
  return {
    get(token) {
      if (!token) return null;
      const s = db.prepare('SELECT * FROM sessions WHERE token = ? AND expires > ?').get(token, Date.now());
      return s || null;
    },
    create(userId = null) {
      const token = randomBytes(32).toString('base64url');
      db.prepare('INSERT INTO sessions (token, user_id, expires) VALUES (?,?,?)').run(token, userId, Date.now() + SESSION_MS);
      return token;
    },
    setUser(token, userId) { db.prepare('UPDATE sessions SET user_id = ? WHERE token = ?').run(userId, token); },
    setCart(token, cart) { db.prepare('UPDATE sessions SET cart = ? WHERE token = ?').run(JSON.stringify(cart), token); },
    destroy(token) { db.prepare('DELETE FROM sessions WHERE token = ?').run(token); },
    sweep() { db.prepare('DELETE FROM sessions WHERE expires < ?').run(Date.now()); },
  };
}

export const SESSION_SECONDS = SESSION_MS / 1000;
