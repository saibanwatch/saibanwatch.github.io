(function(){
  const URLS={
    pop:"https://russiaexternalknew.com/ac/1e/30/ac1e30d805d65e2a32c9978d7da110fe.js",
    social:"https://russiaexternalknew.com/ca/8a/a4/ca8aa4ec7d60266f7c7946ba0631d25d.js",
    native:"https://russiaexternalknew.com/1a50bd570cfd32a280aac3492e7d79f0/invoke.js",
    b320:"https://russiaexternalknew.com/aea811e778232e50498289a28b159e9a/invoke.js",
    b728:"https://russiaexternalknew.com/5df77f06b532d3675c44bf339709317b/invoke.js",
    b300:"https://russiaexternalknew.com/72a155966dba78f79171a4b893ed5ae2/invoke.js"
  };

  let lastEligibility=null;

  function appendScript(parent,src,attrs={}){
    const s=document.createElement("script");
    s.src=src;
    Object.entries(attrs).forEach(([k,v])=>s.setAttribute(k,v));
    parent.appendChild(s);
    return s;
  }

  function clearSlot(id){
    const el=document.getElementById(id);
    if(el)el.innerHTML="";
    return el;
  }

  function bannerFrame(key,width,height,src){
    const f=document.createElement("iframe");
    f.width=String(width);
    f.height=String(height);
    f.setAttribute("scrolling","no");
    f.setAttribute("frameborder","0");
    f.style.border="0";
    f.style.display="block";
    f.style.margin="0 auto";
    f.srcdoc='<!doctype html><html><body style="margin:0;overflow:hidden"><script>atOptions={\'key\':\''+key+'\',\'format\':\'iframe\',\'height\':'+height+',\'width\':'+width+',\'params\':{}};<\/script><script src="'+src+'"><\/script></body></html>';
    return f;
  }

  function loadBanner(slotId,kind){
    const el=clearSlot(slotId); if(!el)return;
    if(kind==="300")el.appendChild(bannerFrame("72a155966dba78f79171a4b893ed5ae2",300,250,URLS.b300));
    else if(kind==="responsive"){
      if(window.matchMedia("(max-width:620px)").matches){
        el.appendChild(bannerFrame("aea811e778232e50498289a28b159e9a",320,50,URLS.b320));
      }else{
        el.appendChild(bannerFrame("5df77f06b532d3675c44bf339709317b",728,90,URLS.b728));
      }
    }
  }

  function loadNative(slotId){
    const el=clearSlot(slotId); if(!el)return;
    const container=document.createElement("div");
    container.id="container-1a50bd570cfd32a280aac3492e7d79f0";
    el.appendChild(container);
    appendScript(el,URLS.native,{"async":"async","data-cfasync":"false"});
  }

  function setAdElementsVisible(show){
    document.querySelectorAll("[data-ad-slot], .smartlink-ad").forEach(el=>{
      el.style.display=show?"":"none";
    });
  }

  async function allowed(sb){
    try{
      const {data:{session}}=await sb.auth.getSession();
      if(!session)return true;
      const {data,error}=await sb.rpc("should_show_ads");
      if(error)return true;
      return data!==false;
    }catch{
      return true;
    }
  }

  const MOBILE_POP_STORAGE_KEY="courtwatch_mobile_pop_engagement";
  const MOBILE_POP_MIN_INTERACTIONS=3;
  const MOBILE_POP_DELAY_MS=60*1000;
  let popLoaded=false;
  let mobilePopTimer=null;

  function isMobileLike(){
    return window.matchMedia("(max-width:820px)").matches;
  }

  function loadPop(reason){
    if(popLoaded)return;
    popLoaded=true;
    if(mobilePopTimer){
      clearTimeout(mobilePopTimer);
      mobilePopTimer=null;
    }
    appendScript(document.head,URLS.pop);
    try{window.COURTWATCH_ANALYTICS?.track?.("ad_pop_load",reason||"unknown");}catch{}
  }

  function readMobilePopState(){
    const fallback={firstSeen:Date.now(),interactions:0};
    try{
      const parsed=JSON.parse(sessionStorage.getItem(MOBILE_POP_STORAGE_KEY)||"null");
      if(!parsed||typeof parsed!=="object")return fallback;
      return {
        firstSeen:Number(parsed.firstSeen)||fallback.firstSeen,
        interactions:Number(parsed.interactions)||0
      };
    }catch{
      return fallback;
    }
  }

  function writeMobilePopState(state){
    try{sessionStorage.setItem(MOBILE_POP_STORAGE_KEY,JSON.stringify(state));}catch{}
  }

  // Mobile visitors get a clean landing experience. Keep Popunder monetization,
  // but only arm it after meaningful engagement or one minute on site.
  function scheduleMobilePop(){
    const state=readMobilePopState();
    writeMobilePopState(state);

    const elapsed=Math.max(0,Date.now()-state.firstSeen);
    if(state.interactions>=MOBILE_POP_MIN_INTERACTIONS||elapsed>=MOBILE_POP_DELAY_MS){
      loadPop(state.interactions>=MOBILE_POP_MIN_INTERACTIONS?"mobile_engaged":"mobile_delayed");
      return;
    }

    const onInteraction=()=>{
      const next=readMobilePopState();
      next.interactions=(next.interactions||0)+1;
      writeMobilePopState(next);
      if(next.interactions>=MOBILE_POP_MIN_INTERACTIONS){
        document.removeEventListener("click",onInteraction,true);
        loadPop("mobile_engaged");
      }
    };
    document.addEventListener("click",onInteraction,true);

    mobilePopTimer=setTimeout(()=>{
      document.removeEventListener("click",onInteraction,true);
      loadPop("mobile_delayed");
    },Math.max(0,MOBILE_POP_DELAY_MS-elapsed));
  }

  function loadAll(){
    if(isMobileLike())scheduleMobilePop();
    else loadPop("desktop_immediate");

    // Keep display/native inventory unchanged so monetization shifts toward
    // in-page ads instead of interrupting the first mobile interaction.
    loadBanner("adSidebarPrimary","300");
    loadBanner("adIndexResponsive","responsive");
    loadBanner("adCaseInline","responsive");
    loadBanner("adPersonInline","responsive");
    loadNative("adIndexInline");
    loadNative("adCaseBottom");
    loadNative("adPersonBottom");
    appendScript(document.body,URLS.social);
  }

  async function init(sb){
    const show=await allowed(sb);
    lastEligibility=show;
    setAdElementsVisible(show);
    if(show)loadAll();
    return show;
  }

  async function reloadIfEligibilityChanged(sb){
    const show=await allowed(sb);
    if(lastEligibility===null){lastEligibility=show;return;}
    if(show!==lastEligibility)location.reload();
  }

  window.COURTWATCH_ADS={init,reloadIfEligibilityChanged};
})();