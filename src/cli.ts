import { createServer } from 'node:http';
import type { ServerResponse, IncomingMessage } from 'node:http';
import { readFileSync, watchFile, watch, statSync, readdirSync } from 'node:fs';
import { resolve, dirname, extname, basename, relative, join } from 'node:path';
import { exec } from 'node:child_process';
import type { AddressInfo } from 'node:net';
import { marked } from 'marked';
import markedKatex from 'marked-katex-extension';
import hljs from 'highlight.js';
import styles from './style.css?raw';

marked.use(markedKatex({ throwOnError: false }));
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

function openBrowser(url: string): void {
  const cmd = process.platform === 'darwin' ? `open "${url}"`
    : process.platform === 'win32' ? `start "${url}"`
    : `xdg-open "${url}"`;
  exec(cmd);
}

function escHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// strips YAML/TOML frontmatter (---...--- or +++...+++) from Obsidian/Hugo files
function stripFrontmatter(content: string): string {
  const fence = content.startsWith('---') ? '---' : content.startsWith('+++') ? '+++' : null;
  if (!fence) return content;
  const end = content.indexOf('\n' + fence, fence.length);
  if (end === -1) return content;
  return content.slice(end + fence.length + 1).trimStart();
}

// serves a static file from disk - reads BEFORE setting headers to avoid double-writeHead on error
function serveFile(res: ServerResponse, filePath: string, mime: string): boolean {
  try {
    const data = readFileSync(filePath);
    res.writeHead(200, { 'Content-Type': mime });
    res.end(data);
    return true;
  } catch {
    return false;
  }
}

// file tree used by directory mode
interface FileNode {
  name: string;
  path?: string;       // relative path for .md files
  children?: FileNode[]; // set for directories
}

function buildTree(dir: string, base: string): FileNode[] {
  let entries: { name: string; isDir: boolean }[] = [];
  try {
    entries = readdirSync(dir, { withFileTypes: true })
      .filter(e => !e.name.startsWith('.'))
      .map(e => ({ name: e.name, isDir: e.isDirectory() }));
  } catch {
    return [];
  }

  const subdirs = entries
    .filter(e => e.isDir)
    .sort((a, b) => a.name.localeCompare(b.name));
  const files = entries
    .filter(e => !e.isDir && e.name.endsWith('.md'))
    .sort((a, b) => a.name.localeCompare(b.name));

  const nodes: FileNode[] = [];

  for (const d of subdirs) {
    const children = buildTree(join(dir, d.name), base);
    if (children.length > 0) nodes.push({ name: d.name, children });
  }

  for (const f of files) {
    const relPath = relative(base, join(dir, f.name)).replace(/\\/g, '/');
    nodes.push({ name: f.name, path: relPath });
  }

  return nodes;
}

// shared <head> snippets
const HLJS_CSS = `<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github.min.css" />`;
const KATEX_CSS = `<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css" />`;
const THEME_SCRIPT = `<script>(function(){
  var d=window.matchMedia('(prefers-color-scheme: dark)').matches;
  document.documentElement.dataset.theme=d?'dark':'light';
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change',function(e){
    document.documentElement.dataset.theme=e.matches?'dark':'light';
  });
})();</script>`;

function buildFilePage(md: string, title: string): string {
  const body = marked.parse(stripFrontmatter(md)) as string;
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escHtml(title)}</title>
  ${HLJS_CSS}
  ${KATEX_CSS}
  <style>
    ${styles}
    html, body { height: auto; overflow: auto; }
  </style>
  ${THEME_SCRIPT}
  <script>new EventSource('/__sse').onmessage = function() { location.reload(); };</script>
</head>
<body>
  <div style="max-width: 860px; margin: 0 auto; padding: 32px 28px;">
    <div class="prose">${body}</div>
  </div>
