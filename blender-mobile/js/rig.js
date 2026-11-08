/* Rigging: bones, parenting, automatic skin weights, skinned mesh (de)serialization. */
(function(){
'use strict';
var MB=window.MB,$=MB.$,scene=MB.scene;
var V3=THREE.Vector3;
var R=MB.rig={};

MB.createBone=function(){
  var b=new THREE.Bone();
  var g=new THREE.ConeGeometry(0.1,1,8); g.translate(0,0.5,0);
  var vis=new THREE.Mesh(g,new THREE.MeshBasicMaterial({color:0xffcc33,depthTest:false,transparent:true,opacity:0.85}));
  vis.renderOrder=10; vis.userData.owner=b; vis.userData.shared=false; b.add(vis); b.userData.vis=vis; b.userData.len=1;
  return b;
};
MB.setBoneLen=function(b,len){ b.userData.len=len; if(b.userData.vis) b.userData.vis.scale.y=len; };

R.addBone=function(){
  var parent=MB.sel&&MB.sel.userData.kind==='bone'?MB.sel:null;
  var b=MB.addNode('bone','bone',{parent:parent||scene});
  if(parent) b.position.set(0,parent.userData.len,0); else b.position.set(MB.orbit.target.x,0.05,MB.orbit.target.z);
  return b;
};
R.chain=function(n){
  var parent=MB.sel&&MB.sel.userData.kind==='bone'?MB.sel:null,last=null;
  for(var i=0;i<n;i++){
    var b=MB.addNode('bone','bone',{parent:last||parent||scene});
    if(last) b.position.set(0,last.userData.len,0); else if(parent) b.position.set(0,parent.userData.len,0); else b.position.set(MB.orbit.target.x,0.05,MB.orbit.target.z);
    MB.setBoneLen(b,Math.max(0.3,2/n)); last=b;
  }
  return last;
};
R.bind=function(m){
  if(!m||m.userData.kind!=='mesh'){ MB.toast('Avval oddiy shaklni tanlang'); return; }
  var bones=MB.nodes.filter(function(o){return o.userData.kind==='bone'});
  if(!bones.length){ MB.toast('Avval suyak qo\'shing'); return; }
  scene.updateMatrixWorld(true);
  var g=m.geometry.clone(),pos=g.attributes.position,n=pos.count;
  var segs=bones.map(function(b){
    var a=b.getWorldPosition(new V3()),child=b.children.filter(function(c){return c.isBone})[0];
    var e=child?child.getWorldPosition(new V3()):b.localToWorld(new V3(0,b.userData.len,0));
    return [a,e];
  });
  var si=new Uint16Array(n*4),sw=new Float32Array(n*4),v=new V3(),ab=new V3(),ap=new V3();
  for(var i=0;i<n;i++){
    v.fromBufferAttribute(pos,i); m.localToWorld(v);
    var best=[[-1,1e9],[-1,1e9]];
    for(var j=0;j<segs.length;j++){
      ab.subVectors(segs[j][1],segs[j][0]); ap.subVectors(v,segs[j][0]);
      var t=Math.max(0,Math.min(1,ap.dot(ab)/(ab.lengthSq()||1))),d=ap.sub(ab.clone().multiplyScalar(t)).length();
      if(d<best[0][1]){best[1]=best[0];best[0]=[j,d];} else if(d<best[1][1]){best[1]=[j,d];}
    }
    var w0=1/(best[0][1]*best[0][1]+0.02),w1=best[1][0]>=0?1/(best[1][1]*best[1][1]+0.02):0,s=w0+w1;
    si[i*4]=best[0][0]; sw[i*4]=w0/s; if(best[1][0]>=0){ si[i*4+1]=best[1][0]; sw[i*4+1]=w1/s; }
  }
  g.setAttribute('skinIndex',new THREE.Uint16BufferAttribute(si,4)); g.setAttribute('skinWeight',new THREE.Float32BufferAttribute(sw,4));
  var sm=new THREE.SkinnedMesh(g,m.material); m.material.skinning=true; m.material.needsUpdate=true;
  sm.castShadow=sm.receiveShadow=true; sm.frustumCulled=false;
  sm.position.copy(m.position); sm.quaternion.copy(m.quaternion); sm.scale.copy(m.scale);
  var u=sm.userData,mu=m.userData; u.id=mu.id; u.kind='skinned'; u.type=mu.type; u.name=mu.name; u.kf=mu.kf; u.ph=mu.ph; u.tx=mu.tx; u.tr=mu.tr; u.edited=true;
  var par=m.parent||scene,idx=MB.nodes.indexOf(m);
  par.add(sm); par.remove(m); MB.nodes[idx]=sm; sm.updateMatrixWorld(true);
  var sk=new THREE.Skeleton(bones); sm.bind(sk,sm.matrixWorld);
  if(MB.sel===m){ MB.sel=null; MB.select(sm); }
  m.geometry.dispose(); MB.commit(); MB.toast('Ob\'ekt suyaklarga biriktirildi');
};

R.serSkin=function(o){
  var g=o.geometry,sk=o.skeleton,idx=g.index?Array.prototype.slice.call(g.index.array):null;
  return {v:MB.arr(g.attributes.position.array),i:idx,uv:g.attributes.uv?MB.arr(g.attributes.uv.array):null,
    si:Array.prototype.slice.call(g.attributes.skinIndex.array),sw:MB.arr(g.attributes.skinWeight.array),
    bn:sk.bones.map(function(b){return b.userData.id}),bi:sk.boneInverses.map(function(m){return MB.arr(m.elements)}),bm:MB.arr(o.bindMatrix.elements)};
};
R.build=function(d,byId){
  var s=d.sk; if(!s) return null;
  var bones=s.bn.map(function(id){return byId[id]}).filter(Boolean);
  var g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.Float32BufferAttribute(s.v,3)); if(s.i) g.setIndex(s.i); g.computeVertexNormals();
  if(s.uv) g.setAttribute('uv',new THREE.Float32BufferAttribute(s.uv,2));
  g.setAttribute('skinIndex',new THREE.Uint16BufferAttribute(s.si,4)); g.setAttribute('skinWeight',new THREE.Float32BufferAttribute(s.sw,4));
  var mat=new THREE.MeshStandardMaterial(); mat.skinning=true;
  var sm=new THREE.SkinnedMesh(g,mat); sm.castShadow=sm.receiveShadow=true; sm.frustumCulled=false;
  var u=sm.userData; u.id=d.id; u.kind='skinned'; u.type=d.t; u.name=d.n; u.kf=d.kf||[]; u.ph=d.ph||{m:'none',mass:1,rest:0.4,fric:0.4}; u.edited=true;
  sm.position.fromArray(d.p); sm.rotation.set(d.q[0],d.q[1],d.q[2]); sm.scale.fromArray(d.s); sm.visible=d.vis!==false;
  if(d.mt) MB.applyMat(sm,d.mt);
  if(bones.length===s.bn.length){
    var inv=s.bi.map(function(a){return new THREE.Matrix4().fromArray(a)});
    var sk=new THREE.Skeleton(bones,inv); sm.updateMatrixWorld(true); sm.bind(sk,new THREE.Matrix4().fromArray(s.bm));
  }
  MB.nodes.push(sm); return sm;
};

/* parenting */
R.setParent=function(o,p){
  if(!o) return;
  if(p===o){ return; }
  var q=p; while(q&&q.userData){ if(q===o){ MB.toast('Ob\'ekt o\'z avlodiga bog\'lanmaydi'); return; } q=q.parent; }
  (p||scene).attach(o); MB.commit();
};
$('rBone').onclick=function(){ var b=R.addBone(); MB.select(b); MB.commit(); MB.toast('Suyak qo\'shildi'); };
$('rChain').onclick=function(){ var b=R.chain(+$('rChainN').value||4); MB.select(b); MB.commit(); MB.toast('Suyaklar zanjiri qo\'shildi'); };
$('rBind').onclick=function(){ R.bind(MB.sel); };
})();
