# docs/backlog.md — havaintojen kerääntymispaikka

Tähän kirjataan tunnistetut havainnot jotka EIVÄT kuulu aktiiviseen
HANDOFF.md-toimeksiantoon. Tämä on pre-handoff-vaihe: havainnot kerätään,
priorisoidaan, ja sopivat siirretään omiksi handoffeiksi.

## Formaatti

Jokainen havainto:

- **OBS-NNN** · pvm · lähde · status
- Kuvaus (konkreettinen, toistettavissa)
- Mahd. aritmetiikka tai screenshot-viite
- Liittyy-kohdat (sukulaisuus muihin OBS:iin tai handoff-suunnitelmiin)

Status-elinkaari: `AVOIN` → `PRIORISOITU (H-xxx)` → `KÄSITELTY (commit-hash)`.

## Prosessi

1. Lisää OBS heti kun havaitset — Windows-natiivi-editointi sallittu, ei
   vaadi Code-sessiota tai Cowork-tukea.
2. Käsittele kvartaaleittain tai handoff-välissä — älä yritä korjata
   suoraan backlogista, siirry handoffin kautta.
3. Sukulaisia OBS:iä ryhmittele yhteisellä juurisyy-merkinnällä.

## Havainnot

### OBS-001 · 2026-05-27 · repon empiirinen recon (H-006-prelim, korjattu) · PRIORISOITU (H-006a)

**Velocity-data tallentuu sets-storeen, mutta ei virtaa analyysi-tasolle erinomaisella tasolla**

Vahvistukset:

1. Velocity-data tallentuu **luotettavasti sets-storeen neljään kenttään**
   (velocityMean, velocityPeak, velocityRep1, velocityLossPercent) + array
   (mvReps[]) sekä RTF-testissä (index.html:2075–2078), primer-tallennuksessa
   (index.html:13998–14001), set-editissä (index.html:9132), että normaaleissa
   work-setteissä treenin tallennuksessa (index.html:14228–14253). Atletti
   pystyy kirjaamaan Enode-mittausarvot luotettavasti.
2. Engine.js velocity-funktiot lukevat dataa **neljästä eri kentästä**:
   `velocityReadiness` (primer-readiness) → `velocityRep1`;
   `computeLoadVelocityProfile` (LV-regressio) → `velocityMean`;
   `computeRtfVelocityModel` (RTF-malli) → `mvReps[]`;
   `predictVxFromVelocity` (Vx-ennuste) → `mvReps[]`;
   **`generateBlockTuningPackage` (AI-Block-Tuning-syöte) → `velocityMs`.**
3. **Kriittinen rakenteellinen aukko:** `velocityMs`-kenttää LUETAAN
   engine.js:n kahdessa paikassa (6498 + 6809, molemmat
   `generateBlockTuningPackage`-funktion variantteja), mutta sitä EI
   KIRJOITETA missään saveSet-polussa. AI-Block-Tuning-syöte näkee
   jokaisen setin `velocity: undefined`.
4. Akselin kanoninen vahvistus 2026-05-27 Cowork-sessiossa: kirjaaminen
   toimii, hyödyntäminen ei. "Ei primer-sarjoja, eikä sarjapainojen
   aikaisia velocity-dataa" erinomaisella tasolla.
