# HANDOFF.md — aktiivinen Cowork → Code -toimeksianto

> Repon **ainoa aktiivinen handoff**. Cowork täyttää osiot 0–6, Claude Code täyttää osion 7.
> Valmis handoff arkistoidaan → `docs/handoffs/HANDOFF_<id>.md`, ja tämä tiedosto nollataan tyhjäksi pohjaksi.
> Auktoriteettijärjestys: ks. `CLAUDE.md` §7. Session-protokolla: ks. `CLAUDE.md` §8. Kurilista: `docs/SELKARANKA.md`. Muisti: `docs/MEMORY.md`. Post-Fable-operointi: `CLAUDE.md` §10.
>
> *Tila: **EI AKTIIVISTA HANDOFFIA.** 23.8.2026 suljettiin H-022, H-021 ja H-023 (pushattu `22e58f7`, APP_VERSION 4.67.0).*

---

## KONTEKSTI — rakennusikkuna 23.8.–n. 1.11.2026

**Päätös 23.8.2026 (Akseli):** atletti ajaa **King Of Weighted -valmentajan 10 viikon offseason-ohjelman KoW:n omassa sovelluksessa**, ei LeVessä. Syy: LeVe ei osaa ajaa heidän ohjelmaansa (kuusi progressiomallia per liike vs. meidän yksi), eikä sitä kannata pakottaa kirjuriksi ohjelmalle jota se ei ymmärrä — toteutuma oli edellisessä blokissa 56 %, ja kitkan lisääminen uhkaa juuri sitä muuttujaa.

**LeVe ei ole tuotantokäytössä ~10 viikkoon.** Rakenteelliset muutokset voi tehdä ilman elävän blokin painetta. Kymmenen viikon päästä atletti tuo KoW-datan (kisalajien viikoittainen kuorma + RPE riittää — muu ohjelmassa ei muutu) → ajetaan meidän engine samasta historiasta jälkikäteen.

**Lähtötaso lukittu (mock meet 22.8.2026):** leuka 84 + dippi 100 + kyykky 180 = **364 kg** kolmen lajin total (vertailukelpoinen KoW:n +40–50 kg -lupaukseen) · MU 17,5 → **381,5 kg** neljän lajin kisatotal. **KoW:n ohjelma ei progressoi lisäpaino-MU:ta lainkaan.**

**Vk 4 -mittari:** kisalajien kuorma samalla RPE:llä (5,5) viikoilla 1 → 4 → 7 → 10.

## MITÄ 23.8. KORJATTIIN

| | |
| --- | --- |
| **H-022** | Suunniteltu slot-% sitoo: kevennysviikon lattia (Haara A) + cross-ref-cap (Haara B) + vk 17:n puuttuva viikkomäärittely |
| **H-021** | e1RM-evidenssisuodatin — kevyt sarja ei enää paina voima-arviota (OBS-058) |
| **H-023** | **Suunnitelma on katto, ei lattia** — kolmas ja viimeinen sitova lokus + kevennyssarjat pois e1RM-evidenssistä |

Yhdessä nämä sulkevat sen vikaluokan, jossa ohjelman oma luku ei sitonut. Todiste: viikko 1:n lisäpainoleuka 62,5 → **48 kg**, kun ohjelma sanoo 47,5 ja KoW 46,25.

## NELJÄ AUKKOA JOTKA JÄÄVÄT — vertailu KoW:hun 23.8.

1. **Progressiomalli per liike puuttuu.** KoW: kuusi nimettyä mallia liikekohtaisesti. Meillä yksi globaali. Suurin toiminnallinen ero.
2. **Preskription kattavuus 26 %.** 444 slotista 327 (74 %) ilman plan-%:a, 144 (32 %) ilman sekä kuormaa että Vx-tavoitetta.
3. **Vakaa mittauspiste puuttuu.** KoW pitää 16 liikettä identtisinä 10 vk; meillä 31 liikettä 12 vk:ssa, toistoskeema 6→4→3→2→1. Ohjelma ei pysty mittaamaan omaa kehitystään.
4. **RPE-jakauma käännetty.** Kisalajit ka 7,7 (vk 7/9/10/11 = 9) vs. KoW 5–5,5; apuliikkeet 6,8 vs. 8–9. Volyymi 95–107 sarjaa/vk vs. 63.

**Pienemmät:** Vara-asteikko kokonaisluku (`parseInt`) → puolikkaita RPE-arvoja ei voi kirjata · ohjelman ulkopuolisen treenin kirjaus rajattu 7 pv:n backfilliin (ei runtime-verifioitu) · liikehaku kytkemättä (OBS-060) · `Side Bends` puuttuu katalogista · `computeMovementReload` rep-sokea · treeninäkymässä ~14 tietolohkoa ennen ensimmäistä toistoa · lämmittelyjä 7,8/päivä (kuvaukset ~380 merkkiä) vs. KoW 2–3.

## AVOIN — ODOTTAA AKSELIA

**ROADMAP NYT-merkki.** Vaihe 20 sulkeutui kisaan 22.8. `CLAUDE.md` §8 edellyttää siirtoa, mutta yllä olevat neljä aukkoa **eivät ole R-sekvenssin 20 vaiheessa**. Code ei siirrä merkkiä itse.

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
