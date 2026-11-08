/* Mini Blender core: scene, nodes, selection, serialization, history. */
(function(){
'use strict';
var MB=window.MB={};
var $=MB.$=function(id){return document.getElementById(id)};
var view=$('view');
var PI=Math.PI;
function r4(v){return Math.round(v*10000)/10000}
MB.r3=function(v){return Math.round(v*1000)/1000};
MB.arr=function(a){return Array.prototype.map.call(a,r4)};

MB.anim={dur:60,time:0,playing:false,loop:false,fps:24,ease:'lin',audio:null};
MB.camKeys=[];
MB.world={bg:0x23262e,hemi:0.8,sun:0.9,fog:0,shadows:true,grid:true,floor:true};
MB.frameHooks=[];
MB.LABEL={group:'Guruh',cube:'Kub',sphere:'Shar',cylinder:'Silindr',cone:'Konus',torus:'Torus',plane:'Tekislik',
  point:'Nuqta nuri',spot:'Spot nur',sun:'Quyosh nuri',bone:'Suyak',emitter:'Zarra'};

/* ---------- renderer / scene ---------- */
var scene=MB.scene=new THREE.Scene();
scene.background=new THREE.Color(MB.world.bg);
var camera=MB.camera=new THREE.PerspectiveCamera(50,1,0.1,500);
MB.HOME=[4.5,3.5,5.5];
camera.position.set(MB.HOME[0],MB.HOME[1],MB.HOME[2]);
var renderer=MB.renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});
renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,2));
renderer.shadowMap.enabled=true;
view.insertBefore(renderer.domElement,view.firstChild);

var hemi=MB.hemi=new THREE.HemisphereLight(0xffffff,0x3a3f4b,0.8); scene.add(hemi);
var sun=MB.sun=new THREE.DirectionalLight(0xffffff,0.9);
sun.position.set(5,8,4); sun.castShadow=true; sun.shadow.mapSize.set(1024,1024); sun.shadow.bias=-0.0008;
(function(c){c.left=-9;c.right=9;c.top=9;c.bottom=-9;})(sun.shadow.camera);
scene.add(sun);
var grid=MB.grid=new THREE.GridHelper(20,20,0x6b7180,0x3a3f4b); scene.add(grid);
var floor=MB.floor=new THREE.Mesh(new THREE.PlaneGeometry(40,40),new THREE.ShadowMaterial({opacity:0.25}));
floor.rotation.x=-PI/2; floor.receiveShadow=true; scene.add(floor);

var orbit=MB.orbit=new THREE.OrbitControls(camera,renderer.domElement);
orbit.enableDamping=true; orbit.dampingFactor=0.12; orbit.target.set(0,0.5,0);
var tc=MB.tc=new THREE.TransformControls(camera,renderer.domElement);
tc.setSize(1.1); scene.add(tc);
tc.addEventListener('dragging-changed',function(e){
  orbit.enabled=!e.value&&!MB.anim.camLocked;
  if(!e.value){ if(MB.edit&&MB.edit.on) MB.edit.dragEnd(); else MB.commit(); }
});

MB.applyWorld=function(){
  var w=MB.world;
  scene.background.set(w.bg); hemi.intensity=w.hemi; sun.intensity=w.sun; sun.visible=w.sun>0;
  sun.castShadow=!!w.shadows; grid.visible=!!w.grid; floor.visible=!!w.floor&&!!w.shadows;
  scene.fog=w.fog>0?new THREE.FogExp2(w.bg,w.fog):null;
  MB.nodes.forEach(function(o){ var L=o.userData.light; if(L&&L.shadow&&o.userData.sh!==undefined) L.castShadow=!!w.shadows&&!!o.userData.sh; });
};

/* ---------- toast ---------- */
var tt;
MB.toast=function(s){ var t=$('toast'); t.textContent=s; t.classList.add('show'); clearTimeout(tt); tt=setTimeout(function(){t.classList.remove('show')},1600); };