5. `available/unavailable`-status määritelty engine.js:6371 mutta ei
   emittoida (B3 K3 -kommentti engine.js:6543: "per-mittari
   tyhjä-status-encoding. unavailable EI emittoidu nyt").
6. RTF-malli (computeRtfVelocityModel, engine.js:2582) suodattaa
   `setRole === 'rtf_test'`. **Verifioitu pilot-tracesta 2026-05-27:**
   RTF_MODEL_STATUS Akselin profiililla = `no-data, n=0` kaikissa
   esiintymissä → setRole-filtterin laajennus välttämätön
   (`Array.isArray(s.mvReps) && s.mvReps.length >= RTF_MIN_REPS_PER_SET`
   pelkkä mvReps[]-pohjainen).

Päätelmä: Ongelma EI ole datan kirjaamisessa eikä ulkoisessa
API-puutteessa. Ongelma on **sisäisessä datavirran katkoksessa** —
kirjattu data on sets-storessa mutta ei kanavoidu kaikkiin
engine-funktioihin (eritoten AI-Block-Tuning-syötteeseen, joka lukee
kuollutta kenttää). Lisäksi available/unavailable-status, joka voisi
tehdä rikkimenneisyyden läpinäkyväksi atletille, ei aktivoidu.

Aukot jotka H-006a ratkaisee:
- velocityMs-aukon korjaus engine.js:ssä (fallback-luku, kapea scope)
- AI-Block-Tuning-syötteen täysrikastus (4 uutta kenttää actual-objektiin)
- RTF-mallin setRole-filtterin laajennus (engine.js:2589)
- available/unavailable-status aktivointi engineen + UI-indikaattori
  Asetukset-välilehdellä

Vaikutus: AI-Block-Tuning vk 4/8/12 deload-analyysi alkaa hyödyntää
velocity-dataa kehityksen/taantumisen tunnistuksessa → H-006a:n
mullistava taso saavutetaan. H-006b (primer-mekanismi +
sys-1RM-päivitys) on erillinen jatkohandoff.

Liittyy: HANDOFF_H-001.md Q7 (kanoninen atletti-vastaus, kirjaaminen
toimii), ROADMAP §17 (H-006a on osa Lähde 2:n data-flow-aktivointia),
H-006b (primer-mekanismi, erillinen). EI liity OBS-002…OBS-006:een
(eri juurisyy: dataketju vs slot-resolveri).

### OBS-002 · 2026-05-26 · live-treeni + backfill + etusivu + sarjahistoria · AVOIN

**Back-off-kuorma > pääsarja — liike-riippumaton resolver-virhe**

Vahvistukset:

1. Takakyykky live-treeni 2026-05-26: pääsarjat 4×4×150 kg → back-off
   157.5 kg ehdotettu (5 % yli pääsarjan).
2. Lisäpainoleuanveto backfill 2026-05-25 (Kilpaveto leveä vastaote):
   back-off 65 kg lisäpainoa raportoitu "isompi kuin pääsarjat".
3. Etusivu treenin jälkeen 2026-05-26: pääsarja +157.5, back-off +166
   (5.4 % yli).
4. Käyttäjän manuaalinen kiertotie sarjahistoriassa: Akseli kirjasi
   2× 130 kg × 5 V3 vaikka sovellus ehdotti 157.5 kg → vahva todiste
   aidosta tuotantokäytön ongelmasta.

Päätelmä: vika on slot-resolverissa, ei liike-konfiguraatiossa. Toistuu
kaikilla back-off-osiollisilla liikkeillä (kyykky, lisäpainoleuanveto,
todennäköisesti myös lisäpainodippi).

Vaikutus: vammariski jos käyttäjä ei korjaa käsin.

Liittyy: OBS-004, OBS-005, OBS-006 (yhteinen sparring-juurisyy-teesi alla).
Pohjapuhtaus-arc (H-001/002/003) EI koskettanut runtime-resolveria —
todennäköisesti edelleen voimassa post-arc.

### OBS-003 · 2026-05-26 · etusivu treenin jälkeen · OSITTAIN RATKAISTU

**Etusivu ei näytä toteutuneita treenin jälkeen**

- Tehty: kyykky 4×4×150 kg + back-off
- Etusivu treenin jälkeen: pääsarja "+157.5 kg" (prescriptio, ei 150 kg
  toteutunut)
- Toteutuneet löytyvät: 💪 Liikkeet-välilehti → liike-yksityiskohtanäkymä

Status: OSITTAIN RATKAISTU (toteutuneet ovat saatavilla muualla, mutta
UX-puute jää: etusivun pitäisi vähintään selvästi merkitä "prescriptio"
vs "toteutunut" treenin jälkeen).

Mahdollinen tuleva handoff-suunta: etusivun post-workout view enhancement.

### OBS-004 · 2026-05-26 · etusivu + Asetukset · AVOIN

**Otsikon prosentti ei matchaa kuormiin**

- Otsikko: "Kyykky 4×4 @75%"
- Pääsarja: +157.5 kg
- Aritmetiikka: K=185 vahvistettu Asetuksista → 75 % × 185 = 138.75 kg
- Todellinen: 157.5 / 185 = 85.1 % × 185
- Resolveri laskee prescriptiosta väärän prosentin, otsikko näyttää eri

Liittyy: OBS-002 (sama slot-resolveri-juurisyy?).

### OBS-005 · 2026-05-26 · Liikkeet-näkymä sarjahistoria · AVOIN-VERIFIOIMATON

**e1RM-kaavan rekonstruktio — V × 1 liike-riippumaton**

Sovelluksen kaava: `e1RM = w × (1 + (reps + V × 1) / 30)` — Epley-tyyppinen,
V suoraan plussattuna reps:iin (kerroin V × 1).

Verifioitu sekä takakyykylle että lisäpainoleuanvedolle (sparringin
taulukko 12 sarjaesimerkkiä, kaikki match).

Inkonsistenssi-kohdat:

- Akselin Excel-calibrator (sparringin maininta, **EI Cowork-verifioitu**):
  `external_load = e1RM × (1 − (reps + V × 0.75) / 30) − BW` → V-kerroin
  0.75 vs sovelluksen 1.
- Aiempi muistio mainitsee "Epley-Vara / Brzycki / conservative"
  -kolmitasokaavan lisäpainoleuanvedolle — sparringin verifiointi:
  EI VASTAA sovellusta.

Vaikutus: prescriptio-paino jota sovellus ehdottaa voi olla systemaattisesti
eri kuin Akselin Excel-calibratorista odottaisi.

Status: AVOIN-VERIFIOIMATON koska Cowork ei voi vahvistaa Excel-calibratorin
sisältöä repon koodista. Sparringin verifiointi sovelluksen V × 1 -kaavasta
vahvistettu, mutta lähteen yhdenvertaisuus calibratorin kanssa vaatii
Akselilta lisätietoa.

### OBS-006 · 2026-05-26 · Liikkeet-näkymä sarjahistoria · AVOIN

**Lisäpainoleuanvedon e1RM näyttö = system load (ei lisäpaino-puhdas)**

- Sovellus näyttää e1RM = 181.3 kg
- Todellisuudessa: 181.3 = 89 BW + 92.3 lisäpaino-puhdas
- Käyttäjälle harhaanjohtava: voi tulkita "lisäpaino-e1RM = 181.3" (absurdi)
- Akselin kisa-PR: 94 kg lisäpainoa (lisäpaino-puhdas)
- Asetusten kalibrointi L = 85 kg (lisäpaino-puhdas)
- Asetukset (L=85) / sarjahistoria (system 181.3) / prescriptio — 3 eri
  referenssipistettä samassa liikkeessä

Liittyy: OBS-002, OBS-004 (yhteinen yksikkö-/referenssi-yhtenäisyys
juurisyy).

## Sparring-juurisyy-teesi (Cowork:n havainto 2026-05-27)

**TEESI:** OBS-002, OBS-004, OBS-005, OBS-006 voivat juontaa juurensa
samasta rakenteellisesta ongelmasta: slot-resolverin yksikkö- ja
referenssi-yhtenäisyys on rikki.

**Sparringin synteesi:**

- Asetukset: L=85 kg lisäpaino, K=185 kg tanko (eri yksiköt eri liikkeille)
- Sarjahistoria: paino-sarake lisäpainoleuanvedolle = lisäpaino (50 kg),
  e1RM = system load (181.3 kg) — eri yksiköt samassa rivissä
- Prescriptio: ehdottaa "+157.5 kg lisäpainoa" — mistä laskettu, ei selvää
- Calibrator (Excel, sparringin maininta): käyttää eri V-kerrointa kuin
  sovellus

**Pohjapuhtaus-arc:n vaikutus:** H-001/002/003 korjasi AI-syötteen
note-tason kohinaa (Option X: refScale + nominalLoadPct slot-metadata),
mutta EI runtime-resolverin laskentapolkua. OBS-002:n bug (käyttäjä näkee
157.5 kg back-off-arvona vaikka pitäisi olla < 150 kg) on todennäköisesti
edelleen voimassa post-arc.

**Suunniteltu jatkohandoff (H-007+):** slot-resolverin
yksikkö-/referenssi-yhtenäistys.

**Acceptance-kriteeri-luonnos:**

1. Back-off-kuorma < pääsarja-kuorma KAIKILLA back-off-osiollisilla
   liikkeillä, kaikissa skenaarioissa.
2. Otsikon @X% ja prescription-kuorman prosentti ovat yhteneväisiä
   K (tai L) -arvosta laskettuna.
3. Yksikkö-merkintä selvä eri näkymissä (asetukset, sarjahistoria,
   prescriptio): lisäpaino vs system load vs tangon kg erotettu
   käyttäjälle.

---

## OBS-003 — H-008-löydökset (kirjattu 2026-05-29, A2-suunta lukittu)

**Lähde:** H-008 A1/A2 -diagnostiikka (MU +82 kg -bugi). A2-juurisyy
(getStreetliftingPrimaryMovement ↔ engine getTodayPlan -eriparisuus)
korjattu commitissa `110a63d`. Seuraavat jäävät erillisiin handoffeihin.

**A1b — Paused squat +102 kg (P2 / H-009):**
ERI juuri kuin MU +82. Paused squat (LA-secondary) resolvoituu cross-ref
-reitillä: `loadPctReferenceMovementName="Takakyykky"`, suggestedLoadKg=102.5
(= näytetty +102 = seed-arvo). Akselin Takakyykky-e1RM ~177 kg → cross-ref
× loadPct (0.55–0.60) tuottaa ~102. EI primaryMovementId-mismatch (eri
mekanismi kuin A2). Tarkista: onko +102 oikea (seed) vai pitäisikö
cross-ref-laskenta tuottaa eri arvo. Vahvistettava Akselin atletti-
realismilla (102 kg paused squat 3×5 V3 vk5 — uskottava vai liian raskas?).
**EI korjattu H-008:ssa** (HANDOFF §3 scope-aita: eri juuri → P2/H-009).

**Q3 — Muut päivä-resoluution mismatchit (KATETTU A2:ssa):**
A1-dump paljasti että KAIKKI ei-eksakti-päivät kärsivät samasta
eriparisuudesta (esim. ke vk5: getSL→Takakyykky, rec→Lisäpainodippi).
A2-korjaus (getStreetliftingPrimaryMovement → getTodayPlan) kattaa kaikki
ei-eksakti-päivät, ei vain MU-päiviä → Q3 ratkaistu samalla korjauksella.
Ei jäljellä olevia päivä-resoluution mismatcheja.

**H-009 / P1 — Load-coherence -auditkanava (erillinen handoff):**
Koneellinen detektori bugiluokalle "ankkuroitu liike näyttää perittyä,
fyysisesti epäuskottavaa kuormaa" (target/seed-ratio, liiketyyppi+cfg-
ankkuroidut suhteelliset rajat, EI absoluuttinen nanny-clamp). H-008
korjasi A2-juuren; H-009 lisää koneellisen havaitsemisen joka olisi
napannut tämän bugin automaattisesti (pilot-sanity-varoitus "Muscle-up:
target 73.5 / seed 2.5 = 29.4×" oli jo signaali — formalisoi audit-flagiksi).

---

## OBS-004 — H-009/P1c: identity-gaten elävöinti + harness-uskollisuus (kirjattu 2026-05-29)

**Lähde:** H-009/P1a (commit `a12e766`) toteutti identity-coherence-detektorin
FUNKTIONA (`detectPrimaryMovementIdentityMismatch`, engine.js) + synteettisen
test-lukon. Polku 1 (Akseli ratifioinut): EI audit-engine-gatea, koska
ajonaikainen kvantifiointi paljasti A4-esteen. P1c elävöittää gaten.

**P1c-työlista (3 kohtaa, ettei löydös katoa):**

1. **scenario-runner buildCtx -fideliteettiaukko.** `tools/engine-pilot/lib/
   scenario-runner.mjs` buildCtx (rivit ~99-123) EI välitä päiväkohtaista
   primaryMovementId:tä — destrukturointi ohittaa parametrin, joten rivi ~120
   käyttää AINA `movementCatalog[0]?.movementId` (= Lisäpainoleuanveto, vk1d1
   ensimmäinen primary) koko 16 vk:n ajan. Tämä on SAMA eriparisuus-luokka kuin
   H-008 tuotannossa (pmid ≠ päiväkohtainen primary), mutta harness-puolella.
   Korjaus: buildCtx johtaa pmid:n dayPlanin primary-slotista (getTodayPlan-
   pohjaisesti), kuten tuotanto H-008-korjauksen jälkeen.

2. **Identity-funktion johdotus audit-engine-gateen.** Kun (1) on korjattu →
   pilot heijastaa tuotannon pmid-resoluutiota → `detectPrimaryMovementIdentity-
   Mismatch` voidaan johdottaa audit-engine.mjs:ään ERROR/gate-tasolla (Cowork-
   alkuperäissuositus). Vaatii pmid:n + näytetyn slot-liikkeen samaan trace-
   pisteeseen (trace-capture.mjs input EI nykyään kaappaa primaryMovementId:tä
   → lisättävä).

3. **Uusi pilot-baseline (72 solua muuttuu, TARKOITETTU).** Kohdan (1) korjaus
   muuttaa 72 ei-leuanveto-primary-solun kuormat (e1RM lasketaan oikeasta
   liikkeestä, ei kiinteästä Lisäpainoleuanvedosta): Takakyykky 15, Lisäpainodippi
   28, MU-eksentrinen 10, MU 19. Tämä RIKKOO nykyisen "64/64 bittitarkka" -
   baselinen → vaatii uuden baseline-ratifioinnin (kuormat + audit-flag-määrä).
   Tämä on tarkoitettu (korjaa harness-bugin), ei regressio.

**Riippuvuusjärjestys:** (1) → (3) → (2). Harness-fideliteetti ensin, sitten
baseline-ratifiointi, sitten gate-elävöinti. P1c = "elävä gate + harness-
uskollisuus".

**A2 (magnitude-plausibility) — jätetty P1a:sta pois:** A1 identity kattaa
H-008-luokan tuning-vapaasti. Jos myöhemmin halutaan magnitude-WARN (esim.
target/seed-ratio), se on erillinen viritettävä lisä — arvioidaan P1c:n
yhteydessä, ei pakollinen.

---

## OBS-020 — Dippi-profiili-fideliteetti (kirjattu 2026-05-29, Akselin havainto H-010 A3:sta)

**Lähde:** H-010 A3 -baseline-diff. Pilot-fideliteettikorjauksen (3970fdf)
jälkeen pilot-dippi-työsarjat resolvoituvat **19.5–31 kg** (oman dippi-e1RM:n
pohjalta), mutta Akselin reaalisovelluksessa dippi-työkuormat ovat **~62.5–71 kg**.
Squat (110–128) ja MU (2.5–12) täsmäävät Akselin reaaliin — **dippi-spesifi
poikkeama**.

**Verifioitava (EI korjattu H-010:ssä — eri scope):**
- Onko fixture-profiilin (akseli-elite-streetlifter.mjs) **dippi-cal/simuloitu
  data tarkoituksella matala** (athlete-simulator tuottaa ohuemman dippi-e1RM:n
  kuin Akselin todellinen) → fixture-simulaatio = OK, ei tuotantobugi.
- VAI **ali-resolvoiko korjaus dipin oman e1RM:n** (esim. dippi-setit eivät
  akkumuloidu oikein simulaattorissa, tai loadType-käsittely) → tuotantorelevantti.

**Erottelu:** squat/MU täsmäävät tuotantoon → per-päivä-pmid-fideliteetti
toimii. Dippi-poikkeama on joko (a) fixture-simulaation dippi-datan ohuus
(harness-spesifi, ei korjattavaa) tai (b) dippi-spesifi resoluutio-aukko.
Vaatii akseli-elite-fixturen dippi-cfgBaseline + athlete-simulator-dippi-tuoton
tarkistuksen vs Akselin backup-dippi-historia (reaali ~62.5–71 kg työkuormat).

**Prioriteetti:** P2-luokka (ei estä identity-gatea, joka on nyt elävä). Ei
H-008-tyyppinen perityn-kuorman-bugi (dippi näyttää OMAN liikkeen e1RM:n, vain
magnitude poikkeaa fixture vs reaali).

## BACKLOG-D (H-015 retro, 2026-06-10): sarjaloki-redesign-kandidaatti

Workout-flow'n pysyvä kaikki-liikkeet-sarjaloki (kaikki liikkeet + rivit aina
näkyvissä, ei nykyistä yksi-liike-kerrallaan-näkymää). STOP-raportin vaihtoehto
D — EI ratifioitu A+B+C-kierrokseen (10.6.); arvioidaan jos A:n löydettävyys-
kerros ei riitä puhelinkäytössä.
# OBS-040 + OBS-041 — backlog-draft (Cowork 2026-06-12)

