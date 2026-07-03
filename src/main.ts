import { marked } from 'marked';
import markedKatex from 'marked-katex-extension';
import markedFootnote from 'marked-footnote';
import hljs from 'highlight.js';
import { markedEmoji, GITHUB_EMOJI } from './emoji.js';
import { EditorView, keymap, Decoration } from '@codemirror/view';
import { Compartment, EditorSelection, Prec, StateField, RangeSet, Range } from '@codemirror/state';
import { basicSetup } from 'codemirror';
import { markdown } from '@codemirror/lang-markdown';
import { oneDark } from '@codemirror/theme-one-dark';
import { vim } from '@replit/codemirror-vim';
import { openSearchPanel } from '@codemirror/search';
import styles from './style.css?raw';

// strips YAML/TOML frontmatter from Obsidian files before rendering
function stripFrontmatter(content: string): string {
  const fence = content.startsWith('---') ? '---' : content.startsWith('+++') ? '+++' : null;
  if (!fence) return content;
  const end = content.indexOf('\n' + fence, fence.length);
  return end === -1 ? content : content.slice(end + fence.length + 1).trimStart();
}

// mermaid is loaded from CDN (defer) - access via window to avoid TS errors
function getMermaid() {
  return (window as unknown as { mermaid?: { initialize(c: Record<string, unknown>): void; run(o?: { nodes?: Element[] }): void } }).mermaid;
}

// KaTeX for math: $inline$ and $$block$$ syntax
marked.use(markedKatex({ throwOnError: false }));
marked.use(markedEmoji);
marked.use(markedFootnote());

// marked v5+ removed the `highlight` option - use a custom renderer instead
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

const preview = document.getElementById('preview') as HTMLElement;
const wordCount = document.getElementById('word-count') as HTMLElement;
const charCount = document.getElementById('char-count') as HTMLElement;
const copyBtn = document.getElementById('copy-btn') as HTMLButtonElement;
const exportBtn = document.getElementById('export-btn') as HTMLButtonElement;
const clearBtn = document.getElementById('clear-btn') as HTMLButtonElement;
const themeBtn = document.getElementById('theme-btn') as HTMLButtonElement;
const scrollBtn = document.getElementById('scroll-btn') as HTMLButtonElement;
const wrapBtn = document.getElementById('wrap-btn') as HTMLButtonElement;
const fontDecBtn = document.getElementById('font-dec-btn') as HTMLButtonElement;
const fontIncBtn = document.getElementById('font-inc-btn') as HTMLButtonElement;
const vimBtn = document.getElementById('vim-btn') as HTMLButtonElement;
const fullscreenBtn = document.getElementById('fullscreen-btn') as HTMLButtonElement;
const printBtn = document.getElementById('print-btn') as HTMLButtonElement;
const findBtn = document.getElementById('find-btn') as HTMLButtonElement;
const emojiBtn = document.getElementById('emoji-btn') as HTMLButtonElement;
const emojiPicker = document.getElementById('emoji-picker') as HTMLElement;
const emojiBackdrop = document.getElementById('emoji-backdrop') as HTMLElement;
const emojiGrid = document.getElementById('emoji-grid') as HTMLElement;
const emojiSearch = document.getElementById('emoji-search') as HTMLInputElement;
const emojiCount = document.getElementById('emoji-count') as HTMLElement;
const emojiCloseBtn = document.getElementById('emoji-close-btn') as HTMLButtonElement;
const tocBtn = document.getElementById('toc-btn') as HTMLButtonElement;
const tocPanel = document.getElementById('toc') as HTMLElement;
const divider = document.getElementById('divider') as HTMLElement;
const editorContainer = document.getElementById('editor') as HTMLElement;

const STORAGE_KEY = 'md-content';
const FONT_SIZE_KEY = 'md-font-size';
const VIM_KEY = 'md-vim';
const THEME_KEY = 'md-theme';

// available color schemes - 'dark' and 'nord' use the dark editor theme and mermaid palette
const THEMES = ['light', 'dark', 'sepia', 'nord'] as const;
type Theme = typeof THEMES[number];
const THEME_LABELS: Record<Theme, string> = { light: 'Light', dark: 'Dark', sepia: 'Sepia', nord: 'Nord' };
function isDarkTheme(t: Theme): boolean { return t === 'dark' || t === 'nord'; }

// ── Tab management ──────────────────────────────────────────────────────────────

interface Tab {
  id: string;
  title: string;
  content: string;
  savedContent: string;
  fileHandle?: FileSystemFileHandle | null;
}

let tabs: Tab[] = [];
let activeTabId: string | null = null;
const tabItems = document.getElementById('tab-items') as HTMLElement;
const newTabBtn = document.getElementById('new-tab-btn') as HTMLButtonElement;
const TAB_LIST_KEY = 'md-tab-list';

function tabGenId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function tabGetActive(): Tab | null {
  return tabs.find(t => t.id === activeTabId) ?? null;
}

function tabSaveMeta(): void {
  const meta = tabs.map(t => ({ id: t.id, title: t.title }));
  localStorage.setItem(TAB_LIST_KEY, JSON.stringify(meta));
}

function tabSaveContent(tab: Tab): void {
  localStorage.setItem(`md-tab-${tab.id}`, tab.content);
}

function tabLoadAll(): Tab[] {
  const raw = localStorage.getItem(TAB_LIST_KEY);
  if (!raw) return [];
  try {
    const meta: { id: string; title: string }[] = JSON.parse(raw);
    return meta.map(m => {
      const content = localStorage.getItem(`md-tab-${m.id}`) ?? '';
      return { id: m.id, title: m.title, content, savedContent: content };
    });
  } catch { return []; }
}

function tabCreate(title: string, content?: string, fileHandle?: FileSystemFileHandle | null): Tab {
  const tab: Tab = {
    id: tabGenId(),
    title,
    content: content ?? '',
    savedContent: content ?? '',
    fileHandle: fileHandle ?? undefined,
  };
  tabs.push(tab);
  tabSaveContent(tab);
  tabSaveMeta();
  return tab;
}

function tabSwitch(id: string): void {
  const current = tabGetActive();
  if (current) {
    current.content = editorView.state.doc.toString();
    tabSaveContent(current);
    tabTakeSnapshot(current.id);
  }

  activeTabId = id;
  const tab = tabGetActive();
  if (!tab) return;

  editorView.dispatch({
    changes: { from: 0, to: editorView.state.doc.length, insert: tab.content },
  });

  if (tab.fileHandle) {
    saveFileBtn.style.display = '';
    openFileNameEl.textContent = tab.title;
    openFileNameEl.style.display = '';
  } else {
    saveFileBtn.style.display = 'none';
    openFileNameEl.style.display = 'none';
  }

  tabRenderBar();
  tabStartPolling();
}

