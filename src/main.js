import {EchoRiftGame,WORLD,portraitCameraFocus} from "./game.js";

const app=document.querySelector("#app"),canvas=document.querySelector("#game"),ctx=canvas.getContext("2d");
const startPanel=document.querySelector("#start"),upgradePanel=document.querySelector("#upgrade"),resultPanel=document.querySelector("#result");
const startBtn=document.querySelector("#startBtn"),retryBtn=document.querySelector("#retryBtn"),choices=document.querySelector("#upgradeChoices");
const hpbar=document.querySelector("#hpbar"),xpbar=document.querySelector("#xpbar"),timeEl=document.querySelector("#time"),levelEl=document.querySelector("#level"),scoreEl=document.querySelector("#score");
const toast=document.querySelector("#toast"),tutorial=document.querySelector("#tutorial"),joystick=document.querySelector("#joystick"),stick=document.querySelector("#joystick i"),dashButton=document.querySelector("#dashButton");
let game=makeAttractGame(),started=false,last=performance.now(),keys=new Set(),dashQueued=false,upgradeShownFor=0,toastTimer=0,tutorialTimer=0,echoNotice=false,screenShake=0;
let touchVec={x:0,y:0},joyPointer=null,joyOrigin={x:0,y:0},particles=[],shockwaves=[],damageNumbers=[],muzzleFlashes=[];

function resizeCanvas(){canvas.width=Math.max(1,Math.floor(innerWidth));canvas.height=Math.max(1,Math.floor(innerHeight))}
resizeCanvas();window.addEventListener("resize",resizeCanvas);

// iOS Safari上ではゲーム領域のブラウザズーム・スクロールジェスチャーを使わせない。
for(const type of ["gesturestart","gesturechange","gestureend"]){
 window.addEventListener(type,e=>e.preventDefault(),{passive:false});
}
document.addEventListener("touchmove",e=>{
 if(e.touches.length>1)e.preventDefault();
},{passive:false});
function setWorldCamera(){
 const portrait=canvas.height>canvas.width*1.25;
 const scale=portrait?canvas.width/420:Math.max(canvas.width/WORLD.width,canvas.height/WORLD.height);
 const vw=canvas.width/scale,vh=canvas.height/scale,p=game.player;
 // ワールド端では戦場側を広く見せる。カメラ倍率は変えず位置のみ調整する。
 const focus=portraitCameraFocus(p);
 const camX=portrait?focus.x:(vw>=WORLD.width?WORLD.width/2:Math.max(vw/2,Math.min(WORLD.width-vw/2,p.x)));
 const camY=portrait?focus.y:(vh>=WORLD.height?WORLD.height/2:Math.max(vh/2,Math.min(WORLD.height-vh/2,p.y)));
 ctx.setTransform(scale,0,0,scale,canvas.width/2-camX*scale,canvas.height/2-camY*scale);
}

function demoInput(g){
 const a=g.time*.58;
 return{
   dx:Math.cos(a)+Math.sin(g.time*.17)*.32,
   dy:Math.sin(a*.83)+Math.cos(g.time*.11)*.22,
   dash:Math.sin(g.time*1.9)>.985
 };
}
function makeAttractGame(){
 const g=new EchoRiftGame({seed:0xEC4017,autoUpgradePolicy:choices=>choices[0]?.id});
 g.player.maxHp=9999;g.player.hp=9999;
 for(let i=0;i<3200&&g.status==="playing";i++)g.step(.05,demoInput(g));
 g.events=[];
 return g;
}

const rnd=(a,b)=>a+Math.random()*(b-a);

// エフェクトを使い捨て配列に集約し、スマホでGPU負荷が増え続けないよう上限を持つ。
function burst(x,y,color,count=8,power=1){
 for(let i=0;i<count;i++){
  const angle=rnd(0,Math.PI*2),speed=rnd(55,210)*power;
  particles.push({
   x,y,vx:Math.cos(angle)*speed,vy:Math.sin(angle)*speed,
   life:rnd(.22,.58),age:0,color,size:rnd(1.8,4.6)*Math.min(1.4,power)
  });
 }
 if(particles.length>520)particles.splice(0,particles.length-520);
}
function shockwave(x,y,color,radius=48,life=.32){
 shockwaves.push({x,y,color,radius,life,age:0});
 if(shockwaves.length>28)shockwaves.splice(0,shockwaves.length-28);
}
function floatDamage(x,y,amount,color){
 damageNumbers.push({x:x+rnd(-10,10),y:y-18,amount:Math.round(amount),color,age:0,life:.62});
 if(damageNumbers.length>32)damageNumbers.shift();
}

