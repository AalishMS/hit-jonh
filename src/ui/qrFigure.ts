import { encodeQr, qrPath } from '../share/qrCode';

const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * `text` as a QR code another phone's camera can scan: one crisp SVG path, black on white with the standard
 * quiet zone (scanners need the contrast, so it ignores the page theme). Null when the text is too long.
 */
export function qrFigure(text: string, label: string): SVGSVGElement | null {
  const qr = encodeQr(text);
  if (!qr) return null;
  const n = qr.size + 8;
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${n} ${n}`);
  svg.setAttribute('class', 'qr-code');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', label);
  svg.setAttribute('shape-rendering', 'crispEdges');
  const paper = document.createElementNS(SVG_NS, 'rect');
  paper.setAttribute('width', String(n));
  paper.setAttribute('height', String(n));
  paper.setAttribute('fill', '#ffffff');
  const ink = document.createElementNS(SVG_NS, 'path');
  ink.setAttribute('d', qrPath(qr));
  ink.setAttribute('fill', '#000000');
  svg.append(paper, ink);
  return svg;
}