function tabClose(id: string): void {
  const idx = tabs.findIndex(t => t.id === id);
  if (idx === -1) return;
  const tab = tabs[idx];

  if (tab.content !== tab.savedContent) {
    if (!confirm(`"${tab.title}" has unsaved changes. Close anyway?`)) return;
  }

  const wasActive = id === activeTabId;
  tabs.splice(idx, 1);
  localStorage.removeItem(`md-tab-${id}`);
  localStorage.removeItem(historyKey(id));

  if (tabs.length === 0) {
    tabCreate('Untitled');
    tabSaveMeta();
    tabRenderBar();
    return;
  }

  if (wasActive) {
    const nextIdx = Math.min(idx, tabs.length - 1);
    const nextTab = tabs[nextIdx];
    activeTabId = nextTab.id;
    editorView.dispatch({
      changes: { from: 0, to: editorView.state.doc.length, insert: nextTab.content },
    });
    tabStartPolling();
  }

  tabSaveMeta();
  tabRenderBar();
}

function tabRenderBar(): void {
  tabItems.innerHTML = '';
  for (const tab of tabs) {
    const el = document.createElement('div');
    el.className = `tab-item${tab.id === activeTabId ? ' active' : ''}`;

    if (tab.content !== tab.savedContent) {
      const dot = document.createElement('span');
      dot.className = 'tab-dirty';
      el.appendChild(dot);
    }

    const title = document.createElement('span');
    title.textContent = tab.title;
    el.appendChild(title);
    el.title = tab.title;

    const close = document.createElement('button');
    close.className = 'tab-close';
    close.textContent = '×';
    close.addEventListener('click', (e) => {
      e.stopPropagation();
      tabClose(tab.id);
    });
    el.appendChild(close);

    el.addEventListener('click', () => tabSwitch(tab.id));
    tabItems.appendChild(el);
  }
}

function tabToggleDirty(tab: Tab): void {
  const items = tabItems.querySelectorAll('.tab-item');
  for (const el of items) {
    if (!el.classList.contains('active')) continue;
    const hasDot = el.querySelector('.tab-dirty');
    if (tab.content !== tab.savedContent && !hasDot) {
      const dot = document.createElement('span');
      dot.className = 'tab-dirty';
      el.insertBefore(dot, el.firstChild);
    } else if (tab.content === tab.savedContent && hasDot) {
      hasDot.remove();
    }
    break;
  }
}

function tabStartPolling(): void {
  clearInterval(fsaFileTimer);
  const tab = tabGetActive();
  if (!tab?.fileHandle) return;

  let lastMod = 0;
  tab.fileHandle.getFile().then(f => { lastMod = f.lastModified; }).catch(() => {});

  fsaFileTimer = window.setInterval(async () => {
    try {
      const file = await tab.fileHandle!.getFile();
      if (file.lastModified !== lastMod) {
        lastMod = file.lastModified;
        const content = await file.text();
        if (content !== editorView.state.doc.toString()) {
          editorView.dispatch({ changes: { from: 0, to: editorView.state.doc.length, insert: content } });
        }
      }
    } catch { clearInterval(fsaFileTimer); }
  }, 1500);
}

function tabInit(): void {
  const stored = tabLoadAll();
  if (stored.length > 0) {
    tabs = stored;
    activeTabId = tabs[0].id;
    localStorage.removeItem(STORAGE_KEY);
  } else {
    const oldContent = localStorage.getItem(STORAGE_KEY);
    const tab = tabCreate('Untitled', oldContent ?? undefined);
    activeTabId = tab.id;
    localStorage.removeItem(STORAGE_KEY);
  }
  tabRenderBar();
}

newTabBtn.addEventListener('click', () => {
  const tab = tabCreate('Untitled');
  tabSwitch(tab.id);
});

// ── Version History ────────────────────────────────────────────────────────────

interface Snapshot {
  content: string;
  timestamp: number;
}

const HISTORY_PREFIX = 'md-history-';
const MAX_SNAPSHOTS = 50;
const SNAPSHOT_DEBOUNCE = 30000;
let snapshotTimer = 0;

function historyKey(tabId: string): string {
  return `${HISTORY_PREFIX}${tabId}`;
}

function loadSnapshots(tabId: string): Snapshot[] {
  const raw = localStorage.getItem(historyKey(tabId));
  if (!raw) return [];
  try { return JSON.parse(raw); } catch { return []; }
}

function saveSnapshots(tabId: string, snapshots: Snapshot[]): void {
  localStorage.setItem(historyKey(tabId), JSON.stringify(snapshots));
}

function tabTakeSnapshot(tabId: string): void {
  const tab = tabs.find(t => t.id === tabId);
  if (!tab) return;
  const snapshots = loadSnapshots(tabId);
  const last = snapshots[snapshots.length - 1];
  if (last && last.content === tab.content) return;

  snapshots.push({ content: tab.content, timestamp: Date.now() });
  while (snapshots.length > MAX_SNAPSHOTS) snapshots.shift();
  saveSnapshots(tabId, snapshots);
}

function scheduleSnapshot(tabId: string): void {
  clearTimeout(snapshotTimer);
  snapshotTimer = window.setTimeout(() => tabTakeSnapshot(tabId), SNAPSHOT_DEBOUNCE);
}

function formatTimeAgo(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60000) return 'Just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)} min ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)} h ago`;
  return `${Math.floor(diff / 86400000)} d ago`;
}

function formatDate(ts: number): string {
  const d = new Date(ts);
  const date = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  const time = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  return `${date} ${time}`;
}

window.addEventListener('pagehide', () => {
  if (activeTabId) tabTakeSnapshot(activeTabId);
});

const INITIAL = `# Markdown Previewer

Write **Markdown** on the left — see the result on the right, instantly.

## Features

- Live preview as you type
- Syntax highlighting for code blocks
- Word and character counter
- Copy Markdown to clipboard
- Light / dark theme toggle
- Drag the divider to resize panes

## Code example

\`\`\`typescript
function greet(name: string): string {
  return \`Hello, \${name}!\`;
}

console.log(greet('World'));
\`\`\`

## Table

| Feature       | Status |
|---------------|--------|
| Live preview  | ✓      |
| Highlighting  | ✓      |
| Dark mode     | ✓      |

> Start editing to see your changes appear here in real time.
`;

// maps local://N placeholders to blob URLs so dropped/pasted images stay short in the editor
const imageStore = new Map<string, string>();
let imageId = 0;

