import { SOURCE } from './palettes.js';
const ROLES = ['ink','paper','m1','m2','m3','a1','a2','a3','b1','b2'];
const NS = 'http://www.w3.org/2000/svg';
const NAMED = { white:'#ffffff', black:'#000000' };
const rgb = h => [1,3,5].map(i => parseInt(h.slice(i,i+2),16));
const lum = c => { const [r,g,b]=rgb(c); return (0.2126*r+0.7152*g+0.0722*b)/255; };
function norm(v) {
  if (typeof v !== 'string') return null;
  v=v.trim().toLowerCase();
  if (NAMED[v]) return NAMED[v];
  if (/^#[0-9a-f]{3}$/.test(v)) return '#' + [...v.slice(1)].map(c=>c+c).join('');
  if (/^#[0-9a-f]{6}$/.test(v)) return v;
  const m=v.match(/^rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/);
  return m && m.slice(1).every(n=>+n<=255) ? '#' + m.slice(1).map(n=>(+n).toString(16).padStart(2,'0')).join('') : null;
}
export function nearestRole(color, pal = SOURCE) {
  const value=norm(color); if (!value) return null;
  const c=rgb(value); let best=null, bd=Infinity;
  for (const r of ROLES) {
    const value=norm(pal[r]); if (!value) continue;
    const p=rgb(value), d=c.reduce((s,n,i)=>s+(n-p[i])**2,0);
    if (d<bd) { bd=d; best=r; }
  }
  return best;
}
// Reject active content and unsupported CSS rather than silently change its drawing.
const TAGS=new Set('svg g path rect circle ellipse line polyline polygon defs clipPath mask linearGradient radialGradient stop pattern marker symbol use title desc text tspan'.split(' '));
const PAINT=new Set(['fill','stroke','stop-color','color']);
const PRESENT=new Set('fill stroke stop-color color fill-rule clip-rule opacity fill-opacity stroke-opacity stop-opacity stroke-width stroke-linecap stroke-linejoin stroke-miterlimit stroke-dasharray stroke-dashoffset clip-path mask marker-start marker-mid marker-end vector-effect font-size font-family font-weight text-anchor dominant-baseline'.split(' '));
const ATTRS=new Set([...PRESENT,...'id d x y x1 y1 x2 y2 cx cy r rx ry dx dy width height points transform viewBox preserveAspectRatio gradientUnits gradientTransform spreadMethod offset fx fy fr patternUnits patternContentUnits patternTransform markerWidth markerHeight refX refY orient markerUnits clipPathUnits maskUnits maskContentUnits href data-detail data-role'.split(' ')]);
let serial=0;
export function renderObject(svgText, { dst, mode='main', detail='L', src=SOURCE, prefix='svg-'+(++serial) }) {
  if (typeof svgText!=='string' || svgText.length>2_000_000 || /<!DOCTYPE|<\?/i.test(svgText.replace(/^\s*<\?xml[^?]*\?>/i,''))) throw new Error('Неподдерживаемый SVG');
  const doc=new DOMParser().parseFromString(svgText,'image/svg+xml'), root=doc.documentElement;
  if (root.localName!=='svg' || root.namespaceURI!==NS || doc.querySelector('parsererror')) throw new Error('Некорректный SVG');
  if (!/^[a-zA-Z][\w-]*$/.test(prefix)) throw new Error('Некорректный префикс SVG');
  const nodes=[root,...root.querySelectorAll('*')], ids=new Map();
  for (const el of nodes) {
    if (el.namespaceURI!==NS || !TAGS.has(el.localName)) throw new Error('Неподдерживаемый элемент SVG: '+el.localName);
    const id=el.getAttribute('id');
    if (id!==null) {
      if (!/^[\w.-]+$/.test(id) || ids.has(id)) throw new Error('Некорректный или повторный ID');
      ids.set(id,prefix+'-'+ids.size);
    }
  }
  const localRef=id=>{ if (!ids.has(id)) throw new Error('Ссылка за пределы SVG'); return ids.get(id); };
  for (const el of nodes) {
    for (const at of [...el.attributes]) {
      if (at.name==='xmlns' || at.name==='xmlns:xlink') continue;
      if (/^on/i.test(at.localName)) throw new Error('Обработчики событий SVG запрещены');
      if (at.name==='style') {
        const style=document.createElementNS(NS,'g').style;
        style.cssText=at.value;
        if (/[\\@]/.test(at.value)) throw new Error('Неподдерживаемый стиль SVG');
        for (const key of style) {
          if (!PRESENT.has(key)) throw new Error('Неподдерживаемое свойство SVG: '+key);
          el.setAttribute(key,style.getPropertyValue(key).trim());
        }
        el.removeAttribute('style');
      } else if (at.localName==='href') {
        if (el.localName!=='use' || !/^#[\w.-]+$/.test(at.value)) throw new Error('Разрешены только локальные use-ссылки');
        // Written after validation, once for both href and xlink:href.
      } else if (!ATTRS.has(at.name) || at.namespaceURI) {
        if (['version','class'].includes(at.name)) el.removeAttributeNode(at);
        else throw new Error('Неподдерживаемый атрибут SVG: '+at.name);
      }
    }
    if (el.hasAttribute('id')) el.setAttribute('id',ids.get(el.getAttribute('id')));
    if (el.localName==='use') {
      const ref=el.getAttribute('href') || el.getAttributeNS('http://www.w3.org/1999/xlink','href');
      if (!ref) throw new Error('Пустая use-ссылка');
      const href='#'+localRef(ref.slice(1));
      el.setAttribute('href',href);
      el.setAttributeNS('http://www.w3.org/1999/xlink','xlink:href',href);
    }
    for (const at of [...el.attributes]) {
      if (at.localName==='href' || at.name.startsWith('xmlns')) continue;
      if (/url\s*\(/i.test(at.value)) {
        const match=at.value.match(/^url\(\s*['"]?#([\w.-]+)['"]?\s*\)$/i);
        if (!match) throw new Error('Внешние ресурсы SVG запрещены');
        el.setAttribute(at.name,'url(#'+localRef(match[1])+')');
      } else if (/[\\]|javascript\s*:|data\s*:|https?\s*:/i.test(at.value)) throw new Error('Внешние ресурсы SVG запрещены');
    }
  }
  if (!root.hasAttribute('fill')) root.setAttribute('fill','#000000');
  for (const el of nodes) for (const a of PAINT) {
    const raw=el.getAttribute(a); if (raw===null) continue;
    const c=norm(raw);
    if (!c) {
      if (!/^(none|currentColor|inherit|url\(#.+\))$/i.test(raw)) throw new Error('Неподдерживаемый цвет SVG: '+raw);
      continue;
    }
    el.setAttribute(a,mode==='bg' ? (lum(c)>0.6 ? dst.b1 : dst.b2) : dst[nearestRole(c,src)]);
  }
  // Alternate S assets are selected by the caller; do not delete geometry.
  const vb=(root.getAttribute('viewBox')||'').trim().split(/[\s,]+/).map(Number);
  const valid=vb.length===4 && vb.every(Number.isFinite) && vb[2]>0 && vb[3]>0;
  if (root.hasAttribute('viewBox') && !valid) throw new Error('Некорректный viewBox');
  const w=valid ? vb[2] : parseFloat(root.getAttribute('width'))||100;
  const h=valid ? vb[3] : parseFloat(root.getAttribute('height'))||100;
  if (!(w>0 && h>0 && Number.isFinite(w) && Number.isFinite(h))) throw new Error('Некорректный размер SVG');
  const group=doc.createElementNS(NS,'g');
  for (const at of root.attributes) if (PRESENT.has(at.name) || ['transform','id'].includes(at.name)) group.setAttribute(at.name,at.value);
  while (root.firstChild) group.append(root.firstChild);
  const wrap=doc.createElementNS(NS,'g');
  if (valid && (vb[0]||vb[1])) wrap.setAttribute('transform','translate('+(-vb[0])+' '+(-vb[1])+')');
  wrap.append(group);
  return {inner:new XMLSerializer().serializeToString(wrap),w,h};
}