function showToast(text){toast.textContent=text;toast.classList.add("show");toastTimer=1.2}
function playTone(freq=220,duration=.04,gain=.02){
 try{audio??=new AudioContext();const o=audio.createOscillator(),g=audio.createGain();o.type="sine";o.frequency.value=freq;g.gain.setValueAtTime(gain,audio.currentTime);g.gain.exponentialRampToValueAtTime(.0001,audio.currentTime+duration);o.connect(g).connect(audio.destination);o.start();o.stop(audio.currentTime+duration)}catch{}
}
let audio=null,lastImpactSound=0;

// 撃破連打時は音を間引き、音割れと耳障りな連続音を防ぐ。
function playImpactSound(fromEcho=false){
 if(!started||!audio||performance.now()-lastImpactSound<105)return;
 lastImpactSound=performance.now();
 try{
  const oscillator=audio.createOscillator(),gain=audio.createGain(),now=audio.currentTime;
  oscillator.type="triangle";
  oscillator.frequency.setValueAtTime(fromEcho?430:290,now);
  oscillator.frequency.exponentialRampToValueAtTime(fromEcho?180:115,now+.065);
  gain.gain.setValueAtTime(.018,now);
  gain.gain.exponentialRampToValueAtTime(.0001,now+.075);
  oscillator.connect(gain).connect(audio.destination);oscillator.start(now);oscillator.stop(now+.08);
 }catch{}
}
// キューは毎フレーム排出する。従来の配列index方式では80件で演出が停止していた。
function consumeEvents(){
 const events=game.events.splice(0);
 for(const e of events){
  if(e.type==="fire"){
   if(e.echo||Math.random()<.75){
    muzzleFlashes.push({x:e.x,y:e.y,angle:e.angle,echo:e.echo,age:0});
    if(muzzleFlashes.length>24)muzzleFlashes.shift();
   }
  }else if(e.type==="hit"){
   if(Math.random()<.55)burst(e.x,e.y,e.source==="echo"?"#73f2ff":"#ffcedd",2,.55);
   if(e.damage>19&&Math.random()<.24)floatDamage(e.x,e.y,e.damage,e.source==="echo"?"#8af2ff":"#ffe2ac");
  }else if(e.type==="kill"){
   const boss=e.type==="boss";
   const color=boss?"#fff5bc":e.source==="echo"?"#6af2ff":e.source==="rift"?"#be7cff":"#ff628d";
   burst(e.x,e.y,color,boss?56:12,boss?1.9:1.1);
   shockwave(e.x,e.y,color,boss?150:37,boss?.8:.27);
   playImpactSound(e.source==="echo");
   screenShake=Math.max(screenShake,boss?9:1.5);
   if(boss&&started){showToast("ボス撃破");playTone(105,.25,.035)}
  }else if(e.type==="hurt"){
   screenShake=Math.max(screenShake,5.2);
   burst(game.player.x,game.player.y,"#ff637f",24,1.3);
   if(started)playTone(100,.11,.025);
  }else if(e.type==="dash"){
   burst(game.player.x,game.player.y,"#7ef5ff",20,1.4);
   shockwave(game.player.x,game.player.y,"#61e9ff",54,.25);
   if(started)playTone(300,.06,.022);
  }else if(e.type==="dashHit"){
   burst(e.x,e.y,"#df96ff",16,1.2);
   shockwave(e.x,e.y,"#ca83ff",43,.22);
  }else if(e.type==="rift"){
   burst(e.x,e.y,"#c989ff",30,1.6);
   shockwave(e.x,e.y,"#c989ff",110,.42);
   screenShake=Math.max(screenShake,3.6);
  }else if(e.type==="dashCombo"){
   burst(e.x,e.y,"#fff8c4",24,1.4);
   shockwave(e.x,e.y,"#f5c7ff",130,.35);
   screenShake=Math.max(screenShake,4.4);
   if(started)playTone(540,.08,.022);
  }else if(e.type==="chainBurst"){
   burst(e.x,e.y,"#fff4b3",34,1.55);
   shockwave(e.x,e.y,"#ffe08b",125,.5);
   screenShake=Math.max(screenShake,3.2);
   if(started)playTone(620,.10,.018);
  }else if(e.type==="echo"){
   const p=game.player;
   shockwave(p.x,p.y,"#67e9ff",84,.7);
   if(started&&!echoNotice){echoNotice=true;showToast("残像が攻撃開始")}
  }else if(e.type==="boss"){
   screenShake=Math.max(screenShake,5);
   if(started){showToast("ボス出現");playTone(74,.3,.03)}
  }else if(e.type==="level"&&started){
   playTone(660,.10,.024);
  }
 }
}

