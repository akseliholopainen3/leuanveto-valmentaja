# HANDOFF.md — aktiivinen Cowork → Code -toimeksianto

> Repon **ainoa aktiivinen handoff**. Cowork täyttää osiot 0–6, Claude Code täyttää osion 7.
> Valmis handoff arkistoidaan → `docs/handoffs/HANDOFF_<id>.md`, ja tämä tiedosto nollataan tyhjäksi pohjaksi.
> Auktoriteettijärjestys: ks. `CLAUDE.md` §7. Session-protokolla: ks. `CLAUDE.md` §8. Kurilista: `docs/SELKARANKA.md`. Muisti: `docs/MEMORY.md`. Post-Fable-operointi: `CLAUDE.md` §10.
>
> *Tila: **EI AKTIIVISTA HANDOFFIA.** Edellinen: H-022 (+ H-021) arkistoitu 23.8.2026, pushattu `5d0100f`. Seuraava työ odottaa Akselin ratifiointia — ks. konteksti alla.*

---

## KONTEKSTI SEURAAVAAN TYÖHÖN — rakennusikkuna 23.8.–n. 1.11.2026

**Päätös 23.8.2026 (Akseli):** atletti ajaa **King Of Weighted -valmentajan 10 viikon offseason-ohjelman** KoW:n omassa sovelluksessa, ei LeVessä. Syy: LeVe ei osaa ajaa heidän ohjelmaansa (kuusi progressiomallia per liike vs. meidän yksi), eikä sitä kannata pakottaa kirjuriksi ohjelmalle jota se ei ymmärrä — toteutuma oli edellisessä blokissa 56 %, ja kitkan lisääminen uhkaa juuri sitä muuttujaa.

**Tästä seuraa kaksi asiaa:**

1. **LeVe ei ole tuotantokäytössä ~10 viikkoon.** Tämä on rakennusikkuna: rakenteelliset muutokset voi tehdä ilman elävän blokin painetta.
2. **Kymmenen viikon päästä saadaan ensimmäinen vertailukohta.** Atletti tuo KoW-datan (mieluiten export; muuten kisalajien viikoittainen kuorma + RPE) → ajetaan meidän engine samasta historiasta jälkikäteen → mitä *se* olisi määrännyt. Väliraportti vk 4:n kohdalla jos mahdollista.

**Lähtötaso lukittu (mock meet 22.8.2026):**

| | kg |
| --- | --- |
| Lisäpainoleuanveto | 84 |
| Lisäpainodippi | 100 |
| Takakyykky | 180 |
| **Kolmen lajin total** (vertailukelpoinen KoW:n lupaukseen) | **364** |
| Muscle-up | 17,5 |
| **Sinun kisatotal, 4 lajia** | **381,5** |

KoW:n lupaus on +40–50 kg **kolmen lajin** totalissa → tavoite 404–414 kg. **KoW:n ohjelma ei progressoi lisäpaino-MU:ta lainkaan** (Bar Muscle Up ja No Dip Bar Muscle Up ovat ilman lisäpainoa, RPE 6–7 muotoharjoitteluna). Jos MU ei liiku, se ei ole ohjelman epäonnistuminen — se on asia jota se ei yritä.

**Vk 4 -mittari (sovittu):** kisakyykyn, -leuan ja -dipin kuorma **samalla RPE:llä** (5,5) viikoilla 1 → 4 → 7 → 10. KoW antaa tämän ilmaiseksi, koska mikään ohjelmassa ei muutu blokkien välillä paitsi kisalajien toistot.

## MITÄ VERTAILU PALJASTI MEIDÄN ENGINESTÄ — neljä aukkoa

Mitattu 23.8. (`createStreetlifting16WMesocycle` 4.65.0 vs. KoW:n ruutukaappaukset):

