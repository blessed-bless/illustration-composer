import { PALETTES, parsePalette } from './palettes.js';
import { renderObject } from './recolor.js';
import { rng, pickByMetaphor, pickByNames, pickByLLM, layout, relax, fit } from './compose.js';

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
const draw = (o, mode, prefix) => {
  const r = renderObject(st.svg[fileOf(o, mode)], { dst: palette(), mode, detail: o.s ? 'L' : st.size, prefix });
  return { ...r, f: o.w ? Math.min(o.w / r.w, o.h / r.h) : 1 };
};
const baseK = n => Math.sqrt(st.W * st.H / Math.max(n, 3)) * 0.9 / 900; // px на единицу исходного рисунка

const history=[];
function cancelCompose() {
  composeVersion++;composing=false;$('#gen').disabled=$('#shuffle').disabled=false;
}
function save() {
  if (composing) {cancelCompose();$('#notes').textContent='Автосборка отменена ручным изменением.';}
  const snapshot=JSON.stringify({size:st.size,palId:st.palId,W:st.W,H:st.H,gs:st.gs,items:st.items,sel:st.sel,seed:st.seed});
  if (history.at(-1)!==snapshot) history.push(snapshot);
  if (history.length>60) history.shift();
}
function undo() {
  if (!history.length) return;
  cancelCompose(); drag=null;
  Object.assign(st,JSON.parse(history.pop()));
  renderLib(); render();
}
function groupControls() {
  if (st.sel===null || !st.items.length) return '';
  let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity;
  for (const it of st.items) {
    const o=obj(it.id),a=it.rot*Math.PI/180;
    const w=o.w*it.sc*st.gs/2,h=o.h*it.sc*st.gs/2;
    const hw=Math.abs(w*Math.cos(a))+Math.abs(h*Math.sin(a)),hh=Math.abs(w*Math.sin(a))+Math.abs(h*Math.cos(a));
    const x=st.W/2+(it.x-st.W/2)*st.gs,y=st.H/2+(it.y-st.H/2)*st.gs;
    x0=Math.min(x0,x-hw);y0=Math.min(y0,y-hh);x1=Math.max(x1,x+hw);y1=Math.max(y1,y+hh);
  }
  // Keep controls reachable even when background artwork extends outside the canvas.
  x0=Math.max(12,Math.min(st.W-28,x0));y0=Math.max(36,Math.min(st.H-28,y0));x1=Math.max(x0+16,Math.min(st.W-12,x1));y1=Math.max(y0+16,Math.min(st.H-12,y1));
  const cx=(x0+x1)/2;
  return `<g data-editor="true" fill="white" stroke="#2b7cff" stroke-width="2"><rect x="${x0}" y="${y0}" width="${Math.max(1,x1-x0)}" height="${Math.max(1,y1-y0)}" fill="none" stroke-dasharray="5 5" pointer-events="none"/><path d="M${cx} ${y0}V${y0-22}" pointer-events="none"/><circle data-handle="rotate" cx="${cx}" cy="${y0-22}" r="8" style="cursor:grab"><title>Поворот всей группы</title></circle><rect data-handle="scale" x="${x1-8}" y="${y1-8}" width="16" height="16" style="cursor:nwse-resize"><title>Масштаб всей группы</title></rect></g>`;
}
function makeItem(o, mode, n = null, x = st.W / 2, y = st.H / 2) {
  const sc = n === null ? (st.items[0]?.sc ?? baseK(4)) : baseK(n);
  return { uid: uid++, id: o.id, x, y, rot: 0, mode, sc, r: 0.3 * Math.hypot(o.w, o.h) * sc, hw: o.w * sc / 2, hh: o.h * sc / 2 };
}

function tf(it, w, h, s) {
  return `translate(${(st.W/2+(it.x-st.W/2)*st.gs).toFixed(3)} ${(st.H/2+(it.y-st.H/2)*st.gs).toFixed(3)}) rotate(${it.rot}) scale(${s.toFixed(4)}) translate(${-w / 2} ${-h / 2})`;
}

