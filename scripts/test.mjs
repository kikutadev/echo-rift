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
