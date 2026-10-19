import './style.css';
import QRCode from 'qrcode';
import { BrowserMultiFormatReader, BarcodeFormat } from '@zxing/library';
import { makeSigningRequest, requestSignedPass } from './signing.js';

const defaults = {
  organization: { label: '', placeholder: 'Your brand', size: 16 },
  header: { label: 'PASS TYPE', placeholder: 'Member', size: 15 },
  primary: { label: 'PASS TITLE', placeholder: 'Pass title', size: 29 },
  secondary: { label: 'NAME', placeholder: 'Alex Morgan', size: 16 },
  auxiliary: { label: 'MEMBER SINCE', placeholder: '2026', size: 16 },
};
const freshState = () => ({ serialNumber: crypto.randomUUID(), background: '#294f45', fields: Object.fromEntries(Object.entries(defaults).map(([key, field]) => [key, { ...field, value: '', color: '#faf7e9' }])), images: {}, barcode: null });
let state = freshState();
let selected = null;
let imageTarget = null;
let toastTimer;
let barcodeRevision = 0;
const editor = document.querySelector('#editor');
const imageInput = document.querySelector('#image-input');
const dialog = document.querySelector('#export-dialog');
const showMessage = (message) => {
  const toast = document.querySelector('#toast');
  toast.textContent = message;
  toast.style.display = 'block';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.style.display = 'none', 4500);
};
function renderCard() {
  document.querySelector('#pass-card').style.setProperty('--card-background', state.background);
  document.querySelector('#background-swatch').style.background = state.background;
  for (const [key, field] of Object.entries(state.fields)) {
    const button = document.querySelector(`[data-field="${key}"]`);
    button.querySelector('.value').textContent = field.value || field.placeholder;
    button.querySelector('.value').style.color = field.color;
    button.querySelector('.value').style.fontSize = `${field.size}px`;
    const label = button.querySelector('.label');
    if (label) label.textContent = field.label;
    button.classList.toggle('selected', selected === key);
  }
  for (const key of ['logo', 'thumbnail']) {
    const button = document.getElementById(key);
    button.replaceChildren();
    if (state.images[key]) {
      const image = new Image(); image.src = state.images[key]; image.alt = key; button.append(image);
    } else {
      const plus = document.createElement('span'); plus.textContent = '＋';
      const caption = document.createElement('small'); caption.textContent = key === 'logo' ? 'LOGO' : 'IMAGE';
      button.append(plus, caption);
    }
  }
  const barcode = document.querySelector('#barcode');
  if (state.barcode?.preview) {
    const image = new Image(); image.src = state.barcode.preview; image.alt = 'Pass barcode';
    barcode.replaceChildren(image);
  } else barcode.innerHTML = '<span class="sample-barcode" aria-hidden="true"></span><span class="barcode-caption">Add a barcode</span>';
}
function selectElement(key) {
  selected = key;
  renderCard();
  if (!key) {
    editor.replaceChildren();
    return;
  }
  if (state.fields[key]) {
    editor.innerHTML = '<div class="eyebrow">EDIT TEXT</div><label>Text<input id="field-value" type="text" autocomplete="off"></label><label id="label-control">Label<input id="field-label" type="text"></label><div class="style-row"><label>Color <input id="field-color" type="color"></label><label>Size <output id="size-output"></output></label></div><input id="field-size" aria-label="Text size" type="range" min="10" max="38"><button class="clear-button" id="clear-field">Clear field</button><p class="small-note">Text styling is preview-only. Wallet controls the final appearance.</p>';
    const field = state.fields[key];
    const value = editor.querySelector('#field-value'); value.value = field.value; value.placeholder = field.placeholder.replace('\n', ' ');
    const label = editor.querySelector('#field-label'); label.value = field.label;
    editor.querySelector('#label-control').hidden = key === 'organization';
    const color = editor.querySelector('#field-color'); color.value = field.color;
    const size = editor.querySelector('#field-size'); size.value = field.size;
    editor.querySelector('#size-output').textContent = `${field.size}px`;
    value.oninput = () => { field.value = value.value; renderCard(); };
    label.oninput = () => { field.label = label.value; renderCard(); };
    color.oninput = () => { field.color = color.value; renderCard(); };
    size.oninput = () => { field.size = Number(size.value); editor.querySelector('#size-output').textContent = `${size.value}px`; renderCard(); };
    editor.querySelector('#clear-field').onclick = () => { field.value = ''; renderCard(); selectElement(key); };
    value.focus();
  } else if (key === 'background') {
    editor.innerHTML = '<label>Card color <input id="card-color" type="color"></label>';
    const color = editor.querySelector('#card-color'); color.value = state.background;
    color.oninput = () => { state.background = color.value; renderCard(); };
  } else {
    const isBarcode = key === 'barcode';
    editor.innerHTML = `<div class="eyebrow">${isBarcode ? 'BARCODE' : key.toUpperCase()}</div>${isBarcode ? '<label>Barcode content<input id="barcode-value" type="text" placeholder="A member ID, link, or text"></label><p class="small-note">Type for QR. Upload QR, Aztec, PDF417, or Code 128.</p>' : '<p>Upload or paste (⌘V / Ctrl+V).</p>'}<button class="upload-button" id="upload">Choose image ↑</button><button class="clear-button" id="remove-image">Remove ${isBarcode ? 'barcode' : 'image'}</button>`;
    editor.querySelector('#upload').onclick = () => { imageTarget = key; imageInput.click(); };
    editor.querySelector('#remove-image').onclick = () => { if (isBarcode) { barcodeRevision++; state.barcode = null; } else delete state.images[key]; renderCard(); selectElement(key); };
    if (isBarcode) {
      const input = editor.querySelector('#barcode-value'); input.value = state.barcode?.message || '';
      input.oninput = async () => {
        const revision = ++barcodeRevision;
        const message = input.value;
        if (!message) { state.barcode = null; renderCard(); return; }
        try {
          const preview = await QRCode.toDataURL(message, { margin: 2, width: 220 });
          if (revision !== barcodeRevision) return;
          state.barcode = { message, format: 'PKBarcodeFormatQR', preview }; renderCard();
        } catch { if (revision === barcodeRevision) { state.barcode = null; renderCard(); showMessage('This text is too long for a QR code.'); } }
      };
    }
  }
}
async function readImage(file, target) {
  const url = URL.createObjectURL(file);
  try {
    const image = new Image(); image.src = url; await image.decode();
    const canvas = document.createElement('canvas');
    const scale = Math.min(1, 1400 / Math.max(image.width, image.height));
    canvas.width = Math.round(image.width * scale); canvas.height = Math.round(image.height * scale);
    canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/png');
    if (target === 'barcode') {
      const revision = ++barcodeRevision;
      const reader = new BrowserMultiFormatReader();
      let result;
      try { result = await reader.decodeFromImageUrl(url); } finally { reader.reset(); }
      const formats = { [BarcodeFormat.QR_CODE]: 'PKBarcodeFormatQR', [BarcodeFormat.AZTEC]: 'PKBarcodeFormatAztec', [BarcodeFormat.PDF_417]: 'PKBarcodeFormatPDF417', [BarcodeFormat.CODE_128]: 'PKBarcodeFormatCode128' };
      const format = formats[result.getBarcodeFormat()];
      if (!format) throw new Error('Use a QR, Aztec, PDF417, or Code 128 barcode.');
      if (revision !== barcodeRevision) return;
      state.barcode = { message: result.getText(), format, preview: dataUrl };
    } else state.images[target] = dataUrl;
    renderCard(); selectElement(target);
  } catch (error) { showMessage(target === 'barcode' ? error.message || 'No readable barcode found. Try a clearer image.' : 'This image could not be opened. Try a PNG or JPG.'); }
  finally { URL.revokeObjectURL(url); }
}
imageInput.onchange = () => { if (imageInput.files[0]) readImage(imageInput.files[0], imageTarget); imageInput.value = ''; };
document.addEventListener('paste', event => {
  if (dialog.open) return;
  const file = [...(event.clipboardData?.items || [])].find(item => item.type.startsWith('image/'))?.getAsFile();
  if (!file) return;
  event.preventDefault();
  readImage(file, ['logo', 'thumbnail', 'barcode'].includes(selected) ? selected : 'thumbnail');
});
document.querySelectorAll('[data-field]').forEach(button => button.onclick = () => selectElement(button.dataset.field));
for (const key of ['logo', 'thumbnail', 'barcode']) document.getElementById(key).onclick = () => selectElement(key);
document.querySelector('#background-button').onclick = () => selectElement('background');
document.querySelector('#reset').onclick = () => {
  if (!confirm('Clear this pass and start again?')) return;
  barcodeRevision++; state = freshState(); selectElement(null);
};
document.querySelector('#download').onclick = () => {
  document.querySelector('#export-status').textContent = '';
  document.querySelector('#export-result').hidden = true;
  document.querySelector('#signed-download').hidden = false;
  dialog.showModal();
};
document.querySelector('#close-dialog').onclick = () => dialog.close();