1. **Progressiomalli per liike puuttuu.** KoW: kuusi nimettyä mallia (Double progression · RPE progression · Bi-weekly · Slow start (RPE) · Performance reps · kiinteä), assignoituna liikekohtaisesti. Meillä: yksi globaali moottori. **Suurin toiminnallinen ero.**
2. **Preskription kattavuus 26 %.** 444 slotista **327 (74 %) ilman plan-%:a**, 150 (34 %) ilman Vx-tavoitetta, **144 (32 %) ilman kumpaakaan**. Apuliikkeistä 42 % on tässä luokassa. KoW: jokaisella liikkeellä on kuorma tai RPE, oma 1RM ja progressiomalli — Side Bends 1RM 13 kg mukaan lukien.
3. **Vakaa mittauspiste puuttuu kokonaan.** KoW pitää 16 liikettä identtisinä 10 viikkoa ja muuttaa vain kisalajien toistot (5 → 3) — jokainen apuliike on siis vertailukelpoinen aikasarja. Meillä 31 eri liikettä 12 viikossa, 9 vaihtuu kerralla vk 5:llä ja 6 lisää vk 9:llä, toistoskeema 6 → 4 → 3 → 2 → 1, RPE 7 → 8 → 9. **Ohjelma ei pysty mittaamaan omaa kehitystään** — ja koska e1RM on Epley-ekstrapolaatio kunkin viikon toistoalueesta, arvio liikkuu kaavan takia eikä voiman.
4. **RPE-jakauma on käännetty.** Meillä kisalajit ka RPE 7,7 (vk 7/9/10/11 tasan 9), apuliikkeet ka 6,8. KoW: kisalajit 5–5,5, apuliikkeet 8–9. Lisäksi volyymi 63 sarjaa/vk (KoW) vs. 95–107 (meillä). Atletin tunnettu taipumus aliarvioida varaa (`docs/MEMORY.md`, atletti-profiili) tarkoittaa että määrätty RIR 1 on käytännössä failure.

**Pienemmät, ei-estävät:** Vara-asteikko on kokonaisluku (`parseInt`, index.html) → puolikkaita RPE-arvoja ei voi kirjata · ohjelman ulkopuolisen treenin kirjaus rajattu 7 pv:n backfilliin (ei runtime-verifioitu) · liikehaku kytkemättä (OBS-060) · `Side Bends` puuttuu katalogista, neljä liikettä tarvitsee tarkan variantin (Pin Pull Up, No Dip Bar Muscle Up, High Incline Bench, 45° SA Triceps Extension).

## AVOIN — ODOTTAA AKSELIA

1. **ROADMAP NYT-merkki.** Vaihe 20 (Round B-γ) sulkeutui kisaan 22.8. `CLAUDE.md` §8 edellyttää siirtoa, mutta yllä olevat neljä aukkoa **eivät ole R-sekvenssin 20 vaiheessa**. Onko seuraava vaihe 19 (pohja-puhtaus), 14b, 18 — vai lisätäänkö sekvenssiin uusi vaihe "ohjelmointikoneen ilmaisuvoima"? Code ei siirrä merkkiä itse.
2. **Työjärjestys rakennusikkunassa.** Aukot 1–3 ovat rakenteellisia ja kytköksissä toisiinsa (kattavuus ja mittauspiste ovat osin sama asia). Aukko 4 on ohjelmasisältöä, ei enginea.

---

# H-023 — Suunnitelma on katto, ei lattia

## 0. Metadata

| Kenttä | Arvo |
| --- | --- |
| Handoff-id | **H-023** |
| Tyyppi | `debug` (käytös muuttuu TARKOITUKSELLA rajatussa joukossa → regressio-odotus deklaroitu A3:ssa) |
| Laadittu | 23.8.2026, Akselin kenttähavainnosta + toistetusta juurianalyysistä |
| Pohja-HEAD | `2eea87e` · peruutusankkuri `backup-pre-H-023-2eea87e` |
| Edeltäjä | H-022 (sama sääntö, kaksi polkua) · H-021 (e1RM-arvio) |

## 1. Tavoite

`computeProgressionTarget` laskee lopputuloksen muodossa `Math.max(planFloor, autoregTarget)`. Muuttujan nimi kertoo suunnittelupäätöksen: **suunnitelma on lattia.** Kuorma ei saa mennä sen alle, mutta saa mennä rajattomasti sen yli.

