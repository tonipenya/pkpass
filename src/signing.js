export function makeSigningRequest(state, images = {}) {
  const field = key => {
    const { label, value } = state.fields[key];
    return value.trim() ? [{ key, label: label.trim(), value: value.trim() }] : [];
  };
  return {
    style: 'generic',
    organization_name: state.fields.organization.value.trim() || 'Personal pass',
    description: state.fields.primary.value.trim() || 'Personal pass',
    logo_text: state.fields.organization.value.trim(),
    generate_logo: false,
    background_color: state.background,
    foreground_color: state.textColor,
    label_color: state.labelColor,
    header_fields: field('header'), primary_fields: field('primary'),
    secondary_fields: field('secondary'), auxiliary_fields: field('auxiliary'),
    ...(state.barcode ? {
      barcode_message: state.barcode.message,
      barcode_format: state.barcode.format.replace('PKBarcodeFormat', ''),
    } : {}),
    ...images,
  };
}

export async function requestSignedPass(endpoint, payload) {
  if (!endpoint) throw new Error('Signing is not configured yet. Set VITE_SIGNING_URL to your Cloudflare Worker URL.');
  let response;
  try {
    response = await fetch(endpoint, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload), signal: AbortSignal.timeout(45000),
    });
  } catch {
    throw new Error('Could not reach the signing service. Try again shortly.');
  }
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Could not create your pass. Try again later.');
  const url = new URL(result.download_url);
  if (url.origin !== 'https://walletmcppass.com' || !url.pathname.startsWith('/download/')) {
    throw new Error('The signing service returned an invalid download link.');
  }
  return result;
}
