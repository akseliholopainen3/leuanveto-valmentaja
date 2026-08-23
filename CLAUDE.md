# LeVe AI — repon spec-ankkuri

> **Tarkoitus:** Tämä tiedosto on jokaisen Claude Code -session pakollinen luettava ennen muutostyötä. Konsolidoi spec, acceptance criteria -periaate, tutkimusinvariantit, sub-agent-ohjeet, kanava-auktoriteetin ja session-protokollan yhdeksi ankkuriksi joka selviää sessioiden välissä ja vastustaa "rikkinäisen puhelimen" -ajautumaa.
>
> **Aloita aina §8:n session-aloitusprotokollasta.** Kolmen kerroksen malli: tämä `CLAUDE.md` = pysyvät invariantit ja säännöt · `ROADMAP.md` = strateginen 20-vaiheinen R-sekvenssi ja NYT-merkki · `HANDOFF.md` = aktiivinen tehtävä.

---

## 1. Sovelluksen ydin

LeVe AI on suomenkielinen voimaharjoittelusovellus (PWA, paikallinen IndexedDB, ei serveriä). Kohderyhmä: kokeneet voimanostajat, streetliftaajat, kovan tason atletit. Engine on adaptiivinen autoregulaatio-moottori joka säätää kuormaa sääntöpohjaisesti tutkimusperustaisten rajojen sisällä.

**Arkkitehtuuri:**

- `engine.js` — kaikki laskenta (e1RM, readiness, mesocycle, recommend())
- `data.js` — IndexedDB-kerros (storet + schema-versio: `grep -c "^  [a-z]*:" data.js` / `SCHEMA_VERSION`)
- `index.html` — UI + CSS + workout-flow
- `wizard/` — kysymys-vastaus → ohjelma-mappaus (kysymysten ja tyylien määrä: ks. `wizard/wizard-data.js`)
- `tools/engine-pilot/` — regression-pilot-harness (profiilit: `ls tools/engine-pilot/profiles/`)
- `test-runner.js` — selain-yksikkötestit (?test=1; headless-ajo: `tools/browser-test/` — testien määrä tulostuu ajossa)
- `sw.js` — service worker (PWA auto-update)

**Versio:** kts. `sw.js` APP_VERSION.

**Arvo-resoluutio-invariantti (value-resolution-audit, F-3):** kanoninen e1RM = `computeMovementE1RMBest` (näyttö: Edistyminen/Liikepankki/Trendit/Sykli-preview) / `currentE1RMSystem` (live-kuorma → `resolvedLoadKg`/`targetExternalLoad`). `MovementProgress.currentE1RM` (last-set) **EI koskaan näyttöön/kuormaan** (vain stagnaatio/historia); `movementCfg.e1rmExternal` = cross-ref-lattia; `peakingConfig.e1rmExternal` = fallback (live voittaa). `getMovementProgress.suggestedLoadKg` sallittu VAIN eri-liike-apuliikkeille (movement ≠ päivän primary). Täysi kartta + koneellinen lukko: [docs/VALUE_RESOLUTION_AUDIT.md](docs/VALUE_RESOLUTION_AUDIT.md) (`testKotiEqualsLiveAccessory` + `testSp2SlotLoadInvariant`).

---

## 2. Tutkimusinvariantit ja adaptiiviset parametrit

Vaiheen 8 oppiva engine (8a) ei saa missään tilanteessa rikkoa alla olevia tutkimuspohjaisia turvarajoja. Yksityiskohtainen taulukko: [docs/TUTKIMUS_INVARIANTIT.md](docs/TUTKIMUS_INVARIANTIT.md).

| Parametri | Turvaraja | Lähde | Status |
| --- | --- | --- | --- |
| VL-cap foundation | 25–35 % | Pareja-Blanco 2017 (PMC5497611) | VERIFIOITU |
| VL-cap strength | 15–20 % | Pareja-Blanco 2017, 2020 | VERIFIOITU |
| VL-cap intensity | 10–15 % | Pareja-Blanco 2017 | VERIFIOITU |
| VL-cap peaking | 5–10 % | Pareja-Blanco 2017 | VERIFIOITU |
| Deload Δ% | −20…−30 % | Helms 2018 (PMID 30153841) | VERIFIOITU |
| Tier-progression elite | ≤ 0,05 ×/vk | Latella 2020 (PMID 32706692) | VERIFIOITU |
| Rep1 MPV slope per RIR | ~0,045 m/s | Sánchez-Moreno 2017 | VERIFIOITU |
| Failure-jälkeinen kuormapudotus | 5 % | Refalo 2023 | VERIFIOITU |

