/**
 * Pakkeoverblik – Gmail-script
 *
 * Kører i din egen Google-konto. Det gør tre ting:
 *  1. Hvert kvarter: finder mails, du har givet stjerne (flag i Apple Mail), og henter
 *     pakkenummer, fragtfirma, kode osv. ud af dem. Mailen får etiketten "Pakker" og
 *     stjernen fjernes, så du kan se, at den er importeret.
 *  2. Hver morgen: henter status på dine aktive pakker hos 17TRACK (hvis du har en nøgle).
 *  3. Leverer pakkelisten til prototypen via et hemmeligt link.
 *
 * Opsætning: se apps-script/OPSAETNING.md.
 * Denne fil er bygget af tools/build-gs.py – ret i template.gs, ikke i Code.gs.
 */

// ---------- Indstillinger ----------
const SETTINGS = {
  SEARCH: 'is:starred newer_than:45d',   // hvilke mails der hentes
  LABEL: 'Pakker',                       // etiket på importerede mails
  REMOVE_STAR: true,                     // fjern stjernen, når mailen er importeret
  APP_URL: 'https://mohvila.github.io/Pakker/',
  KEEP_DAYS: 60,                         // afhentede pakker glemmes efter så mange dage
  DAILY_HOUR: 7,                         // klokkeslæt for daglig statusopdatering
};

// ---------- Opsætning (kør én gang) ----------
function setup() {
  const props = PropertiesService.getScriptProperties();
  if (!props.getProperty('TOKEN')) props.setProperty('TOKEN', Utilities.getUuid().replace(/-/g, ''));
  ScriptApp.getProjectTriggers().forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('scanMail').timeBased().everyMinutes(15).create();
  ScriptApp.newTrigger('refreshStatus').timeBased().everyDays(1).atHour(SETTINGS.DAILY_HOUR).create();
  GmailApp.getUserLabelByName(SETTINGS.LABEL) || GmailApp.createLabel(SETTINGS.LABEL);
  scanMail();
  Logger.log('Opsætning færdig. Udrul nu scriptet som webapp, og kør derefter sendConnectLink.');
}

// Sender dig en mail med et link, der forbinder prototypen på din telefon med scriptet.
function sendConnectLink() {
  const props = PropertiesService.getScriptProperties();
  const token = props.getProperty('TOKEN');
  if (!token) throw new Error('Kør setup først.');
  let url = props.getProperty('WEBAPP_URL') || (ScriptApp.getService().getUrl() || '');
  if (!/\/exec$/.test(url)) throw new Error('Kunne ikke finde webapp-adressen. Udrul scriptet som webapp, og indsæt adressen (der slutter på /exec) som scriptegenskaben WEBAPP_URL.');
  const link = SETTINGS.APP_URL + '?forbind=' + encodeURIComponent(url + '?token=' + token);
  const me = Session.getActiveUser().getEmail();
  MailApp.sendEmail({
    to: me,
    subject: 'Forbind Pakkeoverblik med din Gmail',
    htmlBody: '<p>Åbn dette link i Safari på din iPhone for at forbinde Pakkeoverblik med din Gmail:</p>' +
      '<p><a href="' + link + '">Forbind Pakkeoverblik</a></p>' +
      '<p>Linket giver adgang til din pakkeliste, så del det ikke med andre.</p>',
  });
  Logger.log('Mail sendt til ' + me);
}

// ---------- Webapp (prototypen henter herfra) ----------
function doGet(e) {
  const props = PropertiesService.getScriptProperties();
  const p = (e && e.parameter) || {};
  if (!p.token || p.token !== props.getProperty('TOKEN')) return out_({ error: 'Ingen adgang' });
  if (p.action === 'refresh') {
    // Manuel "Opdater alle": hent nye mails og frisk status med det samme.
    scanMail();
    refreshStatus();
  }
  const st = load_();
  return out_({ packages: st.packages, lastScan: st.lastScan || 0, lastRefresh: st.lastRefresh || 0, statusEnabled: !!props.getProperty('TRACK17_KEY') });
}

