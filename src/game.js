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
chaser:{hp:28,speed:72,r:12,damage:5,xp:7,score:10},
scout:{hp:19,speed:110,r:10,damage:4,xp:6,score:12},
shooter:{hp:44,speed:46,r:14,damage:6,xp:10,score:18},
brute:{hp:126,speed:38,r:22,damage:10,xp:20,score:35},
boss:{hp:900,speed:34,r:42,damage:17,xp:100,score:500}
};
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const norm=(x,y)=>{const d=Math.hypot(x,y)||1;return{x:x/d,y:y/d}};
const hit=(a,b)=>{const r=a.r+b.r;return(a.x-b.x)**2+(a.y-b.y)**2<=r*r};

// 縦画面で表示する戦場の中心を統一。スポーンと描画カメラがずれないようにする。
export function portraitCameraFocus(player){
 const edgeX=clamp((player.x-WORLD.width/2)/400,-1,1)*105;
 const edgeY=clamp((player.y-WORLD.height/2)/260,-1,1)*68;
 return {x:player.x-edgeX,y:player.y-edgeY};
}


export class RNG{
constructor(seed=1){this.s=(seed>>>0)||1}
next(){let x=this.s;x^=x<<13;x^=x>>>17;x^=x<<5;this.s=x>>>0;return this.s/4294967296}
range(a,b){return a+(b-a)*this.next()}
int(a,b){return Math.floor(this.range(a,b+1))}
}

function weighted(rng,count,available=UPGRADES){
const pool=available.map(x=>({...x})),out=[];
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
this.time=0;this.status="playing";this.level=1;this.xp=0;this.xpNeed=480;this.nextLevelTime=6;this.score=0;this.kills=0;this.combo=0;this.comboTimer=0;this.maxCombo=0;
this.enemies=[];this.bullets=[];this.enemyBullets=[];this.pickups=[];this.echoes=[];this.rifts=[];this.history=[];this.shots=[];this.events=[];
this.spawnBudget=0;this.refillBudget=0;this.waveTimer=4.5;this.maxLivingEnemies=110;this.echoTimer=2.6;this.pending=[];this.upgradeHistory=[];this.nextId=1;this.bossMarks=new Set();this.hitEvents=0;this.maxEnemiesSeen=0;this.damageTaken=0;this.damageDealt=0;this.echoDamage=0;this.nearMisses=0;this.dashKills=0;this.lastThreat=999;
this.pacing=[{from:0,to:120,kills:0,damage:0,xp:0},{from:120,to:300,kills:0,damage:0,xp:0},{from:300,to:480,kills:0,damage:0,xp:0}];
this.player={x:480,y:300,r:13,hp:110,maxHp:110,speed:230,fire:.27,fireT:.1,damage:21,bulletSpeed:580,pierce:0,dashCd:3,dashT:0,dashActive:0,dashHit:new Set(),dx:1,dy:0,dashSpeed:650,inv:0,magnet:132,echoMult:.72,echoCopies:1,echoCycle:4.8,echoDuration:3,dashDamage:48,riftRadius:84};
}
bucket(){return this.pacing.find(x=>this.time>=x.from&&this.time<x.to)||this.pacing[2]}
emit(type,data={}){this.events.push({type,...data});if(this.events.length>80)this.events.shift()}
nearest(x,y){let best=null,bd=Infinity;for(const e of this.enemies){const d=(e.x-x)**2+(e.y-y)**2;if(e.hp>0&&d<bd){bd=d;best=e}}return best}
chooseUpgrade(id){
if(this.status!=="upgrade")return false;if(!this.pending.some(x=>x.id===id))return false;const p=this.player;
if(id==="damage")p.damage=Math.min(90,p.damage*1.25);else if(id==="rate")p.fire=Math.max(.16,p.fire*.86);else if(id==="pierce")p.pierce=Math.min(4,p.pierce+1);
else if(id==="echoDamage")p.echoMult=Math.min(2.5,p.echoMult*1.36);else if(id==="echoCopy")p.echoCopies=Math.min(3,p.echoCopies+1);else if(id==="echoCycle")p.echoCycle=Math.max(2.7,p.echoCycle*.88);
else if(id==="dashDamage"){p.dashDamage=Math.min(250,p.dashDamage+34);p.riftRadius=Math.min(140,p.riftRadius+10)}else if(id==="dashCd")p.dashCd=Math.max(1.3,p.dashCd-.35);else if(id==="hp"){p.maxHp=Math.min(230,p.maxHp+18);p.hp=Math.min(p.maxHp,p.hp+18)}
else if(id==="magnet")p.magnet=Math.min(250,p.magnet+40);else if(id==="speed")p.speed=Math.min(340,p.speed*1.08);
this.upgradeHistory.push({time:this.time,id});this.pending=[];this.status="playing";this.emit("upgrade",{id});return true;
}
// スマホのカメラ内側に群れを出す。外周スポーンでは敵が見えるまで長すぎる。
spawn(type=null, options={}){
 const t=this.time,r=this.rng.next();
 if(!type){if(t<55)type=r<.77?"chaser":"scout";else if(t<150)type=r<.58?"chaser":r<.81?"scout":"shooter";else if(t<300)type=r<.43?"chaser":r<.64?"scout":r<.86?"shooter":"brute";else type=r<.33?"chaser":r<.55?"scout":r<.80?"shooter":"brute"}
 const stats=STATS[type];
 const angle=options.angle??this.rng.range(0,TAU);
 const radius=options.distance??this.rng.range(145,195);
 // 縦長画面の可視範囲に合わせた楕円形スポーン。左右の画面外待機を解消する。
 const focus=portraitCameraFocus(this.player);
 let x=clamp(focus.x+Math.cos(angle)*radius*.86,24,WORLD.width-24);
 let y=clamp(focus.y+Math.sin(angle)*radius*1.48,24,WORLD.height-24);
 if(Math.hypot(x-this.player.x,y-this.player.y)<105){
  const inward=Math.atan2(WORLD.height/2-this.player.y,WORLD.width/2-this.player.x)+this.rng.range(-.48,.48);
  x=clamp(this.player.x+Math.cos(inward)*180,24,WORLD.width-24);
  y=clamp(this.player.y+Math.sin(inward)*220,24,WORLD.height-24);
 }
 const scale=1+Math.max(0,t-40)/110;
 this.enemies.push({
  id:this.nextId++,type,x,y,r:stats.r,hp:stats.hp*scale,maxHp:stats.hp*scale,
  speed:stats.speed*Math.min(1.23,1+t/2200),
  damage:stats.damage,xp:stats.xp,score:stats.score,
  shootT:this.rng.range(.5,1.7),auxT:this.rng.range(1.2,2.6),flash:0,
  born:this.time,phase:this.rng.range(0,TAU)
 });
}