// exp=true: чистый SVG для экспорта (без рамки выделения и невидимых областей клика)
function buildSvg(exp) {
  let g = '';
  for (const it of st.items) {
    const o = obj(it.id); if (!o) continue;
    const { inner, w, h, f } = draw(o, it.mode, 'item-'+it.uid), s = it.sc * st.gs * f;
    if (exp) { g += `<g transform="${tf(it, w, h, s)}">${inner}</g>`; continue; }
    g += `<g data-uid="${it.uid}" style="cursor:move" transform="${tf(it, w, h, s)}"><rect width="${w}" height="${h}" fill="transparent"/>${inner}</g>`;
    if (it.uid === st.sel) g += `<rect transform="${tf(it, w, h, s)}" width="${w}" height="${h}" fill="none" stroke="#2b7cff" stroke-width="${(2 / s).toFixed(2)}" stroke-dasharray="${(6 / s).toFixed(1)}" pointer-events="none"/>`;
  }
  return `<defs><clipPath id="cv-clip" clipPathUnits="userSpaceOnUse"><rect width="${st.W}" height="${st.H}"/></clipPath></defs><rect width="${st.W}" height="${st.H}" fill="${palette().canvas}"/><g clip-path="url(#cv-clip)">${g}</g>${exp ? '' : groupControls()}`;
}

function render() {
  const c = $('#cvs');
  c.setAttribute('viewBox', `0 0 ${st.W} ${st.H}`);
  c.style.aspectRatio = `${st.W}/${st.H}`;
  c.innerHTML = buildSvg(false);
  document.querySelectorAll('#bar [data-a]').forEach(b => {
    b.disabled=st.sel==null;
    if (b.dataset.a==='mode') {const it=st.items.find(i=>i.uid===st.sel);b.disabled ||= it?.mode==='main' && !!obj(it.id)?.noBg;}
  });
  $('#undo').disabled=!history.length;
  $('#pal').value=st.palId; $('#cv').value=st.W+'x'+st.H; $('#gs').value=st.gs;
  document.querySelector('[name=sz][value='+st.size+']').checked=true;
}

function renderLib() {
  $('#cnt').textContent = `(${st.catalog.length})`;
  $('#lib').innerHTML = '';
  for (const o of st.catalog) {
    const { inner, w, h } = draw(o, 'main', 'lib-'+o.id), b = document.createElement('button');
    b.title = 'Добавить на холст';
    b.innerHTML = `<svg viewBox="0 0 ${w} ${h}">${inner}</svg><span>${esc(o.name)}</span>`;
    b.onclick = () => { save(); const it = makeItem(o, 'main'); st.items.push(it); st.sel = it.uid; render(); };
    $('#lib').append(b);
  }
}

