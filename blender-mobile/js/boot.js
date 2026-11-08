(function(){
  var MB=window.MB;
  MB.start();
  if(/[?&#]edit/.test(location.hash+location.search)){ MB.buildStart(); }
  else { MB.buildDemo(); MB.startPlay(); }
  try{ window.__mbReady=true; }catch(e){}
})();