function reset(){
 // iOS Safariはユーザー操作の直後でないと音声再生を許可しない。
 try{
  const AC=window.AudioContext||window.webkitAudioContext;
  if(AC){audio??=new AC();audio.resume?.().catch(()=>{});}
 }catch{}
 game=new EchoRiftGame({seed:(Date.now()^Math.floor(Math.random()*1e9))>>>0});
 const starters=Array.from({length:16},(_,index)=>{
   const a=index/16*Math.PI*2;
   const radius=135+(index%3)*27;
   return [index%5===0?"scout":"chaser",
     Math.max(28,Math.min(WORLD.width-28,480+Math.cos(a)*radius)),
     Math.max(28,Math.min(WORLD.height-28,300+Math.sin(a)*radius))];
 });
 for(const [type,x,y] of starters){
   game.spawn(type);
   const enemy=game.enemies[game.enemies.length-1];
   enemy.x=x;enemy.y=y;
 }
 started=true;last=performance.now();echoNotice=false;particles=[];shockwaves=[];damageNumbers=[];muzzleFlashes=[];tutorialTimer=3.6;
 startPanel.classList.add("hidden");upgradePanel.classList.add("hidden");resultPanel.classList.add("hidden");tutorial.classList.remove("hidden");app.classList.remove("ui-blocked","intro");
}
startPanel.addEventListener("click",reset);retryBtn.addEventListener("click",reset);
window.addEventListener("keydown",e=>{
 if(!started&&["Enter","Space","ArrowUp","ArrowDown","ArrowLeft","ArrowRight","KeyW","KeyA","KeyS","KeyD"].includes(e.code))reset();
 if(["ArrowUp","ArrowDown","ArrowLeft","ArrowRight","Space"].includes(e.code))e.preventDefault();keys.add(e.code);if(e.code==="Space")dashQueued=true;
 if(game.status==="upgrade"&&["Digit1","Digit2","Digit3"].includes(e.code)){const idx=Number(e.code.slice(-1))-1;if(game.pending[idx])game.chooseUpgrade(game.pending[idx].id)}
});
window.addEventListener("keyup",e=>keys.delete(e.code));

function updateJoystick(e){
 const dx=e.clientX-joyOrigin.x,dy=e.clientY-joyOrigin.y,d=Math.hypot(dx,dy),max=42,k=Math.min(1,d/max);
 touchVec=d?{x:dx/d*k,y:dy/d*k}:{x:0,y:0};
 stick.style.transform=`translate(${touchVec.x*max}px,${touchVec.y*max}px)`;
}
function beginTouchControl(e){
 if(!started||game.status!=="playing"||app.classList.contains("ui-blocked"))return;
 if(e.clientX<innerWidth*.58){
   joyPointer=e.pointerId;joyOrigin={x:e.clientX,y:e.clientY};
   const size=124,left=Math.max(8,Math.min(innerWidth-size-8,e.clientX-size/2)),top=Math.max(80,Math.min(innerHeight-size-8,e.clientY-size/2));
   joystick.style.left=left+"px";joystick.style.top=top+"px";
   joystick.classList.add("active");canvas.setPointerCapture(e.pointerId);updateJoystick(e);
 }else if(e.clientY>innerHeight*.34){
   dashQueued=true;dashButton.classList.add("pressed");
   setTimeout(()=>dashButton.classList.remove("pressed"),110);
 }
}
function moveTouchControl(e){if(e.pointerId===joyPointer)updateJoystick(e)}
function endJoy(e){
 if(e.pointerId!==joyPointer)return;
 joyPointer=null;touchVec={x:0,y:0};stick.style.transform="translate(0,0)";joystick.classList.remove("active");
}
canvas.addEventListener("pointerdown",beginTouchControl);
canvas.addEventListener("pointermove",moveTouchControl);
canvas.addEventListener("pointerup",endJoy);canvas.addEventListener("pointercancel",endJoy);
dashButton.addEventListener("pointerdown",e=>{e.preventDefault();e.stopPropagation();dashQueued=true;dashButton.classList.add("pressed")});
dashButton.addEventListener("pointerup",()=>dashButton.classList.remove("pressed"));
dashButton.addEventListener("pointercancel",()=>dashButton.classList.remove("pressed"));

