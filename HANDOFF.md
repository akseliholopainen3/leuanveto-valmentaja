# HANDOFF.md — aktiivinen Cowork → Code -toimeksianto

> Repon **ainoa aktiivinen handoff**. Cowork täyttää osiot 0–6, Claude Code täyttää osion 7.
> Valmis handoff arkistoidaan → `docs/handoffs/HANDOFF_<id>.md`, ja tämä tiedosto nollataan tyhjäksi pohjaksi.
> Auktoriteettijärjestys: ks. `CLAUDE.md` §7. Session-protokolla: ks. `CLAUDE.md` §8. Kurilista: `docs/SELKARANKA.md`. Muisti: `docs/MEMORY.md`. Post-Fable-operointi: `CLAUDE.md` §10.
>
> *Tila: **H-022 AKTIIVINEN** — ratifioitu 23.8.2026. Lähde: `SYVATUTKIMUS_GAMMA` (Cowork 23.8.) + Coden PRE-FLIGHT/mittausraportti. Draft v3 siirretty tähän sellaisenaan; AC-tiedosto `docs/AC_H-022.md`.*

---

# H-022 — Taper-integriteetti: suunniteltu slot-% sitoo

## 0. Metadata

| Kenttä | Arvo |
| --- | --- |
| Handoff-id | **H-022** (H-020 = MU-yritys-%-semantiikka, H-021 = OBS-058 pysyvät varattuina kandidaatteina) |
| Tyyppi | `debug` (confirm-then-fix; käytös muuttuu TARKOITUKSELLA rajatussa joukossa → regressio-odotus deklaroitu A4:ssä) |
| Laadittu | 23.8.2026 Cowork (v1) · v2 Coden PRE-FLIGHT-raportista · v3 Coden tarkennuksista · siirretty repoon 23.8. |
| Tila | **AKTIIVINEN — A1 VALMIS (molemmat kanavat), A2+A3 seuraavaksi** |
| Liittyy R-vaiheeseen | post-γ / ennen seuraavan ohjelmablokin käynnistystä |
| Pohja-HEAD | `9443ec2` (pushattu 23.8.; PRE-FLIGHT tehtiin `898b1a2`:sta) |
| Versiot | APP_VERSION 4.64.0 · PROGRAM_BUILD_VERSION 4.59.0 |

**Repo-tila jonka v1 ei tuntenut** (12.–22.8., kuusi versiota 4.59.0→4.64.0): O1/O2/O3/O4/O7/O8/O9 korjattu; vk 17 -kisaviikko lisätty (`8c8fa65`); kisapäivän kadonnut 3. yritys korjattu (`1c55c00`) → poistettu γ-synteesin haittaavien listalta.

**Todistedatan ikäys — RATKAISTU:** tuore snapshot 23.8. (49 384 tracea, 4.64.0-koodia vasten) ajettu → v3:n ikäysvaraus poistui. Cowork ristiinverifioi 17.8. snapshotilla.

## 1. Tavoite

Suunniteltu slot-intensiteetti materialisoituu toteutuneeksi kuormaksi: kun viikkosuunnitelman slotilla on eksplisiittinen kevennystarkoitus (deload/taper-viikon `loadPct` / `nominalLoadPct`), resolvoitu kuorma vastaa sitä — **mikään myöhempi kerros (progressio, regain, reps-johdettu odotusprosentti) ei hiljaisesti ylikirjoita suunniteltua kevennystä.** Kevyeksi ohjelmoitu viikko on kevyt.

## 2. Acceptance criteria

Täysi versio mittauksineen: **`docs/AC_H-022.md`**. Tiivistelmä:

| | kriteeri | tila |
| --- | --- | --- |
| **A1** | CONFIRM: kaksikanavainen diagnostiikka sitovan vaiheen dumpilla (STOP-GATE, vain-luku) | ✅ **VALMIS** — molemmat kanavat |
| **A2** | FIX (PÄÄKORJAUS): deload/taper-floor progressiokerrosta vasten | odottaa A1:tä |
| **A3** | FIX — **VÄLTTÄMÄTÖN** (ei enää ehdollinen, ks. §7): plan-pct:n auktoriteetti vReps-fallbackia vasten | kynnys täyttyi A1:ssä |
| **A4** | Regressio-pilot deklaroidulla odotuksella (Selkäranka 6) | — |
| **A5** | Poikkeama ei ole koskaan hiljainen; sitova vaihe traceen (ml. CROSSREF/_OWN-rivit) | — |

## 3. Reunaehdot ja scope-aita

