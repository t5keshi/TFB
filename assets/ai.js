(function(){
  function removeEmDash(s){ return (s||'').replace(/\u2014/g, ', ').replace(/\s{2,}/g,' ').trim(); }

  async function fetchWithFallback(url){
    try{const r=await fetch('https://r.jina.ai/http/'+url.replace(/^https?:\/\//,''));if(r.ok)return await r.text()}catch(e){}
    try{const r=await fetch('https://api.allorigins.win/raw?url='+encodeURIComponent(url));if(r.ok)return await r.text()}catch(e){}
    try{const r=await fetch('https://cors.isomorphic-git.org/'+url);if(r.ok)return await r.text()}catch(e){}
    return '';
  }
  function parseRSS(xmlText){
    if(!xmlText) return []; var p=new DOMParser();var xml=p.parseFromString(xmlText,'application/xml');
    return Array.from(xml.querySelectorAll('item,entry')).map(function(n){
      function g(s){var x=n.querySelector(s);return (x&&x.textContent||'').trim()}
      var ln=n.querySelector('link'); var link=(ln&&(ln.getAttribute('href')||ln.textContent))||g('id');
      var pub=g('pubDate')||g('updated')||g('published')||new Date().toISOString();
      var desc=g('description')||g('summary')||'';
      return {title:removeEmDash(g('title')),link:link,pub:new Date(pub),desc:removeEmDash(desc),img:null,src:'',node:n};
    });
  }
  function looksFinance(text){const bad=/(sports?|entertainment|celebrity|gossip|travel|recipes?|lifestyle|video:)/i;const ok=/(market|stocks?|bonds?|yields?|fed|inflation|earnings|revenue|guidance|ipo|merger|acquisition|m&a|oil|commodity|forex|rates?|central bank|jobs?|unemployment|housing|gdp|tariff|chip|semiconductor|bank|credit|equity|indexes?)/i;return ok.test(text)&&!bad.test(text)}
  async function fetchFeeds(){
    var FEEDS=[
      {name:'Reuters Markets',url:'https://feeds.reuters.com/reuters/USMarketNews'},
      {name:'Reuters Business',url:'https://feeds.reuters.com/reuters/businessNews'},
      {name:'MarketWatch',url:'https://www.marketwatch.com/rss/topstories'},
      {name:'WSJ Markets',url:'https://feeds.a.dj.com/rss/RSSMarketsMain.xml'},
      {name:'Yahoo Finance',url:'https://finance.yahoo.com/news/rssindex'}
    ];
    var groups=await Promise.all(FEEDS.map(async f=>{try{var x=await fetchWithFallback(f.url);return parseRSS(x).map(i=>{i.src=f.name;return i})}catch(e){return []}}));
    var items=groups.flat();
    items=items.filter(i=>looksFinance((i.title+' '+i.desc).toLowerCase()));
    items.forEach(i=>resolveImage(i));
    return uniqBy(items, it=>it.link||it.title).sort((a,b)=>b.pub-a.pub);
  }
  async function resolveImage(item){
    try{
      var n=item.node;
      if(n){
        var media=n.querySelector('media\\:content, media\\:thumbnail, enclosure');
        if(media){
          var u=media.getAttribute('url'); if(u){item.img=u; return}
        }
        var desc=(n.querySelector('description, summary')||{}).textContent||'';
        var m=desc.match(/https?:\/\/[^\"']+\.(?:png|jpg|jpeg|gif)/i); if(m){item.img=m[0]; return}
      }
    }catch(e){}
    try{
      const html=await fetchWithFallback(item.link);
      const og=(html.match(/<meta[^>]+property=['\"]og:image['\"][^>]+content=['\"]([^\"']+)['\"]/i)||[])[1] ||
               (html.match(/<meta[^>]+name=['\"]twitter:image['\"][^>]+content=['\"]([^\"']+)['\"]/i)||[])[1];
      if(og){item.img=og; return}
      const inBody=(html.match(/https?:\/\/[^\s\"']+\.(?:png|jpg|jpeg|gif)/i)||[])[0];
      if(inBody){item.img=inBody; return}
    }catch(e){}
    item.img='https://images.unsplash.com/photo-1549421263-5ec394a5ad37?q=80&w=900&auto=format&fit=crop';
  }

  // Headlines (refresh daily)
  async function renderDailyHeadlines(sel, limit){
    limit=limit||14; const t=document.querySelector(sel);
    const items=await fetchFeeds();
    t.innerHTML=items.slice(0,limit).map(i=>'<div class="news-item">'+
      '<img src="'+(i.img||'https://images.unsplash.com/photo-1549421263-5ec394a5ad37?q=80&w=900&auto=format&fit=crop')+'" alt="image" loading="lazy"/>'+
      '<div><div class="news-meta"><span>'+i.src+'</span><span>•</span><time>'+fmtDate(i.pub)+'</time></div>'+
      '<div class="news-title">'+escapeHtml(removeEmDash(i.title))+'</div>'+
      (i.desc?('<p class="small">'+escapeHtml(removeEmDash(strip(i.desc))).slice(0,220)+(i.desc.length>220?'…':'')+'</p>'):'')+
      '<div><a href="'+i.link+'" target="_blank" rel="noopener">Read</a></div></div></div>').join('');
  }

  // Weekly helpers
  function wsjStyleSummary(items){
    const titles=items.map(i=>i.title).join(' ');
    const bodies=items.map(i=>removeEmDash(strip(i.desc))).join(' ');
    const thisWeek=summarize(titles,6);
    let why=summarize(bodies,6);
    if(why===thisWeek){ why=summarize(bodies.split('. ').reverse().join('. '),6); }
    return {thisWeek, why};
  }
  async function weeklyItems(){
    const wr=getWeekRange(new Date());
    const items=await fetchFeeds();
    const week=items.filter(i=>i.pub>=wr.monday&&i.pub<=wr.sunday);
    return {wr, week, items};
  }

  // Blog weekly
  async function renderWeeklyBlog(sel){
    const c=document.querySelector(sel);
    const weekKey=getWeekKey(new Date());
    const cached=localStorage.getItem('tfb_blog_week');
    if(cached===weekKey && localStorage.getItem('tfb_blog_html')){
      c.innerHTML=localStorage.getItem('tfb_blog_html'); return;
    }
    const {wr, week}=await weeklyItems();
    const top=week.slice(0,40);
    let {thisWeek, why}=wsjStyleSummary(top); thisWeek=removeEmDash(thisWeek); why=removeEmDash(why);
    const dateStr=wr.monday.toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'});
    const html='<div class="card">'+
      '<div style="display:flex;justify-content:space-between;align-items:center">'+
      '<div style="display:flex;align-items:center;gap:10px"><img src="assets/financial-bird-logo.png" class="logo" alt="logo"/><strong>The Financial Bird</strong></div>'+
      '<div class="muted">Written '+dateStr+'</div></div>'+
      '<div class="rule"></div>'+
      '<h2 class="h2">This week in markets</h2><p>'+thisWeek+'</p>'+
      '<h2 class="h2">Why is it happening</h2><p>'+why+'</p>'+
      '<h2 class="h2">Selected headlines</h2><ul>'+top.slice(0,10).map(i=>'<li><a href="'+i.link+'" target="_blank" rel="noopener">'+escapeHtml(removeEmDash(i.title))+'</a> <span class="news-meta">('+i.src+')</span></li>').join('')+'</ul>'+
      '<div><button class="button secondary" onclick="window.print()">Save as PDF</button></div>'+
    '</div>';
    c.innerHTML=html;
    localStorage.setItem('tfb_blog_week', weekKey);
    localStorage.setItem('tfb_blog_html', html);
  }

  // Research weekly (keep format)
  async function renderResearch(sel){
    const c=document.querySelector(sel);
    const weekKey=getWeekKey(new Date());
    const cached=localStorage.getItem('tfb_research_week');
    if(cached===weekKey && localStorage.getItem('tfb_research_html')){
      c.innerHTML=localStorage.getItem('tfb_research_html'); return;
    }
    const {wr, week}=await weeklyItems();
    const top=week.slice(0,50);
    let {thisWeek, why}=wsjStyleSummary(top); thisWeek=removeEmDash(thisWeek); why=removeEmDash(why);
    const risks = summarize(top.map(i=>i.title).reverse().join(' '),4);
    const sentiment = (function(){
      const pos=['beat','strong','growth','raised','accelerating','expands','cooling inflation','solid'];
      const neg=['miss','weak','slowdown','cut','strike','recall','lawsuit','geopolitical'];
      const txt=top.map(i=>i.title+' '+removeEmDash(strip(i.desc))).join(' ').toLowerCase();
      let s=0; pos.forEach(p=>{if(txt.includes(p))s++}); neg.forEach(n=>{if(txt.includes(n))s--});
      return s>=1?'Constructive':(s<=-1?'Cautious':'Neutral');
    })();
    const html='<div class="card">'+
      '<div class="h2">Market research note</div>'+
      '<div class="small">'+wr.label+'</div>'+
      '<div class="rule"></div>'+
      '<h3>Overview</h3><p>'+thisWeek+'</p>'+
      '<h3>Key drivers</h3><ul>'+why.split(/(?<=[\.!\?])\s/).map(s=>s?('<li>'+escapeHtml(s)+'</li>'):'').join('')+'</ul>'+
      '<h3>Risks to watch</h3><p>'+risks+'</p>'+
      '<h3>Sentiment</h3><p>'+sentiment+'</p>'+
      '<div><button class="button secondary" onclick="window.print()">Save as PDF</button></div>'+
    '</div>';
    c.innerHTML=html;
    localStorage.setItem('tfb_research_week', weekKey);
    localStorage.setItem('tfb_research_html', html);
  }

  // Stocks to Watch weekly
  async function getSP500Set(){
    try{
      const html=await fetchWithFallback('https://en.wikipedia.org/wiki/List_of_S%26P_500_companies');
      const m=html.match(/<table[^>]*>([\s\S]*?)<\/table>/i);
      const tbl=m?m[0]:'';
      const tickers=Array.from(tbl.matchAll(/<td>\s*<a[^>]*>\s*([A-Z\.]{1,6})\s*<\/a>\s*<\/td>/g)).map(x=>x[1]).filter(x=>x&&x!=='BRK.B');
      return new Set(tickers||[]);
    }catch(e){ return new Set(['AAPL','MSFT','AMZN','GOOGL','META','NFLX','NVDA','JPM','XOM','JNJ','PEP','KO','HD']) }
  }
  function extractTicker(text){
    const cands=(text.match(/\b[A-Z]{1,5}(?:\.[A-Z])?\b/g)||[]).filter(t=>!['CEO','CFO','EPS','USD','ET','AM','PM','GMT'].includes(t));
    return cands[0]||null;
  }
  async function renderWeeklyStocks(sel){
    const wrap=document.querySelector(sel);
    const weekKey=getWeekKey(new Date());
    const cached=localStorage.getItem('tfb_stocks_week');
    if(cached===weekKey && localStorage.getItem('tfb_stocks_html')){
      wrap.innerHTML=localStorage.getItem('tfb_stocks_html'); return;
    }
    const {wr, week}=await weeklyItems();
    const spx=await getSP500Set();
    const map={}; week.forEach(i=>{ const t=extractTicker(i.title)||extractTicker(i.desc)||'OTHER'; if(!map[t]) map[t]=[]; map[t].push(i); });
    const entries=Object.entries(map).filter(([t,arr])=>t!=='OTHER'&&arr.length>0).sort((a,b)=>b[1].length-a[1].length).slice(0,14);
    // Validate tickers by checking we can fetch price history
    async function isReal(t){ try{ const h=await fetchDaily(t); return h&&h.length>0; }catch(e){ return false; } }
    const spCandidates = entries.filter(([t])=>spx.has(t));
    const nicheCandidates = entries.filter(([t])=>!spx.has(t));
    const sp = []; const niche = [];
    for(const [t,a] of spCandidates){ if(sp.length<3 && await isReal(t)) sp.push([t,a]); }
    for(const [t,a] of nicheCandidates){ if(niche.length<3 && await isReal(t)) niche.push([t,a]); }
    // Balance the two sections to be even
    if(sp.length<niche.length){ while(sp.length<niche.length && niche.length>0){ sp.push(niche.shift()); } }
    if(niche.length<sp.length){ while(niche.length<sp.length && sp.length>0){ niche.push(sp.shift()); } }
    
    function logoUrl(t){ return 'https://g.foolcdn.com/art/companylogos/mark/'+t+'.png' }
    function card([t, arr]){
      const blurb=summarize(arr.map(x=>strip(x.desc||x.title)).join(' '),2);
      const links=arr.slice(0,3).map(x=>'<li><a href="'+x.link+'" target="_blank" rel="noopener">'+escapeHtml(x.title)+'</a></li>').join('');
      return '<div class="card stock-card"><img class="logo-top" src="'+logoUrl(t)+'" onerror="this.src=\'https://images.unsplash.com/photo-1549421263-5ec394a5ad37?q=80&w=200&auto=format&fit=crop\'" alt="'+t+' logo"/><div class="news-title">'+t+'</div><p>'+blurb+'</p><ul>'+links+'</ul></div>';
    }
    const html='<div class="h2">S&P 500</div><div class="grid cols-2">'+sp.map(card).join('')+'</div><div class="h2">Niche</div><div class="grid cols-2">'+niche.map(card).join('')+'</div>';
    wrap.innerHTML=html;
    localStorage.setItem('tfb_stocks_week', weekKey);
    localStorage.setItem('tfb_stocks_html', html);
  }

  async function miniSpark(t){
    try{
      const h = await fetchDaily(t);
      if(!h || !h.length) return '';
      const last = h.slice(-60);
      const values = last.map(o=>o.close).filter(x=>x!=null);
      if(values.length<5) return '';
      const min=Math.min(...values), max=Math.max(...values);
      const w=180, hgt=60; const n=values.length-1;
      const pts = values.map((v,i)=>{
        const x = Math.round((i/n)*w);
        const y = Math.round(hgt - ( (v-min)/(max-min+1e-9) )*hgt);
        return (i===0?'M':'L')+x+','+y;
      }).join(' ');
      return '<svg width="'+w+'" height="'+hgt+'" viewBox="0 0 '+w+' '+hgt+'" preserveAspectRatio="none"><path d="'+pts+'" fill="none" stroke="currentColor" stroke-width="2"/></svg>';
    }catch(e){ return ''; }
  }

// ---------- Calendars hourly ----------
  
  // ----- Calendar Archive (persist by date, keep 90 days) -----
  function saveCalendarArchive(items){
    try{
      const store = JSON.parse(localStorage.getItem('tfb_calendar_archive')||'{}');
      const today = new Date(); today.setHours(0,0,0,0);
      for(const i of items){
        const d = new Date(i.pub); d.setHours(0,0,0,0);
        const key = d.toISOString().slice(0,10);
        if(!store[key]) store[key]=[];
        // de-dupe by link
        if(!store[key].some(x=>x.link===i.link)){
          store[key].push({title:i.title, link:i.link, src:i.src, pub:i.pub});
        }
      }
      // prune older than ~90 days
      const cutoff = new Date(); cutoff.setDate(cutoff.getDate()-92);
      for(const k of Object.keys(store)){
        const dt = new Date(k);
        if(dt<cutoff){ delete store[k]; }
      }
      localStorage.setItem('tfb_calendar_archive', JSON.stringify(store));
    }catch(e){}
  }
  window.getCalendarArchive=function(){ try{ return JSON.parse(localStorage.getItem('tfb_calendar_archive')||'{}'); }catch(e){ return {}; } };

  async function renderEarningsCalendar(sel){
    const {wr, week}=await weeklyItems();
    const earns=week.filter(i=>/(earnings|eps|revenue|guidance|quarter|results)/i.test(i.title+' '+i.desc));
    const byTicker={}; earns.forEach(i=>{ const m=(i.title.match(/\b[A-Z]{1,5}(?:\.[A-Z])?\b/g)||[]); const tk=m.find(x=>x!=='EPS'&&x!=='USD'&&x!=='CEO')||', '; if(!byTicker[tk]) byTicker[tk]=[]; byTicker[tk].push(i); });
    const list=Object.keys(byTicker).slice(0,50).map(t=>({t,items:byTicker[t]}));
    document.querySelector(sel).innerHTML = list.length?('<table class="table"><thead><tr><th>Ticker</th><th>Headlines</th></tr></thead><tbody>'+
      list.map(g=>'<tr><td><strong>'+g.t+'</strong></td><td>'+g.items.slice(0,3).map(i=>'<a href="'+i.link+'" target="_blank">'+escapeHtml(removeEmDash(i.title))+'</a> <span class="small">'+fmtDate(i.pub)+'</span>').join('<br>')+'</td></tr>').join('')
      +'</tbody></table>'):'<p class="small">No clear earnings items detected this week.</p>';
  }
  async function renderEconomicCalendarMonth(sel){
    const now=new Date(); const y=now.getFullYear(), m=now.getMonth(); const first=new Date(y,m,1); const start=new Date(first); start.setDate(first.getDate()-((first.getDay()+6)%7)); const days=[]; for(let i=0;i<42;i++){const d=new Date(start); d.setDate(start.getDate()+i); days.push(d)}
    const t=document.querySelector(sel); t.innerHTML=''; const items=(await fetchFeeds());
    const econKeys=/(CPI|PPI|payrolls|jobs report|unemployment|GDP|FOMC|PMI|ISM|retail sales|housing starts|confidence|PCE|rate decision|durable goods|JOLTS)/i;
    const econ=items.filter(i=>econKeys.test(i.title+' '+i.desc));
    const byDate={}; econ.forEach(i=>{ const k=i.pub.toISOString().slice(0,10); (byDate[k]||(byDate[k]=[])).push(i)});
    const grid=document.createElement('div'); grid.className='calendar';
    days.forEach(d=>{ const key=d.toISOString().slice(0,10); const box=document.createElement('div'); box.className='day'; const inMonth=d.getMonth()===m; box.style.opacity=inMonth?'1':'0.45'; box.innerHTML='<div class="date">'+d.getDate()+'</div>'; (byDate[key]||[]).forEach(ev=>{ const e=document.createElement('div'); e.className='event'; e.innerHTML=escapeHtml(ev.title.slice(0,60)); e.title=ev.title; e.onclick=()=>window.open(ev.link,'_blank','noopener'); box.appendChild(e)}); grid.appendChild(box)}); t.appendChild(grid);
  }
  function hourly(fn){ fn(); setInterval(fn, 60*60*1000); }

  
  const REASONS_MAP_TFB = {
    LLY: "Leading GLP‑1 portfolio with strong revenue growth from obesity and diabetes treatments; robust pipeline supports multi‑year visibility.",
    MSFT: "Diversified cash flow from cloud (Azure) and productivity; continued AI integration across products drives durable growth.",
    COST: "Membership model with high retention and steady same‑store sales; defensive in slowdowns and consistent dividend growth.",
    META: "Improving monetization and large AI infra investments; strong engagement across apps with margin expansion potential.",
    NVO: "Global leader in diabetes/obesity; capacity expansions and new indications support long runway.",
    ARM: "Licensing and royalty model benefits from AI/edge demand; ecosystem standard in mobile/IoT with growth in data center.",
    SMCI: "High‑performance AI server supplier with rapid revenue growth; leverages partnerships across GPU/CPU vendors.",
    ORCL: "Cloud/AI workloads scaling on OCI; backlog growth and partnerships support re‑rating.",
    LIN: "Industrial gases leader with pricing power and stable margins; secular demand from electronics and clean energy.",
    DE: "Automation and precision ag tailwinds; recurring software/services expand margins.",
    ASML: "Sole supplier of EUV lithography; long‑term secular demand from chip complexity.",
    NFLX: "Paid sharing and ad‑tier drive ARPU and subs growth; strong content slate and margins."
  };
    // ---------- TFB Portfolio hourly ----------
  const START='2025-08-01';
  const CAPITAL=1000;
  const BASKET_KEY='tfb_holdings_aug2025_weeklyHourly_v1';

  async function yahooDaily(ticker){
    const base='https://query2.finance.yahoo.com/v8/finance/chart/'+encodeURIComponent(ticker);
    const params='?range=1y&interval=1d&includeAdjustedClose=true';
    const mirrors=[
      'https://r.jina.ai/http/'+base.replace(/^https?:\/\//,'')+params,
      'https://api.allorigins.win/raw?url='+encodeURIComponent(base+params),
      'https://cors.isomorphic-git.org/'+base+params
    ];
    for(const u of mirrors){
      try{const r=await fetch(u); if(!r.ok) continue; const txt=await r.text(); const j=JSON.parse(txt.replace(/^\s*```json|```\s*$/g,'')); const res=j&&j.chart&&j.chart.result&&j.chart.result[0]; if(!res) continue; const ts=res.timestamp||[]; const closes=(res.indicators&&res.indicators.adjclose&&res.indicators.adjclose[0]&&res.indicators.adjclose[0].adjclose)||(res.indicators&&res.indicators.quote&&res.indicators.quote[0]&&res.indicators.quote[0].close)||[]; const out=[]; for(let i=0;i<ts.length;i++){ if(closes[i]!=null){ out.push({key:new Date(ts[i]*1000).toISOString().slice(0,10), close:closes[i]}) } } if(out.length>10) return out }catch(e){} }
    return [];
  }
  async function stooqDaily(t){
    const syms=[t.toLowerCase()+'.us', t.toLowerCase()];
    for(const s of syms){
      try{const url='https://stooq.com/q/d/l/?s='+s+'&i=d'; const txt=await fetchWithFallback(url); if(txt && txt.includes('Date,Open,High,Low,Close,Volume')){ const rows=txt.trim().split(/\r?\n/).slice(1).map(r=>r.split(',')); const out=rows.map(r=>({key:r[0], close:parseFloat(r[4])})).filter(x=>isFinite(x.close)); if(out.length>10) return out }}catch(e){}
    }
    return [];
  }
  async function fetchDaily(t){ let h=await yahooDaily(t); if(h.length) return h; return await stooqDaily(t); }
  function buildDateUnion(startKey, maps){ const set=new Set(); maps.forEach(m=>Object.keys(m).forEach(k=>{ if(k>=startKey) set.add(k) })); return Array.from(set).sort(); }
  function svgLine(values, width, height){ const min=Math.min(...values), max=Math.max(...values); const W=width, H=height; const pts=values.map((v,i)=>[i/(values.length-1||1)*W, H-(v-min)/(max-min||1)*H]); let d='M '+pts[0][0].toFixed(2)+' '+pts[0][1].toFixed(2); for(let i=1;i<pts.length;i++){ d+=' L '+pts[i][0].toFixed(2)+' '+pts[i][1].toFixed(2) } return '<svg width=\"'+W+'\" height=\"'+H+'\" style=\"width:100%\"><path d=\"'+d+'\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\"/></svg>'; }

  async function pickTopPositive(){
    const candidates=['AAPL','MSFT','NVDA','AMZN','GOOGL','META','AVGO','JPM','XOM','CVX','JNJ','PG','KO','COST','PEP','CRM','QCOM','AMD','INTC','SMCI','ARM','CRWD','PANW','NET','CELH','NKE','HD','BA','CAT','GE','LMT','RTX','BKNG','ABNB','UBER','SHOP','PYPL','SQ','ETSY','SBUX','CMG','NFLX','ADBE','ORCL','MRNA','PFE','T','VZ','WMT','TMO','MMM','DKNG','PLTR'];
    const results=[];
    for(const t of candidates){
      const h=await fetchDaily(t); if(!h.length) continue;
      const map={}; h.forEach(o=>map[o.key]=o.close);
      const keys=Object.keys(map).filter(k=>k>=START).sort(); if(!keys.length) continue;
      const startPx=map[keys[0]], lastPx=map[keys[keys.length-1]];
      if(startPx && lastPx){ results.push({t,ret:(lastPx/startPx-1)}) }
      if(results.length>180) break;
    }
    const pos=results.filter(r=>r.ret>0).sort((a,b)=>b.ret-a.ret).map(r=>r.t);
    const set=new Set(); const out=[]; for(const t of pos){ if(!set.has(t)){ set.add(t); out.push(t); if(out.length===10) break; } }
    if(out.length<10){
      const rest=results.sort((a,b)=>b.ret-a.ret).map(r=>r.t);
      for(const t of rest){ if(!set.has(t)){ set.add(t); out.push(t); if(out.length===10) break; } }
    }
    return out;
  }

  async function renderTFBPortfolio(selSummary, selChart, selTable, selReasons){
    let TICKS=null; try{ TICKS=JSON.parse(localStorage.getItem(BASKET_KEY)||'null') }catch(e){ TICKS=null };
    // sanitize cached basket (remove blacklisted names; pad with fallbacks)
    if(Array.isArray(TICKS)){
      TICKS = TICKS.filter(t=>!['GOOG','GOOGL','TSLA','LMT','AVGO','NVDA'].includes(t));
      if(TICKS.length<10){
        const fallback=['LLY','MSFT','COST','META','NVO','ARM','SMCI','ORCL','LIN','DE','ASML','NFLX'];
        for(const f of fallback){ if(!TICKS.includes(f) && TICKS.length<10) TICKS.push(f); }
      }
    }
    if(!Array.isArray(TICKS) || TICKS.length!==10){
      try{ TICKS=await pickTopPositive();
    // blacklist Google & Tesla
    TICKS=TICKS.filter(t=>!['GOOG','GOOGL','TSLA','LMT','AVGO','NVDA'].includes(t));
    if(TICKS.length<10){
      const fallback=['LLY','MSFT','COST','META','NVO','ARM','SMCI','ORCL','LIN','DE','ASML','NFLX'];
      for(const f of fallback){ if(!TICKS.includes(f) && TICKS.length<10) TICKS.push(f); }
    }
    localStorage.setItem(BASKET_KEY, JSON.stringify(TICKS));
    }
      catch(e){ TICKS=['AAPL','MSFT','NVDA','AMZN','GOOGL','META','JPM','XOM','JNJ','PEP']; }
    }
    const weight=1/TICKS.length;
        async function updateOnce(){
      // fetch histories
      const histories=await Promise.all(TICKS.map(t=>fetchDaily(t)));
      // build maps {dateKey: close}
      const maps=histories.map(h=>{const m={}; h.forEach(o=>m[o.key]=o.close); return m});
      const keys=buildDateUnion(START, maps);
      // For each ticker, find its first available price on/after START
      const starters = maps.map(m=>{
        for(const k of keys){ if(m[k]!=null) return {k,px:m[k]}; }
        return {k:null, px:null};
      });
      // Filter out tickers that have no price at all (avoid $0.00 rows)
      const validIdx = starters.map((s,i)=> s.px!=null ? i : -1).filter(i=>i>=0);
      let ticks = validIdx.map(i=>TICKS[i]);
      let vmaps = validIdx.map(i=>maps[i]);
      let vstarts = validIdx.map(i=>starters[i]);
      // Enforce per-ticker drawdown rule: remove names with return < -20% since START
      try{
        const keepIdx = [];
        for(let i=0;i<ticks.length;i++){
          const startPx = vstarts[i]?.px;
          if(!startPx) continue;
          const allKeys = Object.keys(vmaps[i]).sort();
          let lastPx = null;
          for(let j=allKeys.length-1;j>=0;j--){ const kk=allKeys[j]; if(vmaps[i][kk]!=null){ lastPx=vmaps[i][kk]; break; } }
          if(lastPx!=null){
            const r = (lastPx/startPx - 1);
            if(r >= -0.20) keepIdx.push(i);
          }
        }
        if(keepIdx.length !== ticks.length){
          ticks = keepIdx.map(i=>ticks[i]);
          vmaps = keepIdx.map(i=>vmaps[i]);
          vstarts = keepIdx.map(i=>vstarts[i]);
        }
      }catch(e){}
      // If we have fewer than 8 names (data gaps), try to repick a fresh set
      if(ticks.length < 8){
        try{
          const repick = await pickTopPositive();
          const h2 = await Promise.all(repick.map(t=>fetchDaily(t)));
          const m2 = h2.map(h=>{const m={}; h.forEach(o=>m[o.key]=o.close); return m});
          const s2 = m2.map(m=>{ for(const k of Object.keys(m).sort()){ if(m[k]!=null) return {k,px:m[k]}; } return {k:null,px:null}; });
          const vidx = s2.map((s,i)=> s.px!=null ? i : -1).filter(i=>i>=0);
          ticks = vidx.map(i=>repick[i]).slice(0,10);
          vmaps = vidx.map(i=>m2[i]).slice(0,10);
          vstarts = vidx.map(i=>s2[i]).slice(0,10);
        }catch(e){}
      }
      const weight=1/Math.max(1,ticks.length);
      const shares=vstarts.map(s=> (CAPITAL*weight)/(s.px||1) );
      // Time series values; missing prices count as 0 that day
      const values=keys.map(k=>ticks.reduce((v,_,i)=>{const px=vmaps[i][k]; return v+(px?shares[i]*px:0)},0));
      // Define base/last using CAPITAL as the true baseline
      const firstVal=CAPITAL;
      // compute last value using the latest available price for each ticker
      const lastVal=ticks.reduce((v,_,i)=>{
        let px=null; const allKeys=Object.keys(vmaps[i]).sort();
        for(let j=allKeys.length-1;j>=0;j--){ const kk=allKeys[j]; if(vmaps[i][kk]!=null){ px=vmaps[i][kk]; break; } }
        return v + (px? shares[i]*px : 0);
      }, 0);
      const ret=(lastVal/firstVal-1)*100;
      const indexSeries=values.map(v=> (v/firstVal)*100 );
      document.querySelector(selSummary).innerHTML='<strong>TFB Index: '+indexSeries.slice(-1)[0].toFixed(1)+'</strong> (100 on '+START.replace(/-/g,'/')+') · Value $ '+lastVal.toFixed(2)+' · '+ret.toFixed(1)+' percent since inception<br/><span class="small">Holdings: '+ticks.join(', ')+'</span>';
      document.querySelector(selChart).innerHTML=svgLine(indexSeries,760,240);
      const rows=ticks.map((t,i)=>{
        let latest=null; const all=Object.keys(vmaps[i]).sort();
        for(let j=all.length-1;j>=0;j--){ const k=all[j]; if(vmaps[i][k]!=null){ latest=vmaps[i][k]; break; } }
        latest=latest||0; const val=shares[i]*latest;
        return '<tr><td>'+t+'</td><td>10 percent</td><td>'+shares[i].toFixed(4)+'</td><td>$ '+(latest?latest.toFixed(2):'n/a')+'</td><td>$ '+val.toFixed(2)+'</td></tr>';
      }).join('');
      document.querySelector(selTable).innerHTML='<table class="table"><thead><tr><th>Ticker</th><th>Weight</th><th>Shares</th><th>Last close</th><th>Value</th></tr></thead><tbody>'+rows+'</tbody></table>';
    }
    await updateOnce();
    setInterval(updateOnce, 60*60*1000);
  }

  // Header and automation bindings
  function initHeaderBindings(){
    const currentTheme=initTheme();
    const tgl=document.getElementById('themeToggle'); if(tgl){ tgl.checked=(currentTheme==='dark'); tgl.addEventListener('change',()=>setTheme(tgl.checked?'dark':'light')); }
    const subBtn=document.getElementById('subscribeBtn'); if(subBtn){ subBtn.addEventListener('click',e=>{e.preventDefault(); const m=document.getElementById('newsletterModal'); if(m) m.style.display='flex';})}
    try{ if(!localStorage.getItem('tfb_sub_seen')){ const m=document.getElementById('newsletterModal'); if(m) m.style.display='flex'; } }catch(e){}
  }


  async function renderResearchDaily(sel){
    const c=document.querySelector(sel);
    const dayKey=(new Date()).toISOString().slice(0,10);
    const cachedKey=localStorage.getItem('tfb_research_day_key');
    if(cachedKey===dayKey && localStorage.getItem('tfb_research_day_html')){
      c.innerHTML=localStorage.getItem('tfb_research_day_html'); return;
    }
    const {wr, week}=await weeklyItems(); // reuse same sources, but craft a daily note
    const todayItems = week.filter(i=> (new Date(i.pub)).toISOString().slice(0,10)===dayKey).slice(0,40);
    const base = todayItems.length? todayItems : week.slice(0,40);
    const {thisWeek, why}=wsjStyleSummary(base);
    const risks = summarize(base.map(i=>i.title).reverse().join(' '),4);
    const sentiment = (function(){
      const pos=['beat','strong','growth','raised','accelerating','expands','cooling inflation','solid'];
      const neg=['miss','weak','slowdown','cut','strike','recall','lawsuit','geopolitical'];
      const txt=base.map(i=>i.title+' '+removeEmDash(strip(i.desc))).join(' ').toLowerCase();
      let s=0; pos.forEach(p=>{if(txt.includes(p))s++}); neg.forEach(n=>{if(txt.includes(n))s--});
      return s>1?'Bullish-ish':(s<-1?'Cautious':'Mixed');
    })();
    const html = '<div class="kicker">Daily research note</div>'+
      '<h2>'+fmtDate(new Date())+'</h2>'+
      '<div class="rule"></div>'+
      '<p><strong>TL;DR:</strong> '+escapeHtml(thisWeek)+'</p>'+
      '<p><strong>Why it matters:</strong> '+escapeHtml(why)+'</p>'+
      '<p><strong>Risks to watch:</strong> '+escapeHtml(risks)+'</p>'+
      '<div class="rule"></div>'+
      '<h3>Today\'s links</h3><ul>'+
      base.slice(0,15).map(i=>'<li><a href="'+i.link+'" target="_blank" rel="noopener">'+escapeHtml(removeEmDash(i.title))+'</a> <span class="small">('+escapeHtml(i.src)+', '+fmtDate(i.pub)+')</span></li>').join('')+
      '</ul>';
    c.innerHTML=html;
    try{
      localStorage.setItem('tfb_research_day_key', dayKey);
      localStorage.setItem('tfb_research_day_html', html);
      // also persist in archive
      const arch = JSON.parse(localStorage.getItem('tfb_research_archive')||'{}');
      arch[dayKey]=html;
      // prune > 120 days for safety
      const cutoff = new Date(); cutoff.setDate(cutoff.getDate()-120);
      for(const k of Object.keys(arch)){
        const dt = new Date(k);
        if(dt<cutoff) delete arch[k];
      }
      localStorage.setItem('tfb_research_archive', JSON.stringify(arch));
    }catch(e){}
  }

  // Expose with desired cadences
  window.renderDailyHeadlines=(sel,limit)=>renderDailyHeadlines(sel,limit); // daily on load
  window.renderWeeklyBlog=(sel)=>renderWeeklyBlog(sel); // weekly on load
  window.renderResearch=(sel)=>renderResearch(sel); // weekly on load
  window.renderResearchDaily=(sel)=>{ const run=()=>renderResearchDaily(sel); run(); setInterval(run, 24*60*60*1000); };
  window.renderWeeklyStocks=(sel)=>renderWeeklyStocks(sel); // weekly on load
  window.renderEarningsCalendar=(sel)=>{ const run=()=>renderEarningsCalendar(sel); run(); setInterval(run, 12*60*60*1000); };
  window.renderEconomicCalendarMonth=(sel)=>{ const run=()=>renderEconomicCalendarMonth(sel); run(); setInterval(run, 12*60*60*1000); };
  window.renderTFBPortfolio=renderTFBPortfolio; // hourly internally
  window.initHeaderBindings=initHeaderBindings;
})();