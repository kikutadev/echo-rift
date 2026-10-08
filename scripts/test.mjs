import assert from "node:assert/strict";import {EchoRiftGame,WORLD} from "../src/game.js";
const pick=c=>c[0].id;
const g=new EchoRiftGame({seed:42,autoUpgradePolicy:pick});
for(let i=0;i<1200&&g.status==="playing";i++)g.step(.05,{dx:Math.cos(i*.02),dy:Math.sin(i*.02),dash:i%80===0});
assert(g.time>10);assert(g.enemies.length>=0);assert(g.player.hp<=g.player.maxHp);
const a=new EchoRiftGame({seed:7,autoUpgradePolicy:pick}),b=new EchoRiftGame({seed:7,autoUpgradePolicy:pick});
for(let i=0;i<500;i++){const input={dx:Math.sin(i*.1),dy:Math.cos(i*.07),dash:i%100===0};a.step(.05,input);b.step(.05,input)}
assert.deepEqual(a.metrics(),b.metrics(),"same seed/input must be deterministic");
const c=new EchoRiftGame({seed:9,autoUpgradePolicy:pick});for(let i=0;i<Math.ceil(WORLD.runSeconds/.05)+5&&c.status==="playing";i++)c.step(.05,{dx:1,dy:0,dash:false});
assert(["won","lost"].includes(c.status));console.log("core deterministic tests passed");


// 開始から敵が途切れず、増加する群れも安全上限内に収まる。
const swarm=new EchoRiftGame({seed:99,autoUpgradePolicy:pick});
swarm.step(.05,{dx:1,dy:0});
assert(swarm.enemies.length>=25,"first-frame swarm should be present");
swarm.player.hp=10000;swarm.player.maxHp=10000;
for(let i=0;i<2400;i++)swarm.step(.05,{dx:Math.sin(i*.015),dy:Math.cos(i*.015),dash:i%100===0});
assert(swarm.maxEnemiesSeen>=35,"midgame must exhibit a real horde");
assert(swarm.enemies.length<=110,"enemy cap must be respected");
assert(swarm.events.length<=80,"VFX event queue must be bounded");
console.log("swarm density and bounded-queue tests passed");


// ダッシュは移動速度だけでなく、線分上の敵を必ず斬り抜けられることが重要。
const dash=new EchoRiftGame({seed:127,autoUpgradePolicy:pick});
dash.maxLivingEnemies=0;
dash.spawn("brute");
const victim=dash.enemies[0];
victim.x=515;victim.y=300;victim.hp=220;victim.maxHp=220;
const originalHp=victim.hp,originX=dash.player.x;
dash.step(.05,{dx:1,dy:0,dash:true});
assert(dash.player.x-originX>=48,"dash must accelerate immediately in the input frame");
assert(victim.hp<originalHp,"swept dash must hit enemies passed through between frames");
assert(dash.events.some(e=>e.type==="dashHit"),"dash hit needs immediate feedback event");
for(let i=0;i<5;i++)dash.step(.05,{dx:0,dy:0,dash:false});
assert(dash.player.x-originX>=190,"dash should travel roughly twice the previous distance");
assert.equal(dash.player.dashActive,0,"dash must finish without a stuck action state");
assert(dash.events.some(e=>e.type==="dashEnd"),"dash needs an end-impact event");
assert(dash.events.some(e=>e.type==="rift"),"post-dash impacts should detonate promptly");
console.log("dash speed, swept collision and impact tests passed");


// 群れをダッシュで倒すほど、次のダッシュを早く使えるようにする。
const chain=new EchoRiftGame({seed:219,autoUpgradePolicy:pick});
chain.maxLivingEnemies=0;
for(const x of [510,552,594]){
 chain.spawn("chaser");
 const e=chain.enemies[chain.enemies.length-1];
 e.x=x;e.y=300;e.hp=20;e.maxHp=20;e.speed=0;
}
for(let i=0;i<6;i++)chain.step(.05,{dx:1,dy:0,dash:i===0});
assert(chain.player.dashHit.size>=3,"dash needs to strike multiple targets during one movement");
assert(chain.player.dashKillsThisDash>=3,"dash should reward direct multi-kills");
assert(chain.player.dashT<2.0,"multi-kills should shorten the next dash cooldown");
console.log("dash multi-kill cooldown reward tests passed");