function out_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// ---------- Lager ----------
function load_() {
  const raw = PropertiesService.getScriptProperties().getProperty('STATE');
  try { return raw ? JSON.parse(raw) : { packages: [] }; } catch (e) { return { packages: [] }; }
}
function save_(st) {
  const cutoff = Date.now() - SETTINGS.KEEP_DAYS * 864e5;
  st.packages = st.packages.filter(p => p.status !== 'hentet' || (p.updated || 0) > cutoff).slice(-150);
  PropertiesService.getScriptProperties().setProperty('STATE', JSON.stringify(st));
}

// ---------- 1. Hent pakker fra stjernemarkerede mails ----------
function scanMail() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) return;
  try {
    const st = load_();
    const label = GmailApp.getUserLabelByName(SETTINGS.LABEL) || GmailApp.createLabel(SETTINGS.LABEL);
    const threads = GmailApp.search(SETTINGS.SEARCH, 0, 30);
    let added = 0;
    threads.forEach(th => {
      th.getMessages().filter(m => m.isStarred()).forEach(m => {
        const text = (m.getSubject() + '\n' + m.getPlainBody()).slice(0, 20000);
        const r = parse(text);
        const useful = r.tn || (r.carrier !== 'ukendt' && (r.code || r.place));
        if (!useful) return; // ikke en pakkemail – lad stjernen blive
        const id = 'm' + m.getId();
        let pkg = st.packages.find(x => x.id === id || (r.tn && x.tn === r.tn));
        const now = Date.now();
        if (!pkg) {
          pkg = { id, source: 'mail', added: now, mailDate: m.getDate().getTime(), status: 'paavej' };
          st.packages.push(pkg);
          added++;
        }
        // Udfyld/opdater felter – status flytter kun fremad.
        ['tn', 'code', 'place', 'deadline', 'shop', 'url'].forEach(k => { if (r[k]) pkg[k] = r[k]; });
        if (r.carrier !== 'ukendt') pkg.carrier = r.carrier;
        if (!pkg.carrier) pkg.carrier = 'ukendt';
        if (!pkg.name && r.name) pkg.name = r.name;
        if (RANK[r.status] > RANK[pkg.status]) pkg.status = r.status;
        pkg.updated = now;
        th.addLabel(label);
        if (SETTINGS.REMOVE_STAR) m.unstar();
      });
    });
    st.lastScan = Date.now();
    save_(st);
    Logger.log('Mails gennemgået, ' + added + ' nye pakker.');
  } finally {
    lock.releaseLock();
  }
}

// ---------- 2. Hent status hos 17TRACK ----------
const RANK = { paavej: 0, klar: 1, hentet: 2 };
function statusFromTrack_(s) { return s === 'AvailableForPickup' ? 'klar' : s === 'Delivered' ? 'hentet' : null; }

function refreshStatus() {
  const key = PropertiesService.getScriptProperties().getProperty('TRACK17_KEY');
  if (!key) return;
  const st = load_();
  const active = st.packages.filter(p => p.tn && p.status !== 'hentet');
  if (!active.length) { st.lastRefresh = Date.now(); save_(st); return; }
  const call = (path, numbers) => {
    const res = UrlFetchApp.fetch('https://api.17track.net/track/v2.4/' + path, {
      method: 'post', contentType: 'application/json', muteHttpExceptions: true,
      headers: { '17token': key },
      payload: JSON.stringify(numbers.map(number => ({ number }))),
    });
    try { return JSON.parse(res.getContentText()); } catch (e) { return {}; }
  };
  const now = Date.now();
  for (let i = 0; i < active.length; i += 40) {
    const batch = [...new Set(active.slice(i, i + 40).map(p => p.tn))];
    const info = call('gettrackinfo', batch);
    const found = new Set();
    ((info.data && info.data.accepted) || []).forEach(a => {
      found.add(a.number);
      const ti = a.track_info || {}, ls = ti.latest_status || {}, le = ti.latest_event || {};
      st.packages.filter(p => p.tn === a.number).forEach(p => {
        p.track = { status: ls.status || 'NotFound', event: le.description || '', location: le.location || '', time: le.time_iso || '', checked: now };
        const ns = statusFromTrack_(ls.status);
        if (ns && RANK[ns] > RANK[p.status]) { p.status = ns; p.updated = now; }
      });
    });
    const unknown = batch.filter(n => !found.has(n));
    if (unknown.length) {
      call('register', unknown);
      st.packages.filter(p => unknown.indexOf(p.tn) >= 0).forEach(p => {
        p.track = { status: 'Registered', event: '', location: '', time: '', checked: now };
      });
    }
  }
  st.lastRefresh = now;
  save_(st);
}

