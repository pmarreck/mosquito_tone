import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, rm, symlink, writeFile, copyFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { serve } from '../scripts/serve.mjs';
import { assertTone } from './audio-analysis.mjs';
let server, child, ws, profile, origin, nextId=0;
const pending=new Map();
const documentListeners = new Map();
function send(method,params={},sessionId) { return new Promise((resolve,reject) => { const id=++nextId; const timer=setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); },10000); pending.set(id,{resolve,reject,timer}); ws.send(JSON.stringify({id,method,params,sessionId})); }); }
before(async () => {
  profile=await mkdtemp(join(tmpdir(),'mosquito-browser-'));
  const siteRoot = join(profile, 'site');
  await mkdir(siteRoot);
  // Match the path prefix of a GitHub Pages project site.
  await symlink(process.env.TONE_SITE, join(siteRoot, 'mosquito_tone'), 'dir');
  await copyFile(new URL('./capture-worklet.mjs', import.meta.url), join(siteRoot, 'capture-worklet.mjs'));
  server = await serve(siteRoot);
  origin = `http://127.0.0.1:${server.address().port}/mosquito_tone`;
  child=spawn(process.env.TONE_CHROMIUM,['--headless=new','--no-sandbox','--disable-gpu','--mute-audio','--no-first-run','--no-default-browser-check','--remote-debugging-port=0',`--user-data-dir=${join(profile, 'browser')}`,'about:blank'],{stdio:['ignore','ignore','pipe']});
  const endpoint=await new Promise((ok,fail) => { let log=''; const timeout=setTimeout(() => fail(new Error('Chromium startup timed out')),10000); child.on('error',fail); child.on('exit',code => fail(new Error(`Chromium exited ${code}: ${log}`))); child.stderr.on('data',d => { log+=d; const match=/DevTools listening on (ws:\S+)/.exec(log); if(match) {clearTimeout(timeout); ok(match[1]);} }); });
  ws=new WebSocket(endpoint);
  ws.addEventListener('message',({data}) => {
    const message = JSON.parse(data);
    if (message.method === 'Page.lifecycleEvent' && message.params.name === 'DOMContentLoaded') {
      documentListeners.get(message.sessionId)?.(message.params);
    }
    const waiter = pending.get(message.id);
    if (waiter) {
      clearTimeout(waiter.timer);
      pending.delete(message.id);
      message.error ? waiter.reject(new Error(message.error.message)) : waiter.resolve(message.result);
    }
  });
  await new Promise(ok => ws.addEventListener('open',ok));
});
after(async () => { ws?.close(); if(child && child.exitCode === null) { const exited=new Promise(ok=>child.once('exit',ok)); child.kill('SIGTERM'); await exited; } if(server) await new Promise(ok=>server.close(ok)); if(profile) await rm(profile,{recursive:true,force:true}); });
async function page(preload='') {
  const {browserContextId}=await send('Target.createBrowserContext');
  const {targetId}=await send('Target.createTarget',{url:'about:blank',browserContextId});
  const {sessionId}=await send('Target.attachToTarget',{targetId,flatten:true});
  const call=(m,p={})=>send(m,p,sessionId);
  const documents = new Map();
  documentListeners.set(sessionId, ({frameId, loaderId}) => documents.set(frameId, loaderId));
  const close = () => {
    documentListeners.delete(sessionId);
    return send('Target.disposeBrowserContext', {browserContextId});
  };
  async function waitForDocument(frameId, acceptLoader) {
    const deadline = performance.now() + 7000;
    while (performance.now() < deadline) {
      const loader = documents.get(frameId);
      if (loader && acceptLoader(loader)) return;
      await delay(10);
    }
    throw new Error('Browser did not finish parsing the new document');
  }
  try {
    await call('Page.enable');
    await call('Runtime.enable');
    await call('Page.setLifecycleEventsEnabled', {enabled: true});
    await call('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:3,mobile:true});
    await call('Page.addScriptToEvaluateOnNewDocument',{source:`
      window.audioContexts=[];window.audioGains=[];window.audioOutputs=new Set();
      const connect=AudioNode.prototype.connect,disconnect=AudioNode.prototype.disconnect;
      AudioNode.prototype.connect=function(...args){const result=connect.apply(this,args);if(args[0]===this.context.destination)audioOutputs.add(this);return result;};
      AudioNode.prototype.disconnect=function(...args){const result=disconnect.apply(this,args);if(!args.length||args[0]===this.context.destination)audioOutputs.delete(this);return result;};
      const RealAudio=window.AudioContext;
      window.AudioContext=class extends RealAudio { constructor(...args){super(...args);window.audioContexts.push(this);} createGain(){const gain=super.createGain();window.audioGains.push(gain);return gain;} };
      ${preload}`});
    const evaluate = async expression => {
      const result = await call('Runtime.evaluate', {expression, awaitPromise: true, returnByValue: true, userGesture: true});
      if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
      return result.result.value;
    };
    const {frameId, loaderId, errorText} = await call('Page.navigate', {url: origin + '/'});
    if (errorText) throw new Error(`Browser navigation failed: ${errorText}`);
    await waitForDocument(frameId, loader => loader === loaderId);
    await evaluate(`new Promise((ok,fail)=>{const timer=setTimeout(()=>fail(new Error('App did not become ready')),8000);const check=()=>{const state=document.documentElement.dataset.ready;if(state){clearTimeout(timer);state==='1'?ok(true):fail(new Error(document.getElementById('status').textContent));return true;}return false;};if(!check())new MutationObserver((_,o)=>{if(check())o.disconnect();}).observe(document.documentElement,{attributes:true});})`);
    const reload = async () => {
      const previous = documents.get(frameId);
      await call('Page.reload');
      await waitForDocument(frameId, loader => loader !== previous);
    };
    return {call, evaluate, reload, close};
  } catch (error) {
    await close();
    throw error;
  }
}
async function waitFor(p,expression) { return p.evaluate(`new Promise((ok,fail)=>{const deadline=performance.now()+7000;const check=()=>{if(${expression})return ok(true);if(performance.now()>deadline)return fail(new Error('Condition timed out'));setTimeout(check,10);};check();})`); }
test('phone layout, no autoplay, actual AudioWorklet on/off, and installation help', {timeout:20000}, async () => {
  const p=await page(); try {
    assert.equal(await p.evaluate('audioContexts.length'),0);
    assert.equal(await p.evaluate('document.documentElement.scrollWidth<=innerWidth'),true);
    assert.equal(await p.evaluate('document.getElementById("power").getAttribute("aria-pressed")'),'false');
    if (process.env.TONE_SCREENSHOT) {
      const {data}=await p.call('Page.captureScreenshot',{format:'png'});
      await writeFile(process.env.TONE_SCREENSHOT,Buffer.from(data,'base64'));
    }
    await p.evaluate('document.getElementById("install").click()');
    assert.equal(await p.evaluate('document.getElementById("install-dialog").open'),true);
    await p.evaluate('document.getElementById("close-install").click();document.getElementById("power").click()');
    await waitFor(p,'document.getElementById("power").getAttribute("aria-pressed")==="true"');
    assert.equal(await p.evaluate('audioContexts[0].state'),'running');
    await p.evaluate('document.getElementById("power").click()');
    await waitFor(p,'audioContexts[0].state==="suspended"');
    assert.equal(await p.evaluate('document.getElementById("power").getAttribute("aria-pressed")'),'false');
  } finally {await p.close();}
});
test('playback stays on without an automatic deadline', {timeout:20000}, async () => {
  // Accelerate long application timers so the former 30-second stop fails
  // this regression without waiting 30 seconds in the suite.
  const p=await page('const realTimeout=window.setTimeout;window.setTimeout=(fn,delay,...args)=>realTimeout(fn,delay>=10000?150:delay,...args);');
  try {
    await p.evaluate('document.getElementById("power").click()');
    await waitFor(p,'document.getElementById("power").getAttribute("aria-pressed")==="true"');
    await p.evaluate('new Promise(ok=>setTimeout(ok,250))');
    assert.equal(await p.evaluate('document.getElementById("power").getAttribute("aria-pressed")'),'true');
    assert.equal(await p.evaluate('audioContexts[0].state'),'running');
  } finally {await p.close();}
});
test('pagehide stops continuous playback', {timeout:20000}, async () => {
  const p=await page();
  try {
    await p.evaluate('document.getElementById("power").click()');
    await waitFor(p,'document.getElementById("power").getAttribute("aria-pressed")==="true"');
    await p.evaluate('window.dispatchEvent(new Event("pagehide"))');
    await waitFor(p,'audioContexts[0].state==="suspended"');
  } finally {await p.close();}
});
test('cached app and WASM reload when the browser is offline', {timeout:20000}, async () => {
  const p=await page(); try {
    await p.evaluate('navigator.serviceWorker.ready.then(()=>navigator.serviceWorker.controller?true:new Promise(ok=>navigator.serviceWorker.addEventListener("controllerchange",()=>ok(true),{once:true})))');
    await p.call('Network.enable');
    await p.call('Network.emulateNetworkConditions',{offline:true,latency:0,downloadThroughput:0,uploadThroughput:0});
    await p.reload();
    await waitFor(p,'document.documentElement.dataset.ready==="1"');
    assert.equal(await p.evaluate('document.getElementById("power").disabled'),false);
  } finally {await p.close();}
});
test('unavailable Web Audio produces an explicit error without starting playback', {timeout:20000}, async () => {
  const p=await page('window.AudioContext=undefined;window.webkitAudioContext=undefined;');
  try {
    await p.evaluate('document.getElementById("power").click()');
    await waitFor(p,'document.body.dataset.state==="error"');
    assert.equal(await p.evaluate('document.getElementById("power").getAttribute("aria-pressed")'),'false');
    assert.match(await p.evaluate('document.getElementById("status").textContent'),/Web Audio/);
  } finally {await p.close();}
});
async function capture(p) {
  return p.evaluate(`(async()=>{
    const ctx=audioContexts[0], gain=audioGains[0];
    if(!audioOutputs.has(gain))throw new Error('App gain node is not connected to the audio destination');
    if(!window.captureLoaded){await ctx.audioWorklet.addModule('/capture-worklet.mjs');window.captureLoaded=true;}
    const tap=new AudioWorkletNode(ctx,'capture');
    return new Promise((ok,fail)=>{
      const cleanup=()=>{gain.disconnect(tap);tap.disconnect();};
      const timer=setTimeout(()=>{cleanup();fail(new Error('PCM capture timed out'));},5000);
      tap.port.onmessage=({data})=>{clearTimeout(timer);cleanup();ok({rate:data.rate,pcm:Array.from(data.pcm)});};
      gain.connect(tap);tap.connect(ctx.destination);
    });
  })()`);
}
test('real browser post-gain PCM meets fixture frequency, amplitude and warble contracts', {timeout:30000}, async t => {
  const p=await page();
  try {
    await p.evaluate('document.getElementById("power").click()');
    await waitFor(p,'document.getElementById("power").getAttribute("aria-pressed")==="true"');
    for (const {hz,dbFS,warble} of [
      {hz:17400,dbFS:-40,warble:false},
      {hz:500,dbFS:-20,warble:false},
      {hz:17400,dbFS:-3,warble:false},
      {hz:17400,dbFS:-3,warble:true},
      {hz:500,dbFS:-3,warble:true},
      {hz:19000,dbFS:-3,warble:true},
    ]) {
      await p.evaluate(`{
        const hz=document.getElementById('frequency'),db=document.getElementById('level'),box=document.getElementById('warble');
        hz.value=${hz};hz.dispatchEvent(new Event('input'));db.value=${dbFS};db.dispatchEvent(new Event('input'));
        if(box.checked!==${warble})box.click();
      }`);
      const {rate,pcm}=await capture(p);
      t.diagnostic(JSON.stringify({selectedHz:hz,...assertTone(pcm,rate,{hz,dbFS,warble})}));
    }
    await p.evaluate('document.getElementById("power").click()');
    await waitFor(p,'audioContexts[0].state==="suspended"');
    // Resume only the test context, leaving the app stopped, to record silence.
    await p.evaluate('audioContexts[0].resume()');
    const {pcm}=await capture(p);
    assert.ok(pcm.every(x=>x===0),'Stopped app must output exact silence');
    await p.evaluate('audioGains[0].disconnect(audioContexts[0].destination)');
    await assert.rejects(capture(p), /not connected to the audio destination/);
  } finally {await p.close();}
});
test('17.4 kHz snaps within two pixels, keyboard can escape, and text cannot be selected', {timeout:20000}, async () => {
  const p=await page();
  try {
    const values=await p.evaluate(`(()=>{
      const slider=document.getElementById('frequency'), values=[];
      slider.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}));
      for(const hz of [17300,17500,17100,17700]){slider.value=hz;slider.dispatchEvent(new Event('input'));values.push(Number(slider.value));}
      window.dispatchEvent(new PointerEvent('pointerup'));
      slider.value=17500;slider.dispatchEvent(new Event('input'));values.push(Number(slider.value));
      return values;
    })()`);
    assert.deepEqual(values,[17400,17400,17100,17700,17500]);
    await p.evaluate('document.getElementById("frequency").value=17400;document.getElementById("frequency").focus()');
    await p.call('Input.dispatchKeyEvent',{type:'keyDown',key:'ArrowRight',code:'ArrowRight',windowsVirtualKeyCode:39});
    await p.call('Input.dispatchKeyEvent',{type:'keyUp',key:'ArrowRight',code:'ArrowRight',windowsVirtualKeyCode:39});
    assert.equal(await p.evaluate('document.getElementById("frequency").value'),'17500');
    for (const id of ['status','power-label','frequency-value','warble-range','level-value']) {
      assert.equal(await p.evaluate(`getComputedStyle(document.getElementById('${id}')).userSelect`),'none');
    }
  } finally {await p.close();}
});
test('installed mode requests portrait and gracefully handles rejected orientation lock', {timeout:20000}, async () => {
  const p=await page(`Object.defineProperty(navigator,'standalone',{value:true});window.locks=[];screen.orientation.lock=mode=>{locks.push(mode);return Promise.reject(new Error('Not supported'));};`);
  try {
    assert.deepEqual(await p.evaluate('locks'),['portrait-primary']);
    await p.evaluate('document.getElementById("power").click()');
    await waitFor(p,'document.getElementById("power").getAttribute("aria-pressed")==="true"');
    assert.equal(await p.evaluate('locks.length'),2);
  } finally {await p.close();}
});
