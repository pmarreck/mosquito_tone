import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { serve } from '../scripts/serve.mjs';
let server, child, ws, profile, origin, nextId=0;
const pending=new Map();
function send(method,params={},sessionId) { return new Promise((resolve,reject) => { const id=++nextId; const timer=setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); },10000); pending.set(id,{resolve,reject,timer}); ws.send(JSON.stringify({id,method,params,sessionId})); }); }
before(async () => {
  profile=await mkdtemp(join(tmpdir(),'mosquito-browser-'));
  const siteRoot = join(profile, 'site');
  await mkdir(siteRoot);
  // Match the path prefix of a GitHub Pages project site.
  await symlink(process.env.TONE_SITE, join(siteRoot, 'mosquito_tone'), 'dir');
  server = await serve(siteRoot);
  origin = `http://127.0.0.1:${server.address().port}/mosquito_tone`;
  child=spawn(process.env.TONE_CHROMIUM,['--headless=new','--no-sandbox','--disable-gpu','--mute-audio','--no-first-run','--no-default-browser-check','--remote-debugging-port=0',`--user-data-dir=${join(profile, 'browser')}`,'about:blank'],{stdio:['ignore','ignore','pipe']});
  const endpoint=await new Promise((ok,fail) => { let log=''; const timeout=setTimeout(() => fail(new Error('Chromium startup timed out')),10000); child.on('error',fail); child.on('exit',code => fail(new Error(`Chromium exited ${code}: ${log}`))); child.stderr.on('data',d => { log+=d; const match=/DevTools listening on (ws:\S+)/.exec(log); if(match) {clearTimeout(timeout); ok(match[1]);} }); });
  ws=new WebSocket(endpoint);
  ws.addEventListener('message',({data}) => { const message=JSON.parse(data); const waiter=pending.get(message.id); if(waiter) {clearTimeout(waiter.timer); pending.delete(message.id); message.error ? waiter.reject(new Error(message.error.message)) : waiter.resolve(message.result);} });
  await new Promise(ok => ws.addEventListener('open',ok));
});
after(async () => { ws?.close(); if(child && child.exitCode === null) { const exited=new Promise(ok=>child.once('exit',ok)); child.kill('SIGTERM'); await exited; } if(server) await new Promise(ok=>server.close(ok)); if(profile) await rm(profile,{recursive:true,force:true}); });
async function page(preload='') {
  const {browserContextId}=await send('Target.createBrowserContext');
  const {targetId}=await send('Target.createTarget',{url:'about:blank',browserContextId});
  const {sessionId}=await send('Target.attachToTarget',{targetId,flatten:true});
  const call=(m,p={})=>send(m,p,sessionId);
  await call('Page.enable'); await call('Runtime.enable');
  await call('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:3,mobile:true});
  await call('Page.addScriptToEvaluateOnNewDocument',{source:`window.audioContexts=[]; const RealAudio=window.AudioContext; window.AudioContext=class extends RealAudio { constructor(...args){super(...args);window.audioContexts.push(this);} }; ${preload}`});
  const evaluate=async expression=>{const r=await call('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true,userGesture:true});if(r.exceptionDetails)throw new Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;};
  await call('Page.navigate',{url:origin+'/'});
  await evaluate(`new Promise((ok,fail)=>{const timer=setTimeout(()=>fail(new Error('App did not become ready')),8000);const check=()=>{const state=document.documentElement.dataset.ready;if(state){clearTimeout(timer);state==='1'?ok(true):fail(new Error(document.getElementById('status').textContent));return true;}return false;};if(!check())new MutationObserver((_,o)=>{if(check())o.disconnect();}).observe(document.documentElement,{attributes:true});})`);
  return {call,evaluate,close:()=>send('Target.disposeBrowserContext',{browserContextId})};
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
    await p.call('Page.reload');
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
