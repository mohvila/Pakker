# Opsætning: pakker fra Gmail og daglig status

Scriptet kører i din egen Google-konto. Ingen andre får adgang til din mailboks.

**Sådan virker det, når det er sat op**
- Giv en ordre- eller forsendelsesmail **stjerne** i Gmail-appen (eller **flag** i Apple Mail).
- Inden for et kvarter er pakken i Pakkeoverblik. Stjernen fjernes, og mailen får etiketten **Pakker**.
- Hver morgen kl. 7 hentes status hos 17TRACK (kræver en 17TRACK-nøgle, se trin 3).
- **Opdater alle** i prototypen henter nye mails og frisk status med det samme.

## 1. Opret scriptet
1. Gå til https://script.google.com på pc'en, logget ind med din Gmail-konto.
2. Klik **Nyt projekt**, og omdøb det til **Pakker** (klik på "Unavngivet projekt" øverst).
3. Slet alt i filen **Kode.gs**.
4. Åbn https://github.com/mohvila/Pakker/blob/main/apps-script/Code.gs, klik på kopi-knappen
   (**Copy raw file**) øverst til højre over koden, og indsæt det hele i Kode.gs.
5. Gem med **Ctrl+S**.

## 2. Kør opsætningen
1. Vælg funktionen **setup** i rullemenuen ved siden af **Kør**, og klik **Kør**.
2. Klik **Gennemgå tilladelser** og vælg din konto.
3. Google viser "Google har ikke bekræftet denne app". Det er normalt for dit eget script:
   klik **Avanceret** → **Gå til Pakker (usikker)** → **Tillad**.

## 3. Valgfrit: daglig status fra fragtfirmaerne
1. Opret en gratis konto på https://api.17track.net og find din API-nøgle (100 nye pakker om måneden gratis).
2. I scriptet: klik på tandhjulet **Projektindstillinger** til venstre.
3. Under **Scriptegenskaber**: **Tilføj scriptegenskab**, navn `TRACK17_KEY`, værdi = din nøgle. Gem.

Uden nøgle virker import fra mail stadig. Du opdaterer så selv status med knapperne eller **Opdater fra tekst**.

## 4. Udrul som webapp
1. Klik **Implementer** → **Ny implementering**.
2. Klik på tandhjulet ved **Vælg type**, og vælg **Webapp**.
3. **Udfør som:** Mig. **Hvem har adgang:** Alle.
4. Klik **Implementer**, og kopiér **Webapp-URL'en** (slutter på `/exec`).
5. Gå til **Projektindstillinger** → **Scriptegenskaber**, og tilføj `WEBAPP_URL` med den kopierede adresse.

"Alle" betyder, at adressen kan kaldes udefra, men scriptet svarer kun, hvis den hemmelige nøgle er med,
og den nøgle får kun din telefon.

## 5. Forbind telefonen
1. Vælg funktionen **sendConnectLink**, og klik **Kør**.
2. Du får en mail: **Forbind Pakkeoverblik med din Gmail**. Åbn den på din iPhone, og tryk på linket.
3. Prototypen åbner i Safari og skriver "Forbundet med Gmail". Nederst på siden står nu **Forbundet med Gmail**.

## Hvis du retter i scriptet senere
Indsæt den nye kode, gem, og vælg **Implementer** → **Administrer implementeringer** → blyanten → **Version: Ny version** → **Implementer**.
Adressen og forbindelsen på telefonen forbliver den samme.

## Sikkerhed
- Scriptet læser kun mails, du har givet stjerne, og kun de seneste 45 dage.
- Mails uden pakkeoplysninger (fx et nyhedsbrev med stjerne) ignoreres, og stjernen bliver siddende.
- Pakkelisten gemmes i scriptets egenskaber i din Google-konto og på din telefon.
- Kun pakkenumre sendes videre til 17TRACK.
- Fortryd adgangen: https://myaccount.google.com/permissions → Pakker → Fjern adgang.
