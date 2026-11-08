/* UI wiring: add menu, outliner, transform modes, object/material/light/world panels, tabs. */
(function(){
'use strict';
var MB=window.MB,$=MB.$,tc=MB.tc,orbit=MB.orbit,scene=MB.scene;
var PALETTE=[0x4a90d9,0xe5604d,0x62c370,0xe8b84a,0xa77bd8,0x4fc3c3],ci=0;
function hex(n){return '#'+('000000'+(n>>>0).toString(16)).slice(-6)}
function num(s){return parseInt(s.slice(1),16)}

/* commit also refreshes the outliner */
var rawCommit=MB.commit;
MB.commit=function(){ rawCommit(); refreshOutliner(); };

/* ---------- add menu ---------- */
function menu(open){ $('menu').hidden=!open; $('bAdd').setAttribute('aria-expanded',open); if(open) $('outliner').hidden=true; }
$('bAdd').onclick=function(){ menu($('menu').hidden); };
$('menu').addEventListener('click',function(e){
  var spec=e.target.getAttribute&&e.target.getAttribute('data-add'); if(!spec) return;
  if(MB.edit.on) MB.edit.exit();
  var p=spec.split(':'),k=p[0],t=p[1],o,tg=orbit.target,r=Math.min(MB.nodes.length,6)*0.25;
  var jx=(Math.random()-0.5)*r*2,jz=(Math.random()-0.5)*r*2;
  if(k==='mesh') o=MB.addNode('mesh',t,{color:PALETTE[ci++%6],p:[tg.x+jx,t==='plane'?0.01:t==='torus'?0.55:0.5,tg.z+jz]});
  else if(k==='light') o=MB.addNode('light',t,{p:[tg.x+1.5,3.5,tg.z+1.5]});
  else if(k==='bone') o=MB.rig.addBone();
  else if(k==='emitter') o=MB.addNode('emitter','emitter',{em:MB.EMITTER_PRESETS[t],name:'Zarra '+t,p:[tg.x,0.2,tg.z]});
  if(k==='mesh'&&t==='plane') o.rotation.x=-Math.PI/2;
  MB.select(o); MB.commit(); menu(false); MB.toast('Qo\'shildi');
});

/* ---------- top bar ---------- */
$('bUndo').onclick=function(){ MB.go(-1); }; $('bRedo').onclick=function(){ MB.go(1); };
$('bCam').onclick=function(){
  var tgt=MB.sel?MB.sel.getWorldPosition(new THREE.Vector3()):new THREE.Vector3(0,0.5,0);
  orbit.target.copy(tgt); MB.camera.position.set(tgt.x+MB.HOME[0],tgt.y+MB.HOME[1],tgt.z+MB.HOME[2]);
};
$('bDemo').onclick=function(){ MB.buildPizza(); MB.toast('Namuna yuklandi. Play bosing'); };
$('bDemoA').onclick=function(){ MB.buildPizza(); MB.toast('Pitsa kuryeri yuklandi'); };
$('bDemoB').onclick=function(){ MB.buildDemo(); MB.toast('Sakrovchi shar yuklandi'); };
$('bSave').onclick=MB.saveLocal; $('bLoad').onclick=MB.loadLocal;

/* ---------- transform modes ---------- */
var snapOn=false;
function mode(m,id){ tc.setMode(m); ['mMove','mRot','mScale'].forEach(function(k){ $(k).classList.toggle('on',k===id); }); }
$('mMove').onclick=function(){mode('translate','mMove')}; $('mRot').onclick=function(){mode('rotate','mRot')}; $('mScale').onclick=function(){mode('scale','mScale')};
$('bSnap').onclick=function(){
  snapOn=!snapOn; $('bSnap').classList.toggle('on',snapOn);
  tc.setTranslationSnap(snapOn?0.5:null); tc.setRotationSnap(snapOn?THREE.MathUtils.degToRad(15):null); tc.setScaleSnap(snapOn?0.25:null);
  MB.toast(snapOn?'Qadam yoqildi':'Qadam o\'chirildi');
};
$('bDup').onclick=function(){ if(!MB.sel) return; var c=MB.duplicate(MB.sel); if(c){ MB.select(c); MB.commit(); MB.toast('Nusxalandi'); } };
$('bDel').onclick=function(){ if(!MB.sel) return; if(MB.edit.on) MB.edit.exit(true); var o=MB.sel; MB.removeNode(o); MB.commit(); MB.toast('O\'chirildi'); };
$('bUndo').disabled=true; $('bRedo').disabled=true;

/* ---------- tabs ---------- */
var tabs=document.querySelectorAll('#tabs button'),secs=document.querySelectorAll('.tab');
function openTab(name){
  var cur=document.querySelector('#tabs button.on'),same=cur&&cur.dataset.t===name&&!$('dock').classList.contains('closed');
  if(same){ $('dock').classList.add('closed'); cur.classList.remove('on'); setTimeout(MB.resize,50); return; }
  $('dock').classList.remove('closed');
  tabs.forEach(function(b){ b.classList.toggle('on',b.dataset.t===name); });
  secs.forEach(function(s){ s.hidden=s.dataset.tab!==name; });
  setTimeout(MB.resize,50);
}
tabs.forEach(function(b){ b.onclick=function(){ openTab(b.dataset.t); }; });

/* ---------- outliner ---------- */
function isNode(o){ return o&&o.userData&&o.userData.id; }
function refreshOutliner(){
  var box=$('outliner'); if(box.hidden) return; box.innerHTML='';
  function row(o,depth){
    var r=document.createElement('div'); r.className='orow'+(o===MB.sel?' sel':''); r.style.paddingLeft=(8+depth*14)+'px';
    var b=document.createElement('button'); b.className='oname'; b.textContent=o.userData.name+(o.userData.kf.length?' ◆':''); b.onclick=function(){ MB.select(o); refreshOutliner(); };
    var e=document.createElement('button'); e.className='oeye'; e.textContent=o.visible?'Ko\'rinadi':'Yashirin'; e.onclick=function(){ o.visible=!o.visible; MB.commit(); };
    r.appendChild(b); r.appendChild(e); box.appendChild(r);
    o.children.forEach(function(c){ if(isNode(c)) row(c,depth+1); });
  }
  var n=0; MB.nodes.forEach(function(o){ if(!isNode(o.parent)){ row(o,0); n++; } });
  if(!n) box.textContent='Sahna bo\'sh';
}
$('bList').onclick=function(){ $('outliner').hidden=!$('outliner').hidden; if(!$('outliner').hidden){ menu(false); refreshOutliner(); } };

/* ---------- object panel ---------- */
function descendants(o){ var out=[]; o.traverse(function(c){ if(c!==o&&isNode(c)) out.push(c); }); return out; }
function fillParents(o){
  var s=$('oParent'),ex=o?[o].concat(descendants(o)):[],h='<option value="0">— (ildiz)</option>';
  MB.nodes.forEach(function(n){ if(ex.indexOf(n)<0) h+='<option value="'+n.userData.id+'">'+n.userData.name+'</option>'; });
  s.innerHTML=h; s.value=o&&isNode(o.parent)?o.parent.userData.id:0;
}
function syncObj(o){
  $('oBody').hidden=!o; if(!o) return;
  $('oName').value=o.userData.name; $('oVis').checked=o.visible; fillParents(o);
  $('bDup').disabled=$('bDel').disabled=false;
}
$('oName').onchange=function(e){ if(MB.sel){ MB.sel.userData.name=e.target.value||MB.sel.userData.name; MB.commit(); } };
$('oVis').onchange=function(e){ if(MB.sel){ MB.sel.visible=e.target.checked; MB.commit(); } };
$('bParent').onclick=function(){ if(!MB.sel) return; var p=MB.byId(+$('oParent').value); MB.rig.setParent(MB.sel,p); fillParents(MB.sel); MB.toast(p?'Bog\'landi':'Ajratildi'); };

/* ---------- material / light panel ---------- */
function fillTex(o){
  var h='<option value="">Yo\'q</option>';
  [['checker','Shaxmat'],['stripes','Yo\'l-yo\'l'],['grid','To\'r'],['bricks','G\'isht'],['noise','Dog\'lar']].forEach(function(t){ h+='<option value="'+t[0]+'">'+t[1]+'</option>'; });
  Object.keys(MB.imgStore).forEach(function(k,i){ h+='<option value="'+k+'">Rasm '+(i+1)+'</option>'; });
  $('mTex').innerHTML=h; $('mTex').value=o.userData.tx||'';
}
function syncMat(o){
  var isMesh=o&&(o.userData.kind==='mesh'||o.userData.kind==='skinned'),isLight=o&&o.userData.kind==='light';
  $('mBlock').hidden=!isMesh; $('lBlock').hidden=!isLight; $('mNone').hidden=!!(isMesh||isLight);
  if(isMesh){ var m=MB.readMat(o); $('mColor').value=hex(m.c); $('mMetal').value=m.m; $('mRough').value=m.r; $('mOpac').value=m.o;
    $('mEmis').value=hex(m.e); $('mEmisI').value=m.ei; $('mWire').checked=m.w; $('mTexRep').value=m.tr; fillTex(o); }
  if(isLight){ var d=MB.lightData(o); $('lColor').value=hex(d.c); $('lInt').value=d.i; $('lDist').value=d.d; $('lAngle').value=d.a||0.6; $('lShadow').checked=!!d.sh;
    $('lAngleRow').hidden=o.userData.type!=='spot'; }
}
function mset(k,conv){ return function(e){ if(!MB.sel) return; var p={}; p[k]=conv?conv(e.target):e.target.value; MB.setMat(MB.sel,p); }; }
[['mColor','c',function(t){return num(t.value)}],['mMetal','m',function(t){return +t.value}],['mRough','r',function(t){return +t.value}],
 ['mOpac','o',function(t){return +t.value}],['mEmis','e',function(t){return num(t.value)}],['mEmisI','ei',function(t){return +t.value}],
 ['mWire','w',function(t){return t.checked}],['mTexRep','tr',function(t){return Math.max(1,+t.value||1)}]].forEach(function(a){
  var el=$(a[0]); el.oninput=mset(a[1],a[2]); el.onchange=function(e){ mset(a[1],a[2])(e); MB.commit(); };
});
$('mTex').onchange=function(e){ if(MB.sel){ MB.setMat(MB.sel,{tx:e.target.value}); MB.commit(); } };
$('mImg').onchange=function(e){
  var f=e.target.files[0]; if(!f||!MB.sel) return; var r=new FileReader();
  r.onload=function(){ var key='img:'+Date.now(); MB.imgStore[key]=r.result; MB.setMat(MB.sel,{tx:key}); fillTex(MB.sel); MB.commit(); MB.toast('Tekstura qo\'yildi'); };
  r.readAsDataURL(f); e.target.value='';
};
function lset(k,conv){ return function(e){ var o=MB.sel; if(!o) return; var d=MB.lightData(o); d[k]=conv(e.target); MB.applyLight(o,d); }; }
[['lColor','c',function(t){return num(t.value)}],['lInt','i',function(t){return +t.value}],['lDist','d',function(t){return +t.value}],
 ['lAngle','a',function(t){return +t.value}],['lShadow','sh',function(t){return t.checked?1:0}]].forEach(function(a){
  var el=$(a[0]); el.oninput=lset(a[1],a[2]); el.onchange=function(e){ lset(a[1],a[2])(e); MB.commit(); };
});

/* ---------- world panel ---------- */
function syncWorld(){
  var w=MB.world; $('wBg').value=hex(w.bg); $('wHemi').value=w.hemi; $('wSun').value=w.sun; $('wFog').value=w.fog;
  $('wShadow').checked=!!w.shadows; $('wGrid').checked=!!w.grid; $('wFloor').checked=!!w.floor;
}
MB.syncWorld=syncWorld;
[['wBg','bg',function(t){return num(t.value)}],['wHemi','hemi',function(t){return +t.value}],['wSun','sun',function(t){return +t.value}],['wFog','fog',function(t){return +t.value}],
 ['wShadow','shadows',function(t){return t.checked}],['wGrid','grid',function(t){return t.checked}],['wFloor','floor',function(t){return t.checked}]].forEach(function(a){
  var el=$(a[0]); el.oninput=function(e){ MB.world[a[1]]=a[2](e.target); MB.applyWorld(); }; el.onchange=function(){ MB.commit(); };
});

/* ---------- selection sync ---------- */
MB.selHooks.push(function(o){
  syncObj(o); syncMat(o); syncWorld();
  $('bDup').disabled=$('bDel').disabled=!o;
  refreshOutliner();
});
$('bDup').disabled=true; $('bDel').disabled=true;
$('app').addEventListener('pointerdown',function(e){ if(!$('menu').hidden&&!$('menu').contains(e.target)&&e.target!==$('bAdd')) menu(false); },true);

window.addEventListener('keydown',function(e){
  if(e.target&&/input|textarea|select/i.test(e.target.tagName)) return;
  if(e.key==='Delete'||e.key==='Backspace') $('bDel').click();
  else if(e.key==='g') $('mMove').click(); else if(e.key==='r') $('mRot').click(); else if(e.key==='s') $('mScale').click();
  else if((e.ctrlKey||e.metaKey)&&e.key==='z'){ e.preventDefault(); MB.go(e.shiftKey?1:-1); }
});

syncWorld();
})();
