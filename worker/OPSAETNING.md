# Opsætning af automatisk status

Prototypen henter status via et lille mellemled (en Cloudflare Worker), der holder
17TRACK-nøglen hemmelig. Nøglen må aldrig lægges i dette repository, da det er offentligt.

## 1. Hent en 17TRACK API-nøgle
1. Opret en gratis konto på https://api.17track.net
2. Find din nøgle (Access Key / Security Key) under indstillingerne.
3. Gratis niveau: 100 nye pakkenumre om måneden. Hver pakke tæller én gang,
   uanset hvor tit status hentes.

## 2. Opret mellemleddet i Cloudflare
1. Opret en gratis konto på https://dash.cloudflare.com
2. Vælg **Workers & Pages** → **Create** → **Create Worker**. Kald den fx `pakker-status`, og klik **Deploy**.
3. Klik **Edit code**, slet alt, indsæt indholdet af `worker/worker.js`, og klik **Deploy**.
4. Gå til Workerens **Settings** → **Variables and Secrets** → **Add**:
   - Type: **Secret**, navn: `TRACK17_KEY`, værdi: din 17TRACK-nøgle. Gem.
5. Kopiér Workerens adresse, fx `https://pakker-status.dit-navn.workers.dev`.

Test: åbn adressen i en browser. Den skal vise `"configured":true`.

## 3. Forbind prototypen
Sæt adressen ind i `index.html`:

```js
const TRACK_API='https://pakker-status.dit-navn.workers.dev';
```

## Sikkerhed
- Nøglen ligger kun i Cloudflare som hemmelig variabel.
- Mellemleddet svarer kun på forespørgsler fra `https://mohvila.github.io`.
- Kun pakkenumre sendes videre til 17TRACK. Navne, koder og beskeder bliver på telefonen.