> Liitettäväksi repon docs/backlog.md:hen (Code-sessio tai Windows-natiivi-editointi).
> Lähde: Akselin puhelinhavainto 12.6. (Hor. työntö -liikenäkymä) + H-015 §7b jäi-auki-kohta 4.
> EI kuulu H-016- eikä H-017-scopeen — molemmat pidetään kapeina (prioriteettilinjaus 12.6.).

---

### OBS-040 · 2026-06-12 · puhelinhavainto (KAPEA PENKKI -treenihistoria, kategoria Hor. työntö) · AVOIN

**E1RM (EXT.) -kortti 82,0 (▼ −61 kg · 3 vk) ILMAN LÄHDETTÄ näkyvässä historiassa + sisäinen ristiriita VX-trendin kanssa**

Havainto (Akselin täsmennys 12.6.: näkymä on kapean penkin treenihistoria):
1. E1RM (EXT.) 82,0 kg, trendi ▼ −61,0 kg · 3 vk. Historia: 27.5. 4×5 @ 110 (V3/V4·t3), 21.5. 3×6 @ 110 (V3), 14.5. … — kaikki accessory-roolilla ("skill / volume"); Primary-laskuri 0, Accessory 5.
2. Aritmetiikka (Cowork-verifioitu): edellinen referenssi 82,0 + 61,0 = 143,0 = **täsmälleen** Epley-V 110 kg -sarjoista (110 × (1+(6+3)/30) = 143,0; sama 5×V4:stä) → edellinen arvo oli oikein laskettu tästä historiasta.
3. **82,0:lla ei ole lähdettä näkyvässä datassa:** 110 kg ei tuota 82:ta millään reps/V-yhdistelmällä; listassa ei ole 27.5. uudempaa sessiota; Primary = 0. 82,0 vastaisi ~60 kg -luokan kirjausta (esim. 60 × (1+(8+3)/30) = 82,0).
4. **Sisäinen ristiriita:** VX-trendi samassa näkymässä sanoo V3 → V4 "Helpottuu · sama kuorma, enemmän varaa" samalla kun e1RM-kortti väittää −43 % romahdusta — kaksi korttia, kaksi eri totuuslähdettä = fragmentaatioluokka (MEMORY oppi 3 / F-3).
5. Ajoituskonteksti: kapea penkki on dipin H-015-korvaaja (substituutio ~10.6.) — pudotus ilmestyi korvausjakson käynnistyttyä.

Hypoteesit (confirm-then-fix, EI korjausta ennen A1:tä):
- (a) **Substituutio-vuoto:** H-015-korvausmekanismin kuormaprojektio tai korvausjakson kirjaus syöttää kapean penkin e1RM-laskentaa ilman että se näkyy treenihistoriassa (näyttö suodattaa, laskenta ei — display/calc-eriparisuus).
- (b) **F-3-luokan lähdevirhe:** e1RM-kortti lukee muuta kuin kanonista computeMovementE1RMBest-polkua (last-set / stale store / väärä liike kategorian "Hor. työntö" kautta).
- (c) **Ikkuna-/roolisuodatus:** laskenta pudottaa 110 kg "skill/volume"-sarjat pois (rooli- tai ikkunaehto) → laskee jostain muusta. Heikoin hypoteesi: ei selitä mistä 82,0 tulee.

A1 (read-only): dumppaa kapean penkin KAIKKI setit (ml. suodatetut/substituoidut/virtuaaliset) + e1RM-kortin laskentapolku + VX-trendin lähde → osoita mistä 82,0 syntyy. Known-pos/neg per hypoteesi. Vaikutus: trendikortti valehtelee atleetille korvausjakson aikana + mahdollinen H-016-ankkuririski (reload-ankkuri lukee liikkeen viimeisintä toteumaa — jos näkymätön kirjaus kontaminoi, sama voi osua ankkuriin; H-016 A3:n top-rooli + kuorma > 0 -rajaus suojaa osittain).

