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
| Tila | **A1–A6 VALMIIT — odottaa push-ratifiointia (§7)** |
| Liittyy R-vaiheeseen | post-γ / ennen seuraavan ohjelmablokin käynnistystä |
| Pohja-HEAD | `2eade41` (pushattu 23.8.) · peruutusankkuri `backup-pre-H-022-2eade41` |
| Versiot | APP_VERSION 4.65.0 · PROGRAM_BUILD_VERSION 4.65.0 (molemmat bumpattu A6:ssa) |

**Repo-tila jonka v1 ei tuntenut** (12.–22.8., kuusi versiota 4.59.0→4.64.0): O1/O2/O3/O4/O7/O8/O9 korjattu; vk 17 -kisaviikko lisätty (`8c8fa65`); kisapäivän kadonnut 3. yritys korjattu (`1c55c00`) → poistettu γ-synteesin haittaavien listalta.

**Todistedatan ikäys — RATKAISTU:** tuore snapshot 23.8. (49 384 tracea, 4.64.0-koodia vasten) ajettu → v3:n ikäysvaraus poistui. Cowork ristiinverifioi 17.8. snapshotilla.

## 1. Tavoite

Suunniteltu slot-intensiteetti materialisoituu toteutuneeksi kuormaksi: kun viikkosuunnitelman slotilla on eksplisiittinen kevennystarkoitus (deload/taper-viikon `loadPct` / `nominalLoadPct`), resolvoitu kuorma vastaa sitä — **mikään myöhempi kerros (progressio, regain, reps-johdettu odotusprosentti) ei hiljaisesti ylikirjoita suunniteltua kevennystä.** Kevyeksi ohjelmoitu viikko on kevyt.

## 2. Acceptance criteria

Täysi versio mittauksineen: **`docs/AC_H-022.md`**. Tiivistelmä:

| | kriteeri | tila |
| --- | --- | --- |
| **A1** | CONFIRM: kaksikanavainen diagnostiikka sitovan vaiheen dumpilla (STOP-GATE, vain-luku) | ✅ **VALMIS** — molemmat kanavat |
| **A2** | FIX: plan-pct sitoo cross-ref-sloteilla progressiokerrosta vasten (**rajaus muuttui: slottitaso, kaikki viikot** — ks. §7) | ✅ **VALMIS** — `646da1b` |
| **A3** | FIX: plan-pct:n auktoriteetti vReps-fallbackia vasten kevennysviikoilla | ✅ **VALMIS** — `646da1b` |
| **A4** | Regressio-pilot deklaroidulla odotuksella (Selkäranka 6) | ✅ **VALMIS** — 433/442 bittitarkkaa, 9 luokiteltua |
| **A5** | Poikkeama ei ole koskaan hiljainen; sitova vaihe traceen (ml. CROSSREF/_OWN-rivit) | ✅ **VALMIS** — `646da1b` |
| **A6** | vk 17:n puuttuva viikkomäärittely (uusi, ratifioitu 23.8.) | ✅ **VALMIS** — `9357d67` |

## 3. Reunaehdot ja scope-aita

**Invariantit (CLAUDE.md §2):** deload −20…−30 % (Helms 2018) — handoffin ydin on tämän materialisointi; VL-capit ennallaan; elite-progressio ≤0,05×/vk ennallaan; ei kosketa priorien arvoja.
**CLAUDE.md 6.1:** koodilokukset funktionimin, ei rivinumeroin (rivinumerot vain A1-dumpin aikaleimattuina havaintoina).

**EI kosketa:** e1RM-laskenta/mediaani/roolikato (OBS-058 = H-021) · Vx/Vara-logiikka · break/regain-kokonaiskorjaus (paitsi A2-floor deload/taper-viikoilla) · kisapäivä-ankkurointi · ohjelman ulkopuolisen session kirjaus · OBS-049- ja attemptsPct-semantiikka · UI-flowt (paitsi A5-näkyvyys) · index.html-testikatto (OBS-059) · liikehaku (OBS-060) · mesosykli-spawn-vuoto.

**Sallittu diff (funktionimin):** `engine.js` — cross-ref-haara (`loadPctReferenceMovementName`/`refScale`/`nominalLoadPct`-polku), `computeProgressionTarget`-kutsuketju deload/taper-floorin osalta, ja VAIN jos A3 toteutuu: `vRepsToExpectedPct`-kutsupaikat resolveripolussa · engine-tason testit · `docs/AC_H-022.md` · tämän tiedoston §7. **STOP jos diff ylittää valkolistan.**

