// ARCHIVO: Backend/Gateway/src/utils/consulDiscovery.js
'use strict';
const https = require('https');

const CONSUL_HOST = process.env.CONSUL_HOST || 'consul-lexim.onrender.com';
const CONSUL_PORT = parseInt(process.env.CONSUL_PORT || '443', 10);

// Cache simple: { serviceName -> { url, expiresAt } }
const _cache = {};
const CACHE_TTL = 30_000; // 30 s

function consulGet(path) {
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: CONSUL_HOST,
        port: CONSUL_PORT,
        path,
        method: 'GET',
        rejectUnauthorized: false
      },
      (res) => {
        let out = '';
        res.on('data', c => (out += c));
        res.on('end', () => {
          if (res.statusCode === 200) {
            try { resolve(JSON.parse(out)); }
            catch (_) { reject(new Error('Consul: respuesta no es JSON')); }
          } else {
            reject(new Error(`Consul HTTP ${res.statusCode}`));
          }
        });
      }
    );
    req.on('error', reject);
    req.setTimeout(3000, () => req.destroy(new Error('Consul timeout')));
    req.end();
  });
}

/**
 * Intenta resolver la URL del servicio desde Consul.
 * Si Consul no responde o el servicio no está passing, retorna fallbackUrl.
 * Nunca lanza excepción.
 */
async function resolveService(serviceName, fallbackUrl) {
  // Devolver caché si está vigente
  const cached = _cache[serviceName];
  if (cached && cached.expiresAt > Date.now()) {
    return cached.url;
  }

  try {
    const services = await consulGet(
      `/v1/health/service/${encodeURIComponent(serviceName)}?passing=true`
    );
    if (Array.isArray(services) && services.length > 0) {
      const { Service } = services[0];
      const address = Service.Address || 'localhost';
      const port    = Service.Port;
      const url     = `http://${address}:${port}`;
      _cache[serviceName] = { url, expiresAt: Date.now() + CACHE_TTL };
      console.log(`[Consul] Resuelto ${serviceName} → ${url}`);
      return url;
    }
  } catch (err) {
    console.warn(`[Consul] Discovery falló para "${serviceName}": ${err.message} — usando fallback`);
  }

  return fallbackUrl;
}

module.exports = { resolveService };
