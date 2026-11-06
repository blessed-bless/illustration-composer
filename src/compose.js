export const rng = a => () => { a|=0; a=a+0x6D2B79F5|0; let t=Math.imul(a^a>>>15,1|a); t=t+Math.imul(t^t>>>7,61|t)^t; return ((t^t>>>14)>>>0)/4294967296; };
const stem = w => w.toLowerCase().replace(/ё/g,'е').slice(0,5);
const tok = s => (s.toLowerCase().replace(/ё/g,'е').match(/[a-zа-я0-9]+/g) || []).filter(w => w.length > 2);
const score = (o, tokens) => { const keys = new Set(tok(o.tags + ' ' + o.name).map(stem)); return tokens.reduce((s,t) => s + (keys.has(stem(t)) ? 1 : 0), 0); };

// Сценарий 1: метафора/заголовок -> объекты. Точка замены на LLM: функция должна вернуть {main, bg, notes}.
export function pickByMetaphor(text, catalog, rand, nMain = 4, nBg = 3) {
  const t = tok(text), notes = [];
  const scored = catalog.map(o => ({ o, s: score(o, t) + rand() * 0.01 })).sort((a,b) => b.s - a.s);
  let main = scored.filter(x => x.s >= 1).slice(0, nMain).map(x => x.o);
  if (!main.length) { notes.push('Подходящих по смыслу объектов не нашлось — взяты случайные.'); main = scored.slice(0, 3).map(x => x.o); }
  const rest = catalog.filter(o => !main.includes(o)).sort(() => rand() - 0.5);
  return { main, bg: rest.slice(0, nBg), notes };
}
// Сценарий 2: список названий компонентов -> объекты (порядок и повторы сохраняются).
export function pickByNames(text, catalog, rand, nBg = 3) {
  const notes = [], main = [];
  for (const part of text.split(/[,;\n]+/).map(s => s.trim()).filter(Boolean)) {
    const t = tok(part); if (!t.length) continue;
    const best = catalog.map(o => ({ o, s: score(o, t) + (o.name.toLowerCase() === part.toLowerCase() ? 5 : 0) })).sort((a,b) => b.s - a.s)[0];
    if (best && best.s > 0) main.push(best.o); else notes.push(`Не нашёл компонент «${part}».`);
  }
  const rest = catalog.filter(o => !main.includes(o)).sort(() => rand() - 0.5);
  return { main, bg: main.length ? rest.slice(0, nBg) : [], notes };
}
// Раскладка без сильных наложений: перебираем кандидатов и берём позицию с минимальным пересечением.
export function layout(list, W, H, rand) {
  const placed = [], pad = Math.min(W,H) * 0.1;
  for (const it of list) {
    let best = null;
    for (let k = 0; k < 80; k++) {
      const x = pad + it.r + rand() * Math.max(1, W - 2*pad - 2*it.r), y = pad + it.r + rand() * Math.max(1, H - 2*pad - 2*it.r);
      let pen = 0; for (const p of placed) pen += Math.max(0, (p.r + it.r) * 0.75 - Math.hypot(p.x - x, p.y - y));
      if (!best || pen < best.pen) best = { x, y, pen };
    }
    it.x = best.x; it.y = best.y; placed.push(it);
  }
  return list;
}
