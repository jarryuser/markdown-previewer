import { marked } from 'marked';
import markedKatex from 'marked-katex-extension';
import hljs from 'highlight.js';
import { EditorView, keymap } from '@codemirror/view';
import { Compartment, EditorSelection, Prec } from '@codemirror/state';
import { basicSetup } from 'codemirror';
import { markdown } from '@codemirror/lang-markdown';
import { oneDark } from '@codemirror/theme-one-dark';
import { vim } from '@replit/codemirror-vim';
import styles from './style.css?raw';

// KaTeX for math: $inline$ and $$block$$ syntax
marked.use(markedKatex({ throwOnError: false }));

// marked v5+ removed the `highlight` option - use a custom renderer instead
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
const divider = document.getElementById('divider') as HTMLElement;
const editorContainer = document.getElementById('editor') as HTMLElement;

const STORAGE_KEY = 'md-content';
const FONT_SIZE_KEY = 'md-font-size';
const VIM_KEY = 'md-vim';

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

// maps local://N placeholders to blob URLs so dropped images stay short in the editor
const imageStore = new Map<string, string>();
let imageId = 0;

function render(md: string): void {
  // replace local:// placeholders with actual blob URLs before parsing
  const resolved = md.replace(/\(local:\/\/(\d+)\)/g, (match, id) => {
    const url = imageStore.get(`local://${id}`);
    return url ? `(${url})` : match;
  });

  // marked.parse returns string | Promise<string>; renderer is sync so cast is safe
  preview.innerHTML = marked.parse(resolved) as string;

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
let dark = window.matchMedia('(prefers-color-scheme: dark)').matches;
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
    themeCompartment.of(dark ? oneDark : []),
    wrapCompartment.of(EditorView.lineWrapping),
    vimCompartment.of(vimEnabled ? vim() : []),
    // Prec.highest ensures our keys take priority over defaultKeymap in basicSetup
    // (e.g. Mod-i is bound to selectLine there)
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
        const snippets = files.map(file => {
          const id = `local://${imageId++}`;
          imageStore.set(id, URL.createObjectURL(file));
          const alt = file.name.replace(/\.[^.]+$/, '');
          return `![${alt}](${id})`;
        });
        editorView.dispatch(editorView.state.replaceSelection(snippets.join('\n')));
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
  document.documentElement.dataset['theme'] = dark ? 'dark' : 'light';
  themeBtn.textContent = dark ? 'Light' : 'Dark';
  editorView.dispatch({
    effects: themeCompartment.reconfigure(dark ? oneDark : []),
  });
}

themeBtn.addEventListener('click', () => {
  dark = !dark;
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
render(localStorage.getItem(STORAGE_KEY) ?? INITIAL);
