// Client-side Markdown → PDF.
//
// buildPdfSheets() partitions the rendered preview into exact A4 sheets that are
// shown in the preview modal; downloadPdf() rasterizes those same sheets with
// html2canvas and assembles a downloadable PDF. Because the download uses the
// exact same DOM that the preview shows, the preview matches the resulting file.

// A4 at 96 CSS px per inch: 210mm × 297mm
export const PAGE_W = 793.7;
export const PAGE_H = 1122.5;
const MARGIN = 40; // ≈10.6 mm per side
const CONTENT_H = PAGE_H - MARGIN * 2;

function makeSheet(): HTMLElement {
  const sheet = document.createElement('div');
  sheet.className = 'pdf-page';
  sheet.setAttribute('data-theme', 'light');
  sheet.style.width = `${PAGE_W}px`;
  sheet.style.height = `${PAGE_H}px`;
  sheet.style.padding = `${MARGIN}px`;
  sheet.style.boxSizing = 'border-box';

  const prose = document.createElement('div');
  prose.className = 'prose';
  sheet.appendChild(prose);
  return sheet;
}

// hidden measuring area; absolute positioning keeps it out of the page flow
function createScratch(): HTMLElement {
  const s = document.createElement('div');
  s.className = 'pdf-scratch';
  s.setAttribute('aria-hidden', 'true');
  s.style.position = 'absolute';
  s.style.left = '-100000px';
  s.style.top = '0';
  s.style.width = '0';
  return s;
}

// Splits an oversized <pre> into chunks that fit within `limit` px of content
// height. The innerHTML of highlighted <code> is split per line: hljs spans
// never cross line boundaries, so each chunk stays valid HTML.
function splitPre(el: HTMLElement, scratch: HTMLElement, limit: number): HTMLElement[] | null {
  const code = el.querySelector('code');
  const src = code ?? el;
  const codeClass = code?.getAttribute('class') ?? null;
  const lines = src.innerHTML.split('\n');
  if (lines.length < 2) return null;

  const makePre = (): HTMLElement => {
    const p = el.cloneNode(false) as HTMLElement;
    if (code) {
      const c = document.createElement('code');
      if (codeClass) c.className = codeClass;
      p.appendChild(c);
    }
    scratch.appendChild(p);
    return p;
  };

  const setText = (p: HTMLElement, rows: string): void => {
    (p.querySelector('code') ?? p).innerHTML = rows;
  };

  const chunks: HTMLElement[] = [];
  let cur = makePre();
  let acc: string[] = [];
  setText(cur, '');

  for (const line of lines) {
    const test = [...acc, line];
    setText(cur, test.join('\n'));
    if (acc.length === 0 || cur.getBoundingClientRect().height <= limit) {
      acc = test;
    } else {
      setText(cur, acc.join('\n'));
      chunks.push(cur);
      cur = makePre();
      acc = [line];
      setText(cur, line);
    }
  }
  if (acc.length) {
    setText(cur, acc.join('\n'));
    chunks.push(cur);
  }
  return chunks;
}

// Splits an oversized <table> into consecutive smaller tables, keeping the
// header on every chunk.
function splitTable(el: HTMLElement, scratch: HTMLElement, limit: number): HTMLElement[] | null {
  const cap = el.querySelector('caption');
  const head = el.querySelector('thead');
  const headRows = head ? Array.from(head.querySelectorAll('tr')) : [];
  const body = el.querySelector('tbody') ?? (el as HTMLElement);
  const rows = Array.from(body.querySelectorAll('tr'));
  if (rows.length < 2) return null;

  const makeTable = (): HTMLElement => {
    const t = el.cloneNode(false) as HTMLElement;
    if (cap) t.appendChild(cap.cloneNode(true) as HTMLElement);
    if (headRows.length) {
      const th = document.createElement('thead');
      headRows.forEach(r => th.appendChild(r.cloneNode(true) as HTMLElement));
      t.appendChild(th);
    }
    t.appendChild(document.createElement('tbody'));
    scratch.appendChild(t);
    return t;
  };

  const chunks: HTMLElement[] = [];
  let cur = makeTable();
  const tbody = (): HTMLElement => cur.querySelector('tbody') ?? cur;

  for (const row of rows) {
    tbody().appendChild(row);
    const isFirst = tbody().children.length === 1;
    if (isFirst || cur.getBoundingClientRect().height <= limit) continue;
    tbody().removeChild(row);
    chunks.push(cur);
    cur = makeTable();
    tbody().appendChild(row);
  }
  if (tbody().children.length) chunks.push(cur);
  return chunks;
}

