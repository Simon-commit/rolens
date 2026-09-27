const SVG_NS = 'http://www.w3.org/2000/svg';

/** Stroke icons on a 24px grid, drawn for RoLens. */
const PATHS = {
  warning: ['M12 3.5 21.5 20h-19Z', 'M12 10v4', 'M12 17.2v.1'],
  gem: ['M6.5 3.5h11l4 5.5L12 20.5 2.5 9Z', 'M2.5 9h19', 'M9.5 3.5 8 9l4 11.5L16 9l-1.5-5.5'],
  flame: ['M12 2.5c.8 3.6 6 5.8 6 11.5a6 6 0 0 1-12 0c0-2.8 1.6-4.6 2.8-5.6.1 1.8 1 2.9 2.2 3.1-.3-3 .2-6.3 1-9Z'],
  up: ['M3 17l6-6 4 4 8-8', 'M15 7h6v6'],
  down: ['M3 7l6 6 4-4 8 8', 'M15 17h6v-6'],
  flat: ['M4 12h16', 'M16 8l4 4-4 4'],
  wave: ['M2 12l4-5 4 10 4-10 4 10 4-5'],
  split: ['M3 12h6', 'M9 12l9-6.5', 'M9 12l9 6.5', 'M14.5 5.5H18V9', 'M14.5 18.5H18V15'],
  external: ['M14 4h6v6', 'M20 4l-9 9', 'M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5'],
  copy: ['M9 9h11v11H9Z', 'M5 15H4V4h11v1'],
  check: ['M5 12.5l4.5 4.5L19 7.5'],
  help: ['M12 3a9 9 0 1 0 0 18 9 9 0 1 0 0-18', 'M9.6 9.2a2.5 2.5 0 1 1 3.4 2.3c-.6.3-1 .8-1 1.5', 'M12 16.8v.1'],
} as const;

export type IconName = keyof typeof PATHS;

export function icon(name: IconName, className = 'rl-icon'): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('class', className);
  svg.setAttribute('aria-hidden', 'true');
  for (const d of PATHS[name]) {
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', d);
    svg.append(path);
  }
  return svg;
}

let glyphCount = 0;

/** The RoLens mark: a lens around a rising chevron, on the brand gradient. */
export function glyph(size = 16): SVGSVGElement {
  const id = `rl-g${glyphCount++}`;
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('class', 'rl-glyph');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('aria-hidden', 'true');
  const defs = document.createElementNS(SVG_NS, 'defs');
  const gradient = document.createElementNS(SVG_NS, 'linearGradient');
  gradient.id = id;
  gradient.setAttribute('x1', '0');
  gradient.setAttribute('y1', '0');
  gradient.setAttribute('x2', '1');
  gradient.setAttribute('y2', '1');
  for (const [offset, color] of [
    ['0', 'var(--rl-brand-a)'],
    ['1', 'var(--rl-brand-b)'],
  ] as const) {
    const stop = document.createElementNS(SVG_NS, 'stop');
    stop.setAttribute('offset', offset);
    stop.setAttribute('stop-color', color);
    gradient.append(stop);
  }
  defs.append(gradient);
  const tile = document.createElementNS(SVG_NS, 'rect');
  tile.setAttribute('width', '24');
  tile.setAttribute('height', '24');
  tile.setAttribute('rx', '6.5');
  tile.setAttribute('fill', `url(#${id})`);
  const lens = document.createElementNS(SVG_NS, 'circle');
  lens.setAttribute('cx', '10.4');
  lens.setAttribute('cy', '10.4');
  lens.setAttribute('r', '5.4');
  const handle = document.createElementNS(SVG_NS, 'path');
  handle.setAttribute('d', 'M14.6 14.6 18.4 18.4');
  const line = document.createElementNS(SVG_NS, 'path');
  line.setAttribute('d', 'M8.2 11.6 10.4 9.4 12.6 11.6');
  for (const part of [lens, handle, line]) {
    part.setAttribute('fill', 'none');
    part.setAttribute('stroke', '#fff');
    part.setAttribute('stroke-linecap', 'round');
    part.setAttribute('stroke-linejoin', 'round');
  }
  lens.setAttribute('stroke-width', '2.4');
  handle.setAttribute('stroke-width', '2.8');
  line.setAttribute('stroke-width', '2');
  svg.append(defs, tile, lens, handle, line);
  return svg;
}
