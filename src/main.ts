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

const editorView = new EditorView({
  doc: localStorage.getItem(STORAGE_KEY) ?? INITIAL,
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
      localStorage.setItem(STORAGE_KEY, content);
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
    localStorage.removeItem(STORAGE_KEY);
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
render(localStorage.getItem(STORAGE_KEY) ?? INITIAL);

// ── File System Access API ────────────────────────────────────────────────────

const openFileBtn = document.getElementById('open-file-btn') as HTMLButtonElement;
const openDirBtn = document.getElementById('open-dir-btn') as HTMLButtonElement;
const saveFileBtn = document.getElementById('save-file-btn') as HTMLButtonElement;
const openFileNameEl = document.getElementById('open-file-name') as HTMLElement;

// -- Open File -----------------------------------------------------------------

let fsaFileHandle: FileSystemFileHandle | null = null;
let fsaFileTimer = 0;

function openLocalFileFallback(): void {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.md,.markdown';
  input.onchange = async () => {
    const file = input.files?.[0];
    if (!file) return;
    const content = await file.text();
    editorView.dispatch({ changes: { from: 0, to: editorView.state.doc.length, insert: content } });
    localStorage.setItem(STORAGE_KEY, content);
    openFileNameEl.textContent = file.name;
    openFileNameEl.style.display = '';
    // can't save back without FSA handle
    saveFileBtn.style.display = 'none';
    clearInterval(fsaFileTimer);
    fsaFileHandle = null;
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
    fsaFileHandle = handle;
    const file = await handle.getFile();
    const content = await file.text();
    editorView.dispatch({ changes: { from: 0, to: editorView.state.doc.length, insert: content } });
    localStorage.setItem(STORAGE_KEY, content);
    openFileNameEl.textContent = file.name;
    openFileNameEl.style.display = '';
    saveFileBtn.style.display = '';
    startFsaFilePolling(handle, file.lastModified);
  } catch { /* user cancelled */ }
}

function startFsaFilePolling(handle: FileSystemFileHandle, initMod: number): void {
  clearInterval(fsaFileTimer);
  let last = initMod;
  fsaFileTimer = window.setInterval(async () => {
    try {
      const file = await handle.getFile();
      if (file.lastModified !== last) {
        last = file.lastModified;
        const content = await file.text();
        if (content !== editorView.state.doc.toString()) {
          editorView.dispatch({ changes: { from: 0, to: editorView.state.doc.length, insert: content } });
        }
      }
    } catch { clearInterval(fsaFileTimer); }
  }, 1500);
}

async function saveLocalFile(): Promise<void> {
  if (!fsaFileHandle) return;
  const content = editorView.state.doc.toString();
  try {
    const writable = await (fsaFileHandle as any).createWritable();
    await writable.write(content);
    await writable.close();
    saveFileBtn.textContent = 'Saved ✓';
    setTimeout(() => { saveFileBtn.textContent = 'Save'; }, 1500);
  } catch {
    // Safari doesn't support createWritable - fall back to download
    const blob = new Blob([content], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = openFileNameEl.textContent || 'document.md';
    a.click();
    URL.revokeObjectURL(url);
  }
}

openFileBtn.addEventListener('click', openLocalFile);
saveFileBtn.addEventListener('click', saveLocalFile);

// Mod+S saves the open file
document.addEventListener('keydown', (e: KeyboardEvent) => {
  if ((e.metaKey || e.ctrlKey) && e.key === 's' && fsaFileHandle) {
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