Liittyy: OBS-041 (kirjauskitka samassa korvausjaksossa), F-3/VALUE_RESOLUTION_AUDIT (näyttöpolku), H-015 C1 (movementSubstitutions), H-016 A3-ankkuri, F-5-luokka (display vs laskenta -eriparisuus).

---

### OBS-041 · 2026-06-12 · puhelinhavainto + H-015 §7b kohta 4 · AVOIN

**Käsipainopenkki (flätti) ei löydy liikepankista — custom-luonti ei persistoidu / katalogikattavuus**

Havainto:
1. Akseli loi Käsipainopenkin custom-liikkeenä 10.6. (H-015 heti-ohje). 12.6. flätti käsipainopenkki ei löydy liikepankista → kirjauskitka korvausjakson keskellä.
2. Tunnettu aukko (H-015 §7b jäi auki, kohta 4): legacy ei-slot-polun liikelisäys jää in-memoryyn — ei persistoidu pankkiin. Tämä havainto on todennäköisesti saman aukon käyttäjälle näkyvä oire (verifioitava).

Design-linjaus (Akselin kysymys 12.6. + Coworkin suositus):
- Yleiset perusliikkeet (ml. käsipainopenkki flätti/vino) kuuluvat katalogiin valmiina.
- Custom-luonti: kitkaton JA **pysyvä liike-identiteetti** (persistoituu pankkiin, oma e1RM-historia).
- **EI vapaatekstikenttää ("jokin muu")** — ilman pysyvää identiteettiä kirjaukset sekoittuvat olemassa oleviin historioihin (OBS-040 on tästä mahdollinen esimerkki).

A1 (read-only): toistuuko in-memory-katoaminen (luo custom → sulje → avaa → onko pankissa); katalogin työntöliike-kattavuuden gap-lista. Korjaus omana handoffina (persistenssi + katalogitäydennys), EI H-016/H-017-scopeen.

Liittyy: OBS-040, H-015 §7b kohta 4 (legacy-swap in-memory), H-015 VAIHE B C1 (movementSubstitutions).

### OBS-042 · 2026-06-12 · H-018 OSA 1 -löydös · AVOIN
**Kanonisen e1RM-fallbackin median = slice(-6) INSERTION-järjestyksestä** (`computeMovementE1RM`, engine.js:~6383) — ei aikajärjestys-ikkuna. Kaksoisriski: (1) lajittelematon array → "viimeiset 6" voi olla mitä tahansa; (2) kevyt sessio arrayn lopussa dominoi medianin. **KVANTIFIOITU todellisella 12.6.-datalla (H-018-verifiointiworkflow, 2026-06-13):** OBS-040-fix poisti 82,0-katastrofin (kortti nyt 137,9), MUTTA Best on yhä insertion-order-hauras → kortti **ali-raportoi** kun stale-vanhat kevyet setit osuvat slice(-6)-ikkunaan. Mitatut erot (insertion vs kronologinen, ≥0,5 kg): Close-grip bench **10,9** (kortti 137,9 vs tosi tuorein 148,8) · Face pull **14,6** · Leg curl **9,6** · BW eksentrinen dippi **14,7**. **Cal-lähteiset (Lisäpainodippi/Takakyykky/Lisäpainoleuka) = immuuneja (ero 0,00).** Sama herkkyys voi vinouttaa myös 3vk-trenddeltaa median-lähteisillä liikkeillä. H-016-paluujakso vk 25–26: dippi cal-ankkuroitu → immuuni (H-016-ramppisimulaatio vahvisti), mutta apuliikkeiden trendikortteihin ei pidä luottaa kvantitatiivisesti ennen korjausta. Korjausarvio: aikaleimasortti + sessio-ikkuna fallback-polkuun — KANONINEN funktio → LOAD-DIFF-SWEEP-luokan muutos, oma handoff. **Prioriteetti nousi (verifier-suositus).** Liittyy: OBS-040 (sama lajittelemattomuus), OBS-043 (sama insertion-juuri lista-render), H-016 (ramppi verifioitu immuuniksi min-precedencellä).

### OBS-043 · 2026-06-12 · puhelinhavainto · AVOIN
**Tuore sessio ei näy liikehistoria-listalla heti** (12.6. ended 17:33, lista klo 19:24 näytti vain 30.4.–27.5.). Todennäköisesti sama insertion-järjestysjuuri (computeRecentSessionsForMovement "5 viimeisintä" ilman aikasorttia) — verifioitava OBS-042-handoffin yhteydessä.

### OBS-044 · 2026-06-13 · H-018 OSA 2 -löydös · PÄÄOSA SULJETTU (H-019 OSA A, 2026-07-10, v4.56.1) · RDL-ADDENDUM AVOIN

**SULKU (H-019 OSA A):** A1-sweep Akselin 12.6-backupille (424 settiä, 143 liikettä) osoitti: (a) katalogi-duplikaatit = täsmälleen tunnetut 2 (Hollow/L-sit), (b) **orpoja historia-movementId:itä 0 + orpoja sessionId:itä 0 → heal-migraatiota EI tarvita** (kohta 2 alla raukesi datalla; Akseli ratifioi "ei heal-migraatiota" 10.7.), (c) kenttäcasen "ensimmäinen kirjaus vaikka historiaa on" TODELLINEN juuri ei ollut ID-orpous vaan **completed-fantomikenttä** (0/424 persistoidussa setissä; `computePriorSet`/`computePriorSessionSummary`/`computeAcrossSetDecay` vaativat sitä → prior-näytöt sokeita koko historialle + 8a-oppiminen tuotannossa inertti; saman filtterin 3. esiintymä — v4.34.36-modaalifix + H-006a-fix8 poistivat muut lokukset). Toteutettu v4.56.1: fantomikenttä-ehto pois 3 lokuksesta (tuotantoschema-semantiikka: `setRole!=="skipped" && reps!=null` / `completed!==false`) + H019-A4-tuotantoschema-lukko + kohta (1) 2 dup-riviä pois + `ensureNewPresetMovements`-dedup normalisoitu (trim+lower) + `addMovement`-UI-dedup-guard + kohta (3) T3 → globaali uniikkius (`dupNames.length === 0`, normalisoitu). Jo-seedatut Hollow/L-sit-kaksoisrivit jäävät asennuksiin kosmeettisina (kuormaamattomia pitoja, poistettavissa käsin Liikkeistä). **Alla oleva RDL-ADDENDUM jää AVOIMEKSI** (nimi+kategoria-unifikaatio vaatisi juuri sen migraation joka ratifioitiin pois — oma kierros jos/kun tarve).

*Alkuperäinen kirjaus:* **2 eksaktia duplikaattia PRESET_MOVEMENTS:issa** (data.js): "Hollow body hold" ×2 ja "L-sit hold" ×2 (identtiset rivit, core/tier 3). Koska `seedPresets`/`ensureNewPresetMovements` luo `uid()`:n per entry, nämä tuottavat **kaksoiskappaleen liikepankkiin** (sama nimi, eri id) sekä first-installissa että surfacing-migraatiossa. Akselin 12.6.-backup: 143 liikettä (sis. todennäköisesti nämä duplikaatit). Vaikutus: kosmeettinen (liikelistassa sama nimi kahdesti) + e1RM-historia hajoaa jos käyttäjä tekee liikettä kummallakin id:llä. **Vakavuus MATALA (verifier-arvio, H-018 OSA 2):** molemmat ovat kuormaamattomia core-isometrisiä pitoja (Hollow body / L-sit) → e1RM merkityksetön, ei recommend()-/kuorma-/engine-vaikutusta. **Korjaus EI ole pelkkä 2-rivin poisto** — verifier-löydös: nimi-dedup (`ensureNewPresetMovements` existingNames-Set) estää vain RE-additionin, EI heal'aa jo-asennettuja kaksoisrivejä. Täysi korjaus: (1) poista 2 dup-riviä PRESET_MOVEMENTS:ista, (2) **migraatio-heal** `ensureNewPresetMovements`:iin joka mergeää jo-seedatut duplikaattirivit (movementProgress + sets re-point vanhempaan movementId:hen), (3) tiukenna T3-lukko muotoon `assertEqual(dupNames.length, 0)` (globaali uniikkius-invariantti). **Oma handoff (verifier-suositus: EI pikakorjaus, ei blokkaa).** EI kuulu OBS-041:een (eri liikkeet, vanha block-paste -juuri). Löydös: H-018 OSA 2 -katalogityö, testCatalogKasipainopenkki-lukko nappasi. Regressio-vartija paikallaan (T3 assertoi tasan 2 → uudet dupit jäävät kiinni; transitionaalinen sokea piste: 1 poisto + 1 uusi = netto 2 ohittuisi, hyväksyttävä kunnes OBS-044 suljetaan).

