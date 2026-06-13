<div align="center">

# Markdown Previewer

**Ein minimalistischer Split-View-Markdown-Editor mit Live-Vorschau, Syntax-Highlighting und einer CLI, die jede `.md`-Datei im Browser öffnet**

[![Live Demo](https://img.shields.io/badge/Live%20Demo-→-2f81f7?style=flat-square)](https://jarryuser.github.io/markdown-previewer/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite-5.1-646CFF?style=flat-square&logo=vite&logoColor=white)](https://vitejs.dev/)
[![marked](https://img.shields.io/badge/marked-12-orange?style=flat-square)](https://marked.js.org/)
[![highlight.js](https://img.shields.io/badge/highlight.js-11-yellow?style=flat-square)](https://highlightjs.org/)
[![GitHub Pages](https://img.shields.io/badge/Deployed%20on-GitHub%20Pages-222?style=flat-square&logo=github)](https://pages.github.com/)

[English](README.md) · [Українська](README.uk.md) · [Slovenčina](README.sk.md) · **Deutsch** · [Русский](README.ru.md)


</div>


---

## Übersicht

Markdown Previewer ist ein browserbasierter Editor mit einem geteilten Fensterlayout. Schreiben Sie Markdown auf der linken Seite und sehen Sie das gerenderte Ergebnis in Echtzeit auf der rechten Seite. Die Ausgabe entspricht dem GitHub-Rendering: GFM-Tabellen, Aufgabenlisten mit benutzerdefinierten Kontrollkästchen und Syntax-hervorgehobene Codeblöcke.

Das Projekt enthält auch eine kleine CLI (`mdp`), die jede lokale `.md`-Datei mit denselben Stilen im Browser rendert und die Seite bei jedem Speichern der Datei automatisch neu lädt.

---

## Funktionen

| | Funktion | Details |
|---|---|---|
| ⚡ | **Live-Vorschau** | Wird 60 ms nach dem letzten Tastendruck neu gerendert |
| ✏️ | **CodeMirror-Editor** | Markdown-Syntax-Highlighting, Zeilennummern, dunkles/helles Thema |
| 🎨 | **Syntax-Highlighting** | highlight.js mit über 100 Sprachen; automatische Erkennung, wenn keine Sprache angegeben ist |
| 🔄 | **Synchronisiertes Scrollen** | Der Sync-Button verbindet Editor- und Vorschau-Scrollpositionen nahtlos |
| ↩️ | **Zeilenumbruch umschalten** | Der Wrap-Button wechselt zwischen Zeilenumbruch und horizontalem Scrollen; die Scrollposition bleibt erhalten |
| 📤 | **Als HTML exportieren** | Lädt die gerenderte Vorschau als eigenständige `.html`-Datei herunter; fragt nach einem benutzerdefinierten Dateinamen |
| ⌨️ | **Formatierungs-Kürzel** | `Mod+B` fett, `Mod+I` kursiv, `Mod+K` Link, `Mod+Shift+C` Inline-Code; erneutes Drücken entfernt die Formatierung |
| 🔡 | **Einstellbare Schriftgröße** | A− / A+-Buttons in der Symbolleiste; bleibt nach Neuladen erhalten |
| ⛶ | **Vollbildmodus** | Der Vollbild-Button erweitert die App auf den gesamten Bildschirm |
| 🔡 | **Vim-Tastenkürzel** | Der Vim-Button schaltet zwischen den Bearbeitungsmodi um; Normal-/Einfüge-/Visuell-Modus mit Statusleiste |
| ∑ | **Mathe-Unterstützung** | KaTeX rendert `$inline$`- und `$$block$$`-Formeln |
| 💾 | **Inhalte speichern** | Editor-Inhalte werden in localStorage gespeichert und beim Neuladen wiederhergestellt |
| ✅ | **GitHub-ähnliche Aufgabenlisten** | Benutzerdefinierte Kontrollkästchen, keine Aufzählungspunkte – entspricht dem GitHub-Rendering |
| 🖼️ | **Bilder per Drag & Drop / Einfügen** | Ziehen Sie ein Bild auf den Editor oder fügen Sie es mit `Strg+V` ein; wird als kurzer `local://N`-Verweis gespeichert, nicht als Base64 |
| ↔️ | **Größenverstellbare Bereiche** | Ziehen Sie den Teiler; das Verhältnis ist zwischen 20 % und 80 % begrenzt |
| 📊 | **Wort- & Zeichenzähler** | Aktualisiert live in der Symbolleiste |
| 📋 | **In die Zwischenablage kopieren** | Kopiert rohes Markdown mit einem Klick |
| 🌙 | **Benutzerdefinierte Themen** | Hell, Dunkel, Sepia und Nord; der Themen-Button schaltet zwischen ihnen um und die Auswahl bleibt nach Neuladen erhalten |
| 🖨️ | **Drucken / PDF-Export** | Der Druck-Button öffnet den Druckdialog des Browsers mit druckfreundlichen Stilen, die nur die gerenderte Vorschau zeigen |
| ⌨️ | **Tabulatortaste** | Fügt zwei Leerzeichen ein, anstatt den Fokus zu verschieben |
| 📄 | **GitHub Flavored Markdown** | Tabellen, Durchgestrichenes, Aufgabenlisten, Autolinks |
| 🔍 | **Suchen & Ersetzen** | Symbolleisten-Button oder `Mod+F` öffnet das Suchfeld von CodeMirror |
| 📑 | **Inhaltsverzeichnis** | Der TOC-Button zeigt eine Seitenleiste mit anklickbaren Überschriften |
| 📐 | **Mermaid-Diagramme** | ` ```mermaid `-Codeblöcke werden als Diagramme gerendert; themenbewusst |
| 📂 | **Lokale Datei / Verzeichnis öffnen** | File System Access API; Live-Neuladen bei externen Bearbeitungen; `Mod+S` zum Speichern |

---

## CLI – `mdp`

`mdp` arbeitet in zwei Modi:

- **Datei-Modus** – öffnet eine einzelne `.md`-Datei; die Seite wird bei jedem Speichern neu geladen
- **Verzeichnis-Modus** – öffnet ein Verzeichnis mit einer Dateibaum-Seitenleiste; klicken Sie auf eine beliebige Datei, um eine Vorschau anzuzeigen; wird neu geladen, wenn sich die aktuelle Datei ändert

Bilder, die mit relativen Pfaden referenziert werden, werden automatisch bereitgestellt.

### Installation

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

### Verwendung

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

# pick a color scheme for terminal/TUI output (dark, light, sepia, nord)
mdp README.md -t --theme nord
mdp ~/notes/ --tui --theme sepia
```

Der Browser öffnet sich automatisch. Bearbeiten Sie Dateien in einem beliebigen Editor – die Seite wird bei jedem Speichern neu geladen.

Im Verzeichnis-Modus drücken Sie `/`, um die Dateibaum nach Namen zu filtern, `j`/`k` zum Navigieren und `c`, um alle Ordner zuzuklappen oder aufzuklappen.

### TUI-Modus

`--tui` öffnet eine Vollbild-Terminaloberfläche anstelle des Browsers. Der HTTP-Server läuft weiterhin im Hintergrund, sodass Sie jederzeit mit `b` die aktuelle Datei im Browser öffnen können.

| Key | Action |
|---|---|
| `j` / `k` | scroll preview or navigate tree |
| `Tab` | switch focus between tree and preview |
| `l` / `Enter` | open file or expand folder |
| `h` | collapse folder or jump to parent |
| `/` | search files by name |
| `b` | open current file in browser |
| `q` / `Ctrl+C` | quit |

### Deinstallation

```bash
npm unlink -g markdown-previewer
```

---

## Erste Schritte (Web-App)

```bash
git clone https://github.com/jarryuser/markdown-previewer.git
cd markdown-previewer
npm install
npm run dev       # http://localhost:5173
npm run build     # production build -> dist/
```

---

## Technologie-Stack

| Layer | Tool | Why |
|---|---|---|
| Sprache | TypeScript 5.3 | Typsicherheit, strikter Modus aktiviert |
| Markdown | marked.js v12 | Schneller GFM-Parser mit einer sauberen Erweiterungs-API |
| Highlighting | highlight.js v11 | Über 100 Sprachen, funktioniert sowohl im Browser als auch in Node |
| Bundler | Vite 5 | Sofortiges HMR in der Entwicklung, separater Lib-Build für die CLI |
| Bereitstellung | GitHub Pages via Actions | Automatische Bereitstellung bei Push auf `main` |

---

## Roadmap

### Erledigt

- [x] **CLI-Viewer** (`mdp`) – öffnet jede `.md`-Datei mit Live-Neuladen im Browser; lokale Bilder werden aus dem Dateiverzeichnis bereitgestellt
- [x] **Bilder per Drag & Drop** – Bilder auf den Editor ziehen; werden als kurze `local://N`-Platzhalter statt Base64 eingefügt
- [x] **GitHub-ähnliche Aufgabenlisten** – benutzerdefinierte Kontrollkästchen ohne Aufzählungspunkte, entsprechend dem GitHub-Rendering
- [x] **Syntax-Highlighting im Editor** – CodeMirror 6 mit Markdown-Sprachunterstützung und dunklem/hellem Thema
- [x] **Synchronisiertes Scrollen** – Sync-Button in der Symbolleiste hält Editor- und Vorschau-Scrollpositionen synchron
- [x] **Inhalte in localStorage speichern** – Inhalte überleben Seitenaktualisierungen automatisch
- [x] **Zeilenumbruch umschalten** – Wrap-Button schaltet Zeilenumbruch ein/aus; die Scrollposition wird nach Layoutänderung wiederhergestellt
- [x] **Als HTML exportieren** – lädt die gerenderte Vorschau als eigenständige Datei mit allen eingebetteten Stilen herunter
- [x] **Formatierungs-Kürzel** – `Mod+B` fett, `Mod+I` kursiv, `Mod+K` Link, `Mod+Shift+C` Inline-Code; erneutes Drücken entfernt die Formatierung
- [x] **Benutzerdefinierter Export-Dateiname** – fragt nach dem Dateinamen vor dem Herunterladen
- [x] **Einstellbare Schriftgröße** – A− / A+-Buttons; bleibt in localStorage erhalten
- [x] **Vollbildmodus** – Vollbild-Button erweitert die App auf den gesamten Bildschirm
- [x] **Vim-Tastenkürzel** – Vim-Button schaltet modale Bearbeitung mit Normal-/Einfüge-/Visuell-Modus und Statusleiste um
- [x] **Mathe-Unterstützung** – KaTeX rendert `$inline$`- und `$$block$$`-Formeln in der Vorschau
- [x] **Verzeichnis-Modus** – `mdp ./notes/` öffnet ein Verzeichnis mit einer Dateibaum-Seitenleiste; klicken Sie auf eine beliebige `.md`-Datei, um eine Vorschau anzuzeigen; Live-Neuladen bei Speichern
- [x] **Suchen & Ersetzen** – Der Such-Button und `Mod+F` öffnen das integrierte Such- und Ersetzungsfeld von CodeMirror
- [x] **Inhaltsverzeichnis** – Der TOC-Button zeigt eine Seitenleiste mit anklickbaren Überschriften, die durch die Vorschau scrollen
- [x] **Mermaid-Diagramme** – ` ```mermaid `-Codeblöcke werden über mermaid.js als Diagramme gerendert; das Thema folgt dem Hell-/Dunkel-Modus
- [x] **`--port`-Flag** – einen festen Port angeben: `mdp README.md --port 3000`
- [x] **Zuletzt geöffnete Dateien** – `mdp` ohne Argumente zeigt eine nummerierte Liste der zuletzt geöffneten Dateien; `mdp 2` öffnet Eintrag #2 erneut
- [x] **Suche im Dateibaum** – `/` drücken, um Dateien nach Namen zu filtern; `↑`/`↓` zum Navigieren; `Enter` zum Öffnen; `Escape` zum Schließen
- [x] **Wikilinks** – `[[filename]]`- und `[[filename|alias]]`-Links im Verzeichnis-Modus navigieren zwischen Dateien im Vault
- [x] **Lokale Datei öffnen (FSA)** – Der "Datei öffnen"-Button lädt jede `.md`-Datei direkt in den Editor; die Seite wird bei externen Änderungen automatisch neu geladen; `Mod+S` speichert Änderungen zurück auf die Festplatte
- [x] **Lokales Verzeichnis öffnen (FSA)** – Der "Ordner öffnen"-Button öffnet einen Ordner über die File System Access API; vollständige Dateibaum-Seitenleiste, klicken Sie auf eine beliebige Datei, um eine Vorschau anzuzeigen
- [x] **Zurück / Vorwärts-Navigation** – browserähnlicher Verlauf in der FSA-Verzeichnisüberlagerung; `Alt+←` / `Alt+→` oder die Pfeil-Buttons navigieren zwischen den angesehenen Dateien
- [x] **Größenverstellbare Seitenleiste** – den Griff zwischen Seitenleiste und Inhalt ziehen, um die Größe zu ändern; funktioniert sowohl in der FSA-Überlagerung als auch im CLI-Verzeichnis-Modus
- [x] **Breadcrumb** – der aktuelle Dateipfad wird im Verzeichnis-Modus über der Vorschau angezeigt; jedes Segment ist ein anklickbarer Link
- [x] **Terminal-Ausgabe** (`-t` / `--terminal`) – rendert jede `.md`-Datei mit ANSI-Farben auf der Standardausgabe; Überschriften, Fettschrift, Kursivschrift, Codeblöcke, Tabellen; an `less` weiterleitbar
- [x] **TUI-Modus** (`--tui`) – interaktives geteiltes Fenster im Terminal; Dateibaum links, Vorschau rechts; j/k-Navigation, `/`-Suche, `b` zum Öffnen im Browser; automatische Aktualisierung bei Dateispeicherung
- [x] **Bilder aus der Zwischenablage einfügen** – Bilder mit `Strg+V` einfügen, auf die gleiche Weise wie Drag & Drop gespeichert
- [x] **Drucken / PDF-Export** – Der Druck-Button öffnet den Browser-Druckdialog mit druckfreundlichem CSS, das den Editor ausblendet und nur den Text anzeigt
- [x] **Benutzerdefinierte Themen** – Helle, dunkle, Sepia- und Nord-Farbschemas; der Themen-Button schaltet zwischen ihnen um und die Auswahl bleibt nach Neuladen erhalten
- [x] **`--theme`-Flag** – ein Farbschema für Terminal- und TUI-Ausgabe wählen: `mdp README.md -t --theme nord`
- [x] **Emoji-Shortcodes** – wandelt `:smile:` in der Vorschau in 😄 um, GitHub-Stil
- [x] **Fußnoten** – rendert Fußnoten-Syntax (`[^1]`) in der Vorschau

### Geplant

**Web-Editor**

- [ ] **Mehrere Tabs** – an mehreren Dokumenten gleichzeitig arbeiten und zwischen ihnen wechseln, ohne die File System Access API zu benötigen
- [ ] **Versionsverlauf** – automatische Inhalts-Snapshots in localStorage mit der Möglichkeit, eine frühere Version wiederherzustellen
- [ ] **Zen-Modus** – blendet die Symbolleiste und sekundäre Bedienfelder aus und lässt nur den Editor und die Vorschau sichtbar
- [ ] **Benutzerdefiniertes Vorschau-CSS** – ein benutzerbereitgestelltes Stylesheet laden, um das Dokument mit verschiedenen Stilen in der Vorschau anzuzeigen
- [ ] **Lesezeit-Schätzung** – wird neben dem Wort- und Zeichenzähler angezeigt
- [ ] **Tastenkürzel-Referenz** – eine Überlagerung, die alle Kürzel auflistet, ähnlich wie `?` im TUI

**CLI**

- [ ] **Konfigurationsdatei** (`.mdprc` / `mdp.config.json`) – Standard-Port, Thema, Verzeichnis und andere Optionen ohne wiederholte Flags
- [ ] **Inhaltssuche** – `mdp --grep "TODO" ./notes/` durchsucht jede `.md`-Datei in einem Verzeichnis nach Übereinstimmungen
- [ ] **Shell-Vervollständigung** – Vervollständigungsskripte für bash, zsh und fish

---

## Lizenz

MIT © [Dmytro Filiurskyi](https://github.com/jarryuser)
