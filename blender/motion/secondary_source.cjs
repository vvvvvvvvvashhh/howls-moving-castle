'use strict';

// Keep these original details in individual native pivots during batch creation.
// No vertex positions or materials change at their neutral pose.
function patchSecondary(html) {
  function rep(a,b) {
    if(html.split(a).length!==2)throw new Error('Unexpected shell feature text: '+a.slice(0,90));
    html=html.replace(a,b);
  }
  rep(' bow(b,rnd);cottageCluster(b,rnd);auxiliary(b,rnd);vanes(b);machineryAndSheds(b,rnd);doorAndFittings(b,rnd);',
  ` let secondaryParts=0;
 function secondary(name,p) {
  const hinge=new THREE.Group(), rest=new THREE.Group(), batch=new Batch(mat);
  hinge.name=name;hinge.position.copy(p);rest.position.copy(p).multiplyScalar(-1);
  hinge.add(rest);body.add(hinge);
  return {batch, finish(){secondaryParts+=batch.count;stats.triangles+=batch.finish(rest);}};
 }
 bow(b,rnd);cottageCluster(b,rnd);auxiliary(b,rnd);vanes(b,secondary);machineryAndSheds(b,rnd);doorAndFittings(b,rnd,secondary);`);
  rep('stats.staticParts=b.count;', 'stats.staticParts=b.count+secondaryParts;');
  rep('function vanes(b){\n function sail(sign,zs,tops,bottoms,span){',
      `function vanes(originalBatch,secondary){
 function sail(sign,zs,tops,bottoms,span){
  const vane=secondary(sign>0?'Starboard shell storm vane':'Port shell storm vane',
    v(sign*(span[1]-2.7),tops[1]-2.24,zs[1]-.17));
  const b=vane.batch;`);
  rep(` }
 }
 sail(1,[2.1,-1.18,-5.40,-9.13]`,
      ` }
  vane.finish();
 }
 sail(1,[2.1,-1.18,-5.40,-9.13]`);
  rep('function doorAndFittings(b,rnd){','function doorAndFittings(b,rnd,secondary){');
  const lampStart="b.local([x,y,z],[0,ang,0],()=>{b.beam([0,.14,-.18],[0,.14,.57],.11,.12,ink,'metal');b.cylinder([0,-.36,.52],[0,.12,.52]";
  rep(lampStart, `const hinge=secondary('Wall lantern '+x.toFixed(2),
    v(x+Math.sin(ang)*.52,y+.14,z+Math.cos(ang)*.52));
  b.local([x,y,z],[0,ang,0],()=>b.beam([0,.14,-.18],[0,.14,.57],.11,.12,ink,'metal'));
  {const b=hinge.batch;b.local([x,y,z],[0,ang,0],()=>{b.cylinder([0,-.36,.52],[0,.12,.52]`);
  rep("b.cylinder([0,-.73,.52],[0,-.66,.52],.19,.14,'#685742','metal',9);});",
      "b.cylinder([0,-.73,.52],[0,-.66,.52],.19,.14,'#685742','metal',9);});hinge.finish();}");
  rep("function millsAndVents(b,rnd,createStack){","function millsAndVents(b,rnd,createStack,secondary){");
  rep("  const anchor=top.clone().add(socket);anchors.smokestacks.push(anchor);stacks.push({stackMesh,top,anchor});\n });",
      "  const anchor=top.clone().add(socket);anchors.smokestacks.push(anchor);stacks.push({stackMesh,top,anchor});\n },secondary);");
  rep(" // An open watch cabin on a spindly mast gives the skyline its uneven fork.",
      ` // An open watch cabin on a spindly mast gives the skyline its uneven fork.
 {const hinge=secondary('Spring mounted lookout mast',v(-1,34.7,1.12)),b=hinge.batch;`);
  rep(" // Smaller conical roofs and old organ pipes break the cluster of chimneys.",
      " hinge.finish();}\n // Smaller conical roofs and old organ pipes break the cluster of chimneys.");
  return html;
}
module.exports={patchSecondary};
