/* 戦闘の部品（シナリオの内容は入っていません）
   基本ルール「36：戦闘」「37：強い／弱いクリーチャー」「38：敵の逃走」に沿って、
   ラウンドを進めます。サイコロは、ボタンを押すたびに1回ずつ振ります。

   場面データの書き方（kind:'battle'）
   {kind:'battle', text:[...], notes:[...],
    enemies:[{id, name, count:'1d3+3'|3, level:4, hp:1, attacks:(省略＝生き残りの数), dmg:1,
              ranged:false, undead:false, atkMod:0, defMod:0, noFlee:'式'}],
    first:'"party"'|'"enemy"'|式, opening:{only:[id], attacks:2, skipNext:1},
    noFlee:'式', winOps:[...], next:'行き先'}
   拡張：敵(enemies)に untargetable/noAttack/onlyRanged/selfDestruct/holyAuto/dodge/drain/focus/caster、
   戦闘に status:[{when,text}]・defMod1・opening.targetRoles。式では round/hp_ID/mp_ID/isHero/ranged が使えます。
*/
(function(){
'use strict';
const RH=window.RH,K=RH.K,core=RH.core;
const H=()=>window.RHH,C=()=>H().cur(),A=()=>C().adv,P=()=>RH.getPack();
const esc=s=>H().esc(s);
const fmt=n=>n>=0?'+'+n:'−'+Math.abs(n);
const C1=()=>core;

/* ---------- 敵の状態 ---------- */
const alive=g=>g.units.filter(h=>h>0).length;
const hpSum=g=>g.units.reduce((s,h)=>s+Math.max(0,h),0);
const activeGroups=st=>st.groups.filter(g=>!g.gone&&alive(g)>0);
let CUR=null; // いま処理中の戦闘（気絶した従者を除くため）
function ctxOf(st){
  const x={round:Math.max(0,st.round)};
  st.groups.forEach(g=>{if(g.id){x['alive_'+g.id]=g.gone?0:alive(g);x['n0_'+g.id]=g.n0||0;x['hp_'+g.id]=g.gone?0:hpSum(g);x['mp_'+g.id]=g.mp==null?0:g.mp}});
  return x;
}
const ev=(e,st,more)=>core.ev(e,Object.assign(ctxOf(st),more||{}));
const evN=(e,st,more)=>core.evN(e,Object.assign(ctxOf(st),more||{}));
const lvl=(g,st)=>evN(g.level,st);
const gmod=(g,k,st,more)=>g[k]==null?0:evN(g[k],st,more);
function canTarget(g,st,mode){
  if(g.gone||alive(g)<=0)return false;
  if(g.untargetable==null)return true;
  return !ev(g.untargetable,st,{rangedStep:mode==='ranged'?1:0});
}
const targets=(st,mode)=>activeGroups(st).filter(g=>canTarget(g,st,mode));
const isStrong=g=>g.hp0>1||g.strong;
const rules=()=>(P()&&P().rules)||{};
const potionName=()=>rules().potionName||'治療のポーション';
const holyName=()=>rules().holyName||'聖水';

function groupAttackCount(g,st){
  if(g.gone)return 0;
  if(g.noAttack!=null&&ev(g.noAttack,st))return 0;
  const n=g.attacks!=null?evN(g.attacks,st):alive(g);
  return Math.max(0,n);
}

/* ---------- 味方 ---------- */
function fighters(){
  const us=core.folUnits(C(),'fight'),sk=CUR&&CUR.stun;
  if(!sk)return us;
  const seen={};
  return us.filter(u=>{const k=u.list+':'+u.idx;seen[k]=(seen[k]||0)+1;return seen[k]>(sk[k]||0)});
}
const roleUnits=roles=>core.folUnits(C(),'any').filter(u=>roles.includes(u.role));
function partyRangedPossible(){
  const c=C();
  return core.gear(c).ranged||fighters().some(u=>u.ranged)||core.has(holyName());
}
function enemyRangedPossible(st){return st.groups.some(g=>!g.gone&&g.ranged&&alive(g)>0)}

/* ---------- ラウンドの組み立て ---------- */
function roundSteps(nd,st){
  const out=[];
  const melee=()=>{
    const sd=st.groups.find(g=>g.selfDestruct!=null&&!g.gone&&alive(g)>0);
    if(sd){out.push({kind:'explode',label:'爆発',gid:st.groups.indexOf(sd)});return}
    const order=st.first==='enemy'?['enemy','party']:['party','enemy'];
    order.forEach(k=>out.push({kind:k,mode:'melee',label:`第${st.round}ラウンド：${k==='party'?'味方の攻撃':'敵の攻撃'}`}));
  };
  if(st.round<0){
    st.round=0;
    if(nd.opening){
      out.push({kind:'enemy',mode:'ranged',label:'敵の不意打ち',only:nd.opening.only||null,attacks:nd.opening.attacks,targetRoles:nd.opening.targetRoles||null});
      st.skipEnemy=Number(nd.opening.skipNext)||0;
    }else{
      const pr=partyRangedPossible(),er=enemyRangedPossible(st);
      if(pr||er){
        const e={kind:'enemy',mode:'ranged',label:'第0ラウンド：敵の射撃'};
        const p={kind:'party',mode:'ranged',label:'第0ラウンド：飛び道具の攻撃'};
        if(er&&pr)out.push(e,p);else if(er)out.push(e);else out.push(p);
      }
    }
    st.round=1;melee();
  }else{st.round+=1;melee()}
  return out;
}
function casterInfo(step,st){
  if(step.mode!=='melee'||step.only)return null;
  const g=activeGroups(st).find(x=>x.caster&&(x.mp||0)>0);
  if(!g)return null;
  return{g,casts:Math.min(groupAttackCount(g,st),g.mp)};
}
function enemyAttackList(step,st){
  const list=[];
  if(step.attacks!=null&&step.only){
    const gs=activeGroups(st).filter(g=>step.only.includes(g.id));
    const g=gs[0]||activeGroups(st)[0];
    if(g)for(let i=0;i<step.attacks;i++)list.push({g,level:lvl(g,st),dmg:Math.max(1,gmod(g,'dmg',st)||1)});
    return list;
  }
  const ci=casterInfo(step,st);
  activeGroups(st).forEach(g=>{
    if(step.mode==='ranged'&&!g.ranged)return;
    if(step.only&&!step.only.includes(g.id))return;
    let n=groupAttackCount(g,st);
    if(ci&&ci.g===g)n=Math.max(0,n-ci.casts);
    const lv=lvl(g,st),d=Math.max(1,g.dmg==null?1:evN(g.dmg,st));
    const fc=g.focus!=null&&!!ev(g.focus,st);
    for(let i=0;i<n;i++)list.push(fc?{g,level:lv+evN(g.focusLevel||0,st),dmg:Math.max(1,evN(g.focusDmg==null?d:g.focusDmg,st)),focus:true}:{g,level:lv,dmg:d});
  });
  return list;
}

/* ---------- 終わりの判定 ---------- */
function checkEnd(nd,st){
  const ndNoFlee=nd.noFlee!=null&&!!ev(nd.noFlee,st);
  st.groups.forEach(g=>{
    if(g.gone)return;
    const s=hpSum(g);
    if(s<=0){g.gone=true;g.how='dead';return}
    const gNo=g.noFlee!=null&&!!ev(g.noFlee,st);
    if(!gNo&&!ndNoFlee&&s*2<=g.sum0){
      g.gone=true;g.how='fled';g.units=g.units.map(()=>0);
      core.note(`${g.name}は形勢が不利になり、逃げ出した`,'ok');
    }
  });
  return st.groups.every(g=>g.gone);
}
function advance(nd,st){
  const a=A();
  for(let guard=0;guard<50;guard++){
    st.res=null;st.rolled=false;st.alloc='hero';st.act='atk';
    if(a.phase!=='play')return;
    if(checkEnd(nd,st)){st.stage='won';st.cur=null;return}
    if(!st.pending.length)st.pending.push(...roundSteps(nd,st));
    const s=st.pending.shift();st.cur=s;
    const tg=s.kind==='party'?targets(st,s.mode):activeGroups(st);st.tg=tg.length?st.groups.indexOf(tg[0]):0;
    if(s.kind==='party'&&!tg.length)continue;
    if(s.kind==='enemy'){
      if(s.mode==='melee'&&st.skipEnemy>0){st.skipEnemy--;core.note('敵は武器を持ち替えていて、この回は攻撃してこない');continue}
      if(!enemyAttackList(s,st).length&&!casterInfo(s,st))continue;
    }else{
      if(s.mode==='ranged'&&!partyRangedPossible())continue;
    }
    return;
  }
}

/* ---------- 画面 ---------- */
function foesHTML(st){
  return `<div class="foes">${st.groups.map(g=>{
    const n=alive(g),lv=st.stage==='setup'&&!g.ready?'?':lvl(g,st);
    const state=g.gone?(g.how==='fled'?'逃走':'撃破'):(g.ready?(isStrong(g)?`生命点 ${hpSum(g)}/${g.sum0}`:`${n}体`):'人数未定');
    return `<div class="foe${g.gone?' gone':''}"><b>${esc(g.name)}</b><span>レベル${lv}${g.undead?'・アンデッド':''}${g.ranged?'・射撃':''}</span><span class="foehp">${state}</span></div>`;
  }).join('')}</div>`;
}
function partyHTML(){
  const c=C(),f=fighters().length;
  return `<div class="partybar"><span>主人公 生命点 <b>${c.stats.life.cur}</b>/${c.stats.life.max}</span><span>${esc(H().subName(c))} <b>${c.stats.sub.cur}</b></span><span>戦う従者 <b>${f}</b>人</span></div>`;
}
function resRows(st){
  if(!st.res)return '';
  return `<div class="units">${st.res.rows.map(r=>`<div class="urow"><span class="uname">${esc(r.label)}</span>${r.die!=null?`<span class="udice">${core.diceHTML([r.die])}</span>`:''}<span class="ures ${r.ok===false?'ng':r.ok?'ok':''}">${esc(r.text)}</span></div>`).join('')}</div>`;
}
function subToggle(o,st){
  const c=C();
  if(!core.subAllowed(o))return '';
  const pv=core.heroPreview(Object.assign({},o,{sub:st.ui.sub}));
  return `<label class="sw"><input type="checkbox" data-advc="b-sub"${st.ui.sub?' checked':''}><span>${esc(H().subName(c))}を使う（現在${c.stats.sub.cur}点・1回の判定ごとに1点減る）</span></label>`;
}
function partyStepView(nd,st){
  const c=C(),s=st.cur,g=st.groups[st.tg];
  const ranged=s.mode==='ranged';
  const act=st.act;
  const ag=targets(st,s.mode);
  let body='';
  if(!st.rolled){
    const tgt=ag.length>1?`<p class="hint">攻撃する相手を選んでください</p><div class="pickrow">${ag.map(x=>{const i=st.groups.indexOf(x);return `<button class="chipbtn${i===st.tg?' on':''}" data-adv="b-tg" data-i="${i}">${esc(x.name)}（${isStrong(x)?'生命点'+hpSum(x):alive(x)+'体'}）</button>`}).join('')}</div>`:'';
    const heroCan=!ranged||core.gear(c).ranged;
    const acts=[];
    if(heroCan)acts.push(['atk','攻撃する']);
    if(!ranged&&core.has(potionName()))acts.push(['potion',potionName()+'を飲む（この回の攻撃は行わない）']);
    if((ranged||g.holyAuto!=null)&&core.has(holyName()))acts.push(['holy',holyName()+'を投げる']);
    const sel=acts.length>1?`<div class="pickrow">${acts.map(([k,t])=>`<button class="chipbtn${act===k?' on':''}" data-adv="b-act" data-k="${k}">${esc(t)}</button>`).join('')}</div>`:'';
    let pv='';
    if(act==='atk'||act==='holy'){
      const o={kind:'atk',ranged:ranged||act==='holy',target:lvl(g,st),extra:gmod(g,'atkMod',st,{ranged:(ranged||act==='holy')?1:0,isHero:1})};
      pv=subToggle(o,st);
      if(act==='holy'&&g.holyAuto!=null)pv=`<p class="formula">${esc(holyName())}は、サイコロを振らずに自動で${g.holyAuto}点のダメージを与えます（1回の戦闘で1度だけ）。</p>`;
      else if(heroCan||act==='holy'){const p=core.heroPreview(Object.assign({},o,{sub:st.ui.sub}));
        pv+=`<p class="formula">主人公：${esc(p.baseName)}${p.base} ＋ 修正${fmt(p.mod)} ＋ 1d6 ≧ ${o.target}（${esc(g.name)}のレベル）</p>`}
    }
    const fl=fighters().filter(u=>!ranged||u.ranged);
    const folNote=fl.length?`<p class="hint">戦う従者${fl.length}人も、まとめて攻撃します。</p>`:'';
    body=`${tgt}${sel}${pv}${folNote}<button class="btn primary wide roll" data-adv="b-roll">${ranged?'飛び道具の攻撃ロールを振る':'攻撃ロールを振る'}</button>${ranged?'<button class="btn wide" data-adv="b-pass">何もしない</button>':''}`;
  }else{
    body=`${resRows(st)}<div class="choices"><button class="btn primary wide" data-adv="b-cont">続ける</button></div>`;
  }
  return body;
}
function allocation(step,st){
  let list=enemyAttackList(step,st);
  list=[...list.filter(x=>x.focus),...list.filter(x=>!x.focus)];
  const n=list.length,foc=list.filter(x=>x.focus).length;
  if(step.targetRoles){
    const pool=roleUnits(step.targetRoles);
    if(pool.length)return{list,hero:0,fol:n,choice:false,pool};
  }
  const f=fighters().length;
  if(!f)return{list,hero:n,fol:0,choice:false};
  const m=n-foc,base=Math.floor(m/2),odd=m%2;
  if(!odd)return{list,hero:foc+base,fol:base,choice:false};
  return st.alloc==='fol'?{list,hero:foc+base,fol:base+1,choice:true}:{list,hero:foc+base+1,fol:base,choice:true};
}
function spellTargets(){
  const seen={},out=[];
  fighters().forEach(u=>{const k=u.list+':'+u.idx;if(!seen[k]){seen[k]={key:k,name:u.name,n:0,u};out.push(seen[k])}seen[k].n++});
  return out;
}
function enemyStepView(nd,st){
  const s=st.cur;
  if(st.rolled)return `${resRows(st)}<div class="choices"><button class="btn primary wide" data-adv="b-cont">続ける</button></div>`;
  const al=allocation(s,st),c=C(),ci=casterInfo(s,st);
  const names=[...new Set(al.list.map(x=>x.g.name).concat(ci?[ci.g.name]:[]))].join('、');
  let spell='';
  if(ci){
    const tg=spellTargets();
    spell=`<div class="say"><p>${esc(ci.g.name)}は魔術点を使い、呪文を<b>${ci.casts}回</b>唱えます。${tg.length?'戦う従者に【気絶】を。':'主人公に【氷槍】を。'}</p></div>`;
    if(tg.length>1){
      if(!tg.some(x=>x.key===st.spellKey))st.spellKey=tg[0].key;
      spell+=`<p class="hint">【気絶】を狙う従者の集まりを選んでください</p><div class="pickrow">${tg.map(x=>`<button class="chipbtn${st.spellKey===x.key?' on':''}" data-adv="b-spell" data-k="${x.key}">${esc(x.name)}（${x.n}人）</button>`).join('')}</div>`;
    }
  }
  if(!al.list.length)return `${spell}<button class="btn primary wide roll" data-adv="b-roll">呪文の判定を振る</button>`;
  let choice='';
  if(al.choice)choice=`<p class="hint">攻撃の数が割り切れません。あまった1回を、誰が受けるか決めてください。</p><div class="pickrow"><button class="chipbtn${st.alloc==='hero'?' on':''}" data-adv="b-alloc" data-k="hero">主人公</button><button class="chipbtn${st.alloc==='fol'?' on':''}" data-adv="b-alloc" data-k="fol">従者</button></div>`;
  const first=al.list[0];
  const o={kind:'def',target:first.level,extra:0};
  const pv=al.hero>0?subToggle(o,st):'';
  const foc=al.list.some(x=>x.focus)?`<p class="hint">生命点が3の倍数の主人公は優先的に狙われ、その攻撃はレベル${first.level}・ダメージ${first.dmg}になります。</p>`:'';
  const ex=al.hero>0?`<p class="formula">主人公：技量点などの合計 ＋ 1d6 ≧ 敵のレベル（失敗すると生命点−${first.dmg}）</p>`:'';
  const who=al.pool?`<p class="hint">この攻撃は、${esc(al.pool.map(u=>u.name).join('、'))}が優先的に狙われます。</p>`:`<p>${al.fol?'従者の受け持ちは自動で割り振ります。':''}</p>`;
  return `${spell}<div class="say"><p>${esc(names)}の攻撃は全部で<b>${al.list.length}回</b>です。主人公が${al.hero}回、従者が${al.fol}回、【防御ロール】を行います。</p>${who}</div>${choice}${foc}${pv}${ex}
    <button class="btn primary wide roll" data-adv="b-roll">防御ロールを振る</button>`;
}
function explodeView(nd,st){
  const s=st.cur,g=st.groups[s.gid];
  if(st.rolled)return `${resRows(st)}<div class="choices"><button class="btn primary wide" data-adv="b-cont">続ける</button></div>`;
  const f=core.folUnits(C(),'any').length;
  return `<div class="say"><p>${esc(g.name)}を倒せなかった。導火線が燃え尽きる……爆発する！<br>誰か1人を選ぶと、${esc(g.name)}は爆発し、その人が<b>${g.selfDestruct}点</b>のダメージを受けます（従者の場合は1人が倒れます）。</p></div>
    <div class="pickrow"><button class="chipbtn${st.alloc==='hero'?' on':''}" data-adv="b-alloc" data-k="hero">主人公が受ける</button>${f?`<button class="chipbtn${st.alloc==='fol'?' on':''}" data-adv="b-alloc" data-k="fol">従者が受ける</button>`:''}</div>
    <button class="btn primary wide roll" data-adv="b-explode">爆発させる</button>`;
}
function statusHTML(nd,st){
  const out=(nd.status||[]).filter(x=>!x.when||ev(x.when,st)).map(x=>`<li>${esc(x.text)}</li>`);
  return out.length?`<ul class="foestat">${out.join('')}</ul>`:'';
}

function rollInfo(r){return `出目${r.die}＝${r.total}${r.crit?'（クリティカル）':r.fum?'（ファンブル）':''}`}

K.battle={
  init(nd){
    const st={stage:'setup',round:-1,pending:[],cur:null,res:null,rolled:false,tg:0,act:'atk',alloc:'hero',skipEnemy:0,ui:{sub:false},first:'party',groups:[],stun:{},spellKey:null};
    st.groups=(nd.enemies||[]).map((e,i)=>{
      const g=Object.assign({},e);
      g.id=e.id||('g'+i);g.name=e.name||'敵';if(e.mp!=null)g.mp=Number(e.mp)||0;g.hp0=Math.max(1,Math.floor(Number(e.hp)||1));
      const dice=typeof e.count==='string'&&/d/i.test(e.count);
      g.formula=dice?e.count:null;g.ready=!dice;g.units=[];g.n0=0;g.sum0=0;g.gone=false;
      if(!dice)fillUnits(g,e.count==null?1:(typeof e.count==='string'?core.evN(e.count):Number(e.count)));
      return g;
    });
    CUR=st;
    return st;
  },
  view(nd,st){
    CUR=st;
    const cx=core.baseCtx();
    let body='';
    if(st.stage==='setup'){
      const need=st.groups.filter(g=>!g.ready);
      if(need.length){
        body=`<p class="hint">まず、敵の数を決めます。</p><button class="btn primary wide roll" data-adv="b-count">敵の数を振る（${esc(need.map(g=>g.formula).join('、'))}）</button>`;
      }else{
        const f=resolveFirst(nd,st);
        const rg=partyRangedPossible()||enemyRangedPossible(st);
        body=`<div class="say"><p>${f==='enemy'?'敵が先に攻撃してきます。':'こちらが先に攻撃できます。'}${rg&&!nd.opening?'戦闘の前に、飛び道具による攻撃の機会があります（第0ラウンド）。':''}</p></div>
          <button class="btn primary wide roll" data-adv="b-start">戦闘を始める</button>`;
      }
      return `${core.sceneHead(nd)}<div class="say">${core.pHTML(nd.text,cx)}</div>${core.notesHTML(nd.notes,cx)}${foesHTML(st)}${statusHTML(nd,st)}${body}`;
    }
    if(st.stage==='won'){
      const fled=st.groups.filter(g=>g.how==='fled').length,dead=st.groups.filter(g=>g.how==='dead').length;
      return `${core.sceneHead(nd)}<div class="say"><p>戦闘に勝利した。${fled&&!dead?'敵は逃げ出した。':fled?'倒した敵と、逃げ出した敵がいる。':''}</p></div>${foesHTML(st)}${partyHTML()}
        <div class="choices"><button class="btn primary wide" data-adv="b-end">戦闘を終える</button></div>`;
    }
    const s=st.cur;
    body=s.kind==='party'?partyStepView(nd,st):s.kind==='explode'?explodeView(nd,st):enemyStepView(nd,st);
    return `${core.sceneHead(nd)}${foesHTML(st)}${statusHTML(nd,st)}${partyHTML()}<p class="stitle2">${esc(s.label)}</p>${body}`;
  },
  act(nd,st,name,el){
    CUR=st;
    const a=A(),c=C();
    if(name==='b-count'){
      st.groups.filter(g=>!g.ready).forEach(g=>{
        const r=RH.rollFormula(g.formula,{min:g.min});
        fillUnits(g,r.total);g.dice=r.dice;
        core.note(`${g.name}の数：${g.formula}→${r.total}`);
      });
      return;
    }
    if(name==='b-start'){
      st.first=resolveFirst(nd,st);
      st.stage='fight';
      if(nd.onStart)core.runOps(nd.onStart);
      advance(nd,st);
      return;
    }
    if(name==='b-end'){
      a.vars.battleFled=st.groups.some(g=>g.how==='fled')?1:0;
      core.runOps(nd.winOps);
      if(a.pendingGoto){core.goto(a.pendingGoto);return}
      core.goto(nd.next||'@tile');return;
    }
    if(st.stage!=='fight')return;
    if(name==='b-tg'){st.tg=Number(el.dataset.i);return}
    if(name==='b-act'){st.act=el.dataset.k;return}
    if(name==='b-alloc'){st.alloc=el.dataset.k;return}
    if(name==='b-spell'){st.spellKey=el.dataset.k;return}
    if(name==='b-explode'&&!st.rolled&&st.cur.kind==='explode'){explodeRoll(nd,st);st.rolled=true;core.checkDeath();return}
    if(name==='b-pass'){advance(nd,st);return}
    if(name==='b-cont'&&st.rolled){advance(nd,st);return}
    if(name==='b-roll'&&!st.rolled){
      if(st.cur.kind==='party')partyRoll(nd,st);else enemyRoll(nd,st);
      st.rolled=true;core.checkDeath();
      return;
    }
  },
  change(nd,st,name,el){if(name==='b-sub')st.ui.sub=el.checked}
};

function fillUnits(g,n){
  n=Math.max(0,Math.floor(n));
  g.units=Array.from({length:n},()=>g.hp0);
  g.n0=n;g.sum0=n*g.hp0;g.ready=true;
}
function resolveFirst(nd,st){
  if(nd.first==null)return 'party';
  const v=String(ev(nd.first,st));
  return v==='enemy'?'enemy':'party';
}

/* 命中を、選んだ相手から順に当てる（狙えない相手は飛ばす） */
function applyHits(st,start,dmg,mode){
  const gs=st.groups,n=gs.length;
  for(let k=0;k<n;k++){
    const g=gs[(start+k)%n];
    if(g.gone||!canTarget(g,st,mode))continue;
    const i=g.units.findIndex(h=>h>0);
    if(i<0)continue;
    g.units[i]=Math.max(0,g.units[i]-dmg);
    return g;
  }
  return null;
}
/* 命中したあとの処理（見切りで無効になることがある）。説明の文を返す */
function doHit(st,g0,dmg,mode){
  if(g0.dodge!=null){
    const d=RH.d6(),lim=evN(g0.dodge,st);
    if(d<=lim)return `（見切られた：出目${d}でダメージ無効）`;
    applyHits(st,st.groups.indexOf(g0),dmg,mode);
    return `（見切りの判定：出目${d}で、ダメージが通った）`;
  }
  applyHits(st,st.tg,dmg,mode);
  return '';
}
function explodeRoll(nd,st){
  const c=C(),g=st.groups[st.cur.gid],rows=[];
  const d=Number(g.selfDestruct)||2;
  const fol=core.folUnits(c,'any');
  if(st.alloc==='fol'&&fol.length){
    const u=fol.find(x=>x.list==='fight')||fol[0];
    core.killFollower(u);
    rows.push({label:u.name,text:`爆発に巻き込まれて倒れた`,ok:false});
    core.note(`爆発で従者「${u.name}」が倒れた`,'ng');
  }else{
    c.stats.life.cur=Math.max(0,c.stats.life.cur-d);
    rows.push({label:'主人公',text:`爆発で生命点−${d}（現在${c.stats.life.cur}）`,ok:false});
    core.note(`爆発で主人公は${d}点のダメージ`,'ng');
  }
  g.units=g.units.map(()=>0);
  st.res={rows};
  checkEnd(nd,st);
}

function partyRoll(nd,st){
  const c=C(),s=st.cur,rows=[];
  const ranged=s.mode==='ranged';
  const g0=st.groups[st.tg];
  let heroAct=st.act;
  if(ranged&&!core.gear(c).ranged&&heroAct==='atk')heroAct='none';
  if(heroAct==='holy'&&g0.holyAuto!=null){
    core.itemUse(holyName());
    let txt;
    if(g0.holyUsed)txt=`${holyName()}の効果は、この戦闘ではすでに使った`;
    else{g0.holyUsed=true;applyHits(st,st.tg,Number(g0.holyAuto),s.mode);txt=`${holyName()}：自動で${g0.holyAuto}点のダメージ`}
    rows.push({label:'主人公',text:txt,ok:true});
    core.note(`${holyName()}を投げた`,'ok');
  }else if(heroAct==='potion'){
    core.itemUse(potionName());
    c.stats.life.cur=c.stats.life.max;
    rows.push({label:'主人公',text:`${potionName()}を飲んで、生命点が最大まで回復した`,ok:true});
    core.note('治療のポーションを飲んだ','ok');
  }else if(heroAct==='atk'||heroAct==='holy'){
    const rg=ranged||heroAct==='holy';
    const o={kind:'atk',ranged:rg,target:lvl(g0,st),extra:gmod(g0,'atkMod',st,{ranged:rg?1:0,isHero:1}),sub:st.ui.sub};
    const r=core.heroRoll(o);
    let txt=`${rollInfo(r)}→${r.success?'命中':'外れ'}`;
    if(r.success){
      if(heroAct==='holy'){
        core.itemUse(holyName());
        if(isStrong(g0)&&g0.undead){applyHits(st,st.tg,2,s.mode);txt+='（聖水：2点のダメージ）'}
        else if(!isStrong(g0)){applyHits(st,st.tg,1,s.mode);applyHits(st,st.tg,1,s.mode);txt+='（聖水：2体を倒した）'}
        else txt+='（聖水は効かなかった）';
      }else{
        const bonus=r.crit?(Number(rules().critDamage)||0):0;
        txt+=doHit(st,g0,1+bonus,s.mode);
      }
    }else if(heroAct==='holy')core.itemUse(holyName());
    rows.push({label:'主人公',die:r.die,text:txt,ok:r.success});
    core.note(`攻撃（主人公）：${core.rollText(r)}→${r.success?'命中':'外れ'}`,r.success?'ok':'ng');
  }
  const fl=fighters().filter(u=>!ranged||u.ranged);
  fl.forEach(u=>{
    const extra=gmod(g0,'atkMod',st,{ranged:ranged?1:0,isHero:0,slash:0})+(ranged?u.rangedMod:u.meleeMod);
    const r=core.folRoll(u,{kind:'atk',target:lvl(g0,st),extra});
    let t=`${rollInfo(r)}→${r.success?'命中':'外れ'}`;
    if(r.success)t+=doHit(st,g0,1,s.mode);
    rows.push({label:u.name,die:r.die,text:t,ok:r.success});
  });
  if(fl.length)core.note(`従者の攻撃：${rows.filter((x,i)=>x.label!=='主人公').filter(x=>x.ok).length}/${fl.length}人が命中`);
  if(!rows.length)rows.push({label:'—',text:'攻撃できる人がいません'});
  st.res={rows};
  checkEnd(nd,st);
}

/* 呪文を唱える敵（魔術点を使い切るまで、攻撃の代わりに呪文を唱える） */
function castSpells(nd,st,ci,rows){
  const c=C(),g=ci.g,lv=lvl(g,st);
  for(let i=0;i<ci.casts;i++){
    if(A().phase!=='play')break;
    g.mp-=1;
    const tg=spellTargets();
    if(tg.length){
      const t=tg.find(x=>x.key===st.spellKey)||tg[0];
      const r=core.folRoll(t.u,{kind:'chk',target:lv,extra:0});
      const k=r.total>=lv?0:r.total>=4?1:r.total>=2?2:3;
      const real=Math.min(k,t.n);
      st.stun=st.stun||{};
      if(real>0)st.stun[t.key]=(st.stun[t.key]||0)+real;
      rows.push({label:`${g.name}の【気絶】 →${t.name}`,die:r.die,text:`出目${r.die}＝${r.total}（目標${lv}）→${real?real+'人が気絶した（戦闘が終わるまで起き上がれない）':'抵抗した'}`,ok:real===0});
      core.note(`${g.name}の【気絶】：${real}人が気絶`,real?'ng':'ok');
    }else{
      const r=core.heroRoll({kind:'chk',stat:'mag',target:lv,extra:0,sub:false});
      let txt=`${rollInfo(r)}（目標${lv}）→${r.success?'抵抗した':'氷の槍が命中（生命点−2）'}`;
      if(!r.success){c.stats.life.cur=Math.max(0,c.stats.life.cur-2);core.checkDeath()}
      rows.push({label:`${g.name}の【氷槍】 →主人公`,die:r.die,text:txt,ok:r.success});
      core.note(`${g.name}の【氷槍】：${r.success?'抵抗':'2点のダメージ'}`,r.success?'ok':'ng');
    }
  }
}

function enemyRoll(nd,st){
  const c=C(),s=st.cur,rows=[];
  const ci=casterInfo(s,st);
  if(ci)castSpells(nd,st,ci,rows);
  const al=allocation(s,st);
  const r1=(nd.defMod1!=null&&st.round===1&&s.mode==='melee')?ev(nd.defMod1,st):0;
  const heroList=al.list.slice(0,al.hero),folList=al.list.slice(al.hero);
  const isR=s.mode==='ranged'?1:0;
  const bite=(at,r)=>{
    if(r.fum&&at.g.drain){
      const g=at.g,i=g.units.findIndex(h=>h>0);
      if(i>=0&&g.units[i]<g.hp0){g.units[i]+=1;return '（噛みつかれて吸血された：敵の生命点が1点回復）'}
      return '（噛みつかれた）';
    }
    return '';
  };
  heroList.forEach(at=>{
    if(A().phase!=='play')return;
    const r=core.heroRoll({kind:'def',target:at.level,extra:gmod(at.g,'defMod',st,{isHero:1,ranged:isR})+r1,sub:st.ui.sub});
    let txt=`${rollInfo(r)}→${r.success?'防いだ':'攻撃を受けた（生命点−'+at.dmg+'）'}`;
    if(!r.success){c.stats.life.cur=Math.max(0,c.stats.life.cur-at.dmg);core.checkDeath();txt+=bite(at,r)}
    rows.push({label:`主人公 ←${at.g.name}`,die:r.die,text:txt,ok:r.success});
    core.note(`防御（主人公）：${core.rollText(r)}→${r.success?'防いだ':'失敗'}`,r.success?'ok':'ng');
  });
  if(folList.length&&A().phase==='play'){
    const us=al.pool||fighters();
    folList.forEach((at,i)=>{
      if(!us.length)return;
      const u=us[i%us.length];
      const r=core.folRoll(u,{kind:'def',target:at.level,extra:gmod(at.g,'defMod',st,{isHero:0,ranged:isR})+r1});
      let txt=`${rollInfo(r)}→${r.success?'防いだ':'倒れた'}`;
      if(!r.success){core.killFollower(u);us.splice(i%us.length,1);core.note(`従者「${u.name}」が倒れた`,'ng');txt+=bite(at,r)}
      rows.push({label:`${u.name} ←${at.g.name}`,die:r.die,text:txt,ok:r.success});
    });
  }
  st.res={rows};
}

core.battle={alive,hpSum,allocation,enemyAttackList,roundSteps};
})();