/* ---------- geometry helpers ---------- */
MB.geo=function(t){
  switch(t){
    case 'sphere': return new THREE.SphereGeometry(0.5,32,20);
    case 'cylinder': return new THREE.CylinderGeometry(0.5,0.5,1,32);
    case 'cone': return new THREE.CylinderGeometry(0,0.5,1,32);
    case 'torus': return new THREE.TorusGeometry(0.4,0.15,16,48);
    case 'plane': return new THREE.PlaneGeometry(1.5,1.5);
    default: return new THREE.BoxGeometry(1,1,1);
  }
};
MB.geoToData=function(g){
  var pa=g.attributes.position,V=[],I=[],map={},idx=g.index?g.index.array:null,n=idx?idx.length:pa.count;
  function vid(i){
    var x=pa.getX(i),y=pa.getY(i),z=pa.getZ(i);
    var k=Math.round(x*1e4)+','+Math.round(y*1e4)+','+Math.round(z*1e4),v=map[k];
    if(v===undefined){v=V.length/3;V.push(x,y,z);map[k]=v;}
    return v;
  }
  for(var i=0;i<n;i+=3){
    var a=vid(idx?idx[i]:i),b=vid(idx?idx[i+1]:i+1),c=vid(idx?idx[i+2]:i+2);
    if(a!==b&&b!==c&&a!==c) I.push(a,b,c);
  }
  return {v:V,i:I};
};
MB.geoFromData=function(d){
  var g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.Float32BufferAttribute(d.v,3));
  if(d.i) g.setIndex(d.i);
  g.computeVertexNormals();
  if(d.uv) g.setAttribute('uv',new THREE.Float32BufferAttribute(d.uv,2)); else MB.boxUV(g);
  g.computeBoundingBox(); g.computeBoundingSphere();
  return g;
};
MB.boxUV=function(g){
  var p=g.attributes.position,n=g.attributes.normal,uv=new Float32Array(p.count*2);
  for(var i=0;i<p.count;i++){
    var ax=Math.abs(n.getX(i)),ay=Math.abs(n.getY(i)),az=Math.abs(n.getZ(i)),x=p.getX(i),y=p.getY(i),z=p.getZ(i),u,v;
    if(ax>=ay&&ax>=az){u=z;v=y;} else if(ay>=az){u=x;v=z;} else {u=x;v=y;}
    uv[i*2]=u+0.5; uv[i*2+1]=v+0.5;
  }
  g.setAttribute('uv',new THREE.BufferAttribute(uv,2));
};

/* ---------- textures ---------- */
var texCache={},imgStore=MB.imgStore={};
function drawPreset(g,k){
  var i,j;
  g.fillStyle='#fff'; g.fillRect(0,0,256,256);
  if(k==='checker'){ g.fillStyle='#3a3a3a'; for(i=0;i<8;i++)for(j=0;j<8;j++) if((i+j)%2) g.fillRect(i*32,j*32,32,32); }
  else if(k==='stripes'){ g.fillStyle='#3a3a3a'; for(i=0;i<8;i+=2) g.fillRect(i*32,0,32,256); }
  else if(k==='grid'){ g.strokeStyle='#333'; g.lineWidth=4; for(i=0;i<=8;i++){g.beginPath();g.moveTo(i*32,0);g.lineTo(i*32,256);g.moveTo(0,i*32);g.lineTo(256,i*32);g.stroke();} }
  else if(k==='bricks'){ g.fillStyle='#d9d9d9'; g.fillRect(0,0,256,256); g.strokeStyle='#555'; g.lineWidth=4;
    for(j=0;j<8;j++){ g.beginPath(); g.moveTo(0,j*32); g.lineTo(256,j*32); g.stroke(); var off=(j%2)*32; for(i=0;i<5;i++){ g.beginPath(); g.moveTo(i*64+off,j*32); g.lineTo(i*64+off,j*32+32); g.stroke(); } } }
  else if(k==='noise'){ var seed=7; for(i=0;i<3000;i++){ seed=(seed*16807)%2147483647; var x=seed%256; seed=(seed*16807)%2147483647; var y=seed%256; var s=120+(seed%110); g.fillStyle='rgb('+s+','+s+','+s+')'; g.fillRect(x,y,5,5);} }
}
MB.getTexture=function(name,rep){
  if(!name) return null;
  rep=rep||1; var key=name+'@'+rep; if(texCache[key]) return texCache[key];
  var tex;
  if(name.indexOf('img:')===0){
    var img=new Image(); tex=new THREE.Texture(img); img.onload=function(){tex.needsUpdate=true;}; img.src=imgStore[name]||'';
  } else {
    var c=document.createElement('canvas'); c.width=c.height=256; drawPreset(c.getContext('2d'),name); tex=new THREE.CanvasTexture(c);
  }
  tex.wrapS=tex.wrapT=THREE.RepeatWrapping; tex.repeat.set(rep,rep); texCache[key]=tex; return tex;
};

