const fs=require('node:fs');
const h=fs.readFileSync('index.html','utf8');
const source=h.match(/<script>([\s\S]*?)<\/script>/)[1];
(async()=>{

const assert=(v,msg)=>{if(!v)throw Error(msg)},near=(a,b)=>assert(Math.abs(a-b)<1e-7,a+" != "+b);
class E{constructor(){this.value="";this.checked=false;this.children=[];this.style={};this.attrs={};this.handlers={};this.classList={toggle(){},add(){},remove(){}}}set textContent(v){this.content=String(v);this.children=[]}get textContent(){return this.content||""}appendChild(v){this.children.push(v);return v}setAttribute(k,v){this.attrs[k]=v}getAttribute(k){return this.attrs[k]}addEventListener(k,f){this.handlers[k]=f}click(){this.handlers.click?.({target:this});return this.onclick?.()}remove(){}}
class TestBlob{constructor(chunks){this.content=chunks.join("")}}
class Reader{readAsText(file){this.result=file.text;this.onload()}}
class Controller{constructor(){this.signal={}}abort(){}}
const server={rows:new Map(),online:true,failWrite:false,requests:[],users:new Map()};
function session(uid,email){return {access_token:"access-"+uid,refresh_token:"refresh-"+uid,expires_in:3600,user:{id:uid,email:email}}}
function response(data,status){return {ok:status<400,status:status||200,json:async()=>data}}
async function network(url,o){
 server.requests.push({url,...o});
 if(!server.online)throw Error("Failed to fetch");
 const path=url.replace("https://idouezljdxvzkzeqhuau.supabase.co",""),body=o.body?JSON.parse(o.body):null,token=o.headers.Authorization||"",uid=token.replace("Bearer access-","");
 if(path.startsWith("/auth/v1/signup")||path.includes("grant_type=password")){
 if(body.password!=="test-password")return response({message:"Invalid login credentials"},400);
 const uid=body.email==="a@example.com"?"user-a":"user-b";server.users.set(uid,body.email);return response(session(uid,body.email),200)}
 if(path.includes("grant_type=refresh_token")){const u=body.refresh_token.replace("refresh-","");return response(session(u,server.users.get(u)),200)}
 if(path.startsWith("/auth/v1/logout"))return response(null,204);
 if(!server.users.has(uid))return response({message:"JWT expired"},401);
 if(path.startsWith("/rest/v1/sandwich_accounts")){
   const query=/user_id=eq.([^&]+)/.exec(path)[1];return response(query===uid&&server.rows.has(uid)?[JSON.parse(JSON.stringify(server.rows.get(uid)))]:[],200)}
 if(path==="/rest/v1/rpc/sandwich_save"){
   if(server.failWrite)return response({message:"temporary failure"},503);
   if(server.rpcRace){const race=server.rpcRace;server.rpcRace=null;race(uid)}
   const old=server.rows.get(uid);if((old?old.revision:0)!==body.p_expected_revision)return response({message:"SYNC_CONFLICT"},409);
   const row={state:body.p_state,revision:(old?old.revision:0)+1,updated_at:new Date().toISOString()};server.rows.set(uid,JSON.parse(JSON.stringify(row)));return response({revision:row.revision,updated_at:row.updated_at},200)}
 throw Error("Unexpected endpoint "+path);
}
function device(existing){
 const elems={};for(const m of h.matchAll(/id="([^"]+)"/g))elems[m[1]]=new E();
 const doc={getElementById:id=>{assert(elems[id],"Missing element "+id);return elems[id]},createElement:()=>new E(),querySelectorAll:()=>elems.engineTabs.children,addEventListener(){},hidden:false,body:new E(),activeElement:null};
 const memory=new Map(existing||[]),ls={getItem:k=>memory.get(k)||null,setItem:(k,v)=>memory.set(k,v),removeItem:k=>memory.delete(k)};let confirm=true;
 const win={addEventListener(){},setInterval(){},clearInterval(){},confirm:()=>confirm,alert(){},scrollTo(){}};
 let backup=null;const testURL={createObjectURL:b=>{backup=b;return "blob:1"},revokeObjectURL(){}};
 const script=source.replace(/\}\)\(\);\s*$/,'return {state:()=>state,set:v=>state=normalizeState(v),derive:getDerivedState,tp:getTakeProfitInfo,atr:calculateAtrFromDaily,render,updateForm,load:loadState,save:saveState,normalize:normalizeState,login:cloudAuthenticate,work:cloudWork,choose:cloudChoose,logout:cloudLogout,meta:()=>cloudMeta,session:()=>cloudSession,conflict:()=>cloudConflict,remote:()=>cloudRemote};})();').replace("(function(){","return (function(){");
 const t=new Function("document","window","localStorage","navigator","setTimeout","clearTimeout","fetch","FileReader","URL","Blob","AbortController",script)(doc,win,ls,{clipboard:{writeText:async()=>{}}},()=>0,()=>{},network,Reader,testURL,TestBlob,Controller);
 return {t,elems,memory,doc,setConfirm:v=>confirm=v,backup:()=>backup};
}
async function login(d,email){d.elems.cloudEmail.value=email;d.elems.cloudPassword.value="test-password";await d.t.login(false)}
const A=device();near(A.t.derive().setAmount,80000/180);assert(A.elems.engineRows.children.length===30,"30 rows");for(const row of A.t.derive().engines.flatMap(e=>e.rows))assert(row.quantity===Math.floor((80000/180)/row.buyPrice),"integer shares");
await login(A,"a@example.com");assert(!A.t.meta().linked&&A.elems.cloudChoices.hidden===false,"first link requires choice");
await A.t.choose(true);assert(A.t.meta().linked&&server.rows.get("user-a").revision===1,"first cloud save");
assert(A.elems.cloudPassword.value==="","password cleared");assert(!Array.from(A.memory.values()).join("").includes("test-password"),"password not persisted");
const B=device();B.t.state().currentCapital=90000;B.t.state().engineCount=4;B.t.render();B.t.save();await login(B,"a@example.com");assert(!B.t.meta().linked,"different local data awaits choice");await B.t.choose(false);near(B.t.state().currentCapital,80000);assert(B.t.state().engineCount===6,"pull all settings");const initialBackup=JSON.parse(B.memory.get("sandwich-before-cloud-import-v1"));assert(initialBackup.state.engineCount===4,"pre-import backup");
A.t.state().engineCount=8;A.t.state().totalRealizedProfit=123.5;A.t.save();await A.t.work(false);assert(server.rows.get("user-a").revision===2,"automatic save CAS");await B.t.work(false);assert(B.t.state().engineCount===8&&B.t.state().totalRealizedProfit===123.5,"second device pull");assert(!B.elems["page-table"].hidden,"view preserved");
server.online=false;B.t.state().currentCapital=95000;B.t.save();await B.t.work(false);near(B.t.load().currentCapital,95000);assert(B.t.meta().revision===2,"offline no fake cloud success");server.online=true;
A.t.state().currentCapital=88000;A.t.save();await A.t.work(false);assert(server.rows.get("user-a").revision===3,"other device edit");await B.t.work(false);assert(B.t.conflict(),"conflict detected");near(B.t.state().currentCapital,95000);near(server.rows.get("user-a").state.currentCapital,88000);
A.t.state().setsPerEngine=31;A.t.save();await A.t.work(false);await B.t.choose(true);assert(B.t.conflict()&&server.rows.get("user-a").revision===4,"stale overwrite choice blocked");await B.t.choose(false);assert(!B.t.conflict(),"resolve with remote");near(B.t.state().currentCapital,88000);assert(B.t.state().setsPerEngine===31,"latest remote accepted");
B.doc.activeElement={tagName:"INPUT"};A.t.state().refHigh=310;A.t.save();await A.t.work(false);await B.t.work(false);assert(B.t.state().refHigh===278,"defer pull during input");B.doc.activeElement=null;await B.t.work(false);assert(B.t.state().refHigh===310,"pull after input");
B.t.state().currentCapital=99000;B.t.save();const restarted=device(B.memory);for(let i=0;i<40;i++)await Promise.resolve();await restarted.t.work(true);assert(restarted.t.session().user.id==="user-a","session restored");await restarted.t.work(true);near(server.rows.get("user-a").state.currentCapital,99000);assert(restarted.t.meta().linked,"unsynced edit survives reload");
restarted.t.session().expires_at=0;await restarted.t.work(true);assert(restarted.t.session().expires_at>Date.now()/1000,"token refresh");
await restarted.t.logout();assert(restarted.t.session()===null,"logout");near(restarted.t.state().currentCapital,99000);await login(restarted,"b@example.com");assert(!restarted.t.meta().linked,"new user explicit choice");assert(!server.rows.has("user-b"),"no auto upload into other account");await restarted.t.choose(true);assert(server.rows.get("user-b").state.currentCapital===99000,"explicit account init");
// A server-side revision check rejects a race after the preliminary GET.
await A.t.work(true);A.t.state().totalRealizedProfit=500;A.t.save();
server.rpcRace=function(uid){const row=server.rows.get(uid);row.revision++;row.state.totalRealizedProfit=777;};
await A.t.work(false);assert(A.t.conflict(),"CAS race rejected by RPC");assert(server.rows.get("user-a").state.totalRealizedProfit===777,"no lost update");assert(A.t.state().totalRealizedProfit===500,"racing local change retained");await A.t.choose(false);assert(A.t.state().totalRealizedProfit===777,"race resolution");
const noKey=device();noKey.t.state().atr14=2.4;noKey.t.state().atrPrevClose=40;near(noKey.t.tp().effectivePct,7.5);for(const count of [1,5,20]){noKey.elems.engineCount.value=String(count);noKey.elems.engineCount.handlers.input();assert(noKey.elems.engineTabs.children.length===count,"dynamic tabs");near(noKey.t.derive().setAmount,80000/(count*30))}
for(const page of ["overview","table","settings","data"]){noKey.elems["menu-"+page].click();for(const other of ["overview","table","settings","data"])assert(noKey.elems["page-"+other].hidden===(other!==page),"page isolation")}
noKey.elems.backupBtn.click();const exported=JSON.parse(noKey.backup().content);assert(!JSON.stringify(exported).includes("access_token")&&!JSON.stringify(exported).includes("publishable"),"strategy backups exclude credentials");
assert(server.requests.filter(r=>r.url.includes("/rest/")).every(r=>r.headers.Authorization&&r.headers.apikey.startsWith("sb_publishable_")),"authenticated REST headers");
return {pass:true,tests:"two-device sign-in, first import choices, password isolation, automatic CAS save/pull, offline edits, conflicts, stale-choice guard, input-focus protection, reload recovery, refresh token, account switching, retained local backups, auth headers, calculator, menus, secret-free JSON"};

})().then(r=>console.log('PASS',r.tests)).catch(e=>{console.error(e);process.exitCode=1});
