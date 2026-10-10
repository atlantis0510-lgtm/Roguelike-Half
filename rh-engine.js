/* 冒険モードの進行エンジン（シナリオの内容は入っていません）
   場面・判定・反応・宝物などの「動かし方」だけを持ち、中身は読み込んだデータが決めます。 */
(function(){
'use strict';
const RH=window.RH;
const H=()=>window.RHH;
const C=()=>H().cur();
const P=()=>RH.getPack();
const A=()=>C().adv;
const esc=s=>H().esc(s);
const fmt=n=>n>=0?'+'+n:'−'+Math.abs(n);
const K=RH.K={};          // 場面の部品（種類ごと）
const core=RH.core={};    // 他のファイルと共有する道具

/* ---------- 持ち物（シートの装備品欄の文字列を使う） ---------- */
const itemIdx=(c,b)=>c.items.findIndex(s=>String(s).includes(b));
const has=b=>itemIdx(C(),b)>=0;
function cnt(b){
  const c=C(),i=itemIdx(c,b);if(i<0)return 0;
  const m=String(c.items[i]).match(/（残り(\d+)/);return m?Number(m[1]):1;
}
function itemUse(b,n){
  n=n||1;const c=C(),i=itemIdx(c,b);if(i<0)return false;
  const s=String(c.items[i]),m=s.match(/（残り(\d+)([^）]*)）/);
  if(m){const left=Number(m[1])-n;if(left>0)c.items[i]=s.replace(m[0],`（残り${left}${m[2]}）`);else c.items.splice(i,1)}
  else c.items.splice(i,1);
  return true;
}
const itemAdd=n=>C().items.push(n);
function itemRemove(b){const c=C(),i=itemIdx(c,b);if(i>=0)c.items.splice(i,1)}
core.has=has;core.cnt=cnt;core.itemUse=itemUse;core.itemAdd=itemAdd;core.itemRemove=itemRemove;

/* ---------- 従者 ---------- */
function folKind(e){
  const p=P(),ks=(p&&p.rules&&p.rules.followerKinds)||[];
  if(e.kind){const k=ks.find(x=>x.id===e.kind);if(k)return k}
  return ks.find(x=>x.match&&String(e.name||'').includes(x.match))||{id:'',role:'fighter'};
}
function folUnits(c,which){
  const out=[];
  ['fight','nofight'].forEach(list=>{
    if(which!=='any'&&which!==list)return;
    (c.followers[list]||[]).forEach((e,idx)=>{
      const n=Math.max(0,Math.floor(Number(e.count)||0)),k=folKind(e);
      for(let j=0;j<n;j++)out.push({kind:'follower',list,idx,name:e.name||'従者',skill:Number(e.skill)||0,role:k.role||'fighter',ranged:!!k.ranged,meleeMod:Number(k.meleeMod)||0,rangedMod:Number(k.rangedMod)||0});
    });
  });
  return out;
}
function folTotals(c){
  const f=folUnits(c,'fight').length,n=folUnits(c,'nofight').length;
  return{fight:f,nofight:n,total:f+n};
}
function killFollower(u){
  const c=C(),e=c.followers[u.list]&&c.followers[u.list][u.idx];
  if(e&&e.count>0)e.count-=1;
}
function tidyFollowers(){
  const c=C();
  ['fight','nofight'].forEach(l=>{c.followers[l]=c.followers[l].filter(e=>(Number(e.count)||0)>0)});
  c.stats.follower.cur=Math.min(c.stats.follower.max,folTotals(c).total);
}
core.folUnits=folUnits;core.folTotals=folTotals;core.killFollower=killFollower;core.tidyFollowers=tidyFollowers;

/* ---------- 装備の見分け ---------- */
function gear(c){
  const t=(c.hand1||'')+'／'+(c.hand2||'');
  return{ranged:/弓|スリング/.test(t),sling:/スリング/.test(t),slash:/斬撃/.test(t),blow:/打撃/.test(t)};
}
function hasLantern(c){
  return /ランタン/.test((c.hand1||'')+(c.hand2||''))||folUnits(c,'any').some(u=>u.role==='lantern');
}
function lanternPen(c){
  const p=P();
  if(p&&p.rules&&p.rules.lanternRule===false)return 0;
  return hasLantern(c)?0:-2;
}
function atkSheetMod(c,ranged){
  const g=gear(c);let m=H().modTotal(c,0);
  const wrow=Number(c.mods[0]&&c.mods[0].v[0])||0;
  if(ranged)m=m-wrow+(g.sling?-1:0);
  else if(A()&&A().vars.stolen)m=m-wrow-2;
  return m;
}
core.gear=gear;core.hasLantern=hasLantern;core.lanternPen=lanternPen;

/* ---------- 式の材料 ---------- */
function baseCtx(){
  const c=C(),a=A()||{vars:{}},f=folTotals(c),g=gear(c);
  return Object.assign({
    life:c.stats.life.cur,lifeMax:c.stats.life.max,sub:c.stats.sub.cur,subMax:c.stats.sub.max,
    skill:c.stats.skill.cur,gold:c.gold,food:c.food,level:c.level,clears:c.clears||0,
    tilesN:a.tilesN||0,clues:a.clues||0,followers:f.total,fighters:f.fight,nonFighters:f.nofight,
    lantern:hasLantern(c)?1:0,heroLantern:/ランタン/.test((c.hand1||'')+(c.hand2||''))?1:0,followerMax:c.stats.follower.max,midDone:a.midDone?1:0,
    h5:(a.history||[]).filter(v=>Math.floor(v/10)===5).length,seen33:(a.history||[]).includes(33)?1:0,slash:g.slash?1:0,blow:g.blow?1:0,rangedGear:g.ranged?1:0,
    __has:has,__cnt:cnt
  },a.vars||{});
}
core.baseCtx=baseCtx;
const ev=(e,x)=>RH.ev(e,Object.assign(baseCtx(),x||{}));
const evN=(e,x)=>RH.evNum(e,Object.assign(baseCtx(),x||{}));
core.ev=ev;core.evN=evN;

/* ---------- 記録 ---------- */
function note(text,tone){
  const a=A();
  if(a){a.log.unshift({s:text,tone:tone||''});if(a.log.length>40)a.log.length=40}
  H().addLog(text,tone);
}
core.note=note;
function touch(){H().save();H().syncUI&&H().syncUI()}
function refresh(){touch();H().rerender()}
core.touch=touch;core.refresh=refresh;

/* ---------- 判定ロール ---------- */
const MODCOL={atk:0,def:1,mag:2,luck:3,str:4,dex:5};
function subKey(o){
  if(o.kind==='atk')return o.ranged?'atkRanged':'atkMelee';
  if(o.kind==='def')return 'def';
  return o.stat||'';
}
function subAllowed(o){
  const c=C(),p=P();
  const use=p&&p.rules&&p.rules.subUse;
  return !!(use&&c.subType&&use[subKey(o)]===c.subType&&c.stats.sub.cur>0);
}
function heroPreview(o){
  const c=C(),a=A(),v=a.vars;
  const useSub=!!(o.sub&&subAllowed(o));
  const base=useSub?c.stats.sub.cur:c.stats.skill.cur;
  let mod=(Number(o.extra)||0)+lanternPen(c)+(Number(v.modAll)||0);
  if(o.kind==='atk')mod+=atkSheetMod(c,o.ranged)+(Number(v.modAtk)||0);
  else if(o.kind==='def')mod+=H().modTotal(c,1)+(Number(v.modDef)||0);
  else if(MODCOL[o.stat]!=null)mod+=H().modTotal(c,MODCOL[o.stat]);
  if(o.bonus&&Number(v.bonus1)>0)mod+=1;
  return{useSub,base,mod,baseName:useSub?H().subName(c):'技量点'};
}
function heroRoll(o){
  const c=C(),a=A(),v=a.vars,pv=heroPreview(o);
  const die=RH.d6();
  const total=die+pv.base+pv.mod;
  const fmax=o.kind==='atk'?Math.max(1,Number(v.fumbleMax)||1):1;
  const crit=die===6,fum=die<=fmax;
  const success=crit||(!fum&&total>=o.target);
  if(o.bonus&&Number(v.bonus1)>0)v.bonus1=Number(v.bonus1)-1;
  if(pv.useSub)c.stats.sub.cur=Math.max(-9,c.stats.sub.cur-1);
  return{die,base:pv.base,baseName:pv.baseName,mod:pv.mod,total,target:o.target,crit,fum,success,usedSub:pv.useSub};
}
function folRoll(u,o){
  const a=A(),v=a.vars,c=C();
  let mod=(Number(o.extra)||0)+lanternPen(c)+(Number(v.modAll)||0);
  if(o.kind==='atk')mod+=Number(v.modFolAtk)||0;
  else if(o.kind==='def')mod+=Number(v.modFolDef)||0;
  const die=RH.d6(),total=die+(u.skill||0)+mod;
  const crit=die===6,fum=die===1;
  return{die,base:u.skill||0,mod,total,target:o.target,crit,fum,success:crit||(!fum&&total>=o.target)};
}
core.heroRoll=heroRoll;core.heroPreview=heroPreview;core.subAllowed=subAllowed;core.folRoll=folRoll;core.atkSheetMod=atkSheetMod;
core.rollText=r=>`出目${r.die}＋${r.baseName||'技量'}${r.base}＋修正${fmt(r.mod)}＝${r.total}（目標${r.target}）`;

/* ---------- 死亡の確認 ---------- */
function checkDeath(){
  const c=C(),a=A();
  if(a&&a.phase==='play'&&c.stats.life.cur<=0){
    c.stats.life.cur=0;a.phase='dead';
    note('主人公は力尽きた。','ng');
  }
}
core.checkDeath=checkDeath;

/* ---------- 処理（ops） ---------- */
function runOps(ops,x){
  const a=A();
  for(const o of (ops||[])){
    if(a.pendingGoto||a.phase!=='play')break;
    execOp(o,x||{});
  }
}
function pickUnit(x){return x&&x.unit}
function execOp(o,x){
  const c=C(),a=A();
  const uu=x&&x.unit;
  const cx=()=>Object.assign(baseCtx(),{unitHero:(!uu||uu.kind==='hero')?1:0,unitFollower:(uu&&uu.kind==='follower')?1:0,unitGroup:(uu&&uu.kind==='folgroup')?1:0,unitLantern:(uu&&uu.role==='lantern')?1:0},x.vars||{});
  const n=()=>RH.evNum(o.n,cx());
  switch(o.op){
    case 'set':a.vars[o.var]=RH.ev(o.value,cx());break;
    case 'add':a.vars[o.var]=(Number(a.vars[o.var])||0)+n();break;
    case 'gold':{const d=n();c.gold=Math.max(0,c.gold+d);note(`金貨${d>=0?'を'+d+'枚手に入れた':'を'+(-d)+'枚失った'}（所持${c.gold}枚）`);break}
    case 'food':{const d=n();c.food=Math.max(0,c.food+d);note(`食料が${fmt(d)}（所持${c.food}）`);break}
    case 'life':{
      const d=n();c.stats.life.cur=Math.min(c.stats.life.max,c.stats.life.cur+d);
      note(`生命点が${fmt(d)}（現在${c.stats.life.cur}）`,d<0?'ng':'ok');checkDeath();break}
    case 'sub':{const d=n();c.stats.sub.cur=Math.min(c.stats.sub.max,c.stats.sub.cur+d);note(`${H().subName(c)}が${fmt(d)}（現在${c.stats.sub.cur}）`);break}
    case 'healAll':
      ['skill','life','sub'].forEach(k=>{c.stats[k].cur=c.stats[k].max});
      note('技量点・生命点・'+H().subName(c)+'が最大値まで回復した','ok');break;
    case 'healPlus':{ // 生命点と副能力値を1点ずつ回復
      c.stats.life.cur=Math.min(c.stats.life.max,c.stats.life.cur+1);
      c.stats.sub.cur=Math.min(c.stats.sub.max,c.stats.sub.cur+1);
      note('生命点と'+H().subName(c)+'が1点ずつ回復した','ok');break}
    case 'hurt':{
      const u=pickUnit(x),d=Math.max(1,n()||1);
      if(!u||u.kind==='hero'){
        c.stats.life.cur=Math.max(0,c.stats.life.cur-d);
        note(`主人公は${d}点のダメージを受けた（生命点${c.stats.life.cur}）`,'ng');checkDeath();
      }else if(u.kind==='follower'){
        killFollower(u);note(`従者「${u.name}」が1人倒れた`,'ng');
      }
      break}
    case 'lose':{ // 従者を失う
      const k=o.from||'any';let d=n();
      const us=folUnits(c,k==='any'?'any':k);
      while(d-->0&&us.length){killFollower(us.pop())}
      note('従者を失った','ng');break}
    case 'addItem':itemAdd(RH.tpl(o.name,cx()));note(`「${RH.tpl(o.name,cx())}」を手に入れた`,'ok');break;
    case 'removeItem':itemRemove(o.name);break;
    case 'useItem':itemUse(o.name,o.n?n():1);break;
    case 'clue':{const d=n();a.clues=Math.max(0,(a.clues||0)+d);note(d>0?`『手がかり』を${d}個手に入れた`:`『手がかり』を${-d}個使った`,'ok');break}
    case 'roll':{
      const r=RH.rollFormula(RH.tpl(o.formula,cx()),{min:o.min,max:o.max});
      a.vars[o.var||'r']=r.total;note(`${o.label||'ダイス'}：${o.formula}→${r.total}`);break}
    case 'defect':{ // 従者が敵側に寝返る
      let d=o.n==null?1:n();
      const us=folUnits(c,'fight').concat(folUnits(c,'nofight'));
      while(d-->0&&us.length){const u=us.shift();killFollower(u);note(`従者「${u.name}」が敵側に寝返った`,'ng')}
      break}
    case 'hire':{
      const kind=((P().rules.followers)||[]).find(f=>f.id===o.kind);
      if(!kind)break;
      const k=n()||1,list=kind.fight?'fight':'nofight';
      const ex=c.followers[list].find(e=>e.kind===kind.id);
      if(ex)ex.count=(Number(ex.count)||0)+k;
      else c.followers[list].push({name:kind.name,skill:kind.skill||0,other:'',count:k,kind:kind.id});
      c.stats.follower.cur=Math.min(c.stats.follower.max,folTotals(c).total);
      note(`${kind.name}を${k}人、従者にした`,'ok');break}
    case 'nextTens':a.nextTens=n();a.seenOps=o.seenOps||null;a.tensSoft=!!o.unlessFinal;break;
    case 'nextOnes':a.nextOnes=n();break;
    case 'tileBump':a.tilesN+=n();break;
    case 'uncountTile':a.tilesN=Math.max(0,a.tilesN-1);break;
    case 'say':note(RH.tpl(o.text,cx()));break;
    case 'if':runOps(RH.ev(o.cond,cx())?o.then:o.else,x);break;
    case 'goto':a.pendingGoto=o.to;break;
    case 'death':c.stats.life.cur=0;checkDeath();break;
    case 'endAdventure':a.pendingGoto='@finish';break;
    case 'sellValuables':{
      let total=0;
      c.items=c.items.filter(s=>{const m=String(s).match(/金貨(\d+)枚相当/);if(m){total+=Number(m[1]);return false}return true});
      if(total>0){c.gold+=total;note(`宝飾品などを売って金貨${total}枚になった`,'ok')}
      break}
    case 'battleHeal':case 'battleHurt':break; // 戦闘の中だけで使う（rh-battle.js）
    default:throw new Error('未対応の処理です: '+o.op);
  }
}
core.runOps=runOps;core.execOp=execOp;

/* ---------- 移動 ---------- */
function resolveTarget(t){
  const a=A(),scenes=P().scenario.scenes;
  if(t.includes('/')){const [s,n]=t.split('/');return{scene:s,node:n}}
  const cs=scenes[a.scene];
  if(cs&&cs.nodes[t])return{scene:a.scene,node:t};
  if(scenes[t])return{scene:t,node:scenes[t].start};
  throw new Error('行き先が見つかりません: '+t);
}
function curNode(){
  const a=A();
  return P().scenario.scenes[a.scene].nodes[a.node];
}
function goto(t){
  const a=A();
  a.pendingGoto=null;
  RH.wantTop=true;
  if(!t){t='@tile'}
  if(t==='@tile'){a.scene='@tile';a.node='';a.st=initTile();return}
  if(t==='@finish'){finishAdventure();return}
  if(t==='@end'){a.phase='abandon';return}
  const r=resolveTarget(t);
  a.scene=r.scene;a.node=r.node;a.st=null;
  tidyFollowers();
  const nd=curNode();
  if(nd.onEnter)runOps(nd.onEnter);
  if(a.pendingGoto){const g=a.pendingGoto;a.pendingGoto=null;goto(g);return}
  if(a.phase!=='play')return;
  const k=K[nd.kind||'text'];
  a.st=k.init?k.init(nd):{};
  if(a.pendingGoto){const g=a.pendingGoto;a.pendingGoto=null;goto(g)}
}
core.goto=goto;core.curNode=curNode;

/* ---------- 文章の部品 ---------- */
function pHTML(t,ctx){
  if(!t)return '';
  return (Array.isArray(t)?t:[t]).map(s=>{
    if(s&&typeof s==='object'){if(s.when&&!RH.ev(s.when,ctx))return '';s=s.text}
    return `<p>${esc(RH.tpl(s,ctx))}</p>`}).join('');
}
function notesHTML(n,ctx){
  if(!n||!n.length)return '';
  return `<div class="rulebox"><b>この場面の決まり</b><ul>${n.map(s=>`<li>${esc(RH.tpl(s,ctx))}</li>`).join('')}</ul></div>`;
}
const diceHTML=ds=>`<span class="dicerow">${ds.map(d=>H().dieHTML(d)).join('')}</span>`;
core.pHTML=pHTML;core.notesHTML=notesHTML;core.diceHTML=diceHTML;
function sceneHead(nd){
  const a=A(),sc=P().scenario.scenes[a.scene];
  const t=nd.title||sc.title||'';
  return t?`<h3 class="stitle">${esc(t)}</h3>`:'';
}
core.sceneHead=sceneHead;

/* ---------- 費用つきの選択肢 ---------- */
function costOK(cost,cx){
  if(!cost)return true;const c=C(),a=A();
  if(cost.gold!=null&&c.gold<RH.evNum(cost.gold,cx))return false;
  if(cost.food!=null&&c.food<RH.evNum(cost.food,cx))return false;
  if(cost.life!=null&&c.stats.life.cur<=RH.evNum(cost.life,cx))return false;
  if(cost.clue!=null&&(a.clues||0)<RH.evNum(cost.clue,cx))return false;
  if(cost.item&&!has(cost.item))return false;
  if(cost.points&&cnt(cost.points.name)<RH.evNum(cost.points.n,cx))return false;
  return true;
}
function payCost(cost,cx){
  if(!cost)return;const c=C(),a=A();
  if(cost.gold!=null){const d=RH.evNum(cost.gold,cx);c.gold-=d;note(`金貨${d}枚を払った`)}
  if(cost.food!=null){const d=RH.evNum(cost.food,cx);c.food-=d;note(`食料${d}個を渡した`)}
  if(cost.life!=null){const d=RH.evNum(cost.life,cx);c.stats.life.cur-=d;note(`生命点${d}点を支払った`,'ng');checkDeath()}
  if(cost.clue!=null){const d=RH.evNum(cost.clue,cx);a.clues-=d;note(`『手がかり』を${d}個渡した`)}
  if(cost.item){itemRemove(cost.item);note(`「${cost.item}」を渡した`)}
  if(cost.points){const d=RH.evNum(cost.points.n,cx);itemUse(cost.points.name,d);note(`「${cost.points.name}」を${d}点分渡した`)}
}

/* ============ 場面の部品 ============ */

/* ---- text：読み物と選択肢 ---- */
K.text={
  init(){return{}},
  view(nd){
    const cx=baseCtx();
    let ch=nd.choices&&nd.choices.length?nd.choices:[{label:nd.nextLabel||'次へ',goto:nd.next}];
    const btns=ch.map((c,i)=>{
      if(c.if&&!RH.ev(c.if,cx))return '';
      const ok=costOK(c.cost,cx);
      return `<button class="btn${ch.length===1||c.primary?' primary':''} wide" data-adv="choice" data-i="${i}"${ok?'':' disabled'}>${esc(RH.tpl(c.label,cx))}${ok?'':'（足りません）'}</button>`;
    }).join('');
    return `${sceneHead(nd)}<div class="say">${pHTML(nd.text,cx)}</div>${notesHTML(nd.notes,cx)}<div class="choices">${btns}</div>`;
  },
  act(nd,st,name,el){
    if(name!=='choice')return;
    const cx=baseCtx();
    const ch=(nd.choices&&nd.choices.length?nd.choices:[{goto:nd.next}])[Number(el.dataset.i)];
    if(!ch||!costOK(ch.cost,cx))return;
    payCost(ch.cost,cx);
    runOps(ch.ops);
    const a=A();
    if(a.phase!=='play')return;
    if(a.pendingGoto){goto(a.pendingGoto);return}
    goto(ch.goto||nd.next||'@tile');
  }
};

/* ---- roll：サイコロを1回振る ---- */
K.roll={
  init(){return{rolled:null,branch:-1}},
  view(nd,st){
    const cx=baseCtx();let body='';
    if(!st.rolled){
      body=`<button class="btn primary wide roll" data-adv="roll">${esc(RH.tpl(nd.label||'サイコロを振る',cx))}（${esc(nd.formula)}）</button>`;
    }else{
      const b=st.branch>=0?nd.branches[st.branch]:null;
      body=`<div class="res">${diceHTML(st.rolled.dice)}<div class="resn">${st.rolled.total}</div></div>
        ${b&&b.text?`<div class="say">${pHTML(b.text,cx)}</div>`:''}
        <div class="choices"><button class="btn primary wide" data-adv="cont">続ける</button></div>`;
    }
    return `${sceneHead(nd)}<div class="say">${pHTML(nd.text,cx)}</div>${notesHTML(nd.notes,cx)}${body}`;
  },
  act(nd,st,name){
    const a=A();
    if(name==='roll'&&!st.rolled){
      const r=RH.rollFormula(RH.tpl(nd.formula,baseCtx()),{min:nd.min,max:nd.max});
      st.rolled=r;a.vars[nd.var||'r']=r.total;
      note(`${nd.label||'ダイス'}：${nd.formula}→${r.total}`);
      runOps(nd.ops);
      const cx=baseCtx();
      st.branch=-1;
      (nd.branches||[]).some((b,i)=>{if(!b.when||RH.ev(b.when,cx)){st.branch=i;runOps(b.ops);return true}return false});
      checkDeath();
    }else if(name==='cont'&&st.rolled){
      const b=st.branch>=0?nd.branches[st.branch]:null;
      if(a.pendingGoto){goto(a.pendingGoto);return}
      goto((b&&b.goto)||nd.next||'@tile');
    }
  }
};

/* ---- reaction：反応表 ---- */
K.reaction={
  init(nd){
    const f=nd.force?String(ev(nd.force)):'';
    if(f&&f!=='0'){if(nd.forceOps)runOps(nd.forceOps);return{rolled:{forced:true,type:f,dice:[]}}}
    return{rolled:null};
  },
  view(nd,st){
    const cx=baseCtx();let body='';
    if(!st.rolled){
      body=`<button class="btn primary wide roll" data-adv="roll">反応表を振る（1d6）</button>`;
    }else{
      const r=st.rolled;
      body=`<div class="res">${r.dice.length?diceHTML(r.dice):''}${r.mod?`<div class="resm">修正${fmt(r.mod)}</div>`:''}
        <div class="reactchip">${esc(r.type)}</div>${r.forced?'<div class="resm">自動で決まりました</div>':''}</div>
        ${r.note?`<div class="say"><p>${esc(RH.tpl(r.note,cx))}</p></div>`:''}
        <div class="choices"><button class="btn primary wide" data-adv="cont">続ける</button></div>`;
    }
    return `${sceneHead(nd)}<div class="say">${pHTML(nd.text,cx)}</div>${notesHTML(nd.notes,cx)}${body}`;
  },
  act(nd,st,name){
    const a=A();
    if(name==='roll'&&!st.rolled){
      const die=RH.d6(),mod=evN(nd.mod),v=die+mod;
      const ent=nd.table.find(e=>v<=e.max)||nd.table[nd.table.length-1];
      st.rolled={dice:[die],mod,v,type:ent.type,note:ent.note||''};
      a.vars.reaction=ent.type;
      note(`反応表：出目${die}${mod?fmt(mod):''}→【${ent.type}】`);
    }else if(name==='cont'&&st.rolled){
      a.vars.reaction=st.rolled.type;
      goto((nd.on&&(nd.on[st.rolled.type]||nd.on.default))||nd.next||'@tile');
    }
  }
};

/* ---- check：判定ロール ---- */
function distinct(arr,n){
  const pool=arr.slice(),out=[];
  while(out.length<n&&pool.length){out.push(pool.splice(RH.rndInt(pool.length),1)[0])}
  return out;
}
function partyUnits(){
  const c=C();
  const hero={key:'h',kind:'hero',label:'主人公'};
  const fol=folUnits(c,'any').map((u,i)=>Object.assign({key:'f'+i,label:u.name},u));
  return{hero,fol};
}
function unitSetup(nd,st){
  const c=C(),{hero,fol}=partyUnits(),who=nd.who||'hero',cx=baseCtx();
  let units=[];
  if(who==='hero')units=[hero];
  else if(who==='party')units=[hero,...fol];
  else if(who==='followers')units=fol.length?[{key:'g',kind:'folgroup',label:'従者（全体で1回）',skill:0}]:[];
  else if(who==='random')units=distinct([hero,...fol],1);
  else if(who==='randomN')units=distinct([hero,...fol],Math.max(1,RH.evNum(nd.count,cx)));
  else if(who==='heroTimes')units=Array.from({length:Math.max(1,RH.evNum(nd.count,cx))},(_,i)=>Object.assign({},hero,{key:'h'+i,label:'主人公（'+(i+1)+'回目）'}));
  else if(who==='followerOne'){
    const fl=fol.filter(u=>u.list==='fight'),pool=fl.length?fl:fol;
    units=distinct(pool,1);
  }
  else if(who==='nonfight'){
    const nf=fol.filter(u=>u.list==='nofight');
    units=nf.length?distinct(nf,1):distinct([hero,...fol],1);
  }
  else if(who==='select'){st.need=Math.max(1,RH.evNum(nd.count,cx));st.picked=[];return null}
  return units;
}
K.check={
  init(nd){
    const st={units:null,res:{},applied:false,ui:{sub:false,bonus:false}};
    st.units=unitSetup(nd,st);
    if(st.units&&!st.units.length){st.applied=true;st.empty=true}
    return st;
  },
  view(nd,st){
    const cx=baseCtx(),c=C(),a=A();
    const target=evN(nd.target),extra=evN(nd.mod);
    let body='';
    if(st.units===null){ // 対象を自分で選ぶ
      const {hero,fol}=partyUnits();
      const all=[hero,...fol];
      body=`<p class="hint">対象を${st.need}人選んでください（選んだ数：${st.picked.length}）</p><div class="pickrow">${
        all.map(u=>`<button class="chipbtn${st.picked.includes(u.key)?' on':''}" data-adv="pick" data-k="${u.key}">${esc(u.label)}</button>`).join('')}</div>
        <button class="btn primary wide" data-adv="pickdone"${st.picked.length===Math.min(st.need,all.length)?'':' disabled'}>この人たちで判定する</button>`;
    }else if(st.empty){
      body=`<div class="say"><p>対象になる人がいないので、何も起こりません。</p></div><div class="choices"><button class="btn primary wide" data-adv="cont">続ける</button></div>`;
    }else{
      const heroIn=st.units.some(u=>u.kind==='hero');
      let tog='';
      if(!st.applied&&heroIn){
        const o={kind:'chk',stat:nd.stat,target,extra};
        if(subAllowed(o))tog+=`<label class="sw"><input type="checkbox" data-advc="ui-sub"${st.ui.sub?' checked':''}><span>${esc(H().subName(c))}を使う（現在${c.stats.sub.cur}点・使うと1点減る）</span></label>`;
        if(Number(a.vars.bonus1)>0)tog+=`<label class="sw"><input type="checkbox" data-advc="ui-bonus"${st.ui.bonus?' checked':''}><span>祈りのボーナス+1を使う（1回だけ）</span></label>`;
        if(heroIn){const pv=heroPreview(Object.assign({},o,{sub:st.ui.sub,bonus:st.ui.bonus}));
          tog+=`<p class="formula">主人公：${esc(pv.baseName)}${pv.base} ＋ 修正${fmt(pv.mod)} ＋ 1d6 ≧ ${target}</p>`}
      }
      const rows=st.units.map(u=>{
        const r=st.res[u.key];
        return `<div class="urow"><span class="uname">${esc(u.label)}</span>${r?`<span class="udice">${diceHTML([r.die])}</span><span class="ures ${r.success?'ok':'ng'}">${r.total}　${r.crit?'クリティカル':r.fum?'ファンブル':(r.success?'成功':'失敗')}</span>`:`<span class="uwait">まだ</span>`}</div>`;
      }).join('');
      const act=st.applied?'':`<button class="btn primary wide roll" data-adv="roll">判定ロールを振る（目標値${target}）</button>`;
      const anyFail=st.units.some(u=>st.res[u.key]&&!st.res[u.key].success);
      const done=st.applied?`<div class="choices">${nd.retry&&anyFail&&a.phase==='play'?`<button class="btn wide" data-adv="retry">もう一度挑戦する</button>`:''}<button class="btn primary wide" data-adv="cont">続ける</button></div>`:'';
      body=`${tog}<div class="units">${rows}</div>${act}${done}`;
    }
    return `${sceneHead(nd)}<div class="say">${pHTML(nd.text,cx)}</div>${notesHTML(nd.notes,cx)}${body}`;
  },
  act(nd,st,name,el){
    const a=A(),c=C();
    if(name==='pick'){
      const k=el.dataset.k;
      st.picked=st.picked.includes(k)?st.picked.filter(x=>x!==k):[...st.picked,k];
    }else if(name==='pickdone'){
      const {hero,fol}=partyUnits();const all=[hero,...fol];
      st.units=all.filter(u=>st.picked.includes(u.key));
    }else if(name==='roll'&&!st.applied&&st.units){
      const target=evN(nd.target),extra=evN(nd.mod);
      const results=[];
      st.units.forEach(u=>{
        let r;
        if(u.kind==='hero')r=heroRoll({kind:'chk',stat:nd.stat,target,extra,sub:st.ui.sub,bonus:st.ui.bonus});
        else r=folRoll(u,{kind:'chk',target,extra});
        st.res[u.key]=r;results.push([u,r]);
        note(`${nd.label||'判定'}（${u.label}）：${core.rollText(r)}→${r.success?'成功':'失敗'}`,r.success?'ok':'ng');
      });
      st.applied=true;
      results.forEach(([u,r])=>{
        if(a.phase!=='play')return;
        runOps(r.success?nd.onSuccess:nd.onFail,{unit:u});
      });
      checkDeath();
    }else if(name==='retry'){
      const keep=st.ui;
      const ns=K.check.init(nd);ns.ui=keep;a.st=ns;
    }else if(name==='cont'&&st.applied){
      if(a.pendingGoto){goto(a.pendingGoto);return}
      const any=st.units&&st.units.some(u=>st.res[u.key]&&!st.res[u.key].success);
      goto((any?nd.nextFail:nd.nextSuccess)||nd.next||'@tile');
    }
  },
  change(nd,st,name,el){
    if(name==='ui-sub')st.ui.sub=el.checked;
    if(name==='ui-bonus')st.ui.bonus=el.checked;
  }
};

/* ---- treasure：宝物表 ---- */
function tableEntry(tbl,r){
  return tbl.find(e=>RH.ev(e.when,{r}));
}
K.treasure={
  init(nd){
    const n=Math.max(0,Math.floor(evN(nd.rolls==null?1:nd.rolls)));
    return{n,i:0,res:[],dex:false,table:nd.table||'main'};
  },
  view(nd,st){
    const cx=baseCtx(),c=C();
    const res=st.res.map(r=>`<div class="urow"><span class="udice">${diceHTML(r.dice)}</span><span class="uname">${esc(r.text)}</span></div>`).join('');
    let act='';
    if(st.i<st.n){
      const o={kind:'chk',stat:'dex'};
      const canDex=P().rules.subUse&&P().rules.subUse.treasure===c.subType&&c.stats.sub.cur>0&&c.skills&&c.skills.treasure;
      act=`${canDex?`<label class="sw"><input type="checkbox" data-advc="ui-dex"${st.dex?' checked':''}><span>宝物の獲得を使う（出目+1、${esc(H().subName(c))}が1点減る）</span></label>`:''}
        <button class="btn primary wide roll" data-adv="roll">宝物表を振る（${st.i+1}/${st.n}回目${evN(nd.mod)?`・修正${fmt(evN(nd.mod))}`:''}）</button>`;
    }else{
      act=`<div class="choices"><button class="btn primary wide" data-adv="cont">続ける</button></div>`;
    }
    return `${sceneHead(nd)}<div class="say">${pHTML(nd.text||'倒した敵が持っていた宝物を確認します。',cx)}</div>${st.n===0?'<div class="say"><p>この敵からは何も手に入りません。</p></div><div class="choices"><button class="btn primary wide" data-adv="cont">続ける</button></div>':`<div class="units">${res}</div>${act}`}`;
  },
  act(nd,st,name,el){
    const a=A(),c=C(),p=P();
    if(name==='roll'&&st.i<st.n){
      let die=RH.d6(),mod=evN(nd.mod);
      const canDex=p.rules.subUse&&p.rules.subUse.treasure===c.subType&&c.stats.sub.cur>0&&c.skills&&c.skills.treasure;
      if(st.dex&&canDex){mod+=1;c.stats.sub.cur-=1}
      const r=die+mod;
      const tbl=p.rules.treasure[st.table];
      const ent=tableEntry(tbl,r)||tbl[tbl.length-1];
      const dice=[die];let text=ent.text||'';
      if(ent.gold){
        const g=RH.rollFormula(ent.gold,{min:ent.min});dice.push(...g.dice);
        c.gold+=g.total;text=`金貨${g.total}枚`;
      }else if(ent.item){
        const g=RH.rollFormula(ent.value,{min:ent.min});dice.push(...g.dice);
        itemAdd(`${ent.item}（金貨${g.total}枚相当）`);text=`${ent.item}（金貨${g.total}枚の価値）`;
      }else if(ent.magic){
        const m=RH.d6();dice.push(m);
        const me=(p.rules.treasure.magic||[]).find(x=>x.n===m);
        let nm=me.name;
        if(me.uses){const u=RH.rollFormula(String(me.uses));dice.push(...(String(me.uses).includes('d')?u.dice:[]));nm=`${me.name}（残り${u.total}${me.unit||'回'}）`}
        itemAdd(nm);text=`魔法の宝物：${nm}`+(me.note?`　${me.note}`:'');
      }
      st.res.push({dice,text:`出目${die}${mod?fmt(mod):''}：${text}`});
      note(`宝物：${text}`,'ok');
      st.i+=1;
      checkDeath();
    }else if(name==='cont'&&st.i>=st.n){
      runOps(nd.ops);
      if(a.pendingGoto){goto(a.pendingGoto);return}
      goto(nd.next||'@tile');
    }
  },
  change(nd,st,name,el){if(name==='ui-dex')st.dex=el.checked}
};

/* ---- trade：買い物 ---- */
K.trade={
  init(){return{bought:{}}},
  view(nd,st){
    const cx=baseCtx(),c=C();
    const rows=(nd.stock||[]).map((s,i)=>{
      const left=(s.qty==null?1:RH.evNum(s.qty,cx))-(st.bought[i]||0);
      if(s.if&&!RH.ev(s.if,cx))return '';
      const lock=nd.onlyOne&&Object.values(st.bought).some(v=>v>0);
      const ok=c.gold>=s.price&&left>0&&!lock;
      return `<div class="shoprow"><div class="shopname"><b>${esc(s.name)}</b><small>${esc(RH.tpl(s.text||'',cx))}</small></div><button class="btn" data-adv="buy" data-i="${i}"${ok?'':' disabled'}>金貨${s.price}枚で買う</button></div>`;
    }).join('');
    return `${sceneHead(nd)}<div class="say">${pHTML(nd.text,cx)}</div>${notesHTML(nd.notes,cx)}<p class="hint">所持金：金貨${c.gold}枚</p>${rows}<div class="choices"><button class="btn primary wide" data-adv="cont">${esc(nd.doneLabel||'買い物を終える')}</button></div>`;
  },
  act(nd,st,name,el){
    const c=C();
    if(name==='buy'){
      const i=Number(el.dataset.i),s=nd.stock[i];
      if(!s||c.gold<s.price)return;
      if(nd.onlyOne&&Object.values(st.bought).some(v=>v>0))return;
      c.gold-=s.price;st.bought[i]=(st.bought[i]||0)+1;
      if(s.ops)runOps(s.ops);
      if(s.adds!==null)itemAdd(RH.tpl(s.adds||s.name,baseCtx()));note(`「${s.name}」を金貨${s.price}枚で買った`,'ok');
    }else if(name==='cont'){
      goto(nd.next||'@tile');
    }
  }
};

/* ---- end：場面の終わり ---- */
K.end={
  init(){return{}},
  view(nd){
    const cx=baseCtx();
    return `${sceneHead(nd)}<div class="say">${pHTML(nd.text,cx)}</div><div class="choices"><button class="btn primary wide" data-adv="cont">${esc(nd.nextLabel||'次のマップタイルへ')}</button></div>`;
  },
  act(nd,st,name){if(name==='cont'){runOps(nd.ops);if(A().pendingGoto){goto(A().pendingGoto);return}goto(nd.next||'@tile')}}
};

/* ============ マップタイルをめくる（組み込みの場面） ============ */
function tileRules(){return P().scenario.tileRules}
function nextIndex(){return A().tilesN+1}
function isMidNext(){const tr=tileRules(),a=A();return tr.midAt&&!a.midDone&&nextIndex()>=tr.midAt}
function finalThreshold(n){
  const m=tileRules().finalIf||{};
  const ks=Object.keys(m).map(Number).sort((x,y)=>x-y);
  let t=0;ks.forEach(k=>{if(n>=k)t=m[k]});return t;
}
function initTile(){
  return{phase:'ready',clue:false,map:false,rolls:[],pick:-1,sensed:0};
}
function incTile(v){
  let t=Math.floor(v/10),o=v%10;
  o+=1;if(o>6){o=1;t+=1}if(t>6)t=1;
  return t*10+o;
}
function computeTile(d1,d2,st){
  const a=A(),tr=tileRules();
  let tens=d1,ones=d2,notes=[];
  if(st.clue){tens=tr.clueTens||1;notes.push('『手がかり』を使ったので十の位が'+tens+'になった')}
  const n=nextIndex(),th=finalThreshold(n);
  let seen=null;
  if(a.nextTens){
    const t2=a.nextTens,o2=Math.min(6,d2+(a.nextOnes||0));
    if(a.seenOps&&a.history.includes(t2*10+o2)){
      seen=a.seenOps;notes.push('依頼の場所にすでに行っていたので、依頼はその場で達成された。この出目は通常どおり使う');
    }else if(a.tensSoft&&th&&d1*10+d2<=th){
      notes.push('次のタイルは最終イベントになるので、十の位の変更は起こらない');
    }else{
      tens=t2;notes.push('前の出来事の影響で十の位が'+tens+'になった');
      if(a.nextOnes){if(o2!==ones)notes.push(`一の位が${ones}→${o2}になった`);ones=o2}
    }
  }else if(a.nextOnes){const o2=Math.min(6,ones+a.nextOnes);if(o2!==ones)notes.push(`一の位が${ones}→${o2}になった`);ones=o2}
  const v0=tens*10+ones;
  if(th&&v0<=th)return{kind:'final',value:v0,notes:[...notes,`${n}枚目で出目が${th}以下だったので最終イベントになった`],seen};
  if(n>=(tr.alwaysFinalAt||99))return{kind:'final',value:v0,notes:[...notes],seen};
  let v=v0,guard=0;
  while(a.history.includes(v)&&guard++<40){v=incTile(v)}
  if(v!==v0)notes.push(`${v0}は出たことがあるので、${v}になった`);
  return{kind:'tile',value:v,notes,seen};
}
core.computeTile=computeTile;
K['@tile']={
  view(nd,st){
    const a=A(),c=C(),tr=tileRules();
    const n=nextIndex();
    let body='';
    if(isMidNext()){
      body=`<p class="stitle2">${n}枚目：中間イベント</p><div class="say"><p>${esc(tr.midText||'ここで決まった中間イベントが起こります。')}</p></div>
        <div class="choices"><button class="btn primary wide" data-adv="tile-mid">中間イベントへ進む</button></div>`;
    }else if(n>=(tr.alwaysFinalAt||99)){
      body=`<p class="stitle2">${n}枚目：最終イベント</p><div class="say"><p>${esc(tr.finalText||'いよいよ最終イベントです。')}</p></div>
        <div class="choices"><button class="btn primary wide" data-adv="tile-final">最終イベントへ進む</button></div>`;
    }else if(st.phase==='ready'){
      const mapOK=has(tr.mapItem||'迷宮の地図');
      const th=finalThreshold(n);
      body=`<p class="stitle2">${n}枚目のマップタイル</p>
        <div class="say"><p>d66（サイコロを2回振り、1回目を十の位、2回目を一の位にします）で、次の場所を決めます。${th?`この回は、出目が${th}以下だと最終イベントになります。`:''}</p>
        ${(a.nextTens||a.nextOnes)?`<p>前の出来事の影響が残っています：${a.nextTens?`十の位が${a.nextTens}`:''}${a.nextOnes?`　一の位に+${a.nextOnes}（最大6）`:''}</p>`:''}</div>
        ${(a.clues||0)>0?`<label class="sw"><input type="checkbox" data-advc="tile-clue"${st.clue?' checked':''}><span>『手がかり』を使う（十の位が${tr.clueTens||1}になる・残り${a.clues}個）</span></label>`:''}
        ${mapOK?`<label class="sw"><input type="checkbox" data-advc="tile-map"${st.map?' checked':''}><span>『${esc(tr.mapItem||'迷宮の地図')}』を使う（2回振って好きな方を選ぶ・1回きり）</span></label>`:''}
        <button class="btn primary wide roll" data-adv="tile-roll">d66を振る</button>`;
    }else{
      const sense=c.skills&&c.skills.sense&&P().rules.subUse&&P().rules.subUse.sense===c.subType&&c.stats.sub.cur>0;
      const list=st.rolls.map((r,i)=>{
        const res=r.res;
        return `<div class="tilecard${st.pick===i?' on':''}">
          <div class="tilerow">${diceHTML(r.d)}<span class="tilev">${res.kind==='final'?'最終イベント':'出目'+res.value}</span></div>
          ${res.notes.map(t=>`<p class="hint">${esc(t)}</p>`).join('')}
          <button class="btn primary wide" data-adv="tile-go" data-i="${i}">${res.kind==='final'?'最終イベントへ進む':'この場所に進む'}</button></div>`;
      }).join('');
      body=`<p class="stitle2">${n}枚目のマップタイル</p>${list}
        ${sense&&st.rolls.length===1?`<button class="btn wide" data-adv="tile-sense">【察知】を使って、この出目を無かったことにする（${esc(H().subName(c))}1点・目標値4）</button>`:''}`;
    }
    return `<div class="tilehead">冒険 ${n}枚目</div>${body}`;
  },
  act(nd,st,name,el){
    const a=A(),c=C(),tr=tileRules();
    if(name==='tile-mid'){a.midDone=true;a.tilesN+=1;a.nextTens=0;a.nextOnes=0;a.seenOps=null;goto(tr.midScene||'mid')}
    else if(name==='tile-final'){a.tilesN+=1;a.nextTens=0;a.nextOnes=0;a.seenOps=null;goto(tr.finalScene||'final')}
    else if(name==='tile-roll'){
      const cnt2=st.map?2:1;st.rolls=[];
      for(let i=0;i<cnt2;i++){
        const d1=RH.d6(),d2=RH.d6();
        st.rolls.push({d:[d1,d2],res:computeTile(d1,d2,st)});
      }
      if(st.clue){a.clues=Math.max(0,a.clues-1)}
      if(st.map){itemRemove(tr.mapItem||'迷宮の地図');note('迷宮の地図を使った')}
      a.nextTens=0;a.nextOnes=0;a.seenOps=null;a.tensSoft=false;
      note(`d66：${st.rolls.map(r=>r.d.join(''))} `);
      st.phase='rolled';
    }else if(name==='tile-go'){
      const r=st.rolls[Number(el.dataset.i)];
      a.tilesN+=1;
      a.vars.ambush=a.vars.ambushNext||0;a.vars.ambushNext=0;
      if(r.res.seen)runOps(r.res.seen);
      if(r.res.kind==='final'){goto(tr.finalScene||'final');return}
      a.history.push(r.res.value);
      note(`マップタイル${r.res.value}に進んだ`);
      goto((tr.scenePrefix||'t')+r.res.value);
    }else if(name==='tile-sense'){
      const r=heroRoll({kind:'chk',stat:'sense',target:4,sub:true});
      note(`察知：${core.rollText(r)}→${r.success?'成功':'失敗'}`,r.success?'ok':'ng');
      st.sensed++;
      if(r.success){st.phase='ready';st.rolls=[];st.clue=false;st.map=false;H().toast('出目は無かったことになりました。もう一度振ります')}
      else H().toast('察知に失敗しました。この出目で進みます');
      st.rolls=r.success?[]:st.rolls;
      if(!r.success)st.noSense=true;
    }
  },
  change(nd,st,name,el){
    if(name==='tile-clue')st.clue=el.checked;
    if(name==='tile-map')st.map=el.checked;
  }
};
K['@tile'].init=initTile;

/* ============ 冒険のはじまりと終わり ============ */
function newAdv(){
  const p=P();
  return{v:1,packId:p.id||'',phase:'play',vars:Object.assign({},(p.scenario.startVars||{})),
    tilesN:0,midDone:false,history:[],clues:0,nextTens:0,nextOnes:0,
    scene:'@intro',node:'',st:{},log:[],pendingGoto:null};
}
core.newAdv=newAdv;
function readiness(){
  const c=C(),w=[],p=P();
  if(!c.hand1&&!c.hand2)w.push('手に持つもの（武器など）が空です。シートの「装備」で入力してください。');
  if(!hasLantern(c))w.push('ランタンを持つ人がいません。このままだと、すべての判定が-2になります。');
  if(c.stats.life.max<=0)w.push('生命点の最大値が0です。');
  const tot=folTotals(c).total;
  if(tot>c.stats.follower.max)w.push(`従者が従者点の最大値（${c.stats.follower.max}）より多くいます。`);
  return w;
}
core.readiness=readiness;
function startAdventure(){
  const c=C();
  if((c.adventures||0)>=3){H().toast('この主人公は3回冒険しました。新しい主人公で挑戦してください');return}
  c.adv=newAdv();
  c.adv.scene='@intro';
  c.adv.log=[];
  note('冒険を始めた');
  H().save();
}
function finishAdventure(){
  const c=C(),a=A();
  a.phase='clear';a.scene='@result';a.node='';a.st={};
  RH.wantTop=true;
}
function applyRewards(success){
  const c=C();
  c.adventures=(c.adventures||0)+1;
  if(success){
    c.clears=(c.clears||0)+1;c.level+=1;c.expPool=(c.expPool||0)+1;
  }
  ['skill','life','sub'].forEach(k=>{c.stats[k].cur=c.stats[k].max});
  c.items=c.items.filter(s=>!/（残り0/.test(s));
  tidyFollowers();
  c.adv=null;
}
core.applyRewards=applyRewards;core.startAdventure=startAdventure;

/* ---------- 画面（冒険タブ） ---------- */
function statusStrip(){
  const c=C(),a=A(),p=P(),cx=baseCtx();
  const flags=(p.scenario.statusLabels||[]).filter(s=>RH.ev(s.when,cx)).map(s=>`<span class="flag">${esc(RH.tpl(s.text,cx))}</span>`).join('');
  return `<div class="strip"><span>金貨 <b>${c.gold}</b></span><span>食料 <b>${c.food}</b></span><span>手がかり <b>${a.clues||0}</b></span><span>持ち物 <b>${c.items.length}</b></span>${flags}</div>`;
}
function logHTML(){
  const a=A();
  if(!a.log.length)return '';
  return `<details class="advlog"><summary>これまでの出来事</summary><ul>${a.log.slice(0,14).map(l=>`<li class="${l.tone||''}">${esc(l.s)}</li>`).join('')}</ul></details>`;
}
function manualPanel(){
  const c=C();
  return `<details class="manual"><summary>うまく進まないとき（手で直す）</summary>
    <p class="hint">ルールの特殊な場面で自動処理が足りないときは、ここで数値を直せます。従者や持ち物は「シート」タブで直してください。</p>
    <div class="mrow"><span>生命点 ${c.stats.life.cur}/${c.stats.life.max}</span><button class="step sm" data-adv="adj" data-k="stats.life.cur" data-d="-1">−</button><button class="step sm" data-adv="adj" data-k="stats.life.cur" data-d="1">＋</button></div>
    <div class="mrow"><span>${esc(H().subName(c))} ${c.stats.sub.cur}/${c.stats.sub.max}</span><button class="step sm" data-adv="adj" data-k="stats.sub.cur" data-d="-1">−</button><button class="step sm" data-adv="adj" data-k="stats.sub.cur" data-d="1">＋</button></div>
    <div class="mrow"><span>金貨 ${c.gold}</span><button class="step sm" data-adv="adj" data-k="gold" data-d="-1">−</button><button class="step sm" data-adv="adj" data-k="gold" data-d="1">＋</button></div>
    <div class="mrow"><span>食料 ${c.food}</span><button class="step sm" data-adv="adj" data-k="food" data-d="-1">−</button><button class="step sm" data-adv="adj" data-k="food" data-d="1">＋</button></div>
    <div class="mrow"><span>次に進める</span><button class="btn" data-adv="skip">この場面を終えて次へ</button></div>
    <div class="mrow"><span>やめる</span><button class="btn danger" data-adv="abandon">冒険を中断する</button></div>
  </details>`;
}
function noPackView(){
  return `<section class="card"><h2>冒険モード</h2><div class="body">
    <p style="margin:0">冒険モードを使うには、シナリオのデータを、この端末に1回読み込む必要があります。</p>
    <p class="note">データは、お渡ししたファイル（<b>rlh-tasogare-pack.json</b>）です。「保存」タブにある「シナリオデータ」の欄から選んでください。</p>
    <button class="btn primary wide" style="margin-top:12px" data-tab-go="data">「保存」タブを開く</button>
  </div></section>`;
}
function homeView(){
  const c=C(),p=P(),w=readiness();
  const tries=c.adventures||0;
  const pool=c.expPool||0;
  return `<section class="card"><h2>${esc(p.scenario.title||'冒険')}</h2><div class="body">
    ${pHTML(p.scenario.summary||[],baseCtx())}
    <div class="kv2"><span>主人公</span><b>${esc(c.name||'（名前なし）')}</b>
      <span>経験レベル</span><b>${c.level}</b>
      <span>これまでの冒険</span><b>${tries}回（最大3回）</b>
      <span>クリア回数</span><b>${c.clears||0}回</b></div>
    ${w.length?`<div class="rulebox warnbox"><b>始める前に確認してください</b><ul>${w.map(x=>`<li>${esc(x)}</li>`).join('')}</ul></div>`:''}
    ${pool>0?`<div class="rulebox"><b>使っていない経験点が${pool}点あります</b><p class="hint">成長させるには、経験点を振り分けます。</p><button class="btn wide" data-adv="grow">経験点を振り分ける</button></div>`:''}
    <div class="choices">
      <button class="btn primary wide roll" data-adv="start"${tries>=3?' disabled':''}>冒険を始める</button>
      <button class="btn wide" data-adv="wizard">キャラクター作成ガイドを開く</button>
    </div>
    ${tries>=3?'<p class="note">この主人公は3回冒険したので、これ以上は挑戦できません。新しい主人公を作ってください。</p>':''}
  </div></section>`;
}
function introView(){
  const c=C(),p=P(),w=readiness();
  return `<section class="card"><h2>${esc(p.scenario.title||'冒険')}</h2><div class="body">
    ${pHTML(p.scenario.intro||[],baseCtx())}
    ${notesHTML(p.scenario.introNotes,baseCtx())}
    ${w.length?`<div class="rulebox warnbox"><b>確認</b><ul>${w.map(x=>`<li>${esc(x)}</li>`).join('')}</ul></div>`:''}
    <div class="choices"><button class="btn primary wide roll" data-adv="begin">ダンジョンに入る</button></div>
  </div></section>`;
}
function deadView(){
  const c=C();
  return `<section class="card"><h2>冒険は失敗に終わった</h2><div class="body">
    <p>主人公「${esc(c.name||'名前なし')}」は命を落とした。冒険は失敗です。経験点は手に入りません。</p>
    <p class="note">このゲームでは、再挑戦ができます。前の主人公と同じ経験レベルまでの、新しい主人公を作れます。</p>
    <div class="choices">
      <button class="btn primary wide" data-adv="retry-new">新しい主人公を作って再挑戦する</button>
    </div>
  </div></section>`;
}
function resultView(){
  const c=C(),p=P();
  return `<section class="card"><h2>冒険の成功</h2><div class="body">
    ${pHTML(p.scenario.clearText||['冒険を達成しました。'],baseCtx())}
    <p>経験点を1点手に入れ、経験レベルが${c.level+1}になります。技量点・生命点・${esc(H().subName(c))}は最大値まで回復します。</p>
    <div class="choices"><button class="btn primary wide" data-adv="collect">冒険を終えて、結果を受け取る</button></div>
  </div></section>`;
}

RH.view=function(){
  const p=P();
  if(!p)return noPackView();
  const c=C();
  if(RH.wizardOpen)return RH.wizardView();
  if(!c.adv)return homeView();
  const a=c.adv;
  if(a.phase==='dead')return deadView();
  if(a.phase==='abandon'){return `<section class="card"><h2>冒険を中断しました</h2><div class="body"><p>ダンジョンから引き返しました。この冒険は失敗として数えますが、主人公は生きています。</p><button class="btn primary wide" data-adv="abandon-ok">戻る</button></div></section>`}
  if(a.scene==='@intro')return introView();
  if(a.scene==='@result')return resultView();
  let inner='';
  try{
    if(a.scene==='@tile')inner=K['@tile'].view(null,a.st);
    else{
      const nd=curNode(),k=K[nd.kind||'text'];
      inner=k.view(nd,a.st);
    }
  }catch(err){
    inner=`<div class="rulebox warnbox"><b>表示でエラーが出ました</b><p>${esc(err.message)}</p><button class="btn wide" data-adv="skip">この場面を飛ばす</button></div>`;
    console.error(err);
  }
  return `${statusStrip()}<section class="card scene"><div class="body">${inner}</div></section>${logHTML()}${manualPanel()}`;
};
RH.after=function(){
  if(RH.wantTop){RH.wantTop=false;window.scrollTo(0,0)}
};

RH.act=function(el){
  const name=el.dataset.adv;
  const c=C(),p=P();
  try{
    switch(name){
      case 'start':startAdventure();break;
      case 'begin':{const a=c.adv;a.scene='@tile';a.st=initTile();RH.wantTop=true;break}
      case 'wizard':RH.openWizard&&RH.openWizard({mode:'new'});return;
      case 'grow':RH.openWizard&&RH.openWizard({mode:'grow'});return;
      case 'retry-new':RH.openWizard&&RH.openWizard({mode:'retry'});return;
      case 'collect':{applyRewards(true);H().toast('経験点を1点手に入れました');break}
      case 'abandon':if(confirm('冒険を中断します。この冒険は失敗として数えます。よろしいですか？')){const a=c.adv;a.phase='abandon'}break;
      case 'abandon-ok':applyRewards(false);break;
      case 'skip':if(confirm('この場面を終えて、次のマップタイルに進みます。よろしいですか？')){goto('@tile')}break;
      case 'adj':{
        const k=el.dataset.k,d=Number(el.dataset.d);
        H().commit(k,(Number(H().getPath(c,k))||0)+d);
        if(k==='stats.life.cur')checkDeath();
        break}
      default:{
        const a=c.adv;if(!a)return;
        if(a.scene==='@tile')K['@tile'].act(null,a.st,name,el);
        else{const nd=curNode();K[nd.kind||'text'].act(nd,a.st,name,el)}
      }
    }
  }catch(err){
    console.error(err);H().toast('エラー：'+err.message);
  }
  refresh();
};
RH.change=function(el){
  const name=el.dataset.advc;const a=C().adv;if(!a)return;
  try{
    if(a.scene==='@tile')K['@tile'].change(null,a.st,name,el);
    else{const nd=curNode(),k=K[nd.kind||'text'];if(k.change)k.change(nd,a.st,name,el)}
  }catch(err){console.error(err)}
  refresh();
};
})();
