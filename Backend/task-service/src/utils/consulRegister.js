// ARCHIVO: src/utils/consulRegister.js
'use strict';
const https = require('https');

const CONSUL_HOST  = process.env.CONSUL_HOST  || 'consul-lexim.onrender.com';
const CONSUL_PORT  = parseInt(process.env.CONSUL_PORT  || '443', 10);
const SERVICE_NAME = process.env.SERVICE_NAME;
const SERVICE_PORT = parseInt(process.env.SERVICE_PORT || '3001', 10);

let _ttlInterval = null;

function consulRequest(method, path, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const req = https.request(
      {
        hostname: CONSUL_HOST,
        port: CONSUL_PORT,
        path,
        method,
        rejectUnauthorized: false,
        headers: {
          'Content-Type': 'application/json',
          ...(data && { 'Content-Length': Buffer.byteLength(data) })
        }
      },
      (res) => {
        let out = '';
        res.on('data', c => (out += c));
        res.on('end', () => resolve({ status: res.statusCode, body: out }));
      }
    );
    req.on('error', reject);
    req.setTimeout(8000, () => req.destroy(new Error('Consul timeout')));
    if (data) req.write(data);
    req.end();
  });
}

async function passTTL(serviceId) {
  try {
    const { status } = await consulRequest('PUT', `/v1/agent/check/pass/service:${serviceId}`);
    if (status !== 200) {
      console.warn(`[Consul] TTL pass devolvió HTTP ${status} para ${serviceId}`);
    }
  } catch (err) {
    console.warn(`[Consul] No se pudo renovar TTL: ${err.message}`);
  }
}

async function registerService() {
  if (!SERVICE_NAME || !SERVICE_PORT) {
    console.warn('[Consul] SERVICE_NAME o SERVICE_PORT no definidos — omitiendo registro');
    return;
  }

  const serviceId = `${SERVICE_NAME}-${SERVICE_PORT}`;

  const payload = {
    ID:      serviceId,
    Name:    SERVICE_NAME,
    Address: SERVICE_NAME,
    Port:    SERVICE_PORT,
    Tags:    ['lexim', 'microservice'],
    Check: {
      TTL:                            '60s',
      DeregisterCriticalServiceAfter: '2m'
    }
  };

  try {
    const { status } = await consulRequest('PUT', '/v1/agent/service/register', payload);
    if (status === 200) {
      console.log(`[Consul] ${serviceId} registrado exitosamente`);

      // Marcar como passing de inmediato
      await passTTL(serviceId);
      console.log(`[Consul] TTL inicial enviado para ${serviceId}`);

      // Renovar cada 30 s para mantener el TTL de 60 s
      if (_ttlInterval) clearInterval(_ttlInterval);
      _ttlInterval = setInterval(() => passTTL(serviceId), 30_000);
    } else {
      console.error(`[Consul] Registro fallido — HTTP ${status}`);
    }
  } catch (err) {
    console.error(`[Consul] No se pudo conectar: ${err.message}`);
  }
}

async function deregisterService() {
  if (!SERVICE_NAME) return;

  // Detener renovación de TTL antes de desregistrar
  if (_ttlInterval) {
    clearInterval(_ttlInterval);
    _ttlInterval = null;
  }

  const serviceId = `${SERVICE_NAME}-${SERVICE_PORT}`;
  try {
    await consulRequest('PUT', `/v1/agent/service/deregister/${serviceId}`);
    console.log(`[Consul] ${serviceId} desregistrado`);
  } catch (err) {
    console.error(`[Consul] Error al desregistrar: ${err.message}`);
  }
}

module.exports = { registerService, deregisterService };