</body>
</html>`;
}

function buildDirPage(dirName: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escHtml(dirName)}</title>
  ${HLJS_CSS}
  ${KATEX_CSS}
  <style>
    ${styles}
    html, body { height: 100%; overflow: hidden; }
    #app { display: grid; grid-template-columns: 260px 1fr; height: 100%; }
    #sidebar {
      overflow-y: auto;
      border-right: 1px solid var(--border);
      background: var(--bg-toolbar);
    }
    .sidebar-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 6px;
      padding: 10px 8px 10px 12px;
      border-bottom: 1px solid var(--border);
    }
    .sidebar-title {
      font-size: 11px;
      font-weight: 600;
      letter-spacing: .08em;
      text-transform: uppercase;
      color: var(--text-muted);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      min-width: 0;
    }
    .collapse-btn {
      flex-shrink: 0;
      font-size: 11px;
      padding: 2px 7px;
    }
    #tree { padding: 4px 0 16px; }
    #content { overflow-y: auto; padding: 32px 28px; }
    .empty-hint { color: var(--text-muted); font-size: 14px; }
    details > summary { list-style: none; }
    details > summary::-webkit-details-marker { display: none; }
    .dir-label {
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 4px;
      font-size: 12px;
      font-weight: 600;
      color: var(--text-muted);
      padding: 5px 8px 2px;
      user-select: none;
    }
    .dir-label::before { content: '\\25B8'; font-size: 10px; flex-shrink: 0; }
    details[open] > summary.dir-label::before { content: '\\25BE'; }
    .file-item {
      cursor: pointer;
      font-size: 13px;
      padding: 3px 8px;
      margin: 1px 4px;
      border-radius: 4px;
      color: var(--text);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .file-item:hover { background: var(--btn-hover); }
    .file-item.active { background: var(--accent); color: #fff; }
    .tree-focused { outline: 2px solid var(--accent); outline-offset: -2px; border-radius: 4px; }
  </style>
  ${THEME_SCRIPT}
</head>
<body>
  <div id="app">
    <aside id="sidebar">
      <div class="sidebar-header">
        <span class="sidebar-title">${escHtml(dirName)}</span>
        <button class="collapse-btn" id="collapse-btn" title="Collapse all">−</button>
      </div>
      <div id="tree"></div>
    </aside>
    <main id="content">
      <div class="prose" id="prose">
        <p class="empty-hint">Select a file from the sidebar</p>
      </div>
    </main>
  </div>
  <script>
    var prose = document.getElementById('prose');
    var currentPath = location.hash.slice(1) || null;

    function esc(s) {
      return String(s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function renderTree(nodes, depth) {
      return nodes.map(function(node) {
        var indent = (depth * 14 + 8) + 'px';
        if (node.children != null) {
          return '<details open>'
            + '<summary class="dir-label" style="padding-left:' + indent + '">' + esc(node.name) + '</summary>'
            + '<div>' + renderTree(node.children, depth + 1) + '</div>'
            + '</details>';
        }
        var label = node.name.replace(/\\.md$/, '');
        return '<div class="file-item" data-path="' + esc(node.path) + '" style="padding-left:' + indent + '">'
          + esc(label) + '</div>';
      }).join('');
    }

    function setActive(path) {
      document.querySelectorAll('.file-item').forEach(function(el) {
        el.classList.toggle('active', el.dataset.path === path);
      });
    }

    function loadFile(path) {
      currentPath = path;
      location.hash = path;
      setActive(path);
      fetch('/__file?p=' + encodeURIComponent(path))
        .then(function(r) {
          if (!r.ok) throw new Error('HTTP ' + r.status);
          return r.json();
        })
        .then(function(d) { prose.innerHTML = d.html; document.title = d.title; })
        .catch(function(err) {
          prose.innerHTML = '<p class="empty-hint">Could not load: ' + esc(path) + '</p>';
          console.error(err);
        });
    }

    function findFirst(nodes) {
      for (var i = 0; i < nodes.length; i++) {
        if (nodes[i].path) return nodes[i].path;
        if (nodes[i].children) { var f = findFirst(nodes[i].children); if (f) return f; }
      }
      return null;
    }

    // keyboard navigation: j/k move up/down, l/Enter open, h collapse/go to parent
    var focusedEl = null;

    function visibleItems() {
      return Array.from(document.querySelectorAll('.dir-label, .file-item')).filter(function(el) {
        // dir-label is a <summary> - the browser always renders it even when
        // its own <details> is closed, so skip that immediate parent and only
        // check ancestors above it
        var start = el.classList.contains('dir-label')
          ? (el.parentElement ? el.parentElement.parentElement : null)
          : el.parentElement;
        var node = start;
        while (node && node.id !== 'tree') {
          if (node.tagName === 'DETAILS' && !node.open) return false;
          node = node.parentElement;
        }
        return true;
      });
    }

    function moveFocus(el, autoLoad) {
      if (focusedEl) focusedEl.classList.remove('tree-focused');
      focusedEl = el || null;
      if (focusedEl) {
        focusedEl.classList.add('tree-focused');
        focusedEl.scrollIntoView({ block: 'nearest' });
        if (autoLoad && focusedEl.classList.contains('file-item')) {
          loadFile(focusedEl.dataset.path);
        }
      }
    }

    document.addEventListener('keydown', function(e) {
      var k = e.key;
      if (k !== 'j' && k !== 'k' && k !== 'h' && k !== 'l' && k !== 'Enter'
          && k !== 'ArrowUp' && k !== 'ArrowDown' && k !== 'ArrowLeft' && k !== 'ArrowRight') return;
      var items = visibleItems();
      if (!items.length) return;
      e.preventDefault();
      var idx = focusedEl ? items.indexOf(focusedEl) : -1;

      if (k === 'j' || k === 'ArrowDown') {
        moveFocus(items[idx < 0 ? 0 : Math.min(idx + 1, items.length - 1)], true);
      } else if (k === 'k' || k === 'ArrowUp') {
        moveFocus(items[idx <= 0 ? 0 : idx - 1], true);
      } else if ((k === 'l' || k === 'Enter' || k === 'ArrowRight') && focusedEl) {
        if (focusedEl.classList.contains('file-item')) {
          loadFile(focusedEl.dataset.path);
        } else {
          var det = focusedEl.closest('details');
          if (det) det.open = true;
        }
      } else if ((k === 'h' || k === 'ArrowLeft') && focusedEl) {
        if (focusedEl.classList.contains('dir-label')) {
          var det = focusedEl.closest('details');
          if (det && det.open) { det.open = false; return; }
          var parentDet = det && det.parentElement && det.parentElement.closest('details');
          if (parentDet) moveFocus(parentDet.querySelector(':scope > summary.dir-label'));
        } else {
          var parentDet = focusedEl.closest('details');
          if (parentDet) moveFocus(parentDet.querySelector(':scope > summary.dir-label'));
        }
      }
    });

    var collapseBtn = document.getElementById('collapse-btn');
    var allCollapsed = false;
    collapseBtn.addEventListener('click', function() {
      var details = document.querySelectorAll('#tree details');
      allCollapsed = !allCollapsed;
      details.forEach(function(d) { d.open = !allCollapsed; });
      collapseBtn.textContent = allCollapsed ? '+' : '−';
      collapseBtn.title = allCollapsed ? 'Expand all' : 'Collapse all';
    });

    fetch('/__tree')
      .then(function(r) { return r.json(); })
      .then(function(tree) {
        document.getElementById('tree').innerHTML = renderTree(tree, 0);
        document.querySelectorAll('.file-item').forEach(function(el) {
          el.addEventListener('click', function() { moveFocus(el); loadFile(el.dataset.path); });
        });
        document.querySelectorAll('.dir-label').forEach(function(el) {
          el.addEventListener('click', function() { moveFocus(el); });
        });
        var target = currentPath || findFirst(tree);
        if (target) loadFile(target);
      });

    var es = new EventSource('/__sse');
    es.onmessage = function(e) {
      var msg = JSON.parse(e.data);
      if (msg.type === 'change' && msg.path === currentPath) loadFile(currentPath);
    };
  </script>
</body>
</html>`;
}

