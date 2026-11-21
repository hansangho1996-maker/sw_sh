// 엔진 하락폭 · 엔진별 세트 수 · 계좌 배정 · 연말 절세 계산 검증 (패키지 설치 없음)
// 실행: node tests/strategy.test.cjs
const fs=require('node:fs');
const h=fs.readFileSync('index.html','utf8');
const source=h.match(/<script>([\s\S]*?)<\/script>/)[1];
const assert=(v,msg)=>{if(!v)throw Error(msg)};
const near=(a,b,msg,tol)=>assert(Math.abs(a-b)<(tol||1e-7),(msg||"")+" "+a+" != "+b);

class E{constructor(){this.value="";this.checked=false;this.children=[];this.style={};this.attrs={};this.handlers={};this.className="";this.classList={toggle(){},add(){},remove(){}}}
 set textContent(v){this.content=String(v);this.children=[]}get textContent(){return this.content||""}
 appendChild(v){this.children.push(v);return v}setAttribute(k,v){this.attrs[k]=v}getAttribute(k){return this.attrs[k]}
 addEventListener(k,f){this.handlers[k]=f}click(){this.handlers.click?.({target:this});return this.onclick?.()}remove(){}}
function device(){
 const elems={};for(const m of h.matchAll(/id="([^"]+)"/g))elems[m[1]]=new E();
 const doc={getElementById:id=>{assert(elems[id],"Missing element "+id);return elems[id]},createElement:()=>new E(),querySelectorAll:()=>elems.engineTabs.children,addEventListener(){},hidden:false,body:new E(),activeElement:null};
 const memory=new Map(),ls={getItem:k=>memory.get(k)||null,setItem:(k,v)=>memory.set(k,v),removeItem:k=>memory.delete(k)};
 const win={addEventListener(){},setInterval(){},clearInterval(){},confirm:()=>true,alert(){},scrollTo(){}};
 const script=source.replace(/\}\)\(\);\s*$/,'return {state:()=>state,derive:getDerivedState,render,updateForm,normalize:normalizeState,plan:computeTaxPlan,dates:harvestDates,validateRow:cloudValidateRow,fields:CLOUD_FIELDS};})();').replace("(function(){","return (function(){");
 const t=new Function("document","window","localStorage","navigator","setTimeout","clearTimeout","fetch","FileReader","URL","Blob","AbortController",script)
   (doc,win,ls,{},()=>0,()=>{},async()=>{throw Error("offline")},class{},{createObjectURL(){return""},revokeObjectURL(){}},class{},class{constructor(){this.signal={}}abort(){}});
 return {t,elems};
}
const results=[];
function test(name,fn){fn();results.push(name)}

// 1. 기본값은 기존 공식과 완전히 같다 (회귀)
test("grid: first set at engine start, 0.6/0.4 steps",()=>{
 const {t}=device();const d=t.derive();
 assert(d.totalSets===180,"180 sets");near(d.setAmount,80000/180,"set amount");
 for(const e of d.engines){const start=278*Math.pow(0.6,e.index);near(e.start,start,"start");near(e.end,start*0.6,"end");
   e.rows.forEach((r,i)=>{const buy=start*(1-0.4*i/30);near(r.buyPrice,buy,"buy");assert(r.quantity===Math.floor((80000/180)/buy),"qty")})}
 near(d.bottomPrice,278*Math.pow(0.6,5)*(1-0.4*29/30),"bottom");near(d.engines[4].start,36.0288,"E5 start",1e-9);
});

// 2. 엔진 하락폭 50%
test("engine drop 50%",()=>{
 const {t}=device();t.state().engineDropPct=50;const d=t.derive();
 near(d.engines[1].start,139,"E2 start");near(d.bottomPrice,278*Math.pow(0.5,5)*(1-0.5*29/30),"bottom");
 near(d.engines[0].rows[0].buyPrice,278,"E1-01");near(d.engines[0].rows[1].buyPrice,278*(1-0.5/30),"E1-02");near(d.engines[0].end,139,"E1 end");
});