/* ---------- materials ---------- */
MB.applyMat=function(o,m){
  var mt=o.material,u=o.userData; if(!mt||!mt.color) return;
  mt.color.setHex(m.c); mt.metalness=m.m; mt.roughness=m.r; mt.opacity=m.o; mt.transparent=m.o<1;
  mt.emissive.setHex(m.e||0); mt.emissiveIntensity=m.ei==null?1:m.ei; mt.wireframe=!!m.w; mt.flatShading=!!m.f;
  u.tx=m.tx||''; u.tr=m.tr||1; mt.map=MB.getTexture(u.tx,u.tr); mt.needsUpdate=true;
};
MB.readMat=function(o){
  var mt=o.material,u=o.userData;
  return {c:mt.color.getHex(),m:r4(mt.metalness),r:r4(mt.roughness),o:r4(mt.opacity),e:mt.emissive.getHex(),ei:r4(mt.emissiveIntensity),
    w:mt.wireframe,f:mt.flatShading,tx:u.tx||'',tr:u.tr||1};
};
MB.setMat=function(o,patch){ var m=MB.readMat(o); for(var k in patch) m[k]=patch[k]; MB.applyMat(o,m); };

/* ---------- node creators (no registration) ---------- */
MB.createMesh=function(type,geoData){
  var g=geoData?MB.geoFromData(geoData):MB.geo(type);
  var m=new THREE.MeshStandardMaterial({side:type==='plane'?THREE.DoubleSide:THREE.FrontSide});
  var o=new THREE.Mesh(g,m); o.castShadow=true; o.receiveShadow=true; return o;
};
MB.createGroup=function(){ return new THREE.Group(); };
MB.createLight=function(type){
  var proxy=new THREE.Mesh(new THREE.SphereGeometry(0.16,12,8),new THREE.MeshBasicMaterial({color:0xffee88}));
  var L;
  if(type==='sun'){ L=new THREE.DirectionalLight(0xffffff,1); var c=L.shadow.camera; c.left=-9;c.right=9;c.top=9;c.bottom=-9; L.shadow.bias=-0.0008; }
  else if(type==='spot'){ L=new THREE.SpotLight(0xffffff,1,0,PI/5,0.3,1); L.shadow.bias=-0.0005; }
  else L=new THREE.PointLight(0xffffff,1,0,1);
  L.shadow.mapSize.set(1024,1024);
  proxy.add(L);
  if(L.target){
    L.target.position.set(0,-1,0); proxy.add(L.target);
    var line=new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0,0,0),new THREE.Vector3(0,-1,0)]),new THREE.LineBasicMaterial({color:0xffee88}));
    proxy.add(line);
  }
  proxy.userData.light=L; return proxy;
};
MB.lightData=function(o){ var L=o.userData.light; return {c:L.color.getHex(),i:r4(L.intensity),d:r4(L.distance||0),a:L.angle!==undefined?r4(L.angle):0,sh:o.userData.sh?1:0}; };
MB.applyLight=function(o,d){
  var L=o.userData.light; L.color.setHex(d.c); L.intensity=d.i; L.distance=d.d||0; if(L.angle!==undefined&&d.a) L.angle=d.a;
  o.userData.sh=d.sh?1:0; L.castShadow=!!d.sh&&MB.world.shadows; o.material.color.setHex(d.c);
};