**Säännöt opittavien parametrien suhteen (vaihe 8a):**

1. Jokaisella opittavalla parametrilla on **prior** näistä tutkimusarvoista
2. Posterior saa terävöityä **vain priorin ±2 SD sisällä**
3. Jos posterior karkaa ±2 SD ulkopuolelle, engine emittoi `LEARNED_PARAM_OUTLIER`-tracen ja **clamppaa arvon takaisin priori-rajaan**
4. Stop hook (vaihe 6) varmistaa ettei /goal-kierros valmistu jos invarianteet rikkoutuvat

---

## 3. Acceptance criteria -periaate

Aukot, korjaukset ja uudet ominaisuudet muotoillaan testattaviksi kriteereiksi (A1, A2, …) ennen kuin /goal-kierros käynnistyy. Skeema: [docs/ACCEPTANCE_CRITERIA_SKEEMA.md](docs/ACCEPTANCE_CRITERIA_SKEEMA.md).

Esimerkki (8a, opittava parametri):

- **A1:** `learnedVlCap.strength` on aina välillä [0,15; 0,20]
- **A2:** Jos posterior karkaisi rajan ulkopuolelle, engine emittoi `LEARNED_PARAM_OUTLIER`-tracen ja clamppaa
- **A3:** Akselin pilot-regressio tuottaa identtiset kuorma-arvot baseline-versiona, ellei eksplisiittisesti todettu että oppiva malli muuttaa niitä; tällöin uudet arvot pysyvät invarianttien sisällä

**/goal-kierros ei valmistu** ennen kuin: koodi kääntyy + lint clean + selain-testit passaavat + regressio-pilot passaa + acceptance criterion -testi passaa + spec→koodi-diff tyhjä.

---

## 4. Stop hook -validointiketju

`.claude/settings.json` sisältää Stop hookin joka ajaa peräkkäin:

1. `node tools/engine-pilot/lib/smoke-test.mjs` — sanity check
2. `node tools/engine-pilot/run-pilot.mjs --profile=akseli-elite-streetlifter --scenario=full-16w` — bittitarkka regressio
3. `node tools/wizard-pilot.mjs` — wizard-materialisaation rakenteelliset invariantit (kalusto/MEV/cap/alaraaja/primaarit/duplikaatit; K5, retroauditti — engine-pilot + selaintestit ovat sokeita tälle pinnalle)
4. `node tools/browser-test/run-browser-tests.mjs` — KOKO selain-testisuite (?test=1) headless-selaimessa (riippuvuudeton CDP-ajuri, järjestelmän Edge/Chrome, ~3 s). Joka ajo tuoreella väliaikaisprofiililla → service worker -cache ei voi tuottaa stale-tuloksia (S10-premissivirheen 2026-07-03 oppi).

Jos mikä tahansa epäonnistuu (exit ≠ 0), hook palauttaa `exit 1` → Claude jatkaa työskentelyä eikä voi pinnata "valmis":ksi.

Selaintestit voi ajaa myös manuaalisesti selaimessa (`?test=1`) — mutta vertailuajoissa muista SW-purge, tai käytä headless-ajuria (kohta 4) joka on aina puhdas.

---

## 5. Sub-agent ja skill -käyttö

**Käytä Explore-agenttia** kun:

- Etsit "missä X on" tai "miten Y toimii" useammasta moduulista samaan aikaan
- Audit-tyyppinen luku jossa pakkaat tulokset tiiviiksi raportiksi

**Käytä suomen-kieli-skilliä** kun:

- Tuotat käyttäjälle näkyvää suomenkielistä tekstiä (UI-stringit, dokumentaatio)

**Käytä Plan-agenttia** kun:

- Suunnittelet ison muutoksen joka koskee 5+ tiedostoa

**Älä käytä:**

- Geneerisiä yleisluontoisia kehotteita ulkoisille tutkimuksille — ks. `docs/SYVATUTKIMUS_*` -mallit
- "Heitettyjä" /goal:eja jotka eivät ole muotoiltu acceptance criteria -tyyppisesti

---

## 6. Käyttäjä- ja tyylimuistutukset