// ---------- Apps Script har ikke URL-klassen, som parseren bruger ----------
if (typeof URL === 'undefined') {
  globalThis.URL = function (u) {
    const m = String(u).match(/^https?:\/\/[^/?#]+([^?#]*)(\?[^#]*)?/i);
    if (!m) throw new Error('Ugyldig URL');
    this.pathname = m[1] || '/';
    const q = {};
    (m[2] || '').replace(/^\?/, '').split('&').forEach(kv => {
      if (!kv) return;
      const i = kv.indexOf('=');
      const k = decodeURIComponent((i < 0 ? kv : kv.slice(0, i)).replace(/\+/g, ' '));
      const v = i < 0 ? '' : decodeURIComponent(kv.slice(i + 1).replace(/\+/g, ' '));
      if (!(k in q)) q[k] = v;
    });
    this.searchParams = { get: k => (k in q ? q[k] : null) };
  };
}

// ---------- Udtræk (samme kode som i prototypen) ----------
const CARRIERS={
  postnord:{name:'PostNord',kw:/postnord|post ?danmark|pakkeboks|døgnpost/i,dom:/postnord\./i,url:n=>'https://tracking.postnord.com/dk/?id='+encodeURIComponent(n)},
  gls:{name:'GLS',kw:/\bgls\b/i,dom:/gls-group\.|gls\.dk/i,url:n=>'https://gls-group.com/DK/da/find-pakke?match='+encodeURIComponent(n)},
  dao:{name:'DAO',kw:/\bdao\b/i,dom:/dao\.as/i,url:n=>'https://www.dao.as/privat/find-din-pakke?stregkode='+encodeURIComponent(n)},
  bring:{name:'Bring',kw:/\bbring\b/i,dom:/bring\.(dk|com|no|se)/i,url:n=>'https://tracking.bring.com/tracking/'+encodeURIComponent(n)},
  budbee:{name:'Budbee',kw:/budbee/i,dom:/budbee\./i,url:null},
  instabox:{name:'Instabox',kw:/instabox/i,dom:/instabox\./i,url:null},
  ukendt:{name:'Ukendt fragtfirma',kw:null,dom:null,url:null}
};
const MONTHS=['januar','februar','marts','april','maj','juni','juli','august','september','oktober','november','december'];
let packages=load(), tab='paavej', editingId=null, pendingUrl=null, targetId=null;

function load(){try{const v=localStorage.getItem(KEY);return v?JSON.parse(v):[]}catch(e){return[]}}
function save(){try{localStorage.setItem(KEY,JSON.stringify(packages))}catch(e){toast('Kunne ikke gemme i browseren')}}
const $=id=>document.getElementById(id);
function esc(s){return String(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function toast(t){const el=$('toast');el.textContent=t;el.classList.add('show');clearTimeout(toast.t);toast.t=setTimeout(()=>el.classList.remove('show'),1800)}

/* ---------- Udtræk ---------- */
function parse(text){
  const r={name:'',carrier:'ukendt',tn:'',shop:'',place:'',code:'',deadline:'',status:'paavej',url:''};
  const urls=text.match(/https?:\/\/[^\s<>"')]+/gi)||[];
  // Fragtfirma: domæner vejer tungest, derefter nøgleord
  for(const u of urls){for(const k in CARRIERS){const c=CARRIERS[k];if(c.dom&&c.dom.test(u)){r.carrier=k;r.url=u;break}}if(r.carrier!=='ukendt')break}
  if(r.carrier==='ukendt'){for(const k in CARRIERS){const c=CARRIERS[k];if(c.kw&&c.kw.test(text)){r.carrier=k;break}}}
  // Trackingnummer fra links
  for(const u of urls){
    try{const p=new URL(u);
      for(const key of ['id','match','stregkode','parcelNumber','parcelnumber','trackingNumber','trackingnumber','tracking','shipmentId','consignmentId','q','t']){
        const v=p.searchParams.get(key);if(v&&/\d/.test(v)&&/^[A-Za-z0-9-]{6,35}$/.test(v)){r.tn=v.replace(/-/g,'').toUpperCase();break}}
      if(!r.tn&&(CARRIERS[r.carrier].dom||{test:()=>false}).test(u)){
        const seg=p.pathname.split('/').filter(Boolean).pop()||'';
        if(/\d/.test(seg)&&/^[A-Za-z0-9-]{6,35}$/.test(seg))r.tn=seg.replace(/-/g,'').toUpperCase()}
    }catch(e){}
    if(r.tn)break}
  // Trackingnummer ved nøgleord
  if(!r.tn){
    // Find nøgleordet, spring fyldord som "er", "nr." og ":" over, og tag det første ord med tal i.
    const kw=/(tracking[\s-]*(?:nummer|nr\.?|number|no\.?|id|kode)?|track\s*(?:&|and|og)?\s*trace(?:[\s-]*nummer)?|sporings[\s-]*(?:nummer|nr\.?|kode)|forsendelses[\s-]*(?:nummer|nr\.?|id)|pakke[\s-]*(?:nummer|nr\.?|id)|shipment\s*(?:number|id)|parcel\s*(?:number|id)|stregkode|kolli[\s-]*(?:nummer|nr\.?|id))/ig;
    let k;
    while(!r.tn&&(k=kw.exec(text))){
      const after=text.slice(k.index+k[0].length,k.index+k[0].length+80).split('\n')[0];
      const toks=after.split(/\s+/).map(t=>t.replace(/^[:#(\[]+|[.,;:)\]!]+$/g,'')).filter(Boolean);
      let i=0;
      while(i<toks.length&&i<4&&!/\d/.test(toks[i]))i++;
      if(i<toks.length&&/\d/.test(toks[i])&&/^[A-Za-z0-9-]+$/.test(toks[i])){
        let v=toks[i];
        // Tal skrevet i grupper, fx "0037 0712 3456"
        for(let j=i+1;j<toks.length&&/^\d+$/.test(v.replace(/-/g,''))&&/^\d{3,}$/.test(toks[j]);j++)v+=toks[j];
        v=v.replace(/-/g,'').toUpperCase();
        if(v.length>=6&&v.length<=35)r.tn=v;
      }
    }
  }
  // Trackingnummer ud fra kendte formater
  if(!r.tn){const m=text.match(/\b[A-Z]{2}\d{9}[A-Z]{2}\b/)||text.match(/\b00\d{18}\b/)||text.match(/\b\d{11,20}\b/);if(m)r.tn=m[0]}
  // Afhentningskode
  const code=text.match(/(bekræftelseskode|verifikationskode|sikkerhedskode|afhentningskode|udleveringskode|pinkode|pin-kode|pin|kode|code)\s*(?:er|:|-)?\s*[:\-]?\s*(\d{3,8})\b/i);
  if(code&&code[2]!==r.tn)r.code=code[2];
  // Frist
  r.deadline=findDate(text);
  // Afhentningssted
  const placeRx=/(pakkeshop|pakkeboks|afhentningssted|udleveringssted|posthus|døgnpost|parcel\s?locker|netto|føtex|rema|coop|meny|spar\b|circle ?k|q8|7-eleven|shell|kvickly|superbrugsen|dagli.?brugsen|lidl|bilka|min købmand)/i;
  const lines=text.split(/\n|(?<=[.!?])\s+/);
  for(const l of lines){if(placeRx.test(l)){
    let s=l.replace(/https?:\S+/g,'').trim();
    const lab=s.match(/(?:afhentningssted|udleveringssted|pakkeshop|pakkeboks)\s*:\s*(.+)/i);
    const after=s.match(/(?:pakkeshop(?:pen)?|pakkeboks(?:en)?|udleveringssted(?:et)?|posthus(?:et)?)\s+(?:hos\s+|i\s+|ved\s+|på\s+)?([A-ZÆØÅ0-9][^\n]*)/);
    if(lab)s=lab[1];else if(after)s=after[1];else{const i=s.search(/\b(i|hos|ved)\s+(?=[A-ZÆØÅ0-9])/);if(i>=0)s=s.slice(i).replace(/^(i|hos|ved)\s+/,'')}
    s=s.replace(/\s*(\.|,)?\s*(kode|hentes|senest|frist|tracking).*$/i,'').replace(/[.,;:]+$/,'').trim();
    if(s.length>2){r.place=s.slice(0,80);break}}}
  // Butik
  const shop=text.match(/(?:ordre|bestilling|køb|pakke|forsendelse|levering)\s+(?:fra|hos)\s+([A-ZÆØÅ0-9][\wÆØÅæøå&.\-]*(?:\s+[A-ZÆØÅ][\wÆØÅæøå&.\-]*){0,2})/);
  if(shop&&!/postnord|gls|dao|bring|budbee|instabox/i.test(shop[1]))r.shop=shop[1].replace(/[.,]$/,'');
  if(r.shop)r.name='Pakke fra '+r.shop;
  // Status
  // "Leveret til pakkeshop" betyder klar, ikke afhentet. Afhentet vinder, hvis begge dele står i teksten (fx en hel trackinghistorik).
  const toShop=/(leveret|afleveret|ankommet) til (din |en |nærmeste )?(pakkeshop|pakkeboks|udleveringssted|posthus|afhentningssted|pakkeautomat)/gi;
  const rest=text.replace(toShop,'');
  if(/er (blevet )?(leveret|udleveret|afhentet)|udleveret til|afhentet af|pakken er afhentet|leveret til (dig|modtager|adressen|døren)|afleveret ved|\bdelivered\b|picked up|collected/i.test(rest))r.status='hentet';
  else if(toShop.test(text)||/klar til afhentning|kan (nu )?(af)?hentes|ligger klar|klar til at blive hentet|er ankommet til (din |pakke)|er klar i|ready for pick ?up|available for pick ?up|awaiting collection/i.test(text))r.status='klar';
  if(r.place&&r.status==='paavej'&&(r.code||r.deadline))r.status='klar';
  return r;
}
function findDate(text){
  const now=new Date();
  const ctx='(?:senest|inden|før|frist|til og med|t\\.o\\.m\\.?|indtil|hentes)';
  let m=text.match(new RegExp(ctx+'[^\\d\\n]{0,25}(\\d{1,2})[./-](\\d{1,2})(?:[./-](\\d{2,4}))?','i'));
  let d,mo,y;
  if(m){d=+m[1];mo=+m[2];y=m[3]?+m[3]:null}
  else{m=text.match(new RegExp(ctx+'[^\\d\\n]{0,25}(\\d{1,2})\\.?\\s*('+MONTHS.join('|')+'|'+MONTHS.map(x=>x.slice(0,3)).join('|')+')\\.?(?:\\s+(\\d{4}))?','i'));
    if(m){d=+m[1];mo=MONTHS.findIndex(x=>x.startsWith(m[2].toLowerCase().slice(0,3)))+1;y=m[3]?+m[3]:null}}
  if(!m||!d||!mo||mo>12||d>31)return'';
  if(y&&y<100)y+=2000;
  if(!y){y=now.getFullYear();const cand=new Date(y,mo-1,d);if(cand<new Date(now.getTime()-60*864e5))y++}
  return y+'-'+String(mo).padStart(2,'0')+'-'+String(d).padStart(2,'0');
}