function input(){
 let x=(keys.has("KeyD")||keys.has("ArrowRight")?1:0)-(keys.has("KeyA")||keys.has("ArrowLeft")?1:0);
 let y=(keys.has("KeyS")||keys.has("ArrowDown")?1:0)-(keys.has("KeyW")||keys.has("ArrowUp")?1:0);
 if(Math.abs(touchVec.x)+Math.abs(touchVec.y)>.05){x=touchVec.x;y=touchVec.y}
 const dash=dashQueued;dashQueued=false;return{dx:x,dy:y,dash};
}

function roundRect(x,y,w,h,r){
 ctx.beginPath();ctx.roundRect(x,y,w,h,r);
}
function glow(color,blur){ctx.shadowColor=color;ctx.shadowBlur=blur}
function noGlow(){ctx.shadowBlur=0}

// グリッドはカメラ外まで連続させ、敵や爆発が増えても背景の描画負荷を一定にする。
function renderBackground(t){
 ctx.fillStyle="#050b17";
 ctx.fillRect(-1000,-1000,2960,2600);
 const gradient=ctx.createRadialGradient(game.player.x,game.player.y,15,game.player.x,game.player.y,550);
 gradient.addColorStop(0,"#101d35");gradient.addColorStop(.55,"#081426");
 gradient.addColorStop(1,"#040711");
 ctx.fillStyle=gradient;ctx.fillRect(-1000,-1000,2960,2600);

 ctx.save();ctx.strokeStyle="rgba(36,102,137,.24)";ctx.lineWidth=1;
 const offset=(t*4)%52;ctx.beginPath();
 for(let x=-1150+offset;x<2100;x+=52){ctx.moveTo(x,-1000);ctx.lineTo(x-360,1600)}
 for(let y=-1000;y<1700;y+=52){ctx.moveTo(-1200,y);ctx.lineTo(2000,y)}
 ctx.stroke();ctx.restore();

 // 速度差のある微光を置き、単色の真っ暗な背景になるのを防ぐ。
 ctx.save();
 for(let i=0;i<65;i++){
  const x=((i*187+53)%1800)-400;
  const y=((i*293+23)%1300)-350;
  const alpha=.12+.15*(1+Math.sin(t*(.6+i%5*.2)+i))*.5;
  ctx.fillStyle="rgba(98,213,247,"+alpha+")";
  ctx.fillRect(x,y,i%7===0?2.4:1.4,i%7===0?2.4:1.4);
 }
 ctx.restore();
}

// エフェクトの年齢からリング半径を決める。ズームせず画面内だけを強調する。
function drawShockwaves(){
 for(const w of shockwaves){
  const progress=w.age/w.life;
  ctx.save();
  ctx.globalAlpha=(1-progress)*.8;
  ctx.strokeStyle=w.color;
  ctx.lineWidth=3.2*(1-progress)+.8;
  ctx.beginPath();ctx.arc(w.x,w.y,w.radius*(.15+.85*progress),0,Math.PI*2);ctx.stroke();
  ctx.globalAlpha=(1-progress)*.08;
  ctx.fillStyle=w.color;
  ctx.beginPath();ctx.arc(w.x,w.y,w.radius*(.15+.85*progress),0,Math.PI*2);ctx.fill();
  ctx.restore();
 }
}

