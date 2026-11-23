'use strict';
// Order + event repositories. Same async interface, two backends:
//  - Local JSON files (single process: development / a single VM).
//  - Upstash Redis with ATOMIC operations (serverless / multiple instances):
//      INCR for order numbers, SET NX for idempotency keys, one key per order,
//      RPUSH/LTRIM lists for events — so concurrent checkouts can never overwrite each other.
const { JsonFile, remoteEnabled, redisCmd, redisPipe, PREFIX } = require('./store');

const k = (s) => PREFIX + s;
const IDEM_TTL = 7 * 24 * 3600;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------- local ----
class LocalOrderRepo {
  constructor(file) { this.src = new JsonFile(file, { seq: 0, orders: [] }); }
  async all() { return this.src.read().orders; }
  async get(id) { return this.src.read().orders.find((o) => o.id === id) || null; }
  async findByKey(key) { return this.src.read().orders.find((o) => o.idempotencyKey === key) || null; }
  async claim() { return { ok: true }; } // single process: in-flight map in Orders handles races
  async complete() {}
  async release() {}
  async nextSeq() { const d = this.src.read(); d.seq += 1; this.src.write(d); return d.seq; }
  async insert(order) { const d = this.src.read(); d.orders.push(order); this.src.write(d); }
  async update(order) { const d = this.src.read(); const i = d.orders.findIndex((o) => o.id === order.id); if (i >= 0) d.orders[i] = order; this.src.write(d); }
  async clear() { const d = this.src.read(); this.src.write({ seq: d.seq, orders: [] }); }
}

class LocalEventRepo {
  constructor(file, max) { this.src = new JsonFile(file, { events: [] }); this.max = max; }
  async append(ev) {
    const d = this.src.read();
    d.events.push(ev);
    if (d.events.length > this.max) d.events.splice(0, d.events.length - this.max);
    this.src.write(d);
  }
  async all() { return this.src.read().events; }
  async clear() { this.src.write({ events: [] }); }
}

// ---------------------------------------------------------------- redis ----
let migrated = null;
/** One-time import of data saved by the earlier single-key format. */
function migrateLegacy() {
  migrated ||= (async () => {
    if ((await redisCmd('SET', k('migrated:v2'), '1', 'NX')) !== 'OK') return;
    const [ordersJson, eventsJson] = await redisPipe([['GET', k('orders')], ['GET', k('events')]]);
    const cmds = [];
    if (ordersJson) {
      const legacy = JSON.parse(ordersJson);
      for (const o of legacy.orders || []) {
        cmds.push(['SET', k(`order:${o.id}`), JSON.stringify(o)], ['RPUSH', k('orders:ids'), o.id]);
        if (o.idempotencyKey) cmds.push(['SET', k(`idem:${o.idempotencyKey}`), o.id, 'EX', IDEM_TTL]);
      }
      cmds.push(['SET', k('orders:seq'), String(legacy.seq || 0)], ['RENAME', k('orders'), k('orders:legacy-v1')]);
    }
    if (eventsJson) {
      const legacy = JSON.parse(eventsJson);
      const evs = (legacy.events || []).map((e) => JSON.stringify(e));
      for (let i = 0; i < evs.length; i += 200) cmds.push(['RPUSH', k('events:list'), ...evs.slice(i, i + 200)]);
      cmds.push(['RENAME', k('events'), k('events:legacy-v1')]);
    }
    if (cmds.length) await redisPipe(cmds);
  })().catch((err) => { migrated = null; throw err; });
  return migrated;
}

class RedisOrderRepo {
  async all() {
    await migrateLegacy();
    const ids = (await redisCmd('LRANGE', k('orders:ids'), 0, -1)) || [];
    const out = [];
    for (let i = 0; i < ids.length; i += 200) {
      const vals = await redisCmd('MGET', ...ids.slice(i, i + 200).map((id) => k(`order:${id}`)));
      vals.forEach((v) => { if (v) out.push(JSON.parse(v)); });
    }
    return out;
  }
  async get(id) { await migrateLegacy(); const v = await redisCmd('GET', k(`order:${id}`)); return v ? JSON.parse(v) : null; }
  async findByKey(key) {
    await migrateLegacy();
    const id = await redisCmd('GET', k(`idem:${key}`));
    return id && id !== 'pending' ? this.get(id) : null;
  }
  /** Atomically reserves an idempotency key. If another instance holds it, waits for that order. */
  async claim(key) {
    if ((await redisCmd('SET', k(`idem:${key}`), 'pending', 'NX', 'EX', 60)) === 'OK') return { ok: true };
    for (let i = 0; i < 40; i++) {
      const id = await redisCmd('GET', k(`idem:${key}`));
      if (id && id !== 'pending') return { ok: false, existing: await this.get(id) };
      if (!id) return this.claim(key); // holder failed and released it
      await sleep(150);
    }
    return { ok: false, existing: null };
  }
  async complete(key, id) { await redisCmd('SET', k(`idem:${key}`), id, 'EX', IDEM_TTL); }
  async release(key) { await redisCmd('DEL', k(`idem:${key}`)); }
  async nextSeq() { await migrateLegacy(); return Number(await redisCmd('INCR', k('orders:seq'))); }
  async insert(order) { await redisPipe([['SET', k(`order:${order.id}`), JSON.stringify(order)], ['RPUSH', k('orders:ids'), order.id]]); }
  async update(order) { await redisCmd('SET', k(`order:${order.id}`), JSON.stringify(order)); }
  async clear() {
    const ids = (await redisCmd('LRANGE', k('orders:ids'), 0, -1)) || [];
    const cmds = [['DEL', k('orders:ids')]];
    for (let i = 0; i < ids.length; i += 200) cmds.push(['DEL', ...ids.slice(i, i + 200).map((id) => k(`order:${id}`))]);
    await redisPipe(cmds);
  }
}

class RedisEventRepo {
  constructor(max) { this.max = max; }
  async append(ev) { await redisPipe([['RPUSH', k('events:list'), JSON.stringify(ev)], ['LTRIM', k('events:list'), -this.max, -1]]); }
  async all() { await migrateLegacy(); return ((await redisCmd('LRANGE', k('events:list'), 0, -1)) || []).map((s) => JSON.parse(s)); }
  async clear() { await redisCmd('DEL', k('events:list')); }
}

/** Login-failure counter shared by all instances (lockout cannot be bypassed by hitting another instance). */
const failCounter = remoteEnabled ? {
  async count(ip) { return Number((await redisCmd('GET', k(`fails:${ip}`))) || 0); },
  async add(ip, windowSec) { await redisPipe([['INCR', k(`fails:${ip}`)], ['EXPIRE', k(`fails:${ip}`), windowSec]]); },
  async reset(ip) { await redisCmd('DEL', k(`fails:${ip}`)); },
} : null;

module.exports = {
  orderRepo: (file) => (remoteEnabled ? new RedisOrderRepo() : new LocalOrderRepo(file)),
  eventRepo: (file, max) => (remoteEnabled ? new RedisEventRepo(max) : new LocalEventRepo(file, max)),
  failCounter,
};
