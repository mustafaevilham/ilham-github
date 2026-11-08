/* Demo: 60-second cartoon built with the same node + keyframe API the editor uses. */
(function(){
'use strict';
var MB=window.MB,A=MB.anim,PI=Math.PI,sm=MB.sm,r3=MB.r3;
function fr(x){return x-Math.floor(x)}
function hop(v,h){return h*4*v*(1-v)}
function track(o,fn,step){
  var kf=[],n=Math.round(A.dur/step);
  for(var i=0;i<=n;i++){ var t=i*step,k=fn(t); kf.push({t:r3(t),p:k[0].map(r3),q:k[1].map(r3),s:k[2].map(r3),e:'lin'}); }
  o.userData.kf=kf;
}
MB.buildDemo=function(){
  MB.stopPlay();
  MB.restore({nodes:[],dur:60,cam:[],world:{bg:0x8fd0f0,hemi:0.85,sun:0.9,fog:0,shadows:true,grid:false,floor:false}});
  MB.applyWorld(); MB.syncWorld();
  var ground=MB.addNode('mesh','plane',{name:'Yer',color:0x5fae5a,metal:0,rough:1}); ground.rotation.x=-PI/2; ground.position.y=0.005; ground.scale.set(14,14,1);

  var ball=MB.addNode('mesh','sphere',{name:'Shar',color:0xe5604d,metal:0.2,rough:0.35});
  track(ball,function(t){
    var x,z=0,v,h,sc=1;
    if(t<12){x=-5+5*t/12;v=fr(5*t/12);h=2;}
    else if(t<24){var u=(t-12)/12;x=-3*u;v=fr(4*u);h=0.6;}
    else if(t<38){var w=t<31?(t-24)/7:(t-31)/7;x=t<31?-3+6*w:3-6*w;v=w;h=1.7;}
    else if(t<52){var th=PI+(t-38)/14*4*PI;x=3*Math.cos(th);z=3*Math.sin(th);v=fr(t-38);h=0.8;}
    else{x=-3*(1-sm(52,58,t));v=0;h=0;sc=1+1.2*sm(52,60,t);}
    var k=0.22*Math.pow(1-4*v*(1-v),8);
    return [[x,0.5*sc*(1-k)+hop(v,h),z],[0,0,0],[sc*(1+k),sc*(1-k),sc*(1+k)]];
  },0.1);

  var cube=MB.addNode('mesh','cube',{name:'Kub',color:0x4a90d9,metal:0.1,rough:0.5});
  track(cube,function(t){
    var x=8,z=0,y=0.5,ry=0,s=sm(12,13,t);
    if(t>=12&&t<24){var u=sm(12,18,t);x=8-5.5*u;ry=4*PI*u;}
    if(t>=18&&t<24){x=2.5;ry=4*PI;}
    if(t>=24&&t<38){x=2.5;ry=4*PI+(t-24)*1.5;y=0.5+0.35*Math.abs(Math.sin(PI*(t-24)));}
    else if(t>=38){var f=t<52?(t-38)/14*4*PI:4*PI;x=2.5*Math.cos(f);z=2.5*Math.sin(f);ry=4*PI+21+(Math.min(t,52)-38)*3;
      y=t<52?0.5+0.4*Math.abs(Math.sin(2*PI*(t-38))):0.5;s=1-sm(52,58,t);}
    return [[x,y,z],[0,ry,0],[s,s,s]];
  },0.1);

  var ring=MB.addNode('mesh','torus',{name:'Halqa',color:0xa77bd8,metal:0.3,rough:0.4});
  track(ring,function(t){
    var p=[8,6,0],s=0,ry=PI/2;
    if(t>=24&&t<27){var u=sm(24,27,t);p=[8-8*u,6-3.8*u,0];s=3.5*sm(24,26,t);}
    else if(t>=27&&t<38){p=[0,2.2,0];s=3.5*(1+0.04*Math.sin(3*(t-27)));}
    else if(t>=38){var e=sm(38,42,t);p=[0,2.2+1.8*e,0];ry=PI/2+(Math.min(t,52)-38)*1.2;s=3.5*(1-0.4*e)*(1-sm(52,58,t));}
    return [p,[0,ry,0],[s,s,s]];
  },0.25);

  [[-4,-3.5],[3.5,-3.5],[6,-2]].forEach(function(pos,i){
    var trunk=MB.addNode('mesh','cylinder',{name:'Tana '+(i+1),color:0x8a5a3a,metal:0,rough:0.9});
    var cone=MB.addNode('mesh','cone',{name:'Daraxt '+(i+1),color:0x2f8f4e,metal:0,rough:0.8});
    function g(t){return sm(2*i,2*i+6,t);}
    function sway(t){return t>38?0.06*Math.sin(2*(t-38))*sm(38,40,t):0;}
    track(trunk,function(t){var q=g(t);return [[pos[0],0.5*q,pos[1]],[0,0,0],[0.3*q,q,0.3*q]];},0.5);
    track(cone,function(t){var q=g(t);return [[pos[0],2*q,pos[1]],[0,0,sway(t)],[1.6*q,2*q,1.6*q]];},0.25);
  });

  var sun=MB.addNode('mesh','sphere',{name:'Quyosh',color:0xffd54a,metal:0,rough:1});
  sun.material.emissive.setHex(0xffb300); sun.material.emissiveIntensity=0.8; sun.castShadow=false;
  track(sun,function(t){var s=1.6+0.15*Math.sin(t*1.5);return [[6,6.5,-8],[0,0,0],[s,s,s]];},0.5);

  var conf=MB.addNode('emitter','emitter',{em:MB.EMITTER_PRESETS.konfeti,name:'Konfeti',p:[0,0.3,0]});
  conf.userData.em.t0=52; conf.userData.em.n=240;
  MB.rebuildEmitter(conf);

  MB.camKeys=[
    {t:0,p:[1,3.5,11],g:[-2,1,0],f:50,e:'io'},{t:12,p:[4,4,10],g:[0,1,0],f:50,e:'io'},{t:24,p:[7,3.5,7],g:[0,1.5,0],f:50,e:'io'},
    {t:38,p:[0,5,9],g:[0,1.5,0],f:50,e:'io'},{t:52,p:[-6,5,8],g:[0,1.5,0],f:50,e:'io'},{t:60,p:[0,3,6],g:[0,1,0],f:50,e:'io'}];
  MB.select(null); MB.resetHistory(); MB.anim.sync(); MB.setTime(0);
};

MB.buildStart=function(){
  var a=MB.addNode('mesh','cube',{name:'Kub',color:0x4a90d9,p:[-1.4,0.5,0]});
  var b=MB.addNode('mesh','sphere',{name:'Shar',color:0xe5604d,metal:0.2,rough:0.35,p:[0.2,0.5,0.4]});
  var c=MB.addNode('mesh','cone',{name:'Konus',color:0xe8b84a,p:[1.7,0.5,-0.3]});
  MB.select(null); MB.resetHistory(); MB.anim.sync();
};
})();