Tämä käännetään: **suunnitelma on katto.** Mikään progressiokerros ei nosta yli suunnitellun tason (± 2 % toleranssi). Kevennys alaspäin säilyy ennallaan — kaikki nykyiset capit ja suojat toimivat kuten ennenkin.

## 2. Acceptance criteria

**A1** — `computeProgressionTarget` ei koskaan palauta arvoa > `planTarget × 1,02`, kun `planTarget` on numero. Katto pyöristetään ALAS puolikkaaseen kiloon (sama kuin H-022 A2).

**A2** — Ylitys ei ole hiljainen: uusi ruleId `PLAN_PCT_BINDS_PROGRESSION` nimeää ohituksen ja kantaa `planTarget`, `suppressedTarget` ja `ruleHits`.

**A3** — LOAD-DIFF Akselin omalla historialla, tuore ohjelma, 48 päivää. **Odotus deklaroitu:** viisi ylitystä nollaan. Mitattu ennen (plan → annettu):

| | ohjelma | ennen | ylitys |
| --- | --- | --- | --- |
| vk 1 MA Lisäpainoleuanveto 6×V3 | 47,5 kg | 62,5 kg | +32 % |
| vk 1 TO Lisäpainodippi 6×V3 | 52 kg | 64 kg | +23 % |
| vk 1 TI Takakyykky 6×V3 | 141 kg | 165 kg | +17 % |
| vk 2 TO Lisäpainodippi 6×V2 | 55,5 kg | 60 kg | +8 % |
| vk 2 MA Lisäpainoleuanveto 6×V2 | 51,5 kg | 53 kg | +3 % |

Muut rivit: **0 odottamatonta muutosta**, jokainen diff luokiteltu.

**A4** — Lukkotesti known-positive + known-negatiivisilla, todennettu korjaamattomalla koodilla ennen luottamusta (Selkäranka 6). Known-negatiivit: deload-passthrough ennallaan · `planTarget === null` ennallaan · progressio saa yhä KEVENTÄÄ suunnitelmasta.

**A5** — Neljä porttia vihreänä.

## 3. Reunaehdot ja scope-aita

**Sallittu diff (funktionimin):** `engine.js` — `computeProgressionTarget`-funktion palautusarvo · `test-runner.js` — lukkotesti · `tools/coach-judge/a2-plan-floor-sweep.mjs` — Haara P -mittari · `sw.js` APP_VERSION · tämä tiedosto. **STOP jos diff ylittää valkolistan.**

**EI kosketa tässä kierroksessa:** 46 kuormasäännön karsinta · `SUSTAINABILITY_CAP`/`HARD_CAP`/`INFLATION_CAP` -logiikat (ne jäävät, ne voivat vain keventää) · `computeMovementReload`-ankkurin rep-sokeus (kirjattu havainnoksi, min-precedence suojaa toistaiseksi) · ohjelman volyymi/RPE-viritys (eri päätös, Akselin) · treeninäkymän hierarkia · lämmittelyjen määrä.

**Invariantit (CLAUDE.md §2):** ei kosketa VL-cappeihin, deload-syvyyteen eikä prioreihin. Elite-progressio ≤ 0,05 ×/vk säilyy — katto vain estää sen ylittämisen suunnitelman yli.

## 4. Atletti-vastaukset

Ei sovellu (`debug`). Ratifioitu kenttähavainnosta 23.8.: *"Koskaan, siis koskaan ei saa jatkossa tulla tällaisia heittoja."*

## 5. Taustapäätökset

- **Miksi katto eikä sääntöjen karsinta:** engine sisältää 46 kuormaan vaikuttavaa sääntöä. Katto tekee niistä vaarattomia poistamatta yhtäkään — ne voivat vain keventää. Pienempi muutos, pienempi riski.
- **Miksi juuri `computeProgressionTarget`:** juurianalyysi 23.8. osoitti sen sitovaksi vaiheeksi (`planFloor` → `Math.max`). `SUSTAINABILITY_CAP` capasi jo alaspäin mutta "demonstroituun", ei suunnitelmaan.
- **Todiste että ohjelma on oikeassa:** suunniteltu taso vk 1 leuka = 47,5 kg. KoW:n vastaava preskriptio samalle intensiteettivyöhykkeelle (9 vs 9,5 efektiivistä toistoa) = 46,25 kg. Ero 2,7 %. Annettu 62,5 kg edellyttäisi 110 kg:n maksimia; kisamaksimi on 84.