// 3. 엔진별 세트 수 30,30,30,30,10,10 → 엔진마다 같은 금액, 10세트 매수선 = 30세트의 3칸마다
test("per-engine sets override keeps equal capital per engine",()=>{
 const {t}=device();const base=t.derive();
 t.state().engineSetsOverride="30,30,30,30,10,10";const d=t.derive();
 assert(d.totalSets===140,"140 sets");assert(d.setsOverridden,"overridden");
 near(d.engines[0].setAmount,80000/6/30,"E1 set amount");near(d.engines[4].setAmount,80000/6/10,"E5 set amount");
 near(d.totalGoalAllocation,80000,"total 80k",1e-6);
 for(let k=0;k<10;k++)near(d.engines[4].rows[k].buyPrice,base.engines[4].rows[3*k].buyPrice,"E5 line "+k);
 near(d.engines[5].rows[9].buyPrice,278*Math.pow(0.6,5)*(1-0.4*9/10),"bottom line");
 assert(d.engines[4].rows[0].quantity===Math.floor((80000/60)/d.engines[4].rows[0].buyPrice),"E5 qty");
});

// 4. 계좌 배정: 계좌당 3세트
test("account mapping",()=>{
 const {t}=device();t.state().engineSetsOverride="30,30,30,30,10,10";const d=t.derive();
 assert(d.engines[0].rows[0].account===1&&d.engines[0].rows[2].account===1&&d.engines[0].rows[3].account===2,"E1");
 assert(d.engines[3].rows[29].account===40,"E4-30 -> 40");assert(d.engines[4].rows[0].account===41,"E5-01 -> 41");
 assert(d.accountCount===47,"47 accounts");
 t.state().setsPerAccount=10;assert(t.derive().engines[4].rows[0].account===13,"10 per account");
});

// 5. 연말 절세: 실현이익 2,800만 · 공제 250만 · 여유 10% · 현재가 32 · E4-30까지 보유
test("tax-loss plan picks largest losses until target",()=>{
 const {t}=device();const s=t.state();
 Object.assign(s,{livePrice:32,heldThrough:"E4-30",taxRealizedKrw:28000000,taxDeductionKrw:2500000,taxBufferPct:10,taxFxRate:1450});
 const p=t.plan(),d=t.derive();
 near(p.target,25500000*1.1,"target");near(p.taxBefore,25500000*0.22,"tax before");
 // 독립 계산
 const acc={};d.engines.slice(0,4).forEach(e=>e.rows.forEach(r=>{acc[r.account]=(acc[r.account]||0)+r.quantity*(32-r.buyPrice)*1450}));
 const sorted=Object.entries(acc).sort((a,b)=>a[1]-b[1]);let cum=0,n=0;for(const [,v] of sorted){if(cum>=p.target)break;if(v<0){cum-=v;n++}}
 assert(p.picked.length===n,"picked count "+p.picked.length+" vs "+n);near(p.pickedLossKrw,cum,"picked loss",1e-3);
 for(let i=1;i<p.accounts.length;i++)assert(p.accounts[i-1].plKrw<=p.accounts[i].plKrw,"sorted by loss");assert(p.accounts[0].pick==="loss","largest loss picked first");assert(p.pickedLossKrw>=p.target,"meets target");
 near(p.taxAfter,Math.max(0,28000000-cum-2500000)*0.22,"tax after",1e-3);assert(p.taxAfter===0,"no tax");
 assert(p.accounts.length===40,"40 held accounts");
 // 현재가 추정 모드: E4-30 매수선(36.03) 위는 전부 보유
 s.heldThrough="";const q=t.plan();const expect=new Set(d.engines.flatMap(e=>e.rows.filter(r=>r.buyPrice>=32).map(r=>r.account))).size;assert(q.heldMode==="price"&&q.accounts.length===expect&&expect===43,"price mode "+q.accounts.length+" vs "+expect);
});

// 6. 순이익이 공제보다 작으면 공제 채우기
test("deduction fill when gains are small",()=>{
 const {t}=device();Object.assign(t.state(),{livePrice:300,heldThrough:"E1-06",taxRealizedKrw:1000000,taxDeductionKrw:2500000});
 const p=t.plan();assert(p.target===0&&p.fillGapKrw===1500000,"gap");assert(p.fillGainKrw<=1500000,"within room");
 assert(p.fill.length>=1,"fills something");assert(p.taxAfter===0,"no tax");
});

// 7. 마감일: 국내 결제일이 12월 31일 이전이 되는 마지막 미국 매매일
test("harvest deadlines",()=>{
 const {t}=device();
 let x=t.dates(2026);assert(x.last==="2026-12-29"&&x.recommended==="2026-12-28","2026 "+x.last+" "+x.recommended);
 assert(x.lastLabel==="12월 29일(화)","label");
 x=t.dates(2027);assert(x.last==="2027-12-29","2027 Fri Dec31 -> Wed "+x.last);
 x=t.dates(2022);assert(x.last==="2022-12-28","2022 Sat Dec31 -> Wed "+x.last);
});