**⚠ VALKOLISTAN LAAJENNUS — Akseli ratifioi 23.8.2026 (A6).** Yllä oleva lista ei kata vk 17:n puuttuvaa viikkomäärittelyä, joka löytyi tämän kierroksen mittauksissa ja on samaa vikaluokkaa (kevyeksi tarkoitettu viikko ei ole kevyt). Laajennus: `data.js` — `createStreetlifting16WMesocycle`-funktion `weekDefs` + `PROGRAM_BUILD_VERSION` · `sw.js` — `APP_VERSION`. Molemmat versiobumpit ovat pakollisia, eivät valinnaisia: ilman `PROGRAM_BUILD_VERSION`-bumppia rivi ei siirry Akselin olemassa olevaan asennukseen (`docs/MEMORY.md` oppi 6). Lisäksi mittaustyökalu `tools/coach-judge/a2-plan-floor-sweep.mjs` (vain-luku, ei tuotantopolkua).

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
3. **Poikkeusluokkien täydellisyys** — RATKAISTU. Kanava 1 tuotti auktoritatiivisen luettelon (325 slottia, 44 uniikkia liike- ja rooliparia). Ne rajautuvat ulos mekaanisesti: prosenttia, jota ei ole, ei voi sitoa. Erikseen ulos rajattu `attemptsPct` (6 kpl) ja OBS-049-top-singlet. Lopullinen tila: `docs/AC_H-022.md` §6-3.
4. **H-numero** — kuitattu: H-022.

## 7. Session-tulos  *(Claude Code, 23.8.2026 — toinen sessio)*

| Kenttä | Arvo |
| --- | --- |
| Sessio päättyi | 23.8.2026 |
| Pohja-HEAD | `2eade41` · peruutusankkuri `backup-pre-H-022-2eade41` |
| Commitit | `646da1b` (A2+A3+A5 + lukkotestit) · `9357d67` (A6: vk 17 + versiot) · tämä doc-commit |
| Versiot | APP_VERSION 4.65.0 · PROGRAM_BUILD_VERSION 4.65.0 |
| Muuttuneet tiedostot | `engine.js` · `test-runner.js` · `data.js` · `sw.js` · `docs/AC_H-022.md` · `HANDOFF.md` · `tools/coach-judge/a2-plan-floor-sweep.mjs` (uusi) |
| Portit | smoke ✅ · engine-pilot 64/64, 0 virhettä, 🐛 0 ✅ · wizard-pilot 11/11 ✅ · selaintestit 1034/1034 ✅ |
| Tila | **A1–A6 valmiit. Odottaa push-ratifiointia (Selkäranka 8).** |

### ⚠ EDELLISEN SESSION §7 KUMOTTIIN MITTAUKSELLA

Kaksi kohtaa aiemmasta §7:stä osoittautui virheellisiksi. Ne on kirjattu tähän,
koska kumpikin ehti ratifioinnin läpi ja ohjasi suunnittelua väärään suuntaan.

**1. "Kevennysviikon tunnistin: volyymipohjainen, koska `deltaPctBase` on tyhjä
kaikilla 17 viikolla."** Kenttä ei ole tyhjä. Se asuu `weekDefs`-listalla, ei
`weekPlans`-listalla, ja on täytetty kaikilla 16 viikkomäärittelyllä
(vk 4/8/12/15/16 = −25/−25/−20/−15/−25 %). Engine käyttää sitä jo:
`computeProgressionTarget`-funktion `isDeload` on täsmälleen `deltaPctBase < 0`,
ja 23.8. snapshotissa on 755 `PROGRESSION_DELOAD_PASSTHROUGH`-osumaa.
**Ratifioitu tilalle:** `deltaPctBase < 0`. Perustelut ja instrumenttioppi 5:
`docs/AC_H-022.md`.

