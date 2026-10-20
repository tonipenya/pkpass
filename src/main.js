import './style.css';
import QRCode from 'qrcode';
import JsBarcode from 'jsbarcode';
import { barcodeFormat, barcodeCaption } from './barcode.js';
import { BrowserMultiFormatReader, BarcodeFormat } from '@zxing/library';
import { makeSigningRequest, requestSignedPass } from './signing.js';

const defaults = {
  organization: { label: '', placeholder: 'Your brand', size: 16 },
  header: { label: 'PASS TYPE', placeholder: 'Member', size: 15 },
  primary: { label: 'PASS TITLE', placeholder: 'Pass title', size: 29 },
  secondary: { label: 'NAME', placeholder: 'Alex Morgan', size: 16 },
  auxiliary: { label: 'MEMBER SINCE', placeholder: '2026', size: 16 },
};
const freshState = () => ({ serialNumber: crypto.randomUUID(), background: '#294f45', textColor: '#faf7e9', labelColor: '#c4d3b0', fields: Object.fromEntries(Object.entries(defaults).map(([key, field]) => [key, { ...field, value: '' }])), images: {}, barcode: null });
let state = freshState();
let selected = null;
let imageTarget = null;
let toastTimer;
let barcodeRevision = 0;
let barcodePreference = 'auto';
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
  document.querySelectorAll('[data-color]').forEach(input => {
    input.value = state[input.dataset.color];
    input.parentElement.style.background = input.value;
  });
  for (const [key, field] of Object.entries(state.fields)) {
    const button = document.querySelector(`[data-field="${key}"]`);
    const value = button.querySelector('.value');
    if (document.activeElement !== value) value.textContent = field.value;
    value.dataset.placeholder = field.placeholder;
    button.querySelector('.value').style.color = state.textColor;
    button.querySelector('.value').style.fontSize = `${field.size}px`;
    const label = button.querySelector('.label');
    if (label) {
      if (document.activeElement !== label) label.textContent = field.label;
      label.style.color = state.labelColor;
    }
    button.classList.toggle('selected', selected === key);
  }
  for (const key of ['logo']) {
    const button = document.getElementById(key);
    button.replaceChildren();
    if (state.images[key]) {
      const image = new Image(); image.src = state.images[key]; image.alt = key; button.append(image);
    } else {
      const plus = document.createElement('span'); plus.textContent = '＋';
      const caption = document.createElement('small'); caption.textContent = 'LOGO';
      button.append(plus, caption);
    }
  }
  const barcode = document.querySelector('#barcode');
  const formatInput = editor.querySelector('#barcode-format');
  if (formatInput) formatInput.value = state.barcode?.format === 'PKBarcodeFormatCode128' ? 'barcode' : 'qr';
  if (state.barcode?.preview) {
    const image = new Image(); image.src = state.barcode.preview; image.alt = 'Pass barcode';
    barcode.replaceChildren(image);
    const caption = barcodeCaption(state.barcode);
    if (caption) {
      const text = document.createElement('span');
      text.className = 'barcode-caption';
      text.textContent = caption;
      text.style.color = state.textColor;
      barcode.append(text);
    }
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
    editor.innerHTML = '<div class="style-row"><label>Size <output id="size-output"></output></label></div><input id="field-size" aria-label="Text size" type="range" min="10" max="38"><button class="clear-button" id="clear-field">Clear field</button>';
    const field = state.fields[key];
    const size = editor.querySelector('#field-size'); size.value = field.size;
    editor.querySelector('#size-output').textContent = `${field.size}px`;
    size.oninput = () => { field.size = Number(size.value); editor.querySelector('#size-output').textContent = `${size.value}px`; renderCard(); };
    editor.querySelector('#clear-field').onclick = () => { field.value = ''; renderCard(); };
  } else {
    const isBarcode = key === 'barcode';
    editor.innerHTML = `<div class="eyebrow">${isBarcode ? 'BARCODE' : key.toUpperCase()}</div>${isBarcode ? '<label>Barcode content<input id="barcode-value" type="text" placeholder="A member ID, link, or text"></label><label>Format<select id="barcode-format"><option value="barcode">Barcode</option><option value="qr">QR</option></select></label><p class="small-note">Upload or paste an image (⌘V / Ctrl+V).</p>' : '<p>Upload or paste (⌘V / Ctrl+V).</p>'}<button class="upload-button" id="upload">Choose image ↑</button><button class="clear-button" id="remove-image">Remove ${isBarcode ? 'barcode' : 'image'}</button>`;
    editor.querySelector('#upload').onclick = () => { imageTarget = key; imageInput.click(); };
    editor.querySelector('#remove-image').onclick = () => { if (isBarcode) { barcodeRevision++; state.barcode = null; } else delete state.images[key]; renderCard(); selectElement(key); };
    if (isBarcode) {
      const input = editor.querySelector('#barcode-value'); input.value = state.barcode?.message || '';
      input.oninput = () => setBarcodeMessage(input.value);
      const format = editor.querySelector('#barcode-format');
      format.value = state.barcode?.format === 'PKBarcodeFormatCode128' ? 'barcode' : 'qr';
      format.onchange = () => { barcodePreference = format.value; setBarcodeMessage(input.value); };
    }
  }
}
async function setBarcodeMessage(message) {
  const revision = ++barcodeRevision;
  if (!message) { state.barcode = null; renderCard(); return; }
  try {
    const format = barcodeFormat(message, barcodePreference);
    let preview;
    if (format === 'PKBarcodeFormatCode128') {
      const canvas = document.createElement('canvas');
      JsBarcode(canvas, message, { format: 'CODE128', displayValue: false, width: 2, height: 80, margin: 12 });
      preview = canvas.toDataURL('image/png');
    } else preview = await QRCode.toDataURL(message, { margin: 2, width: 220 });
    if (revision !== barcodeRevision) return;
    state.barcode = { message, format, preview };
    renderCard();
  } catch {
    if (revision !== barcodeRevision) return;
    state.barcode = null; renderCard(); showMessage('This text is too long for a QR code.');
  }
}
async function readImage(file, target) {
  const revision = target === 'barcode' ? ++barcodeRevision : null;
  const url = URL.createObjectURL(file);
  try {
    const image = new Image(); image.src = url; await image.decode();
    const canvas = document.createElement('canvas');
    const scale = Math.min(1, 1400 / Math.max(image.width, image.height));
    canvas.width = Math.round(image.width * scale); canvas.height = Math.round(image.height * scale);
    canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/png');
    if (target === 'barcode') {
      const reader = new BrowserMultiFormatReader();
      let result;
      try { result = await reader.decodeFromImageUrl(url); } finally { reader.reset(); }
      const formats = { [BarcodeFormat.QR_CODE]: 'PKBarcodeFormatQR', [BarcodeFormat.AZTEC]: 'PKBarcodeFormatAztec', [BarcodeFormat.PDF_417]: 'PKBarcodeFormatPDF417', [BarcodeFormat.CODE_128]: 'PKBarcodeFormatCode128' };
      const format = formats[result.getBarcodeFormat()];
      if (!format) throw new Error('Use a QR, Aztec, PDF417, or Code 128 barcode.');
      if (revision !== barcodeRevision) return;
      state.barcode = { message: result.getText(), format, preview: dataUrl };
      barcodePreference = format === 'PKBarcodeFormatQR' ? 'qr' : 'barcode';
    } else state.images[target] = dataUrl;
    renderCard(); selectElement(target);
  } catch (error) { showMessage(target === 'barcode' ? error.message || 'No readable barcode found. Try a clearer image.' : 'This image could not be opened. Try a PNG or JPG.'); }
  finally { URL.revokeObjectURL(url); }
}
imageInput.onchange = () => { if (imageInput.files[0]) readImage(imageInput.files[0], imageTarget); imageInput.value = ''; };
document.addEventListener('paste', event => {
  if (dialog.open) return;
  const file = [...(event.clipboardData?.items || [])].find(item => item.type.startsWith('image/'))?.getAsFile();
  if (file) {
    event.preventDefault();
    readImage(file, selected === 'barcode' ? 'barcode' : 'logo');
  } else if (selected === 'barcode' && event.target.closest('#barcode')) {
    event.preventDefault();
    const message = event.clipboardData.getData('text/plain');
    const input = editor.querySelector('#barcode-value');
    if (input) input.value = message;
    setBarcodeMessage(message);
  }
});
document.querySelectorAll('[data-field]').forEach(container => {
  const key = container.dataset.field;
  for (const property of ['value', 'label']) {
    const element = container.querySelector(`.${property}`);
    if (!element) continue;
    element.contentEditable = 'plaintext-only';
    element.setAttribute('role', 'textbox');
    element.setAttribute('aria-label', `${key} ${property === 'value' ? 'text' : 'label'}`);
    element.dataset.placeholder = property === 'value' ? defaults[key].placeholder : 'Label';
    element.onfocus = () => { if (selected !== key) selectElement(key); };
    element.oninput = () => { state.fields[key][property] = element.textContent; };
    element.onblur = () => renderCard();
    element.onkeydown = event => {
      if (event.key === 'Enter') { event.preventDefault(); element.blur(); }
    };
  }
  container.onclick = event => {
    if (event.target === container) container.querySelector('.value').focus();
  };
});
for (const key of ['logo', 'barcode']) {
  const button = document.getElementById(key);
  button.onfocus = () => { if (selected !== key) selectElement(key); };
  button.onclick = () => { if (selected !== key) selectElement(key); };
}
document.querySelectorAll('[data-color]').forEach(input => {
  input.oninput = () => { state[input.dataset.color] = input.value; renderCard(); };
});
document.querySelector('#reset').onclick = () => {
  if (!confirm('Clear this pass and start again?')) return;
  barcodeRevision++; barcodePreference = 'auto'; state = freshState(); selectElement(null);
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
  return images;
}
const signingEndpoint = import.meta.env.VITE_SIGNING_URL || (import.meta.env.DEV ? '/api/passes' : '');
document.querySelector('#download').onclick = async () => {
  const button = document.querySelector('#download');
  button.disabled = true;
  button.textContent = 'Creating pass…';
  try {
    const payload = makeSigningRequest(state, await signingImages());
    const result = await requestSignedPass(signingEndpoint, payload);
    document.querySelector('#pass-link').href = result.download_url;
    document.querySelector('#pass-qr').src = await QRCode.toDataURL(result.download_url, { width: 180, margin: 2 });
    dialog.showModal();
  } catch (error) { showMessage(error.message); }
  finally {
    button.disabled = false;
    button.innerHTML = 'Download pass <span>↓</span>';
  }
};
selectElement(null);