// stores image files and inserts short local:// placeholders at the cursor
function insertImageFiles(files: File[]): void {
  const snippets = files.map(file => {
    const id = `local://${imageId++}`;
    imageStore.set(id, URL.createObjectURL(file));
    const alt = file.name.replace(/\.[^.]+$/, '') || 'image';
    return `![${alt}](${id})`;
  });
  editorView.dispatch(editorView.state.replaceSelection(snippets.join('\n')));
}

function buildToc(): void {
  const headings = Array.from(preview.querySelectorAll('h1, h2, h3, h4, h5, h6'));
  const items = headings.map((h, i) => {
    const level = parseInt(h.tagName[1]);
    const text = (h as HTMLElement).innerText;
    return `<div class="toc-item toc-h${level}" data-index="${i}">${text}</div>`;
  }).join('');
  tocPanel.innerHTML = `<div class="toc-title">Contents</div><div class="toc-items">${items || '<p class="toc-empty">No headings</p>'}</div>`;
  tocPanel.querySelectorAll<HTMLElement>('.toc-item').forEach((item, i) => {
    item.addEventListener('click', () => headings[i].scrollIntoView({ behavior: 'smooth' }));
  });
}

function render(md: string): void {
  // replace local:// placeholders with actual blob URLs before parsing
  const resolved = md.replace(/\(local:\/\/(\d+)\)/g, (match, id) => {
    const url = imageStore.get(`local://${id}`);
    return url ? `(${url})` : match;
  });

  // marked.parse returns string | Promise<string>; renderer is sync so cast is safe
  preview.innerHTML = marked.parse(resolved) as string;

  // render mermaid diagrams if present
  const diagrams = Array.from(preview.querySelectorAll<Element>('.mermaid'));
  if (diagrams.length) getMermaid()?.run({ nodes: diagrams });

  buildToc();

  const text = md.trim();
  const words = text === '' ? 0 : text.split(/\s+/).length;
  wordCount.textContent = `${words} word${words !== 1 ? 's' : ''}`;
  charCount.textContent = `${md.length} chars`;
}

// toggles markers around the selection: adds them if absent, removes if already present
function toggleWrap(view: EditorView, before: string, after: string): boolean {
  view.dispatch(view.state.update(
    view.state.changeByRange(range => {
      const { from, to } = range;
      const hasMarkers =
        view.state.sliceDoc(from - before.length, from) === before &&
        view.state.sliceDoc(to, to + after.length) === after;

      if (hasMarkers) {
        return {
          changes: [
            { from: from - before.length, to: from },
            { from: to, to: to + after.length },
          ],
          range: EditorSelection.range(from - before.length, to - before.length),
        };
      }
      if (range.empty) {
        return {
          changes: { from, insert: before + after },
          range: EditorSelection.cursor(from + before.length),
        };
      }
      return {
        changes: [
          { from, insert: before },
          { from: to, insert: after },
        ],
        range: EditorSelection.range(from + before.length, to + before.length),
      };
    }),
    { scrollIntoView: true, userEvent: 'input' },
  ));
  return true;
}

// inserts [selected text](url) - places cursor on 'url' so it can be typed immediately
function insertLink(view: EditorView): boolean {
  view.dispatch(view.state.update(
    view.state.changeByRange(range => {
      if (range.empty) {
        return {
          changes: { from: range.from, insert: '[](url)' },
          range: EditorSelection.cursor(range.from + 1),
        };
      }
      const text = view.state.sliceDoc(range.from, range.to);
      const insert = `[${text}](url)`;
      return {
        changes: { from: range.from, to: range.to, insert },
        range: EditorSelection.range(
          range.from + text.length + 3,
          range.from + text.length + 6,
        ),
      };
    }),
    { scrollIntoView: true, userEvent: 'input' },
  ));
  return true;
}

let debounceTimer = 0;
const storedTheme = localStorage.getItem(THEME_KEY);
let theme: Theme = (THEMES as readonly string[]).includes(storedTheme ?? '')
  ? (storedTheme as Theme)
  : window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
const themeCompartment = new Compartment();
const wrapCompartment = new Compartment();
const vimCompartment = new Compartment();
let wrapEnabled = true;
let vimEnabled = localStorage.getItem(VIM_KEY) === '1';

tabInit();

const editorView = new EditorView({
  doc: tabGetActive()?.content ?? INITIAL,
  extensions: [
    basicSetup,
    markdown(),
    themeCompartment.of(isDarkTheme(theme) ? oneDark : []),
    wrapCompartment.of(EditorView.lineWrapping),
    vimCompartment.of(vimEnabled ? vim() : []),
    // Prec.highest ensures our keys take priority over defaultKeymap in basicSetup
    // (e.g. Mod-i is bound to selectLine there)
    // highlight footnote definition content with consistent color
    StateField.define<RangeSet<Decoration>>({
      create() { return Decoration.none; },
      update(_deco, tr) {
        if (!tr.docChanged) return _deco;
        const footnoteLine = /^(\[\^[^\]]+\]:\s*)(.*)/;
        const decos: Range<Decoration>[] = [];
        for (let i = 1; i <= tr.state.doc.lines; i++) {
          const line = tr.state.doc.line(i);
          const m = footnoteLine.exec(line.text);
          if (m) {
            const from = line.from + m[1].length;
            if (from < line.to) {
              decos.push(Decoration.mark({ class: 'cm-footnote-content' }).range(from, line.to));
            }
          }
        }
        return RangeSet.of(decos);
      },
      provide: f => EditorView.decorations.from(f),
    }),
    Prec.highest(keymap.of([
      // insert 2 spaces on Tab instead of moving focus
      { key: 'Tab', run: view => { view.dispatch(view.state.replaceSelection('  ')); return true; } },
      // Markdown formatting shortcuts - press again to remove markers
      { key: 'Mod-b', run: view => toggleWrap(view, '**', '**') },
      { key: 'Mod-i', run: view => toggleWrap(view, '*', '*') },
      { key: 'Mod-k', run: insertLink },
      { key: 'Mod-Shift-c', run: view => toggleWrap(view, '`', '`') },
    ])),
    EditorView.updateListener.of(update => {
      if (!update.docChanged) return;
      const content = update.state.doc.toString();
      const tab = tabGetActive();
      if (tab) {
        tab.content = content;
        tabSaveContent(tab);
        tabToggleDirty(tab);
        scheduleSnapshot(tab.id);
      }
      clearTimeout(debounceTimer);
      debounceTimer = window.setTimeout(() => render(content), 60);
    }),
    // drag & drop images - stores a blob URL and inserts a short local:// placeholder
    EditorView.domEventHandlers({
      dragover: e => {
        if (!e.dataTransfer?.types.includes('Files')) return false;
        e.preventDefault();
        editorContainer.classList.add('drag-over');
        return true;
      },
      dragleave: () => {
        editorContainer.classList.remove('drag-over');
        return false;
      },
      drop: e => {
        e.preventDefault();
        editorContainer.classList.remove('drag-over');
        const files = Array.from(e.dataTransfer?.files ?? [])
          .filter(f => f.type.startsWith('image/'));
        if (files.length === 0) return false;
        insertImageFiles(files);
        return true;
      },
      // paste images from clipboard - same local:// storage as drag & drop
      paste: e => {
        const files = Array.from(e.clipboardData?.items ?? [])
          .filter(item => item.type.startsWith('image/'))
          .map(item => item.getAsFile())
          .filter((f): f is File => f !== null);
        if (files.length === 0) return false;
        e.preventDefault();
        insertImageFiles(files);
        return true;
      },
    }),
  ],
  parent: editorContainer,
});