## 6. Avoimet kysymykset

1. **Ohjelman viritys** (volyymi 95 vs 63 sarjaa/vk, kisalajin RPE 7 vs 5,5) — eri päätös, ei tässä.
2. **`computeMovementReload` on rep-sokea** (`anchorKg = medianLoad`, ei toistoja/Vx:ää). Min-precedence suojaa nyt, mutta suoja on sattumaa. Oma kierros.

## 7. Session-tulos  *(Claude Code, 23.8.2026)*

| Kenttä | Arvo |
| --- | --- |
| Commit | `22e58f7` — pushattu · APP_VERSION 4.67.0 |
| Pohja-HEAD | `2eea87e` · peruutusankkuri `backup-pre-H-023-2eea87e` |
| Muuttuneet tiedostot | `engine.js` · `test-runner.js` · `sw.js` · `tools/coach-judge/a2-plan-floor-sweep.mjs` · tämä tiedosto |
| Portit | smoke ✅ · engine-pilot 64/64, 0 virhettä, 🐛 0 ✅ · wizard-pilot 11/11 ✅ · selaintestit 1065/1065 ✅ |
| Tila | **A1–A5 valmiit, pushattu** |

### Tulos

Atleetin omalla historialla, 48 päivää: **5 ylitystä → 0.** Viikko 1 nyt leuka 48 kg (KoW-vertailu 46,25) · kyykky 143,5 · dippi 53.

Engine-pilot, koko 16 vk: 18 muuttunutta kuormariviä. Olennaisin ei ole taso vaan muoto — kyykkypäivän käyrä oli ennen ei-monotoninen (vk 9 piikki 157, vk 10 takaisin 138), nyt 135 → 138 → 145 → 150. Piikit poistuivat.

### Scope-laajennus kesken kierroksen (Akseli ratifioi)

Lukkotesti K6-2b kaatui heti katon jälkeen: e1RM-ikkuna laski mediaanin kevennysviikon sarjoista. Sääntö oli repossa jo kahdesti (`ANCHOR_DELOAD_SKIP`, 8a-orkestrointi) mutta puuttui e1RM-ikkunasta. Kolmas esiintymä yhdistetty yhdeksi jaetuksi predikaatiksi `isDeloadEvidenceSet`.

**Tämä on katon suora seuraus, ei erillinen bugi.** Niin kauan kuin suunnitelma oli lattia, autoregulaatio pakeni saastuneen suunnitelman yli ja päätyi sattumalta oikeaan lukuun. Katto teki e1RM:n oikeellisuudesta kantavan rakenteen. Ks. `docs/MEMORY.md` oppi 14.

### Ratifioitu kauppa

Jos cfg-arvo tai e1RM jää jälkeen, koko ohjelmasta tulee liian kevyt eikä automaattista pakotietä ole. Pakotie on kalibrointiviikot ja Asetusten cfg-arvo. **Se on nyt ainoa reitti, jolla kone voi oppia että atletti on vahvempi kuin se luulee.**

### Mikä jäi auki

1. **`computeMovementReload` on rep-sokea** — `anchorKg = medianLoad`, ei kanna toistoja eikä Vx:ää. Min-precedence suojaa, mutta suoja on sattumaa. Oma kierros.
2. **Ohjelman viritys** — volyymi 95 vs KoW 63 sarjaa/vk, kisalajin RPE 7 vs 5,5, lämmittelyjä 7,8/päivä vs 2–3. Eri päätös, Akselin.
3. **Treeninäkymän hierarkia** — ~14 tietolohkoa ennen ensimmäistä kirjattavaa toistoa vs KoW 4.
4. **46 kuormaan vaikuttavaa sääntöä** — katto tekee niistä vaarattomia, muttei poista niitä.
