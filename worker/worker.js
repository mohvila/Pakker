// Pakkeoverblik – mellemled til 17TRACK (Cloudflare Worker)
//
// Holder API-nøglen hemmelig og henter status på pakkenumre for prototypen.
// Opsætning: se worker/OPSAETNING.md
//   Hemmelig variabel:  TRACK17_KEY     = din 17TRACK API-nøgle
//   Valgfri variabel:   ALLOWED_ORIGIN  = https://mohvila.github.io (standard)

const API = 'https://api.17track.net/track/v2.4/';
const MAX = 40; // 17TRACK tager højst 40 numre pr. kald

export default {
  async fetch(req, env) {
    const allowed = env.ALLOWED_ORIGIN || 'https://mohvila.github.io';
    const origin = req.headers.get('Origin') || '';
    const cors = {
      'Access-Control-Allow-Origin': allowed,
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Vary': 'Origin',
    };
    const json = (data, status = 200) =>
      new Response(JSON.stringify(data), { status, headers: { ...cors, 'Content-Type': 'application/json; charset=utf-8' } });

    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (req.method === 'GET') return json({ ok: true, service: 'pakker-status', configured: !!env.TRACK17_KEY });
    if (req.method !== 'POST') return json({ error: 'Brug POST' }, 405);
    // Kun prototypens egen side må bruge mellemleddet (beskytter din gratis kvote).
    if (origin !== allowed) return json({ error: 'Ikke tilladt fra denne side' }, 403);
    if (!env.TRACK17_KEY) return json({ error: 'TRACK17_KEY mangler i Cloudflare' }, 500);

    let body;
    try { body = await req.json(); } catch { return json({ error: 'Ugyldig forespørgsel' }, 400); }
    const numbers = [...new Set((body.numbers || [])
      .map(n => String(n).replace(/[\s-]/g, '').toUpperCase())
      .filter(n => /^[A-Z0-9]{5,50}$/.test(n)))].slice(0, MAX);
    if (!numbers.length) return json({ results: [] });

    const call = async (path, payload) => {
      const r = await fetch(API + path, {
        method: 'POST',
        headers: { '17token': env.TRACK17_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      return r.json();
    };

    try {
      const info = await call('gettrackinfo', numbers.map(number => ({ number })));
      if (info.code !== 0 && !info.data) return json({ error: '17TRACK svarede med fejl ' + info.code }, 502);
      const results = [];
      const found = new Set();
      for (const a of info.data?.accepted || []) {
        const ti = a.track_info || {};
        const ls = ti.latest_status || {};
        const le = ti.latest_event || {};
        found.add(a.number);
        results.push({
          number: a.number,
          status: ls.status || 'NotFound',
          subStatus: ls.sub_status || '',
          event: le.description || '',
          location: le.location || '',
          time: le.time_iso || le.time_utc || '',
        });
      }

      // Numre som 17TRACK ikke kender endnu, tilmeldes (koster 1 af de gratis tilmeldinger pr. nummer).
      const unknown = numbers.filter(n => !found.has(n));
      if (unknown.length) {
        const reg = await call('register', unknown.map(number => ({ number })));
        for (const a of reg.data?.accepted || []) results.push({ number: a.number, status: 'Registered' });
        for (const r of reg.data?.rejected || []) {
          // "Allerede tilmeldt" betyder bare, at status ikke er klar endnu.
          const already = /already|registered/i.test(r.error?.message || '');
          results.push({ number: r.number, status: already ? 'Registered' : 'Error', error: already ? '' : (r.error?.message || 'Afvist') });
        }
      }
      return json({ results });
    } catch (e) {
      return json({ error: 'Kunne ikke kontakte 17TRACK' }, 502);
    }
  },
};
