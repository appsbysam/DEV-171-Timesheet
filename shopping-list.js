/* DEV shared shopping list — v3.10.0 */
(() => {
  const css = `
  #shoppingOpenBtn{background:#1f6d55;color:white;font-weight:700}
  #shoppingOverlay[hidden]{display:none!important}
  #shoppingOverlay{position:fixed;inset:0;background:#0009;z-index:100000;display:flex;justify-content:center;align-items:center;padding:12px}
  #shoppingPanel{background:white;color:#222;border-radius:14px;width:min(620px,100%);max-height:92vh;overflow:auto;padding:18px;box-shadow:0 8px 30px #0005}
  #shoppingPanel button{cursor:pointer;padding:9px 12px;border-radius:8px;border:1px solid #ccc;background:#f5f5f5;color:#222}
  #shoppingPanel .shop-primary{background:#196b51;color:white;border-color:#196b51}
  #shoppingPanel .shop-row{display:flex;align-items:center;gap:8px;padding:7px 0;border-bottom:1px solid #eee}
  #shoppingPanel input[type=text]{min-width:0;padding:8px;border:1px solid #ccc;border-radius:6px}
  #shoppingPanel .shop-actions{display:flex;gap:8px;flex-wrap:wrap;margin:12px 0}
  #shoppingPanel .shop-note{width:125px;margin-left:auto}
  #shoppingPanel .shop-name{flex:1;min-width:0}
  #shoppingPanel .shop-error{color:#ad2323}
  #shoppingPanel .shop-muted{color:#666;font-size:.85em}
  `;
  const style=document.createElement('style');style.textContent=css;document.head.appendChild(style);
  const overlay=document.createElement('div');overlay.id='shoppingOverlay';overlay.hidden=true;
  overlay.innerHTML=`<section id="shoppingPanel" role="dialog" aria-modal="true" aria-label="Shared shopping list">
  <div style="display:flex;justify-content:space-between;align-items:center"><h2>🛒 Shopping List</h2><button id="shopClose" type="button">✕</button></div>
  <p id="shopStatus" class="shop-muted" role="status"></p><div id="shopBody"></div></section>`;
  document.body.appendChild(overlay);
  const body=overlay.querySelector('#shopBody'), status=overlay.querySelector('#shopStatus');
  let current=null,page=0,preview=false,busy=false;
  const perPage=14;
  const button=document.createElement('button');button.id='shoppingOpenBtn';button.type='button';button.textContent='🛒 Shopping List';
  const print=document.querySelector('#printBtn'); if(print) print.insertAdjacentElement('afterend',button);
  else document.querySelector('.toolbar')?.appendChild(button);
  function el(tag,text,cls){const x=document.createElement(tag);if(text!==undefined)x.textContent=text;if(cls)x.className=cls;return x}
  function action(label,fn,primary=false){const b=el('button',label,primary?'shop-primary':'');b.type='button';b.onclick=fn;return b}
  function say(message,error=false){status.textContent=message;status.className=error?'shop-error':'shop-muted'}
  async function rpc(actionName,state=null,revision=null){
    if(typeof db==='undefined'||!db)throw Error('Shopping list requires an online connection');
    if(typeof managerSessionToken==='undefined'||!managerSessionToken)throw Error('Please sign in to the timesheet first');
    const {data,error}=await db.rpc('dev_shopping_action',{p_token:managerSessionToken,p_action:actionName,p_state:state,p_revision:revision});
    if(error)throw Error(error.message);return data;
  }
  async function load(){say('Loading shared list…');current=await rpc('load');if(!current.id)throw Error('Shopping list unavailable');say('Shared across staff • Changes saved to DEV cloud');render()}
  async function save(){
    if(busy||!current)return;
    busy=true;say('Saving…');
    try{current=await rpc('save',current.state,current.revision);say('✓ Saved for everyone')}catch(e){say(e.message,true);alert(e.message+'\nReopening the latest shared list.');await load().catch(e=>say(e.message,true))}
    finally{busy=false}
  }
  async function change(fn){if(busy)return;fn();render();await save()}
  function allItems(){return current.state.categories.flatMap(c=>c.items.filter(i=>i.selected).map(i=>({category:c.name,...i})))}
  function listText(){const groups=current.state.categories.map(c=>({name:c.name,items:c.items.filter(i=>i.selected)})).filter(g=>g.items.length);
    return '171 CAFÉ — SHOPPING LIST\n\n'+groups.map(g=>g.name.toUpperCase()+'\n'+g.items.map(i=>'• '+i.name+(i.note?' — '+i.note:'')).join('\n')).join('\n\n')}
  function render(){
    body.replaceChildren();if(!current)return;
    const cats=current.state.categories,selected=allItems().length;
    const top=el('div','Current draft • '+selected+' item(s) selected','shop-muted');body.append(top);
    if(preview){
      const pre=el('pre',listText());pre.style.cssText='white-space:pre-wrap;background:#f5f5f5;padding:12px;border-radius:8px';body.append(pre);
      const a=el('div',undefined,'shop-actions');
      a.append(action('Copy list',async()=>{try{await navigator.clipboard.writeText(listText());say('Copied to clipboard')}catch(e){say('Copy failed: '+e.message,true)}} ,true),
      action('WhatsApp',()=>window.open('https://wa.me/?text='+encodeURIComponent(listText()),'_blank','noopener')),
      action('Back to checklist',()=>{preview=false;render()}));
      body.append(a);
    }else{
      const pages=cats.flatMap((c,ci)=>Array.from({length:Math.max(1,Math.ceil(c.items.length/perPage))},(_,pi)=>({ci,pi})));
      page=Math.max(0,Math.min(page,pages.length-1));
      const {ci,pi}=pages[page],cat=cats[ci];
      const heading=el('h3',cat.name+' — page '+(page+1)+' of '+pages.length);body.append(heading);
      const nav=el('div',undefined,'shop-actions');
      nav.append(action('◀ Back',()=>{page=Math.max(0,page-1);render()}),action('Next ▶',()=>{page=Math.min(pages.length-1,page+1);render()}));
      body.append(nav);
      cat.items.slice(pi*perPage,(pi+1)*perPage).forEach(item=>{
        const row=el('div',undefined,'shop-row');
        const cb=document.createElement('input');cb.type='checkbox';cb.checked=!!item.selected;cb.onchange=()=>change(()=>item.selected=cb.checked);
        const label=el('span',item.name,'shop-name');
        const note=document.createElement('input');note.type='text';note.className='shop-note';note.placeholder='Qty / notes';note.value=item.note||'';
        note.onchange=()=>change(()=>item.note=note.value.trim());
        const edit=action('✎',()=>{const name=prompt('Product name',item.name);if(name?.trim())change(()=>item.name=name.trim())});
        const move=action('⇄',()=>{const choice=prompt('Move to category:\n'+cats.map((c,i)=>(i+1)+'. '+c.name).join('\n'));const to=Number(choice)-1;if(Number.isInteger(to)&&cats[to]&&to!==ci)change(()=>{cat.items.splice(cat.items.indexOf(item),1);cats[to].items.push(item)})});
        const del=action('×',()=>{if(confirm('Remove '+item.name+' from the product catalogue for everyone?'))change(()=>cat.items.splice(cat.items.indexOf(item),1))});
        row.append(cb,label,note,edit,move,del);body.append(row);
      });
      const ops=el('div',undefined,'shop-actions');
      ops.append(action('+ Add product',()=>{const name=prompt('New product name');if(name?.trim())change(()=>cat.items.push({name:name.trim(),selected:false,note:''}))}),
      action('Rename category',()=>{const name=prompt('Category name',cat.name);if(name?.trim())change(()=>cat.name=name.trim())}),
      action('+ Category',()=>{const name=prompt('New category name');if(name?.trim())change(()=>cats.push({name:name.trim(),items:[]}))}),
      action('Remove category',()=>{if(cat.items.length){alert('Move or remove products first');return}if(cats.length>1&&confirm('Remove empty category?'))change(()=>cats.splice(ci,1))}));
      body.append(ops);
      body.append(action('Generate shopping list ('+selected+')',()=>{if(!selected){alert('Select at least one product');return}preview=true;render()},true));
    }
    const foot=el('div',undefined,'shop-actions');
    foot.append(action('Mark as ordered',async()=>{if(!confirm('Confirm this shopping list has actually been ordered?'))return;await command('ordered')}),
    action('Start new list',async()=>{if(!confirm('Archive this shared draft and start a new blank checklist for everyone?'))return;await command('new')}),
    action('Order history',history));
    body.append(foot);
  }
  async function command(name){if(busy)return;busy=true;try{const result=await rpc(name,null,current.revision);if(name==='ordered'){say('Marked ordered. Start a new list when ready.');current=null;body.replaceChildren();body.append(action('Start next list',async()=>{try{await rpc('new',null,result.revision)}catch(e){say('Please reopen to start the next list',true)}}))}else{current=result;preview=false;page=0;say('New shared list started');render()}}catch(e){say(e.message,true)}finally{busy=false}}
  async function history(){try{const items=await rpc('history');body.replaceChildren();body.append(el('h3','Previous shopping lists'));for(const x of items){const b=action(new Date(x.created_at).toLocaleDateString('en-AU')+' — '+x.status,()=>{body.replaceChildren();body.append(el('pre',x.state.categories.map(c=>c.name+'\n'+c.items.filter(i=>i.selected).map(i=>'• '+i.name+(i.note?' — '+i.note:'')).join('\n')).join('\n\n')));body.append(action('Back',render))});body.append(b)}body.append(action('Back to current list',render))}catch(e){say(e.message,true)}}
  button.onclick=async()=>{overlay.hidden=false;preview=false;body.replaceChildren();try{await load()}catch(e){say(e.message,true)}};
  overlay.querySelector('#shopClose').onclick=()=>overlay.hidden=true;
  overlay.addEventListener('click',e=>{if(e.target===overlay)overlay.hidden=true});
})();