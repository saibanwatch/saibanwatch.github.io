import fs from "node:fs";
import {createHash} from "node:crypto";

const index=fs.readFileSync("index.html","utf8");
const urlMatch=index.match(/SUPABASE_URL="([^"]+)"/)||index.match(/createClient\("([^"]+)"/);
const keyMatch=index.match(/SUPABASE_KEY="([^"]+)"/)||index.match(/createClient\("[^"]+","([^"]+)"\)/);
if(!urlMatch||!keyMatch) throw new Error("Supabase public configuration not found");
const base=urlMatch[1], key=keyMatch[1];

async function fetchAll(table,query){
  const out=[];
  for(let offset=0;;offset+=1000){
    const sep=query.includes("?")?"&":"?";
    const url=base+"/rest/v1/"+table+"?"+query+"&limit=1000&offset="+offset;
    const res=await fetch(url,{headers:{apikey:key,Authorization:"Bearer "+key}});
    if(!res.ok) throw new Error(table+" fetch failed: "+res.status+" "+await res.text());
    const rows=await res.json();
    out.push(...rows);
    if(rows.length<1000) break;
  }
  return out;
}

const [
  cases, people, casePeople, summaries, caseSources, personSources
]=await Promise.all([
  fetchAll("cases","select=id,slug,title,court,category,status,summary,prosecution_claim,defense_claim,court_view,source_url,source_label,source_kind,event_date,updated_at,raw_metadata,sentence_request,sentencing_request,judgment_result&is_demo=eq.false&slug=not.is.null&order=slug.asc"),
  fetchAll("people","select=id,display_name,role,organization,bio,overview,background,birth_date,sex,birthplace,photo_url,profile_url,source_url,created_at&verification_status=eq.verified&order=display_name.asc"),
  fetchAll("case_people","select=case_id,person_id,role_label"),
  fetchAll("case_summaries","select=case_id,side_a_summary,side_b_summary,court_summary,side_a_label,side_b_label&status=eq.published"),
  fetchAll("case_sources","select=case_id,url,publisher,title,source_type,is_primary,published_at&order=is_primary.desc"),
  fetchAll("person_sources","select=person_id,url,publisher,title,source_type,is_primary,created_at&order=is_primary.desc")
]);

