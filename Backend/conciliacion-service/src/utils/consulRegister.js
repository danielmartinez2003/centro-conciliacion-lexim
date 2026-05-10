// ARCHIVO: src/utils/consulRegister.js
'use strict';
const https = require('https');

const CONSUL_HOST = process.env.CONSUL_HOST || 'consul-lexim.onrender.com';
const CONSUL_PORT = parseInt(process.env.CONSUL_PORT || '443', 10);
const SERVICE_NAME = process.env.SERVICE_NAME;
const SERVICE_PORT = parseInt(process.env.SERVICE_PORT || '3001', 10);

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
        res.on('data', c => out += c);
        res.on('end', () => resolve({ status: res.statusCode, body: out }));
      }
    );
    req.on('error', reject);
    req.setTimeout(5000, () => req.destroy(new Error('Consul timeout')));
    if (data) req.write(data);
    req.end();
  });
}

async function registerService() {
  if (!SERVICE_NAME || !SERVICE_PORT) {
    console.warn('[Consul] SERVICE_NAME o SERVICE_PORT no definidos');
    return;
  }
  const payload = {
    ID: `${SERVICE_NAME}-${SERVICE_PORT}`,
    Name: SERVICE_NAME,
    Address: SERVICE_NAME,
    Port: SERVICE_PORT,
    Tags: ['lexim', 'microservice'],
    Check: {
      HTTP: `http://${SERVICE_NAME}:${SERVICE_PORT}/health`,
      Interval: '15s',
      Timeout: '5s',
      DeregisterCriticalServiceAfter: '30s'
    }
  };
  try {
    const { status } = await consulRequest('PUT', '/v1/agent/service/register', payload);
    if (status === 200) {
      console.log(`[Consul] ${SERVICE_NAME}:${SERVICE_PORT} registrado exitosamente`);
    } else {
      console.error(`[Consul] Registro fallido - HTTP ${status}`);
    }
  } catch (err) {
    console.error(`[Consul] No se pudo conectar: ${err.message}`);
  }
}

async function deregisterService() {
  if (!SERVICE_NAME) return;
  try {
    await consulRequest('PUT', `/v1/agent/service/deregister/${SERVICE_NAME}-${SERVICE_PORT}`);
    console.log(`[Consul] ${SERVICE_NAME} desregistrado`);
  } catch (err) {
    console.error(`[Consul] Error al desregistrar: ${err.message}`);
  }
}

module.exports = { registerService, deregisterService };