**ADDENDUM 2026-07-01 (retroauditti K6) — RDL-kerrosristiriita, sama heal-migraatio-luokka:** sama nosto elää katalogikerroksissa **eri nimellä JA eri kategorialla**: data.js PRESET_MOVEMENTS `"Romanian DL"` (category **alaraaja**, tier 2) vs wizard-movement-bank `fb_rdl` `"Romanialainen maastaveto (RDL)"` (category **lonkkahingaus**); R5:n uusi `Käsipaino-RDL` seuraa bankia (lonkkahingaus molemmissa kerroksissa, konsistentti). Miksi EI pikakorjattu retroauditissa: (1) `ensureNewPresetMovements` täyttää vain **undefined**-kentät (isCompetitionLift/loadType/tier) — kategoria-muutos EI migratoidu olemassa oleviin DB:ihin → cross-user-epäkonsistenssi; (2) nimen yhtenäistäminen loisi nimi-dedupissa uuden liikkeen (sama juuri kuin yllä oleva duplikaattiongelma); (3) test-runner.js H018-OSA2-lukot assertoivat katalogirivejä eikä selaintestejä voi ajaa CLI:stä (sokea muutos). Täysi korjaus kuuluu tämän OBS:n heal-migraatioon: nimi+kategoria-unifikaatio (→ "Romanialainen maastaveto (RDL)", lonkkahingaus) + movementProgress/sets re-point + lukkojen päivitys. Wizard-puoli ei kärsi nykytilassa (slotit kantavat oman kategoriansa; suoritettavuus barbell_rack molemmilla nimillä _EQ_GROUPS:ssa).

### OBS-045 · 2026-06-14 · H-017 D1 VAIHE B -latentti (adversariaalinen review, LENS 4) · AVOIN
**D1-ärsykelattia (A4) romahtaa nollaan kun kanoninen e1RM ≤ kehonpaino** (non-barbell). `resolveIntraSessionAdjustedLoad` lattia = `canonicalE1RMSystem×0.75 − BW`; jos systeemi-e1RM lähellä/alle kehonpainon (cold-start, erittäin heikko lisäpainoleuka/dippi tai negatiivinen lisäpaino), lattia → `Math.max(0, …) = 0` → A4 ei tarjoa ärsykesuojaa ja D1 voi asettaa back-offin `finalLoadKg = 0` ("kuorma seuraa päivän toteumaa 0 kg"). **Vakavuus MATALA:** eliittiprofiilille (Akseli: leuka 85, dippi 95, kyykky 185 ext) tavoittamaton — currentE1RMSystem ≫ BW kaikilla liikkeillä. Suunta turvallinen (ei ylikuormaa). **Ei v1-korjausta** (näkyvyys ettei katoa §7-arkistoon). Korjausarvio: non-barbell-lattialle EXTERNAL-e1RM-suhteellinen alaraja tai eksplisiittinen min-lisäkuorma > 0. Liittyy: H-017 D1 (A4), OBS-046 (sama lattia/BW-polku), F-3 (kanoninen e1RM-lähde).

### OBS-046 · 2026-06-14 · H-017 D1 VAIHE B -latentti (adversariaalinen review, LENS 4) · AVOIN
**D1-lattia käyttää live-painoa, kanoninen e1RM laskettiin recommend()-ajan painolla.** `canonicalE1RMSystem` (= `rec.e1rmSystem`, snapshotattu startWorkoutissa) on laskettu recommend()-hetken kehonpainolla; D1-handler vähentää A4-lattiassa `bodyweightKg = state.latestBodyweight` (live-hetki). Jos atletti kirjaa uuden painomittauksen recommend()- ja kirjaus-hetken välissä, lattiassa yhdistyy stale-BW:llä laskettu e1RM ja tuore BW-vähennys → pieni numeerinen epäkonsistenssi non-barbell-lattiassa. **Vakavuus MATALA:** yhden session sisäinen painonmuutos epätodennäköinen; vaikutus vain lattia-clamp-haaraan (ei normaaliin re-resolveen). **Ei v1-korjausta.** Korjausarvio: snapshotaa myös `rec.bodyweightKg` (palautetaan jo engine.js:~5827) workout-objektiin ja käytä sitä D1:n BW:nä → konsistenssi recommend()-polun kanssa. Liittyy: H-017 D1 (A4), OBS-045.

### OBS-047 · 2026-06-14 · H-017 D1 VAIHE B -latentti (adversariaalinen review, LENS 3) · AVOIN
**Primaryn variant-swap ALAS ei päivitä `plannedLoadKg`-snapshotia → D1-laukaisun attribuutio borderline-väärä.** Jos atletti vaihtaa primaryn variantin kevyempään (negatiivinen kuormamodifaattori) kesken treenin, `s.loadKg` + `exercise.loadKg` päivittyvät mutta `set.plannedLoadKg` (D1-snapshot) jää alkuperäiseen korkeampaan. Gate 3 (`plannedPrimaryMedian − actualMedian`) kasvaa keinotekoisesti → D1 laukeaa "toteuma alittaa" vaikka kyse oli varianttivalinnasta, ei heikosta päivästä. **Lopullinen back-off-kuorma on silti OIKEIN** (re-resolve käyttää toteuman e1rmActual:ia + A3 min) — vain laukaisu-attribuutio on epätarkka. Atletti=valmentaja-hengessä "seuraa päivän toteumaa" on puolustettavissa kevyemmälläkin variantilla → enimmillään kosmeettinen. **Ei v1-korjausta.** Korjausarvio: variant-swap päivittää myös ei-completed-settien `plannedLoadKg` (laajentaa snapshot-semantiikkaa — harkitse erikseen). Liittyy: H-017 D1 (gate 1 snapshot, gate 3), H-015 (variant-swap-polku).

### OBS-048 · 2026-06-16 · Akselin tuotantohavainto (vk8 squat) · KORJATTU (A2, 2026-06-17, APP_VERSION 4.52.43)
**Kalibrointi-testisarjan base oli inflatoitu → epärealistinen 96,5 %×3.** Cal-resolveri (engine.js:~5161) käytti `currentE1RMExternal`-basea, joka voi divergoida kanonisesta e1RM:stä **7 lähteellä** (PLAN_BASED, ceiling/streak-bonus, cal-derived ×1,05, floor, cfg-drift, VBT, primer). Akseli vk8: +5 % → suunniteltu 0,92 cal resolvoitui 0,966:een → 175 (e1RM 181,3) / 180,5 (187), kun realistinen on 167/172. Lisäksi F-3-display-epäsuhta (kortti näytti kanonisen 181,3, cal laski 190,4:stä). A1 runtime-verifioitu bittiläheltä (181,3×1,05×0,92=175,0). **Juurisyy-luokka:** ensimmäinen kuorman *valmennuksellisen oikeellisuuden* (ei pelkän koherenssin) löydös; F-2 jätti cal/top-singlen ulos "raskaita by-design" → ei napattu aiemmin. **A2-KORJAUS:** cal-base = `computeMovementE1RMBest` (KANONINEN, sama funktio + set-suodatin kuin e1RM-kortti index.html:5910), kaikille cal-liikkeille (scope B); config-PR vain Best===null-fallback; PR-cap säilyy; yksikkö system-load → Best.value−BW. Eliminoi kaikki 7 inflaatiolähdettä + display-epäsuhdan yhdellä yhtäsuuruudella. Known-pos: 187→172,0, 181,3→167,0. Testilukko: testLoadDerivationCorrectness (T2/T2b). Pilot 64/64 bittitarkka. Liittyy: OBS-049 (sama A2, riippumaton juuri), F-3 (display-koherenssi), H-018 (kortin kanoninen Best).

