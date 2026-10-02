export const ASSESS_PENDING_DOCUMENT_LIMITS = Object.freeze({ files: 20, bytes: 12_000_000 });

/** Browser memory bound only; the server still independently validates sources. */
export function assessDocumentQueueError(current: readonly { size: number }[], selected: readonly { size: number }[]): string | null {
  if (current.length + selected.length > ASSESS_PENDING_DOCUMENT_LIMITS.files) {
    return 'Select at most 20 pending documents. Store or remove queued files before adding more; no files from this selection were read.';
  }
  let bytes = 0;
  for (const file of [...current, ...selected]) {
    if (!Number.isSafeInteger(file.size) || file.size <= 0) return 'A selected file is empty or has an invalid size. No files from this selection were read.';
    bytes += file.size;
    if (bytes > ASSESS_PENDING_DOCUMENT_LIMITS.bytes) {
      return 'Pending documents are limited to 12,000,000 bytes in total. Store or remove queued files before adding more; no files from this selection were read.';
    }
  }
  return null;
}
