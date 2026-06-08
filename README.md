<div align="center">

# Markdown Previewer

**A minimal split-view Markdown editor with live preview, syntax highlighting, and a CLI that opens any `.md` file in the browser**

[![Live Demo](https://img.shields.io/badge/Live%20Demo-→-2f81f7?style=flat-square)](https://jarryuser.github.io/markdown-previewer/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite-5.1-646CFF?style=flat-square&logo=vite&logoColor=white)](https://vitejs.dev/)
[![marked](https://img.shields.io/badge/marked-12-orange?style=flat-square)](https://marked.js.org/)
[![highlight.js](https://img.shields.io/badge/highlight.js-11-yellow?style=flat-square)](https://highlightjs.org/)
[![GitHub Pages](https://img.shields.io/badge/Deployed%20on-GitHub%20Pages-222?style=flat-square&logo=github)](https://pages.github.com/)

</div>

---

## Overview

Markdown Previewer is a browser-based editor with a split-pane layout. Write Markdown on the left, see the rendered result on the right in real time. The output matches GitHub's rendering: GFM tables, task lists with custom checkboxes, and syntax-highlighted code blocks.

The project also ships a small CLI (`mdp`) that renders any local `.md` file in the browser with the same styles and live-reloads the page whenever the file is saved

---

## Features

| | Feature | Details |
|---|---|---|
| ⚡ | **Live preview** | Re-renders 60 ms after the last keystroke |
| ✏️ | **CodeMirror editor** | Markdown syntax highlighting, line numbers, dark/light theme |
| 🎨 | **Syntax highlighting** | highlight.js with 100+ languages; auto-detected when no language is specified |
| 🔄 | **Synchronized scrolling** | Sync button links editor and preview scroll positions smoothly |
| ↩️ | **Word wrap toggle** | Wrap button switches between wrapping and horizontal scroll; scroll position is preserved |
| 📤 | **Export as HTML** | Downloads the rendered preview as a standalone `.html` file; prompts for a custom filename |
| ⌨️ | **Formatting shortcuts** | `Mod+B` bold, `Mod+I` italic, `Mod+K` link, `Mod+Shift+C` inline code; press again to remove |
| 🔡 | **Adjustable font size** | A− / A+ buttons in the toolbar; persists across reloads |
| ⛶ | **Fullscreen mode** | Full button expands the app to fill the screen |
| 🔡 | **Vim keybindings** | Vim button toggles modal editing; Normal / Insert / Visual modes with status bar |
| ∑ | **Math support** | KaTeX renders `$inline$` and `$$block$$` formulas |
| 💾 | **Persistent content** | Editor content is saved to localStorage and restored on reload |
| ✅ | **GitHub-style task lists** | Custom checkboxes, no bullet points - matches GitHub's rendering |
| 🖼️ | **Image drag & drop / paste** | Drop an image onto the editor or paste with `Ctrl+V` to insert it; stored as a short `local://N` reference, not base64 |
| ↔️ | **Resizable panes** | Drag the divider; ratio is clamped between 20% and 80% |
| 📊 | **Word & character counter** | Updates live in the toolbar |
| 📋 | **Copy to clipboard** | Copies raw Markdown with one click |
| 🌙 | **Custom themes** | Light, Dark, Sepia and Nord; Theme button cycles between them and the choice persists across reloads |
| 🖨️ | **Print / PDF export** | Print button opens the browser print dialog with print-friendly styles that show only the rendered preview |
| ⌨️ | **Tab key** | Inserts two spaces instead of moving focus |
| 📄 | **GitHub Flavored Markdown** | Tables, strikethrough, task lists, autolinks |
| 🔍 | **Find & replace** | Toolbar button or `Mod+F` opens CodeMirror's search panel |
| 📑 | **Table of contents** | TOC button shows a sidebar with clickable headings |
| 📐 | **Mermaid diagrams** | ` ```mermaid ` code blocks rendered as diagrams; theme-aware |
| 📂 | **Open local file / directory** | File System Access API; live-reload on external edits; `Mod+S` to save |

---

## CLI - `mdp`

`mdp` works in two modes:

- **File mode** — opens a single `.md` file; page live-reloads on every save
- **Directory mode** — opens a directory with a file tree sidebar; click any file to preview it; reloads when the current file changes

Images referenced with relative paths are served automatically

### Install

```bash
# 1. clone the repo
git clone https://github.com/jarryuser/markdown-previewer.git
cd markdown-previewer

# 2. install dependencies
npm install

# 3. build the CLI bundle
npm run build:cli

# 4. register the command globally
npm link
```

### Usage

```bash
# single file
mdp README.md
mdp ~/notes/ideas.md

# entire directory (Obsidian vault, notes folder, etc.)
mdp ~/notes/
mdp ./docs/

# specify a fixed port
mdp README.md --port 3000

# show recent files (numbered list)
mdp

# reopen entry #2 from the recent list
mdp 2

# render to terminal with ANSI colors (stdout, no browser)
mdp README.md -t
mdp README.md --terminal

# interactive TUI: split-pane in the terminal
mdp README.md --tui
mdp ~/notes/ --tui
```

The browser opens automatically. Edit files in any editor - the page reloads on each save

In directory mode, press `/` to filter the file tree by name, `j`/`k` to navigate, and `c` to collapse or expand all folders

### TUI mode

`--tui` opens a full-screen terminal interface instead of the browser. The HTTP server still starts in the background, so pressing `b` opens the current file in the browser at any time

| Key | Action |
|---|---|
| `j` / `k` | scroll preview or navigate tree |
| `Tab` | switch focus between tree and preview |
| `l` / `Enter` | open file or expand folder |
| `h` | collapse folder or jump to parent |
| `/` | search files by name |
| `b` | open current file in browser |
| `q` / `Ctrl+C` | quit |

### Uninstall

```bash
npm unlink -g markdown-previewer
```

---

## Getting started (web app)

```bash
git clone https://github.com/jarryuser/markdown-previewer.git
cd markdown-previewer
npm install
npm run dev       # http://localhost:5173
npm run build     # production build -> dist/
```

---

## Tech stack

| Layer | Tool | Why |
|---|---|---|
| Language | TypeScript 5.3 | Type safety, strict mode enabled |
| Markdown | marked.js v12 | Fast GFM parser with a clean extension API |
| Highlighting | highlight.js v11 | 100+ languages, works in both browser and Node |
| Bundler | Vite 5 | Instant HMR in dev, separate lib build for the CLI |
| Deploy | GitHub Pages via Actions | Auto-deploys on push to `main` |

---

## Roadmap

- [x] **CLI viewer** (`mdp`) - opens any `.md` file in the browser with live reload; local images are served from the file's directory
- [x] **Image drag & drop** - drop images onto the editor; inserted as short `local://N` placeholders instead of base64
- [x] **GitHub-style task lists** - custom checkboxes with no bullet points, matching GitHub's rendering
- [x] **Syntax highlighting in the editor** - CodeMirror 6 with Markdown language support and dark/light theme
- [x] **Synchronized scrolling** - Sync button in toolbar keeps editor and preview scroll positions in sync
- [x] **Persist content in localStorage** - content survives page refreshes automatically
- [x] **Word wrap toggle** - Wrap button switches line wrapping on/off; scroll position is restored after layout change
- [x] **Export as HTML** - downloads the rendered preview as a standalone file with all styles embedded
- [x] **Formatting shortcuts** - `Mod+B` bold, `Mod+I` italic, `Mod+K` link, `Mod+Shift+C` inline code; press again to remove
- [x] **Custom export filename** - prompts to edit the filename before downloading
- [x] **Adjustable font size** - A− / A+ buttons; persists in localStorage
- [x] **Fullscreen mode** - Full button expands the app to fill the screen
- [x] **Vim keybindings** - Vim button toggles modal editing with Normal / Insert / Visual modes and status bar
- [x] **Math support** - KaTeX renders `$inline$` and `$$block$$` formulas in the preview
- [x] **Directory mode** - `mdp ./notes/` opens a directory with a file tree sidebar; click any `.md` file to preview; live reload on save
- [x] **Find & replace** - Find button and `Mod+F` open CodeMirror's built-in search and replace panel
- [x] **Table of contents** - TOC button shows a sidebar panel with clickable headings that scroll the preview
- [x] **Mermaid diagrams** - ` ```mermaid ` code blocks are rendered as diagrams via mermaid.js; theme follows light/dark mode
- [x] **`--port` flag** - specify a fixed port: `mdp README.md --port 3000`
- [x] **Recent files** - `mdp` with no arguments shows a numbered list of recently opened files; `mdp 2` reopens entry #2
- [x] **Search in file tree** - press `/` to filter files by name; `↑`/`↓` to navigate results; `Enter` to open; `Escape` to close
- [x] **Wikilinks** - `[[filename]]` and `[[filename|alias]]` links in directory mode navigate between files in the vault
- [x] **Open local file (FSA)** - Open File button loads any `.md` file directly into the editor; page auto-reloads when the file is saved externally; `Mod+S` saves changes back to disk
- [x] **Open local directory (FSA)** - Open Dir button opens a folder using the File System Access API; full file tree sidebar, click any file to preview
- [x] **Back / forward navigation** - browser-style history in the FSA directory overlay; `Alt+←` / `Alt+→` or the arrow buttons navigate between viewed files
- [x] **Resizable sidebar** - drag the handle between sidebar and content to resize; works in both the FSA overlay and CLI directory mode
- [x] **Breadcrumb** - the current file path is shown above the preview in directory mode; each segment is a clickable link
- [x] **Terminal output** (`-t` / `--terminal`) - renders any `.md` file to stdout with ANSI colors; headings, bold, italic, code blocks, tables; pipeable to `less`
- [x] **TUI mode** (`--tui`) - interactive split-pane in the terminal; file tree on the left, preview on the right; j/k navigation, `/` search, `b` to open in browser; auto-refreshes on file save
- [x] **Image paste from clipboard** - paste images with `Ctrl+V`, stored the same way as drag & drop
- [x] **Print / PDF export** - Print button opens the browser print dialog with print-friendly CSS that hides the editor and keeps only the prose
- [x] **Custom themes** - Light, Dark, Sepia and Nord color schemes; Theme button cycles between them and the choice persists across reloads

---

## License

MIT © [Dmytro Filiurskyi](https://github.com/jarryuser)