spawnBoss(mark){
const s=STATS.boss,a=this.rng.range(0,TAU),scale=mark>=360?1.35:1;
this.enemies.push({id:this.nextId++,type:"boss",x:480+Math.cos(a)*360,y:300+Math.sin(a)*240,r:s.r,hp:s.hp*scale,maxHp:s.hp*scale,speed:s.speed,damage:s.damage,xp:s.xp,score:s.score,shootT:.4,auxT:2.4,flash:0,born:this.time,phase:0});
this.emit("boss",{mark});
}
// 主弾と左右の扇状弾で「敵の群れ」を狙わせる。ECHOの射撃角も保存して再演する。
fire(x,y,damage,pierce,echo=false,angle=null){
 if(angle===null){
  const target=this.nearest(x,y);
  if(!target)return;
  angle=Math.atan2(target.y-y,target.x-x);
  if(!echo)this.shots.push({t:this.time,x,y,a:angle});
 }
 for(const offset of [-.18,0,.18]){
  const a=angle+offset;
  this.bullets.push({
   x,y,r:offset===0?5.2:4.3,
   vx:Math.cos(a)*this.player.bulletSpeed,vy:Math.sin(a)*this.player.bulletSpeed,
   damage:damage*(offset===0?1:.66),pierce,life:1.1,echo,hit:new Set()
  });
 }
 this.emit("fire",{x,y,angle,echo});
}

