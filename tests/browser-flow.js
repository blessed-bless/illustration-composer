async (page) => {
  const results=[], errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  const assert=(v,m)=>{if(!v)throw Error(m);};
  const test=async(name,run)=>{try{const detail=await run();results.push({name,pass:true,detail});}catch(e){results.push({name,pass:false,error:e.message});}};
  const state=()=>page.evaluate(()=>structuredClone(window.__st));
  const click=a=>page.locator('[data-a='+a+']').click();
  const selected=async()=>{const s=await state();return s.items.find(i=>i.uid===s.sel);};
  const snap=async name=>page.screenshot({path:'output/playwright/'+name+'.png',fullPage:true});
  const build=async(text,names=false)=>{
    await page.locator('[name=sc][value='+(names?'names':'metaphor')+']').check();
    await page.locator('#prompt').fill(text);await page.locator('#gen').click();
    await page.waitForFunction(()=>!document.querySelector('#gen').disabled);
  };
  await page.setViewportSize({width:1440,height:1000});
  await page.goto('http://localhost:5173/');
  await page.waitForFunction(()=>window.__st?.catalog.length===10);
  await page.evaluate(()=>localStorage.removeItem('claude_key'));
  for(const [text,file,expected] of [['рост команды','01-growth',['tulips','puzzle']],['тишина и покой','02-calm',['headphones']],['деньги и безопасность','03-money',['wallet','coin']]]) await test('Метафора: '+text,async()=>{
    await build(text);const s=await state(),ids=s.items.filter(i=>i.mode==='main').map(i=>i.id);
    assert(expected.every(id=>ids.includes(id)),'missing thematic IDs: '+ids);await snap(file);return ids;
  });
  await test('Стабильный seed и новая раскладка',async()=>{
    const compact=s=>JSON.stringify(s.items.map(({uid,...i})=>i));
    const a=compact(await state());await page.locator('#gen').click();const b=compact(await state());
    assert(a===b,'same request differs');await page.locator('#shuffle').click();assert(b!==compact(await state()),'shuffle unchanged');
  });
  await test('Компоненты: кошелёк, монета, ручка',async()=>{
    await build('кошелёк, монета, ручка',true);const s=await state();
    assert(s.items.filter(i=>i.mode==='main').map(i=>i.id).join(',')==='wallet,coin,pen','wrong names');
    assert(new Set(s.items.map(i=>i.sc)).size===1,'relative scale differs');await snap('04-components');
  });
  await test('Три встроенные палитры',async()=>{
    for(const id of ['purple','orange','teal']){await page.locator('#pal').selectOption(id);assert((await state()).palId===id,'palette not selected');
      const paints=await page.locator('#cvs [fill]').evaluateAll(els=>els.map(e=>e.getAttribute('fill')));
      const allowed=Object.values((await state()).pal[id]);assert(paints.every(c=>['none','transparent'].includes(c)||allowed.includes(c)||c.startsWith('url(')),'paint outside palette');await snap('palette-'+id);}
  });
  await test('Загрузка palettes/example.json и hex-списка',async()=>{
    await page.locator('#palFile').setInputFiles('palettes/example.json');
    await page.waitForFunction(()=>window.__st.pal[window.__st.palId].name==='Пример (графитовая)');
    await snap('palette-json');
    await page.locator('#palFile').setInputFiles({name:'colors.txt',mimeType:'text/plain',buffer:Buffer.from('#f0f0f0\n#e0e0e0 #999999 #333333 #ffeeee #ffaaaa #ffff99')});
    await page.waitForFunction(()=>window.__st.pal[window.__st.palId].m3==='#333333');
    const s=await state(),p=s.pal[s.palId];assert(p.b1===p.m1&&p.b2===p.m3,'background palette leaked');await snap('palette-hex');
  });
  await test('L/S: все 10 объектов, оба состояния, равномерный масштаб',async()=>{
    const measurement=await page.evaluate(async()=>{
      const {renderObject}=await import('/src/recolor.js');const s=window.__st,p=s.pal[s.palId],rows=[];
      for(const o of s.catalog) for(const mode of ['main','bg']){
        const a=renderObject(s.svg[mode==='bg'?o.bg:o.file],{dst:p,mode});
        const b=renderObject(s.svg[mode==='bg'?o.sbg:o.s],{dst:p,mode});
        const f=Math.min(o.w/b.w,o.h/b.h);rows.push({id:o.id,mode,widthError:Math.abs(b.w*f/a.w-1),heightError:Math.abs(b.h*f/a.h-1)});
      }return rows;
    });
    assert(measurement.every(r=>r.widthError<0.02&&r.heightError<0.02),'L/S size differs by >2%');
    const transforms=await page.locator('#cvs [data-uid]').evaluateAll(els=>els.map(e=>e.getAttribute('transform')));
    await page.locator('[name=sz][value=S]').check();await snap('05-detail-S');
    await page.locator('[name=sz][value=L]').check();assert(JSON.stringify(transforms)===JSON.stringify(await page.locator('#cvs [data-uid]').evaluateAll(els=>els.map(e=>e.getAttribute('transform')))),'L round trip changed');return measurement;
  });
  await test('Библиотека, поворот ±15°, дубль, слои, главный/фон, удаление',async()=>{
    const before=(await state()).items.length;await page.locator('#lib button').filter({hasText:'Монета'}).click();
    let it=await selected();assert(it&&it.sc===(await state()).items[0].sc,'added item scale differs');
    await click('rr');assert((await selected()).rot===15,'rotate right');await click('rl');assert((await selected()).rot===0,'rotate left');
    await click('dup');assert((await state()).items.length===before+2,'duplicate');const uid=(await selected()).uid;
    await click('down');assert((await state()).items.at(-2).uid===uid,'layer down');await click('up');assert((await state()).items.at(-1).uid===uid,'layer up');
    await click('mode');assert((await selected()).mode==='bg','background mode');await click('mode');assert((await selected()).mode==='main','main mode');
    await click('del');assert((await state()).items.length===before+1,'delete');await page.locator('#undo').click();assert((await state()).items.length===before+2,'undo delete');
    await snap('06-editor');
  });
  await test('noBg соблюдается при ручном переключении',async()=>{
    await page.evaluate(()=>{const s=window.__st;s.catalog.find(o=>o.id==='coin').noBg=true;});
    // Select a fresh main coin to force the toolbar state to refresh.
    await page.locator('#lib button').filter({hasText:'Монета'}).click();
    assert(await page.locator('[data-a=mode]').isDisabled(),'forbidden background enabled');
    await page.evaluate(()=>delete window.__st.catalog.find(o=>o.id==='coin').noBg);
  });
  await test('Перетаскивание, привязка и Ctrl+Z',async()=>{
    const before=await selected(),g=page.locator('#cvs [data-uid="'+before.uid+'"]'),box=await g.boundingBox();
    const x=box.x+box.width/2,y=box.y+box.height/2;
    await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+31,y+23,{steps:5});await page.mouse.up();
    const it=await selected();assert(it.x%10===0&&it.y%10===0,'drag does not snap');
    await page.keyboard.press('Control+z');assert((await selected()).x===before.x,'undo drag');
  });
  await test('Масштаб всей группы, ручки поворота и масштаба',async()=>{
    const before=await state();
    await page.locator('#gs').fill('1.2');
    const pos=await page.locator('#cvs [data-uid]').first().evaluate(e=>({m:e.transform.baseVal.consolidate().matrix.e}));
    const first=before.items[0],expected=before.W/2+(first.x-before.W/2)*1.2;
    assert(Math.abs(pos.m-expected)<first.hw*2,'scale input failed');assert((await state()).gs===1.2,'gs');
    let box=await page.locator('[data-handle=rotate]').boundingBox();
    await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+80,box.y+40,{steps:5});await page.mouse.up();
    assert((await state()).items.some((i,k)=>i.rot!==before.items[k].rot),'group rotate');
    const rotated=await state();box=await page.locator('[data-handle=scale]').boundingBox();
    await page.mouse.move(box.x+8,box.y+8);await page.mouse.down();await page.mouse.move(box.x-40,box.y-40,{steps:5});await page.mouse.up();
    assert((await state()).gs!==rotated.gs,'group scale');assert(new Set((await state()).items.map(i=>i.sc)).size===1,'relative scale changed');
  });
  await test('Все размеры холста',async()=>{for(const cv of ['1080x1080','1200x628','600x800','800x600']){await page.locator('#cv').selectOption(cv);assert(await page.locator('#cvs').getAttribute('viewBox')==='0 0 '+cv.replace('x',' '),'canvas');}});
  await test('Очистить и отменить кнопкой/клавиатурой',async()=>{const n=(await state()).items.length;await page.locator('#clear').click();assert(!(await state()).items.length,'clear');await page.locator('#undo').click();assert((await state()).items.length===n,'undo clear');});
  await test('Экспорт SVG, XML, ID, ссылки, изолированный рендер',async()=>{
    const pending=page.waitForEvent('download');await page.locator('#export').click();const download=await pending;
    await download.saveAs('output/playwright/composition.svg');
    const response=await page.request.get('http://localhost:5173/output/playwright/composition.svg'),text=await response.text();
    const analysis=await page.evaluate(text=>{
      const d=new DOMParser().parseFromString(text,'image/svg+xml'),ids=[...d.querySelectorAll('[id]')].map(e=>e.id);
      const refs=[...text.matchAll(/url\(#([^)]+)\)/g)].map(m=>m[1]);
      return {parseError:!!d.querySelector('parsererror'),unique:new Set(ids).size===ids.length,refs:refs.every(id=>ids.includes(id)),ui:!!d.querySelector('[data-uid],[data-editor],[data-handle],[stroke="#2b7cff"],script,foreignObject,image'),paths:d.querySelectorAll('path').length,clip:d.querySelectorAll('clipPath').length};
    },text);
    assert(!analysis.parseError&&analysis.unique&&analysis.refs&&!analysis.ui&&analysis.paths>0,'invalid export '+JSON.stringify(analysis));
    const isolated=await page.context().browser().newContext({viewport:{width:1000,height:800}}),preview=await isolated.newPage();
    const requests=[];preview.on('request',r=>requests.push(r.url()));
    await preview.goto('http://localhost:5173/output/playwright/composition.svg');assert(await preview.locator('path').count()===analysis.paths,'isolated render differs');
    await preview.screenshot({path:'output/playwright/07-export-isolated.png'});assert(requests.every(url=>url.includes('localhost:5173')),'external request');await isolated.close();return analysis;
  });
  await test('ИИ: корректный ответ, ошибки HTTP/JSON/сети и локальный откат',async()=>{
    await page.evaluate(()=>localStorage.setItem('claude_key','fake-test-key'));
    const url='https://api.anthropic.com/v1/messages';
    for(const kind of ['valid','http','json','shape','network','timeout']){
      await page.route(url,async route=>{
        if(kind==='network'||kind==='timeout')return route.abort(kind==='timeout'?'timedout':'failed');
        const body=kind==='json'?'garbage':JSON.stringify({content:[{text:JSON.stringify(kind==='shape'?{main:42}:{main:['coin','wallet'],bg:[],why:'Тест'})}]});
        await route.fulfill({status:kind==='http'?401:200,contentType:'application/json',body});
      });
      await build('деньги и безопасность');const s=await state(),note=await page.locator('#notes').textContent();
      assert(s.items.some(i=>i.mode==='main'),'no fallback');assert(kind==='valid'?note.includes('ИИ: Тест'):note.includes('локальный подбор'),'wrong AI status '+kind+': '+note);
      await page.unroute(url);
    }
    await page.evaluate(()=>localStorage.removeItem('claude_key'));
  });
  await test('Загрузка SVG: CSS/скрипты/ссылки отклоняются без выполнения',async()=>{
    const n=(await state()).catalog.length;
    for(const body of ['<script>window.__pwn=1</script>','<style>body{display:none}</style>','<use href="https://example.com/x.svg#a"/>','<path onload="window.__pwn=1"/>']){
      await page.locator('#svgFile').setInputFiles({name:'unsafe.svg',mimeType:'image/svg+xml',buffer:Buffer.from('<svg xmlns="http://www.w3.org/2000/svg">'+body+'</svg>')});
      await page.waitForFunction(()=>document.querySelector('#svgFile').value==='');assert((await state()).catalog.length===n,'unsafe upload accepted');
    }
    assert(!await page.evaluate(()=>window.__pwn),'XSS executed');
    const safe='<svg xmlns="http://www.w3.org/2000/svg" viewBox="10 20 100 80" fill="none"><defs><linearGradient id="p"><stop stop-color="#7864d7"/></linearGradient><path id="shape" d="M10 20h80v60z"/></defs><use href="#shape" fill="url(#p)"/></svg>';
    await page.locator('#svgFile').setInputFiles({name:'safe.svg',mimeType:'image/svg+xml',buffer:Buffer.from(safe)});
    await page.waitForFunction(n=>window.__st.catalog.length===n+1,n);await page.locator('#lib button').filter({hasText:'safe'}).click();await click('dup');
    const ids=await page.locator('#cvs [id]').evaluateAll(es=>es.map(e=>e.id));assert(new Set(ids).size===ids.length,'copied import ID collision');await snap('08-import-safe');
  });
  await test('Ошибки JS в браузере',()=>assert(errors.length===0,errors.join(';')));
  return {passed:results.filter(r=>r.pass).length,failed:results.filter(r=>!r.pass).length,results};
}