/* ---------- registry ---------- */
MB.nodes=[]; var nextId=1;
MB.sel=null; MB.selHooks=[];
function visibleDeep(o){ while(o){ if(o.visible===false) return false; o=o.parent; } return true; }
MB.pickables=function(){
  var out=[]; MB.nodes.forEach(function(o){
    if(!visibleDeep(o)) return;
    if(o.userData.kind==='bone'){ if(o.userData.vis) out.push(o.userData.vis); }
    else if(o.userData.kind!=='group') out.push(o);
  }); return out;
};
MB.byId=function(id){ for(var i=0;i<MB.nodes.length;i++) if(MB.nodes[i].userData.id===id) return MB.nodes[i]; return null; };
MB.label=function(t){ return MB.LABEL[t]||t; };

MB.select=function(o){
  if(MB.edit&&MB.edit.on&&o!==MB.sel) MB.edit.exit();
  MB.sel=o||null;
  if(MB.sel&&!(MB.edit&&MB.edit.on)) tc.attach(MB.sel); else if(!(MB.edit&&MB.edit.on)) tc.detach();
  MB.selHooks.forEach(function(f){f(MB.sel)});
};

/* Create + register a new node, add to scene. opts: name, color, p */
MB.addNode=function(kind,type,opts){
  opts=opts||{}; var o;
  if(kind==='mesh') o=MB.createMesh(type);
  else if(kind==='light') o=MB.createLight(type);
  else if(kind==='bone') o=MB.createBone();
  else if(kind==='group') o=MB.createGroup();
  else if(kind==='emitter') o=MB.createEmitter(opts.em);
  var u=o.userData; u.id=nextId++; u.kind=kind; u.type=type; u.name=opts.name||(MB.label(type)+' '+u.id);
  u.kf=[]; u.ph={m:'none',mass:1,rest:0.4,fric:0.4}; u.tx=''; u.tr=1;
  if(kind==='mesh') MB.applyMat(o,{c:opts.color==null?0x4a90d9:opts.color,m:opts.metal==null?0.1:opts.metal,r:opts.rough==null?0.5:opts.rough,o:1,e:0,ei:1,w:false,f:false});
  if(kind==='light') MB.applyLight(o,{c:0xffffff,i:type==='sun'?0.9:1.2,d:0,a:PI/5,sh:type==='point'?0:1});
  MB.nodes.push(o); (opts.parent||scene).add(o);
  if(opts.p) o.position.fromArray(opts.p);
  return o;
};
MB.removeNode=function(o){
  if(MB.sel===o) MB.select(null);
  var gone=[]; o.traverse(function(c){ if(c.userData&&c.userData.id) gone.push(c); });
  gone.forEach(function(c){ var i=MB.nodes.indexOf(c); if(i>=0) MB.nodes.splice(i,1); });
  if(o.parent) o.parent.remove(o);
  o.traverse(function(c){ if(c.geometry&&c.geometry.dispose&&!c.userData.shared) c.geometry.dispose(); if(c.material&&c.material.dispose) c.material.dispose(); });
};