### OBS-049 · 2026-06-16 · systeeminen sweep -löydös (kaikki tier-1-liikkeet) · KORJATTU (A2, 2026-06-17, APP_VERSION 4.52.43)
**vReps-override litisti ohjelmoidun top-single-loadPct-progression.** Haara A (engine.js:~5235) korvasi tier-1/2/3 same-liike-slotin `slot.loadPct`:n `vRepsToExpectedPct(reps+Vx)`:llä → top single 1×1@V1 → vReps(2)=0,9375 KAIKILLE → vk10 (0,92) ja vk11 (0,95) → sama kuorma, RPE8→RPE9-ramppi katosi. **Systeeminen sweep (16 vk × 3 primary-liikettä) vahvisti: koskee KAIKKIA tier-1-liikkeitä** (squat 93,8 / leuka 87,7 / dippi 86,7) + vk15/16 openerit. **A2-KORJAUS:** diskriminaattori `slot.reps === 1 && !slot.attemptsPct` → top single/opener säilyttää ohjelmoidun loadPct:n (ohittaa vReps-overriden); back-off (reps≥3) vReps ENNALLAAN; F-2-clamp ennallaan. Ramppi palautui. Testilukko: testLoadDerivationCorrectness (T4/T6). Pilot 64/64 bittitarkka (HUOM: pilot SOKEA tälle — deriveMovementCatalog ei kopioi tieriä → vReps ei laukea pilotissa; positiivinen todistus test-runnerissa). Liittyy: OBS-048 (sama A2), OBS-035+037 (block 15c -malli: loadPct kanonisesta ilman vReps).

### Intensiteetti-oikeellisuus-luokka — sweep-sulku OSITTAINEN (korjattu 2026-06-17)
Synteettinen sweep (kaikki slotit × 16 vk × 3 primary-liikettä, tier-rikastettu) vahvisti OBS-048 ∪ OBS-049 -resolver-korjaukset, MUTTA **väitti virheellisesti "ei kolmatta rikkomustyyppiä".** Akselin todellinen app-data (backup 2026-06-17) paljasti squat-back-off-litistyksen (★=↩=147,5), jota synteettinen sweep ei napannut (oli epäluotettava primary-autoreg-polkuun: PLAN_BASED + cap-lookupit eivät laukea Node-harnessissa samoin kuin appissa). → kaksi uutta löydöstä: **OBS-050** (oire) + **OBS-051** (juuri). **Opetus:** synteettinen harness ei riitä primary-/e1RM-polun valmennukselliseen oikeellisuuteen — todellinen app-data + decisionTraces pakollinen.

### OBS-050 · 2026-06-17 · Akselin app-data (squat vk8/vk9) · OIRE, ei erillistä korjausta (resolved-by-OBS-051)
**Squat-back-off-litistys: ★ (primary) = ↩ (back-off) = 147,5 kg, kaikki viikot vk5–9.** F-2-clamp (engine.js:~5261) cappaa same-liike-back-offin **yhtä suureksi** kuin (autoreg-suppressoitu) primary-target, kun back-offin vReps × inflatoitu sessionE1RM ylittää sen → useat eri-preskription back-offit litistyvät samaan kuormaan. **EI itsenäinen bugi:** A1-synteesi todisti clampin + autoreg-suppression toimivan oikein — ne vain PALJASTAVAT inflatoituneen e1RM:n (OBS-051). Terveellä e1RM:llä (175,75) back-offit jäävät primaryn alle → litistys katoaa, clamp ei sido. **Resolved-by-OBS-051:** ei erillistä clamp-/autoreg-muutosta (relayn "EI kosketa clampiin" säilyy). Vahvistettu: app-datalla post-fix back-offit erottuvat (vk9 primary 147,5 > back-off ~142). Liittyy: OBS-051 (juuri).

### OBS-051 · 2026-06-17 · Akselin app-data (squat) · SULJETTU (pushattu e598d94, A6 puhelinvahvistettu 2026-06-24: squat ~160 + back-offit erottuvat)
**PLAN_BASED-e1RM-inflaatio: live-kuorman squat-session-e1RM 196,3 (capattu 241,4:stä), yli terveen ~172–187.** `PLAN_BASED_E1RM` (engine.js:~4434) laskee `plan_e1rm = lastLoad / lastLoadPct`. vk8-primary 3×3@V4 tehtynä 140 kg @ ohjelmoitu loadPct **0,58** → 140/0,58 = **241,4** → INFLATION_CAP 187×1,05 = 196,3. **Juuri = loadPct (0,58) ≠ Vx-intensiteetti (vReps(7)=0,81):** PLAN_BASED luottaa volyymi-label-loadPct:hen tosi-%1RM:nä → jakaa väärällä %:lla → inflatoituu. Akselin oma diagnoosi: "kone luuli että sain lisävoimia kun nostin sarjapainoa — % ja vara eivät täsmänneet" = **kategoriavirhe** (suunnittelu-label kohdeltu voiman mittauksena). **OBS-048-sisarvika:** cal-base reititettiin kanoniseen (OBS-048), mutta työsarjapolku (currentE1RMSystem) jäi PLAN_BASED-inflatoituneeksi (F-3: kortti=Best, live-kuorma=currentE1RMSystem). **EI OBS-029/velocity** — VBT-cross-check (224,2) ei-promotoitu (diff 12,7 % > 5 %), red herring suljettu pois. **A2-KORJAUS:** `PLAN_BASED_VX_TOL = 0,15` + jaettu helper `isLoadPctVxConsistent(loadPct, reps, vx)` (engine.js:~285) sovellettuna **KAIKKIIN NELJÄÄN PLAN_BASED-sijaintiin:** (1) recommend()-inline, (2) `computeMovementE1RMBest`-kortti, (3) `computePerfectStreakCeilingBonus`-streak, (4) cfg-drift-counter. PLAN_BASED laukeaa vain kun `loadPct >= vReps(reps+Vx) × 0,85`; alittava (volyymi-label) → skippaa → Epley-Vara säilyy (→ DEFLATION-floor PR 185×0,95 = 175,75). Deflatoiva loadPct > vReps saa edetä. **HUOM — adversariaalinen verifiointi (4 kriitikkoa) löysi BLOKKAAJAN:** alkuperäinen fix gattasi vain recommend()-polun → kortti (`computeMovementE1RMBest`) jäi gataamattomaksi → kortti 241,4 vs live 175,75 (**F-3-rikko**) + cal-base re-inflaatio (olisi rikkonut OBS-048:n uudelleen). Korjattu jaetulla helperillä kaikkiin sijainteihin. **Routing: K2b/e1RM-computation, ei M2/VBT.** Known-pos (app-data): gataa squat loadPct 0,55/0,58 (60 laukeamaa), säilyttää 0,71/0,78 + leuka/dippi (deflatoivia, gatattavia ei-squat = 0). Testilukot: `PLAN_BASED_VX_GATED`-scenario (recommend) + `testE1rmCardPlanBasedGate` (kortti F-3); S10 = consistent known-negative. Pilot 64/64 bittitarkka (0 diffiä — HUOM: pilot precondition-sokea PLAN_BASED:ille, ei validoi gatea; validointi kortti-testillä + app-datalla + gate-logiikalla). Liittyy: OBS-050 (oire), OBS-048 (sisarvika), OBS-029 (suljettu pois).

### OBS-052 · 2026-06-18 → 06-24 · Akselin pistaritesti (squat 4×3 V2 → 150 vs 160) · SULJETTU (pushattu e598d94, A6 puhelinvahvistettu 2026-06-24: squat ~160 + leuka/dippi realistiset)
**Cal-priority-ikkuna kukistuu cal-ensin-järjestyksestä → luotettavin signaali (cal-testi ±2,7 kg) alikäytetty → Vx-epäjohdonmukainen kuorma.** Akselin periaate (ratifioitu): *"luotettavin signaali (cal/velocity/parhaat primary-setit) ohjaa e1RM:ää AINA — ei hauraasta mediaani/sarjajärjestys-mekanismista."* Juuri: cal-priority [engine.js ~4312] tarkisti `recentTopSets.slice(-3)` (3 viim. SARJAA) → cal tehdään treenin alussa → ≥3 työsarjaa jälkeen työntää cal:in ulos → deload-mediaani (172,7) voittaa, cal 187 jää lattiaksi ×0,95 → primary 4×3@V2 = 147,5 (~V4) eikä 160. Systeeminen: squat −8 %, leuka −7 % (liike-agnostinen). Vastakkainen suunta kuin OBS-048/051 (= ALI-käyttö).

