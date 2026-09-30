# Prissammenligning for Luxury-Outdoor.dk

Hver fredag morgen henter GitHub Actions alle produkter fra luxury-outdoor.dk og slår dem op på nettet.
Resultatet gemmes i mappen **[rapporter/](rapporter/)**:

| Fil | Indhold |
|---|---|
| [`rapporter/seneste.md`](rapporter/seneste.md) | Den nyeste rapport. Vises direkte på GitHub |
| [`rapporter/seneste.xlsx`](rapporter/seneste.xlsx) | Samme rapport som Excel-fil med filtre |
| `rapporter/seneste.csv` / `seneste.html` | Samme rapport som CSV og HTML |
| [`rapporter/arkiv/`](rapporter/arkiv/) | Tidligere uger, navngivet efter dato (fx `2026-10-02.xlsx`) |

Rapporten er sorteret efter leverandør med **Lechuza** først og de andre leverandører i alfabetisk rækkefølge.
Inden for hver leverandør står de varer, hvor vi er dyrest i forhold til den laveste pris online, øverst.

> Repoet er offentligt, så rapporterne kan ses af alle. Gør repoet privat (eller flyt prissammenligningen
> til sit eget private repo), hvis det ikke er ønsket.

## Opsætning (én gang)

Gå til GitHub → repoet → **Settings → Secrets and variables → Actions → New repository secret** og opret:

| Secret | Bemærkning |
|---|---|
| `SERPAPI_KEY` | Anbefales. Giver Google Shopping-priser fra danske butikker ([serpapi.com](https://serpapi.com)) |

Tjek også under **Settings → Actions → General → Workflow permissions**, at "Read and write permissions" er valgt,
så jobbet må gemme rapporten i repoet.

**Priskilder**
- **Google Shopping via SerpApi** (anbefales): viser butik, pris og link for hvert tilbud. Der bruges én søgning pr. produkt pr. uge.
  Et katalog på fx 800 varer kræver derfor ca. 3.500 søgninger om måneden, og det kræver et betalt abonnement.
- **PriceRunner**: gratis og bruges altid som supplement. Den bygger på PriceRunners uofficielle søgning og kan holde op med at virke uden varsel.

**Mail (valgfrit):** Opret secrets `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD` (og evt. `MAIL_FROM`),
hvis rapporten også skal sendes til info@luxury-outdoor.dk. Uden dem gemmes den kun i repoet.

## Kør manuelt / test

Gå til **Actions → Prissammenligning → Run workflow**. Sæt fx "Kun de første N produkter" til `20` for en hurtig test.
Rapporten ligger derefter i `rapporter/seneste.md`.

Lokalt:

```sh
pip install openpyxl
MAX_PRODUCTS=20 SERPAPI_KEY=... python prissammenligning/prissammenligning.py
```

## Sådan virker det

- **Produkter**: Scriptet prøver først Shopify (`/products.json`), derefter WooCommerce (`/wp-json/wc/store/v1/products`) og til sidst `sitemap.xml` med produktdata (JSON-LD) fra hver produktside.
  Leverandøren hentes fra shoppens *vendor/brand*. Mangler den, gættes den ud fra produktnavnet.
- **Kun identiske produkter**: Et tilbud tæller kun med, hvis det er præcis samme vare:
  - samme mærke står i navnet,
  - alle tal i vores navn (størrelse eller model) findes også i tilbuddets navn, fx *Cubico 40* ≠ *Cubico 30*,
  - farven er den samme, hvis begge navne nævner en farve, fx *sort* ≠ *hvid*,
  - navnet ligner vores (mindst 70 %, `MIN_MATCH`).

  Findes der en EAN, søges der på den, og så kræves der mindre lighed i navnet.
  Luxury-Outdoor's egne tilbud springes over.
- **Status**: *Vi er dyrere*, *Vi er billigst*, *Samme pris*, *Ikke fundet online* eller *Fejl ved opslag*.

Andre indstillinger (miljøvariabler): `FIRST_SUPPLIERS` (kommasepareret, fx `Lechuza,Weber`), `MIN_MATCH` (0–1, standard 0.7),
`REQUEST_DELAY` (sekunder mellem opslag), `OUT_DIR` (hvor rapporten gemmes), `MAIL_TO`.
