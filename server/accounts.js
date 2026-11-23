'use strict';
// Customer accounts: registration, login and signed session cookies.
// Passwords are stored as per-user salted scrypt hashes; sessions are stateless HMAC-signed cookies.
const crypto = require('crypto');
const { HttpError, parseCookies, clientIp } = require('./http');
const { userRepo, failCounter } = require('./repos');

const COOKIE = 'cb_user';
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILS = 8;
const EMAIL_RE = /^[^\s@<>]{1,64}@[^\s@<>]{1,190}\.[A-Za-z]{2,24}$/;

const hashPw = (pw, salt = crypto.randomBytes(16).toString('hex')) => ({ salt, hash: crypto.scryptSync(pw, salt, 64).toString('hex') });
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');

class Accounts {
  /** @param {{ secret: () => string, secureCookies: boolean }} opts */
  constructor(file, { secret, secureCookies = false }) {
    this.repo = userRepo(file);
    this.secret = secret;
    this.secureCookies = secureCookies;
    this.fails = new Map();
  }

  key() { return crypto.createHash('sha256').update(`${this.secret()}:cedarbear-customer-session`).digest(); }
  sign(payload) {
    const body = b64(payload);
    return `${body}.${crypto.createHmac('sha256', this.key()).update(body).digest('base64url')}`;
  }
  cookie(value, maxAgeSec) {
    return `${COOKIE}=${value}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAgeSec}${this.secureCookies ? '; Secure' : ''}`;
  }
  issue(user) {
    const now = Date.now();
    return this.cookie(this.sign({ uid: user.id, email: user.email, name: user.name, iat: now, exp: now + SESSION_TTL_MS, v: user.sessionVersion || 0 }), SESSION_TTL_MS / 1000);
  }

  /** Returns the logged-in customer (from the signed cookie) or null. */
  session(req) {
    const token = parseCookies(req)[COOKIE];
    if (!token || token.length > 1500) return null;
    const [body, sig] = token.split('.');
    if (!body || !sig) return null;
    const expected = crypto.createHmac('sha256', this.key()).update(body).digest('base64url');
    if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
    let p;
    try { p = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')); } catch { return null; }
    if (!p || Date.now() > p.exp) return null;
    return { id: p.uid, email: p.email, name: p.name };
  }
  require(req) {
    const s = this.session(req);
    if (!s) throw new HttpError(401, 'Please log in to continue', { loginRequired: true });
    return s;
  }

  static validate({ name, email, password }) {
    const n = typeof name === 'string' ? name.replace(/[\u0000-\u001f]/g, '').trim() : '';
    const e = typeof email === 'string' ? email.trim().toLowerCase() : '';
    if (!n || n.length > 80) throw new HttpError(400, 'Enter your name (up to 80 characters)', { field: 'name' });
    if (!EMAIL_RE.test(e)) throw new HttpError(400, 'Enter a valid email address', { field: 'email' });
    if (typeof password !== 'string' || password.length < 8 || password.length > 200 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
      throw new HttpError(400, 'Password must be at least 8 characters and include a letter and a number', { field: 'password' });
    }
    return { name: n, email: e, password };
  }

  async register(body) {
    const { name, email, password } = Accounts.validate(body || {});
    const user = {
      id: `usr_${crypto.randomBytes(9).toString('base64url')}`,
      name, email,
      credential: hashPw(password),
      createdAt: new Date().toISOString(),
      sessionVersion: 0,
    };
    const created = await this.repo.create(user); // atomic: fails if the email is taken
    if (!created) throw new HttpError(409, 'An account with this email already exists — please log in', { field: 'email' });
    return user;
  }

  async login(req, body) {
    const ip = clientIp(req);
    const now = Date.now();
    const local = (this.fails.get(ip) || []).filter((t) => now - t < WINDOW_MS);
    const failures = failCounter ? await failCounter.count(`cust:${ip}`) : local.length;
    if (failures >= MAX_FAILS) throw new HttpError(429, 'Too many failed attempts. Please try again in 15 minutes.');
    const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
    const password = typeof body?.password === 'string' ? body.password : '';
    const user = email ? await this.repo.get(email) : null;
    // Always run scrypt so response time doesn't reveal whether the email exists.
    const cred = user ? user.credential : hashPw('dummy-password-for-timing');
    const ok = crypto.timingSafeEqual(Buffer.from(hashPw(password.slice(0, 200), cred.salt).hash, 'hex'), Buffer.from(cred.hash, 'hex')) && Boolean(user);
    if (!ok) {
      if (failCounter) await failCounter.add(`cust:${ip}`, WINDOW_MS / 1000);
      else { local.push(now); this.fails.set(ip, local); }
      throw new HttpError(401, 'Incorrect email or password');
    }
    if (failCounter) await failCounter.reset(`cust:${ip}`);
    this.fails.delete(ip);
    return user;
  }

  logout() { return this.cookie('', 0); }

  /** Admin view: list of customers without credentials. */
  async list() {
    return (await this.repo.all()).map(({ credential, ...u }) => u).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }
}

const publicUser = (u) => ({ id: u.id, name: u.name, email: u.email });

module.exports = { Accounts, publicUser };
