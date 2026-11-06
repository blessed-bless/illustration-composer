import { PALETTES, parsePalette } from './palettes.js';
import { renderObject } from './recolor.js';
import { rng, pickByMetaphor, pickByNames, layout } from './compose.js';

const $ = s => document.querySelector(s);
const st = { size: 'L', pal: { ...PALETTES }, palId: 'purple', W: 800, H: 600, gs: 1, items: [], sel: null, seed: 1, catalog: [], svg: {} };
let uid = 1;

const palette = () => st.pal[st.palId];
const obj = id => st.catalog.find(o => o.id === id);
const fileOf = (o, mode) => {
  const s = st.size === 'S' && o.s;
  return (mode === 'bg' ? (s ? o.sbg : o.bg) : null) || (s ? o.s : o.file);
};
// f — поправка масштаба: S-файлы нарисованы в половинных единицах, объект на холсте должен остаться того же размера
const draw = (o, mode) => {
  const r = renderObject(st.svg[fileOf(o, mode)], { dst: palette(), mode, detail: o.s ? 'L' : st.size });
  return { ...r, f: o.w ? o.w / r.w : 1 };
};
const baseK = n => Math.sqrt(st.W * st.H / Math.max(n, 3)) * 0.9 / 900; // px на единицу исходного рисунка

function makeItem(o, mode, n = 4, x = st.W / 2, y = st.H / 2) {
  const sc = baseK(n) * (mode === 'bg' ? 1.3 : 1);
  return { uid: uid++, id: o.id, x, y, rot: 0, mode, sc, r: 0.3 * Math.hypot(o.w, o.h) * sc };
}

function tf(it, w, h, s) {
  return `translate(${it.x.toFixed(1)} ${it.y.toFixed(1)}) rotate(${it.rot}) scale(${s.toFixed(4)}) translate(${-w / 2} ${-h / 2})`;
}

// exp=true: чистый SVG для экспорта (без рамки выделения и невидимых областей клика)
function buildSvg(exp) {
  let g = '';
  for (const it of st.items) {
    const o = obj(it.id); if (!o) continue;
    const { inner, w, h, f } = draw(o, it.mode), s = it.sc * st.gs * f;
    if (exp) { g += `<g transform="${tf(it, w, h, s)}">${inner}</g>`; continue; }
    g += `<g data-uid="${it.uid}" style="cursor:move" transform="${tf(it, w, h, s)}"><rect width="${w}" height="${h}" fill="transparent"/>${inner}</g>`;
    if (it.uid === st.sel) g += `<rect transform="${tf(it, w, h, s)}" width="${w}" height="${h}" fill="none" stroke="#2b7cff" stroke-width="${(2 / s).toFixed(2)}" stroke-dasharray="${(6 / s).toFixed(1)}" pointer-events="none"/>`;
  }
  return `<rect width="${st.W}" height="${st.H}" fill="${palette().canvas}"/>${g}`;
}

function render() {
  const c = $('#cvs');
  c.setAttribute('viewBox', `0 0 ${st.W} ${st.H}`);
  c.style.aspectRatio = `${st.W}/${st.H}`;
  c.innerHTML = buildSvg(false);
  document.querySelectorAll('#bar [data-a]').forEach(b => b.disabled = st.sel == null);
}

function renderLib() {
  $('#cnt').textContent = `(${st.catalog.length})`;
  $('#lib').innerHTML = '';
  for (const o of st.catalog) {
    const { inner, w, h } = draw(o, 'main'), b = document.createElement('button');
    b.title = 'Добавить на холст';
    b.innerHTML = `<svg viewBox="0 0 ${w} ${h}">${inner}</svg><span>${esc(o.name)}</span>`;
    b.onclick = () => { const it = makeItem(o, 'main'); st.items.push(it); st.sel = it.uid; render(); };
    $('#lib').append(b);
  }
}

function compose() {
  const text = $('#prompt').value.trim(), scen = document.querySelector('[name=sc]:checked').value;
  const notes = $('#notes');
  if (!text) { notes.textContent = 'Введите метафору или названия компонентов.'; return; }
  st.seed = Date.now() % 1e9;
  const rand = rng(st.seed);
  const pick = (scen === 'names' ? pickByNames : pickByMetaphor)(text, st.catalog, rand);
  notes.textContent = pick.notes.join(' ');
  if (!pick.main.length) return;
  const useBg = $('#useBg').checked;
  const n = pick.main.length + (useBg ? pick.bg.length : 0);
  const bg = useBg ? pick.bg.map(o => makeItem(o, 'bg', n)) : [];
  const main = pick.main.map(o => makeItem(o, 'main', n));
  // фон раскладывается первым и лежит под главными объектами
  st.items = [...layout(bg, st.W, st.H, rand), ...layout(main, st.W, st.H, rand)];
  st.sel = null;
  render();
}