async function imageBase64(source, width, height, background) {
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
  const context = canvas.getContext('2d');
  if (background) { context.fillStyle = background; context.fillRect(0, 0, width, height); }
  if (source) {
    const image = new Image(); image.src = source; await image.decode();
    const scale = Math.min(width / image.width, height / image.height);
    context.drawImage(image, (width - image.width * scale) / 2, (height - image.height * scale) / 2, image.width * scale, image.height * scale);
  }
  return canvas.toDataURL('image/png').split(',')[1];
}
async function signingImages() {
  const images = { icon_png_b64: await imageBase64(state.images.logo, 87, 87, state.background) };
  if (state.images.logo) images.logo_png_b64 = await imageBase64(state.images.logo, 480, 150);
  if (state.images.thumbnail) images.thumbnail_png_b64 = await imageBase64(state.images.thumbnail, 270, 270);
  return images;
}
const signingEndpoint = import.meta.env.VITE_SIGNING_URL || (import.meta.env.DEV ? '/api/passes' : '');
document.querySelector('#export-form').onsubmit = async event => {
  event.preventDefault();
  const button = document.querySelector('#signed-download'); button.disabled = true;
  const status = document.querySelector('#export-status'); status.textContent = 'Creating your pass…';
  try {
    const payload = makeSigningRequest(state, await signingImages());
    const result = await requestSignedPass(signingEndpoint, payload);
    const link = document.querySelector('#pass-link'); link.href = result.download_url;
    document.querySelector('#pass-qr').src = await QRCode.toDataURL(result.download_url, { width: 180, margin: 2 });
    document.querySelector('#export-result').hidden = false;
    button.hidden = true;
    status.textContent = 'Ready. Open the link in Safari on your iPhone to add it to Wallet. The link expires in one hour.';
  } catch (error) { status.textContent = error.message; }
  finally { button.disabled = false; }
};
selectElement(null);
