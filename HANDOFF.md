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

# (uusi handoff tähän)

## 0. Metadata
## 1. Tavoite
## 2. Acceptance criteria
## 3. Reunaehdot ja scope-aita
## 4. Atletti-vastaukset
## 5. Taustapäätökset
## 6. Avoimet kysymykset
## 7. Session-tulos
