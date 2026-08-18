# Contributing to Markdown Previewer

Thanks for taking the time to contribute! This document describes how to set up the project locally and what to keep in mind when sending changes.

## Ways to contribute

- **Report a bug** - open an issue with a clear title, steps to reproduce, expected vs. actual behavior, and your environment (OS, Node version, terminal, tmux, browser, etc.).
- **Request a feature** - describe the problem you are trying to solve and a concrete example of how the feature would work.
- **Submit code** - see [Workflow](#workflow) below.
- **Translate** - the READMEs live in `README.de.md`, `README.uk.md`, `README.sk.md` and `README.ru.md`. Keep all of them in sync when a new feature is documented in `README.md`.

## Development setup

Requirements: **Node.js 20+** and npm.

```bash
# 1. clone the repo
git clone https://github.com/jarryuser/markdown-previewer.git
cd markdown-previewer

# 2. install dependencies
npm install
```

### Web app

```bash
npm run dev        # start the Vite dev server (edit in src/main.ts)
npm run build      # typecheck (tsc) + production build into dist/
```

### CLI (`mdp`)

```bash
npm run build:cli  # bundle the CLI into dist/cli.js
npm link           # register `mdp` globally (one-time)
mdp README.md      # test it on a real file
```

The CLI entry point is `src/cli.ts`; PDF export lives in `src/cli-pdf.ts`. Rebuild after every change to `src/cli.ts` and re-test with `mdp`.

### Deployment

Pushing to `main` automatically deploys the web app to GitHub Pages via `.github/workflows/deploy.yml` (it runs `npm ci && npm run build` and uploads `dist/`). Make sure a build passes locally before pushing.

## Project structure

```
src/
  main.ts        web app (CodeMirror editor + preview, toolbar, all features)
  cli.ts         CLI: HTTP server, ANSI/TUI renderers, --pdf/--watch/--live
  cli-pdf.ts     headless-Chrome PDF export with atomic writes
  pdf.ts         in-browser PDF preview/download (html2canvas + jsPDF)
  emoji.ts       GitHub-style emoji shortcodes (:smile: -> 😄)
  style.css      preview styles, shared by the web app and the CLI
```

## Code style

- TypeScript, ESM (`"type": "module"`), following the conventions in the file you are editing.
- Keep changes focused and minimal; avoid reformatting unrelated code.
- In `cli.ts` there are two renderers (ANSI terminal + blessed TUI) with mirrored renderers - when you change Markdown output behavior, update both.
- The PDF export (`cli-pdf.ts`) relies on a headless browser being present or `MDP_CHROME_PATH` pointing at a Chrome/Chromium/Edge executable - keep the fallback error messages helpful.
- There is currently no lint or test suite configured. Use `npm run build` as the type check / sanity gate.

## Workflow

1. Create a branch with a descriptive name (e.g. `feat/table-of-contents`, `fix/tui-crash-on-emoji`).
2. Make focused commits. This repo uses **Conventional Commits**:

   ```
   feat(cli): add --pdf export
   fix(web): prevent toolbar overflow on small screens
   docs: clarify --live behavior
   ```

3. Push the branch and open a pull request against `main`. In the PR description, explain what changed and why, and mention any manual testing you did.
4. Expect feedback; address review comments in follow-up commits.