/* ---------- serialization ---------- */
function ser(o){
  var u=o.userData,d={id:u.id,n:u.name,k:u.kind,t:u.type,par:(o.parent&&o.parent.userData&&o.parent.userData.id)||0,
    p:MB.arr(o.position.toArray()),q:MB.arr([o.rotation.x,o.rotation.y,o.rotation.z]),s:MB.arr(o.scale.toArray()),vis:o.visible,kf:u.kf,ph:u.ph};
  if(u.kind==='mesh'||u.kind==='skinned'){
    d.mt=MB.readMat(o);
    if(u.edited&&u.kind==='mesh'){ var dd=MB.geoToData(o.geometry); d.geo={v:MB.arr(dd.v),i:dd.i}; }
    if(u.kind==='skinned'&&MB.rig) d.sk=MB.rig.serSkin(o);
  }
  if(u.kind==='light') d.li=MB.lightData(o);
  if(u.kind==='bone') d.len=u.len;
  if(u.kind==='emitter') d.em=u.em;
  return d;
}
MB.snapshot=function(){
  var imgs={}; for(var k in imgStore) imgs[k]=imgStore[k];
  return {v:2,world:MB.world,dur:MB.anim.dur,loop:MB.anim.loop,cam:MB.camKeys,nodes:MB.nodes.map(ser),sel:MB.sel?MB.sel.userData.id:0,imgs:imgs};
};
function build(d){
  var o;
  if(d.k==='mesh') o=MB.createMesh(d.t,d.geo);
  else if(d.k==='light') o=MB.createLight(d.t);
  else if(d.k==='bone') o=MB.createBone();
  else if(d.k==='group') o=MB.createGroup();
  else if(d.k==='emitter') o=MB.createEmitter(d.em);
  else return null;
  var u=o.userData; u.id=d.id; u.kind=d.k; u.type=d.t; u.name=d.n; u.kf=d.kf||[]; u.ph=d.ph||{m:'none',mass:1,rest:0.4,fric:0.4};
  u.edited=!!d.geo; o.position.fromArray(d.p); o.rotation.set(d.q[0],d.q[1],d.q[2]); o.scale.fromArray(d.s); o.visible=d.vis!==false;
  if(d.mt) MB.applyMat(o,d.mt);
  if(d.li) MB.applyLight(o,d.li);
  if(d.k==='bone') MB.setBoneLen(o,d.len||1);
  MB.nodes.push(o); return o;
}
MB.restore=function(st){
  if(MB.edit&&MB.edit.on) MB.edit.exit(true);
  tc.detach();
  MB.nodes.slice().forEach(function(o){ if(o.parent) o.parent.remove(o); if(o.geometry&&o.geometry.dispose) o.geometry.dispose(); if(o.material&&o.material.dispose) o.material.dispose(); });
  MB.nodes=[];
  for(var k in imgStore) delete imgStore[k]; for(var k2 in (st.imgs||{})) imgStore[k2]=st.imgs[k2];
  if(st.world){ for(var w in st.world) MB.world[w]=st.world[w]; }
  MB.anim.dur=st.dur||60; MB.anim.loop=!!st.loop; MB.camKeys=st.cam||[];
  var byId={},max=0,skinned=[];
  st.nodes.forEach(function(d){ if(d.id>max) max=d.id; if(d.k==='skinned'){ skinned.push(d); return; } var o=build(d); if(o) byId[d.id]=o; });
  nextId=max+1;
  st.nodes.forEach(function(d){ if(d.k==='skinned') return; var o=byId[d.id]; if(!o) return; (d.par&&byId[d.par]?byId[d.par]:scene).add(o); });
  scene.updateMatrixWorld(true);
  skinned.forEach(function(d){ var o=MB.rig.build(d,byId); if(o){ byId[d.id]=o; (d.par&&byId[d.par]?byId[d.par]:scene).add(o); } });
  MB.applyWorld();
  MB.select(st.sel&&byId[st.sel]?byId[st.sel]:null);
  if(MB.anim.sync) MB.anim.sync();
  MB.selHooks.forEach(function(f){f(MB.sel)});
};

