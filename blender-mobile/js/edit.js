/* Edit mode: vertex editing, extrude, subdivide, smooth, merge, delete, mirror, proportional editing. */
(function(){
'use strict';
var MB=window.MB,$=MB.$,tc=MB.tc,camera=MB.camera,scene=MB.scene;
var E=MB.edit={on:false,node:null,V:null,I:null,sel:{},prop:false,radius:1.5,pts:null,wire:null,pivot:new THREE.Object3D()};
scene.add(E.pivot);
var V3=THREE.Vector3,M4=THREE.Matrix4;

function selList(){ return Object.keys(E.sel).map(Number); }
function nVerts(){ return E.V.length/3; }

/* ---- helpers shown on the mesh ---- */
function buildHelpers(){
  clearHelpers();
  var n=E.node,g=n.geometry;
  var pg=new THREE.BufferGeometry();
  pg.setAttribute('position',new THREE.BufferAttribute(new Float32Array(E.V),3));
  pg.setAttribute('color',new THREE.BufferAttribute(new Float32Array(nVerts()*3),3));
  E.pts=new THREE.Points(pg,new THREE.PointsMaterial({size:12,sizeAttenuation:false,vertexColors:true,depthTest:false,transparent:true}));
  E.pts.renderOrder=20; E.pts.frustumCulled=false; n.add(E.pts);
  E.wire=new THREE.LineSegments(new THREE.WireframeGeometry(g),new THREE.LineBasicMaterial({color:0x000000,transparent:true,opacity:0.4,depthTest:false}));
  E.wire.renderOrder=19; n.add(E.wire);
  paint();
}
function clearHelpers(){
  [E.pts,E.wire].forEach(function(h){ if(h&&h.parent){ h.parent.remove(h); h.geometry.dispose(); h.material.dispose(); } });
  E.pts=E.wire=null;
}
function paint(){
  if(!E.pts) return;
  var c=E.pts.geometry.attributes.color,n=nVerts();
  for(var i=0;i<n;i++){ if(E.sel[i]) c.setXYZ(i,1,0.55,0.05); else c.setXYZ(i,0.85,0.9,1); }
  c.needsUpdate=true;
}
function rebuildGeo(keepPoints){
  var n=E.node,old=n.geometry;
  n.geometry=MB.geoFromData({v:E.V,i:E.I});
  old.dispose();
  buildHelpers();
  updatePivot();
  $('eInfo').textContent=nVerts()+' tugun · '+(E.I.length/3)+' uchburchak · '+selList().length+' tanlangan';
}
function updatePivot(){
  var s=selList();
  if(!s.length){ tc.detach(); return; }
  var c=new V3(),v=new V3();
  s.forEach(function(i){ v.set(E.V[i*3],E.V[i*3+1],E.V[i*3+2]); c.add(v); });
  c.multiplyScalar(1/s.length); E.node.updateMatrixWorld(true); c.applyMatrix4(E.node.matrixWorld);
  E.pivot.position.copy(c); E.pivot.rotation.set(0,0,0); E.pivot.scale.set(1,1,1); E.pivot.updateMatrix();
  tc.attach(E.pivot);
  $('eInfo').textContent=nVerts()+' tugun · '+(E.I.length/3)+' uchburchak · '+s.length+' tanlangan';
}
function compact(){
  var used={},i,map={},nv=[],nI=[];
  for(i=0;i<E.I.length;i++) used[E.I[i]]=1;
  var cnt=0; for(i=0;i<nVerts();i++){ if(used[i]){ map[i]=cnt++; nv.push(E.V[i*3],E.V[i*3+1],E.V[i*3+2]); } }
  for(i=0;i<E.I.length;i++) nI.push(map[E.I[i]]);
  var ns={}; for(var k in E.sel) if(map[k]!==undefined) ns[map[k]]=1;
  E.V=nv; E.I=nI; E.sel=ns;
}

/* ---- enter / exit ---- */
E.enter=function(){
  var n=MB.sel;
  if(!n||n.userData.kind!=='mesh'){ MB.toast('Avval oddiy shaklni tanlang'); return; }
  if(MB.anim.playing) MB.stopPlay();
  var d=MB.geoToData(n.geometry); E.V=d.v; E.I=d.i; E.sel={}; E.node=n;
  if(!n.userData.edited){ n.userData.edited=true; n.material.flatShading=true; n.material.needsUpdate=true; }
  E.on=true; tc.detach(); rebuildGeo(); $('bEdit').classList.add('on'); $('bEdit').textContent='Tahrirdan chiqish'; $('eOps').hidden=false;
  MB.toast('Tahrir rejimi: tugunni bosib tanlang');
};
E.exit=function(silent){
  if(!E.on) return;
  E.on=false; clearHelpers(); tc.detach(); E.node.geometry.computeBoundingSphere();
  var n=E.node; E.node=null; $('bEdit').classList.remove('on'); $('bEdit').textContent='Tahrir rejimiga kirish'; $('eOps').hidden=true;
  if(!silent){ MB.select(n); MB.commit(); }
};
function commitEdit(){ rebuildGeo(); MB.commit(); }

/* ---- tap to select a vertex ---- */
E.tap=function(px,py,rect){
  var best=-1,bd=30,v=new V3();
  E.node.updateMatrixWorld(true);
  for(var i=0;i<nVerts();i++){
    v.set(E.V[i*3],E.V[i*3+1],E.V[i*3+2]).applyMatrix4(E.node.matrixWorld).project(camera);
    if(v.z>1) continue;
    var sx=(v.x*0.5+0.5)*rect.width,sy=(-v.y*0.5+0.5)*rect.height,d=Math.hypot(sx-px,sy-py);
    if(d<bd){bd=d;best=i;}
  }
  if(best<0){ E.sel={}; } else if(E.sel[best]) delete E.sel[best]; else E.sel[best]=1;
  paint(); updatePivot();
};
E.selectAll=function(){ E.sel={}; for(var i=0;i<nVerts();i++) E.sel[i]=1; paint(); updatePivot(); };
E.selectNone=function(){ E.sel={}; paint(); updatePivot(); };
E.invert=function(){ var s={}; for(var i=0;i<nVerts();i++) if(!E.sel[i]) s[i]=1; E.sel=s; paint(); updatePivot(); };

/* ---- dragging the pivot moves the selected vertices ---- */
var start=null;
tc.addEventListener('mouseDown',function(){
  if(!E.on||!E.node) return;
  E.pivot.updateMatrix(); E.node.updateMatrixWorld(true);
  var w=new Float64Array(E.V.length),v=new V3(),i;
  for(i=0;i<nVerts();i++){ v.set(E.V[i*3],E.V[i*3+1],E.V[i*3+2]).applyMatrix4(E.node.matrixWorld); w[i*3]=v.x;w[i*3+1]=v.y;w[i*3+2]=v.z; }
  start={mat:E.pivot.matrix.clone(),pos:E.pivot.position.clone(),world:w,sel:selList()};
  if(E.wire) E.wire.visible=false;
});
tc.addEventListener('objectChange',function(){
  if(!E.on||!start) return;
  E.pivot.updateMatrix();
  var inv=new M4().copy(start.mat).invert?new M4().copy(start.mat).invert():new M4().getInverse(start.mat);
  var M=new M4().multiplyMatrices(E.pivot.matrix,inv),nodeInv=new M4().copy(E.node.matrixWorld);
  nodeInv=nodeInv.invert?nodeInv.invert():new M4().getInverse(E.node.matrixWorld);
  var v=new V3(),w=start.world,i,isSel={};
  start.sel.forEach(function(s){ isSel[s]=1; v.set(w[s*3],w[s*3+1],w[s*3+2]).applyMatrix4(M).applyMatrix4(nodeInv); E.V[s*3]=v.x;E.V[s*3+1]=v.y;E.V[s*3+2]=v.z; });
  if(E.prop&&tc.mode==='translate'){
    var delta=E.pivot.position.clone().sub(start.pos);
    for(i=0;i<nVerts();i++){
      if(isSel[i]) continue;
      v.set(w[i*3],w[i*3+1],w[i*3+2]); var d=v.distanceTo(start.pos);
      if(d<E.radius){ var f=1-(d/E.radius)*(d/E.radius); f*=f; v.addScaledVector(delta,f).applyMatrix4(nodeInv); E.V[i*3]=v.x;E.V[i*3+1]=v.y;E.V[i*3+2]=v.z; }
    }
  }
  var pa=E.node.geometry.attributes.position; pa.array.set(E.V); pa.needsUpdate=true; E.node.geometry.computeVertexNormals();
  var pp=E.pts.geometry.attributes.position; pp.array.set(E.V); pp.needsUpdate=true;
});
E.dragEnd=function(){ if(!E.on||!start) return; start=null; commitEdit(); };

/* ---- operations ---- */
function triFaces(selOnly){
  var out=[]; for(var t=0;t<E.I.length;t+=3){
    if(!selOnly||(E.sel[E.I[t]]&&E.sel[E.I[t+1]]&&E.sel[E.I[t+2]])) out.push(t);
  } return out;
}
E.extrude=function(amount){
  var F=triFaces(true); if(!F.length){ MB.toast('Kamida bitta yuzni tanlang (uchta tugun)'); return; }
  var a=new V3(),b=new V3(),c=new V3(),nrm=new V3(),tmp=new V3(),i;
  F.forEach(function(t){
    a.set(E.V[E.I[t]*3],E.V[E.I[t]*3+1],E.V[E.I[t]*3+2]); b.set(E.V[E.I[t+1]*3],E.V[E.I[t+1]*3+1],E.V[E.I[t+1]*3+2]); c.set(E.V[E.I[t+2]*3],E.V[E.I[t+2]*3+1],E.V[E.I[t+2]*3+2]);
    tmp.crossVectors(b.clone().sub(a),c.clone().sub(a)); nrm.add(tmp);
  });
  nrm.normalize().multiplyScalar(amount);
  var edges={},newOf={},dirs=[];
  F.forEach(function(t){ for(var k=0;k<3;k++){ var p=E.I[t+k],q=E.I[t+(k+1)%3]; edges[p+'_'+q]=[p,q]; } });
  F.forEach(function(t){ for(var k=0;k<3;k++){ var p=E.I[t+k]; if(newOf[p]===undefined){ newOf[p]=nVerts(); E.V.push(E.V[p*3]+nrm.x,E.V[p*3+1]+nrm.y,E.V[p*3+2]+nrm.z); } } });
  for(var key in edges){ var e=edges[key]; if(!edges[e[1]+'_'+e[0]]) dirs.push(e); }
  dirs.forEach(function(e){ var p=e[0],q=e[1]; E.I.push(p,q,newOf[q],p,newOf[q],newOf[p]); });
  F.forEach(function(t){ for(var k=0;k<3;k++) E.I[t+k]=newOf[E.I[t+k]]; });
  var ns={}; for(var o in newOf) ns[newOf[o]]=1; E.sel=ns;
  commitEdit(); MB.toast('Cho\'zildi');
};
E.subdivide=function(){
  var F=triFaces(selList().length>0); if(!F.length) F=triFaces(false);
  var mid={},sel2={},keep=[],nI=[],selF={};
  F.forEach(function(t){ selF[t]=1; });
  function m(a,b){
    var k=a<b?a+'_'+b:b+'_'+a; if(mid[k]!==undefined) return mid[k];
    var id=nVerts(); E.V.push((E.V[a*3]+E.V[b*3])/2,(E.V[a*3+1]+E.V[b*3+1])/2,(E.V[a*3+2]+E.V[b*3+2])/2); mid[k]=id;
    if(E.sel[a]&&E.sel[b]) sel2[id]=1; return id;
  }
  for(var t=0;t<E.I.length;t+=3){
    var a=E.I[t],b=E.I[t+1],c=E.I[t+2];
    if(selF[t]){ var ab=m(a,b),bc=m(b,c),ca=m(c,a); nI.push(a,ab,ca,ab,b,bc,ca,bc,c,ab,bc,ca); }
    else nI.push(a,b,c);
  }
  E.I=nI; for(var k in sel2) E.sel[k]=1;
  commitEdit(); MB.toast('Bo\'lindi');
};
E.smooth=function(iter,f){
  var nv=nVerts(),i,it,nb=[],cnt=new Float32Array(nv);
  for(i=0;i<nv;i++) nb.push([0,0,0]);
  var any=selList().length>0;
  for(it=0;it<iter;it++){
    for(i=0;i<nv;i++){ nb[i][0]=nb[i][1]=nb[i][2]=0; cnt[i]=0; }
    for(var t=0;t<E.I.length;t+=3){ for(var k=0;k<3;k++){ var p=E.I[t+k],q=E.I[t+(k+1)%3];
      nb[p][0]+=E.V[q*3];nb[p][1]+=E.V[q*3+1];nb[p][2]+=E.V[q*3+2];cnt[p]++; nb[q][0]+=E.V[p*3];nb[q][1]+=E.V[p*3+1];nb[q][2]+=E.V[p*3+2];cnt[q]++; } }
    for(i=0;i<nv;i++){ if(!cnt[i]||(any&&!E.sel[i])) continue; for(var d=0;d<3;d++){ var avg=nb[i][d]/cnt[i]; E.V[i*3+d]+=f*(avg-E.V[i*3+d]); } }
  }
};
E.smoothOp=function(){ E.smooth(1,0.5); commitEdit(); MB.toast('Tekislandi'); };
E.subsurf=function(){
  var keep=E.sel; E.sel={}; E.subdivide(); E.smooth(2,0.5); E.sel=keep; commitEdit(); MB.toast('Silliq sirt');
};
E.del=function(){
  var s=selList(); if(!s.length){ MB.toast('Tugunlarni tanlang'); return; }
  var nI=[]; for(var t=0;t<E.I.length;t+=3){ if(!(E.sel[E.I[t]]||E.sel[E.I[t+1]]||E.sel[E.I[t+2]])) nI.push(E.I[t],E.I[t+1],E.I[t+2]); }
  if(!nI.length){ MB.toast('Hamma yuzni o\'chirib bo\'lmaydi'); return; }
  E.I=nI; E.sel={}; compact(); commitEdit(); MB.toast('O\'chirildi');
};
E.merge=function(){
  var s=selList(); if(s.length<2){ MB.toast('Kamida ikkita tugunni tanlang'); return; }
  var c=[0,0,0]; s.forEach(function(i){ c[0]+=E.V[i*3];c[1]+=E.V[i*3+1];c[2]+=E.V[i*3+2]; });
  var f=s[0]; E.V[f*3]=c[0]/s.length;E.V[f*3+1]=c[1]/s.length;E.V[f*3+2]=c[2]/s.length;
  var nI=[]; for(var t=0;t<E.I.length;t+=3){
    var a=E.sel[E.I[t]]?f:E.I[t],b=E.sel[E.I[t+1]]?f:E.I[t+1],cc=E.sel[E.I[t+2]]?f:E.I[t+2];
    if(a!==b&&b!==cc&&a!==cc) nI.push(a,b,cc);
  }
  E.I=nI; E.sel={}; E.sel[f]=1; compact(); commitEdit(); MB.toast('Birlashtirildi');
};
E.flip=function(){
  var F=triFaces(selList().length>0); if(!F.length) F=triFaces(false);
  F.forEach(function(t){ var x=E.I[t+1]; E.I[t+1]=E.I[t+2]; E.I[t+2]=x; });
  commitEdit(); MB.toast('Yuzlar aylantirildi');
};
E.mirror=function(){
  var nv=nVerts(),map=[],i;
  for(i=0;i<nv;i++){
    if(Math.abs(E.V[i*3])<0.001){ map.push(i); } else { map.push(nVerts()); E.V.push(-E.V[i*3],E.V[i*3+1],E.V[i*3+2]); }
  }
  var n0=E.I.length; for(var t=0;t<n0;t+=3) E.I.push(map[E.I[t]],map[E.I[t+2]],map[E.I[t+1]]);
  commitEdit(); MB.toast('Ko\'zgu nusxasi qo\'shildi (X o\'qi)');
};
E.toggleFlat=function(){ var m=E.node.material; m.flatShading=!m.flatShading; m.needsUpdate=true; };

/* ---- wiring ---- */
$('bEdit').onclick=function(){ if(E.on) E.exit(); else E.enter(); };
$('eAll').onclick=E.selectAll; $('eNone').onclick=E.selectNone; $('eInv').onclick=E.invert;
$('eExt').onclick=function(){ E.extrude(+$('eAmt').value||0.4); };
$('eSub').onclick=E.subdivide; $('eSurf').onclick=E.subsurf; $('eSmooth').onclick=E.smoothOp;
$('eDel').onclick=E.del; $('eMerge').onclick=E.merge; $('eFlip').onclick=E.flip; $('eMirror').onclick=E.mirror;
$('eFlat').onchange=function(e){ if(E.on) { E.node.material.flatShading=e.target.checked; E.node.material.needsUpdate=true; } };
$('eProp').onchange=function(e){ E.prop=e.target.checked; };
$('eRad').oninput=function(e){ E.radius=+e.target.value; };
MB.selHooks.push(function(o){
  var ok=o&&o.userData.kind==='mesh'; $('bEdit').disabled=!ok&&!E.on;
  if(o&&ok) $('eFlat').checked=!!o.material.flatShading;
});
})();