spawnEcho(){
const start=this.time-this.player.echoDuration,samples=this.history.filter(s=>s.t>=start),shots=this.shots.filter(s=>s.t>=start).map(s=>({...s,rel:s.t-start}));
if(samples.length<4)return;
const rel=samples.map(s=>({...s,rel:s.t-start}));
for(let c=0;c<this.player.echoCopies;c++)this.echoes.push({age:-c*.12,duration:this.player.echoDuration,samples:rel,shots:shots.map(s=>({...s,fired:false})),copy:c,x:rel[0].x,y:rel[0].y});
this.emit("echo",{copies:this.player.echoCopies});
}
// 撃破時は小規模な連鎖ダメージを与え、群れを壊す爽快感を生む。
damageEnemy(e,amount,source){
 if(e.hp<=0)return;
 e.hp-=amount;e.flash=.11;
 this.damageDealt+=amount;
 if(source==="echo")this.echoDamage+=amount;
 this.emit("hit",{x:e.x,y:e.y,damage:amount,source});
 if(e.hp>0)return;
 this.kills++;
 if(this.kills%25===0)this.player.hp=Math.min(this.player.maxHp,this.player.hp+1);
 this.score+=Math.round(e.score*(1+this.combo*.06));
 this.combo=Math.min(20,this.combo+1);this.comboTimer=2.7;
 this.maxCombo=Math.max(this.maxCombo,this.combo);
 // 連続撃破が一定数に達したとき、画面全体で認識できる節目を作る。
 if(this.combo>=10&&this.kills%25===0)this.emit("chainBurst",{x:e.x,y:e.y,combo:this.combo});
 if(source==="rift")this.dashKills++;
 const bucket=this.bucket();bucket.kills++;bucket.xp+=e.xp;
 const drops=e.type==="boss"?7:e.type==="brute"?3:1;
 for(let i=0;i<drops;i++){
  const a=this.rng.range(0,TAU),d=this.rng.range(0,e.r+12);
  this.pickups.push({x:e.x+Math.cos(a)*d,y:e.y+Math.sin(a)*d,r:5,
    value:e.xp/drops,vx:Math.cos(a)*30,vy:Math.sin(a)*30});
 }
 if(this.pickups.length>280){
  const collected=this.pickups.splice(0,this.pickups.length-220);
  const survivor=this.pickups[0];if(survivor)survivor.value+=collected.reduce((sum,g)=>sum+g.value,0);
 }
 this.emit("kill",{x:e.x,y:e.y,type:e.type,source});
 // 連鎖は1世代だけ。再帰爆発を防ぎ、性能と難易度を安定させる。
 if(source!=="splash"&&e.type!=="boss"){
  const splashRadius=43;
  for(const other of this.enemies){
   if(other===e||other.hp<=0)continue;
   const dx=other.x-e.x,dy=other.y-e.y;
   if(dx*dx+dy*dy<(splashRadius+other.r)**2){
    this.damageEnemy(other,Math.min(10,amount*.44),"splash");
   }
  }
 }
}

gainXp(v){
this.xp+=v;if(this.xp>=this.xpNeed&&this.status==="playing"&&this.time>=this.nextLevelTime){
 this.xp-=this.xpNeed;this.level++;
 this.nextLevelTime=this.time+8;
 this.player.hp=Math.min(this.player.maxHp,this.player.hp+7);
 // 経験値必要量は単調増加。数秒おきの選択画面連発を防ぐ。
 this.xpNeed=Math.max(this.xpNeed+25,
  Math.round(70+this.level*23+Math.pow(this.level,1.4)*7+Math.max(0,this.level-15)**2*12));
 const p=this.player;
 const available=UPGRADES.filter(u=>{
  if(u.id==="damage")return p.damage<90;
  if(u.id==="rate")return p.fire>.16;
  if(u.id==="pierce")return p.pierce<4;
  if(u.id==="echoDamage")return p.echoMult<2.5;
  if(u.id==="echoCopy")return p.echoCopies<3;
  if(u.id==="echoCycle")return p.echoCycle>2.7;
  if(u.id==="dashDamage")return p.dashDamage<250;
  if(u.id==="dashCd")return p.dashCd>1.3;
  if(u.id==="hp")return p.maxHp<230;
  if(u.id==="magnet")return p.magnet<250;
  if(u.id==="speed")return p.speed<340;
  return true;
 });
 this.pending=weighted(this.rng,3,available.length?available:UPGRADES);this.status="upgrade";this.emit("level",{level:this.level});if(this.autoUpgradePolicy){const id=this.autoUpgradePolicy(this.pending,this.snapshot());this.chooseUpgrade(id||this.pending[0].id)}}
}
hurt(amount){
const p=this.player;if(p.inv>0||p.dashActive>0||this.status!=="playing")return;p.hp-=amount;p.inv=.78;this.damageTaken+=amount;this.hitEvents++;this.combo=0;this.bucket().damage+=amount;this.emit("hurt",{amount});if(p.hp<=0){p.hp=0;this.status="lost";this.emit("lost")}}
// 開始直後から脅威が見え、後半は波状の群れが流れ込む密度を維持する。
updateSpawns(dt){
 for(const mark of [200,400]){
  if(this.time>=mark&&!this.bossMarks.has(mark)){
   this.bossMarks.add(mark);this.spawnBoss(mark);
  }
 }
 const cap=this.maxLivingEnemies;
 this.waveTimer-=dt;
 if(this.waveTimer<=0&&this.enemies.length<cap-12){
  this.waveTimer+=Math.max(6.3,8.2-this.time/240);
  const clusterAngle=this.rng.range(0,TAU);
  const count=Math.min(cap-this.enemies.length,7+Math.floor(this.time/125));
  for(let i=0;i<count;i++){
   this.spawn(null,{angle:clusterAngle+this.rng.range(-.65,.65),distance:this.rng.range(176,250)});
  }
  this.emit("wave",{count});
 }
 const density=5.1+this.time/155;
 const pressure=clamp(1.30-this.enemies.length/72,.16,1.28);
 this.spawnBudget+=dt*density*pressure;
 while(this.spawnBudget>=1&&this.enemies.length<cap){
  this.spawnBudget-=1;this.spawn();
 }
 this.spawnBudget=Math.min(this.spawnBudget,2);
 this.maxEnemiesSeen=Math.max(this.maxEnemiesSeen,this.enemies.length);
}