**2. Scope-laajennus B ("kevennysviikkoja on liikaa peräkkäin") — POISTETTU
H-022:sta.** Mittari *"6 peräkkäistä kevennysviikkoa, vk 12–17"* oli
volyymitunnistimen artefakti. Se laski kevennykseksi myös vk 13:n (mökkiviikko,
joka on ohjelmassa: päivien nimet *"🌲 Mökki: aktiivinen palautuminen / kevyt
body weight / lepopäivä"*, ja vk 14:n päivät on nimetty *"(paluu mökiltä)"*) ja
vk 14:n (Peaking, 2 × 1 @ 93 %, Δ +10 % — blokin kovin viikko).
Ohjelmoituja kevennyksiä on **viisi** ja pisin peräkkäisjakso **kaksi** — B:n oma
tavoite (≤ 2–3) täyttyi jo ennen mitään muutosta. Myös §7:n premissi *"ohjelma
kohtelee mökkiviikkoa normaalina treeniviikkona ja rakentaa taperin sen päälle"*
kaatui: taper on rakennettu mökkiviikon **ympärille**, ei sen päälle.

### Tehdyt päätökset (Akseli ratifioi 23.8.)

1. **Kevennysviikon tunnistin** = `deltaPctBase < 0` (enginen oma määrittely).
2. **Scope B** poistetaan H-022:sta.
3. **A2:n rajaus muuttui:** slottitaso, kaikki viikot — ei viikkoluokka. Syy
   mitattu: cross-ref-ylityksiä on 4 ja **kaikki työviikoilla**, joten A2 olisi
   kirjatussa muodossaan (`deltaPctBase < 0`) ollut no-op. Myös AC:n oma
   known-positive (vk 14, Δ +10 %) on työviikko.
4. **A3:n rajaus:** vain kevennysviikot. Työviikkojen 17 vReps-ylitystä
   (+12…+21 pp) jäävät ennalleen.
5. **A6 (uusi):** vk 17:n puuttuva viikkomäärittely korjataan H-022:n sisällä.

### Mitä atletti näkee

| slotti | ennen | jälkeen |
| --- | --- | --- |
| vk 4 TI takakyykky back-off (ohjelmoitu 44 %) | 135 kg | **82 kg** |
| vk 8 TI takakyykky back-off (46 %) | 142 kg | **86 kg** |
| vk 12 TI takakyykky back-off (44 %) | 145 kg | **82 kg** |
| vk 14 LA "kisakyykky kevyt" (60 %) | 179 kg | **113 kg** |
| vk 1–3 LA kevyt kyykky | 134 / 139 / 147 kg | 94 / 104 / 109,5 kg |

Luvut Akselin omilla asetusarvoilla (kyykky 185, leuka 85, dippi 95). Muut
kuormat säilyivät ennallaan: 433 slottia 442:sta bittitarkkoja.

### Mikä jäi auki

1. **Muscle-upin ohjelmoitu prosentti** — kysyttiin edellisessä sessiossa, ei
   vastattu. MU esiintyy primarynä 10 × ilman plan-prosenttia. Liittyy siihen,
   että sovelluksen MU-arvio oli 5,3 kg todellisen ollessa 17,5 kg.
2. **Kisapäivän kyykkyslotti resolvoituu liikkeen omasta historiasta**
   (`SLOT_LOAD_RESOLVED_OWN`, vReps 0,896) eikä `attemptsPct`-listasta. Ennestään
   olemassa oleva käytös, scope-aidan ulkopuolella (*"kisapäivä-ankkurointi"*).
   Kirjattu havainnoksi, ei korjattu.
3. **Työviikkojen vReps-ylitykset** (17 slottia, +12…+21 pp) — ratifioitu
   jätettäväksi ennalleen. Jos ne halutaan myöhemmin kiinni, sama cap laajenee
   yhdellä ehdolla.
4. **Mesosykli-spawn-vuoto** — 185 mesosykliä snapshotissa, 0 aktiivista.
   Scope-aidan ulkopuolella, ennallaan.

### Seuraava askel

1. **STOP — push odottaa Akselin lupaa** (Selkäranka 8). Palautus tarvittaessa:
   `git reset --hard backup-pre-H-022-2eade41`.
2. Pushin jälkeen: arkistoi tämä tiedosto → `docs/handoffs/HANDOFF_H-022.md` ja
   nollaa repo-juuren `HANDOFF.md`.
3. Puhelinverifiointi kannattaa tehdä vasta seuraavan blokin rakentuessa —
   tämän blokin viikot ovat takanapäin, joten muutokset näkyvät vasta uudessa
   ohjelmassa.
