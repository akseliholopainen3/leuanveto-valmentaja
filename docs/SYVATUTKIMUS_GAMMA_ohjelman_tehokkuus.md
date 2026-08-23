# Syvätutkimuskehote γ — Miksi 16 viikkoa tuotti nollatuloksen?

> **Tarkoitus:** Cowork-kanavan (a) analyysikehote. Vie tämä kokonaisuudessaan Coworkiin.
> Tuotos: päätösvalmis synteesi + HANDOFF-kandidaatti ENNEN uuden ohjelman käynnistystä.
> Rakenne seuraa `docs/SYVATUTKIMUS_ALPHA` / `_BETA` -malleja (CLAUDE.md §5: ei geneerisiä
> kehotteita ulkoisiin tutkimuksiin). Laadittu 22.8.2026 mock meetin jälkeen.

---

# Syvätutkimuspyyntö — voimaohjelman tehokkuuden jälkianalyysi ja vertaisarviointi

## Konteksti tutkijalle

LeVe AI on suomenkielinen voimaharjoittelusovellus (PWA, paikallinen IndexedDB, ei
serveriä). Se sisältää sääntöpohjaisen autoregulaatiomoottorin joka säätää kuormaa
tutkimusperustaisten turvarajojen sisällä, ja käsin viritetyn 16 viikon
streetlifting-ohjelman.

Atleetti: 15+ v harjoittelukokemus, kilpaileva streetliftaaja ja voimanostaja,
kehonpaino ~88–91 kg. Ei rajoitteita. Tunnettu taipumus arvioida varaa (Vx = RIR)
optimistisesti eli grindata lähelle failurea.

**Ohjelma ajettiin 4.5.–22.8.2026 (16 vk) ja päättyi mock meetiin.**

### Mitattu lopputulos

| Liike | Mock meet 22.8.2026 | Vertailukohta | Muutos |
| --- | --- | --- | --- |
| Lisäpainoleuanveto | 84 kg | ohjelman alun baseline 8.5.2026: **85 kg** | **−1 kg** |
| | | kilpailu 18.4.2026: **94 kg** (bw 88,5) | −10 kg |
| | | testi 13.4.2026: **98 kg** (bw 90,3) | −14 kg |
| Lisäpainodippi | 100 kg | baseline 8.5.2026: **95 kg** | **+5 kg** |
| Takakyykky | 180 kg | baseline 8.5.2026: **185 kg** | **−5 kg** |
| | | voimanostokisa 27.9.2025: **200 kg** | −20 kg |
| Muscle-up | 17,5 kg | ei baselinea | — |

**Nettotulos 16 viikosta: −1 / +5 / −5 kg.** Käytännössä nolla.

### Mitä ohjelmasta tiedetään jo mitatusti

Viikoittainen sarjamäärä (materialisoitu — mitattu ajamalla ohjelma läpi harnessilla
siinä muodossa jossa atleetti sen ajoi):

    vk      1   2   3   4    5    6    7   8   9  10  11  12  13  14  15  16
    sarjat 96  96  96  62  107  107  107  80  89  86  83  65  10  30  15  20

Perustaso vk 9–11 = 86 sarjaa/vk. Ohjelman OMA koodikommentti siteeraa
Bosquet 2007 + Pritchard 2016: taperin volyymileikkaus **41–60 %, ei 100 %**.
Toteutuneet leikkaukset: vk 13 −88 %, vk 14 −65 %, **vk 15 −83 %**, vk 16 −77 %.
**Kolme neljästä huipennusviikosta oli ohjelman oman siteeraaman tutkimusrajan
ulkopuolella.**

Tiedossa olevat toteutushäiriöt (kaikki verifioitu koodista elokuussa 2026):

- Ohjelman kisapäivä osui **6 vrk ennen** todellista mock meetiä — ohjelmaa ei ollut
  ankkuroitu kisapäivään lainkaan (viikot laskettiin pelkästä aloituspäivästä).
- Kisapäivän neljännen lajin (kyykky) **kolmas yritys katosi** apuliikeskalaarin takia.
- Paluu 3 vk tauolta keventää kuormaa automaattisesti −15 %, mutta käyttöliittymä
  väitti päinvastaista → atleetti ei tiennyt keventävänsä kahdesti.
- Taperissa tarkoituksella kevyeksi ohjelmoitu slotti (60 %) resolvoitui ~83 %:iin,
  koska progressio ylikirjoitti suunnitellun kevennyksen.
- Atleetti ei voinut kirjata ohjelman ulkopuolista treeniä → osa tehdystä työstä jäi
  kokonaan datan ulkopuolelle.

### Kriittinen metodologinen huomio

