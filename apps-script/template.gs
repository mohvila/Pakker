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
//@@PARSER@@
