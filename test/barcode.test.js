import { test } from 'node:test';
import assert from 'node:assert/strict';
import { barcodeFormat, barcodeCaption } from '../src/barcode.js';

test('only 1–19 ASCII digits default to Code 128; manual selection overrides it', () => {
  for (const message of ['0', '00123456789', '9'.repeat(19)]) {
    assert.equal(barcodeFormat(message), 'PKBarcodeFormatCode128');
    assert.equal(barcodeFormat(message, 'qr'), 'PKBarcodeFormatQR');
  }
  for (const message of ['', '9'.repeat(20), 'MEMBER-123', 'Hello world', '123 ', '１２３', 'こんにちは', 'line\nbreak', 'x'.repeat(41)]) {
    assert.equal(barcodeFormat(message), 'PKBarcodeFormatQR');
  }
});
test('manual Barcode selection supports printable text', () => {
  assert.equal(barcodeFormat('MEMBER-123', 'barcode'), 'PKBarcodeFormatCode128');
});
test('captions show barcodes and short QRs, but omit long QR content', () => {
  assert.equal(barcodeCaption({format:'PKBarcodeFormatCode128',message:'00123'}), '00123');
  assert.equal(barcodeCaption({format:'PKBarcodeFormatQR',message:'Hello'}), 'Hello');
  assert.equal(barcodeCaption({format:'PKBarcodeFormatQR',message:'x'.repeat(41)}), '');
  assert.equal(barcodeCaption(null), '');
});