// 8. 이전 버전 계정 데이터(새 항목 없음)도 불러오고, 이 기기의 새 항목은 유지
test("legacy cloud rows stay compatible",()=>{
 const {t}=device();t.state().engineSetsOverride="30,30,30,30,10,10";
 const legacy={currentCapital:80000,refHigh:278,engineCount:6,setsPerEngine:30,takeProfitMode:"atr",takeProfitPct:6,autoSetAmount:true,manualSetAmount:444.44,totalRealizedProfit:0,growthBaseProfit:0,atr14:0,atrPrevClose:0,atrDataDate:""};
 const row=t.validateRow({state:legacy,revision:3,updated_at:"x"});
 assert(row.state.engineSetsOverride==="30,30,30,30,10,10","local override kept");assert(row.state.engineDropPct===40,"default drop");
 let threw=false;try{const bad=Object.assign({},legacy);delete bad.refHigh;t.validateRow({state:bad,revision:3})}catch(e){threw=true}
 assert(threw,"required fields still checked");
 assert(t.fields.includes("engineDropPct")&&t.fields.includes("taxRealizedKrw"),"new fields synced");
});

// 9. 잘못된 입력 정리
test("normalization of invalid values",()=>{
 const {t}=device();const s=t.normalize({engineDropPct:200,engineSetsOverride:"abc,10,,",setsPerAccount:0,heldThrough:"zz",taxBufferPct:-5});
 assert(s.engineDropPct===40&&s.engineSetsOverride===",10"&&s.setsPerAccount===3&&s.heldThrough===""&&s.taxBufferPct===10,JSON.stringify([s.engineDropPct,s.engineSetsOverride,s.setsPerAccount,s.heldThrough,s.taxBufferPct]));
 assert(t.normalize({heldThrough:"e4-30"}).heldThrough==="E4-30","label upper");
});

// 10. 화면: 엔진별 세트 수가 표와 입력에 반영
test("render with override and inputs",()=>{
 const {t,elems}=device();
 elems.engineSetsOverride.value="30,30,30,30,10,10";elems.engineSetsOverride.handlers.input();
 assert(t.state().engineSetsOverride==="30,30,30,30,10,10","override from input");
 t.state().selectedEngine=4;t.render();assert(elems.engineRows.children.length===10,"E5 rows "+elems.engineRows.children.length);
 assert(elems.engineRows.children[0].children[1].textContent==="계좌 41","account cell");
 elems.engineDropPct.value="50";elems.engineDropPct.handlers.input();assert(t.state().engineDropPct===50,"drop input");
 elems.engineDropPct.value="95";elems.engineDropPct.handlers.input();assert(t.state().engineDropPct===50,"out of range ignored");
 elems["menu-tax"].click();assert(elems["page-tax"].hidden===false&&elems["page-table"].hidden===true,"tax page");
 assert(elems.strategySubtitle.textContent.includes("세트 30·30·30·30·10·10"),elems.strategySubtitle.textContent);
});

// 11. 첫 매수 = 엔진 시작가 (기본값)
test("first buy at engine start",()=>{
 const {t}=device();const d=t.derive();
 near(d.engines[0].rows[0].buyPrice,278,"E1-01 = 278");near(d.engines[0].rows[1].buyPrice,278*(1-0.4/30),"E1-02 = old E1-01");
 near(d.engines[0].rows[0].previousDropPct,0,"E1-01 drop 0");
 for(const e of d.engines){const start=278*Math.pow(0.6,e.index);e.rows.forEach((r,i)=>near(r.buyPrice,start*(1-0.4*i/30),"line"))}
 near(d.engines[1].rows[0].buyPrice,166.8,"E2-01 = engine start");
 near(d.engines[1].rows[0].previousDropPct,(166.8/(278*(1-0.4*29/30))-1)*100,"E2-01 drop vs E1-30");
 near(d.bottomPrice,278*Math.pow(0.6,5)*(1-0.4*29/30),"lowest line");
 // 같은 가격 중복 없음
 const all=d.engines.flatMap(e=>e.rows.map(r=>r.buyPrice));assert(new Set(all.map(x=>x.toFixed(6))).size===180,"no duplicate lines");
});

console.log("PASS "+results.length+" tests: "+results.join(", "));
