// Keep linear codes short enough to scan at pass size.
export const canUseBarcode = message => /^[\x20-\x7e]{1,40}$/.test(message);

export function barcodeFormat(message, preference = 'auto') {
  const useBarcode = preference === 'auto' ? /^[0-9]{1,19}$/.test(message) : preference === 'barcode' && canUseBarcode(message);
  return useBarcode ? 'PKBarcodeFormatCode128' : 'PKBarcodeFormatQR';
}

export function barcodeCaption(barcode) {
  if (!barcode) return '';
  return barcode.format === 'PKBarcodeFormatCode128' || [...barcode.message].length <= 40
    ? barcode.message : '';
}