// --- редактор: выбор и перетаскивание
let drag = null;
function pt(e) {
  const c = $('#cvs');
  return new DOMPoint(e.clientX, e.clientY).matrixTransform(c.getScreenCTM().inverse());
}
$('#cvs').addEventListener('pointerdown', e => {
  const g = e.target.closest('[data-uid]');
  st.sel = g ? +g.dataset.uid : null;
  if (g) {
    const it = st.items.find(i => i.uid === st.sel), p = pt(e);
    drag = { it, dx: it.x - p.x, dy: it.y - p.y };
  }
  render();
});
addEventListener('pointermove', e => {
  if (!drag) return;
  const p = pt(e);
  drag.it.x = p.x + drag.dx; drag.it.y = p.y + drag.dy;
  render();
});
addEventListener('pointerup', () => { drag = null; });

function act(a) {
  const i = st.items.findIndex(x => x.uid === st.sel); if (i < 0) return;
  const it = st.items[i];
  if (a === 'rl') it.rot -= 15;
  if (a === 'rr') it.rot += 15;
  if (a === 'del') { st.items.splice(i, 1); st.sel = null; }
  if (a === 'dup') { const c = { ...it, uid: uid++, x: it.x + 24, y: it.y + 24 }; st.items.splice(i + 1, 0, c); st.sel = c.uid; }
  if (a === 'up' && i < st.items.length - 1) [st.items[i], st.items[i + 1]] = [st.items[i + 1], st.items[i]];
  if (a === 'down' && i > 0) [st.items[i], st.items[i - 1]] = [st.items[i - 1], st.items[i]];
  if (a === 'mode') it.mode = it.mode === 'bg' ? 'main' : 'bg';
  render();
}
document.querySelectorAll('#bar [data-a]').forEach(b => b.onclick = () => act(b.dataset.a));
addEventListener('keydown', e => {
  if (/INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
  if (e.key === 'Delete' || e.key === 'Backspace') act('del');
  if (e.key === 'r' || e.key === 'к') act('rr');
});

// --- параметры
$('#gen').onclick = compose;
$('#shuffle').onclick = compose;
document.querySelectorAll('[name=sz]').forEach(r => r.onchange = () => { st.size = r.value; renderLib(); render(); });
$('#pal').onchange = e => { st.palId = e.target.value; renderLib(); render(); };
$('#cv').onchange = e => {
  const [w, h] = e.target.value.split('x').map(Number), kx = w / st.W, ky = h / st.H;
  st.W = w; st.H = h; st.items.forEach(i => { i.x *= kx; i.y *= ky; });
  render();
};
$('#gs').oninput = e => { st.gs = +e.target.value; render(); };
$('#clear').onclick = () => { st.items = []; st.sel = null; render(); };

const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" })[c]);
function fillPal() {
  $('#pal').innerHTML = Object.entries(st.pal).map(([k, v]) => `<option value="${k}">${esc(v.name)}</option>`).join('');
  $('#pal').value = st.palId;
}
$('#palFile').onchange = async e => {
  const f = e.target.files[0]; if (!f) return;
  try {
    const id = 'u' + Date.now();
    st.pal[id] = parsePalette(JSON.parse(await f.text()), palette());
    st.palId = id; fillPal(); renderLib(); render();
  } catch (err) { $('#notes').textContent = 'Палитра не принята: ' + err.message; }
  e.target.value = '';
};
$('#svgFile').onchange = async e => {
  for (const f of e.target.files) {
    const text = await f.text(), name = f.name.replace(/\.svg$/i, '');
    let dim; try { dim = renderObject(text, { dst: palette() }); } catch { $('#notes').textContent = `Файл ${f.name} — не SVG.`; continue; }
    const id = 'x' + Date.now() + Math.random().toString(36).slice(2, 5);
    st.svg[id] = text;
    st.catalog.push({ id, name, file: id, w: dim.w, h: dim.h, tags: name.replace(/[-_]/g, ' ') });
  }
  renderLib(); e.target.value = '';
};
$('#export').onclick = () => {
  const s = `<svg xmlns="http://www.w3.org/2000/svg" width="${st.W}" height="${st.H}" viewBox="0 0 ${st.W} ${st.H}">${buildSvg(true)}</svg>`;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([s], { type: 'image/svg+xml' }));
  a.download = 'composition.svg'; a.click(); URL.revokeObjectURL(a.href);
};

// --- старт
(async () => {
  st.catalog = await (await fetch('catalog/manifest.json')).json();
  const files = new Set(st.catalog.flatMap(o => [o.file, o.bg, o.s, o.sbg].filter(Boolean)));
  await Promise.all([...files].map(async f => { st.svg[f] = await (await fetch('catalog/' + f)).text(); }));
  fillPal(); renderLib(); render();
  const q = new URLSearchParams(location.search);
  if (q.get("q")) { $("#prompt").value = q.get("q"); if (q.get("mode") === "names") document.querySelector("[name=sc][value=names]").checked = true; compose(); }
  window.__st = st; // для отладки в консоли
})();
