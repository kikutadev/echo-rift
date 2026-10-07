import {EchoRiftGame,WORLD} from "./game.js";

const app=document.querySelector("#app"),canvas=document.querySelector("#game"),ctx=canvas.getContext("2d");
const startPanel=document.querySelector("#start"),upgradePanel=document.querySelector("#upgrade"),resultPanel=document.querySelector("#result");
const startBtn=document.querySelector("#startBtn"),retryBtn=document.querySelector("#retryBtn"),choices=document.querySelector("#upgradeChoices");
const hpbar=document.querySelector("#hpbar"),xpbar=document.querySelector("#xpbar"),timeEl=document.querySelector("#time"),levelEl=document.querySelector("#level"),scoreEl=document.querySelector("#score");
const toast=document.querySelector("#toast"),joystick=document.querySelector("#joystick"),stick=document.querySelector("#joystick i"),dashButton=document.querySelector("#dashButton");
let game=new EchoRiftGame({seed:Date.now()&0xffffffff}),started=false,last=performance.now(),keys=new Set(),dashQueued=false,upgradeShownFor=0,eventSeen=0,toastTimer=0,echoNotice=false;
let touchVec={x:0,y:0},joyPointer=null,particles=[];

function resizeCanvas(){canvas.width=Math.max(1,Math.floor(innerWidth));canvas.height=Math.max(1,Math.floor(innerHeight))}
resizeCanvas();window.addEventListener("resize",resizeCanvas);
function setWorldCamera(){
 const scale=Math.max(canvas.width/WORLD.width,canvas.height/WORLD.height);
 const vw=canvas.width/scale,vh=canvas.height/scale,p=game.player,portrait=canvas.height>canvas.width*1.25;
 const camX=portrait?p.x:(vw>=WORLD.width?WORLD.width/2:Math.max(vw/2,Math.min(WORLD.width-vw/2,p.x)));
 const camY=portrait?p.y:(vh>=WORLD.height?WORLD.height/2:Math.max(vh/2,Math.min(WORLD.height-vh/2,p.y)));
 ctx.setTransform(scale,0,0,scale,canvas.width/2-camX*scale,canvas.height/2-camY*scale);
}

const rnd=(a,b)=>a+Math.random()*(b-a);
function burst(x,y,color,count=8){
 for(let i=0;i<count;i++){const a=Math.random()*Math.PI*2,s=rnd(35,180);particles.push({x,y,vx:Math.cos(a)*s,vy:Math.sin(a)*s,life:rnd(.18,.5),age:0,color})}
 if(particles.length>300)particles.splice(0,particles.length-300);
}
function showToast(text){toast.textContent=text;toast.classList.add("show");toastTimer=1.2}
function playTone(freq=220,duration=.04,gain=.02){
 try{audio??=new AudioContext();const o=audio.createOscillator(),g=audio.createGain();o.type="sine";o.frequency.value=freq;g.gain.setValueAtTime(gain,audio.currentTime);g.gain.exponentialRampToValueAtTime(.0001,audio.currentTime+duration);o.connect(g).connect(audio.destination);o.start();o.stop(audio.currentTime+duration)}catch{}
}
let audio=null;
function consumeEvents(){
 const events=game.events;
 if(eventSeen>events.length)eventSeen=0;
 for(let i=eventSeen;i<events.length;i++){
   const e=events[i];
   if(e.type==="kill"){burst(e.x,e.y,e.type==="boss"?"#ffffff":e.source==="echo"?"#5bf4ff":"#ff6ba7",e.type==="boss"?36:7);if(e.type==="boss"){showToast("WARDEN BREAK");playTone(90,.35,.04)}}
   if(e.type==="hurt"){playTone(95,.12,.03)}
   if(e.type==="dash"){playTone(330,.05,.018)}
   if(e.type==="level"){playTone(660,.12,.025)}
   if(e.type==="boss"){showToast("WARDEN SIGNAL DETECTED");playTone(74,.3,.035)}
   if(e.type==="rift"){burst(e.x,e.y,"#ca72ff",18)}
   if(e.type==="dashHit"){burst(e.x,e.y,"#e28cff",10);playTone(250,.045,.018)}
   if(e.type==="echo"){playTone(480,.06,.012);if(!echoNotice){echoNotice=true;showToast("3秒前の自分が再演している")}}
 }
 eventSeen=events.length;
}

