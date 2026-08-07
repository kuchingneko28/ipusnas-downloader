import { describe, expect, it, mock } from 'bun:test';
import AdmZip from 'adm-zip';
import os from 'node:os';
import path from 'node:path';

/**
 * Hermetic command test: the download command must never swallow an error.
 * Failures inside downloadCommand propagate to the runCommand envelope, which
 * is the single place errors are logged and turned into a 'Failed.' exit. If a
 * future change reintroduces a log-and-return catch here, the command would
 * print a misleading 'Done.' — this test fails when that happens.
 */

// Isolate the output dir so the test never writes into the real ./downloads.
process.env.IPUSNAS_OUTPUT_DIR = path.join(os.tmpdir(), `ipusnas-test-${process.pid}`);

mock.module('../core/config', () => ({
  getSession: () => null,
  saveSession: () => {},
}));

mock.module('../cli/ui', () => ({
  logger: { info: () => {}, success: () => {}, warn: () => {}, error: () => {}, debug: () => {} },
  intro: () => {},
  outro: () => {},
  spinner: () => ({ start: () => {}, stop: () => {}, message: () => {} }),
  withSpinner: async <T,>(_label: string, task: () => Promise<T>): Promise<T> => task(),
  promptText: async () => '',
  promptPassword: async () => '',
  promptSelect: async () => null,
}));

mock.module('../api/auth', () => ({
  attestDevice: async () => 'device-token',
  loginUser: async () => ({}),
}));

// getSecureBorrowKey is swappable per test so we can cover both the DRM-key
// failure path and a successful key that proceeds to archive decryption.
let secureKeyHandler: () => Promise<{ url_file: string; password: string }> = async () => {
  throw new Error('No device PoP key registered — run `ipusnas register` first.');
};

mock.module('../api/client', () => ({
  listShelf: async () => [{ id: 'b1', book_id: 'b1', epustaka_id: 'e1', book_title: 'Test' }],
  getSecureBorrowKey: async () => secureKeyHandler(),
}));

mock.module('../utils/qpdf', () => ({
  decryptPdf: async () => {
    throw new Error('PDF decryption failed');
  },
}));

const { downloadCommand } = await import('../cli/commands/download');

function pdfZipResponse(): Response {
  const zip = new AdmZip();
  zip.addFile('ebook.moco', Buffer.from('moco'));
  const bytes = zip.toBuffer();
  return new Response(bytes, {
    status: 200,
    headers: { 'content-length': String(bytes.length) },
  });
}

describe('download command', () => {
  it('propagates DRM key failures instead of swallowing them', async () => {
    await expect(downloadCommand('b1')).rejects.toThrow(/No device PoP key registered/);
  });

  it('propagates qpdf decryption failures instead of printing Done', async () => {
    secureKeyHandler = async () => ({ url_file: 'https://cdn/book.mdrm', password: 'pw' });
    const fetchMock = mock(async (_url: string | URL | Request) => pdfZipResponse());
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    try {
      await expect(downloadCommand('b1')).rejects.toThrow(/PDF decryption failed/);
    } finally {
      delete (globalThis as { fetch?: typeof fetch }).fetch;
    }
    expect(fetchMock).toHaveBeenCalled();
  });
});