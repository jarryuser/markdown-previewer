# Markdown Previewer

A minimal split-view Markdown editor with live preview, syntax highlighting, and light/dark theme

**[Live demo →](https://jarryuser.github.io/markdown-previewer/)**

## Features

- Live preview with 60ms debounce — renders as you type
- Syntax highlighting via highlight.js (100+ languages)
- Drag the divider to resize editor and preview panes
- Word and character counter
- Copy Markdown to clipboard
- Light / dark theme toggle
- Tab key inserts spaces instead of leaving the textarea
- GitHub Flavored Markdown (tables, strikethrough, task lists)
- Zero runtime dependencies beyond marked + highlight.js

## Roadmap

- [ ] Syntax highlighting in the editor (replace textarea with CodeMirror)
- [ ] Synchronized scrolling between editor and preview (with toggle)
- [ ] Persist content in localStorage between sessions
- [ ] Export preview as HTML file
- [ ] Keyboard shortcuts for formatting (Ctrl+B, Ctrl+I, etc.)
- [ ] Math support via KaTeX
- [ ] Adjustable font size in the editor
- [ ] Fullscreen mode for either pane

## Stack

<table>
  <tr><td>Language</td><td>TypeScript</td></tr>
  <tr><td>Markdown</td><td>marked.js v12</td></tr>
  <tr><td>Highlighting</td><td>highlight.js v11</td></tr>
  <tr><td>Bundler</td><td>Vite</td></tr>
  <tr><td>Deploy</td><td>GitHub Pages</td></tr>
</table>

## Local development

```bash
npm install
npm run dev    # http://localhost:5173
npm run build  # production build -> dist/
```

## License

MIT