**Invariantit (CLAUDE.md §2):** deload −20…−30 % (Helms 2018) — handoffin ydin on tämän materialisointi; VL-capit ennallaan; elite-progressio ≤0,05×/vk ennallaan; ei kosketa priorien arvoja.
**CLAUDE.md 6.1:** koodilokukset funktionimin, ei rivinumeroin (rivinumerot vain A1-dumpin aikaleimattuina havaintoina).

**EI kosketa:** e1RM-laskenta/mediaani/roolikato (OBS-058 = H-021) · Vx/Vara-logiikka · break/regain-kokonaiskorjaus (paitsi A2-floor deload/taper-viikoilla) · kisapäivä-ankkurointi · ohjelman ulkopuolisen session kirjaus · OBS-049- ja attemptsPct-semantiikka · UI-flowt (paitsi A5-näkyvyys) · index.html-testikatto (OBS-059) · liikehaku (OBS-060) · mesosykli-spawn-vuoto.

**Sallittu diff (funktionimin):** `engine.js` — cross-ref-haara (`loadPctReferenceMovementName`/`refScale`/`nominalLoadPct`-polku), `computeProgressionTarget`-kutsuketju deload/taper-floorin osalta, ja VAIN jos A3 toteutuu: `vRepsToExpectedPct`-kutsupaikat resolveripolussa · engine-tason testit · `docs/AC_H-022.md` · tämän tiedoston §7. **STOP jos diff ylittää valkolistan.**

**Selkäranka:** PRE-FLIGHT ✅ (23.8., HEAD `898b1a2`) · peruutusankkuri `backup-pre-H-022-898b1a2` ennen A2:ta (A1 vain-luku) · per-löydös oma commit + Stop hook + pilot · STOP-ehdot imperatiiveina · **EI push originiin ilman Akselin lupaa.**

## 4. Atletti-vastaukset

Ei sovellu (`debug`). Ratifioinnissa kuitatut parametrit: toleranssi **± 2 pp**; poikkeusluokat A2:n ulkopuolella (OBS-049-top-singlet + attemptsPct).

## 5. Taustapäätökset

- **P0 (KÄÄNTÖ):** v1 painotti plan-pct-auktoriteettia. Code kokeili sitä 13.8. `vRepsToExpectedPct`-kutsupaikoissa → **LOAD-DIFF 0** → perui. Mitattu sitoja havaitulle tapaukselle: cross-ref-baseLoad oikein (112,0 kg) → `computeProgressionTarget` ylikirjoittaa → 155,5 kg. Siksi **A2 = pääkorjaus, A3 = ehdollinen.**
- **P0b:** harness-sweep ei yksin vastaa "mikä vaihe sitoi" — synteettiseltä atletilta puuttuu kuormahistoria. A1 on kaksikanavainen; **kanavien ero on löydöskategoria.**
- **P0c (23.8., kanava 2):** trace-kanava on **skeemaltaan sokea** cross-ref-sitojalle — `SLOT_LOAD_RESOLVED_CROSSREF`/`_OWN` eivät kanna `pctForResolve`-kenttää kummassakaan snapshotissa. Kaksikanavaisuus ei ole varotoimi vaan välttämättömyys. A5 laajennettava näihin riveihin.
- **P1** (demotoitu → A3) · **P2** (promotoitu → A2) · **P3** toleranssi ± 2 pp, poikkeama ei koskaan hiljainen · **P4** poikkeusluokat · **P5** lokusviittaukset funktionimin.

**Hylätyt:** ~~aloita plan-pct-korjauksesta~~ (LOAD-DIFF 0) · ~~A1 pelkkänä harness-sweepinä~~ · ~~OBS-058 ensin~~ · ~~poista vRepsToExpectedPct~~ · ~~korjaa näyttökerroksessa~~ · ~~batchaa break/regain-kokonaiskorjauksen kanssa~~.

## 6. Avoimet kysymykset

1. **Regain vs. kevennysfloor** — ratifioitu: **ei koskaan** ylitä deload/taper-viikon plan-tasoa. Perustelu mitattu: `RETURN_FROM_BREAK` (−5…−15 %) ja `PROGRESSION_REGAIN_FAR ×2.0` ajoivat samassa sessiossa vastakkaisiin suuntiin (leuka-target 70 → 84 kg) kummankaan näkymättä atleetille.
2. **A3:n kohtalo** — ratifioitu: päätetään A1-STOPissa, **kaksikanavaisella kynnyksellä**.
3. **Poikkeusluokkien täydellisyys** — AVOIN. Kanava 2 (Cowork 23.8.) osoitti listan olevan laajempi kuin OBS-049 + attemptsPct: `weekPlans`-rakenteesta puuttuu `loadPct` myös 26 dippi- ja 25 CTB-leukaslotilta. **Kanava 1 tuottaa auktoritatiivisen luettelon.**
4. **H-numero** — kuitattu: H-022.

