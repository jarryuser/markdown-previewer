declare module 'html2canvas' {
  interface Html2CanvasOptions {
    scale?: number;
    backgroundColor?: string;
    useCORS?: boolean;
    logging?: boolean;
    allowTaint?: boolean;
    windowWidth?: number;
    windowHeight?: number;
    removeContainer?: boolean;
    onclone?: (cloned: Document, element: HTMLElement) => void;
    pagebreak?: { mode?: string[] };
  }
  export default function html2canvas(
    element: HTMLElement,
    options?: Html2CanvasOptions
  ): Promise<HTMLCanvasElement>;
}