updatePlayer(dt,input){
const p=this.player;p.fireT-=dt;p.dashT=Math.max(0,p.dashT-dt);p.inv=Math.max(0,p.inv-dt);let m=norm(input.dx||0,input.dy||0);if(!(input.dx||input.dy))m={x:0,y:0};
if((m.x||m.y)&&p.dashActive<=0){p.dx=m.x;p.dy=m.y}
if(input.dash&&p.dashT<=0&&p.dashActive<=0){const d=(m.x||m.y)?m:{x:p.dx,y:p.dy};p.dashActive=.18;p.dashT=p.dashCd;p.inv=Math.max(p.inv,.42);p.dashHit=new Set();p.dx=d.x;p.dy=d.y;this.rifts.push({x:p.x,y:p.y,age:0,damage:p.dashDamage,radius:p.riftRadius,boom:false});this.emit("dash")}
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
// 群れの個体が完全に重ならないよう、近距離だけ軽く押し合う。
let repelX=0,repelY=0;
for(const other of this.enemies){
 if(other===e||other.hp<=0)continue;
 const ox=e.x-other.x,oy=e.y-other.y;
 const desired=e.r+other.r+5,dist2=ox*ox+oy*oy;
 if(dist2>=desired*desired)continue;
 const distance=Math.sqrt(dist2);
 if(distance>0.001){
  const force=(desired-distance)/desired;
  repelX+=ox/distance*force;
  repelY+=oy/distance*force;
 }else{
  repelX+=Math.cos(e.phase)*.7;repelY+=Math.sin(e.phase)*.7;
 }
}
e.x=clamp(e.x+repelX*dt*115,-40,WORLD.width+40);
e.y=clamp(e.y+repelY*dt*115,-40,WORLD.height+40);
if(hit(p,e)&&this.time-e.born>.4)this.hurt(e.damage)}
this.enemies=this.enemies.filter(e=>e.hp>0&&e.x>-120&&e.y>-120&&e.x<1080&&e.y<720);
}
updateEnemyBullets(dt){
const p=this.player;let nearest=999;
for(let i=this.enemyBullets.length-1;i>=0;i--){const b=this.enemyBullets[i];b.life-=dt;b.x+=b.vx*dt;b.y+=b.vy*dt;if(b.life<=0||b.x<-40||b.y<-40||b.x>1000||b.y>640){this.enemyBullets.splice(i,1);continue}const d=Math.hypot(p.x-b.x,p.y-b.y)-p.r-b.r;nearest=Math.min(nearest,d);if(hit(p,b)){this.hurt(b.damage);this.enemyBullets.splice(i,1)}}
if(nearest<14&&nearest>0&&this.lastThreat>=14)this.nearMisses++;this.lastThreat=nearest;
}
updatePickups(dt){
const p=this.player;for(let i=this.pickups.length-1;i>=0;i--){const g=this.pickups[i];g.vx*=Math.pow(.03,dt);g.vy*=Math.pow(.03,dt);g.x+=g.vx*dt;g.y+=g.vy*dt;const dx=p.x-g.x,dy=p.y-g.y,d=Math.max(1,Math.hypot(dx,dy));if(d<p.magnet){const pull=clamp((p.magnet-d)/p.magnet,.3,1)*700;g.x+=dx/d*pull*dt;g.y+=dy/d*pull*dt}if(d<p.r+8){this.gainXp(g.value);this.pickups.splice(i,1)}}
}
updateRifts(dt){
for(let i=this.rifts.length-1;i>=0;i--){const r=this.rifts[i];r.age+=dt;if(!r.boom&&r.age>=.42){
 r.boom=true;let kills=0;
 for(const e of this.enemies){
  if(e.hp<=0)continue;
  const dx=e.x-r.x,dy=e.y-r.y,dist=Math.max(1,Math.hypot(dx,dy));
  if(dist>r.radius+e.r)continue;
  this.damageEnemy(e,r.damage,"rift");
  if(e.hp<=0)kills++;
  else{
   // 衝撃波が敵を押し返す。数値ダメージだけでなく実際の反応を作る。
   const force=22*(1-Math.min(1,dist/(r.radius+e.r)));
   e.x=clamp(e.x+dx/dist*force,0,WORLD.width);
   e.y=clamp(e.y+dy/dist*force,0,WORLD.height);
  }
 }
 if(kills>=3){
  this.player.dashT=Math.max(.35,this.player.dashT-.18*Math.min(3,kills));
  this.emit("dashCombo",{x:r.x,y:r.y,kills});
 }
 this.emit("rift",{x:r.x,y:r.y});
}if(r.age>=.82)this.rifts.splice(i,1)}
}
step(dt,input={dx:0,dy:0,dash:false}){
if(this.status==="lost"||this.status==="won")return;if(this.status==="upgrade"){if(!this.autoUpgradePolicy)return;const id=this.autoUpgradePolicy(this.pending,this.snapshot());this.chooseUpgrade(id||this.pending[0].id)}
dt=clamp(dt,0,.05);this.time+=dt;this.comboTimer-=dt;if(this.comboTimer<=0)this.combo=0;this.updateSpawns(dt);this.updatePlayer(dt,input);this.updateEchoes(dt);this.updateBullets(dt);this.updateEnemies(dt);this.updateEnemyBullets(dt);this.updatePickups(dt);this.updateRifts(dt);
// 描画前に人口を補う。強化後に画面が空白になる問題を防ぐ。
const minimum=25+Math.min(27,Math.floor(this.time*.23));
// 秒間スポーン量とは別に、描画直前の敵密度を保証する。
while(this.enemies.length<minimum&&this.enemies.length<this.maxLivingEnemies)this.spawn();
this.maxEnemiesSeen=Math.max(this.maxEnemiesSeen,this.enemies.length);
if(this.time>=480&&this.status!=="lost"){this.status="won";this.score+=2500;this.emit("won")}
}
snapshot(){const p=this.player;return{seed:this.seed,time:this.time,status:this.status,level:this.level,xp:this.xp,xpNeed:this.xpNeed,score:this.score,kills:this.kills,combo:this.combo,maxCombo:this.maxCombo,hp:p.hp,maxHp:p.maxHp,player:{x:p.x,y:p.y,r:p.r,dashT:p.dashT,dashCd:p.dashCd},pending:this.pending.map(x=>({id:x.id,name:x.name,desc:x.desc})),enemyCount:this.enemies.length,maxEnemiesSeen:this.maxEnemiesSeen,echoCount:this.echoes.length,upgrades:[...this.upgradeHistory]}}
metrics(){const p=this.player;return{seed:this.seed,status:this.status,survival:+this.time.toFixed(1),score:this.score,kills:this.kills,level:this.level,hp:+p.hp.toFixed(1),maxHp:p.maxHp,maxCombo:this.maxCombo,hits:this.hitEvents,damageTaken:this.damageTaken,damageDealt:Math.round(this.damageDealt),echoShare:this.damageDealt?+(this.echoDamage/this.damageDealt).toFixed(3):0,nearMisses:this.nearMisses,maxEnemiesSeen:this.maxEnemiesSeen,dashKills:this.dashKills,upgrades:this.upgradeHistory.map(x=>x.id),pacing:this.pacing.map(x=>({...x}))}}
}

export function threatVector(game,radius=260){
const p=game.player;let x=0,y=0,w=0;
for(const e of game.enemies){const dx=p.x-e.x,dy=p.y-e.y,d=Math.max(1,Math.hypot(dx,dy));if(d<radius){const q=(radius-d)/radius;x+=dx/d*q;y+=dy/d*q;w+=q}}
for(const b of game.enemyBullets){const dx=p.x-b.x,dy=p.y-b.y,d=Math.max(1,Math.hypot(dx,dy));if(d<radius*.8){const q=1.8*(radius*.8-d)/(radius*.8);x+=dx/d*q;y+=dy/d*q;w+=q}}
if(!w)return{x:0,y:0,magnitude:0};const n=norm(x,y);return{x:n.x,y:n.y,magnitude:Math.min(1,w/2.4)}
}