copyBtn.addEventListener('click', async () => {
  await navigator.clipboard.writeText(editorView.state.doc.toString());
  copyBtn.textContent = 'Copied!';
  setTimeout(() => (copyBtn.textContent = 'Copy MD'), 1500);
});

clearBtn.addEventListener('click', () => {
  const content = editorView.state.doc.toString();
  if (content && confirm('Clear editor?')) {
    editorView.dispatch({
      changes: { from: 0, to: editorView.state.doc.length, insert: '' },
    });
    const tab = tabGetActive();
    if (tab) {
      tab.content = '';
      tab.savedContent = '';
      tabSaveContent(tab);
      tabRenderBar();
    }
    render('');
  }
});

exportBtn.addEventListener('click', () => {
  const theme = document.documentElement.dataset['theme'] ?? 'light';
  const heading = editorView.state.doc.toString().match(/^#\s+(.+)/m)?.[1];
  const suggested = heading
    ? heading.toLowerCase().replace(/[^\w]+/g, '-').replace(/^-|-$/g, '') + '.html'
    : 'export.html';

  const input = window.prompt('Save as:', suggested);
  if (input === null) return; // cancelled
  const filename = input.trim() || suggested;

  const html = `<!DOCTYPE html>
<html lang="en" data-theme="${theme}">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${heading ?? 'Export'}</title>
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github.min.css" />
  <style>
    ${styles}
    html, body { height: auto; overflow: auto; }
  </style>
</head>
<body>
  <div style="max-width: 860px; margin: 0 auto; padding: 32px 28px;">
    <div class="prose">${preview.innerHTML}</div>
  </div>
</body>
</html>`;

  const blob = new Blob([html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
});

function applyTheme(): void {
  document.documentElement.dataset['theme'] = theme;
  themeBtn.textContent = THEME_LABELS[theme];
  localStorage.setItem(THEME_KEY, theme);
  editorView.dispatch({
    effects: themeCompartment.reconfigure(isDarkTheme(theme) ? oneDark : []),
  });
  // re-initialize mermaid with new theme and re-render diagrams
  getMermaid()?.initialize({ startOnLoad: false, theme: isDarkTheme(theme) ? 'dark' : 'default' });
  if (preview.querySelector('.mermaid svg')) render(editorView.state.doc.toString());
}

themeBtn.addEventListener('click', () => {
  theme = THEMES[(THEMES.indexOf(theme) + 1) % THEMES.length];
  applyTheme();
});

wrapBtn.addEventListener('click', () => {
  wrapEnabled = !wrapEnabled;
  wrapBtn.classList.toggle('active', wrapEnabled);

  // line heights change after toggling wrap, so save the top-visible line number
  // before the reconfiguration and restore it after CodeMirror re-measures
  const scrollEl = editorView.scrollDOM;
  const topPos = editorView.lineBlockAtHeight(scrollEl.scrollTop).from;
  const topLine = editorView.state.doc.lineAt(topPos).number;

  editorView.dispatch({
    effects: wrapCompartment.reconfigure(wrapEnabled ? EditorView.lineWrapping : []),
  });

  requestAnimationFrame(() => {
    const line = editorView.state.doc.line(
      Math.min(topLine, editorView.state.doc.lines)
    );
    editorView.dispatch({
      effects: EditorView.scrollIntoView(line.from, { y: 'start', yMargin: 0 }),
    });
  });
});

let fontSize = parseInt(localStorage.getItem(FONT_SIZE_KEY) ?? '14', 10);

function applyFontSize(): void {
  document.documentElement.style.setProperty('--cm-font-size', `${fontSize}px`);
  localStorage.setItem(FONT_SIZE_KEY, String(fontSize));
  fontDecBtn.disabled = fontSize <= 11;
  fontIncBtn.disabled = fontSize >= 20;
}

fontDecBtn.addEventListener('click', () => { fontSize--; applyFontSize(); });
fontIncBtn.addEventListener('click', () => { fontSize++; applyFontSize(); });

vimBtn.addEventListener('click', () => {
  vimEnabled = !vimEnabled;
  vimBtn.classList.toggle('active', vimEnabled);
  localStorage.setItem(VIM_KEY, vimEnabled ? '1' : '0');
  editorView.dispatch({
    effects: vimCompartment.reconfigure(vimEnabled ? vim() : []),
  });
});

findBtn.addEventListener('click', () => {
  openSearchPanel(editorView);
  editorView.focus();
});

tocBtn.addEventListener('click', () => {
  const active = tocPanel.classList.toggle('active');
  tocBtn.classList.toggle('active', active);
  if (active) buildToc();
});

// ── Emoji picker ──────────────────────────────────────────────────────────────

const emojiEntries = Object.entries(GITHUB_EMOJI).sort(([a], [b]) => a.localeCompare(b));
const emojiFrag = document.createDocumentFragment();

for (const [name, char] of emojiEntries) {
  const cell = document.createElement('div');
  cell.className = 'emoji-cell';
  cell.dataset.name = name;
  cell.innerHTML = `${char}<span class="emoji-tooltip">:${name}:</span>`;
  cell.addEventListener('click', () => {
    editorView.dispatch(editorView.state.replaceSelection(`:${name}:`));
    editorView.focus();
    closeEmojiPicker();
  });
  emojiFrag.appendChild(cell);
}

emojiGrid.appendChild(emojiFrag);
emojiCount.textContent = `${emojiEntries.length}`;

function filterEmoji(query: string): void {
  const q = query.toLowerCase();
  const cells = emojiGrid.querySelectorAll<HTMLElement>('.emoji-cell');
  let visible = 0;
  for (const cell of cells) {
    const name = cell.dataset.name ?? '';
    const match = !q || name.includes(q);
    cell.style.display = match ? '' : 'none';
    if (match) visible++;
  }
  emojiCount.textContent = `${visible} / ${cells.length}`;
}

emojiSearch.addEventListener('input', () => filterEmoji(emojiSearch.value));

function openEmojiPicker(): void {
  emojiPicker.classList.add('open');
  emojiBackdrop.classList.add('open');
  emojiSearch.value = '';
  emojiSearch.focus();
  filterEmoji('');
}

function closeEmojiPicker(): void {
  emojiPicker.classList.remove('open');
  emojiBackdrop.classList.remove('open');
}

emojiBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  if (emojiPicker.classList.contains('open')) {
    closeEmojiPicker();
  } else {
    openEmojiPicker();
  }
});

emojiCloseBtn.addEventListener('click', closeEmojiPicker);
emojiBackdrop.addEventListener('click', closeEmojiPicker);

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && emojiPicker.classList.contains('open')) {
    closeEmojiPicker();
    emojiBtn.focus();
  }
});

