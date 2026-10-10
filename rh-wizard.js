/* キャラクター作成ガイド（シナリオの内容は入っていません）
   ルールの数値・装備表は、読み込んだデータ（rules）から取ります。
   mode: 'new'＝新しい主人公 / 'grow'＝経験点の振り分け / 'retry'＝死亡後の再挑戦 */
(function(){
'use strict';
const RH=window.RH;
const H=()=>window.RHH,C=()=>H().cur(),P=()=>RH.getPack();
const esc=s=>H().esc(s);
const fmt=n=>n>=0?'+'+n:'−'+Math.abs(n);
const R=()=>P().rules;
const STATS=[['skill','技量点'],['life','生命点'],['sub','副能力値'],['follower','従者点']];
const MODIDX={atk:0,def:1,mag:2,luk:3,str:4,dex:5,life:6};
const CATS={weapon:'武器',ranged:'飛び道具',armor:'鎧',shield:'盾',tool:'道具',consumable:'消耗品'};

RH.wiz=null;
RH.wizardOpen=false;

function newWiz(o){
  const c=C(),r=R();
  const w={mode:o.mode,step:0,name:'',sub:'',a:{skill:0,life:0,sub:0,follower:0},choose:0,buy:{},fol:{},trait:{},
    level:10,pool:0,spent0:{skill:0,life:0,sub:0,follower:0},startGold:r.startGold==null?10:r.startGold};
  if(o.mode==='grow'){
    w.pool=c.expPool||0;w.spent0=Object.assign({skill:0,life:0,sub:0,follower:0},c.expSpent||{});
  }else{
    let L=10;
    if(o.mode==='retry'){L=Math.max(10,c.level||10)}
    w.level=L;
    w.pool=(r.expStart==null?10:r.expStart)+(L-10);
    w.startGold=(r.startGold==null?10:r.startGold)+50*(L-10);
  }
  return w;
}
RH.openWizard=function(o){
  RH.wiz=newWiz(o||{mode:'new'});RH.wizardOpen=true;
  RH.wantTop=true;H().rerender();
};
function close(){RH.wiz=null;RH.wizardOpen=false;RH.wantTop=true;H().rerender()}

/* ---------- 計算 ---------- */
const subInfo=w=>(R().subs||{})[w.sub];
const cost=k=>R().expCost[k].per;
const cap=(w,k)=>Math.max(0,R().expCost[k].max-(w.spent0[k]||0));
const spentExp=w=>STATS.reduce((s,[k])=>s+w.a[k]*cost(k),0);
function kitIds(w){
  const si=subInfo(w);if(!si)return[];
  let ids=(si.kit||[]).slice();
  if(si.choose&&si.choose.options)ids=ids.concat(si.choose.options[w.choose]||[]);
  return ids;
}
const eqById=id=>(R().equipment||[]).find(e=>e.id===id);
function boughtIds(w){
  const out=[];
  Object.entries(w.buy).forEach(([id,n])=>{for(let i=0;i<n;i++)out.push(id)});
  return out;
}
function allEq(w){return kitIds(w).concat(boughtIds(w)).map(eqById).filter(Boolean)}
function spentGold(w){
  const g1=boughtIds(w).reduce((s,id)=>s+(eqById(id)?eqById(id).price:0),0);
  const g2=Object.entries(w.fol).reduce((s,[id,n])=>{const f=(R().followers||[]).find(x=>x.id===id);return s+(f?f.price*n:0)},0);
  return g1+g2;
}
const goldLeft=w=>w.startGold-spentGold(w);
const folCount=w=>Object.values(w.fol).reduce((s,n)=>s+n,0);
function lifeMods(w){return allEq(w).reduce((s,e)=>s+((e.mods&&e.mods.life)||0),0)}
function derived(w){
  const b=R().base,c=C();
  if(w.mode==='grow'){
    return{
      skill:c.stats.skill.max+w.a.skill,life:c.stats.life.max+w.a.life,
      sub:c.stats.sub.max+w.a.sub,follower:c.stats.follower.max+w.a.follower};
  }
  return{skill:b.skill+w.a.skill,life:b.life+w.a.life+lifeMods(w),sub:b.sub+w.a.sub,follower:b.follower+w.a.follower};
}

/* ---------- 画面 ---------- */
function head(w,title,n,total){
  return `<div class="wizhead"><span>${esc(title)}</span>${total?`<span class="wizstep">${n}/${total}</span>`:''}</div>`;
}
function stepList(w){
  if(w.mode==='grow')return['exp'];
  return['name','exp','kit','shop','fol','done'];
}
function nav(w,canNext,last){
  const list=stepList(w),i=w.step;
  return `<div class="wiznav">${i>0?`<button class="btn" data-adv="w-back">戻る</button>`:`<button class="btn" data-adv="w-cancel">やめる</button>`}
    ${last?`<button class="btn primary roll" data-adv="w-finish"${canNext?'':' disabled'}>${w.mode==='grow'?'この内容で成長させる':'この主人公を作る'}</button>`
      :`<button class="btn primary" data-adv="w-next"${canNext?'':' disabled'}>次へ</button>`}</div>`;
}
function viewName(w){
  const subs=R().subs||{};
  const names=Object.keys(subs);
  const chips=names.map(n=>{
    const ok=subs[n].enabled!==false;
    return `<button class="chipbtn${w.sub===n?' on':''}" data-adv="w-sub" data-v="${esc(n)}"${ok?'':' disabled'}>${esc(n)}${ok?'':'（準備中）'}</button>`;
  }).join('');
  const si=w.sub&&subs[w.sub];
  return `${head(w,w.mode==='retry'?'再挑戦する主人公':'主人公の名前と得意分野',1,6)}
    ${w.mode==='retry'?`<p class="hint">前の主人公と同じ経験レベル（${w.level}）で作り直せます。経験点は${w.pool}点、金貨は${w.startGold}枚から始まります。</p>`:''}
    <label class="field"><span>名前</span><input type="text" data-advc="w-name" value="${esc(w.name)}" placeholder="主人公の名前" autocomplete="off"></label>
    <p class="hint">得意分野（副能力値）を選びます。これで使える技能と、最初の装備が決まります。</p>
    <div class="pickrow">${chips}</div>
    ${si?`<div class="rulebox"><b>${esc(w.sub)}</b><p class="hint">${esc(si.text||'')}</p>${(si.skillNames||[]).length?`<p class="hint">使える技能：${si.skillNames.map(esc).join('、')}</p>`:''}</div>`:''}
    ${nav(w,!!w.sub)}`;
}
function viewExp(w){
  const d=derived(w),left=w.pool-spentExp(w),c=C();
  const rows=STATS.map(([k,n])=>{
    const nm=k==='sub'&&w.sub?w.sub:n;
    const canUp=left>=cost(k)&&w.a[k]<cap(w,k);
    const eqLife=k==='life'&&w.mode!=='grow'?lifeMods(w):0;
    return `<div class="exprow"><div class="expname"><b>${esc(nm)}</b><small>${cost(k)}点で+1・あと+${cap(w,k)-w.a[k]}まで</small></div>
      <div class="expctl"><button class="step sm" data-adv="w-exp" data-k="${k}" data-d="-1"${w.a[k]>0?'':' disabled'}>−</button>
      <span class="expval">${d[k]}${eqLife?`<small>（装備＋${eqLife}）</small>`:''}</span>
      <button class="step sm" data-adv="w-exp" data-k="${k}" data-d="1"${canUp?'':' disabled'}>＋</button></div></div>`;
  }).join('');
  const intro=w.mode==='grow'?'手に入れた経験点で、能力値を伸ばします。使わなかった分は、あとで使えます。':'最初に持っている経験点を、能力値に振り分けます。';
  return `${head(w,w.mode==='grow'?'経験点の振り分け':'能力値を決める',w.mode==='grow'?0:2,w.mode==='grow'?0:6)}
    <p class="hint">${intro}</p>
    <div class="expleft">残りの経験点 <b>${left}</b> / ${w.pool}</div>${rows}
    <p class="hint">技量点は4点で+1（最大+2）、生命点と副能力値は1点で+1（最大+4）、従者点は2点で+1（最大+2）です。</p>
    ${nav(w,true,w.mode==='grow')}`;
}
function traitSel(w,e){
  if(!e.trait)return '';
  const t=w.trait[e.id]||'斬撃';
  return `<span class="traitsel"><button class="chipbtn sm${t==='斬撃'?' on':''}" data-adv="w-trait" data-id="${e.id}" data-v="斬撃">斬撃</button><button class="chipbtn sm${t==='打撃'?' on':''}" data-adv="w-trait" data-id="${e.id}" data-v="打撃">打撃</button></span>`;
}
function viewKit(w){
  const si=subInfo(w);
  const fixed=(si.kit||[]).map(eqById).filter(Boolean);
  let ch='';
  if(si.choose){
    ch=`<p class="hint">${esc(si.choose.label)}を選んでください。</p><div class="pickrow">${si.choose.options.map((o,i)=>`<button class="chipbtn${w.choose===i?' on':''}" data-adv="w-choose" data-i="${i}">${o.map(id=>esc((eqById(id)||{name:id}).name)).join('＋')}</button>`).join('')}</div>`;
  }
  const chosen=(si.choose&&si.choose.options[w.choose]||[]).map(eqById).filter(Boolean);
  const list=fixed.concat(chosen).map(e=>`<div class="shoprow"><div class="shopname"><b>${esc(e.name)}</b><small>${esc(e.note||'')}</small></div>${traitSel(w,e)}</div>`).join('');
  return `${head(w,'最初の装備',3,6)}
    <p class="hint">${esc(w.sub)}の主人公は、次の装備を無料で持って始まります。</p>${ch}<div>${list}</div>
    ${nav(w,true)}`;
}
function viewShop(w){
  const left=goldLeft(w);
  const cats=Object.keys(CATS);
  const eq=(R().equipment||[]).filter(e=>e.cat!==undefined);
  const html=cats.map(cat=>{
    const items=eq.filter(e=>e.cat===cat);
    if(!items.length)return '';
    return `<div class="subhead">${CATS[cat]}</div>`+items.map(e=>{
      const n=w.buy[e.id]||0;
      return `<div class="shoprow"><div class="shopname"><b>${esc(e.name)}</b><small>金貨${e.price}枚・${esc(e.note||'')}</small></div>
        ${n>0?traitSel(w,e):''}
        <div class="expctl"><button class="step sm" data-adv="w-buy" data-id="${e.id}" data-d="-1"${n>0?'':' disabled'}>−</button><span class="expval">${n}</span><button class="step sm" data-adv="w-buy" data-id="${e.id}" data-d="1"${left>=e.price?'':' disabled'}>＋</button></div></div>`;
    }).join('');
  }).join('');
  return `${head(w,'買い物',4,6)}
    <p class="hint">金貨で装備を買います。何も買わなくても進めます。手に持てるのは、両手分までです。</p>
    <div class="expleft">所持金 <b>${left}</b> 枚 / ${w.startGold}枚</div>${html}${nav(w,true)}`;
}
function viewFol(w){
  const d=derived(w),left=goldLeft(w),n=folCount(w);
  const rows=(R().followers||[]).map(f=>{
    const c=w.fol[f.id]||0;
    return `<div class="shoprow"><div class="shopname"><b>${esc(f.name)}</b><small>${f.price>0?'金貨'+f.price+'枚・':'無料・'}${esc(f.note||'')}</small></div>
      <div class="expctl"><button class="step sm" data-adv="w-fol" data-id="${f.id}" data-d="-1"${c>0?'':' disabled'}>−</button><span class="expval">${c}</span><button class="step sm" data-adv="w-fol" data-id="${f.id}" data-d="1"${(n<d.follower&&left>=f.price)?'':' disabled'}>＋</button></div></div>`;
  }).join('');
  return `${head(w,'従者を雇う',5,6)}
    <p class="hint">従者は、従者点の最大値（${d.follower}）まで連れていけます。戦う従者は敵の攻撃を受けると倒れます。</p>
    <div class="expleft">従者 <b>${n}</b> / ${d.follower}　所持金 <b>${left}</b> 枚</div>${rows}${nav(w,true)}`;
}
function viewDone(w){
  const d=derived(w),eq=allEq(w);
  const eqs=eq.map(e=>e.name+(e.trait?`（${w.trait[e.id]||'斬撃'}）`:'')).join('、');
  const fs=Object.entries(w.fol).filter(([,n])=>n>0).map(([id,n])=>{const f=R().followers.find(x=>x.id===id);return `${f.name}×${n}`}).join('、')||'なし';
  return `${head(w,'確認',6,6)}
    <div class="kv2"><span>名前</span><b>${esc(w.name||'（名前なし）')}</b><span>得意分野</span><b>${esc(w.sub)}</b>
      <span>技量点</span><b>${d.skill}</b><span>生命点</span><b>${d.life}</b><span>${esc(w.sub)}</span><b>${d.sub}</b><span>従者点</span><b>${d.follower}</b>
      <span>経験レベル</span><b>${w.level}</b><span>金貨</span><b>${goldLeft(w)}枚</b><span>食料</span><b>${R().startFood==null?2:R().startFood}</b>
      <span>装備</span><b>${esc(eqs)}</b><span>従者</span><b>${esc(fs)}</b></div>
    <p class="hint">「この主人公を作る」を押すと、新しい主人公がシートに追加されます。今の主人公は消えません。</p>
    ${nav(w,true,true)}`;
}
RH.wizardView=function(){
  const w=RH.wiz;
  if(!w)return '';
  const id=stepList(w)[w.step];
  const body={name:viewName,exp:viewExp,kit:viewKit,shop:viewShop,fol:viewFol,done:viewDone}[id](w);
  return `<section class="card wizard"><h2>${w.mode==='grow'?'成長':w.mode==='retry'?'再挑戦':'キャラクター作成ガイド'}</h2><div class="body">${body}</div></section>`;
};

/* ---------- シートへの反映 ---------- */
function applyNew(w){
  const c=H().makeChar(w.name||'');
  const r=R(),d=derived(w),eq=allEq(w);
  c.level=w.level;c.subType=w.sub;
  c.stats.skill.max=c.stats.skill.cur=d.skill;
  c.stats.life.max=c.stats.life.cur=d.life;
  c.stats.sub.max=c.stats.sub.cur=d.sub;
  c.stats.follower.max=d.follower;
  c.gold=goldLeft(w);c.food=r.startFood==null?2:r.startFood;
  const si=subInfo(w);
  c.skills={};(si.skills||[]).forEach(k=>{c.skills[k]=true});
  const nm=e=>e.name+(e.trait?`（${w.trait[e.id]||'斬撃'}）`:'');
  const hands=[];c.items=[];
  const rowOf={weapon:0,shield:1,armor:2};
  eq.forEach(e=>{
    if(e.slot==='armor'){c.armor=c.armor?c.armor+'・'+nm(e):nm(e)}
    else if(e.slot==='hand')hands.push(e);
    else c.items.push(nm(e));
    const row=rowOf[e.cat];
    if(row!=null&&e.mods){
      Object.entries(e.mods).forEach(([k,v])=>{
        if(e.cat==='ranged')return;
        if(MODIDX[k]!=null)c.mods[row].v[MODIDX[k]]+=v;
      });
    }
  });
  // 手に持つもの：両手武器は両手、それ以外は手1・手2の順。あふれは装備品へ
  let used=0;const put=[];
  hands.sort((a,b)=>(b.hands||1)-(a.hands||1));
  hands.forEach(e=>{
    const n=e.hands||1;
    if(used+n<=2){put.push(e);used+=n}else c.items.push(nm(e));
  });
  if(put[0])c.hand1=nm(put[0]);
  if(put[1]){c.hand2=nm(put[1])}
  if(put[0]&&(put[0].hands||1)===2)c.hand2='（両手で持つ）';
  c.followers={fight:[],nofight:[]};
  Object.entries(w.fol).forEach(([id,n])=>{
    if(!n)return;const f=r.followers.find(x=>x.id===id);
    (f.fight?c.followers.fight:c.followers.nofight).push({name:f.name,skill:f.skill||0,count:n,kind:f.id});
  });
  c.stats.follower.cur=folCount(w);
  c.expSpent=Object.assign({},w.a);c.expPool=0;c.clears=0;c.adventures=0;c.dead=false;c.adv=null;
  return c;
}
function applyGrow(w){
  const c=C();
  STATS.forEach(([k])=>{
    const d=w.a[k];if(!d)return;
    c.stats[k].max+=d;
    if(k!=='follower')c.stats[k].cur+=d;
  });
  c.expSpent=Object.assign({skill:0,life:0,sub:0,follower:0},c.expSpent||{});
  STATS.forEach(([k])=>{c.expSpent[k]+=w.a[k]});
  c.expPool=Math.max(0,(c.expPool||0)-spentExp(w));
}

/* ---------- 操作 ---------- */
RH.wizAct=function(el){
  const w=RH.wiz;if(!w)return;
  const name=el.dataset.adv,d=Number(el.dataset.d)||0;
  const list=stepList(w);
  switch(name){
    case 'w-cancel':close();return;
    case 'w-back':w.step=Math.max(0,w.step-1);RH.wantTop=true;break;
    case 'w-next':
      if(list[w.step]==='fol'||list[w.step]==='shop'||true)w.step=Math.min(list.length-1,w.step+1);
      RH.wantTop=true;break;
    case 'w-sub':w.sub=el.dataset.v;w.choose=0;break;
    case 'w-choose':w.choose=Number(el.dataset.i);break;
    case 'w-trait':w.trait[el.dataset.id]=el.dataset.v;break;
    case 'w-exp':{
      const k=el.dataset.k,nv=w.a[k]+d;
      if(nv<0||nv>cap(w,k))break;
      if(d>0&&w.pool-spentExp(w)<cost(k))break;
      w.a[k]=nv;
      // 従者点を減らしたとき、従者が多すぎたら減らす
      const max=derived(w).follower;
      while(folCount(w)>max){const id=Object.keys(w.fol).find(x=>w.fol[x]>0);w.fol[id]--}
      break}
    case 'w-buy':{
      const id=el.dataset.id,e=eqById(id);if(!e)break;
      const n=(w.buy[id]||0)+d;
      if(n<0)break;
      if(d>0&&goldLeft(w)<e.price)break;
      w.buy[id]=n;break}
    case 'w-fol':{
      const id=el.dataset.id,f=R().followers.find(x=>x.id===id);if(!f)break;
      const n=(w.fol[id]||0)+d;
      if(n<0)break;
      if(d>0&&(goldLeft(w)<f.price||folCount(w)>=derived(w).follower))break;
      w.fol[id]=n;break}
    case 'w-finish':{
      if(w.mode==='grow'){applyGrow(w);close();H().toast('能力値を成長させました');H().save();return}
      const old=C();
      const nc=applyNew(w);
      if(w.mode==='retry'){old.adv=null;old.dead=true}
      H().addChar(nc);
      RH.wiz=null;RH.wizardOpen=false;
      H().toast('新しい主人公を作りました');
      H().save();H().syncUI&&H().syncUI();H().rerender();return}
  }
  H().rerender();
};
RH.wizChange=function(el){
  const w=RH.wiz;if(!w)return;
  if(el.dataset.advc==='w-name')w.name=el.value;
};
RH.wizTest={derived,applyNew,newWiz};
})();