const h=s=>String(s??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;");
const xml=s=>String(s??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&apos;");
const txt=(s,n=1000)=>String(s??"").replace(/\s+/g," ").trim().slice(0,n);
const safe=u=>{try{const x=new URL(u);return /^https?:$/.test(x.protocol)?x.href:""}catch{return""}};
const jpdate=d=>{const m=String(d||"").match(/^(\d{4})-(\d{2})-(\d{2})$/);return m?Number(m[1])+"年"+Number(m[2])+"月"+Number(m[3])+"日":String(d||"")};
const roles={judge:"裁判官",prosecutor:"検察官",lawyer:"弁護士",plaintiff:"原告",defendant:"被告",accused:"被告人",other:"関係者"};
const personById=new Map(people.map(p=>[p.id,p]));
const caseById=new Map(cases.map(c=>[c.id,c]));
const summaryByCase=new Map(summaries.map(s=>[s.case_id,s]));
const sourcesByCase=new Map;
for(const s of caseSources){if(!sourcesByCase.has(s.case_id))sourcesByCase.set(s.case_id,[]);sourcesByCase.get(s.case_id).push(s)}
const sourcesByPerson=new Map;
for(const s of personSources){if(!sourcesByPerson.has(s.person_id))sourcesByPerson.set(s.person_id,[]);sourcesByPerson.get(s.person_id).push(s)}
const peopleByCase=new Map, casesByPerson=new Map;
for(const cp of casePeople){
  const p=personById.get(cp.person_id), c=caseById.get(cp.case_id);
  if(p&&c){
    if(!peopleByCase.has(c.id))peopleByCase.set(c.id,[]);
    peopleByCase.get(c.id).push({...p,role_label:cp.role_label});
    if(!casesByPerson.has(p.id))casesByPerson.set(p.id,[]);
    casesByPerson.get(p.id).push({...c,role_label:cp.role_label});
  }
}

const css=fs.existsSync("seo.css")?fs.readFileSync("seo.css","utf8"):"";
if(!css) throw new Error("seo.css missing");
fs.rmSync("cases",{recursive:true,force:true});
fs.rmSync("people",{recursive:true,force:true});
fs.rmSync("topics",{recursive:true,force:true});
fs.rmSync("case-archive",{recursive:true,force:true});
fs.rmSync("courts",{recursive:true,force:true});
fs.rmSync("years",{recursive:true,force:true});
fs.mkdirSync("cases",{recursive:true});
fs.mkdirSync("people",{recursive:true});
fs.mkdirSync("topics",{recursive:true});
fs.mkdirSync("case-archive",{recursive:true});
fs.mkdirSync("courts",{recursive:true});
fs.mkdirSync("years",{recursive:true});
fs.mkdirSync("sitemaps",{recursive:true});

function catFile(c){return c==="刑事"?"criminal.html":c==="民事"?"civil.html":c==="行政"?"administrative.html":"index.html"}

const caseAliases=c=>{const v=c?.raw_metadata?.alternate_names??c?.raw_metadata?.aliases??[];const rows=Array.isArray(v)?v:String(v||"").split(/[|｜,、\n]+/);return [...new Set(rows.map(x=>txt(x,120)).filter(Boolean))].slice(0,8)};
const caseText=c=>[c.title,...caseAliases(c),c.summary,c.judgment_result,c.court_view,c.sentencing_request,c.sentence_request].filter(Boolean).join(" ");

const courtGroups=new Map;
for(const c of cases){
  const name=txt(c.court,160);
  if(!name)continue;
  if(!courtGroups.has(name))courtGroups.set(name,[]);
  courtGroups.get(name).push(c);
}
const courtSlug=name=>"court-"+createHash("sha1").update(name).digest("hex").slice(0,12);
const courtDefs=[...courtGroups.entries()]
  .map(([name,rows])=>({name,slug:courtSlug(name),rows:rows.sort((a,b)=>String(b.event_date||"").localeCompare(String(a.event_date||"")))}))
  .filter(x=>x.rows.length>=5)
  .sort((a,b)=>b.rows.length-a.rows.length||a.name.localeCompare(b.name,"ja"));
const courtDefByName=new Map(courtDefs.map(x=>[x.name,x]));

const yearGroups=new Map;
for(const c of cases){
  const y=String(c.event_date||"").slice(0,4);
  if(!/^\d{4}$/.test(y))continue;
  if(!yearGroups.has(y))yearGroups.set(y,[]);
  yearGroups.get(y).push(c);
}
const yearDefs=[...yearGroups.entries()]
  .map(([year,rows])=>({year,rows:rows.sort((a,b)=>String(b.event_date||"").localeCompare(String(a.event_date||"")))}))
  .filter(x=>x.rows.length>=10)
  .sort((a,b)=>b.year.localeCompare(a.year));
const yearDefByYear=new Map(yearDefs.map(x=>[x.year,x]));
const topicDefs=[
  {slug:"murder",name:"殺人事件",desc:"殺人に関する掲載裁判例を、裁判所・判決日・判決結果などとともに確認できます。",re:/殺人/},
  {slug:"attempted-murder",name:"殺人未遂・殺人予備の裁判例",desc:"殺人未遂、殺人予備に関する掲載裁判例を確認できます。",re:/殺人未遂|殺人予備/},
  {slug:"robbery",name:"強盗事件",desc:"強盗に関する掲載裁判例を、裁判所・判決日・判決結果などとともに確認できます。",re:/強盗/},
  {slug:"fraud",name:"詐欺事件",desc:"詐欺に関する掲載裁判例を、裁判所・判決日・判決結果などとともに確認できます。",re:/詐欺/},
  {slug:"special-fraud",name:"特殊詐欺の裁判例",desc:"特殊詐欺、オレオレ詐欺、還付金詐欺などに関する掲載裁判例を確認できます。",re:/特殊詐欺|オレオレ詐欺|還付金詐欺/},
  {slug:"theft",name:"窃盗事件",desc:"窃盗に関する掲載裁判例を、裁判所・判決日・判決結果などとともに確認できます。",re:/窃盗/},
  {slug:"embezzlement",name:"横領・背任の裁判例",desc:"横領、業務上横領、背任などに関する掲載裁判例を確認できます。",re:/横領|背任/},
  {slug:"assault",name:"傷害事件",desc:"傷害に関する掲載裁判例を、裁判所・判決日・判決結果などとともに確認できます。",re:/傷害/},
  {slug:"violence",name:"暴行事件",desc:"暴行に関する掲載裁判例を確認できます。",re:/暴行/},
  {slug:"arson",name:"放火事件",desc:"放火に関する掲載裁判例を、裁判所・判決日・判決結果などとともに確認できます。",re:/放火/},
  {slug:"drugs",name:"覚醒剤・大麻・薬物事件",desc:"覚醒剤、大麻、麻薬など薬物に関する掲載裁判例を確認できます。",re:/覚醒剤|大麻|麻薬|向精神薬|薬物/},
  {slug:"traffic",name:"危険運転・交通事故の裁判例",desc:"危険運転、過失運転、ひき逃げ、飲酒運転など交通事件の掲載裁判例を確認できます。",re:/危険運転|過失運転|道路交通法|交通事故|ひき逃げ|酒気帯び|飲酒運転/},
  {slug:"sexual-offenses",name:"性犯罪の裁判例",desc:"不同意性交、不同意わいせつ、強制性交、強制わいせつ等に関する掲載裁判例を確認できます。",re:/不同意性交|不同意わいせつ|強制性交|準強制性交|強姦|強制わいせつ|わいせつ|痴漢|盗撮/},
  {slug:"child-abuse",name:"児童虐待・子どもが被害者の裁判例",desc:"児童虐待、乳幼児への犯罪、保護責任者遺棄などに関する掲載裁判例を確認できます。",re:/児童虐待|虐待|乳児|幼児|保護責任者遺棄/},
  {slug:"stalking",name:"ストーカー・つきまといの裁判例",desc:"ストーカー、つきまといに関する掲載裁判例を確認できます。",re:/ストーカー|つきまとい/},
  {slug:"organized-crime",name:"暴力団・組織犯罪の裁判例",desc:"暴力団、組員、組長などが関係する掲載裁判例を確認できます。",re:/暴力団|組員|組長|工藤会|山口組/},
  {slug:"bribery",name:"贈収賄の裁判例",desc:"贈賄、収賄など贈収賄事件の掲載裁判例を確認できます。",re:/贈賄|収賄|賄賂/},
  {slug:"public-official",name:"公務員犯罪・職権濫用の裁判例",desc:"公務員、職権濫用、公文書に関する掲載裁判例を確認できます。",re:/公務員|職権濫用|公文書/},
  {slug:"forgery",name:"文書偽造・不実記録の裁判例",desc:"文書偽造、変造、不実記録などに関する掲載裁判例を確認できます。",re:/偽造|変造|不実記録/},
  {slug:"cybercrime",name:"サイバー犯罪・不正アクセスの裁判例",desc:"不正アクセス、電子計算機、電磁的記録などに関する掲載裁判例を確認できます。",re:/不正アクセス|電子計算機|サイバー|コンピュータ|電磁的記録/},
  {slug:"defamation-privacy",name:"名誉毀損・プライバシーの裁判例",desc:"名誉毀損、侮辱、プライバシー、個人情報に関する掲載裁判例を確認できます。",re:/名誉毀損|侮辱|プライバシー|個人情報/},
  {slug:"welfare",name:"生活保護の裁判例",desc:"生活保護をめぐる行政・民事等の掲載裁判例を確認できます。",re:/生活保護/},
  {slug:"medical",name:"医療・医療過誤の裁判例",desc:"医療、医師、病院、医療過誤に関する掲載裁判例を確認できます。",re:/医療|医師|病院|医療過誤/},
  {slug:"labor",name:"労働・解雇・賃金の裁判例",desc:"労働、解雇、残業、賃金に関する掲載裁判例を確認できます。",re:/労働|解雇|残業|賃金/},
  {slug:"intellectual-property",name:"著作権・特許・商標の裁判例",desc:"著作権、特許、商標、知的財産に関する掲載裁判例を確認できます。",re:/著作権|特許|商標|知的財産/},
  {slug:"tax",name:"税務・課税の裁判例",desc:"所得税、法人税、課税、租税、税務に関する掲載裁判例を確認できます。",re:/所得税|法人税|課税|租税|税務/},
  {slug:"consumer",name:"消費者・契約トラブルの裁判例",desc:"消費者被害、契約、解約などに関する掲載裁判例を確認できます。",re:/消費者|契約|解約/},
  {slug:"family",name:"離婚・親権・家族の裁判例",desc:"離婚、親権、養育費、婚姻、面会交流など家族関係の掲載裁判例を確認できます。",re:/離婚|親権|養育費|婚姻|面会交流/},
  {slug:"inheritance",name:"相続・遺産・遺言の裁判例",desc:"相続、遺産、遺言に関する掲載裁判例を確認できます。",re:/相続|遺産|遺言/},
  {slug:"real-estate",name:"不動産・土地・建物の裁判例",desc:"不動産、土地、建物、賃貸、明渡しなどに関する掲載裁判例を確認できます。",re:/不動産|土地|建物|賃貸|明渡/},
  {slug:"construction",name:"建築・建設・工事の裁判例",desc:"建築、建設、工事、請負に関する掲載裁判例を確認できます。",re:/建築|建設|工事|請負/},
  {slug:"corporate",name:"会社・取締役・株主の裁判例",desc:"会社、取締役、株主、法人など企業活動に関する掲載裁判例を確認できます。",re:/会社|取締役|株主|法人/},
  {slug:"antitrust",name:"独占禁止法・談合の裁判例",desc:"独占禁止法、談合、カルテルなど競争法に関する掲載裁判例を確認できます。",re:/独占禁止法|談合|カルテル/},
  {slug:"damages",name:"損害賠償・慰謝料の裁判例",desc:"損害賠償、慰謝料の請求に関する掲載裁判例を確認できます。",re:/損害賠償|慰謝料/},
  {slug:"administrative-disputes",name:"行政処分・取消訴訟の裁判例",desc:"行政処分、処分取消、義務付けなど行政争訟に関する掲載裁判例を確認できます。",re:/行政処分|処分取消|取消請求|義務付け/},
  {slug:"constitutional",name:"憲法・違憲判断の裁判例",desc:"憲法、違憲性が争点となった掲載裁判例を確認できます。",re:/憲法|違憲/},
  {slug:"environment",name:"環境・廃棄物・公害の裁判例",desc:"環境、廃棄物、公害、土砂などに関する掲載裁判例を確認できます。",re:/環境|廃棄物|公害|土砂/},
  {slug:"education",name:"学校・教員・教育の裁判例",desc:"学校、教員、教育、大学などに関する掲載裁判例を確認できます。",re:/学校|教員|教育|大学/},
  {slug:"appeals",name:"控訴・上告の裁判例",desc:"控訴、上告に関する掲載裁判例を確認できます。",re:/控訴|上告/},
  {slug:"suspended-sentence",name:"執行猶予付き判決の裁判例",desc:"判決結果に執行猶予が確認できる掲載裁判例を確認できます。",re:/執行猶予/},
  {slug:"life-sentence",name:"無期懲役・無期拘禁刑の裁判例",desc:"無期懲役、無期拘禁刑に関する掲載裁判例を確認できます。",re:/無期懲役|無期拘禁刑/},
  {slug:"death-penalty",name:"死刑判決・死刑求刑の裁判例",desc:"死刑判決、死刑求刑に関する掲載裁判例を確認できます。",re:/死刑/},
  {slug:"fine",name:"罰金刑の裁判例",desc:"判決や求刑に罰金が確認できる掲載裁判例を確認できます。",re:/罰金/}
].map(t=>({...t,match:c=>t.re.test(caseText(c))}));

const topicIdsByCase=new Map(cases.map(c=>[c.id,topicDefs.filter(t=>t.match(c)).map(t=>t.slug)]));
function relatedCasesFor(c,limit=6){
  const ids=new Set(topicIdsByCase.get(c.id)||[]);
  return cases
    .filter(q=>q.id!==c.id)
    .map(q=>{
      let score=0;
      for(const id of topicIdsByCase.get(q.id)||[]) if(ids.has(id)) score+=4;
      if(c.court&&q.court===c.court) score+=2;
      if(c.category&&q.category===c.category) score+=1;
      return {q,score};
    })
    .filter(x=>x.score>=2)
    .sort((a,b)=>b.score-a.score||String(b.q.event_date||"").localeCompare(String(a.q.event_date||"")))
    .slice(0,limit)
    .map(x=>x.q);
}
function relatedCasesSection(c){
  const rows=relatedCasesFor(c,6);
  if(!rows.length) return "";
  return '<section class="panel"><h2>関連する裁判</h2><ul class="list">'+rows.map(q=>'<li><a href="../cases/'+encodeURIComponent(q.slug)+'.html"><strong>'+h(q.title)+'</strong></a><div class="meta">'+h(q.court||"")+(q.event_date?" · "+h(jpdate(q.event_date)):"")+(q.judgment_result?" · "+h(txt(q.judgment_result,140)):"")+'</div></li>').join("")+'</ul></section>';
}
const caseBrowseOrder=[...cases].sort((a,b)=>String(b.event_date||"").localeCompare(String(a.event_date||""))||String(a.title||"").localeCompare(String(b.title||""),"ja"));
const caseBrowseIndex=new Map(caseBrowseOrder.map((q,i)=>[q.id,i]));
function adjacentCasesSection(c){
  const i=caseBrowseIndex.get(c.id);
  if(i==null)return "";
  const newer=i>0?caseBrowseOrder[i-1]:null;
  const older=i+1<caseBrowseOrder.length?caseBrowseOrder[i+1]:null;
  if(!newer&&!older)return "";
  return '<section class="panel"><h2>前後の裁判を続けて見る</h2><div class="grid">'
    +(newer?'<div class="info"><h3>日付が新しい裁判</h3><p><a href="../cases/'+encodeURIComponent(newer.slug)+'.html"><strong>'+h(newer.title)+'</strong></a></p><div class="meta">'+h(newer.court||"")+(newer.event_date?" · "+h(jpdate(newer.event_date)):"")+'</div></div>':"")
    +(older?'<div class="info"><h3>日付が古い裁判</h3><p><a href="../cases/'+encodeURIComponent(older.slug)+'.html"><strong>'+h(older.title)+'</strong></a></p><div class="meta">'+h(older.court||"")+(older.event_date?" · "+h(jpdate(older.event_date)):"")+'</div></div>':"")
    +'</div><p class="note"><a href="../all-cases.html">裁判例・判決の全件一覧を見る</a></p></section>';
}
function shareBox(url,title){
  const x="https://twitter.com/intent/tweet?url="+encodeURIComponent(url)+"&text="+encodeURIComponent(title+" | 裁判ウォッチ");
  const line="https://social-plugins.line.me/lineit/share?url="+encodeURIComponent(url);
  return '<section class="panel"><h2>このページを共有</h2><p><a class="cta" href="'+h(x)+'" target="_blank" rel="noopener noreferrer">Xで共有</a><a class="subcta" href="'+h(line)+'" target="_blank" rel="noopener noreferrer">LINEで共有</a></p></section>';
}

const STATIC_AD_SUPABASE_URL="https://czhssdmwilnbrexqmtqg.supabase.co";
const STATIC_AD_SUPABASE_KEY="sb_publishable_HhXl8I3L4z-UF168b6wSiQ_WrQXa1Uc";
function staticAdRuntime(prefix=""){
  return '<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"><\/script><script src="'+prefix+'ad-loader.js"><\/script><script>window.addEventListener("DOMContentLoaded",function(){try{var sb=window.supabase.createClient("'+STATIC_AD_SUPABASE_URL+'","'+STATIC_AD_SUPABASE_KEY+'");window.COURTWATCH_ADS&&window.COURTWATCH_ADS.init(sb)}catch(e){}});<\/script>';
}
function staticAdSlot(id,type="responsive"){
  return '<div class="ad-slot '+(type==="native"?"native-ad":"ad-responsive")+'" id="'+id+'" data-ad-slot="seo-static"></div>';
}

function casePage(c){
  const url="https://saibanwatch.github.io/cases/"+encodeURIComponent(c.slug)+".html";
  const sum=txt(c.summary,1800), num=txt(c.raw_metadata?.case_number,120), aliases=caseAliases(c);
  const req=txt(c.sentencing_request||c.sentence_request,1200), jud=txt(c.judgment_result,1800);
  const ai=summaryByCase.get(c.id)||{}, pros=txt(ai.side_a_summary||c.prosecution_claim,2200), def=txt(ai.side_b_summary||c.defense_claim,2200), courtv=txt(ai.court_summary||c.court_view,2800);
  const dateLabel=c.event_date?jpdate(c.event_date):"";
  const seoBits=[c.court,dateLabel,jud?"判決":"",req?"求刑":""].filter(Boolean);
  const seoTitle=txt(c.title+(seoBits.length?"｜"+seoBits.join("・"):"")+"｜裁判ウォッチ",120);
  const desc=txt([c.title,aliases.length?"別名・報道上の呼称："+aliases.join("、"):"",c.court,dateLabel,(sum||pros||courtv)?txt(sum||pros||courtv,115):"",jud?"判決："+txt(jud,120):"",req?"求刑："+txt(req,90):"","当事者の主張・裁判所の判断と出典を確認できます。"].filter(Boolean).map(x=>String(x).replace(/[。．\s]+$/g,"")).join("。")+"。",155);
  const ppl=(peopleByCase.get(c.id)||[]).slice(0,30), srcMain=safe(c.source_url);
  const allsrc=[...(srcMain?[{url:srcMain,title:c.source_label||"原資料",publisher:c.source_label||""}]:[]),...(sourcesByCase.get(c.id)||[]).filter(s=>safe(s.url)&&safe(s.url)!==srcMain)];
  const cf=catFile(c.category);
  const topicLinks=topicDefs.filter(t=>t.match(c)).slice(0,5).map(t=>'<a href="../topics/'+t.slug+'.html">'+h(t.name)+'</a>').join(" · ");
  const courtDef=courtDefByName.get(txt(c.court,160));
  const yearDef=yearDefByYear.get(String(c.event_date||"").slice(0,4));
  const courtLink=courtDef?'<a href="../courts/'+courtDef.slug+'.html">'+h(courtDef.name)+'の裁判一覧</a>':"";
  const yearLink=yearDef?'<a href="../years/'+yearDef.year+'.html">'+h(yearDef.year)+'年の裁判一覧</a>':"";
  const json=JSON.stringify({"@context":"https://schema.org","@graph":[{"@type":"WebPage","@id":url,"url":url,"name":c.title,"alternateName":aliases,"description":desc,"dateModified":String(c.updated_at||"").slice(0,10),"isPartOf":{"@type":"WebSite","name":"裁判ウォッチ","url":"https://saibanwatch.github.io/"}},{"@type":"BreadcrumbList","itemListElement":[{"@type":"ListItem","position":1,"name":"裁判ウォッチ","item":"https://saibanwatch.github.io/"},{"@type":"ListItem","position":2,"name":(c.category||"裁判")+"裁判","item":"https://saibanwatch.github.io/"+cf},{"@type":"ListItem","position":3,"name":c.title,"item":url}]}]}).replace(/</g,"\\u003c");
  const result=(req||jud)?'<section class="panel"><h2>求刑・判決</h2><div class="grid">'+(req?'<div class="info"><h3>求刑</h3><p>'+h(req)+'</p></div>':"")+(jud?'<div class="info"><h3>判決</h3><p>'+h(jud)+'</p></div>':"")+'</div></section>':"";
  const pendingClaims=c.raw_metadata?.fulltext_pdf_url?"判決全文を確認し、要約を編集中です。":(c.source_kind==="courts.go.jp/hanrei"?"判決全文を取得・確認中です。":"要約を作成できる原資料を確認中です。");
  const claims='<section class="panel"><h2>主張と裁判所の判断</h2><div class="grid">' + '<div class="info"><h3>'+h(ai.side_a_label||(c.category==="刑事"?"検察側の主張":"原告・申立人側の主張"))+'</h3><p>'+h(pros||pendingClaims)+'</p></div>' + '<div class="info"><h3>'+h(ai.side_b_label||(c.category==="刑事"?"弁護側の主張":"被告・相手方側の主張"))+'</h3><p>'+h(def||pendingClaims)+'</p></div>' + '<div class="info"><h3>裁判所の判断</h3><p>'+h(courtv||pendingClaims)+'</p></div></div></section>';
  const persons=ppl.length?'<section class="panel"><h2>この事件の関係者</h2><ul class="list">'+ppl.map(p=>'<li><a href="../people/'+encodeURIComponent(p.id)+'.html"><strong>'+h(p.display_name)+'</strong></a><div class="meta">'+h(p.role_label||roles[p.role]||"関係者")+(p.organization?" · "+h(p.organization):"")+'</div></li>').join("")+'</ul></section>':"";
  const sources=allsrc.length?'<section class="panel"><h2>出典・原資料</h2><ul class="list">'+allsrc.map(s=>'<li><a href="'+h(safe(s.url))+'" target="_blank" rel="noopener noreferrer">'+h(s.title||s.publisher||"資料を開く")+'</a>'+(s.publisher?'<div class="meta">'+h(s.publisher)+'</div>':"")+'</li>').join("")+'</ul><p class="note">要約は原資料の代替ではありません。重要な内容はリンク先の原資料で確認してください。</p></section>':"";
  return '<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>'+h(seoTitle)+'</title><meta name="description" content="'+h(desc)+'"><meta name="robots" content="index,follow"><link rel="canonical" href="'+h(url)+'"><link rel="alternate" type="application/rss+xml" title="裁判ウォッチ 新着裁判" href="../feed.xml"><link rel="icon" href="../favicon.svg" type="image/svg+xml"><link rel="stylesheet" href="../seo.css"><script src="../analytics.js" defer></script><meta property="og:type" content="article"><meta property="og:site_name" content="裁判ウォッチ"><meta property="og:title" content="'+h(seoTitle)+'"><meta property="og:description" content="'+h(desc)+'"><meta property="og:url" content="'+h(url)+'"><meta name="twitter:card" content="summary"><script type="application/ld+json">'+json+'</script></head><body><header><div class="nav"><a class="brand" href="../index.html">裁判ウォッチ</a><nav class="navlinks"><a href="../criminal.html">刑事</a><a href="../civil.html">民事</a><a href="../administrative.html">行政</a><a href="../people.html">人物</a></nav></div></header><main><div class="breadcrumbs"><a href="../index.html">トップ</a> › <a href="../'+cf+'">'+h(c.category||"裁判")+'</a> › '+h(c.title)+'</div><section class="panel"><div class="meta"><span class="badge">'+h(c.category||"未分類")+'</span>'+(c.status?'<span class="badge">'+h(c.status)+'</span>':"")+(c.court?'<span>'+h(c.court)+'</span>':"")+(c.event_date?'<span>'+h(c.event_date)+'</span>':"")+(num?'<span>'+h(num)+'</span>':"")+'</div><h1>'+h(c.title)+'</h1>'+(aliases.length?'<p class="meta">別名・報道上の呼称：'+aliases.map(h).join("・")+'</p>':"")+(sum?'<p class="summary">'+h(sum)+'</p>':"")+'</section>'+staticAdSlot("adCaseInline")+result+claims+persons+sources+relatedCasesSection(c)+adjacentCasesSection(c)+'<section class="panel"><h2>みんなの意見</h2><p>この事件の求刑・判決への投票や投稿を確認できます。</p><a class="cta" href="../case.html?slug='+encodeURIComponent(c.slug)+'#opinions">投票・みんなの意見を見る</a><a class="subcta" href="../case.html?slug='+encodeURIComponent(c.slug)+'#posts">投稿を見る・書く</a><a class="subcta" href="../case.html?slug='+encodeURIComponent(c.slug)+'">☆ この事件を保存する</a></section><section class="panel"><h2>関連する裁判を探す</h2><p><a href="../'+cf+'">'+h(c.category||"裁判")+'の裁判一覧</a>'+(jud&&/無罪/.test(jud)?' · <a href="../acquittals.html">無罪判決の一覧</a>':"")+(req&&jud?' · <a href="../sentencing.html">求刑と判決の比較</a>':"")+(courtLink?' · '+courtLink:"")+(yearLink?' · '+yearLink:"")+(topicLinks?' · '+topicLinks:"")+'</p></section>'+shareBox(url,c.title)+staticAdSlot("adCaseBottom","native")+'</main><footer><a href="../all-cases.html">全裁判一覧</a> · <a href="../latest.html">新着</a> · <a href="../topics.html">テーマ別</a> · <a href="../people.html">人物</a> · <a href="../courts.html">裁判所別</a> · <a href="../years.html">年別</a><br>裁判ウォッチ · 公開資料を整理し、裁判の内容とみんなの意見を確認できるサイトです。</footer>'+staticAdRuntime("../")+'</body></html>';
}


function personTimeline(p,pcs){
  const entries=[],seen=new Set;
  const push=(sort,date,text,type)=>{
    const key=sort+"|"+text;
    if(!seen.has(key)){seen.add(key);entries.push({sort,date,text,type})}
  };
  if(p.birth_date) push(p.birth_date,jpdate(p.birth_date),"生年月日","profile");
  const bg=String(p.background||"");
  for(const part of bg.split(/[。\n]+/).map(x=>x.trim()).filter(Boolean)){
    const ms=[...part.matchAll(/((?:19|20)\d{2})年(?:([01]?\d)月)?(?:([0-3]?\d)日)?/g)];
    for(const m of ms){
      const y=m[1],mo=m[2]?String(Number(m[2])).padStart(2,"0"):"00",d=m[3]?String(Number(m[3])).padStart(2,"0"):"00";
      const label=y+"年"+(m[2]?Number(m[2])+"月":"")+(m[3]?Number(m[3])+"日":"");
      push(y+"-"+mo+"-"+d,label,part,"career");
    }
  }
  for(const c of pcs.slice(0,8)){
    if(c.event_date)push(c.event_date,jpdate(c.event_date),"掲載事件："+c.title+(c.role_label?"（"+c.role_label+"）":""),"case");
  }
  return entries.sort((a,b)=>a.sort.localeCompare(b.sort)).slice(-20);
}
function relatedPeopleFor(p,pcs){
  const map=new Map;
  for(const c of pcs){
    for(const q of peopleByCase.get(c.id)||[]){
      if(q.id===p.id)continue;
      if(!map.has(q.id))map.set(q.id,{...q,count:0,last:"",cases:new Set});
      const x=map.get(q.id);
      if(!x.cases.has(c.id)){x.cases.add(c.id);x.count++}
      if(String(c.event_date||"")>x.last)x.last=String(c.event_date||"");
    }
  }
  return [...map.values()].sort((a,b)=>b.count-a.count||b.last.localeCompare(a.last)||String(a.display_name).localeCompare(String(b.display_name),"ja")).slice(0,10);
}

function personPage(p){
  const url="https://saibanwatch.github.io/people/"+encodeURIComponent(p.id)+".html", role=roles[p.role]||"関係者", org=txt(p.organization,160), overview=txt(p.overview||p.bio,900), background=txt(p.background,1400), birth=p.birth_date||"", sex=({male:"男性",female:"女性",other:"その他"})[p.sex]||"未確認", birthplace=txt(p.birthplace,160)||"未確認", img=safe(p.photo_url);
  const desc=txt(p.display_name+"（"+role+(org?"・"+org:"")+"）。"+(overview?overview+" ":"")+"掲載事件、経歴、確認資料、GOOD/BAD投票、みんなの意見を確認できます。",155);
  const personObj={"@type":"Person","@id":url+"#person","name":p.display_name,"jobTitle":role};
  if(img)personObj.image=img; if(p.profile_url)personObj.sameAs=[p.profile_url]; if(birth)personObj.birthDate=birth; if(p.sex)personObj.gender=sex; if(p.birthplace)personObj.birthPlace={"@type":"Place","name":p.birthplace}; if(overview)personObj.description=overview;
  const json=JSON.stringify({"@context":"https://schema.org","@graph":[personObj,{"@type":"BreadcrumbList","itemListElement":[{"@type":"ListItem","position":1,"name":"裁判ウォッチ","item":"https://saibanwatch.github.io/"},{"@type":"ListItem","position":2,"name":"裁判関係者一覧","item":"https://saibanwatch.github.io/people.html"},{"@type":"ListItem","position":3,"name":p.display_name,"item":url}]}]}).replace(/</g,"\\u003c");
  const pcs=(casesByPerson.get(p.id)||[]).sort((a,b)=>String(b.event_date||"").localeCompare(String(a.event_date||""))).slice(0,50), mainCases=pcs.slice(0,8), extraCases=pcs.slice(8), timeline=personTimeline(p,pcs), related=relatedPeopleFor(p,pcs), srcs=(sourcesByPerson.get(p.id)||[]).slice(0,20);
  return '<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>'+h(p.display_name)+' - '+h(role)+'・掲載事件・みんなの評価 | 裁判ウォッチ</title><meta name="description" content="'+h(desc)+'"><meta name="robots" content="index,follow"><link rel="canonical" href="'+h(url)+'"><link rel="alternate" type="application/rss+xml" title="裁判ウォッチ 新着裁判" href="../feed.xml"><link rel="icon" href="../favicon.svg" type="image/svg+xml"><link rel="stylesheet" href="../seo.css"><script src="../analytics.js" defer></script><meta property="og:type" content="profile"><meta property="og:site_name" content="裁判ウォッチ"><meta property="og:title" content="'+h(p.display_name)+' | 裁判ウォッチ"><meta property="og:description" content="'+h(desc)+'"><meta property="og:url" content="'+h(url)+'"><meta name="twitter:card" content="summary"><script type="application/ld+json">'+json+'</script></head><body><header><div class="nav"><a class="brand" href="../index.html">裁判ウォッチ</a><nav class="navlinks"><a href="../criminal.html">刑事</a><a href="../civil.html">民事</a><a href="../administrative.html">行政</a><a href="../people.html">人物</a></nav></div></header><main><div class="breadcrumbs"><a href="../index.html">トップ</a> › <a href="../people.html">裁判関係者</a> › '+h(p.display_name)+'</div><section class="panel"><div class="personhead"><div class="avatar">'+(img?'<img src="'+h(img)+'" alt="'+h(p.display_name)+'" loading="eager" referrerpolicy="no-referrer">':h((p.display_name||"?").slice(0,1)))+'</div><div><div class="meta"><span class="badge">'+h(role)+'</span><span class="badge">確認済み</span></div><h1>'+h(p.display_name)+'</h1>'+(org?'<div class="summary">'+h(org)+'</div>':"")+'<div class="grid" style="margin-top:12px"><div class="info"><h3>生年月日</h3><p>'+h(birth?jpdate(birth):"未確認")+'</p></div><div class="info"><h3>性別</h3><p>'+h(sex)+'</p></div><div class="info"><h3>出身地</h3><p>'+h(birthplace)+'</p></div></div>'+(overview?'<h3>概要</h3><p>'+h(overview)+'</p>':"")+(background?'<h3>経歴・生い立ち</h3><p>'+h(background)+'</p>':"")+'</div></div></section>'+staticAdSlot("adPersonInline")+
  (timeline.length?'<section class="panel"><h2>経歴年表</h2><ul class="list">'+timeline.map(t=>'<li><strong>'+h(t.date)+'</strong><div class="meta">'+h(t.text)+'</div></li>').join("")+'</ul></section>':"")+
  '<section class="panel"><h2>'+h(p.display_name)+'の主な掲載事件</h2>'+(mainCases.length?'<ul class="list">'+mainCases.map(c=>'<li><a href="../cases/'+encodeURIComponent(c.slug)+'.html"><strong>'+h(c.title)+'</strong></a><div class="meta">'+h(c.role_label||role)+(c.court?" · "+h(c.court):"")+(c.event_date?" · "+h(jpdate(c.event_date)):"")+'</div></li>').join("")+'</ul>'+(extraCases.length?'<details><summary>ほかの掲載事件 '+extraCases.length+'件を見る</summary><ul class="list">'+extraCases.map(c=>'<li><a href="../cases/'+encodeURIComponent(c.slug)+'.html"><strong>'+h(c.title)+'</strong></a><div class="meta">'+h(c.role_label||role)+(c.court?" · "+h(c.court):"")+(c.event_date?" · "+h(jpdate(c.event_date)):"")+'</div></li>').join("")+'</ul></details>':""):'<p class="note">現在、紐付け済み事件はありません。</p>')+'</section>'+
  (related.length?'<section class="panel"><h2>同じ掲載事件に登場する人物</h2><p class="note">同一の掲載事件に紐づく人物です。私的な関係や共犯関係などを意味するものではありません。</p><ul class="list">'+related.map(q=>'<li><a href="../people/'+encodeURIComponent(q.id)+'.html"><strong>'+h(q.display_name)+'</strong></a><div class="meta">'+h(roles[q.role]||"関係者")+(q.organization?" · "+h(q.organization):"")+' · 共通の掲載事件 '+q.count+'件</div></li>').join("")+'</ul></section>':"")+
  '<section class="panel"><h2>確認資料</h2>'+(srcs.length?'<ul class="list">'+srcs.map(s=>'<li><a href="'+h(safe(s.url))+'" target="_blank" rel="noopener">'+h(s.title||s.publisher||"確認資料")+'</a>'+(s.publisher?'<div class="meta">'+h(s.publisher)+'</div>':"")+'</li>').join("")+'</ul>':(p.profile_url||p.source_url)?'<a href="'+h(safe(p.profile_url||p.source_url))+'" target="_blank" rel="noopener">確認資料・公式プロフィールを開く</a>':'<p class="note">確認資料は人物情報の確認時に参照しています。</p>')+'</section><section class="panel"><h2>みんなの評価・意見</h2><p>'+h(p.display_name)+'について、GOOD/BAD投票や投稿を見ることができます。投票は利用者の主観であり、事実認定・信用性・法的評価を示すものではありません。</p><a class="cta" href="../person.html?id='+encodeURIComponent(p.id)+'#opinion">GOOD / BADを見る・投票する</a><a class="subcta" href="../person.html?id='+encodeURIComponent(p.id)+'#discussion">投稿を見る・書く</a></section>'+shareBox(url,p.display_name)+staticAdSlot("adPersonBottom","native")+'</main><footer><a href="../all-cases.html">全裁判一覧</a> · <a href="../latest.html">新着</a> · <a href="../topics.html">テーマ別</a> · <a href="../people.html">人物一覧</a> · <a href="../courts.html">裁判所別</a> · <a href="../years.html">年別</a><br>裁判ウォッチ · 公開資料をもとに裁判と関係者を整理し、みんなの意見を見られるサイトです。</footer>'+staticAdRuntime("../")+'</body></html>';
}

for(const c of cases) fs.writeFileSync("cases/"+c.slug+".html",casePage(c));
for(const p of people) fs.writeFileSync("people/"+p.id+".html",personPage(p));

function peopleIndex(){
  const groups={judge:[],prosecutor:[],lawyer:[],accused:[],plaintiff:[],defendant:[],other:[]};
  for(const p of people)(groups[p.role]||groups.other).push(p);
  const peopleIndexJson=JSON.stringify({"@context":"https://schema.org","@graph":[{"@type":"CollectionPage","name":"裁判関係者一覧","url":"https://saibanwatch.github.io/people.html","isPartOf":{"@type":"WebSite","name":"裁判ウォッチ","url":"https://saibanwatch.github.io/"}},{"@type":"BreadcrumbList","itemListElement":[{"@type":"ListItem","position":1,"name":"裁判ウォッチ","item":"https://saibanwatch.github.io/"},{"@type":"ListItem","position":2,"name":"裁判関係者一覧","item":"https://saibanwatch.github.io/people.html"}]},{"@type":"ItemList","name":"裁判関係者","itemListElement":people.slice(0,60).map((p,i)=>({"@type":"ListItem","position":i+1,"name":p.display_name,"url":"https://saibanwatch.github.io/people/"+encodeURIComponent(p.id)+".html"}))}]}).replace(/</g,"\\u003c");
  const sections=Object.entries(groups).filter(([,a])=>a.length).map(([r,a])=>'<section class="panel"><h2>'+h(roles[r]||"関係者")+'（'+a.length+'人）</h2><ul class="list">'+a.map(p=>'<li><a href="people/'+encodeURIComponent(p.id)+'.html"><strong>'+h(p.display_name)+'</strong></a>'+(p.organization?'<div class="meta">'+h(p.organization)+'</div>':"")+(p.overview?'<div class="note" style="margin-top:4px">'+h(txt(p.overview,150))+'</div>':"")+'</li>').join("")+'</ul></section>').join("");
  return '<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>裁判関係者一覧 - 裁判官・弁護士・検察官・当事者 | 裁判ウォッチ</title><meta name="description" content="裁判ウォッチに掲載している確認済みの裁判官、検察官、弁護士、原告、被告、被告人などの裁判関係者一覧。氏名から掲載事件やみんなの評価を確認できます。"><meta name="robots" content="index,follow"><link rel="canonical" href="https://saibanwatch.github.io/people.html"><link rel="alternate" type="application/rss+xml" title="裁判ウォッチ 新着裁判" href="feed.xml"><link rel="icon" href="favicon.svg" type="image/svg+xml"><link rel="stylesheet" href="seo.css"><script src="analytics.js" defer></script><meta property="og:type" content="website"><meta property="og:site_name" content="裁判ウォッチ"><meta property="og:title" content="裁判関係者一覧 | 裁判ウォッチ"><meta property="og:description" content="裁判官、検察官、弁護士、原告、被告、被告人などの掲載人物から関連事件を探せます。"><meta property="og:url" content="https://saibanwatch.github.io/people.html"><meta name="twitter:card" content="summary"><script type="application/ld+json">'+peopleIndexJson+'</script></head><body><header><div class="nav"><a class="brand" href="index.html">裁判ウォッチ</a><nav class="navlinks"><a href="criminal.html">刑事</a><a href="civil.html">民事</a><a href="administrative.html">行政</a></nav></div></header><main><div class="breadcrumbs"><a href="index.html">トップ</a> › 裁判関係者</div><section class="panel"><h1>裁判関係者一覧</h1><p class="summary">公開資料等で本人同一性を確認できた人物を掲載しています。氏名を選ぶと、掲載事件・確認資料・GOOD/BAD投票・投稿を確認できます。</p><div class="meta">確認済み '+people.length+'人</div></section>'+sections+'</main><footer>未確認の判決文記載人物は、同姓同名の誤統合を避けるため検索対象の人物一覧には含めていません。</footer></body></html>';
}
fs.writeFileSync("people.html",peopleIndex());

function archive(file,title,desc,rows){
  const items=rows.slice(0,300).map(c=>'<li><a href="cases/'+encodeURIComponent(c.slug)+'.html"><strong>'+h(c.title)+'</strong></a><div class="meta">'+h(c.court||"")+(c.event_date?" · "+h(c.event_date):"")+(c.judgment_result?" · "+h(txt(c.judgment_result,180)):"")+'</div></li>').join("");
  const url="https://saibanwatch.github.io/"+file;
  const archiveJson=JSON.stringify({"@context":"https://schema.org","@graph":[{"@type":"CollectionPage","name":title,"url":url,"description":desc,"isPartOf":{"@type":"WebSite","name":"裁判ウォッチ","url":"https://saibanwatch.github.io/"}},{"@type":"BreadcrumbList","itemListElement":[{"@type":"ListItem","position":1,"name":"裁判ウォッチ","item":"https://saibanwatch.github.io/"},{"@type":"ListItem","position":2,"name":title,"item":url}]},{"@type":"ItemList","name":title,"itemListElement":rows.slice(0,50).map((c,i)=>({"@type":"ListItem","position":i+1,"name":c.title,"url":"https://saibanwatch.github.io/cases/"+encodeURIComponent(c.slug)+".html"}))}]}).replace(/</g,"\\u003c");
  return '<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>'+h(title)+' | 裁判ウォッチ</title><meta name="description" content="'+h(desc)+'"><meta name="robots" content="index,follow"><link rel="canonical" href="'+url+'"><link rel="alternate" type="application/rss+xml" title="裁判ウォッチ 新着裁判" href="feed.xml"><link rel="icon" href="favicon.svg" type="image/svg+xml"><link rel="stylesheet" href="seo.css"><script src="analytics.js" defer></script><meta property="og:type" content="website"><meta property="og:site_name" content="裁判ウォッチ"><meta property="og:title" content="'+h(title)+' | 裁判ウォッチ"><meta property="og:description" content="'+h(desc)+'"><meta property="og:url" content="'+url+'"><meta name="twitter:card" content="summary"><script type="application/ld+json">'+archiveJson+'</script></head><body><header><div class="nav"><a class="brand" href="index.html">裁判ウォッチ</a><nav class="navlinks"><a href="criminal.html">刑事</a><a href="civil.html">民事</a><a href="administrative.html">行政</a><a href="people.html">人物</a></nav></div></header><main><div class="breadcrumbs"><a href="index.html">トップ</a> › '+h(title)+'</div><section class="panel"><h1>'+h(title)+'</h1><p class="summary">'+h(desc)+'</p><div class="meta">掲載対象 '+rows.length+'件 · 新しい順に最大300件</div></section><section class="panel"><ul class="list">'+items+'</ul></section></main><footer><a href="all-cases.html">全裁判一覧</a> · <a href="latest.html">新着</a> · <a href="topics.html">テーマ別</a> · <a href="people.html">人物一覧</a> · <a href="courts.html">裁判所別</a> · <a href="years.html">年別</a><br>各事件ページから原資料・関係者・みんなの意見を確認できます。</footer></body></html>';
}
const byDate=(a,b)=>String(b.event_date||"").localeCompare(String(a.event_date||""));
fs.writeFileSync("criminal.html",archive("criminal.html","刑事裁判・判決一覧","刑事裁判の判決・求刑・裁判所・事件概要を、公開資料をもとに一覧で確認できます。",cases.filter(c=>c.category==="刑事").sort(byDate)));
fs.writeFileSync("civil.html",archive("civil.html","民事裁判・判決一覧","民事裁判の判決・裁判所・事件概要を、公開資料をもとに一覧で確認できます。",cases.filter(c=>c.category==="民事").sort(byDate)));
fs.writeFileSync("administrative.html",archive("administrative.html","行政裁判・判決一覧","行政裁判の判決・裁判所・事件概要を、公開資料をもとに一覧で確認できます。",cases.filter(c=>c.category==="行政").sort(byDate)));
fs.writeFileSync("acquittals.html",archive("acquittals.html","無罪判決の裁判例一覧","判決結果に無罪が含まれる掲載裁判例を、裁判所・日付・概要とともに確認できます。",cases.filter(c=>/無罪/.test(c.judgment_result||"")).sort(byDate)));
fs.writeFileSync("sentencing.html",archive("sentencing.html","求刑と判決の比較一覧","刑事事件のうち求刑と判決の両方を掲載している事件を一覧で確認できます。",cases.filter(c=>c.category==="刑事"&&(c.sentencing_request||c.sentence_request)&&c.judgment_result).sort(byDate)));
const byUpdated=(a,b)=>String(b.updated_at||b.event_date||"").localeCompare(String(a.updated_at||a.event_date||""));
fs.writeFileSync("latest.html",archive("latest.html","新着・更新された裁判例","最近追加・更新された裁判例を新しい順に確認できます。事件概要、裁判所、判決・求刑、関係者ページへ移動できます。",[...cases].sort(byUpdated).slice(0,150)));

function refreshHomepageLatestCases(){
  const path="index.html";
  if(!fs.existsSync(path))return;
  let page=fs.readFileSync(path,"utf8");
  const start="<!-- SEO_LATEST_CASES_START -->", end="<!-- SEO_LATEST_CASES_END -->";
  const si=page.indexOf(start), ei=page.indexOf(end);
  if(si<0||ei<0||ei<si)return;
  const rows=[...cases].sort(byUpdated).slice(0,8);
  const links=rows.map(q=>'<li><a href="cases/'+encodeURIComponent(q.slug)+'.html">'+h(q.title)+'</a>'+(q.event_date?' <span class="notice">'+h(jpdate(q.event_date))+'</span>':'')+'</li>').join("");
  page=page.slice(0,si+start.length)+links+page.slice(ei);
  fs.writeFileSync(path,page);
}
refreshHomepageLatestCases();

const allCasesSorted=[...cases].sort(byDate);
const allCasesPerPage=200;
const allCasesTotalPages=Math.max(1,Math.ceil(allCasesSorted.length/allCasesPerPage));
function allCasesPage(pageNo){
  const nested=pageNo>1;
  const prefix=nested?"../":"";
  const rows=allCasesSorted.slice((pageNo-1)*allCasesPerPage,pageNo*allCasesPerPage);
  const items=rows.map(c=>'<li><a href="'+prefix+'cases/'+encodeURIComponent(c.slug)+'.html"><strong>'+h(c.title)+'</strong></a><div class="meta">'+h(c.category||"")+(c.court?" · "+h(c.court):"")+(c.event_date?" · "+h(c.event_date):"")+(c.judgment_result?" · "+h(txt(c.judgment_result,160)):"")+'</div>'+(c.summary?'<div class="note" style="margin-top:4px">'+h(txt(c.summary,180))+'</div>':"")+'</li>').join("");
  const pageLinks=Array.from({length:allCasesTotalPages},(_,i)=>i+1).map(n=>{
    const href=n===1?(nested?"../all-cases.html":"all-cases.html"):(nested?"page-"+n+".html":"case-archive/page-"+n+".html");
    return n===pageNo?'<strong>'+n+'</strong>':'<a href="'+href+'">'+n+'</a>';
  }).join(" · ");
  const url=pageNo===1?"https://saibanwatch.github.io/all-cases.html":"https://saibanwatch.github.io/case-archive/page-"+pageNo+".html";
  const title="裁判例・判決 全件一覧"+(pageNo>1?" "+pageNo+"ページ目":"");
  const allCasesJson=JSON.stringify({"@context":"https://schema.org","@graph":[{"@type":"CollectionPage","name":title,"url":url,"isPartOf":{"@type":"WebSite","name":"裁判ウォッチ","url":"https://saibanwatch.github.io/"}},{"@type":"BreadcrumbList","itemListElement":[{"@type":"ListItem","position":1,"name":"裁判ウォッチ","item":"https://saibanwatch.github.io/"},{"@type":"ListItem","position":2,"name":"裁判例・判決 全件一覧","item":"https://saibanwatch.github.io/all-cases.html"}]}]}).replace(/</g,"\\u003c");
  return '<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>'+h(title)+' | 裁判ウォッチ</title><meta name="description" content="裁判ウォッチ掲載の裁判例・判決を全件一覧から探せます。刑事・民事・行政の事件概要、裁判所、判決日などを確認できます。"><meta name="robots" content="index,follow"><link rel="canonical" href="'+url+'"><link rel="alternate" type="application/rss+xml" title="裁判ウォッチ 新着裁判" href="'+prefix+'feed.xml"><link rel="icon" href="'+prefix+'favicon.svg" type="image/svg+xml"><link rel="stylesheet" href="'+prefix+'seo.css"><script src="'+prefix+'analytics.js" defer></script><script type="application/ld+json">'+allCasesJson+'</script></head><body><header><div class="nav"><a class="brand" href="'+prefix+'index.html">裁判ウォッチ</a><nav class="navlinks"><a href="'+prefix+'criminal.html">刑事</a><a href="'+prefix+'civil.html">民事</a><a href="'+prefix+'administrative.html">行政</a><a href="'+prefix+'topics.html">テーマ</a><a href="'+prefix+'people.html">人物</a></nav></div></header><main><div class="breadcrumbs"><a href="'+prefix+'index.html">トップ</a> › 裁判例・判決 全件一覧</div><section class="panel"><h1>'+h(title)+'</h1><p class="summary">掲載中の裁判例を静的HTMLの一覧から辿れます。検索エンジンからも各事件ページを発見しやすい構成です。</p><div class="meta">全 '+allCasesSorted.length+'件 · '+pageNo+' / '+allCasesTotalPages+'ページ</div><p>'+pageLinks+'</p></section><section class="panel"><ul class="list">'+items+'</ul></section><section class="panel"><p>'+pageLinks+'</p></section></main><footer><a href="'+prefix+'all-cases.html">全裁判一覧</a> · <a href="'+prefix+'latest.html">新着</a> · <a href="'+prefix+'topics.html">テーマ別</a> · <a href="'+prefix+'people.html">人物一覧</a> · <a href="'+prefix+'courts.html">裁判所別</a> · <a href="'+prefix+'years.html">年別</a><br>公開資料をもとに整理した裁判例一覧です。</footer></body></html>';
}
fs.writeFileSync("all-cases.html",allCasesPage(1));
for(let pageNo=2;pageNo<=allCasesTotalPages;pageNo++) fs.writeFileSync("case-archive/page-"+pageNo+".html",allCasesPage(pageNo));

function topicPage(t,rows){
  const items=rows.slice(0,300).map(c=>'<li><a href="../cases/'+encodeURIComponent(c.slug)+'.html"><strong>'+h(c.title)+'</strong></a><div class="meta">'+h(c.court||"")+(c.event_date?" · "+h(c.event_date):"")+(c.judgment_result?" · "+h(txt(c.judgment_result,180)):"")+'</div>'+(c.summary?'<div class="note" style="margin-top:4px">'+h(txt(c.summary,190))+'</div>':"")+'</li>').join("");
  const url="https://saibanwatch.github.io/topics/"+t.slug+".html";
  const title=t.name+" - 判決・裁判例一覧";
  const topicJson=JSON.stringify({"@context":"https://schema.org","@graph":[{"@type":"CollectionPage","name":title,"url":url,"description":t.desc,"isPartOf":{"@type":"WebSite","name":"裁判ウォッチ","url":"https://saibanwatch.github.io/"}},{"@type":"BreadcrumbList","itemListElement":[{"@type":"ListItem","position":1,"name":"裁判ウォッチ","item":"https://saibanwatch.github.io/"},{"@type":"ListItem","position":2,"name":"事件テーマ","item":"https://saibanwatch.github.io/topics.html"},{"@type":"ListItem","position":3,"name":t.name,"item":url}]}]}).replace(/</g,"\\u003c");
  return '<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>'+h(title)+' | 裁判ウォッチ</title><meta name="description" content="'+h(t.desc)+'"><meta name="robots" content="index,follow"><link rel="canonical" href="'+url+'"><link rel="alternate" type="application/rss+xml" title="裁判ウォッチ 新着裁判" href="../feed.xml"><link rel="icon" href="../favicon.svg" type="image/svg+xml"><link rel="stylesheet" href="../seo.css"><script src="../analytics.js" defer></script><meta property="og:type" content="website"><meta property="og:site_name" content="裁判ウォッチ"><meta property="og:title" content="'+h(title)+' | 裁判ウォッチ"><meta property="og:description" content="'+h(t.desc)+'"><meta property="og:url" content="'+url+'"><meta name="twitter:card" content="summary"><script type="application/ld+json">'+topicJson+'</script></head><body><header><div class="nav"><a class="brand" href="../index.html">裁判ウォッチ</a><nav class="navlinks"><a href="../criminal.html">刑事</a><a href="../civil.html">民事</a><a href="../administrative.html">行政</a><a href="../topics.html">テーマ</a><a href="../people.html">人物</a></nav></div></header><main><div class="breadcrumbs"><a href="../index.html">トップ</a> › <a href="../topics.html">事件テーマ</a> › '+h(t.name)+'</div><section class="panel"><h1>'+h(title)+'</h1><p class="summary">'+h(t.desc)+'</p><div class="meta">掲載対象 '+rows.length+'件 · 公開資料の事件名・概要・判決等に該当語が確認できたもの</div></section><section class="panel"><h2>'+h(t.name)+'の掲載裁判</h2><ul class="list">'+items+'</ul></section><section class="panel"><h2>ほかのテーマ</h2><p><a href="../topics.html">事件テーマ一覧を見る</a></p></section></main><footer>各事件ページから原資料・関係者・みんなの意見を確認できます。</footer></body></html>';
}
const topicRows=topicDefs.map(t=>({...t,rows:cases.filter(t.match).sort(byDate)})).filter(t=>t.rows.length>=3);
for(const t of topicRows) fs.writeFileSync("topics/"+t.slug+".html",topicPage(t,t.rows));
const topicsIndexJson=JSON.stringify({"@context":"https://schema.org","@graph":[{"@type":"CollectionPage","name":"事件テーマ別の裁判・判決一覧","url":"https://saibanwatch.github.io/topics.html","isPartOf":{"@type":"WebSite","name":"裁判ウォッチ","url":"https://saibanwatch.github.io/"}},{"@type":"BreadcrumbList","itemListElement":[{"@type":"ListItem","position":1,"name":"裁判ウォッチ","item":"https://saibanwatch.github.io/"},{"@type":"ListItem","position":2,"name":"事件テーマ","item":"https://saibanwatch.github.io/topics.html"}]},{"@type":"ItemList","name":"事件テーマ","itemListElement":topicRows.map((t,i)=>({"@type":"ListItem","position":i+1,"name":t.name,"url":"https://saibanwatch.github.io/topics/"+t.slug+".html"}))}]}).replace(/</g,"\\u003c");
const topicCards=topicRows.map(t=>'<li><a href="topics/'+t.slug+'.html"><strong>'+h(t.name)+'</strong></a><div class="meta">'+t.rows.length+'件</div><div class="note" style="margin-top:4px">'+h(t.desc)+'</div></li>').join("");
fs.writeFileSync("topics.html",'<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>事件テーマ別の裁判・判決一覧 | 裁判ウォッチ</title><meta name="description" content="殺人、詐欺、性犯罪、交通事故、労働、医療、相続、行政訴訟、執行猶予など、罪名・争点・判決結果から裁判例を探せます。"><meta name="robots" content="index,follow"><link rel="canonical" href="https://saibanwatch.github.io/topics.html"><link rel="alternate" type="application/rss+xml" title="裁判ウォッチ 新着裁判" href="feed.xml"><link rel="icon" href="favicon.svg" type="image/svg+xml"><link rel="stylesheet" href="seo.css"><script src="analytics.js" defer></script><meta property="og:type" content="website"><meta property="og:site_name" content="裁判ウォッチ"><meta property="og:title" content="事件テーマ別の裁判・判決一覧 | 裁判ウォッチ"><meta property="og:description" content="殺人、詐欺、性犯罪、交通事故、労働、医療、相続、行政訴訟、執行猶予などテーマ別に裁判例を探せます。"><meta property="og:url" content="https://saibanwatch.github.io/topics.html"><meta name="twitter:card" content="summary"><script type="application/ld+json">'+topicsIndexJson+'</script></head><body><header><div class="nav"><a class="brand" href="index.html">裁判ウォッチ</a><nav class="navlinks"><a href="criminal.html">刑事</a><a href="civil.html">民事</a><a href="administrative.html">行政</a><a href="people.html">人物</a></nav></div></header><main><div class="breadcrumbs"><a href="index.html">トップ</a> › 事件テーマ</div><section class="panel"><h1>事件テーマ別の裁判・判決一覧</h1><p class="summary">罪名・争点・分野から掲載裁判例を探せます。各ページでは裁判所、判決日、判決結果、事件概要から個別事件へ移動できます。</p></section><section class="panel"><ul class="list">'+topicCards+'</ul></section></main><footer>テーマ分類は公開資料の事件名・概要・判決等に含まれる語をもとに自動整理しています。</footer></body></html>');


function collectionListPage(opts){
  const {url,title,desc,rows,prefix="",extra=""}=opts;
  const items=rows.slice(0,300).map(c=>'<li><a href="'+prefix+'cases/'+encodeURIComponent(c.slug)+'.html"><strong>'+h(c.title)+'</strong></a><div class="meta">'+h(c.category||"")+(c.court?" · "+h(c.court):"")+(c.event_date?" · "+h(c.event_date):"")+(c.judgment_result?" · "+h(txt(c.judgment_result,180)):"")+'</div>'+(c.summary?'<div class="note" style="margin-top:4px">'+h(txt(c.summary,190))+'</div>':"")+'</li>').join("");
  const json=JSON.stringify({"@context":"https://schema.org","@type":"CollectionPage","name":title,"url":url,"description":desc,"isPartOf":{"@type":"WebSite","name":"裁判ウォッチ","url":"https://saibanwatch.github.io/"}}).replace(/</g,"\\u003c");
  return '<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>'+h(title)+' | 裁判ウォッチ</title><meta name="description" content="'+h(desc)+'"><meta name="robots" content="index,follow"><link rel="canonical" href="'+h(url)+'"><link rel="stylesheet" href="'+prefix+'seo.css"><script src="'+prefix+'analytics.js" defer></script><meta property="og:type" content="website"><meta property="og:site_name" content="裁判ウォッチ"><meta property="og:title" content="'+h(title)+' | 裁判ウォッチ"><meta property="og:description" content="'+h(desc)+'"><meta property="og:url" content="'+h(url)+'"><meta name="twitter:card" content="summary"><script type="application/ld+json">'+json+'</script></head><body><header><div class="nav"><a class="brand" href="'+prefix+'index.html">裁判ウォッチ</a><nav class="navlinks"><a href="'+prefix+'courts.html">裁判所別</a><a href="'+prefix+'years.html">年別</a><a href="'+prefix+'topics.html">テーマ</a><a href="'+prefix+'people.html">人物</a></nav></div></header><main><div class="breadcrumbs"><a href="'+prefix+'index.html">トップ</a> › '+h(title)+'</div><section class="panel"><h1>'+h(title)+'</h1><p class="summary">'+h(desc)+'</p><div class="meta">掲載対象 '+rows.length+'件</div>'+extra+'</section><section class="panel"><ul class="list">'+items+'</ul></section></main><footer>各事件ページから原資料・関係者・みんなの意見を確認できます。</footer></body></html>';
}

for(const d of courtDefs){
  const counts={criminal:d.rows.filter(c=>c.category==="刑事").length,civil:d.rows.filter(c=>c.category==="民事").length,administrative:d.rows.filter(c=>c.category==="行政").length};
  const desc=d.name+"の掲載裁判例を、判決日・事件概要・判決結果とともに確認できます。";
  const extra='<p class="meta">刑事 '+counts.criminal+'件 · 民事 '+counts.civil+'件 · 行政 '+counts.administrative+'件</p>';
  fs.writeFileSync("courts/"+d.slug+".html",collectionListPage({url:"https://saibanwatch.github.io/courts/"+d.slug+".html",title:d.name+"の裁判・判決一覧",desc,rows:d.rows,prefix:"../",extra}));
}
const courtCards=courtDefs.map(d=>'<li><a href="courts/'+d.slug+'.html"><strong>'+h(d.name)+'</strong></a><div class="meta">'+d.rows.length+'件</div></li>').join("");
fs.writeFileSync("courts.html",'<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>裁判所別の裁判・判決一覧 | 裁判ウォッチ</title><meta name="description" content="最高裁、高裁、地裁など裁判所別に掲載裁判例・判決を探せます。"><meta name="robots" content="index,follow"><link rel="canonical" href="https://saibanwatch.github.io/courts.html"><link rel="stylesheet" href="seo.css"><script src="analytics.js" defer></script></head><body><header><div class="nav"><a class="brand" href="index.html">裁判ウォッチ</a><nav class="navlinks"><a href="years.html">年別</a><a href="topics.html">テーマ</a><a href="people.html">人物</a></nav></div></header><main><div class="breadcrumbs"><a href="index.html">トップ</a> › 裁判所別</div><section class="panel"><h1>裁判所別の裁判・判決一覧</h1><p class="summary">掲載件数が5件以上ある裁判所を一覧にしています。</p></section><section class="panel"><ul class="list">'+courtCards+'</ul></section></main><footer>裁判所名は公開資料の表記をもとに整理しています。</footer></body></html>');

for(const d of yearDefs){
  const counts={criminal:d.rows.filter(c=>c.category==="刑事").length,civil:d.rows.filter(c=>c.category==="民事").length,administrative:d.rows.filter(c=>c.category==="行政").length};
  const desc=d.year+"年に掲載された裁判例・判決を、裁判所・事件概要・判決結果とともに確認できます。";
  const extra='<p class="meta">刑事 '+counts.criminal+'件 · 民事 '+counts.civil+'件 · 行政 '+counts.administrative+'件</p>';
  fs.writeFileSync("years/"+d.year+".html",collectionListPage({url:"https://saibanwatch.github.io/years/"+d.year+".html",title:d.year+"年の裁判・判決一覧",desc,rows:d.rows,prefix:"../",extra}));
}
const yearCards=yearDefs.map(d=>'<li><a href="years/'+d.year+'.html"><strong>'+h(d.year)+'年の裁判・判決</strong></a><div class="meta">'+d.rows.length+'件</div></li>').join("");
fs.writeFileSync("years.html",'<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>年別の裁判・判決一覧 | 裁判ウォッチ</title><meta name="description" content="年別に掲載裁判例・判決を探せます。各年の刑事・民事・行政裁判を一覧で確認できます。"><meta name="robots" content="index,follow"><link rel="canonical" href="https://saibanwatch.github.io/years.html"><link rel="stylesheet" href="seo.css"><script src="analytics.js" defer></script></head><body><header><div class="nav"><a class="brand" href="index.html">裁判ウォッチ</a><nav class="navlinks"><a href="courts.html">裁判所別</a><a href="topics.html">テーマ</a><a href="people.html">人物</a></nav></div></header><main><div class="breadcrumbs"><a href="index.html">トップ</a> › 年別</div><section class="panel"><h1>年別の裁判・判決一覧</h1><p class="summary">掲載件数が10件以上ある年を一覧にしています。</p></section><section class="panel"><ul class="list">'+yearCards+'</ul></section></main><footer>公開資料に記録された日付をもとに年別に整理しています。</footer></body></html>');

function rssDate(v){
  const d=new Date(v||"");
  return Number.isNaN(d.getTime())?"":d.toUTCString();
}
const feedCases=[...cases].sort(byUpdated).slice(0,50);
const feedItems=feedCases.map(c=>{
  const link="https://saibanwatch.github.io/cases/"+encodeURIComponent(c.slug)+".html";
  const d=txt([c.category,c.court,c.event_date?jpdate(c.event_date):"",c.judgment_result?"判決："+c.judgment_result:"",c.summary].filter(Boolean).join(" · "),700);
  const pub=rssDate(c.updated_at||c.event_date);
  return "<item><title>"+xml(c.title)+"</title><link>"+xml(link)+"</link><guid isPermaLink=\"true\">"+xml(link)+"</guid>"+(pub?"<pubDate>"+xml(pub)+"</pubDate>":"")+"<description>"+xml(d)+"</description></item>";
}).join("\n");
const newestFeedDate=feedCases.length?rssDate(feedCases[0].updated_at||feedCases[0].event_date):"";
const feedXml='<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom"><channel><title>裁判ウォッチ 新着裁判</title><link>https://saibanwatch.github.io/</link><description>裁判ウォッチに追加・更新された裁判例、判決、求刑、事件情報の新着一覧です。</description><language>ja</language><atom:link href="https://saibanwatch.github.io/feed.xml" rel="self" type="application/rss+xml"/>'+(newestFeedDate?'<lastBuildDate>'+xml(newestFeedDate)+'</lastBuildDate>':'')+feedItems+'</channel></rss>\n';
fs.writeFileSync("feed.xml",feedXml);

function urlset(rows){return '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'+rows.map(r=>'  <url><loc>'+xml(r.loc)+'</loc>'+(r.lastmod?'<lastmod>'+r.lastmod+'</lastmod>':'')+'</url>').join('\n')+'\n</urlset>\n'}
const caseMap=cases.map(c=>({loc:"https://saibanwatch.github.io/cases/"+encodeURIComponent(c.slug)+".html",lastmod:String(c.updated_at||"").slice(0,10)}));
const peopleMap=[{loc:"https://saibanwatch.github.io/people.html"},...people.map(p=>({loc:"https://saibanwatch.github.io/people/"+encodeURIComponent(p.id)+".html",lastmod:String(p.created_at||"").slice(0,10)}))];
const topicMap=[{loc:"https://saibanwatch.github.io/topics.html"},...topicRows.map(t=>({loc:"https://saibanwatch.github.io/topics/"+t.slug+".html"}))];
const courtMap=[{loc:"https://saibanwatch.github.io/courts.html"},...courtDefs.map(d=>({loc:"https://saibanwatch.github.io/courts/"+d.slug+".html"}))];
const yearMap=[{loc:"https://saibanwatch.github.io/years.html"},...yearDefs.map(d=>({loc:"https://saibanwatch.github.io/years/"+d.year+".html"}))];
const archiveUrls=[{loc:"https://saibanwatch.github.io/all-cases.html"},...Array.from({length:Math.max(0,allCasesTotalPages-1)},(_,i)=>({loc:"https://saibanwatch.github.io/case-archive/page-"+(i+2)+".html"}))];
const staticUrls=["https://saibanwatch.github.io/","https://saibanwatch.github.io/courts.html","https://saibanwatch.github.io/years.html","https://saibanwatch.github.io/criminal.html","https://saibanwatch.github.io/civil.html","https://saibanwatch.github.io/administrative.html","https://saibanwatch.github.io/acquittals.html","https://saibanwatch.github.io/sentencing.html","https://saibanwatch.github.io/latest.html","https://saibanwatch.github.io/popular.html","https://saibanwatch.github.io/topics.html","https://saibanwatch.github.io/terms.html","https://saibanwatch.github.io/community-guidelines.html","https://saibanwatch.github.io/privacy.html","https://saibanwatch.github.io/disclaimer.html","https://saibanwatch.github.io/contact.html","https://saibanwatch.github.io/advertising.html","https://saibanwatch.github.io/guides.html","https://saibanwatch.github.io/guides/sentencing-request.html","https://saibanwatch.github.io/guides/suspended-sentence.html","https://saibanwatch.github.io/guides/appeal.html","https://saibanwatch.github.io/guides/final-appeal.html","https://saibanwatch.github.io/guides/imprisonment.html","https://saibanwatch.github.io/guides/acquittal.html","https://saibanwatch.github.io/guides/nonconsensual-sex.html","https://saibanwatch.github.io/guides/bail.html","https://saibanwatch.github.io/guides/criminal-trial-flow.html","https://saibanwatch.github.io/guides/sentencing-factors.html","https://saibanwatch.github.io/guides/first-offense-suspended-sentence.html","https://saibanwatch.github.io/guides/prison-sentence.html","https://saibanwatch.github.io/guides/summary-order.html","https://saibanwatch.github.io/guides/indictment-nonprosecution.html"].map(loc=>({loc}));
fs.writeFileSync("sitemaps/cases.xml",urlset(caseMap));
fs.writeFileSync("sitemaps/people.xml",urlset(peopleMap));
fs.writeFileSync("sitemaps/topics.xml",urlset(topicMap));
fs.writeFileSync("sitemaps/courts.xml",urlset(courtMap));
fs.writeFileSync("sitemaps/years.xml",urlset(yearMap));
fs.writeFileSync("sitemaps/static.xml",urlset(staticUrls));
const allMap=[...caseMap,...peopleMap,...topicMap,...courtMap,...yearMap,...archiveUrls,...staticUrls];
const seen=new Set();
const rootMap=allMap.filter(r=>r&&r.loc&&!seen.has(r.loc)&&seen.add(r.loc));
fs.writeFileSync("sitemap.xml",urlset(rootMap));
fs.writeFileSync("sitemap.txt",rootMap.map(r=>r.loc).join("\n")+"\n");
console.log("Generated",cases.length,"case pages,",people.length,"person pages,",topicRows.length,"topic pages,",courtDefs.length,"court pages and",yearDefs.length,"year pages");

// refresh-trigger: 2026-09-21-new-people




// profile-refresh-trigger: 2026-09-22-person-timeline-related




// claim-refresh-trigger: 2026-09-22-editorial-batch-30-retry

// crawl-navigation-refresh: 2026-09-28