// auto-shutdown when all browser tabs close
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

// argument validation
if (!process.argv[2]) {
  console.error('Usage: mdp <file.md>  or  mdp <directory>');
  process.exit(1);
}

const argPath = resolve(process.argv[2]);
let isDir = false;
try {
  isDir = statSync(argPath).isDirectory();
} catch {
  console.error(`Cannot access: ${argPath}`);
  process.exit(1);
}

// file mode setup
let currentMd = '';
const fileDir = dirname(argPath);

if (!isDir) {
  try {
    currentMd = readFileSync(argPath, 'utf-8');
  } catch {
    console.error(`Cannot read: ${argPath}`);
    process.exit(1);
  }
  // watchFile uses stat polling - survives atomic saves that fs.watch() misses
  watchFile(argPath, { interval: 300 }, () => {
    try {
      currentMd = readFileSync(argPath, 'utf-8');
      for (const client of sseClients) client.write('data: reload\n\n');
    } catch { /* ignore transient read errors mid-save */ }
  });
}

// directory mode setup
if (isDir) {
  try {
    watch(argPath, { recursive: true }, (_evt, filename) => {
      if (!filename || !filename.endsWith('.md')) return;
      const changedPath = filename.replace(/\\/g, '/');
      for (const client of sseClients) {
        client.write(`data: ${JSON.stringify({ type: 'change', path: changedPath })}\n\n`);
      }
    });
  } catch {
    console.warn('Warning: directory watching unavailable on this platform');
  }
}

