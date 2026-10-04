(()=>{"use strict";
if(navigator.globalPrivacyControl===true||navigator.doNotTrack==="1"||window.doNotTrack==="1")return;
if(/bot|crawler|spider|slurp|bingpreview|facebookexternalhit|whatsapp|telegrambot|discordbot|headless/i.test(navigator.userAgent||""))return;
const endpoint="https://czhssdmwilnbrexqmtqg.supabase.co/rest/v1/rpc/log_analytics_event_v1";
const key="sb_publishable_HhXl8I3L4z-UF168b6wSiQ_WrQXa1Uc";
const SESSION_MS=30*60*1000;
function swUuid(){
  if(globalThis.crypto&&typeof crypto.randomUUID==="function")return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g,c=>{const r=Math.random()*16|0,v=c==="x"?r:(r&3|8);return v.toString(16)});
}
function readStore(storage,k){try{return storage.getItem(k)}catch{return null}}
function writeStore(storage,k,v){try{storage.setItem(k,v)}catch{}}
function visitor(){
  let v=readStore(localStorage,"sw_visitor_id");
  if(!v){v=swUuid();writeStore(localStorage,"sw_visitor_id",v)}
  return v;
}
function session(){
  const now=Date.now();let s=null;
  try{s=JSON.parse(readStore(localStorage,"sw_session_v1")||"null")}catch{}
  if(!s||!s.id||!s.last||now-s.last>SESSION_MS)s={id:swUuid(),last:now};
  else s.last=now;
  writeStore(localStorage,"sw_session_v1",JSON.stringify(s));
  return s.id;
}
const visitorId=visitor();
let sessionId=session();
function touchSession(){sessionId=session();return sessionId}
function token(v,max){
  const s=String(v||"").trim().toLowerCase().slice(0,max);
  return /^[a-z0-9._:-]+$/.test(s)?s:null;
}
function classify(){
  const path=location.pathname||"/";let type="static",entity=null,entityType=null;let m;
  if(path==="/"||/\/index\.html$/.test(path)){type="home";}
  else if((m=path.match(/\/cases\/([^/]+)\.html$/))){type="case";entityType="case";try{entity=decodeURIComponent(m[1])}catch{entity=m[1]}}
  else if((m=path.match(/\/people\/([^/]+)\.html$/))){type="person";entityType="person";try{entity=decodeURIComponent(m[1])}catch{entity=m[1]}}
  else if(/\/case\.html$/.test(path)){type="interactive_case";entityType="case";const q=new URLSearchParams(location.search);entity=q.get("slug")||q.get("id")}
  else if(/\/person\.html$/.test(path)){type="interactive_person";entityType="person";const q=new URLSearchParams(location.search);entity=q.get("id")||q.get("mention")}
  else if(/\/(all-cases|latest|criminal|civil|administrative|acquittals|sentencing|people|topics|courts|years)\.html$/.test(path)){type="archive";entity=RegExp.$1}
  else if(/\/(topics|courts|years)\//.test(path)){type="archive";entity=path.split("/").filter(Boolean)[0]||"archive"}
  return {type,entityType,entity,path:path.slice(0,300)};
}
function referrerHost(){
  if(!document.referrer)return "direct";
  try{const u=new URL(document.referrer);if(u.hostname===location.hostname)return "internal";return u.hostname.replace(/^www\./,"").toLowerCase().slice(0,200)||"direct"}catch{return "direct"}
}
function acquisition(){
  const q=new URLSearchParams(location.search),ref=referrerHost();
  const source=token(q.get("utm_source"),80)||(ref==="direct"||ref==="internal"?ref:token(ref,80));
  const medium=token(q.get("utm_medium"),80)||(ref==="direct"?"none":ref==="internal"?"internal":"referral");
  const campaign=token(q.get("utm_campaign"),100);
  return {ref,source,medium,campaign};
}
function device(){
  const ua=navigator.userAgent||"";
  if(/ipad|tablet|playbook|silk/i.test(ua)||(/android/i.test(ua)&&!/mobile/i.test(ua)))return "tablet";
  if(navigator.userAgentData&&navigator.userAgentData.mobile)return "mobile";
  if(/mobi|iphone|ipod|android/i.test(ua))return "mobile";
  return "desktop";
}
const page=classify(),acq=acquisition(),deviceType=device();
const previousPath=readStore(sessionStorage,"sw_previous_path");
const once=new Set();
function send(eventName,eventDetail,opts){
  opts=opts||{};touchSession();
  const entityType=opts.entityType===undefined?page.entityType:opts.entityType;
  const entityKey=opts.entityKey===undefined?page.entity:opts.entityKey;
  const body={
    p_event_id:swUuid(),
    p_event_name:eventName,
    p_event_detail:eventDetail||null,
    p_page_type:page.type,
    p_entity_type:entityType||null,
    p_entity_key:entityKey||null,
    p_path:page.path,
    p_referrer_host:acq.ref,
    p_traffic_source:acq.source,
    p_traffic_medium:acq.medium,
    p_campaign:acq.campaign,
    p_device_type:deviceType,
    p_visitor_id:visitorId,
    p_session_id:sessionId,
    p_previous_path:previousPath||null,
    p_duration_ms:Number.isFinite(opts.durationMs)?Math.max(0,Math.round(opts.durationMs)):null
  };
  fetch(endpoint,{
    method:"POST",mode:"cors",keepalive:true,credentials:"omit",
    headers:{"apikey":key,"Authorization":"Bearer "+key,"Content-Type":"application/json","Prefer":"return=minimal"},
    body:JSON.stringify(body)
  }).catch(()=>{});
}
function track(eventName,eventDetail,opts){send(eventName,eventDetail,opts)}
function trackOnce(eventName,eventDetail,opts){
  const k=[eventName,eventDetail||"",page.path,(opts&&opts.entityKey)||""].join("|");
  if(once.has(k))return;once.add(k);send(eventName,eventDetail,opts);
}
window.COURTWATCH_ANALYTICS={track,trackOnce,context:{visitorId,sessionId,pageType:page.type,entityType:page.entityType,entityKey:page.entity,deviceType}};
function pageView(){
  send("page_view",null);
  writeStore(sessionStorage,"sw_previous_path",page.path);
  if(page.type==="home")trackOnce("home_view","home");
  else if(page.type==="case"||page.type==="interactive_case")trackOnce("case_view",page.type);
  else if(page.type==="person"||page.type==="interactive_person")trackOnce("person_view",page.type);
  else if(page.type==="archive"){
    if(page.entity==="people")trackOnce("person_list_view","archive");
    else trackOnce("case_list_view",page.entity||"archive");
  }
}
function observeOnce(selector,eventName,detail){
  const el=document.querySelector(selector);if(!el)return;
  if(!("IntersectionObserver" in window)){trackOnce(eventName,detail);return}
  const io=new IntersectionObserver(entries=>{if(entries.some(x=>x.isIntersecting)){trackOnce(eventName,detail);io.disconnect()}},{threshold:.2});
  io.observe(el);
}
function setupAuto(){
  if(page.type==="home"){observeOnce("#cases","case_list_view","home");observeOnce("#people","person_list_view","home")}
  const promos=[...document.querySelectorAll(".signup-promo")];
  if(promos.length){
    if(!("IntersectionObserver" in window))trackOnce("campaign_view","first_post_campaign");
    else{
      const io=new IntersectionObserver(entries=>{if(entries.some(x=>x.isIntersecting)){trackOnce("campaign_view","first_post_campaign");io.disconnect()}},{threshold:.25});
      promos.forEach(x=>io.observe(x));
    }
  }
  document.addEventListener("focusin",e=>{
    const t=e.target;if(!(t instanceof HTMLElement))return;
    if(t.id==="postText"||t.id==="personPostText")trackOnce("post_start",page.entityType||"discussion");
  });
  document.addEventListener("click",e=>{
    const b=e.target&&e.target.closest?e.target.closest("button,a"):null;if(!b)return;
    const id=b.id||"";
    if(id==="signupTab")track("signup_click","signup_tab");
    if(id==="tutorialSignup"){track("campaign_cta_click","first_post_campaign");track("signup_click","tutorial")}
    if(id==="prevPage"||id==="prevPageBottom")track("pagination","prev");
    if(id==="nextPage"||id==="nextPageBottom")track("pagination","next");
    if(b.matches&&b.matches(".filter"))track("filter_use",token(b.dataset.filter,60)||"case_filter");
    if(b.closest&&b.closest("#peopleFilter"))track("filter_use",token(b.dataset.role,60)||token(b.dataset.filter,60)||"people_filter");
    const oc=(b.getAttribute&&b.getAttribute("onclick"))||"";
    if((b.matches&&b.matches(".opinion-btn,[data-vote-cta]"))||/^vote(Post)?\(/.test(oc)||/^vote\(/.test(oc)){
      const d=token((b.dataset&&((b.dataset.voteCta||b.dataset.target||"")+"_"+(b.dataset.choice||""))),80)||"vote";
      track("vote_click",d);
    }
  },true);
}
const started=performance.now();let engagementSent=false;
function engagement(){
  if(engagementSent)return;engagementSent=true;
  const ms=Math.round(performance.now()-started);
  if(ms>=1000)send("page_engagement","page",{durationMs:ms});
}
window.addEventListener("pagehide",engagement,{once:true});
if(document.prerendering)document.addEventListener("prerenderingchange",()=>{pageView();setupAuto()},{once:true});
else if(document.readyState==="complete")setTimeout(()=>{pageView();setupAuto()},0);
else window.addEventListener("load",()=>setTimeout(()=>{pageView();setupAuto()},0),{once:true});
})();
;(()=>{"use strict";
const m=(location.pathname||"").match(/\/people\/([0-9a-f-]{36})\.html$/i);
if(!m)return;
const run=async()=>{
  const head=document.querySelector(".personhead");
  if(!head||/生年月日/.test(head.textContent||""))return;
  const id=m[1],base="https://czhssdmwilnbrexqmtqg.supabase.co",key="sb_publishable_HhXl8I3L4z-UF168b6wSiQ_WrQXa1Uc";
  try{
    const r=await fetch(base+"/rest/v1/people?id=eq."+encodeURIComponent(id)+"&verification_status=eq.verified&select=birth_date,sex,overview,bio&limit=1",{headers:{apikey:key,Authorization:"Bearer "+key},credentials:"omit"});
    if(!r.ok)return;
    const row=(await r.json())[0];if(!row)return;
    const info=head.querySelector(":scope > div:last-child");if(!info)return;
    info.querySelectorAll(":scope > p").forEach(p=>p.remove());
    const sex=({male:"男性",female:"女性",other:"その他"})[row.sex]||"未確認";
    let birth="未確認";
    if(row.birth_date){const a=row.birth_date.split("-").map(Number);if(a.length===3)birth=a[0]+"年"+a[1]+"月"+a[2]+"日";}
    const overview=row.overview||row.bio||"概要は準備中です。";
    const wrap=document.createElement("div");
    wrap.setAttribute("data-person-extra","1");
    wrap.innerHTML='<div class="grid" style="margin-top:12px"><div class="info"><h3>生年月日</h3><p></p></div><div class="info"><h3>性別</h3><p></p></div></div><h3>概要</h3><p class="person-overview"></p>';
    const ps=wrap.querySelectorAll(".info p");ps[0].textContent=birth;ps[1].textContent=sex;
    wrap.querySelector(".person-overview").textContent=overview;
    info.appendChild(wrap);
  }catch{}
};
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",run,{once:true});else run();
})();