function reset(){
 game=new EchoRiftGame({seed:(Date.now()^Math.floor(Math.random()*1e9))>>>0});started=true;last=performance.now();eventSeen=0;echoNotice=false;particles=[];
 startPanel.classList.add("hidden");upgradePanel.classList.add("hidden");resultPanel.classList.add("hidden");app.classList.remove("ui-blocked");
}
startBtn.addEventListener("click",reset);retryBtn.addEventListener("click",reset);
window.addEventListener("keydown",e=>{if(["ArrowUp","ArrowDown","ArrowLeft","ArrowRight","Space"].includes(e.code))e.preventDefault();keys.add(e.code);if(e.code==="Space")dashQueued=true;
 if(game.status==="upgrade"&&["Digit1","Digit2","Digit3"].includes(e.code)){const idx=Number(e.code.slice(-1))-1;if(game.pending[idx])game.chooseUpgrade(game.pending[idx].id)}
});
window.addEventListener("keyup",e=>keys.delete(e.code));

function updateJoystick(e){
 const r=joystick.getBoundingClientRect(),cx=r.left+r.width/2,cy=r.top+r.height/2,dx=e.clientX-cx,dy=e.clientY-cy,d=Math.hypot(dx,dy),max=r.width*.34,k=Math.min(1,d/max);
 touchVec=d?{x:dx/d*k,y:dy/d*k}:{x:0,y:0};stick.style.transform=`translate(${touchVec.x*max}px,${touchVec.y*max}px)`;
}
joystick.addEventListener("pointerdown",e=>{joyPointer=e.pointerId;joystick.setPointerCapture(e.pointerId);updateJoystick(e)});
joystick.addEventListener("pointermove",e=>{if(e.pointerId===joyPointer)updateJoystick(e)});
function endJoy(e){if(e.pointerId!==joyPointer)return;joyPointer=null;touchVec={x:0,y:0};stick.style.transform="translate(0,0)"}
joystick.addEventListener("pointerup",endJoy);joystick.addEventListener("pointercancel",endJoy);
dashButton.addEventListener("pointerdown",e=>{e.preventDefault();dashQueued=true;dashButton.style.transform="scale(.9)"});
dashButton.addEventListener("pointerup",()=>dashButton.style.transform="");

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

function renderBackground(t){
 ctx.fillStyle="#050811";ctx.fillRect(-1000,-1000,2960,2600);
 const grd=ctx.createRadialGradient(480,300,30,480,300,520);grd.addColorStop(0,"#111f36");grd.addColorStop(.45,"#07101f");grd.addColorStop(1,"#020307");ctx.fillStyle=grd;ctx.fillRect(0,0,960,600);
 ctx.save();ctx.globalAlpha=.22;ctx.strokeStyle="#1c4660";ctx.lineWidth=1;const drift=(t*8)%48;
 for(let x=-960+drift;x<1960;x+=48){ctx.beginPath();ctx.moveTo(x,-900);ctx.lineTo(x-520,1500);ctx.stroke()}
 for(let y=-900;y<1500;y+=50){ctx.beginPath();ctx.moveTo(-1000,y);ctx.lineTo(1960,y);ctx.stroke()}
 ctx.restore();
 ctx.save();ctx.translate(480,300);ctx.rotate(t*.025);ctx.strokeStyle="rgba(74,221,255,.1)";ctx.lineWidth=1;
 for(const r of [105,190,285]){ctx.setLineDash([2,12]);ctx.beginPath();ctx.arc(0,0,r,0,Math.PI*2);ctx.stroke()}ctx.restore();
}