let composing=false, composeVersion=0, shuffleCount=0;
async function compose(shuffle=false) {
  const text = $('#prompt').value.trim(), scen = document.querySelector('[name=sc]:checked').value;
  const notes = $('#notes');
  if (!text) { notes.textContent = 'Введите метафору или названия компонентов.'; return; }
  if (composing) return;
  const version=++composeVersion;
  composing=true; $('#gen').disabled=$('#shuffle').disabled=true;
  const seedText=scen+'|'+text;
  st.seed = 2166136261;
  for (const c of seedText) st.seed=Math.imul(st.seed^c.charCodeAt(0),16777619)>>>0;
  if (shuffle) st.seed=(st.seed+(++shuffleCount))>>>0;
  const rand = rng(st.seed);
  let pick, key = '';
  try { key = localStorage.getItem('claude_key') || ''; } catch {}
  if (scen === 'metaphor' && key) {
    notes.textContent = 'ИИ разбирает метафору…';
    try { pick = await pickByLLM(text, st.catalog, key, rand, { model: (localStorage.getItem('llm_model') || '').trim() || undefined }); }
    catch (err) { pick = pickByMetaphor(text, st.catalog, rand); pick.notes.unshift('ИИ недоступен (' + err.message + '), использован локальный подбор.'); }
  } else pick = (scen === 'names' ? pickByNames : pickByMetaphor)(text, st.catalog, rand);
  if (version!==composeVersion) return;
  composing=false; $('#gen').disabled=$('#shuffle').disabled=false;
  notes.textContent = pick.notes.join(' ');
  if (!pick.main.length) return;
  const useBg = $('#useBg').checked;
  const n = pick.main.length + (useBg ? pick.bg.length : 0);
  const bg = useBg ? pick.bg.map(o => makeItem(o, 'bg', n)) : [];
  const main = pick.main.map(o => makeItem(o, 'main', n));
  // фон раскладывается первым и лежит под главными объектами
  layout(bg, st.W, st.H, rand); layout(main, st.W, st.H, rand); relax(main);
  save(); drag=null; st.gs=1;
  st.items = [...bg, ...main];
  fit(st.items, st.W, st.H, 0.88, main);
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
  if (e.button!==0) return;
  const handle=e.target.closest('[data-handle]'),g=e.target.closest('[data-uid]'),p=pt(e);
  if ((handle||g) && composing) {cancelCompose();$('#notes').textContent='Автосборка отменена ручным изменением.';}
  if (handle) {
    save();
    drag={kind:handle.dataset.handle,p,gs:st.gs,items:structuredClone(st.items),angle:Math.atan2(p.y-st.H/2,p.x-st.W/2),distance:Math.max(1,Math.hypot(p.x-st.W/2,p.y-st.H/2))};
  } else {
    st.sel=g ? +g.dataset.uid : null;
    if (g) {
      const it=st.items.find(i=>i.uid===st.sel);
      drag={kind:'move',it,dx:it.x-(st.W/2+(p.x-st.W/2)/st.gs),dy:it.y-(st.H/2+(p.y-st.H/2)/st.gs),started:false,p};
    }
  }
  if (drag) {e.preventDefault();$('#cvs').setPointerCapture(e.pointerId);}
  render();
});
addEventListener('pointermove', e => {
  if (!drag) return;
  const p=pt(e);
  if (drag.kind==='move') {
    if (!drag.started && Math.hypot(p.x-drag.p.x,p.y-drag.p.y)<2) return;
    if (!drag.started) {save();drag.started=true;}
    const snap=v=>e.shiftKey ? v : Math.round(v/10)*10;
    drag.it.x=snap(st.W/2+(p.x-st.W/2)/st.gs+drag.dx);
    drag.it.y=snap(st.H/2+(p.y-st.H/2)/st.gs+drag.dy);
  } else if (drag.kind==='scale') {
    st.gs=Math.max(0.5,Math.min(1.6,drag.gs*Math.hypot(p.x-st.W/2,p.y-st.H/2)/drag.distance));
  } else {
    let angle=Math.atan2(p.y-st.H/2,p.x-st.W/2)-drag.angle;
    if (!e.shiftKey) angle=Math.round(angle/(Math.PI/12))*(Math.PI/12);
    st.items=drag.items.map(i=>({...i,x:st.W/2+(i.x-st.W/2)*Math.cos(angle)-(i.y-st.H/2)*Math.sin(angle),y:st.H/2+(i.x-st.W/2)*Math.sin(angle)+(i.y-st.H/2)*Math.cos(angle),rot:i.rot+angle*180/Math.PI}));
  }
  render();
});
addEventListener('pointerup', () => {drag=null;});
addEventListener('pointercancel', () => {if (drag && (drag.kind!=='move'||drag.started)) undo();drag=null;scaling=false;});


function act(a) {
  const i = st.items.findIndex(x => x.uid === st.sel); if (i < 0) return;
  const it = st.items[i];
  if (a==='mode' && it.mode==='main' && obj(it.id).noBg) return;
  save();
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
  if (/INPUT|TEXTAREA|SELECT/.test(e.target.tagName) || e.target.isContentEditable) return;
  if ((e.ctrlKey||e.metaKey) && e.key.toLowerCase()==='z') { e.preventDefault();undo();return; }
  if (e.key==='Escape') {st.sel=null;render();return;}
  if (e.key==='Delete'||e.key==='Backspace') e.preventDefault();
  if (e.key === 'Delete' || e.key === 'Backspace') act('del');
  if (e.key === 'r' || e.key === 'к') act('rr');
});

// --- параметры
$('#gen').onclick = () => compose();
$('#shuffle').onclick = () => compose(true);
document.querySelectorAll('[name=sz]').forEach(r => r.onchange = () => { save(); st.size = r.value; renderLib(); render(); });
$('#pal').onchange = e => { save(); st.palId = e.target.value; renderLib(); render(); };
$('#cv').onchange = e => {
  const [w, h] = e.target.value.split('x').map(Number), kx = w / st.W, ky = h / st.H;
  save(); st.W = w; st.H = h; st.items.forEach(i => { i.x *= kx; i.y *= ky; });
  render();
};
let scaling=false;
$('#gs').onpointerdown=()=>{save();scaling=true;};
addEventListener('pointerup',()=>{scaling=false;});
$('#gs').oninput = e => { if (!scaling) save(); st.gs = +e.target.value; render(); };
$('#undo').onclick=undo;
$('#clear').onclick = () => { save(); composeVersion++; st.items = []; st.sel = null; render(); };

