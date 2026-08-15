# coach-judge — atleetin pinnan audit-harness

> **Miksi tämä on olemassa:** 12.–13.8.2026 Akselin yhdeksän kenttähavaintoa tuottivat
> yhdeksän vahvistettua vikaa. Automaattinen koneisto (1024 selaintestiä + engine-pilot +
> wizard-pilot + Stop hook) oli **vihreä koko ajan** eikä löytänyt yhtäkään niistä.
>
> Syy on rakenteellinen: olemassa oleva koneisto mittaa **enginen laskentaa**, ja viat
> asuvat siinä **mitä engine näyttää atleetille**. Kuollut banneri, kenttä `heaviest` joka
> ei ole raskain, `timestamp` joka ei ole suoritusaika, rooli joka tuhoutuu tallennuksessa —
> yksikään ei voi laueta testissä joka vertaa `recommend()`:n paluuarvoa odotettuun lukuun.
>
> Tämä harness ajaa **atleettia**, ei enginea.

## Ero engine-pilotiin (ei duplikaatti)

| | engine-pilot | coach-judge |
|---|---|---|
| Mitä simuloi | enginea | **atleettia** |
| Häiriöt | ei mitään | liikevaihdot · väliin jääneet päivät · tauot · käsimuokkaukset |
| `sessionId` seteissä | `null` (→ kaikki sessio-liitokset testaamatta) | asetettu |
| `completed`-kenttä | puuttuu | tuotantoschema |
| Tuotos | `recommend()`-paluuarvo | **atleetille näkyvä resepti** |
| Rooli | bittitarkka regressio (Stop hook) | audit + detektorit |

**coach-judge EI korvaa engine-pilotia eikä muokkaa sitä** — se importoi siitä vain
read-only-apureita (`engine-bridge`, `athlete-simulator`, `seeded-rng`).

## Käyttö

```bash
# Kausi + häiriöt → prescriptions-<profiili>.json
node tools/coach-judge/run-season.mjs --profile=akseli-elite-streetlifter
node tools/coach-judge/run-season.mjs --profile=all --clean

# Audit: kaikki profiilit, kaikki detektorit
node tools/coach-judge/run-audit.mjs --clean
node tools/coach-judge/run-audit.mjs                 # häiriöillä

# AI-tuomariputki (kokeellinen — ks. varoitus alla)
node tools/coach-judge/make-chunks.mjs --profile=... --chunks=8   # sokkouttaa + paloittelee
node tools/coach-judge/score.mjs --judge=output/judge-flags.json  # pisteyttää mekaanisesti
```

### AI-tuomariputki — TODISTAMATON

`make-chunks.mjs` riisuu `_peili`-kentän (peilin sisäiset vihjeet: todellinen raskain
sarja, banneri-variantti) ja paloittelee reseptit sokkoutetuiksi paloiksi; `score.mjs`
laskee recallin ja väärät positiiviset totuuspohjaa vasten jota tuomari ei nähnyt.

**Ensimmäinen ajo (12.8.2026) hylättiin.** Syy: harness peri engine-pilotin
`?? 100` -fallbackin ja fabrikoi apuliikekuormat, joten tuomari arvioi keksittyä dataa
(36/135 lipusta koski olemattomia 120 kg:n face pulleja). Lisäksi 5/12 agenttia kaatui
ja `run`-leima katosi journaliin, joten häiriö- ja kontrolliajoa ei voinut erottaa.
Fabrikointi on sittemmin korjattu (`slotHasLoad`), **mutta uusinta-ajoa ei ole tehty.**
Putki on siis rakennettu ja syntaksitarkistettu, ei validoitu. Älä siteeraa sen lukuja.

## Detektorit (`lib/detectors.mjs`)

Jokainen vastaa vikaluokkaan joka on **todistettu tuotannossa**, ei kuviteltuun.

| | luokka | alkuperä | tila |
|---|---|---|---|
| D1 | `RESEPTI_EPÄKOHERENTTI` | O3 (15×V4 @ 92,5 kg) | ⚠ kynnys viritettävä |
| D2 | `KUORMA_PUUTTUU` | 30 liikettä ilman kuormaehdotusta | ✓ |
| D3 | `KUORMA_NOLLA` | O9 (MU 0 kg) | ✓ |
| D4 | *lämmittelyhyppy* | O7 (117,5 → 167,5) | ✗ **ei toteutettu** |
| D5 | `VIIKKOHYPPY` | selittämätön kuormamuutos | ⚠ ei tunne deload-siirtymää |
| D6 | `VOLYYMI_IKKUNAN_ULKOPUOLELLA` | taper-romahdus (vk 15 −83 %) | ✓ |
| D7 | `NARRATIIVI_RISTIRIITA` | O2 (tonnaasi vs. kuorma) | ✓ |
| D8 | `BANNERI_RISTIRIIDASSA` | O1 (kuollut banneri) | ✓ |

## ⚠️ ui-mirror.mjs PEILAA, EI KORJAA

`lib/ui-mirror.mjs` reprodusoi index.html:n atleetille näkyvät johdannaiset **täsmälleen
sellaisina kuin ne ovat — bugit mukaan lukien**. Jos peili "korjaisi" bugin, tuomari näkisi
ruudun jota atletti ei koskaan näe ja harness menettäisi todistusarvonsa.

**Ylläpitovelvoite:** kun index.html muuttuu peilatuissa kohdissa
(`computePriorSessionSummary` · "Miksi tämä paino?" -narratiivi · paluuramppi-banneri ·
setsList-rakennus), tämä tiedosto on päivitettävä samassa commitissa. Muuten peili ajautuu
hiljaa. Peilatut lokukset on merkitty funktiokohtaisin kommentein — **älä luota
rivinumeroihin**, hae funktionimellä.

## Tunnetut rajoitukset (rehellisyys ennen täydellisyyttä)

1. **Kuormaton apuliike on kehäpäätelmä.** Dry-run-harness ei koskaan syötä
   apuliikekuormia historiaan → kuormaton slotti pysyy kuormattomana koko kauden.
   D2:n raaka osumamäärä (911) on siksi harhaanjohtava; puolustettava luku on
   **uniikkien liikkeiden määrä joilla ei ole kuormaa koskaan** (30).
   *Perittyä:* engine-pilotin `simulateSet` käyttää fallbackia `?? 100`, joka **keksii
   100 kg** aina kun engine ei resolvoi kuormaa. Tämä harness estää sen eksplisiittisesti
   (`slotHasLoad`) — ilman sitä ensimmäinen tuomariajo arvioi fabrikoitua dataa.
2. **Vain preskriptiopinta.** UI-kerroksen viat (kuollut koodi, löydettävyys, järjestys)
   eivät näy — ne vaativat DOM-tason harnessin (Layer 2, rakentamatta).
3. **Kisapäivä ei ole skenaarioissa.** `full-16w` kattaa päivät 1/2/4/6; kisapäivä
   (dayOfWeek 7) jää simuloimatta.
4. **`type:"peaking"` -mesosyklejä ei rakenneta.** Siksi persistointikontraktin (4.58.0
   OSA 2) kuormavaikutusta ei voi mitata tällä harnessilla.

## Riippuvuudet

Node.js stdlib + natiivi ESM. **Ei npm-paketteja.** (Sama linja kuin engine-pilot.)
