
import {chromium} from "../../games/node_modules/playwright-core/index.mjs";
import {createServer} from "node:http";
import {readFile} from "node:fs/promises";
import {extname,join} from "node:path";

const root=new URL("../",import.meta.url).pathname;
const mime={".html":"text/html; charset=utf-8",".css":"text/css; charset=utf-8",".js":"text/javascript; charset=utf-8"};
const server=createServer(async(req,res)=>{
 try{
  const pathname=new URL(req.url,"http://localhost").pathname;const path=pathname==="/"?"index.html":pathname.slice(1);
  const bytes=await readFile(join(root,path));
  res.writeHead(200,{"content-type":mime[extname(path)]||"application/octet-stream"});
  res.end(bytes);
 }catch{res.writeHead(404);res.end("not found")}
});
await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
let browser;
try {
 browser=await chromium.launch({headless:true,executablePath:"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"});
 const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true,deviceScaleFactor:1});
 const page=await context.newPage();
 const errors=[];
 page.on("pageerror",error=>errors.push(error.message));
 await page.goto("http://127.0.0.1:"+server.address().port+"/?zoomQa=1",{waitUntil:"networkidle"});
 await page.locator("#startBtn").tap();
 const cdp=await context.newCDPSession(page);
 const viewport=()=>page.evaluate(()=>({
   scale:window.visualViewport?.scale??1,
   width:window.visualViewport?.width??innerWidth,
   height:window.visualViewport?.height??innerHeight,
   pageX:window.scrollX,pageY:window.scrollY,
   canvasWidth:document.querySelector("#game").getBoundingClientRect().width,
   time:window.__echoRift.game.time
 }));
 const before=await viewport();
 async function tap(x,y,id){
  await cdp.send("Input.dispatchTouchEvent",{type:"touchStart",touchPoints:[{x,y,id,radiusX:5,radiusY:5,force:1}]});
  await cdp.send("Input.dispatchTouchEvent",{type:"touchEnd",touchPoints:[]});
 }
 // ダッシュ連打、移動エリア連打、中央連打、HUD付近連打の組み合わせ。
 for(const point of [[335,550],[80,460],[188,300],[335,550],[45,66]]){
  for(let i=0;i<6;i++){
   await tap(...point,i+1);
   await page.waitForTimeout(80);
  }
 }
 const afterRapidTaps=await viewport();
 await cdp.send("Input.dispatchTouchEvent",{type:"touchStart",touchPoints:[
  {x:130,y:380,id:11,radiusX:5,radiusY:5,force:1},
  {x:255,y:460,id:12,radiusX:5,radiusY:5,force:1}
 ]});
 await cdp.send("Input.dispatchTouchEvent",{type:"touchMove",touchPoints:[
  {x:75,y:300,id:11,radiusX:5,radiusY:5,force:1},
  {x:312,y:530,id:12,radiusX:5,radiusY:5,force:1}
 ]});
 await page.waitForTimeout(100);
 await cdp.send("Input.dispatchTouchEvent",{type:"touchEnd",touchPoints:[]});
 const afterPinch=await viewport();
 const scales=[before,afterRapidTaps,afterPinch].map(s=>s.scale);
 const stable=scales.every(n=>Math.abs(n-1)<.015)&&[afterRapidTaps,afterPinch].every(s=>
  Math.abs(s.width-before.width)<1&&Math.abs(s.canvasWidth-before.canvasWidth)<1&&s.pageX===0&&s.pageY===0);
 console.log(JSON.stringify({before,afterRapidTaps,afterPinch,stable,errors},null,2));
 await context.close();
 if(!stable||errors.length)process.exitCode=1;
}finally {
 if(browser)await browser.close();
 await new Promise(resolve=>server.close(resolve));
}