const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" })[c]);
function fillPal() {
  $('#pal').innerHTML = Object.entries(st.pal).map(([k, v]) => `<option value="${k}">${esc(v.name)}</option>`).join('');
  $('#pal').value = st.palId;
}
$('#palFile').onchange = async e => {
  const f = e.target.files[0]; if (!f) return;
  try {
    const id = 'u' + Date.now();
    const txt = await f.text(); let j; try { j = JSON.parse(txt); } catch { j = txt.match(/#[0-9a-f]{6}\b|#[0-9a-f]{3}\b/gi) || []; }
    const loaded=parsePalette(j, palette()); save(); st.pal[id]=loaded;
    st.palId = id; fillPal(); renderLib(); render();
  } catch (err) { $('#notes').textContent = 'Палитра не принята: ' + err.message; }
  e.target.value = '';
};
$('#svgFile').onchange = async e => {
  for (const f of e.target.files) {
    const text = await f.text(), name = f.name.replace(/\.svg$/i, '');
    let dim; try { dim = renderObject(text, { dst: palette() }); } catch (err) { $('#notes').textContent = `Файл ${f.name} не принят: ${err.message}.`; continue; }
    const id = 'x' + Date.now() + Math.random().toString(36).slice(2, 5);
    st.svg[id] = text;
    st.catalog.push({ id, name, file: id, w: dim.w, h: dim.h, tags: name.replace(/[-_]/g, ' ') });
  }
  renderLib(); e.target.value = '';
};
$('#export').onclick = () => {
  const s = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${st.W}" height="${st.H}" viewBox="0 0 ${st.W} ${st.H}">${buildSvg(true)}</svg>`;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([s], { type: 'image/svg+xml' }));
  a.download = 'composition.svg'; a.click(); setTimeout(()=>URL.revokeObjectURL(a.href),1000);
};

const keyEl = $("#apiKey");
try { keyEl.value = localStorage.getItem("claude_key") || ""; } catch {}
const modelEl = $("#llmModel");
try { modelEl.value = localStorage.getItem("llm_model") || ""; } catch {}
modelEl.onchange = () => { try { localStorage.setItem("llm_model", modelEl.value.trim()); } catch {} };
keyEl.onchange = () => { try { localStorage.setItem("claude_key", keyEl.value.trim()); } catch {} };
// --- старт
(async () => {
  st.catalog = await (await fetch('catalog/manifest.json')).json();
  const files = new Set(st.catalog.flatMap(o => [o.file, o.bg, o.s, o.sbg].filter(Boolean)));
  await Promise.all([...files].map(async f => { st.svg[f] = await (await fetch('catalog/' + f)).text(); }));
  fillPal(); renderLib(); render();
  // Готовые ссылки: ?q=текст&mode=names&pal=orange&size=S&canvas=1080x1080&dump=1 (dump кладёт экспортный SVG в #dump)
  const q = new URLSearchParams(location.search);
  if (st.pal[q.get('pal')]) { st.palId = q.get('pal'); $('#pal').value = st.palId; }
  if (q.get('size') === 'S') { st.size = 'S'; document.querySelector('[name=sz][value=S]').checked = true; }
  if (/^\d+x\d+$/.test(q.get('canvas') || '')) { [st.W, st.H] = q.get('canvas').split('x').map(Number); $('#cv').value = q.get('canvas'); }
  renderLib(); render();
  if (q.get("q")) {
    $("#prompt").value = q.get("q"); if (q.get("mode") === "names") document.querySelector("[name=sc][value=names]").checked = true;
    await compose();
    if (q.get('dump')) { const pre = document.createElement('pre'); pre.id = 'dump'; pre.textContent = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${st.W}" height="${st.H}" viewBox="0 0 ${st.W} ${st.H}">${buildSvg(true)}</svg>`; document.body.append(pre); }
  }
  window.__st = st; // для отладки в консоли
})();