- **Atletti = valmentaja, ei nanny** — engine ei yli-suojaa. Älä lisää tarpeettomia "varmistus"-cap:eja jotka eivät ole tutkimuspohjaisia.
- **UI-stringeissä EI tutkijanimiä** (Pareja-Blanco, Helms, Jukic, …). Tutkimusperusta säilyy koodikommenteissa.
- **Eliittitason itse-arviointi rehellisesti** — älä anna pyöreitä myötäileviä numeroita; nimeä puuttuvat pisteet konkreettisesti.
- **Tarkista git log + status ennen edit-vaiheita** — auto-memory-snapshot voi olla vanhentunut.

### 6.1 MITATTAVAA LUKUA EI KIRJOITETA PROOSAAN

**Jos luku on saatavissa ajamalla, sitä ei kovakoodata dokumenttiin.** Kirjoita sen
sijaan komento tai lähde josta luku syntyy.

Peruste on mitattu, ei periaatteellinen. Elokuussa 2026 tämä tiedosto väitti
selaintestejä olevan 854; todellinen luku oli 1024. Väitteen kaatoi riippumaton
verifiointi, ei kukaan lukija — eli virhe oli elänyt huomaamatta. Samaan aikaan
OBS-057 oli kirjaimellisesti "audit-checklist odottaa eläkkeelle jäänyttä kanavaa",
ja saman session commit-viestien rivinumeroviitteet vanhenivat YHDEN commitin
sisällä (jouduttiin korjaamaan errata-commitilla).

Nämä eivät vanhentuneet koska dokumentteja on paljon. Ne vanhentuivat koska
mitattavissa oleva asia kirjoitettiin ylös sen sijaan että se mitattaisiin.
Sama kuvio kuin [[stale_detector_pattern]]: staattinen väite toisen kerroksen
tilasta vanhenee hiljaa.

**Koskee:** testien määrä · profiilien määrä · sessioiden määrä · viikkojen määrä ·
storejen määrä · kattavuusprosentit · volyymikäyrät · **rivinumerot**.

**Käytännön säännöt:**

- Viittaa koodiin **funktionimellä, älä rivinumerolla** (`resolveSetPersistence`,
  ei `engine.js:238`). Rivinumerot vanhenevat seuraavassa commitissa.
- Jos rivinumero on pakko antaa, merkitse mistä versiosta se on laskettu.
- Generoitu artefakti kuuluu `tools/`-ajon outputiksi, ei `docs/`-hakemistoon
  versionhallintaan.
- Jos luku on argumentin kannalta olennainen, **kirjaa myös komento** jolla se
  tarkistetaan — silloin lukija voi falsifioida sen.

Poikkeus: **historialliset mittaustulokset** (esim. `docs/MEMORY.md`:n mittausloki,
OBS-kirjausten mitatut luvut, commit-viestien LOAD-DIFF-tulokset) ovat aikaleimattuja
havaintoja menneestä tilasta — ne EIVÄT vanhene, koska ne eivät väitä nykytilaa.

---

## 7. Kanavat ja lähdeauktoriteetti

LeVe AI:ta kehitetään kolmessa kanavassa. Jokaisella on oma roolinsa — älä sekoita niitä.

| Kanava | Rooli | Tuotos |
| --- | --- | --- |
| (a) Cowork | Analyysi, tutkimussynteesi, spec- ja `HANDOFF.md`-laadinta | `HANDOFF.md` |
| (b) Claude Code | Repon toteutus aktiivisen `HANDOFF.md`:n mukaan | Koodi, commitit |
| (c) Sparring-chat | Väliaikainen drift- ja konsistenssiauditointi | Huomiot — ei koodimuutoksia |

Kanava (c) on siirtymävaiheen apuväline. Sen rooli **kapenee** kun Cowork–Code-putki vakautuu; lopputavoite on että vain (a) ja (b) ovat tarpeen.

**Lähdeauktoriteetti — ristiriidan ratkaisujärjestys (ylin voittaa):**

1. Repon koodi (`engine.js`, `data.js`, …) — mitä koodissa *oikeasti* on
2. Tutkimusinvariantit (§2, `docs/TUTKIMUS_INVARIANTIT.md`)
3. Tämä CLAUDE.md
4. `ROADMAP.md` (strateginen vaihe) + aktiivinen `HANDOFF.md` (tehtävä)
5. Chat-muisti — *mistä tahansa kanavasta, mukaan lukien tämä sessio*

