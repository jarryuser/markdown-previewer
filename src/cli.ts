import { createServer } from 'node:http';
import type { ServerResponse, IncomingMessage } from 'node:http';
import { readFileSync, writeFileSync, watchFile, watch, statSync, readdirSync } from 'node:fs';
import { resolve, dirname, extname, basename, relative, join } from 'node:path';
import { homedir } from 'node:os';
import { exec } from 'node:child_process';
import type { AddressInfo } from 'node:net';
import { marked, Marked } from 'marked';
import blessed from 'blessed';
import markedKatex from 'marked-katex-extension';
import hljs from 'highlight.js';
import styles from './style.css?raw';

marked.use(markedKatex({ throwOnError: false }));
marked.use({
  gfm: true,
  breaks: false,
  renderer: {
    code(code: string, lang: string | undefined): string {
      if (lang === 'mermaid') {
        const safe = code.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        return `<div class="mermaid">${safe}</div>`;
      }
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

// ── ANSI terminal renderer ────────────────────────────────────────────────────

const C = {
  r:  '\x1b[0m',  // reset
  b:  '\x1b[1m',  // bold
  d:  '\x1b[2m',  // dim
  it: '\x1b[3m',  // italic
  u:  '\x1b[4m',  // underline
} as const;

// leaf ocean dark theme (RGB values from presets.rs)
const L = {
  h1:        [140, 190, 255] as const,
  h2:        [120, 210, 170] as const,
  h3:        [210, 180, 120] as const,
  h4:        [162, 192, 222] as const,
  h56:       [180, 180, 190] as const,
  hLine:     [ 40,  50,  75] as const,
  bold:      [245, 245, 255] as const,
  codeFg:    [220, 150, 118] as const,
  codeBg:    [ 38,  32,  31] as const,
  codeFrame: [ 40,  48,  68] as const,
  codeLabel: [ 95, 110, 145] as const,
  bqText:    [148, 148, 195] as const,
  bqBar:     [ 75,  80, 148] as const,
  list1:     [ 95, 200, 148] as const,
  list2:     [138, 155, 200] as const,
  list3:     [168, 168, 185] as const,
  link:      [ 88, 152, 238] as const,
  rule:      [ 48,  56,  76] as const,
} as const;

type Rgb = readonly [number, number, number];

// ANSI 24-bit true-color
function ac([r, g, b]: Rgb): string   { return `\x1b[38;2;${r};${g};${b}m`; }
function acBg([r, g, b]: Rgb): string { return `\x1b[48;2;${r};${g};${b}m`; }

// blessed hex tag helpers
function toHex([r, g, b]: Rgb): string {
  return (r * 65536 + g * 256 + b).toString(16).padStart(6, '0');
}
function bc(rgb: Rgb): string   { return `{#${toHex(rgb)}-fg}`; }
function bcBg(rgb: Rgb): string { return `{#${toHex(rgb)}-bg}`; }

// ── ANSI renderer - leaf ocean dark theme, 24-bit true color ─────────────────

const H_COLORS_ANSI: Rgb[] = [L.h1, L.h2, L.h3, L.h4, L.h56, L.h56];

const ansiMarked = new Marked({ gfm: true });
ansiMarked.use({
  renderer: {
    heading(text: string, depth: number): string {
      const col  = H_COLORS_ANSI[Math.min(depth - 1, H_COLORS_ANSI.length - 1)];
      const line = ac(L.hLine) + '─'.repeat(Math.min((process.stdout.columns || 80) - 2, 60)) + C.r;
      const head = `${C.b}${ac(col)}${text}${C.r}`;
      return depth <= 2 ? `\n${head}\n${line}\n\n` : `\n${head}\n\n`;
    },
    paragraph(text: string): string { return text + '\n\n'; },
    strong(text: string): string    { return `${C.b}${ac(L.bold)}${text}${C.r}`; },
    em(text: string): string        { return `${C.it}${text}${C.r}`; },
    del(text: string): string       { return `${C.d}${text}${C.r}`; },
    codespan(code: string): string  { return `${acBg(L.codeBg)}${ac(L.codeFg)} ${code} ${C.r}`; },
    code(code: string, lang: string | undefined): string {
      const w     = Math.min((process.stdout.columns || 80) - 2, 72);
      const frame = ac(L.codeFrame);
      const top   = lang
        ? `${frame}${'─'.repeat(2)}${C.r} ${ac(L.codeLabel)}${lang}${C.r} ${frame}${'─'.repeat(Math.max(0, w - lang.length - 4))}${C.r}`
        : `${frame}${'─'.repeat(w)}${C.r}`;
      const bot   = `${frame}${'─'.repeat(w)}${C.r}`;
      const lines = code.split('\n').map(l => `${frame}│${C.r} ${ac(L.codeFg)}${l}${C.r}`).join('\n');
      return `\n${top}\n${lines}\n${bot}\n\n`;
    },
    blockquote(quote: string): string {
      return quote.split('\n').filter(Boolean)
        .map(l => `${ac(L.bqBar)}▌${C.r} ${ac(L.bqText)}${l}${C.r}`)
        .join('\n') + '\n\n';
    },
    list(body: string, _ordered: boolean): string { return '\n' + body + '\n'; },
    listitem(text: string): string {
      return `  ${ac(L.list1)}•${C.r} ${text.trimEnd()}\n`;
    },
    link(href: string, _title: string | null | undefined, text: string): string {
      const label = text || href;
      const url   = text && text !== href ? ` ${ac(L.hLine)}↗ ${href}${C.r}` : '';
      return `${C.u}${ac(L.link)}${label}${C.r}${url}`;
    },
    image(_href: string, _title: string | null | undefined, text: string): string {
      return `${ac(L.hLine)}[img: ${text || '…'}]${C.r}`;
    },
    hr(): string {
      const w = process.stdout.columns || 80;
      return `\n${ac(L.rule)}${'─'.repeat(w)}${C.r}\n\n`;
    },
    br(): string { return '\n'; },
    table(header: string, body: string): string {
      return `\n${header}${ac(L.rule)}${'─'.repeat(40)}${C.r}\n${body}\n`;
    },
    tablerow(content: string): string { return content.trimEnd() + '\n'; },
    tablecell(content: string, flags: { header?: boolean }): string {
      return (flags.header ? `${C.b}${ac(L.h1)}${content}${C.r}` : content) + '  ';
    },
    html(_text: string): string { return ''; },
  },
});

// ── Blessed renderer - leaf ocean dark theme, hex color tags ──────────────────
// Code content has no color tags - avoids { } in code being parsed as blessed tags

const H_COLORS_BL: Rgb[] = [L.h1, L.h2, L.h3, L.h4, L.h56, L.h56];

const blessedMarked = new Marked({ gfm: true });
blessedMarked.use({
  renderer: {
    heading(text: string, depth: number): string {
      const col   = H_COLORS_BL[Math.min(depth - 1, H_COLORS_BL.length - 1)];
      const head  = `{bold}${bc(col)}${text}{/bold}{/}`;
      const line  = depth <= 2 ? `\n${bc(L.hLine)}${'─'.repeat(60)}{/}` : '';
      return `\n${head}${line}\n\n`;
    },
    paragraph(text: string): string { return text + '\n\n'; },
    strong(text: string): string    { return `{bold}${bc(L.bold)}${text}{/bold}{/}`; },
    em(text: string): string        { return `{underline}${text}{/underline}`; },
    del(text: string): string       { return `{gray-fg}${text}{/gray-fg}`; },
    codespan(code: string): string  { return `${bcBg(L.codeBg)}${bc(L.codeFg)} ${code} {/}{/}`; },
    code(code: string, lang: string | undefined): string {
      const top   = lang
        ? `${bc(L.codeFrame)}──{/} ${bc(L.codeLabel)}${lang}{/} ${bc(L.codeFrame)}${'─'.repeat(Math.max(0, 50 - lang.length - 4))}{/}`
        : `${bc(L.codeFrame)}${'─'.repeat(50)}{/}`;
      const bot   = `${bc(L.codeFrame)}${'─'.repeat(50)}{/}`;
      const lines = code.split('\n').map(l => `${bc(L.codeFrame)}│{/} ${l}`).join('\n');
      return `\n${top}\n${lines}\n${bot}\n\n`;
    },
    blockquote(quote: string): string {
      return quote.split('\n').filter(Boolean)
        .map(l => `${bc(L.bqBar)}▌{/} ${bc(L.bqText)}${l}{/}`)
        .join('\n') + '\n\n';
    },
    list(body: string, _ordered: boolean): string { return body + '\n'; },
    listitem(text: string): string {
      return `  ${bc(L.list1)}•{/} ${text.trimEnd()}\n`;
    },
    link(href: string, _title: string | null | undefined, text: string): string {
      const label = text || href;
      const url   = text && text !== href ? ` ${bc(L.hLine)}↗ ${href}{/}` : '';
      return `{underline}${bc(L.link)}${label}{/underline}{/}${url}`;
    },
    image(_href: string, _title: string | null | undefined, text: string): string {
      return `${bc(L.hLine)}[img: ${text || '…'}]{/}`;
    },
    hr(): string {
      return `\n${bc(L.rule)}${'─'.repeat(60)}{/}\n\n`;
    },
    br(): string { return '\n'; },
    table(header: string, body: string): string {
      return `\n${header}${bc(L.rule)}${'─'.repeat(40)}{/}\n${body}\n`;
    },
    tablerow(content: string): string { return content.trimEnd() + '\n'; },
    tablecell(content: string, flags: { header?: boolean }): string {
      return (flags.header ? `{bold}${bc(L.h1)}${content}{/bold}{/}` : content) + '  ';
    },
    html(_text: string): string { return ''; },
  },
});

function renderAnsi(md: string): string {
  return ansiMarked.parse(stripFrontmatter(md)) as string;
}

function renderBlessed(md: string): string {
  return blessedMarked.parse(stripFrontmatter(md)) as string;
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

// converts [[target]] / [[target|alias]] wikilinks to regular markdown links
function resolveWikilinks(md: string): string {
  return md.replace(/\[\[([^\]|#\n]+?)(?:\|([^\]\n]+?))?\]\]/g, (_, target, alias) => {
    const label = (alias ?? target).trim();
    return `[${label}](/__find?name=${encodeURIComponent(target.trim())})`;
  });
}

// recent files history stored in ~/.mdp-history.json
const HISTORY_FILE = join(homedir(), '.mdp-history.json');
const HISTORY_MAX = 15;

function readHistory(): string[] {
  try {
    return JSON.parse(readFileSync(HISTORY_FILE, 'utf-8')) as string[];
  } catch {
    return [];
  }
}

function writeHistory(path: string): void {
  try {
    const prev = readHistory().filter(p => p !== path);
    writeFileSync(HISTORY_FILE, JSON.stringify([path, ...prev].slice(0, HISTORY_MAX)));
  } catch { /* ignore write errors */ }
}

// file tree used by directory mode
interface FileNode {
  name: string;
  path?: string;
  children?: FileNode[];
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

// searches the tree for a file whose name (without .md) matches the given name
function findInTree(nodes: FileNode[], name: string): string | null {
  const lower = name.toLowerCase();
  for (const node of nodes) {
    if (node.path && node.name.replace(/\.md$/i, '').toLowerCase() === lower) {
      return node.path;
    }
    if (node.children) {
      const found = findInTree(node.children, name);
      if (found) return found;
    }
  }
  return null;
}

// shared <head> snippets
const HLJS_CSS = `<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github.min.css" />`;
const KATEX_CSS = `<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css" />`;
const MERMAID_JS = `<script defer src="https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js"><\/script>
<script>window.addEventListener('load',function(){if(window.mermaid){mermaid.initialize({startOnLoad:false,theme:document.documentElement.dataset.theme==='dark'?'dark':'default'});var d=document.querySelectorAll('.mermaid');if(d.length)mermaid.run({nodes:Array.from(d)});}});<\/script>`;
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
  ${MERMAID_JS}
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
  ${MERMAID_JS}
  <style>
    ${styles}
    html, body { height: 100%; overflow: hidden; }
    #app { display: grid; grid-template-columns: 260px 4px 1fr; height: 100%; }
    #sidebar {
      display: flex;
      flex-direction: column;
      border-right: none;
      background: var(--bg-toolbar);
      overflow: hidden;
    }
    #sidebar-resize {
      background: var(--divider);
      cursor: col-resize;
      user-select: none;
      transition: background .15s;
    }
    #sidebar-resize:hover { background: var(--accent); }
    .sidebar-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 6px;
      padding: 10px 8px 10px 12px;
      border-bottom: 1px solid var(--border);
      flex-shrink: 0;
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
    #search-bar {
      display: none;
      padding: 8px;
      border-bottom: 1px solid var(--border);
      flex-shrink: 0;
    }
    #search-input {
      width: 100%;
      padding: 4px 8px;
      border: 1px solid var(--border);
      border-radius: 4px;
      background: var(--bg);
      color: var(--text);
      font-size: 13px;
      outline: none;
    }
    #search-input:focus { border-color: var(--accent); }
    #tree { padding: 4px 0 16px; overflow-y: auto; flex: 1; }
    #content { display: flex; flex-direction: column; overflow: hidden; }
    #nav-bar {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 6px 12px;
      border-bottom: 1px solid var(--border);
      flex-shrink: 0;
      background: var(--bg-toolbar);
    }
    .nav-btn { padding: 2px 8px; font-size: 12px; }
    #breadcrumb {
      display: flex;
      align-items: center;
      gap: 3px;
      font-size: 12px;
      color: var(--text-muted);
      min-width: 0;
      overflow: hidden;
    }
    .bc-sep { opacity: .5; flex-shrink: 0; }
    .bc-part { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .bc-current { color: var(--text); font-weight: 500; }
    #content-scroll { overflow-y: auto; padding: 32px 28px; flex: 1; min-height: 0; }
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
      <div id="search-bar">
        <input id="search-input" type="text" placeholder="Filter files..." autocomplete="off" spellcheck="false" />
      </div>
      <div id="tree"></div>
    </aside>
    <div id="sidebar-resize"></div>
    <main id="content">
      <div id="nav-bar">
        <button class="nav-btn" id="back-btn" title="Back (Alt+←)" disabled>←</button>
        <button class="nav-btn" id="fwd-btn" title="Forward (Alt+→)" disabled>→</button>
        <div id="breadcrumb"></div>
      </div>
      <div id="content-scroll">
        <div class="prose" id="prose">
          <p class="empty-hint">Select a file from the sidebar</p>
        </div>
      </div>
    </main>
  </div>
  <script>
    var prose = document.getElementById('prose');
    var contentScroll = document.getElementById('content-scroll');
    var currentPath = location.hash.slice(1) || null;
    var searchBar = document.getElementById('search-bar');
    var searchInput = document.getElementById('search-input');
    var searchActive = false;

    // back / forward history
    var navHistory = [];
    var navIdx = -1;
    var backBtn = document.getElementById('back-btn');
    var fwdBtn = document.getElementById('fwd-btn');

    function updateNavBtns() {
      backBtn.disabled = navIdx <= 0;
      fwdBtn.disabled = navIdx >= navHistory.length - 1;
    }

    function pushNav(path) {
      if (navHistory[navIdx] === path) return;
      navHistory = navHistory.slice(0, navIdx + 1);
      navHistory.push(path);
      navIdx = navHistory.length - 1;
      updateNavBtns();
    }

    backBtn.addEventListener('click', function() {
      if (navIdx > 0) { navIdx--; loadFile(navHistory[navIdx], false); updateNavBtns(); }
    });
    fwdBtn.addEventListener('click', function() {
      if (navIdx < navHistory.length - 1) { navIdx++; loadFile(navHistory[navIdx], false); updateNavBtns(); }
    });

    function updateBreadcrumb(path) {
      var parts = path.split('/');
      document.getElementById('breadcrumb').innerHTML = parts.map(function(part, i) {
        var isLast = i === parts.length - 1;
        var label = isLast ? part.replace(/\\.md$/, '') : part;
        return (i > 0 ? '<span class="bc-sep">›</span>' : '')
          + '<span class="bc-part' + (isLast ? ' bc-current' : '') + '">' + esc(label) + '</span>';
      }).join('');
    }

    function esc(s) {
      return String(s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function renderTree(nodes, depth) {
      return nodes.map(function(node) {
        var indent = (depth * 14 + 8) + 'px';
        if (node.children != null) {
          return '<details>'
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

    // intercept clicks on internal links: [[wikilinks]] and relative .md hrefs
    function attachLinkHandlers() {
      // wikilinks rendered as /__find?name=...
      prose.querySelectorAll('a[href^="/__find"]').forEach(function(a) {
        a.addEventListener('click', function(e) {
          e.preventDefault();
          fetch(a.getAttribute('href'))
            .then(function(r) { return r.ok ? r.json() : Promise.reject(r.status); })
            .then(function(d) { moveFocus(null); loadFile(d.path); })
            .catch(function() { /* target file not found - do nothing */ });
        });
      });

      // relative .md links - resolve against current file's directory
      prose.querySelectorAll('a[href]').forEach(function(a) {
        var href = a.getAttribute('href');
        if (!href || href.startsWith('http') || href.startsWith('#') || !href.endsWith('.md')) return;
        a.addEventListener('click', function(e) {
          e.preventDefault();
          var base = new URL('http://x/' + (currentPath || ''));
          var resolved = new URL(href, base).pathname.slice(1);
          if (resolved) { moveFocus(null); loadFile(resolved); }
        });
      });
    }

    function loadFile(path, push) {
      push = push !== false;
      currentPath = path;
      location.hash = path;
      setActive(path);
      if (push) pushNav(path);
      updateBreadcrumb(path);
      contentScroll.scrollTop = 0;
      fetch('/__file?p=' + encodeURIComponent(path))
        .then(function(r) {
          if (!r.ok) throw new Error('HTTP ' + r.status);
          return r.json();
        })
        .then(function(d) {
          prose.innerHTML = d.html;
          document.title = d.title;
          attachLinkHandlers();
        })
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

    var focusedEl = null;

    function visibleItems() {
      // in search mode only show matching file items (dir-labels are hidden)
      if (searchActive) {
        return Array.from(document.querySelectorAll('.file-item')).filter(function(el) {
          return el.style.display !== 'none';
        });
      }
      return Array.from(document.querySelectorAll('.dir-label, .file-item')).filter(function(el) {
        // dir-label is a <summary> - always rendered even when its own <details> is closed;
        // skip the immediate parent and only check ancestors above it
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

    // search: / opens, Escape closes, ArrowUp/Down navigate, Enter opens first match
    function openSearch() {
      searchActive = true;
      searchBar.style.display = '';
      searchInput.focus();
      filterFiles('');
    }

    function closeSearch() {
      searchActive = false;
      searchBar.style.display = 'none';
      searchInput.value = '';
      document.querySelectorAll('.file-item').forEach(function(el) { el.style.display = ''; });
      document.querySelectorAll('#tree details').forEach(function(el) { el.style.display = ''; });
      if (focusedEl) { focusedEl.classList.remove('tree-focused'); focusedEl = null; }
    }

    function filterFiles(q) {
      var lower = q.toLowerCase();
      document.querySelectorAll('.file-item').forEach(function(el) {
        el.style.display = (!lower || el.textContent.toLowerCase().includes(lower)) ? '' : 'none';
      });
      // hide folders that contain no visible files
      document.querySelectorAll('#tree details').forEach(function(det) {
        var hasVisible = Array.from(det.querySelectorAll('.file-item')).some(function(el) {
          return el.style.display !== 'none';
        });
        det.style.display = hasVisible ? '' : 'none';
      });
    }

    searchInput.addEventListener('input', function() { filterFiles(searchInput.value); });
    searchInput.addEventListener('keydown', function(e) {
      if (e.key === 'Escape') { e.preventDefault(); closeSearch(); return; }
      var items = visibleItems();
      var idx = focusedEl ? items.indexOf(focusedEl) : -1;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        moveFocus(items[idx < 0 ? 0 : Math.min(idx + 1, items.length - 1)], false);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        moveFocus(items[idx <= 0 ? 0 : idx - 1], false);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        var target = (focusedEl && items.includes(focusedEl)) ? focusedEl : items[0];
        if (target && target.classList.contains('file-item')) {
          loadFile(target.dataset.path);
          closeSearch();
        }
      }
    });

    // main keyboard handler - j/k/h/l navigation + / for search + Alt+← Alt+→ for back/fwd
    document.addEventListener('keydown', function(e) {
      if (document.activeElement === searchInput) return;
      var k = e.key;
      if (k === 'ArrowLeft' && e.altKey) { e.preventDefault(); backBtn.click(); return; }
      if (k === 'ArrowRight' && e.altKey) { e.preventDefault(); fwdBtn.click(); return; }
      if (k === '/' && !searchActive) { e.preventDefault(); openSearch(); return; }
      if (k === 'c') { e.preventDefault(); collapseBtn.click(); return; }
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
    var allCollapsed = true;
    collapseBtn.textContent = '+';
    collapseBtn.title = 'Expand all';
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

    // sidebar resize
    var sidebarResize = document.getElementById('sidebar-resize');
    var appEl = document.getElementById('app');
    var resizingBar = false;
    sidebarResize.addEventListener('mousedown', function() { resizingBar = true; });
    window.addEventListener('mousemove', function(e) {
      if (!resizingBar) return;
      var rect = appEl.getBoundingClientRect();
      var w = Math.min(Math.max(e.clientX - rect.left, 160), 500);
      appEl.style.gridTemplateColumns = w + 'px 4px 1fr';
    });
    window.addEventListener('mouseup', function() { resizingBar = false; });

    var es = new EventSource('/__sse');
    es.onmessage = function(e) {
      var msg = JSON.parse(e.data);
      if (msg.type === 'change' && msg.path === currentPath) loadFile(currentPath, false);
    };
  </script>
</body>
</html>`;
}

// auto-shutdown when all browser tabs close (disabled in TUI/terminal modes)
const sseClients = new Set<ServerResponse>();
let shutdownTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleShutdown(): void {
  if (isTui || isTerminal) return;
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

// callback invoked when a watched file changes (used by TUI to refresh preview)
let tuiFileChanged: ((changedPath: string) => void) | null = null;

// argument parsing
const args = process.argv.slice(2);
let portArg: number | undefined;
const pathArgs: string[] = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--port' && args[i + 1]) {
    portArg = parseInt(args[i + 1], 10);
    if (isNaN(portArg) || portArg < 1 || portArg > 65535) {
      console.error('Invalid port number');
      process.exit(1);
    }
    i++;
  } else if (args[i] === '--tui' || args[i] === '-t' || args[i] === '--terminal') {
    // handled below
  } else {
    pathArgs.push(args[i]);
  }
}

const isTui = args.includes('--tui');
const isTerminal = args.includes('-t') || args.includes('--terminal');

// no path given - show recent files list
if (pathArgs.length === 0) {
  const history = readHistory();
  if (history.length === 0) {
    console.error('Usage: mdp <file.md>  or  mdp <directory>');
    process.exit(1);
  }
  console.log('Recent:\n');
  history.forEach((p, i) => console.log(`  ${i + 1}.  ${p}`));
  console.log('\nRun: mdp <number>  to reopen, or  mdp <path>');
  process.exit(0);
}

// support `mdp 2` to reopen the 2nd recent entry
const rawPath = pathArgs[0];
let resolvedInput = rawPath;
if (/^\d+$/.test(rawPath)) {
  const history = readHistory();
  const idx = parseInt(rawPath, 10);
  if (idx < 1 || idx > history.length) {
    console.error(`No recent entry #${idx}. Run mdp with no arguments to see the list.`);
    process.exit(1);
  }
  resolvedInput = history[idx - 1];
}

const argPath = resolve(resolvedInput);
let isDir = false;
try {
  isDir = statSync(argPath).isDirectory();
} catch {
  console.error(`Cannot access: ${argPath}`);
  process.exit(1);
}

writeHistory(argPath);

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
      tuiFileChanged?.('');
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
      tuiFileChanged?.(changedPath);
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
        const html = marked.parse(resolveWikilinks(stripFrontmatter(content))) as string;
        const title = basename(p).replace(/\.md$/, '');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ html, title }));
      } catch {
        res.writeHead(404); res.end();
      }
      return;
    }

    // resolve [[wikilink]] targets to file paths within the directory
    if (pathname === '/__find') {
      const name = url.searchParams.get('name') ?? '';
      if (!name) { res.writeHead(400); res.end(); return; }
      const found = findInTree(buildTree(argPath, argPath), name);
      if (found) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ path: found }));
      } else {
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

  // serve linked .md files from the same directory as the main file
  if (pathname.endsWith('.md')) {
    const mdPath = resolve(fileDir, '.' + pathname);
    if (mdPath.startsWith(fileDir + '/')) {
      try {
        const md = readFileSync(mdPath, 'utf-8');
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(buildFilePage(md, basename(mdPath, '.md')));
      } catch {
        res.writeHead(404); res.end();
      }
      return;
    }
  }

  // serve local files (images etc.) from the markdown file's directory
  const localPath = resolve(fileDir, '.' + pathname);
  const mime = MIME[extname(localPath).toLowerCase()];
  if (mime && serveFile(res, localPath, mime)) return;

  res.writeHead(404); res.end();
});

// ── TUI ───────────────────────────────────────────────────────────────────────

interface TuiItem {
  label: string;
  path?: string;
  isDir: boolean;
  depth: number;
  expanded: boolean;
  node: FileNode;
}

let tuiItems: TuiItem[] = [];
let tuiCurrentPath = '';

function buildTuiItems(nodes: FileNode[], depth: number): TuiItem[] {
  const result: TuiItem[] = [];
  for (const node of nodes) {
    if (node.children !== undefined) {
      result.push({ label: '  '.repeat(depth) + '▸ ' + node.name, isDir: true, depth, expanded: false, node });
    } else if (node.path) {
      result.push({ label: '  '.repeat(depth) + node.name.replace(/\.md$/, ''), path: node.path, isDir: false, depth, expanded: false, node });
    }
  }
  return result;
}

function tuiToggle(idx: number, list: blessed.Widgets.ListElement, screen: blessed.Widgets.Screen): void {
  const item = tuiItems[idx];
  if (!item.isDir || !item.node.children) return;
  if (item.expanded) {
    item.expanded = false;
    item.label = '  '.repeat(item.depth) + '▸ ' + item.node.name;
    let end = idx + 1;
    while (end < tuiItems.length && tuiItems[end].depth > item.depth) end++;
    tuiItems.splice(idx + 1, end - idx - 1);
  } else {
    item.expanded = true;
    item.label = '  '.repeat(item.depth) + '▾ ' + item.node.name;
    tuiItems.splice(idx + 1, 0, ...buildTuiItems(item.node.children, item.depth + 1));
  }
  (list as any).setItems(tuiItems.map(i => i.label));
  (list as any).select(idx);
  screen.render();
}

// blessed prints tput capability parse errors to stderr on startup; suppress them
function createScreen(title: string): blessed.Widgets.Screen {
  const orig = (process.stderr as any).write;
  (process.stderr as any).write = () => true;
  const screen = blessed.screen({ smartCSR: true, title, fullUnicode: true }) as blessed.Widgets.Screen;
  (process.stderr as any).write = orig;
  return screen;
}

function runTui(previewUrl: string): void {
  const screen = createScreen(basename(argPath));

  const previewBox = blessed.box({
    left: isDir ? '30%' : 0,
    top: 0,
    right: 0,
    height: '100%-1',
    border: { type: 'line' },
    label: ` ${basename(argPath)} `,
    scrollable: true,
    alwaysScroll: true,
    keys: true,
    mouse: true,
    tags: true,
    padding: { left: 2, right: 2, top: 0, bottom: 1 },
    style: { border: { fg: 'gray' as any }, focus: { border: { fg: 'cyan' as any } } },
  } as any);

  const hintDir  = ' [Tab/Esc] switch  [j/k] nav  [l/Enter] open  [h] close dir  [/] search  [b] browser  [q] quit';
  const hintFile = ' [j/k] scroll  [b] open in browser  [q] quit';

  const statusBar = blessed.box({
    bottom: 0, height: 1, left: 0, right: 0, tags: false,
    content: isDir ? hintDir : hintFile,
    style: { bg: 'blue', fg: 'white' },
  });

  screen.append(previewBox);
  screen.append(statusBar);

  function loadPreview(filePath: string, keepScroll = false): void {
    tuiCurrentPath = filePath;
    const fullPath = isDir ? resolve(argPath, filePath) : filePath;
    const pos = keepScroll ? ((previewBox as any).childBase ?? 0) : 0;
    try {
      const md = readFileSync(fullPath, 'utf-8');
      previewBox.setContent(renderBlessed(md));
    } catch {
      previewBox.setContent(`{red-fg}Could not load: ${filePath}{/red-fg}`);
    }
    previewBox.setLabel(` ${basename(filePath)} `);
    (previewBox as any).scrollTo(pos);
    screen.render();
  }

  tuiFileChanged = (changedPath: string) => {
    if (!isDir) loadPreview(argPath, true);
    else if (changedPath === tuiCurrentPath) loadPreview(tuiCurrentPath, true);
  };

  if (!isDir) {
    // file mode - all keys on screen level
    screen.key(['j', 'down'], () => { (previewBox as any).scroll(3);  screen.render(); });
    screen.key(['k', 'up'],   () => { (previewBox as any).scroll(-3); screen.render(); });
    screen.key(['q', 'C-c'],  () => process.exit(0));
    screen.key('b',           () => openBrowser(previewUrl));
    loadPreview(argPath);
    previewBox.focus();
    screen.render();
    return;
  }

  // directory mode: tree list on the left
  const treeList = blessed.list({
    left: 0, top: 0, width: '30%', height: '100%-1',
    border: { type: 'line' },
    label: ` ${basename(argPath)} `,
    scrollable: true,
    keys: false, // we handle all keys at screen level
    mouse: true,
    style: {
      item: {},
      selected: { bg: 'blue', fg: 'white', bold: true },
      border: { fg: 'gray' as any },
      focus: { border: { fg: 'cyan' as any } },
    },
  } as any) as blessed.Widgets.ListElement;

  screen.append(treeList);

  tuiItems = buildTuiItems(buildTree(argPath, argPath), 0);
  (treeList as any).setItems(tuiItems.map(i => i.label));

  const first = tuiItems.find(i => !i.isDir && i.path);
  if (first?.path) loadPreview(first.path);

  // mouse click on file opens it
  treeList.on('select', (_: unknown, idx: number) => {
    const item = tuiItems[idx];
    if (!item) return;
    if (item.isDir) tuiToggle(idx, treeList, screen);
    else if (item.path) { loadPreview(item.path); previewBox.focus(); }
  });

  // track which pane is active
  let inTree = true;
  treeList.on('focus',   () => { inTree = true; });
  previewBox.on('focus', () => { inTree = false; });

  // search prompt
  const prompt = (blessed as any).prompt({
    parent: screen, top: 'center', left: 'center',
    width: '50%', height: 'shrink',
    border: 'line', label: ' Search ', tags: false,
    style: { border: { fg: 'cyan' } },
  });

  // all keyboard handling at screen level - fires regardless of which widget has focus
  screen.key(['q', 'C-c'], () => process.exit(0));
  screen.key('b',          () => openBrowser(previewUrl));

  screen.key('tab', () => {
    if (inTree) previewBox.focus(); else treeList.focus();
    screen.render();
  });
  screen.key('escape', () => {
    if (!inTree) { treeList.focus(); screen.render(); }
  });

  screen.key(['j', 'down'], () => {
    if (inTree) {
      const cur = (treeList as any).selected as number;
      (treeList as any).select(Math.min(cur + 1, tuiItems.length - 1));
    } else {
      (previewBox as any).scroll(3);
    }
    screen.render();
  });
  screen.key(['k', 'up'], () => {
    if (inTree) {
      const cur = (treeList as any).selected as number;
      (treeList as any).select(Math.max(cur - 1, 0));
    } else {
      (previewBox as any).scroll(-3);
    }
    screen.render();
  });

  screen.key(['l', 'enter'], () => {
    if (!inTree) return;
    const idx = (treeList as any).selected as number;
    const item = tuiItems[idx];
    if (!item) return;
    if (item.isDir) tuiToggle(idx, treeList, screen);
    else if (item.path) { loadPreview(item.path); previewBox.focus(); }
  });

  screen.key('h', () => {
    if (!inTree) return;
    const idx = (treeList as any).selected as number;
    const item = tuiItems[idx];
    if (!item) return;
    if (item.isDir && item.expanded) { tuiToggle(idx, treeList, screen); return; }
    for (let i = idx - 1; i >= 0; i--) {
      if (tuiItems[i].isDir && tuiItems[i].depth < item.depth) {
        (treeList as any).select(i);
        screen.render();
        break;
      }
    }
  });

  screen.key('/', () => {
    if (!inTree) return;
    prompt.input('Filter files:', '', (err: unknown, value: string) => {
      if (!err && value) {
        const q = value.toLowerCase();
        const match = tuiItems.findIndex(i => !i.isDir && i.label.toLowerCase().includes(q));
        if (match >= 0) {
          (treeList as any).select(match);
          if (tuiItems[match].path) loadPreview(tuiItems[match].path!);
        }
      }
      treeList.focus();
      screen.render();
    });
  });

  treeList.focus();
  screen.render();
}

// ── entry point ───────────────────────────────────────────────────────────────

// terminal pager mode (-t / --terminal): blessed pager on TTY, raw ANSI when piped
if (isTerminal) {
  if (isDir) {
    console.error('Error: -t mode requires a file.\nUsage: mdp <file.md> -t');
    process.exit(1);
  }

  if (!process.stdout.isTTY) {
    process.stdout.write(renderAnsi(currentMd));
    process.exit(0);
  }

  const screen = createScreen(basename(argPath));

  const pager = blessed.box({
    top: 0, left: 0, right: 0,
    height: '100%-1',
    scrollable: true,
    alwaysScroll: true,
    keys: true,
    mouse: true,
    tags: true,
    padding: { left: 3, right: 3, top: 1, bottom: 1 },
    content: renderBlessed(currentMd),
  } as any);

  const hint = blessed.box({
    bottom: 0, height: 1, left: 0, right: 0, tags: false,
    content: ` ${basename(argPath)}   [j/k ↑↓] scroll  [g/G] top/bottom  [q] close`,
    style: { bg: 'blue', fg: 'white' },
  });

  screen.append(pager);
  screen.append(hint);

  screen.key(['j', 'down'],     () => { (pager as any).scroll(3);  screen.render(); });
  screen.key(['k', 'up'],       () => { (pager as any).scroll(-3); screen.render(); });
  screen.key(['g', 'home'],     () => { (pager as any).scrollTo(0); screen.render(); });
  screen.key(['S-g', 'end'],    () => { (pager as any).scrollTo((pager as any).getScrollHeight()); screen.render(); });
  screen.key(['pagedown', 'f'], () => { (pager as any).scroll(Math.floor((screen.height as number) * 0.8)); screen.render(); });
  screen.key(['pageup', 'b'],   () => { (pager as any).scroll(-Math.floor((screen.height as number) * 0.8)); screen.render(); });
  screen.key(['q', 'C-c'],      () => process.exit(0));

  tuiFileChanged = () => {
    const pos = (pager as any).childBase ?? 0;
    pager.setContent(renderBlessed(currentMd));
    (pager as any).scrollTo(pos);
    screen.render();
  };

  pager.focus();
  screen.render();
}

if (!isTerminal) server.listen(portArg ?? 0, '127.0.0.1', () => {
  const { port } = server.address() as AddressInfo;
  const previewUrl = `http://localhost:${port}`;
  if (isDir) {
    console.log(`Directory: ${argPath}`);
  } else {
    console.log(`File:      ${argPath}`);
  }
  console.log(`Preview:   ${previewUrl}`);
  if (isTui) {
    runTui(previewUrl);
  } else {
    openBrowser(previewUrl);
  }
});
