import * as THREE from 'three';
import { makeWorld, run, LIBRARY_BY_ID } from '../test/physics.harness.mjs';
const EPS=1e-3;
function modelBoxes(def){const boxes=def.bricks.map(br=>({name:`${br.color} brick`,c:br.at,h:br.size.map(s=>s/2)}));for(const p of def.parts)for(const br of p.bricks??[])boxes.push({name:`${p.name} ${br.color}`,c:br.at.map((v,k)=>v+p.pivot[k]),h:br.size.map(s=>s/2)});return boxes;}
function cop(a,b){const out=[];for(let k=0;k<3;k++)for(const s of[-1,1]){if(Math.abs(a.c[k]+s*a.h[k]-(b.c[k]+s*b.h[k]))>EPS)continue;const ov=[0,1,2].filter(j=>j!==k).every(j=>Math.min(a.c[j]+a.h[j],b.c[j]+b.h[j])-Math.max(a.c[j]-a.h[j],b.c[j]-b.h[j])>EPS);if(ov)out.push(`${s>0?'+':'-'}${'xyz'[k]}`);}return out;}
for(const def of Object.values(LIBRARY_BY_ID)){const bx=modelBoxes(def);for(let i=0;i<bx.length;i++)for(let j=i+1;j<bx.length;j++)for(const f of cop(bx[i],bx[j]))console.log('FIGHT',def.id,bx[i].name,'/',bx[j].name,f);}
const w=await makeWorld();
for(const id of process.argv.slice(2).length?process.argv.slice(2):Object.keys(LIBRARY_BY_ID)){
  const e=w.addModel(LIBRARY_BY_ID[id],{x:0,z:-30,yaw:0});run(w,1);
  const up=new THREE.Vector3(0,1,0).applyQuaternion(e.quaternion).y;
  const p0=e.position;e.control.drive=7;run(w,2);const dz=e.position.z-p0.z;e.control.drive=0;e.control.steer=90;const h0=e.heading();run(w,1);const turned=e.heading()-h0;e.control.steer=0;
  const hinges=[];for(const p of e.parts.values()){if(p.def.kind!=='hinge')continue;const target=Math.min(p.def.limits[1],60);p.angle=target;run(w,1);const rel=new THREE.Quaternion().copy(e.quaternion).invert().multiply(new THREE.Quaternion().copy(p.body.rotation()));const axis=new THREE.Vector3(...p.def.axis);const got=2*Math.atan2(new THREE.Vector3(rel.x,rel.y,rel.z).dot(axis),rel.w)*180/Math.PI*(p.def.sign??1);hinges.push(`${p.def.name}:${got.toFixed(0)}/${target}`);p.angle=0;}
  console.log(id,'up',up.toFixed(3),'dz',dz.toFixed(1),'turn',turned.toFixed(0),hinges.join(' '));w.remove(e);run(w,0.1);
}
