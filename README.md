# LeVe Coach — Lisäpainoleuanvedon optimointikone

Tuotantolaatuinen lisäpainoleuanvedon voimaohjelmointisovellus yhdelle eliittitason harjoittelijalle. Toimii henkilökohtaisena voimavalmentajana joka ohjaa päivittäistä harjoittelua deterministisesti ja tieteellisesti.

## Ominaisuudet

- **Mesosyklimoottori**: 4 viikon adaptiivinen mesosykli (Adaptaatio → Loading → Overreach → Deload)
- **Vara-järjestelmä (Vx)**: Korvaa RIR:n — etäisyys failureen V0–V5
- **Readiness 2/3-sääntö**: Velocity + HRV + Vara, velocity veto -mekanismilla
- **Recommend()-moottori**: Deterministinen kuormasuositus e1RM:stä taaksepäin laskettuna
- **Tukiliikkeiden progressio**: Automaattinen painoehdotus, stagnaatiotunnistus
- **OVR Velocity -tuki**: Manuaalinen velocity-syöttö readiness-testiin ja työsarjoihin
- **Oura HRV -integraatio**: RMSSD ms → lnRMSSD automaattisesti
- **Cap-only -periaate**: Readiness rajoittaa mutta ei pakota
- **DecisionTrace**: Täysi audit-ketju jokaisesta suosituksesta
- **Offline-first PWA**: Toimii ilman verkkoyhteyttä
- **Dark theme**: Optimoitu salikäyttöön

## Asennus

### GitHub Pages (suositeltu)

1. Fork tai kloonaa repositorio
2. Ota GitHub Pages käyttöön (Settings → Pages → Source: main branch)
3. Avaa `https://<käyttäjänimi>.github.io/leuanveto-valmentaja/`
4. Lisää aloitusnäytölle (PWA)

### Lokaalisti

1. Kloonaa repositorio
2. Palvele tiedostot HTTP-palvelimella (ES modulit vaativat HTTPS/localhost):
   ```
   npx serve .
   ```
   tai
   ```
   python -m http.server 8000
   ```
3. Avaa `http://localhost:8000`

## Tiedostorakenne

```
index.html          # UI + CSS + sovelluksen kuori (ES module imports)
engine.js           # Laskenta: e1RM, baselines, readiness, recommend(), mesosykli
data.js             # IndexedDB, migraatiot, import/export, backup/restore
sw.js               # Service worker (offline-first, cache-first)
test-runner.js      # Selainpohjainen testisarja (?test=1)
manifest.webmanifest
icons/icon-192.png
icons/icon-512.png
README.md
```

## Käyttö

### Aamurutiini (~30 sek)
1. Avaa sovellus → Dashboard näyttää päivän ohjelman
2. Syötä HRV (Oura ms) → Readiness-näkymä
3. Readiness-tila päivittyy automaattisesti

### Salilla (~20 sek setup)
1. Paina "Aloita treeni"
2. Tee readiness-velocity-testi (+40 kg × 2, max intent)
3. Syötä 1. repin mean velocity
4. Päivän ohjelma päivittyy reaaliaikaisesti

### Treenin aikana (~5 sek per setti)
1. Tee setti → napauta toistomäärä (isot painikkeet)
2. Napauta Vara (V0–V5)
3. (Valinnainen) syötä velocity
4. Seuraava sarja ilmestyy automaattisesti

## Urheilijan profiili (oletus)

- **1RM external**: 93 kg (lisäpaino)
- **Kehonpaino**: 91 kg
- **System 1RM**: 184 kg
- **Velocity-laite**: OVR Velocity (LPT/naru)
- **HRV-laite**: Oura-sormus

## Testit

Avaa `?test=1` URL-parametrilla tai Asetukset → Diagnostiikka → "Aja testit".

Golden fixture -testit kattavat:
- Median + MAD -laskenta
- Z-score luokitus (GREEN/YELLOW/RED rajat)
- 2/3-sääntö + velocity veto
- e1RM system ja external
- Cap-only RED/YELLOW
- Oura HRV → lnRMSSD
- Vara-feedback ja trendikorjaus
- Tukiliikkeiden progressiologiikka
- Failure-reaktio
- Paluu tauolta
- Backup roundtrip
- Validaattorit

## Data

- Kaikki data tallennetaan paikallisesti IndexedDB:hen
- Ei lähetä dataa mihinkään
- Export/Import: JSON backup + CSV historiallinen data
- GDPR: "Poista kaikki data" -painike asetuksissa

## Tekniikka

- Vanilla JS, ei npm, ei build-vaihetta
- ES module imports (`<script type="module">`)
- IndexedDB (offline-first)
- Service Worker (cache-first)
- PWA (asennettavissa)
- GitHub Pages -yhteensopiva

## Lisenssi

MIT
