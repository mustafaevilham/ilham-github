/* Animation: keyframes with easing, camera keys, timeline, audio, playback. */
(function(){
'use strict';
var MB=window.MB,$=MB.$,A=MB.anim,orbit=MB.orbit,camera=MB.camera,r3=MB.r3;

function bounceOut(u){var n=7.5625,d=2.75;if(u<1/d)return n*u*u;if(u<2/d){u-=1.5/d;return n*u*u+0.75;}if(u<2.5/d){u-=2.25/d;return n*u*u+0.9375;}u-=2.625/d;return n*u*u+0.984375;}
var EASE={lin:function(u){return u},'in':function(u){return u*u*u},out:function(u){var v=1-u;return 1-v*v*v},io:function(u){return u*u*(3-2*u)},bounce:bounceOut,step:function(){return 0}};
MB.EASE_NAMES=[['lin','Chiziqli'],['io','Yumshoq'],['in','Sekin boshlanish'],['out','Sekin tugash'],['bounce','Sakrash'],['step','Zinapoya']];
function lerpA(a,b,u){return [a[0]+(b[0]-a[0])*u,a[1]+(b[1]-a[1])*u,a[2]+(b[2]-a[2])*u]}
function sm(a,b,t){var x=Math.min(1,Math.max(0,(t-a)/(b-a)));return x*x*(3-2*x)}
MB.sm=sm;
var ca=new THREE.Color(),cb=new THREE.Color();

function seg(kf,t){var lo=0,hi=kf.length-1;while(hi-lo>1){var mid=(lo+hi)>>1;if(kf[mid].t<=t)lo=mid;else hi=mid;}return lo;}
/* evaluate the pose of keyframes kf at time t -> {p,q,s,c?,o?,i?} */
MB.evalKf=function(kf,t){
  var n=kf.length;
  if(t<=kf[0].t) return kf[0];
  if(t>=kf[n-1].t) return kf[n-1];
  var si=seg(kf,t),a=kf[si],b=kf[si+1]||a;
  var u=(t-a.t)/((b.t-a.t)||1); u=(EASE[a.e]||EASE.lin)(u);
  var r={p:lerpA(a.p,b.p,u),q:lerpA(a.q,b.q,u),s:lerpA(a.s,b.s,u)};
  if(a.c!=null&&b.c!=null){ ca.setHex(a.c); cb.setHex(b.c); r.c=ca.lerp(cb,u).getHex(); }
  if(a.o!=null&&b.o!=null) r.o=a.o+(b.o-a.o)*u;
  if(a.i!=null&&b.i!=null) r.i=a.i+(b.i-a.i)*u;
  return r;
};
function applyNode(o,t){
  var kf=o.userData.kf; if(!kf||!kf.length) return;
  var k=MB.evalKf(kf,t);
  o.position.fromArray(k.p); o.rotation.set(k.q[0],k.q[1],k.q[2]); o.scale.fromArray(k.s);
  if(k.c!=null&&o.material&&o.material.color) o.material.color.setHex(k.c);
  if(k.o!=null&&o.material){ o.material.opacity=k.o; var tr=k.o<1; if(o.material.transparent!==tr){o.material.transparent=tr;o.material.needsUpdate=true;} }
  if(k.i!=null&&o.userData.light) o.userData.light.intensity=k.i;
}
function applyCam(t){
  var c=MB.camKeys; if(!c.length) return;
  var n=c.length,a,b,u;
  if(t<=c[0].t){a=b=c[0];u=0;} else if(t>=c[n-1].t){a=b=c[n-1];u=0;}
  else { var ci=seg(c,t); a=c[ci]; b=c[ci+1]; u=(EASE[a.e]||EASE.io)((t-a.t)/((b.t-a.t)||1)); }
  camera.position.fromArray(lerpA(a.p,b.p,u)); orbit.target.fromArray(lerpA(a.g,b.g,u));
  var f=a.f+(b.f-a.f)*u; if(f&&Math.abs(camera.fov-f)>0.01){camera.fov=f;camera.updateProjectionMatrix();}
}
MB.applyAll=function(t){
  MB.nodes.forEach(function(o){ applyNode(o,t); });
  applyCam(t);
  if(MB.updateEmitters) MB.updateEmitters(t);
};

/* ---------- UI sync ---------- */
function fmt(t){var s=Math.floor(t);return Math.floor(s/60)+':'+('0'+(s%60)).slice(-2)}
MB.fmt=fmt;
A.sync=function(){
  var s=$('tSlider'); s.max=A.dur; s.value=A.time; $('tLabel').textContent=fmt(A.time)+' / '+fmt(A.dur);
  $('aDur').value=A.dur; $('aLoop').checked=A.loop; drawLane();
};
MB.setTime=function(t){ A.time=Math.min(A.dur,Math.max(0,t)); MB.applyAll(A.time); $('tSlider').value=A.time; $('tLabel').textContent=fmt(A.time)+' / '+fmt(A.dur); };

function drawLane(){
  var lane=$('lane'); lane.innerHTML='';
  var kf=MB.sel?MB.sel.userData.kf:null,isCam=false;
  if(!MB.sel||!kf||!kf.length){ kf=MB.camKeys; isCam=true; }
  if(!kf.length){ lane.hidden=true; return; }
  lane.hidden=false;
  var many=kf.length>150,step=many?Math.ceil(kf.length/150):1;
  var tag=document.createElement('span'); tag.className='lane-tag'; tag.textContent=(isCam?'Kamera':MB.sel.userData.name)+' · '+kf.length+' kadr';
  lane.appendChild(tag);
  for(var i=0;i<kf.length;i+=step){
    var d=document.createElement('button'); d.className='key'; d.style.left=(kf[i].t/A.dur*100)+'%'; d.setAttribute('aria-label','Kadr '+fmt(kf[i].t));
    d.dataset.t=kf[i].t; d.onclick=function(){ stop(); MB.setTime(+this.dataset.t); }; lane.appendChild(d);
  }
}
MB.drawLane=drawLane;

/* ---------- keyframes ---------- */
function poseKey(o,t){
  var k={t:r3(t),p:MB.arr(o.position.toArray()),q:MB.arr([o.rotation.x,o.rotation.y,o.rotation.z]),s:MB.arr(o.scale.toArray()),e:A.ease};
  if(o.userData.kind==='mesh'||o.userData.kind==='skinned'){ k.c=o.material.color.getHex(); k.o=r3(o.material.opacity); }
  if(o.userData.light) k.i=r3(o.userData.light.intensity);
  return k;
}
MB.addKey=function(o,t){
  t=t==null?A.time:t; var k=poseKey(o,t);
  var kf=o.userData.kf.filter(function(x){return Math.abs(x.t-k.t)>=0.03});
  kf.push(k); kf.sort(function(a,b){return a.t-b.t}); o.userData.kf=kf;
};
MB.delKey=function(o,t){ o.userData.kf=o.userData.kf.filter(function(x){return Math.abs(x.t-t)>=0.06}); };
MB.addCamKey=function(t){
  t=t==null?A.time:t; var k={t:r3(t),p:MB.arr(camera.position.toArray()),g:MB.arr(orbit.target.toArray()),f:r3(camera.fov),e:'io'};
  MB.camKeys=MB.camKeys.filter(function(x){return Math.abs(x.t-k.t)>=0.03}); MB.camKeys.push(k); MB.camKeys.sort(function(a,b){return a.t-b.t});
};

/* ---------- playback ---------- */
var last=0;
function helpers(v){
  MB.nodes.forEach(function(o){
    var k=o.userData.kind;
    if(k==='emitter'||k==='light') o.material.visible=v;
    if(k==='light') o.children.forEach(function(c){ if(c.isLine) c.visible=v; });
    if(k==='bone'&&o.userData.vis) o.userData.vis.visible=v;
  });
}
MB.helpers=helpers;
function start(){
  if(A.time>=A.dur-0.01) A.time=0;
  MB.select(null); helpers(false); A.playing=true; A.camLocked=MB.camKeys.length>0; orbit.enabled=!A.camLocked; last=performance.now();
  $('bPlay').textContent='Pauza'; $('bPlay').classList.add('on');
  if(A.audio&&A.audio.el){ try{ A.audio.el.currentTime=A.time; var p=A.audio.el.play(); if(p&&p.catch) p.catch(function(){}); }catch(e){} }
}
function stop(){
  var was=A.playing; A.playing=false; helpers(true); A.camLocked=false; orbit.enabled=true;
  $('bPlay').textContent='Play'; $('bPlay').classList.remove('on');
  if(A.audio&&A.audio.el) try{ A.audio.el.pause(); }catch(e){}
  return was;
}
MB.startPlay=start; MB.stopPlay=stop; MB.onPlayEnd=[];
MB.frameHooks.push(function(now){
  if(!A.playing) return;
  A.time+=Math.min(0.25,(now-last)/1000); last=now;
  if(A.time>=A.dur){
    if(A.loop){ A.time=0; if(A.audio&&A.audio.el) try{A.audio.el.currentTime=0;}catch(e){} }
    else { A.time=A.dur; stop(); MB.applyAll(A.time); MB.setTime(A.time); MB.onPlayEnd.forEach(function(f){f()}); return; }
  }
  MB.applyAll(A.time); $('tSlider').value=A.time; $('tLabel').textContent=fmt(A.time)+' / '+fmt(A.dur);
});

/* ---------- wiring ---------- */
$('bPlay').onclick=function(){ if(A.playing) stop(); else start(); };
$('tSlider').oninput=function(e){ stop(); MB.setTime(+e.target.value); };
$('aDur').onchange=function(e){ var v=Math.max(2,Math.min(600,+e.target.value||60)); A.dur=v; A.time=Math.min(A.time,v); A.sync(); MB.commit(); };
$('aLoop').onchange=function(e){ A.loop=e.target.checked; };
$('aEase').innerHTML=MB.EASE_NAMES.map(function(x){return '<option value="'+x[0]+'">'+x[1]+'</option>'}).join('');
$('aEase').onchange=function(e){
  A.ease=e.target.value;
  if(MB.sel){ MB.sel.userData.kf.forEach(function(k){ if(Math.abs(k.t-A.time)<0.06) k.e=A.ease; }); MB.commit(); }
};
$('bKey').onclick=function(){
  if(!MB.sel){ MB.toast('Avval ob\'ektni tanlang'); return; }
  MB.addKey(MB.sel); drawLane(); MB.commit(); MB.toast('Kadr qo\'shildi');
};
$('bKeyAll').onclick=function(){ MB.nodes.forEach(function(o){ if(o.userData.kind!=='emitter') MB.addKey(o); }); drawLane(); MB.commit(); MB.toast('Hamma ob\'ektga kadr qo\'shildi'); };
$('bKeyDel').onclick=function(){
  if(MB.sel&&MB.sel.userData.kf.length) MB.delKey(MB.sel,A.time); else MB.camKeys=MB.camKeys.filter(function(x){return Math.abs(x.t-A.time)>=0.06});
  drawLane(); MB.commit(); MB.toast('Kadr o\'chirildi');
};
$('bKeyCam').onclick=function(){ MB.addCamKey(); drawLane(); MB.commit(); MB.toast('Kamera kadri qo\'shildi'); };
$('bKeyClear').onclick=function(){
  if(MB.sel) MB.sel.userData.kf=[]; else MB.camKeys=[];
  drawLane(); MB.commit(); MB.toast('Kadrlar tozalandi');
};
$('aAudio').onchange=function(e){
  var f=e.target.files[0]; if(!f) return;
  try{
    if(A.audio&&A.audio.url) URL.revokeObjectURL(A.audio.url);
    var url=URL.createObjectURL(f),el=new Audio(url); el.preload='auto'; A.audio={el:el,name:f.name,url:url};
    $('aAudioName').textContent=f.name; MB.toast('Ovoz yuklandi');
  }catch(err){ MB.toast('Ovozni yuklab bo\'lmadi'); }
};
$('bAudioClear').onclick=function(){ if(A.audio){ try{A.audio.el.pause();}catch(e){} A.audio=null; } $('aAudioName').textContent='Ovoz yo\'q'; };
MB.selHooks.push(function(){ drawLane(); });
})();
