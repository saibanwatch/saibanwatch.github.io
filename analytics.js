(()=>{"use strict";
if(navigator.globalPrivacyControl===true||navigator.doNotTrack==="1"||window.doNotTrack==="1")return;
if(/bot|crawler|spider|slurp|bingpreview|facebookexternalhit|whatsapp|telegrambot|discordbot|headless/i.test(navigator.userAgent||""))return;
const endpoint="https://czhssdmwilnbrexqmtqg.supabase.co/rest/v1/rpc/log_page_view_v2";
const key="sb_publishable_HhXl8I3L4z-UF168b6wSiQ_WrQXa1Uc";
function swUuid(){
  if(globalThis.crypto&&typeof crypto.randomUUID==="function")return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g,c=>{const r=Math.random()*16|0,v=c==="x"?r:(r&3|8);return v.toString(16)});
}
function swStored(storage,key){
  try{let v=storage.getItem(key);if(!v){v=swUuid();storage.setItem(key,v)}return v}catch{return swUuid()}
}
const visitorId=swStored(localStorage,"sw_visitor_id");
const sessionId=swStored(sessionStorage,"sw_session_id");
const funnelEndpoint="https://czhssdmwilnbrexqmtqg.supabase.co/rest/v1/rpc/log_funnel_event";
function track(eventName,eventDetail){
  fetch(funnelEndpoint,{
    method:"POST",
    mode:"cors",
    keepalive:true,
    credentials:"omit",
    headers:{"apikey":key,"Authorization":"Bearer "+key,"Content-Type":"application/json","Prefer":"return=minimal"},
    body:JSON.stringify({p_event_name:eventName,p_event_detail:eventDetail||null,p_path:(location.pathname||"/").slice(0,300),p_visitor_id:visitorId,p_session_id:sessionId})
  }).catch(()=>{});
}
window.COURTWATCH_ANALYTICS={track};
function classify(){
  const path=location.pathname||"/";
  let type="static",entity=null;
  let m;
  if(path==="/"||/\/index\.html$/.test(path)){type="home";}
  else if((m=path.match(/\/cases\/([^/]+)\.html$/))){type="case";try{entity=decodeURIComponent(m[1])}catch{entity=m[1]}}
  else if((m=path.match(/\/people\/([^/]+)\.html$/))){type="person";try{entity=decodeURIComponent(m[1])}catch{entity=m[1]}}
  else if(/\/case\.html$/.test(path)){type="interactive_case";const q=new URLSearchParams(location.search);entity=q.get("slug")||q.get("id")}
  else if(/\/person\.html$/.test(path)){type="interactive_person";const q=new URLSearchParams(location.search);entity=q.get("id")||q.get("mention")}
  else if(/\/(criminal|civil|administrative|acquittals|sentencing|people)\.html$/.test(path)){type="archive";entity=RegExp.$1}
  return {type,entity,path:path.slice(0,300)};
}
function referrer(){
  if(!document.referrer)return "direct";
  try{
    const u=new URL(document.referrer);
    if(u.hostname===location.hostname)return "internal";
    return u.hostname.replace(/^www\./,"").toLowerCase().slice(0,200)||"direct";
  }catch{return "direct"}
}
function send(){
  const v=classify();
  fetch(endpoint,{
    method:"POST",
    mode:"cors",
    keepalive:true,
    credentials:"omit",
    headers:{"apikey":key,"Authorization":"Bearer "+key,"Content-Type":"application/json","Prefer":"return=minimal"},
    body:JSON.stringify({p_page_type:v.type,p_entity_key:v.entity,p_path:v.path,p_referrer_host:referrer(),p_visitor_id:visitorId,p_session_id:sessionId})
  }).catch(()=>{});
}
if(document.prerendering){document.addEventListener("prerenderingchange",send,{once:true});}
else if(document.readyState==="complete")setTimeout(send,0);
else window.addEventListener("load",()=>setTimeout(send,0),{once:true});
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