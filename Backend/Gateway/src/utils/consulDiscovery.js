// ARCHIVO: Backend/Gateway/src/utils/consulDiscovery.js
'use strict';
const https = require('https');

const CONSUL_HOST = process.env.CONSUL_HOST || 'consul-lexim.onrender.com';
const CONSUL_PORT = parseInt(process.env.CONSUL_PORT || '443', 10);
const CACHE_TTL   = 10_000;
const _cache    = new Map();
const _counters = new Map();

function consulGet(path) {
  return new Promise((resolve, reject) => {
    const req = https.request(
      { hostname: CONSUL_HOST, port: CONSUL_PORT, path, method: 'GET' },
      (res) => {
        let raw = '';
        res.on('data', chunk => { raw += chunk; });
        res.on('end', () => {
          try { resolve(JSON.parse(raw)); }
          catch { reject(new Error(`Consul parse error: ${raw.slice(0, 100)}`)); }
        });
      }
    );
    req.on('error', reject);
    req.setTimeout(5000, () => req.destroy(new Error('Consul timeout')));
    req.end();
  });
}

function pickRoundRobin(serviceName, instances) {
  const idx  = (_counters.get(serviceName) || 0) % instances.length;
  _counters.set(serviceName, idx + 1);
  const inst = instances[idx];
  return `http://${inst.address}:${inst.port}`;
}

async function discoverService(serviceName) {
  const now    = Date.now();
  const cached = _cache.get(serviceName);
  if (cached && cached.expiresAt > now) {
    return pickRoundRobin(serviceName, cached.instances);
  }
  const result = await consulGet(`/v1/health/service/${serviceName}?passing=true`);
  if (!Array.isArray(result) || result.length === 0) {
    throw new Error(`Sin instancias sanas para: ${serviceName}`);
  }
  const instances = result.map(e => ({
    address: e.Service.Address || e.Node.Address,
    port:    e.Service.Port
  }));
  _cache.set(serviceName, { instances, expiresAt: now + CACHE_TTL });
  return pickRoundRobin(serviceName, instances);
}

async function resolveService(serviceName, fallbackUrl) {
  try {
    const url = await discoverService(serviceName);
    console.log(`[Consul] ${serviceName} -> ${url}`);
    return url;
  } catch (err) {
    console.warn(`[Consul] Fallback -> ${fallbackUrl} (${err.message})`);
    return fallbackUrl;
  }
}

module.exports = { resolveService };