// HTTP server
const server = createServer((req: IncomingMessage, res: ServerResponse) => {
  let url: URL;
  try {
    url = new URL(req.url ?? '/', 'http://localhost');
  } catch {
    res.writeHead(400); res.end(); return;
  }

  const { pathname } = url;

  // SSE endpoint - shared between both modes
  if (pathname === '/__sse') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    });
    res.write(': connected\n\n');
    cancelShutdown();
    sseClients.add(res);
    req.on('close', () => {
      sseClients.delete(res);
      if (sseClients.size === 0) scheduleShutdown();
    });
    return;
  }

  if (isDir) {
    // directory mode routes
    if (pathname === '/' || pathname === '/index.html') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(buildDirPage(basename(argPath)));
      return;
    }

    if (pathname === '/__tree') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(buildTree(argPath, argPath)));
      return;
    }

    if (pathname === '/__file') {
      const p = url.searchParams.get('p') ?? '';
      if (!p) { res.writeHead(400); res.end(); return; }
      const filePath = resolve(argPath, p);
      // path traversal guard: file must stay inside the served directory
      if (!filePath.startsWith(argPath + '/') || !filePath.endsWith('.md')) {
        res.writeHead(403); res.end(); return;
      }
      try {
        const content = readFileSync(filePath, 'utf-8');
        const html = marked.parse(stripFrontmatter(content)) as string;
        const title = basename(p).replace(/\.md$/, '');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ html, title }));
      } catch {
        res.writeHead(404); res.end();
      }
      return;
    }

    // serve images and other static files from within the directory
    const localPath = resolve(argPath, '.' + pathname);
    if (localPath.startsWith(argPath)) {
      const mime = MIME[extname(localPath).toLowerCase()];
      if (mime && serveFile(res, localPath, mime)) return;
    }

    res.writeHead(404); res.end();
    return;
  }

  // file mode routes
  if (pathname === '/' || pathname === '/index.html') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(buildFilePage(currentMd, basename(argPath)));
    return;
  }

  // serve local files (images etc.) from the markdown file's directory
  const localPath = resolve(fileDir, '.' + pathname);
  const mime = MIME[extname(localPath).toLowerCase()];
  if (mime && serveFile(res, localPath, mime)) return;

  res.writeHead(404); res.end();
});

server.listen(0, '127.0.0.1', () => {
  const { port } = server.address() as AddressInfo;
  const previewUrl = `http://localhost:${port}`;
  if (isDir) {
    console.log(`Directory: ${argPath}`);
  } else {
    console.log(`File:    ${argPath}`);
  }
  console.log(`Preview:   ${previewUrl}`);
  openBrowser(previewUrl);
});