/* duplicate one node (not bones/skinned) */
MB.duplicate=function(o){
  var u=o.userData; if(u.kind==='bone'||u.kind==='skinned'){ MB.toast('Suyak va biriktirilgan ob\'ektni nusxalab bo\'lmaydi'); return null; }
  var d=JSON.parse(JSON.stringify(ser(o))); d.id=nextId++; d.n=u.name+' nusxa'; d.par=0;
  var c=build(d); if(!c) return null;
  if(u.kind==='emitter'){ c.userData.em=JSON.parse(JSON.stringify(u.em)); MB.rebuildEmitter(c); }
  (o.parent||scene).add(c); c.position.x+=0.6; c.position.z+=0.6; return c;
};

/* ---------- history ---------- */
var hist=[],hi=-1;
MB.commit=function(){
  hist=hist.slice(0,hi+1); hist.push(JSON.stringify(MB.snapshot())); hi=hist.length-1;
  if(hist.length>40){hist.shift();hi--;}
  MB.updUndo();
};
MB.resetHistory=function(){ hist=[]; hi=-1; MB.commit(); };
MB.updUndo=function(){ $('bUndo').disabled=hi<=0; $('bRedo').disabled=hi>=hist.length-1; };
MB.go=function(d){ var n=hi+d; if(n<0||n>=hist.length) return; hi=n; MB.restore(JSON.parse(hist[hi])); MB.updUndo(); };

/* ---------- project save / load ---------- */
MB.saveLocal=function(){ try{ localStorage.setItem('mini-blender-project',JSON.stringify(MB.snapshot())); MB.toast('Saqlandi'); }catch(e){ MB.toast('Saqlab bo\'lmadi (joy yetmadi)'); } };
MB.loadLocal=function(){
  try{ var s=localStorage.getItem('mini-blender-project'); if(!s){ MB.toast('Saqlangan loyiha yo\'q'); return; }
    MB.restore(JSON.parse(s)); MB.resetHistory(); MB.toast('Yuklandi'); }catch(e){ MB.toast('Yuklab bo\'lmadi'); }
};

/* ---------- picking ---------- */
var ray=new THREE.Raycaster(),ptr=new THREE.Vector2(),down=null,cv=renderer.domElement;
cv.addEventListener('pointerdown',function(e){
  down={x:e.clientX,y:e.clientY,t:Date.now(),onGizmo:tc.axis!==null&&tc.axis!==undefined,multi:false};
});
cv.addEventListener('pointermove',function(e){ if(down&&e.isPrimary===false) down.multi=true; });
cv.addEventListener('touchstart',function(e){ if(down&&e.touches.length>1) down.multi=true; },{passive:true});
cv.addEventListener('pointerup',function(e){
  if(!down) return; var d=down; down=null;
  if(d.onGizmo||d.multi||tc.dragging) return;
  if(Math.hypot(e.clientX-d.x,e.clientY-d.y)>6||Date.now()-d.t>450) return;
  var r=cv.getBoundingClientRect(),px=e.clientX-r.left,py=e.clientY-r.top;
  if(MB.edit&&MB.edit.on){ MB.edit.tap(px,py,r); return; }
  ptr.set((px/r.width)*2-1,-(py/r.height)*2+1); ray.setFromCamera(ptr,camera);
  var hit=ray.intersectObjects(MB.pickables(),false)[0];
  MB.select(hit?(hit.object.userData.owner||hit.object):null);
});

/* ---------- size + main loop ---------- */
function resize(){
  var w=view.clientWidth,h=view.clientHeight; if(!w||!h) return;
  renderer.setSize(w,h,false); camera.aspect=w/h; camera.updateProjectionMatrix();
}
MB.resize=resize;
if(window.ResizeObserver) new ResizeObserver(resize).observe(view); else window.addEventListener('resize',resize);

MB.start=function(){
  resize();
  (function loop(){
    requestAnimationFrame(loop);
    var now=performance.now();
    for(var i=0;i<MB.frameHooks.length;i++) MB.frameHooks[i](now);
    orbit.update(); renderer.render(scene,camera);
  })();
};
MB.applyWorld();
})();
