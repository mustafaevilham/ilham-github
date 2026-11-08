/* Demo 2: "Pitsa kuryeri" - a simple 3D rebuild of a courier / crime-boss warehouse scene.
   Characters are built from primitives grouped under invisible group nodes. */
(function(){
'use strict';
var MB=window.MB,PI=Math.PI,sm=MB.sm,r3=MB.r3,DUR=12;

function tex(key,w,h,draw){
  var c=document.createElement('canvas'); c.width=w; c.height=h; draw(c.getContext('2d'),w,h);
  MB.imgStore[key]=c.toDataURL('image/png');
}
function sign(g,w,h){
  g.fillStyle='#1b222c'; g.fillRect(0,0,w,h);
  g.fillStyle='#e6a82a'; g.beginPath(); g.arc(w/2,h/2,h*0.48,0,PI*2); g.fill();
  g.strokeStyle='#8a5a10'; g.lineWidth=6; g.stroke();
  g.fillStyle='#4a2e08'; g.font='bold 34px sans-serif'; g.textAlign='center';
  g.fillText('БОЛЬШЕ',w/2,h*0.42); g.fillText('СЫРА',w/2,h*0.56); g.fillText('ЛУЧШЕ МИР',w/2,h*0.70);
}
function label(g,w,h){
  g.fillStyle='#f3f1ea'; g.fillRect(0,0,w,h); g.strokeStyle='#999'; g.lineWidth=3; g.strokeRect(2,2,w-4,h-4);
  g.fillStyle='#111'; g.font='bold 30px sans-serif'; g.textAlign='center';
  g.fillText('ЧЁРНАЯ',w/2,h*0.42); g.fillText('БУХГАЛТЕРИЯ',w/2,h*0.78);
}
function receipt(g,w,h){
  g.fillStyle='#fbfaf5'; g.fillRect(0,0,w,h); g.fillStyle='#222'; g.font='bold 22px sans-serif'; g.textAlign='left';
  g.fillText('ЗАКАЗ № 7183',14,34); g.font='18px sans-serif';
  g.fillText('2 × Четыре сыра',14,70); g.fillText('1 × Особый',14,98); g.fillText('1 × Доп. сыр',14,126); g.fillText('Хорошего вечера!',14,170);
}

MB.buildPizza=function(){
  MB.stopPlay();
  tex('img:sign',512,512,sign); tex('img:label',256,200,label); tex('img:receipt',256,200,receipt);
  var imgs={}; for(var k in MB.imgStore) imgs[k]=MB.imgStore[k];
  MB.restore({nodes:[],dur:DUR,loop:true,cam:[],imgs:imgs,
    world:{bg:0x0c1016,hemi:0.5,sun:0.35,fog:0.025,shadows:true,grid:false,floor:false}});
  MB.applyWorld(); MB.syncWorld();

  function P(parent,type,name,color,p,s,o){
    o=o||{};
    var n=MB.addNode('mesh',type,{name:name,color:color,parent:parent,p:p,metal:o.m||0,rough:o.r==null?0.75:o.r});
    n.scale.set(s[0],s[1],s[2]); if(o.q) n.rotation.set(o.q[0],o.q[1],o.q[2]);
    if(o.em){ n.material.emissive.setHex(o.em); n.material.emissiveIntensity=o.ei||0.6; }
    if(o.tx) MB.setMat(n,{tx:o.tx,tr:1});
    n.castShadow=o.cs!==false; return n;
  }
  function G(name,p,ry,parent){ var g=MB.addNode('group','group',{name:name,parent:parent,p:p}); g.rotation.y=ry||0; return g; }
  function trk(o,f,step){
    var b0=o.position.toArray(),bq=[o.rotation.x,o.rotation.y,o.rotation.z],bs=o.scale.toArray(),kf=[],n=Math.round(DUR/step);
    for(var i=0;i<=n;i++){
      var t=i*step,r=f(t)||{},dp=r.p||[0,0,0],dq=r.q||[0,0,0],ss=r.s==null?1:r.s; if(typeof ss==='number') ss=[ss,ss,ss];
      var P3=r.P||[b0[0]+dp[0],b0[1]+dp[1],b0[2]+dp[2]];
      kf.push({t:r3(t),p:P3.map(r3),q:[bq[0]+dq[0],bq[1]+dq[1],bq[2]+dq[2]].map(r3),s:[bs[0]*ss[0],bs[1]*ss[1],bs[2]*ss[2]].map(r3),e:'lin'});
    }
    o.userData.kf=kf;
  }
  function pulse(a,b,c,d,t){ return sm(a,b,t)*(1-sm(c,d,t)); }

  /* ---------- warehouse ---------- */
  var ground=P(null,'plane','Pol',0x2a2e38,[0,0.005,0],[16,16,1],{r:0.35,m:0.25,q:[-PI/2,0,0],cs:false});
  P(null,'plane','Devor',0x1b222c,[0,4,-6.5],[16,6,1],{cs:false});
  P(null,'plane','Lavha',0x8a8a8a,[0.8,4.1,-6.3],[2.6,2.6,1],{r:1,tx:'img:sign',cs:false,em:0xffffff,ei:0.0});
  [[-5.6,-5],[ -3.9,-5],[4.2,-5],[5.9,-5],[-6.2,-2.5],[6.6,-2.8]].forEach(function(p,i){
    P(null,'cube','Javon '+(i+1),0x232a36,[p[0],1.4,p[1]],[1.5,0.1,1.3]);
    P(null,'cube','Javon '+(i+1)+'b',0x232a36,[p[0],2.6,p[1]],[1.5,0.1,1.3]);
    for(var k=0;k<2;k++) for(var j=0;j<2;j++)
      P(null,'cylinder','Pishloq',0xe0a93b,[p[0]-0.35+k*0.7,1.65+j*1.2,p[1]],[0.6,0.4,0.6],{r:0.6});
  });
  [[-3,-3.5],[3.6,-3.8],[-1.8,-4.6]].forEach(function(p,i){
    P(null,'cylinder','Bochka '+(i+1),0xa83a2a,[p[0],0.55,p[1]],[0.7,1.1,0.7],{m:0.3,r:0.5});
    P(null,'cylinder','Quti pishloq',0xe0a93b,[p[0]+1.0,0.3,p[1]+0.4],[0.8,0.45,0.8],{r:0.6});
  });

  /* lighting: warm overhead lamp */
  var lamp=MB.addNode('light','point',{name:'Lampa',p:[0.4,4.6,1.2]}); MB.applyLight(lamp,{c:0xffc87a,i:1.7,d:16,a:0.6,sh:1});
  var rim=MB.addNode('light','point',{name:'Sovuq nur',p:[-4,3,3]}); MB.applyLight(rim,{c:0x6fa0ff,i:0.7,d:14,a:0.6,sh:0});

  /* ---------- table + briefcase ---------- */
  P(null,'cube','Stol usti',0x5a4632,[1.0,0.5,0],[0.9,0.1,1.5],{r:0.8});
  [[0.7,-0.6],[1.3,-0.6],[0.7,0.6],[1.3,0.6]].forEach(function(p,i){ P(null,'cylinder','Stol oyoq '+i,0x4a3a28,[p[0],0.25,p[1]],[0.08,0.5,0.08]); });
  P(null,'cube','Chemodan',0x15151a,[1.05,0.62,0.5],[0.5,0.14,0.36],{r:0.5});
  P(null,'cube','Chemodan qopqoq',0x15151a,[1.22,0.8,0.5],[0.04,0.4,0.36],{r:0.5,q:[0,0,0.25]});
  for(var c=0;c<3;c++) P(null,'cube','Pul '+c,0x4f8a4f,[0.95+c*0.1,0.72,0.5],[0.09,0.04,0.3],{r:0.9});

  /* ---------- raccoon courier ---------- */
  var R=G('Yenot',[-1.4,0,0],PI/2);
  P(R,'cylinder','Yenot tana',0xa32a2a,[0,0.95,0],[0.75,1.0,0.55]);
  P(R,'cylinder','Yenot oyoq 1',0x2b2b33,[-0.2,0.32,0],[0.26,0.65,0.26]); P(R,'cylinder','Yenot oyoq 2',0x2b2b33,[0.2,0.32,0],[0.26,0.65,0.26]);
  var Hd=G('Yenot bosh',[0,1.75,0.05],0,R);
  P(Hd,'sphere','Bosh',0x8c8c92,[0,0,0],[0.78,0.66,0.72]);
  P(Hd,'sphere','Niqob',0x1c1c1c,[0,0.04,0.28],[0.66,0.24,0.22]);
  var eyeL=P(Hd,'sphere','Ko\'z 1',0xffffff,[-0.17,0.06,0.38],[0.15,0.15,0.1],{r:0.3}),eyeR=P(Hd,'sphere','Ko\'z 2',0xffffff,[0.17,0.06,0.38],[0.15,0.15,0.1],{r:0.3});
  P(Hd,'sphere','Qorachiq 1',0x050505,[-0.17,0.06,0.44],[0.07,0.07,0.05]); P(Hd,'sphere','Qorachiq 2',0x050505,[0.17,0.06,0.44],[0.07,0.07,0.05]);
  P(Hd,'sphere','Burun',0x050505,[0,-0.1,0.5],[0.1,0.08,0.08]);
  P(Hd,'cone','Quloq 1',0x8c8c92,[-0.28,0.4,-0.02],[0.2,0.26,0.16]); P(Hd,'cone','Quloq 2',0x8c8c92,[0.28,0.4,-0.02],[0.2,0.26,0.16]);
  var tail=G('Dum',[0,0.55,-0.3],0,R);
  [0x8c8c92,0x1c1c1c,0x8c8c92,0x1c1c1c].forEach(function(col,i){ P(tail,'sphere','Dum '+i,col,[0,0.05*i,-0.2-i*0.25],[0.22,0.22,0.3]); });
  var RA1=G('Yenot qo\'l 1',[-0.45,1.35,0.1],0,R),RA2=G('Yenot qo\'l 2',[0.45,1.35,0.1],0,R);
  [RA1,RA2].forEach(function(a){ P(a,'cylinder','Qo\'l',0xa32a2a,[0,-0.35,0],[0.2,0.7,0.2]); P(a,'sphere','Qo\'lqop',0x1a1a1a,[0,-0.74,0],[0.2,0.2,0.2]); });

  function RX(t){ return -1.4+0.7*sm(2.4,3.4,t)-1.2*sm(9.8,10.8,t); }
  trk(R,function(t){ return {P:[RX(t),0.025*Math.sin(t*5),0]}; },0.1);
  trk(Hd,function(t){ var sh=pulse(7,7.4,8.8,9.4,t); return {q:[-0.18*sh,0,0.05*Math.sin(t*3)],s:1+0.1*sh}; },0.1);
  trk(eyeL,function(t){ var sh=pulse(7,7.4,8.8,9.4,t); return {s:1+0.7*sh}; },0.1);
  trk(eyeR,function(t){ var sh=pulse(7,7.4,8.8,9.4,t); return {s:1+0.7*sh}; },0.1);
  trk(tail,function(t){ return {q:[0.3,0.35*Math.sin(t*3),0]}; },0.1);
  function armAng(t){ return -(1.05+0.35*sm(2.4,3.4,t))+1.0*sm(10.3,11,t); }
  trk(RA1,function(t){ return {q:[armAng(t),0,0]}; },0.1); trk(RA2,function(t){ return {q:[armAng(t),0,0]}; },0.1);

  /* ---------- pizza box (+ receipt + floppy) ---------- */
  function BX(t){ return RX(Math.min(t,10.3))+0.9; }
  function BY(t){ return 1.1-1.03*sm(10.3,10.9,t); }
  var B=G('Pitsa qutisi',[-0.5,1.1,0],0);
  P(B,'cube','Quti',0xc9a36b,[0,0,0],[0.92,0.12,0.92],{r:0.9});
  P(B,'cylinder','Quti belgi',0xc0392b,[0,0.065,0],[0.6,0.012,0.6],{r:0.9});
  trk(B,function(t){ return {P:[BX(t),BY(t),0],q:[0,0,0.35*sm(10.3,10.9,t)]}; },0.1);
  var rc=P(null,'plane','Chek',0xffffff,[0,0,0.1],[0.34,0.26,1],{r:1,q:[-PI/2,0,0],tx:'img:receipt',cs:false});
  rc.material.side=THREE.DoubleSide;
  trk(rc,function(t){
    var u=sm(4.4,5.4,t),flut=Math.sin(t*14)*0.25*u;
    return {P:[BX(t)+0.15+0.5*u,BY(t)+0.075+1.0*u,0.1+0.7*u],q:[1.2*u+flut,0.8*u,0.3*u],s:1-sm(5.3,5.8,t)};
  },0.05);
  var F=G('Disk',[0,0,0],0);
  P(F,'cube','Disk tana',0x1a1a1f,[0,0,0],[0.5,0.035,0.5],{r:0.5});
  P(F,'cube','Disk temir',0x9a9aa0,[0,0.002,-0.17],[0.26,0.04,0.15],{m:0.8,r:0.3});
  var fl=P(F,'plane','Disk yorlig\'i',0xffffff,[0,0.022,0.1],[0.32,0.24,1],{r:0.8,q:[-PI/2,0,0],tx:'img:label',cs:false});
  trk(F,function(t){
    var u=sm(5.0,5.9,t);
    return {P:[BX(t),BY(t)+0.1+0.7*u,0.05+0.3*u],q:[0.9*u,6.28*u*2,0],s:Math.max(0.001,1.7*u)};
  },0.05);

  /* ---------- rat boss ---------- */
  var U=G('Kalamush',[1.55,0,0],-PI/2);
  P(U,'cylinder','Kalamush tana',0xe9e6df,[0,0.9,0],[0.8,0.95,0.55]);
  P(U,'cube','Kalamush ko\'ylak',0x25252e,[0,1.05,0.28],[0.25,0.5,0.03]);
  var Uh=G('Kalamush bosh',[0,1.62,0.05],0,U);
  P(Uh,'sphere','Bosh',0x8f8f95,[0,0,0],[0.66,0.6,0.7]);
  P(Uh,'cone','Tumshuq',0x8f8f95,[0,-0.05,0.5],[0.3,0.55,0.3],{q:[PI/2,0,0]});
  P(Uh,'sphere','Burun',0xd98a95,[0,-0.04,0.78],[0.1,0.09,0.09]);
  P(Uh,'sphere','Quloq 1',0xd98a95,[-0.32,0.38,-0.1],[0.3,0.3,0.07],{q:[0,0.4,0]}); P(Uh,'sphere','Quloq 2',0xd98a95,[0.32,0.38,-0.1],[0.3,0.3,0.07],{q:[0,-0.4,0]});
  var ueL=P(Uh,'sphere','Ko\'z 1',0xf5f0e0,[-0.2,0.1,0.32],[0.13,0.13,0.08],{r:0.3}),ueR=P(Uh,'sphere','Ko\'z 2',0xf5f0e0,[0.2,0.1,0.32],[0.13,0.13,0.08],{r:0.3});
  P(Uh,'sphere','Qorachiq 1',0x050505,[-0.2,0.1,0.37],[0.06,0.06,0.05]); P(Uh,'sphere','Qorachiq 2',0x050505,[0.2,0.1,0.37],[0.06,0.06,0.05]);
  P(Uh,'cube','Qosh 1',0x2a2a2a,[-0.2,0.24,0.33],[0.22,0.05,0.05],{q:[0,0,-0.4]}); P(Uh,'cube','Qosh 2',0x2a2a2a,[0.2,0.24,0.33],[0.22,0.05,0.05],{q:[0,0,0.4]});
  var utail=G('Kalamush dum',[0,0.5,-0.3],0,U);
  for(var i=0;i<5;i++) P(utail,'sphere','Dum '+i,0xd98a95,[0,0.04*i,-0.25-i*0.25],[0.1,0.1,0.28]);
  var UA=G('Kalamush qo\'l',[-0.42,1.3,0.1],0,U); P(UA,'cylinder','Qo\'l',0xe9e6df,[0,-0.3,0],[0.18,0.6,0.18]); P(UA,'sphere','Kaft',0x8f8f95,[0,-0.64,0],[0.17,0.17,0.17]);
  P(UA,'torus','Uzuk',0xd4a017,[0,-0.62,0],[0.2,0.2,0.2],{m:0.8,r:0.3,q:[PI/2,0,0]});
  var UA2=G('Kalamush qo\'l 2',[0.42,1.3,0.1],0,U); P(UA2,'cylinder','Qo\'l',0xe9e6df,[0,-0.3,0],[0.18,0.6,0.18]); P(UA2,'sphere','Kaft',0x8f8f95,[0,-0.64,0],[0.17,0.17,0.17]);
  trk(U,function(t){ return {P:[1.55-0.25*pulse(3.4,4.2,6.6,7.2,t),0.25*sm(9.5,10,t),0]}; },0.1);
  trk(Uh,function(t){ var an=sm(7,7.6,t)*(1-sm(9.8,10.2,t)); return {q:[0,0,0.18*an]}; },0.1);
  trk(ueL,function(t){ return {s:[1,1-0.5*pulse(7,7.5,9.0,9.6,t),1]}; },0.1); trk(ueR,function(t){ return {s:[1,1-0.5*pulse(7,7.5,9.0,9.6,t),1]}; },0.1);
  trk(utail,function(t){ return {q:[0.2,0.3*Math.sin(t*4),0]}; },0.1);
  trk(UA,function(t){ return {q:[-1.45*pulse(3.4,4.1,5.6,6.2,t)-1.75*pulse(9.6,10.1,11.4,11.9,t),0,0]}; },0.1);

  /* ---------- rhino bodyguard ---------- */
  var H=G('Karkidon',[3.4,0,-2.0],-PI/2);
  P(H,'cube','Karkidon tana',0x15151b,[0,1.1,0],[1.0,1.6,0.65]);
  P(H,'cube','Karkidon ko\'ylak',0xe8e8e8,[0,1.45,0.33],[0.22,0.5,0.03]); P(H,'cube','Galstuk',0x050505,[0,1.35,0.345],[0.08,0.5,0.03]);
  P(H,'cylinder','Karkidon oyoq 1',0x0e0e12,[-0.25,0.3,0],[0.35,0.6,0.35]); P(H,'cylinder','Karkidon oyoq 2',0x0e0e12,[0.25,0.3,0],[0.35,0.6,0.35]);
  var Hh=G('Karkidon bosh',[0,2.1,0.05],0,H);
  P(Hh,'sphere','Bosh',0x77777c,[0,0,0],[0.82,0.8,0.9]);
  P(Hh,'cone','Shox',0xe8dcc0,[0,0.02,0.52],[0.16,0.45,0.16],{q:[1.0,0,0]});
  P(Hh,'cone','Quloq 1',0x77777c,[-0.34,0.4,-0.05],[0.18,0.22,0.12]); P(Hh,'cone','Quloq 2',0x77777c,[0.34,0.4,-0.05],[0.18,0.22,0.12]);
  P(Hh,'sphere','Ko\'z 1',0x050505,[-0.25,0.12,0.4],[0.08,0.08,0.06]); P(Hh,'sphere','Ko\'z 2',0x050505,[0.25,0.12,0.4],[0.08,0.08,0.06]);
  P(H,'cylinder','Karkidon qo\'l 1',0x15151b,[-0.62,1.1,0],[0.24,0.9,0.24]); P(H,'cylinder','Karkidon qo\'l 2',0x15151b,[0.62,1.1,0],[0.24,0.9,0.24]);
  trk(H,function(t){ var u=sm(9.6,11.2,t); return {P:[3.4-1.0*u,0.05*Math.abs(Math.sin((t-9.6)*PI*1.5))*sm(9.6,9.8,t)*(1-sm(11,11.2,t)),-2.0+1.1*u]}; },0.1);
  trk(Hh,function(t){ return {q:[0,0.15*Math.sin(t*1.2),0]}; },0.1);

  /* ---------- camera cuts ---------- */
  MB.camKeys=[
    {t:0,p:[0.6,2.1,6.4],g:[0.3,1.25,0],f:55,e:'lin'},{t:3.4,p:[0.4,1.9,5.4],g:[0.3,1.25,0],f:55,e:'step'},
    {t:3.5,p:[0.9,2.5,3.4],g:[0.3,1.15,0],f:42,e:'lin'},{t:6.9,p:[0.7,2.4,3.0],g:[0.3,1.3,0],f:42,e:'step'},
    {t:7.0,p:[0.2,1.9,3.8],g:[0.2,1.7,0],f:50,e:'lin'},{t:9.4,p:[0.2,1.85,3.3],g:[0.2,1.7,0],f:50,e:'step'},
    {t:9.5,p:[0.8,2.4,6.6],g:[0.6,1.3,-0.4],f:56,e:'lin'},{t:12,p:[0.5,2.1,5.6],g:[0.6,1.3,-0.5],f:56,e:'lin'}];
  MB.anim.dur=DUR; MB.anim.loop=true;
  MB.select(null); MB.resetHistory(); MB.anim.sync(); MB.setTime(0);
};
})();
