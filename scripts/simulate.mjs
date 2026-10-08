import {writeFileSync} from "node:fs";
import {EchoRiftGame,RNG,threatVector,WORLD} from "../src/game.js";

const priority={
echo:["echoCopy","echoDamage","echoCycle","damage","rate","pierce","hp","dashCd","speed","magnet","dashDamage"],
weapon:["damage","rate","pierce","hp","speed","echoDamage","magnet","dashCd","echoCycle","dashDamage","echoCopy"],
dash:["dashDamage","dashCd","speed","hp","damage","rate","magnet","echoDamage","pierce","echoCycle","echoCopy"],
balanced:["hp","damage","echoDamage","rate","dashCd","pierce","speed","echoCopy","dashDamage","echoCycle","magnet"]
};
function policy(name){return choices=>{for(const id of priority[name]){const hit=choices.find(x=>x.id===id);if(hit)return hit.id}return choices[0].id}}

function edgeVector(p){
 let x=0,y=0;const margin=150;
 if(p.x<margin)x+=(margin-p.x)/margin;if(p.x>WORLD.width-margin)x-=(p.x-(WORLD.width-margin))/margin;
 if(p.y<margin)y+=(margin-p.y)/margin;if(p.y>WORLD.height-margin)y-=(p.y-(WORLD.height-margin))/margin;
 return{x,y};
}
function nearestPickup(game){
 let best=null,bd=Infinity,p=game.player;
 for(const g of game.pickups){const d=(g.x-p.x)**2+(g.y-p.y)**2;if(d<bd){bd=d;best=g}}
 return best?{g:best,d:Math.sqrt(bd)}:null;
}
function bodyThreatVector(game,radius=250){
 const p=game.player;let x=0,y=0,w=0;
 for(const e of game.enemies){const dx=p.x-e.x,dy=p.y-e.y,d=Math.max(1,Math.hypot(dx,dy));if(d<radius){const q=(radius-d)/radius;x+=dx/d*q;y+=dy/d*q;w+=q}}
 const d=Math.hypot(x,y)||1;return{x:x/d,y:y/d,magnitude:Math.min(1,w/2.4)};
}
function makeBot(kind,seed,build="balanced"){
 const rng=new RNG(seed^0x9e3779b9);let angle=rng.range(0,Math.PI*2),nextTurn=0;
 return game=>{
   const p=game.player,t=game.time;
   if(kind==="idle")return{dx:0,dy:0,dash:false};
   if(kind==="random"){
     if(t>=nextTurn){angle+=rng.range(-1.7,1.7);nextTurn=t+rng.range(.45,1.4)}
     return{dx:Math.cos(angle),dy:Math.sin(angle),dash:p.dashT<=0&&rng.next()<.002};
   }
   const th=bodyThreatVector(game,kind==="skilled"?285:250),edge=edgeVector(p);
   let dx=th.x*(kind==="skilled"?1.75:1.25)+edge.x*1.6,dy=th.y*(kind==="skilled"?1.75:1.25)+edge.y*1.6;
   const pickup=nearestPickup(game);
   if(pickup&&pickup.d<(kind==="skilled"?180:115)&&th.magnitude<.5){const vx=pickup.g.x-p.x,vy=pickup.g.y-p.y,d=Math.hypot(vx,vy)||1;dx+=vx/d*.75;dy+=vy/d*.75}
   if(kind==="skilled"){
     const cx=480-p.x,cy=300-p.y,cd0=Math.hypot(cx,cy)||1;
     dx+=cx/cd0*.30;dy+=cy/cd0*.30;
     for(const b of game.enemyBullets){
       const vv=b.vx*b.vx+b.vy*b.vy;if(!vv)continue;
       const px=p.x-b.x,py=p.y-b.y,eta=Math.max(0,Math.min(.65,(px*b.vx+py*b.vy)/vv));
       const ix=b.x+b.vx*eta,iy=b.y+b.vy*eta,ax=p.x-ix,ay=p.y-iy,ad=Math.hypot(ax,ay);
       if(ad<72){const q=(72-ad)/72;dx+=ax/(ad||1)*q*.65;dy+=ay/(ad||1)*q*.65}
     }
   }else{
     const cx=480-p.x,cy=300-p.y,cd=Math.hypot(cx,cy)||1;
     dx+=cx/cd*.28;dy+=cy/cd*.28;
     // 基本botは敵の塊から逃げるだけでなく、横へ回り込んで包囲を解く。
     dx+=cy/cd*.58;dy+=-cx/cd*.58;
     if(th.magnitude<.2){dx+=.26;dy+=.18}
   }
   const d=Math.hypot(dx,dy)||1;
   const dash=p.dashT<=0&&(th.magnitude>(kind==="skilled"?.64:.78)||game.enemyBullets.some(b=>(b.x-p.x)**2+(b.y-p.y)**2<62**2));
   return{dx:dx/d,dy:dy/d,dash};
 };
}
function run(seed,botKind,build){
 const game=new EchoRiftGame({seed,autoUpgradePolicy:policy(build)}),bot=makeBot(botKind,seed,build);
 const dt=.05,maxSteps=Math.ceil(WORLD.runSeconds/dt)+10;
 for(let i=0;i<maxSteps&&game.status!=="lost"&&game.status!=="won";i++)game.step(dt,bot(game));
 return game.metrics();
}
function median(a){const s=[...a].sort((x,y)=>x-y);return s[Math.floor(s.length/2)]}
function mean(a){return a.reduce((s,x)=>s+x,0)/a.length}
function summarize(runs){
 return{wins:runs.filter(x=>x.status==="won").length+"/"+runs.length,medianSurvival:+median(runs.map(x=>x.survival)).toFixed(1),meanScore:Math.round(mean(runs.map(x=>x.score))),meanKills:+mean(runs.map(x=>x.kills)).toFixed(1),meanLevel:+mean(runs.map(x=>x.level)).toFixed(1),echoShare:+mean(runs.map(x=>x.echoShare)).toFixed(2),meanNearMiss:+mean(runs.map(x=>x.nearMisses)).toFixed(1)};
}
const seeds=[101,202,303,404,505,606,707,808];
const botResults={};
for(const bot of ["idle","random","basic","skilled"])botResults[bot]=summarize(seeds.map(seed=>run(seed,bot,"balanced")));
const buildResults={};
for(const build of ["echo","weapon","dash","balanced"])buildResults[build]=summarize(seeds.map(seed=>run(seed,"skilled",build)));
const representative=run(404,"skilled","balanced");
const gradient=botResults.skilled.medianSurvival>botResults.basic.medianSurvival&&botResults.basic.medianSurvival>botResults.random.medianSurvival&&botResults.random.medianSurvival>botResults.idle.medianSurvival;
const viableBuilds=Object.values(buildResults).filter(x=>x.medianSurvival>=360||Number(x.wins.split("/")[0])>=2).length;
const pace=representative.pacing.map((x,i)=>({phase:i,killsPerMinute:+(x.kills/((x.to-x.from)/60)).toFixed(1),damage:x.damage}));
const report={botResults,buildResults,acceptance:{skillGradient:gradient,viableBuilds,representativeLevel:representative.level,representativeStatus:representative.status,pacing:pace},representative};
writeFileSync("simulation-report.json",JSON.stringify(report,null,2)+"\\n");
console.log(JSON.stringify(report,null,2));
if(!gradient)process.exitCode=2;
if(viableBuilds<3)process.exitCode=3;
