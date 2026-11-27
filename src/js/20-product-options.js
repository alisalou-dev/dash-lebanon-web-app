/* Dash product options: admin editor, storefront selection, and safe checkout gate. */
(function () {
  const originalOpenProductModal = window.openProductModal;
  const originalSaveProduct = window.saveProduct;
  const originalProductPage = window.pProduct;
  const originalRenderProductPage = window.renderProductPage;
  const originalAddToCart = window.addToCart;
  const originalCartQty = window.cartQty;
  const originalCartPage = window.pCart;
  const originalPlaceOrder = window.placeOrder;
  window._productOptionGroupsDraft = [];
  window._currentProductOptionGroups = [];
  window._selectedProductOptions = {};

  const escOption = value => typeof esc === 'function' ? esc(String(value ?? '')) : String(value ?? '');
  const cleanUrl = value => {
    try { const u = new URL(String(value || ''), location.href); return ['https:','http:'].includes(u.protocol) ? u.href : ''; }
    catch (_) { return ''; }
  };
  const videoUrlType = value => {
    try {
      const u = new URL(cleanUrl(value));
      const host = u.hostname.toLowerCase();
      const youtubeHost = host === 'youtu.be' || host === 'youtube.com' || host.endsWith('.youtube.com');
      const vimeoHost = host === 'vimeo.com' || host.endsWith('.vimeo.com');
      if (youtubeHost) {
        const id = host === 'youtu.be' ? u.pathname.split('/').filter(Boolean)[0] : u.searchParams.get('v');
        return id && /^[\w-]{11}$/.test(id) ? 'youtube' : '';
      }
      if (vimeoHost) return /^\d+$/.test(u.pathname.split('/').filter(Boolean).pop() || '') ? 'vimeo' : '';
      return /\.(mp4|webm|ogg|ogv)$/i.test(u.pathname) ? 'file' : '';
    } catch (_) { return ''; }
  };
  const asNum = value => Number.isFinite(Number(value)) ? Number(value) : 0;
  const currentProduct = () => S.products.find(p => p.id === S.data);
  const selectedOptions = () => window._currentProductOptionGroups
    .map(g => ({ group:g, value:(g.values || []).find(v => v.id === window._selectedProductOptions[g.id]) }))
    .filter(x => x.value);
  function optionUnitPrice(product, chosen = selectedOptions()) {
    let price = asNum(product.price);
    chosen.forEach(({value}) => { if (value.price_mode === 'replace') price = asNum(value.price); else price += asNum(value.price); });
    return Math.max(0, Math.round(price * 100) / 100);
  }
  function orderUnitPrice(product, unitPrice) {
    if (S.buyMode !== 'bundle' || !product.bundle_qty || !product.price) return unitPrice;
    return Math.round((asNum(product.bundle_price) / asNum(product.bundle_qty)) * (unitPrice / asNum(product.price)) * 100) / 100;
  }
  function optionPriceText(product) {
    const unit = optionUnitPrice(product);
    return S.buyMode === 'bundle' && product.bundle_qty
      ? orderUnitPrice(product, unit) * asNum(product.bundle_qty)
      : unit * asNum(S.dqty || 1);
  }
  function refreshOptionPrice() {
    const p = currentProduct(); if (!p) return;
    const amount = optionPriceText(p);
    const price = document.getElementById('pd-price'); if (price) price.textContent = fmt(amount);
    const lbp = document.getElementById('pd-lbp'); if (lbp) lbp.textContent = `${fmtLBP(amount)} · Delivery $4.00`;
    const points = document.getElementById('pts-chip'); if (points) points.innerHTML = `★ Earn <strong>${calcEarnPts(amount)}</strong> points with this order`;
  }
  function optionGroupMarkup(group, index) {
    const values = group.values || [];
    return `<section class="po-group card">
      <div class="po-group-head"><label class="flabel">${escOption(group.title)}${group.required ? ' <span class="req">*</span>' : ' <span class="muted-note">Optional</span>'}</label></div>
      <div class="po-values">${!group.required ? `<button type="button" class="po-value ${!window._selectedProductOptions[group.id]?'selected':''}" onclick="selectProductOption('${group.id}','')">No selection</button>` : ''}
        ${values.map(v => `<button type="button" class="po-value ${window._selectedProductOptions[group.id]===v.id?'selected':''}" ${Number(v.stock_quantity)===0?'disabled':''} onclick="selectProductOption('${group.id}','${v.id}')"><span>${escOption(v.label)}</span><strong>${v.price_mode==='replace'?fmt(v.price):`${asNum(v.price)>0?'+':''}${fmt(v.price)}`}</strong>${v.stock_quantity!=null?`<small>${Number(v.stock_quantity)>0?`${Number(v.stock_quantity)} available`:'Out of stock'}</small>`:''}</button>`).join('')}
      </div>
    </section>`;
  }
  window.selectProductOption = function (groupId, valueId) {
    if (valueId) window._selectedProductOptions[groupId] = valueId;
    else delete window._selectedProductOptions[groupId];
    const p = currentProduct(); if (p) window.renderProductPage(p);
  };

  function renderAdminOptionEditor() {
    const host = document.getElementById('pm-option-editor'); if (!host) return;
    host.innerHTML = `<div class="po-admin-head"><div><strong>Product options</strong><div class="muted-note">Create titles such as Size or Capacity, then set a price and optional stock for each value.</div></div><button type="button" class="btn btn-ghost btn-sm" onclick="addProductOptionGroup()">+ Add option group</button></div>
      ${(window._productOptionGroupsDraft || []).map((g, gi) => `<div class="po-admin-group">
        <div class="frow2"><div class="fgroup"><label class="flabel">Group title</label><input class="finput" value="${escOption(g.title)}" oninput="updateProductOptionGroup(${gi},'title',this.value)" placeholder="Size, thickness, capacity..."></div><div class="fgroup"><label class="flabel">Selection</label><select class="finput" onchange="updateProductOptionGroup(${gi},'required',this.value==='true')"><option value="true" ${g.required?'selected':''}>Required</option><option value="false" ${!g.required?'selected':''}>Optional</option></select></div></div>
        <div class="po-admin-values">${(g.values||[]).map((v,vi) => `<div class="po-admin-value">
          <input class="finput" aria-label="Option name" value="${escOption(v.label)}" oninput="updateProductOptionValue(${gi},${vi},'label',this.value)" placeholder="3 cm / 1 liter">
          <select class="finput" aria-label="Price behavior" onchange="updateProductOptionValue(${gi},${vi},'price_mode',this.value)"><option value="replace" ${v.price_mode==='replace'?'selected':''}>Full product price</option><option value="add" ${v.price_mode!=='replace'?'selected':''}>Add to base price</option></select>
          <input class="finput" type="number" min="0" step="0.01" aria-label="Option price" value="${escOption(v.price)}" oninput="updateProductOptionValue(${gi},${vi},'price',this.value)" placeholder="Price">
          <input class="finput" type="number" min="0" step="1" aria-label="Option stock" value="${v.stock_quantity==null?'':escOption(v.stock_quantity)}" oninput="updateProductOptionValue(${gi},${vi},'stock_quantity',this.value)" placeholder="Stock (optional)">
          <button class="btn btn-ghost btn-sm" type="button" onclick="removeProductOptionValue(${gi},${vi})" aria-label="Remove option">Remove</button>
        </div>`).join('')}</div>
        <div class="po-admin-actions"><button class="btn btn-ghost btn-sm" type="button" onclick="addProductOptionValue(${gi})">+ Add value</button><button class="btn btn-ghost btn-sm" type="button" onclick="removeProductOptionGroup(${gi})">Remove group</button></div>
      </div>`).join('')}
      <div class="muted-note">A selected value can set the full product price or add an amount to the base price. Stock is tracked per value when entered.</div>`;
  }
  window.addProductOptionGroup = function () { window._productOptionGroupsDraft.push({title:'',required:true,values:[]}); renderAdminOptionEditor(); };
  window.addProductOptionValue = function (i) { window._productOptionGroupsDraft[i].values.push({label:'',price_mode:'replace',price:0,stock_quantity:null,active:true}); renderAdminOptionEditor(); };
  window.updateProductOptionGroup = function (i,k,v) { window._productOptionGroupsDraft[i][k]=v; };
  window.updateProductOptionValue = function (i,j,k,v) { const x=window._productOptionGroupsDraft[i].values[j]; x[k]=k==='price'||k==='stock_quantity'?(v===''?null:Number(v)):v; };
  window.removeProductOptionGroup = function (i) { window._productOptionGroupsDraft.splice(i,1); renderAdminOptionEditor(); };
  window.removeProductOptionValue = function (i,j) { window._productOptionGroupsDraft[i].values.splice(j,1); renderAdminOptionEditor(); };
  async function loadOptionGroups(productId) {
    const {data:groups,error}=await sb.from('product_option_groups').select('*').eq('product_id',productId).order('sort_order');
    if (error) throw error;
    const ids=(groups||[]).map(g=>g.id);
    const {data:values,error:valueError}=ids.length ? await sb.from('product_option_values').select('*').in('group_id',ids).eq('active',true).order('sort_order') : {data:[],error:null};
    if (valueError) throw valueError;
    return (groups||[]).map(g=>({...g,values:(values||[]).filter(v=>v.group_id===g.id)}));
  }
  function prepareOptionGroups(groups) {
    // The editor may contain a newly added, untouched group when the product is saved.
    // Ignore only fully blank placeholders; keep validation strict for partially filled groups.
    const prepared=(groups||[])
      .map(g=>({...g,title:String(g.title||'').trim(),values:(g.values||[]).filter(v=>String(v.label||'').trim())}))
      .filter(g=>g.title || g.values.length);
    for (const g of prepared) {
      if (!g.title) throw new Error('Add a title to each option group that has values.');
      if (!g.values.length) throw new Error(`Add at least one value to “${g.title}”.`);
    }
    return prepared;
  }
  async function persistOptionGroups(productId, groups) {
    const normalized=prepareOptionGroups(groups);
    const {error}=await sb.rpc('save_product_option_groups',{p_product_id:productId,p_groups:normalized});
    if(error)throw error;
  }

  window.openProductModal = async function (id) {
    window._productOptionGroupsDraft=[];
    await originalOpenProductModal(id);
    const save=document.querySelector('#modal-root button[onclick^="saveProduct("]');
    if (!save) return;
    const product=id?(window._adminProducts||[]).find(x=>x.id===id):null;
    const media=document.createElement('div'); media.className='po-media card'; media.innerHTML=`<strong>Product video</strong><div class="fgroup"><label class="flabel">Video URL (direct MP4/WebM, YouTube, or Vimeo)</label><input class="finput" id="pm-video-url" type="url" value="${escOption(product?.video_url||'')}" placeholder="https://..."></div><div class="fgroup"><label class="flabel">Or upload a video (MP4/WebM/OGG, up to 150 MB)</label><input class="finput" id="pm-video-file" type="file" accept="video/mp4,video/webm,video/ogg"></div><div class="muted-note">A new upload replaces the saved URL.</div>`;
    save.parentElement.insertBefore(media,save);
    const editor=document.createElement('div'); editor.id='pm-option-editor'; editor.className='po-admin card';
    save.parentElement.insertBefore(editor,save); renderAdminOptionEditor();
    try {
      const {error}=await sb.from('product_option_groups').select('id').limit(1);
      if(error)throw error;
      window._productOptionsSchemaReady=true;
      if(id)window._productOptionGroupsDraft=await loadOptionGroups(id);
      renderAdminOptionEditor();
    } catch (error) {
      window._productOptionsSchemaReady=false;
      editor.innerHTML='<div class="muted-note">Run the product-options-and-video SQL migration first, then reopen this editor. Existing product fields remain available.</div>';
      media.insertAdjacentHTML('beforeend','<div class="muted-note">The video column and upload bucket are created by that SQL migration.</div>');
      console.warn('Product options are not installed:',error.message);
    }
  };
  window.saveProduct = async function (id) {
    let groups;
    try { groups=prepareOptionGroups(JSON.parse(JSON.stringify(window._productOptionGroupsDraft||[]))); }
    catch(error) { toast(error.message); return; }
    const name=document.getElementById('pm-name')?.value.trim();
    const videoInput=document.getElementById('pm-video-url');
    const rawVideoUrl=videoInput?videoInput.value.trim():'';
    const videoFile=document.getElementById('pm-video-file')?.files?.[0]||null;
    const videoUrl=rawVideoUrl?cleanUrl(rawVideoUrl):'';
    if(rawVideoUrl&&!videoFile&&(!videoUrl||!videoUrlType(videoUrl))){toast('Use a direct MP4/WebM/OGG URL, YouTube link, or Vimeo link.');return;}
    if(videoFile&&(!['video/mp4','video/webm','video/ogg'].includes(videoFile.type)||videoFile.size>150*1024*1024)){toast('Choose an MP4, WebM, or OGG video under 150 MB.');return;}
    await originalSaveProduct(id);
    if(document.querySelector('#modal-root .modal-ov')) return;
    const productId=id || (S.products||[]).filter(p=>p.name===name).sort((a,b)=>String(b.created_at||'').localeCompare(String(a.created_at||'')))[0]?.id;
    if (!productId || !window._productOptionsSchemaReady) return;
    try {
      await persistOptionGroups(productId,groups);
      let finalUrl=videoUrl;
      if(videoFile){
        const safe=videoFile.name.replace(/[^\w.\-]/g,'_');
        const path=`${productId}/${Date.now()}-${safe}`;
        const upload=await sb.storage.from('product-videos').upload(path,videoFile,{upsert:false,contentType:videoFile.type});
        if(upload.error)throw upload.error;
        finalUrl=sb.storage.from('product-videos').getPublicUrl(path).data.publicUrl;
      }
      const {error:videoError}=await sb.from('products').update({video_url:videoUrl||finalUrl||null}).eq('id',productId);
      if(videoError)throw videoError;
      if(groups.length)toast('Product, options, and video saved');
    }
    catch (error) { console.error('Option save failed:',error); toast(`Product saved, but options were not saved: ${error.message}`); }
  };
  window.pProduct = async function () {
    window._currentProductOptionGroups=[]; window._selectedProductOptions={};
    const p=currentProduct();
    if (p) try { window._currentProductOptionGroups=await loadOptionGroups(p.id); } catch(error) { console.warn('Product option groups unavailable:',error.message); }
    return originalProductPage();
  };
  function videoEmbed(url,type,name){
    try {
      const u=new URL(url);
      if(type==='youtube'){
        const id=u.hostname==='youtu.be'?u.pathname.split('/').filter(Boolean)[0]:u.searchParams.get('v');
        return `<iframe src="https://www.youtube-nocookie.com/embed/${escOption(id)}" title="${escOption(name)} product video" loading="lazy" allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe>`;
      }
      if(type==='vimeo'){
        const id=u.pathname.split('/').filter(Boolean).pop();
        return `<iframe src="https://player.vimeo.com/video/${escOption(id)}" title="${escOption(name)} product video" loading="lazy" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen></iframe>`;
      }
    } catch(_) {}
    return `<video controls playsinline preload="metadata" poster="${escOption(coverImg(currentProduct()||{}))}"><source src="${escOption(url)}">Your browser does not support this video.</video>`;
  }
  function renderProductGallery(p,videoUrl,videoType){
    if(window._pdAutoRotateTimer){clearInterval(window._pdAutoRotateTimer);window._pdAutoRotateTimer=null;}
    const gallery=document.getElementById('pd-gallery');
    if(!gallery)return;
    gallery.querySelector('.pd-gallery-video')?.remove();
    gallery.querySelectorAll('.pd-arrow,.pd-dots').forEach(el=>el.remove());
    gallery.parentElement?.querySelector('.pd-thumbs')?.remove();
    const imageUrls=Array.isArray(pdImages)&&pdImages.length?pdImages:[coverImg(p)];
    const items=imageUrls.map(src=>({type:'image',src}));
    if(videoUrl&&videoType)items.push({type:'video',src:videoUrl,videoType});
    window._pdGalleryItems=items;
    window._pdGalleryIndex=0;
    const img=gallery.querySelector('#pd-main-img');
    if(!img)return;
    img.style.transition='opacity .2s ease';
    if(items.length>1){
      gallery.insertAdjacentHTML('beforeend',`<button type="button" class="pd-arrow prev" onclick="pdPrev()" aria-label="Previous media">‹</button><button type="button" class="pd-arrow next" onclick="pdNext()" aria-label="Next media">›</button><div class="pd-dots" id="pd-dots" aria-label="Product media">${items.map((_,i)=>`<button type="button" class="${i===0?'on':''}" aria-label="Show media ${i+1}" aria-current="${i===0?'true':'false'}" onclick="pdSwap(${i})"></button>`).join('')}</div>`);
      const thumbs=document.createElement('div');thumbs.className='pd-thumbs';thumbs.setAttribute('aria-label','Product photos and video');
      thumbs.innerHTML=items.map((item,i)=>item.type==='video'?`<button type="button" class="pd-thumb pd-thumb-video ${i===0?'on':''}" title="Play product video" aria-label="Show product video" onclick="pdSwap(${i})"><img src="${escOption(coverImg(p))}" alt=""><span aria-hidden="true">▶</span></button>`:`<button type="button" class="pd-thumb ${i===0?'on':''}" title="Show product photo ${i+1}" aria-label="Show product photo ${i+1}" onclick="pdSwap(${i})"><img src="${escOption(item.src)}" alt=""></button>`).join('');
      gallery.insertAdjacentElement('afterend',thumbs);
    }
    window.pdSwap=function(i,fromTimer=false){
      const media=window._pdGalleryItems||[];if(!media.length)return;
      const next=((Number(i)%media.length)+media.length)%media.length;
      window._pdGalleryIndex=next;
      gallery.querySelector('.pd-gallery-video')?.remove();
      const item=media[next];
      if(item.type==='image'){
        img.style.display='block';img.style.opacity='0';
        setTimeout(()=>{if(img.isConnected){img.src=item.src;img.alt=`${p.name} photo`;img.style.opacity='1';}},100);
      }else{
        img.style.display='none';
        const frame=document.createElement('div');frame.className='pd-gallery-video';frame.setAttribute('aria-label',`${p.name} product video`);frame.innerHTML=`<span class="pd-video-badge">▶ Product video</span>${videoEmbed(item.src,item.videoType,p.name)}`;gallery.insertBefore(frame,gallery.querySelector('.pd-arrow.prev')||null);
      }
      gallery.querySelectorAll('.pd-thumb').forEach((el,x)=>el.classList.toggle('on',x===next));
      gallery.querySelectorAll('.pd-dots button').forEach((el,x)=>{el.classList.toggle('on',x===next);el.setAttribute('aria-current',x===next?'true':'false');});
    };
    window.pdNext=()=>window.pdSwap((window._pdGalleryIndex+1)%window._pdGalleryItems.length);
    window.pdPrev=()=>window.pdSwap((window._pdGalleryIndex-1+window._pdGalleryItems.length)%window._pdGalleryItems.length);
    img.style.display='block';img.src=imageUrls[0];img.alt=`${p.name} photo`;
    if(imageUrls.length>1&&!window.matchMedia('(prefers-reduced-motion: reduce)').matches){
      window._pdAutoRotateTimer=setInterval(()=>{
        if(document.hidden||gallery.matches(':hover')||window._pdGalleryItems[window._pdGalleryIndex]?.type==='video')return;
        const count=imageUrls.length;window.pdSwap((window._pdGalleryIndex+1)%count,true);
      },5000);
    }
  }
  window.renderProductPage = function (p) {
    originalRenderProductPage(p);
    document.querySelector('.product-video-card')?.remove();
    const productUrl=cleanUrl(p.video_url);
    const productVideoType=videoUrlType(productUrl);
    renderProductGallery(p,productUrl,productVideoType);
    const host=document.querySelector('.pd-wrap > div:last-child'); if (!host || !window._currentProductOptionGroups.length) return;
    const anchor=host.querySelector('.color-swatches')?.closest('.fgroup') || host.querySelector('.bundle-opts') || host.querySelector('.pts-chip');
    const section=document.createElement('div'); section.className='po-store'; section.innerHTML=window._currentProductOptionGroups.map(optionGroupMarkup).join('');
    if (anchor) anchor.insertAdjacentElement('beforebegin',section); else host.prepend(section);
    refreshOptionPrice();
  };
  function chosenPayload() {
    return selectedOptions().map(({group,value})=>({group_id:group.id,value_id:value.id,label:value.label,group_title:group.title,price_mode:value.price_mode,price:asNum(value.price),stock_quantity:value.stock_quantity==null?null:Number(value.stock_quantity)}));
  }
  function selectionKey(options) { return options.map(o=>o.group_id+':'+o.value_id).sort().join('|'); }
  window.addToCart = function (pid) {
    const p=S.products.find(x=>x.id===pid); if (!p) return;
    const missing=window._currentProductOptionGroups.find(g=>g.required&&!window._selectedProductOptions[g.id]);
    if (missing) { toast(`Please select ${missing.title}`); return; }
    const opts=chosenPayload();
    const qty=S.buyMode==='bundle'&&p.bundle_qty?asNum(p.bundle_qty)*asNum(S.offerQty||1):asNum(S.dqty||1);
    if (p.stock_quantity!=null&&cartProductQty(p.id)+qty>Number(p.stock_quantity)) { toast('Not enough stock for that quantity'); return; }
    for (const o of opts) {
      const val=window._currentProductOptionGroups.flatMap(g=>g.values||[]).find(v=>v.id===o.value_id);
      if (val?.stock_quantity!=null) {
        const existing=S.cart.filter(i=>(i.selected_options||[]).some(x=>x.value_id===o.value_id)).reduce((n,i)=>n+asNum(i.qty),0);
        if (existing+qty>Number(val.stock_quantity)) { toast(`Not enough stock for ${o.label}`); return; }
      }
    }
    const unit=orderUnitPrice(p,optionUnitPrice(p));
    const bundleTotal=S.buyMode==='bundle'&&p.bundle_qty?asNum(p.bundle_price)*(asNum(S.offerQty||1))*(optionUnitPrice(p)/Math.max(asNum(p.price),0.01)):null;
    const lineQty=qty; const linePrice=bundleTotal!=null?Math.round(bundleTotal*100)/100/lineQty:unit;
    const color=S.selectedColor||''; const uid=`${p.id}_${S.buyMode==='bundle'?'bundle':'single'}_${encodeURIComponent(color)}_${encodeURIComponent(selectionKey(opts))}`;
    const existing=S.cart.find(i=>i._uid===uid);
    const labels=opts.map(o=>`${o.group_title}: ${o.label}`).join(' · ');
    if(existing) existing.qty+=lineQty;
    else S.cart.push({_uid:uid,product_id:p.id,name:labels?`${p.name} · ${labels}`:p.name,image:coverImg(p),price:linePrice,qty:lineQty,delivery_price:p.delivery_price,is_bundle:S.buyMode==='bundle'&&!!p.bundle_qty,bundle_qty:p.bundle_qty||null,bundle_label:S.buyMode==='bundle'&&p.bundle_qty?`${p.bundle_qty}-pack`:'',selected_color:color,selected_options:opts});
    saveCart(); updateCartBadge(); toast('Added to cart');
  };
  window.cartQty = function (uid,q) {
    if(q<1){cartRemove(uid);return} const i=S.cart.find(x=>x._uid===uid); if(!i)return;
    const p=S.products.find(x=>x.id===i.product_id);const other=cartProductQty(i.product_id)-i.qty;
    if(p?.stock_quantity!=null&&other+q>Number(p.stock_quantity)){toast('Not enough stock available');return}
    for(const o of i.selected_options||[]){if(o.stock_quantity!=null){const used=S.cart.filter(x=>(x.selected_options||[]).some(y=>y.value_id===o.value_id)).reduce((n,x)=>n+asNum(x.qty),0)-i.qty+q;if(used>Number(o.stock_quantity)){toast(`Not enough stock for ${o.label}`);return}}}
    i.qty=q;saveCart();render();updateCartBadge();
  };
  window.pCart = function () { return originalCartPage(); };
  window.placeOrder = async function () {
    if (S.cart.some(i=>(i.selected_options||[]).length)) { toast('Product options are saved, but checkout is paused until the Supabase order function is updated to verify option prices and stock. Run the SQL audit and send me its result.'); return; }
    return originalPlaceOrder();
  };
  window.cartPayload = function () { return S.cart.map(i=>({product_id:i.product_id,qty:i.qty,is_bundle:!!i.is_bundle,selected_options:(i.selected_options||[]).map(o=>({group_id:o.group_id,value_id:o.value_id}))})); };

  // Keep the original quantity and offer handlers, then reapply the option-aware total.
  const oldSelMode=window.selMode; if(oldSelMode) window.selMode=function(mode){oldSelMode(mode);refreshOptionPrice();};
  const oldPdQty=window.pdQty; if(oldPdQty) window.pdQty=function(d){oldPdQty(d);refreshOptionPrice();};
  const oldPdQtyManual=window.pdQtyManual; if(oldPdQtyManual) window.pdQtyManual=function(v){oldPdQtyManual(v);refreshOptionPrice();};
  const oldSelColor=window.selColor; if(oldSelColor) window.selColor=oldSelColor;
})();
