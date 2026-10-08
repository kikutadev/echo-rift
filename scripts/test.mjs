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
