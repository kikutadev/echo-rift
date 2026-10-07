export const WORLD={width:960,height:600,runSeconds:480};
const TAU=Math.PI*2;
const UPGRADES=[
{id:"damage",name:"臨界パルス",desc:"通常弾ダメージ +30%",w:1.2},
{id:"rate",name:"高速点火",desc:"射撃間隔 -14%",w:1.1},
{id:"pierce",name:"位相貫通",desc:"弾の貫通 +1",w:.9},
{id:"echoDamage",name:"残響増幅",desc:"ECHOダメージ +40%",w:1.25},
{id:"echoCopy",name:"多重残響",desc:"ECHOをもう1体再演",w:.75},
{id:"echoCycle",name:"短周期記録",desc:"ECHO発生間隔 -12%",w:.8},
{id:"dashDamage",name:"裂界衝撃",desc:"ダッシュ爆発を強化",w:1},
{id:"dashCd",name:"位相冷却",desc:"ダッシュ再使用 -0.35秒",w:.95},
{id:"hp",name:"自己修復殻",desc:"最大HP +18 / 即時回復",w:.9},
{id:"magnet",name:"回収磁場",desc:"回収半径 +40",w:.75},
{id:"speed",name:"慣性破断",desc:"移動速度 +8%",w:.75}
];
const STATS={
chaser:{hp:30,speed:76,r:12,damage:12,xp:7,score:10},
scout:{hp:20,speed:118,r:9,damage:9,xp:6,score:12},
shooter:{hp:42,speed:52,r:13,damage:10,xp:10,score:18},
brute:{hp:115,speed:42,r:20,damage:18,xp:20,score:35},
boss:{hp:900,speed:34,r:42,damage:20,xp:100,score:500}
};
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const norm=(x,y)=>{const d=Math.hypot(x,y)||1;return{x:x/d,y:y/d}};
const hit=(a,b)=>{const r=a.r+b.r;return(a.x-b.x)**2+(a.y-b.y)**2<=r*r};

export class RNG{
constructor(seed=1){this.s=(seed>>>0)||1}
next(){let x=this.s;x^=x<<13;x^=x>>>17;x^=x<<5;this.s=x>>>0;return this.s/4294967296}
range(a,b){return a+(b-a)*this.next()}
int(a,b){return Math.floor(this.range(a,b+1))}
}

function weighted(rng,count){
const pool=UPGRADES.map(x=>({...x})),out=[];
while(out.length<count&&pool.length){
 const total=pool.reduce((s,x)=>s+x.w,0);let roll=rng.range(0,total),i=0;
 for(;i<pool.length;i++){roll-=pool[i].w;if(roll<=0)break}
 out.push(pool.splice(Math.min(i,pool.length-1),1)[0]);
}
return out;
}