Yllä oleva sarjamäärä on **OHJELMOITU, ei toteutunut.** Atleetti piti mökkiloman
(vk 13), jätti päiviä väliin ja teki ainakin yhden ohjelman ulkopuolisen treenin.
**Analyysin on erotettava ohjelmoitu ja toteutunut kuormitus.** Todellinen data on
sovelluksen sets-storessa ja se on pyydettävä erikseen ennen johtopäätöksiä. Ilman
sitä kysymys "toimiiko ohjelma" on vastaamaton.

---

## Fabrikointi-tarkistus alkuun

Ennen kuin vastaat mihinkään kysymykseen, vahvista nämä:

1. **En keksi lähdeviitteitä.** Jokainen siteerattu tutkimus on todennettavissa
   (DOI, PMID tai suora URL). Jos en löydä lähdettä, sanon sen — en tuota
   uskottavan näköistä viitettä.
2. **En keksi lukuja ohjelmista.** Jos siteeraan julkaistun ohjelman rakennetta
   (sarjat, prosentit, frekvenssi), lähde on nimetty. Toisen käden yhteenvedot
   merkitään sellaisiksi.
3. **Erotan tutkimusnäytön ja valmennuskäytännön.** "Sheiko käyttää" ei ole sama
   asia kuin "tutkimus osoittaa".
4. **En yliyleistä n=1-tapauksesta.** Yhden atleetin 16 viikkoa ei todista ohjelmasta
   mitään tilastollisesti — se on tapaustutkimus. Sano se ääneen.

---

## Päätutkimuskysymys

**Miksi 16 viikon ohjelma tuotti kokeneella voimaharjoittelijalla nollamuutoksen
kolmessa päälajissa — ja mikä osuus siitä on (a) ohjelman harjoittelusisällössä,
(b) huipennuksen toteutuksessa, (c) mittausolosuhteissa, (d) atleetin toteutumassa?**

Nämä neljä on eroteltava. Älä tyydy yhteen selitykseen.

---

## Alakysymykset

### A. Neljän selityksen erottelu

**A1.** Mock meet vs. kilpailu: kuinka paljon julkaistu kirjallisuus ja
valmennuskäytäntö antavat eroa harjoitusmaksimin ja kilpailumaksimin välille
(adrenaliini, yleisö, tuomarointi, kisaherätys)? Onko 5–10 % realistinen haarukka?
Riittääkö se selittämään leuanvedon −10 kg suhteessa huhtikuun kisaan?

**A2.** Taperin volyymileikkaus oli 65–88 % kolmella viikolla neljästä, kun ohjelman
oma lähde sanoo 41–60 %. Mitä kirjallisuus sanoo LIIAN syvän taperin seurauksista
kokeneilla voimaharjoittelijoilla — detraining, hermostollisen valmiuden lasku,
tekninen ajautuma? Kvantifioi jos mahdollista.

**A3.** Erottele: onko ongelma taperissa (vk 13–16) vai koko harjoittelusisällössä
(vk 1–12)? Testattava hypoteesi: jos vk 1–12 tuotti adaptaatiota, sen pitäisi näkyä
vk 12:n kalibrointisessioissa. Pyydä nämä luvut ja vertaa niitä mock meetiin. Jos
vk 12 oli jo lähellä lähtötasoa, ongelma EI ole taperissa.

**A4.** Toteutuma: mökkiloma vk 13, väliin jääneet päivät, ohjelman ulkopuoliset
treenit. Kuinka suuri osa ohjelmoidusta työstä todella tehtiin? Pyydä
sarjakohtainen toteumadata.

### B. Vertaisarviointi julkaistuja ohjelmia vasten

**B1.** Vertaa LeVe AI:n 16 vk -ohjelman rakennetta (yllä oleva volyymikäyrä,
4 treeniä/vk, 4 kilpalajia) vähintään näihin ja nimeä konkreettiset erot:
- Powerlifting-blokkimallit: Sheiko, 5/3/1 (Wendler), Juggernaut Method,
  RTS/Tuchscherer (RPE-pohjainen), Calgary Barbell 16 vk
- Volyymimaamerkkimallit: Israetel / Renaissance Periodization (MEV/MAV/MRV)
- Lisäpainokalistenia ja streetlifting: mitä julkaistua rakennetta on olemassa?
  (Tutkimuksellisesti ohut alue — sano jos näyttöä ei ole.)

**B2.** Onko LeVe AI:n ohjelma tunnistettavissa MIKSIKÄÄN vakiintuneeksi malliksi,
vai onko se hybridi joka ei täytä minkään ehtoja? Erityisesti: **4 kilpalajia
samanaikaisesti + 4 treeniä/vk** — riittääkö frekvenssi ja volyymi per laji kokeneen
atleetin adaptaatioon, vai jakautuuko kuormitus liian ohueksi? Tämä on
keskeisin yksittäinen kysymys.

**B3.** Volyymikäyrän muoto: 96 → 107 → 86 → 65 → romahdus. Vastaako tämä mitään
julkaistua periodisaatiomallia? Erityisesti vk 5–7 on ohjelman **korkein** volyymi
(107) — onko voimalajissa perusteltua ajaa huippuvolyymi puolivälissä?

