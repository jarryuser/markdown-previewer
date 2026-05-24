import { marked } from 'marked';
import hljs from 'highlight.js';

// marked v5+ removed the `highlight` option - use a custom renderer instead
marked.use({
  gfm: true,
  breaks: false, // match GitHub behaviour: single \n = space, not <br>
  renderer: {
    code(code: string, lang: string | undefined): string {
      if (lang && hljs.getLanguage(lang)) {
        const highlighted = hljs.highlight(code, { language: lang }).value;
        return `<pre><code class="hljs language-${lang}">${highlighted}</code></pre>`;
      }
      const highlighted = hljs.highlightAuto(code).value;
      return `<pre><code class="hljs">${highlighted}</code></pre>`;
    },
  },
});

const editor = document.getElementById('editor') as HTMLTextAreaElement;
const preview = document.getElementById('preview') as HTMLElement;
const wordCount = document.getElementById('word-count') as HTMLElement;
const charCount = document.getElementById('char-count') as HTMLElement;
const copyBtn = document.getElementById('copy-btn') as HTMLButtonElement;
const clearBtn = document.getElementById('clear-btn') as HTMLButtonElement;
const themeBtn = document.getElementById('theme-btn') as HTMLButtonElement;
const divider = document.getElementById('divider') as HTMLElement;

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

// re-render 60ms after the last keystroke
let debounceTimer = 0;
editor.addEventListener('input', () => {
  clearTimeout(debounceTimer);
  debounceTimer = window.setTimeout(() => render(editor.value), 60);
});

// insert two spaces on Tab instead of losing focus
editor.addEventListener('keydown', (e: KeyboardEvent) => {
  if (e.key !== 'Tab') return;
  e.preventDefault();
  const start = editor.selectionStart;
  const end = editor.selectionEnd;
  editor.value = editor.value.slice(0, start) + '  ' + editor.value.slice(end);
  editor.selectionStart = editor.selectionEnd = start + 2;
  render(editor.value);
});

// drag & drop images - stores a blob URL and inserts a short local:// placeholder
editor.addEventListener('dragover', (e: DragEvent) => {
  if (!e.dataTransfer?.types.includes('Files')) return;
  e.preventDefault();
  editor.classList.add('drag-over');
});

editor.addEventListener('dragleave', () => {
  editor.classList.remove('drag-over');
});

editor.addEventListener('drop', (e: DragEvent) => {
  e.preventDefault();
  editor.classList.remove('drag-over');

  const files = Array.from(e.dataTransfer?.files ?? []).filter(f => f.type.startsWith('image/'));
  if (files.length === 0) return;

  let pos = editor.selectionStart;

  for (const file of files) {
    const id = `local://${imageId++}`;
    imageStore.set(id, URL.createObjectURL(file));

    const alt = file.name.replace(/\.[^.]+$/, '');
    const snippet = `![${alt}](${id})`;
    editor.value = editor.value.slice(0, pos) + snippet + editor.value.slice(pos);
    pos += snippet.length;
  }

  editor.selectionStart = editor.selectionEnd = pos;
  render(editor.value);
});

copyBtn.addEventListener('click', async () => {
  await navigator.clipboard.writeText(editor.value);
  copyBtn.textContent = 'Copied!';
  setTimeout(() => (copyBtn.textContent = 'Copy MD'), 1500);
});

clearBtn.addEventListener('click', () => {
  if (editor.value && confirm('Clear editor?')) {
    editor.value = '';
    render('');
  }
});

let dark = window.matchMedia('(prefers-color-scheme: dark)').matches;

function applyTheme(): void {
  document.documentElement.dataset['theme'] = dark ? 'dark' : 'light';
  themeBtn.textContent = dark ? 'Light' : 'Dark';
}

themeBtn.addEventListener('click', () => {
  dark = !dark;
  applyTheme();
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

editor.value = INITIAL;
applyTheme();
render(INITIAL);
