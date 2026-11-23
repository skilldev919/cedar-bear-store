'use strict';
// JSON persistence. Two backends behind the same synchronous read()/write() surface:
//  - local files (default; atomic writes)
//  - Upstash Redis REST (when UPSTASH_REDIS_REST_URL/TOKEN or KV_REST_API_URL/TOKEN are set) —
//    used on serverless hosts such as Vercel where the filesystem is ephemeral.
// With Redis, `syncIn()` loads every remote store before a request and `flush()` saves changed ones after it.
const fs = require('fs');
const path = require('path');

const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL || '';
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN || '';
// Test and future production data are logically separated: APP_ENV=production uses its own key space.
const APP_ENV = (process.env.APP_ENV || 'test').toLowerCase();
const PREFIX = process.env.STORE_PREFIX || (APP_ENV === 'test' ? 'cedarbear:' : `cedarbear:${APP_ENV}:`);
const remoteEnabled = Boolean(REDIS_URL && REDIS_TOKEN);
const registry = [];

async function redis(body, pipeline = false) {
  const res = await fetch(`${REDIS_URL.replace(/\/$/, '')}${pipeline ? '/pipeline' : ''}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${REDIS_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Redis error ${res.status}`);
  return res.json();
}

class JsonFile {
  /** @param {{remoteKey?: string, seedFile?: string}} opts remoteKey enables Redis storage for this store. */
  constructor(file, defaults, { remoteKey = null, seedFile = null } = {}) {
    this.file = file;
    this.seedFile = seedFile || file;
    this.defaults = defaults;
    this.data = null;
    this.dirty = false;
    this.remoteKey = remoteEnabled && remoteKey ? PREFIX + remoteKey : null;
    registry.push(this);
  }
  readLocal() {
    for (const f of [this.file, this.seedFile]) {
      try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (err) { if (err.code !== 'ENOENT') throw err; }
    }
    return structuredClone(this.defaults);
  }
  read() {
    if (!this.data) this.data = this.readLocal();
    return this.data;
  }
  write(data = this.data) {
    this.data = data;
    this.dirty = true;
    if (this.remoteKey) return;
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      const tmp = `${this.file}.${process.pid}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
      fs.renameSync(tmp, this.file);
      this.dirty = false;
    } catch (err) {
      // Read-only filesystem (serverless without Redis): keep in memory for this instance.
      if (!['EROFS', 'EACCES', 'EPERM'].includes(err.code)) throw err;
    }
  }
}

async function syncIn() {
  const stores = registry.filter((s) => s.remoteKey);
  if (!stores.length) return;
  const { result } = await redis(['MGET', ...stores.map((s) => s.remoteKey)]);
  stores.forEach((s, i) => {
    s.data = result[i] ? JSON.parse(result[i]) : s.readLocal();
    s.dirty = false;
  });
}

async function flush() {
  const stores = registry.filter((s) => s.remoteKey && s.dirty);
  if (!stores.length) return;
  await redis(stores.map((s) => ['SET', s.remoteKey, JSON.stringify(s.data)]), true);
  stores.forEach((s) => { s.dirty = false; });
}

/** Single Redis command (or a pipeline when given an array of commands). */
const str = (cmd) => cmd.map(String);
async function redisCmd(...cmd) { return (await redis(str(cmd))).result; }
async function redisPipe(cmds) {
  const out = await redis(cmds.map(str), true);
  const failed = out.find((r) => r.error);
  if (failed) throw new Error(`Redis error: ${failed.error}`);
  return out.map((r) => r.result);
}

module.exports = { JsonFile, syncIn, flush, remoteEnabled, redisCmd, redisPipe, PREFIX };