// ── History panel UI ───────────────────────────────────────────────────────────

const historyBtn = document.getElementById('history-btn') as HTMLButtonElement;
const historyPanel = document.getElementById('history-panel') as HTMLElement;
const historyBackdrop = document.getElementById('history-backdrop') as HTMLElement;
const historyList = document.getElementById('history-list') as HTMLElement;
const historyCount = document.getElementById('history-count') as HTMLElement;
const historyCloseBtn = document.getElementById('history-close-btn') as HTMLButtonElement;

function openHistoryPanel(): void {
  const tab = tabGetActive();
  if (!tab) return;
  const snapshots = loadSnapshots(tab.id);
  renderHistoryList(snapshots);
  historyPanel.classList.add('open');
  historyBackdrop.classList.add('open');
}

function closeHistoryPanel(): void {
  historyPanel.classList.remove('open');
  historyBackdrop.classList.remove('open');
}

function renderHistoryList(snapshots: Snapshot[]): void {
  historyList.innerHTML = '';
  if (snapshots.length === 0) {
    historyList.innerHTML = '<div class="history-empty" style="padding:24px;text-align:center;color:var(--text-muted)">No saved versions yet</div>';
    historyCount.textContent = '0 versions';
    return;
  }
  historyCount.textContent = `${snapshots.length} version${snapshots.length !== 1 ? 's' : ''}`;

  for (let i = snapshots.length - 1; i >= 0; i--) {
    const snap = snapshots[i];
    const item = document.createElement('div');
    item.className = 'history-item';

    const info = document.createElement('div');
    info.className = 'history-item-info';

    const time = document.createElement('div');
    time.className = 'history-item-time';
    time.textContent = formatTimeAgo(snap.timestamp);
    info.appendChild(time);

    const date = document.createElement('div');
    date.className = 'history-item-date';
    date.textContent = formatDate(snap.timestamp);
    info.appendChild(date);

    const preview = document.createElement('div');
    preview.className = 'history-item-preview';
    const firstLine = snap.content.split('\n')[0].trim();
    preview.textContent = firstLine || '(empty)';
    info.appendChild(preview);

    item.appendChild(info);

    const restore = document.createElement('button');
    restore.className = 'history-restore-btn';
    restore.textContent = 'Restore';
    restore.addEventListener('click', (e) => {
      e.stopPropagation();
      doRestoreSnapshot(snap.content);
    });
    item.appendChild(restore);

    item.addEventListener('click', () => doRestoreSnapshot(snap.content));
    historyList.appendChild(item);
  }
}

function doRestoreSnapshot(content: string): void {
  const current = editorView.state.doc.toString();
  if (current === content) { closeHistoryPanel(); return; }
  const tab = tabGetActive();
  if (tab) tabTakeSnapshot(tab.id);
  editorView.dispatch({
    changes: { from: 0, to: editorView.state.doc.length, insert: content },
  });
  closeHistoryPanel();
}

historyBtn.addEventListener('click', () => {
  if (historyPanel.classList.contains('open')) {
    closeHistoryPanel();
  } else {
    openHistoryPanel();
  }
});

historyCloseBtn.addEventListener('click', closeHistoryPanel);
historyBackdrop.addEventListener('click', closeHistoryPanel);

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && historyPanel.classList.contains('open')) {
    closeHistoryPanel();
    historyBtn.focus();
  }
});

fullscreenBtn.addEventListener('click', () => {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen();
  } else {
    document.exitFullscreen();
  }
});

document.addEventListener('fullscreenchange', () => {
  fullscreenBtn.textContent = document.fullscreenElement ? 'Exit ⛶' : 'Full ⛶';
});

printBtn.addEventListener('click', () => window.print());

// ── Zen mode ───────────────────────────────────────────────────────────────────

const zenBtn = document.getElementById('zen-btn') as HTMLButtonElement;
const zenExitBtn = document.getElementById('zen-exit-btn') as HTMLButtonElement;
let zenEnabled = false;

function toggleZen(): void {
  zenEnabled = !zenEnabled;
  document.body.classList.toggle('zen-mode', zenEnabled);
  zenBtn.classList.toggle('active', zenEnabled);
  if (!zenEnabled) {
    // close any open panels when exiting zen
    tocPanel.classList.remove('active');
    tocBtn.classList.remove('active');
    closeEmojiPicker();
    closeHistoryPanel();
  }
}

zenBtn.addEventListener('click', toggleZen);
zenExitBtn.addEventListener('click', toggleZen);

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && zenEnabled) {
    if (emojiPicker.classList.contains('open') || historyPanel.classList.contains('open')) return;
    toggleZen();
  }
});

// ── Custom preview CSS ─────────────────────────────────────────────────────────

const cssBtn = document.getElementById('custom-css-btn') as HTMLButtonElement;
const cssInput = document.getElementById('custom-css-input') as HTMLInputElement;
const CUSTOM_CSS_KEY = 'md-custom-css';

function applyCustomCss(css: string): void {
  let style = document.getElementById('custom-preview-css');
  if (!style) {
    style = document.createElement('style');
    style.id = 'custom-preview-css';
    document.head.appendChild(style);
  }
  style.textContent = css;
  cssBtn.classList.toggle('active', !!css);
}

function loadCustomCss(): void {
  const saved = localStorage.getItem(CUSTOM_CSS_KEY);
  if (saved) applyCustomCss(saved);
}

