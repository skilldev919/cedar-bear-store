'use strict';
// Protected administration (ORDER-01, AT-07).
// Sessions are stateless HMAC-signed cookies so they work across serverless instances.
// The signing key derives from the active password hash (or SESSION_SECRET), so changing the
// password — or "sign out all sessions" (epoch bump) — invalidates every existing session.
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { JsonFile } = require('./store');
const { HttpError, parseCookies, clientIp } = require('./http');
const { failCounter } = require('./repos');

const COOKIE = 'cb_admin';
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILS = 5;

function hash(password, salt = crypto.randomBytes(16).toString('hex')) {
  return { salt, hash: crypto.scryptSync(password, salt, 64).toString('hex') };
}
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');

class Auth {
  constructor(file, { envPassword, secureCookies = false, sessionSecret } = {}) {
    this.src = new JsonFile(file, { credential: null, attempts: [], epoch: 0 }, { remoteKey: 'auth' });
    this.fails = new Map();
    this.secureCookies = secureCookies;
    this.sessionSecret = sessionSecret || null;
    // Deterministic salt so every serverless instance derives the same session-signing key.
    this.env = envPassword ? hash(envPassword, crypto.createHash('sha256').update(`cedarbear-env:${envPassword}`).digest('hex').slice(0, 32)) : null;
    if (!this.env) {
      const data = this.src.read();
      if (!data.credential) {
        const pw = crypto.randomBytes(9).toString('base64url');
        data.credential = hash(pw);
        data.credentialSource = 'generated';
        this.src.write(data);
        this.generatedPassword = pw;
        try {
          fs.writeFileSync(path.join(path.dirname(file), 'INITIAL_ADMIN_PASSWORD.txt'),
            `Cedar Bear admin password (generated ${new Date().toISOString()}):\n${pw}\n\nChange it in Admin > Access & Security, then delete this file.\n`);
        } catch { /* read-only filesystem */ }
      }
    }
  }

  /** Password set by an administrator wins; otherwise ADMIN_PASSWORD; otherwise the generated one. */
  active() {
    const d = this.src.read();
    if (d.credential && (d.credentialSource === 'admin' || !this.env)) return { cred: d.credential, source: d.credentialSource || 'generated' };
    if (this.env) return { cred: this.env, source: 'env' };
    throw new HttpError(500, 'Admin credential not configured');
  }

  verify(password) {
    if (typeof password !== 'string' || password.length > 200) return false;
    const { cred } = this.active();
    const h = hash(password, cred.salt).hash;
    return crypto.timingSafeEqual(Buffer.from(h, 'hex'), Buffer.from(cred.hash, 'hex'));
  }

  key() {
    return crypto.createHash('sha256').update(`${this.sessionSecret || this.active().cred.hash}:cedarbear-session`).digest();
  }
  sign(payload) {
    const body = b64(payload);
    return `${body}.${crypto.createHmac('sha256', this.key()).update(body).digest('base64url')}`;
  }

  /** Signing secret for customer sessions: SESSION_SECRET, or a random secret generated once and stored. */
  customerSecret() {
    if (this.sessionSecret) return this.sessionSecret;
    const data = this.src.read();
    if (!data.customerSecret) {
      data.customerSecret = crypto.randomBytes(32).toString('hex');
      this.src.write(data);
    }
    return data.customerSecret;
  }

  logAttempt(ip, ok) {
    const data = this.src.read();
    data.attempts = [{ ts: new Date().toISOString(), ip, ok }, ...(data.attempts || [])].slice(0, 50);
    this.src.write(data);
  }

  async login(req, password) {
    const ip = clientIp(req);
    const now = Date.now();
    // Failure counting is shared across instances when Redis is configured.
    const f = (this.fails.get(ip) || []).filter((t) => now - t < WINDOW_MS);
    const failures = failCounter ? await failCounter.count(ip) : f.length;
    if (failures >= MAX_FAILS) throw new HttpError(429, 'Too many failed attempts. Try again in 15 minutes.');
    if (!this.verify(password)) {
      if (failCounter) await failCounter.add(ip, WINDOW_MS / 1000);
      else { f.push(now); this.fails.set(ip, f); }
      this.logAttempt(ip, false);
      throw new HttpError(401, 'Incorrect password');
    }
    if (failCounter) await failCounter.reset(ip);
    this.fails.delete(ip);
    this.logAttempt(ip, true);
    const token = this.sign({ iat: now, exp: now + SESSION_TTL_MS, ip, e: this.src.read().epoch || 0 });
    return this.cookie(token, SESSION_TTL_MS / 1000);
  }

  cookie(value, maxAge) {
    return `${COOKIE}=${value}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAge}${this.secureCookies ? '; Secure' : ''}`;
  }

  session(req) {
    const token = parseCookies(req)[COOKIE];
    if (!token || token.length > 1000) return null;
    const [body, sig] = token.split('.');
    if (!body || !sig) return null;
    const expected = crypto.createHmac('sha256', this.key()).update(body).digest('base64url');
    if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
    let p;
    try { p = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')); } catch { return null; }
    if (!p || Date.now() > p.exp || p.e !== (this.src.read().epoch || 0)) return null;
    return { createdAt: p.iat, ip: p.ip };
  }

  require(req) {
    const s = this.session(req);
    if (!s) throw new HttpError(401, 'Authorized access only');
    return s;
  }

  logout() { return this.cookie('', 0); }

  revokeAll() {
    const data = this.src.read();
    data.epoch = (data.epoch || 0) + 1;
    this.src.write(data);
  }

  changePassword(current, next) {
    if (!this.verify(current)) throw new HttpError(400, 'Current password is incorrect');
    if (typeof next !== 'string' || next.length < 10 || next.length > 200) throw new HttpError(400, 'New password must be at least 10 characters');
    const data = this.src.read();
    data.credential = hash(next);
    data.credentialSource = 'admin';
    data.epoch = (data.epoch || 0) + 1;
    this.src.write(data);
    try { fs.unlinkSync(path.join(path.dirname(this.src.file), 'INITIAL_ADMIN_PASSWORD.txt')); } catch { /* already gone */ }
  }

  securityInfo(current) {
    const data = this.src.read();
    return {
      sessionStartedAt: new Date(current.createdAt).toISOString(),
      sessionIp: current.ip,
      activeSessions: null,
      sessionTtlHours: SESSION_TTL_MS / 3600000,
      credentialSource: this.active().source,
      attempts: (data.attempts || []).slice(0, 20),
      lockout: { maxFailures: MAX_FAILS, windowMinutes: WINDOW_MS / 60000 },
    };
  }
}

module.exports = { Auth };