**v1 (4.52.45, SUPERSEDED — säilytetty oppina):** `mostRecentSessionCalibSets` = "cal ajaa jos VIIM. SESSIOSSA". **Akselin premissi-tarkistus paljasti v1:n haurauden:** kanoninen `streetlifting_16w` kalibroi vain **vk4/8/12** (~kerran kuussa, ei "treenin alussa"). Kadenssi-workflow + node-probe vahvisti: työ-only-viikoilla (vk2-4) viim. sessio ei ole cal-sessio → v1-helper palautti **[]** → cal jäi taas lattiaksi. **v1 oli INERTTI 3/4 ajasta** — korjasi vain cal-session jälkeisen sessio-ikkunan (= Akselin pistari vk8→vk9), ei kuukautta. Oppi → [[e1rm-most-recent-x-needs-cadence-check]].

**v2-KORJAUS (4.52.46, TUOREUSIKKUNA — toteuttaa "ohjaa AINA" kuukauden yli):**
- **KERROS 1 — resolveri:** `mostRecentSessionCalibSets` → **`freshCalibSets(sets)`** (engine.js ~298): cal AJAA niin kauan kuin tuorein cal ≤ **`CAL_FRESHNESS_DAYS = 42`** pv tuoreimmasta lokisetistä — RIIPPUMATTA viim. session roolista. Lukee **TÄYDEN historian** (ei slice-6) jotta kuukauden vanha cal näkyy. Order-immuuni (max-timestamp), deterministinen (ref = tuorein lokiset, ei Date.now()). Sovellettu **3 LIVE/kortti-e1RM-source-sijaintiin:** recommend() + `computeMovementE1RMBest`-kortti + `recommendPeaking()`. → squat e1RM **187** kuukauden yli, primary 4×3@V2 = **160,5** (= vReps(5)).
- **KERROS 1b — kortti-lattia (F-3, uusi v2):** `computeMovementE1RMBest` median-fallback sai **DEFLATION-lattian** (cal-min/cfg-PR ×0,95, kortin yksikkö, source `median-floored`) — kuten live. Korjaa **pre-OBS-052-F-3-aukon**: kortilla EI ollut lattiaa → stale/pre-cal-tilassa kortti 172,7 vs live 175,75 (~15 kg, jäi piiloon OBS-051:ssä koska testifixtureissa ei cfg:tä). Nyt kortti=live myös ikkunan ulkopuolella.
- **KERROS 2 — break-override (v1:stä, ennallaan):** `computeMovementReload` palauttaa null kun tuore cal paluujaksolla (cal-re-entry → ohittaa break-rampin). Akselin "ei sekoittavaa break detectionia".
- **REUNAEHTO A:** EI velocity-RAAKAA — vain `setRole==="calibration"` ohittaa; OBS-029-suppressio koskematon. *HUOM: cal-ankkurointi VOI siirtää KONVERGOIVAN velocity-estimaatin (≤5% cal, clampattu cal×1,05) VBT-promote-portin sisään — konvergenssi ei vuoto; pilari 1 -seuranta.*

**ADVERSARIAALINEN VERIFIOINTI (4 kriitikkoa + synteesi) löysi 2 BLOKKAAJAA — molemmat korjattu + re-verifioitu (v1-virheiden rakenteelliset kaksoset):**
- **BLOKKAAJA 1 — kortti-lattian system-load-yksikkövirhe:** kortti kertoi ×0,95 BW-inklusiiviseen systeemiarvoon; live kertoo ×0,95 EXTERNAL:iin ja lisää BW:n VASTA jälkeen → 0,05×BW (~4,5 kg) ero CKC-liikkeillä (leuka/dippi/MU) → kortti < live (F-3-rikko). **Testit missasivat koska käyttivät vain Takakyykkyä (barbell, ei BW-termiä)** = v1:n "false bit-exact" -kuvio. KORJATTU (engine.js: lattia external-yksikössä + BW jälkeen, kuten live) + lukkotesti `testE1rmCalSystemLoadLeuka` (leuka cfg-lattia 169,75 = live, EI bugi-165,3; + Akselin cal 73×3@V1 → 183,6). Vahvistettu OIKEAA exportattua `computeMovementE1RMBest`-funktiota vasten (5/5).
- **BLOKKAAJA 2 — pilot ei harjoittanut v2-ajuria:** simusetit eivät kantaneet `timestamp`-kenttää → `freshCalibSets` palautti [] joka kerta → "pilot identtinen" ei todistanut v2:sta + 1. LOAD-DIFF-SWEEP oli artefakti (v1:n fallback laukesi ilman timestampia, v2 ei). KORJATTU (athlete-simulator.mjs + scenario-runner.mjs: `timestamp` johdettu päivästä). Re-ajettu.
**LOAD-DIFF-SWEEP (eristetty engine-efekti, sama timestamp-harness origin+v2):** pilot 64/64, 0 virhettä, audit-flagit IDENTTISET (71). **22/64 päivää kuorma muuttui** (akseli-elite). Selitys: v2 VAPAUTTAA CKC-e1RM:t jumista jossa origin ali-ajoi ne koko ohjelman (leuka jumissa ~62 → v2 ankkuroi cal:iin → progressio cfg-kattoon ~110 perfect-streak-simuatleetilla; squat 161,5→180,4 kohti tosi-187:ää). Arvot RAJOITETTU olemassa olevilla katoilla (cfg×adaptive+streak) → ei rajaton inflaatio. Akselin OIKEASSA datassa (cal 73×3@V1, oikeat missit) leuka seuraa ~94:ää, ei synteettistä 110:tä. **Yli-floor-huom (ei blokkaaja):** korkea/detrainattu cfg-seed voi nostaa lattian tosi-e1RM:n yli ja inflatoida kortin — mutta LIVE tekee identtisen clampin → kortti=live säilyy (F-3-konsistentti, symmetrinen E1RM_INFLATION_CAP:n kanssa, "atletti=valmentaja"). Testilukot: `testE1rmCalFreshnessWindow` + `testE1rmCardFloorEqualsLive` + `testE1rmCalSystemLoadLeuka` + v1:n order-immuuni/reload-testit. Routing: M1/K2b (resolveri) + M2/pilari 1. Liittyy: OBS-048/051 (e1RM-resolveri-perhe), OBS-050 (de-litistys), [[e1rm-most-recent-x-needs-cadence-check]] (oppi). **KAPSTONI pilari 1 — cal aidosti ohjaava kuukauden yli (v2 korjasi v1:n kadenssi-sokeuden).**

### OBS-053 · 2026-06-24 · Wizard pilari 3 (b) adversariaali · AVOIN (a-laajennus, ei kiireellinen)
**Liikepankista puuttuu käsipaino-soutu + rengasliikkeet → kalusto-osajoukot saavat vajaan veto-valikoiman.** Pilari 3 (b) -korjaus degradoi siististi katalogin rajoissa: dumbbells-/rings-/bodyweight-only → push+legs + rehellinen veto-advisory (`_FUNCTION_MOVEMENTS`-lista, ei keksittyjä liikkeitä). MUTTA **täysi tuki** vaatii katalogiin: **käsipainosoutu** (dumbbells → veto), **rengasleuanveto/-dippi/-soutu** (rings → veto+työntö), mahd. **lat pulldown -kone** (machines → veto; nyt cable-luokiteltu). Tällöin `_FUNCTION_MOVEMENTS.pull` + `applyEquipmentFilter`-substituutio antaisi vedon näille osajoukoille. **EI nyt:** ei Akselin käyttö (täyskalusto) eikä W2-profiilit (P9-P11 todistavat ettei pyyhkiytymistä; veto-advisory riittää). Routing: Wizard/liikepankki. Liittyy: pilari 3 (b).

### OBS-054 · 2026-06-24 · Wizard mapper (pre-existing, EI pilari 3) · AVOIN
**`selfTestMapper()` palauttaa ok=false: 2 pickProgramStyle-Wendler-confidence-virhettä.** Vahvistettu adversariaalilla identtisinä 7d7a3ee^ + 021690f (ENNEN pilari 3:a) → ei pilari 3:n aiheuttama. Mapper-self-test-portti on jo punainen; harness + pilot eivät nojaa siihen. Virheet: "max+intermediate+vara_calibrated → Wendler confidence > 50" + "kalibroitunut Vara mainitaan rationale-listässä". Korjaa erikseen (tyylimapper-scope, ei materialisaatio). Routing: Wizard/pickProgramStyle.

