export const rng = a => () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
const stem = w => w.toLowerCase().replace(/ё/g, 'е').slice(0, 5);
const tok = s => (s.toLowerCase().replace(/ё/g, 'е').match(/[a-zа-я0-9]+/g) || []).filter(w => w.length > 2);
const score = (o, tokens) => { const keys = new Set(tok(o.tags + ' ' + o.name).map(stem)); return tokens.reduce((s, t) => s + (keys.has(stem(t)) ? 1 : 0), 0); };

// Смысловые группы: абстрактное понятие -> подходящие объекты. Работает без интернета и ключей.
const CONCEPTS = [
  ['рост развитие карьера успех достижение прогресс цель вырасти масштаб', ['tulips', 'book', 'coin']],
  ['команда сотрудничество партнерство вместе коллектив совместный интеграция', ['puzzle', 'phone', 'folder']],
  ['творчество вдохновение креатив фантазия искусство дизайн', ['lamp', 'pen', 'tulips']],
  ['общение связь поддержка контакт клиент сообщество диалог', ['phone', 'headphones', 'puzzle']],
  ['безопасность защита доверие надежность гарантия страховка', ['wallet', 'folder', 'coin']],
  ['время планирование организация порядок дисциплина расписание процесс', ['folder', 'pen', 'lamp', 'book']],
  ['отдых расслабление релакс спокойствие баланс стресс тишина', ['headphones', 'tulips', 'lamp']],
  ['здоровье забота уход семья дом', ['tulips', 'book', 'lamp']],
  ['технологии цифровой онлайн сервис платформа инновации автоматизация данные', ['phone', 'puzzle', 'headphones']],
  ['бизнес инвестиции экономия стартап продажи экономика банк кредит', ['coin', 'wallet', 'folder']],
  ['знания учеба навыки наука исследование карьера экзамен', ['book', 'lamp', 'pen']],
  ['решение проблема вызов сложность стратегия поиск', ['puzzle', 'lamp', 'folder']],
];
function conceptScore(o, tokens) {
  const ts = new Set(tokens.map(stem)); let s = 0;
  for (const [words, ids] of CONCEPTS) {
    const hit = words.split(' ').some(w => ts.has(stem(w)));
    if (hit && ids.includes(o.id)) s += 2 - ids.indexOf(o.id) * 0.2;
  }
  return s;
}
const bgPool = (catalog, main, rand) => catalog.filter(o => !main.includes(o) && !o.noBg).sort(() => rand() - 0.5);

// Сценарий 1 без LLM: теги + смысловые группы.
export function pickByMetaphor(text, catalog, rand, nMain = 4, nBg = 3) {
  const t = tok(text), notes = [];
  const scored = catalog.map(o => ({ o, s: score(o, t) + conceptScore(o, t) + rand() * 0.01 })).sort((a, b) => b.s - a.s);
  let main = scored.filter(x => x.s >= 1).slice(0, nMain).map(x => x.o);
  if (!main.length) {
    notes.push('Метафора не распознана без ИИ — подобран универсальный набор. Для точного анализа введите ключ Claude API.');
    main = ['book', 'lamp', 'phone', 'pen'].map(id => catalog.find(o => o.id === id)).filter(Boolean);
  }
  return { main, bg: bgPool(catalog, main, rand).slice(0, nBg), notes };
}
// Сценарий 2: список названий компонентов -> объекты (порядок и повторы сохраняются).
export function pickByNames(text, catalog, rand, nBg = 3) {
  const notes = [], main = [];
  for (const part of text.split(/[,;\n]+/).map(s => s.trim()).filter(Boolean)) {
    const t = tok(part); if (!t.length) continue;
    const best = catalog.map(o => ({ o, s: score(o, t) + (o.name.toLowerCase() === part.toLowerCase() ? 5 : 0) })).sort((a, b) => b.s - a.s)[0];
    if (best && best.s > 0) main.push(best.o); else notes.push(`Не нашёл компонент «${part}».`);
  }
  return { main, bg: main.length ? bgPool(catalog, main, rand).slice(0, nBg) : [], notes };
}

// Сценарий 1 с ИИ: Claude сам разбирает метафору и выбирает объекты из каталога.
// Ключ вводит пользователь и хранится только в его браузере (запрос идёт напрямую в API).
export async function pickByLLM(text, catalog, key, rand) {
  const list = catalog.map(o => `${o.id} — ${o.name} (${o.tags.split(' ').slice(0, 8).join(', ')})`).join('\n');
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
    body: JSON.stringify({
      model: 'claude-haiku-5-5', max_tokens: 400,
      system: 'Ты подбираешь иллюстративные объекты для композиции под метафору или заголовок. Выбирай ТОЛЬКО id из списка. Отвечай одним JSON без пояснений: {"main":[3-4 id главных объектов, самые образные],"bg":[2-3 id фоновых],"why":"одна фраза"}.',
      messages: [{ role: 'user', content: `Метафора/заголовок: «${text}»\n\nДоступные объекты:\n${list}` }],
    }),
  });
  if (!res.ok) throw new Error('API ' + res.status);
  const data = await res.json();
  const raw = (data.content || []).map(c => c.text || '').join('');
  const j = JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1));
  const byId = id => catalog.find(o => o.id === id);
  const main = (j.main || []).map(byId).filter(Boolean);
  if (!main.length) throw new Error('пустой ответ');
  const bg = (j.bg || []).map(byId).filter(o => o && !main.includes(o) && !o.noBg);
  return { main, bg: bg.length ? bg : bgPool(catalog, main, rand).slice(0, 3), notes: j.why ? ['ИИ: ' + j.why] : [] };
}

// Раскладка: сначала случайные позиции с минимальным пересечением, затем «расталкивание» главных объектов.
export function layout(list, W, H, rand) {
  const placed = [], pad = Math.min(W, H) * 0.1;
  for (const it of list) {
    let best = null;
    for (let k = 0; k < 80; k++) {
      const x = pad + it.r + rand() * Math.max(1, W - 2 * pad - 2 * it.r), y = pad + it.r + rand() * Math.max(1, H - 2 * pad - 2 * it.r);
      let pen = 0; for (const p of placed) pen += Math.max(0, (p.r + it.r) * 0.75 - Math.hypot(p.x - x, p.y - y));
      if (!best || pen < best.pen) best = { x, y, pen };
    }
    it.x = best.x; it.y = best.y; placed.push(it);
  }
  return list;
}
export function relax(list, iters = 60) {
  for (let k = 0; k < iters; k++) for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
    const a = list[i], b = list[j], dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1, min = (a.r + b.r) * 0.8;
    if (d < min) { const m = (min - d) / 2 / d; a.x -= dx * m; a.y -= dy * m; b.x += dx * m; b.y += dy * m; }
  }
}
// Вписывает всю композицию в холст: масштабирует и центрирует так, чтобы не было пустот и вылетов за край.
export function fit(items, W, H, fill = 0.9, basis = items) {
  if (!basis.length) return;
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const i of basis) { x0 = Math.min(x0, i.x - i.hw); x1 = Math.max(x1, i.x + i.hw); y0 = Math.min(y0, i.y - i.hh); y1 = Math.max(y1, i.y + i.hh); }
  const bw = x1 - x0, bh = y1 - y0, cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  const s = Math.min(W * fill / bw, H * fill / bh, 1.7);
  for (const i of items) { i.x = W / 2 + (i.x - cx) * s; i.y = H / 2 + (i.y - cy) * s; i.sc *= s; i.hw *= s; i.hh *= s; i.r *= s; }
}