function removeCustomCss(): void {
  const style = document.getElementById('custom-preview-css');
  if (style) style.remove();
  localStorage.removeItem(CUSTOM_CSS_KEY);
  cssBtn.classList.remove('active');
}

cssBtn.addEventListener('click', () => {
  const hasCss = !!document.getElementById('custom-preview-css');
  if (hasCss && confirm('Remove custom preview CSS?')) {
    removeCustomCss();
  } else if (!hasCss) {
    cssInput.value = '';
    cssInput.click();
  }
});

cssInput.addEventListener('change', async () => {
  const file = cssInput.files?.[0];
  if (!file) return;
  const css = await file.text();
  localStorage.setItem(CUSTOM_CSS_KEY, css);
  applyCustomCss(css);
});

// restore custom css on page load
loadCustomCss();

// synchronized scrolling - tracks which pane is the scroll source to avoid feedback loops
// without throttling user events (which caused the jerky feel)
let syncEnabled = false;
let syncSource: 'editor' | 'preview' | null = null;
let syncTimer = 0;

function claimSource(side: 'editor' | 'preview'): void {
  syncSource = side;
  clearTimeout(syncTimer);
  syncTimer = window.setTimeout(() => { syncSource = null; }, 150);
}

scrollBtn.addEventListener('click', () => {
  syncEnabled = !syncEnabled;
  scrollBtn.classList.toggle('active', syncEnabled);
});

editorView.scrollDOM.addEventListener('scroll', () => {
  if (!syncEnabled || syncSource === 'preview') return;
  claimSource('editor');
  const el = editorView.scrollDOM;
  const ratio = el.scrollTop / Math.max(1, el.scrollHeight - el.clientHeight);
  preview.scrollTop = ratio * Math.max(1, preview.scrollHeight - preview.clientHeight);
});

preview.addEventListener('scroll', () => {
  if (!syncEnabled || syncSource === 'editor') return;
  claimSource('preview');
  const el = editorView.scrollDOM;
  const ratio = preview.scrollTop / Math.max(1, preview.scrollHeight - preview.clientHeight);
  el.scrollTop = ratio * Math.max(1, el.scrollHeight - el.clientHeight);
});

let dragging = false;
const container = document.getElementById('panes') as HTMLElement;

divider.addEventListener('mousedown', () => { dragging = true; });

window.addEventListener('mousemove', (e: MouseEvent) => {
  if (!dragging) return;
  const rect = container.getBoundingClientRect();
  const ratio = ((e.clientX - rect.left) / rect.width) * 100;
  const clamped = Math.min(Math.max(ratio, 20), 80);
  container.style.gridTemplateColumns = `${clamped}% 4px 1fr`;
});

window.addEventListener('mouseup', () => { dragging = false; });

applyTheme();
applyFontSize();
wrapBtn.classList.add('active');
vimBtn.classList.toggle('active', vimEnabled);
// initialize mermaid after defer script has loaded
window.addEventListener('load', () => {
  getMermaid()?.initialize({ startOnLoad: false, theme: isDarkTheme(theme) ? 'dark' : 'default' });
});
render(tabGetActive()?.content ?? INITIAL);

// ── File System Access API ────────────────────────────────────────────────────

const openFileBtn = document.getElementById('open-file-btn') as HTMLButtonElement;
const openDirBtn = document.getElementById('open-dir-btn') as HTMLButtonElement;
const saveFileBtn = document.getElementById('save-file-btn') as HTMLButtonElement;
const openFileNameEl = document.getElementById('open-file-name') as HTMLElement;

// -- Open File -----------------------------------------------------------------

let fsaFileTimer = 0;

function openLocalFileFallback(): void {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.md,.markdown';
  input.onchange = async () => {
    const file = input.files?.[0];
    if (!file) return;
    const content = await file.text();
    const tab = tabCreate(file.name, content);
    tabSwitch(tab.id);
  };
  input.click();
}

async function openLocalFile(): Promise<void> {
  if (!('showOpenFilePicker' in window)) {
    openLocalFileFallback();
    return;
  }
  try {
    const [handle] = await (window as any).showOpenFilePicker({
      types: [{ description: 'Markdown', accept: { 'text/markdown': ['.md', '.markdown'] } }],
    }) as FileSystemFileHandle[];
    const file = await handle.getFile();
    const content = await file.text();
    const tab = tabCreate(file.name, content, handle);
    tabSwitch(tab.id);
  } catch { /* user cancelled */ }
}