**Säännöt:**

- Jos chat (Cowork, Code tai sparring) väittää jotain mitä ei ole tasoilla 1–4 → **verifioi koodista, älä luota väitteeseen.** "Puhuimme tästä aiemmin" ei ole lähde.
- Jos saat ohjeen joka on ristiriidassa tasojen 1–4 kanssa → **pysähdy ja kerro ristiriidasta**, älä toteuta sitä hiljaa.
- Yhdellä työllä on täsmälleen yksi auktoritatiivinen `HANDOFF.md`. Ristiriitaiset suulliset ohjeet sovitetaan siihen *ennen* /goal-kierrosta — ei kesken.

---

## 8. Session-aloitus ja -lopetus

Tämä osio korvaa aiemman staattisen "Vaiheiden 1–8 tila" -taulukon. **Ajantasainen tila ei elä enää tässä tiedostossa.** Kolmen kerroksen työnjako: `CLAUDE.md` = pysyvät invariantit ja säännöt · `ROADMAP.md` = strateginen 20-vaiheinen R-sekvenssi + NYT-merkki · `HANDOFF.md` = yksi aktiivinen tehtävä. Näin ei synny kilpailevia tilannekuvia.

**Session ALUSSA (ennen mitään muutosta):**

1. Lue tämä CLAUDE.md kokonaan.
2. Lue [docs/SELKARANKA.md](docs/SELKARANKA.md) — Selkäranka 1–9, jokaisen muutoskierroksen pakollinen kurilista (PRE-FLIGHT, peruutusankkuri, scope-lukko, STOP-ehdot, …).
3. Lue `ROADMAP.md` — strateginen 20-vaiheinen R-sekvenssi, NYT-merkki (aktiivinen vaihe), reunaehdot (a)/(b)/(c) ja aikataulu.
4. Lue repo-juuren `HANDOFF.md` — aktiivisen tehtävän tavoite, acceptance criteriat ja edellisen session tulos.
5. Lue [docs/MEMORY.md](docs/MEMORY.md) — distilloidut opit (konsultoi ennen työtä; session lopussa distill-kirjaus, P-013 M4).
6. Aja `git log --oneline -10` ja `git status`. Varmista että `HANDOFF.md`:n "Session-tulos" vastaa repon todellista tilaa. Ristiriidassa → repo voittaa (§7), kerro erosta.
7. Jos `HANDOFF.md`:ssä on avoimia kysymyksiä (osio 6) → kysy ne ennen toteutusta, älä arvaa.

**Session LOPUSSA (ennen kuin pinnaat työn valmiiksi):**

1. Täytä `HANDOFF.md`:n osio 7 "Session-tulos": muuttuneet tiedostot, tehdyt päätökset, mikä jäi auki, seuraava askel.
2. Jos tehtävä on valmis → arkistoi `HANDOFF.md` polkuun `docs/handoffs/HANDOFF_<id>.md` ja nollaa repo-juuren `HANDOFF.md` tyhjäksi pohjaksi. Jos koko `ROADMAP.md`-vaihe sulkeutui → siirrä NYT-merkki seuraavaan vaiheeseen.

---

## 9. EQUIP PROSESSI — M2-operointitapa (thin-harness, P-010)

> M2/OBS-022 + K-A6D-kierroksien opit destilloituna kierroskuriksi. Tämä ei korvaa Selkärankaa (`docs/SELKARANKA.md`, 1–9) vaan täydentää sitä substantiaalisissa SHAPE/design/code-muutoksissa. Banaaleihin patch-fix:eihin näitä ei tarvitse soveltaa.

1. **DESIGN ≠ mekaaninen.** Avointa designia EI aja /goal-kierroksena. `/goal` vain tarkistettavalle ehdolle (acceptance criterion, mittari, regressio-portti). Designkysymys → Plan-agentti tai Cowork-keskustelu ratifiointiin ennen toteutusta.

2. **Plan mode ENNEN toteutusta.** Päätä what/how Plan-agentilla (tai EnterPlanMode-tilassa) ennen edit-vaihetta — estää **runtime-premissi-reversion** (= matkalla toteutukseen premissi muuttuu sub-implisiittisesti, ja A1-juurianalyysi käännetään takaperin).

