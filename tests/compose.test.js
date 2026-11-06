import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pickByLLM, pickByMetaphor, pickByNames, rng, layout } from '../src/compose.js';
import { parsePalette, PALETTES } from '../src/palettes.js';
const catalog=JSON.parse(await readFile(new URL('../catalog/manifest.json',import.meta.url)));

test('Подбор имён сохраняет порядок, повторы и сообщает неизвестное имя',()=>{
  const p=pickByNames('кошелёк, монета, ручка, монета, несуществующий',catalog,rng(1));
  assert.deepEqual(p.main.map(o=>o.id),['wallet','coin','pen','coin']);assert.equal(p.notes.length,1);
});
test('Фоны соблюдают noBg и не повторяют главные объекты',()=>{
  const c=catalog.map(o=>({...o,noBg:true}));assert.deepEqual(pickByMetaphor('рост команды',c,rng(1)).bg,[]);
});
test('Seed воспроизводит подбор и позиции',()=>{
  const run=()=>{const rand=rng(123),p=pickByMetaphor('рост команды',catalog,rand);return layout(p.main.map(o=>({id:o.id,r:20})),800,600,rand);};
  assert.deepEqual(run(),run());
});
test('Палитра принимает текстовые роли, отклоняет неверный JSON',()=>{
  assert.equal(parsePalette({m1:'#abc'},PALETTES.purple).b1,'#abc');
  for(const p of [null,{},true,{m1:'url(x)'},['#fff','red']])assert.throws(()=>parsePalette(p));
});
test('ИИ: схема, дедупликация, noBg, max, модель и пустой bg',async t=>{
  let body;
  t.mock.method(globalThis,'fetch',async(url,init)=>{body=JSON.parse(init.body);assert.equal(url,'https://api.anthropic.com/v1/messages');assert.ok(init.signal instanceof AbortSignal);return new Response(JSON.stringify({content:[{type:'text',text:'```json\n'+JSON.stringify({main:['coin','coin','wallet','folder','pen','book','lamp'],bg:[]})+'\n```'}]}));});
  const p=await pickByLLM('test',catalog,'fake',rng(1));assert.equal(body.model,'claude-haiku-5-5');assert.equal(body.thinking?.type,'disabled');assert.equal(body.output_config?.effort,'low');assert.equal(p.main.length,4);assert.deepEqual(p.bg,[]);
});
test('ИИ: HTTP, JSON, отсутствующий content и неверная схема отклоняются',async t=>{
  let response;
  t.mock.method(globalThis,'fetch',async()=>response);
  for(const r of [new Response('',{status:401}),new Response('not JSON'),new Response('{}'),new Response(JSON.stringify({stop_reason:'refusal',content:[{type:'text',text:'{"main":["coin"]}'}]})),new Response(JSON.stringify({stop_reason:'max_tokens',content:[{type:'text',text:'{"main":["coin"]}'}]})),new Response(JSON.stringify({content:[{type:'thinking',text:'{"main":["coin"]}'}]})),new Response(JSON.stringify({content:[{type:'text',text:'{"main":"coin"}'}]}))]){
    response=r;await assert.rejects(pickByLLM('test',catalog,'fake',rng(1)));
  }
});
test('ИИ: истечение 15 секунд прерывает fetch',async t=>{
  const timeout=AbortSignal.timeout.bind(AbortSignal);
  t.mock.method(AbortSignal,'timeout',ms=>{assert.equal(ms,15000);return timeout(2);});
  t.mock.method(globalThis,'fetch',async(url,{signal})=>new Promise((resolve,reject)=>{
    // Keep the test alive; native AbortSignal.timeout alone is unref'ed in Node.
    const timer=setTimeout(()=>reject(Error('signal did not abort')),500);
    signal.addEventListener('abort',()=>{clearTimeout(timer);reject(signal.reason);},{once:true});
  }));
  await assert.rejects(pickByLLM('test',catalog,'fake',rng(1)),{name:'TimeoutError'});
});
