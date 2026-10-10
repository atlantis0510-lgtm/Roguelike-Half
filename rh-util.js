/* 冒険モード：共通の道具（式の計算、ダイス、読み込みデータの保管）
   ここにはシナリオの内容は入っていません。 */
(function(){
'use strict';
const RH=window.RH=window.RH||{};

/* ---------- 乱数 ---------- */
function rndInt(n){ // 0..n-1
  try{
    const a=new Uint32Array(1);
    const lim=Math.floor(4294967296/n)*n;
    do{crypto.getRandomValues(a)}while(a[0]>=lim);
    return a[0]%n;
  }catch(e){return Math.floor(Math.random()*n)}
}
const d6=()=>rndInt(6)+1;
RH.rndInt=rndInt;RH.d6=d6;

/* ---------- ダイスの式 ----------
   例：1d6 / 2d6+2 / 1d3 / d66 / 1d6*5 / 1d6*1d6 / 3          */
function rollTerm(t,dice){
  t=t.trim();
  if(/^\d+$/.test(t))return Number(t);
  const m=t.match(/^(\d*)d(\d+)$/i);
  if(!m)throw new Error('ダイスの式が読めません: '+t);
  const n=m[1]===''?1:Number(m[1]),sides=Number(m[2]);
  if(sides===66){
    const a=d6(),b=d6();dice.push(a,b);return a*10+b;
  }
  let sum=0;
  for(let i=0;i<n;i++){
    const r=d6();dice.push(r);
    sum+=sides===3?Math.ceil(r/2):r;
  }
  return sum;
}
function rollFormula(f,opt){
  opt=opt||{};
  f=String(f).replace(/\s+/g,'').replace(/×/g,'*');
  const dice=[];
  // 先頭の符号つきで足し算引き算に分ける
  const parts=f.match(/[+-]?[^+-]+/g)||[];
  let total=0;
  for(const p of parts){
    let sign=1,s=p;
    if(s[0]==='+')s=s.slice(1);else if(s[0]==='-'){sign=-1;s=s.slice(1)}
    const factors=s.split('*').map(x=>rollTerm(x,dice));
    total+=sign*factors.reduce((a,b)=>a*b,1);
  }
  if(opt.min!=null)total=Math.max(total,opt.min);
  if(opt.max!=null)total=Math.min(total,opt.max);
  return{dice,total,formula:f};
}
RH.rollFormula=rollFormula;

/* ---------- 式の計算（安全な小さな電卓） ---------- */
const cache=new Map();
function tokenize(src){
  const out=[];let i=0;
  while(i<src.length){
    const c=src[i];
    if(/\s/.test(c)){i++;continue}
    if(/[0-9]/.test(c)||(c==='.'&&/[0-9]/.test(src[i+1]||''))){
      let j=i+1;while(j<src.length&&/[0-9.]/.test(src[j]))j++;
      out.push({t:'num',v:Number(src.slice(i,j))});i=j;continue;
    }
    if(c==="'"){
      let j=i+1;while(j<src.length&&src[j]!=="'")j++;
      if(j>=src.length)throw new Error('文字列が閉じていません: '+src);
      out.push({t:'str',v:src.slice(i+1,j)});i=j+1;continue;
    }
    if(/[A-Za-z_]/.test(c)){
      let j=i+1;while(j<src.length&&/[A-Za-z0-9_]/.test(src[j]))j++;
      out.push({t:'id',v:src.slice(i,j)});i=j;continue;
    }
    const two=src.substr(i,2);
    if(['==','!=','<=','>=','&&','||'].includes(two)){out.push({t:'op',v:two});i+=2;continue}
    if('+-*/%()<>!?:,'.includes(c)){out.push({t:'op',v:c});i++;continue}
    throw new Error('式に使えない文字があります: '+c+' (式: '+src+')');
  }
  return out;
}
function parse(src){
  if(cache.has(src))return cache.get(src);
  const tk=tokenize(src);let p=0;
  const peek=()=>tk[p],eat=v=>{const t=tk[p];if(t&&t.t==='op'&&t.v===v){p++;return true}return false};
  const need=v=>{if(!eat(v))throw new Error('式の書き方が不正です（'+v+'が必要）: '+src)};
  function ternary(){
    const c=or();
    if(eat('?')){const a=ternary();need(':');const b=ternary();return{k:'tern',c,a,b}}
    return c;
  }
  function or(){let l=and();while(eat('||')){l={k:'bin',o:'||',l,r:and()}}return l}
  function and(){let l=eq();while(eat('&&')){l={k:'bin',o:'&&',l,r:eq()}}return l}
  function eq(){let l=rel();for(;;){if(eat('=='))l={k:'bin',o:'==',l,r:rel()};else if(eat('!='))l={k:'bin',o:'!=',l,r:rel()};else break}return l}
  function rel(){let l=add();for(;;){for(const o of ['<=','>=','<','>']){if(eat(o)){l={k:'bin',o,l,r:add()};l.__m=1;break}}if(!l.__m)break;delete l.__m}return l}
  function add(){let l=mul();for(;;){if(eat('+'))l={k:'bin',o:'+',l,r:mul()};else if(eat('-'))l={k:'bin',o:'-',l,r:mul()};else break}return l}
  function mul(){let l=un();for(;;){if(eat('*'))l={k:'bin',o:'*',l,r:un()};else if(eat('/'))l={k:'bin',o:'/',l,r:un()};else if(eat('%'))l={k:'bin',o:'%',l,r:un()};else break}return l}
  function un(){if(eat('-'))return{k:'neg',e:un()};if(eat('!'))return{k:'not',e:un()};return prim()}
  function prim(){
    const t=tk[p++];
    if(!t)throw new Error('式が途中で終わっています: '+src);
    if(t.t==='num')return{k:'lit',v:t.v};
    if(t.t==='str')return{k:'lit',v:t.v};
    if(t.t==='id'){
      if(eat('(')){
        const args=[];
        if(!eat(')')){do{args.push(ternary())}while(eat(','));need(')')}
        return{k:'call',n:t.v,args};
      }
      return{k:'var',n:t.v};
    }
    if(t.t==='op'&&t.v==='('){const e=ternary();need(')');return e}
    throw new Error('式の書き方が不正です: '+src);
  }
  const tree=ternary();
  if(p<tk.length)throw new Error('式の最後に余分なものがあります: '+src);
  cache.set(src,tree);
  return tree;
}
const FUNCS={
  floor:a=>Math.floor(a[0]),ceil:a=>Math.ceil(a[0]),abs:a=>Math.abs(a[0]),
  min:a=>Math.min(...a),max:a=>Math.max(...a),
  has:(a,ctx)=>ctx.__has?(ctx.__has(String(a[0]))?1:0):0,
  cnt:(a,ctx)=>ctx.__cnt?ctx.__cnt(String(a[0])):0
};
function run(n,ctx){
  switch(n.k){
    case 'lit':return n.v;
    case 'var':{const v=ctx[n.n];return v===undefined||v===null?0:(v===true?1:v===false?0:v)}
    case 'neg':return -num(run(n.e,ctx));
    case 'not':return run(n.e,ctx)?0:1;
    case 'tern':return run(n.c,ctx)?run(n.a,ctx):run(n.b,ctx);
    case 'call':{
      const f=FUNCS[n.n];if(!f)throw new Error('使えない関数です: '+n.n);
      return f(n.args.map(a=>run(a,ctx)),ctx);
    }
    case 'bin':{
      if(n.o==='&&'){const l=run(n.l,ctx);return l?(run(n.r,ctx)?1:0):0}
      if(n.o==='||'){const l=run(n.l,ctx);return l?1:(run(n.r,ctx)?1:0)}
      const l=run(n.l,ctx),r=run(n.r,ctx);
      switch(n.o){
        case '+':return (typeof l==='string'||typeof r==='string')?String(l)+String(r):l+r;
        case '-':return num(l)-num(r);case '*':return num(l)*num(r);
        case '/':return num(l)/num(r);case '%':return num(l)%num(r);
        case '==':return l===r?1:0;case '!=':return l!==r?1:0;
        case '<':return l<r?1:0;case '>':return l>r?1:0;
        case '<=':return l<=r?1:0;case '>=':return l>=r?1:0;
      }
    }
  }
  throw new Error('式を計算できません');
}
const num=v=>typeof v==='number'?v:(Number(v)||0);
function ev(expr,ctx){
  if(expr===undefined||expr===null||expr==='')return 0;
  if(typeof expr==='number')return expr;
  if(typeof expr==='boolean')return expr?1:0;
  return run(parse(String(expr)),ctx||{});
}
RH.ev=ev;
RH.evNum=(e,c)=>num(ev(e,c));
RH.exprCheck=e=>{parse(String(e))}; // 書き方の検査用

/* 文章の中の {式} を値に置き換える */
function tpl(s,ctx){
  if(s==null)return '';
  return String(s).replace(/\{([^{}]+)\}/g,(m,e)=>{
    try{const v=ev(e,ctx);return typeof v==='number'?String(Math.round(v*100)/100):String(v)}catch(err){return m}
  });
}
RH.tpl=tpl;

/* ---------- 読み込みデータの保管（この端末のブラウザの中だけ） ---------- */
const PACKKEY='rh-pack-v1';
let pack=null;
RH.packError=null;
RH.getPack=()=>pack;
RH.loadPack=function(){
  try{
    const raw=localStorage.getItem(PACKKEY);
    if(raw){pack=JSON.parse(raw)}
  }catch(e){pack=null;RH.packError='保存されたデータを読み込めませんでした'}
  return pack;
};
RH.setPack=function(text){
  let p;
  try{p=JSON.parse(text)}catch(e){return{ok:false,error:'ファイルの中身が読めません。ダウンロードし直して、もう一度選んでください。'}}
  const errs=RH.validatePack(p);
  if(errs.length)return{ok:false,error:errs.slice(0,3).join(' / ')};
  try{localStorage.setItem(PACKKEY,JSON.stringify(p))}catch(e){return{ok:false,error:'この端末に保存できませんでした。ブラウザの保存設定を確認してください。'}}
  pack=p;return{ok:true,pack:p};
};
RH.clearPack=function(){
  try{localStorage.removeItem(PACKKEY)}catch(e){}
  pack=null;
};

/* ---------- データの形の検査 ---------- */
RH.validatePack=function(p){
  const errs=[];
  if(!p||typeof p!=='object'){return['データの形が正しくありません'];}
  if(p.format!==1)errs.push('このアプリでは読めない形式のデータです');
  if(!p.scenario||!p.scenario.scenes)errs.push('シナリオのデータが入っていません');
  if(!p.rules)errs.push('ルールのデータが入っていません');
  if(errs.length)return errs;
  const scenes=p.scenario.scenes;
  const exists=(cur,t)=>{
    if(!t||String(t)[0]==='@')return true;
    let sc=cur,nd=t;
    if(t.includes('/')){[sc,nd]=t.split('/')}
    else if(scenes[t]&&!scenes[cur].nodes[t]){sc=t;nd=scenes[t].start}
    return !!(scenes[sc]&&scenes[sc].nodes&&scenes[sc].nodes[nd]);
  };
  const exprs=[];
  const chkOps=(ops,sc,where)=>{
    (ops||[]).forEach(o=>{
      if(o.goto&&!exists(sc,o.goto))errs.push(`${where}: 行き先がありません ${o.goto}`);
      ['value','n','cond'].forEach(k=>{if(typeof o[k]==='string')exprs.push([o[k],where])});
      if(o.op==='if'){chkOps(o.then,sc,where);chkOps(o.else,sc,where)}
      if(o.op==='goto'&&!exists(sc,o.to))errs.push(`${where}: 行き先がありません ${o.to}`);
    });
  };
  for(const [sid,sc] of Object.entries(scenes)){
    if(!sc.nodes||!sc.nodes[sc.start]){errs.push(`場面 ${sid}: 最初の場面がありません`);continue}
    for(const [nid,nd] of Object.entries(sc.nodes)){
      const w=`${sid}/${nid}`;
      const g=t=>{if(t&&!exists(sid,t))errs.push(`${w}: 行き先がありません ${t}`)};
      g(nd.next);g(nd.nextFail);g(nd.nextSuccess);g(nd.onWin);g(nd.onFlee);g(nd.onEscape);
      (nd.choices||[]).forEach(c=>{g(c.goto);chkOps(c.ops,sid,w);if(c.if)exprs.push([c.if,w])});
      if(nd.on)Object.values(nd.on).forEach(g);
      (nd.branches||[]).forEach(b=>{g(b.goto);chkOps(b.ops,sid,w);if(b.when)exprs.push([b.when,w])});
      chkOps(nd.onEnter,sid,w);chkOps(nd.ops,sid,w);chkOps(nd.winOps,sid,w);chkOps(nd.onStart,sid,w);chkOps(nd.forceOps,sid,w);
      (nd.stock||[]).forEach(x=>{chkOps(x.ops,sid,w);if(x.if)exprs.push([x.if,w])});chkOps(nd.onFail,sid,w);chkOps(nd.onSuccess,sid,w);
      ['target','mod','rolls','force','first','count','noFlee','defMod1'].forEach(k=>{if(typeof nd[k]==='string')exprs.push([nd[k],w])});
      (nd.enemies||[]).concat(nd.groups||[]).forEach(gr=>['count','hp','level','attacks','dmg','targetable','attackActive','noFlee','heroAtk','heroDef','folAtk','folDef','atkMod','defMod','round1Attacks','untargetable','noAttack','focus','focusLevel','focusDmg','dodge','holyAuto','selfDestruct','mp'].forEach(k=>{if(typeof gr[k]==='string'&&!(k==='count'&&/\d?d\d/i.test(gr[k])))exprs.push([gr[k],w])}));
      (nd.status||[]).forEach(x=>{if(x.when)exprs.push([x.when,w])});
      if(nd.mods)Object.values(nd.mods).forEach(v=>{if(typeof v==='string')exprs.push([v,w])});
    }
  }
  exprs.forEach(([e,w])=>{try{RH.exprCheck(e)}catch(err){errs.push(`${w}: ${err.message}`)}});
  return errs;
};
})();
