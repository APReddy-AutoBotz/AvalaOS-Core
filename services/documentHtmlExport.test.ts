import assert from 'node:assert/strict';
import { buildDocumentExportHtml, markSanitizedDocumentBodyHtml } from './documentHtmlExport';

const attacks = [
  '<script>globalThis.pwned=true</script>',
  '<img src=x onerror=globalThis.pwned=true>',
  '<svg onload=globalThis.pwned=true><foreignObject>x</foreignObject></svg>',
  '<iframe srcdoc="<script>globalThis.pwned=true</script>"></iframe>',
  '<style>body{display:none}</style>',
  'Unicode 😀 Привет مرحبا',
];
for (const attack of attacks) {
  const html = buildDocumentExportHtml({
    documentTitle: attack,
    templateTitle: attack,
    sanitizedBodyHtml: markSanitizedDocumentBodyHtml('<p>Previously sanitized body</p>'),
  });
  assert.ok(html.startsWith('<!DOCTYPE html>'));
  assert.ok(html.endsWith('</html>'));
  assert.doesNotMatch(html, /<img src=x|<svg onload|<iframe srcdoc|<style>body|<script>globalThis\.pwned/);
  assert.match(html, /Previously sanitized body/);
}
console.log('Document export HTML regression suite passed.');
