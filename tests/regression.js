import { renderObject, nearestRole } from '../src/recolor.js';
import { PALETTES, parsePalette } from '../src/palettes.js';
import { pickByLLM, rng } from '../src/compose.js';
const results = [];
const assert = (ok, message) => { if (!ok) throw Error(message); };
const test = async (name, run) => { try { await run(); results.push({ name, pass:true }); } catch (e) { results.push({ name, pass:false, error:e.message }); } };
const svg = body => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="10 20 100 80" fill="none" stroke="#181817">${body}</svg>`;
const render = (text, options={}) => renderObject(text, {dst:PALETTES.orange, ...options});
const parse = inner => new DOMParser().parseFromString(`<svg xmlns="http://www.w3.org/2000/svg">${inner}</svg>`, 'image/svg+xml');
await test('Inherited root paints survive; geometry unchanged', () => {
  const d = parse(render(svg('<path d="M1 2L3 4"/>')).inner), p = d.querySelector('path');
  assert(p.getAttribute('d') === 'M1 2L3 4', 'path changed');
  assert(p.closest('[fill="none"]') && p.closest('[stroke]'), 'root presentation lost');
});
await test('Local gradient/clip/use IDs isolated between copies', () => {
  const text=svg('<defs><linearGradient id="paint"><stop stop-color="#7864D7"/></linearGradient><path id="shape" d="M0 0L10 10"/></defs><use href="#shape" fill="url(#paint)"/>');
  const a=render(text,{prefix:'a'}).inner,b=render(text,{prefix:'b'}).inner,d=parse(a+b);
  const ids=[...d.querySelectorAll('[id]')].map(e=>e.id);
  assert(new Set(ids).size===ids.length,'duplicate IDs');
  assert(d.querySelector('stop').getAttribute('stop-color')===PALETTES.orange.m3,'gradient not recolored');
});
await test('Inline style paints follow palette', () => {
  const d=parse(render(svg('<path style="fill:#7864D7;stroke:#181817;stroke-width:2" d="M0 0L10 10"/>')).inner);
  assert(d.querySelector('path').getAttribute('fill')===PALETTES.orange.m3,'style bypasses recolor');
});
for (const [name, text] of Object.entries({
  script:svg('<script>alert(1)</script>'), event:'<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><path/></svg>',
  js:svg('<use href="javascript:alert(1)"/>'), external:svg('<use href="https://example.com/x.svg#a"/>'),
  image:svg('<image href="data:image/svg+xml,evil"/>'), css:svg('<style>body{display:none}</style>'),
  cssURL:svg('<path style="fill:url(https://example.com/x)"/>'), html:'<html xmlns="http://www.w3.org/1999/xhtml"><img src="x" onerror="alert(1)"/></html>',
})) await test(`Reject unsafe SVG: ${name}`, () => { let rejected=false; try {render(text);} catch {rejected=true;} assert(rejected,'unsafe input accepted'); });
await test('Palette rejects null, empty objects and invalid colors', () => {
  for (const value of [null,{},42,{m1:'red'},[]]) {let bad=false;try{parsePalette(value,PALETTES.purple);}catch{bad=true;}assert(bad,'invalid palette accepted');}
});
await test('Palette list derives monochrome background from new main colors', () => {
  const p=parsePalette(['#fff','#eee','#aaa','#555','#fee','#faa','#ff0'],PALETTES.purple);
  assert(p.b1===p.m1 && p.b2===p.m3,'background retains old palette');
});
await test('nearestRole handles shorthand, case and invalid color', () => {
  assert(nearestRole('#fff')==='paper' && nearestRole('#7864d7')==='m3','role mismatch');
  assert(nearestRole('not-a-color')===null,'invalid color accepted');
});
const catalog=await (await fetch('../catalog/manifest.json')).json();
await test('All 40 catalog variants retain path data and geometry attributes',async()=>{
  for(const o of catalog)for(const key of ['file','bg','s','sbg']){
    const text=await(await fetch('../catalog/'+o[key])).text(),source=new DOMParser().parseFromString(text,'image/svg+xml');
    const rendered=parse(renderObject(text,{dst:PALETTES.purple,mode:key.includes('bg')?'bg':'main'}).inner);
    const attrs=['d','x','y','width','height','points','cx','cy','r','rx','ry','stroke-width'];
    const geometry=d=>[...d.querySelectorAll('path,rect,circle,ellipse,line,polyline,polygon')].map(e=>[e.localName,...attrs.map(a=>e.getAttribute(a))]);
    assert(JSON.stringify(geometry(source))===JSON.stringify(geometry(rendered)),o[key]+' geometry changed');
    assert(!rendered.querySelector('parsererror'),o[key]+' invalid XML');
  }
});
const originalFetch=globalThis.fetch;
await test('LLM validates IDs, deduplicates, respects noBg and model',async()=>{
  globalThis.fetch=async(url,init)=>{assert(JSON.parse(init.body).model==='claude-haiku-5-5','model changed'); return new Response(JSON.stringify({content:[{text:JSON.stringify({main:['coin','coin'],bg:['wallet','coin','missing'],why:'test'})}]}));};
  const out=await pickByLLM('test',catalog.map(o=>({...o,noBg:o.id==='wallet'})),'fake',rng(1));
  assert(out.main.length===1 && out.bg.every(o=>o.id!=='wallet' && o.id!=='coin'),'invalid selection');
});
await test('LLM rejects malformed structure',async()=>{
  for (const value of [{main:'coin'},{main:[]},{main:['unknown']},{main:['coin'],bg:42},{main:['coin'],why:{x:1}}]) {
    globalThis.fetch=async()=>new Response(JSON.stringify({content:[{text:JSON.stringify(value)}]}));
    let bad=false;try{await pickByLLM('test',catalog,'fake',rng(1));}catch{bad=true;}assert(bad,'invalid LLM response accepted');
  }
});
globalThis.fetch=originalFetch;
window.testResults=results;
document.querySelector('#results').textContent=JSON.stringify({passed:results.filter(r=>r.pass).length,failed:results.filter(r=>!r.pass).length,results},null,2);
