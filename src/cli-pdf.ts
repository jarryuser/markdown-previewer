// CLI PDF export: prints the served preview page with headless Chromium.
// The CLI already renders markdown into a styled .prose page (buildFilePage);
// this module loads that URL in a headless browser via puppeteer-core and
// writes a vector-text PDF with page.pdf(). The system Chrome/Chromium/Edge is
// used, so no bundled browser and no postinstall downloads.
//
// PDFs are written atomically (temp file + rename) so watchers like `tdf`
// never observe a half-written file.

import { existsSync } from 'node:fs';
import { rename, writeFile } from 'node:fs/promises';

export interface PdfResult {
  ok: boolean;
  error?: string;
}

// typical install locations per platform; MDP_CHROME_PATH overrides everything
const CANDIDATES: Record<string, string[]> = {
  darwin: [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  ],
  win32: [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  ],
  linux: [
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/microsoft-edge',
  ],
};

function findChromePath(): string | null {
  const env = process.env['MDP_CHROME_PATH'];
  if (env && existsSync(env)) return env;
  for (const p of CANDIDATES[process.platform] ?? []) {
    if (p && existsSync(p)) return p;
  }
  return null;
}

// reuses a single headless browser across many exports (watch mode)
export interface PdfExporter {
  exportPage(url: string, outPath: string): Promise<PdfResult>;
  close(): Promise<void>;
}

export async function createPdfExporter(): Promise<PdfResult | PdfExporter> {
  const executablePath = findChromePath();
  if (!executablePath) {
    return {
      ok: false,
      error: 'No Chrome/Chromium/Edge found. Install one or set MDP_CHROME_PATH to its executable.',
    };
  }

  const puppeteer = await import('puppeteer-core');
  let browser: Awaited<ReturnType<typeof puppeteer.launch>>;
  try {
    browser = await puppeteer.launch({
      executablePath,
      headless: true,
      args: ['--no-sandbox', '--disable-gpu'],
    });
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }

  let closed = false;
  const exporter: PdfExporter = {
    async exportPage(url: string, outPath: string): Promise<PdfResult> {
      if (closed) {
        return { ok: false, error: 'PDF exporter is closed.' };
      }
      let page: Awaited<ReturnType<typeof browser.newPage>> | undefined;
      try {
        page = await browser.newPage();
        await page.goto(url, { waitUntil: 'load', timeout: 30000 });
        // the page sets __mdpReady when fonts/mermaid have had a chance to settle;
        // if the flag never fires, still print what we have
        await page
          .waitForFunction(() => (window as { __mdpReady?: boolean }).__mdpReady === true, { timeout: 15000 })
          .catch(() => { /* keep going */ });
        const buf = await page.pdf({
          format: 'A4',
          printBackground: true,
          preferCSSPageSize: false,
          margin: { top: '14mm', right: '14mm', bottom: '14mm', left: '14mm' },
        });
        await page.close();
        page = undefined;
        // atomic write: temp file in the same directory, then rename over the target
        const tmpPath = `${outPath}.${process.pid}.tmp`;
        await writeFile(tmpPath, buf);
        await rename(tmpPath, outPath);
        return { ok: true };
      } catch (err) {
        try { await page?.close(); } catch { /* ignore */ }
        return { ok: false, error: err instanceof Error ? err.message : String(err) };
      }
    },
    async close(): Promise<void> {
      if (closed) return;
      closed = true;
      try { await browser.close(); } catch { /* ignore */ }
    },
  };
  return exporter;
}

export async function convertUrlToPdf(url: string, outPath: string): Promise<PdfResult> {
  const exporter = await createPdfExporter();
  if (!('close' in exporter)) return exporter;
  try {
    const result = await exporter.exportPage(url, outPath);
    return result;
  } finally {
    await exporter.close();
  }
}