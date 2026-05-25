import { createServer } from 'node:http';
import type { ServerResponse } from 'node:http';
import { readFileSync, watchFile } from 'node:fs';
import { resolve, dirname, extname, basename } from 'node:path';
import { exec } from 'node:child_process';
import type { AddressInfo } from 'node:net';
import { marked } from 'marked';
import hljs from 'highlight.js';
import styles from './style.css?raw';

marked.use({
  gfm: true,
  breaks: false,
  renderer: {
    code(code: string, lang: string | undefined): string {
      if (lang && hljs.getLanguage(lang)) {
        return `<pre><code class="hljs language-${lang}">${hljs.highlight(code, { language: lang }).value}</code></pre>`;
      }
      return `<pre><code class="hljs">${hljs.highlightAuto(code).value}</code></pre>`;
    },
  },
});

const MIME: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
};

function buildPage(md: string, title: string): string {
  const body = marked.parse(md) as string;
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
  <style>
    ${styles}
    /* override app-specific layout for standalone page */
    html, body { height: auto; overflow: auto; }
  </style>
  <script>
    document.documentElement.dataset.theme =
      window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', e => {
      document.documentElement.dataset.theme = e.matches ? 'dark' : 'light';
    });
  </script>
  <script>new EventSource('/__sse').onmessage = () => location.reload();</script>
</head>
<body>
  <div style="max-width: 860px; margin: 0 auto; padding: 32px 28px;">
    <div class="prose">${body}</div>
  </div>
</body>
</html>`;
}

function openBrowser(url: string): void {
  const cmd = process.platform === 'darwin' ? `open "${url}"`
    : process.platform === 'win32' ? `start "${url}"`
    : `xdg-open "${url}"`;
  exec(cmd);
}

const filePath = resolve(process.argv[2] ?? '');

if (!process.argv[2]) {
  console.error('Usage: md-preview <file.md>');
  process.exit(1);
}

const fileDir = dirname(filePath);
const title = basename(filePath);
const sseClients = new Set<ServerResponse>();
let shutdownTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleShutdown(): void {
  if (shutdownTimer) return;
  shutdownTimer = setTimeout(() => {
    console.log('\nBrowser closed - stopping server');
    process.exit(0);
  }, 5000);
}

function cancelShutdown(): void {
  if (!shutdownTimer) return;
  clearTimeout(shutdownTimer);
  shutdownTimer = null;
}

let md: string;
try {
  md = readFileSync(filePath, 'utf-8');
} catch {
  console.error(`Cannot read: ${filePath}`);
  process.exit(1);
}

const server = createServer((req, res) => {
  const url = req.url ?? '/';

  // SSE endpoint for live reload
  if (url === '/__sse') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    });
    res.write(': connected\n\n'); // SSE comment - keeps connection alive without triggering onmessage
    cancelShutdown();
    sseClients.add(res);
    req.on('close', () => {
      sseClients.delete(res);
      if (sseClients.size === 0) scheduleShutdown();
    });
    return;
  }

  // serve the rendered page
  if (url === '/' || url === '/index.html') {
    const page = buildPage(md, title);
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(page);
    return;
  }

  // serve local files (images, etc.) from the markdown file's directory
  const localPath = resolve(fileDir, '.' + url);
  const mime = MIME[extname(localPath).toLowerCase()];
  if (mime) {
    try {
      const data = readFileSync(localPath);
      res.writeHead(200, { 'Content-Type': mime });
      res.end(data);
      return;
    } catch {
      // file not found - fall through to 404
    }
  }

  res.writeHead(404);
  res.end();
});

// watchFile uses stat polling - survives atomic saves (write+rename) that fs.watch() misses
watchFile(filePath, { interval: 300 }, () => {
  try {
    md = readFileSync(filePath, 'utf-8');
    for (const client of sseClients) {
      client.write('data: reload\n\n');
    }
  } catch {
    // ignore transient read errors mid-save
  }
});

server.listen(0, '127.0.0.1', () => {
  const { port } = server.address() as AddressInfo;
  const url = `http://localhost:${port}`;
  console.log(`Preview: ${url}`);
  console.log(`File:    ${filePath}`);
  openBrowser(url);
});
