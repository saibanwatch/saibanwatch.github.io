(function(){
"use strict";
function init(sb){
 const root=document.querySelector("[data-person-vote-id]");
 if(!root||root.dataset.voteReady)return;
 root.dataset.voteReady="true";
 const id=root.getAttribute("data-person-vote-id");
 const buttons=Array.from(root.querySelectorAll("[data-person-vote-choice]"));
 const good=root.querySelector("[data-person-good-count]");
 const bad=root.querySelector("[data-person-bad-count]");
 const note=root.querySelector("[data-person-vote-note]");
 const dialog=root.querySelector("dialog");
 const form=dialog.querySelector("form");
 const status=root.querySelector("[data-person-login-status]");
 const close=root.querySelector("[data-person-login-close]");
 const loginButton=form.querySelector('button[type="submit"]');
 let user=null,pendingChoice=null,busy=false;
 function setBusy(value){busy=value;for(const b of buttons)b.disabled=value;}
 async function refresh(){
   const {data,error}=await sb.rpc("person_opinion_poll",{p_target_type:"person",p_target_id:id});
   if(error){console.error(error);note.textContent="投票結果を読み込めませんでした。";return;}
   const row=(data||[])[0]||{};
   good.textContent=(row.good_count||0)+"票";
   bad.textContent=(row.bad_count||0)+"票";
   for(const b of buttons){
     const selected=b.dataset.personVoteChoice===row.my_vote;
     b.classList.toggle("selected",selected);
     b.setAttribute("aria-pressed",selected?"true":"false");
   }
   note.textContent=user?(row.my_vote?"投票済みです。選び直せます。":"1人1票。あとから変更できます。"):"ログインすると投票できます。";
 }
 async function cast(choice){
   if(busy)return;
   setBusy(true);note.textContent="投票中…";
   try{
     const {error}=await sb.rpc("cast_person_opinion_vote",{p_target_type:"person",p_target_id:id,p_choice:choice});
     if(error)throw error;
     window.COURTWATCH_ANALYTICS?.track("vote_complete","person_opinion");
     await refresh();
   }catch(e){console.error(e);note.textContent="投票できませんでした。時間をおいて再度お試しください。";}
   finally{setBusy(false);}
 }
 async function choose(choice){
   if(busy)return;
   setBusy(true);
   let result;
   try{result=await sb.auth.getUser();}catch(e){console.error(e);note.textContent="ログイン状態を確認できませんでした。";setBusy(false);return;}
   setBusy(false);
   if(result.error){note.textContent="ログイン状態を確認できませんでした。";return;}
   user=result.data?.user||null;
   if(!user){pendingChoice=choice;status.textContent="";dialog.showModal();return;}
   await cast(choice);
 }
 for(const b of buttons){b.setAttribute("aria-pressed","false");b.addEventListener("click",()=>choose(b.dataset.personVoteChoice));}
 close.addEventListener("click",()=>dialog.close());
 dialog.addEventListener("close",()=>{pendingChoice=null;form.reset();status.textContent="";});
 form.addEventListener("submit",async event=>{
   event.preventDefault();
   if(loginButton.disabled)return;
   const email=form.elements.namedItem("email").value.trim();
   const password=form.elements.namedItem("password").value;
   if(!email||!password){status.textContent="メールアドレスとパスワードを入力してください。";return;}
   loginButton.disabled=true;status.textContent="ログイン中…";
   try{
     const {data,error}=await sb.auth.signInWithPassword({email,password});
     if(error||!data.user){status.textContent="ログインできませんでした。入力内容を確認してください。";return;}
     user=data.user;const choice=pendingChoice;dialog.close();
     if(choice)await cast(choice);else await refresh();
   }catch(e){console.error(e);status.textContent="ログインできませんでした。";}
   finally{loginButton.disabled=false;}
 });
 sb.auth.getUser().then(({data})=>{user=data?.user||null;return refresh();}).catch(e=>{console.error(e);note.textContent="投票情報を読み込めませんでした。";});
 sb.auth.onAuthStateChange((_event,session)=>{user=session?.user||null;Promise.resolve().then(()=>refresh());});
}
window.COURTWATCH_PERSON_VOTE={init};
})();
