/* Physics (rigid body bake with cannon.js) and deterministic particle emitters. */
(function(){
'use strict';
var MB=window.MB,$=MB.$,A=MB.anim,PI=Math.PI,r3=MB.r3;

/* ================= Particle emitters ================= */
var PRESETS={
  suv:{pre:'suv',n:400,life:2.2,speed:5,spread:0.35,g:-9.8,size:0.14,grow:0,c0:0x5cc8ff,c1:0xffffff,add:1,t0:0,loop:1,burst:0.5,rnd:0},
  tutun:{pre:'tutun',n:160,life:4,speed:1.2,spread:0.3,g:0.8,size:0.6,grow:1,c0:0x555555,c1:0xcccccc,add:0,t0:0,loop:1,burst:0.5,rnd:0},
  olov:{pre:'olov',n:300,life:1.2,speed:2,spread:0.25,g:2.5,size:0.4,grow:0,c0:0xffd54a,c1:0xe5301a,add:1,t0:0,loop:1,burst:0.5,rnd:0},
  konfeti:{pre:'konfeti',n:300,life:3,speed:6,spread:1.1,g:-6,size:0.12,grow:0,c0:0xffffff,c1:0xffffff,add:0,t0:0,loop:0,burst:0.4,rnd:1}
};
MB.EMITTER_PRESETS=PRESETS;
var vert='attribute float psize;attribute float palpha;attribute vec3 pcolor;varying vec3 vC;varying float vA;uniform float scale;'+
  'void main(){vC=pcolor;vA=palpha;vec4 mv=modelViewMatrix*vec4(position,1.0);gl_PointSize=psize*scale/max(0.1,-mv.z);gl_Position=projectionMatrix*mv;}';
var frag='varying vec3 vC;varying float vA;void main(){float d=length(gl_PointCoord-0.5);if(d>0.5)discard;float a=vA*smoothstep(0.5,0.05,d);gl_FragColor=vec4(vC,a);}';

function buildPoints(o){
  var e=o.userData.em,n=e.n;
  if(o.userData.pts){ o.remove(o.userData.pts); o.userData.pts.geometry.dispose(); o.userData.pts.material.dispose(); }
  var g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.BufferAttribute(new Float32Array(n*3),3));
  g.setAttribute('pcolor',new THREE.BufferAttribute(new Float32Array(n*3),3));
  g.setAttribute('palpha',new THREE.BufferAttribute(new Float32Array(n),1));
  g.setAttribute('psize',new THREE.BufferAttribute(new Float32Array(n),1));
  var m=new THREE.ShaderMaterial({vertexShader:vert,fragmentShader:frag,transparent:true,depthWrite:false,
    blending:e.add?THREE.AdditiveBlending:THREE.NormalBlending,uniforms:{scale:{value:300}}});
  var p=new THREE.Points(g,m); p.frustumCulled=false; o.add(p); o.userData.pts=p;
}
MB.createEmitter=function(em){
  var o=new THREE.Mesh(new THREE.ConeGeometry(0.14,0.4,8),new THREE.MeshBasicMaterial({color:0xffaa33,wireframe:true}));
  o.userData.em=JSON.parse(JSON.stringify(em||PRESETS.suv)); buildPoints(o); return o;
};
MB.rebuildEmitter=function(o){ buildPoints(o); MB.updateEmitter(o,A.time); };
function h(i,k){var x=Math.sin(i*12.9898+k*78.233)*43758.5453;return x-Math.floor(x);}
var c0=new THREE.Color(),c1=new THREE.Color(),cc=new THREE.Color();
MB.updateEmitter=function(o,t){
  var e=o.userData.em,p=o.userData.pts; if(!p) return;
  var pos=p.geometry.attributes.position,col=p.geometry.attributes.pcolor,al=p.geometry.attributes.palpha,sz=p.geometry.attributes.psize,n=e.n;
  c0.setHex(e.c0); c1.setHex(e.c1);
  for(var i=0;i<n;i++){
    var birth=e.loop?(i/n)*e.life:(i/n)*e.burst,age=t-e.t0-birth;
    if(e.loop) age=((age%e.life)+e.life)%e.life;
    if(age<0||age>e.life){ al.array[i]=0; sz.array[i]=0; continue; }
    var u=age/e.life,th=e.spread*h(i,2),ph=2*PI*h(i,3),sp=e.speed*(0.6+0.8*h(i,1));
    var dx=Math.sin(th)*Math.cos(ph),dy=Math.cos(th),dz=Math.sin(th)*Math.sin(ph);
    pos.array[i*3]=dx*sp*age; pos.array[i*3+1]=dy*sp*age+0.5*e.g*age*age; pos.array[i*3+2]=dz*sp*age;
    if(e.rnd){ cc.setHSL(h(i,4),0.85,0.55); } else cc.copy(c0).lerp(c1,u);
    col.array[i*3]=cc.r; col.array[i*3+1]=cc.g; col.array[i*3+2]=cc.b;
    al.array[i]=Math.pow(1-u,0.8)*Math.min(1,age*8);
    sz.array[i]=e.size*(e.grow?(0.4+u*1.6):(1-u*0.6));
  }
  pos.needsUpdate=col.needsUpdate=al.needsUpdate=sz.needsUpdate=true;
  p.material.uniforms.scale.value=MB.renderer.domElement.height/(2*Math.tan(MB.camera.fov*PI/360));
};
MB.updateEmitters=function(t){ MB.nodes.forEach(function(o){ if(o.userData.kind==='emitter') MB.updateEmitter(o,t); }); };
MB.frameHooks.push(function(){ if(!A.playing&&MB.nodes.some(function(o){return o.userData.kind==='emitter'})&&MB.sel&&MB.sel.userData.kind==='emitter') MB.updateEmitters(A.time); });

/* ================= Rigid body bake ================= */
function shapeFor(o){
  var u=o.userData,s=o.scale,g=o.geometry;
  if(u.type==='plane'&&u.ph.m==='passive') return new CANNON.Plane();
  if(u.type==='sphere'||u.type==='torus'){ g.computeBoundingSphere(); return new CANNON.Sphere(Math.max(0.05,g.boundingSphere.radius*Math.max(s.x,s.y,s.z))); }
  g.computeBoundingBox(); var bb=g.boundingBox,hx=(bb.max.x-bb.min.x)/2*s.x,hy=(bb.max.y-bb.min.y)/2*s.y,hz=(bb.max.z-bb.min.z)/2*s.z;
  return new CANNON.Box(new CANNON.Vec3(Math.max(0.02,hx),Math.max(0.02,hy),Math.max(0.02,hz)));
}
MB.bakePhysics=function(){
  if(typeof CANNON==='undefined'){ MB.toast('Fizika kutubxonasi yuklanmadi'); return; }
  if(A.playing) MB.stopPlay();
  if(A.time>0.05) MB.setTime(0);
  var world=new CANNON.World(); world.gravity.set(0,-(+$('pGrav').value||9.82),0);
  world.broadphase=new CANNON.NaiveBroadphase(); world.solver.iterations=12;
  var items=[],rest=0,fric=0,cnt=0;
  MB.nodes.forEach(function(o){
    var u=o.userData; if(u.kind!=='mesh'||u.ph.m==='none') return;
    if(o.parent!==MB.scene){ return; }
    var b=new CANNON.Body({mass:u.ph.m==='active'?Math.max(0.01,u.ph.mass):0});
    b.addShape(shapeFor(o));
    b.position.set(o.position.x,o.position.y,o.position.z);
    var q=new THREE.Quaternion().setFromEuler(o.rotation); b.quaternion.set(q.x,q.y,q.z,q.w);
    world.addBody(b); items.push({o:o,b:b,active:u.ph.m==='active'}); rest+=u.ph.rest; fric+=u.ph.fric; cnt++;
  });
  if(!items.length){ MB.toast('Fizika uchun ob\'ektni "Faol" yoki "Qattiq" qiling'); return; }
  world.defaultContactMaterial.restitution=rest/cnt; world.defaultContactMaterial.friction=fric/cnt;
  var actives=items.filter(function(i){return i.active}); if(!actives.length){ MB.toast('Kamida bitta "Faol" ob\'ekt kerak'); return; }
  var fps=A.fps,frames=Math.round(A.dur*fps),dt=1/60,acc=0,prevE={};
  actives.forEach(function(i){ i.o.userData.kf=[]; prevE[i.o.userData.id]=[i.o.rotation.x,i.o.rotation.y,i.o.rotation.z]; });
  var eul=new THREE.Euler(),qq=new THREE.Quaternion();
  for(var f=0;f<=frames;f++){
    var t=f/fps;
    actives.forEach(function(i){
      var b=i.b; qq.set(b.quaternion.x,b.quaternion.y,b.quaternion.z,b.quaternion.w); eul.setFromQuaternion(qq,'XYZ');
      var pe=prevE[i.o.userData.id],r=[eul.x,eul.y,eul.z];
      for(var k=0;k<3;k++){ while(r[k]-pe[k]>PI) r[k]-=2*PI; while(r[k]-pe[k]<-PI) r[k]+=2*PI; }
      prevE[i.o.userData.id]=r;
      i.o.userData.kf.push({t:r3(t),p:[r3(b.position.x),r3(b.position.y),r3(b.position.z)],q:[r3(r[0]),r3(r[1]),r3(r[2])],s:MB.arr(i.o.scale.toArray()),e:'lin'});
    });
    for(var s=0;s<Math.round(60/fps);s++) world.step(dt);
  }
  MB.setTime(0); MB.drawLane(); MB.commit(); MB.toast('Fizika hisoblandi: '+actives.length+' ta ob\'ekt');
};
MB.clearPhysics=function(){
  MB.nodes.forEach(function(o){ if(o.userData.ph&&o.userData.ph.m==='active') o.userData.kf=[]; });
  MB.drawLane(); MB.commit(); MB.toast('Fizika kadrlari tozalandi');
};

/* ================= UI ================= */
function syncPanel(o){
  var isMesh=o&&o.userData.kind==='mesh',isEm=o&&o.userData.kind==='emitter';
  $('pBody').hidden=!isMesh; $('pEm').hidden=!isEm;
  if(isMesh){ var ph=o.userData.ph; $('pMode').value=ph.m; $('pMass').value=ph.mass; $('pRest').value=ph.rest; $('pFric').value=ph.fric; }
  if(isEm){ var e=o.userData.em; ['n','life','speed','spread','g','size'].forEach(function(k){ $('em_'+k).value=e[k]; });
    $('em_c0').value='#'+('000000'+e.c0.toString(16)).slice(-6); $('em_c1').value='#'+('000000'+e.c1.toString(16)).slice(-6);
    $('em_loop').checked=!!e.loop; $('em_add').checked=!!e.add; $('em_t0').value=e.t0; }
}
MB.selHooks.push(syncPanel);
$('pMode').onchange=function(e){ if(MB.sel&&MB.sel.userData.ph){ MB.sel.userData.ph.m=e.target.value; MB.commit(); } };
['pMass','pRest','pFric'].forEach(function(id){ $(id).onchange=function(e){ if(!MB.sel) return; var k={pMass:'mass',pRest:'rest',pFric:'fric'}[id]; MB.sel.userData.ph[k]=+e.target.value; MB.commit(); }; });
$('pBake').onclick=MB.bakePhysics; $('pClear').onclick=MB.clearPhysics;
function emSet(patch,rebuild){
  var o=MB.sel; if(!o||o.userData.kind!=='emitter') return;
  for(var k in patch) o.userData.em[k]=patch[k];
  if(rebuild) buildPoints(o); else if(patch.add!==undefined) buildPoints(o);
  MB.updateEmitter(o,A.time);
}
['n','life','speed','spread','g','size','t0'].forEach(function(k){
  $('em_'+k).onchange=function(e){ emSet(((function(){var p={};p[k]=+e.target.value;return p;})()),k==='n'); MB.commit(); };
});
$('em_c0').oninput=function(e){ emSet({c0:parseInt(e.target.value.slice(1),16)}); };
$('em_c1').oninput=function(e){ emSet({c1:parseInt(e.target.value.slice(1),16)}); };
$('em_loop').onchange=function(e){ emSet({loop:e.target.checked?1:0}); MB.commit(); };
$('em_add').onchange=function(e){ emSet({add:e.target.checked?1:0}); MB.commit(); };
$('emPreset').onchange=function(e){
  var o=MB.sel; if(!o||o.userData.kind!=='emitter'||!e.target.value) return;
  o.userData.em=JSON.parse(JSON.stringify(PRESETS[e.target.value])); buildPoints(o); MB.updateEmitter(o,A.time); syncPanel(o); MB.commit();
};
})();
