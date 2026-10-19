import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeSigningRequest } from '../src/signing.js';
import { createWorker } from '../worker/index.js';

const origin = 'https://tonipenya.github.io';
const env = { ALLOWED_ORIGINS: origin };
const state = () => ({ background: '#294f45', fields: Object.fromEntries(['organization', 'header', 'primary', 'secondary', 'auxiliary'].map(key => [key, { label: 'EXAMPLE', value: '', placeholder: 'PLACEHOLDER' }])), barcode: null });
const request = (body, options = {}) => new Request('https://worker.example/api/passes', { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify(body), ...options });
const success = () => Response.json({ download_url: 'https://walletmcppass.com/download/test', expires_in_seconds: 3600, serial_number: 'private' });

test('blank placeholders and labels never enter the signing payload', () => {
  const payload = makeSigningRequest(state());
  assert.deepEqual(payload.primary_fields, []);
  assert.deepEqual(payload.secondary_fields, []);
  assert.deepEqual(payload.auxiliary_fields, []);
  assert.deepEqual(payload.header_fields, []);
  assert.equal(payload.generate_logo, false);
  assert.equal(payload.logo_text, '');
  assert.equal(payload.barcode_message, undefined);
  assert.doesNotMatch(JSON.stringify(payload), /PLACEHOLDER|EXAMPLE/);
});
test('text, background, supported barcode formats and images map to the API', () => {
  const draft = state(); draft.fields.primary.value = '  Library card  ';
  draft.fields.secondary.value = '   ';
  draft.barcode = { format: 'PKBarcodeFormatCode128', message: 'ABC123', preview: 'never send this' };
  const payload = makeSigningRequest(draft, { icon_png_b64: 'YWJj', thumbnail_png_b64: 'YWJj' });
  assert.equal(payload.primary_fields[0].value, 'Library card');
  assert.equal(payload.background_color, '#294f45');
  assert.equal(payload.barcode_format, 'Code128');
  assert.equal(payload.thumbnail_png_b64, 'YWJj');
  assert.deepEqual(payload.secondary_fields, []);
  assert.doesNotMatch(JSON.stringify(payload), /never send this/);
});
test('allowed browser preflight succeeds without spending an upstream call', async () => {
  const worker = createWorker(() => { throw new Error('Must not call upstream'); });
  const response = await worker.fetch(request(null, { method: 'OPTIONS', body: undefined }), env);
  assert.equal(response.status, 204);
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), origin);
  assert.equal(response.headers.get('Access-Control-Allow-Headers'), 'Content-Type');
});
test('disallowed origins, malformed requests, remote images and oversized bodies are rejected', async () => {
  const worker = createWorker(() => { throw new Error('Must not call upstream'); });
  assert.equal((await worker.fetch(request({}, { headers: { Origin: 'https://other.example' } }), env)).status, 403);
  assert.equal((await worker.fetch(request({}, { body: '{' }), env)).status, 400);
  assert.equal((await worker.fetch(request({ style: 'generic', thumbnail_png_b64: 'https://example.com/image.png' }), env)).status, 400);
  assert.equal((await worker.fetch(request({ style: 'generic', updatable: true }), env)).status, 400);
  assert.equal((await worker.fetch(request({}, { body: 'x'.repeat(6 * 1024 * 1024 + 1) }), env)).status, 413);
});
test('proxy sends one request to a fixed endpoint and never forwards payment or user headers', async () => {
  let calls = 0;
  const worker = createWorker(async (url, options) => {
    calls++;
    assert.equal(url, 'https://walletmcppass.com/api/passes');
    assert.deepEqual(options.headers, { 'Content-Type': 'application/json' });
    assert.equal(JSON.parse(options.body).style, 'generic');
    return success();
  });
  const response = await worker.fetch(request(makeSigningRequest(state()), { headers: { Origin: origin, 'Content-Type': 'application/json', 'PAYMENT-SIGNATURE': 'do-not-forward' } }), env);
  assert.equal(calls, 1);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), origin);
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  assert.deepEqual(await response.json(), { download_url: 'https://walletmcppass.com/download/test', expires_in_seconds: 3600 });
});
test('free quota exhaustion is a friendly error with no paid retry', async () => {
  let calls = 0;
  const worker = createWorker(async () => { calls++; return new Response('payment required', { status: 402 }); });
  const response = await worker.fetch(request(makeSigningRequest(state())), env);
  assert.equal(calls, 1);
  assert.equal(response.status, 429);
  assert.match((await response.json()).error, /No payment was made/);
});
test('upstream failures and unexpected download destinations are handled', async () => {
  for (const upstream of [async () => { throw new Error('timeout'); }, async () => new Response('unavailable', { status: 503 }), async () => Response.json({ download_url: 'https://other.example/download' })]) {
    const response = await createWorker(upstream).fetch(request(makeSigningRequest(state())), env);
    assert.equal(response.status, 502);
    assert.equal(response.headers.get('Access-Control-Allow-Origin'), origin);
  }
});
