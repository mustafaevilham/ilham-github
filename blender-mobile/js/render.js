/* Output: PNG, video recording (with audio), GLB/OBJ export, project file export/import. */
(function(){
'use strict';
var MB=window.MB,$=MB.$,A=MB.anim,renderer=MB.renderer,scene=MB.scene;
var OK_EXT={gif:1,png:1,jpg:1,jpeg:1,webp:1,mp4:1,webm:1,mov:1,txt:1,json:1,md:1,docx:1,pptx:1,epub:1,csv:1,ttf:1,html:1,svg:1,pdf:1,xlsx:1,zip:1,fig:1};

function anchorSave(name,blob){
  var url=URL.createObjectURL(blob),a=document.createElement('a'); a.href=url; a.download=name; document.body.appendChild(a); a.click();
  setTimeout(function(){ document.body.removeChild(a); URL.revokeObjectURL(url); },1000);
  return Promise.resolve();
}
/* Saves via the claude.ai "downloads" capability when present, otherwise a normal browser download. */
MB.saveBlob=function(name,blob){
  var ext=(name.split('.').pop()||'').toLowerCase();
  var cl=window.claude&&window.claude.use?window.claude.use('downloads'):Promise.resolve(null);
  return cl.then(function(dl){
    if(!dl) return anchorSave(name,blob);
    var prep=Promise.resolve({name:name,data:blob});
    if(!OK_EXT[ext]){
      if(!window.JSZip) return Promise.reject(new Error('zip yo\'q'));
      var z=new JSZip(); z.file(name,blob);
      prep=z.generateAsync({type:'blob'}).then(function(zb){ return {name:name+'.zip',data:zb}; });
    }
    return prep.then(function(x){ return dl.save({filename:x.name,data:x.data}); }).then(function(){ MB.toast('Saqlandi: '+name); });
  }).catch(function(err){
    var code=err&&err.code; if(code==='declined') return;
    MB.toast('Saqlab bo\'lmadi'+(code?' ('+code+')':''));
  });
};

/* ---- PNG ---- */
$('oPng').onclick=function(){
  renderer.render(scene,MB.camera);
  renderer.domElement.toBlob(function(b){ if(b) MB.saveBlob('rasm.png',b); else MB.toast('Rasm olinmadi'); },'image/png');
};

/* ---- video ---- */
var rec=null,chunks=[],audioWired=null;
function pickMime(){
  var c=['video/mp4;codecs=avc1','video/webm;codecs=vp9','video/webm;codecs=vp8','video/webm'];
  for(var i=0;i<c.length;i++) if(window.MediaRecorder&&MediaRecorder.isTypeSupported&&MediaRecorder.isTypeSupported(c[i])) return c[i];
  return '';
}
function finishRec(){
  if(!rec) return; var r=rec; rec=null;
  try{ if(r.state!=='inactive') r.stop(); }catch(e){}
  $('oRec').textContent='Videoni yozib olish'; $('oRec').classList.remove('on');
}
$('oRec').onclick=function(){
  if(rec){ MB.stopPlay(); finishRec(); return; }
  if(!window.MediaRecorder||!renderer.domElement.captureStream){ MB.toast('Brauzer video yozishni qo\'llamaydi'); return; }
  var mime=pickMime(); if(!mime){ MB.toast('Video format topilmadi'); return; }
  try{
    var stream=renderer.domElement.captureStream(30);
    if(A.audio&&A.audio.el){
      try{
        var ctx=new (window.AudioContext||window.webkitAudioContext)();
        if(!A.audio.src){ A.audio.src=ctx.createMediaElementSource(A.audio.el); A.audio.ctx=ctx; }
        var dest=A.audio.ctx.createMediaStreamDestination(); A.audio.src.connect(dest); A.audio.src.connect(A.audio.ctx.destination);
        dest.stream.getAudioTracks().forEach(function(t){ stream.addTrack(t); });
      }catch(e){}
    }
    chunks=[]; rec=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:6000000});
    var ext=mime.indexOf('mp4')>=0?'mp4':'webm';
    rec.ondataavailable=function(e){ if(e.data&&e.data.size) chunks.push(e.data); };
    rec.onstop=function(){ var b=new Blob(chunks,{type:mime.split(';')[0]}); chunks=[]; if(b.size) MB.saveBlob('multfilm.'+ext,b); else MB.toast('Video bo\'sh chiqdi'); };
    MB.setTime(0); rec.start(250); MB.startPlay();
    $('oRec').textContent='To\'xtatish va saqlash'; $('oRec').classList.add('on'); MB.toast('Yozilmoqda...');
  }catch(err){ rec=null; MB.toast('Yozishni boshlab bo\'lmadi'); }
};
MB.onPlayEnd.push(function(){ if(rec){ setTimeout(finishRec,300); } });