// 雑魚は大量に描くため、Canvasの重いshadowBlurはボス以外に使わない。
function drawEnemy(e,t){
 const boss=e.type==="boss",brute=e.type==="brute",scout=e.type==="scout",shooter=e.type==="shooter";
 const color=boss?"#ff5075":brute?"#b981ff":shooter?"#ffb75d":scout?"#f5dc65":"#ff618d";
 const sides=boss?9:brute?6:shooter?4:scout?3:5;
 ctx.save();ctx.translate(e.x,e.y);
 const spin=(scout?1.45:.45)*t+e.phase;
 const pulse=1+Math.sin(t*5+e.id)*.05;
 ctx.rotate(spin);ctx.scale(pulse,pulse);
 if(boss){ctx.shadowBlur=21;ctx.shadowColor="#ff3559"}
 ctx.fillStyle=e.flash>0?"#ffffff":color;
 ctx.strokeStyle=boss?"#ffe6f2":"rgba(255,255,255,.55)";ctx.lineWidth=boss?3:1.6;
 ctx.beginPath();
 for(let i=0;i<sides;i++){
  const a=i/sides*Math.PI*2-Math.PI/2;
  const r=e.r*(i%2===0?1:.87);
  i===0?ctx.moveTo(Math.cos(a)*r,Math.sin(a)*r):ctx.lineTo(Math.cos(a)*r,Math.sin(a)*r);
 }
 ctx.closePath();ctx.fill();ctx.stroke();ctx.shadowBlur=0;
 // 暗いコアと白い2つの目で小さな雑魚にも顔と動く方向を与える。
 ctx.rotate(-spin);
 ctx.fillStyle=boss?"#591228":"#152238";
 ctx.beginPath();ctx.arc(0,0,e.r*.52,0,Math.PI*2);ctx.fill();
 ctx.fillStyle="#fff7ef";
 const eye=e.r*.17;
 ctx.beginPath();ctx.arc(-eye,-e.r*.12,Math.max(1.6,e.r*.105),0,Math.PI*2);
 ctx.arc(eye,-e.r*.12,Math.max(1.6,e.r*.105),0,Math.PI*2);ctx.fill();
 if(t-e.born<.42){
  ctx.strokeStyle=color;ctx.globalAlpha=(1-(t-e.born)/.42)*.42;ctx.lineWidth=1.6;
  ctx.beginPath();ctx.arc(0,0,e.r+10*(1-(t-e.born)/.42),0,Math.PI*2);ctx.stroke();
 }
 if(boss||brute){
  const ratio=Math.max(0,e.hp/e.maxHp);
  ctx.fillStyle="#080d1a";ctx.fillRect(-e.r,-e.r-12,e.r*2,4);
  ctx.fillStyle=color;ctx.fillRect(-e.r,-e.r-12,e.r*2*ratio,4);
 }
 ctx.restore();
}

