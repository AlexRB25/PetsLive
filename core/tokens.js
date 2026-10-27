// Cifrado de tokens de OAuth (AES-256-GCM). Solo servidor: web (rutas de API) y worker.
// TOKENS_KEY = 32 bytes en base64 (openssl rand -base64 32). Si se cambia, hay que volver a conectar las cuentas.
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

function key() {
  const k = Buffer.from(process.env.TOKENS_KEY || '', 'base64');
  if (k.length !== 32) throw new Error('TOKENS_KEY debe ser de 32 bytes en base64');
  return k;
}

export function encryptJSON(value) {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', key(), iv);
  const data = Buffer.concat([c.update(JSON.stringify(value), 'utf8'), c.final()]);
  return ['v1', iv.toString('base64'), c.getAuthTag().toString('base64'), data.toString('base64')].join('.');
}

export function decryptJSON(text) {
  const [v, iv, tag, data] = String(text).split('.');
  if (v !== 'v1') throw new Error('formato de token desconocido');
  const d = createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64'));
  d.setAuthTag(Buffer.from(tag, 'base64'));
  return JSON.parse(Buffer.concat([d.update(Buffer.from(data, 'base64')), d.final()]).toString('utf8'));
}
