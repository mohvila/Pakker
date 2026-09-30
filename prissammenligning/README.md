# Prissammenligning for Luxury-Outdoor.dk

Hver fredag morgen henter GitHub Actions alle produkter fra luxury-outdoor.dk og slår dem op på nettet.
Rapporten sendes derefter på mail til **info@luxury-outdoor.dk**.

Rapporten er sorteret efter leverandør med **Lechuza** først og de andre leverandører i alfabetisk rækkefølge.
Inden for hver leverandør står de varer, hvor vi er dyrest i forhold til den laveste pris online, øverst.
Mailen indeholder en oversigt og en tabel pr. leverandør. Hele listen er vedhæftet som Excel- og CSV-fil.

## Opsætning (én gang)

Gå til GitHub → repoet → **Settings → Secrets and variables → Actions → New repository secret** og opret:

| Secret | Eksempel | Bemærkning |
|---|---|---|
| `SMTP_HOST` | `smtp.simply.com` / `send.one.com` / `smtp.office365.com` | Mailserveren til info@luxury-outdoor.dk |
| `SMTP_PORT` | `587` | 587 (STARTTLS) eller 465 (SSL) |
| `SMTP_USER` | `info@luxury-outdoor.dk` | |
| `SMTP_PASSWORD` | … | Brug en app-adgangskode, hvis mailen har 2-trinsbekræftelse |
| `MAIL_FROM` | `info@luxury-outdoor.dk` | Valgfri. Standard er `SMTP_USER` |
| `SERPAPI_KEY` | … | Anbefales. Giver Google Shopping-priser fra danske butikker ([serpapi.com](https://serpapi.com)) |

**Priskilder**
- **Google Shopping via SerpApi** (anbefales): viser butik, pris og link for hvert tilbud. Der bruges én søgning pr. produkt pr. uge. Et katalog på fx 800 varer kræver derfor ca. 3.500 søgninger om måneden, og det kræver et betalt abonnement.
- **PriceRunner**: gratis og bruges altid som supplement. Den bygger på PriceRunners uofficielle søgning og kan holde op med at virke uden varsel.

## Kør manuelt / test

Gå til **Actions → Prissammenligning → Run workflow**. Sæt fx "Kun de første N produkter" til `20`, og slå "Send ikke mail" til.
Rapporten kan derefter hentes under kørslen som artefakten *prissammenligning*.

Lokalt:

```sh
pip install openpyxl
DRY_RUN=1 MAX_PRODUCTS=20 SERPAPI_KEY=... python prissammenligning/prissammenligning.py
```

## Sådan virker det

- **Produkter**: Scriptet prøver først Shopify (`/products.json`), derefter WooCommerce (`/wp-json/wc/store/v1/products`) og til sidst `sitemap.xml` med produktdata (JSON-LD) fra hver produktside.
  Leverandøren hentes fra shoppens *vendor/brand*. Mangler den, gættes den ud fra produktnavnet.
- **Match**: Et tilbud tæller kun med, hvis navnet ligner vores. Alle tal i vores navn skal også findes i tilbuddets navn (størrelse eller model, fx *Cubico 40* ≠ *Cubico 30*). Findes der en EAN, søges der på den.
  Luxury-Outdoor's egne tilbud springes over.
- **Status**: *Vi er dyrere*, *Vi er billigst*, *Samme pris*, *Ikke fundet online* eller *Fejl ved opslag*.

Andre indstillinger (miljøvariabler): `FIRST_SUPPLIERS` (kommasepareret, fx `Lechuza,Weber`), `MIN_MATCH` (0–1, standard 0.55),
`REQUEST_DELAY` (sekunder mellem opslag), `MAIL_TO`.
