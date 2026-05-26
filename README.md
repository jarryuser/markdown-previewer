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
| 📤 | **Export as HTML** | Downloads the rendered preview as a standalone `.html` file with all styles embedded |
| ⌨️ | **Formatting shortcuts** | `Mod+B` bold, `Mod+I` italic, `Mod+K` link, `Mod+Shift+C` inline code |
| 💾 | **Persistent content** | Editor content is saved to localStorage and restored on reload |
| ✅ | **GitHub-style task lists** | Custom checkboxes, no bullet points - matches GitHub's rendering |
| 🖼️ | **Image drag & drop** | Drop an image onto the editor to insert it; stored as a short `local://N` reference, not base64 |
| ↔️ | **Resizable panes** | Drag the divider; ratio is clamped between 20% and 80% |
| 📊 | **Word & character counter** | Updates live in the toolbar |
| 📋 | **Copy to clipboard** | Copies raw Markdown with one click |
| 🌙 | **Light / dark theme** | Follows system preference by default; toggle in the toolbar |
| ⌨️ | **Tab key** | Inserts two spaces instead of moving focus |
| 📄 | **GitHub Flavored Markdown** | Tables, strikethrough, task lists, autolinks |

---

## CLI - `mdp`

`mdp` opens any Markdown file in the browser using the same styles as the web app. The page live-reloads every time the file is saved. Images referenced with relative paths are served automatically from the file's directory

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
mdp README.md
mdp ~/notes/ideas.md
mdp /path/to/any/file.md
```

The browser opens automatically. Edit the file in any editor - the page reloads on each save

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

### Done

- [x] **CLI viewer** (`mdp`) - opens any `.md` file in the browser with live reload; local images are served from the file's directory
- [x] **Image drag & drop** - drop images onto the editor; inserted as short `local://N` placeholders instead of base64
- [x] **GitHub-style task lists** - custom checkboxes with no bullet points, matching GitHub's rendering
- [x] **Syntax highlighting in the editor** - CodeMirror 6 with Markdown language support and dark/light theme
- [x] **Synchronized scrolling** - Sync button in toolbar keeps editor and preview scroll positions in sync
- [x] **Persist content in localStorage** - content survives page refreshes automatically
- [x] **Word wrap toggle** - Wrap button switches line wrapping on/off; scroll position is restored after layout change
- [x] **Export as HTML** - downloads the rendered preview as a standalone file with all styles embedded
- [x] **Formatting shortcuts** - `Mod+B` bold, `Mod+I` italic, `Mod+K` link, `Mod+Shift+C` inline code

### Planned

- [ ] **Vim / Neovim keybindings** - optional modal editing mode via CodeMirror's vim extension
- [ ] **Custom export filename** - prompt to edit the filename before the HTML file is downloaded
- [ ] **Math support** - render formulas via KaTeX
- [ ] **Adjustable font size** - slider or buttons in the toolbar
- [ ] **Fullscreen mode** - expand either pane to fill the screen

---

## License

MIT © [Dmytro Filiurskyi](https://github.com/jarryuser)
