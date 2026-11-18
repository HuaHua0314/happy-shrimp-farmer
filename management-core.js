/* Pure calculations. No Firebase reads or writes. */
(function(root){
const hasOwn=(value,key)=>Object.prototype.hasOwnProperty.call(value,key);
const items=o=>Array.isArray(o?.items)?o.items:Object.values(o?.items|| (o?.productId?{legacy:o}:{}));
const total=o=>o?.amount!==undefined&&o.amount!==null&&o.amount!==''&&Number.isFinite(Number(o.amount))?Number(o.amount):items(o).reduce((s,i)=>s+(+i.qty||0)*(+i.unitPrice||0),0);
const sameItems=(a,b)=>JSON.stringify(items(a).map(i=>[i.productId,i.productName,+i.unitPrice||0,+i.qty||0,+i.gift||0]))===JSON.stringify(items(b).map(i=>[i.productId,i.productName,+i.unitPrice||0,+i.qty||0,+i.gift||0]));
const quantities=o=>items(o).reduce((a,i)=>{if(!i.productId)throw Error('商品缺少穩定 ID，請先確認此訂單商品');a[i.productId]=(a[i.productId]||0)+(+i.qty||0)+(+i.gift||0);return a},{});
const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])])):value;
const equal=(a,b)=>JSON.stringify(canonical(a))===JSON.stringify(canonical(b));
const norm=s=>String(s||'').trim().toLowerCase();
const identity=o=>{const account=norm(o.contactOther||o.contactAccount);return account?'account_'+Array.from(norm(({賣貨便:'711',好賣家:'全家'})[o.contactType||o.contact]||o.contactType||o.contact||'Line')+':'+account).map(c=>c.codePointAt(0).toString(16)).join('_'):''};
function baseCustomerIndex(orders,profiles={}){
 const groups={};Object.entries(orders).forEach(([id,o])=>{const key=o.customerId||identity(o)||'order:'+id;const g=groups[key]||={id:key,name:o.customer||'',contactType:({賣貨便:'711',好賣家:'全家'})[o.contactType||o.contact]||o.contactType||o.contact||'Line',contactAccount:o.contactOther||o.contactAccount||'',phone:o.phone||'',delivery:o.delivery||'',deliveryDetail:o.deliveryDetail||o.deliveryOther||o.detail||'',notes:'',orders:[]};g.orders.push({...o,id});});
 Object.entries(profiles).forEach(([id,p])=>{groups[id]||={id,orders:[]};Object.assign(groups[id],p)});
 return Object.values(groups).map(g=>{g.orders.sort((a,b)=>(+a.createdAt||0)-(+b.createdAt||0));if(!hasOwn(profiles[g.id]||{},'phone'))g.phone=[...g.orders].reverse().find(o=>o.phone)?.phone||g.phone||'';const frequency={};for(const o of g.orders){const method=o.delivery||'',detail=o.deliveryDetail||o.deliveryOther||o.detail||'';if(method){const key=JSON.stringify([method,detail]);frequency[key]=(frequency[key]||0)+1}}const common=Object.entries(frequency).sort((a,b)=>b[1]-a[1])[0];if(common){const [method,detail]=JSON.parse(common[0]);if(!hasOwn(profiles[g.id]||{},'delivery'))g.delivery=method;if(!hasOwn(profiles[g.id]||{},'deliveryDetail'))g.deliveryDetail=detail}const dated=g.orders.map(o=>+o.createdAt||0).filter(Boolean);return {...g,phoneLast3:hasOwn(profiles[g.id]||{},'phoneLast3')?String(profiles[g.id].phoneLast3||''):String([...g.orders].reverse().find(o=>o.phoneLast3)?.phoneLast3||''),count:g.orders.length,total:g.orders.reduce((s,o)=>s+total(o),0),first:dated.length?Math.min(...dated):0,last:dated.length?Math.max(...dated):0}});
}
const validLast3=value=>typeof value==='string'&&/^[0-9]{3}$/.test(value);
function resolveCustomer(id,aliases={}){
 const seen=new Set();while(aliases[id]){if(seen.has(id)||typeof aliases[id]!=='string')throw Error('客戶合併對照異常，請先檢查紀錄');seen.add(id);id=aliases[id]}return id;
}
function customerIndex(orders,profiles={},aliases={}){
 const base=baseCustomerIndex(orders,profiles),byId=Object.fromEntries(base.map(c=>[c.id,c])),groups={};
 for(const c of base){const id=resolveCustomer(c.id,aliases),master=byId[id]||c,g=groups[id]||={...master,id,orders:[],sourceIds:[],channels:[]};g.sourceIds.push(c.id);g.orders.push(...c.orders);g.channels.push(...c.orders.map(o=>({platform:o.contactType||o.contact||'Line',account:o.contactOther||o.contactAccount||''})),{platform:c.contactType||'Line',account:c.contactAccount||''});}
 return Object.values(groups).map(g=>{const unique=new Map(g.orders.map(o=>[o.id,o]));g.orders=[...unique.values()].sort((a,b)=>(+a.createdAt||0)-(+b.createdAt||0)||String(a.id).localeCompare(String(b.id)));g.sourceIds.sort();g.channels=[...new Map(g.channels.map(c=>[JSON.stringify(c),c])).values()];const dates=g.orders.map(o=>+o.createdAt||0).filter(Boolean);return {...g,count:g.orders.length,total:g.orders.reduce((s,o)=>s+total(o),0),first:dates.length?Math.min(...dates):0,last:dates.length?Math.max(...dates):0}});
}
function customerCandidates(list,name,last3){if(!String(name||'').trim())return [];return list.filter(c=>String(c.name||'').trim()===name.trim());}
// Customer selection/profile enrichment and the order commit atomically. No legacy orders are rewritten.
function applyCustomerOrder(state,id,next,expected,operation,actor,now,selection){
 if(state?.inventoryOperations?.[operation])return state;
 if(next&&!expected){
  if(!String(next.customer||'').trim())throw Error('請填寫客戶姓名');
  if(next.phoneLast3&&!validLast3(next.phoneLast3))throw Error('手機後三碼請填 3 位數字，或留白稍後補填');
  const list=customerIndex(state?.orders||{},state?.customers||{},state?.customerAliases||{});
  if(selection?.kind==='existing'){
   const c=list.find(c=>c.id===selection.id);if(!c||resolveCustomer(selection.id,state.customerAliases)!==selection.id)throw Error('客戶關聯已變更，請重新選擇');
   if(!equal(c,selection.snapshot))throw Error('客戶資料已更新，請重新確認選擇');
   if(c.name.trim()!==next.customer.trim()||(c.phoneLast3&&next.phoneLast3&&c.phoneLast3!==next.phoneLast3&&!selection.allowSuffixMismatch)||next.customerId!==c.id)throw Error('姓名或後三碼與選擇的客戶不符，請重新確認');
  }else{
   if(selection?.kind!=='independent'&&customerCandidates(list,next.customer,next.phoneLast3).length)throw Error('有可能符合的客戶，請先確認使用舊客戶或建立獨立客戶');
   if(!next.customerId||list.some(c=>c.id===next.customerId)||state?.customerAliases?.[next.customerId])throw Error('獨立客戶 ID 衝突，請重新開啟訂單');
  }
 }
 const n=applyOrder(state,id,next,expected,operation,actor,now);
 if(next&&!expected){n.customers||={};const profile=n.customers[next.customerId]||{},chosen=selection?.kind==='existing'?selection.snapshot:null;const suffix=chosen?.phoneLast3||next.phoneLast3||'';n.customers[next.customerId]={...profile,name:next.customer,phoneLast3:suffix,updatedBy:actor,updatedAt:now};}
 return n;
}
function mergeCustomers(state,sourceId,targetId,expectedSource,expectedTarget,operation,actor,now){
 if(!state)throw Error('尚未取得伺服器資料');if(state.customerMergeHistory?.[operation])return state;
 if(sourceId===targetId||resolveCustomer(sourceId,state.customerAliases)!==sourceId||resolveCustomer(targetId,state.customerAliases)!==targetId)throw Error('客戶已合併或選擇相同客戶，請重新預覽');
 const list=customerIndex(state.orders||{},state.customers||{},state.customerAliases||{}),source=list.find(c=>c.id===sourceId),target=list.find(c=>c.id===targetId);
 if(!source||!target||!equal(source,expectedSource)||!equal(target,expectedTarget))throw Error('預覽後客戶或訂單已變更，請重新預覽');
 const n=JSON.parse(JSON.stringify(state));n.customerAliases||={};n.customerAliases[sourceId]=targetId;n.customerMergeHistory||={};
 n.customerMergeHistory[operation]={sourceId,targetId,sourceSnapshot:source,targetSnapshot:target,status:'active',operator:actor,date:now};return n;
}
function undoCustomerMerge(state,operation,actor,now){
 const h=state?.customerMergeHistory?.[operation];if(!h||h.status!=='active')throw Error('此合併已解除或找不到紀錄');
 if(state.customerAliases?.[h.sourceId]!==h.targetId||resolveCustomer(h.targetId,state.customerAliases)!==h.targetId)throw Error('有後續合併或對照已變更，請先依相反順序解除');
 const n=JSON.parse(JSON.stringify(state));delete n.customerAliases[h.sourceId];n.customerMergeHistory[operation]={...h,status:'reversed',reversedBy:actor,reversedAt:now};return n;
}
// Applied inside a single transaction at users/{uid}. Existing shipped orders have no ledger.
function applyOrder(state,id,next,expected,operation,actor,now){
 if(!state)throw Error('尚未取得伺服器資料');
 if(state.inventoryOperations?.[operation])return state;
 const old=state.orders?.[id]||null;
 if(!equal(old,expected))throw Error('此訂單已被其他裝置更新，請重新開啟後再操作');
 const s=JSON.parse(JSON.stringify(state)),inv=s.inventory;
 if(inv?.initializedAt){
  const prior=inv.orderLedger?.[id]||{},desired=next?.shipped?quantities(next):{};
  // A legacy order already shipped before baseline is exempt until explicitly unshipped.
  const exempt=old?.shipped&&!inv.orderLedger?.[id];
  const target=exempt&&next?.shipped?{}:desired;
  const ids=new Set([...Object.keys(prior),...Object.keys(target)]);
  for(const pid of ids){const delta=(+prior[pid]||0)-(+target[pid]||0);if(!delta)continue;
   if(!inv.stock||!hasOwn(inv.stock,pid))throw Error('此商品尚未盤點，請先補登庫存：'+pid);
   inv.stock[pid]+=delta;
   s.inventoryMovements||={};s.inventoryMovements[operation+'_'+pid]={productId:pid,quantity:delta,reason:next?'訂單出貨／調整':'刪除訂單還原',orderId:id,operator:actor,date:now};
  }
  inv.orderLedger||={};if(next?.shipped&&!exempt)inv.orderLedger[id]=target;else delete inv.orderLedger[id];
 }
 s.orders||={};if(next)s.orders[id]=next;else delete s.orders[id];
 s.inventoryOperations||={};s.inventoryOperations[operation]={date:now,operator:actor};return s;
}
function report(orders,expenses,start,end){
 const inside=t=>Number(t)>=start&&Number(t)<end;
 const chosen=Object.values(orders).filter(o=>inside(o.createdAt));let sales={},packs=0,shipped=0,ordered=0,paid=0,unpaid=0;
 chosen.forEach(o=>{ordered+=total(o);if(o.paid)paid+=total(o);else unpaid+=total(o);items(o).forEach(i=>{let n=(+i.qty||0)+(+i.gift||0);packs+=n;if(o.shipped)shipped+=n;const key=i.productId||'legacy:'+i.productName;let row=sales[key]||={name:i.productName,qty:0,gift:0,revenue:0};row.qty+=+i.qty||0;row.gift+=+i.gift||0;row.revenue+=(+i.qty||0)*(+i.unitPrice||0)})});
 const cash=Object.values(orders).filter(o=>o.paid&&inside(o.paidAt)).reduce((s,o)=>s+total(o),0);
 const unknown=Object.values(orders).filter(o=>o.paid&&!o.paidAt);
 const expense=Object.values(expenses).filter(e=>e.date>=new Date(start).toLocaleDateString('en-CA',{timeZone:'Asia/Taipei'})&&e.date<new Date(end).toLocaleDateString('en-CA',{timeZone:'Asia/Taipei'})).reduce((s,e)=>s+(+e.amount||0),0);
 return {count:chosen.length,packs,shipped,unshipped:packs-shipped,ordered,paid,unpaid,cash,expense,net:cash-expense,unknownCount:unknown.length,unknownAmount:unknown.reduce((s,o)=>s+total(o),0),sales:Object.values(sales).sort((a,b)=>b.qty-a.qty)};
}
root.ShrimpCore={hasOwn,items,total,sameItems,quantities,identity,validLast3,resolveCustomer,customerIndex,customerCandidates,applyCustomerOrder,mergeCustomers,undoCustomerMerge,applyOrder,report};
if(typeof module!=='undefined')module.exports=root.ShrimpCore;
})(globalThis);