function splitOversized(el: HTMLElement, scratch: HTMLElement): HTMLElement[] | null {
  const tag = el.tagName.toLowerCase();
  if (tag === 'pre') return splitPre(el, scratch, CONTENT_H);
  if (tag === 'table') return splitTable(el, scratch, CONTENT_H);
  return null;
}

// Partitions a clone of `source` (the .prose preview node) into A4 sheets.
// Each sheet is a .pdf-page element containing a .prose div — the same markup
// the preview modal displays. Returns detached sheets ready to be appended.
export function buildPdfSheets(source: HTMLElement): HTMLElement[] {
  const scratch = createScratch();
  document.body.appendChild(scratch);

  const clone = source.cloneNode(true) as HTMLElement;
  const proseClone = clone.classList.contains('prose')
    ? clone
    : (clone.querySelector('.prose') ?? clone) as HTMLElement;
  scratch.appendChild(proseClone);

  const pages: HTMLElement[] = [];
  let sheet = makeSheet();
  scratch.appendChild(sheet);

  const proseOf = (s: HTMLElement): HTMLElement => s.querySelector('.prose') as HTMLElement;

  const fits = (el: HTMLElement): boolean =>
    el.getBoundingClientRect().bottom <=
    sheet.getBoundingClientRect().top + PAGE_H - MARGIN;

  // push the current sheet and start a new empty one
  const nextPage = (): void => {
    if (proseOf(sheet).childElementCount) pages.push(sheet);
    sheet = makeSheet();
    scratch.appendChild(sheet);
  };

  // place `child` on the current (empty) sheet; split it if it still overflows
  const placeOrSplit = (child: HTMLElement): void => {
    proseOf(sheet).appendChild(child);
    if (fits(child)) return;
    proseOf(sheet).removeChild(child);
    const chunks = splitOversized(child, scratch);
    if (chunks) {
      for (const c of chunks) {
        proseOf(sheet).appendChild(c);
        nextPage();
      }
    } else {
      // unsplittable oversized element (e.g. very tall mermaid diagram) —
      // keep it whole and let it overflow; rare in practice
      proseOf(sheet).appendChild(child);
      nextPage();
    }
  };

  for (const child of Array.from(proseClone.children) as HTMLElement[]) {
    proseOf(sheet).appendChild(child);
    if (fits(child)) continue;
    proseOf(sheet).removeChild(child);
    nextPage(); // fresh page
    placeOrSplit(child);
  }

  if (proseOf(sheet).childElementCount) pages.push(sheet);
  scratch.remove();
  return pages;
}

// Rasterizes the given sheets (the ones shown in the preview modal) and saves
// a real PDF file. jspdf/html2canvas are loaded lazily to keep the main bundle
// small.
export async function downloadPdf(
  sheets: HTMLElement[],
  filename: string,
  onPage?: (done: number, total: number) => void
): Promise<void> {
  const jspdf = await import('jspdf');
  const html2canvas = (await import('html2canvas')).default;
  const jsPDF = jspdf.default;

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });

  for (let i = 0; i < sheets.length; i++) {
    const canvas = await html2canvas(sheets[i], {
      scale: 2,
      backgroundColor: '#ffffff',
      useCORS: true,
      logging: false,
    });
    const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
    if (i > 0) doc.addPage('a4', 'portrait');
    doc.addImage(dataUrl, 'JPEG', 0, 0, 210, 297, undefined, 'FAST');
    onPage?.(i + 1, sheets.length);
  }

  doc.save(filename);
}
