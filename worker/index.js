const signingEndpoint = 'https://walletmcppass.com/api/passes';
const maximumBodyBytes = 6 * 1024 * 1024;

// Inject fetch in tests; production uses the Worker's native fetch.
export function createWorker(sendRequest = fetch) {
  return {
    async fetch(request, env) {
      const origin = request.headers.get('Origin');
      const allowedOrigins = (env.ALLOWED_ORIGINS || '').split(',').map(value => value.trim());
      const headers = { 'Cache-Control': 'no-store', 'Vary': 'Origin' };
      const respond = (body, status = 200) => Response.json(body, { status, headers });
      if (!origin || !allowedOrigins.includes(origin)) return respond({ error: 'This site is not allowed to use the signing service.' }, 403);
      headers['Access-Control-Allow-Origin'] = origin;
      if (new URL(request.url).pathname !== '/api/passes') return respond({ error: 'Not found.' }, 404);
      if (request.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers: {
          ...headers, 'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Max-Age': '86400',
        } });
      }
      if (request.method !== 'POST') return respond({ error: 'Use POST to create a pass.' }, 405);
      if (!request.headers.get('Content-Type')?.startsWith('application/json')) return respond({ error: 'Send a JSON pass.' }, 415);
      if (Number(request.headers.get('Content-Length')) > maximumBodyBytes) return respond({ error: 'Images are too large. Use smaller images.' }, 413);
      // Bound streamed bodies too, since browsers need not send Content-Length.
      const reader = request.body?.getReader();
      if (!reader) return respond({ error: 'The pass is empty.' }, 400);
      const chunks = [];
      let length = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        length += value.length;
        if (length > maximumBodyBytes) { await reader.cancel(); return respond({ error: 'Images are too large. Use smaller images.' }, 413); }
        chunks.push(value);
      }
      const bytes = new Uint8Array(length);
      let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
      let payload;
      try { payload = JSON.parse(new TextDecoder().decode(bytes)); }
      catch { return respond({ error: 'The pass is not valid JSON.' }, 400); }
      if (!payload || payload.style !== 'generic') return respond({ error: 'Send a generic pass.' }, 400);
      // Do not accept update subscriptions, remote image URLs, or arbitrary service options.
      const permitted = ['style', 'organization_name', 'description', 'logo_text', 'generate_logo', 'background_color', 'foreground_color', 'label_color', 'header_fields', 'primary_fields', 'secondary_fields', 'auxiliary_fields', 'barcode_message', 'barcode_format', 'icon_png_b64', 'logo_png_b64', 'thumbnail_png_b64'];
      if (Object.keys(payload).some(key => !permitted.includes(key))) return respond({ error: 'Unsupported pass option.' }, 400);
      for (const key of ['icon_png_b64', 'logo_png_b64', 'thumbnail_png_b64']) {
        if (payload[key] && (typeof payload[key] !== 'string' || !/^[A-Za-z0-9+/=]+$/.test(payload[key]))) return respond({ error: 'Upload images as base64 PNG data.' }, 400);
      }
      try {
        const upstream = await sendRequest(signingEndpoint, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload), signal: AbortSignal.timeout(30000), redirect: 'manual',
        });
        // Never forward payment headers, credentials, or retry paid requests.
        if (upstream.status === 402 || upstream.status === 429) return respond({ error: 'The free signing limit has been reached. Try again after 00:00 UTC. No payment was made.' }, 429);
        if (upstream.status === 400) return respond({ error: 'The signing service rejected this pass. Check the text, images, and barcode.' }, 400);
        if (!upstream.ok) return respond({ error: 'The signing service is temporarily unavailable. Try again later.' }, 502);
        const result = await upstream.json();
        const download = new URL(result.download_url);
        if (download.origin !== 'https://walletmcppass.com' || !download.pathname.startsWith('/download/')) throw new Error('Invalid download URL');
        return respond({ download_url: download.href, expires_in_seconds: result.expires_in_seconds });
      } catch (error) {
        console.error('Signing request failed:', error.message);
        return respond({ error: 'The signing service did not respond. Try again later.' }, 502);
      }
    },
  };
}
export default createWorker();