function renderWorld(){
 const p=game.player;
 for(const r of game.rifts){ctx.save();const k=Math.min(1,r.age/.42);ctx.globalAlpha=r.boom?Math.max(0,1-(r.age-.42)/.4):.45;ctx.strokeStyle=r.boom?"#df8cff":"#744cff";ctx.lineWidth=r.boom?4:2;glow("#b65cff",24);ctx.beginPath();ctx.arc(r.x,r.y,r.boom?r.radius:16+(r.radius-16)*.68*k,0,Math.PI*2);ctx.stroke();ctx.restore()}
 for(const g of game.pickups){ctx.save();ctx.translate(g.x,g.y);ctx.rotate(game.time*2+g.x);ctx.fillStyle="#90f7ff";glow("#39eaff",12);ctx.beginPath();ctx.moveTo(0,-6);ctx.lineTo(5,0);ctx.lineTo(0,6);ctx.lineTo(-5,0);ctx.closePath();ctx.fill();ctx.restore()}
 for(const e of game.echoes){if(e.age<0)continue;ctx.save();ctx.globalAlpha=.24+Math.sin(e.age*12)*.05;ctx.fillStyle="#5ceaff";glow("#5ceaff",22);ctx.beginPath();ctx.arc(e.x,e.y,11,0,Math.PI*2);ctx.fill();ctx.strokeStyle="#c4fbff";ctx.lineWidth=1;ctx.beginPath();ctx.arc(e.x,e.y,18+Math.sin(e.age*8)*3,0,Math.PI*2);ctx.stroke();ctx.restore()}
 for(const b of game.bullets){ctx.save();ctx.strokeStyle=b.echo?"#65edff":"#ff72b6";ctx.lineWidth=b.echo?3:2;glow(ctx.strokeStyle,10);ctx.beginPath();ctx.moveTo(b.x,b.y);ctx.lineTo(b.x-b.vx*.018,b.y-b.vy*.018);ctx.stroke();ctx.restore()}
 for(const b of game.enemyBullets){ctx.save();ctx.fillStyle="#ffb14d";glow("#ff642e",14);ctx.beginPath();ctx.arc(b.x,b.y,b.r,0,Math.PI*2);ctx.fill();ctx.restore()}
 for(const e of game.enemies){
   ctx.save();ctx.translate(e.x,e.y);const boss=e.type==="boss",brute=e.type==="brute",shooter=e.type==="shooter",scout=e.type==="scout";
   ctx.rotate(game.time*(scout?2.3:.35)+e.id);ctx.fillStyle=e.flash>0?"#fff":boss?"#ff466f":brute?"#d267ff":shooter?"#ff9a48":scout?"#ffc859":"#fa5f8f";glow(ctx.fillStyle,boss?28:12);
   ctx.beginPath();const sides=boss?8:brute?6:shooter?4:scout?3:5;for(let i=0;i<sides;i++){const a=i/sides*Math.PI*2-Math.PI/2,rr=e.r*(i%2? .82:1);const x=Math.cos(a)*rr,y=Math.sin(a)*rr;i?ctx.lineTo(x,y):ctx.moveTo(x,y)}ctx.closePath();ctx.fill();
   if(boss||brute){ctx.rotate(-game.time*(scout?2.3:.35)-e.id);ctx.fillStyle="rgba(0,0,0,.45)";ctx.fillRect(-e.r,-e.r-10,e.r*2,3);ctx.fillStyle=boss?"#ff416b":"#cb6eff";ctx.fillRect(-e.r,-e.r-10,e.r*2*Math.max(0,e.hp/e.maxHp),3)}
   ctx.restore();
 }
 for(const q of particles){ctx.save();ctx.globalAlpha=Math.max(0,1-q.age/q.life);ctx.fillStyle=q.color;ctx.fillRect(q.x-2,q.y-2,4,4);ctx.restore()}
 ctx.save();const pulse=1+Math.sin(game.time*7)*.08;ctx.translate(p.x,p.y);if(p.dashActive>0){ctx.globalAlpha=.28;ctx.fillStyle="#77eeff";ctx.beginPath();ctx.ellipse(-p.dx*32,-p.dy*32,38,12,Math.atan2(p.dy,p.dx),0,Math.PI*2);ctx.fill()}
 ctx.scale(pulse,pulse);ctx.fillStyle=p.inv>0&&Math.floor(game.time*30)%2?"#fff":"#dffcff";glow("#55e8ff",26);ctx.beginPath();ctx.arc(0,0,p.r,0,Math.PI*2);ctx.fill();ctx.strokeStyle="#58e7ff";ctx.lineWidth=2;ctx.beginPath();ctx.arc(0,0,p.r+7,game.time*2,game.time*2+Math.PI*1.4);ctx.stroke();ctx.restore();
 if(game.combo>=4){ctx.save();ctx.font="900 18px system-ui";ctx.fillStyle="#85f4ff";ctx.textAlign="center";ctx.fillText(`x${game.combo} CHAIN`,p.x,p.y-32);ctx.restore()}
}