### OBS-055 · 2026-06-24 · Wizard pickPrimaries (pre-existing, EI pilari 3) · AVOIN
**`_INJURY_BLOCKLIST` selkä→maastaveto nimimatch-bugi:** keyword `"maavet"` EI ole `"maastaveto"`:n alimerkkijono (`"maastaveto".includes("maavet") === false`) → selkä-absolute-vamma EI poista Maastavetoa primaareista. Commit cdd851d (alkuperäinen 2B-α), ei pilari 3:n. Korjaus: keyword `"maast"` tai `"maave"` (kattaa maastaveto + maaveto). Vammaturvallisuus: selkävammainen voi saada maastavedon primaariksi. Routing: Wizard/pickPrimaries.

### OBS-056 · 2026-07-11 · H-019 OSA B PRE-FLIGHT fleet-ajo · AVOIN (ei kiireellinen, ei invarianttiluokka)
**PRESCRIPTION_SANITY-vahdin aidot saaliit ei-Akseli-profiileilla (3 × 🐛):** streetlifter-novice-male-70: Lisäpainoleuanveto 1×1 69 → 80,5 kg (+17 %, vk10/pv1→vk11/pv1) ilman selittävää sääntöä; streetlifter-master-female-58: Lisäpainodippi 3×5 29,5 → 24,5 kg (−17 %, vk5/pv4) ja 27 → 23 kg (−15 %, vk6/pv4) ilman selittävää sääntöä. Vahti toimii tarkoitetusti (nappaa selittämättömät hypyt); juuret triagoimatta — eivät INVARIANT_VIOLATION-luokkaa eivätkä blokanneet reunaehto (a):ta. Akselin profiili puhdas. Triage omana kierroksena (per-flag: aito engine-epäjatkuvuus vs puuttuva selittäjäsääntö vahdissa). Kirjattu H-019-välikierroksella Akselin ohjeella "ei tähän kierrokseen".

### OBS-057 · 2026-07-11 · H-019 OSA B PRE-FLIGHT fleet-ajo · AVOIN (audit-infra, stale-detektori-kuvio)
**Audit-raportin kattavuusmatriisi odottaa eläkkeelle jäänyttä K_A1-kanavaa:** raporttien checklist näyttää "K_A1 ✅→❌ 🐛 PUUTTUU (audit-engine miss?)" vaikka K-A1 poistettiin tarkoituksella K5-6:ssa (stale-detektori eläköitetty, kattavuus K3-3:ssa) — sama kuvio myös K1/K_A6D-riveillä skenaarioissa joissa kanava ei ole relevantti (esim. wizard-generated ilman velocity-dataa). Kattavuusmatriisin ODOTUSLISTA on itse vanhentunut = [[stale_detector_pattern]] audit-infran sisällä. Korjaus: poista K_A1 odotuksista + tee kanavaodotukset skenaario-ehdollisiksi. Kosmeettinen (🐛-leima checklistissä sekoittaa severity-laskentaa raportin sisällä muttei summary-riviä). Kirjattu H-019-välikierroksella Akselin ohjeella "ei tähän kierrokseen".

### OBS-058 · 2026-08-12 · Akselin kenttähavainto + 3-linssinen verifiointi · **AVOIN — H-021-KANDIDAATTI (kuormaluokka)**
**Slotti-rooli tuhoutuu persistoinnissa JA e1RM-aggregaatti on mediaani → submaksimaalinen sarja painaa 1RM-arviota alas.** Kaksi toisiaan vahvistavaa juurta. (1) KIRJOITUS: `resolveSetPersistence` (engine.js, v4.58.0 — kontrakti tehty näkyväksi) romahduttaa 9 slotti-roolia 4 setRole-arvoksi; `secondary`, `opener`, `attempt2`, `attempt3` → kaikki `"accessory"`. Persistoidussa setissä ei ole `role`, `slotId`, `competitionLift`, `loadPct` eikä `plannedLoadKg`, joten raskas kisa-avausyritys @90 % on datassa erottamaton kevyestä motor-pattern-sarjasta @60 %. Engine kiertää tämän jo kahdessa kohdassa eksplisiittisin kommentein (engine.js:3482, 5380) — koodi dokumentoi oman tiedonkatonsa, mutta vain 2/~40 setRole-suodattimesta kiertää sen. (2) LUKU: `computeMovementE1RM` (engine.js:7721) suodattaa vain `kuorma>0 && toistot>=1`, Haara C (engine.js:6285) sulkee pois vain `readiness_test` — molemmat aggregoivat **mediaanilla** viimeisestä 6 sarjasta. Koska mediaani eikä maksimi, kevyt sarja ei vain päädy syötteeksi vaan **aktiivisesti painaa arviota alas**. Mitattu (probe): e1RM-kortti 0 kevyttä → 187,0 kg · 3 kevyttä → 154,6 (−17 %) · 4 → 122,1 (−35 %); kisakyykyn kuorma 162,5 → 160 (2 kevyttä) → 136,5 kg (3 kevyttä); γ-blokin B8-esitäyttö leuan avaus 84,5 → 73,5 kg. **Kynnys on jyrkkä eikä lineaarinen** (6 arvon mediaani-ikkuna): 1 kevyt sarja ei tee mitään, 3 romahduttaa → vika on näkymätön kunnes laukeaa. TURVASSA: `recommend()`:n pääankkuri (engine.js:4901) suodattaa roolit oikein → päivittäinen työkuorma ei valu (probe: 161,5 → 161,5 kg). VAARASSA: kisapäivän yrityskuormat, e1RM-kortti (Edistyminen/Liikepankki/liikemodaali), γ B8 -esitäyttö, kalibrointipäivän kuorma jos PLAN_BASED-portti ei aukea (172,5 → 167,0). Counterfactual toistettu kahdesti: kevyt accessory-kyykky vk 15 TI:hin pudotti kisapäivän kyykyn 149,5 → 143,0 kg (ownE1RM 177,8 → 170,2). **Nykyinen suoja on pelkkä datakiertotie** (kevyt kyykky poistettiin taperista 12.8.), ei koodilukko — mikä tahansa tuleva taper-/kisaviikon slotti tuo vian takaisin. Korjausvaihtoehdot: (A) persistoi `slotRole` settiin (additiivinen, ei skeemamuutosta — `saveSets` on läpinäkyvä `dbPutBulk`); (B) persistoi `competitionLift` + `loadPct` erottimiksi; (C) laajenna setRole-taksonomia — **breaking**, ~40 suodatinta + historiadatan migraatio; (D) vaihda aggregaatti mediaanista intensiteetti-tietoiseksi — osuu juureen mutta muuttaa kaikkia e1RM-lukuja → iso LOAD-DIFF. Lykätty kisan/mock meetin (22.8.) yli Akselin päätöksellä. Liittyy: HANDOFF.md H-020-kandidaatti (yritysstrategian %-semantiikka) — sama kisapäivä-pinta.

### OBS-059 · 2026-08-12 · sama verifiointikierros · **AVOIN (testi-infra, rakenteellinen)**
**index.html on kokonaan automaattisen testikattavuuden ulkopuolella.** `test-runner.js` importoi vain `engine.js`:stä (rivi 98) ja `data.js`:stä (rivi 117) — sillä ei ole pääsyä index.html:n sisäisiin funktioihin. Eli 16 649 riviä UI:ta, workout-flow'ta ja **persistointia** on testaamatonta, ja 1024 testitapausta kattavat kaksi muuta tiedostoa. Tämä on rakenteellinen selitys sille miksi `completed`-kenttä on kadonnut KOLME kertaa samasta kerroksesta (v4.34.36, H-006a-fix8, H-019 OSA A), miksi paluuramppi-banneri (index.html:7525 `state.recommendation?.slots`) on kuollutta koodia, ja miksi liikehaku-modaalilla on yksi kutsuja. `saveWorkoutToDb`-kattavuus: **0 testiä**. Osittainen korjaus tehty v4.58.0:ssa: persistointikontrakti nostettiin puhtaaksi funktioksi engine.js:ään (`resolveSetPersistence`) + lukkotesti — ensimmäinen koneellinen lukko kirjoituspolulle. Yleinen korjaus vaatii joko (a) UI-/flow-logiikan nostamisen testattaviin moduuleihin pala kerrallaan, tai (b) DOM-tason regressioharnessin (`tools/coach-judge/` Layer 2). Liittyy: [[browser_suite_hang_missing_export]], [[fixture_schema_production]].