function renderWorld(){
 const p=game.player,t=game.time;
 for(const r of game.rifts){
  const progress=Math.min(1,r.age/.42);
  ctx.save();
  ctx.globalAlpha=r.boom?Math.max(0,1-(r.age-.42)/.4):.38;
  ctx.strokeStyle=r.boom?"#f5a4ff":"#a47cff";
  ctx.lineWidth=r.boom?5:2.5;
  ctx.beginPath();ctx.arc(r.x,r.y,r.boom?r.radius:14+(r.radius-14)*progress,0,Math.PI*2);ctx.stroke();
  ctx.restore();
 }
 drawShockwaves();
 // 経験値アイテムはまとめて1回のfillにして、数が増えても描画を安定させる。
 ctx.fillStyle="#80eeff";ctx.beginPath();
 for(const g of game.pickups){
  ctx.moveTo(g.x,g.y-5.5);ctx.lineTo(g.x+4.6,g.y);
  ctx.lineTo(g.x,g.y+5.5);ctx.lineTo(g.x-4.6,g.y);ctx.closePath();
 }
 ctx.fill();

 // 3秒前の軌道を可視化し、ECHOがなぜその位置にいるか理解できるようにする。
 for(const e of game.echoes){
  if(e.age<0)continue;
  ctx.save();
  ctx.globalAlpha=.26;ctx.strokeStyle="#61e7ff";ctx.lineWidth=2;
  ctx.beginPath();let count=0;
  for(const sample of e.samples){
   if(sample.rel>e.age)break;
   if(count%3===0){count===0?ctx.moveTo(sample.x,sample.y):ctx.lineTo(sample.x,sample.y)}
   count++;
  }
  ctx.stroke();
  ctx.globalAlpha=.7;ctx.fillStyle="#6af2ff";ctx.shadowColor="#53eaff";ctx.shadowBlur=18;
  ctx.beginPath();ctx.arc(e.x,e.y,12,0,Math.PI*2);ctx.fill();
  ctx.shadowBlur=0;ctx.strokeStyle="#c9faff";ctx.lineWidth=2;
  ctx.beginPath();ctx.arc(e.x,e.y,19+Math.sin(t*9)*2,0,Math.PI*2);ctx.stroke();
  ctx.restore();
 }

 // 加算合成は弾と火花に限定する（敵を光らせすぎると形が読めない）。
 ctx.save();ctx.globalCompositeOperation="lighter";
 for(const b of game.bullets){
  const color=b.echo?"#77efff":"#ff8ab9";
  ctx.strokeStyle=color;ctx.lineWidth=b.echo?3.3:3.8;ctx.lineCap="round";
  ctx.beginPath();ctx.moveTo(b.x,b.y);ctx.lineTo(b.x-b.vx*.032,b.y-b.vy*.032);ctx.stroke();
  ctx.fillStyle="#fff";
  ctx.beginPath();ctx.arc(b.x,b.y,1.7,0,Math.PI*2);ctx.fill();
 }
 for(const flash of muzzleFlashes){
  const fade=1-flash.age/.13;
  ctx.globalAlpha=Math.max(0,fade);
  ctx.strokeStyle=flash.echo?"#8af8ff":"#ffd5ed";ctx.lineWidth=4*fade;
  ctx.beginPath();ctx.arc(flash.x,flash.y,7+14*(1-fade),flash.angle-.7,flash.angle+.7);ctx.stroke();
 }
 ctx.globalAlpha=1;
 for(const b of game.enemyBullets){
  ctx.strokeStyle="#ffb64b";ctx.lineWidth=3.5;ctx.beginPath();
  ctx.moveTo(b.x,b.y);ctx.lineTo(b.x-b.vx*.025,b.y-b.vy*.025);ctx.stroke();
  ctx.fillStyle="#fff1aa";ctx.beginPath();ctx.arc(b.x,b.y,2.6,0,Math.PI*2);ctx.fill();
 }
 ctx.restore();

 for(const e of game.enemies)drawEnemy(e,t);

 ctx.save();ctx.globalCompositeOperation="lighter";
 for(const q of particles){
  const alpha=Math.max(0,1-q.age/q.life);
  ctx.globalAlpha=alpha;ctx.strokeStyle=q.color;ctx.lineWidth=q.size;ctx.lineCap="round";
  ctx.beginPath();ctx.moveTo(q.x,q.y);ctx.lineTo(q.x-q.vx*.027,q.y-q.vy*.027);ctx.stroke();
 }
 ctx.restore();
 for(const n of damageNumbers){
  ctx.save();ctx.globalAlpha=Math.max(0,1-n.age/n.life);
  ctx.font="900 12px system-ui";ctx.fillStyle=n.color;ctx.textAlign="center";
  ctx.fillText(String(n.amount),n.x,n.y-n.age*24);ctx.restore();
 }
 // 残像の発生直後やダッシュ中は移動の軌跡を見せる。カメラ倍率は固定。
 ctx.save();ctx.translate(p.x,p.y);
 if(p.dashActive>0){
  ctx.globalAlpha=.3;ctx.fillStyle="#6bedff";
  ctx.beginPath();ctx.ellipse(-p.dx*36,-p.dy*36,48,13,Math.atan2(p.dy,p.dx),0,Math.PI*2);ctx.fill();
 }
 ctx.globalAlpha=p.inv>0?.75+Math.sin(t*22)*.15:1;
 ctx.fillStyle="#eaffff";ctx.shadowColor="#4beaff";ctx.shadowBlur=23;
 ctx.beginPath();ctx.arc(0,0,p.r,0,Math.PI*2);ctx.fill();
 ctx.shadowBlur=0;ctx.strokeStyle="#5ef2ff";ctx.lineWidth=3;
 ctx.beginPath();ctx.arc(0,0,p.r+8,t*2.5,t*2.5+Math.PI*1.55);ctx.stroke();
 ctx.restore();
 if(game.combo>=5){
  ctx.save();ctx.font="900 17px system-ui";ctx.fillStyle="#a3f7ff";ctx.textAlign="center";
  ctx.fillText("×"+game.combo,p.x,p.y-35);ctx.restore();
 }
}