3. **A1 read-only runtime-first → STOP → A2.** Diagnoosivaihe on read-only ja ratifioidaan STOPilla ennen A2-FIXiä. ÄLÄ niputa A1+A2 samaan kierrokseen — A1:n raportoitu juuri on syöte Akselin ratifiointiin, ei oletus jonka päälle rakentaa fixiä.

4. **Kuormamuutos → LOAD-DIFF-SWEEP push-ehto.** Jos muutos voi vaikuttaa `recommend()`-kuormaan, pre-vs-post-vertailu (sama profiili, sama seed) on push-ehto. F-2-oppi: **yksisuuntainen invariantti on sokea yli-korjaukselle** — vain numeerinen diff paljastaa. Jos rakenteellinen analyysi todistaa kuorma-neutraalin (esim. signaali ei ole recommend()-input), tämä raportoidaan eksplisiittisesti ja diff-vertailu voi olla rakenteellinen.

5. **Checkpoint ennen design-pivottia.** Jos kesken kierroksen avautuu uusi designkysymys (premissi muuttuu, scope laajenee, A1-juuri ei pidäkään) → STOP, raportoi, kysy ennen pivot:ia. Älä ratko sitä autonomisesti samassa kierroksessa.

6. **Effort-jako.** Design (acceptance criteria, premissi, scope, A1-juurianalyysi) → Opus high / xhigh. Mekaaninen toteutus (Edit/Write, runtime-vakio-vaihtoja) → Sonnet. Tämä on kustannus- ja tarkkuus-optimointi, ei statushierarkiaa. *Post-Fable-routing ja kompensaatiot (12.7.2026 alkaen): ks. §10.*

7. **Agent-arkkitehtuuri ei ylirakennettu.** Yksi muutos / yksi liittyvä tiedostosarja → solo-Agent (Plan/Explore tarvittaessa). Useita riippumattomia tiedostosarjoja samassa kierroksessa → Agent Teams `--max-budget`-cap:llä. ÄLÄ käytä Teams:ia banaalille edit-pinolle — overhead ylittää hyödyn.

8. **STOP ennen pushia AINA.** Push = Akselin ratifiointi rakenteelliselle/irreversiibelille muutokselle (Selkäranka kohta 8). CC ei push:aa — vaikka kaikki vihreää.

---

## 10. P-013 — Post-Fable-operointi (Fable-ikkuna suljettu 12.7.2026)

> Fable-ikkuna (alkup. M5–M6, → 22.6.2026; jatkui käytännössä H-019:n yli) **suljettu 12.7.2026 Akselin päätöksellä** H-019-sulun yhteydessä. Mittausloki + sulkuyhteenveto: `docs/MEMORY.md` osio 3. Tämä osio korvaa aiemman M5/M6-sisällön; **M1–M4 säilyvät ennallaan** (M1–M3 `HANDOFF.md`-headerissä, M4 `docs/MEMORY.md` + §8 kohta 5). Osio ei muuta §9:n sääntöjä.

**Model routing (12.7.2026 alkaen):**

- Lead: **Opus** (design, A1-juurianalyysit, acceptance-kriteerit); mekaaninen exec: **Sonnet** (§9.6 ennallaan).
- P-011 5. taso säilyy kriteerinä tuleville ikkunoille: *"Mythos-luokka vain compound-tason batch-handoffeihin ja pitkiin autonomisiin ajoihin"* — uusi Fable/Mythos-ikkuna vain Akselin eksplisiittisellä avauksella.

**Kompensaatiot (Fable→Opus-siirtymä, Akseli ratifioi 12.7.2026 — kaikki neljä ovat kierroskuria, eivät suosituksia):**

1. **M3-verifier-kynnys matalammaksi:** riippumaton verifier-subagentti **jokaiseen kuormia muuttavaan kierrokseen** — ei vain batch-handoffien STOP-raportteihin.
2. **STOP-pisteet tiheämmin ja sessiot kapeampina:** yksi löydös / design-kysymys per kierros; leveitä autonomisia kaaria vältetään.
3. **"Näytä trace, älä väitä" -default kaikkiin numeroraportteihin:** jokainen kuorma-, %- ja diff-luku johdetaan näkyvästä trace/dump-datasta, ei mallin omasta laskusta.
4. **LOAD-DIFF-sweep push-ehtona säilyy ehdottomana** (§9.4).

Selkäranka (`docs/SELKARANKA.md`) ja Stop hook -portit (§4) eivät muutu — ne eivät riipu mallista.