/* ---- 3D export ---- */
function withCleanScene(fn){
  var hid=[];
  function hide(o,key,v){ hid.push([o,key,o[key]]); o[key]=v; }
  hide(MB.grid,'visible',false); hide(MB.floor,'visible',false); hide(MB.tc,'visible',false); hide(MB.edit.pivot,'visible',false);
  var names=[];
  MB.nodes.forEach(function(o){
    names.push([o,o.name]); o.name='n'+o.userData.id;
    if(o.userData.kind==='bone'&&o.userData.vis) hide(o.userData.vis,'visible',false);
    if(o.userData.kind==='emitter') hide(o,'visible',false);
    if(o.userData.kind==='light'){ hide(o,'isMesh',false); o.children.forEach(function(c){ if(c.isLine) hide(c,'visible',false); }); }
  });
  var done=function(){ hid.forEach(function(h){ h[0][h[1]]=h[2]; }); names.forEach(function(n){ n[0].name=n[1]; }); };
  try{ return fn(done); }catch(e){ done(); throw e; }
}
function clipFromKeys(){
  var tracks=[],fps=A.fps,n=Math.round(A.dur*fps)+1;
  MB.nodes.forEach(function(o){
    var kf=o.userData.kf; if(!kf||!kf.length||o.userData.kind==='emitter') return;
    var times=new Float32Array(n),P=new Float32Array(n*3),Q=new Float32Array(n*4),S=new Float32Array(n*3),qq=new THREE.Quaternion(),e=new THREE.Euler();
    for(var i=0;i<n;i++){
      var t=Math.min(i/fps,A.dur),k=MB.evalKf(kf,t); times[i]=i/fps;
      P.set(k.p,i*3); S.set(k.s,i*3); e.set(k.q[0],k.q[1],k.q[2]); qq.setFromEuler(e); Q[i*4]=qq.x;Q[i*4+1]=qq.y;Q[i*4+2]=qq.z;Q[i*4+3]=qq.w;
    }
    var nm='n'+o.userData.id;
    tracks.push(new THREE.VectorKeyframeTrack(nm+'.position',times,P),new THREE.QuaternionKeyframeTrack(nm+'.quaternion',times,Q),new THREE.VectorKeyframeTrack(nm+'.scale',times,S));
  });
  return tracks.length?[new THREE.AnimationClip('multfilm',A.dur,tracks)]:[];
}
$('oGlb').onclick=function(){
  if(typeof THREE.GLTFExporter==='undefined'){ MB.toast('GLB eksport kutubxonasi yo\'q'); return; }
  try{
    withCleanScene(function(done){
      new THREE.GLTFExporter().parse(scene,function(buf){
        done(); MB.saveBlob('sahna.glb',new Blob([buf],{type:'model/gltf-binary'}));
      },{binary:true,onlyVisible:true,animations:clipFromKeys()});
    });
  }catch(e){ MB.toast('GLB eksport xatosi'); }
};
$('oObj').onclick=function(){
  if(typeof THREE.OBJExporter==='undefined'){ MB.toast('OBJ eksport kutubxonasi yo\'q'); return; }
  try{
    withCleanScene(function(done){
      var txt=new THREE.OBJExporter().parse(scene); done(); MB.saveBlob('sahna.obj',new Blob([txt],{type:'text/plain'}));
    });
  }catch(e){ MB.toast('OBJ eksport xatosi'); }
};

/* ---- project file ---- */
$('oProj').onclick=function(){ MB.saveBlob('loyiha.json',new Blob([JSON.stringify(MB.snapshot())],{type:'application/json'})); };
$('oImport').onchange=function(e){
  var f=e.target.files[0]; if(!f) return; var r=new FileReader();
  r.onload=function(){ try{ MB.restore(JSON.parse(r.result)); MB.resetHistory(); MB.toast('Loyiha ochildi'); }catch(err){ MB.toast('Fayl noto\'g\'ri'); } };
  r.readAsText(f); e.target.value='';
};
})();
