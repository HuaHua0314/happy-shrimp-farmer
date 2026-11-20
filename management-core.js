/* Pure calculations. No Firebase reads or writes. */
(function(root){
const hasOwn=(value,key)=>Object.prototype.hasOwnProperty.call(value,key);
const items=o=>Array.isArray(o?.items)?o.items:Object.values(o?.items|| (o?.productId?{legacy:o}:{}));
const total=o=>o?.amount!==undefined&&o.amount!==null&&o.amount!==''&&Number.isFinite(Number(o.amount))?Number(o.amount):items(o).reduce((s,i)=>s+(+i.qty||0)*(+i.unitPrice||0),0);
const sameItems=(a,b)=>JSON.stringify(items(a).map(i=>[i.productId,i.productName,+i.unitPrice||0,+i.qty||0,+i.gift||0]))===JSON.stringify(items(b).map(i=>[i.productId,i.productName,+i.unitPrice||0,+i.qty||0,+i.gift||0]));
const quantities=o=>items(o).reduce((a,i)=>{if(!i.productId)throw Error('商品缺少穩定 ID，請先確認此訂單商品');const q=Number(i.qty||0),g=Number(i.gift||0);if(!Number.isSafeInteger(q)||!Number.isSafeInteger(g)||q<0||g<0||!Number.isSafeInteger((a[i.productId]||0)+q+g))throw Error('商品及贈品包數必須為非負安全整數');a[i.productId]=(a[i.productId]||0)+q+g;return a},{});
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
const taipeiDate=t=>{const p=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(t)).map(x=>[x.type,x.value]));return p.year+'-'+p.month+'-'+p.day};
function updateCustomerProfile(state,id,changes,expected,actor,now){
 if(!state||resolveCustomer(id,state.customerAliases)!==id)throw Error('客戶已合併或尚未同步，請重新開啟資料');
 if(!equal(state.customers?.[id]||null,expected))throw Error('客戶資料已被其他裝置修改，請重新開啟後再編輯');
 if(!String(changes.name||'').trim())throw Error('請填寫客戶姓名');
 if(changes.phoneLast3&&!validLast3(changes.phoneLast3))throw Error('手機後三碼必須為 3 位數字或留白');
 const n=JSON.parse(JSON.stringify(state));n.customers||={};n.customers[id]={...(n.customers[id]||{})};
 for(const key of ['name','phoneLast3','phone','contactType','contactAccount','delivery','deliveryDetail','notes'])if(hasOwn(changes,key))n.customers[id][key]=key==='notes'?String(changes[key]||''):String(changes[key]||'').trim();
 n.customers[id].updatedBy=actor;n.customers[id].updatedAt=now;return n;
}
// Search only: matches never bind or merge a customer until the user selects one.
function searchCustomers(list,query,profiles={}){
 const q=norm(query);if(!q)return [];
 const phoneQuery=/^[+0-9\s()-]+$/.test(q)?q.replace(/\D/g,''):'';
 const accountQuery=q.replace(/^@/,'');
 return list.filter(c=>{
  const history=c.orders||[],sources=(c.sourceIds||[c.id]).map(id=>profiles[id]).filter(Boolean);
  const names=[c.name,...history.map(o=>o.customer),...sources.map(p=>p.name)];
  const phones=[c.phone,c.phoneLast3,...history.flatMap(o=>[o.phone,o.phoneLast3]),...sources.flatMap(p=>[p.phone,p.phoneLast3])];
  const accounts=[c.contactAccount,...(c.channels||[]).map(x=>x.account),...sources.map(p=>p.contactAccount)];
  return names.some(v=>norm(v).includes(q))||phones.some(v=>norm(v).includes(q))||(phoneQuery&&phones.some(v=>String(v||'').replace(/\D/g,'').includes(phoneQuery)))||(accountQuery&&accounts.some(v=>norm(v).replace(/^@/,'').includes(accountQuery)));
 });
}
// Customer selection/profile enrichment and the order commit atomically. No legacy orders are rewritten.
function applyCustomerOrder(state,id,next,expected,operation,actor,now,selection,options={}){
 if(state?.inventoryOperations?.[operation])return applyOrder(state,id,next,expected,operation,actor,now,options);
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
// Inventory v2: atomic root transactions; old orders are never migrated or rewritten.
// Sales recipes are explicit; never derive a stock identity from a name.
function physicalItems(state){const inv=state.inventory||{};if(inv.items)return inv.items;if(inv.initializedAt&&!inv.mappingMode){const out={};for(const id of Object.keys(inv.stock||{}))out[id]={name:state.products?.[id]?.name||id,active:true,legacy:true};return out}return {}}
function recipeFor(state,pid){const inv=state.inventory||{},r=inv.productMappings?.[pid];if(!r||!Object.keys(r.components||{}).length)throw Error('商品尚未設定庫存對應：'+pid);const components={};for(const [id,n] of Object.entries(r.components)){if(!inv.items?.[id])throw Error('對應的實體庫存不存在：'+id);components[id]=packCount(n)}return {version:r.version,components,names:Object.fromEntries(Object.keys(components).map(id=>[id,inv.items[id].name]))}}
function shipmentPlan(state,order,existing=null){const sales=quantities(order),recipes={},totals={};for(const [pid,n] of Object.entries(sales)){const r=existing?.recipes?.[pid]||recipeFor(state,pid);recipes[pid]=r;for(const [id,factor] of Object.entries(r.components)){const q=n*factor;if(!Number.isSafeInteger(q)||!Number.isSafeInteger((totals[id]||0)+q))throw Error('組合扣庫數量超出安全範圍');totals[id]=(totals[id]||0)+q}}return {sales,recipes,totals}}
function configureInventory(state,d,operation,actor,now){
 if(!state)throw Error('資料尚未同步');const fingerprint=JSON.stringify(canonical(d)),prior=state.inventoryOperations?.[operation];if(prior){if(prior.fingerprint!==fingerprint)throw Error('操作已完成，不可改送其他內容');return state}
 if(state.inventory?.initializedAt&&!state.inventory?.mappingMode)throw Error('已有舊版庫存資料，需先提出轉換方案，不能直接切換');
 if(d.kind!=='mappingBatch'&&(!d.id||/[.#$\[\]/]/.test(d.id)||['__proto__','constructor','prototype'].includes(d.id)))throw Error('資料ID無效');const n=JSON.parse(JSON.stringify(state));n.inventory||={};const inv=n.inventory;inv.items||={};inv.mappingMode=true;
 if(d.kind==='mappingBatch'){if(!Array.isArray(d.entries)||!d.entries.length)throw Error('請勾選要共用庫存的銷售商品');let batch=n;const seen=new Set();for(const [i,entry] of d.entries.entries()){if(seen.has(entry.id))throw Error('商品不可重複');seen.add(entry.id);batch=configureInventory(batch,{kind:'productMapping',id:entry.id,expectedProduct:entry.expectedProduct,expectedMapping:entry.expectedMapping,components:d.components},operation+'_'+i,actor,now)}batch.inventoryOperations[operation]={fingerprint,request:d,operator:actor,date:now};return batch;}
 if(d.kind==='stockItem'){if(!equal(inv.items[d.id]||null,d.expected||null))throw Error('實體品項已被其他裝置修改');const name=String(d.name||'').trim();if(!name)throw Error('請填寫實體庫存名稱');if(Object.entries(inv.items).some(([id,p])=>id!==d.id&&p.name===name))throw Error('已有同名實體庫存');inv.items[d.id]={...(inv.items[d.id]||{}),name,active:d.active!==false,updatedAt:now,operator:actor};}
 else if(d.kind==='productMapping'){
  const old=n.products?.[d.id]||null;if(!equal(old,d.expectedProduct||null)||!equal(inv.productMappings?.[d.id]||null,d.expectedMapping||null))throw Error('商品或對應已被其他裝置修改，請重新開啟');
  if(d.product){const name=String(d.product.name||'').trim(),price=Number(d.product.price);if(!name||!Number.isFinite(price)||price<0)throw Error('請輸入商品名稱與有效價格');if(Object.entries(n.products||{}).some(([id,p])=>id!==d.id&&p.name===name))throw Error('已有同名商品');n.products||={};n.products[d.id]={...(old||{}),name:old&&String(old.name).trim()===name?old.name:name,price:old&&Number(old.price)===price?old.price:price,...(!old?{active:true}:{})};}
  if(!n.products?.[d.id]&&!Object.values(n.orders||{}).some(o=>items(o).some(i=>i.productId===d.id)))throw Error('銷售商品不存在');
  if(d.newItem){const id=d.newItem.id;if(!id||/[.#$\[\]/]/.test(id)||['__proto__','constructor','prototype'].includes(id))throw Error('實體庫存ID無效');const name=String(d.newItem.name||'').trim();if(inv.items[id]||!name||Object.values(inv.items).some(p=>p.name===name))throw Error('獨立庫存名稱或ID重複／未填');inv.items[id]={name,active:true,createdAt:now,operator:actor};}
  const components={};for(const [id,q] of Object.entries(d.components||{})){if(!inv.items[id]||inv.items[id].active===false)throw Error('請選擇有效實體庫存');components[id]=packCount(q)}
  if(!Object.keys(components).length)throw Error('請明確設定至少一個庫存對應，不可自動猜測');
  inv.productMappings||={};inv.mappingVersions||={};const version=(inv.productMappings[d.id]?.version||0)+1,r={version,components,updatedAt:now,operator:actor};inv.productMappings[d.id]=r;inv.mappingVersions[d.id]||={};inv.mappingVersions[d.id]['v'+version]=r;
 }else throw Error('未知設定操作');
 n.inventoryOperations||={};n.inventoryOperations[operation]={fingerprint,request:d,operator:actor,date:now};return n;
}
function inventoryDemandIssues(orders,inv={}){const issues=[];for(const [id,o] of Object.entries(orders||{}))if(!o.shipped&&!inv.orderStates?.[id]?.cancelled){try{if(inv.mappingMode||!inv.initializedAt)shipmentPlan({inventory:inv},o);else quantities(o)}catch(e){issues.push({orderId:id,message:e.message})}}return issues}
const inventoryDemand=(orders,inv={})=>{const out={};for(const [id,o] of Object.entries(orders||{}))if(!o.shipped&&!inv.orderStates?.[id]?.cancelled)for(const item of items(o)){try{for(const [p,n] of Object.entries(inv.mappingMode||!inv.initializedAt?shipmentPlan({inventory:inv},{items:[item]}).totals:quantities({items:[item]})))out[p]=(out[p]||0)+n}catch(_){/* Visible unresolved-demand notice; never invent a product ID. */}}return out};
const packCount=(v,zero=false)=>{const n=Number(v);if(v===''||v===null||v===undefined||!Number.isSafeInteger(n)||n<(zero?0:1))throw Error('包數必須為安全範圍內的'+(zero?'非負':'正')+'整數');return n};
function inventoryStats(inv,start,end){const daily={},products={};for(const r of Object.values(inv?.receipts||{})){if(r.status!=='active'||r.kind!=='production'||r.date<start||r.date>end)continue;for(const l of Object.values(r.lines||{})){const d=daily[r.date]||={},p=products[l.productId]||={productId:l.productId,name:l.productName,quantity:0};d[l.productId]=(d[l.productId]||0)+l.quantity;p.quantity+=l.quantity}}return {daily,products:Object.values(products)}}
function inventoryMove(s,key,pid,delta,kind,actor,now,extra={},repair=false){const inv=s.inventory;inv.stock||={};const current=Number(inv.stock[pid]);if(!hasOwn(inv.stock,pid)||!Number.isSafeInteger(current)||current<0&&!repair)throw Error('此商品尚未盤點或庫存待核對：'+pid);const result=current+delta;if(!Number.isSafeInteger(result)||result<0)throw Error('庫存不足，請先補登入庫：'+pid);inv.stock[pid]=result;s.inventoryMovements||={};s.inventoryMovements[key]={productId:pid,quantity:delta,before:current,after:result,reason:kind,operator:actor,date:now,...extra}}
function applyInventory(state,request,operation,actor,now){
 if(!state)throw Error('尚未取得伺服器資料');const fingerprint=JSON.stringify(canonical(request)),prior=state.inventoryOperations?.[operation];if(prior){if(prior.fingerprint!==fingerprint)throw Error('此操作已完成，請重新開啟表單');return state}
 if(['stockItem','productMapping','mappingBatch'].includes(request.kind))return configureInventory(state,request,operation,actor,now);
 const s=JSON.parse(JSON.stringify(state));s.inventory||={};const inv=s.inventory,d=request;
 if(d.kind==='activate'){
  if(inv.initializedAt||inv.activation)throw Error('庫存已啟用，不可重複設定或覆蓋');if(Object.keys(inv.orderLedger||{}).length||Object.keys(s.inventoryMovements||{}).length)throw Error('已有庫存異動但缺少期初基準，請先核對，不可重新初始化');
  if(!inv.mappingMode||!Object.keys(inv.items||{}).length)throw Error('請先建立實體庫存並完成商品對應');const required=new Set([...Object.entries(s.products||{}).filter(([,p])=>p.active!==false).map(([id])=>id),...Object.entries(s.orders||{}).filter(([id,o])=>!o.shipped&&!inv.orderStates?.[id]?.cancelled).flatMap(([,o])=>items(o).map(i=>i.productId))]);for(const pid of required)recipeFor(s,pid);if(!equal(inv.productMappings,d.expectedMappings))throw Error('盤點期間商品對應已更新，請重新確認');
  const ids=new Set(Object.keys(inv.items||{}));
  if(!ids.size||JSON.stringify([...ids].sort())!==JSON.stringify(Object.keys(d.stock||{}).sort()))throw Error('商品已更新，請重新確認所有商品盤點');
  inv.stock={};for(const id of ids){inv.stock[id]=packCount(d.stock[id],true);s.inventoryMovements||={};s.inventoryMovements[operation+'_'+id]={productId:id,quantity:inv.stock[id],reason:'期初盤點（非製作）',operator:actor,date:now}}
  inv.initializedAt=now;inv.initializedBy=actor;inv.activation={version:3,status:'active',date:now,operator:actor};inv.orderLedger||={};inv.legacyExempt={};for(const [id,o] of Object.entries(s.orders||{}))if(o.shipped){inv.legacyExempt[id]=true;inv.everShipped||={};inv.everShipped[id]=true;}
 }else{
  if(!inv.initializedAt)throw Error('請先完成期初盤點；目前暫停出貨與庫存異動');
  if(d.kind==='receipt'){
   inv.receipts||={};const old=inv.receipts[d.id]||null;if(!equal(old,d.expected||null))throw Error('此入庫紀錄已被其他裝置修改，請重新開啟');
   if(old?.status==='void')throw Error('已作廢紀錄不可再修改');
   if(!['production','inbound'].includes(d.type)||!validDate(d.date))throw Error('請填寫有效日期與入庫類型');
   if(d.date>taipeiDate(Number(now)||Date.now()))throw Error('製作／入庫日期不可晚於今天');
   if(d.date<taipeiDate(Number(inv.initializedAt)||Date.now()))throw Error('啟用前製作可能已含期初庫存，不可重複入庫');
   const lines={};for(const [i,l] of (d.lines||[]).entries()){if(!(inv.mappingMode?inv.items?.[l.productId]:s.products?.[l.productId])&&!hasOwn(inv.stock||{},l.productId))throw Error('商品不存在');if(!hasOwn(inv.stock||{},l.productId))throw Error('新商品請先盤點目前實際庫存');lines['l'+i]={productId:l.productId,productName:Object.values(old?.lines||{}).find(x=>x.productId===l.productId)?.productName||(inv.mappingMode?inv.items?.[l.productId]?.name:s.products?.[l.productId]?.name)||l.productId,quantity:packCount(l.quantity)}}
   if(!Object.keys(lines).length)throw Error('請至少新增一個商品');
   const before={},after={};if(old?.status==='active')for(const l of Object.values(old.lines))before[l.productId]=(before[l.productId]||0)+l.quantity;
   if(!d.void)for(const l of Object.values(lines))after[l.productId]=(after[l.productId]||0)+l.quantity;
   for(const pid of new Set([...Object.keys(before),...Object.keys(after)])){const delta=(after[pid]||0)-(before[pid]||0);if(delta)inventoryMove(s,operation+'_'+pid,pid,delta,d.void?'入庫作廢沖銷':'製作／入庫差額',actor,now,{receiptId:d.id})}
   inv.receipts[d.id]={kind:d.type,date:d.date,lines,notes:String(d.notes||'').trim(),status:d.void?'void':'active',revision:(old?.revision||0)+1,createdAt:old?.createdAt||now,updatedAt:now,operator:actor};
  }else if(d.kind==='adjust'){
   const pid=d.productId;if(!(inv.mappingMode?inv.items?.[pid]:s.products?.[pid])&&!hasOwn(inv.stock||{},pid))throw Error('商品不存在');if(!equal(inv.stock?.[pid]??null,d.expected??null))throw Error('庫存已被其他裝置修改，請重新確認盤點');
   if(!String(d.reason||'').trim())throw Error('請填寫調整原因');
   if(d.mode==='count'){const target=packCount(d.quantity,true);if(!hasOwn(inv.stock||{},pid)){inv.stock||={};inv.stock[pid]=0}inventoryMove(s,operation,pid,target-inv.stock[pid],'盤點修正：'+d.reason,actor,now,{},true)}
   else{const qty=Number(d.quantity);if(!Number.isSafeInteger(qty)||!qty)throw Error('請輸入非零整數包數');inventoryMove(s,operation,pid,qty,'庫存調整：'+d.reason,actor,now)}
  }else if(['cancel','reopen','return'].includes(d.kind)){
   const o=s.orders?.[d.orderId];if(!o||!equal(o,d.expected))throw Error('訂單已變更，請重新開啟');
   inv.orderStates||={};if(!equal(inv.orderStates[d.orderId]||null,d.expectedState||null))throw Error('取消狀態已變更，請重新確認');
   if(d.kind==='return'){
    if(!o.shipped||d.confirmed!==true)throw Error('必須確認退貨已實際放回冷凍庫且可再販售');
    inv.returned||={};const returned=inv.returned[d.orderId]||{};if(!equal(returned,d.expectedReturned||{}))throw Error('退貨紀錄已變更，請重新確認');let shipped;if(inv.mappingMode){shipped=inv.orderSnapshots?.[d.orderId]?.totals||inv.legacyReturnSnapshots?.[d.orderId]?.totals;if(!shipped){if(!d.confirmedLegacyBasis)throw Error('歷史訂單無扣庫快照，請人工確認原出貨實體品項與總數');shipped={};for(const [id,q] of Object.entries(d.legacyBasis||{})){if(!inv.items?.[id])throw Error('歷史退貨實體品項不存在');const n=packCount(q,true);if(n)shipped[id]=n}if(!Object.keys(shipped).length)throw Error('請填寫原出貨實體總數');inv.legacyReturnSnapshots||={};inv.legacyReturnSnapshots[d.orderId]={totals:shipped,source:'manual-return-declaration',operator:actor,date:now};}}else shipped=quantities(o);let count=0;
    for(const [pid,raw] of Object.entries(d.quantities||{})){const q=packCount(raw,true);if(!q)continue;if(q>(shipped[pid]||0)-(returned[pid]||0)-(inv.disposed?.[d.orderId]?.[pid]||0))throw Error('退回數量超過可退包數');inventoryMove(s,operation+'_'+pid,pid,q,'確認實際退貨入庫',actor,now,{orderId:d.orderId});returned[pid]=(returned[pid]||0)+q;if(inv.orderLedger?.[d.orderId])inv.orderLedger[d.orderId][pid]=Math.max(0,(inv.orderLedger[d.orderId][pid]||0)-q);count+=q}
    if(!count)throw Error('請輸入至少一包實際回庫商品');inv.returned[d.orderId]=returned;inv.returns||={};inv.returns[operation]={orderId:d.orderId,quantities:d.quantities,reason:String(d.reason||''),operator:actor,date:now};
   }else inv.orderStates[d.orderId]={cancelled:d.kind==='cancel',reason:String(d.reason||''),operator:actor,date:now};
  }else throw Error('未知庫存操作');
 }
 s.inventoryOperations||={};s.inventoryOperations[operation]={fingerprint,request:d,operator:actor,date:now};return s;
}

// Uncollected deliveries: one authoritative case per order; no account/blacklist changes.
function normalizeRiskPhone(value){let s=String(value||'').trim();if(!/^[+0-9()\s-]+$/.test(s))return '';s=s.replace(/[()\s-]/g,'');if(s.startsWith('+886'))s='0'+s.slice(4);else if(s.startsWith('00886'))s='0'+s.slice(5);return /^09\d{8}$/.test(s)||/^0[2-8]\d{7,8}$/.test(s)?s:''}
function returnBasis(state,id){const inv=state.inventory||{};return inv.orderSnapshots?.[id]?.totals||inv.legacyReturnSnapshots?.[id]?.totals||null}
function uncollectedCases(state){return Object.entries(state.deliveryExceptions?.cases||{}).map(([orderId,c])=>({...c,orderId}))}
function uncollectedMatches(state,customerId,phone){const p=normalizeRiskPhone(phone),aliases=state.customerAliases||{},id=customerId?resolveCustomer(customerId,aliases):'';return uncollectedCases(state).filter(c=>c.reminderExcluded!==true&&((id&&resolveCustomer(c.subjectId,aliases)===id)||(p&&c.subjectPhone===p))).map(c=>({...c,matchBy:id&&resolveCustomer(c.subjectId,aliases)===id?'customer':'phone'}))}
function applyUncollected(state,d,operation,actorUid,actor,now){
 if(!state||!actorUid)throw Error('登入或同步已失效');const fingerprint=JSON.stringify(canonical(d)),done=state.deliveryExceptions?.operations?.[operation];if(done){if(done.fingerprint!==fingerprint)throw Error('上次操作已完成，請重新開啟紀錄');return state}
 const order=state.orders?.[d.orderId],inv0=state.inventory||{},old=state.deliveryExceptions?.cases?.[d.orderId]||null;
 if(!order?.shipped||!equal(order,d.expectedOrder))throw Error('僅限已出貨且未被其他裝置修改的訂單');if(!equal(old,d.expectedCase||null))throw Error(old?'此訂單已有未取貨紀錄或已被其他裝置修改，請開啟原紀錄':'紀錄已變更，請重新開啟');
 if(!inv0.initializedAt||!inv0.mappingMode)throw Error('庫存尚未完成實體對應，暫停退回回庫');
 if(!equal(inv0.returned?.[d.orderId]||{},d.expectedReturned||{})||!equal(inv0.disposed?.[d.orderId]||{},d.expectedDisposed||{}))throw Error('退貨／報廢已被其他裝置更新，請重新核對');
 const s=JSON.parse(JSON.stringify(state)),inv=s.inventory;let basis=returnBasis(s,d.orderId);
 if(!basis){if(!d.confirmedLegacyBasis)throw Error('歷史單無出貨快照，必須人工確認原實體總包數');basis={};for(const [id,q] of Object.entries(d.legacyBasis||{})){if(!inv.items?.[id])throw Error('原出貨實體品項不存在');const n=packCount(q,true);if(n)basis[id]=n}if(!Object.keys(basis).length)throw Error('請填原出貨實體總包數');inv.legacyReturnSnapshots||={};inv.legacyReturnSnapshots[d.orderId]={totals:basis,source:'manual-uncollected-declaration',operator:actor,actorUid,date:now};}
 if(!equal(basis,d.expectedBasis||d.legacyBasis))throw Error('原出貨依據已更新，請重新開啟核對');
 const date=requireDate(d.date,'實際退回日期');if(date>taipeiDate(Number(now)||Date.now()))throw Error('退回日期不可晚於今天');const lines={};let totalReceived=0,totalResell=0,totalDiscard=0;
 const returned=inv.returned?.[d.orderId]||{},disposed=inv.disposed?.[d.orderId]||{};
 for(const [pid,row] of Object.entries(d.lines||{})){if(!hasOwn(basis,pid)){if(Number(row.received)===0&&Number(row.resell)===0&&Number(row.discard)===0)continue;throw Error('退回品項不在原出貨明細');}const received=packCount(row.received,true),resell=packCount(row.resell,true),discard=packCount(row.discard,true);if(received!==resell+discard)throw Error('實際退回必須等於可販售加報廢');const otherReturned=(returned[pid]||0)-(old?.lines?.[pid]?.resell||0),otherDisposed=(disposed[pid]||0)-(old?.lines?.[pid]?.discard||0);if(otherReturned<0||otherDisposed<0||otherReturned+otherDisposed+received>basis[pid])throw Error('累計退貨與報廢超過原出貨剩餘數量');lines[pid]={received,resell,discard,name:old?.lines?.[pid]?.name||inv.items?.[pid]?.name||pid};totalReceived+=received;totalResell+=resell;totalDiscard+=discard;}
 if(!totalReceived||!Number.isSafeInteger(totalReceived))throw Error('請至少登記一包實際收到的商品');if(totalResell&&d.coldChainConfirmed!==true)throw Error('確認冷鏈與商品可安全再販售後才能回庫');
 inv.returned||={};inv.disposed||={};for(const pid of new Set([...Object.keys(lines),...Object.keys(old?.lines||{})])){const before=old?.lines?.[pid]||{resell:0,discard:0},after=lines[pid]||{resell:0,discard:0},delta=after.resell-before.resell;if(delta)inventoryMove(s,operation+'_'+pid,pid,delta,'未取貨實際可販售回庫／修正',actor,now,{orderId:d.orderId,actorUid});returned[pid]=(returned[pid]||0)+delta;disposed[pid]=(disposed[pid]||0)+after.discard-before.discard;if(inv.orderLedger?.[d.orderId])inv.orderLedger[d.orderId][pid]=Math.max(0,basis[pid]-returned[pid]-disposed[pid]);}
 inv.returned[d.orderId]=returned;inv.disposed[d.orderId]=disposed;
 const lossCents=scaled(d.lossAmount||'0',2,'確認報廢成本');if(lossCents&&(!totalDiscard||!String(d.lossBasis||'').trim()))throw Error('報廢成本需有報廢數量與成本依據，不可使用售價推估');
 if(String(d.subjectPhone||'').trim()&&!normalizeRiskPhone(d.subjectPhone))throw Error('提醒電話請填完整有效電話，或留白以客戶ID提醒');const subjectId=String(d.subjectId||order.customerId||identity(order)||'order:'+d.orderId);if(d.subjectId&&!customerIndex(s.orders||{},s.customers||{},s.customerAliases||{}).some(c=>c.id===resolveCustomer(subjectId,s.customerAliases)))throw Error('提醒歸屬客戶已變更，請重新選擇');if(old&&(subjectId!==old.subjectId||normalizeRiskPhone(d.subjectPhone)!==old.subjectPhone||!!d.reminderExcluded!==!!old.reminderExcluded)&&!String(d.correctionReason||'').trim())throw Error('更正提醒歸屬需填寫原因');
 s.deliveryExceptions||={};const ex=s.deliveryExceptions;ex.expenseLinks||={};for(const f of Object.values(old?.fees||{}))if(f.entryId&&ex.expenseLinks[f.entryId]?.orderId===d.orderId)ex.expenseLinks[f.entryId]={...ex.expenseLinks[f.entryId],active:false};
 const fees={};for(const [feeId,fee] of Object.entries(d.fees||{})){if(!['outbound','return'].includes(feeId))throw Error('費用類型錯誤');if(fee.mode==='none')continue;let entryId;
  if(fee.mode==='existing'){const p=financeEntries(s.expenses||{},s.finance||{}).find(p=>p.id===fee.entryId);if(!p||p.scope!=='mealPacks'||p.status==='void'||!Number.isSafeInteger(p.totalCents))throw Error('關聯支出已作廢、非料理包支出或待核對');if(!equal(p,fee.expected))throw Error('關聯支出已被修改，請重新確認');entryId=p.id;}
  else if(fee.mode==='new'){const id='uncollected_'+d.orderId+'_'+feeId;entryId='finance:'+id;if(s.finance?.purchases?.[id]){if(!old||!equal(old.feesRequest?.[feeId],fee))throw Error('此事件已有費用，請至支出管理編輯，勿重複新增');}
   else{s.finance=applyFinance(s.finance||{},{kind:'purchase',id,operation:operation+'_'+feeId,expected:null,data:fee.data},actor,now);s.finance.purchases[id].source={kind:'uncollected',orderId:d.orderId,feeId};s.finance.operations[operation+'_'+feeId].after=JSON.parse(JSON.stringify(s.finance.purchases[id]));}}
  else throw Error('請選擇費用記錄方式');const used=ex.expenseLinks[entryId];if(used?.active)throw Error('此筆支出已關聯另一項退回費用，不能重複計算');ex.expenseLinks[entryId]={orderId:d.orderId,feeId,active:true};fees[feeId]={entryId};}
 const shipmentSnapshot=old?.shipmentSnapshot||inv.orderSnapshots?.[d.orderId]||{totals:basis,source:'manual-declaration'};ex.cases||={};const next={orderId:d.orderId,revision:(old?.revision||0)+1,date,lines,totalReceived,totalResell,totalDiscard,shipmentSnapshot,originalOrder:old?.originalOrder||JSON.parse(JSON.stringify(order)),subjectId,subjectPhone:normalizeRiskPhone(d.subjectPhone??order.phone),reminderExcluded:!!d.reminderExcluded,correctionReason:String(d.correctionReason||''),coldChainConfirmed:!!d.coldChainConfirmed,lossCents,lossBasis:String(d.lossBasis||''),fees,feesRequest:d.fees||{},notes:String(d.notes||''),createdAt:old?.createdAt||now,updatedAt:now,actorUid,operator:actor};ex.cases[d.orderId]=next;ex.operations||={};ex.operations[operation]={fingerprint,request:d,before:old,after:next,actorUid,operator:actor,date:now};return s;
}
function uncollectedReport(state,start,end){const cases=uncollectedCases(state),ids=new Set(cases.map(c=>c.orderId)),selected=Object.entries(state.orders||{}).filter(([,o])=>validStamp(o.createdAt)&&taipeiDate(Number(o.createdAt))>=start&&taipeiDate(Number(o.createdAt))<=end);const r={normalOrders:selected.filter(([id])=>!ids.has(id)).length,failedOrders:selected.filter(([id])=>ids.has(id)).length,failedOrderAmount:0,failedUnpaid:0,eventCount:0,resell:0,discard:0,confirmedLoss:0,fees:0,paidFees:0,feeWarnings:0,paidNeedsReview:0};for(const [id,o] of selected)if(ids.has(id)){const cents=goodsCents(o);if(cents!==null){r.failedOrderAmount+=cents;if(!o.paid)r.failedUnpaid+=cents}}const expenses=financeEntries(state.expenses||{},state.finance||{}),seen=new Set();for(const c of cases)if(c.date>=start&&c.date<=end){r.eventCount++;r.resell+=c.totalResell;r.discard+=c.totalDiscard;r.confirmedLoss+=c.lossCents||0;if(state.orders?.[c.orderId]?.paid)r.paidNeedsReview++;for(const f of Object.values(c.fees||{})){if(seen.has(f.entryId))continue;seen.add(f.entryId);const p=expenses.find(p=>p.id===f.entryId);if(!p||p.status==='void'||!Number.isSafeInteger(p.totalCents)){r.feeWarnings++;continue}r.fees+=p.totalCents;if(p.payment?.status==='paid')r.paidFees+=p.totalCents;}}for(const k of ['failedOrderAmount','failedUnpaid','confirmedLoss','fees','paidFees'])r[k]/=100;return r;}
function applyOrder(state,id,next,expected,operation,actor,now,options={}){
 if(!state)throw Error('尚未取得伺服器資料');const fingerprint=JSON.stringify(canonical({id,next}));if(state.inventoryOperations?.[operation]){if(state.inventoryOperations[operation].orderFingerprint!==fingerprint)throw Error('訂單操作已完成，請重新查看，不可用同一操作改送其他內容');return state;}
 const old=state.orders?.[id]||null;if(!equal(old,expected))throw Error('此訂單已被其他裝置更新，請重新開啟後再操作');
 if(state.deliveryExceptions?.cases?.[id]&&(!next||!!next.shipped!==!!old?.shipped||!sameItems(old,next)))throw Error('已有未取貨退回紀錄，請從原退回紀錄修正，不可改回未出貨或變更品項');
 const s=JSON.parse(JSON.stringify(state)),inv=s.inventory;
 if(!next&&(old?.shipped||inv?.everShipped?.[id]||inv?.orderStates?.[id]))throw Error('已出貨或取消的訂單不可直接刪除，請使用取消／退貨並保留紀錄');
 if(next&&!!next.shipped!==!!old?.shipped&&!inv?.initializedAt)throw Error('請先完成期初盤點，目前暫停出貨');
 if(inv?.initializedAt&&!inv.mappingMode&&next?.shipped&&(!old?.shipped||!sameItems(old,next)))throw Error('舊版庫存尚未完成實體對應，請先核對並提供轉換方案；暫停新增出貨');
 if(inv?.orderStates?.[id]?.cancelled&&next&&(next.shipped!==old?.shipped||!sameItems(old,next)))throw Error('此訂單已取消，請先恢復接單再變更出貨或品項');
 if(inv?.initializedAt&&!state.deliveryExceptions?.cases?.[id]){
  const prior=inv.orderLedger?.[id]||{},returned=inv.returned?.[id]||{};let desired=next?.shipped?quantities(next):{},plan=null;const mapped=inv.mappingMode===true;const historical=!!old?.shipped&&(inv.legacyExempt?.[id]||!hasOwn(inv.orderLedger||{},id));if(mapped&&next?.shipped&&!historical){plan=shipmentPlan(s,next,old?.shipped?inv.orderSnapshots?.[id]:null);for(const pid of Object.keys(plan.recipes)){if(!old?.shipped||!inv.orderSnapshots?.[id]?.recipes?.[pid]){if(!equal(plan.recipes[pid],options.mappingPreview?.recipes?.[pid]))throw Error('商品對應已更新或尚未確認，請重新預覽出貨');}}desired=plan.totals;}
  const exempt=!!old?.shipped&&(inv.legacyExempt?.[id]||!hasOwn(inv.orderLedger||{},id));
  if(exempt&&next?.shipped&&!equal(quantities(old),quantities(next)))throw Error('期初前已出貨訂單不可直接變更包數，請保留原單並另行記錄');
  if(next?.shipped&&!exempt)for(const [pid,q] of Object.entries(returned))if((desired[pid]||0)<q)throw Error('商品包數不得少於已退回數量；請先確認全部回庫再重新出貨');
  const target={};if(!exempt)for(const [pid,q] of Object.entries(desired)){if(q<(returned[pid]||0))throw Error('商品包數不得少於已退回數量');target[pid]=q-(returned[pid]||0)}
  for(const pid of new Set([...Object.keys(prior),...Object.keys(target)])){const delta=(prior[pid]||0)-(target[pid]||0);if(!delta)continue;if(delta>0&&options.stockReturned!==true)throw Error('減少已出貨包數前，必須確認商品實際放回冷凍庫');inventoryMove(s,operation+'_'+pid,pid,delta,'訂單出貨／確認回庫調整',actor,now,{orderId:id})}
  if(mapped&&!exempt){inv.shipments||={};inv.orderSnapshots||={};inv.shipments[operation]={orderId:id,kind:next?.shipped?'shipment-or-adjustment':'confirmed-reversal',before:inv.orderSnapshots[id]||null,after:plan,operator:actor,date:now};if(next?.shipped)inv.orderSnapshots[id]=plan;else delete inv.orderSnapshots[id];}
  inv.orderLedger||={};inv.everShipped||={};if(old?.shipped)inv.everShipped[id]=true;if(next?.shipped){inv.everShipped[id]=true;if(!exempt)inv.orderLedger[id]=target}else{delete inv.orderLedger[id];if(inv.legacyExempt)delete inv.legacyExempt[id];if(inv.returned)delete inv.returned[id]}
 }
 s.orders||={};if(next)s.orders[id]=next;else delete s.orders[id];s.inventoryOperations||={};s.inventoryOperations[operation]={date:now,operator:actor,orderFingerprint:fingerprint};return s;
}
function report(orders,expenses,start,end){
 const inside=t=>Number(t)>=start&&Number(t)<end;
 const chosen=Object.values(orders).filter(o=>inside(o.createdAt));let sales={},packs=0,shipped=0,ordered=0,paid=0,unpaid=0;
 chosen.forEach(o=>{ordered+=total(o);if(o.paid)paid+=total(o);else unpaid+=total(o);items(o).forEach(i=>{let n=(+i.qty||0)+(+i.gift||0);packs+=n;if(o.shipped)shipped+=n;const key=i.productId||'legacy:'+i.productName;let row=sales[key]||={name:i.productName,qty:0,gift:0,revenue:0};row.qty+=+i.qty||0;row.gift+=+i.gift||0;row.revenue+=(+i.qty||0)*(+i.unitPrice||0)})});
 const cash=Object.values(orders).filter(o=>o.paid&&inside(o.paidAt)).reduce((s,o)=>s+total(o),0);
 const unknown=Object.values(orders).filter(o=>o.paid&&!o.paidAt);
 const firstExpenseDate=taipeiDate(start),lastExpenseDate=taipeiDate(end);
 const expense=Object.values(expenses).filter(e=>e.date>=firstExpenseDate&&e.date<lastExpenseDate).reduce((s,e)=>s+(+e.amount||0),0);
 return {count:chosen.length,packs,shipped,unshipped:packs-shipped,ordered,paid,unpaid,cash,expense,net:cash-expense,unknownCount:unknown.length,unknownAmount:unknown.reduce((s,o)=>s+total(o),0),sales:Object.values(sales).sort((a,b)=>b.qty-a.qty)};
}
// Finance is isolated from orders/customers/inventory. All money is integer cents.
const clone=v=>JSON.parse(JSON.stringify(v));
function scaled(value,digits,label='數值'){
 const s=String(value??'').trim(),m=s.match(/^(\d+)(?:\.(\d+))?$/);
 if(!m||(m[2]||'').length>digits)throw Error(label+'格式錯誤，最多 '+digits+' 位小數');
 const n=Number(m[1])*10**digits+Number((m[2]||'').padEnd(digits,'0'));
 if(!Number.isSafeInteger(n)||n>100000000000)throw Error(label+'超出安全範圍');return n;
}
function integer(n,label='數值'){if(!Number.isSafeInteger(n)||n<0||n>100000000000)throw Error(label+'超出安全範圍');return n}
function roundedProduct(a,b,divisor=1000){const n=integer(a)*integer(b);if(!Number.isSafeInteger(n)||!Number.isSafeInteger(divisor)||divisor<=0)throw Error('乘積超出安全範圍');return integer(Math.floor(n/divisor)+(n%divisor>=Math.ceil(divisor/2)?1:0));}
const validDate=s=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&Number.isFinite(Date.parse(s+'T00:00:00Z'))&&new Date(s+'T00:00:00Z').toISOString().slice(0,10)===s;
const validStamp=t=>(typeof t==='number'||typeof t==='string'&&/^\d{1,15}$/.test(t))&&Number.isSafeInteger(Number(t))&&Number(t)>0&&Number(t)<253402185600000;
function requireDate(s,label){if(!validDate(s))throw Error('請輸入有效'+label);return s}
function cleanText(v,label,required=false){const s=String(v??'').trim();if((required&&!s)||s.length>2000)throw Error(label+'未填或過長');return s}
function financePurchase(d){
 const mode=d.mode;if(!['simple','detailed'].includes(mode))throw Error('記帳模式錯誤');
 const lines={};let subtotalCents=0;const source=Object.entries(d.items||{});if(!source.length||source.length>100)throw Error('採購需有 1 至 100 個品項');
 for(const [id,line] of source){if(!/^[A-Za-z0-9_-]+$/.test(id))throw Error('品項 ID 錯誤');
  const name=cleanText(line.name,'品項名稱',true),categoryId=cleanText(line.categoryId,'分類',true);
  const v2=d.schemaVersion===2,hasValue=v=>v!==undefined&&v!==null&&String(v).trim()!=='';
  const quantityMilli=v2?(hasValue(line.quantity)?scaled(line.quantity,3,'數量'):undefined):mode==='simple'?1000:scaled(line.quantity,3,'數量');
  const unitPriceCents=hasValue(line.unitPrice)?scaled(line.unitPrice,2,'單價'):undefined;
  if(quantityMilli===0)throw Error('數量須大於零');if(unitPriceCents===0)throw Error('單價須大於零');
  const calculated=quantityMilli!==undefined&&unitPriceCents!==undefined?roundedProduct(quantityMilli,unitPriceCents):undefined;
  const amount=hasValue(line.amount)?scaled(line.amount,2,'品項金額'):v2?undefined:calculated;
  if(!amount)throw Error('請填寫大於零的品項金額');
  const differs=calculated!==undefined&&calculated!==amount,confirmation=[quantityMilli,unitPriceCents,amount].join('|');
  if(differs&&line.differenceConfirmedFor!==confirmation)throw Error('手動金額與計算小計不同，請確認保留手動金額');
  const shrimp=!!line.shrimp,weightMilliCatty=shrimp?scaled(line.weightCatty,3,'蝦子台斤重量'):0;if(shrimp&&!weightMilliCatty)throw Error('外購蝦須記錄台斤重量');
  lines[id]={name,categoryId,...(quantityMilli===undefined?{}:{quantityMilli}),unit:cleanText(line.unit,'單位'),...(unitPriceCents===undefined?{}:{unitPriceCents}),subtotalCents:amount,...(v2?{amountBasis:line.amountBasis==='calculated'&&calculated!==undefined&&!differs?'calculated':'manual',...(calculated===undefined?{}:{calculatedSubtotalCents:calculated}),...(differs?{differenceConfirmedFor:confirmation}:{ }),notes:cleanText(line.notes,'品項備註')}:{}),shrimp,weightMilliCatty};subtotalCents=integer(subtotalCents+amount);
 }
 if(mode==='simple'&&source.length!==1)throw Error('簡單記帳只能有一個品項');
 const shippingCents=scaled(d.shipping||'0',2,'自付採購運費'),totalCents=integer(subtotalCents+shippingCents);
 const status=d.paymentStatus;if(!['unpaid','paid'].includes(status))throw Error('只支援未付款或全額付款');
 const purchaseDate=requireDate(d.purchaseDate,'採購日期'),paidDate=status==='paid'?requireDate(d.paidDate,'付款日期'):'';
 return {schemaVersion:d.schemaVersion===2?2:1,scope:'mealPacks',mode,purchaseDate,items:lines,subtotalCents,shippingCents,totalCents,payment:{version:1,status,paidCents:status==='paid'?totalCents:0,paidDate},merchant:cleanText(d.merchant,'商家'),notes:cleanText(d.notes,'備註'),status:'active'};
}
function financeShrimp(d,finance){
 const sourceType=d.sourceType;if(!['own','purchased'].includes(sourceType))throw Error('請選擇蝦子來源');
 const weightMilliCatty=scaled(d.weightCatty,3,'台斤重量');if(!weightMilliCatty)throw Error('重量須大於零');
 let unitCostCents=sourceType==='own'?scaled(d.unitCost||'0',2,'每台斤成本'):0,estimatedCostCents=roundedProduct(weightMilliCatty,unitCostCents),purchaseId='',lineId='';
 if(sourceType==='purchased'){
  purchaseId=cleanText(d.purchaseId,'原採購',true);lineId=cleanText(d.lineId,'採購品項',true);const p=finance.purchases?.[purchaseId],line=p?.items?.[lineId];
  if(!p||p.status!=='active'||!line?.shrimp||!line.weightMilliCatty)throw Error('外購蝦必須關聯有效蝦子採購品項');
  // Informational cost only. The purchase is already included in C/D.
  estimatedCostCents=roundedProduct(weightMilliCatty,line.subtotalCents,line.weightMilliCatty);
  unitCostCents=roundedProduct(1000,line.subtotalCents,line.weightMilliCatty);
 }else if(!unitCostCents)throw Error('請填寫大於零的每台斤成本');
 const packs=d.packs===''||d.packs==null?null:Number(d.packs);if(packs!==null&&(!Number.isSafeInteger(packs)||packs<=0))throw Error('製作包數須為正整數或留白');
 return {schemaVersion:1,scope:'mealPacks',date:requireDate(d.date,'製作日期'),productId:cleanText(d.productId,'料理包品項',true),productName:cleanText(d.productName,'商品名稱',true),sourceType,weightMilliCatty,unitCostCents,estimatedCostCents,purchaseId,lineId,...(packs===null?{}:{packs}),gramsPerCatty:600,notes:cleanText(d.notes,'備註'),status:'active'};
}
function financeReferences(f){
 const used={};for(const s of Object.values(f.shrimpCosts||{})){if(s.status!=='active'||s.sourceType!=='purchased')continue;const p=f.purchases?.[s.purchaseId],line=p?.items?.[s.lineId];if(!p||p.status!=='active'||!line?.shrimp)throw Error('採購已被蝦子製作成本引用，請先作廢關聯紀錄');const key=s.purchaseId+':'+s.lineId;used[key]=(used[key]||0)+s.weightMilliCatty;if(used[key]>line.weightMilliCatty)throw Error('關聯蝦子重量超過原採購重量');}
}
function applyFinance(current,command,actor,now){
 const f=clone(current||{}),{operation,id,kind,expected}=command;if(!operation||!id||!['purchase','shrimp','category','legacy'].includes(kind))throw Error('財務操作格式錯誤');
 const request=clone({kind,id,action:command.action||'save',...(command.data?{data:command.data}:{}),...(command.status?{status:command.status}:{}),...(command.legacySnapshot?{legacySnapshot:command.legacySnapshot}:{})});
 if(f.operations?.[operation]){if(!equal(f.operations[operation].request,request))throw Error('先前操作已儲存，但重試內容不同；請從清單查看後編輯，不要重新新增');return f;}
 const bucket={purchase:'purchases',shrimp:'shrimpCosts',category:'categories',legacy:'legacyExpenseOverrides'}[kind],old=f[bucket]?.[id]||null;
 if(!equal(old,expected||null))throw Error('此筆資料已被其他裝置修改，請重新開啟');
 let next;
 if(command.action==='status'){
  if(!old||!['active','void'].includes(command.status))throw Error('狀態錯誤');next={...old,status:command.status};
 }else if(kind==='purchase')next=financePurchase(command.data);
 else if(kind==='shrimp')next=financeShrimp(command.data,f);
 else if(kind==='category')next={name:cleanText(command.data.name,'分類名稱',true),status:command.data.status==='void'?'void':'active',scope:'mealPacks'};
 else {
  // Overlay holds a complete effective replacement; the original expense remains untouched.
  if(!command.legacySnapshot)throw Error('找不到舊支出快照');next={...financePurchase(command.data),legacySnapshot:clone(command.legacySnapshot)};
 }
 if(kind==='purchase'&&old){const costLine=l=>l?[l.subtotalCents,l.shrimp,l.weightMilliCatty]:null;for(const s of Object.values(f.shrimpCosts||{}))if(s.status==='active'&&s.sourceType==='purchased'&&s.purchaseId===id&&!equal(costLine(old.items?.[s.lineId]),costLine(next.items?.[s.lineId])))throw Error('採購品項已有製作關聯，請先作廢關聯紀錄再修改');}
 next={...(old||{}),...next,...(old&&command.action!=='status'&&kind!=='category'?{status:old.status}:{}),revision:(old?.revision||0)+1,createdAt:old?.createdAt||now,updatedAt:now,operator:actor};
 if(kind==='category'&&Object.entries(f.categories||{}).some(([key,c])=>key!==id&&c.status!=='void'&&norm(c.name)===norm(next.name)))throw Error('已有相同名稱的料理包分類');
 f[bucket]||={};f[bucket][id]=next;financeReferences(f);f.operations||={};f.operations[operation]={kind,id,action:command.action||'save',request,before:old,after:clone(next),operator:actor,date:now};return f;
}
function financeEntries(legacy={},f={}){
 const out=[];for(const [id,e] of Object.entries(legacy)){const overlay=f.legacyExpenseOverrides?.[id];if(overlay){out.push({...overlay,...(!equal(e,overlay.legacySnapshot)?{totalCents:null}:{}),id:'legacy:'+id,source:'legacy',sourceId:id});continue;}
  let cents=null;try{cents=scaled(e.amount,2,'舊支出金額')}catch(_){}
  const payment=e.payment?.status==='paid'||e.paid===true?'paid':e.payment?.status==='unpaid'||e.paid===false?'unpaid':'unknown';
  const pd=e.payment?.paidDate||e.paidDate||(validStamp(e.paidAt)?taipeiDate(Number(e.paidAt)):'');
  out.push({id:'legacy:'+id,sourceId:id,source:'legacy',status:'active',scope:e.scope||'mealPacks',purchaseDate:e.date,title:e.title||'舊支出',totalCents:cents,items:{legacy:{name:e.title||'舊支出',categoryId:e.categoryId||'',category:e.category||'',subtotalCents:cents}},shippingCents:0,payment:{status:payment,paidDate:validDate(pd)?pd:'',paidCents:payment==='paid'?cents:0},notes:e.notes||'',operator:e.operator||'',legacySnapshot:e});
 }
 for(const [id,p] of Object.entries(f.legacyExpenseOverrides||{}))if(!hasOwn(legacy,id))out.push({...p,totalCents:null,id:'legacy:'+id,source:'legacy',sourceId:id});
 for(const [id,p] of Object.entries(f.purchases||{}))out.push({...p,id:'finance:'+id,source:'finance',sourceId:id});return out;
}
function goodsCents(o){
 try{const lines=items(o);if(!lines.length)return null;let n=0;for(const i of lines){const q=scaled(i.qty,3,'商品數量'),p=scaled(i.unitPrice,2,'成交單價');n=integer(n+roundedProduct(q,p));}
  if(o.amount!==undefined&&o.amount!==null&&o.amount!==''){const a=scaled(o.amount,2,'原總額');if(a!==n){const fee=o.shippingFee;if(fee===undefined||a!==n+scaled(fee,2,'配送運費'))return null;}}
  return n;
 }catch(_){return null;}
}
function financeReport(orders,legacy,f,startDate,endDate){
 requireDate(startDate,'開始日期');requireDate(endDate,'結束日期');if(endDate<startDate)throw Error('日期區間錯誤');
 const inside=d=>validDate(d)&&d>=startDate&&d<=endDate,stamp=t=>validStamp(t)?taipeiDate(Number(t)):'';
 const r={A:0,B:0,C:0,D:0,E:0,count:0,packs:0,shipped:0,unpaid:0,paid:0,unknownCount:0,unknownAmount:0,unresolvedOrders:0,unresolvedOrderAmount:0,unknownCreated:0,purchasePaid:0,purchaseUnpaid:0,purchaseUnknown:0,unknownExpensePayments:0,unknownExpensePaymentAmount:0,invalidExpenses:0,externalShrimp:0,sales:[],warnings:[]},sales={};
 for(const o of Object.values(orders||{})){const chosen=inside(stamp(o.createdAt)),g=goodsCents(o),paid=o.paid===true||o.paid===1,pd=stamp(o.paidAt);if(!validStamp(o.createdAt))r.unknownCreated++;
  if(g===null){r.unresolvedOrders++;const amount=Number(o.amount);if(Number.isFinite(amount))r.unresolvedOrderAmount+=amount;continue;}
  if(chosen){r.count++;r.A+=g;if(paid)r.paid+=g;else r.unpaid+=g;for(const i of items(o)){const qty=+i.qty||0,gift=+i.gift||0;r.packs+=qty+gift;if(o.shipped)r.shipped+=qty+gift;const key=i.productId||'legacy:'+i.productName,row=sales[key]||={name:i.productName||'歷史商品',qty:0,gift:0,revenue:0};row.qty+=qty;row.gift+=gift;row.revenue+=roundedProduct(scaled(i.qty,3),scaled(i.unitPrice,2))/100;}}
  if(paid){if(!pd){r.unknownCount++;r.unknownAmount+=g}else if(inside(pd))r.B+=g;}
 }
 for(const p of financeEntries(legacy,f)){if(p.status==='void'||p.scope!=='mealPacks')continue;if(!validDate(p.purchaseDate)||!Number.isSafeInteger(p.totalCents)){r.invalidExpenses++;continue;}const pay=p.payment||{};if(inside(p.purchaseDate)){r.C+=p.totalCents;if(pay.status==='paid')r.purchasePaid+=p.totalCents;else if(pay.status==='unpaid')r.purchaseUnpaid+=p.totalCents;else r.purchaseUnknown+=p.totalCents;}
  if(pay.status==='paid'){if(!validDate(pay.paidDate)){r.unknownExpensePayments++;r.unknownExpensePaymentAmount+=p.totalCents}else if(inside(pay.paidDate))r.D+=p.totalCents;}
 }
 for(const s of Object.values(f.shrimpCosts||{})){if(s.status!=='active'||!inside(s.date))continue;if(s.sourceType==='own')r.E+=s.estimatedCostCents;else r.externalShrimp+=s.estimatedCostCents;}
 r.estimated=(r.A-r.C-r.E)/100;r.comparison=(r.B-r.D-r.E)/100;r.cashBalance=(r.B-r.D)/100;
 for(const key of ['A','B','C','D','E','unpaid','paid','unknownAmount','purchasePaid','purchaseUnpaid','purchaseUnknown','unknownExpensePaymentAmount','externalShrimp'])r[key]/=100;
 r.sales=Object.values(sales).map(s=>({...s,revenue:Math.round(s.revenue*100)/100})).sort((a,b)=>b.qty-a.qty);r.unshipped=r.packs-r.shipped;
 return r;
}
function csvText(rows){return '\uFEFF'+rows.map(row=>row.map(v=>'"'+(typeof v==='string'?v.replace(/^[\s]*[=+@\-]/,"'$&"):String(v??'')).replace(/"/g,'""')+'"').join(',')).join('\r\n');}
root.ShrimpCore={version:'20261120-uncollected1',equalLegacy:equal,hasOwn,items,total,sameItems,quantities,normalizeRiskPhone,returnBasis,uncollectedCases,uncollectedMatches,applyUncollected,uncollectedReport,physicalItems,recipeFor,shipmentPlan,configureInventory,inventoryDemand,inventoryDemandIssues,inventoryStats,applyInventory,identity,validLast3,resolveCustomer,customerIndex,customerCandidates,searchCustomers,taipeiDate,updateCustomerProfile,applyCustomerOrder,mergeCustomers,undoCustomerMerge,applyOrder,report,scaled,roundedProduct,validDate,financePurchase,financeShrimp,applyFinance,financeEntries,goodsCents,financeReport,csvText};
if(typeof module!=='undefined')module.exports=root.ShrimpCore;
})(globalThis);
