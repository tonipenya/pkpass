# Pocket

A minimal Apple Wallet pass editor. The frontend runs on GitHub Pages; a small Cloudflare Worker forwards signing requests to walletmcppass. No Apple Developer subscription, signing certificates, API keys, database, or paid signing client.

Click a field to edit it. Edit text and labels directly on the card. Upload or paste a logo or barcode image; paste text onto a selected barcode to generate a QR code. Empty fields never export example text. Download pass starts signing immediately, then shows the download link, a QR code, and a short service credit.

## Local development

```sh
npm ci
npm run worker:dev
```

In a second terminal:

```sh
npm run dev
```

Open http://127.0.0.1:5173. Vite forwards `/api/passes` to the local Cloudflare runtime at port 8787. Local development needs no Cloudflare login. Creating a pass contacts the real signing service and consumes one free request.

## Current deployment

- Repository: https://github.com/tonipenya/pkpass
- Signing endpoint: https://pocket-pass-signing.pocket-pass.workers.dev/api/passes
- GitHub repository variable `VITE_SIGNING_URL` points to this endpoint.
- App: https://www.tonipenya.com/pkpass/ (GitHub Pages inherits the account’s existing custom domain)

## Deploy the Worker (free Cloudflare account)

1. Run `npx wrangler login` and authorize in your browser.
2. In `wrangler.jsonc`, set `vars.ALLOWED_ORIGINS` to your GitHub Pages **origin**, e.g. `https://tonipenya.github.io` (no repository path). Multiple origins may be comma-separated. Localhost is only allowed by the separate local environment.
3. Run `npm run worker:deploy`. Keep Cloudflare on the Workers Free plan. If prompted, register your free workers.dev subdomain.
4. Copy the printed Worker URL, e.g. `https://pocket-pass-signing.YOUR-SUBDOMAIN.workers.dev`.

No credentials belong in this repository or the frontend. Wrangler manages Cloudflare authentication on your machine. Cloudflare deployment is manual; GitHub Actions does not need Cloudflare secrets.

## Deploy GitHub Pages

1. Push this project to a GitHub repository with a `main` branch.
2. In repository Settings → Pages, select **GitHub Actions** as the build source.
3. In Settings → Secrets and variables → Actions → Variables, create `VITE_SIGNING_URL` with the Worker URL plus `/api/passes`:
   `https://pocket-pass-signing.YOUR-SUBDOMAIN.workers.dev/api/passes`
4. Run the **Deploy GitHub Pages** workflow from Actions (or push to `main`).

While the repository is private, the workflow only tests and builds; it skips Pages publication. After you make it public and enable Pages, run the workflow to publish `dist/`. Vite uses relative assets so repository paths such as `/pkpass/` work. The Worker URL is public configuration, not a secret. The workflow refuses to build a deployment without it.

For a manual static build, copy `.env.example` to `.env.local`, set the URL, and run `npm run build`.

## Limits and privacy

- The service currently allows 30 free calls per day per IP, subject to a shared 500-call daily pool. Cloudflare egress IPs may be shared; do not assume this quota is per visitor or per app.
- On HTTP 402/429, Pocket stops and asks the user to retry after 00:00 UTC. It has no payment SDK, wallet, credentials, payment headers, or automatic retries.
- Download sends card text, images, and barcode content through Cloudflare to walletmcppass. The service says it deletes generated pass files after one hour and logs request metadata, including organization name. Pocket requests no ongoing pass updates and stores no drafts or pass data on its Worker. Cloudflare observability is disabled in its config.
- The Worker accepts only the configured browser origins and a fixed signing endpoint. CORS is a browser restriction, not authentication or protection against scripts impersonating an origin. Free-service quotas still apply.
- The browser normalizes uploaded images to PNG. The Worker caps requests at 6 MiB and accepts embedded image data only.
- Wallet chooses typography and final layout. Text, label, and background colors apply globally and export to Wallet. Individual text sizes affect only the editor preview. Uploaded QR, Aztec, PDF417 and Code 128 images are decoded into real barcode content.
- Refreshing clears the draft. Fonts are loaded from Google Fonts; application dependencies are bundled.

## Verification

```sh
npm test
npm run build
npm run worker:check
```

Tests cover placeholder omission, payload mapping, CORS preflight, request limits, error handling, quota failures, and the absence of payment retries/forwarded credentials. Live integration can be checked with dummy data through the local Worker; this consumes a real service request. Verified on 2026-10-19: the local browser flow generated a signed pass; the deployed Cloudflare Worker passed a GitHub-origin CORS preflight and returned a pass containing the requested text, barcode, logo, and thumbnail. File hashes and the CMS signature were verified against Apple’s root certificate. An iPhone is still needed to verify Wallet installation.

References: [Signing service](https://walletmcppass.com/), [Workers limits](https://developers.cloudflare.com/workers/platform/limits/).