function updateParticles(dt){for(let i=particles.length-1;i>=0;i--){const p=particles[i];p.age+=dt;p.x+=p.vx*dt;p.y+=p.vy*dt;p.vx*=Math.pow(.08,dt);p.vy*=Math.pow(.08,dt);if(p.age>=p.life)particles.splice(i,1)}}

function updateUi(){
 const s=game.snapshot(),remain=Math.max(0,WORLD.runSeconds-s.time),m=Math.floor(remain/60),sec=Math.floor(remain%60);
 timeEl.textContent=`${String(m).padStart(2,"0")}:${String(sec).padStart(2,"0")}`;levelEl.textContent=`LV ${s.level}`;scoreEl.textContent=s.score.toLocaleString();
 hpbar.style.transform=`scaleX(${Math.max(0,s.hp/s.maxHp)})`;xpbar.style.transform=`scaleX(${Math.min(1,s.xp/s.xpNeed)})`;
 if(game.status==="upgrade"&&upgradeShownFor!==game.level){app.classList.add("ui-blocked");upgradeShownFor=game.level;choices.innerHTML="";game.pending.forEach((u,i)=>{const b=document.createElement("button");b.className="upgrade";b.innerHTML=`<kbd>${i+1}</kbd><span><strong>${u.name}</strong><small>${u.desc}</small></span><span>選択</span>`;b.addEventListener("click",()=>game.chooseUpgrade(u.id));choices.append(b)});upgradePanel.classList.remove("hidden")}
 if(game.status!=="upgrade"){upgradePanel.classList.add("hidden");if(started&&game.status==="playing")app.classList.remove("ui-blocked")}
 if((game.status==="won"||game.status==="lost")&&resultPanel.classList.contains("hidden")){app.classList.add("ui-blocked");const m=game.metrics();document.querySelector("#resultLabel").textContent=game.status==="won"?"RIFT STABILIZED":"SIGNAL LOST";document.querySelector("#resultTitle").textContent=game.status==="won"?"8分間、未来を撃ち抜いた。":"残響はここで途切れた。";document.querySelector("#resultStats").innerHTML=`<div class="resultStat"><b>${m.score.toLocaleString()}</b><span>SCORE</span></div><div class="resultStat"><b>${m.kills}</b><span>KILLS</span></div><div class="resultStat"><b>${m.maxCombo}</b><span>MAX CHAIN</span></div>`;resultPanel.classList.remove("hidden")}
}

function frame(now){
 const dt=Math.min(.033,(now-last)/1000);last=now;if(started&&game.status!=="upgrade"&&game.status!=="won"&&game.status!=="lost")game.step(dt,input());
 updateParticles(dt);consumeEvents();if(toastTimer>0){toastTimer-=dt;if(toastTimer<=0)toast.classList.remove("show")}
 ctx.setTransform(1,0,0,1,0,0);ctx.fillStyle="#020307";ctx.fillRect(0,0,canvas.width,canvas.height);setWorldCamera();renderBackground(game.time);renderWorld();ctx.setTransform(1,0,0,1,0,0);updateUi();requestAnimationFrame(frame);
}
window.__echoRift={get game(){return game},start:reset,metrics:()=>game.metrics()};
requestAnimationFrame(frame);
