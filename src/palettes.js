// Роли цветов: ink/paper — контур и белый; m1-m3 — оттенки главных объектов;
// a1-a3 — акценты; b1-b2 — оттенки фоновых (монохромных) объектов.
export const PALETTES = {
  // Значения взяты из исходного макета Figma («Цвета объектов» / «Цвета фона»).
  purple: { name:'Фиолетовая', canvas:'#D7CDF5', ink:'#181817', paper:'#FFFFFF', m1:'#D7CDF5', m2:'#AA9BF0', m3:'#7864D7', a1:'#FFE3E1', a2:'#F9A3AA', a3:'#F9ECB0', b1:'#D7CDF5', b2:'#7864D7' },
  orange: { name:'Оранжевая',  canvas:'#FDD7B9', ink:'#181817', paper:'#FFFFFF', m1:'#FDD7B9', m2:'#FAC896', m3:'#D27532', a1:'#BEEBEB', a2:'#80DADA', a3:'#F9ECB0', b1:'#FDD7B9', b2:'#D27532' },
  teal:   { name:'Бирюзовая',  canvas:'#BEEBEB', ink:'#181817', paper:'#FFFFFF', m1:'#BEEBEB', m2:'#80DADA', m3:'#5ABEBE', a1:'#B6C6FE', a2:'#6D7BFC', a3:'#FFD4F2', b1:'#BEEBEB', b2:'#5ABEBE' },
};
export const SOURCE = PALETTES.purple; // в какой схеме нарисованы исходные SVG
const ORDER = ['m1','m2','m3','a1','a2','a3','b1','b2'];
// Принимает {name, canvas, m1..}, либо массив hex-цветов (раскладывается по ролям).
export function parsePalette(json, base = SOURCE) {
  const ok = c => typeof c === 'string' && /^#?[0-9a-f]{3}([0-9a-f]{3})?$/i.test(c.trim());
  const fix = c => c.trim().startsWith('#') ? c.trim() : '#' + c.trim();
  const out = { ...base, name:'Загруженная' };
  if (Array.isArray(json)) {
    if (!json.length || !json.every(ok)) throw new Error('нужен список hex-цветов');
    out.canvas=fix(json[0]);
    json.slice(1).forEach((c,i)=>{ if (ORDER[i]) out[ORDER[i]]=fix(c); });
    if (json.length<=7) {out.b1=out.m1;out.b2=out.m3;}
    return out;
  }
  if (!json || typeof json !== 'object') throw new Error('нужна палитра JSON');
  const keys=['canvas','ink','paper',...ORDER].filter(k=>Object.hasOwn(json,k));
  if (!keys.length || keys.some(k=>!ok(json[k]))) throw new Error('некорректные hex-цвета');
  if (json.name) out.name=String(json.name);
  for (const k of keys) out[k]=fix(json[k]);
  if (!keys.includes('b1')) out.b1=out.m1;
  if (!keys.includes('b2')) out.b2=out.m3;
  return out;
}