// 一定時間で確実に消す。長時間プレイで演出がメモリへ蓄積しないようにする。
function updateParticles(dt){
 for(const array of [particles,shockwaves,damageNumbers,muzzleFlashes]){
  for(let i=array.length-1;i>=0;i--){
   const fx=array[i];fx.age+=dt;
   if(array===particles){
    fx.x+=fx.vx*dt;fx.y+=fx.vy*dt;
    const drag=Math.pow(.05,dt);fx.vx*=drag;fx.vy*=drag;
   }
   if(fx.age>=(fx.life??.13))array.splice(i,1);
  }
 }
 screenShake=Math.max(0,screenShake-dt*21);
}

function updateUi(){
 const s=game.snapshot(),remain=Math.max(0,WORLD.runSeconds-s.time),m=Math.floor(remain/60),sec=Math.floor(remain%60);
 timeEl.textContent=`${String(m).padStart(2,"0")}:${String(sec).padStart(2,"0")}`;levelEl.textContent=`LV ${s.level}`;scoreEl.textContent=s.score.toLocaleString();
 hpbar.style.transform=`scaleX(${Math.max(0,s.hp/s.maxHp)})`;xpbar.style.transform=`scaleX(${Math.min(1,s.xp/s.xpNeed)})`;
 if(game.status==="upgrade"&&upgradeShownFor!==game.level){app.classList.add("ui-blocked");upgradeShownFor=game.level;choices.innerHTML="";game.pending.forEach((u,i)=>{const b=document.createElement("button");b.className="upgrade";b.innerHTML=`<kbd>${i+1}</kbd><span><strong>${u.name}</strong><small>${u.desc}</small></span><span>選択</span>`;b.addEventListener("click",()=>game.chooseUpgrade(u.id));choices.append(b)});upgradePanel.classList.remove("hidden")}
 if(game.status!=="upgrade"){upgradePanel.classList.add("hidden");if(started&&game.status==="playing")app.classList.remove("ui-blocked")}
 if((game.status==="won"||game.status==="lost")&&resultPanel.classList.contains("hidden")){app.classList.add("ui-blocked");const m=game.metrics();document.querySelector("#resultLabel").textContent=game.status==="won"?"クリア":"ゲームオーバー";document.querySelector("#resultTitle").textContent=game.status==="won"?"8分生き残りました":`生存時間 ${Math.floor(m.survival/60)}:${String(Math.floor(m.survival%60)).padStart(2,"0")}`;document.querySelector("#resultStats").innerHTML=`<div class="resultStat"><b>${m.score.toLocaleString()}</b><span>SCORE</span></div><div class="resultStat"><b>${m.kills}</b><span>KILLS</span></div><div class="resultStat"><b>${m.maxCombo}</b><span>MAX CHAIN</span></div>`;resultPanel.classList.remove("hidden")}
}

function frame(now){
 const dt=Math.min(.033,(now-last)/1000);last=now;
 if(!started){
   if(game.status==="lost"||game.status==="won"||game.time>150){game=makeAttractGame();particles=[];shockwaves=[];damageNumbers=[];muzzleFlashes=[]}
   game.step(dt,demoInput(game));
 }else if(game.status!=="upgrade"&&game.status!=="won"&&game.status!=="lost"){
   game.step(dt,input());
 }
 updateParticles(dt);consumeEvents();
 if(toastTimer>0){toastTimer-=dt;if(toastTimer<=0)toast.classList.remove("show")}
 if(tutorialTimer>0){
   tutorialTimer-=dt;
   if(game.status==="upgrade"||tutorialTimer<=0)tutorial.classList.add("hidden");
 }
 ctx.setTransform(1,0,0,1,0,0);ctx.fillStyle="#020307";ctx.fillRect(0,0,canvas.width,canvas.height);setWorldCamera();
 if(screenShake>.2)ctx.translate((Math.random()-.5)*screenShake,(Math.random()-.5)*screenShake);
 renderBackground(game.time);renderWorld();ctx.setTransform(1,0,0,1,0,0);updateUi();requestAnimationFrame(frame);
}
window.__echoRift={get game(){return game},start:reset,metrics:()=>game.metrics()};
requestAnimationFrame(frame);
