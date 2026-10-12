# Pakker
Pakke oversigt

**Åbn prototypen:** https://mohvila.github.io/Pakker/

- `apps-script/` – Gmail-script: henter pakker fra stjernemarkerede mails og opdaterer status dagligt. Se [OPSAETNING.md](apps-script/OPSAETNING.md).
- `worker/` – alternativ uden Gmail: Cloudflare-mellemled til 17TRACK. Bruges ikke, når Gmail er forbundet.
- `tools/build-gs.py` – bygger `apps-script/Code.gs`, så scriptet bruger samme udtræk som prototypen.
