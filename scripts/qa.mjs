import {chromium} from "../../games/node_modules/playwright-core/index.mjs";
import {createServer} from "node:http";
import {readFile} from "node:fs/promises";
import {extname,join} from "node:path";
const root=new URL("../",import.meta.url).pathname;
const types={".html":"text/html; charset=utf-8",".js":"text/javascript; charset=utf-8",".css":"text/css; charset=utf-8"};
const server=createServer(async(req,res)=>{try{const urlPath=new URL(req.url,"http://localhost").pathname;const path=urlPath==="/"?"index.html":urlPath.slice(1);const data=await readFile(join(root,path));res.writeHead(200,{"content-type":types[extname(path)]||"application/octet-stream"});res.end(data)}catch{res.writeHead(404);res.end("not found")}});
await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
const port=server.address().port,base="http://127.0.0.1:"+port;
const browser=await chromium.launch({headless:true,executablePath:"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"});
async function run(viewport,path){
 const context=await browser.newContext({viewport});
 const page=await context.newPage();
 const errors=[];page.on("pageerror",e=>errors.push("pageerror: "+e.message));page.on("response",r=>{if(r.status()>=400)errors.push(r.status()+" "+r.url())});
 const response=await page.goto(base,{waitUntil:"networkidle"});
 const initial={status:response?.status(),title:await page.title(),heading:await page.locator("#start h1").innerText(),overflow:await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth||document.documentElement.scrollHeight>innerHeight)};
 if(path==="qa-mobile.png")await page.screenshot({path:"qa-start-mobile.png",fullPage:true});
 await page.locator("#startBtn").click();
 await page.keyboard.down("KeyD");await page.keyboard.down("KeyS");await page.waitForTimeout(1700);await page.keyboard.press("Space");await page.waitForTimeout(3600);await page.keyboard.up("KeyD");await page.keyboard.up("KeyS");
 const state=await page.evaluate(()=>({time:window.__echoRift.game.time,enemies:window.__echoRift.game.enemies.length,echoes:window.__echoRift.game.echoes.length,status:window.__echoRift.game.status,hp:window.__echoRift.game.player.hp}));
 if(path==="qa-mobile.png"){
   await page.evaluate(()=>{const g=window.__echoRift.game;g.gainXp(g.xpNeed+1)});
   await page.waitForTimeout(80);await page.screenshot({path:"qa-upgrade-mobile.png",fullPage:true});
   await page.evaluate(()=>{const g=window.__echoRift.game;if(g.status==="upgrade"&&g.pending[0])g.chooseUpgrade(g.pending[0].id)});
 }
 await page.screenshot({path,fullPage:true});await context.close();return{viewport,initial,state,errors};
}
async function runMidgame(){
 const context=await browser.newContext({viewport:{width:1440,height:900}}),page=await context.newPage();
 const errors=[];page.on("pageerror",e=>errors.push("pageerror: "+e.message));page.on("response",r=>{if(r.status()>=400)errors.push(r.status()+" "+r.url())});
 await page.goto(base,{waitUntil:"networkidle"});await page.locator("#startBtn").click();
 const state=await page.evaluate(()=>{
   const g=window.__echoRift.game;g.player.maxHp=9999;g.player.hp=9999;
   for(let i=0;i<2600&&g.status!=="won"&&g.status!=="lost";i++){
     if(g.status==="upgrade"&&g.pending[0])g.chooseUpgrade(g.pending[0].id);
     const a=i*.009,dx=Math.cos(a),dy=Math.sin(a*.83);
     g.step(.05,{dx,dy,dash:i%70===0});
   }
   return{time:g.time,enemies:g.enemies.length,echoes:g.echoes.length,bullets:g.bullets.length,enemyBullets:g.enemyBullets.length,level:g.level,status:g.status};
 });
 await page.waitForTimeout(120);await page.screenshot({path:"qa-midgame.png",fullPage:true});await context.close();return{state,errors};
}
const desktop=await run({width:1440,height:900},"qa-desktop.png");
const mobile=await run({width:390,height:844},"qa-mobile.png");
const midgame=await runMidgame();
console.log(JSON.stringify({desktop,mobile,midgame},null,2));
await browser.close();await new Promise(resolve=>server.close(resolve));
if(desktop.initial.status!==200||mobile.initial.status!==200)process.exit(2);
if(desktop.errors.length||mobile.errors.length)process.exit(3);
if(desktop.initial.overflow||mobile.initial.overflow)process.exit(4);
if(desktop.state.time<4||desktop.state.enemies<1)process.exit(5);
if(midgame.errors.length||midgame.state.time<110||midgame.state.level<4)process.exit(6);