**B4.** Intensiteettijakauma: pyydä ohjelman prosenttijakauma per viikko ja vertaa
julkaistujen mallien jakaumiin. Kokeneella nostajalla adaptaatio vaatii riittävästi
työtä ≥80 %:n alueella — täyttyykö se?

### C. Sovelluksen autoregulaatiologiikan arviointi

**C1.** LeVe AI säätää kuormaa Vara-arvion (Vx = RIR) perusteella, ja atleetin
tiedetään arvioivan varaa optimistisesti. Miten julkaistut RPE/RIR-pohjaiset
järjestelmät (RTS, Helms) käsittelevät systemaattista arviointivinoumaa? Onko
validoituja kalibrointimekanismeja?

**C2.** Sovellus johtaa kuorman e1RM-arviosta (Epley + Vara). Kuinka tarkka Epley on
lähellä maksimia kokeneilla nostajilla, ja mikä on virheen suunta? Voiko
systemaattinen e1RM-vinouma tuottaa kroonisen ali- tai ylikuormituksen?

**C3.** Sovelluksessa on tunnistettu vika jossa submaksimaalinen sarja painaa
e1RM-arviota alas (mediaani viimeisestä 6 sarjasta ilman roolisuodatinta). Arvioi
kuinka paljon tämä on voinut vinouttaa 16 viikon kuormaohjausta.

### D. Päätössuositus seuraavaan ohjelmaan

**D1.** Kolme konkreettista vaihtoehtoa seuraavaksi 12–16 viikon blokiksi
paremmuusjärjestyksessä. Jokaisesta: rakenne, volyymikäyrä, intensiteettijakauma,
frekvenssi per laji, ja **mikä mittari kertoo 4 viikon kohdalla toimiiko se**.

**D2.** Mitä sovelluksessa on korjattava ENNEN uuden ohjelman käynnistystä ja mikä
voi odottaa? Erottele: (i) estävät viat, (ii) haittaavat viat, (iii) parannukset.

**D3.** Mikä on minimaalinen mittausjärjestely joka erottaisi "ohjelma ei toimi" ja
"ohjelma toimii mutta toteutuma ei riitä" seuraavalla kierroksella?

---

## Lähdetaulukko (täytä tutkimuksen loppuun)

| # | Väite jota tukee | Lähde (kirjoittaja, vuosi, julkaisu) | DOI/PMID/URL | Näytön taso | Tarkistettu |
| --- | --- | --- | --- | --- | --- |
| 1 | | | | RCT / meta / havainto / käytäntö | kyllä / ei |

---

## Fabrikointi-tarkistus loppuun

Käy taulukko rivi riviltä ja vahvista:

1. Jokainen DOI/PMID/URL on olemassa ja johtaa siihen julkaisuun jota väitän.
2. Jokainen numeerinen väite (prosentti, sarjamäärä, vaikutuskoko) on lähteestä, ei
   omasta päättelystäni. Päättelyt on merkitty päättelyiksi.
3. Erotin selkeästi: tutkimusnäyttö vs. valmennuskäytäntö vs. oma tulkinta.
4. Sanoin eksplisiittisesti mitkä kysymykset jäivät ilman kunnollista näyttöä.
5. Muistutin että n=1 tapaustutkimus ei yleisty.

---

## Tuotos jonka odotan

1. **Neljän selityksen erottelu** (A) painotuksineen — mikä osuus mihinkin.
2. **Vertaisarviointitaulukko** (B) — LeVe AI vs. vähintään 4 julkaistua mallia.
3. **Kolme ohjelmavaihtoehtoa** (D1) paremmuusjärjestyksessä.
4. **Korjauslista sovellukseen** (D2) kolmessa luokassa.
5. **HANDOFF.md-kandidaatti** repon Code-kanavalle: se yksi muutos joka on tehtävä
   ensin, acceptance-kriteereineen (ks. skill `leve-handoff-laadinta`).

Jos jokin kysymys ei ole vastattavissa käytettävissä olevalla näytöllä, sano se
suoraan äläkä täytä aukkoa uskottavalla arvauksella.

---

## Liite: mitä Coworkin kannattaa pyytää reposta ennen vastaamista

- **Toteutunut** sarja- ja kuormadata vk 1–16 (sets-store), ei ohjelmoitu
- Vk 4 / 8 / 12 kalibrointisessioiden tulokset — nämä ratkaisevat kysymyksen A3
- Ohjelman intensiteettijakauma per viikko (`loadPct` ja toteutunut %)
- Vx-raportointi vs. toteutuneet toistot (kysymys C1: kuinka suuri vinouma oli)
- `docs/backlog.md` OBS-058 / OBS-059 / OBS-060 — tunnetut avoimet viat