async function saveLocalFile(): Promise<void> {
  const tab = tabGetActive();
  if (!tab?.fileHandle) return;
  const content = editorView.state.doc.toString();
  try {
    const writable = await (tab.fileHandle as any).createWritable();
    await writable.write(content);
    await writable.close();
    tab.savedContent = content;
    tabSaveContent(tab);
    tabRenderBar();
    saveFileBtn.textContent = 'Saved ✓';
    setTimeout(() => { saveFileBtn.textContent = 'Save'; }, 1500);
  } catch {
    // Safari doesn't support createWritable - fall back to download
    const blob = new Blob([content], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = tab.title;
    a.click();
    URL.revokeObjectURL(url);
  }
}

openFileBtn.addEventListener('click', openLocalFile);
saveFileBtn.addEventListener('click', saveLocalFile);

// Mod+S saves the open file
document.addEventListener('keydown', (e: KeyboardEvent) => {
  const tab = tabGetActive();
  if ((e.metaKey || e.ctrlKey) && e.key === 's' && tab?.fileHandle) {
    e.preventDefault();
    saveLocalFile();
  }
});

// -- Open Dir -----------------------------------------------------------------

interface FsaNode {
  name: string;
  path: string;
  handle?: FileSystemFileHandle;
  file?: File; // fallback when FSA directory picker isn't available
  children?: FsaNode[];
}

let fsaCurrentPath = '';
let fsaCurrentHandle: FileSystemFileHandle | null = null;
let fsaPollingTimer = 0;
let fsaNavHistory: string[] = [];
let fsaNavIdx = -1;
let fsaAllCollapsed = false;
let fsaSearchActive = false;
const fsaTree: FsaNode[] = [];

const fsaOverlay = document.getElementById('fsa-overlay') as HTMLElement;
const fsaDirName = document.getElementById('fsa-dir-name') as HTMLElement;
const fsaTreeEl = document.getElementById('fsa-tree') as HTMLElement;
const fsaProse = document.getElementById('fsa-prose') as HTMLElement;
const fsaScroll = document.getElementById('fsa-scroll') as HTMLElement;
const fsaCloseBtn = document.getElementById('fsa-close-btn') as HTMLButtonElement;
const fsaCollapseBtn = document.getElementById('fsa-collapse-btn') as HTMLButtonElement;
const fsaBackBtn = document.getElementById('fsa-back-btn') as HTMLButtonElement;
const fsaFwdBtn = document.getElementById('fsa-fwd-btn') as HTMLButtonElement;
const fsaBreadcrumb = document.getElementById('fsa-breadcrumb') as HTMLElement;
const fsaSearchBar = document.getElementById('fsa-search-bar') as HTMLElement;
const fsaSearchInput = document.getElementById('fsa-search-input') as HTMLInputElement;
const fsaSidebarResize = document.getElementById('fsa-sidebar-resize') as HTMLElement;
const fsaOverlayEl = document.getElementById('fsa-overlay') as HTMLElement;

async function buildFsaTree(dirHandle: FileSystemDirectoryHandle, base: string): Promise<FsaNode[]> {
  const dirs: FsaNode[] = [];
  const files: FsaNode[] = [];
  for await (const [name, handle] of (dirHandle as any).entries()) {
    if (name.startsWith('.')) continue;
    if (handle.kind === 'directory') {
      const children = await buildFsaTree(handle as FileSystemDirectoryHandle, base + name + '/');
      if (children.length) dirs.push({ name, path: base + name + '/', children });
    } else if (name.endsWith('.md') || name.endsWith('.markdown')) {
      files.push({ name, path: base + name, handle: handle as FileSystemFileHandle });
    }
  }
  dirs.sort((a, b) => a.name.localeCompare(b.name));
  files.sort((a, b) => a.name.localeCompare(b.name));
  return [...dirs, ...files];
}

function renderFsaTree(nodes: FsaNode[], depth: number): string {
  return nodes.map(node => {
    const indent = (depth * 14 + 8) + 'px';
    if (node.children) {
      return `<details><summary class="dir-label" style="padding-left:${indent}">${escHtmlInline(node.name)}</summary>`
        + `<div>${renderFsaTree(node.children, depth + 1)}</div></details>`;
    }
    const label = node.name.replace(/\.(md|markdown)$/, '');
    return `<div class="file-item" data-path="${escHtmlInline(node.path)}" style="padding-left:${indent}">${escHtmlInline(label)}</div>`;
  }).join('');
}

function escHtmlInline(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function findFsaNode(nodes: FsaNode[], path: string): FsaNode | null {
  for (const node of nodes) {
    if (node.path === path && (node.handle || node.file)) return node;
    if (node.children) {
      const found = findFsaNode(node.children, path);
      if (found) return found;
    }
  }
  return null;
}

function fsaSetActive(path: string): void {
  fsaTreeEl.querySelectorAll('.file-item').forEach(el => {
    (el as HTMLElement).classList.toggle('active', (el as HTMLElement).dataset['path'] === path);
  });
}

function fsaUpdateNavBtns(): void {
  fsaBackBtn.disabled = fsaNavIdx <= 0;
  fsaFwdBtn.disabled = fsaNavIdx >= fsaNavHistory.length - 1;
}

function fsaPushNav(path: string): void {
  if (fsaNavHistory[fsaNavIdx] === path) return;
  fsaNavHistory = fsaNavHistory.slice(0, fsaNavIdx + 1);
  fsaNavHistory.push(path);
  fsaNavIdx = fsaNavHistory.length - 1;
  fsaUpdateNavBtns();
}

function fsaUpdateBreadcrumb(path: string): void {
  const parts = path.split('/').filter(Boolean);
  fsaBreadcrumb.innerHTML = parts.map((part, i) => {
    const isLast = i === parts.length - 1;
    const label = isLast ? part.replace(/\.(md|markdown)$/, '') : part;
    return (i > 0 ? '<span class="bc-sep">›</span>' : '')
      + `<span class="bc-part${isLast ? ' bc-current' : ''}">${escHtmlInline(label)}</span>`;
  }).join('');
}

async function fsaLoadFile(path: string, push = true): Promise<void> {
  const node = findFsaNode(fsaTree, path);
  if (!node) return;
  fsaCurrentPath = path;
  fsaSetActive(path);
  if (push) fsaPushNav(path);
  fsaUpdateBreadcrumb(path);
  fsaScroll.scrollTop = 0;
  try {
    let content: string;
    if (node.handle) {
      fsaCurrentHandle = node.handle;
      const file = await node.handle.getFile();
      content = await file.text();
      fsaStartPolling(node.handle, file.lastModified);
    } else if (node.file) {
      fsaCurrentHandle = null;
      content = await node.file.text();
      clearInterval(fsaPollingTimer);
    } else {
      return;
    }
    const html = marked.parse(stripFrontmatter(content)) as string;
    fsaProse.innerHTML = html;
    document.title = path.split('/').pop()?.replace(/\.(md|markdown)$/, '') ?? 'Directory';
    const diagrams = Array.from(fsaProse.querySelectorAll('.mermaid'));
    if (diagrams.length) getMermaid()?.run({ nodes: diagrams });
  } catch {
    fsaProse.innerHTML = '<p style="color:var(--text-muted)">Could not load file</p>';
  }
}

function fsaStartPolling(handle: FileSystemFileHandle, initMod: number): void {
  clearInterval(fsaPollingTimer);
  let last = initMod;
  fsaPollingTimer = window.setInterval(async () => {
    if (handle !== fsaCurrentHandle) { clearInterval(fsaPollingTimer); return; }
    try {
      const file = await handle.getFile();
      if (file.lastModified !== last) {
        last = file.lastModified;
        await fsaLoadFile(fsaCurrentPath, false);
      }
    } catch { clearInterval(fsaPollingTimer); }
  }, 1500);
}

function fsaFilterTree(q: string): void {
  const lower = q.toLowerCase();
  fsaTreeEl.querySelectorAll<HTMLElement>('.file-item').forEach(el => {
    el.style.display = !lower || (el.textContent ?? '').toLowerCase().includes(lower) ? '' : 'none';
  });
  fsaTreeEl.querySelectorAll<HTMLElement>('details').forEach(det => {
    const hasVisible = Array.from(det.querySelectorAll<HTMLElement>('.file-item')).some(el => el.style.display !== 'none');
    det.style.display = hasVisible ? '' : 'none';
  });
}

function fsaOpenSearch(): void {
  fsaSearchActive = true;
  fsaSearchBar.style.display = '';
  fsaSearchInput.focus();
  fsaFilterTree('');
}

function fsaCloseSearch(): void {
  fsaSearchActive = false;
  fsaSearchBar.style.display = 'none';
  fsaSearchInput.value = '';
  fsaTreeEl.querySelectorAll<HTMLElement>('.file-item, details').forEach(el => { el.style.display = ''; });
}

function attachFsaHandlers(): void {
  fsaTreeEl.querySelectorAll<HTMLElement>('.file-item').forEach(el => {
    el.addEventListener('click', () => fsaLoadFile(el.dataset['path'] ?? ''));
  });
}

function buildFsaTreeFromFileList(fileList: FileList): FsaNode[] {
  const root: FsaNode[] = [];
  for (const file of Array.from(fileList)) {
    if (!file.name.match(/\.(md|markdown)$/i)) continue;
    // webkitRelativePath is "dirname/sub/file.md" - strip root dir name
    const parts = file.webkitRelativePath.split('/').slice(1);
    if (parts.length === 0) continue;
    let nodes = root;
    for (let i = 0; i < parts.length - 1; i++) {
      let dir = nodes.find(n => n.name === parts[i] && n.children);
      if (!dir) {
        dir = { name: parts[i], path: parts.slice(0, i + 1).join('/') + '/', children: [] };
        nodes.push(dir);
      }
      nodes = dir.children!;
    }
    nodes.push({ name: parts[parts.length - 1], path: parts.join('/'), file });
  }
  const sortNodes = (ns: FsaNode[]) => {
    ns.sort((a, b) => (a.children && !b.children ? -1 : !a.children && b.children ? 1 : a.name.localeCompare(b.name)));
    ns.forEach(n => { if (n.children) sortNodes(n.children); });
  };
  sortNodes(root);
  return root;
}

function openLocalDirFallback(): void {
  const input = document.createElement('input');
  input.type = 'file';
  (input as any).webkitdirectory = true;
  input.multiple = true;
  input.onchange = () => {
    const files = input.files;
    if (!files || files.length === 0) return;
    const dirName = files[0].webkitRelativePath.split('/')[0];
    const nodes = buildFsaTreeFromFileList(files);
    fsaTree.length = 0;
    fsaTree.push(...nodes);
    fsaDirName.textContent = dirName;
    fsaNavHistory = [];
    fsaNavIdx = -1;
    fsaUpdateNavBtns();
    fsaOverlay.classList.add('active');
    fsaTreeEl.innerHTML = renderFsaTree(nodes, 0);
    attachFsaHandlers();
    const first = findFirstFsaFile(nodes);
    if (first) fsaLoadFile(first);
  };
  input.click();
}

async function openLocalDir(): Promise<void> {
  if (!('showDirectoryPicker' in window)) {
    openLocalDirFallback();
    return;
  }
  try {
    const handle = await (window as any).showDirectoryPicker() as FileSystemDirectoryHandle;
    fsaNavHistory = [];
    fsaNavIdx = -1;
    fsaUpdateNavBtns();
    fsaDirName.textContent = handle.name;
    fsaTreeEl.innerHTML = '<p style="color:var(--text-muted);padding:12px;font-size:13px">Loading...</p>';
    fsaOverlay.classList.add('active');

    const nodes = await buildFsaTree(handle, '');
    fsaTree.length = 0;
    fsaTree.push(...nodes);

    fsaTreeEl.innerHTML = renderFsaTree(nodes, 0);
    attachFsaHandlers();

    const first = findFirstFsaFile(nodes);
    if (first) fsaLoadFile(first);
  } catch { /* user cancelled */ }
}

function findFirstFsaFile(nodes: FsaNode[]): string | null {
  for (const node of nodes) {
    if (node.handle || node.file) return node.path;
    if (node.children) {
      const found = findFirstFsaFile(node.children);
      if (found) return found;
    }
  }
  return null;
}

openDirBtn.addEventListener('click', openLocalDir);

fsaCloseBtn.addEventListener('click', () => {
  fsaOverlay.classList.remove('active');
  clearInterval(fsaPollingTimer);
  fsaCurrentHandle = null;
  fsaCurrentPath = '';
  document.title = 'Markdown Previewer';
});

fsaCollapseBtn.addEventListener('click', () => {
  fsaAllCollapsed = !fsaAllCollapsed;
  fsaTreeEl.querySelectorAll('details').forEach((d: Element) => { (d as HTMLDetailsElement).open = !fsaAllCollapsed; });
  fsaCollapseBtn.textContent = fsaAllCollapsed ? '+' : '−';
  fsaCollapseBtn.title = fsaAllCollapsed ? 'Expand all' : 'Collapse all';
});

fsaBackBtn.addEventListener('click', () => {
  if (fsaNavIdx > 0) { fsaNavIdx--; fsaLoadFile(fsaNavHistory[fsaNavIdx], false); fsaUpdateNavBtns(); }
});
fsaFwdBtn.addEventListener('click', () => {
  if (fsaNavIdx < fsaNavHistory.length - 1) { fsaNavIdx++; fsaLoadFile(fsaNavHistory[fsaNavIdx], false); fsaUpdateNavBtns(); }
});

// FSA overlay keyboard nav (j/k/h/l + / + Alt+← →)
fsaOverlay.addEventListener('keydown', (e: KeyboardEvent) => {
  if (document.activeElement === fsaSearchInput) {
    if (e.key === 'Escape') { e.preventDefault(); fsaCloseSearch(); }
    else if (e.key === 'Enter') {
      e.preventDefault();
      const first = fsaTreeEl.querySelector<HTMLElement>('.file-item:not([style*="none"])');
      if (first) fsaLoadFile(first.dataset['path'] ?? '');
    }
    return;
  }
  if (e.key === 'ArrowLeft' && e.altKey) { e.preventDefault(); fsaBackBtn.click(); return; }
  if (e.key === 'ArrowRight' && e.altKey) { e.preventDefault(); fsaFwdBtn.click(); return; }
  if (e.key === '/' && !fsaSearchActive) { e.preventDefault(); fsaOpenSearch(); return; }
  if (e.key === 'c') { e.preventDefault(); fsaCollapseBtn.click(); return; }
  if (e.key === 'Escape') { e.preventDefault(); fsaCloseBtn.click(); return; }
});

fsaSearchInput.addEventListener('input', () => fsaFilterTree(fsaSearchInput.value));

// FSA sidebar resize
let fsaResizing = false;
fsaSidebarResize.addEventListener('mousedown', () => { fsaResizing = true; });
window.addEventListener('mousemove', (e: MouseEvent) => {
  if (!fsaResizing) return;
  const rect = fsaOverlayEl.getBoundingClientRect();
  const w = Math.min(Math.max(e.clientX - rect.left, 160), 500);
  fsaOverlayEl.style.gridTemplateColumns = `${w}px 4px 1fr`;
});
window.addEventListener('mouseup', () => { fsaResizing = false; });
