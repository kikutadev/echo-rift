import {chromium} from "../../games/node_modules/playwright-core/index.mjs";
import {createServer} from "node:http";
import {readFile} from "node:fs/promises";
import {extname,join} from "node:path";

// スマホでの画面内敵数・中盤描画・実フレーム間隔を検証する。
const root=new URL("../",import.meta.url).pathname;
const types={".html":"text/html; charset=utf-8",".js":"text/javascript; charset=utf-8",".css":"text/css; charset=utf-8"};
const server=createServer(async(req,res)=>{
 try{
  const urlPath=new URL(req.url,"http://localhost").pathname;const file=urlPath==="/"?"index.html":urlPath.slice(1);
  const data=await readFile(join(root,file));
  res.writeHead(200,{"content-type":types[extname(file)]||"application/octet-stream"});res.end(data);
 }catch{res.writeHead(404);res.end("not found")}
});
await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
const browser=await chromium.launch({headless:true,executablePath:"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"});
const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:1});
const page=await context.newPage(),errors=[];
page.on("pageerror",e=>errors.push(e.message));
await page.goto("http://127.0.0.1:"+server.address().port,{waitUntil:"networkidle"});
await page.locator("#startBtn").tap();
await page.waitForTimeout(3500);
await page.screenshot({path:"qa-density-early.png"});
const early=await page.evaluate(()=>({time:window.__echoRift.game.time,enemies:window.__echoRift.game.enemies.length}));

const mid=await page.evaluate(()=>{
 const g=window.__echoRift.game;
 g.autoUpgradePolicy=choices=>choices[0]?.id;
 g.player.hp=9999;g.player.maxHp=9999;
 for(let i=0;i<2800;i++){
  const angle=i*.018;
  g.step(.05,{dx:Math.cos(angle),dy:Math.sin(angle),dash:i%90===0});
 }
 const edgeX=Math.max(-1,Math.min(1,(g.player.x-480)/400))*105;
 const edgeY=Math.max(-1,Math.min(1,(g.player.y-300)/260))*68;
 const camX=g.player.x-edgeX,camY=g.player.y-edgeY;
 const visible=g.enemies.filter(e=>Math.abs(e.x-camX)<210&&Math.abs(e.y-camY)<455).length;
 g.events.length=0;
 return {time:g.time,enemies:g.enemies.length,visible,level:g.level,bullets:g.bullets.length};
});
await page.waitForTimeout(100);
await page.screenshot({path:"qa-density-mid.png"});
const frameTiming=await page.evaluate(()=>new Promise(resolve=>{
 const samples=[];let last=performance.now();
 function onFrame(now){
  const dt=now-last;last=now;
  samples.push(dt);
  if(samples.length<100)requestAnimationFrame(onFrame);
  else {
   const sorted=samples.slice(5).sort((a,b)=>a-b);
   const avg=sorted.reduce((a,b)=>a+b,0)/sorted.length;
   resolve({fps:+(1000/avg).toFixed(1),p95ms:+sorted[Math.floor(sorted.length*.95)].toFixed(1)});
  }
 }
 requestAnimationFrame(onFrame);
}));
// 最大密度（110体）を強制して、敵の押し合いと描画を同時負荷検証する。
const stressPopulation=await page.evaluate(()=>{
 const g=window.__echoRift.game;
 g.player.maxHp=100000;g.player.hp=100000;
 while(g.enemies.length<g.maxLivingEnemies){
  g.spawn("brute",{angle:g.enemies.length*.618,distance:145+(g.enemies.length%4)*20});
 }
 for(const enemy of g.enemies){enemy.hp=Math.max(enemy.hp,100000);enemy.maxHp=Math.max(enemy.maxHp,100000)}
 return g.enemies.length;
});
await page.waitForTimeout(250);
const stressTiming=await page.evaluate(()=>new Promise(resolve=>{
 const samples=[];let last=performance.now();
 function measure(now){
  samples.push(now-last);last=now;
  if(samples.length<110){requestAnimationFrame(measure);return}
  const steady=samples.slice(10), sorted=steady.slice().sort((a,b)=>a-b);
  const avg=steady.reduce((sum,v)=>sum+v,0)/steady.length;
  resolve({fps:+(1000/avg).toFixed(1),p95ms:+sorted[Math.floor(sorted.length*.95)].toFixed(1),
   enemies:window.__echoRift.game.enemies.length});
 }
 requestAnimationFrame(measure);
}));
console.log(JSON.stringify({early,mid,frameTiming,stressPopulation,stressTiming,errors},null,2));
await context.close();await browser.close();await new Promise(resolve=>server.close(resolve));
if(errors.length||early.enemies<20||mid.visible<15||mid.time<130||frameTiming.fps<40||stressPopulation<100||stressTiming.fps<30)process.exit(1);
