import { SOURCE } from './palettes.js';
const ROLES = ['ink','paper','m1','m2','m3','a1','a2','a3','b1','b2'];
const NAMED = { white:'#ffffff', black:'#000000' };
const rgb = h => { h = h.replace('#',''); if (h.length===3) h=[...h].map(c=>c+c).join(''); return [0,2,4].map(i=>parseInt(h.slice(i,i+2),16)); };
const lum = c => { const [r,g,b]=rgb(c); return (0.2126*r+0.7152*g+0.0722*b)/255; };
function norm(v) { if (!v) return null; v=v.trim().toLowerCase(); if (NAMED[v]) return NAMED[v]; return /^#([0-9a-f]{3}|[0-9a-f]{6})$/.test(v) ? v : null; }
export function nearestRole(color, pal = SOURCE) {
  const c = rgb(color); let best, bd = Infinity;
  for (const r of ROLES) { const p = rgb(pal[r]); const d = (c[0]-p[0])**2+(c[1]-p[1])**2+(c[2]-p[2])**2; if (d<bd) { bd=d; best=r; } }
  return best;
}
// Возвращает {inner, w, h}: содержимое SVG, перекрашенное из исходной палитры в целевую.
// mode 'bg' — монохромный фоновый вариант (без контура, два оттенка b1/b2).
// detail 'S' — убираются элементы с data-detail="hi".
export function renderObject(svgText, { dst, mode = 'main', detail = 'L', src = SOURCE }) {
  const doc = new DOMParser().parseFromString(svgText, 'image/svg+xml');
  const root = doc.documentElement;
  if (root.nodeName === 'parsererror' || root.querySelector('parsererror')) throw new Error('bad svg');
  if (detail === 'S') root.querySelectorAll('[data-detail="hi"]').forEach(e => e.remove());
  root.querySelectorAll('script,foreignObject,iframe,a').forEach(e => e.remove());
  root.querySelectorAll('*').forEach(el => {
    for (const at of [...el.attributes]) if (/^on/i.test(at.name) || /javascript:/i.test(at.value)) el.removeAttribute(at.name);
    for (const a of ['fill','stroke']) {
      const raw = el.getAttribute(a); const c = norm(raw);
      if (!c) continue;
      if (mode === 'bg') {
        if (a === 'stroke') { el.setAttribute('stroke','none'); continue; }
        el.setAttribute('fill', lum(c) > 0.6 ? dst.b1 : dst.b2);
      } else el.setAttribute(a, dst[nearestRole(c, src)]);
    }
  });
  let w = 100, h = 100;
  const vb = (root.getAttribute('viewBox') || '').split(/[\s,]+/).map(Number);
  if (vb.length === 4 && vb[2] > 0) { w = vb[2]; h = vb[3]; }
  else { w = parseFloat(root.getAttribute('width')) || 100; h = parseFloat(root.getAttribute('height')) || 100; }
  const ox = vb.length === 4 ? vb[0] : 0, oy = vb.length === 4 ? vb[1] : 0;
  const s = new XMLSerializer();
  const inner = [...root.childNodes].map(n => s.serializeToString(n)).join('').replace(/ xmlns="[^"]*"/g,'');
  return { inner: (ox||oy) ? `<g transform="translate(${-ox} ${-oy})">${inner}</g>` : inner, w, h };
}