## 7. Session-tulos  *(Claude Code, 23.8.2026)*

| Kenttä | Arvo |
| --- | --- |
| Sessio päättyi | 23.8.2026 |
| Muuttuneet tiedostot | `HANDOFF.md` · `docs/AC_H-022.md` · `tools/coach-judge/a1-binding-stage.mjs` · `tools/coach-judge/a1-harness-sweep.mjs` |
| Validointi | A1 ajettu MOLEMMILLA kanavilla; kanavaristiriita ratkaistu |
| HEAD | `9443ec2` (pushattu) |

### Tehdyt päätökset

1. **A1 valmis, STOP-GATE saavutettu.** Molemmat sitojat todellisia ja eri poluilla: primary/non-primary → `vRepsToExpectedPct` (harness 44 · tracet 976/2413, yksisuuntaisia); cross-ref → `computeProgressionTarget` (16). **A3 ei ole ehdollinen vaan välttämätön.**
2. **P0 kumottu.** Coden 13.8. LOAD-DIFF 0 -mittaus oli virheellinen: harnessin liikekatalogilta puuttui `tier`, ja vReps-haara vaatii tier 1/2/3 → haara ei suorittunut. Coworkin v1-hypoteesi oli oikeassa. Yksityiskohdat: `docs/AC_H-022.md`.

### ⚠ SCOPE LAAJENNETTU — Akseli ratifioi 23.8. (vaihtoehto 3)

H-022 kattaa nyt KAKSI ongelmaa, ei yhtä:

- **A — kevennysviikot eivät kevene** (mitattu 976 kertaa, aina ylöspäin). Alkuperäinen scope.
- **B — kevennysviikkoja on liikaa peräkkäin.** UUSI. Akselin kysymys 23.8.: *"miksi ihmeessä viikko 16 olisi kevennys, kun juuri olin mökillä keventämässä?"* Mitattu: **6 peräkkäistä kevennysviikkoa, vk 12–17.** Ohjelma kohtelee mökkiviikkoa normaalina treeniviikkona ja rakentaa taperin sen päälle sen sijaan että laskisi sen viimeisestä oikeasta treeniviikosta.

**Kytkös joka pakotti vaihtoehdon 3:** A:n korjaaminen yksin tekee seuraavasta taperista SYVEMMÄN kuin tämä oli — eli pahentaa B:tä. Niitä ei voi korjata erikseen.

### Kevennysviikon tunnistin — käytä tätä, älä keksi uutta

**Volyymipohjainen: viikko on kevennysviikko jos sen sarjamäärä < 85 % perustasosta** (perustaso = 8 suurimman viikon keskiarvo). Tuottaa 16 vk:n ohjelmalle: **4, 8, 12, 13, 14, 15, 16, 17.**

Kaksi hylättyä kriteeriä (älä toista):

- `deltaPctBase < 0` — **kenttä on tyhjä kaikilla 17 viikolla** → nolla osumaa
- Intensiteettipohjainen (maxPct < 80 %) — leimaa hypertrofiaviikot 1–6 kevennykseksi; matala prosentti on niissä oikein, ei kevennystä

### B:n mittari

**Peräkkäisten kevennysviikkojen maksimijakso.** Nyt **6** (vk 12–17). Tavoite **≤ 2–3.**

### Seuraava askel

1. Peruutusankkuri `backup-pre-H-022-9443ec2` ENNEN ensimmäistä koodimuutosta
2. A2 + A3 yhdessä (molemmat sitojat), B:n rajoite mukana
3. LOAD-DIFF-sweep + neljä porttia + A4-luokittelu
4. STOP ennen pushia

### Avoin kysymys Akselille (kysyttiin, ei vastattu)

**Pitäisikö Muscle-upilla olla ohjelmoitu prosentti** kuten muilla kisaliikkeillä, vai onko absoluuttinen kg-ohjaus oikea sille liikkeelle? MU esiintyy §6-3:n listalla primarynä 10× (ei plan-%:a) — voi liittyä siihen että appin MU-arvio oli 5,3 kg todellisen ollessa 17,5.

### Raportointitapa — sitova

**Raportoi Akselille treenikielellä** (kilot, viikot, sarjat), koodidetalji vain pyydettäessä. `docs/MEMORY.md` oppi 5. Tätä rikottiin koko H-022:n ajan, ja Akselin paras haaste (mökkiviikko-kysymys) tuli vasta kun raportti käännettiin kiloiksi. Ratifiointipyyntö on muotoiltava niin että Akseli voi arvioida sen — jos sitä ei osaa kysyä treenikielellä, muutosta ei ole ymmärretty itsekään.
