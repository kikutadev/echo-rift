import {chromium} from "../../games/node_modules/playwright-core/index.mjs";
import {createServer} from "node:http";
import {readFile} from "node:fs/promises";
import {extname,join} from "node:path";

// 本番と同じスマホ描画でダッシュ直前・移動中・着地後を確認する。
const root=new URL("../",import.meta.url).pathname;
const types={".html":"text/html; charset=utf-8",".js":"text/javascript; charset=utf-8",".css":"text/css; charset=utf-8"};
const server=createServer(async(req,res)=>{
 try{
  const pathname=new URL(req.url,"http://localhost").pathname;
  const path=pathname==="/"?"index.html":pathname.slice(1);
  const data=await readFile(join(root,path));
  res.writeHead(200,{"content-type":types[extname(path)]||"application/octet-stream"});res.end(data);
 }catch{res.writeHead(404);res.end("not found")}
});
await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
let browser;
try{
 browser=await chromium.launch({headless:true,executablePath:"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"});
 const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true,deviceScaleFactor:1});
 const page=await context.newPage();
 const errors=[];page.on("pageerror",error=>errors.push(error.message));
 await page.goto("http://127.0.0.1:"+server.address().port,{waitUntil:"networkidle"});
 await page.locator("#startBtn").tap();
 await page.waitForTimeout(220);
 // 視覚評価で敵が画面外に逃げないよう、プレイヤー前方にテスト対象を配置する。
 const before=await page.evaluate(()=>{
  const g=window.__echoRift.game,p=g.player;
  p.x=370;p.y=300;p.dx=1;p.dy=0;p.dashT=0;
  const rows=[415,460,495,535,575];
  for(let i=0;i<rows.length;i++){
   const e=g.enemies[i];e.x=rows[i];e.y=300+(i%2?14:-8);
   e.hp=85;e.maxHp=85;e.speed=0;
  }
  return{x:p.x,y:p.y,hp:p.hp,enemyHp:g.enemies.slice(0,5).map(e=>e.hp)};
 });
 await page.screenshot({path:"qa-dash-before.png"});
 const cdp=await context.newCDPSession(page);
 await cdp.send("Input.dispatchTouchEvent",{type:"touchStart",touchPoints:[{x:337,y:520,id:2,radiusX:5,radiusY:5,force:1}]});
 await cdp.send("Input.dispatchTouchEvent",{type:"touchEnd",touchPoints:[]});
 await page.waitForTimeout(85);
 await page.screenshot({path:"qa-dash-active.png"});
 await page.waitForTimeout(240);
 await page.screenshot({path:"qa-dash-impact.png"});
 const after=await page.evaluate(()=>{
  const g=window.__echoRift.game,p=g.player;
  return {x:p.x,y:p.y,dashActive:p.dashActive,dashHitCount:p.dashHit.size,
    dashTrail:p.dashTrail.length,rifts:g.rifts.length,hp:p.hp};
 });
 console.log(JSON.stringify({before,after,distance:+(after.x-before.x).toFixed(1),errors},null,2));
 await context.close();
 if(errors.length||after.x-before.x<185||after.dashHitCount<2)process.exitCode=1;
}finally{
 if(browser)await browser.close();
 await new Promise(resolve=>server.close(resolve));
}