export class EchoRiftGame{
constructor({seed=1,autoUpgradePolicy=null}={}){this.seed=seed;this.rng=new RNG(seed);this.autoUpgradePolicy=autoUpgradePolicy;this.reset()}
reset(){
this.time=0;this.status="playing";this.level=1;this.xp=0;this.xpNeed=28;this.score=0;this.kills=0;this.combo=0;this.comboTimer=0;this.maxCombo=0;
this.enemies=[];this.bullets=[];this.enemyBullets=[];this.pickups=[];this.echoes=[];this.rifts=[];this.history=[];this.shots=[];this.events=[];
this.spawnBudget=0;this.echoTimer=2.6;this.pending=[];this.upgradeHistory=[];this.nextId=1;this.bossMarks=new Set();this.hitEvents=0;this.damageTaken=0;this.damageDealt=0;this.echoDamage=0;this.nearMisses=0;this.dashKills=0;this.lastThreat=999;
this.pacing=[{from:0,to:120,kills:0,damage:0,xp:0},{from:120,to:300,kills:0,damage:0,xp:0},{from:300,to:480,kills:0,damage:0,xp:0}];
this.player={x:480,y:300,r:13,hp:100,maxHp:100,speed:220,fire:.38,fireT:.1,damage:14,bulletSpeed:500,pierce:0,dashCd:3,dashT:0,dashActive:0,dashHit:new Set(),dx:1,dy:0,dashSpeed:650,inv:0,magnet:68,echoMult:.72,echoCopies:1,echoCycle:4.8,echoDuration:3,dashDamage:48,riftRadius:84};
}
bucket(){return this.pacing.find(x=>this.time>=x.from&&this.time<x.to)||this.pacing[2]}
emit(type,data={}){this.events.push({type,...data});if(this.events.length>80)this.events.shift()}
nearest(x,y){let best=null,bd=Infinity;for(const e of this.enemies){const d=(e.x-x)**2+(e.y-y)**2;if(e.hp>0&&d<bd){bd=d;best=e}}return best}
chooseUpgrade(id){
if(this.status!=="upgrade")return false;if(!this.pending.some(x=>x.id===id))return false;const p=this.player;
if(id==="damage")p.damage*=1.3;else if(id==="rate")p.fire=Math.max(.13,p.fire*.86);else if(id==="pierce")p.pierce++;
else if(id==="echoDamage")p.echoMult*=1.4;else if(id==="echoCopy")p.echoCopies=Math.min(4,p.echoCopies+1);else if(id==="echoCycle")p.echoCycle=Math.max(2.7,p.echoCycle*.88);
else if(id==="dashDamage"){p.dashDamage+=34;p.riftRadius+=10}else if(id==="dashCd")p.dashCd=Math.max(1.3,p.dashCd-.35);else if(id==="hp"){p.maxHp+=18;p.hp=Math.min(p.maxHp,p.hp+18)}
else if(id==="magnet")p.magnet+=40;else if(id==="speed")p.speed*=1.08;
this.upgradeHistory.push({time:this.time,id});this.pending=[];this.status="playing";this.emit("upgrade",{id});return true;
}
spawn(type=null){
const t=this.time,r=this.rng.next();
if(!type){if(t<55)type=r<.82?"chaser":"scout";else if(t<150)type=r<.52?"chaser":r<.77?"scout":"shooter";else if(t<300)type=r<.36?"chaser":r<.58?"scout":r<.83?"shooter":"brute";else type=r<.26?"chaser":r<.46?"scout":r<.73?"shooter":"brute"}
const s=STATS[type],edge=this.rng.int(0,3);let x,y;
if(edge===0){x=-30;y=this.rng.range(0,600)}else if(edge===1){x=990;y=this.rng.range(0,600)}else if(edge===2){x=this.rng.range(0,960);y=-30}else{x=this.rng.range(0,960);y=630}
const scale=1+Math.max(0,t-100)/900;
this.enemies.push({id:this.nextId++,type,x,y,r:s.r,hp:s.hp*scale,maxHp:s.hp*scale,speed:s.speed*Math.min(1.28,1+t/1800),damage:s.damage,xp:s.xp,score:s.score,shootT:this.rng.range(.5,1.6),auxT:this.rng.range(1.2,2.6),flash:0});
}
spawnBoss(mark){
const s=STATS.boss,a=this.rng.range(0,TAU),scale=mark>=360?1.35:1;
this.enemies.push({id:this.nextId++,type:"boss",x:480+Math.cos(a)*360,y:300+Math.sin(a)*240,r:s.r,hp:s.hp*scale,maxHp:s.hp*scale,speed:s.speed,damage:s.damage,xp:s.xp,score:s.score,shootT:.4,auxT:2.4,flash:0});
this.emit("boss",{mark});
}
fire(x,y,damage,pierce,echo=false,angle=null){
if(angle===null){const t=this.nearest(x,y);if(!t)return;if(!echo)this.shots.push({t:this.time,x,y,a:Math.atan2(t.y-y,t.x-x)});angle=Math.atan2(t.y-y,t.x-x)}
this.bullets.push({x,y,r:echo?4.5:4,vx:Math.cos(angle)*this.player.bulletSpeed,vy:Math.sin(angle)*this.player.bulletSpeed,damage,pierce,life:1.6,echo,hit:new Set()});
}
spawnEcho(){
const start=this.time-this.player.echoDuration,samples=this.history.filter(s=>s.t>=start),shots=this.shots.filter(s=>s.t>=start).map(s=>({...s,rel:s.t-start}));
if(samples.length<4)return;
const rel=samples.map(s=>({...s,rel:s.t-start}));
for(let c=0;c<this.player.echoCopies;c++)this.echoes.push({age:-c*.12,duration:this.player.echoDuration,samples:rel,shots:shots.map(s=>({...s,fired:false})),copy:c,x:rel[0].x,y:rel[0].y});
this.emit("echo",{copies:this.player.echoCopies});
}
damageEnemy(e,amount,source){
if(e.hp<=0)return;e.hp-=amount;e.flash=.08;this.damageDealt+=amount;if(source==="echo")this.echoDamage+=amount;if(e.hp>0)return;
this.kills++;this.score+=Math.round(e.score*(1+this.combo*.06));this.combo=Math.min(20,this.combo+1);this.comboTimer=2.7;this.maxCombo=Math.max(this.maxCombo,this.combo);if(source==="rift")this.dashKills++;
const b=this.bucket();b.kills++;b.xp+=e.xp;const drops=e.type==="boss"?7:e.type==="brute"?3:1;
for(let i=0;i<drops;i++){const a=this.rng.range(0,TAU),d=this.rng.range(0,e.r+12);this.pickups.push({x:e.x+Math.cos(a)*d,y:e.y+Math.sin(a)*d,r:5,value:e.xp/drops,vx:Math.cos(a)*30,vy:Math.sin(a)*30})}
this.emit("kill",{x:e.x,y:e.y,type:e.type,source});
}
gainXp(v){
this.xp+=v;if(this.xp>=this.xpNeed&&this.status==="playing"){this.xp-=this.xpNeed;this.level++;this.player.hp=Math.min(this.player.maxHp,this.player.hp+5);this.xpNeed=Math.round(26+this.level*13+Math.pow(this.level,1.22)*3.2);this.pending=weighted(this.rng,3);this.status="upgrade";this.emit("level",{level:this.level});if(this.autoUpgradePolicy){const id=this.autoUpgradePolicy(this.pending,this.snapshot());this.chooseUpgrade(id||this.pending[0].id)}}
}
hurt(amount){
const p=this.player;if(p.inv>0||p.dashActive>0||this.status!=="playing")return;p.hp-=amount;p.inv=.52;this.damageTaken+=amount;this.hitEvents++;this.combo=0;this.bucket().damage+=amount;this.emit("hurt",{amount});if(p.hp<=0){p.hp=0;this.status="lost";this.emit("lost")}}
updateSpawns(dt){
for(const mark of [200,400])if(this.time>=mark&&!this.bossMarks.has(mark)){this.bossMarks.add(mark);this.spawnBoss(mark)}
const difficulty=.52+this.time/420,pressure=clamp(1.12-this.enemies.length/72,.42,1.12);this.spawnBudget+=dt*difficulty*pressure;
while(this.spawnBudget>=1){this.spawnBudget--;this.spawn();if(this.time>330&&this.rng.next()<.12)this.spawn()}
}
updatePlayer(dt,input){
const p=this.player;p.fireT-=dt;p.dashT=Math.max(0,p.dashT-dt);p.inv=Math.max(0,p.inv-dt);let m=norm(input.dx||0,input.dy||0);if(!(input.dx||input.dy))m={x:0,y:0};
if(input.dash&&p.dashT<=0&&p.dashActive<=0&&(m.x||m.y)){p.dashActive=.18;p.dashT=p.dashCd;p.inv=Math.max(p.inv,.42);p.dashHit=new Set();p.dx=m.x;p.dy=m.y;this.rifts.push({x:p.x,y:p.y,age:0,damage:p.dashDamage,radius:p.riftRadius,boom:false});this.emit("dash")}
let speed=p.speed;if(p.dashActive>0){p.dashActive-=dt;m={x:p.dx,y:p.dy};speed=p.dashSpeed;if(p.dashActive<=0)this.rifts.push({x:p.x,y:p.y,age:0,damage:p.dashDamage,radius:p.riftRadius,boom:false})}
p.x=clamp(p.x+m.x*speed*dt,18,942);p.y=clamp(p.y+m.y*speed*dt,18,582);
if(p.dashActive>0){for(const e of this.enemies){if(e.hp<=0||p.dashHit.has(e.id))continue;const rr=p.r+e.r+10;if((e.x-p.x)**2+(e.y-p.y)**2<=rr*rr){p.dashHit.add(e.id);this.damageEnemy(e,p.dashDamage*.72,"rift");this.emit("dashHit",{x:e.x,y:e.y})}}}
if(p.fireT<=0&&this.enemies.length){this.fire(p.x,p.y,p.damage,p.pierce);p.fireT+=p.fire}
this.history.push({t:this.time,x:p.x,y:p.y});const floor=this.time-5;while(this.history.length&&this.history[0].t<floor)this.history.shift();while(this.shots.length&&this.shots[0].t<floor)this.shots.shift();
this.echoTimer-=dt;if(this.echoTimer<=0&&this.time>3.2){this.echoTimer+=p.echoCycle;this.spawnEcho()}
}
updateEchoes(dt){
const p=this.player;for(let i=this.echoes.length-1;i>=0;i--){const e=this.echoes[i];e.age+=dt;if(e.age<0)continue;if(e.age>e.duration){this.echoes.splice(i,1);continue}
let s=e.samples[e.samples.length-1];for(const q of e.samples){if(q.rel>=e.age){s=q;break}}
const off=(e.copy-(p.echoCopies-1)/2)*.1,dx=s.x-480,dy=s.y-300,c=Math.cos(off),n=Math.sin(off);e.x=480+dx*c-dy*n;e.y=300+dx*n+dy*c;
for(const shot of e.shots)if(!shot.fired&&shot.rel<=e.age){shot.fired=true;this.fire(e.x,e.y,p.damage*p.echoMult,p.pierce,true,shot.a+off)}
}}
updateBullets(dt){
for(let i=this.bullets.length-1;i>=0;i--){const b=this.bullets[i];b.life-=dt;b.x+=b.vx*dt;b.y+=b.vy*dt;if(b.life<=0||b.x<-30||b.y<-30||b.x>990||b.y>630){this.bullets.splice(i,1);continue}
for(const e of this.enemies){if(e.hp<=0||b.hit.has(e.id))continue;if(hit(b,e)){b.hit.add(e.id);this.damageEnemy(e,b.damage,b.echo?"echo":"bullet");b.pierce--;if(b.pierce<0){b.life=0;break}}}
}}
updateEnemies(dt){
const p=this.player;
for(const e of this.enemies){if(e.hp<=0)continue;e.flash=Math.max(0,e.flash-dt);const dx=p.x-e.x,dy=p.y-e.y,d=Math.max(1,Math.hypot(dx,dy)),nx=dx/d,ny=dy/d;
if(e.type==="shooter"){const dir=d>295?1:d<225?-1:0;e.x+=nx*e.speed*dir*dt;e.y+=ny*e.speed*dir*dt;e.shootT-=dt;if(e.shootT<=0){e.shootT+=Math.max(.72,1.75-this.time/520);const a=Math.atan2(p.y-e.y,p.x-e.x);this.enemyBullets.push({x:e.x,y:e.y,r:6,vx:Math.cos(a)*235,vy:Math.sin(a)*235,damage:e.damage,life:4.5})}}
else if(e.type==="boss"){const dir=d>220?1:-.35;e.x+=nx*e.speed*dir*dt;e.y+=ny*e.speed*dir*dt;e.shootT-=dt;e.auxT-=dt;if(e.shootT<=0){e.shootT+=1.25;for(let k=0;k<10;k++){const a=this.time*.8+k/10*TAU;this.enemyBullets.push({x:e.x,y:e.y,r:7,vx:Math.cos(a)*180,vy:Math.sin(a)*180,damage:12,life:5.5})}}if(e.auxT<=0){e.auxT+=4.2;for(let k=0;k<3;k++)this.spawn("scout")}}
else{const wob=e.type==="scout"?Math.sin(this.time*4+e.id)*.42:0,wx=nx*Math.cos(wob)-ny*Math.sin(wob),wy=nx*Math.sin(wob)+ny*Math.cos(wob);e.x+=wx*e.speed*dt;e.y+=wy*e.speed*dt}
if(hit(p,e))this.hurt(e.damage)}
this.enemies=this.enemies.filter(e=>e.hp>0&&e.x>-120&&e.y>-120&&e.x<1080&&e.y<720);
}
updateEnemyBullets(dt){
const p=this.player;let nearest=999;
for(let i=this.enemyBullets.length-1;i>=0;i--){const b=this.enemyBullets[i];b.life-=dt;b.x+=b.vx*dt;b.y+=b.vy*dt;if(b.life<=0||b.x<-40||b.y<-40||b.x>1000||b.y>640){this.enemyBullets.splice(i,1);continue}const d=Math.hypot(p.x-b.x,p.y-b.y)-p.r-b.r;nearest=Math.min(nearest,d);if(hit(p,b)){this.hurt(b.damage);this.enemyBullets.splice(i,1)}}
if(nearest<14&&nearest>0&&this.lastThreat>=14)this.nearMisses++;this.lastThreat=nearest;
}
updatePickups(dt){
const p=this.player;for(let i=this.pickups.length-1;i>=0;i--){const g=this.pickups[i];g.vx*=Math.pow(.03,dt);g.vy*=Math.pow(.03,dt);g.x+=g.vx*dt;g.y+=g.vy*dt;const dx=p.x-g.x,dy=p.y-g.y,d=Math.max(1,Math.hypot(dx,dy));if(d<p.magnet){const pull=clamp((p.magnet-d)/p.magnet,.2,1)*540;g.x+=dx/d*pull*dt;g.y+=dy/d*pull*dt}if(d<p.r+8){this.gainXp(g.value);this.pickups.splice(i,1)}}
}
updateRifts(dt){
for(let i=this.rifts.length-1;i>=0;i--){const r=this.rifts[i];r.age+=dt;if(!r.boom&&r.age>=.42){r.boom=true;for(const e of this.enemies)if((e.x-r.x)**2+(e.y-r.y)**2<=(r.radius+e.r)**2)this.damageEnemy(e,r.damage,"rift");this.emit("rift",{x:r.x,y:r.y})}if(r.age>=.82)this.rifts.splice(i,1)}
}
step(dt,input={dx:0,dy:0,dash:false}){
if(this.status==="lost"||this.status==="won")return;if(this.status==="upgrade"){if(!this.autoUpgradePolicy)return;const id=this.autoUpgradePolicy(this.pending,this.snapshot());this.chooseUpgrade(id||this.pending[0].id)}
dt=clamp(dt,0,.05);this.time+=dt;this.comboTimer-=dt;if(this.comboTimer<=0)this.combo=0;this.updateSpawns(dt);this.updatePlayer(dt,input);this.updateEchoes(dt);this.updateBullets(dt);this.updateEnemies(dt);this.updateEnemyBullets(dt);this.updatePickups(dt);this.updateRifts(dt);
if(this.time>=480&&this.status!=="lost"){this.status="won";this.score+=2500;this.emit("won")}
}
snapshot(){const p=this.player;return{seed:this.seed,time:this.time,status:this.status,level:this.level,xp:this.xp,xpNeed:this.xpNeed,score:this.score,kills:this.kills,combo:this.combo,maxCombo:this.maxCombo,hp:p.hp,maxHp:p.maxHp,player:{x:p.x,y:p.y,r:p.r,dashT:p.dashT,dashCd:p.dashCd},pending:this.pending.map(x=>({id:x.id,name:x.name,desc:x.desc})),enemyCount:this.enemies.length,echoCount:this.echoes.length,upgrades:[...this.upgradeHistory]}}
metrics(){const p=this.player;return{seed:this.seed,status:this.status,survival:+this.time.toFixed(1),score:this.score,kills:this.kills,level:this.level,hp:+p.hp.toFixed(1),maxHp:p.maxHp,maxCombo:this.maxCombo,hits:this.hitEvents,damageTaken:this.damageTaken,damageDealt:Math.round(this.damageDealt),echoShare:this.damageDealt?+(this.echoDamage/this.damageDealt).toFixed(3):0,nearMisses:this.nearMisses,dashKills:this.dashKills,upgrades:this.upgradeHistory.map(x=>x.id),pacing:this.pacing.map(x=>({...x}))}}
}

export function threatVector(game,radius=260){
const p=game.player;let x=0,y=0,w=0;
for(const e of game.enemies){const dx=p.x-e.x,dy=p.y-e.y,d=Math.max(1,Math.hypot(dx,dy));if(d<radius){const q=(radius-d)/radius;x+=dx/d*q;y+=dy/d*q;w+=q}}
for(const b of game.enemyBullets){const dx=p.x-b.x,dy=p.y-b.y,d=Math.max(1,Math.hypot(dx,dy));if(d<radius*.8){const q=1.8*(radius*.8-d)/(radius*.8);x+=dx/d*q;y+=dy/d*q;w+=q}}
if(!w)return{x:0,y:0,magnitude:0};const n=norm(x,y);return{x:n.x,y:n.y,magnitude:Math.min(1,w/2.4)}
}
