<div align="center">

# Markdown Previewer

**Minimalistický Markdown editor s rozdeleným zobrazením, živým náhľadom, zvýrazňovaním syntaxe a CLI, ktoré otvorí ľubovoľný `.md` súbor v prehliadači**

[![Live Demo](https://img.shields.io/badge/Live%20Demo-→-2f81f7?style=flat-square)](https://jarryuser.github.io/markdown-previewer/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite-5.1-646CFF?style=flat-square&logo=vite&logoColor=white)](https://vitejs.dev/)
[![marked](https://img.shields.io/badge/marked-12-orange?style=flat-square)](https://marked.js.org/)
[![highlight.js](https://img.shields.io/badge/highlight.js-11-yellow?style=flat-square)](https://highlightjs.org/)
[![GitHub Pages](https://img.shields.io/badge/Deployed%20on-GitHub%20Pages-222?style=flat-square&logo=github)](https://pages.github.com/)

[English](README.md) · [Українська](README.uk.md) · **Slovenčina** · [Deutsch](README.de.md) · [Русский](README.ru.md)


</div>


---

## Prehľad

Markdown Previewer je editor bežiaci v prehliadači s rozdeleným rozložením. Píšte Markdown vľavo, výsledok vidíte vpravo v reálnom čase. Výstup zodpovedá GitHub renderovaniu: GFM tabuľky, zoznamy úloh s vlastnými zaškrtávacími políčkami a zvýraznené bloky kódu.

Projekt tiež obsahuje malé CLI (`mdp`), ktoré vykreslí ľubovoľný lokálny `.md` súbor v prehliadači s rovnakými štýlmi a automaticky obnoví stránku pri každom uložení súboru

---

## Funkcie

| | Funkcia | Podrobnosti |
|---|---|---|
| ⚡ | **Živý náhľad** | Znovu vykreslí 60 ms po poslednom stlačení klávesy |
| ✏️ | **CodeMirror editor** | Zvýrazňovanie syntaxe Markdownu, čísla riadkov, tmavý/svetlý režim |
| 🎨 | **Zvýrazňovanie syntaxe** | highlight.js so 100+ jazykmi; automatická detekcia, keď nie je jazyk špecifikovaný |
| 🔄 | **Synchronizované posúvanie** | Tlačidlo Sync plynule prepojí pozície posúvania editora a náhľadu |
| ↩️ | **Prepínač zalamovania riadkov** | Tlačidlo Wrap prepína medzi zalamovaním a horizontálnym posúvaním; pozícia posúvania je zachovaná |
| 📤 | **Export ako HTML** | Stiahne vykreslený náhľad ako samostatný `.html` súbor; vyzve na zadanie vlastného názvu súboru |
| ⌨️ | **Klávesové skratky formátovania** | `Mod+B` tučné, `Mod+I` kurzíva, `Mod+K` odkaz, `Mod+Shift+C` vložený kód; opätovným stlačením sa odstráni |
| 🔡 | **Nastaviteľná veľkosť písma** | Tlačidlá A− / A+ na paneli nástrojov; pretrváva pri obnovení stránky |
| ⛶ | **Režim celej obrazovky** | Tlačidlo Full rozšíri aplikáciu na celú obrazovku |
| 🔡 | **Vim klávesové väzby** | Tlačidlo Vim prepína modálne úpravy; režimy Normal / Insert / Visual so stavovým riadkom |
| ∑ | **Matematická podpora** | KaTeX vykresľuje `$inline$` a `$$block$$` vzorce |
| 💾 | **Trvalý obsah** | Obsah editora sa ukladá do localStorage a obnoví pri obnovení stránky |
| ✅ | **Zoznamy úloh v štýle GitHub** | Vlastné zaškrtávacie políčka, bez odrážok – zodpovedá GitHub renderovaniu |
| 🖼️ | **Pretiahnutie / vloženie obrázka** | Pretiahnite obrázok na editor alebo ho vložte pomocou `Ctrl+V`; uloží sa ako krátka `local://N` referencia, nie base64 |
| ↔️ | **Prispôsobiteľné panely** | Potiahnite oddeľovač; pomer je obmedzený medzi 20 % a 80 % |
| 📊 | **Počet slov a znakov** | Aktualizuje sa v reálnom čase na paneli nástrojov |
| 📋 | **Kopírovať do schránky** | Skopíruje surový Markdown jedným kliknutím |
| 🌙 | **Vlastné témy** | Light, Dark, Sepia a Nord; tlačidlo Theme medzi nimi prepína a voľba pretrváva pri obnovení stránky |
| 🖨️ | **Tlač / export PDF** | Tlačidlo Print otvorí dialóg tlače prehliadača so štýlmi vhodnými na tlač, ktoré zobrazujú iba vykreslený náhľad |
| ⌨️ | **Kláves Tab** | Vloží dve medzery namiesto presunu fókusu |
| 📄 | **GitHub Flavored Markdown** | Tabuľky, prečiarknutie, zoznamy úloh, automatické odkazy |
| 🔍 | **Hľadanie a nahradenie** | Tlačidlo na paneli nástrojov alebo `Mod+F` otvorí vyhľadávací panel CodeMirror |
| 📑 | **Obsah** | Tlačidlo TOC zobrazí bočný panel s klikateľnými nadpismi |
| 📐 | **Mermaid diagramy** | Bloky kódu ` ```mermaid ` vykreslené ako diagramy; prispôsobenie téme |
| 📂 | **Otvoriť lokálny súbor / adresár** | File System Access API; živé obnovenie pri externých úpravách; `Mod+S` na uloženie |

---

## CLI - `mdp`

`mdp` funguje v dvoch režimoch:

- **Režim súboru** - otvorí jeden `.md` súbor; stránka sa živé obnovuje pri každom uložení
- **Režim adresára** - otvorí adresár s bočným panelom stromu súborov; kliknutím na súbor zobrazíte náhľad; obnoví sa pri zmene aktuálneho súboru

Obrázky s relatívnymi cestami sú obsluhované automaticky

### Inštalácia

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

### Použitie

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

Prehliadač sa otvorí automaticky. Upravujte súbory v ľubovoľnom editore – stránka sa obnoví pri každom uložení

V režime adresára stlačte `/` na filtrovanie stromu súborov podľa názvu, `j`/`k` na navigáciu a `c` na zbalenie alebo rozbalenie všetkých priečinkov

### Režim TUI

`--tui` otvorí celoobrazovkové terminálové rozhranie namiesto prehliadača. HTTP server stále beží na pozadí, takže stlačením `b` kedykoľvek otvoríte aktuálny súbor v prehliadači

| Kláves | Akcia |
|---|---|
| `j` / `k` | posunúť náhľad alebo navigovať v strome |
| `Tab` | prepnúť fokus medzi stromom a náhľadom |
| `l` / `Enter` | otvoriť súbor alebo rozbaliť priečinok |
| `h` | zbaliť priečinok alebo preskočiť na rodiča |
| `/` | vyhľadať súbory podľa názvu |
| `b` | otvoriť aktuálny súbor v prehliadači |
| `q` / `Ctrl+C` | ukončiť |

### Odinštalovanie

```bash
npm unlink -g markdown-previewer
```

---

## Začíname (webová aplikácia)

```bash
git clone https://github.com/jarryuser/markdown-previewer.git
cd markdown-previewer
npm install
npm run dev       # http://localhost:5173
npm run build     # production build -> dist/
```

---

## Technologický stack

| Layer | Tool | Why |
|---|---|---|
| Language | TypeScript 5.3 | Typová bezpečnosť, zapnutý prísny režim |
| Markdown | marked.js v12 | Rýchly GFM parser s čistým API pre rozšírenia |
| Highlighting | highlight.js v11 | 100+ jazykov, funguje v prehliadači aj v Node |
| Bundler | Vite 5 | Okamžitý HMR pri vývoji, samostatný build knižnice pre CLI |
| Deploy | GitHub Pages cez Actions | Auto-nasadenie pri pushi na `main` |

---

## Plán

### Hotovo

- [x] **CLI viewer** (`mdp`) - otvorí ľubovoľný `.md` súbor v prehliadači so živým obnovovaním; lokálne obrázky sa obsluhujú z adresára súboru
- [x] **Pretiahnutie obrázka** - pretiahnite obrázky na editor; vložia sa ako krátke `local://N` zástupné symboly namiesto base64
- [x] **Zoznamy úloh v štýle GitHub** - vlastné zaškrtávacie políčka bez odrážok, zodpovedajúce GitHub renderovaniu
- [x] **Zvýrazňovanie syntaxe v editore** - CodeMirror 6 s podporou Markdown jazyka a tmavým/svetlým režimom
- [x] **Synchronizované posúvanie** - Tlačidlo Sync na paneli nástrojov udržuje pozície posúvania editora a náhľadu v súlade
- [x] **Trvalý obsah v localStorage** - obsah prežíva obnovenie stránky automaticky
- [x] **Prepínač zalamovania riadkov** - Tlačidlo Wrap zapína/vypína zalamovanie riadkov; pozícia posúvania sa po zmene rozloženia obnoví
- [x] **Export ako HTML** - stiahne vykreslený náhľad ako samostatný súbor so všetkými vloženými štýlmi
- [x] **Klávesové skratky formátovania** - `Mod+B` tučné, `Mod+I` kurzíva, `Mod+K` odkaz, `Mod+Shift+C` vložený kód; opätovným stlačením sa odstráni
- [x] **Vlastný názov exportovaného súboru** - vyzve na úpravu názvu súboru pred stiahnutím
- [x] **Nastaviteľná veľkosť písma** - Tlačidlá A− / A+; pretrváva v localStorage
- [x] **Režim celej obrazovky** - Tlačidlo Full rozšíri aplikáciu na celú obrazovku
- [x] **Vim klávesové väzby** - Tlačidlo Vim prepína modálne úpravy s režimami Normal / Insert / Visual a stavovým riadkom
- [x] **Matematická podpora** - KaTeX vykresľuje `$inline$` a `$$block$$` vzorce v náhľade
- [x] **Režim adresára** - `mdp ./notes/` otvorí adresár s bočným panelom stromu súborov; kliknutím na ľubovoľný `.md` súbor zobrazíte náhľad; živé obnovenie pri uložení
- [x] **Hľadanie a nahradenie** - Tlačidlo Find a `Mod+F` otvoria vstavaný panel vyhľadávania a nahradzovania CodeMirror
- [x] **Obsah** - Tlačidlo TOC zobrazí bočný panel s klikateľnými nadpismi, ktoré posúvajú náhľad
- [x] **Mermaid diagramy** - Bloky kódu ` ```mermaid ` sú vykreslené ako diagramy cez mermaid.js; téma sa prispôsobí svetlému/tmavému režimu
- [x] **Prepínač `--port`** - zadajte pevný port: `mdp README.md --port 3000`
- [x] **Nedávne súbory** - `mdp` bez argumentov zobrazí číslovaný zoznam nedávno otvorených súborov; `mdp 2` znovu otvorí položku #2
- [x] **Vyhľadávanie v strome súborov** - stlačte `/` na filtrovanie súborov podľa názvu; `↑`/`↓` na navigáciu výsledkami; `Enter` na otvorenie; `Escape` na zatvorenie
- [x] **Wikilinky** - `[[názov_súboru]]` a `[[názov_súboru|alias]]` odkazy v režime adresára navigujú medzi súbormi v vault-e
- [x] **Otvoriť lokálny súbor (FSA)** - Tlačidlo Open File načíta ľubovoľný `.md` súbor priamo do editora; stránka sa automaticky obnoví pri externom uložení súboru; `Mod+S` uloží zmeny späť na disk
- [x] **Otvoriť lokálny adresár (FSA)** - Tlačidlo Open Dir otvorí priečinok pomocou File System Access API; kompletný bočný panel stromu súborov, kliknutím na súbor zobrazíte náhľad
- [x] **Navigácia späť / vpred** - história v štýle prehliadača v prepínaní FSA adresárov; `Alt+←` / `Alt+→` alebo tlačidlá so šípkami navigujú medzi zobrazenými súbormi
- [x] **Prispôsobiteľný bočný panel** - potiahnutím úchytky medzi bočným panelom a obsahom zmeníte veľkosť; funguje v prepínaní FSA aj v režime adresára CLI
- [x] **Navigačná drobčeková cesta** - aktuálna cesta k súboru je zobrazená nad náhľadom v režime adresára; každý segment je klikateľný odkaz
- [x] **Terminálový výstup** (`-t` / `--terminal`) - vykreslí ľubovoľný `.md` súbor na stdout s ANSI farbami; nadpisy, tučné, kurzíva, bloky kódu, tabuľky; možno presmerovať do `less`
- [x] **Režim TUI** (`--tui`) - interaktívne rozdelené zobrazenie v termináli; strom súborov vľavo, náhľad vpravo; navigácia j/k, vyhľadávanie `/`, `b` na otvorenie v prehliadači; automatické obnovenie pri uložení súboru
- [x] **Vloženie obrázka zo schránky** - vložte obrázky pomocou `Ctrl+V`, uložia sa rovnako ako pretiahnutie
- [x] **Tlač / export PDF** - Tlačidlo Print otvorí dialóg tlače prehliadača s CSS vhodným na tlač, ktoré skryje editor a ponechá iba text
- [x] **Vlastné témy** - Farebné schémy Light, Dark, Sepia a Nord; tlačidlo Theme medzi nimi prepína a voľba pretrváva pri obnovení stránky
- [x] **Prepínač `--theme`** - vyberte farebnú schému pre terminálový a TUI výstup: `mdp README.md -t --theme nord`
- [x] **Emoji skratky** - mení `:smile:` na 😄 v náhľade, v štýle GitHub
- [x] **Poznámky pod čiarou** - vykresľuje syntax poznámok pod čiarou (`[^1]`) v náhľade

### Plánované

**Webový editor**

- [ ] **Viaceré karty** - pracovať na viacerých dokumentoch naraz a prepínať medzi nimi bez použitia File System Access API
- [ ] **História verzií** - automatické snímky obsahu v localStorage s možnosťou obnovenia staršej verzie
- [ ] **Zen režim** - skryje panel nástrojov a sekundárne panely, ponechá iba editor a náhľad
- [ ] **Vlastné CSS pre náhľad** - načítať užívateľom poskytnutý štýlový predpis na zobrazenie dokumentu s iným stylingom
- [ ] **Odhad času čítania** - zobrazený vedľa počítadla slov a znakov
- [ ] **Prehľad klávesových skratiek** - prekrytie zobrazujúce všetky skratky, podobne ako `?` v TUI

**CLI**

- [ ] **Konfiguračný súbor** (`.mdprc` / `mdp.config.json`) - predvolený port, téma, adresár a ďalšie možnosti bez opakovania prepínačov
- [ ] **Vyhľadávanie v obsahu** - `mdp --grep "TODO" ./notes/` vyhľadá zhody vo všetkých `.md` súboroch v adresári
- [ ] **Dopĺňanie v shelli** - doplňovacie skripty pre bash, zsh a fish

---

## Licencia

MIT © [Dmytro Filiurskyi](https://github.com/jarryuser)
