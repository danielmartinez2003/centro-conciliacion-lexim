// ARCHIVO: src/utils/consulRegister.js
'use strict';
const http = require('http');

const CONSUL_HOST  = process.env.CONSUL_HOST  || 'consul_lexim';
const CONSUL_PORT  = parseInt(process.env.CONSUL_PORT  || '8500', 10);
const SERVICE_NAME = process.env.SERVICE_NAME;
const SERVICE_PORT = parseInt(process.env.SERVICE_PORT || '3000', 10);
const SERVICE_ID   = SERVICE_NAME ? `${SERVICE_NAME}-${SERVICE_PORT}` : null;

function consulPut(path, body) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : '';
    const options = {
      hostname: CONSUL_HOST,
      port:     CONSUL_PORT,
      path,
      method:   'PUT',
      headers: {
        'Content-Type':   'application/json',
        'Content-Length': Buffer.byteLength(payload)
      }
    };
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end',  () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', reject);
    req.setTimeout(5000, () => req.destroy(new Error('Consul timeout')));
    if (payload) req.write(payload);
    req.end();
  });
}

async function registerService() {
  if (!SERVICE_NAME) {
    console.warn('[Consul] SERVICE_NAME no definido — saltando registro');
    return;
  }
  try {
    const body = {
      ID:      SERVICE_ID,
      Name:    SERVICE_NAME,
      Address: SERVICE_NAME,
      Port:    SERVICE_PORT,
      Tags:    ['lexim', 'microservice'],
      Check: {
        HTTP:                           `http://${SERVICE_NAME}:${SERVICE_PORT}/health`,
        Interval:                       '15s',
        Timeout:                        '5s',
        DeregisterCriticalServiceAfter: '30s'
      }
    };
    const res = await consulPut('/v1/agent/service/register', body);
    if (res.status === 200) {
      console.log(`[Consul] ✓ ${SERVICE_NAME}:${SERVICE_PORT} registrado`);
    } else {
      console.warn(`[Consul] Respuesta inesperada ${res.status}: ${res.body}`);
    }
  } catch (err) {
    console.error('[Consul] Error al registrar:', err.message);
  }
}

async function deregisterService() {
  if (!SERVICE_ID) return;
  try {
    await consulPut(`/v1/agent/service/deregister/${SERVICE_ID}`, null);
    console.log(`[Consul] ${SERVICE_NAME} desregistrado`);
  } catch (err) {
    // silencioso — el contenedor ya está apagando
  }
}

module.exports = { registerService, deregisterService };
