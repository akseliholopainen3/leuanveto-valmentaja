// data.js — IndexedDB, stores, migration, CRUD, import/export, backup/restore, guods
// LeVe AI v4.34.9 — PWA SW UPDATE-BANNER: käyttäjä raportoi "miksi puhelin ei ole samassa sovelluksessa vaikka päivitän selaimen?". Syy: uusi Service Worker jää WAITING-tilaan kunnes vanha SW vapautuu (= käyttäjä sulkee KAIKKI sovelluksen välilehdet). Pelkkä reload ei riitä koska vanha SW interceptoi ja palvelee cache:n. KORJAUS: index.html SW-rekisteröintiin lisätty showUpdateBanner() — kun uusi SW on installed + vanha SW yhä controllerina, näytetään banneri "🔄 Uusi versio saatavilla — Lataa nyt". Klikkaus postMessage:ee SW:lle SKIP_WAITING → SW aktivoituu välittömästi → controllerchange → reload → uusi koodi käytössä. SW.js:ssä uusi message-listener joka kuuntelee SKIP_WAITING-eventtejä. Päivityskäyttäytyminen muuttuu täysin: aiemmin käyttäjän piti sulkea Chrome + tab täysin, nyt yksi klikkaus banneriin. v4.34.8 (edellinen): KÄYTTÄJÄPALAUTE: backfill-toiminto näyttää AINA viimeisen 7 päivän treenit, riippumatta mesosyklin tilasta. Käyttäjän suora pyyntö: "ohjelmassa tulisi kyetä lisäämään edellisen 7 päivän treenit, mikäli on unohtunut. muuta tämä ominaisuus jotta ei lukisi 'ei ohjelmaa tänään'". Käyttäjä oli tilanteessa jossa mesocycle.startDateISO=2026-04-30 (today, default-mesosykli), ja edellisen 7 päivän päivät putosivat ulos backfill-listasta koska getMesocycleWeek palautti null (ennen alkua). KORJAUS v4.34.8 (index.html): collectAllMissedDays(daysBack=7) palauttaa nyt KAIKKI viimeisen 7 päivän päivät, status-lipulla: "planned" (mesosyklissä, dayPlan löytyy) / "out-of-range" (ennen alkua tai jälkeen lopun) / "no-mesocycle" (ei aktiivista mesosykliä) / "no-day-plan" (mesosyklissä mutta ei dayPlanin tähän viikonpäivään). Backfill-modaali näyttää nämä eri ikoneilla (🕑 planned vs ⚠ ad-hoc). Out-of-range-päivän klikki tarjoaa auto-fix-dialogin: "Säädä mesosyklin aloituspäivä → snapToMostRecentMonday(chosen.dateISO)". Auto-fix tekee pre-change snapshot + päivittää startDateISO + computeRecommendation. Käytännössä käyttäjä klikkaa Ma 04.27 → "Säädä aloituspäivä → 2026-04-27" → vahvistaa → mesosykli säätyy + Ma:n dayPlan löytyy vk 1:ssä → backfill toimii. EI muita muutoksia (engine.js + sw.js header-bumppaukset). v4.34.7 (edellinen): Orphan-mesosyklien siivous "Vaihda ohjelma" -toiminnon yhteydessä. Käyttäjäpalaute v4.34.6:n jälkeen: backfill näytti "ei ohjelmaa" leuka/kyykky-päivien backfill-yrityksissä. Preview-testi vahvisti että ongelma EI ollut backfill-koodissa vaan käyttäjän puhelimen tilassa: kun selainhistoria tyhjennettiin v4.34.5-tilanteessa, sovellus loi automaattisesti DEFAULT-mesosyklin (4-vk Maksimivoima/Perusvoima/Nopeusvoima) eikä streetlifting_16w:tä — käyttäjä yritti backfillata leuka/kyykky-päiviä default-mesosyklin rakenteen alla joka EI sisällä näitä spesifejä päiviä. v4.34.6 ratkaisi juurisyyn (auto-snap MA + persistent storage), mutta JÄÄNNE-ONGELMA jäi: kun käyttäjä luo uuden streetlifting-mesosyklin "Vaihda ohjelma" -kautta, vanha default-mesosykli säilyy DB:ssä. Init-vaiheessa getActiveMesocycle voi palauttaa virheellisen mesosyklin (default voittaa startDateISO-vertailussa koska se luotiin tänään ja streetlifting auto-snap-MA on edellinen MA = vanhempi). KORJAUS v4.34.7: cleanupOrphanMesocycles(excludeId) -funktio joka poistaa kaikki mesosyklit joilla EI ole sessioita assosioituna ja jotka eivät ole excludeId. Säilyttää: aktiivinen + sessio-historian sisältävät mesosyklit. Poistaa: autocreated default + jäänteenä jääneet templatet. Integroitu kaikkiin "Vaihda ohjelma" -polkuihin: streetlifting_16w + peaking + räätälöity + standard templates. Preview-testi vahvistettu: backfill toimii MA 04.27 + TI 04.28 v4.34.6:n auto-snap-MA-logiikalla. v4.34.6 (edellinen): KÄYTTÄJÄN DATAKADON KORJAUS + DEFENSIVE BACKUP OVERHAUL. Käyttäjä menetti koko treenihistoriansa kun hän tyhjensi puhelimen selainhistoria-/site-data 7 päivältä — IndexedDB pyyhittiin samalla, auto-snapshot ehti tallentaa tyhjän tilan, ei muita varmuuskopioita. Lisäksi käyttäjän backfill-yritys epäonnistui koska mesocycle luotiin torstaina (startDateISO=2026-04-30), jolloin tämän viikon MA+TI putosivat vk 0:aan ("ei ohjelmaa"). KORJAUKSET v4.34.6: (1) navigator.storage.persist() pyydetään init:ssä — selain merkitsee storagen pysyväksi, "Clear browsing data" EI vaikuta automaattisesti, vain "Site settings → Clear & reset" pyyhkii. Tämä olisi estänyt v4.34.5-tilanteen. (2) Auto-snapshot WEEKLY → DAILY (BACKUP_INTERVAL_HOURS = 24, oli 168h), retention 4 → 14 = 2 vk historiaa päivittäisillä. (3) STARTUP SNAPSHOT init:ssä jos viim. >24h sitten — varmistaa snapshot per app-aukaisu. (4) PRE-REBUILD SNAPSHOT createPreRebuildSnapshot() integroitu init:n auto-rebuild-koodiin ennen rebuildStreetlifting16WMesocycle-kutsua + UI startDate-muutoksen ennen — recovery-piste joka ei voi epäonnistua hiljaa. (5) snapToMostRecentMonday() auto-snapping createStreetlifting16WMesocycle:ssa — jos käyttäjä luo torstaina, startDateISO siirtyy edelliseen maanantaihin, jolloin koko viikko on backfill-saatavilla. (6) UI-elementti Asetukset → "📅 Mesocycle-aloituspäivä" jolla käyttäjä voi siirtää OLEMASSA olevan mesocyclen startDateISO:n — auto-snap MA + pre-change snapshot. Tämä korjaa käyttäjän nykyisen tilanteen jossa mesocycle luotiin tänään torstaina ja MA+TI ovat vk 0:ssa. JÄRJESTELMÄSUUNNITTELUVASTUU: olisi pitänyt rakentaa nämä alusta asti. v4.34.5 (edellinen): KÄYTTÄJÄPALAUTE TO-treenin (4×6 V3 @ 63 kg, vk 2-3 foundation) jälkeen: "olkapäät kankeat edestä, rinta hyvä jos edes jumissa". Atleetin diagnoosi: voima riittää mutta tekniikka ei vielä — kuorma valuu etudeltaan + capsuleen koska BW dippi -warmup oli liian vähän (1×3 slow ecc) eikä pec-aktivaatio-pattern internalisoitunut ennen worksetejä. Atleetin sanat: "ihan kevyt kehopainodippi oli niin vähissä, että paikat eivät olleet lämmenneet sarjoihin" + "dippi tarvitsee foundation-vaiheessa toistoja niin että pumppi tulee oikeisiin kohtiin". Atleetti EI halua rehabia/deloadia — vaan TARKEMPAA lämmittelyä jatkossa. FIX v4.34.5 (toDay() warmupArr foundation+strength + intensity, EI peaking): BW dippi -volyymi 6×kasvatettu (1×3 slow ecc = 3 reps → 2×8 standard tempo + 1×3 slow ecc = 19 reps, intensity-vaiheessa 1×6 + 1×3 = 9 reps), eksplisiittinen "🎯 BW dippi PUMP-set (chest-activation, KEYNOTE)" -elementti jonka kriittinen cue on RINTA-pumpin saaminen ennen kuormaa, extended ramp 30%×8 lisätty alkuun (= 8 lisä-rep matalalla kuormalla pump-volyymina), ja Lisäpainodippi MOVEMENT_DESCRIPTION-cue päivitetty: "ennen 1. worksetiä, varmista että BW dippi PUMP-set tuotti RINTA-pumpin (ei etudelta + triceps -pumpin). Jos rinta ei pumppaa = forward lean ei tarpeeksi syvä TAI tee 1 LISÄSET BW dippiä rinta-fokuksella ennen kuormaa. SÄÄNTÖ: ei raskasta dippiä ennen kuin BW pumpissa rinta tuntuu kuumalle." Tämä korjaus implementoi atleetin oman kentällä-tehdyn diagnoosin (warmup vajavainen → fix warmup) eikä ylimitoitettua "shoulder rehab phase" -deloadia. Ei muutoksia laDay() Owen-stabilizer-rotaatioon eikä eccentric-overload dippi -accessoryyn (säilyvät v4.34.4-tasoisina). v4.34.4 (edellinen): Owen Gayle (winningstrength.com) streetlifting-spesifin shoulder-stabilizer-protokollan integrointi LA-päivälle. Käyttäjän jakamat 4 Instagram-postausta (Trap 3 Raise + structural balance ratios, Train your shoulder stabilisers, Powell Raise + cable variant, Partial Get-Up benchmark) + 5 video-kuvakaappausta (cable lateral raise, half-kneeling cable Y-raise w/ wrist supination, seated DB raise, chest-supported prone raise, Powell Raise demo) sekä Joey Seyforthin "Front Shoulder Pain With Dips" -artikkeli analysoitu — Owenin "top choice" shoulder stabilizer = POWELL RAISE phase-rotation (cable early phases → DB peak this movement) + Trap 3 Raise structural balance test (8 reps × 12.5% × dip 1RM = 10 kg atleetille). Toteutus laDay()-funktiossa korvaa v4.34.3:n yksittäisen KB Bottoms-Up Press -slotin 3-vaiheisella rotaatiolla: (Foundation vk 1-4) KB BUP 2×6/puoli @ 14 kg + Trap 3 Raise familiarization 2×8/puoli @ 7-8 kg, (Strength vk 5-8) Cable Powell Raise 2×10/puoli @ 4 kg + Trap 3 Raise target 2×8/puoli @ 10 kg, (Intensity vk 9-11) DB Powell Raise 2×8/puoli @ 6 kg + Trap 3 Raise maintenance 2×6/puoli @ 10 kg, (Peaking vk 13-14) POIS. Trap 3 Raise -kuorma kalibroidaan automaattisesti dippi-calibroinnista: target = round(D × 0.125) kg, min 7 kg. Foundation familiarization = target - 2.5 kg. Lisätty 3 uutta PRESET_MOVEMENTS (Powell Raise (DB, side-lying), Powell Raise (kaapeli, seisten), Trap 3 Raise) + erityisen yksityiskohtaiset MOVEMENT_DESCRIPTIONS jokaiselle (numbered setup-steps, liike-sekvenssi, kriittiset cuet, kuorma-suositukset) jotta atleetti voi suorittaa liikkeet ⓘ-painikkeen instruktioiden pohjalta ilman youtube-hakua treenin aikana. Owenin filosofia "shoulder stabilizers AFTER comp lifts + primary accessories, low-fatigue" linjassa v4.34.3:n sijoittelun kanssa. Owen-evidence-base: streetlifting-coaching-konsensus + indirect EMG (Powell Raise on Tony Gentilcore -popularisoima side-lying lateral raise -variantti joka eliminoi 0-30° anterior delt -aktivaation; Trap 3 Raise on Charles Poliquin -origin structural balance -malli). Ei suoraa peer-review-RCT:tä lisäpainodippi-spesifisiin protokolliin, mutta laaja UK-elite-track-record + Owenin oma kilpailutausta + atleettispesifi sopivuus (streetlifting target population). v4.34.3 (edellinen): Track C deep research (35 peer-reviewed-lähdettä) integrointi: dippi-prehab + olkapääkivun ratkaisu + pec-kohdistus. Atleetin TO-treenin oirekuva (jäykistyminen, ei pec-pumppia, 48-72 h palautumis-deficit OHP+close-grip-penkkiin) diagnosoitu kombinaationa (g) tekniikkavaje + (a) anterior capsule capacity-deficit + (b) subscapularis-aliaktivaatio. Pelkkä posterior cuff -volyymi (Cools/Reinold-tyyppinen pull-apart + ER + face pull, kuten v4.34.2) EI ratkaise anterior-vajetta. Ratkaisu: (1) TO yläraaja-prehab uudelleenrakennettu evidenssipohjalla — SUBSCAP-AKTIVAATIO (Belt-squeeze belly-press isometric 2×10 s + lift-off prep + Side-lying IR @ 90° abd, Decker 2003: SSC 62% MVIC vs. perinteinen IR @ 0°) + SA/LT-PRIMING (push-up plus 1×8 + wall slide, Park & Hwang 2019: SA 50-80% MVIC) + PEC STERNAL HEAD MOBILITY (Doorway PNF 60° + 120° abd 2×5/15s, Reiner 2023 + Warneke 2024 — EI yli 150° → välttää pec minor + capsule-overstretchiä) + LOADED MOBILITY (Half-kneeling KB armbar 2×30s/puoli, Caravan 2018: SA 37%/LT 21%/UT 18% MVIC) + SLOW-ECC BW DIPPI (1×3 5s lasku, capsule capacity priming + neural). Foundation/strength = 8-12 min täysi versio + optional PAPE (Garbisu-Hualde 2023, Dobbs 2022: ES=0.31), intensity = 6-8 min lyhennetty (CNS-konservointi, neural readiness > capacity building peakingissa), peaking = TO_WARMUP_PEAKING. Phase-detection heuristiikalla (primaryPct >= 0.85 && reps <= 3 → intensity-short). (2) ECCENTRIC-OVERLOAD WEIGHTED DIP -accessory primary-työn jälkeen (capsule resilience + tendon-loading-adaptaatio dipin alaposition spesifissä asennossa joka EI replikoidu millään penkki-/OHP-variantilla, Vetter 2022 + Liu 2025 + Spennato/McKenzie SCJ 2021). Foundation 3×5 BW+10 kg tempo 5-0-X-0 / Strength 3×4 BW+17.5 kg tempo 6-1-X-0 / Intensity 2×3 BW+15 kg maintenance / Peaking POIS / Deload SKIP (primaryPct < 0.65). (3) HALF-KNEELING KB BOTTOMS-UP PRESS -accessory laDay():iin MU:n jälkeen — anterior-stabilizer-koordinaatio (subscap + SA + RC -sekvenssi pakottaa koordinaatioon, Andersen 2014 + Kim 2025). Foundation 2×6/puoli 14 kg / Strength 2×5/puoli 18 kg / Intensity 1×5/puoli 16 kg maintenance / Peaking POIS. Coaching consensus + indirect EMG, EI suoraa lisäpainodippi-spesifiä RCT:tä. (4) Lisäpainodippi-howTo päivitetty 7 priorisoiduilla tekniikka-cuella McKenzie 2022 EMG-evidenssin pohjalta — #1 FORWARD LEAN 30-45° KOKO LIIKKEEN AJAN (decline-bench-vektori, suurin pec-shifter), #2 ROM-STOP olkapää kyynärpään tasolla (AB-IGHL-suoja, Pollock 2000), #3 jalat takana polvet 90° koukussa lantio extensiossa (vahvistaa lean-asentoa), #4 olkapää-leveyden tanko (NOT laaja, pec-tear-riski Carek 1998 case-tasolla), #5 ekstsentrinen 3-4 s + 0.5 s pause + räjähtävä ylös, #6 scapular protraction + posterior tilt alapositiossa (ribs down, tip blades back), #7 kyynärpäät 30° tucked (NOT flared 60°+). Grip width on yliarvioitu pec-shifter (Saeterbakken 2017/2021, Lopes 2023 meta) — forward lean + foot position + ROM-stop ratkaisevat 80% pec-shiftauksesta. (5) LA-prehab uudistettu samalla anterior-stabilizer-evidenssipohjalla. (6) Uudet PRESET_MOVEMENTS: Half-kneeling KB bottoms-up press (vertikaalityöntö), Push-up plus (horisontaalityöntö), Half-kneeling KB armbar (muu) + howTo + cue. v4.34.2 (edellinen): TO-treenin kenttäpalaute v4.34.1 jälkeen (atleetin todellinen palaute). Kuusi kohdetta korjattu: (1) Dippi 4×6×125 kg -anomalia: lisätty engine.js sanity-diagnostic LOAD_SANITY_WARNING + console.warn jos targetExternalLoad > 1.6× seedD-arvo. Toistettavuusongelma ei selvinnyt tyhjästä DB:stä (atleetin actual sets puuttuvat), mutta diagnostic surfaa ongelman jos toistuu. (2) TO yläraaja-prehab refaktoroitu — aiempi "akateeminen" prehab (sitaatit Cools 2014 / Reinold 2004 / ElMaraghy 2012 / Decker 1999 / jne., 9 elementtiä) korvattu bullet-proof käytännönliikkeillä (6 elementtiä): cardio → RC-jumpat ketjuna (Band pull-apart + ulkokierto + Face pull) → vinopenkki käsipainoilla 2×10 (rinta pumppautuu lämpimäksi) → BW dippi 2×5-8 → ramp. Atleetin palaute: olkapäät jäykistyivät dippien aikana, ei kyennyt pumppaamaan rintaa, palautuminen kärsi seuraavien päivien close-grip-penkki/overhead-press-treeneissä. Uusi prehab fokusoi pec + delt + RC pumppaukseen joka oikeasti valmistaa raskaaseen dippiin. (3) Dippilaite (plate-loaded) lisätty PRESET_MOVEMENTS-listaan + howTo: vipuvarsidippilaite levypainoilla, hyödyllinen accessory-versio jossa kuorma asetellaan tarkasti, ROM rajattu, alkukulman riski (kylmä RC + pec extended) pienempi kuin tankodipissä. (4) "Lisää liike" UX-bug: lisätyn liikkeen valmiiksi merkitseminen ei intuitiivista (vaihtoehdot vain "+ Lisäsarja" + pieni ⏩-skip-ikoni). Lisätty selvä "✓ Liike valmis" -tekstipainike util-rivissä joka poistaa keskeneräiset sarjat ja siirtyy seuraavaan liikkeeseen. Uusi exercise.userAdded:true -lippu tagaa Lisää liike -liikkeet jatkokehitystä varten. (5) Hollow body hold reps→seconds ristiriita: phaseVariants core-hollow:lle prescriboi reps:10 mutta hold-liikkeissä yksikkö on sekunnit. Korjattu: foundation/strength/intensity/peaking phaseVariants nyt vain rep-pohjaisia (Ab wheel rollout / Hanging leg raise). Hold-tyyppiset (Hollow body hold, L-sit hold) säilyvät PRESET_MOVEMENTS:issä — UI tunnistaa hold-tyypin nimestä (regex /Hollow body|L-sit|Plank|Wall sit|Hanging hold|Pallof press hold|Scapular hang|dead hang/i) ja näyttää "X s" eikä "X toistoa". (6) Dumbbell pullover BW-näyttö virheellinen: aiemmin loadKg===0 näytti aina "BW" + "kehonpaino" mikä oli väärä mm. käsipainoliikkeille. Nyt isBwOnlyMovement-check (regex match BW-only-liikkeisiin: BW dippi, Räjähtävä leuka, Hollow body, L-sit, Plank, Bird dog, Scapular pull-up, jne.) — muille loadKg===0 näyttää "0 kg (paina muokkaa)". v4.34.1 (edellinen): Brand evolution: LeVe Coach → LeVe AI. Sovellus on rakennettu tekoälyä hyödyntäen ja nyt myös sisältää AI-Block-Tuning -ominaisuuden (deload-pohjainen analyysipaketti AI-valmennukseen). Nimi heijastaa sovelluksen evoluutiota: alkuperäinen "LeVe Coach" (Leuanvedon Valmentaja, käyttäjän pull-up-taustasta) → "LeVe AI" (henkilökohtainen tekoälyvalmentaja, kattaa leuanvedon, voimanoston, streetliftingin). Käyttäjä toimii pilottina henkilökohtaisen AI-ohjelmoinnin paradigmalle. Brand-jatkuvuus 100%: LeVe-equity säilyy, .ai-suffix signaloi AI-aikakauden evoluution. Tekninen: SCHEMA_VERSION 4 ei muutu (data säilyy), DB_NAME LeVeCoachDB säilyy (datayhteensopivuus), CACHE_NAME leve-coach-v* → leve-ai-v* (cache invalidation luonteva, sovellus rebuildaa). v4.34.0 (edellinen): AI-Block-Tuning MVP — deload-pohjainen analyysipaketti. Uusi engine-funktio generateBlockTuningPackage(ctx) joka tuottaa rikkaan analyysipaketin atleetin viedäkseen Claude/ChatGPT:lle deload-viikolla (vk 4, 8, 12). AI palauttaa block-tuning-suosituksia kolmessa kategoriassa: (A) Sovellus-tason muutokset (atleetti applaa UI:ssa: slot-swap, e1RM-update, BW), (B) Rakenteelliset muutokset (Claude Code -tasolla: %-progressio, set/rep, backoff-tyyli, engine-säätö), (C) Mentaalinen koutsaus (atleetti sisäistää: tekniikkavinkit, pattern-tunnistus, riskimanagement). Output: { markdown, json, prompt, meta }. Markdown = atleetin luettava 1500-2000 sanan narratiivi. JSON = strukturoitu data Claude AI:lle. Prompt = valmis copy-paste AI-prompt jossa kaikki konteksti + kysymykset + vastausformaatti. UI-toteutus: Asetukset-välilehti → uusi kortti "🤖 AI-Block-Tuning" joka näkyy vain streetlifting_16w-mesosyklissä. Aktivoituu vain deload-viikoilla (vk 4, 8, 12). Modal näyttää 3 välilehteä: AI-prompt (vie Claudelle), Markdown (luettava), JSON (raw). Copy-clipboard + download-mekanismit kaikille. Sisäinen historia localStoragessa (last 5 generaatiota). Kategorisoitu työnkulku: AI = first opinion, atleetti = arvostelija, Claude Code = koodi-tason integrator. Generator-funktio kattaa: atleettiprofile, edellisen blokin sessio-data prescribed-vs-actual-vertailulla, e1RM-trendit per kisaliike, HRV/MPV/BW-trendit, anomaliat (V0 failures + Vx-mismatchit ±2), aggregaatit (vxHitRate, sessio-counts), seuraavan blokin prescribed. AI-promptissa eksplisiittinen vastaus-formaatti JSON-templatena (categoryA_appOverrides, categoryB_codeChanges, categoryC_athleteCoaching, criticalQuestions, citations). Streetlifting-no-evidence-guard sisältyy promptiin. v4.33.0 (edellinen): Track B Q-B recovery-infra (M20a-d). (M20a) Yläraaja-readiness MPV warmup-singlessä @ 60-65% 1RM (Sánchez-Moreno 2017/2020 pull-up-spesifi load-velocity-relaatio r=-0.96, vakaa V-%1RM 12 vk). Uusi engine-funktio upperBodyMpvReadiness(todayMpv, recent7DaysMpv) palauttaa { mpv, baseline7Mean, deltaPct, class GREEN/YELLOW/RED, message, recommendedLoadAdjust }. Kynnysarvot Pareja-Blanco/González-Badillo VL-thresholdeista: ≥+3% green-light +2.5% load adjust, -3..-5% pieni varovaisuus, -5..-10% vähennä top-set 7.5%, -10..-15% lepopäivä, >-15% NFOR-review. (M20b) MA + TO + LA yläraaja 8 min prehab-warmup-protokolla (Cools 2014/2015 + Reinold 2004/2007 + Tyler 2010 + Decker 1999 + ElMaraghy 2012 + Holshouser 2020). 9 elementtiä: cardio-priming → T-spine + scap mobility → posterior capsule + pec minor → side-lying ER (RC) → prone Y/full can (supraspinatus) → serratus punch (Decker) → Tyler twist (distal biceps + epicondylitis) → liike-spesifi primer → ramp-up. TO-päivällä lisätty band fly + push-up eccentric (ElMaraghy pec-tear-mekanismi). LA-päivällä MU-spesifyys (false grip hang + scapular pull-up). (M20c) TI 9 min alaraaja prehab-warmup-protokolla (Behm 2016 + McGill 2002/2015 + Boren 2011 + Distefano 2009 + Reiman 2014 + Rio 2015). 7 elementtiä: cardio-priming → leg swing + Hip 90/90 + Cossack → McGill Big 3 lite (curl-up + side bridge + bird dog spinal stiffness) → banded clamshell + glute bridge + lateral walk (Boren glute medius 77% MVIC) → BW squat hidas + reverse lunge → Spanish squat banded isometric (Rio analgeesia patellar tendon) → squat ramp-up. LA fsWeek-päivänä lisätty alaraaja-elementit (Hip 90/90 + Cossack + clamshell + glute bridge). (M20d) Rolling 7-päivän HRV-keskiarvo (Plews 2013, Plews & Laursen 2017): hrvReadiness käyttää ensisijaisesti rolling-7-keskiarvoa baseline-Median sijaan kun 7+ datapistettä saatavilla. Smallest worthwhile change ±0.5 SD viikkokeskiarvosta = optimi readiness-marker. Method-flag rolling7 vs baseline-median näkyy palautuksessa. v4.32.9 (edellinen): Track B 6 ROI-modifikaatiota (M13-M18). (M13) Pull-up variantScale: ME-rotation primaryjen kg-seed-bug korjattu. Aiemmin maDay käytti seedL(pct) = leuka-1RM × pct kaikille variaatioille (Vastaote/Paused/Tempo). PULL_VARIANT_SCALE-objekti: Vastaote 1.05, Paused 0.90, Tempo 0.94. Vk 5 Paused pull-up @75% nyt 56 kg (oli 64 kg). (M14) Top single heavy-first vk 8/10/11/12/13: topSingleFirst-parametri tiDay/maDay/toDay-funktioissa. Helms 2018 / Tuchscherer RTS / Israetel JTS -konsensus: top single CNS-fresh, ennen volyymisarjoja. Aiemmin top single appendoitiin primary + backoff jälkeen → CNS-väsynyt → epätarkka. (M15) MU autoregulation gradient pienennetty puoleen: +5/+2.5 → +2.5/+1.25, -5 → -2.5, -2.5 → -1.25. MU on suhteellisesti raskaampi liike (BS 5kg/200=2.5%, MU 2.5kg/40=6.25%). Coll/Schulz/calisthenics-coaching-konsensus tukee microloadingia skill-painotteisille liikkeille. (M16) Calibration vk 8 + vk 12: top single → calibration-formaatti. Vk 8: 92%×3 V1 (yhdenmukainen vk 4 kanssa, trendi-arvio). Vk 12: 95%×2 V1 (peaking-spesifimpi, parempi reliabiliteetti kuin pelkkä single). DiStasio 2014: low-rep e1RM-tarkkuus ±2.7 kg vs single ±5+ kg. tiDay/maDay/toDay topConfig-parametri tukee {reps, role, isCalibration, weekLabel}-formaattia. (M17) Foundation Hybridi A→B (vk 1-3): atleetin sub-PR muscle memory -kontekstissa Claude-tutkimuksen verdict. Vk 1: 4×6 V3 @68.6% (atleetin nykyinen RPE 6-7) + reg backoff 3×7 @55% — reisi-rebuild + neural reintro. Vk 2: 4×6 V3 @74.3% RPE 7 + reg backoff 3×7 @58% — volume + intensifikaatio. Vk 3: 4×5 V3 @80% RPE 7.5-8 + reg backoff 2×6 @63% — siirtymä intensifikaatioon, backoff vähenee. Reps-drop 6→6→5 + intensiteetti-nosto +5.7pp + backoff-vähennys 3×7→2×6 vk 3:lla. (M18) Volume-cut intensity-blokissa: knee-unilateral (Bulgarian split squat) → drop intensityssä, dip-bw-tertiary → drop intensityssä, mu-dip-support → drop intensityssä. Pelland 2024 PUOS ~2 direct sets/sessio strengthille. Per-vk volume-cut säilyttää CNS:n kyykky-primaryyn intensity-vaiheessa. v4.32.8 (edellinen): Vaiheen 1+2 syvätutkimusten 12 ROI-modifikaatiota. (1) Kalibrointi AMRAP@85%×failure → 92%×3 V1 — DiStasio 2014 + Tuchscherer RTS: low-rep e1RM-tarkkuus ±2.7 kg vs AMRAP-extrapolointi ±5+ kg, CNS-kuorma murto-osa. (2) Box squat → Pin squat (FS.w9-w11 intensity-blokin LA): modern raw -konsensus (Smith JTS, Tuchscherer, Nuckols) — box squat suboptimaalinen raw-atleetille (Westside-perinne multiply-geared), pin squat antaa saman SSC-nollausefektin raw-spesifisellä mekaniikalla. (3) Vk 14 lisätty 1×3 @60% V4 motor-pattern -backoff: Bosquet 2007 + Pritchard 2016 -elite-data: volyymi-leikkaus 41-60%, ei 100%, motor-pattern-säilytys ennen kisaa. (4) Vk 14 primary-slot: peaking-decision-tree-note (jos vk 13 V0-V1 → harkitse @95% nostoa, autoregulation-päätös atleetilla). (5) FS.w1-w3 Paused squat → Takakyykky regular: foundation-blokin Stone/ISSA-doktriini — generaalinen kyykky-volume + technique, ei spesifistä paused-overlapia (paused 2×/vk vk 1-7 oli overdose). pct säädetty 0.55-0.62 → 0.50-0.58, refScale 0.85 → 1.00. (6) calf-isolation foundation V3→V1, reps 15→12: stretch-mediated hypertrofia + 15-rep vaatii high-threshold motor unit -rekrytointia (Maeo 2023, Israetel calves), 12 reps parantaa Halperin-RIR-tarkkuutta. (7) core-antirotation foundation V3→V5: anti-rotation-core ei hyödy failureen menemisestä, note "ei jerkkaa" + V3 oli ristiriitainen. (8) dip-bw-tertiary foundation V3→V5: note "ei grindiä" + V3 oli ristiriitainen, V5 yhdenmukaistuu volume-zoneen. (9) mu-dip-support foundation V3→V5: prehab-tarkoitus = MU-primaryn recovery-suoja, ei stimulus. (10) failureReaction() block-aware: foundation Strategia A (säilytä, ensi vk -2.5%), strength Strategia B (5% drop, ei 10%), intensity/peaking Strategia C (lopeta liike — Tuchscherer 2-failure-rule). (11) varaTrendCorrection painottaa viim. sarjaa: 2.0× viim, 1.5× toiseksi viim, 1.0× muut + V0 viim. 3 sarjassa overrideä accelerate-signaalin (Tulkinta C: viim. sarja = target Vx, V0 missä tahansa = warning). (12) UI Vx-target-explainer: primary/backoff/secondary-sloteille tooltip "viim. sarja = target, sarja 1 V4-V5 fresh OK, V0 = liian raskas". tiDay() backoffConfig tukee nyt sets/reps/targetVx/note-overrideja. tiDay() primaryNote-parametri (vk 14 decision-tree). DATA-SÄILYVYYS: SCHEMA_VERSION pysyy 4 (ei migration), PROGRAM_BUILD_VERSION 4.32.6 → 4.32.8 triggeröi rebuildStreetlifting16WMesocycle joka säilyttää kalibroinnin, mesocycleId, accessorySlotOverrides, insertedDeloads, postCycleAnalysis. Sessions/sets/PRs/measurements/baselines koskemattomia. v4.32.7 (edellinen): Streetlifting comp-lift -listan kanonisointi + TI-jalkapäivän cost-benefit-optimointi. KORJAUKSET: (1) Edistyminen-välilehden COMP_LIFTS-bugi: kaksi paikkaa (engine.js computeStreetliftingFinalProjection ja computeStreetliftingOpenerStrategy + index.html opener-strategia ja Ennuste kisaan -kortti) listasivat virheellisesti Maastavedon "kisaliikkeenä" ja jättivät Muscle-upin pois — streetlifting-kisaliikkeet ovat MU + Leuka + Dippi + Takakyykky (ei maavetoa). Korjattu kanoniseen KISALIIKKEET_NAMES-listaan, päivitetty liftLabels-kartat (lisätty "Muscle-up": "MU"). Bonus: Lisäpainoleuanveto sai puuttuvan isCompetitionLift:true-flagin (muut 3 kisaliikettä omasivat sen). (2) TI-jalkapäivän hip-hinge-slot: movement vaihdettu "Maastaveto" → "Romanian DL". Aiempi rakenne oli semanttisesti ristiriitainen (movement="Maastaveto" mutta note="RDL") ja vk 5-11 ajan velvoitti raskaaseen täys-DL:ään (3×5-6 Vx2-3) raskaan kyykyn jälkeen — CNS-overload + alaselkä-ylikuormitus + redundanssi hamstring-isolation-slotin kanssa. Cost-benefit selvästi negatiivinen streetlifting-kontekstissa (maaveto ei ole kisaliike). RDL säilyttää saman hamstring/glute/erector-volyymin matalammalla CNS-kuormalla, pidemmällä eccentric-aikalla (Maeo 2022 hypertrofia-stimulus) ja ilman lattiasta-noston kompressiokuormitusta alaselkään. phaseVariants päivitetty: foundation/strength/intensity = Romanian DL, peaking = Hip thrust (säilyy). (3) TI-warmup sai glute-pre-aktivaation: "Glute bridge (banded) 2×10 BW" Cossack squatin ja Heel Elevated Goblet Squatin väliin. Perustelu: ramp-vaiheessa pakara aktivoituu vasta 60-75% kohdalla — pre-aktivaatiolla glute motor unit recruitment käynnistyy alusta, ja banded variant lisää glute medius -aktivaation (lateraalinen polvistabilointi 200 kg+ kyykyssä). Peaking-warmup (vk 13-14) säilyy lyhyenä neural primer -muotona. v4.28.0 (edellinen): Elite-level audit implementation (L1, L2, M1-M4, H1-H7). Full findings-first audit suite applied. (L1) TI paused squat block-invariance poistettu: uusi SQUAT_BACKOFF_STYLES-katalogi (regular/paused/tempo/kisastyle) + block-aware backoffConfig-parametrit (vk 1-3 regular @0.52-0.58, vk 5-7 paused @0.60-0.66, vk 9-11 tempo @0.68-0.72, vk 13 kisastyle @0.74, vk 14 ei backoffia). Kisastyle ei käytä paused-stopia peakingissa — CNS-konservointi. (L2) vk 15 & 16 saivat täydet warmup-arrayt (taper → kilpailuproto "Liikekohtainen ramp: MU bändi → BW → +5, Leuka 50→65→80%, Dippi 50→65→80%, Kyykky 40→60→75→85%"). (M2) maDay/toDay backoff-symmetria: 2→3 sarjaa, reps+1 (matches TI — H7). (M3) PULL_BACKOFF_STYLES kytketty PRIMARY_VARIANTSiin: vk 5-7 MA "myotaote" + TO "kapea" (DIP_BACKOFF_STYLES), vk 9-11 MA + TO "kilpaote" — progressiivinen specificity. (M4) LA skill-vaihe restructure: primary "Muscle-up eksentrinen" 5×2 (konkreettinen liike) + uusi pull-vertical-explosive-slot (Räjähtävä leuka 4×3). (H1) shoulder-isolation ja hamstring-isolation saivat phaseVariants-progression: shoulder foundation 3×15 stretch (Maeo 2022) → strength 4×10 Vx4 → intensity 2×12 drop-set → peaking 2×15; hamstring foundation 3×12 Leg curl → strength 3×6 Vx3 Nordic (Ristolainen 2022) → intensity 3×6 Vx3 → peaking 2×12 Vx4. (H2) Peaking-warmup: uudet MA/TI/TO_WARMUP_PEAKING-vakiot (singles-focused neural primer, ei hypertrofia-prehabia) aktivoituvat phase="peaking" kautta. (H3) Deload-kalibrointierot dokumentoitu (vk 4 LA AMRAP vs vk 8/12 ilman — CNS-fatiikkiprofiilit eroavat blokkien välillä). (H4) Near-max density: vk 7 top@88 poistettu — 5→4 raskasta sessiota 6 viikossa (vastaa Zourdos 2016 taperausta). (H5) vk 9 MU muSets 4→3 (standardisoitu intensity-blokkiin). (H6) dip-eccentric-bw lisätty ACCESSORY_SLOT_CATALOGiin (foundation-only, "BW eksentrinen dippi" 3×3 Vx4, LA skill-support). (H7) Backoff-schemat symmetriset: MA/TI/TO kaikki 3×(reps+1). Neljä uutta PRESET_MOVEMENTSia (BW eksentrinen dippi, Nordic curl, Muscle-up eksentrinen, Tempo squat) + MOVEMENT_DESCRIPTIONS (evidence-based: Ristolainen 2022, Maeo 2022). v4.27.20 (edellinen): LA-päivän 2. kyykky-eksposointi blokki-progressiivisesti (general → specific). Aiempi v4.27.19: LA käytti etukyykky-variaatiota kaikissa 11 työviikossa — block-periodization-oppi (Matvejev, Issurin, Stone) vaatii progressiota kohti kisaspesifisyyttä. Uusi FS-rakenne: (1) Foundation vk 1-3: Etukyykky (motor pattern, quad-dominant variation), (2) Strength vk 5-7: Etukyykky (GPP, volyymi), (3) Intensity vk 9-11: Box squat (sticking-point specificity — TI:ssä jo Paused squat backoffissa, LA tarvitsee eri spesifisyyden; box squat nollaa stretch-refleksin → puhdas concentric "kuopasta" = 200 kg+ kisakyykyn klassinen sticking point), (4) Peaking vk 13-14: Takakyykky kisastyle kevyt (opener rehearsal + motor groove, maksimi-specificity ilman CNS-fatiikkaa). Tekninen toteutus: FS.wN-objektit saivat movement- ja refScale-kentät; laDay() lukee ne ja valitsee defaultMovementNamen, velocity-stopin (Box squat räjähtävämpi 0.60, Takakyykky kisastyle 0.55, Etukyykky konservatiivinen 0.55) sekä warmup-rampin (Takakyykky käyttää RAMP_BARBELLia, muut kevyemmän teknisen rampin). Cross-reference säilyy Takakyykky-e1RM:ssä; refScale 0.85 (Etukyykky/Box squat) tai 1.00 (Takakyykky self). Viikkoplaanien labelit päivitetty: vk 9-11 "box squat", vk 13-14 "kisakyykky kevyt". Warmup-rivin teksti dynaaminen (${fsWeek.movement}-lämmittely). Etukyykky lisätty PRESET_MOVEMENTS-seediin (oli orphan — defaultMovementName käytti "Etukyykky" mutta seedissä oli vain englanninkielinen "Front squat"). Deload-viikot 4, 8, 12 edelleen intentionaalisesti ilman LA-kyykkyä. v4.27.19: streetlifting-alignment (peru grip-endurance mixAcc:sta).: peruttu v4.27.18 grip-endurance-lisäys mixAcc:sta. Kontekstivirhe: v4.27.18:ssa lisättiin Farmer carry LA-päivän mixAcc:iin "MU false grip -tueksi", mutta streetlifterille (kisaliikkeet MU + Leuka + Dippi + Takakyykky) erillinen carry on dedikoitua harjoitusaikaa ilman kisahyötyä — ote tulee jo 94 kg leuka-primarysta ja MU-transitionin false grip -pidosta. Palautettu: mixAcc = [core-hollow] (1 slot, sama kuin MA/TI/TO:n coreSlot). Grip-endurance-entry poistettu ACCESSORY_SLOT_CATALOGista (seed-liikkeet Farmer carry/Dead hang/Heavy dead hang/Heavy farmer carry säilyvät mahdollista manuaalista accessorySlotOverrides-lisäystä varten). SAMALLA tunnustettu: etukyykky ON jo LA:ssa (v4.25 P1-1 fsWeek-parametri) 11/16 viikkoa — vk 1-3 motor pattern @55-62%, vk 5-7 strength @65-70%, vk 9-11 neural @70-75%, vk 13-14 taper @65-70% (kaikki suhteessa Takakyykky e1RM × 0.85). Deload-viikot 4, 8, 12 intentionaalisesti ilman: vk 4 sisältää Takakyykky AMRAP-kalibroinnin (v4.27.15), vk 8 + 12 puhdas palautuminen ennen seuraavaa blokkia. 2×/vk kyykky-frekvenssi toteutuu: TI raskas primary + LA tekninen etukyykky. Face pull foundation-volyymi pysyy 90 reps/wk (MA pullAcc 3×15 + TO pushAccPrehab 3×15) — sama v4.27.18 target ilman LA-redundanssia. v4.27.18: Anti-rotation core + grip-endurance + triple-coverage fix (grip-endurance-osa nyt peruttu). (anti-rotation core + grip-endurance + triple-coverage fix). (1) Uusi slotId "core-antirotation" ACCESSORY_SLOT_CATALOGiin: Pallof press / Bird dog / Landmine anti-rotation / Pallof press hold, phase-taperaus foundation 3×10/side Vx3 → strength 3×8/side Vx3 → intensity 2×8/side Vx2 → peaking 2×10/side Vx4. Perustelu: raskas kyykky (230 kg+) luo epäsymmetristä kuormaa jonka vasta-kerääntyvä rotational-shear pettää hollow-only-coren; anti-rotation palvelee frontaalitasoa jota sagittal hollow ei kata. (2) TI-päivä (kyykky) saa core-antirotationin, MA+TO säilyttävät core-hollow:n (sagittal flexion tukee leuka/dippi/MU-chainia — biomechaaniseti eri tarve). (3) Uusi slotId "grip-endurance": Farmer carry / Dead hang / Heavy farmer carry, foundation 3×30s → strength 3×40s → intensity 2×45s → peaking 2×30s. (4) Foundation face pull triple-coverage -korjaus: mixAcc:ssa (LA-päivä) scapular-control → grip-endurance. Perustelu: MA pullAcc + TO pushAccPrehab + LA mixAcc = 9 sets × 15 reps = 135 reps/wk face pull foundation-blokissa (liikaa low-fatigue-liikkeelle); vaihto pudottaa volyymin 135 → 90 reps/wk ja tukee suoraan LA:n MU-työtä koska MU:n transition on false grip -endurance-rajoitettu. (5) Seed-liikkeet päivitetty: Pohkeenkohotus + Standing/Seated calf raise (v4.27.17 täydennys), Pallof press hold + Landmine anti-rotation + Bird dog + Hollow body hold + L-sit hold + Farmer carry + Heavy farmer carry + Heavy dead hang (kaikki 58 catalog-varianttia resolvoituu seediin). v4.27.17: Accessory audit -korjaukset (calf-isolation 5. slotina, pushAcc face pull swap, MA warmup band external rotation). (composition fixes, viikosta riippumatta optimaaliset treenit). Kolme täsmämuutosta: (1) lowerAcc sai 5. slotin — Pohkeenkohotus 3×15 Vx4 ("calf-isolation", alaraaja). Perustelu: 230 kg+ kyykyn lockout vaatii nilkan rigidityä (soleus-toorque + gastrocnemius-elastic), aiemmin isolaatioo nolla — ankkurikohta puuttui plantariflexion ketjusta. (2) pushAcc (strength-blokki vk 5+) vaihdettu: Sivunosto 3×15 → Face pull 2×12 Vx4 ("scapular-control", horisontaaliveto). Perustelu: strength-blokissa viikottainen dippivolyymi nousee (primary 24–30 raskasta toistoa + backoff + skill-slotin tempo dippi) — posterior delt + rotator cuff balance kriittinen, ja foundation-blokissa (vk 1–4) pushAccPrehab tarjoaa jo face pullin 3×15 joten strength-blokissa riittää 2×12 (complementary volume). Sivunosto redundantti Pystypunnerruksen V3/8-rep-rangessa. (3) maDay warmup sai Band external rotation 2×12 per puoli — symmetria TO:n prehab-depthin kanssa (rotator cuff aktivaatio ennen vetoja, ei aiemmin ollut MA:lla mutta oli TO:lla). Manuaalinen muokkaus tuettu: accessorySlotOverrides-mekanismi salvaa slotId-pohjaisen vaihdon UI:n 🔒-lukolla, stagnation-swap ehdottaa automaattisesti vaihtoehtoa jos slot junnaa — rakenne pysyy pseudonyymisti eheänä. v4.27.16: MU-autoregulaation Vx-gradientti laajennettu. Aiempi adjustMULoad: −5 / −2.5 / 0 / +2.5 (avgVx:n mukaan). Kun atleetti raportoi avgVx ≥ 4 (selvästi liian kevyt), +2.5 kg oli liian varovainen — ohjelma eteni vain 2.5 kg/vk vaikka signaali sanoi että varaa on enemmänkin. Uusi porrastus lisää +5 kg -askeleen kun avgVx ≥ 4 JA minVx ≥ 3 (estää harhaanjohtavaa keskiarvoa jos 1 sarja oli V0-2). +5 kg on enimmäisaskel — MU:n bimodaalisen luonteen takia isommat kertahypyt ovat liian riskialttiita. v4.27.15: AMRAP-kalibrointiprotokolla W4 LA:lle. W4 LA-sessio (streetlifting_16w) vaihdettu "3RM testi"-labelista todelliseen AMRAP-kalibrointisessioon: kolme setRole:"calibration"-slotia (Leuka/Dippi/Kyykky) @85 % × tekninen failure, actualVx pakotetaan 0:aan. Engine.computeMovementProgress tunnistaa calibration-setit ja override:aa e1RM:n kun viim. 3 top-setissä on kalibrointi — sen sijaan että mediaani sekoittaisi Vx-biasoidut ja kalibrointi-setit. Epley+Vara actualVx=0:lla redusoituu puhtaaksi Epleyksi (load × (1 + reps/30)), joten kalibrointi antaa Vx-biasista vapaan ground-truth-mittauksen. Rate-limit-ankkuri ei muutu — kalibrointi-sessio suodatetaan computeRateLimitAnchorissa (Vx=0 drop), joten ankkuri pysyy todellisissa treenisessioissa. v4.27.14: rate-limit-ankkuri robustimmaksi (viim. 3 session raskain median). Pre-v4.27.14: rate-limit-cap (session-to-session +6/+10/+15 % Vx-deltan mukaan) käytti yksittäistä viim. setriä ankkurina (recentTopSets[length-1] primaryssa, selfSets[last] cross-referencessä) — altis yksittäisen anomalian vaikutukselle: deload-session kevein setti sulki capin keinotekoisesti alas, 3RM-testin failure-setti (Vx0) päätyi ankkuriksi, yksittäinen grind vinoutti cappia. KORJAUS: uusi computeRateLimitAnchor(recentTopSets)-helperi: ryhmittää setit sessionId:n mukaan, ottaa viim. 3 sessiota, laskee kunkin MEDIAN load + MEDIAN Vx (suodattaa readiness_testin ja Vx0-failuret), ankkuri = RASKAIN median-load näistä — deload/test ei vedä cappia alas, mutta yksittäinen spiikkikään ei nosta cappia perusteettomasti. Käytössä sekä primary-polussa (PROGRESSION_RATE_LIMIT) että cross-reference-haarassa (PROGRESSION_RATE_LIMIT_CROSSREF). v4.27.13: loadPct-slottien resolvointi (engine resolvoi jokaisen loadPct-slotin kuorman: sama liike → session-effective-e1RM primaryn rate-limitatusta targetista; cross-reference esim. Etukyykky→Takakyykky → referenssin e1RM + oma rate-limit; UI lukee slot.resolvedLoadKg:n).

const APP_VERSION = "3.2.0";
// v4.38.0: SCHEMA_VERSION 4 → 5. Muutos: set-objektille lisätty optional kenttä
// `mvReps: number[] | null` per-rep MPV-arvojen tallennukseen (Enode working-set
// per-rep velocity entry, Phase 1B). Migration ei vaadi datakonversiota — vanhat
// setit jäävät mvReps: undefined -tilaan mikä vastaa "ei kerätty" -semantiikkaa.
// Lukulogiikka käyttää `set.mvReps ?? null`. Pre-migration backup ajetaan
// automaattisesti createPreMigrationBackupIfNeeded:ssa.
const SCHEMA_VERSION = 5;
const DB_NAME = "LeVeCoachDB";
const TIMEZONE = "Europe/Helsinki";

// v4.30.2: Ohjelman build-versio. Käytetään mesocycle-objektin programVersion-
// kentässä auto-rebuild -mekanismiin (ks. rebuildStreetlifting16WMesocycle).
// Nosta tätä JOKAISESSA streetlifting_16w-ohjelmaa muuttavassa committissa
// (data.js: PRESET_MOVEMENTS / ACCESSORY_SLOT_CATALOG / weekPlans / FS / maDay/tiDay/
//  toDay/laDay-funktiot). Init() vertaa mesocyclen programVersion-arvoa tähän
// ja jos ne eroavat, weekPlans rakennetaan automaattisesti uudelleen säilyttäen
// käyttäjän edistys (startDateISO, calibration, accessorySlotOverrides).
// PROGRAM_BUILD_VERSION pysyy 4.38.9:ssä koska v4.39.0:n muutokset ovat
// PURE UI (wizard-integraatio: onboarding-banneri, Asetukset-kortti,
// migraatio-banneri). weekPlans-rakenne / PRESET_MOVEMENTS /
// ACCESSORY_SLOT_CATALOG / DayN-funktiot eivät muutu, joten
// streetlifting_16w-mesocyclen auto-rebuild EI saa laueta. Sw.js APP_VERSION
// bumppataan erikseen 4.39.0:ksi PWA-päivitysbannerin triggeröimiseksi.
// v4.52.35 (M2/OBS-022): sisä-blokki-intensifikaatio — primary reps+Vx-ramppi
// vk2/3/5/7/9/11 (HANDOFF §4). Bump triggeröi auto-rebuildin → ramppi aktivoituu
// olemassa olevissa asennuksissa ilman edistyksen menetystä.
const PROGRAM_BUILD_VERSION = "4.59.0";

// ── Store names ──
const STORES = {
  appMeta: "appMeta",
  movements: "movements",
  variants: "variants",
  sessions: "sessions",
  sets: "sets",
  measurements: "measurements",
  protocols: "protocols",
  baselines: "baselines",
  mesocycles: "mesocycles",
  recommendations: "recommendations",
  decisionTraces: "decisionTraces",
  movementProgress: "movementProgress",
  // v4.26.0: viikottaiset auto-backup-snapshotit (rolling 4 viimeisintä)
  backupSnapshots: "backupSnapshots",
};

// ── Movement categories ──
const CATEGORIES = [
  "vertikaaliveto",
  "horisontaaliveto",
  "hauisfleksio",
  "vertikaalityöntö",
  "horisontaalityöntö",
  "ojentajaekstensio",
  "core",
  "alaraaja",
  "muu",
];

const PULL_VOLUME_CATEGORIES = new Set([
  "vertikaaliveto",
  "horisontaaliveto",
  "hauisfleksio",
]);

// v4.32.6: Lihaksia/kategorioita joissa tiukka sarja (V≤5 + kuormitettu) ilman riittävää
// lämmittelyä on dokumentoidun venähdys-riskin paikka. Käyttäjäpalaute (v4.32.5):
// "vasen rinta otti osumaa väsyneenä lopussa V5-dipeissä" → riski on todellinen,
// vaatii systeeminen muistutus + lämppäpainot ennen työsarjoja.
//   - horisontaalityöntö: pec-insertion (sternum), bench/dippi pec-tear-riski
//   - alaraaja: hamstring (RDL/maaveto), adductor (kyykky low bar), patellatendon
//   - vertikaalityöntö: anterior delt (overhead press), supraspinatus
const INJURY_RISK_CATEGORIES = new Set([
  "horisontaalityöntö",
  "alaraaja",
  "vertikaalityöntö",
]);

// v4.32.6: Liikkeet joissa varoitus laukeaa silloinkin kun kategoria ei ole edellä —
// esim. Lisäpainoleuanveto on vertikaaliveto (ei riski-kategoria), mutta
// distaalibiceps-rupture on dokumentoitu eliittilifterin riski raskaalla lisäkuormalla.
const INJURY_RISK_LOADED_MOVEMENTS = new Set([
  "Lisäpainodippi", "Penkkipunnerrus", "Lisäpainoleuanveto", "Vastaote-leuanveto",
  "Paused pull-up", "Tempo pull-up", "Hip thrust", "Takakyykky", "Etukyykky",
  "Paused squat", "Maastaveto", "Pystypunnerrus", "Heavy negative leuka",
]);

// MRV (Maximum Recoverable Volume) — hard sets per muscle/category per week.
// Conservative Helms/Schoenfeld lower bound; user can override via settings.mrvOverrides.
const MRV_SETS_PER_CATEGORY = {
  vertikaaliveto:      22,
  horisontaaliveto:    20,
  vertikaalityöntö:    18,
  horisontaalityöntö:  16,
  hauisfleksio:        14,
  ojentajaekstensio:   14,
  alaraaja:            18,
  core:                20,
  muu:                 16,
};

const CATEGORY_LABELS_SHORT = {
  vertikaaliveto:     "Vert. veto",
  horisontaaliveto:   "Hor. veto",
  vertikaalityöntö:   "Vert. työntö",
  horisontaalityöntö: "Hor. työntö",
  hauisfleksio:       "Hauis",
  ojentajaekstensio:  "Ojentaja",
  alaraaja:           "Alaraaja",
  core:               "Core",
  muu:                "Muu",
};

const CATEGORY_COLORS = {
  vertikaaliveto:     "#4f8cff",
  horisontaaliveto:   "#22c55e",
  vertikaalityöntö:   "#06b6d4",
  horisontaalityöntö: "#a855f7",
  hauisfleksio:       "#84cc16",
  ojentajaekstensio:  "#ec4899",
  alaraaja:           "#f59e0b",
  core:               "#8899bb",
  muu:                "#5a6a8a",
};

// v4.34.25: Isolation-liikkeiden tunnistus failureReaction()-yli-suojan välttämiseksi.
// Käyttäjäpalaute: hauiskääntö 3×12 V3/V2/V0 → engine ei saa laukaista -2.5% ensi vk:lle
// kun viim. sarjan V0 on hypertrofian normaali stimulus (RP/Israetel/Helms-konsensus).
// Mukana sekä movement-category-arvot (PRESET_MOVEMENTS:n category-kentät) että
// slot-funktio-tason kategoriat jotka resolvoituvat isolation-tyyppisiin liikkeisiin.
const ISOLATION_CATEGORIES = new Set([
  "hauisfleksio",        // hauiskääntö, preacher, hammer, spider, bayesian
  "ojentaja-ext",        // tricep pushdown, overhead ext, kickback, skull crusher, french press
  "calf-isolation",      // pohjenosto, standing/seated calf raise
  "shoulder-isolation",  // sivunosto, lateral raise (kone), trap 3 raise, powell raise
  "hamstring-isolation", // leg curl, nordic curl
  "knee-dominant-isolation", // leg extension
  "scapular-control",    // face pull, band pull-apart
  "core-hollow",         // hollow body hold, ab wheel rollout, hanging leg raise, cable crunch
  "core-antirotation",   // pallof press, bird dog, landmine anti-rotation
]);

function isIsolationMovement(movementCategory) {
  if (!movementCategory) return false;
  return ISOLATION_CATEGORIES.has(movementCategory);
}

// ── Preset movements (40+ across all categories) ──
// β Round B-α-1: tier-kenttä per movement-record (L48 ratifiointi).
// number (1/2/3) | function(mesocycle) | "special".
// MU-kontekstuaalinen funktio: Taso 1 streetlifting_16w-mesossa, Taso 3 muualla.
const PRESET_MOVEMENTS = [
  // ─── Primary ───
  { name: "Lisäpainoleuanveto", category: "vertikaaliveto", isPrimary: true, isPreset: true, isCompetitionLift: true, loadType: "system", tier: 1 },
  // ─── Vertical pull ───
  { name: "Ylätalja", category: "vertikaaliveto", isPrimary: false, isPreset: true, tier: 3 },
  { name: "Lat pulldown", category: "vertikaaliveto", isPrimary: false, isPreset: true, tier: 3 },
  { name: "Pullover kone", category: "vertikaaliveto", isPrimary: false, isPreset: true, tier: 3 },
  { name: "Leuanveto (kehonpaino)", category: "vertikaaliveto", isPrimary: false, isPreset: true, loadType: "system", tier: 3 },
  { name: "Ylätalja neutraaliote", category: "vertikaaliveto", isPrimary: false, isPreset: true, tier: 3 },
  { name: "Single-arm lat pulldown", category: "vertikaaliveto", isPrimary: false, isPreset: true, tier: 3 },
  // ─── Horizontal pull ───
  { name: "Penkkiveto", category: "horisontaaliveto", isPrimary: false, isPreset: true, tier: 3 },
  { name: "Alatalja", category: "horisontaaliveto", isPrimary: false, isPreset: true, tier: 3 },
  { name: "Seated row", category: "horisontaaliveto", isPrimary: false, isPreset: true, tier: 3 },
  { name: "Cable row", category: "horisontaaliveto", isPrimary: false, isPreset: true, tier: 3 },
  { name: "T-bar row", category: "horisontaaliveto", isPrimary: false, isPreset: true, tier: 3 },
  { name: "Chest-supported row", category: "horisontaaliveto", isPrimary: false, isPreset: true, tier: 3 },
  { name: "Kulmasoutu käsipainot", category: "horisontaaliveto", isPrimary: false, isPreset: true, tier: 3 },
  { name: "Seal row", category: "horisontaaliveto", isPrimary: false, isPreset: true, tier: 3 },
  { name: "Face pull", category: "horisontaaliveto", isPrimary: false, isPreset: true, tier: 3 },
  // ─── Bicep flexion ───
  { name: "Hauiskääntö tanko", category: "hauisfleksio", isPrimary: false, isPreset: true, tier: 3 },
  { name: "Hauiskääntö käsipainot", category: "hauisfleksio", isPrimary: false, isPreset: true, tier: 3 },
  { name: "Hammer curl", category: "hauisfleksio", isPrimary: false, isPreset: true, tier: 3 },
  { name: "Preacher curl", category: "hauisfleksio", isPrimary: false, isPreset: true, tier: 3 },
  { name: "Incline curl", category: "hauisfleksio", isPrimary: false, isPreset: true, tier: 3 },
  { name: "Spider curl", category: "hauisfleksio", isPrimary: false, isPreset: true, tier: 3 },
  { name: "Cable curl", category: "hauisfleksio", isPrimary: false, isPreset: true, tier: 3 },
  { name: "Bayesian curl", category: "hauisfleksio", isPrimary: false, isPreset: true, tier: 3 },
  // ─── Vertical push ───
  { name: "Pystypunnerrus", category: "vertikaalityöntö", isPrimary: false, isPreset: true, tier: 2 },
  { name: "Shoulder press laite", category: "vertikaalityöntö", isPrimary: false, isPreset: true, tier: 3 },
  { name: "Pystypunnerrus käsipainot", category: "vertikaalityöntö", isPrimary: false, isPreset: true, tier: 3 },
  { name: "Sivunosto", category: "vertikaalityöntö", isPrimary: false, isPreset: true, tier: 3 },
  { name: "Lateral raise kone", category: "vertikaalityöntö", isPrimary: false, isPreset: true, tier: 3 },
  // v4.34.3: Anterior-stabilizer-accessoryt dippi-spesifin oirekuvan ratkaisuun (Andersen 2014, Kim 2025).
  // Half-kneeling KB Bottoms-Up Press = subscap + SA + RC sequencing pakottaa anterior-stabilizers-koordinaatioon
  // matalalla kuormalla. Sijoitettu vertikaalityöntöön koska kuorma menee yläspäin (vrt OHP).
  { name: "Half-kneeling KB bottoms-up press", category: "vertikaalityöntö", isPrimary: false, isPreset: true, tier: 3 },
  // v4.34.14: Owen Gayle (winningstrength) cable-variantti shoulder stabilizers -työhön
  // streetlifting-spesifisti. Korvaa KB BUP:in atleeteille joilla ei ole kahvakuulaa.
  { name: "Half-kneeling cable OHP", category: "vertikaalityöntö", isPrimary: false, isPreset: true, tier: 3 },
  // v4.34.14: Half Turkish Get-up — selältä kyljelle DB extended overhead. Owen Gayle:n
  // shoulder stabilizer + dippi-spesifi tukiliike. Olkapään asento-stabilointi kuormalla
  // koko liikeradan yli — täydentää horisontaalia push-volyymiä loaded scapular control:lla.
  { name: "Half Turkish Get-up (DB)", category: "vertikaalityöntö", isPrimary: false, isPreset: true, tier: 3 },
  // v4.34.3: SA + LT priming. Push-up plus = SA 50-80% MVIC (Park & Hwang 2019).
  { name: "Push-up plus", category: "horisontaalityöntö", isPrimary: false, isPreset: true, tier: 3 },
  // v4.34.3: Loaded GH mobility — SA 37%, LT 21%, UT 18% MVIC (Caravan 2018, Tarpada 2014).
  { name: "Half-kneeling KB armbar", category: "muu", isPrimary: false, isPreset: true, tier: 3 },
  // v4.34.4: Owen Gayle (owen_winningstrength) streetlifting-spesifit shoulder-stabilizer-accessoryt.
  // Powell Raise = Owenin "top choice" — supraspinatus + posterior delt + lower trap + serratus.
  // Trap 3 Raise = Owenin structural balance test (8 reps × 12.5% × dip 1RM) + accessory.
  // Kohdistuvat scapular upward rotation + posterior tilt -koordinaatioon, jonka heikkous
  // = scapular depression dipissä → impingement + AB-IGHL stress → atleetin oirekuva.
  { name: "Powell Raise (DB, side-lying)", category: "muu", isPrimary: false, isPreset: true, tier: 3 },
  { name: "Powell Raise (kaapeli, seisten)", category: "muu", isPrimary: false, isPreset: true, tier: 3 },
  { name: "Trap 3 Raise", category: "muu", isPrimary: false, isPreset: true, tier: 3 },
  // ─── Horizontal push ───
  { name: "Penkkipunnerrus", category: "horisontaalityöntö", isPrimary: false, isPreset: true, tier: 1 },
  { name: "Chest press", category: "horisontaalityöntö", isPrimary: false, isPreset: true, tier: 3 },
  { name: "Pec deck", category: "horisontaalityöntö", isPrimary: false, isPreset: true, tier: 3 },
  { name: "Vinopenkkipunnerrus", category: "horisontaalityöntö", isPrimary: false, isPreset: true, tier: 2 },
  { name: "Cable fly", category: "horisontaalityöntö", isPrimary: false, isPreset: true, tier: 3 },
  { name: "Dippi", category: "horisontaalityöntö", isPrimary: false, isPreset: true, tier: 3 },
  // v4.34.2: Dippilaite (plate-loaded) — vipuvarsidippilaite levypainoilla. Hyödyllinen
  // accessory-versio dipistä jossa kuorma asetellaan tarkasti, ROM on rajattu, ja
  // alkukulman riski (kylmä RC + pec extended) on pienempi kuin tankodipissä.
  { name: "Dippilaite (plate-loaded)", category: "horisontaalityöntö", isPrimary: false, isPreset: true, tier: 3 },
  // ─── Tricep extension ───
  { name: "Tricep pushdown", category: "ojentajaekstensio", isPrimary: false, isPreset: true, tier: 3 },
  { name: "French press", category: "ojentajaekstensio", isPrimary: false, isPreset: true, tier: 3 },
  { name: "Overhead tricep ext", category: "ojentajaekstensio", isPrimary: false, isPreset: true, tier: 3 },
  { name: "Skull crusher", category: "ojentajaekstensio", isPrimary: false, isPreset: true, tier: 3 },
  { name: "Kickback", category: "ojentajaekstensio", isPrimary: false, isPreset: true, tier: 3 },
  // ─── Core ───
  { name: "Ab crunch", category: "core", isPrimary: false, isPreset: true, tier: 3 },
  { name: "Cable crunch", category: "core", isPrimary: false, isPreset: true, tier: 3 },
  { name: "Hanging leg raise", category: "core", isPrimary: false, isPreset: true, tier: 3 },
  { name: "Ab wheel rollout", category: "core", isPrimary: false, isPreset: true, tier: 3 },
  { name: "Pallof press", category: "core", isPrimary: false, isPreset: true, tier: 3 },
  // v4.27.18: anti-rotation + grip-endurance + hollow variants
  { name: "Pallof press hold", category: "core", isPrimary: false, isPreset: true, tier: 3 },
  { name: "Landmine anti-rotation", category: "core", isPrimary: false, isPreset: true, tier: 3 },
  { name: "Bird dog", category: "core", isPrimary: false, isPreset: true, tier: 3 },
  { name: "Hollow body hold", category: "core", isPrimary: false, isPreset: true, tier: 3 },
  { name: "L-sit hold", category: "core", isPrimary: false, isPreset: true, tier: 3 },
  { name: "Farmer carry", category: "core", isPrimary: false, isPreset: true, tier: 3 },
  { name: "Heavy farmer carry", category: "core", isPrimary: false, isPreset: true, tier: 3 },
  { name: "Heavy dead hang", category: "core", isPrimary: false, isPreset: true, tier: 3 },
  // ─── Lower body ───
  { name: "Jalkaprässi", category: "alaraaja", isPrimary: false, isPreset: true, tier: 3 },
  { name: "Kyykky", category: "alaraaja", isPrimary: false, isPreset: true, tier: 3 },
  { name: "Maastaveto", category: "alaraaja", isPrimary: false, isPreset: true, tier: 1 },
  { name: "Leg curl", category: "alaraaja", isPrimary: false, isPreset: true, tier: 3 },
  { name: "Leg extension", category: "alaraaja", isPrimary: false, isPreset: true, tier: 3 },
  { name: "Bulgarian split squat", category: "alaraaja", isPrimary: false, isPreset: true, tier: 3 },
  // v4.48.0: yhden jalan jalkaprässi unilateraalinen quad/glute-isolaatio
  { name: "Yhden jalan jalkaprässi", category: "alaraaja", isPrimary: false, isPreset: true, tier: 3 },
  { name: "Hip thrust", category: "alaraaja", isPrimary: false, isPreset: true, tier: 3 },
  { name: "Pohjenosto", category: "alaraaja", isPrimary: false, isPreset: true, tier: 3 },
  // v4.27.18: calf-isolation variants (Pohkeenkohotus = yleisempi suomenkielinen termi vs Pohjenosto)
  { name: "Pohkeenkohotus", category: "alaraaja", isPrimary: false, isPreset: true, tier: 3 },
  { name: "Standing calf raise", category: "alaraaja", isPrimary: false, isPreset: true, tier: 3 },
  { name: "Seated calf raise", category: "alaraaja", isPrimary: false, isPreset: true, tier: 3 },
  // ─── Other / grip ───
  { name: "Rannekoukistus", category: "muu", isPrimary: false, isPreset: true, tier: 3 },
  { name: "Wrist roller", category: "muu", isPrimary: false, isPreset: true, tier: 3 },
  { name: "Dead hang", category: "muu", isPrimary: false, isPreset: true, tier: 3 },
  { name: "Shrug", category: "muu", isPrimary: false, isPreset: true, tier: 3 },
  // ─── Streetlifting competition lifts ───
  // Muscle-up tier kontekstuaalinen: Taso 1 streetlifting_16w-mesossa, Taso 3 muualla (L48 B.i).
  { name: "Muscle-up", category: "vertikaaliveto", isPrimary: false, isPreset: true, isCompetitionLift: true, loadType: "system", tier: (meso) => meso && meso.type === "streetlifting_16w" ? 1 : 3 },
  { name: "Lisäpainodippi", category: "horisontaalityöntö", isPrimary: false, isPreset: true, isCompetitionLift: true, loadType: "system", tier: 2 },
  { name: "Takakyykky", category: "alaraaja", isPrimary: false, isPreset: true, isCompetitionLift: true, loadType: "external", tier: 1 },
  // ─── Streetlifting-spesifiset tukiliikkeet (v4.11) ───
  { name: "Leuanveto chest-to-bar", category: "vertikaaliveto", isPrimary: false, isPreset: true, loadType: "system", tier: 2 },
  { name: "False grip pull-up", category: "vertikaaliveto", isPrimary: false, isPreset: true, loadType: "system", tier: 3 },
  { name: "False grip row", category: "horisontaaliveto", isPrimary: false, isPreset: true, tier: 3 },
  { name: "Archer pull-up", category: "vertikaaliveto", isPrimary: false, isPreset: true, loadType: "system", tier: 3 },
  { name: "Scapular pull-up", category: "vertikaaliveto", isPrimary: false, isPreset: true, loadType: "system", tier: 3 },
  { name: "Band-assisted muscle-up", category: "vertikaaliveto", isPrimary: false, isPreset: true, loadType: "system", tier: 3 },
  // Räjähtävä leuka: tier 2 cross-reference Lisäpainoleuanveto-e1RM:iin + V4-stop-rule UI-erityislogiikka (L47 A.i).
  { name: "Räjähtävä leuka", category: "vertikaaliveto", isPrimary: false, isPreset: true, loadType: "system", tier: 2 },
  // v4.29.0 (P3): ME-rotaatio yläosalla — vaihtuvat pää-leuka-variantit foundation/strength-blokeille
  { name: "Vastaote-leuanveto", category: "vertikaaliveto", isPrimary: false, isPreset: true, loadType: "system", tier: 2 },
  { name: "Paused pull-up", category: "vertikaaliveto", isPrimary: false, isPreset: true, loadType: "system", tier: 2 },
  // v4.30.0: Tempo pull-up (ei grippi-spesifi) korvaa Fat-bar pull-upin ME-rotaation
  // viim. vaiheessa — käyttäjä on meritoitunut leuanvetäjä, grippi ei ole rajoittava.
  { name: "Tempo pull-up", category: "vertikaaliveto", isPrimary: false, isPreset: true, loadType: "system", tier: 2 },
  { name: "Fat-bar pull-up", category: "vertikaaliveto", isPrimary: false, isPreset: true, loadType: "system", tier: 3 },
  // v4.29.0 (P4): Overload-liikkeet — eliitti­tason heikon kohdan ylikuormitus.
  // Heavy negative leuka + Board dippi: tier "special" — supramaksimi-overload, kuormat
  // ratkaistaan in-session, ei e1RM/L-V-pohjalta (L48 ratifiointi C.iii).
  { name: "Heavy negative leuka", category: "vertikaaliveto", isPrimary: false, isPreset: true, loadType: "system", tier: "special" },
  { name: "Board dippi", category: "horisontaalityöntö", isPrimary: false, isPreset: true, loadType: "system", tier: "special" },
  // v4.31.0: BW dippi — käytetään lähinnä warmup/neural-primer-rooleissa.
  // HUOM: kuormitetulle dippaajalle (kuten käyttäjä, penkki 180 kg) BW on V8–V10,
  // ei sovellu varsinaisena tertiary-primer-roolina (V5). Tertiary käyttää
  // Lisäpainodippiä ~50 % 1RM @ V5.
  { name: "BW dippi", category: "horisontaalityöntö", isPrimary: false, isPreset: true, loadType: "system", tier: 3 },
  { name: "Pendlay row", category: "horisontaaliveto", isPrimary: false, isPreset: true, tier: 2 },
  { name: "Weighted inverted row", category: "horisontaaliveto", isPrimary: false, isPreset: true, tier: 2 },
  // v4.28.2: Ring dip poistettu — kalustorajoite (atleetilla ei ole renkaita).
  // Korvattu Tempo pause dipillä mu-dip-support foundation-vaiheessa.
  { name: "Close-grip dip", category: "horisontaalityöntö", isPrimary: false, isPreset: true, tier: 3 },
  { name: "Straight bar dip", category: "horisontaalityöntö", isPrimary: false, isPreset: true, tier: 3 },
  { name: "Russian dip", category: "horisontaalityöntö", isPrimary: false, isPreset: true, tier: 3 },
  { name: "Close-grip bench", category: "horisontaalityöntö", isPrimary: false, isPreset: true, tier: 2 },
  // H-019 A2 (OBS-044): "L-sit hold" + "Hollow body hold" -duplikaattirivit poistettu
  // tästä (alkuperäiset ovat core-lohkossa ylempänä). Jo-seedattuihin asennuksiin nimi-
  // dedup estää re-additionin; T3-lukko on nyt globaali uniikkius (dupNames.length === 0).
  { name: "Front-foot elevated split squat", category: "alaraaja", isPrimary: false, isPreset: true, tier: 3 },
  { name: "Paused squat", category: "alaraaja", isPrimary: false, isPreset: true, tier: 2 },
  // v4.27.20: Etukyykky (suomenkielinen) — laDay fsWeek default foundation/strength vaiheissa.
  // Etukyykky = Front squat (sama liike, suomi/englanti-nimi). Itsenäinen Taso 2 omalla cal-arvolla
  // (L47 vastaus 4): EI cross-reference Takakyykky-e1RM:iin koska painot eroavat liian paljon.
  { name: "Etukyykky", category: "alaraaja", isPrimary: false, isPreset: true, tier: 2 },
  // v4.34.14: EZ-tanko declined-penkkipunnerrus — käyttäjän gym-spesifi laite + tanko.
  // Klassinen dippi-tukiliike: sama kuormavektori kuin dipissä (alas + ulos rinnan tasolle),
  // EZ-tanko vähentää kyynärpään ulkokierto-stressiä vs suora tanko. Triceps-dominantti.
  { name: "Decline penkkipunnerrus (EZ-tanko)", category: "horisontaalityöntö", isPrimary: false, isPreset: true, tier: 2 },
  // ─── Alaraaja-variantit (v4.27.1) — maaveto/kyykky-spesifiset tukiliikkeet
  //     räätälöityyn ohjelmageneraattoriin. COMPLEMENT/SECONDARY-rooleihin alaraaja-primaryille.
  { name: "Romanian DL",       category: "alaraaja", isPrimary: false, isPreset: true, tier: 2 },
  { name: "Deficit DL",        category: "alaraaja", isPrimary: false, isPreset: true, tier: 2 },
  { name: "Front squat",       category: "alaraaja", isPrimary: false, isPreset: true, tier: 2 },
  { name: "Pin squat",         category: "alaraaja", isPrimary: false, isPreset: true, tier: 2 },
  { name: "Walking lunge",     category: "alaraaja", isPrimary: false, isPreset: true, tier: 3 },
  // ─── Lift-spesifit variantit (v4.27.2) — primaryn nimen perusteella ohjautuvat
  //     tukiliikkeet. Maaveto-primaryille DL-spesifit; penkki-primaryille pause/CGBP;
  //     OHP-primaryille push press / Z-press / Seated.
  // DL-spesifit (tier 2 cross-reference Maastaveto-e1RM:iin)
  { name: "Block pull",        category: "alaraaja", isPrimary: false, isPreset: true, tier: 2 },
  { name: "Paused DL",         category: "alaraaja", isPrimary: false, isPreset: true, tier: 2 },
  { name: "Snatch-grip DL",    category: "alaraaja", isPrimary: false, isPreset: true, tier: 2 },
  { name: "Good morning",      category: "alaraaja", isPrimary: false, isPreset: true, tier: 2 },
  // Kyykky-spesifit (tier 2 cross-reference Takakyykky-e1RM:iin)
  { name: "Safety bar squat",  category: "alaraaja", isPrimary: false, isPreset: true, tier: 2 },
  { name: "Box squat",         category: "alaraaja", isPrimary: false, isPreset: true, tier: 2 },
  // Penkki-spesifit (tier 2 cross-reference Penkkipunnerrus-e1RM:iin)
  { name: "Paused bench press",    category: "horisontaalityöntö", isPrimary: false, isPreset: true, tier: 2 },
  { name: "Spoto press",           category: "horisontaalityöntö", isPrimary: false, isPreset: true, tier: 2 },
  { name: "Larsen press",          category: "horisontaalityöntö", isPrimary: false, isPreset: true, tier: 2 },
  { name: "Board press",           category: "horisontaalityöntö", isPrimary: false, isPreset: true, tier: 2 },
  // OHP-spesifit (tier 2 itsenäinen, L47 vastaus 11)
  { name: "Push press",        category: "vertikaalityöntö", isPrimary: false, isPreset: true, tier: 2 },
  // v4.49.0 (Track B Vaihe 2D-γ): Westside ME-Upper -liikkeet + GZCL T2 -variantit + Sheiko accessory
  { name: "Floor press",       category: "horisontaalityöntö", isPrimary: false, isPreset: true, tier: 2 },
  { name: "Pin press",         category: "horisontaalityöntö", isPrimary: false, isPreset: true, tier: 2 },
  { name: "JM press",          category: "horisontaalityöntö", isPrimary: false, isPreset: true, tier: 3 },
  { name: "Wide-grip bench",   category: "horisontaalityöntö", isPrimary: false, isPreset: true, tier: 2 },
  { name: "Long pause bench",  category: "horisontaalityöntö", isPrimary: false, isPreset: true, tier: 2 },
  { name: "Rack pull",         category: "alaraaja", isPrimary: false, isPreset: true, tier: 2 },
  { name: "Glute-Ham Raise",   category: "alaraaja", isPrimary: false, isPreset: true, tier: 3 },
  // Pilari 3 R5 (P2 kalusto): Nordic ham + käsipaino-RDL — GHR:n (laite) substituutit ilman laitetta/tankoa.
  { name: "Nordic ham",        category: "alaraaja", isPrimary: false, isPreset: true, tier: 3 },
  { name: "Käsipaino-RDL",     category: "lonkkahingaus", isPrimary: false, isPreset: true, tier: 3 },
  { name: "Hyperextensio",     category: "core",     isPrimary: false, isPreset: true, tier: 3 },
  { name: "Dumbbell fly",      category: "horisontaalityöntö", isPrimary: false, isPreset: true, tier: 3 },
  { name: "Power shrug",       category: "muu",      isPrimary: false, isPreset: true, tier: 3 },
  { name: "Seated OHP",        category: "vertikaalityöntö", isPrimary: false, isPreset: true, tier: 2 },
  { name: "Z-press",           category: "vertikaalityöntö", isPrimary: false, isPreset: true, tier: 2 },
  // ─── Dippi-prehab-variantit (v4.27.4) — sternum/pec-insertion-kestävyys
  //     ROM-kapasiteetti + stretch-hypertrofia. Käytetään foundation-blokissa (vk 1–4)
  //     dippi-päivän pushAccPrehab-tukiliikepaketissa kuormituksen nosto ennen voima-blokkia.
  { name: "Tempo pause dippi",      category: "horisontaalityöntö", isPrimary: false, isPreset: true, tier: 3 },
  { name: "Incline dumbbell press", category: "horisontaalityöntö", isPrimary: false, isPreset: true, tier: 3 },
  // H-018 OSA 2 (OBS-041, 2026-06-13): käsipainopenkki flätti — yleinen perus-
  // työntöliike puuttui katalogista (vino oli jo "Incline dumbbell press").
  // Surface'aa olemassa oleviin asennuksiin ensureNewPresetMovements:in kautta.
  { name: "Käsipainopenkki",        category: "horisontaalityöntö", isPrimary: false, isPreset: true, tier: 3 },
  // Pilari 3 R5 (P2 kalusto): käsipaino-lattiapunnerrus — horisontaalityöntö ILMAN penkkiä (P2-substituutti Käsipainopenkille).
  { name: "Käsipainolattiapunnerrus", category: "horisontaalityöntö", isPrimary: false, isPreset: true, tier: 3 },
  // Pilari 3 R2 (OBS-053 minimaalisesti, 2026-06-28): käsipaino-soutu — käsipaino+leukatanko-
  // kotikuntoilijalta (P2) puuttui pätevä horisontaaliveto-liike → FIX-B substituoi cross-category
  // (väärä leima + duplikaatti, MEV-vaje). Tämä antaa aidon selkä-option. Rengasvariantit → backlog.
  { name: "Käsipainosoutu",         category: "horisontaaliveto",   isPrimary: false, isPreset: true, tier: 3 },
  { name: "Dumbbell pullover",      category: "horisontaalityöntö", isPrimary: false, isPreset: true, tier: 3 },
  { name: "Incline deficit pushup", category: "horisontaalityöntö", isPrimary: false, isPreset: true, tier: 3 },
  // v4.28.0: dip-eccentric-bw (LA skill-vaihe) ja Nordic curl (hamstring-isolation strength/intensity)
  { name: "BW eksentrinen dippi",   category: "horisontaalityöntö", isPrimary: false, isPreset: true, tier: 3 },
  { name: "Nordic curl",            category: "alaraaja",           isPrimary: false, isPreset: true, tier: 3 },
  // v4.28.0: MU skill-vaiheen strukturoidut slotit (laDay isSkill-haara)
  { name: "Muscle-up eksentrinen",  category: "vertikaaliveto",     isPrimary: false, isPreset: true, tier: 3 },
  // v4.28.0: Tempo squat + Kilpakyykky kevyt (tiDay backoff block-progression L1)
  { name: "Tempo squat",            category: "alaraaja",           isPrimary: false, isPreset: true, tier: 2 },
];

// ─── Movement descriptions (v4.12) ───────────────────────────────
// Tiiviit suoritusohjeet + cue per liike. Näytetään workout-näkymän ⓘ-modalissa
// yhdessä slot-perustelun kanssa, jotta käyttäjä ymmärtää liikkeen roolin.
const MOVEMENT_DESCRIPTIONS = {
  // ─── Kisaliikkeet ───
  "Lisäpainoleuanveto": { howTo: "Leveä vastaote. Kilpasääntö: leuka tangon yli (ei rintaa tankoon — se on eri liike). Vedä lapaluut ensin alas, sitten kyynärpäät sivuille-taakse. Täysi alapysähdys, kyynärvarret lukkoon alhaalla ennen seuraavaa toistoa — ei svingausta.", cue: "Lapaluut alas ennen kuin käsivarret vetävät" },
  "Muscle-up": { howTo: "Leuanveto explosiivisesti rinnan yli, false grip, transition kyynärvarsi pystyyn, lopuksi dippi lukitukseen. Koko liike yhtenä ketjuna.", cue: "Vedä itsesi tangon yli, älä tangolle" },
  "Lisäpainodippi": { howTo: "v4.34.3 syvätutkimus-pohjaiset 7 cuet pec-kohdistukseen + olkapääsuoja (priorisoitu McKenzie 2022 EMG-evidenssin + Provencher 2010 + Pollock 2000 mukaan): (1) FORWARD LEAN 30–45° KOKO LIIKKEEN AJAN — aja rinta tankoja kohti, kallista ylävartaloa eteen heti yläpositiossa (ei vain alhaalla). Tämä on #1 pec-shifter, decline-bench-vektori. (2) ROM-STOP olkapää suoraan kyynärpään tasolla — EI alemmas. AB-IGHL-suoja (anterior capsule). (3) JALAT TAKANA polvet 90° koukussa, lantio extensiossa — vahvistaa lean-asentoa luontaisesti. (4) OLKAPÄÄ-LEVEYDEN TANKO — älä laaja (pec-tear-riski Carek 1998 case-tasolla). (5) EKSENTRINEN 3–4 s + 0.5 s pause + räjähtävä ylös — ei bouncea. (6) SCAPULAR PROTRACTION + posterior tilt alapositiossa ('ribs down, tip blades back'). (7) KYYNÄRPÄÄT 30° tucked rib-cagea kohti — ei flared 60°+.", cue: "v4.34.5 KRIITTINEN PRE-WORKSET-CHECK: ennen 1. worksetiä, varmista että BW dippi PUMP-set (2×8 lämmittelyssä) tuotti RINTA-pumpin (ei etudelta + triceps -pumpin). Jos rinta ei pumppaa = (a) forward lean ei ole tarpeeksi syvä — kallista ENEMMÄN eteen, tai (b) tee 1 LISÄSET BW dippiä rinta-fokuksella ennen kuormaa. Atleetin TO-palaute (4×6 V3 @ 63 kg): voima riittää, tekniikka ei ehtinyt aktivoitua → kuorma valui etudeltaan, herätys päivänä olkapäät kankeat edestä. SÄÄNTÖ: ei raskasta dippiä ennen kuin BW pumpissa rinta tuntuu kuumalle." },
  "Takakyykky": { howTo: "Tanko takakulmalle, jalat hartianleveydellä. Istu taaksepäin, polvet kääntyvät varpaiden suuntaan. Reiden yläpinta alle vaakatason.", cue: "Rintakehä auki koko liikeradan ajan" },

  // ─── Streetlifting-spesifiset (v4.11) ───
  "Räjähtävä leuka": { howTo: "Leuanveto maksimaalisella kiihdytyksellä — yritä saada leuka reilusti tangon yli. Speed-strength-zone on ~30–60 % 1RM: jos BW on yli 55 % 1RM:stä (vahvat vetäjät), käytä kuminauha-assistia ylävaiheessa nopeuden säilyttämiseksi. Jos BW on alle 40 % 1RM:stä, lisää kuormaa (vyö) 30–50 % 1RM tasolle. 3 räjähtävää toistoa/sarja, V4 (lopeta heti kun nopeus laskee — ei grindausta), 2 min palautus.", cue: "Nopeus > volyymi — keskeytä jos hidastuu" },
  "Leuanveto chest-to-bar": { howTo: "Myötäote (pronated) — streetlifting/CrossFit-standardi, vastaote tekee liikkeestä helpomman ja vähentää C2B-spesifisyyttä. Vedä kunnes rinta koskettaa tangon, rintaranka taakse, lapaluut kokoon. Kontrolloitu alas.", cue: "Rinta tankoon, ei leuka" },
  "False grip pull-up": { howTo: "Ranteet tangon yli (false grip), vedä chest-to-bar. Valmistaa muscle-upin transition-vaiheen — ranteiden täytyy olla tangon yläpuolella.", cue: "Rannekulma pysyy — ei pudota pohjalla" },
  "False grip row": { howTo: "Matala tanko, false grip, vedä rintaa tankoon. Kehonpaino-soutu — jalat maassa, vartalo suora.", cue: "Harjoittaa tranistionin voimaa ilman koko MU:n kuormaa" },
  "Archer pull-up": { howTo: "Leuanveto toiselle sivulle, toinen käsi suorana sivulle. Tee 3-5/sivu. Asymmetrinen veto rakentaa yksittäisen käden voimaa.", cue: "Vetävä käsi tekee työn, tukikäsi vain ohjaa" },
  "Scapular pull-up": { howTo: "Roiku tangossa, aktivoi vain lapaluut — lasku alas ja nosto ylös ILMAN kyynärpäiden koukistusta. 10 s holdeja mukaan.", cue: "Kyynärpäät suoriksi — vain lapalihakset työskentelevät" },
  "Band-assisted muscle-up": { howTo: "Kuminauha tangon ympäri, jalat/polvet nauhaan. Tee koko MU-liikerata kevyemmällä kuormalla.", cue: "Harjoittele transition-liikerataa, älä pelkkää vetoa" },
  "Pendlay row": { howTo: "Tanko maasta, selkä vaakatasossa, vedä tanko alarintaan, tanko PALAA maahan joka toistolla. Ei selän rullaamista.", cue: "Pysähdys maahan = nollasta starttaus joka toisto" },
  // v4.29.0 (P3): ME-rotaatio yläosalla
  "Vastaote-leuanveto": { howTo: "Vastaote (palms toward you, supinated) kapealla otteella (~hartioiden leveys). Sama otesuunta kuin kisaleukasi, mutta kapeampi → hauis-emphasis. ME-rotaation foundation-variantti — hauis-overload ja vetävän voiman rakennus ennen lockout/eccentric-vaiheita. Vrt. kisa-vastaote = leveä; tämä = kapea.", cue: "Kapea ote, hauis tekee työn — ei svingausta. Kyynärvarret pystyssä koko liikkeen ajan." },
  "Paused pull-up": { howTo: "Leuanveto kilpaote, 1–2 s pysähdys yläasennossa (leuka tangon yli). Pakottaa täyden lockoutin ja eliminoi top-end momentumin. Strength-blokin ME-variantti — hauis/lat-pidätyskapasiteetti.", cue: "Yläasento puhdas pysähdys, ei vippaamalla yli" },
  // v4.30.0: Tempo pull-up — eccentric volyymi normaalikuormalla (vrt. Heavy negative joka on supramaksimi)
  "Tempo pull-up": { howTo: "Leuanveto kilpaote normaalikuormalla, 3–4 s kontrolloitu eccentric (lasku). Konsentrinen normaali nopeus. Time-under-tension + eccentric volyymi ilman supramaksimaalista kuormaa. Strength-blokin loppupään ME-variantti — eri stimulus kuin Heavy negative (joka on 110–120 % 1RM 5 s lasku).", cue: "Lasku 3–4 sekuntia tasaisesti — ei vapaapudotusta, ei venähdys-bouncea pohjalla" },
  "Fat-bar pull-up": { howTo: "Leuanveto paksu tanko (2.0\"+) tai pyyhe tangon ympäri (towel pull). Forearm-/grip-overload kilpaleukaan nähden — ME-rotaation huippu strength-blokin lopussa. Vaatii fat-bar tai pyyhe.", cue: "Otteen avautuminen on stop-signaali — älä grindaa pelkällä gripillä" },
  // v4.29.0 (P4): Overload-liikkeet
  "Heavy negative leuka": { howTo: "Eksentrinen leuanveto supramaksimaalisella kuormalla (110–120 % 1RM). Hyppy/avustettu yläasentoon, 3–5 s hallittu lasku. 3–5 settiä × 1–3 toistoa. Westside-tyylinen overload — CNS:n totuttaminen kuormaan, joka ei ole konsentrisesti nostettavissa. Vk 5–12, ei kisaviikolla (DOMS-riski).", cue: "Lasku 5 s tasaisesti — ei vapaapudotusta. Pysähdys puolivälissä = liian raskas." },
  "Board dippi": { howTo: "Dippi rajoitetulla ROM:lla (ylä-1/3) lautaa tai vaahtomuovipalaa apuna käyttäen, 105–115 % 1RM. Lockout-overload — triceps-/sternum-spesifinen kuormitus joka ei kuormita pec-insertion-stretchia. Vk 5–12 strength/intensity-blokeissa, 3×3–5.", cue: "Lautaa kosketus = pysähdys, sieltä lockout — ei alle." },
  // v4.31.0: BW dippi — kuormaton tankodippi (lähinnä warmup/neural-primer aloittelijoille).
  // HUOM: tertiary-primer-rooli (MA-päivä) käyttää Lisäpainodippiä ~50 % 1RM @ V5
  // koska kuormitetulle dippaajalle (kuten sinä) BW on V8–V10 = liian kevyt.
  "BW dippi": { howTo: "Tankodippi ilman lisäpainoa. Lähinnä warmup/aktivaatiotyyppinen — 1–3 toistoa räjähtävä neural-primer ennen lisäpainosarjoja. Kuormitetulle dippaajalle BW on tyypillisesti V8–V10 (ei sovi varsinaiseen V3–V5-volyymityöhön).", cue: "Räjähtävä ylös, kontrolloitu alas — pelkkä aktivaatio, ei väsytys." },
  "Weighted inverted row": { howTo: "Matala tanko, vartalo suora, lisäpaino vyötäröllä/rinnassa. Vedä tanko rintaan.", cue: "Tanko rintaan, ei napaan" },
  "Close-grip dip": { howTo: "Kapea dippiote (kahvat lähes koskettavat toisiaan), kyynärpäät taakse. Triceps-fokus, vähemmän rintaa.", cue: "Kyynärpäät aivan vartalon vieressä" },
  "Straight bar dip": { howTo: "Dippi suoralla tangolla — spesifi kisa-asento MU:n lukitukseen. Tanko vartalon edessä, nojaa eteen.", cue: "Sama asento kuin MU:n huipulla" },
  "Russian dip": { howTo: "Dippi, laske kyynärvarret tangolle, nosta sieltä takaisin ylös täydeksi dipiksi. MU:n transition-loppuvaiheen spesifi.", cue: "Hallittu lasku kyynärvarsille — älä pudota" },
  "Close-grip bench": { howTo: "Penkkipunnerrus kapealla otteella (~hartiain leveys), kyynärpäät lähellä vartaloa. Tricepsin voimaliike.", cue: "Kyynärpäät 45° — ei sivulle" },
  "L-sit hold": { howTo: "Istu käsiin tukeutuen, jalat suorat ja vaakatasossa. Pidä. Core + hollow body = MU:n läpipuhallus.", cue: "Lantio rullaa taakse, alaselkä pyöristyy" },
  "Hollow body hold": { howTo: "Selällään, alaselkä painuu maahan, jalat ja ylävartalo irti matosta. Pidä 20-40 s.", cue: "Alaselkä ei saa irrota maasta" },
  "Front-foot elevated split squat": { howTo: "Takajalan askelkyykky etujalka 5-10 cm korokkeella. Syvempi polven ekstensio, quad-fokus.", cue: "Laskeudu suoraan alas, ei eteenpäin" },
  "Paused squat": { howTo: "Takakyykky 2 s pysähdys alaasennossa. Ei pomppua — startti nollasta. Rakentaa pohjalukituksen.", cue: "Laske 1-2 sekunnissa, pysähdy, nouse räjähtävästi" },

  // ─── Pull (legacy slot-variantit) ───
  "Chest-supported row": { howTo: "Soutu penkin päälle kasvot alaspäin — estää selän rullaamisen. Raskas volyymi turvallisesti.", cue: "Rinta pysyy penkissä — kyynärpäät taakse" },
  "Seal row": { howTo: "Vaakapenkin päällä makuulla — tanko lattialta rintaan. Eliminoi hipsit ja svingin täysin.", cue: "Pää pysyy penkissä" },
  "T-bar row": { howTo: "T-tangon kulmasoutu, jalat hartianleveydellä, vedä rintaan. Raskas variantti.", cue: "Selkä neutraali — ei pyöristy" },
  "Face pull": { howTo: "Yläaljasta kasvojen korkeudelle, vedä kahvat korvien tasolle, kyynärpäät korkealla. Takaolka + lapaluut.", cue: "Lapaluut taakse, ei vain käsivarret" },
  "Hauiskääntö tanko": { howTo: "Tanko alaotteella, kyynärpäät paikallaan, käännä ilman svingausta. Täysi liikerata.", cue: "Kyynärpäät eivät liiku — vain kyynärvarret" },
  "Hauiskääntö käsipainot": { howTo: "Käsipainot sivuilla, käännä yksi kerrallaan tai samanaikaisesti. Supinoi otetta liikkeessä.", cue: "Pikkurilli ylös liikkeen huipussa" },
  "Hammer curl": { howTo: "Käsipainokääntö neutraaliotteella (vasara-asento). Kohdistaa brachialisiin + hauis.", cue: "Peukalo kohti kattoa koko ajan" },
  "Preacher curl": { howTo: "Saarnaajan penkissä — kyynärpäät tuetaan, eliminoi svingausmahdollisuus.", cue: "Älä lukitse kyynärpäitä suoriksi alhaalla" },
  "Incline curl": { howTo: "Vinopenkissä takanoja 45-60°, käsipainot roikkuvat — suurempi venytys hauikseen.", cue: "Kyynärpäät pysyvät vartalon takana" },

  // ─── Push (legacy slot-variantit) ───
  "Penkkipunnerrus": { howTo: "Tanko rintalastaan, ranteet tangon alla, lapaluut penkissä. Jalat maassa, lantio kontaktissa.", cue: "Lapaluut pysyvät sisäänvedettyinä koko liikkeen ajan" },
  "Pystypunnerrus": { howTo: "Seisten tai istuen, tanko leuan alta ylös pään yli. Takapuoli kireänä, kylkiluut alas.", cue: "Älä työnnä lantiota eteen — tanko suoraa linjaa" },
  "Pystypunnerrus käsipainot": { howTo: "Käsipainot hartioilla, työnnä ylös pään yli, ala hartiatasolle.", cue: "Tanko suoraan ylös, ei eteen" },
  "Shoulder press laite": { howTo: "Laite tukee selkää — puhdas isolaatio hartioille.", cue: "Pidä kylkiluut alhaalla, ei selkää kaareen" },
  "Sivunosto": { howTo: "Käsipainot sivuille hartiatasolle, pikkurilli ylös. Kyynärpää hieman koukussa.", cue: "Nosta kyynärpäillä, ei käsipainoilla" },
  "Lateral raise kone": { howTo: "Laiteen sivunosto — konsistentti kuorma koko liikerataan.", cue: "Laskeudu hallitusti" },
  "Tricep pushdown": { howTo: "Yläaljasta köydellä tai tangolla, kyynärpäät paikallaan, työnnä alas.", cue: "Vain kyynärvarret liikkuvat" },
  "Overhead tricep ext": { howTo: "Käsipaino/köysi pään taakse, kyynärpäät osoittavat ylös. Ojentajan pitkän pään fokus.", cue: "Kyynärpäät eivät levitä sivuille" },
  "Skull crusher": { howTo: "Selinmakuulla, tanko suoraan ylhäällä, laske otsaa/pään taakse kyynärpäät koukistuen.", cue: "Kyynärpäät osoittavat kattoon koko ajan" },
  "Vinopenkkipunnerrus": { howTo: "30-45° vinopenkki, ylärinnan fokus. Muuten kuin tasopenkki.", cue: "Tanko ylärintaan, ei kaulaan" },

  // ─── Lower (legacy slot-variantit) ───
  "Maastaveto": { howTo: "Tanko lähellä säären, lantio liikkuu taaksepäin (hinge), selkä neutraali. RDL-tyyli: tanko liukuu jalkoja pitkin.", cue: "Pyllyä taakse — ei kyykkää alas" },
  "Hip thrust": { howTo: "Yläselkä penkillä, tanko lantion päällä, työnnä lantio ylös. Pakara puree huipussa.", cue: "Leuka rintaan — älä kaareudu lannerankaan" },
  "Jalkaprässi": { howTo: "Jalat laitteella hartianleveydellä, laske reidet rintaa kohti. Älä lukitse polvia yläpisteessä.", cue: "Kantapää painaa koko liikkeen ajan" },
  "Yhden jalan jalkaprässi": { howTo: "Jalkaprässi yhdellä jalalla — toinen jalka pois laitteesta. Hyödyllinen unilateraaliseen quad/glute-työhön ilman selkäkuormaa. Aloita kevyemmällä kuormalla.", cue: "Hallittu lasku, kantapää työntää — ei pommitusta" },
  "Leg extension": { howTo: "Polven ekstensio laitteella — puhdas quad-isolaatio.", cue: "Huiput lukitaan 1 s pohjalla" },
  "Bulgarian split squat": { howTo: "Takajalka penkillä, etujalka ~1 m edessä. Laskeudu suoraan alas. Pakara + quad unilateraalisti.", cue: "Etujalan polvi ei ylitä varvasta" },
  "Leg curl": { howTo: "Takareiden koukistus laitteella — makuulla tai istuen. Kontrolloitu alas.", cue: "Lantio pysyy penkissä — ei irtoa" },
  // ─── Alaraaja-variantit (v4.27.1) ───
  "Romanian DL": { howTo: "Maastaveto lähes suorin polvin. Lonkan saranaliike — työnnä takapuoli taakse ja laske tanko sääriä pitkin polviin tai alemmas. Takareidet + pakara. Tanko ei osu maahan toistojen välissä.", cue: "Lonkka taakse ensin, tanko seuraa — ei kyykyksi" },
  "Deficit DL": { howTo: "Maastaveto 3–10 cm korokkeelta. Pidempi matka alapositiossa → lisää vetotyötä ja alkuradan voimaa. Selkä suora, pakara tiukka.", cue: "Sama tekniikka kuin mavessa — älä kumarra enemmän" },
  "Front squat": { howTo: "Tanko etukulmalle (olympic-grip tai ristikahvat). Pysty asento kyykyn läpi, kyynärpäät korkealla. Alle vaakatason.", cue: "Kyynärpäät ylös — älä päästä tangon vajoamaan" },
  "Pin squat": { howTo: "Takakyykky häkissä turvapalikoiden päälle — istu tangon tangon pinnin päälle, starttaa nollasta. Heikkouden pisteen voimaa.", cue: "Pinnille istuminen poistaa stretch-refleksin" },
  "Walking lunge": { howTo: "Kävelyaskellus tangolla tai käsipainoilla. 10–20 askelta/sarja. Etujalka + unilateraalinen vakaus.", cue: "Takapolvi pehmeästi lähelle lattiaa, etujalka työtää" },

  // ─── Lift-spesifit variantit (v4.27.2) ───
  // DL-spesifit maaveto-primaryille
  "Block pull": { howTo: "Maastaveto 5–15 cm korotuksella (levyt blokkien päällä tai pukit). Lyhyempi matka alapositiossa → suurempi lockout-kuorma. Helms & Bromley: supramaksimaalinen overload lockout-vahvuudelle.", cue: "Starttaa polvista — ei käytä jalkojen työntöä" },
  "Paused DL": { howTo: "Maastaveto 1–2 s pysähdyksellä polven korkeudella nousussa. Eliminoi stretch-reflex-apu lockoutiin ja opettaa asennon ylläpitoa kriittisessä kohdassa.", cue: "Pysähdys polvessa = tanko lähellä, lapaluut lukossa" },
  "Snatch-grip DL": { howTo: "Maastaveto leveällä (tempaus-)otteella. Suurempi liikerata + yläselän työ. Pidä selkä neutraali — ote pakottaa lantion alas.", cue: "Lapaluut sisäänvedetyt — leveä ote heikentää niitä" },
  "Good morning": { howTo: "Tanko takakulmalle, taivuta lantiosta eteen polvet lievässä koukussa, takareidet puree. Nouse pakaralla. Erinomainen posterior chain hinge-liike.", cue: "Lonkka menee taakse — ei polvet eteen" },
  // Kyykky-spesifit
  "Safety bar squat": { howTo: "SSB-tanko (kaarevat kahvat) takakulmalle — pakottaa pystymmän asennon ja vähentää olkapäiden kuormaa. Quad-dominantti variantti.", cue: "Pidä kahvoista kiinni, ei työnnä ylöspäin" },
  "Box squat": { howTo: "Takakyykky boksille istuen (ei pomppu). Pysähdys boksilla 1 s, nouse räjähtävästi. Opettaa posterior chain + startti-voimaa pohjalta.", cue: "Istu, älä vain kosketa — pysähdys nollaa stretch-refleksin" },
  // Penkki-spesifit
  "Paused bench press": { howTo: "Penkkipunnerrus 1–3 s pysähdyksellä rinnalla (ei pomppua). Voimanostajan kisakäytäntö — startti nollasta alhaalta.", cue: "Rinta pysyy tiukkana pysähdyksessä — ei vajoa" },
  "Spoto press": { howTo: "Penkkipunnerrus 2–3 cm rinnasta pysähdyksellä (tanko ei kosketa rintaa). Rakentaa 'bottom-position overload' -voimaa ja eliminoi pomppu täysin.", cue: "Tanko hengähtää ilmassa — ei koskaan rintaan" },
  // v4.49.0 (Track B Vaihe 2D-γ): WSBB ME-Upper + GZCL T2 + Sheiko accessory -liikkeet
  "Floor press": { howTo: "Penkkipunnerrus lattialla maaten — kyynärpäät pysähtyvät lattiaan ennen seuraavaa toistoa. Eliminoi stretch-reflex + alarata. Lockout + tricep-vahvuus. WSBB ME-Upper -rotaation kanoninen variantti.", cue: "Kyynärpäät lattiaan, pysähdys 1 s, työnnä ylös" },
  "Pin press": { howTo: "Penkkipunnerrus räkki-tapeilta starttaen (rinnan korkeudella tai hieman yli). Eliminoi stretch-reflex, partial ROM, tricep-/lockout-vahvuus. WSBB ME-Upper.", cue: "Tanko pinnille ennen jokaista toistoa — ei pompu" },
  "JM press": { howTo: "Penkkipunnerruksen + skullcrusherin hybridi. Tanko lasketaan kohti otsaa kyynärpäät edessä (close-grip). Tricep-erikois-liike. WSBB ja tricep-vahvuuden rakentaminen.", cue: "Kyynärpäät ovat liikkeen akseli — ei levitä" },
  "Wide-grip bench": { howTo: "Penkkipunnerrus leveällä otteella (sormet rengas-merkeissä tai leveämmin). Korostaa pec-volyymia, pienempi ROM. GZCL T2-variantti.", cue: "Tanko nousee suoraan, älä työnnä taakse — pec puree" },
  "Long pause bench": { howTo: "Penkkipunnerrus 3–5 sek pysähdyksellä rinnalla. Eliminoi stretch-reflex täysin, opettaa pohja-asennon hallintaa. GZCL T2-variantti.", cue: "Pidä tanko rinnalla — laske yksi mississippi, kaksi mississippi — sitten työnnä" },
  "Rack pull": { howTo: "Maastaveto häkin tappien päältä polven korkeudella tai yli. Lockout-vahvuus, ylä-ROM-overload. WSBB ME-rotaation kanoninen variantti.", cue: "Starttaa polvista, lapaluut lukossa — kuormat raskaammat kuin perus-DL:ssä" },
  "Glute-Ham Raise": { howTo: "GHR-laitteella tai bench-rolloilla: aloita pystyssä, laskeudu hallitusti eteen pohkeiden ankkuroinnilla, nouse takareisien voimalla takaisin pystyyn. Pakara + hamstrings.", cue: "Hidas eccentric, pakara tiukkana koko liikkeen ajan" },
  "Nordic ham": { howTo: "Polvillaan, nilkat ankkuroituna (partneri, kuminauha tai raskas käsipaino jalkojen päällä): laskeudu hallitusti eteen takareisien jarruttaessa, työnnä käsillä takaisin ylös. Ei laitetta tarvita — hamstring-eksentrinen ilman GHR-penkkiä.", cue: "Mahdollisimman hidas lasku — hamstring jarruttaa koko matkan; lantio suorana (ei taita)" },
  "Käsipaino-RDL": { howTo: "Käsipainot reisien edessä, polvet pehmeinä. Työnnä lantio taakse pitäen selkä neutraalina, laske painot sääriä pitkin täyteen takareisi-venytykseen, nouse lantio edellä. Hip-hinge ilman tankoa.", cue: "Lantio taakse, ei kyykkyä; käsipainot lähellä sääriä; venytä hamstring ala-asennossa" },
  "Hyperextensio": { howTo: "Hyperextension-laitteella tai romanialaisella penkillä: laskeudu kumarrukseen pyörittäen lantiosta, nouse takaisin vaakatasoon. Voi tehdä lisäpainolla rinnan päällä.", cue: "Älä yli-ojentaudu lannerangasta — pysähdy vaakatasoon" },
  "Dumbbell fly": { howTo: "Käsipainot kädessä penkille selälleen, kädet kaarena auki rinnan tasolle ja takaisin yhteen. Korostaa rinnan adductio-toimintoa. Sheikon accessory-konventio.", cue: "Kyynärpäät lievässä koukussa koko liikkeen ajan — älä suorista täysin" },
  "Power shrug": { howTo: "Maastaveton ylä-asennosta tehty räjähtävä shrugs (kohautus) lisäkuormalla. Trapezius + vetolihakset + lockout-räjähtävyys. Coan-Phillipi -ohjelman accessory.", cue: "Räjähtävä kohautus ylös, hidas alas — älä kierrä hartioita" },
  "Larsen press": { howTo: "Penkkipunnerrus jalat penkin päällä (ei maakontaktia). Eliminoi leg drive → puhdas ylävartalon voima. Erinomainen kontrollin ja teknisen puhtauden rakentamiseen.", cue: "Pakara penkissä, jalat ilmassa — ei pomppua" },
  "Board press": { howTo: "Penkkipunnerrus lauta rinnalla (1–3 lautaa päällekkäin). Lyhyempi liikerata → raskaampi kuorma lockout-vaiheeseen. Supramaksimaalinen tricep + lockout.", cue: "Tanko koskee lautaan, pysähdys, työnnä ylös" },
  // OHP-spesifit
  "Push press": { howTo: "Pystypunnerrus jaloilla autetulla starttikäynnistyksellä: dip 5–10 cm polvista, räjähtävä ylös. Suurempi kuorma kuin strict press — rakentaa lockoutia ja hermostollista kapasiteettia.", cue: "Dip pysty — ei eteen — ja räjähtävä ylös" },
  "Seated OHP": { howTo: "Pystypunnerrus istuen tuetulla selällä. Eliminoi lantion kompensaation ja pakottaa puhtaan hartia + tricep -työn.", cue: "Selkä tiukkana selkänojaa vasten — ei kaareudu" },
  "Z-press": { howTo: "Pystypunnerrus istuen lattialla jalat suorina edessä. Pakottaa täydellisen core-hallinnan + pystyn ryhdin. Ei mitään tukea selälle.", cue: "Jalat lukossa, rintakehä ylös — korjaa ryhtivirheet" },

  // ─── Dippi-prehab-variantit (v4.27.4) ───
  // Sternum/pec-insertion-kestävyyden rakennus foundation-blokissa (vk 1–4).
  // Fokus: ROM-ääripään kudoskapasiteetti (stretch-mediated hypertrophy) +
  // posterior shoulder balance. Evidence: Warneke 2022–2024 stretch-hypertrofia,
  // Green & Comfort 2007 pec-tear-riski dipissä, Durall 2001 pec-major-insertion.
  "Tempo pause dippi": { howTo: "Lisäpainodippi 3 s:n kontrolloidulla eksentrisellä ja 1–2 s pysähdyksellä alapositiossa (olkapää kyynärpään alla, ei ylemmäs kuin mitä liikkuvuus sallii kivuttomasti). Nouse sujuvasti. Kuorma ~60–70 % normaalista dipistä — tämä on kudoskapasiteettia, ei voimaa.", cue: "Laskeudu kolme sekuntia, pysähdy alhaalla — ÄLÄ pomppaa" },
  "Incline dumbbell press": { howTo: "Vinopenkki 30–45°, käsipainot rinnan sivuilla, työnnä ylös. Ylärinta + etudelta ja kevyempi GH-nivelen stressi kuin tasopenkissä. Täysi ROM, kontrolloitu eksentri.", cue: "Käsipainot koskettavat melkein yläpisteessä — älä lukitse kyynärpäitä täysin" },
  "Käsipainopenkki": { howTo: "Vaakapenkillä makuulla, käsipainot rinnan sivuilla (~kyynärpää 45° vartalosta), työnnä ylös ja yhteen. Suurempi ROM ja itsenäinen puolittainen liike kuin tankopenkissä → rinta + etudelta, hartialle ystävällisempi. Kontrolloitu eksentri rintalastaa säästäen.", cue: "Käsipainot koskettavat melkein yläpisteessä — älä anna kyynärpäiden valua liian alas jos rintalasta arka" },
  "Käsipainosoutu": { howTo: "Etunoja lantiosta (selkä neutraali, ~45°) tai yhden käden tuettu penkkiin. Käsipaino(t) hartioiden alla riippuen, vedä kylkeen kyynärpää vartalon viereen lapaa taakse retraktoiden, laske kontrolloidusti täyteen venytykseen. Leveä selkä + keski-trapez. Käsipainot mahdollistavat täyden ROM:n + puolierot tasaavan vedon ilman tankoa.", cue: "Vedä kyynärpäällä, ei kädellä — purista lapa taakse yläpisteessä; älä kierrä alaselkää" },
  "Dumbbell pullover": { howTo: "Vaakapenkillä makuulla, yksi käsipaino molemmin käsin pidellen, lantio alempana kuin hartiat. Laske paino pään taakse suorin/melkein suorin kyynärvarsin täyteen pec+lats-venytykseen, palauta rintakehän päälle. Stretch-hypertrofian priimusliike pecille.", cue: "Kyynärpäät pehmeässä kulmassa koko ajan — jos kipeää rintalastassa, lyhennä ROMia" },
  "Incline deficit pushup": { howTo: "Punnerrus kahvoilla tai käsipainoilla korokkeena, kädet korokkeilla niin että rintakehä laskeutuu käsien alapuolelle. Täysi ROM alhaalla, taukopysähdys 1 s, ylös kontrolloidusti. Korkea reps (15–35) matalalla kuormalla = kudoksen verenkierto + ROM-kapasiteetti.", cue: "Alas kunnes olkapäät ovat kyynärpäiden alapuolella — nosta itsesi korkealla volyymilla, ei intensiteetillä" },
  "Dippilaite (plate-loaded)": { howTo: "Vipuvarsilaite levypainoilla. Istu/asetu laitteen mukaiseen asentoon, paina kahvat alas hallitusti (eccentric 2–3 s), nosta ylös kontrolloidusti. ROM rajattu laitteen mukaan → alkukulman riski (kylmä RC + pec extended) on pienempi kuin tankodipissä. Hyvä volyymi-accessory päädippiin tai turvallisempi vaihtoehto kun olkapää on herkillä.", cue: "Älä jätä alapositioon roikkumaan — kontrolloitu lasku ja kontrolloitu nousu" },
  // v4.34.3: Dippi-spesifit anterior-stabilizer + mobility-accessoryt (Track C deep research).
  "Half-kneeling KB bottoms-up press": { howTo: "Toispolviseisontaan, KB pohjat-ylöspäin (bottoms-up) rack-asennossa, kahvasta lujasti puristaen. Työnnä yläspäin kontrolloidusti, lukitus, alas. Bottoms-up-asento PAKOTTAA subscapularis + serratus anterior + RC -sekvenssin koordinoimaan — anterior stabilizers -bias täydentää face pull + ulkokierto -volyymia (jotka kohdistuvat vain posteriorisesti). Half-kneeling = stabiili pohja + irradiation cue. 12–20 kg kohtalainen — bottoms-up-balansi tärkeämpi kuin paino.", cue: "Pohja täytyy pysyä taivaalla pystyssä — jos KB kallistuu, kuorma on liian raskas. Hengitä ulos lukituksessa, hengitä sisään alapositioossa." },
  "Half-kneeling cable OHP": {
    howTo: "OWEN GAYLE -TYYLIN SHOULDER STABILIZER (winningstrength). Vaihtoehto KB BUP:ille kun kahvakuulaa ei ole. ASETUS: (1) Toispolviseisontaan kaapelipylvääseen sivuttain — työskentelevä käsi on KAUEMPANA pylväästä, etupuolella oleva polvi vastakkaisella puolella (oikea käsi → vasen polvi etupuolella). (2) Kaapelin korkeus matalalla (lattiataso tai sen lähellä). D-handle. (3) Aloitusasento: käsi kyljen vieressä, kämmen sisäänpäin, kyynärpää koukussa rack-tasolle (kuin OHP-startti). LIIKE: (4) Työnnä kättä DIAGONAALISTI ylös ja hieman kaapelin suuntaan — käsi loppuasennossa suoraan ylhäällä, peukalo taakse, hartia lukossa (ei shrug). (5) 1 s pause yläpositiossa. (6) Lasku 2-3 s kontrolloidusti. KUORMA: 5–12 kg riittää — fokus stabiloinnissa ei voimassa. Kaapelin kulma luo unstable-load-stimuluksen samalla tavalla kuin KB:n bottoms-up — anterior cuff + SA + RC -koordinaatio.",
    cue: "Vartalo pysyy paikallaan — ei lähde mukaan rotaatioon. Hartia EI nouse korviin. Toispolviseisonnan etupolvi vastakkaisella puolella vakauttaa lonkasta. Kaapelin tension pidetään koko ROMin yli — älä päästä kättä romahtamaan."
  },
  "Half Turkish Get-up (DB)": {
    howTo: "OWEN GAYLE -TYYLIN SHOULDER STABILIZER + DIPPI-TUKILIIKE. Selältä kyljelle, käsipaino ojennettuna ylhäällä koko liikeradan ajan. ASETUS: (1) Selinmakuulla, työskentelevä käsi pitää käsipainoa SUORANA YLHÄÄLLÄ (käsi täysin ojennettuna, peukalo taakse). (2) Saman puolen polvi koukussa, jalkapohja lattialla. (3) Vastakkainen käsi sivulla 45° vartalosta lattialla. LIIKE: (4) Nojaa vastakkaiseen kyynärpäähän ja vie ylävartalo ylös 45° kulmaan — KÄSIPAINO PYSYY TÄYSIN YLHÄÄLLÄ koko liikkeen ajan, silmät seuraavat painoa. (5) Jatka kämmenelle (suora käsi tukena). (6) Tässä on kyljellään-asento, käsipaino edelleen suoraan ylhäällä. (7) 1 s pause kyljellään-asennossa. (8) Lasku takaisin selinmakuulle KONTROLLOIDUSTI 3 s, käsipaino pysyy ylhäällä koko ajan. KUORMA: 8–16 kg riittää — fokus stabiloinnissa, ei voimassa. Vahvistaa rotator cuff + scapular stability + serratus anteriorin koordinointia kuormalla — täydentää dippi-lockoutin olkapään stabilointia loaded scapular control:lla.",
    cue: "KÄSIPAINO EI LIIKU — pysyy täysin pystysuorana ylhäällä koko liikkeen ajan. Silmät seuraavat painoa, hartia LUKOSSA (ei shrug). Jos käsi heilahtaa = kuorma liian raskas. Hidas hengitys koko liikkeen yli."
  },
  "Decline penkkipunnerrus (EZ-tanko)": {
    howTo: "DIPPI-TUKILIIKE — sama kuormavektori kuin dipissä, EZ-tanko vähentää kyynärpään ulkokierto-stressiä vs suora tanko. ASETUS: (1) Decline-penkki kallistettuna 15-30° alaspäin, jalat lukittuna penkin yläosaan. (2) EZ-tanko (käyrä) tankotelineestä — ote kapeahko (kämmenet hieman sisäänpäin EZ:n kahvojen mukaan), ranteet neutraalisti. (3) Tanko alarintaan (ei navalle, ei rinnan keskelle — DIPPI-spesifi vektori = alarinta). LIIKE: (4) Kontrolloitu lasku 2 s, kyynärpäät 30-45° tucked vartaloa kohti (EI flared 60°+). (5) Tanko koskettaa alarintaa kevyesti — 0.5 s paussi. (6) Räjähtävä työntö ylös, ei lockoutia EI hyperextensiota olkapäissä. KUORMA: triceps + alarinta dominantti — voi olla 60-80% horisontaalipenkki-1RM:stä. EVIDENSSI: declined-vektori siirtää ärsykkeen alarintaan + tricepsiin — sama biomekaaninen profiili kuin dippi-lockoutilla.",
    cue: "Tanko ALARINTAAN, ei navalle. EZ-tangon käyrä antaa ranteille 5-10° kulman, mikä vähentää kyynärpää-stressiä. Forward-lean-vektori — kuvittele että teet dippiä makuullasi. Jalat lukossa = ei lonkka-pumppausta."
  },
  "Push-up plus": { howTo: "Punnerrusasento. Tee normaali punnerrus, ja yläpositiossa työnnä lapaluut TÄYDELLISESTI eteenpäin (protraction) — selkä pyöristyy hieman, lapaluut leviävät sivuille. 1 s pause yläpositiossa täydessä protractionissa. Aktivoi serratus anterior 50–80% MVIC (Park & Hwang 2019), kriittinen scapular control liike dipin alapositioon valmistautumiseen.", cue: "Yläpositiossa 'työnnä maa pois alta' — lapaluut leviävät, ribs down. Älä shrug-aktiivota, lapaluiden alaosa pysyy alhaalla." },
  "Half-kneeling KB armbar": { howTo: "Toispolviseisontaan, KB ylöspäin straight-arm (kuin OHP-lukitus), kahvasta hartia lukittuna alaspäin. Kallista ylävartaloa hitaasti taakse niin että kuormakättinen olkapää menee horizontal abduction + ER -asentoon, mutta kahva pysyy SUORAAN ylöspäin (osoittaa kattoa). 30 s tension under tension. SA 37%, LT 21% (Caravan 2018) — loaded GH mobility joka rakentaa anterior capsule capacityä spesifissä asennossa. Käytä 8–12 kg kohtalainen.", cue: "Olkapää lukossa — älä päästä kättä romahtamaan eteen. Hidas hengitys, älä holdaa hengitystä." },
  // v4.34.4: Powell Raise + Trap 3 Raise — Owen Gayle (winningstrength) streetlifting-spesifit
  // shoulder-stabilizer-liikkeet. Yksityiskohtaiset numeroidut ohjeet jotta atleetti voi suorittaa
  // ilman youtube-hakua treenin aikana.
  "Powell Raise (DB, side-lying)": {
    howTo: "VAKIOMUOTO PEAK-VAIHEELLE (Owen Gayle). 5-7 kg käsipaino. ASETUS: (1) Asetu kyljellesi tasaiselle penkille koko vartalo penkin pinnalla. Alavartalo voi olla osittain penkin reunan yli ettei putoa, ylimmäinen jalka penkillä tai laskettu lattialle tasapainoa varten. (2) Alempi käsi (lattian puoleinen) tukee päätäsi — peukalo niskan tukeen. (3) Ylempi käsi pitelee käsipainoa, lähtöpositio: käsipaino lonkan/reiden vieressä alaspäin, kämmen kohti vartaloa, kyynärpää LIEVÄSSÄ KOUKUSSA (~10-15°). LIIKE: (4) Nosta käsipainoa ylös sivuttain — käsi kohti kattoa noin 90° kulmaan vartalosta nähden, EI yli 90° (menettää tension supraspinatuksessa). (5) Yläpositiossa: peukalo osoittaa kohti kattoa (slight ER), käsipaino on DIAGONAALI hieman taakse vartalosta — EI suoraan ylös (= lateral raise) eikä taakse (= rear delt fly). (6) 1 s pause yläpositiossa. (7) Laske kontrolloidusti 3 sekunnissa takaisin lonkan tasolle. KUORMA: aloita 3-5 kg. Maksimi 7 kg jos liike on hallittu — tämä EI ole voimaliike, painon nosto ei ole tavoite.",
    cue: "Älä shrug-aktivoi olkapäätä korviin päin — niska pysyy pitkänä, hartia matalana koko liikkeen ajan. Kyynärpää lukossa lievässä koukussa, ei rotaatiota. Jos painot pakottavat sinut shruggaamaan = pudota kuormaa."
  },
  "Powell Raise (kaapeli, seisten)": {
    howTo: "EARLY-PHASE-VARIANTTI (Owen Gayle): tasaisempi tension koko ROMissa kuin DB-versiossa. ASETUS: (1) Aseta cable-ankkuri MATALALLE (lattian tasolle tai sen lähelle). Käytä D-handlea, kuorma 2.5-5 kg riittää alkuun. (2) Seiso sivuttain cable-pylvääseen nähden, **työskentelevä käsi on KAUEMPANA cablesta** (= kaapeli kulkee yli vartalosi). (3) Tartu D-handleen työskentelevällä kädellä, käsi alkaa vastakkaisen lonkan vieressä (käsi vartalon yli, esim. oikea käsi vasemman lonkan vieressä). LIIKE: (4) Nosta käsipainoa diagonaalisesti ylös ja ulos kohti kattoa — sama yläposition asento kuin DB-versiossa: peukalo ylös, käsi noin 90° kulmaan vartalosta nähden, hieman taakse. (5) Cable luo vastusta KOKO ROMin yli — pidä tension koko liikkeen ajan, älä päästä cable-painoa pudottamaan käsivartta alas. (6) Hidas lasku 3 s takaisin alkupositioon. KUORMA: cable-paino aloitetaan kevyellä — 2.5-5 kg riittää.",
    cue: "Vartalo pysyy paikallaan — ei lähde mukaan rotaatioon kun nostat käsipainoa. Pidä lantio neutraalissa, älä kallista. Cable-versio on tarkoituksellisen kevyt — fokus on tasaisessa tensionissa ja oikealla liike-vektorilla, ei kuormassa."
  },
  "Trap 3 Raise": {
    howTo: "OWEN GAYLE STRUCTURAL BALANCE TEST + ACCESSORY. Atleetin target: 8 kontrolloitua toistoa per käsi @ 10 kg (= 12.5% × 80 kg dip 1RM). ASETUS: (1) Tartu käsipainoon yhteen käteen. Aloituskuorma 7-10 kg — jos et jaksa 8 oikein toistoa, kevennä. (2) Tukikäsi: nojaa toinen käsi kiinteään pintaan (penkki, telinekehys, tai high-bench korkeus) ~45° ETEEN KALLISTETUKSI vartaloasi. (3) Alaselkä neutraali (ei pyöristynyt eikä yliojennettuna), rinta auki, niska pitkä. (4) Työskentelevä käsi roikkuu suoraan alaspäin lattiasta nähden lähtöpositiossa. LIIKE: (5) Nosta käsipaino DIAGONAALISTI YLÖS JA ETEEN — kulma noin 120° vartalosta. EI suoraan sivulle (= 90°, sivunosto) eikä taakse (= 180°, rear delt fly). Käsivarsi muodostaa Y-kirjaimen toisen yläosan päästä päin katsottuna. (6) Yläasennossa: peukalo ylös (slight ER), käsi noin korvan tasolla edestä päin katsottuna. (7) 1 s pause yläpositiossa. (8) Laske 3 s kontrolloidusti.",
    cue: "ÄLÄ SHRUG — niska pysyy pitkänä, hartia EI nouse korviin päin. Tämä on Owenin tärkein cue: jos koukku-shoulder-shrug ilmenee, kuorma on liian raskas tai et ole vielä rakentanut motor controllia. Aloita kevyemmällä (7 kg) ja työskentele kohti 10 kg targetia. 8 oikein tehtyä toistoa @ 10 kg = structural balance pass dipille."
  },

  // ─── v4.28.0 liikkeet ───
  "BW eksentrinen dippi": { howTo: "BW dippi: laskeudu 5 s hallitusti alaasentoon, nouse ylös hyppäämällä/avustettuna (ei concentric triceps-työtä). Harjoittaa pec-insertion eccentric-kapasiteettia ilman lisäämällä triceps-fatiikkaa → sopii LA skill-vaiheeseen 48 h ennen MA:n leuka-primaryä.", cue: "Lasku viisi sekuntia — älä lennä alas" },
  "Nordic curl": { howTo: "Polvillaan, nilkat lukittuina (partneri tai laite), laske vartalo eteen hallitusti pelkällä hamstringin eksentrisellä voimalla. Käytä käsiä tarvittaessa avustamaan pohjalla. Regressio: Slider curl (liukumatto-kantapää + polvien koukistus selinmakuulla). Evidenssi: Ristolainen 2022, Van Dyk 2019 hamstring strain prevention + kyykky-1RM-parannus.", cue: "Kontrolloitu lasku — jos putoat, kuorma on liian raskas" },
  "Muscle-up eksentrinen": { howTo: "Aloita MU:n yläasennosta (hyppy/avustettu), laske 5–8 s hallitusti koko MU-liikerata takaisin alas (transition + veto). Ei ylös-työvaihetta — pelkkä eksentrinen. Harjoittaa pec/lats/triceps-kapasiteetin kontrollin yli transitionin.", cue: "Jarruta transitionia — tunne että olkapäät kannattelevat" },
  "Tempo squat": { howTo: "Takakyykky 3 s kontrolloidulla eksentrisellä laskulla, ei pysähdystä alhaalla, räjähtävä nousu. Rakentaa eccentric-kapasiteettia ja opettaa bottom-position hallintaa ilman stretch-reflex-etua. Intensity-blokin vaihtoehto paused squatille — eri CNS-stimulus kuin LA:n box squat (joka eliminoi stretch-refleksin kokonaan).", cue: "Laske kolme sekuntia — ei pysähdystä, vaan hallittu käänne" },

  // ─── Core ───
  "Ab wheel rollout": { howTo: "Polvillaan, työnnä rulla eteen mahdollisimman kauas, palaa aktiivisesti. Hollow body asento koko ajan.", cue: "Alaselkä ei saa notkahdella" },
  "Hanging leg raise": { howTo: "Roiku tangossa, nosta suorat jalat vaakatasoon tai ylempäänkin. Ei svingiä.", cue: "Aloita lantion rullauksella, ei jalkojen swingillä" },

  // ─── Primääreiden variantit (osa jo PRIMARY_VARIANTS:ssa) ───
  "Leuanveto (kehonpaino)": { howTo: "Kehonpainoleuka täydellä liikeradalla — alas täyteen hangiin, ylös leuka tangon yli.", cue: "Lapaluut aktivoituvat ENNEN käsivarsia" },
};

// Each slot represents a FUNCTION (what biomechanical role it fills),
// not a fixed movement. Phase variants rotate only at block boundaries or
// on detected stagnation — otherwise stay persistent so adaptation compounds.
//
// Phase order: foundation (vk 1-4), strength (vk 5-8), intensity (vk 9-12), peaking (vk 13-16).
// First item in each phase = default. If stagnation detected, engine advances index.
const ACCESSORY_SLOT_CATALOG = {
  // ─── PULL PATTERNS ───
  // v4.32.3: Volyymi-leuanveto chest-to-bar — MA-päivän 2. veto.
  // Ero LA:n pull-vertical-explosive -slottiin: tämä on **klassinen volyymi+ROM-veto**
  // (3×5 V3, raskaammalla), kun taas LA:n Räjähtävä leuka on **RFD-stimulus** (3×3 V4
  // BW, max-velocity). Yhdessä → MA volyymi + LA RFD ilman duplikointia. Käyttäjäpalaute
  // v4.32.2: "miksi MA-treenissä ei ollut oletuksena korkeita leukoja 2. liikkeenä".
  // Kompromissi aiemman duplikointi-poiston (v4.31.2 Räjähtävä leuka MA:lta pois) ja
  // nykyisen tarpeen välillä: chest-to-bar ON eri liike kuin Räjähtävä → ei duplikointia.
  "pull-volume": {
    function: "Loaded volume-leuka — MA:n 2. vetosarja, eri intensiteettizona",
    rationale: "v4.34.16 ELIITTI-INTENSIFIKAATIO: BW chest-to-bar oli aiemmin oletus, mutta atleetin profiililla (94 kg PR, 10v fokusoivaa leukatreeniä) BW = V8-V10 = ei stimulus. Korvattu loaded comp lift volume-työllä, joka käyttää eri Vx/intensiteettizonan kuin primary → täydentää, ei duplikoi. Esim. primary 4×6@71% V3 + pull-volume 3×6@55% V4 = sekä volyymi-stimulus että lokaali stretchattu volume-shock. Doc 1 #8 (Owen Gayle WPU-käytännöt): chest-to-bar weighted explosive 3×3-5 OR weighted comp lift volume-sarjat. Foundation/strength täysi volyymi, intensity kevyempi taperia kohti, peaking pois. Variant-swap: chest-to-bar (BW + ROM-fokus) saatavilla manuaalisena swap-vaihtoehtona.",
    phaseVariants: {
      // v4.34.16: oletus = Lisäpainoleuanveto (loaded comp lift) jakaa primary-e1RM-historian
      // → Branch A loadPct-resolver käyttää sessionEffectiveE1RM × loadPct.
      // Chest-to-bar säilytetty alternatiivina manuaalista swap-toimintoa varten.
      foundation: ["Lisäpainoleuanveto", "Leuanveto chest-to-bar"],
      strength:   ["Lisäpainoleuanveto", "Leuanveto chest-to-bar"],
      intensity:  ["Lisäpainoleuanveto"],
      peaking:    [],
    },
    repScheme: {
      // v4.34.16: loadPct lisätty repScheme-tasolle. resolveAccessorySlot välittää sen
      // resolvoituun slottiin → existing loadPct-resolver applioi sessionEffectiveE1RM × loadPct.
      // Eri Vx/intensiteetti kuin primary (V3/71%) → toinen stimulus-zona, ei duplikointia.
      // OBS-035+037 (2026-05-31): same-movement loaded-volume. Liike-agnostinen accessory-pass
      // (engine.js recommend(), resolveDayPlanSlots:n jälkeen) laskee resolvedLoadKg =
      // currentE1RMSystem × loadPct − bw (EI vReps; back-off pitää ROOT-A:n vReps-reitin) →
      // volyymi-apuliike < back-off < pää. Default jota AI Block Tuning myöhemmin adaptoi.
      foundation: { sets: 3, reps: 10, targetVx: 4, loadPct: 0.60, note: "Loaded volume @ 60% V4 — eri intensiteetti-zona kuin primary" },
      strength:   { sets: 3, reps: 8, targetVx: 3, loadPct: 0.65, note: "Loaded volume @ 65% V3" },
      intensity:  { sets: 3, reps: 6, targetVx: 3, loadPct: 0.70, note: "Loaded volume @ 70% V3 — kevyempi taperia kohti" },
    },
  },
  "pull-horizontal-heavy": {
    function: "Raskas horisontaaliveto, selän paksuus",
    rationale: "Paksuntaa keskiselkää → suora tuki leuanvedolle ja MU-transitiolle. Hypertrofiassa chest-supported/seal pysäytyksellä (stretch-mediated volyymi), voimablokissa Pendlay (raskas ja eksplosiivinen).",
    phaseVariants: {
      foundation: ["Chest-supported row", "Seal row", "T-bar row"],
      strength:   ["Pendlay row", "T-bar row", "Chest-supported row"],
      intensity:  ["Pendlay row", "Chest-supported row"],
      peaking:    ["Chest-supported row"],
    },
    repScheme: {
      foundation: { sets: 4, reps: 8, targetVx: null, note: "1-2 s pysäytys alaosassa (venyneessä) — stretch-mediated hypertrofia, lisää selän paksuusärsykettä" },
      strength:   { sets: 4, reps: 6, targetVx: 3 },
      intensity:  { sets: 3, reps: 5, targetVx: 2 },
      peaking:    { sets: 2, reps: 6, targetVx: 4 },
    },
  },
  "pull-vertical-explosive": {
    function: "Räjähtävä veto, speed-strength leuanvetoon",
    rationale: "Kisaveto kehittyy vain kun konsentrinen vaihe tehdään maksiminopeudella. Pitää Rate of Force Developmentin korkealla — ilman tätä raskas veto hidastuu ja seuraavat PR:t karkaavat.",
    phaseVariants: {
      foundation: ["Räjähtävä leuka", "Leuanveto chest-to-bar"],
      strength:   ["Leuanveto chest-to-bar", "Archer pull-up"],
      intensity:  ["Archer pull-up", "Leuanveto chest-to-bar"],
      peaking:    ["Räjähtävä leuka"],
    },
    repScheme: {
      // RFD/speed-strength: 3 toistoa V4 -- lopetus heti kun nopeus laskee.
      // 5 toistoa V3 olisi hypertrofiaa, ei räjähtävyyttä (Mann/Bosco velocity-zone).
      foundation: { sets: 3, reps: 3, targetVx: 4 },
      strength:   { sets: 3, reps: 3, targetVx: 4 },
      intensity:  { sets: 3, reps: 3, targetVx: 4 },
      peaking:    { sets: 2, reps: 3, targetVx: 4 },
    },
  },
  "scapular-control": {
    function: "Lapa- ja takaolka, prehab + asennonhallinta",
    rationale: "Face pull estää olkapään impingement-ongelmia raskaissa blokkeissa. Scapular pull opettaa lapalukon, joka on MU:n käynnistyksen perusta. Pieni investointi, iso vammansuoja.",
    phaseVariants: {
      foundation: ["Face pull", "Scapular pull-up"],
      strength:   ["Face pull", "Scapular pull-up"],
      intensity:  ["Face pull"],
      peaking:    ["Face pull"],
    },
    repScheme: {
      // v4.34.23: Vx-tavoite V4 (control-fokus, ei failure-zona — McGill 2010 -konsensus,
      // posterior balance ei hyödy lähellä failurea, vaan kontrolloidusta ROM-laajuudesta)
      foundation: { sets: 3, reps: 15, targetVx: 4 },
      strength:   { sets: 3, reps: 12, targetVx: 4 },
      intensity:  { sets: 2, reps: 12, targetVx: 4 },
      peaking:    { sets: 2, reps: 15, targetVx: 4 },
    },
  },
  "bicep-chain": {
    function: "Hauiskoukistajat, vetovoiman tuki",
    rationale: "Kun selkä on vahva, leuanvedon rajoittava tekijä siirtyy usein hauiksiin. Foundation-faasi priorisoi stretch-mediated hypertrofiaa (incline curl = hauis venytetty, Pedrosa 2022: ~1.5× enemmän kasvua vs pystyote). Voimablokissa raskaampi barbell curl.",
    phaseVariants: {
      foundation: ["Incline curl", "Preacher curl", "Hauiskääntö tanko"],
      strength:   ["Hauiskääntö tanko", "Hauiskääntö käsipainot", "Hammer curl"],
      intensity:  ["Hammer curl", "Hauiskääntö tanko"],
      peaking:    ["Hauiskääntö käsipainot"],
    },
    repScheme: {
      // v4.34.23: Vx-tavoite V2 foundation (Doc 2: 12 reps isolaatio = lähempänä failurea
      // recruitement-edut), V2 strength (raskaampi kuorma), V3 intensity (volume), V3 peaking (taper)
      foundation: { sets: 3, reps: 12, targetVx: 2 },
      strength:   { sets: 3, reps: 10, targetVx: 2 },
      intensity:  { sets: 2, reps: 10, targetVx: 3 },
      peaking:    { sets: 2, reps: 12, targetVx: 3 },
    },
  },

  // ─── PUSH PATTERNS ───
  "bench-heavy": {
    function: "Kapean otteen rintapunnerrus, ojentajan veto",
    rationale: "Kapea ote = ojentajan voimaraja → suoraan kisadipin lukitus ja MU:n huippuasento. Raskas kompoundiliike ilman kisa-CNS-kuormaa.",
    phaseVariants: {
      foundation: ["Close-grip bench", "Penkkipunnerrus", "Vinopenkkipunnerrus"],
      strength:   ["Close-grip bench", "Penkkipunnerrus"],
      intensity:  ["Close-grip bench"],
      peaking:    ["Penkkipunnerrus"],
    },
    repScheme: {
      foundation: { sets: 4, reps: 6, targetVx: 3, note: "kapea ote — ojentaja-spesifi" },
      strength:   { sets: 4, reps: 5, targetVx: 3 },
      intensity:  { sets: 3, reps: 4, targetVx: 2 },
      peaking:    { sets: 2, reps: 5, targetVx: 4 },
    },
  },
  "shoulder-vertical": {
    function: "Vertikaalityöntö, hartiaseudun voima",
    rationale: "Pystypunnerrus tukee sekä dipin yläasentoa että MU:n 'standing on top' -lukitusta. Ilman pystyvoimaa dipin huippu on epästabiili kisapainoilla.",
    phaseVariants: {
      foundation: ["Pystypunnerrus", "Pystypunnerrus käsipainot", "Shoulder press laite"],
      strength:   ["Pystypunnerrus", "Pystypunnerrus käsipainot"],
      intensity:  ["Pystypunnerrus käsipainot", "Shoulder press laite"],
      peaking:    ["Shoulder press laite"],
    },
    repScheme: {
      // v4.34.23: foundation Vx-tavoite V3 (oli null) — 8 reps OHP isolaatio, V3 = volume-zone
      foundation: { sets: 3, reps: 8, targetVx: 3 },
      strength:   { sets: 3, reps: 6, targetVx: 3 },
      intensity:  { sets: 3, reps: 5, targetVx: 2 },
      peaking:    { sets: 2, reps: 8, targetVx: 4 },
    },
  },
  "tricep-lockout": {
    function: "Ojentajan lockout, dipin lukitusvoima",
    rationale: "Dipin ja MU:n viimeiset 10 cm ovat puhdasta ojentajan voimaa. Foundation-faasi rakentaa massaa overhead ext:llä (Maeo 2023: ~1.4× enemmän kasvua pitkäpäälle vs pushdown). Strength/intensity siirtyy skull crusheriin ja close-gripiin — lukituskulma-spesifi voima.",
    phaseVariants: {
      foundation: ["Overhead tricep ext", "Tricep pushdown"],
      strength:   ["Skull crusher", "Close-grip bench"],
      intensity:  ["Skull crusher", "Tricep pushdown"],
      peaking:    ["Tricep pushdown"],
    },
    repScheme: {
      // v4.34.23: tricep-lockout Vx-tavoitteet (oli null) — Doc 2: isolaatio ojentajalle V2-V3
      foundation: { sets: 3, reps: 12, targetVx: 3 },
      strength:   { sets: 3, reps: 8, targetVx: 2 },
      intensity:  { sets: 3, reps: 8, targetVx: 2 },
      peaking:    { sets: 2, reps: 12, targetVx: 4 },
    },
  },
  "shoulder-isolation": {
    function: "Deltoideusten isolaatio",
    rationale: "Kasvattaa hartialihakset turvallisesti ilman CNS-kuormaa. Isot deltoidit = vakaampi dipin yläasento ja parempi MU:n ylävartalon lukitus. Foundation-faasi stretch-mediated (lean-away lateral raise, Maeo 2022), strength-faasi raskaampi, intensity drop-set -tekniikka, peaking vain maintenance.",
    phaseVariants: {
      foundation: ["Sivunosto", "Lateral raise kone"],
      strength:   ["Sivunosto", "Lateral raise kone"],
      intensity:  ["Lateral raise kone", "Sivunosto"],
      peaking:    ["Sivunosto"],
    },
    repScheme: {
      // v4.34.23: shoulder-isolation Vx-tavoitteet — Doc 4: stretch-mediated lähellä failurea (V1-V2)
      foundation: { sets: 3, reps: 15, targetVx: 1, note: "Lean-away asento — stretch-mediated hypertrofia, V1 = lähellä failurea (Maeo 2022 + Doc 4)" },
      strength:   { sets: 4, reps: 10, targetVx: 2, note: "Raskaampi kuorma — mekaaninen jännitys" },
      intensity:  { sets: 2, reps: 12, targetVx: 1, note: "Drop-set viim. sarjassa — metabolinen stimulus pienellä fatiikka-budjetilla" },
      peaking:    { sets: 2, reps: 15, targetVx: 4, note: "Maintenance — vain aktivaatio, ei failure" },
    },
  },

  // ─── LOWER ───
  "hip-hinge": {
    function: "Lonkkahinge, takaketju",
    rationale: "Romanian DL rakentaa takaketjun (hamstring + pakara + alaselkä) ilman täys-DL:n CNS-kuormaa raskaan kyykyn jälkeen. Eccentric-fokus + hamstring loaded läpi liikkeen → parempi hypertrofia-stimulus (Maeo 2022). Peakingissä siirrytään hip thrustiin — matalampi CNS-kuorma. v4.32.7 bugfix: aiemmin movement oli 'Maastaveto' (täys-DL lattiasta) note 'RDL', mutta UI:ssa luki 'Maastaveto' → ristiriita. Streetlifting-kontekstissa Maastaveto ei ole kisaliike, eikä raskaan kyykyn jälkeen ole optimaalista lisätä toista täys-CNS-liikettä alaselkäkettoon.",
    phaseVariants: {
      foundation: ["Romanian DL", "Hip thrust"],
      strength:   ["Romanian DL", "Hip thrust"],
      intensity:  ["Romanian DL"],
      peaking:    ["Hip thrust"],
    },
    repScheme: {
      // v4.34.23: hip-hinge foundation Vx (oli null) — RDL eccentric V3 volume-zone
      foundation: { sets: 3, reps: 8, targetVx: 3, note: "RDL — eccentric-fokus, ei lattiasta" },
      strength:   { sets: 3, reps: 6, targetVx: 3, note: "RDL — hamstring loaded koko liikkeen ajan" },
      intensity:  { sets: 3, reps: 5, targetVx: 2, note: "RDL — CNS-säästö raskaan kyykyn jälkeen" },
      peaking:    { sets: 2, reps: 8, targetVx: 4, note: "Hip thrust — glute taper" },
    },
  },
  "knee-dominant-accessory": {
    function: "Polven ekstensio, quadien volyymi",
    rationale: "Jalkaprässi antaa quad-volyymia turvallisesti (ei selkä-CNS:ää). Voima/intensiteettiblokissa paused squat opettaa pohjalukon — suoraan kisakyykyn startin räjähtävyys.",
    phaseVariants: {
      foundation: ["Jalkaprässi", "Leg extension"],
      strength:   ["Jalkaprässi", "Paused squat"],
      intensity:  ["Paused squat", "Jalkaprässi"],
      peaking:    ["Jalkaprässi"],
    },
    repScheme: {
      // v4.34.23: knee-dominant Vx-tavoitteet (oli null) — Doc 2: 10 reps quad-isolaatio V3, 8 reps V2-V3
      foundation: { sets: 3, reps: 10, targetVx: 3 },
      strength:   { sets: 3, reps: 8, targetVx: 2 },
      intensity:  { sets: 3, reps: 6, targetVx: 2 },
      peaking:    { sets: 2, reps: 10, targetVx: 4 },
    },
  },
  "knee-unilateral": {
    function: "Yksijalkaisuus, asymmetrian hallinta",
    rationale: "Korjaa oikea/vasen-epäsymmetriaa, stabiloi lantio. v4.32.9 M18: drop intensityssä (Pelland 2024 PUOS, ~2 direct sets/sessio strengthille). v4.34.17: DROPPED foundation + strength (Doc 3 -suositus + atleetin hyväksyntä TI-pilotin perusteella): 5→4 alaraaja-accessoryslottia foundation-blokissa, voimakehityksen diminishing returns yli 3 fractional sarjaa per liike per viikko (Pelland 2024). Atleetin TI-volyymi laskee ~21→18 sarjaan/sessio.",
    phaseVariants: {
      foundation: [],   // v4.34.17: dropped (Doc 3 vol-leikkaus, TI-volyymi 21→18 sarjaa)
      strength:   [],   // v4.34.17: dropped — Pelland 2024 strength PUOS ~2 direct sets/sessio
      intensity:  [],   // v4.32.9 M18: drop intensity (Pelland PUOS, MA primary @85-90% riittää)
      peaking:    [],
    },
    repScheme: {
      foundation: null,  // v4.34.17: dropped
      strength:   null,  // v4.34.17: dropped
      intensity:  null,  // v4.32.9 M18: dropped
      peaking:    null,
    },
  },
  "hamstring-isolation": {
    function: "Takareiden isolaatio + eksentrinen kapasiteetti",
    rationale: "Balansoi kyykyn etureiden dominanssia, suojaa polvia. Vahva hamstring = parempi lonkkahinge kyykyn alaosassa ja pienempi rasitusvammariski. Foundation=volyymi (leg curl, helppo kontrolli), strength=eksentrinen voima (Nordic curl tai slider curl — Ristolainen 2022: hamstring eccentric → 3–5 % 1RM-kyykky 6 vk:ssa), intensity=säilyttävä volyymi, peaking=light maintenance.",
    phaseVariants: {
      foundation: ["Leg curl"],
      strength:   ["Nordic curl", "Leg curl"],
      intensity:  ["Nordic curl", "Leg curl"],
      peaking:    ["Leg curl"],
    },
    repScheme: {
      // v4.34.23: hamstring-isolation foundation Vx V3 (oli null) — leg curl 12 reps volume-zone
      foundation: { sets: 3, reps: 12, targetVx: 3, note: "Kontrolloitu eksentrinen — base volume V3" },
      strength:   { sets: 3, reps: 6,  targetVx: 3, note: "Eksentrinen 3–4 s lasku — hamstring-specific strength (slider curl = regressio jos Nordic liian raskas)" },
      intensity:  { sets: 3, reps: 6,  targetVx: 3, note: "Eksentrinen fokus — säilytä strength-adaptaatiot" },
      peaking:    { sets: 2, reps: 12, targetVx: 4, note: "Kevyt maintenance — ei eksentristä fatiikkaa peakingissa" },
    },
  },
  "calf-isolation": {
    function: "Pohkeiden isolaatio, nilkan rigidity",
    rationale: "Raskaan kyykyn (230 kg+) lockout vaatii nilkan jäykkyyttä — soleus-toorque (staattinen plantariflexion) + gastrocnemius-elastic (reaktivinen). Ilman pohje-isolaatiota ankle-ketju on heikoin lenkki ja lockout karkaa. Seisten = gastrocnemius (bi-articular), istuen = soleus (mono-articular). Peakingissä kevyempi volyymi CNS-säästön vuoksi.",
    phaseVariants: {
      foundation: ["Pohkeenkohotus", "Standing calf raise"],
      strength:   ["Pohkeenkohotus", "Seated calf raise"],
      intensity:  ["Pohkeenkohotus", "Seated calf raise"],
      peaking:    ["Pohkeenkohotus"],
    },
    repScheme: {
      // v4.32.8: V3→V1, reps 15→12. Phase 1 -tutkimuslöydös: stretch-mediated
      // hypertrofia + 15-rep-sarja vaatii high-threshold motor unit -rekrytointia
      // (Maeo 2023 lengthened partial = full ROM hypertrofialle, Israetel calves-
      // suositus 0–1 RIR). 12 reps parantaa Halperin-RIR-tarkkuutta. Säilytä täysi
      // venytys pohjassa, nosta proximity-to-failurea: V1 = 1 rep varalla.
      foundation: { sets: 3, reps: 12, targetVx: 1, note: "Täysi venytys pohjassa — stretch-mediated hypertrofia, V1 = lähellä failurea (Maeo 2023, Israetel calves)" },
      strength:   { sets: 3, reps: 12, targetVx: 3 },
      intensity:  { sets: 3, reps: 10, targetVx: 2 },
      peaking:    { sets: 2, reps: 12, targetVx: 4 },
    },
  },

  // ─── MU-SPESIFI (LA-päivä) ───
  "mu-transition": {
    function: "Muscle-up -transition, false grip + räjähtävä veto",
    rationale: "MU:n kriittisin kohta: veto loppuu ja siirrytään työntöön. Hypertrofiassa false grip row (volyymi), voimablokissa band-MU (koko liikerata kevyemmällä), peakingissä räjähtävä leuka (nopeus).",
    phaseVariants: {
      // v4.34.14: Weighted inverted row oletus foundationissa.
      // Edellinen v4.34.13: chest-to-bar oletus → mutta DUPLIKOI MA:n pull-volume-slottia
      // (foundation: ["Leuanveto chest-to-bar", ...] data.js:462). Käyttäjäpalaute LA-treenin
      // jälkeen: "chest to bar taitaa jo olla maanantain treenissä, joten siksi ei ehkä paras".
      // Weighted inverted row = horisontaaliveto = todellisin row-pattern ilman renkaita
      // (matala tanko Smith-koneella tai squat rackissa lantion korkeudella, lisäpaino vyötärölle).
      // Säilyttää slotin alkuperäisen funktion (false grip row -volyymi) ringeittä.
      foundation: ["Weighted inverted row", "False grip row", "Leuanveto chest-to-bar"],
      strength:   ["Band-assisted muscle-up", "False grip row"],
      intensity:  ["Band-assisted muscle-up", "Räjähtävä leuka"],
      peaking:    ["Räjähtävä leuka"],
    },
    repScheme: {
      foundation: { sets: 4, reps: 5, targetVx: 3 },
      strength:   { sets: 3, reps: 4, targetVx: 3 },
      intensity:  { sets: 3, reps: 3, targetVx: 3 },
      peaking:    { sets: 2, reps: 3, targetVx: 4 },
    },
  },
  "mu-dip-support": {
    function: "MU:n lukitus — dippi-spesifi",
    // v4.28.2: Ring dip → Tempo pause dippi foundationissa (kalustorajoite, ei renkaita).
    // Tempo pause antaa saman pec-stretch-stimuluksen tankodippinä, ei vaadi rinkejä.
    rationale: "MU:n yläasento = kisa-dippi. Variantit kuormittavat eri kulmista (Tempo pause = ROM + pec-stretch, Russian = transition-loppuvaihe, straight bar = spesifi MU-huippu) ilman pääliikkeen kuormaa.",
    phaseVariants: {
      foundation: ["Lisäpainodippi", "Tempo pause dippi"],
      strength:   ["Lisäpainodippi", "Russian dip"],
      intensity:  ["Straight bar dip", "Lisäpainodippi"],
      peaking:    ["Lisäpainodippi"],
    },
    repScheme: {
      // v4.32.8: foundation V3→V5. Phase 1 -tutkimuslöydös: note "Kevyt — prehab"
      // ja V3 olivat ristiriitaiset. Prehab-tarkoitus on MU-primaryn recovery-
      // marginaalin suoja, ei stimulus → V5 (5 RIR) yhdenmukaistuu intentioon.
      // v4.32.9 M18: intensity → null (Pelland PUOS volume-cut). LA-päivän
      // intensity-vaiheessa MU primary + glute-emphasis + mu-transition + pull-
      // vertical-explosive riittää, mu-dip-support marginaalinen.
      foundation: { sets: 3, reps: 8, targetVx: 5, note: "Kevyt — prehab, V5 = ei rasita MU-primarya" },
      strength:   { sets: 3, reps: 5, targetVx: 3 },
      intensity:  null,  // v4.32.9 M18: dropped (volume-cut)
      peaking:    { sets: 2, reps: 5, targetVx: 4 },
    },
  },
  // v4.29.0 (P4): Overload-liikkeet — eliitti­tason heikon kohdan ylikuormitus.
  // Westsiden law-of-accommodation -periaate streetliftingiin sovitettuna:
  // CNS-tason kuormitus, joka ylittää konsentrisen 1RM:n, totuttaa hermolihas­
  // järjestelmän kuormaan ja vahvistaa lockout-spesifistä voimaa. Käytössä vain
  // strength + intensity -blokeissa (vk 5-12), ei foundation/peakingissa.
  // Murton 2018 -meta: lopeta supramaksimaaliset eksentrikat vk 13:lla DOMS-riskin
  // takia. Käyttäjä voi swap:ata accessorySlotOverridesilla vapaasti.
  // v4.31.0: Dippi-tertiary-primer (MA-päivä, P/S/T-rakenteen 3. komponentti)
  // Käyttäjäpalaute v4.30.4: 120 h dippi-primaryjen välillä = liian pitkä, V3-target
  // pomppaa V5:ksi koska palautuminen on yli-mitoitettua. Ratkaisu: MA-päivän loppuun
  // 3×5 Lisäpainodippi @ ~50 % 1RM @ V5 — kevyt neural-primer, valmistaa TO-primarya.
  // KUORMITETTU dippaaja (kuten käyttäjä, penkki 180 kg = dippi-1RM ~60–80 kg lisäpainolla):
  // BW dippi olisi V8–V10 = liian kevyt primer-rooliksi. Lisäpaino ~50 % 1RM @ V5 =
  // sopiva neural-aktivaatio ilman volyymikuormaa.
  // Aikajänne: MA tertiary → TO primary = 72 h, optimoitu Tietz-tyylinen primer-recovery.
  // Foundation + strength + intensity. Pois vk 4/8/12 deload + vk 13+ peaking (taper).
  "dip-tertiary-primer": {
    function: "Dippi-tertiary primer (MA-päivä) — valmistaa TO-primaryä",
    rationale: "Lisäpainodippi ~50 % 1RM @ V5 (RPE 5–6), 3×5 — kevyt neural-stimulus. Triceps + pec-insertion aktivaatio ilman volyymikuormaa. 72 h ennen TO-primarya = optimi primer-recovery. Korjaa V3 → V5 -ilmiön (alikuormitus 1×/vk frekvenssillä). Brendan Tietz / Mathew Zlat -käytäntö 2–3×/vk dippifrekvenssi.",
    phaseVariants: {
      foundation: ["Lisäpainodippi"],
      strength:   ["Lisäpainodippi"],
      intensity:  ["Lisäpainodippi"],
      peaking:    [],
    },
    repScheme: {
      foundation: { sets: 3, reps: 5, targetVx: 5, note: "~50 % 1RM @ V5 (RPE 5–6) — primer 72 h ennen TO-primarya, ei grindiä" },
      strength:   { sets: 3, reps: 5, targetVx: 5, note: "~50 % 1RM @ V5 — primer-tyyppinen, valmistaa TO-primarya" },
      intensity:  { sets: 3, reps: 4, targetVx: 5, note: "~50 % 1RM @ V5 — kevyempi koska TO-primary kovempi" },
    },
  },
  // v4.32.6: BW-dippi tertiary (MA-päivä, P/S/T-rakenteen 3. komponentti) — turvallinen
  // korvaaja v4.31.0:n dip-tertiary-primer:lle (joka aiheutti venähdys-riskin
  // käyttäjälle, jolla "vahva penkki + vähäinen dippi-tausta"). BW-dippi:
  //   • Ei lisäpainoa = ei venähdys-riskiä (chest/sternum)
  //   • Korkeampi rep-range (8–12) → volyymistimulus + ROM-pohjan rakentaminen
  //   • V2-V3 -target → motor pattern, ei failure
  //   • Sijoittuu MA:lla 4. liikkeeksi (row+curl-rinta-prehab takana, riittävä aktivaatio)
  // Frekvenssi 3×/vk: MA tertiary (BW) + TO primary (lisäpaino) + LA eccentric =
  // Tietz/Zlat-tyyli kestävä ROM-akumulaatio ilman overloadia.
  "dip-bw-tertiary": {
    function: "BW-dippi tertiary (MA-päivä) — volyymi + ROM-pohja",
    rationale: "Lisäpainodippi BW (0 kg lisäpainoa) 3×8–12 V2–V3 — pelkkä kehopaino, korkeampi toistorange, ei venähdys-riskiä. Volyymipohjainen aktivaatio: pec, triceps, anterior delt. Sijoitus 4. liikkeenä = kahden vetävän + biceps-curlin jälkeen rinta on aktivoitunut. Käyttäjäprofiili (vahva penkki, vähäinen dippi-tausta): rakenna ROM-pohja ilman lisäpainoa ennen overloadia. 72 h MA→TO säilyy kevyenä koska BW ≠ CNS-rasite.",
    phaseVariants: {
      foundation: ["Lisäpainodippi"],
      strength:   ["Lisäpainodippi"],
      intensity:  ["Lisäpainodippi"],
      peaking:    [],
    },
    repScheme: {
      // v4.32.8: foundation V3→V5. Phase 1 -tutkimuslöydös: note sanoo
      // eksplisiittisesti "ei grindiä" mutta V3 ON grindi-zone (Halperin: V3
      // raportoitu = ~V2 todellinen). V5 yhdenmukaistuu "volume + ROM-pohja, ei
      // grindiä"-intentiin.
      // v4.32.9 M18: intensity → null (Pelland PUOS volume-cut). Foundation +
      // strength säilyvät, intensityssä TO primary @85-90% + Helms backoff
      // riittää, BW-tertiary marginaalinen lisäarvo.
      foundation: { sets: 3, reps: 10, targetVx: 5, note: "BW-dippi 3×8–12 V5 — volyymi + ROM-pohja, ei lisäpainoa, ei grindiä (V5 = oikea volume-zone)" },
      strength:   { sets: 3, reps: 10, targetVx: 3, note: "BW-dippi 3×10 V3 — ylläpito, BW ei kuormita primary-palautumista" },
      intensity:  null,  // v4.32.9 M18: dropped (volume-cut)
    },
  },
  // v4.31.0: Pakara-emphasis -tukiliike (LA-päivä strength-piikki + intensity-ylläpito)
  // Käyttäjäpalaute v4.30.4: kyykky-strength-vaihe 10–11 sarjaa/vk on alarajalla. Pakara
  // on alikäytetty tukiliike voimanostajilla — Bret Contreras / MASS / Greg Nuckols
  // tunnistavat sen kustannus-hyödyltään parhaaksi. Hip thrust: matala CNS-kuorma,
  // korkea pakara-aktivaatio, 72 h LA→TI palautuu täysin. Ei kvad-fatiikkaa, ei selkä-
  // kuormaa → ei häiritse TI-primarya, päinvastoin pakara on aktivoitu primer-tyylisesti.
  // Strength + intensity. Pois foundation (volyymi jo 12 keskellä MAV) + peaking (taper).
  "glute-emphasis": {
    function: "Pakara-emphasis — kyykky-secondary-päivän tukiliike",
    rationale: "Hip thrust: matala CNS-kuorma + korkea pakara-aktivaatio (Bret Contreras / Greg Nuckols / MASS). Strength-piikki 3×8 V3 nostaa kyykky-volyymin 10 → 13–14 sarjaa/vk MAV-yläpäähän. Intensity 2×10 V4 ylläpitää kohti taperia. 72 h LA → TI = pakara palautuu täysin tuoreeksi — ei kvad-/selkä-fatiikkaa primarya rasittamaan, päinvastoin priming-vaikutus.",
    phaseVariants: {
      foundation: [],
      strength:   ["Hip thrust"],
      intensity:  ["Hip thrust"],
      peaking:    [],
    },
    repScheme: {
      strength:   { sets: 3, reps: 8, targetVx: 3, note: "Pakara-emphasis, matala CNS — strength-piikki, palautuu 72 h LA→TI primary" },
      intensity:  { sets: 2, reps: 10, targetVx: 4, note: "Ylläpito-volyymi, kevyempi taperia kohti" },
    },
  },
  "overload-pull-eccentric": {
    function: "Leuanveto eksentrinen overload (110–120 % 1RM)",
    rationale: "Heavy negative pull-up: hyppy yläasentoon + 3–5 s hallittu lasku 110–120 % 1RM. Westsiden eksentrinen overload-periaate. Totuttaa CNS:n kuormaan jota ei voi konsentrisesti nostaa, vahvistaa hauis/lat -kapasiteetin lockoutissa. Vain vk 5-12 (Murton 2018: peakvaiheessa DOMS-riski liian iso).",
    phaseVariants: {
      foundation: [],
      strength:   ["Heavy negative leuka"],
      intensity:  ["Heavy negative leuka"],
      peaking:    [],
    },
    repScheme: {
      strength:   { sets: 3, reps: 3, targetVx: null, note: "110–115 % 1RM, 5 s lasku — vain eksentrinen, hyppy ylös" },
      intensity:  { sets: 3, reps: 2, targetVx: null, note: "115–120 % 1RM, 5 s lasku — vain eksentrinen" },
    },
  },
  "overload-dip-lockout": {
    function: "Dippi-lockout overload (105–115 % 1RM, board/foam)",
    rationale: "Board dip: rajoitettu ROM (ylä-1/3) lautaa apuna käyttäen, 105–115 % 1RM. Lockout-spesifinen triceps + sternum-overload — ei rasita pec-insertion stretchia. Vain vk 5-12. Vrt. board press penkkipunnerruksessa.",
    phaseVariants: {
      foundation: [],
      strength:   ["Board dippi"],
      intensity:  ["Board dippi"],
      peaking:    [],
    },
    repScheme: {
      strength:   { sets: 3, reps: 5, targetVx: 3, note: "105–110 % 1RM, ylä-1/3 ROM, kontrolloitu lasku lautaan" },
      intensity:  { sets: 3, reps: 3, targetVx: 3, note: "110–115 % 1RM, ylä-1/3 ROM" },
    },
  },
  // v4.28.0: BW eksentrinen dippi skill-vaiheelle (vk 1-4). Korvaa aiemman tempo-pause-dipin
  // LA-päivänä — eksentrinen faasi harjoittaa pec-insertion ROM-kapasiteettia ilman
  // concentric-triceps-kuormaa, joten 48 h palautuminen MA:n leuka-primaryä varten säilyy.
  // Tämä slot oli v4.27.12:ssa jo käytössä laDay:ssa mutta puuttui catalogista →
  // accessorySlotOverrides + stagnation-detection eivät tunnistaneet sitä. Nyt täysin
  // integroitu: lukitus, swap, progressio — kaikki slotId-pohjainen UI toimii.
  "dip-eccentric-bw": {
    function: "Eksentrinen dippi — pec-insertion ROM + lisäkuormalla skill-vaiheessa",
    rationale: "5 s eksentrinen lasku + hyppy/avustettu ylös. Harjoittaa pec-insertion eccentric kapasiteettia ILMAN concentric-triceps-kuormaa → ei lisää palautumisvelkaa TO:n dippi-primaryyn eikä MA:n leuka-primaryyn. Lisäpaino vyössä (+10–25 kg, säädä kokemustason mukaan) tekee liikkeestä mielekkään: pelkkä BW V4 on kokeneelle harjoittelijalle alikuormitettu eikä tuota stimulusta. Käytössä vain foundation-blokissa skill-vaiheen aikana; voima-blokista eteenpäin mu-dip-support (Lisäpainodippi) ottaa yli.",
    phaseVariants: {
      foundation: ["BW eksentrinen dippi", "Tempo pause dippi"],
      strength:   [],
      intensity:  [],
      peaking:    [],
    },
    repScheme: {
      // targetVx:null koska eksentrisessä työssä Vx ei ole mielekäs metriikka
      // (ei concentric-RM:ää josta varaa lasketaan). Kuormitus tulee laskuajasta + lisäpainosta.
      foundation: { sets: 4, reps: 3, targetVx: null, note: "5 s lasku +10–25 kg vyö, hyppy/avustettu ylös — eksentrinen pec-ROM (ei Vx-tracking)" },
    },
  },

  // ─── Dippi-prehab-slotit (v4.27.4, refaktoroitu v4.27.7) ───
  // v4.27.7: Slot siirtynyt torstailta (pushAccPrehab) LAUANTAILLE skill-vaiheessa —
  // korvaa mu-dip-support -slotin foundation-blokissa (vk 1-4, muLoad=0). Perustelu:
  // Tempo pause dippi vaatii tuoretta kudosta ja hermolihaskontrolloa ROM-kapasiteetti-
  // stimuluksena; torstaina primary-dipin jälkeen se on junk volumea. Lauantailla MU
  // on primary (ei dippi-liikemalli), 48+ h palautumista edellisestä dipistä → oikea
  // konteksti stretch-mediated-hypertrofialle pec-insertiossa (Warneke 2022-2024).
  "dip-tempo-rom": {
    function: "Dippi-ROM + eksentrinen kapasiteetti (prehab)",
    rationale: "Sternum/pec-insertion-kestävyyden rakennus foundation-blokissa. Tempo pause + täysi ROM matalalla kuormalla (~60–70 % normaalista dipistä) = stretch-mediated hypertrophy pec-insertioon ennen kuin voima-blokki kuormittaa raskailla dipeillä. Tehdään lauantailla MU-päivänä tuoreena; torstaina se olisi junk volumea primary-dipin jälkeen. Close-grip dip on vaihtoehto jos kudos ärsyyntyy tempo-työstä.",
    phaseVariants: {
      foundation: ["Tempo pause dippi", "Close-grip dip"],
      strength:   [],  // skill-vaihe ohi → mu-dip-support (Lisäpainodippi) ottaa yli
      intensity:  [],
      peaking:    [],
    },
    repScheme: {
      foundation: { sets: 3, reps: 8, targetVx: 3, note: "Tempo 3 s alas + 1–2 s pysähdys" },
    },
  },
  "pec-stretch": {
    function: "Pec/rintakehän stretch-hypertrofia",
    rationale: "Pec-majorin pitkäradan kapasiteetti = pec-tear-riskin pienennin (Warneke 2022–2024). Dumbbell pullover täydessä ROM:ssa lataa pec:in ja lats:in venytyksessä — uniikki stimulus jota pushAcc-peruspaketissa ei ole. Incline DB press on vaihtoehto jos pullover on liikkuvuuden kannalta hankala.",
    phaseVariants: {
      foundation: ["Dumbbell pullover", "Incline dumbbell press"],
      strength:   [],
      intensity:  [],
      peaking:    [],
    },
    repScheme: {
      foundation: { sets: 2, reps: 12, targetVx: 4, note: "Stretch-fokus — ei maksimikuorma" },
    },
  },

  // ─── CORE ───
  "core-hollow": {
    function: "Hollow body / L-sit, MU:n keskivartalon lukitus",
    rationale: "Ilman hollow body -lukkoa MU:n transition 'pettää' — keskivartalo yhdistää vedon ja työnnön. L-sit on hollow:n ultimate-muoto: MU-painoja kannatteleva koko kehon jäykkyys.",
    // v4.34.2: phaseVariants päivitetty — aiemmin Hollow body hold + L-sit hold
    // olivat repScheme:n rinnalla joka prescriboi reps:in (10), mikä oli ristiriitainen
    // (hold-liikkeissä yksikkö on sekunnit, ei toistot). Käyttäjäpalaute v4.34.1:
    // "hollow body hold reps vs seconds ristiriita". Korjattu: foundation/peaking
    // käyttävät nyt vain rep-pohjaisia variantteja. Hold-tyyppiset (Hollow body hold,
    // L-sit hold) säilyvät PRESET_MOVEMENTS:issä ja niitä voi swap-modaalin kautta
    // valita manuaalisesti — UI tunnistaa hold-tyypin nimestä ja näyttää "X s".
    phaseVariants: {
      foundation: ["Ab wheel rollout", "Hanging leg raise"],
      strength:   ["Hanging leg raise", "Ab wheel rollout"],
      intensity:  ["Hanging leg raise", "Ab wheel rollout"],
      peaking:    ["Hanging leg raise"],
    },
    repScheme: {
      foundation: { sets: 3, reps: 10, targetVx: null },
      strength:   { sets: 3, reps: 8, targetVx: null },
      intensity:  { sets: 2, reps: 8, targetVx: null },
      peaking:    { sets: 2, reps: 10, targetVx: null },
    },
  },
  "core-antirotation": {
    function: "Anti-rotation core, spine-stability lateraalikuormassa",
    rationale: "Raskas kyykky (230 kg+) luo epäsymmetristä kuormaa — oikean ja vasemman puolen mikrokompensaatiot summautuvat spinal-shear-voimaksi jos anti-rotation-core pettää. Pallof press opettaa keskivartalon ignoraamaan ulkoista rotaatiovääntöä, mikä näkyy suoraan kyykyn lantion linjassa ja alaosan räjähtävyydessä. Toisin kuin hollow (sagittal flexion), anti-rotation palvelee frontaalitason stability:ä joka on kyykyn erityistarve.",
    phaseVariants: {
      foundation: ["Pallof press", "Bird dog"],
      strength:   ["Pallof press", "Landmine anti-rotation"],
      intensity:  ["Pallof press hold", "Pallof press"],
      peaking:    ["Pallof press"],
    },
    repScheme: {
      // v4.32.8: foundation V3→V5. Phase 1 -tutkimuslöydös: anti-rotation core ei
      // hyödy failureen menemisestä — tehtävä on neuromuscular control, ei
      // mekaaninen jännitys. Note "kontrolloitu tempo, ei jerkkaa" + V3 oli
      // ristiriitainen (V3 on grindi-zone). V5 = 5 RIR = oikea volume-zone
      // joka säilyttää tempo-fokuksen.
      foundation: { sets: 3, reps: 10, targetVx: 5, note: "10 toistoa per puoli — kontrolloitu tempo, ei jerkkaa, V5 = volume-zone (control-fokus, ei failure)" },
      strength:   { sets: 3, reps: 8,  targetVx: 3, note: "8 toistoa per puoli — raskaampi kuorma" },
      intensity:  { sets: 2, reps: 8,  targetVx: 2, note: "Iso-hold 8–10 s per puoli tai 8 reps" },
      peaking:    { sets: 2, reps: 10, targetVx: 4, note: "10 toistoa per puoli — kevyt kontrolli" },
    },
  },
  // v4.27.19: grip-endurance catalog-entry poistettu. Perustelu: streetlifting-
  // kisaliikkeet (MU + Leuka + Dippi + Takakyykky) kouluttavat jo kaiken tarvittavan
  // grip-kapasiteetin (94 kg+ leuka + MU-transition false grip -pito). Erillinen
  // farmer carry / dead hang -volyymi on dedikoitua harjoitusaikaa ilman kisahyötyä.
  // Farmer carry + Dead hang -liikkeet säilytetään PRESET_MOVEMENTS-seedissä
  // mahdollista manuaalista accessorySlotOverrides-lisäystä varten, mutta eivät
  // oletuksena ohjelmoinnissa.
};


// ── Primary variants ──
const PRIMARY_VARIANTS = [
  { name: "Kilpaveto (leveä vastaote)", movementName: "Lisäpainoleuanveto", isDefault: true, tags: ["competition", "heavy"] },
  { name: "Korokeveto", movementName: "Lisäpainoleuanveto", isDefault: false, tags: ["supramaximal", "peaking"] },
  { name: "Nopeusveto kuminauhalla", movementName: "Lisäpainoleuanveto", isDefault: false, tags: ["speed", "explosive"] },
  { name: "Myötäoteveto", movementName: "Lisäpainoleuanveto", isDefault: false, tags: ["grip", "heavy", "volume"] },
  { name: "Neutraaliote", movementName: "Lisäpainoleuanveto", isDefault: false, tags: ["grip", "volume"] },
  { name: "2s ylipito", movementName: "Lisäpainoleuanveto", isDefault: false, tags: ["isometric", "volume"] },
  { name: "1.5-toisto hiissaus", movementName: "Lisäpainoleuanveto", isDefault: false, tags: ["tempo", "volume"] },
];

// ── Variant ↔ day type mapping ──
// Heavy: kilpaveto aina (vastaote on kilpailuote), myötäote rotaationa
// Volume: myötäote, neutraali, ylipito, hiissaus
// Speed: kuminauha
// Peaking-only: korokeveto (supramaksimaalinen, ei normaalisyklissä)
const VARIANT_DAY_TYPE_MAP = {
  heavy: ["Kilpaveto (leveä vastaote)"],
  speed: ["Nopeusveto kuminauhalla"],
  volume: ["Myötäoteveto", "Neutraaliote", "2s ylipito", "1.5-toisto hiissaus"],
  peaking: ["Kilpaveto (leveä vastaote)", "Korokeveto"],
};

// ── Utility ──
function uid() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return "id-" + Date.now() + "-" + Math.random().toString(36).slice(2, 10);
}

function nowISO() {
  return new Date().toISOString();
}

function todayISO() {
  return new Date()
    .toLocaleDateString("sv-SE", { timeZone: TIMEZONE })
    .slice(0, 10);
}

function parseNumericInput(v) {
  if (v === null || v === undefined || v === "") return null;
  const cleaned = String(v).trim().replace(/,/g, ".").replace(/[^0-9.+\-]/g, "");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

// ── Measurement quality guards ──
const GUARDS = {
  velocity: (v) => v > 0 && v <= 3.0,
  load: (v) => v >= 0,
  reps: (v) => v >= 1 && v <= 30,
  hrv: (v) => v >= 10 && v <= 200,
  bodyweight: (v) => v >= 30 && v <= 250,
};

function validateVelocity(v) {
  if (v === null || v === undefined) return { valid: true, value: null };
  const n = parseNumericInput(v);
  if (n === null) return { valid: false, value: null, error: "Virheellinen arvo" };
  if (!GUARDS.velocity(n))
    return { valid: false, value: n, error: "Velocity oltava 0–3.0 m/s" };
  return { valid: true, value: n };
}

// v4.38.0: validateMvReps — per-rep MPV-array (working-set velocity entry).
// Hyväksyy: null/undefined/[] (= ei kerätty), tai array of {number > 0, ≤ 3.0}.
// Hylkää: ei-array, sisältää NaN/null/string/negatiivisen/yli 3.0 arvon.
// Käyttöesim. set.mvReps = [0.57, 0.56, 0.54, 0.54, 0.48] (5 rep × MPV).
function validateMvReps(arr) {
  if (arr === null || arr === undefined) return { valid: true, value: null };
  if (!Array.isArray(arr))
    return { valid: false, value: null, error: "mvReps oltava array" };
  if (arr.length === 0) return { valid: true, value: [] };
  const out = [];
  for (let i = 0; i < arr.length; i++) {
    const n = parseNumericInput(arr[i]);
    if (n === null || !GUARDS.velocity(n) || n <= 0)
      return { valid: false, value: null, error: `mvReps[${i}] oltava 0–3.0 m/s, sai: ${arr[i]}` };
    out.push(n);
  }
  return { valid: true, value: out };
}

function validateLoad(v) {
  if (v === null || v === undefined) return { valid: true, value: null };
  const n = parseNumericInput(v);
  if (n === null) return { valid: false, value: null, error: "Virheellinen arvo" };
  if (!GUARDS.load(n)) return { valid: false, value: n, error: "Kuorma ei voi olla negatiivinen" };
  return { valid: true, value: n };
}

function validateReps(v) {
  if (v === null || v === undefined) return { valid: true, value: null };
  const n = parseNumericInput(v);
  if (n === null) return { valid: false, value: null, error: "Virheellinen arvo" };
  if (!GUARDS.reps(n)) return { valid: false, value: n, error: "Toistot oltava 1–30" };
  return { valid: true, value: Math.round(n) };
}

function validateHRV(v) {
  if (v === null || v === undefined) return { valid: true, value: null };
  const n = parseNumericInput(v);
  if (n === null) return { valid: false, value: null, error: "Virheellinen arvo" };
  if (!GUARDS.hrv(n)) return { valid: false, value: n, error: "HRV oltava 10–200 ms" };
  return { valid: true, value: n };
}

function validateBodyweight(v) {
  if (v === null || v === undefined) return { valid: true, value: null };
  const n = parseNumericInput(v);
  if (n === null) return { valid: false, value: null, error: "Virheellinen arvo" };
  if (!GUARDS.bodyweight(n)) return { valid: false, value: n, error: "Kehonpaino oltava 30–250 kg" };
  return { valid: true, value: n };
}

// ── Typo detection ──
function isVelocityTypo(value, baselineMedian, threshold = 0.4) {
  if (baselineMedian === null || baselineMedian === undefined || baselineMedian === 0) return false;
  if (value === null || value === undefined) return false;
  const deviation = Math.abs(value - baselineMedian) / baselineMedian;
  return deviation > threshold;
}

// ── IndexedDB ──
let _db = null;

// ── Pre-migration backup (v4.26.0) ──
// Jokainen IDB-skeeman bumppaus (esim. v3 → v4) on mahdollinen riski että data
// korruptoituu migraation aikana. Tämä funktio ajetaan ENNEN openDB:tä ja
// tarkistaa onko tietokannan nykyinen versio pienempi kuin SCHEMA_VERSION.
// Jos on, se dumppaa KAIKKI olemassaolevat storet JSONiksi localStorageen
// avaimella kuten "leve-coach-backup-premigration-v3-to-v4". Näin käyttäjä
// voi palauttaa datansa manuaalisesti, jos migraatio hajoaa.
// Idempotentti: jos backup samalle siirtymälle on jo olemassa, ei tehdä mitään.
async function createPreMigrationBackupIfNeeded() {
  if (!("indexedDB" in self)) return;
  if (typeof localStorage === "undefined") return;

  // Avaa olemassaoleva DB ilman versiota → saa nykyisen version
  let currentVersion;
  let storeNames;
  try {
    const db = await new Promise((resolve) => {
      const req = indexedDB.open(DB_NAME);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    });
    if (!db) return;
    currentVersion = db.version;
    storeNames = Array.from(db.objectStoreNames);
    db.close();
  } catch (e) {
    console.warn("[data.js] Pre-migration check failed:", e);
    return;
  }

  // Ensiasennus (versio 1 ja tyhjä) tai jo oikeassa versiossa → ei tarvetta
  if (currentVersion >= SCHEMA_VERSION) return;
  if (storeNames.length === 0) return;

  const backupKey = `leve-coach-backup-premigration-v${currentVersion}-to-v${SCHEMA_VERSION}`;
  if (localStorage.getItem(backupKey)) {
    console.log(`[data.js] Pre-migration backup already exists: ${backupKey}`);
    return;
  }

  // Dumppaa kaikki olemassaolevat storet
  const dump = {};
  try {
    const db = await new Promise((resolve) => {
      const req = indexedDB.open(DB_NAME, currentVersion);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    });
    if (!db) return;

    for (const storeName of storeNames) {
      dump[storeName] = await new Promise((resolve) => {
        try {
          const tx = db.transaction(storeName, "readonly");
          const req = tx.objectStore(storeName).getAll();
          req.onsuccess = () => resolve(req.result || []);
          req.onerror = () => resolve([]);
        } catch (e) {
          resolve([]);
        }
      });
    }
    db.close();
  } catch (e) {
    console.error("[data.js] Pre-migration dump failed:", e);
    return;
  }

  // Tallenna localStorageen
  try {
    const payload = {
      backupType: "pre-migration",
      fromVersion: currentVersion,
      toVersion: SCHEMA_VERSION,
      createdAtISO: new Date().toISOString(),
      data: dump,
    };
    const serialized = JSON.stringify(payload);
    localStorage.setItem(backupKey, serialized);
    const sizeKB = Math.round(serialized.length / 1024);
    console.log(`[data.js] ✓ Pre-migration backup created: ${backupKey} (${sizeKB} KB)`);
  } catch (e) {
    // QuotaExceededError — localStorage täynnä. Ei blokata migraatiota.
    console.error("[data.js] ⚠️ Pre-migration backup failed (quota?):", e);
  }
}

function openDB() {
  return new Promise((resolve, reject) => {
    if (!("indexedDB" in self)) {
      console.warn("IndexedDB not available");
      resolve(null);
      return;
    }
    const req = indexedDB.open(DB_NAME, SCHEMA_VERSION);

    req.onupgradeneeded = (event) => {
      const db = event.target.result;
      const oldVersion = event.oldVersion;

      // Create all stores if they don't exist
      if (!db.objectStoreNames.contains(STORES.appMeta)) {
        db.createObjectStore(STORES.appMeta, { keyPath: "key" });
      }
      if (!db.objectStoreNames.contains(STORES.movements)) {
        const store = db.createObjectStore(STORES.movements, { keyPath: "movementId" });
        store.createIndex("category", "category", { unique: false });
        store.createIndex("isPrimary", "isPrimary", { unique: false });
      }
      if (!db.objectStoreNames.contains(STORES.variants)) {
        const store = db.createObjectStore(STORES.variants, { keyPath: "variantId" });
        store.createIndex("movementId", "movementId", { unique: false });
      }
      if (!db.objectStoreNames.contains(STORES.sessions)) {
        const store = db.createObjectStore(STORES.sessions, { keyPath: "sessionId" });
        store.createIndex("dateISO", "dateISO", { unique: false });
        store.createIndex("mesocycleId", "mesocycleId", { unique: false });
      }
      if (!db.objectStoreNames.contains(STORES.sets)) {
        const store = db.createObjectStore(STORES.sets, { keyPath: "setId" });
        store.createIndex("sessionId", "sessionId", { unique: false });
        store.createIndex("movementId", "movementId", { unique: false });
      }
      if (!db.objectStoreNames.contains(STORES.measurements)) {
        const store = db.createObjectStore(STORES.measurements, { keyPath: "measurementId" });
        store.createIndex("dateISO", "dateISO", { unique: false });
        store.createIndex("type", "type", { unique: false });
      }
      if (!db.objectStoreNames.contains(STORES.protocols)) {
        db.createObjectStore(STORES.protocols, { keyPath: "protocolId" });
      }
      if (!db.objectStoreNames.contains(STORES.baselines)) {
        const store = db.createObjectStore(STORES.baselines, { keyPath: "baselineId" });
        store.createIndex("protocolId", "protocolId", { unique: false });
      }
      if (!db.objectStoreNames.contains(STORES.mesocycles)) {
        db.createObjectStore(STORES.mesocycles, { keyPath: "mesocycleId" });
      }
      if (!db.objectStoreNames.contains(STORES.recommendations)) {
        const store = db.createObjectStore(STORES.recommendations, { keyPath: "recId" });
        store.createIndex("sessionId", "sessionId", { unique: false });
      }
      if (!db.objectStoreNames.contains(STORES.decisionTraces)) {
        const store = db.createObjectStore(STORES.decisionTraces, { keyPath: "traceId" });
        store.createIndex("recId", "recId", { unique: false });
      }
      if (!db.objectStoreNames.contains(STORES.movementProgress)) {
        db.createObjectStore(STORES.movementProgress, { keyPath: "movementId" });
      }
      // v4.26.0: backupSnapshots-store (viikottaiset auto-backupit, rolling 4)
      if (!db.objectStoreNames.contains(STORES.backupSnapshots)) {
        const store = db.createObjectStore(STORES.backupSnapshots, { keyPath: "snapshotId" });
        store.createIndex("createdAtISO", "createdAtISO", { unique: false });
      }
    };

    req.onsuccess = () => {
      _db = req.result;
      resolve(_db);
    };
    req.onerror = () => {
      console.error("IndexedDB open failed:", req.error);
      resolve(null);
    };
  });
}

function getDB() {
  return _db;
}

// ── Generic CRUD ──
function dbPut(storeName, obj) {
  return new Promise((resolve) => {
    if (!_db) { resolve(false); return; }
    try {
      const tx = _db.transaction(storeName, "readwrite");
      tx.objectStore(storeName).put(obj);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => { console.error("dbPut error:", tx.error); resolve(false); };
    } catch (e) {
      console.error("dbPut exception:", e);
      resolve(false);
    }
  });
}

function dbGet(storeName, key) {
  return new Promise((resolve) => {
    if (!_db) { resolve(null); return; }
    try {
      const tx = _db.transaction(storeName, "readonly");
      const req = tx.objectStore(storeName).get(key);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    } catch (e) {
      resolve(null);
    }
  });
}

function dbGetAll(storeName) {
  return new Promise((resolve) => {
    if (!_db) { resolve([]); return; }
    try {
      const tx = _db.transaction(storeName, "readonly");
      const req = tx.objectStore(storeName).getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => resolve([]);
    } catch (e) {
      resolve([]);
    }
  });
}

function dbGetByIndex(storeName, indexName, value) {
  return new Promise((resolve) => {
    if (!_db) { resolve([]); return; }
    try {
      const tx = _db.transaction(storeName, "readonly");
      const idx = tx.objectStore(storeName).index(indexName);
      const req = idx.getAll(value);
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => resolve([]);
    } catch (e) {
      resolve([]);
    }
  });
}

function dbDelete(storeName, key) {
  return new Promise((resolve) => {
    if (!_db) { resolve(false); return; }
    try {
      const tx = _db.transaction(storeName, "readwrite");
      tx.objectStore(storeName).delete(key);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    } catch (e) {
      resolve(false);
    }
  });
}

function dbClear(storeName) {
  return new Promise((resolve) => {
    if (!_db) { resolve(false); return; }
    try {
      const tx = _db.transaction(storeName, "readwrite");
      tx.objectStore(storeName).clear();
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    } catch (e) {
      resolve(false);
    }
  });
}

// ── Bulk put (transactional) ──
function dbPutBulk(storeName, items) {
  return new Promise((resolve) => {
    if (!_db || !items.length) { resolve(true); return; }
    try {
      const tx = _db.transaction(storeName, "readwrite");
      const store = tx.objectStore(storeName);
      for (const item of items) {
        store.put(item);
      }
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => { console.error("dbPutBulk error:", tx.error); resolve(false); };
    } catch (e) {
      console.error("dbPutBulk exception:", e);
      resolve(false);
    }
  });
}

// v4.51.2: ensure new preset movements added in later versions get migrated
// to existing IDB. seedPresets() ajetaan vain kerran (first install), joten
// uudet liikkeet (esim. "Yhden jalan jalkaprässi" v4.48.0:ssa) eivät tule
// automaattisesti vanhoille käyttäjille. Tämä funktio kutsutaan init():ssä
// jokaisen sovelluksen avauksen yhteydessä — turvallinen idempotentti
// (lisää vain puuttuvat nimet, ei muokkaa olemassa olevia rivejä).
async function ensureNewPresetMovements() {
  const existingMovements = await dbGetAll(STORES.movements);
  if (existingMovements.length === 0) return { added: 0, migrated: 0 }; // seedPresets hoitaa first-install

  // ── 1. Add missing preset movements (uudet liikkeet myöhemmistä versioista) ──
  // H-019 A2: nimi-dedup normalisoitu (trim+lowercase) — eksakti vertailu päästi läpi
  // välilyönti/case-variantit (esim. käyttäjän "jalkaprässi " vs preset "Jalkaprässi"
  // → kaksi tietuetta, historia hajoaa ID:iden välillä). Estää duplikaattiluokan synnyn.
  const existingNames = new Set(existingMovements.map(m => (m.name || "").trim().toLowerCase()));
  const missing = PRESET_MOVEMENTS.filter(p => !existingNames.has(p.name.trim().toLowerCase()));
  const toAdd = missing.map(m => {
    const base = {
      movementId: uid(),
      name: m.name,
      category: m.category,
      isPrimary: m.isPrimary,
      countsAsPullVolume: PULL_VOLUME_CATEGORIES.has(m.category),
      isPreset: true,
      tags: [],
    };
    // β Round B-α-1.11: kopioi metadata-kentät PRESET_MOVEMENTS:ista jotta engine
    // tunnistaa kilpaliikkeet (isCompetitionLift), system-load (loadType) ja
    // tier:n (Lähde 1 -reititys Tier 1/2/3:lle).
    if (m.isCompetitionLift !== undefined) base.isCompetitionLift = m.isCompetitionLift;
    if (m.loadType !== undefined) base.loadType = m.loadType;
    // tier voi olla number, function tai "special". Funktioita ei voi sarjallistaa
    // IndexedDB:hen (DataCloneError) → skipataan funktio-tieriä (Muscle-up).
    // resolveTier:n try/catch kattaa fallbackin slot.loadPct:hen.
    if (m.tier !== undefined && typeof m.tier !== "function") base.tier = m.tier;
    return base;
  });
  if (toAdd.length > 0) {
    await dbPutBulk(STORES.movements, toAdd);
  }

  // ── 2. β Round B-α-1.11: Migrate existing movement records — täytä puuttuvat
  //       metadata-kentät PRESET_MOVEMENTS:in pohjalta. Idempotentti:
  //       jos kenttä on jo asetettu, ei kosketa. Korjaa Round B-α-1:n DB-skeema-aukon
  //       jossa tier-kenttä lisättiin PRESET_MOVEMENTS:iin mutta ei stored-recordeihin
  //       → resolveTier throwasi → Lähde 1 (V/reps → expected %1RM) ei aktivoitunut.
  const presetByName = new Map(PRESET_MOVEMENTS.map(p => [p.name, p]));
  const toUpdate = [];
  for (const existing of existingMovements) {
    const preset = presetByName.get(existing.name);
    if (!preset) continue;
    let needsUpdate = false;
    const updated = { ...existing };
    if (updated.isCompetitionLift === undefined && preset.isCompetitionLift !== undefined) {
      updated.isCompetitionLift = preset.isCompetitionLift;
      needsUpdate = true;
    }
    if (updated.loadType === undefined && preset.loadType !== undefined) {
      updated.loadType = preset.loadType;
      needsUpdate = true;
    }
    if (updated.tier === undefined && preset.tier !== undefined && typeof preset.tier !== "function") {
      updated.tier = preset.tier;
      needsUpdate = true;
    }
    if (needsUpdate) toUpdate.push(updated);
  }
  if (toUpdate.length > 0) {
    await dbPutBulk(STORES.movements, toUpdate);
  }

  return {
    added: toAdd.length,
    migrated: toUpdate.length,
    names: toAdd.length > 0 ? toAdd.map(m => m.name) : undefined,
  };
}

// ── Initialization: seed preset movements + variants ──
async function seedPresets() {
  const existingMovements = await dbGetAll(STORES.movements);
  if (existingMovements.length > 0) return; // Already seeded

  const movements = PRESET_MOVEMENTS.map((m) => {
    const base = {
      movementId: uid(),
      name: m.name,
      category: m.category,
      isPrimary: m.isPrimary,
      countsAsPullVolume: PULL_VOLUME_CATEGORIES.has(m.category),
      isPreset: true,
      tags: [],
    };
    // β Round B-α-1.11: kopioi metadata PRESET_MOVEMENTS:ista (sama kuin
    // ensureNewPresetMovements). Funktio-tieriä ei sarjallisteta IndexedDB:hen.
    if (m.isCompetitionLift !== undefined) base.isCompetitionLift = m.isCompetitionLift;
    if (m.loadType !== undefined) base.loadType = m.loadType;
    if (m.tier !== undefined && typeof m.tier !== "function") base.tier = m.tier;
    return base;
  });

  await dbPutBulk(STORES.movements, movements);

  // Create variants for primary movement
  const primaryMov = movements.find((m) => m.isPrimary);
  if (primaryMov) {
    const variants = PRIMARY_VARIANTS.map((v) => ({
      variantId: uid(),
      movementId: primaryMov.movementId,
      name: v.name,
      isDefault: v.isDefault,
      notes: "",
    }));
    await dbPutBulk(STORES.variants, variants);
  }

  // Store app meta
  await dbPut(STORES.appMeta, {
    key: "meta",
    appVersion: APP_VERSION,
    schemaVersion: SCHEMA_VERSION,
    createdAtISO: nowISO(),
    lastOpenedISO: nowISO(),
    timezone: TIMEZONE,
  });
}

// ── High-level data access ──

// Movements
async function getAllMovements() {
  return dbGetAll(STORES.movements);
}

async function getMovementsByCategory(category) {
  return dbGetByIndex(STORES.movements, "category", category);
}

async function getPrimaryMovement() {
  const all = await dbGetAll(STORES.movements);
  return all.find((m) => m.isPrimary) || null;
}

async function addMovement(name, category, tutorialUrl = "") {
  const mov = {
    movementId: uid(),
    name,
    category,
    isPrimary: false,
    countsAsPullVolume: PULL_VOLUME_CATEGORIES.has(category),
    isPreset: false,
    tags: [],
    tutorialUrl: tutorialUrl || "",
  };
  await dbPut(STORES.movements, mov);
  return mov;
}

async function updateMovement(movementId, updates) {
  const existing = await dbGet(STORES.movements, movementId);
  if (!existing) return null;
  const updated = { ...existing, ...updates };
  if (updates.category !== undefined) {
    updated.countsAsPullVolume = PULL_VOLUME_CATEGORIES.has(updates.category);
  }
  await dbPut(STORES.movements, updated);
  return updated;
}

async function deleteMovement(movementId) {
  return dbDelete(STORES.movements, movementId);
}

// Variants
async function getVariantsForMovement(movementId) {
  return dbGetByIndex(STORES.variants, "movementId", movementId);
}

async function addVariant(movementId, name, notes = "") {
  const v = { variantId: uid(), movementId, name, isDefault: false, notes };
  await dbPut(STORES.variants, v);
  return v;
}

// Sessions
async function getAllSessions() {
  const sessions = await dbGetAll(STORES.sessions);
  return sessions.sort((a, b) => (a.dateISO || "").localeCompare(b.dateISO || ""));
}

async function getSession(sessionId) {
  return dbGet(STORES.sessions, sessionId);
}

async function saveSession(session) {
  if (!session.sessionId) session.sessionId = uid();
  return dbPut(STORES.sessions, session);
}

// v4.51.0 (Track B 2D-δ-C): Auto-learning aggressiveness-bias.
// Lukee viim. 3 session selectedSuggestionId:n + viim. session V0-failure / RED-cap-
// tiedon. Päivittää settings.aggressivenessLearned ∈ [-1, +1].
//
// Drift-säännöt:
//   3× SAFE-streak + viim. sessio onnistui (ei V0, ei RED) → -0.15 (siirry SAFE-päin)
//   3× AGGRESSIVE-streak + viim. sessio onnistui            → +0.15
//   3× TARGET-streak                                       → drift kohti 0 (-0.05/+0.05)
//   FAILURE (V0) viim. sessiossa                            → -0.30 (alaspäin SAFE)
//   RED-cap viim. sessiossa                                 → -0.30
//   Clamp [-1, +1].
//
// Palauttaa { learned, delta, reasonCode } myöhempää trace-emitointia varten.
// learned-päivitys tallennetaan settingsiin samassa kutsussa.
async function updateAggressivenessLearned() {
  const settings = await getSettings();
  const prevLearned = typeof settings.aggressivenessLearned === "number"
    ? settings.aggressivenessLearned : 0;
  let newLearned = prevLearned;
  let delta = 0;
  let reasonCode = "no-change";

  // Lue viim. 3 sessiota (uusimmasta vanhimpaan)
  const allSessions = await dbGetAll(STORES.sessions);
  const sorted = allSessions
    .filter(s => s.dateISO)
    .sort((a, b) => (b.dateISO < a.dateISO ? -1 : 1))
    .slice(0, 3);

  if (sorted.length === 0) {
    return { learned: newLearned, delta: 0, reasonCode: "no-sessions" };
  }

  const lastSession = sorted[0];

  // 1) FAILURE-suoja: jos viim. session sisältää V0-failuren primary-sarjassa
  // → drop -0.30 (auto-konservatiivinen suoja).
  let hadFailure = false;
  try {
    const lastSets = await dbGetByIndex(STORES.sets, "sessionId", lastSession.sessionId);
    hadFailure = (lastSets || []).some(s =>
      s.setRole === "top" && s.actualVx === 0
    );
  } catch (_e) {
    hadFailure = false;
  }
  const hadRedCap = lastSession.readinessCapLevel >= 2;

  if (hadFailure) {
    delta = -0.30;
    reasonCode = "failure-protection";
  } else if (hadRedCap) {
    delta = -0.30;
    reasonCode = "red-cap-protection";
  } else if (sorted.length >= 3) {
    // 2) Streak-detection viim. 3 session valinnoista
    const ids = sorted.map(s => s.selectedSuggestionId || "target");
    const allSame = ids.every(x => x === ids[0]);
    if (allSame) {
      if (ids[0] === "safe") {
        delta = -0.15;
        reasonCode = "safe-streak-3";
      } else if (ids[0] === "aggressive") {
        delta = 0.15;
        reasonCode = "aggressive-streak-3";
      } else if (ids[0] === "target") {
        // Drift kohti nollaa (decay)
        if (prevLearned > 0.05) {
          delta = -0.05;
          reasonCode = "target-streak-decay-down";
        } else if (prevLearned < -0.05) {
          delta = 0.05;
          reasonCode = "target-streak-decay-up";
        } else {
          delta = 0;
          reasonCode = "target-streak-stable";
        }
      }
    }
  }

  newLearned = Math.max(-1, Math.min(1, prevLearned + delta));

  if (newLearned !== prevLearned) {
    settings.aggressivenessLearned = newLearned;
    await saveSettings(settings);
  }

  return { learned: newLearned, prevLearned, delta, reasonCode };
}

// v4.51.0: Reset aggressivenessLearned arvoon 0 (settings UI -painike).
async function resetAggressivenessLearned() {
  const settings = await getSettings();
  settings.aggressivenessLearned = 0;
  await saveSettings(settings);
  return 0;
}

// 8a (V1): nollaa opittu across-set-väsymys → engine palaa prioriin (settings UI -painike).
// Poistaa vain acrossSetFatigue-avaimen; muut learnedParams säilyvät.
async function resetLearnedAcrossSetFatigue() {
  const settings = await getSettings();
  if (settings.learnedParams && settings.learnedParams.acrossSetFatigue) {
    delete settings.learnedParams.acrossSetFatigue;
    await saveSettings(settings);
  }
  return 0.5;
}

async function deleteSession(sessionId) {
  // Delete associated sets
  const sets = await dbGetByIndex(STORES.sets, "sessionId", sessionId);
  for (const s of sets) {
    await dbDelete(STORES.sets, s.setId);
  }
  // Delete associated recommendations
  const recs = await dbGetByIndex(STORES.recommendations, "sessionId", sessionId);
  for (const r of recs) {
    // Delete associated traces
    const traces = await dbGetByIndex(STORES.decisionTraces, "recId", r.recId);
    for (const t of traces) await dbDelete(STORES.decisionTraces, t.traceId);
    await dbDelete(STORES.recommendations, r.recId);
  }
  return dbDelete(STORES.sessions, sessionId);
}

// Sets
async function getSetsForSession(sessionId) {
  return dbGetByIndex(STORES.sets, "sessionId", sessionId);
}

async function getSetsForMovement(movementId) {
  return dbGetByIndex(STORES.sets, "movementId", movementId);
}

async function getAllSets() {
  return dbGetAll(STORES.sets);
}

async function saveSet(set) {
  if (!set.setId) set.setId = uid();
  return dbPut(STORES.sets, set);
}

async function saveSets(sets) {
  return dbPutBulk(STORES.sets, sets);
}

async function deleteSet(setId) {
  return dbDelete(STORES.sets, setId);
}

// ── Pending workout (autosave) ──────────────────────────────────
// Synkroninen localStorage-pohjainen varmuuskopio kesken jääneestä treenistä.
// Tallennetaan jokaisen sarjan kirjaamisen yhteydessä + pagehide/beforeunload-eventeissä.
// Sovelluksen avatessa tarjotaan jatkoa jos avain löytyy.
const PENDING_WORKOUT_KEY = "LeVe.pendingWorkout";

function savePendingWorkoutLocal(workout) {
  if (!workout) return false;
  try {
    const payload = { savedAt: new Date().toISOString(), workout };
    localStorage.setItem(PENDING_WORKOUT_KEY, JSON.stringify(payload));
    return true;
  } catch (e) {
    // QuotaExceeded tai disabled localStorage — ei tappava virhe
    console.warn("savePendingWorkoutLocal failed:", e);
    return false;
  }
}

function loadPendingWorkoutLocal() {
  try {
    const raw = localStorage.getItem(PENDING_WORKOUT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.workout?.sessionId) return null;
    return parsed; // { savedAt, workout }
  } catch (e) {
    console.warn("loadPendingWorkoutLocal failed:", e);
    return null;
  }
}

function clearPendingWorkoutLocal() {
  try {
    localStorage.removeItem(PENDING_WORKOUT_KEY);
  } catch {
    // ignore
  }
}

// Measurements
async function getMeasurementsByType(type) {
  return dbGetByIndex(STORES.measurements, "type", type);
}

// v4.52.15 H-006b B4 (A4): kaikki mittaukset typesta riippumatta. Käytössä
// state.measurements-alustuksessa ja computePrimerBaseline-laskennassa, jossa
// suodatetaan type='primer' -mittaukset per movementId.
async function getAllMeasurements() {
  return dbGetAll(STORES.measurements);
}

async function getMeasurementsByDate(dateISO) {
  return dbGetByIndex(STORES.measurements, "dateISO", dateISO);
}

async function saveMeasurement(measurement) {
  if (!measurement.measurementId) measurement.measurementId = uid();
  return dbPut(STORES.measurements, measurement);
}

/**
 * Palauttaa viimeisimmän kehonpainokirjauksen (kg).
 * Fallback: settings.bodyweightKg tai 91.
 * @param {object|null} settings — sovelluksen asetukset
 * @returns {Promise<number>} kehonpaino kiloina
 */
async function getLatestBodyweight(settings = null) {
  const bwMeasurements = await getMeasurementsByType("bodyweight");
  if (bwMeasurements.length > 0) {
    bwMeasurements.sort((a, b) => (b.dateISO || "").localeCompare(a.dateISO || ""));
    if (bwMeasurements[0].value !== null && bwMeasurements[0].value !== undefined) {
      return bwMeasurements[0].value;
    }
  }
  return settings?.bodyweightKg || 91;
}

/**
 * Tallentaa päivän kehonpainon mittaustaulukkoon.
 * @param {number} weightKg — kehonpaino kiloina
 * @param {string} dateISO — päivämäärä ISO-muodossa
 */
async function saveBodyweightEntry(weightKg, dateISO) {
  return saveMeasurement({
    type: "bodyweight",
    dateISO: dateISO || todayISO(),
    value: weightKg,
    valueTransformed: weightKg,
    source: "manual",
  });
}

// ── PRs (stored in measurements with type:"pr") ──
async function getAllPRs() {
  return getMeasurementsByType("pr");
}

async function savePR(pr) {
  if (!pr.measurementId) pr.measurementId = uid();
  pr.type = "pr";
  if (!pr.source) pr.source = "manual";
  return dbPut(STORES.measurements, pr);
}

async function deletePR(measurementId) {
  return dbDelete(STORES.measurements, measurementId);
}

const HISTORICAL_PRS_SEED = [
  { dateISO: "2025-04-04", movementName: "Lisäpainoleuanveto", value: 97, bodyweightKg: null, context: "Leuanvetofokus-kausi (ennen voimanostoblokkia)", isCompetition: false },
  { dateISO: "2025-08-02", movementName: "Penkkipunnerrus",    value: 170, bodyweightKg: 90, context: "Voimanostokisa 1", isCompetition: true },
  { dateISO: "2025-09-27", movementName: "Penkkipunnerrus",    value: 180, bodyweightKg: 90, context: "Voimanostokisa 2", isCompetition: true },
  { dateISO: "2025-09-27", movementName: "Takakyykky",          value: 200, bodyweightKg: 90, context: "Voimanostokisa 2", isCompetition: true },
  { dateISO: "2025-09-27", movementName: "Maastaveto",          value: 235, bodyweightKg: 90, context: "Voimanostokisa 2", isCompetition: true },
  { dateISO: "2026-04-13", movementName: "Lisäpainoleuanveto", value: 98, bodyweightKg: 90.3, context: "Maanantain testi (kisaa edeltävä)", isCompetition: false },
  { dateISO: "2026-04-18", movementName: "Lisäpainoleuanveto", value: 94, bodyweightKg: 88.5, context: "Leuanvetokisa 2026", isCompetition: true },
];

async function seedHistoricalPRsIfNeeded() {
  const meta = (await getAppMeta()) || { key: "meta" };
  if (meta.prsSeeded) return { seeded: false, count: 0 };
  const existing = await getAllPRs();
  if (existing.length > 0) {
    meta.prsSeeded = true;
    await dbPut(STORES.appMeta, meta);
    return { seeded: false, count: 0 };
  }
  let count = 0;
  for (const pr of HISTORICAL_PRS_SEED) {
    await savePR({
      type: "pr",
      dateISO: pr.dateISO,
      movementName: pr.movementName,
      value: pr.value,
      bodyweightKg: pr.bodyweightKg,
      context: pr.context,
      isCompetition: pr.isCompetition,
      source: "seed",
    });
    count++;
  }
  meta.prsSeeded = true;
  await dbPut(STORES.appMeta, meta);
  return { seeded: true, count };
}

// Mesocycles
async function getAllMesocycles() {
  return dbGetAll(STORES.mesocycles);
}

async function getActiveMesocycle() {
  const all = await getAllMesocycles();
  if (!all.length) return null;
  if (all.length === 1) return all[0];

  // v4.34.45: priorisoi eksplisiittisesti tallennettua activeMesocycleId:tä
  // (käyttäjä on aktivoinut tietyn ohjelman uudelleen Historia-välilehdeltä).
  // Tämä antaa käyttäjälle mahdollisuuden palata vanhaan ohjelmaan ilman että
  // session-historia-heuristiikka pakottaa palauttamaan toisen.
  try {
    const meta = await getAppMeta();
    if (meta?.activeMesocycleId) {
      const match = all.find(m => m.mesocycleId === meta.activeMesocycleId);
      if (match) return match;
    }
  } catch (_) { /* fall through */ }

  // v4.27.10: aiemmin palautettiin AINA uusin startDateISO:n mukaan. Tämä aiheutti
  // virheellisiä "ejektioita" kun DB:ssä oli vanha jäänne (esim. default-meso),
  // jonka startDateISO oli uudempi kuin käyttäjän aktiivisesti treenaama meso
  // (esim. streetlifting_16w aloitettu 3 kk sitten). Tällöin getActiveMesocycle
  // palautti jäänteen, jonka weekCount+startDateISO asetti UI:n "päättynyt"-tilaan.
  //
  // Korjaus: jos kaikkien mesosyklien joukossa on useita, suosi sitä jonka
  // mesocycleId:tä viimeisin sessio käytti. Jos sessioita ei ole (tai niiden
  // mesocycleId ei vastaa mitään olemassa olevaa), fallback-säännöksi jää vanha
  // "uusin startDateISO".
  try {
    const sessions = await dbGetAll(STORES.sessions);
    // Sort sessions descending by dateISO then timestamp; find latest with mesocycleId
    sessions.sort((a, b) => {
      const d = (b.dateISO || "").localeCompare(a.dateISO || "");
      if (d !== 0) return d;
      return (b.sessionId || "").localeCompare(a.sessionId || "");
    });
    for (const s of sessions) {
      if (!s.mesocycleId) continue;
      const match = all.find(m => m.mesocycleId === s.mesocycleId);
      if (match) return match;
    }
  } catch (_) {
    // fall through to startDateISO-sort
  }
  all.sort((a, b) => (b.startDateISO || "").localeCompare(a.startDateISO || ""));
  return all[0];
}

// v4.34.45: Aseta aktiivinen mesosykli eksplisiittisesti. Käytetään sekä uuden
// mesosyklin luonnissa että vanhan uudelleen-aktivoinnissa Historia-välilehdellä.
// Päivittää appMeta.meta.activeMesocycleId-kentän jonka getActiveMesocycle lukee.
async function setActiveMesocycle(mesocycleId) {
  if (!mesocycleId) throw new Error("setActiveMesocycle: mesocycleId puuttuu");
  const meta = (await getAppMeta()) || {
    key: "meta",
    appVersion: APP_VERSION,
    schemaVersion: SCHEMA_VERSION,
    createdAtISO: nowISO(),
    timezone: TIMEZONE,
  };
  meta.activeMesocycleId = mesocycleId;
  meta.activeMesocycleSetAtISO = nowISO();
  return dbPut(STORES.appMeta, meta);
}

async function saveMesocycle(meso) {
  if (!meso.mesocycleId) meso.mesocycleId = uid();
  return dbPut(STORES.mesocycles, meso);
}

// v4.34.7: Poistaa mesosyklit jotka ovat orphan-jäänteitä — ts. mesosyklit
// joihin ei ole assosioitu yhtäkään sessiota. Käytetään "Vaihda ohjelma" -polussa
// estämään tilanne jossa default-mesosykli + uusi streetlifting_16w molemmat ovat
// DB:ssä ja getActiveMesocycle palauttaa väärän (vanhempi/uudempi startDateISO).
//
// v4.34.45: lisätty preserveUserChoices=true -optio joka säilyttää myös käyttäjän
// eksplisiittisesti valitsemat ohjelmat (esim. atletti vaihtoi custom-mesoon mutta
// ei tehnyt vielä sessiota; säilytä silti). Jos atletti haluaa siivota orphan-
// mesosyklit, hän voi tehdä sen Asetukset → Reset DB -kautta.
//
// SÄILYTTÄÄ: mesosyklit joilla on yksi tai useampi sessio (= käyttäjän treenihistoria)
// + uusin/aktiivinen mesosykli (excludeId-parametri)
// + preserveUserChoices=true -tilassa: KAIKKI tallennetut mesosyklit (=ei poistoa)
// POISTAA: kaikki muut (= autocreated default-mesosyklit, käytöstä jääneet templatet)
async function cleanupOrphanMesocycles(excludeId = null, opts = {}) {
  // H-019 B-C3 (B9): protectIds — odottava γ-kisablokki on ei-aktiivinen JA sessioton
  // (= orphan-määritelmä) kunnes startti koittaa; ilman suojaa siivous tuhoaisi sen.
  const { preserveUserChoices = false, protectIds = [] } = opts;
  const allMesocycles = await getAllMesocycles();
  if (allMesocycles.length <= 1) return { deleted: 0, kept: allMesocycles.length };

  // v4.34.45: jos preserveUserChoices, siivous on no-op — käyttäjän kaikki ohjelmat
  // säilyvät Historia-välilehdellä. Init-vaiheessa (autocreated default) tätä optiota
  // ei käytetä, joten alkuperäinen tarkoitus säilyy.
  if (preserveUserChoices) {
    return { deleted: 0, kept: allMesocycles.length };
  }

  const sessions = await dbGetAll(STORES.sessions);
  const mesocyclesWithSessions = new Set(
    sessions.map(s => s.mesocycleId).filter(Boolean)
  );
  let deleted = 0;
  for (const meso of allMesocycles) {
    if (meso.mesocycleId === excludeId) continue; // Aktiivinen — säilyy aina
    if (protectIds.includes(meso.mesocycleId)) continue; // B-C3: odottava γ-blokki — säilyy
    if (mesocyclesWithSessions.has(meso.mesocycleId)) continue; // Sessio-historia — säilyy
    // Orphan — poistetaan
    await dbDelete(STORES.mesocycles, meso.mesocycleId);
    deleted++;
  }
  return { deleted, kept: allMesocycles.length - deleted };
}

// Baselines
async function getBaseline(protocolId) {
  const all = await dbGetByIndex(STORES.baselines, "protocolId", protocolId);
  return all[0] || null;
}

async function saveBaseline(baseline) {
  if (!baseline.baselineId) baseline.baselineId = uid();
  return dbPut(STORES.baselines, baseline);
}

// Recommendations
async function saveRecommendation(rec) {
  if (!rec.recId) rec.recId = uid();
  return dbPut(STORES.recommendations, rec);
}

// Decision Traces
async function saveDecisionTrace(trace) {
  if (!trace.traceId) trace.traceId = uid();
  return dbPut(STORES.decisionTraces, trace);
}

async function getTracesForRec(recId) {
  return dbGetByIndex(STORES.decisionTraces, "recId", recId);
}

// v4.34.28: decisionTraces retention + purge (cowork-audit jokerikysymys).
// IDB-store paisuu rajatta — yksi recommend()-kutsu generoi 10-30 trace-objektia,
// ~1-5 MB / sykli (16 vk). 5 syklin jälkeen ~25 MB, IndexedDB-haku hitaastuu O(n).
// Purge: säilytä viim. N päivää (default 90 = ~3 sykliä, riittää End-of-Cycle-Tuningille).
const DEFAULT_TRACE_RETENTION_DAYS = 90;

async function purgeOldDecisionTraces(retainDays = DEFAULT_TRACE_RETENTION_DAYS) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - retainDays);
  const cutoffMs = cutoff.getTime();

  const all = await dbGetAll(STORES.decisionTraces);
  // Trace-objektissa ei ole timestampia suoraan — käytetään associated rec:in dateISO:ta.
  // Jos rec ei löydy (deletoitu), purge säilyttää orphan-tracet (turvallinen default).
  const allRecs = await dbGetAll(STORES.recommendations);
  const recDateMap = new Map();
  for (const r of allRecs) recDateMap.set(r.recId, r.dateISO || r.createdAtISO);

  let purged = 0;
  for (const trace of all) {
    const recDateStr = recDateMap.get(trace.recId);
    if (!recDateStr) continue; // orphan trace, säilytä
    const recMs = new Date(recDateStr).getTime();
    if (Number.isNaN(recMs)) continue;
    if (recMs < cutoffMs) {
      await dbDelete(STORES.decisionTraces, trace.traceId);
      purged++;
    }
  }
  return { purged, total: all.length, cutoffISO: cutoff.toISOString().slice(0, 10) };
}

// Trigger automaattinen purge kerran/vk (linkitetään backup-reminder-rytmiin).
// localStorage-key tracen viim. purge-päivämäärälle.
async function maybeAutoPurgeTraces(retainDays = DEFAULT_TRACE_RETENTION_DAYS) {
  const LS_KEY = "leve_last_trace_purge_iso";
  const todayISOArg = todayISO();
  const lastPurge = (typeof localStorage !== "undefined") ? localStorage.getItem(LS_KEY) : null;
  if (lastPurge) {
    const daysSince = (new Date(todayISOArg).getTime() - new Date(lastPurge).getTime()) / (1000 * 60 * 60 * 24);
    if (daysSince < 7) return null; // ajetaan max 1×/vk
  }
  try {
    const result = await purgeOldDecisionTraces(retainDays);
    if (typeof localStorage !== "undefined") localStorage.setItem(LS_KEY, todayISOArg);
    return result;
  } catch (e) {
    console.warn("[data.js] Trace auto-purge failed:", e);
    return null;
  }
}

// Movement Progress
async function getMovementProgress(movementId) {
  return dbGet(STORES.movementProgress, movementId);
}

async function getAllMovementProgress() {
  return dbGetAll(STORES.movementProgress);
}

async function saveMovementProgress(progress) {
  progress.updatedAtISO = nowISO();
  return dbPut(STORES.movementProgress, progress);
}

// Protocols
async function getAllProtocols() {
  return dbGetAll(STORES.protocols);
}

async function saveProtocol(protocol) {
  if (!protocol.protocolId) protocol.protocolId = uid();
  return dbPut(STORES.protocols, protocol);
}

// App Meta
async function getAppMeta() {
  return dbGet(STORES.appMeta, "meta");
}

async function updateLastOpened() {
  const meta = (await getAppMeta()) || {
    key: "meta",
    appVersion: APP_VERSION,
    schemaVersion: SCHEMA_VERSION,
    createdAtISO: nowISO(),
    timezone: TIMEZONE,
  };
  meta.lastOpenedISO = nowISO();
  meta.appVersion = APP_VERSION;
  return dbPut(STORES.appMeta, meta);
}

// Settings (stored in appMeta store)
async function getSettings() {
  const s = await dbGet(STORES.appMeta, "settings");
  const defaults = {
    key: "settings",
    bodyweightKg: 91,
    maxDelta: 0.25,
    readinessVelocityWindowN: 10,
    readinessHrvWindowN: 14,
    readinessVaraWindowN: 5,
    velocityTypoThreshold: 0.4,
    vlStopPercent: 20,  // legacy fallback — säilytetty backwards-compat:lle
    // v4.38.1 (Phase 2): blokkikohtaiset VL-cap-arvot (within-set stop -trigger).
    // Defaults VL_CAP_PER_BLOCK-vakiosta (engine.js); settings-overrideja
    // käytetään ensisijaisesti kun käyttäjä on niitä säätänyt.
    vlCapFoundation: 30,
    vlCapStrength: 17.5,
    vlCapIntensity: 12.5,
    vlCapPeaking: 7.5,
    vlCapSpeedStrength: 12.5,
    accessoryIncrementUpper: 2.5,
    accessoryIncrementLower: 5,
    stagnationThresholdWeeks: 3,
    // Readiness primer (v4.21): ennen ensimmäistä työsarjaa pääliikkeellä
    readinessPrimerEnabled: true,
    readinessPrimerPct: 0.60,       // % e1rmExternal → primer-kuorma
    readinessPrimerReps: 3,         // toistojen määrä (best-of-N)
    // v4.34.26: Graceful degradation -moodi. Kun atleetti tunnistaa ettei pysty
    // seuraamaan ohjelmaa täydellä volyymilla 2-4 vk ajan (vamma/elämä/sairas/
    // työvaihto), engine vaihtaa minimum-viable-protokollaan: 2 sessiota/vk ×
    // 60% e1RM × V3-V4. Mesocycle ei etene maintenance-aikana — palaa sieltä
    // mistä jäit kun toggle off. Auto-expiry asetettuun päivään.
    maintenanceMode: {
      active: false,
      startISO: null,        // milloin maintenance aloitettu
      durationDays: 14,      // 14 pv default; käyttäjä asettaa
      reason: null,          // "injury" | "life" | "illness" | "switch" | null
    },
    // v4.51.0 (Track B 2D-δ-C): Adaptive multi-suggestion -biasit.
    // preferredSuggestionBias on wizard-seedattu atletti-preferenssi joka ohjaa
    // default-suggestion-valintaa engine.js:n generateSuggestions:issa:
    //   "stable"      → engine suosii SAFE-vaihtoehtoa (palautuva, epävarma tila)
    //   "balanced"    → engine valitsee kontekstin perusteella (suositus oletus)
    //   "challenging" → engine suosii AGGRESSIVE-vaihtoehtoa (kokenut atletti)
    // aggressivenessLearned on auto-learning floattaalia [-1, +1] joka päivittyy
    // session-historian perusteella (3 peräkkäistä SAFE/TARGET/AGGRESSIVE-valintaa
    // → drift suuntaan; FAILURE V0 / RED-cap → drop -0.30). Yhdistetään
    // preferredBias:iin effectiveBias-laskennassa.
    preferredSuggestionBias: "balanced",
    aggressivenessLearned: 0,
    // 8a (V1): opittavat parametrit (tutkimusrajojen sisällä, auditoitavasti).
    // Muoto: { acrossSetFatigue: { value, n, mean } }. Tyhjä → engine käyttää
    // prioria (cold-start bittitarkka). Kirjoitetaan treenin päätöksessä
    // (updateLearnedAcrossSetFatigue), luetaan recommend():issä clampattuna.
    learnedParams: {},
  };
  if (!s) return defaults;
  // Täytä puuttuvat kentät oletuksilla (esim. päivitetylle käyttäjälle)
  return { ...defaults, ...s };
}

async function saveSettings(settings) {
  settings.key = "settings";
  return dbPut(STORES.appMeta, settings);
}

// v4.34.26: Maintenance-tilan aktiivisuus + auto-expiry.
// Palauttaa { active: bool, daysRemaining: number|null, expiryISO: string|null }.
// Auto-expiry: jos durationDays kulunut startISO:sta → expired (active=false).
function maintenanceStatus(maintenanceMode, todayISO) {
  if (!maintenanceMode || !maintenanceMode.active) {
    return { active: false, daysRemaining: null, expiryISO: null };
  }
  if (!maintenanceMode.startISO) {
    return { active: true, daysRemaining: null, expiryISO: null };
  }
  const start = new Date(maintenanceMode.startISO);
  const today = new Date(todayISO);
  const dur = maintenanceMode.durationDays || 14;
  const expiry = new Date(start);
  expiry.setDate(expiry.getDate() + dur);
  const expiryISO = expiry.toISOString().slice(0, 10);
  const msPerDay = 1000 * 60 * 60 * 24;
  const daysRemaining = Math.ceil((expiry.getTime() - today.getTime()) / msPerDay);
  return {
    active: daysRemaining > 0,
    daysRemaining: Math.max(0, daysRemaining),
    expiryISO,
  };
}

// ── Backup / Restore ──
// v4.26.0: backupSnapshots-store EI sisälly full exportiin (rekursio-suoja).
// Snapshot-data koostuu kaikista MUISTA storeista — snapshotit ovat itsenäinen
// kerros jota ei dumpata takaisin snapshottiin.
const BACKUP_EXCLUDED_STORES = new Set(["backupSnapshots"]);

// v4.34.26: Auto-export viikkobackup -reminder.
// Bus-factor-suoja: OneDrive + GitHub + IndexedDB ovat kaikki yhden tilini takana.
// 2 vk välein vapaaehtoinen muistutus jakaa backup ulkoiseen pilveen (sähköposti/
// Telegram/Drive Web Share API:n kautta). Lataaminen ei pakollista — käyttäjä
// voi snoozata "Muistuta 2 vk päästä" (snoozeUntilISO = today + 14 pv) tai
// sulkea bannerin (snoozeUntilISO = today + 14 pv samalla tavalla).
//
// Trigger-säännöt:
//   1. Ei aiempaa external-exportia (lastExportISO === null) → näytä
//   2. Snooze tulevaisuuteen (snoozeUntilISO > today) → ei näytetä
//   3. Snooze tänään (snoozeUntilISO === today) → ei näytetä (snooze pätee tänään)
//   4. Aiempi export ≥ 14 pv sitten → näytä
//   5. Aiempi export < 14 pv sitten → ei näytetä
//
// Käyttäjä paivittää lastExportISO:n kun jakaa tai lataa backupin (joko Web Share
// API:n kautta tai puhdas download). Kumpikin tapa kelpaa external-tallennukseksi.
const BACKUP_REMINDER_DAYS = 14;
function shouldShowBackupReminder(lastExportISO, todayISO, snoozeUntilISO) {
  // Snooze: jos snoozeUntilISO >= todayISO → ei näytetä
  if (snoozeUntilISO) {
    if (snoozeUntilISO >= todayISO) return false;
  }
  if (!lastExportISO) return true;
  const msPerDay = 1000 * 60 * 60 * 24;
  const days = Math.floor((new Date(todayISO).getTime() - new Date(lastExportISO).getTime()) / msPerDay);
  return days >= BACKUP_REMINDER_DAYS;
}

// v4.34.33 BUG-FIX 6.1: localStorage-keyt jotka pitää sisällyttää backupiin/restoreen.
// Aiempi versio menetti nämä restoressa: vk 14 päätös, AI-block-tuning-historia,
// ulkoisen exportin timestampit, snooze-asetukset, UI-collapsible-tilat.
const LOCAL_STORAGE_BACKUP_KEYS = [
  "leve_vk14_decision",
  "LeVe.BLOCK_TUNING_HISTORY",
  "leve_last_ext_export_iso",
  "leve_backup_snooze_until_iso",
  "dash_future_open",
  "dash_trace_open",
];

async function exportFullBackup() {
  const data = {};
  for (const storeName of Object.values(STORES)) {
    if (BACKUP_EXCLUDED_STORES.has(storeName)) continue;
    data[storeName] = await dbGetAll(storeName);
  }
  // v4.34.33 BUG-FIX 6.1: kerää localStorage-keyt backupiin
  if (typeof localStorage !== "undefined") {
    const ls = {};
    for (const key of LOCAL_STORAGE_BACKUP_KEYS) {
      try {
        const val = localStorage.getItem(key);
        if (val !== null) ls[key] = val;
      } catch (e) { /* QuotaExceeded tai disabled localStorage — skipataan */ }
    }
    if (Object.keys(ls).length > 0) data._localStorage = ls;
  }
  data._meta = {
    exportedAtISO: nowISO(),
    appVersion: APP_VERSION,
    schemaVersion: SCHEMA_VERSION,
  };
  return data;
}

async function importFullBackup(data) {
  if (!data || typeof data !== "object") {
    throw new Error("Virheellinen backup-tiedosto");
  }

  // Clear all stores (paitsi backupSnapshots — ne säilyvät restoren yli)
  for (const storeName of Object.values(STORES)) {
    if (BACKUP_EXCLUDED_STORES.has(storeName)) continue;
    await dbClear(storeName);
  }

  // Import each store (paitsi excluded)
  for (const storeName of Object.values(STORES)) {
    if (BACKUP_EXCLUDED_STORES.has(storeName)) continue;
    if (Array.isArray(data[storeName]) && data[storeName].length > 0) {
      await dbPutBulk(storeName, data[storeName]);
    }
  }

  // v4.34.33 BUG-FIX 6.1: palauta localStorage-keyt jos backupissa on niitä
  if (data._localStorage && typeof data._localStorage === "object" && typeof localStorage !== "undefined") {
    for (const [key, val] of Object.entries(data._localStorage)) {
      // Vain whitelistatut keyt — torjuu pahantahtoiset payloadit
      if (!LOCAL_STORAGE_BACKUP_KEYS.includes(key)) continue;
      if (typeof val !== "string") continue;
      try {
        localStorage.setItem(key, val);
      } catch (e) {
        console.warn(`[data.js] localStorage restore epäonnistui keylle ${key}:`, e);
      }
    }
  }

  // Re-seed presets if movements were empty
  const movements = await dbGetAll(STORES.movements);
  if (movements.length === 0) {
    await seedPresets();
  }
}

// ── Auto-Backup (v4.26.0, päivitetty v4.34.6) ──
// PÄIVITTÄINEN snapshot (oli weekly v4.34.5:een asti) IDB:hen backupSnapshots-storeen.
// Rolling 14 viimeisintä (oli 4) → 2 vk historiaa.
// Suojaa sen kohdilta jotka import/export ei tavoita: käyttäjä ei muista vientiä.
// HUOM: tämä EI suojaa "Clear browsing data + site data" -toiminnolta. Sen
// suojaamiseen tarvitaan navigator.storage.persist() (ks. requestPersistentStorage).

const MAX_SNAPSHOTS = 14;              // v4.34.6: 4 → 14 (= 2 vk historiaa päivittäisillä)
const BACKUP_INTERVAL_HOURS = 24;      // v4.34.6: weekly (7d) → daily (24h)
const BACKUP_INTERVAL_DAYS = 1;        // legacy-yhteensopivuus käyttöliittymäreferenssille

// v4.34.6: PERSISTENT STORAGE -pyyntö estämään automaattista pyyhkimistä.
// Selain merkitsee storagen pysyväksi, "Clear browsing data" ei vaikuta automaattisesti
// (vain käyttäjän eksplisiittinen "Site settings → Clear & reset" pyyhkii).
// Asennetuilla PWA:illa lupa myönnetään yleensä automaattisesti — selaimissa vaatii
// joko käyttäjän vahvistuksen tai engagement-heuristiikan täyttymisen.
async function requestPersistentStorage() {
  if (typeof navigator === "undefined" || !navigator.storage || !navigator.storage.persist) {
    return { supported: false, granted: false };
  }
  try {
    const isAlready = await navigator.storage.persisted();
    if (isAlready) return { supported: true, granted: true, alreadyGranted: true };
    const granted = await navigator.storage.persist();
    if (granted) {
      console.log("[data.js] ✓ Persistent storage granted — IndexedDB säilyy 'Clear browsing data' -toiminnon yli");
    } else {
      console.warn("[data.js] ⚠ Persistent storage NOT granted — selain voi pyyhkiä datan automaattisesti");
    }
    return { supported: true, granted };
  } catch (e) {
    console.error("[data.js] Persistent storage request failed:", e);
    return { supported: true, granted: false, error: e.message };
  }
}

async function getLatestBackupSnapshot() {
  const all = await dbGetAll(STORES.backupSnapshots);
  if (!all.length) return null;
  all.sort((a, b) => (b.createdAtISO || "").localeCompare(a.createdAtISO || ""));
  return all[0];
}

async function getBackupStatus() {
  const latest = await getLatestBackupSnapshot();
  if (!latest) {
    return { hasBackup: false, daysSince: null, status: "missing" };
  }
  const ms = Date.now() - new Date(latest.createdAtISO).getTime();
  const days = Math.floor(ms / (1000 * 60 * 60 * 24));
  let status = "fresh"; // vihreä
  if (days >= BACKUP_INTERVAL_DAYS) status = "stale"; // keltainen
  if (days >= BACKUP_INTERVAL_DAYS * 2) status = "overdue"; // oranssi
  return { hasBackup: true, daysSince: days, status, snapshotId: latest.snapshotId };
}

async function createBackupSnapshot(triggerReason = "manual") {
  const data = await exportFullBackup();
  const snapshot = {
    snapshotId: uid(),
    createdAtISO: nowISO(),
    triggerReason, // "weekly-auto" | "manual" | "pre-import"
    sizeBytes: JSON.stringify(data).length,
    data, // täysi dump
  };
  await dbPut(STORES.backupSnapshots, snapshot);
  // Rolling: poista vanhimmat jos > MAX_SNAPSHOTS
  const all = await dbGetAll(STORES.backupSnapshots);
  if (all.length > MAX_SNAPSHOTS) {
    all.sort((a, b) => (a.createdAtISO || "").localeCompare(b.createdAtISO || ""));
    const toDelete = all.slice(0, all.length - MAX_SNAPSHOTS);
    for (const old of toDelete) {
      await dbDelete(STORES.backupSnapshots, old.snapshotId);
    }
  }
  return snapshot;
}

async function maybeCreateWeeklyBackup() {
  // v4.34.6: nimi säilyy yhteensopivuuden takia, mutta toimii nyt PÄIVITTÄIN (24h).
  // Tarkistaa myös tunnit, ei pelkkiä päiviä, jotta startup-snapshot toimii oikein
  // myös samalla päivällä (esim. user avaa sovelluksen aamulla + iltaa).
  const latest = await getLatestBackupSnapshot();
  let hoursSince = Infinity;
  if (latest) {
    const ms = Date.now() - new Date(latest.createdAtISO).getTime();
    hoursSince = ms / (1000 * 60 * 60);
  }
  if (hoursSince >= BACKUP_INTERVAL_HOURS) {
    try {
      const snap = await createBackupSnapshot("daily-auto");
      console.log(`[data.js] ✓ Daily auto-backup created (${Math.round(snap.sizeBytes/1024)} KB)`);
      return snap;
    } catch (e) {
      console.error("[data.js] Daily auto-backup failed:", e);
      return null;
    }
  }
  return null;
}

// v4.34.6: pre-rebuild snapshot — ennen jokaista mesocycle-rebuildia (PROGRAM_BUILD_VERSION
// bump triggeröi). Varmistaa että rebuild EI VOI rikkoa mitään ilman recovery-pistettä.
async function createPreRebuildSnapshot(reason = "pre-rebuild") {
  try {
    const snap = await createBackupSnapshot(reason);
    console.log(`[data.js] ✓ Pre-rebuild snapshot created (${Math.round(snap.sizeBytes/1024)} KB)`);
    return snap;
  } catch (e) {
    console.error("[data.js] Pre-rebuild snapshot failed:", e);
    return null;
  }
}

async function getAllBackupSnapshots() {
  const all = await dbGetAll(STORES.backupSnapshots);
  all.sort((a, b) => (b.createdAtISO || "").localeCompare(a.createdAtISO || ""));
  return all;
}

async function restoreFromSnapshot(snapshotId) {
  const snap = await dbGet(STORES.backupSnapshots, snapshotId);
  if (!snap || !snap.data) {
    throw new Error("Snapshotia ei löydy tai se on rikki");
  }
  // Pre-restore safety: luo nykyisestä tilasta snapshot ensin
  await createBackupSnapshot("pre-restore");
  // Restore
  await importFullBackup(snap.data);
}

// ── CSV Import (historical data) ──
function parseCSVLine(line) {
  const result = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === "," && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else if (ch === ";" && !inQuotes) {
      // Support semicolon-separated CSV (common in Finnish locale)
      result.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

function parseCSV(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return { headers: [], rows: [] };
  const headers = parseCSVLine(lines[0]);
  const rows = lines.slice(1).map((l) => parseCSVLine(l));
  return { headers, rows };
}

async function importHistoricalCSV(text, columnMapping) {
  // columnMapping: { date: colIdx, movement: colIdx, weight: colIdx, reps: colIdx, sets: colIdx, vara: colIdx }
  const { headers, rows } = parseCSV(text);
  if (!rows.length) throw new Error("CSV on tyhjä");

  const movements = await getAllMovements();
  const movementByName = new Map(movements.map((m) => [m.name.toLowerCase(), m]));

  const sessionsByDate = new Map();
  const newSets = [];

  for (const row of rows) {
    const dateISO = row[columnMapping.date] || todayISO();
    const movementName = row[columnMapping.movement] || "Lisäpainoleuanveto";
    const weightKg = parseNumericInput(row[columnMapping.weight]);
    const reps = parseNumericInput(row[columnMapping.reps]);
    const setCount = parseNumericInput(row[columnMapping.sets]) || 1;
    const vara = columnMapping.vara !== undefined ? parseNumericInput(row[columnMapping.vara]) : null;

    if (reps === null || reps < 1) continue;

    // Find or create movement
    let mov = movementByName.get(movementName.toLowerCase());
    if (!mov) {
      mov = await addMovement(movementName, "muu");
      movementByName.set(movementName.toLowerCase(), mov);
    }

    // Find or create session for this date
    if (!sessionsByDate.has(dateISO)) {
      const session = {
        sessionId: uid(),
        dateISO,
        plannedDayType: null,
        mesocycleWeek: null,
        mesocycleId: null,
        bodyweightKg: null,
        notes: "CSV import",
        readinessCapLevel: null,
        readinessDetails: null,
      };
      sessionsByDate.set(dateISO, session);
    }

    const session = sessionsByDate.get(dateISO);

    for (let i = 0; i < setCount; i++) {
      newSets.push({
        setId: uid(),
        sessionId: session.sessionId,
        movementId: mov.movementId,
        variantId: null,
        setRole: "top",
        externalLoadKg: weightKg,
        reps: reps,
        targetReps: reps,
        targetVx: null,
        actualVx: vara,
        velocityMean: null,
        velocityPeak: null,
        velocityRep1: null,
        velocityLossPercent: null,
        mvReps: null,
        tempo: null,
        restSec: null,
        deviceMeta: null,
        manualOverride: null,
      });
    }
  }

  // Save sessions and sets
  const sessions = Array.from(sessionsByDate.values());
  await dbPutBulk(STORES.sessions, sessions);
  await dbPutBulk(STORES.sets, newSets);

  return { sessionsImported: sessions.length, setsImported: newSets.length };
}

// ── Create default mesocycle ──
// ── Periodisaatiomalli ──
// Golden standard konjugoitu/blokkihybridi lisäpainoleuanvedolle:
//
// VIIKKORAKENNE (3 päivää):
//   Ma = MAKSIMIVOIMA  — kilpaveto, 2-3 toistoa, korkea intensiteetti, V1-V2
//   Ke = PERUSVOIMA    — variaatioveto, 4-6 toistoa, volyymi + hypertrofia, V2-V3
//   Pe = NOPEUSVOIMA   — kuminauhaveto, 2-3 toistoa max nopeus, V4+, kevyt kuorma
//
// MESOSYKLIRAKENNE (4 viikkoa):
//   Vk1 = Adaptaatio (0%)   — Totuttelevat kuormat, kaikkia osa-alueita
//   Vk2 = Loading (+2.5%)   — Progressiivinen ylikuorma
//   Vk3 = Overreach (+3.5%) — Maksimaalinen ärsyke, pienin Vara
//   Vk4 = Deload (-25%)     — Superkompensaatio, EI nopeuspäivää, vain kevyt ylläpito
//
// TUKILIIKKEET progressoivat:
//   Vk1-2: Täysi volyymi (perusvoimatyö + hypertrofia)
//   Vk3: Sama volyymi mutta korkeampi intensiteetti (pienemmät Vara-arvot)
//   Vk4: -30% volyymi, korkeat Varat (aktiivinen palautuminen)
//
// VOIMAOMINAISUUDET:
//   Maksimivoima = Ma (heavy) — hermoston adaptaatio, suurin kuorma
//   Perusvoima   = Ke (volume) — lihasten poikkipinta-ala + voimakestävyys
//   Nopeusvoima  = Pe (speed) — voimantuottonopeus, kuminauha, max intent

function createDefaultMesocycle(startDateISO) {
  return {
    mesocycleId: uid(),
    type: "default",
    startDateISO: startDateISO || todayISO(),
    weekCount: 4,
    weekDefs: [
      { week: 1, deltaPctBase: 0, label: "Adaptaatio", heavyReps: 3, heavyTargetVx: 2 },
      { week: 2, deltaPctBase: 0.025, label: "Loading", heavyReps: 3, heavyTargetVx: 1 },
      { week: 3, deltaPctBase: 0.035, label: "Overreach", heavyReps: 2, heavyTargetVx: 1 },
      { week: 4, deltaPctBase: -0.25, label: "Deload", heavyReps: 3, heavyTargetVx: 4 },
    ],
    weekPlans: [
      // ── VIIKKO 1: ADAPTAATIO ──
      {
        week: 1,
        days: [
          {
            dayOfWeek: 1, dayType: "heavy", label: "Maksimivoima",
            slots: [
              { role: "primary", category: "vertikaaliveto", defaultMovementName: "Lisäpainoleuanveto", sets: 5, reps: 3, targetVx: 2 },
              { role: "backoff", category: "vertikaaliveto", defaultMovementName: "Lisäpainoleuanveto", sets: 3, reps: 5, targetVx: 3 },
              { role: "accessory", category: "horisontaaliveto", defaultMovementName: "Penkkiveto", sets: 4, reps: 6, targetVx: 3 },
              { role: "accessory", category: "horisontaalityöntö", defaultMovementName: "Penkkipunnerrus", sets: 3, reps: 8, targetVx: 3 },
              { role: "accessory", category: "hauisfleksio", defaultMovementName: "Hauiskääntö tanko", sets: 3, reps: 10, targetVx: null },
            ],
          },
          {
            dayOfWeek: 3, dayType: "volume", label: "Perusvoima",
            slots: [
              { role: "primary", category: "vertikaaliveto", defaultMovementName: "Lisäpainoleuanveto", sets: 5, reps: 5, targetVx: 3 },
              { role: "accessory", category: "vertikaaliveto", defaultMovementName: "Ylätalja", sets: 4, reps: 8, targetVx: 3 },
              { role: "accessory", category: "vertikaalityöntö", defaultMovementName: "Pystypunnerrus", sets: 3, reps: 8, targetVx: 3 },
              { role: "accessory", category: "ojentajaekstensio", defaultMovementName: "Tricep pushdown", sets: 3, reps: 12, targetVx: null },
              { role: "accessory", category: "core", defaultMovementName: "Hanging leg raise", sets: 3, reps: 10, targetVx: null },
            ],
          },
          {
            dayOfWeek: 5, dayType: "speed", label: "Nopeusvoima",
            slots: [
              { role: "primary", category: "vertikaaliveto", defaultMovementName: "Lisäpainoleuanveto", sets: 6, reps: 2, targetVx: 4 },
              { role: "accessory", category: "horisontaaliveto", defaultMovementName: "Alatalja", sets: 3, reps: 10, targetVx: null },
              { role: "accessory", category: "hauisfleksio", defaultMovementName: "Hammer curl", sets: 3, reps: 10, targetVx: null },
            ],
          },
        ],
      },
      // ── VIIKKO 2: LOADING ──
      {
        week: 2,
        days: [
          {
            dayOfWeek: 1, dayType: "heavy", label: "Maksimivoima",
            slots: [
              { role: "primary", category: "vertikaaliveto", defaultMovementName: "Lisäpainoleuanveto", sets: 5, reps: 3, targetVx: 1 },
              { role: "backoff", category: "vertikaaliveto", defaultMovementName: "Lisäpainoleuanveto", sets: 3, reps: 5, targetVx: 2 },
              { role: "accessory", category: "horisontaaliveto", defaultMovementName: "Penkkiveto", sets: 4, reps: 6, targetVx: 2 },
              { role: "accessory", category: "horisontaalityöntö", defaultMovementName: "Penkkipunnerrus", sets: 3, reps: 8, targetVx: 2 },
              { role: "accessory", category: "hauisfleksio", defaultMovementName: "Hauiskääntö tanko", sets: 3, reps: 10, targetVx: null },
            ],
          },
          {
            dayOfWeek: 3, dayType: "volume", label: "Perusvoima",
            slots: [
              { role: "primary", category: "vertikaaliveto", defaultMovementName: "Lisäpainoleuanveto", sets: 5, reps: 5, targetVx: 2 },
              { role: "accessory", category: "vertikaaliveto", defaultMovementName: "Ylätalja", sets: 4, reps: 8, targetVx: 2 },
              { role: "accessory", category: "vertikaalityöntö", defaultMovementName: "Pystypunnerrus", sets: 3, reps: 8, targetVx: 2 },
              { role: "accessory", category: "ojentajaekstensio", defaultMovementName: "Tricep pushdown", sets: 3, reps: 12, targetVx: null },
              { role: "accessory", category: "core", defaultMovementName: "Hanging leg raise", sets: 3, reps: 10, targetVx: null },
            ],
          },
          {
            dayOfWeek: 5, dayType: "speed", label: "Nopeusvoima",
            slots: [
              { role: "primary", category: "vertikaaliveto", defaultMovementName: "Lisäpainoleuanveto", sets: 6, reps: 2, targetVx: 4 },
              { role: "accessory", category: "horisontaaliveto", defaultMovementName: "Alatalja", sets: 3, reps: 10, targetVx: null },
              { role: "accessory", category: "hauisfleksio", defaultMovementName: "Hammer curl", sets: 3, reps: 10, targetVx: null },
            ],
          },
        ],
      },
      // ── VIIKKO 3: OVERREACH ──
      {
        week: 3,
        days: [
          {
            dayOfWeek: 1, dayType: "heavy", label: "Maksimivoima (overreach)",
            slots: [
              { role: "primary", category: "vertikaaliveto", defaultMovementName: "Lisäpainoleuanveto", sets: 5, reps: 2, targetVx: 1 },
              { role: "backoff", category: "vertikaaliveto", defaultMovementName: "Lisäpainoleuanveto", sets: 3, reps: 4, targetVx: 2 },
              { role: "accessory", category: "horisontaaliveto", defaultMovementName: "Penkkiveto", sets: 4, reps: 5, targetVx: 2 },
              { role: "accessory", category: "horisontaalityöntö", defaultMovementName: "Penkkipunnerrus", sets: 3, reps: 6, targetVx: 2 },
              { role: "accessory", category: "hauisfleksio", defaultMovementName: "Hauiskääntö tanko", sets: 3, reps: 8, targetVx: null },
            ],
          },
          {
            dayOfWeek: 3, dayType: "volume", label: "Perusvoima (overreach)",
            slots: [
              { role: "primary", category: "vertikaaliveto", defaultMovementName: "Lisäpainoleuanveto", sets: 4, reps: 4, targetVx: 2 },
              { role: "accessory", category: "vertikaaliveto", defaultMovementName: "Ylätalja", sets: 4, reps: 8, targetVx: 2 },
              { role: "accessory", category: "vertikaalityöntö", defaultMovementName: "Pystypunnerrus", sets: 3, reps: 8, targetVx: 2 },
              { role: "accessory", category: "ojentajaekstensio", defaultMovementName: "Tricep pushdown", sets: 3, reps: 10, targetVx: null },
              { role: "accessory", category: "core", defaultMovementName: "Hanging leg raise", sets: 3, reps: 10, targetVx: null },
            ],
          },
          {
            dayOfWeek: 5, dayType: "speed", label: "Nopeusvoima",
            slots: [
              { role: "primary", category: "vertikaaliveto", defaultMovementName: "Lisäpainoleuanveto", sets: 5, reps: 2, targetVx: 4 },
              { role: "accessory", category: "horisontaaliveto", defaultMovementName: "Alatalja", sets: 3, reps: 8, targetVx: null },
              { role: "accessory", category: "hauisfleksio", defaultMovementName: "Hammer curl", sets: 2, reps: 10, targetVx: null },
            ],
          },
        ],
      },
      // ── VIIKKO 4: DELOAD (superkompensaatio) ──
      // Ei nopeuspäivää — vain kevyt maksimivoima + perusvoima
      {
        week: 4,
        days: [
          {
            dayOfWeek: 1, dayType: "heavy", label: "Maksimivoima (kevyt)",
            slots: [
              { role: "primary", category: "vertikaaliveto", defaultMovementName: "Lisäpainoleuanveto", sets: 3, reps: 3, targetVx: 4 },
              { role: "accessory", category: "horisontaaliveto", defaultMovementName: "Penkkiveto", sets: 3, reps: 8, targetVx: 4 },
              { role: "accessory", category: "hauisfleksio", defaultMovementName: "Hauiskääntö tanko", sets: 2, reps: 10, targetVx: null },
            ],
          },
          {
            dayOfWeek: 3, dayType: "volume", label: "Perusvoima (kevyt)",
            slots: [
              { role: "primary", category: "vertikaaliveto", defaultMovementName: "Lisäpainoleuanveto", sets: 3, reps: 5, targetVx: 4 },
              { role: "accessory", category: "vertikaaliveto", defaultMovementName: "Ylätalja", sets: 3, reps: 8, targetVx: 4 },
              { role: "accessory", category: "vertikaalityöntö", defaultMovementName: "Pystypunnerrus", sets: 2, reps: 8, targetVx: 4 },
            ],
          },
        ],
      },
    ],
    postCycleAnalysis: null,
  };
}

// H-019 B-C3 (B8): γ-blokin aloituspäivä kisapäivästä — taper-viikon maanantai on
// kisaviikon maanantai, ja 4 työviikkoa alkavat 4 vk sitä ennen. Esim. kisa la 22.8.
// → kisaviikon ma 17.8. → aloitus ma 20.7. Toimii mille tahansa kisa-viikonpäivälle.
function gammaPeakingStartDate(meetDateISO) {
  const d = new Date(meetDateISO + "T12:00:00"); // klo 12 → ei DST-siirtymäongelmia
  const dow = d.getDay() || 7;
  const monday = new Date(d);
  monday.setDate(d.getDate() - (dow - 1) - 28);
  const y = monday.getFullYear();
  const m = String(monday.getMonth() + 1).padStart(2, "0");
  const dd = String(monday.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

// ── Peaking mesocycle (4-week competition prep) ──
// Redesign 2026-03: Gradual volume taper, maintain frequency, sufficient accessories
// Vk1: 3×/vk kova, täydet tukiliikkeet
// Vk2: 3×/vk kova intensiteetti, tukiliikkeet -30%
// Vk3: 2×/vk taper, intensiteetti ylläpidossa, volyymi -50%, minimaaliset tukiliikkeet
// Vk4: 2 päivää — opener-harjoitus + kilpailu
function createPeakingMesocycle(startDateISO, e1rmExternal, bodyweightKg, opts = {}) {
  const e1rm = e1rmExternal || 93;
  const bw = bodyweightKg || 91;

  // ── H-019 OSA B (γ): KISA-PEAKING — 3 lajia, 5 vk, kisapäivä-ankkuri ──
  // Aktivoituu VAIN opts.competition-objektilla (legacy 4 vk yhden liikkeen polku
  // alla säilyy byte-identtisenä → vanhat kutsujat + pilotti eivät muutu, B9).
  // Rakenne (B1): 4 vk kisatyötä + 1 vk taper; kisapäivä = taper-viikon lauantai.
  // B2: vk 1–2 phase "intensity" (VL ≤ 15 %) · vk 3–5 phase "peaking" (VL ≤ 10 %) —
  //     invariantti (taso 2) voittaa ROADMAP:in portaistuksen nimellisarvot.
  // B3: taper = volyymi pois SARJOISTA (deltaPctBase 0 → kuormat säilyvät), frekvenssi
  //     säilyy (4 treenipäivää); EI deload-semantiikkaa (label "Taper", delta > −10 %).
  // B4: viimeinen raskas kisaliikkeille TI (4 vrk ennen la-kisaa). B5: kyykky alas
  //     tukiliikkeenä — viimeinen raskas kyykky vk 4, taperissa ei kyykkyä.
  // B6: MU = taitoliike — matalat toistot, targetVx ≥ 2 (ei failure-grindiä).
  if (opts.competition) {
    const comp = opts.competition;
    const meetDateISO = comp.meetDateISO;
    // lifts: [{ name, e1rmExternal }] kisajärjestyksessä (B8-UI esitäyttää kanonisesta
    // Bestistä, atleetti muokkaa — ratifioitu hybridi). Fallback: streetlifting-kolmikko.
    const lifts = (comp.lifts && comp.lifts.length ? comp.lifts : [
      { name: "Muscle-up", e1rmExternal: null },
      { name: "Lisäpainodippi", e1rmExternal: null },
      { name: "Lisäpainoleuanveto", e1rmExternal: e1rm },
    ]).map(l => ({ name: l.name, e1rmExternal: l.e1rmExternal ?? null, category: l.name === "Lisäpainodippi" ? "horisontaalityöntö" : "vertikaaliveto" }));
    const strategy = comp.meetStrategy || "normaali";
    // Yritysprosentit strategian mukaan (K7-6-semantiikan kanssa yhteensopivat).
    const pcts = strategy === "varma" ? { opener: 0.90, second: 0.955, third: 1.0 }
      : strategy === "aggressiivinen" ? { opener: 0.93, second: 0.99, third: 1.04 }
      : { opener: 0.92, second: 0.97, third: 1.02 };
    const peakingConfig = {
      e1rmExternal: e1rm, bodyweightKg: bw,
      openerPct: pcts.opener, secondPct: pcts.second, thirdPct: pcts.third,
      warmupPcts: [0.40, 0.60, 0.75, 0.85, 0.90],
      meetDateISO, meetStrategy: strategy, lifts,
    };
    // Kisaliikepäivien slot-rakentajat (työviikot; wk = 1..4).
    // allowVelocityInput: VBT elää peakingissa (B2) — kisaliikkeiden raskaat sarjat
    // mittauskelpoisia; live-cap resolvoituu weekDef.phase-leimasta (intensity/peaking).
    const heavyPrimary = (lift, wk) => wk <= 2
      ? [{ role: "primary", category: lift.category, defaultMovementName: lift.name, sets: 4, reps: 2, targetVx: 1, allowVelocityInput: true },
         { role: "backoff", category: lift.category, defaultMovementName: lift.name, sets: 2, reps: 3, targetVx: 2 }]
      : [{ role: "primary", category: lift.category, defaultMovementName: lift.name, sets: 3, reps: 1, targetVx: 1, allowVelocityInput: true },
         { role: "backoff", category: lift.category, defaultMovementName: lift.name, sets: 2, reps: 2, targetVx: 2 }];
    const [muLift, dipLift, pullLift] = [
      lifts.find(l => /muscle/i.test(l.name)) || lifts[0],
      lifts.find(l => /dippi|dip/i.test(l.name)) || lifts[1] || lifts[0],
      lifts.find(l => /leuanveto|pull/i.test(l.name)) || lifts[lifts.length - 1],
    ];
    const workWeek = (wk) => ({
      week: wk,
      days: [
        { dayOfWeek: 1, dayType: "heavy", label: `Kisaveto — raskas (vk ${wk})`, slots: [
          ...heavyPrimary(pullLift, wk),
          { role: "accessory", category: "horisontaaliveto", defaultMovementName: "Penkkiveto", sets: 3, reps: 6, targetVx: 3 },
        ]},
        { dayOfWeek: 2, dayType: "volume", label: wk === 4 ? "Kyykky — viimeinen raskas (B5)" : "Kyykky (tukiliike)", slots: [
          { role: "primary", category: "alaraaja", defaultMovementName: "Takakyykky", sets: wk === 4 ? 3 : 4, reps: wk <= 2 ? 4 : 3, targetVx: 2 },
          { role: "accessory", category: "core", defaultMovementName: "Hanging leg raise", sets: 3, reps: 10, targetVx: null },
        ]},
        { dayOfWeek: 4, dayType: "heavy", label: `Kisadippi — raskas (vk ${wk})`, slots: [
          ...heavyPrimary(dipLift, wk),
          { role: "accessory", category: "horisontaalityöntö", defaultMovementName: "Penkkipunnerrus", sets: 3, reps: 6, targetVx: 3 },
        ]},
        { dayOfWeek: 6, dayType: "heavy", label: `Kisa-MU — tekninen terävyys (vk ${wk})`, slots: [
          // B6: MU taitoliikkeenä — räjähtävät singlet/tuplat, EI grindiä (targetVx ≥ 2).
          { role: "primary", category: "vertikaaliveto", defaultMovementName: muLift.name, sets: wk <= 2 ? 5 : 4, reps: wk <= 2 ? 2 : 1, targetVx: 2 },
          { role: "accessory", category: "vertikaaliveto", defaultMovementName: "False grip pull-up", sets: 3, reps: 3, targetVx: 3 },
        ]},
      ],
    });
    // Taper-viikko (vk 5, B3/B4/B6): frekvenssi 4 pv säilyy, kisaliikesarjat ~−50 %
    // työviikoista, kuormat säilyvät (deltaPctBase 0). TI = viimeinen raskas (B4).
    const taperWeek = {
      week: 5,
      days: [
        { dayOfWeek: 1, dayType: "volume", label: "Taper — kevyt kisaliiketuntuma", slots: [
          { role: "primary", category: pullLift.category, defaultMovementName: pullLift.name, sets: 2, reps: 1, targetVx: 3 },
          { role: "secondary", category: dipLift.category, defaultMovementName: dipLift.name, sets: 2, reps: 1, targetVx: 3 },
        ]},
        { dayOfWeek: 2, dayType: "heavy", label: "Taper — VIIMEINEN RASKAS (kisaliikkeet, B4)", slots: [
          // Viimeinen raskas = tärkein mittauspäivä (velocity-trendi kertoo terävyyden).
          { role: "primary", category: pullLift.category, defaultMovementName: pullLift.name, sets: 2, reps: 1, targetVx: 1, allowVelocityInput: true },
          { role: "secondary", category: dipLift.category, defaultMovementName: dipLift.name, sets: 2, reps: 1, targetVx: 1, allowVelocityInput: true },
          { role: "secondary", category: muLift.category, defaultMovementName: muLift.name, sets: 2, reps: 1, targetVx: 2, allowVelocityInput: true },
        ]},
        { dayOfWeek: 4, dayType: "speed", label: "Taper — kevyt aktivointi", slots: [
          { role: "primary", category: pullLift.category, defaultMovementName: pullLift.name, sets: 1, reps: 1, targetVx: 4 },
          { role: "secondary", category: muLift.category, defaultMovementName: muLift.name, sets: 2, reps: 1, targetVx: 3 },
        ]},
        { dayOfWeek: 6, dayType: "competition", label: "KISAPÄIVÄ", slots: lifts.flatMap(l => ([
          { role: "warmup", category: l.category, defaultMovementName: l.name, sets: 4, reps: 1, targetVx: null, loadPctE1RM: [0.40, 0.60, 0.75, 0.88] },
          { role: "opener", category: l.category, defaultMovementName: l.name, sets: 1, reps: 1, targetVx: 0, loadPctE1RM: pcts.opener },
          { role: "attempt2", category: l.category, defaultMovementName: l.name, sets: 1, reps: 1, targetVx: 0, loadPctE1RM: pcts.second },
          { role: "attempt3", category: l.category, defaultMovementName: l.name, sets: 1, reps: 1, targetVx: 0, loadPctE1RM: pcts.third },
        ]))},
      ],
    };
    return {
      mesocycleId: uid(),
      type: "peaking",
      startDateISO: startDateISO || todayISO(),
      weekCount: 5,
      peakingConfig,
      // B2-viikkoleimat: phase ohjaa VL-cappia (intensity ≤ 15 % · peaking ≤ 10 %).
      // Taper: deltaPctBase 0 (kuormat säilyvät, volyymi leikattu sarjoista) — EI
      // deload-luokitusta (label ilman deload/kevennys-sanaa, delta > −10 %).
      weekDefs: [
        { week: 1, deltaPctBase: 0,    label: "Intensiteetti 1", phase: "intensity", heavyReps: 2, heavyTargetVx: 1 },
        { week: 2, deltaPctBase: 0.02, label: "Intensiteetti 2", phase: "intensity", heavyReps: 2, heavyTargetVx: 1 },
        { week: 3, deltaPctBase: 0.03, label: "Peaking 1",       phase: "peaking",   heavyReps: 1, heavyTargetVx: 1 },
        { week: 4, deltaPctBase: 0.04, label: "Peaking 2",       phase: "peaking",   heavyReps: 1, heavyTargetVx: 1 },
        { week: 5, deltaPctBase: 0,    label: "Taper",           phase: "peaking",   heavyReps: 1, heavyTargetVx: 1, isTaper: true },
      ],
      weekPlans: [workWeek(1), workWeek(2), workWeek(3), workWeek(4), taperWeek],
      postCycleAnalysis: null,
    };
  }

  // Peaking config for attempt calculation
  const peakingConfig = {
    e1rmExternal: e1rm,
    bodyweightKg: bw,
    openerPct: 0.92,    // ~92% of e1RM as opener
    secondPct: 0.97,    // ~97% for 2nd attempt
    thirdPct: 1.02,     // ~102% for 3rd attempt (PR attempt)
    warmupPcts: [0.40, 0.60, 0.75, 0.85, 0.90],
  };

  return {
    mesocycleId: uid(),
    type: "peaking",
    startDateISO: startDateISO || todayISO(),
    weekCount: 4,
    peakingConfig,
    weekDefs: [
      { week: 1, deltaPctBase: 0.02, label: "Intensification", heavyReps: 2, heavyTargetVx: 1 },
      { week: 2, deltaPctBase: 0.04, label: "Realization", heavyReps: 1, heavyTargetVx: 1 },
      { week: 3, deltaPctBase: -0.10, label: "Taper", heavyReps: 2, heavyTargetVx: 3 },
      { week: 4, deltaPctBase: 0, label: "Kilpailu", heavyReps: 1, heavyTargetVx: 0 },
    ],
    weekPlans: [
      // ── VIIKKO 1: INTENSIFICATION (3×/vk) ──
      // Kova maksimivoima + volyymipäivä + nopeuspäivä
      // Täydet tukiliikkeet — ylläpidetään kuntoa
      {
        week: 1,
        days: [
          {
            dayOfWeek: 1, dayType: "heavy", label: "Maksimivoima (kilpaveto)",
            slots: [
              { role: "primary", category: "vertikaaliveto", defaultMovementName: "Lisäpainoleuanveto", variantName: "Kilpaveto (leveä vastaote)", sets: 5, reps: 2, targetVx: 1 },
              { role: "backoff", category: "vertikaaliveto", defaultMovementName: "Lisäpainoleuanveto", variantName: "Kilpaveto (leveä vastaote)", sets: 3, reps: 4, targetVx: 2 },
              { role: "accessory", category: "horisontaaliveto", defaultMovementName: "Penkkiveto", sets: 4, reps: 6, targetVx: 2 },
              { role: "accessory", category: "horisontaalityöntö", defaultMovementName: "Penkkipunnerrus", sets: 3, reps: 6, targetVx: 2 },
              { role: "accessory", category: "hauisfleksio", defaultMovementName: "Hauiskääntö tanko", sets: 3, reps: 8, targetVx: null },
            ],
          },
          {
            dayOfWeek: 3, dayType: "volume", label: "Perusvoima + tuki",
            slots: [
              { role: "primary", category: "vertikaaliveto", defaultMovementName: "Lisäpainoleuanveto", variantName: "Kilpaveto (leveä vastaote)", sets: 4, reps: 4, targetVx: 2 },
              { role: "accessory", category: "vertikaaliveto", defaultMovementName: "Ylätalja", sets: 4, reps: 8, targetVx: 3 },
              { role: "accessory", category: "vertikaalityöntö", defaultMovementName: "Pystypunnerrus", sets: 3, reps: 8, targetVx: 3 },
              { role: "accessory", category: "ojentajaekstensio", defaultMovementName: "Tricep pushdown", sets: 3, reps: 10, targetVx: null },
              { role: "accessory", category: "core", defaultMovementName: "Hanging leg raise", sets: 3, reps: 10, targetVx: null },
            ],
          },
          {
            dayOfWeek: 5, dayType: "speed", label: "Nopeusvoima",
            slots: [
              { role: "primary", category: "vertikaaliveto", defaultMovementName: "Lisäpainoleuanveto", variantName: "Kilpaveto (leveä vastaote)", sets: 5, reps: 2, targetVx: 4 },
              { role: "accessory", category: "horisontaaliveto", defaultMovementName: "Alatalja", sets: 3, reps: 8, targetVx: null },
              { role: "accessory", category: "hauisfleksio", defaultMovementName: "Hammer curl", sets: 3, reps: 10, targetVx: null },
            ],
          },
        ],
      },
      // ── VIIKKO 2: REALIZATION (3×/vk) ──
      // Kovempi intensiteetti pääliikkeessä, tukiliikkeitä -30%
      {
        week: 2,
        days: [
          {
            dayOfWeek: 1, dayType: "heavy", label: "Maksimivoima (kova)",
            slots: [
              { role: "primary", category: "vertikaaliveto", defaultMovementName: "Lisäpainoleuanveto", variantName: "Kilpaveto (leveä vastaote)", sets: 4, reps: 1, targetVx: 1 },
              { role: "backoff", category: "vertikaaliveto", defaultMovementName: "Lisäpainoleuanveto", variantName: "Kilpaveto (leveä vastaote)", sets: 2, reps: 3, targetVx: 2 },
              { role: "accessory", category: "horisontaaliveto", defaultMovementName: "Penkkiveto", sets: 3, reps: 6, targetVx: 2 },
              { role: "accessory", category: "horisontaalityöntö", defaultMovementName: "Penkkipunnerrus", sets: 3, reps: 6, targetVx: 2 },
            ],
          },
          {
            dayOfWeek: 3, dayType: "volume", label: "Perusvoima + ylläpito",
            slots: [
              { role: "primary", category: "vertikaaliveto", defaultMovementName: "Lisäpainoleuanveto", variantName: "Kilpaveto (leveä vastaote)", sets: 3, reps: 3, targetVx: 2 },
              { role: "accessory", category: "vertikaaliveto", defaultMovementName: "Ylätalja", sets: 3, reps: 8, targetVx: 3 },
              { role: "accessory", category: "vertikaalityöntö", defaultMovementName: "Pystypunnerrus", sets: 3, reps: 8, targetVx: 3 },
              { role: "accessory", category: "core", defaultMovementName: "Hanging leg raise", sets: 3, reps: 10, targetVx: null },
            ],
          },
          {
            dayOfWeek: 5, dayType: "speed", label: "Nopeusvoima (kevyt)",
            slots: [
              { role: "primary", category: "vertikaaliveto", defaultMovementName: "Lisäpainoleuanveto", variantName: "Kilpaveto (leveä vastaote)", sets: 4, reps: 2, targetVx: 4 },
              { role: "accessory", category: "hauisfleksio", defaultMovementName: "Hauiskääntö tanko", sets: 2, reps: 10, targetVx: null },
            ],
          },
        ],
      },
      // ── VIIKKO 3: TAPER (2×/vk) ──
      // Volyymi -50%, intensiteetti ylläpidossa, minimaaliset tukiliikkeet
      // Ei nopeuspäivää — superkompensaatio alkaa
      {
        week: 3,
        days: [
          {
            dayOfWeek: 1, dayType: "heavy", label: "Maksimivoima (taper)",
            slots: [
              { role: "primary", category: "vertikaaliveto", defaultMovementName: "Lisäpainoleuanveto", variantName: "Kilpaveto (leveä vastaote)", sets: 3, reps: 2, targetVx: 2 },
              { role: "accessory", category: "horisontaaliveto", defaultMovementName: "Penkkiveto", sets: 3, reps: 6, targetVx: 3 },
              { role: "accessory", category: "hauisfleksio", defaultMovementName: "Hauiskääntö tanko", sets: 2, reps: 8, targetVx: null },
            ],
          },
          {
            dayOfWeek: 4, dayType: "volume", label: "Kevyt ylläpito",
            slots: [
              { role: "primary", category: "vertikaaliveto", defaultMovementName: "Lisäpainoleuanveto", variantName: "Kilpaveto (leveä vastaote)", sets: 2, reps: 3, targetVx: 3 },
              { role: "accessory", category: "vertikaaliveto", defaultMovementName: "Ylätalja", sets: 3, reps: 8, targetVx: 4 },
            ],
          },
        ],
      },
      // ── VIIKKO 4: KILPAILU (2 päivää) ──
      // Ma: Kevyt opener-harjoitus (aktivointi, ei kuormita)
      // Pe: Kilpailupäivä — lämmittely + 3 yritystä
      {
        week: 4,
        days: [
          {
            dayOfWeek: 1, dayType: "heavy", label: "Opener (aktivointi)",
            slots: [
              { role: "primary", category: "vertikaaliveto", defaultMovementName: "Lisäpainoleuanveto", variantName: "Kilpaveto (leveä vastaote)", sets: 2, reps: 2, targetVx: 4 },
            ],
          },
          {
            dayOfWeek: 5, dayType: "competition", label: "Kilpailupäivä",
            slots: [
              { role: "warmup", category: "vertikaaliveto", defaultMovementName: "Lisäpainoleuanveto", variantName: "Kilpaveto (leveä vastaote)", sets: 5, reps: 1, targetVx: null, loadPctE1RM: [0.40, 0.60, 0.75, 0.85, 0.90] },
              { role: "opener", category: "vertikaaliveto", defaultMovementName: "Lisäpainoleuanveto", variantName: "Kilpaveto (leveä vastaote)", sets: 1, reps: 1, targetVx: 0, loadPctE1RM: 0.92 },
              { role: "attempt2", category: "vertikaaliveto", defaultMovementName: "Lisäpainoleuanveto", variantName: "Kilpaveto (leveä vastaote)", sets: 1, reps: 1, targetVx: 0, loadPctE1RM: 0.97 },
              { role: "attempt3", category: "vertikaaliveto", defaultMovementName: "Lisäpainoleuanveto", variantName: "Kilpaveto (leveä vastaote)", sets: 1, reps: 1, targetVx: 0, loadPctE1RM: 1.02 },
            ],
          },
        ],
      },
    ],
    postCycleAnalysis: null,
  };
}

// ── Mesocycle template registry ──
// All available mesocycle templates with metadata for UI
// v4.26.3: `about` kuvaa ohjelman TARKOITUKSEN + odotukset — näkyy mesosykli-näkymän
// "Ohjelman idea" -kortilla kaikille ohjelmatyypeille, jotta käyttäjä ymmärtää
// mihin ohjelma sopii ja mitä odottaa.
const MESOCYCLE_TEMPLATES = [
  { id: "default",       label: "Perusjakso (Ma/Pe/No)",     icon: "⚡", desc: "3×/vk — Maksimivoima + Perusvoima + Nopeusvoima, 4 viikkoa", weeks: 4, factory: "createDefaultMesocycle",
    about: "Yleispätevä 4 vk rakennusjakso jossa yhdistyy maksimivoima, perusvoima ja nopeusvoima saman viikon sisällä. Kuorma nousee viikoilta 1→3 (+0, +2.5%, +5%) ja viikko 4 on deload (-25%). Käytä kun: et ole kisaamassa, haluat pitää kaikki ominaisuudet samanaikaisesti työn alla. Soveltuu useimmille." },
  { id: "hypertrofia",   label: "Hypertrofiajakso",          icon: "💪", desc: "3×/vk — Korkea volyymi, 6-8 toistoa, lihasmassan kasvatus, 4 viikkoa", weeks: 4, factory: "createHypertrofiaMesocycle",
    about: "Lihasmassaa rakentava jakso: korkea volyymi (6-8 toistoa), kohtuullinen intensiteetti (Vx 2-3), runsaasti accessory-työtä. Progressive overload sarjojen kautta. Käytä kun: haluat kasvattaa lihasmassaa ennen voimablokkia, tai fyysinen koko on pullonkaula. Evidenssi: Israetel — hypertrophy MEV→MAV progression." },
  { id: "maksimivoima",  label: "Maksimivoima-blokki",       icon: "🏋️", desc: "3×/vk — 2× maksimivoima + nopeusvoima, 1-3 toistoa, hermostollinen, 4 viikkoa", weeks: 4, factory: "createMaksimivoimaMesocycle",
    about: "Hermostollinen blokki: 1-3 toistoa maksimikuormilla (Vx 1-4), 2 raskasta päivää + 1 nopeuspäivä. Kevyempi accessory-kuorma jotta keskushermosto ehtii palautua. Käytä kun: olet jo hypertrofiablokin jälkeen, tavoitteena PR tai kisaan valmistautuminen (ei vielä peaking-vaiheessa). Varoitus: vaatii hyvää palautumista." },
  { id: "eksentrinen",   label: "Eksentrinen blokki",        icon: "⬇️", desc: "2×/vk — Korokeveto + isometria, supramaksimaalinen, 4 viikkoa", weeks: 4, factory: "createEksenterinenMesocycle",
    about: "Erikoisblokki 2×/vk: 'Korokeveto' (supramaksimaalinen, hidas eksentrinen vaihe) + '2s ylipito' (isometria yläasennossa). Tavoite: sietokyky yli 1RM:n kuormille ja lockout-vahvuus. Käytä kun: olet kokenut nostaja jolla 1RM on pysähtynyt perusblokeissa. Varoitus: ei aloittelijoille — palautumiskuorma on korkea." },
  { id: "dup",           label: "DUP-jakso",                 icon: "🔄", desc: "3×/vk — Undulating: voima/hypertrofia/nopeus vaihtuu päivittäin, 4 viikkoa", weeks: 4, factory: "createDUPMesocycle",
    about: "Daily Undulating Periodization: intensiteetti vaihtuu joka päivä (raskas/volyymi/nopeus kierto) sen sijaan että se vaihtuisi viikottain. Viikko 1 = H-V-S, viikko 2 = S-H-V, jne. Käytä kun: vasteet perinteiseen lineaariseen progressioon ovat hiipuneet, tai haluat varioida ärsykettä. Evidenssi: Rhea et al. 2002 — DUP tuotti 25% suurempia voimanlisäyksiä vs lineaarinen." },
  { id: "siirtyma",      label: "Siirtymäjakso (GPP)",       icon: "🌿", desc: "2-3×/vk — Yleiskunto, ote, prehab, kevyt, 3 viikkoa", weeks: 3, factory: "createSiirtymaMesocycle",
    about: "Yleinen valmistautumisjakso (General Physical Preparation): matala intensiteetti, monipuoliset variantit (Neutraaliote, Myötäoteveto, 1.5-toisto hiissaus), grip-työ ja prehab. Viikkorakenne harvenee 3→2 sessioon tarkoituksellisesti — palautuminen on pääfokus. Käytä kun: siirryt blokista toiseen, tai palaat tauolta. Pidä mielessä: ei ole PR-jakso, vaan pohja." },
  { id: "palautuminen",  label: "Palautumisjakso",           icon: "😴", desc: "2×/vk — Aktiivinen palautuminen, matala intensiteetti, 2 viikkoa", weeks: 2, factory: "createPalautuminenMesocycle",
    about: "⚠ LYHYT SILTA — vain 2 viikkoa × 2 sessio/vk = 4 treeniä yhteensä. Ei täysi mesosykli, vaan aktiivinen palautumissilta raskaiden blokkien välissä (esim. kisan jälkeen tai ennen uutta intensiteettivaihetta). Super-kevyt kuorma (-25→-20%), Vx 4 kaikissa sarjoissa. Käytä kun: olet loppuunajettu tai kisan jälkeen. Älä käytä: itsenäisenä ohjelmana." },
  { id: "peaking",          label: "Peaking (kilpailuun)",          icon: "🏆", desc: "4 viikkoa — Kilpailuun virittäytyminen, vaatii e1RM:n", weeks: 4, factory: "createPeakingMesocycle",
    about: "Kilpajakson erityistapaus: 4 vk taper + kisapäivä jolloin suoritetaan opener/2. yritys/3. yritys järjestyksessä (oletuksena 92%/97%/102% e1RM:stä). Readiness-capit poistettu — luotat omaan säätelyysi. Vaatii: ajantasainen e1RM (pyytää sen aloituksessa). Käytä kun: kisa 4 vk päästä. Kisa-päivän automatiikka hoitaa opener- ja attempt-kuormalaskennan." },
  { id: "streetlifting_16w", label: "Streetlifting 16 vk 🏋️",       icon: "🏋️", desc: "16 viikkoa — 4 kisaliikettä (MU/Leuka/Dippi/Kyykky), Hybrid Block-DUP, kisa-elokuu 2026", weeks: 16, factory: "createStreetlifting16WMesocycle",
    about: "Akken referenssi-ohjelma: 16 vk jaettu 4 blokkiin (vk 1-4 Hypertrofia, 5-8 Voima, 9-12 Intensifikaatio, 13-16 Realization/Peak) Issurin 2010 -metodologialla. 4 kisaliikettä: Muscle-up, Leuka, Dippi, Kyykky. Kuormat loadPct-skaalattuja käyttäjän e1RM:ään — vaatii kalibroinnin aloituksessa. Accessory-volyymi taperoituu automaattisesti loppua kohti. Käytä kun: treenaat streetlifting-kisoihin nimenomaan näillä 4 liikkeellä." },
  { id: "custom",            label: "🎯 Räätälöity ohjelma (kysely)", icon: "🎯", desc: "Vastaa kysymyksiin → sovellus rakentaa optimaalisen ohjelman tavoitteesi + liikkeidesi pohjalta", weeks: null, factory: "generateCustomMesocycle",
    about: "Ohjelmageneraattori rakentaa sinulle mesosyklin vastauksiesi pohjalta (tavoite, päälikkeet, päivät/vk, viikkomäärä, palautumiskyky). Käyttää olemassaolevia preseettejä pohjana ja substituoi päälikkeet + accessoryt funktionaalisten roolien kautta (antagonist/synergist-mappaus). Laatu = preseettien laatu, mutta sovitettuna sinun valintoihisi. Käytä kun: haluat treenata muita päälikkeitä kuin leuanveto (esim. penkki + mave), tai viikkomäärä/päivämäärä eivät sovi vakio-preseetteihin." },
  // v4.48.0 (Track B Vaihe 2D-β): klassiset voimanosto-ohjelmat
  { id: "wendler531",       label: "Wendler 5/3/1",                 icon: "📅", desc: "4×/vk — Klassinen 4-vk sykli, AMRAP viim. sarja, BBB-assistance", weeks: 4, factory: "createWendler531Mesocycle",
    about: "Jim Wendlerin klassinen 4-vk sykli (2009/2011). TM = 90% 1RM. Vk 1: 65/75/85% × 5/5/5+, Vk 2: 70/80/90% × 3/3/3+, Vk 3: 75/85/95% × 5/3/1+ (AMRAP viim. sarja), Vk 4: deload 40/50/60% × 5/5/5. TM nousee +2.5 kg upper / +5 kg lower per sykli. Boring But Big (BBB) -assistance: 5×10 @ 50-60% TM samalla liikkeellä. Wendlerin alkuperäinen ohje: 'leave 1-2 reps in tank' viim. sarjassa. Käytä kun: haluat klassisen Wendler 5/3/1 -ohjelman. PDF-VERIFIOITU lähteenä T-Nation 2009 ydinprosenttitaulukko. Streetlifting-substituutio = WENDLER-DERIVED, ei kanoninen." },
  { id: "topSetBackoff",    label: "Top-set + Backoff",             icon: "🎯", desc: "3×/vk — Yksi raskas single @ RPE 9 + 2-3 backoff @ 80%", weeks: 4, factory: "createTopSetBackoffMesocycle",
    about: "Minimitehokas voimakoneisto: 1× raskas single @ Vara 0-1 (RPE 9-9.5) + 2-3 backoff-sarjaa × 3 toistoa @ 80% top-singleista. Tutkimuspohja: Androulakis-Korakakis et al. 2021 (PMC8435792, Nuckols co-author, vertaisarvioitu METD-konseptipaperi). Käytä kun: ajan rajallisuus on pullonkaula tai haluat optimaalisen voimasignaalin minimivolyymilla. Backoff-toistomäärä 3 on EI-TUTKIMUSPOHJAINEN oletus." },
  { id: "madcow5x5",        label: "Madcow 5×5",                    icon: "🏗️", desc: "3×/vk — 5-vk lineaarinen progressio Ma/Ke/Pe, +2.5%/vk", weeks: 5, factory: "createMadcow5x5Mesocycle",
    about: "Klassinen Madcow 5×5: intermediate-tason lineaarinen progressio (Bill Starr 1976 -pohja, anonyymin Madcow2-mukautus ~2001). HLM-pattern: Ma raskas 5×5 ramp → top, Ke kevyt 4×5, Pe raskas 4×5 ramp + 1×3 @ +2.5% Ma-topista + 1×8 @ ~77.5% Ma-topista. Vk1 = 92.5% nykyisestä 5RM:stä, +2.5%/vk → vk4 = 100%, vk5 = PR-yritys. PROSENTTIPOHJAINEN, EI absoluuttiset +2.5/+5 lb (= StrongLifts/SS). RISTIINTARKISTETTU yhteisön mukautus, EI-TUTKIMUSPOHJAINEN. Advanced (15+v) → harkitse 1.0-1.5%/vk redukointia." },
  // v4.49.0 (Track B Vaihe 2D-γ): 6 edistynyttä metodologiaa
  { id: "westsideConjugate", label: "Westside Conjugate",           icon: "🔀", desc: "4×/vk — ME-Lower/ME-Upper/DE-Lower/DE-Upper, viikoittainen rotaatio", weeks: 4, factory: "createWestsideConjugateMesocycle",
    about: "Louie Simmonsin klassinen Conjugate-metodi: 4 päivää/vk, jakautuu Max Effort (ME) + Dynamic Effort (DE) -päiviksi. ME-päivinä työnnetään 1RM single ≥90% (3RM Good Morning-varianteille); ME-liikkeet rotatoituvat viikoittain advanced-tasolla. DE-päivinä speed work: DE-Lower 10×2 @ 50/55/60% (3-vk aalto), DE-Upper 9×3 @ 50-60% kaikki 3 viikkoa, 3 tartuntaa × 3 sarjaa. Lähde: Simmons 2007 + WSBB-blogit. HUOM: alunperin equipped-PL → tämä on WESTSIDE-DERIVED kun ME-Upper-rotaatio sisältää weighted dip/leuka raw-substituuttina." },
  { id: "gzclJT20",          label: "GZCL Jacked & Tan 2.0",       icon: "📊", desc: "4×/vk — 12 vk, T1/T2/T3 tier-rakenne, RM-targetit", weeks: 12, factory: "createGZCLMesocycle",
    about: "Cody Lefeverin Jacked & Tan 2.0 (2016): 12 vk = 2× 6vk blokkia, 4 päivää/vk. T1 (pääliike, >85% 1RM, viikoittainen RM-target 10→8→6→4→2→1, LSAMRAP-cap 10), T2 (variantti, 65-85%, 3×8 @ drop-pct 67.5→78.5% TM), T3 (apuliike, <65%, 3×15+). Training Max = ~90% 1RM ≈ 2RM. AMRAP-konversio Epley-kaavalla (yhteensopiva Wendler-ekosysteemin kanssa). EMPIRINEN-blogi (Lefever 2012/2016 kokoteksti luettu)." },
  { id: "sheikoDerived",     label: "Sheiko #29 (johdettu)",       icon: "🇷🇺", desc: "3×/vk — Sheiko #29 prep + streetlifting-laajennus", weeks: 4, factory: "createSheikoDerivedMesocycle",
    about: "Boris Sheiko #29 Preparatory Block 4 vk: 3 päivää/vk, squat 2×, bench 3×, DL 1×. Pyramidi-pohjaiset %1RM-taulukot, max-intensiteetti vk1 75%, vk3 85%. Lähde: foorumi-spreadsheet kolmannen osapuolen kopiosta — Sheikon 2018 kirjaa EI luettu. **SHEIKO-DERIVED** -leima: leuka + dippi lisätty 5×5 additional exerciseinä ilman %-skeemaa (Sheiko ei kanonisoi näitä). EMPIRINEN-yhteisökopio + lopputuotos on 'Sheiko-inspired hybrid', ei kanoninen Sheiko." },
  { id: "minimalistRP",      label: "Minimalist RP (Israetel)",    icon: "📐", desc: "3×/vk — RP volume landmarks, MEV → MAV sets-progressio", weeks: 4, factory: "createMinimalistRPMesocycle",
    about: "Mike Israetelin RP-volyymimallit (rpstrength.com 2017+): MV/MEV/MAV/MRV per lihasryhmä. Tämä mesosykli soveltaa MEV → MAV -sarjaprogressiota (vk1: 2 sets, vk2: 3 sets, vk3: 4 sets, vk4: deload 1 set). 3 päivää/vk push/pull/legs -jaolla. Sarjan määritelmä: 30-85% 1RM, 5-30 reps, RIR 0-4. DOKUMENTOITU RP-blogi (EI peer-reviewed). 'Effective reps' on Beardsleyn (~2017), EI Israetelin. Streetlifting-vinkki: käytä apuliikkeisiin, ei pääliikkeen 1RM-progressioon." },
  { id: "smolovJr",          label: "Smolov Jr",                   icon: "💀", desc: "4×/vk — 3 vk + 1RM-testi, yhden liikkeen intensiivinen blokki", weeks: 4, factory: "createSmolovJrMesocycle",
    about: "Smolov Jr (lyhyt versio): 3 vk + 1 lepoviikko/1RM-testi. Day 1 6×6@70%, Day 2 7×5@75%, Day 3 8×4@80%, Day 4 10×3@85%. Kuormalisäys vk2 +2.5%/päivä, vk3 +5%/päivä. **PAKOLLISIA EHTOJA:** training max ≤90% todellisesta 1RM:stä, max 1 sykli ilman lepoviikkoa, vain yksi liike kerrallaan (leuka TAI dippi, ei molemmat). Täys-Smolov 13 vk on KONTRAINDIKOITU advanced streetlifting-lifterille (jännerakenne-riski 4×/vk -frekvenssillä). DOKUMENTOITU yhteisö." },
  { id: "coanPhillipi",      label: "Coan-Phillipi (DL)",          icon: "🎖️", desc: "1×/vk — 10 vk + meet vk11, deadlift-spesialisaatio", weeks: 11, factory: "createCoanPhillipiMesocycle",
    about: "Mark Phillipi -alkuperäinen Ed Coan -inspiroitu DL-peakaus: 10 vk + meet vk 11 (EI 12 vk). 1× DL/vk, lineaarinen %-progressio 'Desired 1RM' (current + 9-18 kg) -pohjalta. Heavy-set + speed-set (60-75%) + circuit-/päivän-spesifi assistance. Vk1 75%×2 → vk10 100%×1 → vk11 MEET. Assistance vaihtelee: vk1-4 circuit (stiff-leg DL, BB row, lat PD, GM), vk5+ power shrugs + reduced assistance. Lähde: Mark Phillipi -essee (powerpage.net, URL kuollut), mirrorit yksimielisiä. Streetlifting-mukautus = COAN-PHILLIPI-DERIVED — speed-volyymi pienennettävä 30-40% lisäpaino-leukailussa." },
];

// ── Hypertrofiajakso (4 viikkoa, 3×/vk) ──
// Tavoite: Lihasmassan kasvu leuanveto-spesifisessä lihaksistossa
// Korkea volyymi, kohtuullinen intensiteetti, V2-V3
function createHypertrofiaMesocycle(startDateISO) {
  return {
    mesocycleId: uid(),
    type: "hypertrofia",
    startDateISO: startDateISO || todayISO(),
    weekCount: 4,
    weekDefs: [
      { week: 1, deltaPctBase: -0.10, label: "Volyymipohja",  heavyReps: 6, heavyTargetVx: 3 },
      { week: 2, deltaPctBase: -0.05, label: "Volyymilataus",  heavyReps: 6, heavyTargetVx: 2 },
      { week: 3, deltaPctBase: 0,     label: "Volyymipeak",    heavyReps: 8, heavyTargetVx: 2 },
      { week: 4, deltaPctBase: -0.25, label: "Deload",         heavyReps: 6, heavyTargetVx: 4 },
    ],
    weekPlans: [
      // ── VIIKKO 1: VOLYYMIPOHJA ──
      {
        week: 1,
        days: [
          {
            dayOfWeek: 1, dayType: "volume", label: "Perusvoima A",
            slots: [
              { role: "primary", category: "vertikaaliveto", defaultMovementName: "Lisäpainoleuanveto", sets: 4, reps: 6, targetVx: 3 },
              { role: "backoff", category: "vertikaaliveto", defaultMovementName: "Lisäpainoleuanveto", sets: 3, reps: 8, targetVx: 3 },
              { role: "accessory", category: "horisontaaliveto", defaultMovementName: "Penkkiveto", sets: 4, reps: 8, targetVx: 3 },
              { role: "accessory", category: "hauisfleksio", defaultMovementName: "Hauiskääntö tanko", sets: 3, reps: 10, targetVx: null },
              { role: "accessory", category: "core", defaultMovementName: "Hanging leg raise", sets: 3, reps: 12, targetVx: null },
            ],
          },
          {
            dayOfWeek: 3, dayType: "volume", label: "Perusvoima B",
            slots: [
              { role: "primary", category: "vertikaaliveto", defaultMovementName: "Lisäpainoleuanveto", sets: 4, reps: 8, targetVx: 3 },
              { role: "accessory", category: "vertikaaliveto", defaultMovementName: "Ylätalja", sets: 4, reps: 10, targetVx: 3 },
              { role: "accessory", category: "horisontaalityöntö", defaultMovementName: "Penkkipunnerrus", sets: 3, reps: 8, targetVx: 3 },
              { role: "accessory", category: "vertikaalityöntö", defaultMovementName: "Pystypunnerrus", sets: 3, reps: 10, targetVx: 3 },
              { role: "accessory", category: "ojentajaekstensio", defaultMovementName: "Tricep pushdown", sets: 3, reps: 12, targetVx: null },
            ],
          },
          {
            dayOfWeek: 5, dayType: "volume", label: "Perusvoima C",
            slots: [
              { role: "primary", category: "vertikaaliveto", defaultMovementName: "Lisäpainoleuanveto", sets: 5, reps: 6, targetVx: 3 },
              { role: "accessory", category: "horisontaaliveto", defaultMovementName: "Alatalja", sets: 4, reps: 10, targetVx: 3 },
              { role: "accessory", category: "hauisfleksio", defaultMovementName: "Hammer curl", sets: 3, reps: 10, targetVx: null },
              { role: "accessory", category: "core", defaultMovementName: "Cable crunch", sets: 3, reps: 15, targetVx: null },
            ],
          },
        ],
      },
      // ── VIIKKO 2: VOLYYMILATAUS ──
      {
        week: 2,
        days: [
          {
            dayOfWeek: 1, dayType: "volume", label: "Perusvoima A",
            slots: [
              { role: "primary", category: "vertikaaliveto", defaultMovementName: "Lisäpainoleuanveto", sets: 4, reps: 6, targetVx: 2 },
              { role: "backoff", category: "vertikaaliveto", defaultMovementName: "Lisäpainoleuanveto", sets: 3, reps: 8, targetVx: 3 },
              { role: "accessory", category: "horisontaaliveto", defaultMovementName: "Penkkiveto", sets: 4, reps: 8, targetVx: 2 },
              { role: "accessory", category: "hauisfleksio", defaultMovementName: "Hauiskääntö tanko", sets: 3, reps: 10, targetVx: null },
              { role: "accessory", category: "core", defaultMovementName: "Hanging leg raise", sets: 3, reps: 12, targetVx: null },
            ],
          },
          {
            dayOfWeek: 3, dayType: "volume", label: "Perusvoima B",
            slots: [
              { role: "primary", category: "vertikaaliveto", defaultMovementName: "Lisäpainoleuanveto", sets: 4, reps: 8, targetVx: 2 },
              { role: "accessory", category: "vertikaaliveto", defaultMovementName: "Ylätalja", sets: 4, reps: 10, targetVx: 2 },
              { role: "accessory", category: "horisontaalityöntö", defaultMovementName: "Penkkipunnerrus", sets: 3, reps: 8, targetVx: 2 },
              { role: "accessory", category: "vertikaalityöntö", defaultMovementName: "Pystypunnerrus", sets: 3, reps: 10, targetVx: 2 },
              { role: "accessory", category: "ojentajaekstensio", defaultMovementName: "Tricep pushdown", sets: 3, reps: 12, targetVx: null },
            ],
          },
          {
            dayOfWeek: 5, dayType: "volume", label: "Perusvoima C",
            slots: [
              { role: "primary", category: "vertikaaliveto", defaultMovementName: "Lisäpainoleuanveto", sets: 5, reps: 6, targetVx: 2 },
              { role: "accessory", category: "horisontaaliveto", defaultMovementName: "Alatalja", sets: 4, reps: 10, targetVx: 2 },
              { role: "accessory", category: "hauisfleksio", defaultMovementName: "Hammer curl", sets: 3, reps: 10, targetVx: null },
              { role: "accessory", category: "core", defaultMovementName: "Cable crunch", sets: 3, reps: 15, targetVx: null },
            ],
          },
        ],
      },
      // ── VIIKKO 3: VOLYYMIPEAK ──
      {
        week: 3,
        days: [
          {
            dayOfWeek: 1, dayType: "volume", label: "Perusvoima A (peak)",
            slots: [
              { role: "primary", category: "vertikaaliveto", defaultMovementName: "Lisäpainoleuanveto", sets: 5, reps: 8, targetVx: 2 },
              { role: "backoff", category: "vertikaaliveto", defaultMovementName: "Lisäpainoleuanveto", sets: 3, reps: 10, targetVx: 3 },
              { role: "accessory", category: "horisontaaliveto", defaultMovementName: "Penkkiveto", sets: 4, reps: 8, targetVx: 2 },
              { role: "accessory", category: "hauisfleksio", defaultMovementName: "Hauiskääntö tanko", sets: 4, reps: 10, targetVx: null },
              { role: "accessory", category: "core", defaultMovementName: "Hanging leg raise", sets: 3, reps: 12, targetVx: null },
            ],
          },
          {
            dayOfWeek: 3, dayType: "volume", label: "Perusvoima B (peak)",
            slots: [
              { role: "primary", category: "vertikaaliveto", defaultMovementName: "Lisäpainoleuanveto", sets: 5, reps: 8, targetVx: 2 },
              { role: "accessory", category: "vertikaaliveto", defaultMovementName: "Ylätalja", sets: 4, reps: 10, targetVx: 2 },
              { role: "accessory", category: "horisontaalityöntö", defaultMovementName: "Penkkipunnerrus", sets: 4, reps: 8, targetVx: 2 },
              { role: "accessory", category: "vertikaalityöntö", defaultMovementName: "Pystypunnerrus", sets: 3, reps: 10, targetVx: 2 },
              { role: "accessory", category: "ojentajaekstensio", defaultMovementName: "Tricep pushdown", sets: 3, reps: 12, targetVx: null },
            ],
          },
          {
            dayOfWeek: 5, dayType: "volume", label: "Perusvoima C (peak)",
            slots: [
              { role: "primary", category: "vertikaaliveto", defaultMovementName: "Lisäpainoleuanveto", sets: 5, reps: 8, targetVx: 2 },
              { role: "accessory", category: "horisontaaliveto", defaultMovementName: "Alatalja", sets: 4, reps: 10, targetVx: 2 },
              { role: "accessory", category: "hauisfleksio", defaultMovementName: "Hammer curl", sets: 4, reps: 10, targetVx: null },
              { role: "accessory", category: "core", defaultMovementName: "Cable crunch", sets: 3, reps: 15, targetVx: null },
            ],
          },
        ],
      },
      // ── VIIKKO 4: DELOAD ──
      {
        week: 4,
        days: [
          {
            dayOfWeek: 1, dayType: "volume", label: "Perusvoima (kevyt)",
            slots: [
              { role: "primary", category: "vertikaaliveto", defaultMovementName: "Lisäpainoleuanveto", sets: 3, reps: 6, targetVx: 4 },
              { role: "accessory", category: "horisontaaliveto", defaultMovementName: "Penkkiveto", sets: 3, reps: 8, targetVx: 4 },
              { role: "accessory", category: "hauisfleksio", defaultMovementName: "Hauiskääntö tanko", sets: 2, reps: 10, targetVx: null },
            ],
          },
          {
            dayOfWeek: 3, dayType: "volume", label: "Perusvoima (kevyt)",
            slots: [
              { role: "primary", category: "vertikaaliveto", defaultMovementName: "Lisäpainoleuanveto", sets: 3, reps: 8, targetVx: 4 },
              { role: "accessory", category: "vertikaaliveto", defaultMovementName: "Ylätalja", sets: 3, reps: 8, targetVx: 4 },
            ],
          },
        ],
      },
    ],
    postCycleAnalysis: null,
  };
}

// ── Maksimivoima-blokki (4 viikkoa, 3×/vk) ──
// Tavoite: Hermostollinen adaptaatio, suurin kuorma, 1-3 toistoa
// 2× heavy + 1× speed, vähemmän tukiliikkeitä
function createMaksimivoimaMesocycle(startDateISO) {
  return {
    mesocycleId: uid(),
    type: "maksimivoima",
    startDateISO: startDateISO || todayISO(),
    weekCount: 4,
    weekDefs: [
      { week: 1, deltaPctBase: 0.01, label: "Pohja",     heavyReps: 3, heavyTargetVx: 2 },
      { week: 2, deltaPctBase: 0.03, label: "Lataus",    heavyReps: 2, heavyTargetVx: 1 },
      { week: 3, deltaPctBase: 0.05, label: "Peak",      heavyReps: 1, heavyTargetVx: 1 },
      { week: 4, deltaPctBase: -0.20, label: "Deload",   heavyReps: 3, heavyTargetVx: 4 },
    ],
    weekPlans: [
      {
        week: 1,
        days: [
          {
            dayOfWeek: 1, dayType: "heavy", label: "Maksimivoima A",
            slots: [
              { role: "primary", category: "vertikaaliveto", defaultMovementName: "Lisäpainoleuanveto", sets: 6, reps: 3, targetVx: 2 },
              { role: "backoff", category: "vertikaaliveto", defaultMovementName: "Lisäpainoleuanveto", sets: 3, reps: 4, targetVx: 3 },
              { role: "accessory", category: "horisontaaliveto", defaultMovementName: "Penkkiveto", sets: 3, reps: 5, targetVx: 2 },
              { role: "accessory", category: "hauisfleksio", defaultMovementName: "Hauiskääntö tanko", sets: 3, reps: 8, targetVx: null },
            ],
          },
          {
            dayOfWeek: 3, dayType: "speed", label: "Nopeusvoima",
            slots: [
              { role: "primary", category: "vertikaaliveto", defaultMovementName: "Lisäpainoleuanveto", sets: 6, reps: 2, targetVx: 4 },
              { role: "accessory", category: "horisontaaliveto", defaultMovementName: "Alatalja", sets: 3, reps: 10, targetVx: null },
              { role: "accessory", category: "core", defaultMovementName: "Hanging leg raise", sets: 3, reps: 10, targetVx: null },
            ],
          },
          {
            dayOfWeek: 5, dayType: "heavy", label: "Maksimivoima B",
            slots: [
              { role: "primary", category: "vertikaaliveto", defaultMovementName: "Lisäpainoleuanveto", sets: 5, reps: 2, targetVx: 2 },
              { role: "backoff", category: "vertikaaliveto", defaultMovementName: "Lisäpainoleuanveto", sets: 3, reps: 5, targetVx: 3 },
              { role: "accessory", category: "horisontaalityöntö", defaultMovementName: "Penkkipunnerrus", sets: 3, reps: 6, targetVx: 2 },
            ],
          },
        ],
      },
      {
        week: 2,
        days: [
          {
            dayOfWeek: 1, dayType: "heavy", label: "Maksimivoima A",
            slots: [
              { role: "primary", category: "vertikaaliveto", defaultMovementName: "Lisäpainoleuanveto", sets: 6, reps: 2, targetVx: 1 },
              { role: "backoff", category: "vertikaaliveto", defaultMovementName: "Lisäpainoleuanveto", sets: 3, reps: 4, targetVx: 2 },
              { role: "accessory", category: "horisontaaliveto", defaultMovementName: "Penkkiveto", sets: 3, reps: 5, targetVx: 2 },
              { role: "accessory", category: "hauisfleksio", defaultMovementName: "Hauiskääntö tanko", sets: 3, reps: 8, targetVx: null },
            ],
          },
          {
            dayOfWeek: 3, dayType: "speed", label: "Nopeusvoima",
            slots: [
              { role: "primary", category: "vertikaaliveto", defaultMovementName: "Lisäpainoleuanveto", sets: 5, reps: 2, targetVx: 4 },
              { role: "accessory", category: "horisontaaliveto", defaultMovementName: "Alatalja", sets: 3, reps: 10, targetVx: null },
              { role: "accessory", category: "core", defaultMovementName: "Hanging leg raise", sets: 3, reps: 10, targetVx: null },
            ],
          },
          {
            dayOfWeek: 5, dayType: "heavy", label: "Maksimivoima B",
            slots: [
              { role: "primary", category: "vertikaaliveto", defaultMovementName: "Lisäpainoleuanveto", sets: 5, reps: 2, targetVx: 1 },
              { role: "backoff", category: "vertikaaliveto", defaultMovementName: "Lisäpainoleuanveto", sets: 2, reps: 4, targetVx: 2 },
              { role: "accessory", category: "horisontaalityöntö", defaultMovementName: "Penkkipunnerrus", sets: 3, reps: 6, targetVx: 2 },
            ],
          },
        ],
      },
      {
        week: 3,
        days: [
          {
            dayOfWeek: 1, dayType: "heavy", label: "Maksimivoima A (peak)",
            slots: [
              { role: "primary", category: "vertikaaliveto", defaultMovementName: "Lisäpainoleuanveto", sets: 5, reps: 1, targetVx: 1 },
              { role: "backoff", category: "vertikaaliveto", defaultMovementName: "Lisäpainoleuanveto", sets: 3, reps: 3, targetVx: 2 },
              { role: "accessory", category: "horisontaaliveto", defaultMovementName: "Penkkiveto", sets: 3, reps: 5, targetVx: 2 },
            ],
          },
          {
            dayOfWeek: 3, dayType: "speed", label: "Nopeusvoima",
            slots: [
              { role: "primary", category: "vertikaaliveto", defaultMovementName: "Lisäpainoleuanveto", sets: 5, reps: 2, targetVx: 4 },
              { role: "accessory", category: "horisontaaliveto", defaultMovementName: "Alatalja", sets: 3, reps: 8, targetVx: null },
            ],
          },
          {
            dayOfWeek: 5, dayType: "heavy", label: "Maksimivoima B (peak)",
            slots: [
              { role: "primary", category: "vertikaaliveto", defaultMovementName: "Lisäpainoleuanveto", sets: 4, reps: 1, targetVx: 1 },
              { role: "backoff", category: "vertikaaliveto", defaultMovementName: "Lisäpainoleuanveto", sets: 2, reps: 3, targetVx: 2 },
              { role: "accessory", category: "horisontaalityöntö", defaultMovementName: "Penkkipunnerrus", sets: 3, reps: 5, targetVx: 2 },
            ],
          },
        ],
      },
      {
        week: 4,
        days: [
          {
            dayOfWeek: 1, dayType: "heavy", label: "Maksimivoima (kevyt)",
            slots: [
              { role: "primary", category: "vertikaaliveto", defaultMovementName: "Lisäpainoleuanveto", sets: 3, reps: 3, targetVx: 4 },
              { role: "accessory", category: "horisontaaliveto", defaultMovementName: "Penkkiveto", sets: 3, reps: 6, targetVx: 4 },
            ],
          },
          {
            dayOfWeek: 4, dayType: "volume", label: "Perusvoima (kevyt)",
            slots: [
              { role: "primary", category: "vertikaaliveto", defaultMovementName: "Lisäpainoleuanveto", sets: 3, reps: 5, targetVx: 4 },
              { role: "accessory", category: "hauisfleksio", defaultMovementName: "Hauiskääntö tanko", sets: 2, reps: 10, targetVx: null },
            ],
          },
        ],
      },
    ],
    postCycleAnalysis: null,
  };
}

// ── v4.44.0 (Track B Vaihe 2C-β2): Intensifikaatio-blokki ─────────────
// Issurin 2010 block-mallin INTENSIFICATION-blokki: matala volyymi, korkea
// intensiteetti, kapeasti rajattu accessory-työ. KÄYTÄNNÖSSÄ ERILAINEN kuin
// createMaksimivoimaMesocycle (joka on "perinteinen voima") — intensifikaatio
// VÄHENTÄÄ kokonaisvolyymiä Issurinin block-mallin mukaisesti.
//
// Tutkimuspohja: Issurin 2010 Sports Med 40(3):189-206 (PDF-VERIFIOITU 2B-α).
// Säännöt:
//   - Primary: 4-5 sarjaa × 1-3 toistoa, V1-V2 (~85-92% 1RM)
//   - EI backoff-sarjoja (yhden primary-tyypin sessio)
//   - Maks. 1-2 accessory per päivä, 2-3 sarjaa kpl
//   - Volyymi laskee vk 1→3 (4×3 → 5×2 → 5×1), deload vk 4
//   - Accessory: vain spesifikaatio-tukea, EI hypertrofia-volyymia
function createIntensifikaatioMesocycle(startDateISO) {
  return {
    mesocycleId: uid(),
    type: "intensifikaatio",
    startDateISO: startDateISO || todayISO(),
    weekCount: 4,
    weekDefs: [
      { week: 1, deltaPctBase: 0.02, label: "Intensification I",  heavyReps: 3, heavyTargetVx: 2 },
      { week: 2, deltaPctBase: 0.04, label: "Intensification II", heavyReps: 2, heavyTargetVx: 1 },
      { week: 3, deltaPctBase: 0.06, label: "Intensification III",heavyReps: 1, heavyTargetVx: 1 },
      { week: 4, deltaPctBase: -0.25, label: "Deload",            heavyReps: 3, heavyTargetVx: 4 },
    ],
    weekPlans: [
      {
        week: 1,
        days: [
          {
            dayOfWeek: 1, dayType: "heavy", label: "Intensifikaatio A",
            slots: [
              { role: "primary",   category: "vertikaaliveto",     defaultMovementName: "Lisäpainoleuanveto", sets: 4, reps: 3, targetVx: 2 },
              { role: "accessory", category: "horisontaaliveto",   defaultMovementName: "Penkkiveto",         sets: 2, reps: 5, targetVx: 2 },
            ],
          },
          {
            dayOfWeek: 3, dayType: "heavy", label: "Intensifikaatio B",
            slots: [
              { role: "primary",   category: "vertikaaliveto",     defaultMovementName: "Lisäpainoleuanveto", sets: 4, reps: 3, targetVx: 2 },
              { role: "accessory", category: "hauisfleksio",        defaultMovementName: "Hauiskääntö tanko",  sets: 2, reps: 6, targetVx: 3 },
            ],
          },
          {
            dayOfWeek: 5, dayType: "speed", label: "Nopeusvoima",
            slots: [
              { role: "primary",   category: "vertikaaliveto",     defaultMovementName: "Lisäpainoleuanveto", sets: 5, reps: 2, targetVx: 4 },
              { role: "accessory", category: "core",                defaultMovementName: "Hanging leg raise",  sets: 2, reps: 8, targetVx: null },
            ],
          },
        ],
      },
      {
        week: 2,
        days: [
          {
            dayOfWeek: 1, dayType: "heavy", label: "Intensifikaatio A",
            slots: [
              { role: "primary",   category: "vertikaaliveto",     defaultMovementName: "Lisäpainoleuanveto", sets: 5, reps: 2, targetVx: 1 },
              { role: "accessory", category: "horisontaaliveto",   defaultMovementName: "Penkkiveto",         sets: 2, reps: 5, targetVx: 2 },
            ],
          },
          {
            dayOfWeek: 3, dayType: "heavy", label: "Intensifikaatio B",
            slots: [
              { role: "primary",   category: "vertikaaliveto",     defaultMovementName: "Lisäpainoleuanveto", sets: 5, reps: 2, targetVx: 1 },
              { role: "accessory", category: "hauisfleksio",        defaultMovementName: "Hauiskääntö tanko",  sets: 2, reps: 6, targetVx: 3 },
            ],
          },
          {
            dayOfWeek: 5, dayType: "speed", label: "Nopeusvoima",
            slots: [
              { role: "primary",   category: "vertikaaliveto",     defaultMovementName: "Lisäpainoleuanveto", sets: 5, reps: 2, targetVx: 4 },
            ],
          },
        ],
      },
      {
        week: 3,
        days: [
          {
            dayOfWeek: 1, dayType: "heavy", label: "Intensifikaatio A (peak)",
            slots: [
              { role: "primary",   category: "vertikaaliveto",     defaultMovementName: "Lisäpainoleuanveto", sets: 5, reps: 1, targetVx: 1 },
              { role: "accessory", category: "horisontaaliveto",   defaultMovementName: "Penkkiveto",         sets: 2, reps: 5, targetVx: 3 },
            ],
          },
          {
            dayOfWeek: 3, dayType: "heavy", label: "Intensifikaatio B (peak)",
            slots: [
              { role: "primary",   category: "vertikaaliveto",     defaultMovementName: "Lisäpainoleuanveto", sets: 4, reps: 1, targetVx: 1 },
            ],
          },
          {
            dayOfWeek: 5, dayType: "speed", label: "Nopeusvoima",
            slots: [
              { role: "primary",   category: "vertikaaliveto",     defaultMovementName: "Lisäpainoleuanveto", sets: 4, reps: 2, targetVx: 4 },
            ],
          },
        ],
      },
      {
        week: 4,
        days: [
          {
            dayOfWeek: 1, dayType: "heavy", label: "Deload",
            slots: [
              { role: "primary",   category: "vertikaaliveto",     defaultMovementName: "Lisäpainoleuanveto", sets: 3, reps: 3, targetVx: 4 },
            ],
          },
          {
            dayOfWeek: 4, dayType: "speed", label: "Deload (kevyt)",
            slots: [
              { role: "primary",   category: "vertikaaliveto",     defaultMovementName: "Lisäpainoleuanveto", sets: 2, reps: 3, targetVx: 4 },
            ],
          },
        ],
      },
    ],
    postCycleAnalysis: null,
  };
}

// ── v4.44.0 (Track B Vaihe 2C-β2): Multi-block-peaking-skeleton (2 vk) ──
// 2-viikon peaking-osio jota multi-block-mesocycle käyttää viimeisinä viikkoina.
// EI competition-day-attempts-rakennetta (joka vaatisi e1RM-erityissyötteen) —
// tämä on TAPER + REALIZATION joka päättyy kisaviikkoon ilman attempt-laskentaa.
//
// Tutkimuspohja: Issurin 2010 realization-block + Helms 2014 peaking-protokollat.
// Sääntö:
//   - Vk 1 (TAPER): volyymi -50% strength-blokista, intensiteetti V2, 1 accessory
//   - Vk 2 (KILPAVIIKKO): volyymi -70%, kevyet aktivointi-päivät, EI accessory:tä
function createMultiBlockPeakingSkeleton(startDateISO) {
  return {
    mesocycleId: uid(),
    type: "peaking-mb",
    startDateISO: startDateISO || todayISO(),
    weekCount: 2,
    weekDefs: [
      { week: 1, deltaPctBase: 0.03, label: "Taper",     heavyReps: 2, heavyTargetVx: 2 },
      { week: 2, deltaPctBase: 0.00, label: "Kisaviikko", heavyReps: 1, heavyTargetVx: 1 },
    ],
    weekPlans: [
      {
        week: 1,
        days: [
          {
            dayOfWeek: 1, dayType: "heavy", label: "Taper (kova)",
            slots: [
              { role: "primary", category: "vertikaaliveto", defaultMovementName: "Lisäpainoleuanveto", sets: 3, reps: 2, targetVx: 2 },
              { role: "accessory", category: "horisontaaliveto", defaultMovementName: "Penkkiveto", sets: 2, reps: 5, targetVx: 3 },
            ],
          },
          {
            dayOfWeek: 3, dayType: "speed", label: "Taper (nopeus)",
            slots: [
              { role: "primary", category: "vertikaaliveto", defaultMovementName: "Lisäpainoleuanveto", sets: 3, reps: 2, targetVx: 4 },
            ],
          },
        ],
      },
      {
        week: 2,
        days: [
          {
            dayOfWeek: 1, dayType: "heavy", label: "Kisaviikko (aktivointi)",
            slots: [
              { role: "primary", category: "vertikaaliveto", defaultMovementName: "Lisäpainoleuanveto", sets: 2, reps: 2, targetVx: 1 },
            ],
          },
          {
            dayOfWeek: 4, dayType: "speed", label: "Kisaviikko (kevyt)",
            slots: [
              { role: "primary", category: "vertikaaliveto", defaultMovementName: "Lisäpainoleuanveto", sets: 1, reps: 2, targetVx: 4 },
            ],
          },
        ],
      },
    ],
    postCycleAnalysis: null,
  };
}

// ── Eksentrinen blokki (4 viikkoa, 2×/vk) ──
// Tavoite: Supramaksimaalinen eksentrinen kuorma + isometria
// Korokeveto (eksentrisesti) + ylipito, harvempi frekvenssi
function createEksenterinenMesocycle(startDateISO) {
  return {
    mesocycleId: uid(),
    type: "eksentrinen",
    startDateISO: startDateISO || todayISO(),
    weekCount: 4,
    weekDefs: [
      { week: 1, deltaPctBase: 0,     label: "Totuttelu",   heavyReps: 3, heavyTargetVx: 2 },
      { week: 2, deltaPctBase: 0.03,  label: "Lataus",      heavyReps: 2, heavyTargetVx: 1 },
      { week: 3, deltaPctBase: 0.05,  label: "Overload",    heavyReps: 2, heavyTargetVx: 1 },
      { week: 4, deltaPctBase: -0.20, label: "Deload",      heavyReps: 3, heavyTargetVx: 4 },
    ],
    weekPlans: [
      {
        week: 1,
        days: [
          {
            dayOfWeek: 1, dayType: "heavy", label: "Eksentrinen A",
            slots: [
              { role: "primary", category: "vertikaaliveto", defaultMovementName: "Lisäpainoleuanveto", variantName: "Korokeveto", sets: 4, reps: 3, targetVx: 2 },
              { role: "backoff", category: "vertikaaliveto", defaultMovementName: "Lisäpainoleuanveto", variantName: "Kilpaveto (leveä vastaote)", sets: 3, reps: 5, targetVx: 3 },
              { role: "accessory", category: "horisontaaliveto", defaultMovementName: "Penkkiveto", sets: 3, reps: 6, targetVx: 3 },
              { role: "accessory", category: "hauisfleksio", defaultMovementName: "Hauiskääntö tanko", sets: 3, reps: 10, targetVx: null },
            ],
          },
          {
            dayOfWeek: 4, dayType: "volume", label: "Isometria + volyymi",
            slots: [
              { role: "primary", category: "vertikaaliveto", defaultMovementName: "Lisäpainoleuanveto", variantName: "2s ylipito", sets: 4, reps: 4, targetVx: 2 },
              { role: "accessory", category: "vertikaaliveto", defaultMovementName: "Ylätalja", sets: 4, reps: 8, targetVx: 3 },
              { role: "accessory", category: "vertikaalityöntö", defaultMovementName: "Pystypunnerrus", sets: 3, reps: 8, targetVx: 3 },
              { role: "accessory", category: "core", defaultMovementName: "Hanging leg raise", sets: 3, reps: 10, targetVx: null },
            ],
          },
        ],
      },
      {
        week: 2,
        days: [
          {
            dayOfWeek: 1, dayType: "heavy", label: "Eksentrinen A",
            slots: [
              { role: "primary", category: "vertikaaliveto", defaultMovementName: "Lisäpainoleuanveto", variantName: "Korokeveto", sets: 5, reps: 2, targetVx: 1 },
              { role: "backoff", category: "vertikaaliveto", defaultMovementName: "Lisäpainoleuanveto", variantName: "Kilpaveto (leveä vastaote)", sets: 3, reps: 4, targetVx: 2 },
              { role: "accessory", category: "horisontaaliveto", defaultMovementName: "Penkkiveto", sets: 3, reps: 6, targetVx: 2 },
              { role: "accessory", category: "hauisfleksio", defaultMovementName: "Hauiskääntö tanko", sets: 3, reps: 8, targetVx: null },
            ],
          },
          {
            dayOfWeek: 4, dayType: "volume", label: "Isometria + volyymi",
            slots: [
              { role: "primary", category: "vertikaaliveto", defaultMovementName: "Lisäpainoleuanveto", variantName: "2s ylipito", sets: 4, reps: 3, targetVx: 2 },
              { role: "accessory", category: "vertikaaliveto", defaultMovementName: "Ylätalja", sets: 4, reps: 8, targetVx: 2 },
              { role: "accessory", category: "vertikaalityöntö", defaultMovementName: "Pystypunnerrus", sets: 3, reps: 8, targetVx: 2 },
              { role: "accessory", category: "core", defaultMovementName: "Hanging leg raise", sets: 3, reps: 10, targetVx: null },
            ],
          },
        ],
      },
      {
        week: 3,
        days: [
          {
            dayOfWeek: 1, dayType: "heavy", label: "Eksentrinen A (overload)",
            slots: [
              { role: "primary", category: "vertikaaliveto", defaultMovementName: "Lisäpainoleuanveto", variantName: "Korokeveto", sets: 5, reps: 2, targetVx: 1 },
              { role: "backoff", category: "vertikaaliveto", defaultMovementName: "Lisäpainoleuanveto", variantName: "Kilpaveto (leveä vastaote)", sets: 3, reps: 3, targetVx: 2 },
              { role: "accessory", category: "horisontaaliveto", defaultMovementName: "Penkkiveto", sets: 3, reps: 5, targetVx: 2 },
            ],
          },
          {
            dayOfWeek: 4, dayType: "volume", label: "Isometria (overload)",
            slots: [
              { role: "primary", category: "vertikaaliveto", defaultMovementName: "Lisäpainoleuanveto", variantName: "2s ylipito", sets: 5, reps: 3, targetVx: 1 },
              { role: "accessory", category: "vertikaaliveto", defaultMovementName: "Ylätalja", sets: 3, reps: 8, targetVx: 2 },
              { role: "accessory", category: "core", defaultMovementName: "Hanging leg raise", sets: 3, reps: 10, targetVx: null },
            ],
          },
        ],
      },
      {
        week: 4,
        days: [
          {
            dayOfWeek: 1, dayType: "heavy", label: "Kilpaveto (kevyt)",
            slots: [
              { role: "primary", category: "vertikaaliveto", defaultMovementName: "Lisäpainoleuanveto", variantName: "Kilpaveto (leveä vastaote)", sets: 3, reps: 3, targetVx: 4 },
              { role: "accessory", category: "horisontaaliveto", defaultMovementName: "Penkkiveto", sets: 3, reps: 8, targetVx: 4 },
            ],
          },
          {
            dayOfWeek: 4, dayType: "volume", label: "Perusvoima (kevyt)",
            slots: [
              { role: "primary", category: "vertikaaliveto", defaultMovementName: "Lisäpainoleuanveto", variantName: "Kilpaveto (leveä vastaote)", sets: 3, reps: 5, targetVx: 4 },
              { role: "accessory", category: "vertikaaliveto", defaultMovementName: "Ylätalja", sets: 3, reps: 8, targetVx: 4 },
            ],
          },
        ],
      },
    ],
    postCycleAnalysis: null,
  };
}

// ── DUP-jakso (4 viikkoa, 3×/vk) ──
// Daily Undulating Periodization: voima/hypertrofia/nopeus vaihtelee päivittäin
// Sama viikkorakenne kuin default mutta eri painotus: H-V-S aina eri järjestyksessä
function createDUPMesocycle(startDateISO) {
  return {
    mesocycleId: uid(),
    type: "dup",
    startDateISO: startDateISO || todayISO(),
    weekCount: 4,
    weekDefs: [
      { week: 1, deltaPctBase: 0,     label: "Adaptaatio",  heavyReps: 3, heavyTargetVx: 2 },
      { week: 2, deltaPctBase: 0.02,  label: "Loading",     heavyReps: 2, heavyTargetVx: 1 },
      { week: 3, deltaPctBase: 0.04,  label: "Overreach",   heavyReps: 2, heavyTargetVx: 1 },
      { week: 4, deltaPctBase: -0.25, label: "Deload",      heavyReps: 3, heavyTargetVx: 4 },
    ],
    weekPlans: [
      {
        week: 1,
        days: [
          {
            dayOfWeek: 1, dayType: "heavy", label: "Maksimivoima",
            slots: [
              { role: "primary", category: "vertikaaliveto", defaultMovementName: "Lisäpainoleuanveto", sets: 5, reps: 3, targetVx: 2 },
              { role: "backoff", category: "vertikaaliveto", defaultMovementName: "Lisäpainoleuanveto", sets: 3, reps: 5, targetVx: 3 },
              { role: "accessory", category: "horisontaaliveto", defaultMovementName: "Penkkiveto", sets: 3, reps: 6, targetVx: 3 },
              { role: "accessory", category: "hauisfleksio", defaultMovementName: "Hauiskääntö tanko", sets: 3, reps: 8, targetVx: null },
            ],
          },
          {
            dayOfWeek: 3, dayType: "volume", label: "Perusvoima",
            slots: [
              { role: "primary", category: "vertikaaliveto", defaultMovementName: "Lisäpainoleuanveto", sets: 4, reps: 6, targetVx: 3 },
              { role: "accessory", category: "vertikaaliveto", defaultMovementName: "Ylätalja", sets: 4, reps: 10, targetVx: 3 },
              { role: "accessory", category: "horisontaalityöntö", defaultMovementName: "Penkkipunnerrus", sets: 3, reps: 8, targetVx: 3 },
              { role: "accessory", category: "ojentajaekstensio", defaultMovementName: "Tricep pushdown", sets: 3, reps: 12, targetVx: null },
              { role: "accessory", category: "core", defaultMovementName: "Hanging leg raise", sets: 3, reps: 12, targetVx: null },
            ],
          },
          {
            dayOfWeek: 5, dayType: "speed", label: "Nopeusvoima",
            slots: [
              { role: "primary", category: "vertikaaliveto", defaultMovementName: "Lisäpainoleuanveto", sets: 6, reps: 2, targetVx: 4 },
              { role: "accessory", category: "horisontaaliveto", defaultMovementName: "Alatalja", sets: 3, reps: 10, targetVx: null },
              { role: "accessory", category: "hauisfleksio", defaultMovementName: "Hammer curl", sets: 3, reps: 10, targetVx: null },
            ],
          },
        ],
      },
      {
        week: 2,
        days: [
          {
            dayOfWeek: 1, dayType: "speed", label: "Nopeusvoima",
            slots: [
              { role: "primary", category: "vertikaaliveto", defaultMovementName: "Lisäpainoleuanveto", sets: 6, reps: 2, targetVx: 4 },
              { role: "accessory", category: "horisontaaliveto", defaultMovementName: "Penkkiveto", sets: 3, reps: 8, targetVx: null },
              { role: "accessory", category: "hauisfleksio", defaultMovementName: "Hauiskääntö tanko", sets: 3, reps: 10, targetVx: null },
            ],
          },
          {
            dayOfWeek: 3, dayType: "heavy", label: "Maksimivoima",
            slots: [
              { role: "primary", category: "vertikaaliveto", defaultMovementName: "Lisäpainoleuanveto", sets: 5, reps: 2, targetVx: 1 },
              { role: "backoff", category: "vertikaaliveto", defaultMovementName: "Lisäpainoleuanveto", sets: 3, reps: 4, targetVx: 2 },
              { role: "accessory", category: "horisontaalityöntö", defaultMovementName: "Penkkipunnerrus", sets: 3, reps: 6, targetVx: 2 },
              { role: "accessory", category: "core", defaultMovementName: "Hanging leg raise", sets: 3, reps: 10, targetVx: null },
            ],
          },
          {
            dayOfWeek: 5, dayType: "volume", label: "Perusvoima",
            slots: [
              { role: "primary", category: "vertikaaliveto", defaultMovementName: "Lisäpainoleuanveto", sets: 5, reps: 6, targetVx: 2 },
              { role: "accessory", category: "vertikaaliveto", defaultMovementName: "Ylätalja", sets: 4, reps: 8, targetVx: 2 },
              { role: "accessory", category: "vertikaalityöntö", defaultMovementName: "Pystypunnerrus", sets: 3, reps: 8, targetVx: 2 },
              { role: "accessory", category: "ojentajaekstensio", defaultMovementName: "Tricep pushdown", sets: 3, reps: 12, targetVx: null },
            ],
          },
        ],
      },
      {
        week: 3,
        days: [
          {
            dayOfWeek: 1, dayType: "volume", label: "Perusvoima",
            slots: [
              { role: "primary", category: "vertikaaliveto", defaultMovementName: "Lisäpainoleuanveto", sets: 5, reps: 6, targetVx: 2 },
              { role: "backoff", category: "vertikaaliveto", defaultMovementName: "Lisäpainoleuanveto", sets: 3, reps: 8, targetVx: 3 },
              { role: "accessory", category: "horisontaaliveto", defaultMovementName: "Penkkiveto", sets: 4, reps: 8, targetVx: 2 },
              { role: "accessory", category: "hauisfleksio", defaultMovementName: "Hauiskääntö tanko", sets: 3, reps: 10, targetVx: null },
            ],
          },
          {
            dayOfWeek: 3, dayType: "speed", label: "Nopeusvoima",
            slots: [
              { role: "primary", category: "vertikaaliveto", defaultMovementName: "Lisäpainoleuanveto", sets: 5, reps: 2, targetVx: 4 },
              { role: "accessory", category: "horisontaaliveto", defaultMovementName: "Alatalja", sets: 3, reps: 8, targetVx: null },
              { role: "accessory", category: "core", defaultMovementName: "Hanging leg raise", sets: 3, reps: 10, targetVx: null },
            ],
          },
          {
            dayOfWeek: 5, dayType: "heavy", label: "Maksimivoima (peak)",
            slots: [
              { role: "primary", category: "vertikaaliveto", defaultMovementName: "Lisäpainoleuanveto", sets: 5, reps: 2, targetVx: 1 },
              { role: "backoff", category: "vertikaaliveto", defaultMovementName: "Lisäpainoleuanveto", sets: 2, reps: 3, targetVx: 2 },
              { role: "accessory", category: "horisontaalityöntö", defaultMovementName: "Penkkipunnerrus", sets: 3, reps: 5, targetVx: 2 },
            ],
          },
        ],
      },
      {
        week: 4,
        days: [
          {
            dayOfWeek: 1, dayType: "heavy", label: "Maksimivoima (kevyt)",
            slots: [
              { role: "primary", category: "vertikaaliveto", defaultMovementName: "Lisäpainoleuanveto", sets: 3, reps: 3, targetVx: 4 },
              { role: "accessory", category: "horisontaaliveto", defaultMovementName: "Penkkiveto", sets: 3, reps: 8, targetVx: 4 },
            ],
          },
          {
            dayOfWeek: 3, dayType: "volume", label: "Perusvoima (kevyt)",
            slots: [
              { role: "primary", category: "vertikaaliveto", defaultMovementName: "Lisäpainoleuanveto", sets: 3, reps: 5, targetVx: 4 },
              { role: "accessory", category: "vertikaaliveto", defaultMovementName: "Ylätalja", sets: 3, reps: 8, targetVx: 4 },
            ],
          },
        ],
      },
    ],
    postCycleAnalysis: null,
  };
}

// ── Siirtymäjakso / GPP (3 viikkoa, 2-3×/vk) ──
// Tavoite: Yleiskunnon ylläpito, oteharjoittelu, prehab, aktiivinen palautuminen
// Ei raskaita sarjoja, painotus otteessa ja liikkuvuudessa
function createSiirtymaMesocycle(startDateISO) {
  return {
    mesocycleId: uid(),
    type: "siirtyma",
    startDateISO: startDateISO || todayISO(),
    weekCount: 3,
    weekDefs: [
      { week: 1, deltaPctBase: -0.15, label: "GPP pohja",    heavyReps: 5, heavyTargetVx: 3 },
      { week: 2, deltaPctBase: -0.10, label: "GPP lataus",   heavyReps: 5, heavyTargetVx: 3 },
      { week: 3, deltaPctBase: -0.10, label: "GPP huippu",   heavyReps: 5, heavyTargetVx: 3 },
    ],
    weekPlans: [
      {
        week: 1,
        days: [
          {
            dayOfWeek: 1, dayType: "volume", label: "Ote + veto",
            slots: [
              { role: "primary", category: "vertikaaliveto", defaultMovementName: "Lisäpainoleuanveto", variantName: "Neutraaliote", sets: 4, reps: 5, targetVx: 3 },
              { role: "accessory", category: "horisontaaliveto", defaultMovementName: "Penkkiveto", sets: 3, reps: 8, targetVx: 3 },
              { role: "accessory", category: "muu", defaultMovementName: "Dead hang", sets: 3, reps: 1, targetVx: null },
              { role: "accessory", category: "muu", defaultMovementName: "Rannekoukistus", sets: 3, reps: 15, targetVx: null },
            ],
          },
          {
            dayOfWeek: 3, dayType: "volume", label: "Ylävartalo",
            slots: [
              { role: "primary", category: "vertikaaliveto", defaultMovementName: "Lisäpainoleuanveto", variantName: "Myötäoteveto", sets: 4, reps: 6, targetVx: 3 },
              { role: "accessory", category: "vertikaalityöntö", defaultMovementName: "Pystypunnerrus", sets: 3, reps: 10, targetVx: 3 },
              { role: "accessory", category: "horisontaalityöntö", defaultMovementName: "Penkkipunnerrus", sets: 3, reps: 8, targetVx: 3 },
              { role: "accessory", category: "core", defaultMovementName: "Pallof press", sets: 3, reps: 10, targetVx: null },
            ],
          },
          {
            dayOfWeek: 5, dayType: "volume", label: "Tempo + prehab",
            slots: [
              { role: "primary", category: "vertikaaliveto", defaultMovementName: "Lisäpainoleuanveto", variantName: "1.5-toisto hiissaus", sets: 3, reps: 5, targetVx: 3 },
              { role: "accessory", category: "hauisfleksio", defaultMovementName: "Hauiskääntö tanko", sets: 3, reps: 12, targetVx: null },
              { role: "accessory", category: "core", defaultMovementName: "Hanging leg raise", sets: 3, reps: 12, targetVx: null },
            ],
          },
        ],
      },
      {
        week: 2,
        days: [
          {
            dayOfWeek: 1, dayType: "volume", label: "Ote + veto",
            slots: [
              { role: "primary", category: "vertikaaliveto", defaultMovementName: "Lisäpainoleuanveto", variantName: "Neutraaliote", sets: 4, reps: 5, targetVx: 3 },
              { role: "accessory", category: "horisontaaliveto", defaultMovementName: "Penkkiveto", sets: 4, reps: 8, targetVx: 3 },
              { role: "accessory", category: "muu", defaultMovementName: "Dead hang", sets: 3, reps: 1, targetVx: null },
              { role: "accessory", category: "muu", defaultMovementName: "Rannekoukistus", sets: 3, reps: 15, targetVx: null },
            ],
          },
          {
            dayOfWeek: 4, dayType: "volume", label: "Ylävartalo",
            slots: [
              { role: "primary", category: "vertikaaliveto", defaultMovementName: "Lisäpainoleuanveto", variantName: "Myötäoteveto", sets: 4, reps: 6, targetVx: 3 },
              { role: "accessory", category: "vertikaalityöntö", defaultMovementName: "Pystypunnerrus", sets: 3, reps: 10, targetVx: 3 },
              { role: "accessory", category: "horisontaalityöntö", defaultMovementName: "Penkkipunnerrus", sets: 3, reps: 8, targetVx: 3 },
              { role: "accessory", category: "core", defaultMovementName: "Pallof press", sets: 3, reps: 10, targetVx: null },
            ],
          },
        ],
      },
      {
        week: 3,
        days: [
          {
            dayOfWeek: 1, dayType: "volume", label: "Ote + veto",
            slots: [
              { role: "primary", category: "vertikaaliveto", defaultMovementName: "Lisäpainoleuanveto", variantName: "Neutraaliote", sets: 4, reps: 6, targetVx: 3 },
              { role: "accessory", category: "horisontaaliveto", defaultMovementName: "Penkkiveto", sets: 4, reps: 8, targetVx: 3 },
              { role: "accessory", category: "muu", defaultMovementName: "Dead hang", sets: 4, reps: 1, targetVx: null },
              { role: "accessory", category: "muu", defaultMovementName: "Rannekoukistus", sets: 3, reps: 15, targetVx: null },
            ],
          },
          {
            dayOfWeek: 4, dayType: "volume", label: "Ylävartalo + tempo",
            slots: [
              { role: "primary", category: "vertikaaliveto", defaultMovementName: "Lisäpainoleuanveto", variantName: "1.5-toisto hiissaus", sets: 3, reps: 5, targetVx: 3 },
              { role: "accessory", category: "vertikaalityöntö", defaultMovementName: "Pystypunnerrus", sets: 3, reps: 10, targetVx: 3 },
              { role: "accessory", category: "hauisfleksio", defaultMovementName: "Hauiskääntö tanko", sets: 3, reps: 12, targetVx: null },
              { role: "accessory", category: "core", defaultMovementName: "Hanging leg raise", sets: 3, reps: 12, targetVx: null },
            ],
          },
        ],
      },
    ],
    postCycleAnalysis: null,
  };
}

// ── Palautumisjakso (2 viikkoa, 2×/vk) ──
// Tavoite: Aktiivinen palautuminen, superkompensaatio ennen uutta blokkia
// Hyvin matala intensiteetti ja volyymi, ei progressiota
function createPalautuminenMesocycle(startDateISO) {
  return {
    mesocycleId: uid(),
    type: "palautuminen",
    startDateISO: startDateISO || todayISO(),
    weekCount: 2,
    weekDefs: [
      { week: 1, deltaPctBase: -0.25, label: "Aktiivinen lepo",     heavyReps: 5, heavyTargetVx: 4 },
      { week: 2, deltaPctBase: -0.20, label: "Aktivointi",           heavyReps: 4, heavyTargetVx: 4 },
    ],
    weekPlans: [
      {
        week: 1,
        days: [
          {
            dayOfWeek: 1, dayType: "volume", label: "Kevyt ylläpito A",
            slots: [
              { role: "primary", category: "vertikaaliveto", defaultMovementName: "Lisäpainoleuanveto", sets: 3, reps: 5, targetVx: 4 },
              { role: "accessory", category: "horisontaaliveto", defaultMovementName: "Alatalja", sets: 3, reps: 10, targetVx: 4 },
              { role: "accessory", category: "core", defaultMovementName: "Hanging leg raise", sets: 2, reps: 10, targetVx: null },
            ],
          },
          {
            dayOfWeek: 4, dayType: "volume", label: "Kevyt ylläpito B",
            slots: [
              { role: "primary", category: "vertikaaliveto", defaultMovementName: "Lisäpainoleuanveto", sets: 3, reps: 5, targetVx: 4 },
              { role: "accessory", category: "vertikaaliveto", defaultMovementName: "Ylätalja", sets: 3, reps: 8, targetVx: 4 },
              { role: "accessory", category: "hauisfleksio", defaultMovementName: "Hauiskääntö tanko", sets: 2, reps: 10, targetVx: null },
            ],
          },
        ],
      },
      {
        week: 2,
        days: [
          {
            dayOfWeek: 1, dayType: "volume", label: "Aktivointi A",
            slots: [
              { role: "primary", category: "vertikaaliveto", defaultMovementName: "Lisäpainoleuanveto", sets: 3, reps: 4, targetVx: 4 },
              { role: "accessory", category: "horisontaaliveto", defaultMovementName: "Penkkiveto", sets: 3, reps: 8, targetVx: 4 },
              { role: "accessory", category: "hauisfleksio", defaultMovementName: "Hammer curl", sets: 2, reps: 10, targetVx: null },
              { role: "accessory", category: "core", defaultMovementName: "Hanging leg raise", sets: 2, reps: 10, targetVx: null },
            ],
          },
          {
            dayOfWeek: 4, dayType: "volume", label: "Aktivointi B",
            slots: [
              { role: "primary", category: "vertikaaliveto", defaultMovementName: "Lisäpainoleuanveto", sets: 3, reps: 4, targetVx: 4 },
              { role: "accessory", category: "vertikaaliveto", defaultMovementName: "Ylätalja", sets: 3, reps: 8, targetVx: 4 },
              { role: "accessory", category: "vertikaalityöntö", defaultMovementName: "Pystypunnerrus", sets: 2, reps: 10, targetVx: 4 },
            ],
          },
        ],
      },
    ],
    postCycleAnalysis: null,
  };
}

// ═══════════════════════════════════════════════════════════════
// Track B Vaihe 2D-β — 3 klassista voimanosto-ohjelmaa (v4.48.0)
// ═══════════════════════════════════════════════════════════════
//
// Tutkimuspohja: docs/VAIHE_2D_BETA_RESEARCH_VERIFICATION.md (2026-05-11)
//   - Wendler 5/3/1 (T-Nation 2009 PDF-VERIFIOITU ydinprosenttitaulukko)
//   - Top-set + Backoff (Androulakis-Korakakis 2021 PMC8435792)
//   - Madcow 5×5 (RISTIINTARKISTETTU, anonyymi yhteisön mukautus)
//
// AMRAP-slot-rakenne:
//   slot.amrap = true → viim. sarja on AMRAP (toisto-target on minimi)
//   slot.amrapTargetReps = N → minimitoistomäärä (UI näyttää "N+")
//   Pää-app:in engine.js käyttää set.reps-arvoa Epley-pohjaisessa e1RM:ssä
//   automaattisesti — AMRAP toimii ilman engine-muutoksia.

// ── Wendler 5/3/1 (Classic, 4 vk, 4 päivää/vk) ──
// Tutkimuspohja: T-Nation 2009 (PDF-VERIFIOITU ydinprosenteille)
// Kanoninen 4-päiväinen rakenne: 1 päiväpääliikettä Wendlerin 4 kisaliikkeestä.
// HUOM: Wendler itse kieltää substituution kanonisesti. Jos generateCustomMesocycle
// distributePrimariesToDays substituoi atletin omat primaryt → tagaa
// "WENDLER-DERIVED" customConfig:ssa (mapperin tehtävä, ei skeleton:in).
function createWendler531Mesocycle(startDateISO) {
  // Helper: rakenna yksi 5/3/1-päivä viim. sarjan AMRAP-flagilla.
  // pcts/reps-arrayt on 3 sarjaa Wendlerin viikko-rakenteen mukaan.
  const wendlerDay = ({ dayOfWeek, label, primaryName, primaryCategory, pcts, reps, amrapLastSet, bbbName, bbbCategory }) => ({
    dayOfWeek,
    dayType: "heavy",
    label,
    slots: [
      // Lämmittely-info ei ole erillinen slot — Wendler suosittaa autoreguloitua lämpparia
      // 3 päämääräliikkeen sarjaa (Wendler 5/3/1 -taulukko)
      {
        role: "primary", category: primaryCategory, defaultMovementName: primaryName,
        sets: 1, reps: reps[0], targetVx: null,
        loadPct: pcts[0], // TM-prosentti
        wendlerSet: 1,
      },
      {
        role: "primary", category: primaryCategory, defaultMovementName: primaryName,
        sets: 1, reps: reps[1], targetVx: null,
        loadPct: pcts[1],
        wendlerSet: 2,
      },
      {
        role: "primary", category: primaryCategory, defaultMovementName: primaryName,
        sets: 1, reps: typeof reps[2] === "string" ? parseInt(reps[2]) : reps[2], targetVx: amrapLastSet ? 1 : null,
        loadPct: pcts[2],
        wendlerSet: 3,
        amrap: amrapLastSet,
        amrapTargetReps: amrapLastSet ? (typeof reps[2] === "string" ? parseInt(reps[2]) : reps[2]) : null,
      },
      // Assistance: Boring But Big (BBB) — 5×10 @ 50-60% TM samalla liikkeellä
      // EMPIRINEN (jimwendler.com blogi)
      {
        role: "backoff", category: primaryCategory, defaultMovementName: primaryName,
        sets: 5, reps: 10, targetVx: 3,
        loadPct: 0.50, // BBB-aloitus 50% TM (Wendlerin BBB-blogi)
        note: "BBB 5×10 @ 50% TM",
      },
      // Lyhyt accessory antagonistille (Wendler Triumvirate idealla)
      {
        role: "accessory", category: bbbCategory, defaultMovementName: bbbName,
        sets: 3, reps: 10, targetVx: null,
      },
    ],
  });

  // Päivien primary-mapping (Wendlerin 4 kisaliikettä + sopiva accessory antagonistina)
  // distributePrimariesToDays voi vaihtaa nämä atletin omiin primary:eihin
  const dayPrimaries = [
    { day: 1, label: "OHP",     name: "Pystypunnerrus", category: "vertikaalityöntö",   acc: "Lisäpainoleuanveto", accCat: "vertikaaliveto" },
    { day: 3, label: "Deadlift", name: "Maastaveto",     category: "alaraaja",           acc: "Hyperextensio",       accCat: "core" },
    { day: 5, label: "Bench",   name: "Penkkipunnerrus", category: "horisontaalityöntö", acc: "Penkkiveto",         accCat: "horisontaaliveto" },
    { day: 6, label: "Squat",   name: "Takakyykky",     category: "alaraaja",           acc: "Walking lunge",      accCat: "alaraaja" },
  ];

  // Viikko-prosentit ja toistot (PDF-VERIFIOITU T-Nation 2009)
  const weeks = [
    { week: 1, pcts: [0.65, 0.75, 0.85], reps: [5, 5, "5+"], amrap: true,  label: "5/5/5" },
    { week: 2, pcts: [0.70, 0.80, 0.90], reps: [3, 3, "3+"], amrap: true,  label: "3/3/3" },
    { week: 3, pcts: [0.75, 0.85, 0.95], reps: [5, 3, "1+"], amrap: true,  label: "5/3/1" },
    { week: 4, pcts: [0.40, 0.50, 0.60], reps: [5, 5, 5],    amrap: false, label: "Deload" },
  ];

  // weekDefs (mesocycle-tasolla)
  const weekDefs = [
    { week: 1, deltaPctBase: 0,     label: "5/5/5 (Wendler)",     heavyReps: 5, heavyTargetVx: 1 },
    { week: 2, deltaPctBase: 0.05,  label: "3/3/3 (Wendler)",     heavyReps: 3, heavyTargetVx: 1 },
    { week: 3, deltaPctBase: 0.10,  label: "5/3/1 (Wendler peak)",heavyReps: 1, heavyTargetVx: 1 },
    { week: 4, deltaPctBase: -0.25, label: "Deload (Wendler)",    heavyReps: 5, heavyTargetVx: 4 },
  ];

  const weekPlans = weeks.map(w => ({
    week: w.week,
    days: dayPrimaries.map(p =>
      wendlerDay({
        dayOfWeek: p.day,
        label: `Wendler ${p.label} (${w.label})`,
        primaryName: p.name,
        primaryCategory: p.category,
        pcts: w.pcts,
        reps: w.reps,
        amrapLastSet: w.amrap,
        bbbName: p.acc,
        bbbCategory: p.accCat,
      })
    ),
  }));

  return {
    mesocycleId: uid(),
    type: "wendler531",
    startDateISO: startDateISO || todayISO(),
    weekCount: 4,
    weekDefs,
    weekPlans,
    postCycleAnalysis: null,
    // Metadata 2D-β
    _programMeta: {
      source: "Wendler 2009 5/3/1 (T-Nation -artikkeli + jimwendler.com BBB)",
      status: "PDF-VERIFIOITU (ydinprosentit)",
      tmPercentage: 0.90,
      tmIncrementUpperKg: 2.5,
      tmIncrementLowerKg: 5.0,
      resetReductionPercent: 0.10, // RISTIINTARKISTETTU (yhteisön konsensus)
      amrapFormula: "epley",
      amrapDefaultRir: 1,
    },
  };
}

// ── Top-set + Backoff (4 vk, 3 päivää/vk) ──
// Tutkimuspohja: Androulakis-Korakakis et al. 2021 (PMC8435792, Nuckols co-author)
// Spesifikaatio: 1× single @ RPE 9-9.5 (Vara 0-1) + 2-3 backoff @ 80% top-singleista
// Backoff-reps oletus 3 (EI-TUTKIMUSPOHJAINEN, abstrakti ei mainitse).
function createTopSetBackoffMesocycle(startDateISO) {
  // Päivien primary-mapping: 3 päivää, kukin oma päämääräliike
  const dayPrimaries = [
    { day: 1, label: "A",   name: "Takakyykky",      category: "alaraaja",           acc1Name: "Romanian DL",    acc1Cat: "lonkkahingaus",      acc2Name: "Walking lunge",  acc2Cat: "alaraaja" },
    { day: 3, label: "B",   name: "Penkkipunnerrus", category: "horisontaalityöntö", acc1Name: "Penkkiveto",     acc1Cat: "horisontaaliveto",   acc2Name: "Vinopenkki",     acc2Cat: "horisontaalityöntö" },
    { day: 5, label: "C",   name: "Maastaveto",      category: "alaraaja",           acc1Name: "Lisäpainoleuanveto", acc1Cat: "vertikaaliveto", acc2Name: "Hyperextensio",  acc2Cat: "core" },
  ];

  // Sarjat: top single (Vara 1 = RPE 9) + 2-3 backoff @ 80%
  const tsbDay = ({ dayOfWeek, label, primaryName, primaryCategory, backoffSets, acc1Name, acc1Cat, acc2Name, acc2Cat }) => ({
    dayOfWeek,
    dayType: "heavy",
    label,
    slots: [
      // Top single — Vara 1 = RPE 9 (Helms 2016 mappaus)
      {
        role: "primary", category: primaryCategory, defaultMovementName: primaryName,
        sets: 1, reps: 1, targetVx: 1,
        loadPct: null, // autoregulated by Vara
        note: "Top single @ Vara 0-1 (RPE 9-9.5)",
      },
      // Backoff: 2-3 sarjaa × 3 toistoa @ 80% top-singleista
      {
        role: "backoff", category: primaryCategory, defaultMovementName: primaryName,
        sets: backoffSets, reps: 3, targetVx: 3,
        loadPct: 0.80, // PDF-VERIFIOITU (Androulakis-Korakakis 2021)
        note: "Backoff 2-3×3 @ 80% top-singleista",
      },
      // 2 accessory antagonistille/synergistille
      { role: "accessory", category: acc1Cat, defaultMovementName: acc1Name, sets: 3, reps: 8, targetVx: 2 },
      { role: "accessory", category: acc2Cat, defaultMovementName: acc2Name, sets: 3, reps: 10, targetVx: 3 },
      { role: "accessory", category: "core", defaultMovementName: "Hanging leg raise", sets: 3, reps: 10, targetVx: null },
    ],
  });

  // Viikko-progressio (Wendler-tyyppinen 4-vk sykli, YHDISTELMÄ — ei suoraa A-K 2021 -progressio-spekifikaatiota)
  // backoffSets nousee progressiivisesti
  const weeks = [
    { week: 1, deltaPct: 0,     label: "Acclimatize",  backoffSets: 2 },
    { week: 2, deltaPct: 0.025, label: "Top single +", backoffSets: 3 },
    { week: 3, deltaPct: 0.05,  label: "Peak",         backoffSets: 3 },
    { week: 4, deltaPct: -0.20, label: "Deload",       backoffSets: 2 },
  ];

  const weekDefs = weeks.map(w => ({
    week: w.week,
    deltaPctBase: w.deltaPct,
    label: `${w.label} (Top-set+Backoff)`,
    heavyReps: 1,
    heavyTargetVx: w.label === "Deload" ? 4 : 1,
  }));

  const weekPlans = weeks.map(w => ({
    week: w.week,
    days: dayPrimaries.map(p => tsbDay({
      dayOfWeek: p.day,
      label: `Top-set+Backoff ${p.label} (${w.label})`,
      primaryName: p.name,
      primaryCategory: p.category,
      backoffSets: w.backoffSets,
      acc1Name: p.acc1Name, acc1Cat: p.acc1Cat,
      acc2Name: p.acc2Name, acc2Cat: p.acc2Cat,
    })),
  }));

  return {
    mesocycleId: uid(),
    type: "topSetBackoff",
    startDateISO: startDateISO || todayISO(),
    weekCount: 4,
    weekDefs,
    weekPlans,
    postCycleAnalysis: null,
    _programMeta: {
      source: "Androulakis-Korakakis 2021 (PMC8435792) METD-konseptipaperi",
      status: "PDF-VERIFIOITU (abstrakti)",
      topSetRpe: [9.0, 9.5],
      topSetVara: [0, 1],
      backoffPercent: 0.80,
      backoffReps: 3, // EI-TUTKIMUSPOHJAINEN (oletus)
      progressionNote: "Wendler-pohjainen +2.5%/5% per sykli YHDISTELMÄ (Androulakis-Korakakis 2021 ei spesifioi progressiota)",
    },
  };
}

// ── Madcow 5×5 (5 vk, 3 päivää/vk Ma/Ke/Pe HLM-pattern) ──
// Tutkimuspohja: anonyymi Madcow2-mukautus Bill Starr 1976 -pohjasta
// RISTIINTARKISTETTU 3+ peilattua replikaa (violentzen, powerliftingtowin, stronglifts)
// EI-TUTKIMUSPOHJAINEN — yhteisön mukautus, n=0 RCT
//
// HUOM: Madcow on PROSENTTIPOHJAINEN (+2.5%/vk top-setistä), EI absoluuttinen
// +2.5/+5 lb/vk (= StrongLifts/SS, ei Madcow:n).
function createMadcow5x5Mesocycle(startDateISO) {
  // Ramp-prosentit: 50/62.5/75/87.5/100 % top-setistä (12.5% väli, RISTIINTARKISTETTU)
  const rampPcts = [0.50, 0.625, 0.75, 0.875, 1.00];

  // Päivien rakenne:
  //   Ma (heavy):       3 päämääräliikkettä 5×5 ramp → top
  //   Ke (light):       Squat 4×5 (sets 1-3 = Ma, set 4 = set 3 toistettu) + Press + Deadlift 4×5
  //   Pe (heavy+backoff): 3 päämääräliikkettä 4×5 ramp + 1×3 @ +2.5% Ma-topista + 1×8 @ ~77.5% Ma-topista

  // Päivän rakentaja-helperit
  const fiveByFiveRamp = (name, category) => [
    { role: "primary", category, defaultMovementName: name, sets: 1, reps: 5, targetVx: 4, loadPct: rampPcts[0], madcowRampSet: 1 },
    { role: "primary", category, defaultMovementName: name, sets: 1, reps: 5, targetVx: 3, loadPct: rampPcts[1], madcowRampSet: 2 },
    { role: "primary", category, defaultMovementName: name, sets: 1, reps: 5, targetVx: 3, loadPct: rampPcts[2], madcowRampSet: 3 },
    { role: "primary", category, defaultMovementName: name, sets: 1, reps: 5, targetVx: 2, loadPct: rampPcts[3], madcowRampSet: 4 },
    { role: "primary", category, defaultMovementName: name, sets: 1, reps: 5, targetVx: 1, loadPct: rampPcts[4], madcowRampSet: 5, note: "Top set" },
  ];

  const fourByFiveLightRamp = (name, category) => [
    { role: "primary", category, defaultMovementName: name, sets: 1, reps: 5, targetVx: 4, loadPct: rampPcts[0], madcowRampSet: 1 },
    { role: "primary", category, defaultMovementName: name, sets: 1, reps: 5, targetVx: 4, loadPct: rampPcts[1], madcowRampSet: 2 },
    { role: "primary", category, defaultMovementName: name, sets: 1, reps: 5, targetVx: 3, loadPct: rampPcts[2], madcowRampSet: 3 },
    { role: "primary", category, defaultMovementName: name, sets: 1, reps: 5, targetVx: 3, loadPct: rampPcts[2], madcowRampSet: 4, note: "Wed: set 4 = set 3 toistettuna" },
  ];

  const fridayBackoff = (name, category) => [
    { role: "primary", category, defaultMovementName: name, sets: 1, reps: 5, targetVx: 4, loadPct: rampPcts[0], madcowRampSet: 1 },
    { role: "primary", category, defaultMovementName: name, sets: 1, reps: 5, targetVx: 3, loadPct: rampPcts[1], madcowRampSet: 2 },
    { role: "primary", category, defaultMovementName: name, sets: 1, reps: 5, targetVx: 3, loadPct: rampPcts[2], madcowRampSet: 3 },
    { role: "primary", category, defaultMovementName: name, sets: 1, reps: 5, targetVx: 2, loadPct: rampPcts[3], madcowRampSet: 4 },
    { role: "primary", category, defaultMovementName: name, sets: 1, reps: 3, targetVx: 1, loadPct: 1.025, madcowRampSet: 5, note: "Fri: 1×3 @ +2.5% Ma-topista" },
    { role: "backoff", category, defaultMovementName: name, sets: 1, reps: 8, targetVx: 3, loadPct: 0.775, note: "Fri backoff: 1×8 @ ~77.5% Ma-topista" },
  ];

  // ── Viikkojen rakentaminen ──
  // weeklyAdjust = loadPct-säätö per viikko. Madcow alkaa vk1 = 92.5% nykyisestä
  // 5RM:stä → +2.5%/vk → vk4 = 100% → vk5 = PR (102.5%+)
  // RISTIINTARKISTETTU (Powerliftingtowin matemaattinen johto)
  const weekAdjustments = [
    { week: 1, weeklyMult: 0.925, label: "Vk1 (92.5% 5RM)" },
    { week: 2, weeklyMult: 0.950, label: "Vk2 (95.0% 5RM)" },
    { week: 3, weeklyMult: 0.975, label: "Vk3 (97.5% 5RM)" },
    { week: 4, weeklyMult: 1.000, label: "Vk4 (100% 5RM)" },
    { week: 5, weeklyMult: 1.025, label: "Vk5 PR-yritys (102.5%+ 5RM)" },
  ];

  // Päivärakenne (Ma/Ke/Pe)
  const buildWeek = (weekNum, weeklyMult, label) => {
    // Säädä loadPct viikon multiplierilla
    const adjust = (slots) => slots.map(s => ({
      ...s,
      loadPct: typeof s.loadPct === "number" ? s.loadPct * weeklyMult : s.loadPct,
    }));

    return {
      week: weekNum,
      days: [
        {
          dayOfWeek: 1, dayType: "heavy", label: `Madcow Ma (Heavy) — ${label}`,
          slots: [
            ...adjust(fiveByFiveRamp("Takakyykky", "alaraaja")),
            ...adjust(fiveByFiveRamp("Penkkipunnerrus", "horisontaalityöntö")),
            ...adjust(fiveByFiveRamp("Penkkiveto", "horisontaaliveto")),
            // Apuliikkeet: Madcow alkuperäinen = weighted hypers + weighted situps
            { role: "accessory", category: "core", defaultMovementName: "Hyperextensio", sets: 2, reps: 10, targetVx: 3 },
            { role: "accessory", category: "core", defaultMovementName: "Hanging leg raise", sets: 4, reps: 10, targetVx: null },
          ],
        },
        {
          dayOfWeek: 3, dayType: "volume", label: `Madcow Ke (Light) — ${label}`,
          slots: [
            ...adjust(fourByFiveLightRamp("Takakyykky", "alaraaja")),
            ...adjust(fourByFiveLightRamp("Pystypunnerrus", "vertikaalityöntö")),
            ...adjust(fourByFiveLightRamp("Maastaveto", "alaraaja")),
            { role: "accessory", category: "core", defaultMovementName: "Hanging leg raise", sets: 3, reps: 10, targetVx: null },
          ],
        },
        {
          dayOfWeek: 5, dayType: "heavy", label: `Madcow Pe (Heavy+Backoff) — ${label}`,
          slots: [
            ...adjust(fridayBackoff("Takakyykky", "alaraaja")),
            ...adjust(fridayBackoff("Penkkipunnerrus", "horisontaalityöntö")),
            ...adjust(fridayBackoff("Penkkiveto", "horisontaaliveto")),
            // Apuliikkeet: weighted dips, curls, triceps (alkuperäinen)
            { role: "accessory", category: "horisontaalityöntö", defaultMovementName: "Dippi (kehonpaino)", sets: 3, reps: 8, targetVx: 3 },
            { role: "accessory", category: "hauisfleksio", defaultMovementName: "Hauiskääntö tanko", sets: 3, reps: 10, targetVx: null },
          ],
        },
      ],
    };
  };

  const weekPlans = weekAdjustments.map(w => buildWeek(w.week, w.weeklyMult, w.label));

  const weekDefs = weekAdjustments.map(w => ({
    week: w.week,
    deltaPctBase: w.weeklyMult - 1.0, // -7.5%, -5%, -2.5%, 0%, +2.5%
    label: w.label,
    heavyReps: w.week === 5 ? 3 : 5,
    heavyTargetVx: w.week === 5 ? 1 : (w.week >= 4 ? 1 : 2),
  }));

  return {
    mesocycleId: uid(),
    type: "madcow5x5",
    startDateISO: startDateISO || todayISO(),
    weekCount: 5,
    weekDefs,
    weekPlans,
    postCycleAnalysis: null,
    _programMeta: {
      source: "Madcow2 EliteFitness anonyymi mukautus (Bill Starr 1976 -pohja)",
      status: "RISTIINTARKISTETTU (3+ peilattua replikaa), EI-TUTKIMUSPOHJAINEN",
      rampPercentages: rampPcts,
      weeklyIncrementPercent: 0.025, // EI absoluuttinen +2.5/+5 lb!
      fridayTriplePercentOfMondayTop: 1.025,
      fridayBackoffPercentOfMondayTop: 0.775,
      week1StartPercentOf5rm: 0.925,
      weekToReachCurrent5rm: 4,
      weekFirstPrAttempt: 5,
      advancedWarning: "+2.5%/vk progressio on intermediate-lifterille. Advanced (15+v) → harkitse 1.0-1.5%/vk redukointia.",
    },
  };
}

// ═══════════════════════════════════════════════════════════════
// Track B Vaihe 2D-γ — 6 edistynyttä metodologiaa (v4.49.0)
// ═══════════════════════════════════════════════════════════════
//
// Tutkimuspohja:
//   - docs/VAIHE_2D_GAMMA_OSA1_RESEARCH_VERIFICATION.md (Westside/GZCL/Sheiko)
//   - docs/VAIHE_2D_GAMMA_OSA2_RESEARCH_VERIFICATION.md (RP/Smolov/Coan-Phillipi)
//
// Status-attribuutiot per metodologia:
//   - Westside Conjugate: WSBB-OFFICIAL + Simmons 2011 PDF + KIRJA-VIITATTU
//   - GZCL J&T 2.0: EMPIRINEN-blogi (Lefever 2012/2016 kokoteksti luettu)
//   - Sheiko #29-derived: EMPIRINEN-yhteisökopio, "SHEIKO-DERIVED"-leima
//   - Minimalist RP: DOKUMENTOITU RP-blogi (EI peer-reviewed)
//   - Smolov Jr: DOKUMENTOITU yhteisö (kanoninen 13 vk EI suositella streetliftingiin)
//   - Coan-Phillipi: DOKUMENTOITU Mark Phillipi -alkuperäisessee (10 vk + meet, EI 12 vk)
//
// Kaikki streetlifting-laajennukset merkitty selvästi _programMeta:n status-kentässä.

// ── Westside Conjugate (4 vk, 4 päivää/vk: ME-Lower/ME-Upper/DE-Lower/DE-Upper) ──
// WSBB-OFFICIAL spec: ME top single ≥90% 1RM, DE-Lower 10×2 @ 50/55/60% (raw Malli A),
// DE-Upper 9×3 @ 50-60% (kaikki 3 vk), 3 tartuntaa.
// Streetlifting-mukautus: ME-rotaatio sisältää weighted pull-up / weighted dip (3RM)
// raw-substituuttina equipped-PL-liikkeille (board press, suspended GM). HUOM:
// alkuperäinen Westside on equipped-PL — streetlifting-versio on "WESTSIDE-DERIVED".
function createWestsideConjugateMesocycle(startDateISO) {
  // ME-rotaation viikkokohtaiset liikkeet (4 vk advanced-rotaatio = 1 vk/liike)
  const meLowerRotation = [
    { name: "Box squat",      category: "alaraaja",            note: "Box squat (parallel)" },
    { name: "Good morning",   category: "alaraaja",            note: "GM 3RM (ei single)", topSetReps: 3 },
    { name: "Deficit DL",     category: "alaraaja",            note: "Deficit DL 3-10cm" },
    { name: "Front squat",    category: "alaraaja",            note: "Front squat" },
  ];
  const meUpperRotation = [
    { name: "Floor press",       category: "horisontaalityöntö", note: "Floor press lockout" },
    { name: "Pin press",         category: "horisontaalityöntö", note: "Pin press (rinta-korkeudella)" },
    { name: "Close-grip bench",  category: "horisontaalityöntö", note: "Close-grip bench" },
    { name: "Lisäpainodippi",    category: "horisontaalityöntö", note: "Weighted dip 3-5RM" },
  ];

  const weekDefs = [
    { week: 1, deltaPctBase: 0,     label: "WSBB vk1 (ME-rotaatio 1)", heavyReps: 1, heavyTargetVx: 1 },
    { week: 2, deltaPctBase: 0,     label: "WSBB vk2 (ME-rotaatio 2)", heavyReps: 1, heavyTargetVx: 1 },
    { week: 3, deltaPctBase: 0,     label: "WSBB vk3 (ME-rotaatio 3)", heavyReps: 1, heavyTargetVx: 1 },
    { week: 4, deltaPctBase: -0.15, label: "WSBB vk4 deload + DE-low", heavyReps: 1, heavyTargetVx: 4 },
  ];

  // DE-Lower 10×2 (raw Malli A): vk1 50%, vk2 55%, vk3 60%, vk4 50% deload
  const deLowerPcts = [0.50, 0.55, 0.60, 0.50];
  // DE-Upper 9×3 @ 50-60%: 3 tartuntaa × 3 sarjaa = 9. Kaikki 3 vk pieni vaihtelu.
  const deUpperPcts = [0.50, 0.55, 0.60, 0.50];

  const weekPlans = weekDefs.map((wd, idx) => {
    const meL = meLowerRotation[idx % meLowerRotation.length];
    const meU = meUpperRotation[idx % meUpperRotation.length];
    const meLowerTopReps = meL.topSetReps || 1;
    const meUpperTopReps = meU.topSetReps || 1;
    const deLowerPct = deLowerPcts[idx];
    const deUpperPct = deUpperPcts[idx];

    return {
      week: wd.week,
      days: [
        // Ma: ME-Lower (max effort lower)
        {
          dayOfWeek: 1, dayType: "heavy", label: `ME-Lower (${meL.name})`,
          slots: [
            // Lämmittely + top single (autoreguloitu — käyttäjä työntää 1RM:ään)
            { role: "primary", category: meL.category, defaultMovementName: meL.name,
              sets: 1, reps: meLowerTopReps, targetVx: 1, note: `${meL.note} — top single (≥90% 1RM)` },
            // Apuliikkeet: GHR + reverse hyper (kanoniset WSBB)
            { role: "accessory", category: "alaraaja", defaultMovementName: "Glute-Ham Raise",
              sets: 4, reps: 8, targetVx: 3, note: "GHR — hamstring/glute" },
            { role: "accessory", category: "core", defaultMovementName: "Hyperextensio",
              sets: 4, reps: 10, targetVx: 3, note: "Reverse hyper proxy" },
            { role: "accessory", category: "core", defaultMovementName: "Hanging leg raise",
              sets: 3, reps: 12, targetVx: null },
          ],
        },
        // Ke: ME-Upper (max effort upper)
        {
          dayOfWeek: 3, dayType: "heavy", label: `ME-Upper (${meU.name})`,
          slots: [
            { role: "primary", category: meU.category, defaultMovementName: meU.name,
              sets: 1, reps: meUpperTopReps, targetVx: 1, note: `${meU.note} — top single (≥90% 1RM)` },
            // Apuliikkeet: Lat + tricep WSBB-tradition mukaisesti
            { role: "accessory", category: "vertikaaliveto", defaultMovementName: "Lisäpainoleuanveto",
              sets: 4, reps: 8, targetVx: 2, note: "Lat-volyymi" },
            { role: "accessory", category: "horisontaalityöntö", defaultMovementName: "JM press",
              sets: 3, reps: 8, targetVx: 3, note: "Tricep-specialty" },
            { role: "accessory", category: "vertikaalityöntö", defaultMovementName: "Sivunosto",
              sets: 3, reps: 12, targetVx: null },
          ],
        },
        // Pe: DE-Lower (dynamic effort lower)
        {
          dayOfWeek: 5, dayType: "speed", label: "DE-Lower (Box squat)",
          slots: [
            { role: "primary", category: "alaraaja", defaultMovementName: "Box squat",
              sets: 10, reps: 2, targetVx: 4, loadPct: deLowerPct,
              note: `DE squat 10×2 @ ${Math.round(deLowerPct*100)}% (45-60s rest)` },
            // DE-DL välissä (6×1 @ 70% kanoninen, käytetään yksinkertaistettuna)
            { role: "primary", category: "alaraaja", defaultMovementName: "Maastaveto",
              sets: 6, reps: 1, targetVx: 4, loadPct: 0.70,
              note: "DE deadlift 6×1 @ 70%" },
            { role: "accessory", category: "core", defaultMovementName: "Hyperextensio",
              sets: 4, reps: 20, targetVx: null, note: "Reverse hyper light (4×20)" },
            { role: "accessory", category: "core", defaultMovementName: "Pallof press",
              sets: 3, reps: 10, targetVx: null },
          ],
        },
        // La: DE-Upper (dynamic effort upper) — 3 grippiä × 3 sarjaa = 9×3
        {
          dayOfWeek: 6, dayType: "speed", label: "DE-Upper (Bench 9×3)",
          slots: [
            { role: "primary", category: "horisontaalityöntö", defaultMovementName: "Penkkipunnerrus",
              sets: 9, reps: 3, targetVx: 4, loadPct: deUpperPct,
              note: `Bench 9×3 @ ${Math.round(deUpperPct*100)}% (3 tartuntaa × 3 sarjaa)` },
            { role: "accessory", category: "vertikaaliveto", defaultMovementName: "Penkkiveto",
              sets: 4, reps: 8, targetVx: 3, note: "BB row (lat-volyymi)" },
            { role: "accessory", category: "horisontaalityöntö", defaultMovementName: "JM press",
              sets: 3, reps: 8, targetVx: 3, note: "Tricep-specialty" },
            { role: "accessory", category: "hauisfleksio", defaultMovementName: "Hauiskääntö tanko",
              sets: 3, reps: 10, targetVx: null },
          ],
        },
      ],
    };
  });

  return {
    mesocycleId: uid(),
    type: "westsideConjugate",
    startDateISO: startDateISO || todayISO(),
    weekCount: 4,
    weekDefs,
    weekPlans,
    postCycleAnalysis: null,
    _programMeta: {
      source: "Simmons 2007 + WSBB-blogit (2018-2025) + Simmons 2011 CrossFit Journal PDF",
      status: "WSBB-OFFICIAL + KIRJA-VIITATTU",
      meRotationPeriodWeeks: 1,           // advanced-tasolla
      meStagnationTrigger: "2 vk no PR → switch to 5RM top set for 1 week",
      deLowerWavePcts: [0.50, 0.55, 0.60],
      deUpperPctRange: [0.50, 0.60],
      accommodatingResistancePct: null,   // raw Malli A: ilman AR
      restSecondsDE: [45, 60],
      restSecondsME: [180, 300],
      streetliftingExtensionWarning: "Westside on alunperin equipped-PL. Tämä on WESTSIDE-DERIVED — ME-Upper-rotaation lisäpaino-dippi/leuka ei ole Simmonsin kanonisoima.",
    },
  };
}

// ── GZCL J&T 2.0 (12 vk = 2× 6vk blokkia, 4 päivää/vk) ──
// EMPIRINEN-blogi (Lefever 2016 kokoteksti luettu)
// T1 Training Max = ~90% 1RM (~2RM). Vk RM-targetit blokki 1: 10,8,6,4,2,1.
// Drop-set %:t TM:stä: 67.5/70/72.5/75/78.5/null (vk6 = 1RM-testi).
function createGZCLMesocycle(startDateISO) {
  // Blokki 1 (vk 1-6): RM-target laskee 10 → 1
  // Blokki 2 (vk 7-12): toistetaan samaa rakennetta korkeammilla kuormilla
  const block1Rms       = [10, 8, 6, 4, 2, 1];
  const block1DropPcts  = [0.675, 0.70, 0.725, 0.75, 0.785, null]; // null = 1RM-testi
  // Blokki 2 -targetit (PENDING tarkka, käytetään konservatiivisia arvoja yhteisön mukautusten pohjalta)
  const block2Rms       = [8, 6, 5, 3, 2, 1];
  const block2DropPcts  = [0.70, 0.725, 0.75, 0.775, 0.80, null];

  const allWeekRms       = [...block1Rms, ...block2Rms];
  const allWeekDropPcts  = [...block1DropPcts, ...block2DropPcts];

  // Päiväkohtainen T1/T2/T3-rakenne (Lefever J&T 2.0: 4 päivää, T1+T2+T3 per päivä)
  // T1: pääliike viikoittainen RM-target
  // T2: T2-variantti 3×8-10 @ drop-pct
  // T3: accessory 3×15+ (LSAMRAP)
  const buildDay = ({ dayOfWeek, label, t1Name, t1Cat, t2Name, t2Cat, t3Name, t3Cat, weekRm, dropPct }) => ({
    dayOfWeek, dayType: weekRm <= 3 ? "heavy" : "volume", label,
    slots: [
      // T1: pääliike — RM-target target with AMRAP if dropPct present
      {
        role: "primary", category: t1Cat, defaultMovementName: t1Name,
        sets: 1, reps: weekRm, targetVx: 1,
        amrap: dropPct !== null,
        amrapTargetReps: dropPct !== null ? weekRm : null,
        note: `T1 ${weekRm}RM (LSAMRAP, RIR 1-2, cap 10)`,
        gzclTier: 1,
      },
      // T2: 3×8 @ drop-pct (skip vk6/vk12 — 1RM-testi)
      ...(dropPct !== null ? [{
        role: "backoff", category: t2Cat, defaultMovementName: t2Name,
        sets: 3, reps: 8, targetVx: 3, loadPct: dropPct,
        note: `T2 3×8 @ ${Math.round(dropPct*100)}% TM`,
        gzclTier: 2,
      }] : []),
      // T3: 3×15+ AMRAP
      {
        role: "accessory", category: t3Cat, defaultMovementName: t3Name,
        sets: 3, reps: 15, targetVx: 4,
        amrap: true, amrapTargetReps: 15,
        note: "T3 3×15+ (LSAMRAP, T3:ssa AMRAP cap-vapaa)",
        gzclTier: 3,
      },
    ],
  });

  // Kanoninen J&T 2.0 päiväjako: Squat A, Bench A, Squat B (eri variantti), Bench B
  // Streetlifting-mukautus: säilytä klassinen pohja (Squat/Bench/DL/OHP)
  const dayDefs = [
    { day: 1, label: "T1 Squat / T2 Front Squat / T3 Walking lunge",
      t1Name: "Takakyykky", t1Cat: "alaraaja",
      t2Name: "Front squat", t2Cat: "alaraaja",
      t3Name: "Walking lunge", t3Cat: "alaraaja" },
    { day: 2, label: "T1 Bench / T2 Close-grip bench / T3 Penkkiveto",
      t1Name: "Penkkipunnerrus", t1Cat: "horisontaalityöntö",
      t2Name: "Close-grip bench", t2Cat: "horisontaalityöntö",
      t3Name: "Penkkiveto", t3Cat: "horisontaaliveto" },
    { day: 4, label: "T1 Deadlift / T2 Paused DL / T3 Romanian DL",
      t1Name: "Maastaveto", t1Cat: "alaraaja",
      t2Name: "Paused DL", t2Cat: "alaraaja",
      t3Name: "Romanian DL", t3Cat: "alaraaja" },
    { day: 5, label: "T1 OHP / T2 Push press / T3 Pystypunnerrus",
      t1Name: "Pystypunnerrus", t1Cat: "vertikaalityöntö",
      t2Name: "Push press", t2Cat: "vertikaalityöntö",
      t3Name: "Pystypunnerrus", t3Cat: "vertikaalityöntö" },
  ];

  const weekDefs = allWeekRms.map((rm, idx) => ({
    week: idx + 1,
    deltaPctBase: idx < 6 ? (idx * 0.01) : (0.06 + (idx-6) * 0.01),
    label: `GZCL J&T 2.0 vk${idx+1} (RM=${rm}${allWeekDropPcts[idx] === null ? ", 1RM-testi" : ""})`,
    heavyReps: rm,
    heavyTargetVx: rm <= 3 ? 1 : (rm <= 6 ? 2 : 3),
  }));

  const weekPlans = allWeekRms.map((rm, idx) => ({
    week: idx + 1,
    days: dayDefs.map(d => buildDay({
      ...d, weekRm: rm, dropPct: allWeekDropPcts[idx],
    })),
  }));

  return {
    mesocycleId: uid(),
    type: "gzclJT20",
    startDateISO: startDateISO || todayISO(),
    weekCount: 12,
    weekDefs,
    weekPlans,
    postCycleAnalysis: null,
    _programMeta: {
      source: "Lefever 2016 'Jacked & Tan 2.0' -blogi (swoleateveryheight.blogspot.com)",
      status: "EMPIRINEN-blogi",
      durationWeeks: 12,
      sessionsPerWeek: 4,
      blocks: [6, 6],
      trainingMaxPctOf1RM: 0.90,
      amrapRir: [1, 2],
      amrapCapT1: 10,
      e1rmFormula: "epley",
      block1WeeklyRmTargets: block1Rms,
      block1DropsetPctTm: block1DropPcts,
      block2WeeklyRmTargets: block2Rms,
      block2DropsetPctTm: block2DropPcts,
      block2PctsStatus: "PENDING — Lefeverin J&T 2.0 vk 7-12 tarkat %:t vain Boostcamp-appissa; käytetty yhteisön konservatiivinen mukautus",
    },
  };
}

// ── Sheiko #29-derived (4 vk, 3 päivää/vk) ──
// EMPIRINEN-yhteisökopio + KRIITTINEN: "SHEIKO-DERIVED, ei kanoninen"
// Sheiko on EKSKLUSIIVISESTI squat/bench/deadlift. Streetlifting (leuka/dippi) ei
// ole kanonisessa Sheikossa. Leuka/dippi lisätty "additional exercise 5×5" -muotoon.
function createSheikoDerivedMesocycle(startDateISO) {
  // #29 viikko 1-3 päiväkohtaiset rakenteet (foorumi-spreadsheet KOLMANNEN OSAPUOLEN)
  // Yksinkertaistus: käytä keskimääräistä intensiteettiä per päivä, max-int. nousee vk1→vk3
  const weekConfigs = [
    { week: 1, maxIntPct: 0.75, label: "#29 vk1 (max 75% 1RM)" },
    { week: 2, maxIntPct: 0.80, label: "#29 vk2 (max 80% 1RM)" },
    { week: 3, maxIntPct: 0.85, label: "#29 vk3 (max 85% 1RM)" },
    { week: 4, maxIntPct: 0.70, label: "#29 vk4 deload (max 70%)" },
  ];

  const weekDefs = weekConfigs.map(wc => ({
    week: wc.week,
    deltaPctBase: wc.week === 4 ? -0.20 : (wc.week - 1) * 0.025,
    label: wc.label,
    heavyReps: 3,
    heavyTargetVx: wc.week === 4 ? 4 : 2,
  }));

  // Per päivä: Sheikon klassinen pyramidi-pohja. Squat 2x/vk, Bench 3x/vk, DL 1x/vk
  // Streetlifting-laajennus: leuka & dippi additional 5×5 ilman %-skeemaa.
  const weekPlans = weekConfigs.map(wc => ({
    week: wc.week,
    days: [
      // Ma: Squat + Bench + Squat-toisto (Sheikon klassinen rakenne)
      {
        dayOfWeek: 1, dayType: "volume", label: `Sheiko Ma — ${wc.label}`,
        slots: [
          // Squat-pyramidi 50/60/70/(85% max)
          { role: "primary", category: "alaraaja", defaultMovementName: "Takakyykky",
            sets: 1, reps: 5, targetVx: 4, loadPct: 0.50, note: "Squat warm-up 1×5 @ 50%" },
          { role: "primary", category: "alaraaja", defaultMovementName: "Takakyykky",
            sets: 2, reps: 5, targetVx: 4, loadPct: 0.60, note: "Squat warm-up 2×5 @ 60%" },
          { role: "primary", category: "alaraaja", defaultMovementName: "Takakyykky",
            sets: 5, reps: 5, targetVx: 3, loadPct: Math.min(0.70, wc.maxIntPct),
            note: `Squat working 5×5 @ ${Math.round(Math.min(0.70, wc.maxIntPct)*100)}%` },
          // Bench-pyramidi
          { role: "primary", category: "horisontaalityöntö", defaultMovementName: "Penkkipunnerrus",
            sets: 4, reps: 4, targetVx: 2, loadPct: wc.maxIntPct,
            note: `Bench top 4×4 @ ${Math.round(wc.maxIntPct*100)}%` },
          // Accessory (Sheikon kanonin mukaisesti)
          { role: "accessory", category: "horisontaalityöntö", defaultMovementName: "Dumbbell fly",
            sets: 5, reps: 10, targetVx: 3, note: "DB fly (Sheiko classic acc.)" },
          { role: "accessory", category: "alaraaja", defaultMovementName: "Good morning",
            sets: 5, reps: 5, targetVx: 3, note: "GM seisten (Sheiko classic)" },
        ],
      },
      // Ke: Deadlift + Bench + lat-acc.
      {
        dayOfWeek: 3, dayType: "heavy", label: `Sheiko Ke — DL + Bench`,
        slots: [
          { role: "primary", category: "alaraaja", defaultMovementName: "Maastaveto",
            sets: 4, reps: 3, targetVx: 2, loadPct: wc.maxIntPct,
            note: `DL top 4×3 @ ${Math.round(wc.maxIntPct*100)}%` },
          { role: "primary", category: "horisontaalityöntö", defaultMovementName: "Vinopenkkipunnerrus",
            sets: 6, reps: 4, targetVx: 3, loadPct: 0.70, note: "Incline bench 6×4 (Sheiko #29)" },
          // Streetlifting-laajennus: dippi additional 5×5 (SHEIKO-DERIVED tagi)
          { role: "accessory", category: "horisontaalityöntö", defaultMovementName: "Lisäpainodippi",
            sets: 5, reps: 5, targetVx: 3,
            note: "Lisäpaino-dippi 5×5 (SHEIKO-DERIVED LAAJENNUS — ei kanoninen Sheiko)" },
          { role: "accessory", category: "alaraaja", defaultMovementName: "Yhden jalan jalkaprässi",
            sets: 5, reps: 5, targetVx: 3, note: "One-leg press (Sheiko classic)" },
          { role: "accessory", category: "core", defaultMovementName: "Hanging leg raise",
            sets: 3, reps: 10, targetVx: null },
        ],
      },
      // Pe: Bench-aalto + Squat-toisto
      {
        dayOfWeek: 5, dayType: "volume", label: `Sheiko Pe — Bench wave + Squat`,
        slots: [
          // Bench-aalto 50/60/70/80/(max%)/80/70/60/50
          { role: "primary", category: "horisontaalityöntö", defaultMovementName: "Penkkipunnerrus",
            sets: 1, reps: 4, targetVx: 2, loadPct: wc.maxIntPct,
            note: `Bench peak 1×4 @ ${Math.round(wc.maxIntPct*100)}% (aaltohuippu)` },
          { role: "primary", category: "horisontaalityöntö", defaultMovementName: "Penkkipunnerrus",
            sets: 3, reps: 5, targetVx: 3, loadPct: 0.65, note: "Bench taper 3×5 @ 65%" },
          { role: "primary", category: "alaraaja", defaultMovementName: "Takakyykky",
            sets: 4, reps: 4, targetVx: 3, loadPct: 0.70, note: "Squat second hit 4×4 @ 70%" },
          // Streetlifting-laajennus: leuka additional 5×5
          { role: "accessory", category: "vertikaaliveto", defaultMovementName: "Lisäpainoleuanveto",
            sets: 5, reps: 5, targetVx: 3,
            note: "Lisäpaino-leuka 5×5 (SHEIKO-DERIVED LAAJENNUS — ei kanoninen Sheiko)" },
          { role: "accessory", category: "horisontaalityöntö", defaultMovementName: "Dumbbell fly",
            sets: 5, reps: 10, targetVx: 3 },
        ],
      },
    ],
  }));

  return {
    mesocycleId: uid(),
    type: "sheikoDerived",
    startDateISO: startDateISO || todayISO(),
    weekCount: 4,
    weekDefs,
    weekPlans,
    postCycleAnalysis: null,
    _programMeta: {
      source: "Sheiko #29 (anonyymi yhteisökopio foorumi-spreadsheetistä); Boris Sheikon kirja 2018 EI luettu",
      status: "EMPIRINEN-yhteisökopio + 'SHEIKO-DERIVED' (ei kanoninen)",
      durationWeeks: 4,
      sessionsPerWeek: 3,
      squatFrequency: 2,
      benchFrequency: 3,
      deadliftFrequency: 1,
      avgIntensityPct: 0.70,
      maxIntensityWeek1Pct: 0.75,
      maxIntensityWeek3Pct: 0.85,
      streetliftingExtensionWarning: "SHEIKO-DERIVED LAAJENNUS: leuka + dippi 5×5 additional exerciseinä ilman %-skeemaa. Sheiko ei kanonisoi tätä — Sheiko kattaa vain squat/bench/deadlift. Lopputuotos on 'Sheiko-inspired hybrid'.",
      volumeRiskWarning: "Sheiko-volyymi (200-400 NL/vk yli 50%:lla) + streetlifting-volyymi = ristikkäisvolyymi-riski. Akseli (advanced/elite) → harkitse Intermediate Medium Load -versiota.",
    },
  };
}

// ── Minimalist RP (4 vk, hypertrofia-fokus, MEV → MAV progressio) ──
// Tutkimuspohja: Israetel RP-blogi 2017+ (DOKUMENTOITU, ei VERIFIOITU peer-reviewed).
// "Effective reps" on Chris Beardsleyn konsepti (~2017), EI Israetelin.
// Sarjan määritelmä: 30-85% 1RM, 5-30 reps, RIR 0-4 — vain prime-mover-/isolaatiosarjat.
function createMinimalistRPMesocycle(startDateISO) {
  // 4 vk mesosykli: vk1 MEV, vk2 + 2 sarjaa, vk3 lähellä MAV, vk4 deload
  // 3 päivää/vk push-pull-legs -tyyppinen jako (yksinkertaistus)
  const weekDefs = [
    { week: 1, deltaPctBase: 0,     label: "RP Min vk1 (MEV)",         heavyReps: 8, heavyTargetVx: 2 },
    { week: 2, deltaPctBase: 0.025, label: "RP Min vk2 (MEV+2 sets)",  heavyReps: 8, heavyTargetVx: 2 },
    { week: 3, deltaPctBase: 0.05,  label: "RP Min vk3 (lähellä MAV)", heavyReps: 8, heavyTargetVx: 1 },
    { week: 4, deltaPctBase: -0.25, label: "RP Min vk4 (deload)",      heavyReps: 6, heavyTargetVx: 4 },
  ];

  // Sets-first-progressio: lisää sarjoja ennen kuormaa.
  // Esim. vk1 = 2 sarjaa per liike, vk2 = 3 sarjaa, vk3 = 4 sarjaa, vk4 = 1 sarja (deload)
  const setsPerWeek = [2, 3, 4, 1];

  const weekPlans = weekDefs.map((wd, idx) => {
    const sets = setsPerWeek[idx];
    const targetRir = idx === 3 ? 4 : (idx === 2 ? 0 : 1); // vk3 lähellä failurea, vk4 deload
    return {
      week: wd.week,
      days: [
        // Ma: Push (rinta + olkapää + tricep)
        {
          dayOfWeek: 1, dayType: "volume", label: `RP Push (vk${wd.week}, ${sets} sets/movement)`,
          slots: [
            { role: "primary", category: "horisontaalityöntö", defaultMovementName: "Penkkipunnerrus",
              sets, reps: 10, targetVx: targetRir, note: `MEV-progressio: ${sets} sarjaa` },
            { role: "accessory", category: "horisontaalityöntö", defaultMovementName: "Vinopenkkipunnerrus",
              sets, reps: 10, targetVx: targetRir, note: `Upper chest, ${sets} sarjaa` },
            { role: "accessory", category: "vertikaalityöntö", defaultMovementName: "Sivunosto",
              sets, reps: 15, targetVx: targetRir, note: `Side delt, ${sets} sarjaa` },
            { role: "accessory", category: "ojentajaekstensio", defaultMovementName: "Tricep pushdown",
              sets, reps: 12, targetVx: targetRir, note: `Tricep, ${sets} sarjaa` },
          ],
        },
        // Ke: Pull (selkä + biceps + taka-olkapää)
        {
          dayOfWeek: 3, dayType: "volume", label: `RP Pull (vk${wd.week}, ${sets} sets/movement)`,
          slots: [
            { role: "primary", category: "vertikaaliveto", defaultMovementName: "Lisäpainoleuanveto",
              sets, reps: 8, targetVx: targetRir, note: `Vertical pull, ${sets} sarjaa` },
            { role: "accessory", category: "horisontaaliveto", defaultMovementName: "Penkkiveto",
              sets, reps: 10, targetVx: targetRir, note: `Horizontal pull, ${sets} sarjaa` },
            { role: "accessory", category: "vertikaalityöntö", defaultMovementName: "Face pull",
              sets, reps: 15, targetVx: targetRir, note: `Rear delt, ${sets} sarjaa` },
            { role: "accessory", category: "hauisfleksio", defaultMovementName: "Hauiskääntö tanko",
              sets, reps: 12, targetVx: targetRir, note: `Biceps, ${sets} sarjaa` },
          ],
        },
        // Pe: Legs (quad + ham + glute + calf)
        {
          dayOfWeek: 5, dayType: "volume", label: `RP Legs (vk${wd.week}, ${sets} sets/movement)`,
          slots: [
            { role: "primary", category: "alaraaja", defaultMovementName: "Takakyykky",
              sets, reps: 8, targetVx: targetRir, note: `Quad-dom, ${sets} sarjaa` },
            { role: "accessory", category: "alaraaja", defaultMovementName: "Romanian DL",
              sets, reps: 10, targetVx: targetRir, note: `Hamstring/glute, ${sets} sarjaa` },
            { role: "accessory", category: "alaraaja", defaultMovementName: "Bulgarian split squat",
              sets, reps: 10, targetVx: targetRir, note: `Unilateral quad, ${sets} sarjaa` },
            { role: "accessory", category: "alaraaja", defaultMovementName: "Pohjenosto",
              sets, reps: 15, targetVx: targetRir, note: `Calf, ${sets} sarjaa` },
            { role: "accessory", category: "core", defaultMovementName: "Hanging leg raise",
              sets, reps: 12, targetVx: null },
          ],
        },
      ],
    };
  });

  return {
    mesocycleId: uid(),
    type: "minimalistRP",
    startDateISO: startDateISO || todayISO(),
    weekCount: 4,
    weekDefs,
    weekPlans,
    postCycleAnalysis: null,
    _programMeta: {
      source: "Israetel RP-blogi 2017+ (rpstrength.com Training Volume Landmarks)",
      status: "DOKUMENTOITU (ei VERIFIOITU peer-reviewed); 'Effective reps' on Beardsleyn (~2017), ei Israetelin",
      volumeLandmarksDocumented: true,
      mevToMavProgression: setsPerWeek,
      rirRangeMain: [0, 2],
      streetliftingApplicabilityWarning: "RP MV/MEV/MAV/MRV on hypertrofialle (30-85% 1RM, 5-30 reps). 1RM-spesialisaatio (≥85% 1RM) on volyymilandmarkin ulkopuolella → käytä RP:tä apuliikkeisiin, ei pääliikkeen 1RM-progressioon.",
    },
  };
}

// ── Smolov Jr (4 vk = 3 vk harjoitus + 1 vk lepoviikko/1RM-testi) ──
// DOKUMENTOITU yhteisö (smolovjr.com, Lift Vault, PowerliftingToWin)
// HUOM: Tsatsouline kanoninen 13 vk Smolov EI suositella streetliftingiin.
// Smolov Jr on lyhyempi, jaettu volyymi → riskialttomampi advanced-lifterille.
// PAKOLLISIA EHTOJA: training max ≤90% todellisesta 1RM:stä, max 1 sykli, 1 liike kerrallaan.
function createSmolovJrMesocycle(startDateISO) {
  // Smolov Jr klassinen 4-päiväinen rakenne:
  //   Day 1: 6×6 @ 70%
  //   Day 2: 7×5 @ 75%
  //   Day 3: 8×4 @ 80%
  //   Day 4: 10×3 @ 85%
  // Kuormalisäys per viikko: +5-10 lbs/päivä (vk2), +10-20 lbs/päivä (vk3)
  // Approksimaatio metric: +2.5-5 kg/päivä vk2, +5-10 kg/päivä vk3
  const smolovDays = [
    { dow: 1, sets: 6, reps: 6, basePct: 0.70, label: "Smolov Jr Day 1 (6×6@70%)" },
    { dow: 2, sets: 7, reps: 5, basePct: 0.75, label: "Smolov Jr Day 2 (7×5@75%)" },
    { dow: 4, sets: 8, reps: 4, basePct: 0.80, label: "Smolov Jr Day 3 (8×4@80%)" },
    { dow: 6, sets: 10, reps: 3, basePct: 0.85, label: "Smolov Jr Day 4 (10×3@85%)" },
  ];

  // Vk-multiplierit: vk1 = base, vk2 = +0.025, vk3 = +0.05, vk4 = lepo + 1RM-testi
  const weekDefs = [
    { week: 1, deltaPctBase: 0,     label: "Smolov Jr vk1 (base)",     heavyReps: 4, heavyTargetVx: 2 },
    { week: 2, deltaPctBase: 0.025, label: "Smolov Jr vk2 (+2.5%)",    heavyReps: 4, heavyTargetVx: 1 },
    { week: 3, deltaPctBase: 0.05,  label: "Smolov Jr vk3 (+5%) peak", heavyReps: 4, heavyTargetVx: 1 },
    { week: 4, deltaPctBase: -0.25, label: "Smolov Jr vk4 (lepo + 1RM-testi)", heavyReps: 1, heavyTargetVx: 1 },
  ];

  const buildSmolovDay = (sd, weekMult, isTestWeek) => {
    if (isTestWeek) {
      // Vk4 = lepo + 1RM-testi (vain 1 sessio sd.dow=1)
      if (sd.dow !== 1) return null;
      return {
        dayOfWeek: 1, dayType: "heavy", label: "Smolov Jr vk4 — 1RM-testi",
        slots: [
          { role: "primary", category: "alaraaja", defaultMovementName: "Takakyykky",
            sets: 1, reps: 1, targetVx: 1, note: "1RM-testi (uusi PR-arvio)" },
          { role: "accessory", category: "core", defaultMovementName: "Pallof press",
            sets: 3, reps: 10, targetVx: null, note: "Aktiivinen palautuminen" },
        ],
      };
    }
    const adjustedPct = sd.basePct * (1 + weekMult);
    return {
      dayOfWeek: sd.dow, dayType: "heavy", label: sd.label,
      slots: [
        // Smolov Jr -pääliike (default Takakyykky; substituutio leuka/dippi atletin tarpeen mukaan)
        {
          role: "primary", category: "alaraaja", defaultMovementName: "Takakyykky",
          sets: sd.sets, reps: sd.reps, targetVx: 2,
          loadPct: Math.min(0.95, adjustedPct), // hard cap 95%
          note: `${sd.sets}×${sd.reps} @ ${Math.round(adjustedPct*100)}% (TM ≤90% todellisesta 1RM:stä)`,
        },
        // Minimal accessory volyymitukena
        { role: "accessory", category: "core", defaultMovementName: "Hanging leg raise",
          sets: 3, reps: 10, targetVx: null },
      ],
    };
  };

  const weekPlans = weekDefs.map((wd, idx) => {
    const isTestWeek = idx === 3;
    const weekMult = idx === 0 ? 0 : (idx === 1 ? 0.025 : (idx === 2 ? 0.05 : 0));
    const days = smolovDays.map(sd => buildSmolovDay(sd, weekMult, isTestWeek)).filter(d => d !== null);
    return { week: wd.week, days };
  });

  return {
    mesocycleId: uid(),
    type: "smolovJr",
    startDateISO: startDateISO || todayISO(),
    weekCount: 4,
    weekDefs,
    weekPlans,
    postCycleAnalysis: null,
    _programMeta: {
      source: "Smolov Jr (Sergei Smolov / Tsatsouline-välitys; yhteisön mukautus smolovjr.com)",
      status: "DOKUMENTOITU yhteisö (kanoninen 13 vk Smolov EI suositella streetliftingiin)",
      durationWeeks: 4,
      sessionsPerWeek: 4,
      trainingMaxCapPct: 0.90,        // ≤90% todellisesta 1RM:stä
      streetliftingApplicabilityWarning: "13 vk täys-Smolov on KONTRAINDIKOITU advanced streetlifting-lifterille (jännerakenne-riski). Smolov Jr (3 vk + lepoviikko) on järkevämpi mukautus, mutta vain yksi liike kerrallaan (leuka TAI dippi, ei molemmat samanaikaisesti).",
      mandatoryConditions: [
        "Training max ≤90% todellisesta 1RM:stä",
        "Max 1 sykli ilman lepoviikkoa",
        "Vain yksi liike kerrallaan (leuka TAI dippi)",
        "Selvä deload/peakaus syklin jälkeen",
      ],
    },
  };
}

// ── Coan-Phillipi (11 vk = 10 vk + meet vk 11) ──
// KORJATTU: Alkuperäinen on 10 vk + meet, EI 12 vk. Mark Phillipi -essee
// (powerpage.net, URL kuollut), EI Marty Gallagher.
// "Desired 1RM" = current 1RM + 9-18 kg (atletin valinta tavoitteen mukaan).
function createCoanPhillipiMesocycle(startDateISO) {
  // 10+1 vk taulukko Mark Phillipi -alkuperäisesta + mirror-versioista
  const cpWeeks = [
    { week: 1,  heavyPct: 0.75, heavySets: 1, heavyReps: 2, speedPct: 0.60, speedSets: 8, speedReps: 3, label: "CP vk1" },
    { week: 2,  heavyPct: 0.80, heavySets: 1, heavyReps: 2, speedPct: 0.65, speedSets: 8, speedReps: 3, label: "CP vk2" },
    { week: 3,  heavyPct: 0.85, heavySets: 1, heavyReps: 2, speedPct: 0.70, speedSets: 6, speedReps: 3, label: "CP vk3" },
    { week: 4,  heavyPct: 0.90, heavySets: 1, heavyReps: 2, speedPct: 0.75, speedSets: 5, speedReps: 3, label: "CP vk4" },
    { week: 5,  heavyPct: 0.80, heavySets: 3, heavyReps: 3, speedPct: 0.65, speedSets: 3, speedReps: 3, label: "CP vk5 (ainoa moni-työsarjainen)" },
    { week: 6,  heavyPct: 0.85, heavySets: 1, heavyReps: 2, speedPct: 0.70, speedSets: 3, speedReps: 3, label: "CP vk6" },
    { week: 7,  heavyPct: 0.90, heavySets: 1, heavyReps: 2, speedPct: 0.75, speedSets: 3, speedReps: 3, label: "CP vk7" },
    { week: 8,  heavyPct: 0.95, heavySets: 1, heavyReps: 2, speedPct: 0.70, speedSets: 3, speedReps: 3, label: "CP vk8" },
    { week: 9,  heavyPct: 0.975, heavySets: 1, heavyReps: 1, speedPct: 0.70, speedSets: 2, speedReps: 3, label: "CP vk9" },
    { week: 10, heavyPct: 1.00, heavySets: 1, heavyReps: 1, speedPct: 0.60, speedSets: 2, speedReps: 3, label: "CP vk10 peak" },
    { week: 11, heavyPct: null, heavySets: 0, heavyReps: 0, speedPct: null, speedSets: 0, speedReps: 0, label: "CP vk11 MEET (avaa 100%+)" },
  ];

  const weekDefs = cpWeeks.map(w => ({
    week: w.week,
    deltaPctBase: w.heavyPct ? (w.heavyPct - 0.75) : 0,
    label: w.label,
    heavyReps: w.heavyReps || 1,
    heavyTargetVx: w.week === 11 ? 1 : (w.heavyPct >= 0.95 ? 1 : 2),
  }));

  // Assistance per viikko-kategoria
  const buildAssistance = (week) => {
    if (week <= 4) {
      // Vk 1-4: circuit (Stiff-leg DL + BB row + lat pulldown + good morning)
      return [
        { role: "accessory", category: "alaraaja", defaultMovementName: "Romanian DL",
          sets: 3, reps: 8, targetVx: 3, note: "Circuit (3 kierrosta, 90 s liike, 2-3 min kierros)" },
        { role: "accessory", category: "horisontaaliveto", defaultMovementName: "Penkkiveto",
          sets: 3, reps: 8, targetVx: 3, note: "Circuit" },
        { role: "accessory", category: "vertikaaliveto", defaultMovementName: "Ylätalja",
          sets: 3, reps: 8, targetVx: 3, note: "Lat PD circuit" },
        { role: "accessory", category: "alaraaja", defaultMovementName: "Good morning",
          sets: 3, reps: 8, targetVx: 3, note: "Circuit" },
      ];
    }
    if (week === 5 || week === 6) {
      const shrugPct = week === 5 ? 0.60 : 0.65;
      return [
        { role: "accessory", category: "muu", defaultMovementName: "Power shrug",
          sets: 3, reps: 5, targetVx: 2, loadPct: shrugPct, note: `Power shrugs @ ${Math.round(shrugPct*100)}% 1RM` },
        { role: "accessory", category: "alaraaja", defaultMovementName: "Romanian DL",
          sets: 3, reps: 5, targetVx: 3 },
        { role: "accessory", category: "horisontaaliveto", defaultMovementName: "Penkkiveto",
          sets: 3, reps: 5, targetVx: 3 },
        { role: "accessory", category: "vertikaaliveto", defaultMovementName: "Ylätalja",
          sets: 3, reps: 5, targetVx: 3 },
        { role: "accessory", category: "alaraaja", defaultMovementName: "Good morning",
          sets: 3, reps: 5, targetVx: 3 },
      ];
    }
    if (week === 7 || week === 8) {
      const shrugPct = week === 7 ? 0.70 : 0.75;
      return [
        { role: "accessory", category: "muu", defaultMovementName: "Power shrug",
          sets: 2, reps: 5, targetVx: 2, loadPct: shrugPct, note: `Power shrugs @ ${Math.round(shrugPct*100)}%` },
        { role: "accessory", category: "alaraaja", defaultMovementName: "Romanian DL",
          sets: 2, reps: 5, targetVx: 3 },
        { role: "accessory", category: "horisontaaliveto", defaultMovementName: "Penkkiveto",
          sets: 2, reps: 5, targetVx: 3 },
      ];
    }
    if (week === 9) {
      return [
        { role: "accessory", category: "muu", defaultMovementName: "Power shrug",
          sets: 2, reps: 5, targetVx: 2, loadPct: 0.75 },
        { role: "accessory", category: "alaraaja", defaultMovementName: "Romanian DL",
          sets: 2, reps: 5, targetVx: 3 },
      ];
    }
    // Vk 10 + 11: ei assistance-työtä
    return [];
  };

  const weekPlans = cpWeeks.map(w => {
    if (w.week === 11) {
      // MEET-viikko: vain 1 päivä, openeri + attempts
      return {
        week: 11,
        days: [{
          dayOfWeek: 6, dayType: "heavy", label: "CP MEET — DL 100%+",
          slots: [{
            role: "primary", category: "alaraaja", defaultMovementName: "Maastaveto",
            sets: 1, reps: 1, targetVx: 1, loadPct: 1.00, note: "MEET-päivä: opener 92.5%, 2nd 97.5%, 3rd 100%+",
          }],
        }],
      };
    }
    return {
      week: w.week,
      days: [{
        dayOfWeek: 6, dayType: "heavy", label: w.label,
        slots: [
          // Heavy DL
          { role: "primary", category: "alaraaja", defaultMovementName: "Maastaveto",
            sets: w.heavySets, reps: w.heavyReps, targetVx: w.heavyPct >= 0.95 ? 1 : 2,
            loadPct: w.heavyPct, note: `Heavy: ${w.heavySets}×${w.heavyReps} @ ${Math.round(w.heavyPct*100)}% Desired 1RM` },
          // Speed-work
          { role: "backoff", category: "alaraaja", defaultMovementName: "Maastaveto",
            sets: w.speedSets, reps: w.speedReps, targetVx: 4,
            loadPct: w.speedPct, note: `Speed: ${w.speedSets}×${w.speedReps} @ ${Math.round(w.speedPct*100)}%` },
          // Assistance
          ...buildAssistance(w.week),
        ],
      }],
    };
  });

  return {
    mesocycleId: uid(),
    type: "coanPhillipi",
    startDateISO: startDateISO || todayISO(),
    weekCount: 11,
    weekDefs,
    weekPlans,
    postCycleAnalysis: null,
    _programMeta: {
      source: "Mark Phillipi -alkuperäisessee (powerpage.net, URL kuollut); Mirror: ontariostrongman, tsampa, stoic, liftvault",
      status: "DOKUMENTOITU yhteisökonsensus (kanoninen 10+1 vk, EI 12 vk)",
      durationWeeks: 11,
      sessionsPerWeekDL: 1,
      desiredOneRmFormula: "current_1RM + 9-18 kg",
      peakWeek: 10,
      meetWeek: 11,
      streetliftingApplicabilityWarning: "Coan-Phillipi on DL-spesifinen yksittäisliike-spesialisaatio. Streetlifting-mukautus = COAN-PHILLIPI-DERIVED (vaihda DL → leuka/dippi). Speed-work-volyymi (60% × 8×3 = 24 reps) on liian olkapää-kuormittava lisäpaino-leukailussa → pienennä 30-40% kun substituoit.",
      taskCorrections: [
        "10 vk + meet vk 11, EI 12 vk",
        "Mark Phillipi (ei 'Karl Phillipi')",
        "Mark Phillipin oma essee (ei Marty Gallagher)",
      ],
    },
  };
}

// ─── AMRAP-konversio (Epley primary + Brzycki vertailu) ───────────────
// Tutkimuspohja: Epley 1985 (Poundage Chart), Brzycki 1993 (JOPERD 64(1):88-90)
// Reynolds 2006 (PDF-VERIFIOITU): >10 reps → linear-formulat epäluotettavia.
// Wendler-kirjan kaava = Epley (PDF-VERIFIOITU yhdenmukaisuus).
const MAX_RELIABLE_AMRAP_REPS = 10;       // PDF-VERIFIOITU (Reynolds 2006)
const AMRAP_DEFAULT_RIR = 1;              // RISTIINTARKISTETTU (Wendler "1-2 reps in tank")

function calculateE1RM_Epley(weight, reps) {
  if (!Number.isFinite(weight) || weight <= 0) return 0;
  if (!Number.isFinite(reps) || reps < 1) return 0;
  if (reps === 1) return weight;
  return weight * (1 + reps / 30);
}

function calculateE1RM_Brzycki(weight, reps) {
  if (!Number.isFinite(weight) || weight <= 0) return 0;
  if (!Number.isFinite(reps) || reps < 1) return 0;
  if (reps >= 37) return 0; // Brzycki diverges
  if (reps === 1) return weight;
  return weight / (1.0278 - 0.0278 * reps);
}

// AMRAP-rep-määrästä → e1RM-arvio + reliability-info.
// Käytetään esim. Wendler vk 3 1+ -sarjassa: jos atletti saa 5 toistoa @ 95% TM,
// e1RM nousee niin paljon että seuraavan syklin TM voi nousta enemmän kuin
// vakio +5/+10 lb. Tämä on Wendlerin "PR-set"-päätös.
function amrapToE1RM(weight, achievedReps) {
  const epley = calculateE1RM_Epley(weight, achievedReps);
  const brzycki = calculateE1RM_Brzycki(weight, achievedReps);
  const divergencePct = epley > 0 ? Math.abs(epley - brzycki) / epley * 100 : 0;
  return {
    e1rmPrimary: epley,
    e1rmBrzycki: brzycki,
    divergencePct,
    isReliable: achievedReps <= MAX_RELIABLE_AMRAP_REPS,
    warning: achievedReps > MAX_RELIABLE_AMRAP_REPS
      ? "Reynolds 2006: linear formulas unreliable >10 reps" : null,
    confidence: achievedReps <= 5 ? "high"
              : achievedReps <= 10 ? "medium" : "low",
    inferredRir: AMRAP_DEFAULT_RIR,
    formulaUsed: "epley",
    source: "Epley 1985 + Reynolds 2006 R²-validointi",
  };
}

// ═══════════════════════════════════════════════════════════════
// PROGRAM GENERATOR / WIZARD (v4.27)
// ═══════════════════════════════════════════════════════════════
//
// Tavoite: käyttäjän vastauksista optimaalinen mesosykli.
//
// Lähestymistapa: "Skeleton + Role-pohjainen accessory-remapping".
// 1. Käyttäjän tavoite (hypertrofia/maksimivoima/yhdistelmä/undulating)
//    valitsee POHJAPRESEETIN. Sen weekPlans on asiantuntijan käsintehty ja
//    sisältää optimaalit rep/Vx/sets/deltaPct-skeemat per viikko.
// 2. Kaikki primary + backoff -slottien liikkeet vaihdetaan käyttäjän
//    valitsemiksi päälikkeiksi (useita → rotatoidaan eri päiville).
// 3. Accessory-slottien alkuperäinen kategoria mapataan FUNKTIONAALISEEN
//    ROOLIIN (COMPLEMENT/SECONDARY/BALANCE/ARM_SYN/ARM_ANT/CORE) — tämä
//    on rooli jonka slot täyttää suhteessa leuka-primaryyn skeletissa.
//    Sitten rooli kartoitetaan UUDEN primaryn kontekstiin: "mikä kategoria
//    ja mikä liike täyttäisi tämän saman roolin kun primary on penkki/kyykky/jne?"
// 4. weekCount ja daysPerWeek skaalautuvat: 4→8→12 vk toistamalla
//    blokkirakennetta; 3→4 pv lisäämällä upper/lower-split-päivä.
// 5. Palautumiskyky kertoo accessory-sarjat (hyva 1.0, keski 0.85, heikko 0.70).
//
// EVIDENSSI: liikevalinnat louhittu preseeteistä (Akken ja kirjallisuus-
// pohjaiset valinnat), ei generoitu algoritmisesti. ROLE-mappaus perustuu
// voima-harjoittelun antagonisti/synergisti-teoriaan (Schoenfeld, Helms).

// ── PRIMARY CATEGORY PROFILES ──
// Jokaiselle mahdolliselle primary-kategorialle: mikä liike/kategoria
// täyttää kunkin roolin. "top"-listan järjestys = preferenssijärjestys.
const PRIMARY_CATEGORY_PROFILES = {
  vertikaaliveto: {
    label: "Vertikaaliveto (leuka, pull-up)",
    COMPLEMENT:  { category: "vertikaaliveto",    top: ["Ylätalja", "Lat pulldown", "Ylätalja neutraaliote", "Pullover kone"] },
    SECONDARY:   { category: "horisontaaliveto",  top: ["Penkkiveto", "Alatalja", "Seated row", "Chest-supported row", "T-bar row"] },
    BALANCE_1:   { category: "horisontaalityöntö", top: ["Penkkipunnerrus", "Dippi", "Vinopenkkipunnerrus", "Chest press"] },
    BALANCE_2:   { category: "vertikaalityöntö",   top: ["Pystypunnerrus", "Pystypunnerrus käsipainot", "Shoulder press laite"] },
    ARM_SYN:     { category: "hauisfleksio",      top: ["Hauiskääntö tanko", "Hammer curl", "Hauiskääntö käsipainot", "Preacher curl"] },
    ARM_ANT:     { category: "ojentajaekstensio", top: ["Tricep pushdown", "Overhead tricep ext", "Skull crusher"] },
    CORE:        { category: "core",              top: ["Hanging leg raise", "Cable crunch", "Ab wheel rollout", "Pallof press"] },
  },
  horisontaalityöntö: {
    label: "Horisontaalityöntö (penkkipunnerrus, dippi)",
    COMPLEMENT:  { category: "horisontaalityöntö", top: ["Vinopenkkipunnerrus", "Chest press", "Close-grip bench"] },
    SECONDARY:   { category: "vertikaalityöntö",   top: ["Pystypunnerrus käsipainot", "Shoulder press laite"] },
    BALANCE_1:   { category: "vertikaaliveto",    top: ["Ylätalja", "Lat pulldown", "Pullover kone"] },
    BALANCE_2:   { category: "horisontaaliveto",  top: ["Seated row", "Chest-supported row", "T-bar row"] },
    ARM_SYN:     { category: "ojentajaekstensio", top: ["Tricep pushdown", "Skull crusher", "Overhead tricep ext", "French press"] },
    ARM_ANT:     { category: "hauisfleksio",      top: ["Hauiskääntö tanko", "Hammer curl"] },
    CORE:        { category: "core",              top: ["Hanging leg raise", "Cable crunch", "Ab wheel rollout"] },
  },
  alaraaja: {
    label: "Alaraaja (kyykky, maave)",
    // COMPLEMENT rikastettu v4.27.1: RDL, Front squat, Paused squat ym. variantit ovat
    // aitoja kyykky/maaveto-spesifisiä tukiliikkeitä (Brookfield, Bromley). "Paused squat"
    // ja "Front squat" parantavat kyykkyä suoraan, "Romanian DL" ja "Deficit DL" maavetoa.
    COMPLEMENT:  { category: "alaraaja",          top: ["Romanian DL", "Front squat", "Paused squat", "Deficit DL", "Hip thrust", "Pin squat", "Bulgarian split squat"] },
    SECONDARY:   { category: "alaraaja",          top: ["Jalkaprässi", "Leg extension", "Front-foot elevated split squat", "Leg curl", "Walking lunge"] },
    BALANCE_1:   { category: "horisontaaliveto",  top: ["Seated row", "Chest-supported row"] },
    BALANCE_2:   { category: "horisontaalityöntö", top: ["Vinopenkkipunnerrus", "Chest press"] },
    ARM_SYN:     { category: "alaraaja",          top: ["Pohjenosto", "Leg curl"] },
    ARM_ANT:     { category: "hauisfleksio",      top: ["Hauiskääntö tanko", "Hammer curl"] },
    CORE:        { category: "core",              top: ["Hanging leg raise", "Ab wheel rollout", "Pallof press", "Cable crunch"] },
  },
  vertikaalityöntö: {
    label: "Vertikaalityöntö (pystypunnerrus)",
    COMPLEMENT:  { category: "vertikaalityöntö",   top: ["Pystypunnerrus käsipainot", "Shoulder press laite", "Sivunosto"] },
    SECONDARY:   { category: "horisontaalityöntö", top: ["Vinopenkkipunnerrus", "Close-grip bench", "Chest press"] },
    BALANCE_1:   { category: "vertikaaliveto",    top: ["Ylätalja", "Lat pulldown", "Pullover kone"] },
    BALANCE_2:   { category: "horisontaaliveto",  top: ["Seated row", "Chest-supported row"] },
    ARM_SYN:     { category: "ojentajaekstensio", top: ["Tricep pushdown", "Overhead tricep ext", "Skull crusher"] },
    ARM_ANT:     { category: "hauisfleksio",      top: ["Hauiskääntö tanko", "Hammer curl"] },
    CORE:        { category: "core",              top: ["Hanging leg raise", "Cable crunch"] },
  },
  horisontaaliveto: {
    label: "Horisontaaliveto (soutuliikkeet)",
    COMPLEMENT:  { category: "horisontaaliveto",  top: ["Seal row", "T-bar row", "Cable row", "Chest-supported row"] },
    SECONDARY:   { category: "vertikaaliveto",    top: ["Ylätalja", "Lat pulldown", "Pullover kone"] },
    BALANCE_1:   { category: "horisontaalityöntö", top: ["Vinopenkkipunnerrus", "Chest press"] },
    BALANCE_2:   { category: "vertikaalityöntö",   top: ["Pystypunnerrus käsipainot", "Shoulder press laite"] },
    ARM_SYN:     { category: "hauisfleksio",      top: ["Hauiskääntö tanko", "Hammer curl"] },
    ARM_ANT:     { category: "ojentajaekstensio", top: ["Tricep pushdown"] },
    CORE:        { category: "core",              top: ["Hanging leg raise", "Cable crunch"] },
  },
  hauisfleksio: {
    label: "Hauisfleksio (hauiskääntö primaryna — epätavallinen)",
    COMPLEMENT:  { category: "hauisfleksio",      top: ["Hammer curl", "Preacher curl", "Incline curl", "Spider curl", "Cable curl"] },
    SECONDARY:   { category: "vertikaaliveto",    top: ["Ylätalja neutraaliote", "Ylätalja", "Lat pulldown"] },
    BALANCE_1:   { category: "ojentajaekstensio", top: ["Tricep pushdown", "Skull crusher"] },
    BALANCE_2:   { category: "horisontaalityöntö", top: ["Vinopenkkipunnerrus"] },
    ARM_SYN:     { category: "horisontaaliveto",  top: ["Seated row", "Cable row"] },
    ARM_ANT:     { category: "vertikaalityöntö",   top: ["Pystypunnerrus käsipainot"] },
    CORE:        { category: "core",              top: ["Hanging leg raise"] },
  },
  ojentajaekstensio: {
    label: "Ojentajaekstensio (primaryna — epätavallinen)",
    COMPLEMENT:  { category: "ojentajaekstensio", top: ["Overhead tricep ext", "Skull crusher", "French press", "Kickback"] },
    SECONDARY:   { category: "horisontaalityöntö", top: ["Close-grip bench", "Vinopenkkipunnerrus", "Chest press"] },
    BALANCE_1:   { category: "hauisfleksio",      top: ["Hauiskääntö tanko", "Hammer curl"] },
    BALANCE_2:   { category: "vertikaaliveto",    top: ["Ylätalja", "Lat pulldown"] },
    ARM_SYN:     { category: "vertikaalityöntö",   top: ["Pystypunnerrus käsipainot"] },
    ARM_ANT:     { category: "horisontaaliveto",  top: ["Seated row"] },
    CORE:        { category: "core",              top: ["Hanging leg raise"] },
  },
};

// v4.27.2 — PRIMARY-NIMEN perusteella ohjautuvat profiilit.
// Kun käyttäjä valitsee spesifin päälikkeen (esim. "Maastaveto"), COMPLEMENT-
// ja SECONDARY-roolit ohjautuvat LIIKE-SPESIFEIHIN variantteihin eivätkä vain
// yleiseen alaraaja-kategoriaan. Tämä nostaa penkki/maave/kyykky-ohjelmat
// eliittitasolle: alaraaja-bucket ei enää niputa maaveto-variantteja kyykkyyn.
//
// Prioriteetti: PRIMARY_SPECIFIC_PROFILES[primaryName][role] > PRIMARY_CATEGORY_PROFILES[category][role]
// Jos primaryName ei löydy tai rooli puuttuu overridesta → fallback kategoriaprofiiliin.
//
// Lähteet:
// - Bromley "Base Strength" (DL-variantit: RDL, pause DL, deficit, block pull)
// - Calgary Barbell (pause bench, spoto, Larsen penkkipunnerruksen rakentajina)
// - Juggernaut (SSB squat, front squat, pin squat kyykyn tukiliikkeinä)
// - Helms "Muscle & Strength Pyramid" (variant selection principles per lift)
const PRIMARY_SPECIFIC_PROFILES = {
  "Maastaveto": {
    // COMPLEMENT = maaveto-spesifit variantit. RDL ensin (pakaran + takareiden volyymi
    // joka tukee suoraan kisamaavetoa), sitten pausat/deficit/block → range of motion
    // ja spesifit heikkoudet.
    COMPLEMENT: { category: "alaraaja", top: ["Romanian DL", "Paused DL", "Deficit DL", "Block pull", "Snatch-grip DL", "Good morning"] },
    // SECONDARY = kyykky-variantit posterior chainille + unilateraaliset.
    SECONDARY:  { category: "alaraaja", top: ["Front squat", "Bulgarian split squat", "Hip thrust", "Walking lunge", "Jalkaprässi"] },
  },
  "Takakyykky": {
    COMPLEMENT: { category: "alaraaja", top: ["Front squat", "Pin squat", "Paused squat", "Safety bar squat", "Box squat", "Bulgarian split squat"] },
    SECONDARY:  { category: "alaraaja", top: ["Romanian DL", "Hip thrust", "Walking lunge", "Jalkaprässi", "Leg curl"] },
  },
  "Kyykky": { // alias — sama kuin Takakyykky
    COMPLEMENT: { category: "alaraaja", top: ["Front squat", "Pin squat", "Paused squat", "Safety bar squat", "Box squat", "Bulgarian split squat"] },
    SECONDARY:  { category: "alaraaja", top: ["Romanian DL", "Hip thrust", "Walking lunge", "Jalkaprässi", "Leg curl"] },
  },
  "Penkkipunnerrus": {
    // COMPLEMENT = penkki-spesifit: pause/spoto/Larsen rakentavat kisapenkkiä;
    // CGBP + board = triceps/lockout; incline = pec volume.
    COMPLEMENT: { category: "horisontaalityöntö", top: ["Paused bench press", "Close-grip bench", "Spoto press", "Larsen press", "Board press", "Vinopenkkipunnerrus"] },
    // SECONDARY = vertikaalityöntö penkkiä tukevat (olkavoima → lockout tuki).
    SECONDARY:  { category: "vertikaalityöntö", top: ["Pystypunnerrus käsipainot", "Push press", "Seated OHP", "Shoulder press laite"] },
  },
  "Pystypunnerrus": {
    // COMPLEMENT = OHP-spesifit: push press (raskaampi overload), seated (pelkkä olka),
    // Z-press (core + ryhti), käsipainot (asymmetria/liikerata).
    COMPLEMENT: { category: "vertikaalityöntö", top: ["Push press", "Seated OHP", "Z-press", "Pystypunnerrus käsipainot", "Shoulder press laite"] },
    // SECONDARY = penkki-variantit (olkapunnerrus + tricep tuki).
    SECONDARY:  { category: "horisontaalityöntö", top: ["Vinopenkkipunnerrus", "Close-grip bench", "Larsen press", "Chest press"] },
  },
};

// Skelettien (leuka-primary-preseettien) kategoria → funktionaalinen rooli.
// Käytetään kun clooni-preseetistä haetaan uuden primaryn vastaavaa slotia.
const SKELETON_CATEGORY_TO_ROLE = {
  vertikaaliveto:     "COMPLEMENT",    // Ylätalja = saman pattern variaatio
  horisontaaliveto:   "SECONDARY",     // Penkkiveto/Alatalja = toisen pull-akselin liike
  horisontaalityöntö: "BALANCE_1",     // Penkkipunnerrus = antagonist push (horizontal)
  vertikaalityöntö:   "BALANCE_2",     // Pystypunnerrus = antagonist push (vertical)
  hauisfleksio:       "ARM_SYN",       // Hauiskääntö = pull-synergist
  ojentajaekstensio:  "ARM_ANT",       // Tricep = push-antagonist (tasapainotus)
  core:               "CORE",          // Core stays core
  alaraaja:           "SECONDARY",     // fallback (leuka-presetit eivät käytä)
  muu:                "CORE",          // grip/other → core-ekvivalentti
};

// Goal → skeleton preset factory name
// v4.49.0 (Track B Vaihe 2D-γ): laajennettu 10 → 16 single-block-tyyliin.
// Uudet 2D-γ: westsideConjugate (4 vk), gzclJT20 (12 vk), sheikoDerived (4 vk),
// minimalistRP (4 vk), smolovJr (4 vk), coanPhillipi (11 vk).
const GOAL_SKELETONS = {
  hypertrofia:        "createHypertrofiaMesocycle",
  maksimivoima:       "createMaksimivoimaMesocycle",
  yhdistelma:         "createDefaultMesocycle",
  undulating:         "createDUPMesocycle",
  eksentrinen:        "createEksenterinenMesocycle",
  siirtyma:           "createSiirtymaMesocycle",
  palautuminen:       "createPalautuminenMesocycle",
  // 2D-β:
  wendler531:         "createWendler531Mesocycle",
  topSetBackoff:      "createTopSetBackoffMesocycle",
  madcow5x5:          "createMadcow5x5Mesocycle",
  // 2D-γ:
  westsideConjugate:  "createWestsideConjugateMesocycle",
  gzclJT20:           "createGZCLMesocycle",
  sheikoDerived:      "createSheikoDerivedMesocycle",
  minimalistRP:       "createMinimalistRPMesocycle",
  smolovJr:           "createSmolovJrMesocycle",
  coanPhillipi:       "createCoanPhillipiMesocycle",
};

// Natiivipituudet (vk) skeleton-factory:ille. Jos goalin natiivipituus !== 4
// → bypass scaleWeekCount() ja säilytä natiivipituus.
const GOAL_NATIVE_WEEKS = {
  hypertrofia:        4,
  maksimivoima:       4,
  yhdistelma:         4,
  undulating:         4,
  eksentrinen:        4,
  siirtyma:           3,
  palautuminen:       2,
  // 2D-β:
  wendler531:         4,
  topSetBackoff:      4,
  madcow5x5:          5,  // vk5 = PR-yritys (Powerliftingtowin RISTIINTARKISTETTU)
  // 2D-γ:
  westsideConjugate:  4,
  gzclJT20:           12, // 2× 6vk blokkia (Lefever J&T 2.0)
  sheikoDerived:      4,
  minimalistRP:       4,
  smolovJr:           4,  // 3 vk + 1 lepoviikko/1RM-testi
  coanPhillipi:       11, // 10 vk + meet vk 11 (Mark Phillipi alkuperäinen)
};

// ── Generator helpers ──

// Saa uuden accessory-slotin rooli-pohjaisesti.
// orig = alkuperäinen accessory-slot leuka-skeletissä.
// userPrimaryCategory = käyttäjän valitseman päälikkeen kategoria.
// primaryName (v4.27.2) = käyttäjän päälikkeen NIMI — käytetään PRIMARY_SPECIFIC_PROFILES-
//   overridekenttien valintaan. Fallback: jos primaryName ei löydy tai tietty rooli
//   puuttuu overridesta, käytetään kategoriapohjaista profiilia kuten ennen.
// weekIndex (v4.27.2) = mesosyklin viikon 0-indeksi — käytetään rotaatiokaavassa,
//   jotta variantit KIERTÄVÄT viikosta toiseen eikä sama variantti toistu 4 viikkoa.
function remapAccessorySlot(orig, userPrimaryCategory, primaryName, dayIndex, slotIndex, weekIndex = 0) {
  const role = SKELETON_CATEGORY_TO_ROLE[orig.category] || "CORE";
  const categoryProfile = PRIMARY_CATEGORY_PROFILES[userPrimaryCategory] || PRIMARY_CATEGORY_PROFILES.vertikaaliveto;
  const specificProfile = primaryName ? PRIMARY_SPECIFIC_PROFILES[primaryName] : null;
  // Override vain jos spesifinen profiili MÄÄRITTÄÄ tämän roolin. Muuten kategoria.
  const target = (specificProfile && specificProfile[role]) || categoryProfile[role] || categoryProfile.CORE;
  const movements = target.top;

  // IDENTITY PRESERVATION: jos alkuperäinen liike löytyy targetin top-listasta JA
  // kategoriat täsmäävät, pidä se. Tämä takaa että kun käyttäjä valitsee primaryn
  // jolle ei ole override-profiilia (esim. leuka = Lisäpainoleuanveto), ja sen kategoria
  // on sama kuin preset-skeletonin → accessoryt pysyvät bit-for-bit identtisinä.
  // Tärkeää: tämä guard ajetaan ENNEN rotaatiota, joten weekIndex ei voi rikkoa identtisyyttä.
  if (movements.includes(orig.defaultMovementName) && orig.category === target.category) {
    return { ...orig, variantName: null };
  }

  // Eri kategoria tai liikettä ei ole top-listassa → valitse rotation-idx:llä.
  // v4.27.2 rotation: weekIndex*1 + dayIndex*2 + slotIndex*3
  //   — weekIndex-kerroin 1: 4 vk yli saadaan 4 eri indeksiä (kunhan n≥4).
  //   — päivä/slot-kertoimet (2, 3): antaa hyvän intra-week-permutaation
  //     eri slot-paikoille, eikä kollisioita muodostu n∈{4,6,7}.
  //   — n=5 kanssa voi olla yksi kollision per viikko, mutta variantit
  //     kuitenkin kiertävät viikoittain, joten 4 vk:ssa nähdään kaikki.
  const movementIdx = (weekIndex + dayIndex * 2 + slotIndex * 3) % movements.length;
  return {
    ...orig,
    category: target.category,
    defaultMovementName: movements[movementIdx],
    // Älä siirrä variantName:ä — se on leuka-spesifinen
    variantName: null,
  };
}

// Substituoi primary/backoff-slotin uudeksi päälikkeeksi.
function substitutePrimarySlot(orig, primaryName, primaryCategory) {
  return {
    ...orig,
    category: primaryCategory,
    defaultMovementName: primaryName,
    variantName: null, // leuka-variantit ("Kilpaveto", "Korokeveto") eivät siirry muille primaryille
  };
}

// Kloonaa päivä päälikkeillä + remapatuilla accessoryilla.
// v4.27.2: weekIndex välitetään rotaatiokaavaan jotta variantit kiertävät viikoittain.
// Pilari 3 C1 (K, kategoria-slot-täyttö): täytä päivän primary-slotit primaari-SETISTÄ.
//   - single-slot-päivä  → lead (rotaatio päivien yli; säilyttää streetlifting/default-käytöksen
//                          BITTITARKKANA — leadit = primaries[dIdx % n] kuten ennen).
//   - monislot-päivä     → kategoria-osuma per slot (käyttämätön ensin) → useita distinct primaareja
//                          samaan sessioon = aito full_body, korjaa #3 (volyymi ei kasaudu yhdelle).
//   - backoff            → seuraa edeltävää primarya (sama lift kevyempänä).
// primaries = [{name,category}]; leadPrimary = tämän päivän emphasis (accessory-remap + single-slot).
function cloneDayWithPrimary(origDay, primaries, leadPrimary, dayIndex, weekIndex = 0) {
  // Ryhmittele DISTINCT alkuperäisten primary-slottien KATEGORIOIDEN mukaan (EI per slot) —
  // näin Madcow-ramppi (5 perättäistä alaraaja-slottia) pysyy YHTENÄ liikkeenä eikä scramblaudu.
  const primaryCats = [...new Set(origDay.slots.filter(s => s.role === "primary").map(s => s.category))];
  const multiSlot = primaryCats.length > 1; // useita distinct kategorioita = aito multi-lift -päivä
  const catToPrimary = {};
  if (multiSlot) {
    const used = new Set();
    for (const cat of primaryCats) {
      // kategoria-osuma (käyttämätön) → seuraava käyttämätön → lead. Yksi primaari per kategoria-ryhmä.
      const prim = primaries.find(p => p.category === cat && !used.has(p.name))
                || primaries.find(p => !used.has(p.name))
                || leadPrimary;
      used.add(prim.name);
      catToPrimary[cat] = prim;
    }
  }
  let lastPrimary = leadPrimary;
  const newSlots = [];
  let slotIdx = 0;
  for (const s of origDay.slots) {
    if (s.role === "primary") {
      // multiSlot → kategoria-ryhmän primaari (ramppi säilyy); single-slot → lead (rotaatio).
      const prim = multiSlot ? (catToPrimary[s.category] || leadPrimary) : leadPrimary;
      lastPrimary = prim;
      newSlots.push(substitutePrimarySlot(s, prim.name, prim.category));
    } else if (s.role === "backoff") {
      newSlots.push(substitutePrimarySlot(s, lastPrimary.name, lastPrimary.category));
    } else if (s.role === "accessory") {
      newSlots.push(remapAccessorySlot(s, leadPrimary.category, leadPrimary.name, dayIndex, slotIdx, weekIndex));
    } else {
      // warmup/opener/attempt — kopioi sellaisenaan
      newSlots.push({ ...s });
    }
    slotIdx++;
  }
  return {
    ...origDay,
    slots: newSlots,
  };
}

// Skaalaa accessoryjen set-määrät palautumiskyvyn mukaan.
// scalar < 1 vähentää sarjamäärää (floor min 1).
function applyRecoveryScalar(weekPlans, scalar) {
  if (scalar >= 0.99) return weekPlans;
  return weekPlans.map(wp => ({
    ...wp,
    days: wp.days.map(d => ({
      ...d,
      slots: d.slots.map(s => {
        if (s.role !== "accessory") return s;
        return { ...s, sets: Math.max(1, Math.round((s.sets || 0) * scalar)) };
      }),
    })),
  }));
}

// Jaa päälikkeet eri päiville. Jos 1 primary → kaikki päivät käyttävät sitä.
// Jos 2+ → rotatoidaan.
function distributePrimariesToDays(weekPlans, primaries) {
  // primaries = [{ name, category }]
  if (primaries.length === 0) return weekPlans;
  // v4.27.2: viikko-indeksi (0-based wp.week-1) → cloneDayWithPrimary → remapAccessorySlot-rotaatio
  // kiertää variantteja viikosta toiseen.
  // Pilari 3 C1 (K): lead = primaries[dIdx % n] = päivän emphasis (rotaatio päivien yli).
  //   - 1 primaari → lead aina sama → single-slot kaikki sama (ennallaan).
  //   - useita → lead rotatoituu; cloneDayWithPrimary täyttää monislot-päivän kategoria-osumalla
  //     (aito full_body) ja single-slot-päivän leadilla (rotaatio, backward-compat).
  let result = weekPlans.map(wp => ({
    ...wp,
    days: wp.days.map((d, dIdx) => {
      const lead = primaries[dIdx % primaries.length];
      return cloneDayWithPrimary(d, primaries, lead, dIdx, (wp.week || 1) - 1);
    }),
  }));
  // Pilari 3 R2 (D): kun #primaries > #days, lead-rotaatio kattaa vain primaries[0..days-1] →
  // ekstra-primaarit (primaries[days..]) eivät saa primary-slottia → KATOAISIVAT. Ratifioitu:
  // demotaan ne accessory:ksi (EI hard-cap) → jokainen atletin ilmoittama primaari esiintyy
  // ohjelmassa joka viikko (primaarina TAI apuliikkeenä). No-op kun #primaries ≤ #days (bit-exact).
  result = result.map(wp => {
    const present = new Set();
    (wp.days || []).forEach(d => (d.slots || []).forEach(s => {
      if (s.role === "primary" && s.defaultMovementName) present.add(s.defaultMovementName);
    }));
    const missing = primaries.filter(p => p && p.name && !present.has(p.name));
    if (missing.length === 0) return wp;
    const days = wp.days.map(d => ({ ...d, slots: [...(d.slots || [])] }));
    missing.forEach(p => {
      // Injektoi vähiten kuormitettuun päivään (työsarjojen tasaus).
      let target = days[0], min = Infinity;
      for (const d of days) {
        const sets = d.slots.reduce((s, x) => s + (Number(x.sets) || 0), 0);
        if (sets < min) { min = sets; target = d; }
      }
      if (target) target.slots.push({
        role: "accessory", category: p.category, defaultMovementName: p.name,
        sets: 3, reps: 6, targetVx: 3, variantName: null, _demotedPrimary: true,
      });
    });
    return { ...wp, days };
  });
  return result;
}

// Skaalaa daysPerWeek: 3 → 4 tai 3 → 2.
// 4 pv: lisää ylimääräinen "volume"-tyyppinen päivä edellisen volume-päivän kopiona
// 2 pv: pudota viimeinen päivä
function adjustDaysPerWeek(weekPlans, targetDaysPerWeek) {
  return weekPlans.map(wp => {
    const currentDays = wp.days.length;
    if (currentDays === targetDaysPerWeek) return wp;

    if (targetDaysPerWeek > currentDays) {
      // Lisää päivä: kloonaa volume-päivä, siirrä eri dayOfWeek:lle
      const volumeDay = wp.days.find(d => d.dayType === "volume") || wp.days[wp.days.length - 1];
      const usedDows = new Set(wp.days.map(d => d.dayOfWeek));
      const candidateDows = [1, 2, 3, 4, 5, 6, 7].filter(d => !usedDows.has(d));
      const newDow = candidateDows[0] || 6;
      const newDay = {
        ...volumeDay,
        dayOfWeek: newDow,
        label: (volumeDay.label || "Perusvoima") + " (lisä)",
      };
      return { ...wp, days: [...wp.days, newDay].sort((a, b) => a.dayOfWeek - b.dayOfWeek) };
    }
    // targetDaysPerWeek < currentDays: pudota viimeiset
    return { ...wp, days: wp.days.slice(0, targetDaysPerWeek) };
  });
}

// Skaalaa weekCount: 4 → 8 tai 4 → 12.
// 8 vk: toista 4 vk skeleton kahdesti, toinen iteraatio hieman haastavampi (+0.02 deltaPctBase loadingissa)
// 12 vk: toista 3 kertaa, progressio Hyp → Voima → Peak -tyylinen
function scaleWeekCount(weekPlans, weekDefs, targetWeekCount, goal) {
  const origCount = weekPlans.length;
  if (origCount === targetWeekCount) return { weekPlans, weekDefs };

  if (targetWeekCount === 4) return { weekPlans: weekPlans.slice(0, 4), weekDefs: weekDefs.slice(0, 4) };

  if (targetWeekCount === 8 && origCount === 4) {
    // Tee kopio blokista 2 vk 5-8, nosta intensiteettiä
    const block2Plans = weekPlans.map(wp => ({
      ...wp,
      week: wp.week + 4,
      days: wp.days.map(d => ({
        ...d,
        // Labeloi bloki 2 esim. "Perusvoima A (blokki 2)"
        label: d.label ? d.label + " (blokki 2)" : d.label,
      })),
    }));
    const block2Defs = weekDefs.map(wd => ({
      ...wd,
      week: wd.week + 4,
      // Blokki 2: jos wd.deltaPctBase > 0, nosta +0.02; deload-viikkoon älä koske
      deltaPctBase: wd.week === 4 ? wd.deltaPctBase : (wd.deltaPctBase + 0.02),
      label: wd.label + " (blokki 2)",
    }));
    return {
      weekPlans: [...weekPlans, ...block2Plans],
      weekDefs: [...weekDefs, ...block2Defs],
    };
  }

  if (targetWeekCount === 12 && origCount === 4) {
    // 3 blokkia: vk 1-4 (pohja), 5-8 (lataus +2%), 9-12 (peak +4%)
    const block2Plans = weekPlans.map(wp => ({ ...wp, week: wp.week + 4, days: wp.days.map(d => ({ ...d, label: d.label ? d.label + " (B2)" : d.label })) }));
    const block3Plans = weekPlans.map(wp => ({ ...wp, week: wp.week + 8, days: wp.days.map(d => ({ ...d, label: d.label ? d.label + " (B3)" : d.label })) }));
    const block2Defs = weekDefs.map(wd => ({ ...wd, week: wd.week + 4, deltaPctBase: wd.week === 4 ? wd.deltaPctBase : (wd.deltaPctBase + 0.02), label: wd.label + " (B2)" }));
    const block3Defs = weekDefs.map(wd => ({ ...wd, week: wd.week + 8, deltaPctBase: wd.week === 4 ? wd.deltaPctBase : (wd.deltaPctBase + 0.04), label: wd.label + " (B3)" }));
    return {
      weekPlans: [...weekPlans, ...block2Plans, ...block3Plans],
      weekDefs: [...weekDefs, ...block2Defs, ...block3Defs],
    };
  }

  // Tuntematon yhdistelmä — palauta sellaisenaan
  return { weekPlans, weekDefs };
}

// Korjaa viikonpäivät käyttäjän preferenssin mukaan (esim. Ma/Ti/To).
function applyDayOfWeekPreference(weekPlans, preferredDows) {
  if (!preferredDows || preferredDows.length === 0) return weekPlans;
  return weekPlans.map(wp => ({
    ...wp,
    days: wp.days.map((d, idx) => ({
      ...d,
      dayOfWeek: preferredDows[idx % preferredDows.length] || d.dayOfWeek,
    })),
  }));
}

// Päägeneraattorifunktio.
// answers = {
//   goal: "hypertrofia" | "maksimivoima" | "yhdistelma" | "undulating",
//   primaries: [{ name: "Lisäpainoleuanveto", category: "vertikaaliveto" }, ...],
//   daysPerWeek: 2 | 3 | 4,
//   weekCount: 4 | 8 | 12,
//   recoveryCapacity: "hyva" | "keski" | "heikko",
//   preferredDaysOfWeek: [1, 3, 5] (optional),
//   startDateISO: "2026-04-23",
//   customLabel: "Oma ohjelma" (optional)
// }
function generateCustomMesocycle(answers, startDateISOArg) {
  const {
    goal = "yhdistelma",
    primaries = [{ name: "Lisäpainoleuanveto", category: "vertikaaliveto" }],
    daysPerWeek = 3,
    weekCount = 4,
    recoveryCapacity = "keski",
    preferredDaysOfWeek = null,
    customLabel = null,
  } = answers;
  const startDateISO = startDateISOArg || answers.startDateISO || todayISO();

  // 1. Hae skeleton (v4.49.0: laajennettu 10 → 16 tyyliä — 2D-γ edistyneet metodologiat)
  const skeletonFactoryName = GOAL_SKELETONS[goal] || GOAL_SKELETONS.yhdistelma;
  const skeletonFactories = {
    createHypertrofiaMesocycle,
    createMaksimivoimaMesocycle,
    createDefaultMesocycle,
    createDUPMesocycle,
    createEksenterinenMesocycle,
    createSiirtymaMesocycle,
    createPalautuminenMesocycle,
    // 2D-β:
    createWendler531Mesocycle,
    createTopSetBackoffMesocycle,
    createMadcow5x5Mesocycle,
    // 2D-γ:
    createWestsideConjugateMesocycle,
    createGZCLMesocycle,
    createSheikoDerivedMesocycle,
    createMinimalistRPMesocycle,
    createSmolovJrMesocycle,
    createCoanPhillipiMesocycle,
  };
  const factory = skeletonFactories[skeletonFactoryName];
  if (!factory) {
    throw new Error("generateCustomMesocycle: tuntematon goal " + goal);
  }
  const skeleton = factory(startDateISO);

  // v4.47.0: jos skeletonin natiivipituus !== 4, ohita scaleWeekCount.
  // Siirtymä (3 vk) ja palautuminen (2 vk) säilyttävät natiivimuotonsa eikä
  // niitä tueta 4/8/12 vk -skaalauksen kanssa (ne ovat tarkoituksellisesti lyhyitä).
  const nativeWeeks = GOAL_NATIVE_WEEKS[goal] || 4;
  const useNativeLength = nativeWeeks !== 4;
  const effectiveWeekCount = useNativeLength ? nativeWeeks : weekCount;

  // 2. Skaalaa daysPerWeek ENSIN (skeleton-primaryllä vielä — tämä takaa että
  //    primary-rotaatio jakautuu OIKEALLE päivämäärälle, ei skeletin oletukselle.
  //    v4.27.1 korjaus: aiemmin 4. päivä sai saman primaryn kuin 3. päivä,
  //    mikä teki Ti/Pe-päivistä identtiset voimanostaja-skenaarioissa.)
  let weekPlans = skeleton.weekPlans;
  if (daysPerWeek !== 3) {
    weekPlans = adjustDaysPerWeek(weekPlans, daysPerWeek);
  }

  // 3. Substituoi päälikkeet + accessoryt (nyt lopulliselle päivälistalle)
  // v4.51.7: Wendler 5/3/1 on KANONISESTI 4-liikkeen ohjelma (Pystypunnerrus,
  // Maastaveto, Penkkipunnerrus, Takakyykky). Wendler itse kieltää substituution
  // (ks. kommentti rivillä 3805). Aiemmin distributePrimariesToDays korvasi
  // nämä 4 liikettä atletin q09_sport-defaultilla (esim. hypertrophy →
  // "Lisäpainoleuanveto" KAIKILLE 4 päivälle, tai fallback "Leuanveto
  // (kehonpaino)" jos pullup_bar puuttui). Tämä rikkoi Wendlerin koko
  // metodologian. Korjaus: ohitetaan substituutio wendler531-skeletonille,
  // säilytetään Wendlerin alkuperäiset 4 päämääräliikettä. Atletin PR-data
  // (penkki/maave/jne) käytetään silti TM-laskennassa movementProgress.e1RM:n
  // kautta — PR-migraatio hoitaa tämän.
  if (goal !== "wendler531") {
    weekPlans = distributePrimariesToDays(weekPlans, primaries);
  }

  // 4. Skaalaa weekCount (skip jos natiivipituus !== 4, ks. yllä)
  let weekDefs = skeleton.weekDefs;
  if (!useNativeLength) {
    const scaled = scaleWeekCount(weekPlans, weekDefs, effectiveWeekCount, goal);
    weekPlans = scaled.weekPlans;
    weekDefs = scaled.weekDefs;
  }

  // 5. Applikoi palautumisskaala accessoryihin
  const recoveryScalars = { hyva: 1.0, keski: 0.85, heikko: 0.70 };
  weekPlans = applyRecoveryScalar(weekPlans, recoveryScalars[recoveryCapacity] ?? 0.85);

  // 6. Käyttäjän viikonpäivä-preferenssi
  if (preferredDaysOfWeek) {
    weekPlans = applyDayOfWeekPreference(weekPlans, preferredDaysOfWeek);
  }

  // 7. Kokoa mesosykli (v4.47.0: weekCount = effectiveWeekCount jos natiivipituus !== 4)
  const primaryLabel = primaries.map(p => p.name).join(" + ");
  const label = customLabel || `Räätälöity: ${primaryLabel} (${goal}, ${effectiveWeekCount}vk)`;

  return {
    mesocycleId: uid(),
    type: "custom",
    customConfig: {
      goal,
      primaries,
      daysPerWeek,
      weekCount: effectiveWeekCount,
      recoveryCapacity,
      preferredDaysOfWeek,
      label,
      skeletonFactoryName,
      generatedAt: nowISO(),
    },
    startDateISO,
    weekCount: effectiveWeekCount,
    weekDefs,
    weekPlans,
    postCycleAnalysis: null,
  };
}

// ── v4.42.0 (Track B Vaihe 2C-α): Multi-blokki-mesocycle ───────────────
//
// Ketjuttaa useita skeleton-factory:itä yhdeksi mesocycleksi joka kestää
// koko Issurin block-sekvenssin (hypertrofia → strength → intensification
// → peaking). Käytetään kun wizard-config sisältää q27_targetDate ja aikaa
// on ≥ 5 vk käytettävissä.
//
// Lähestymistapa:
//   1. Kullekin blokille luodaan oma yksittäinen meso skeleton-factory:llä
//      (createHypertrofiaMesocycle / createMaksimivoimaMesocycle / jne.)
//   2. Kunkin meson weekPlans-array käsitellään samalla logiikalla kuin
//      generateCustomMesocycle (distributePrimaries, applyRecoveryScalar)
//   3. weekPlans-arrayt ketjutetaan globaaliin numerointiin 1..N
//   4. Lopullinen meso saa type:"custom-multi-block" + blocks-metadatan
//
// HUOM: peaking-blokin pituus = 2 vk; muut blokit 4 vk. scaleWeekCount tukee
// vain 4/8/12 vk → 2-vk-peaking luodaan **leikkaamalla** 4 vk meso 2 vk:hon.
function generateMultiBlockMesocycle(config, startDateISOArg) {
  const {
    blocks,
    primaries,
    daysPerWeek,
    recoveryCapacity,
    preferredDaysOfWeek,
    customLabel,
  } = config;

  if (!Array.isArray(blocks) || blocks.length === 0) {
    throw new Error("generateMultiBlockMesocycle: blocks-array puuttuu tai tyhjä");
  }
  if (!Array.isArray(primaries) || primaries.length === 0) {
    throw new Error("generateMultiBlockMesocycle: primaries-array puuttuu");
  }

  const startDateISO = startDateISOArg || config.startDateISO || todayISO();
  const recoveryScalars = { hyva: 1.0, keski: 0.85, heikko: 0.70 };
  const scalar = recoveryScalars[recoveryCapacity] ?? 0.85;

  // Skeleton-factory-mappaus (v4.44.0: lisätty intensifikaatio + peaking-mb)
  const factories = {
    hypertrofia:    createHypertrofiaMesocycle,
    maksimivoima:   createMaksimivoimaMesocycle,
    yhdistelma:     createDefaultMesocycle,
    undulating:     createDUPMesocycle,
    // 2C-β2: aito Issurin-intensifikaatio (matala volyymi, korkea intensiteetti)
    intensifikaatio: createIntensifikaatioMesocycle,
    // 2C-β2: 2-vk peaking-skeleton multi-block:lle (taper + kisaviikko)
    peaking:        createMultiBlockPeakingSkeleton,
  };

  let combinedWeekPlans = [];
  let combinedWeekDefs = [];
  let globalWeekOffset = 0; // 0-based → 1-based week numerointi (weekIdx + offset + 1)
  const blockMetadata = [];

  for (const block of blocks) {
    const factory = factories[block.goal];
    if (typeof factory !== "function") {
      throw new Error(`generateMultiBlockMesocycle: tuntematon goal "${block.goal}"`);
    }

    // Generoi yksittäinen blokki (alkuperäinen meso on aina 4 vk)
    const blockMeso = factory(startDateISO);
    let blockWeekPlans = blockMeso.weekPlans;
    let blockWeekDefs = blockMeso.weekDefs || [];

    // 1. Skaalaa daysPerWeek
    if (daysPerWeek !== 3) {
      blockWeekPlans = adjustDaysPerWeek(blockWeekPlans, daysPerWeek);
    }

    // 2. Substituoi päälikkeet
    blockWeekPlans = distributePrimariesToDays(blockWeekPlans, primaries);

    // 3. Applikoi palautumiskerroin accessoryihin
    blockWeekPlans = applyRecoveryScalar(blockWeekPlans, scalar);

    // 4. Leikkaa pituuteen block.weekCount (4 vk → 2 vk peakingille)
    if (block.weekCount < blockWeekPlans.length) {
      blockWeekPlans = blockWeekPlans.slice(0, block.weekCount);
      blockWeekDefs = blockWeekDefs.slice(0, block.weekCount);
    }

    // 5. Päivitä viikkonumerointi GLOBALIIN (1..totalWeeks)
    blockWeekPlans = blockWeekPlans.map((wp, i) => ({
      ...wp,
      week: globalWeekOffset + i + 1, // 1-based global week
      blockGoal: block.goal,
      blockLabel: block.label || block.goal,
      blockWeekIndex: i, // 0-based viikko TÄSSÄ blokissa (esim. Hyp vk 1/4 → blockWeekIndex=0)
    }));
    blockWeekDefs = blockWeekDefs.map((wd, i) => ({
      ...wd,
      week: globalWeekOffset + i + 1,
      blockGoal: block.goal,
      blockLabel: block.label || block.goal,
    }));

    combinedWeekPlans = combinedWeekPlans.concat(blockWeekPlans);
    combinedWeekDefs = combinedWeekDefs.concat(blockWeekDefs);

    blockMetadata.push({
      goal: block.goal,
      label: block.label || block.goal,
      weekCount: block.weekCount,
      startWeek: globalWeekOffset + 1, // 1-based
      endWeek: globalWeekOffset + block.weekCount,
    });

    globalWeekOffset += block.weekCount;
  }

  const totalWeeks = globalWeekOffset;

  // 6. Käyttäjän viikonpäivä-preferenssi
  if (preferredDaysOfWeek) {
    combinedWeekPlans = applyDayOfWeekPreference(combinedWeekPlans, preferredDaysOfWeek);
  }

  const primaryLabel = primaries.map(p => p.name).join(" + ");
  const label = customLabel || `Räätälöity multi-blokki: ${primaryLabel} (${totalWeeks} vk, ${blocks.length} vaihetta)`;

  return {
    mesocycleId: uid(),
    type: "custom-multi-block",
    customConfig: {
      blocks: blockMetadata,
      primaries,
      daysPerWeek,
      recoveryCapacity,
      preferredDaysOfWeek,
      label,
      generatedAt: nowISO(),
    },
    startDateISO,
    weekCount: totalWeeks,
    weekDefs: combinedWeekDefs,
    weekPlans: combinedWeekPlans,
    postCycleAnalysis: null,
  };
}

// ── Ensure all variant presets exist (migration) ──
async function ensureAllVariantsSeeded() {
  const movements = await dbGetAll(STORES.movements);
  const primaryMov = movements.find(m => m.isPrimary);
  if (!primaryMov) return;

  const existingVariants = await dbGetByIndex(STORES.variants, "movementId", primaryMov.movementId);
  const existingNames = new Set(existingVariants.map(v => v.name));

  const toAdd = PRIMARY_VARIANTS.filter(pv => !existingNames.has(pv.name));
  if (toAdd.length === 0) return;

  const newVariants = toAdd.map(v => ({
    variantId: uid(),
    movementId: primaryMov.movementId,
    name: v.name,
    isDefault: v.isDefault,
    tags: v.tags || [],
    notes: "",
  }));
  await dbPutBulk(STORES.variants, newVariants);

  // Also update existing variants to include tags if missing
  for (const ev of existingVariants) {
    const preset = PRIMARY_VARIANTS.find(pv => pv.name === ev.name);
    if (preset && (!ev.tags || ev.tags.length === 0)) {
      ev.tags = preset.tags || [];
      await dbPut(STORES.variants, ev);
    }
  }
}

// ── Variant helpers ──
async function getVariantByName(name) {
  const allVariants = await dbGetAll(STORES.variants);
  return allVariants.find(v => v.name === name) || null;
}

async function getAllVariants() {
  return dbGetAll(STORES.variants);
}

// ── Initialize database ──
async function initDB() {
  // v4.26.0: tarkista ja luo pre-migration-backup ENNEN openDB:tä
  // (openDB triggaa onupgradeneeded jos versio on bumpattu)
  await createPreMigrationBackupIfNeeded();

  await openDB();
  if (_db) {
    await seedPresets();
    await ensureAllVariantsSeeded();
    await updateLastOpened();
    // v4.26.0: viikottainen auto-backup (tarkistaa onko 7+ pv edellisestä)
    await maybeCreateWeeklyBackup();
  }
  return _db;
}

// ── Streetlifting 16-week mesocycle (Hybrid Block-DUP, 4 lifts) ──
// Calibration defaults: Leuka ext=85, Dippi ext=75, Kyykky=160, BW=91
// Loads from Excel Ohjelma-viikot (2026-04) scaled by athlete's e1RM ratio.
// v4.34.6: Auto-snap startDateISO viimeisimpään maanantaihin (mukaan lukien tänään
// jos tänään on maanantai). Ratkaisee backfill-bugin: jos käyttäjä luo mesocyclen
// torstaina, edelliset MA + TI tämän viikon päivät EIVÄT olleet aiemmin saatavilla
// vk 1:n alle (weekNum < 1 → "ei ohjelmaa"). Nyt MA-snap varmistaa että kaikki
// viikon päivät kuuluvat samaan vk:hon. Jos käyttäjä haluaa eksplisiittisesti
// "tänään"-startin, hän voi säätää startDate-arvoa Asetukset → Mesocycle:ssä.
function snapToMostRecentMonday(dateISO) {
  const d = new Date(dateISO);
  const dow = d.getDay() || 7; // Sunday=0 → 7
  const daysSinceMonday = dow - 1; // Monday=1 → 0, Tuesday → 1, ... Sunday(7) → 6
  d.setDate(d.getDate() - daysSinceMonday);
  // Palauta YYYY-MM-DD-muoto (kuten todayISO())
  return d.toISOString().slice(0, 10);
}

function createStreetlifting16WMesocycle(startDateISO, cal = {}) {
  // v4.34.6: snap to most recent Monday — backfill-yhteensopivuus
  startDateISO = snapToMostRecentMonday(startDateISO);
  // v4.22 P2 REFACTOR: Relative loading (% current e1RM).
  //
  // Aikaisemmin: loadingsit kovakoodattu absoluuttisissa kg:issa jotka
  // skaalattiin L/85-suhteella käyttäjän 1RM:ään. Tämä tuotti viikoilla
  // 10–11 ja 13–14 kuormia jotka olivat matemaattisesti >100 % 1RM:stä
  // kun kehitystä ei tapahtunut oletetulla tahdilla.
  //
  // Nyt: jokainen primary/backoff/topSingle/opener-slot tallentaa loadPct:n
  // (0.0–1.05), ja moottori laskee `currentE1RMExternal × loadPct` render-
  // ajassa. Kun käyttäjä vahvistaa e1RM:n (primer / top-set / testi), kuormat
  // skaalautuvat automaattisesti — peaking-haarassa (vk 13–16) tämä tarkoittaa
  // että jos kehitystä oli vain +3 %, peak-kuormat ovat ±3 % nykyisestä 1RM:stä,
  // ei 110 % kuvitellusta tulevaisuudesta.
  //
  // Seed-kuormitus: ensimmäinen sessio ilman e1RM-historiaa käyttää slot.suggestedLoadKg:tä
  // joka lasketaan tässä kalibroinnista. Tämä on vain lähtöpiste — moottori ottaa
  // ajantasaisen datan käyttöön välittömästi kun historiaa kertyy.
  const BW = cal.bwKg || 91;
  const L  = cal.leukaExtKg  || 85;   // lähtöarvio, nopeasti ylikirjoitettuna
  const D  = cal.dippiExtKg  || 75;
  const K  = cal.kyykkyExtKg || 160;

  // seedLoad: tuottaa kuorma-seed käyttäjän alkuperäisestä 1RM-arviosta
  // jotta ensimmäinen sessio ennen e1RM-dataa saa järkeviä painoja.
  // Pyöristys 0.25 kg (lisäpaino) / 2.5 kg (tanko) tarkkuuteen.
  const seedL = pct => Math.round(Math.max(0, pct * (BW + L) - BW) * 4) / 4;
  const seedD = pct => Math.round(Math.max(0, pct * (BW + D) - BW) * 4) / 4;
  const seedK = pct => Math.round(K * pct / 2.5) * 2.5;

  // ─── Slot-driven accessory arrays (v4.11) ───
  // Each slot carries slotId → engine resolves movement + rep scheme at render time
  // based on current phase + mesocycle overrides + stagnation signals.
  // The defaultMovementName here is a fallback for legacy renderers and initial view.
  const slotAccessory = (slotId, category, fallbackName, overrides = {}) => ({
    role: "accessory",
    slotId,
    category,
    defaultMovementName: fallbackName,
    // repScheme is resolved per phase by engine; these are foundation-phase defaults.
    sets: overrides.sets ?? 3,
    reps: overrides.reps ?? 10,
    targetVx: overrides.targetVx ?? null,
    ...(overrides.note ? { note: overrides.note } : {}),
  });

  // v4.30.0: pullAcc ottaa withOverload-parametrin — strength + intensity -blokeissa
  // lisätään Heavy negative leuka -overload-slot. Foundation + peakingissa pois (Murton 2018:
  // peak-vaiheessa supramaksimaalisten eksentrikkojen DOMS-riski liian iso, foundation rakentaa
  // pohjaa volyymillä).
  const pullAcc = (withOverload = false) => {
    // v4.31.2: Poistettu pull-vertical-explosive (Räjähtävä leuka) duplikointi LA:lta.
    // v4.32.3: Lisätty pull-volume (Leuanveto chest-to-bar 3×5 V3) MA:n 2. vedoksi.
    //   - MA pull-volume: chest-to-bar volyymi + ROM-tekniikka, raskaampi (3×5 V3)
    //   - LA pull-vertical-explosive: Räjähtävä leuka RFD, BW max-velocity (3×3 V4)
    //   Eri liikkeet, eri tarkoitus → ei duplikointia.
    const slots = [
      slotAccessory("pull-volume",             "vertikaaliveto",   "Leuanveto chest-to-bar", { sets:3, reps:5, targetVx:3 }),
      slotAccessory("pull-horizontal-heavy",   "horisontaaliveto", "Chest-supported row",    { sets:4, reps:8 }),
      slotAccessory("bicep-chain",             "hauisfleksio",     "Hauiskääntö tanko",       { sets:3, reps:12 }),
      slotAccessory("scapular-control",        "horisontaaliveto", "Face pull",              { sets:3, reps:15 }),
    ];
    if (withOverload) {
      // Heavy negative leuka: 110–120 % 1RM, 5 s eccentric — Westside-overload, kerran viikossa
      // strength + intensity -blokeissa. Slotti on swap:attavissa pois accessorySlotOverridesilla.
      slots.unshift(slotAccessory("overload-pull-eccentric", "vertikaaliveto", "Heavy negative leuka",
        { sets:3, reps:3, targetVx:null,
          note:"110–115 % 1RM, 5 s eccentric — hyppy/avustettu yläasentoon, vain eksentrinen lasku" }));
    }
    return slots;
  };
  const lowerAcc = () => [
    slotAccessory("hip-hinge",                  "alaraaja", "Romanian DL",             { sets:3, reps:8,  note:"RDL — hamstring eccentric, ei lattiasta DL (CNS-säästö raskaan kyykyn jälkeen)" }),
    slotAccessory("knee-dominant-accessory",    "alaraaja", "Jalkaprässi",             { sets:3, reps:10 }),
    // v4.34.18: knee-unilateral (Bulgarian split squat) -slot POISTETTU kokonaan
    // (ei vain catalog-tyhjennys v4.34.17:ssä). Aiemmin slot luotiin täällä, vaikka catalog
    // phaseVariants oli tyhjä → resolver pudotti runtime-ajossa, mutta UI-previewit (program
    // overview, ⚙ Vaihda päivä, treenin esikatselu) näyttivät RAW-slotit. Käyttäjäpalaute
    // 2026-05-03: "bulgarian split squat näkyi vielä vk 2 treenissä". Korjaus: slot ei luoda
    // ollenkaan → ei näy missään näkymässä.
    slotAccessory("hamstring-isolation",        "alaraaja", "Leg curl",                { sets:3, reps:12 }),
    // v4.27.17: Pohkeenkohotus 5. slotiksi — nilkan jäykkyys kyykyn lockoutiin (230 kg+ rakenne)
    // v4.32.8: foundation V3→V1, reps 15→12 — phaseVariants on autoritatiivinen catalog:ssa,
    // tämä on legacy-fallback-arvo joka yliajetaan resolveAccessorySlot:lla render-ajassa.
    slotAccessory("calf-isolation",             "alaraaja", "Pohkeenkohotus",          { sets:3, reps:12, targetVx:1, note:"Ankle rigidity — kyykyn lockout-tuki, soleus+gastrocnemius, stretch-mediated" }),
  ];
  const pushAcc = () => [
    slotAccessory("bench-heavy",         "horisontaalityöntö", "Penkkipunnerrus",    { sets:4, reps:6,  targetVx:3, note:"kapea ote" }),
    slotAccessory("shoulder-vertical",   "vertikaalityöntö",   "Pystypunnerrus",     { sets:3, reps:8 }),
    slotAccessory("tricep-lockout",      "ojentajaekstensio",  "Tricep pushdown",    { sets:3, reps:12 }),
    // v4.27.17: Sivunosto → Face pull — strength-blokin (vk 5+) raskas dippivolyymi vaatii posterior balance; ei foundation-blokin pushAccPrehab:n 3×15 vaan 2×12 koska volyymi jo täyttynyt muualla
    slotAccessory("scapular-control",    "horisontaaliveto",   "Face pull",          { sets:2, reps:12, targetVx:4, note:"Posterior delt + rotator cuff — strength-blokin dippivolyymin tueksi" }),
  ];

  // ─── Dippi-prehab-accessory-paketti (v4.27.7 REFACTOR) ───
  // Foundation-blokissa (vk 1–4) käytetään pushAcc:n sijaan tätä pakettia.
  //
  // v4.27.7 muutos: Tempo pause dippi POISTETTU torstailta — siirtyy lauantailla
  // mu-dip-support-slotin tilalle (skill-vaiheessa). Perustelu: Tempo pause dippi
  // vaatii tuoretta kudosta ja hermolihaskontrolloa toimiakseen ROM-kapasiteetti-
  // liikkeenä. Torstaina primary-dipin (24–30 raskasta toistoa) JÄLKEEN se on
  // junk volumea — kontrolli rapissut, kudos kuormitettu. Lauantailla 48+h palautu-
  // misen jälkeen MU-päivällä (ei-dippi primary) se pääsee oikeuksiinsa, ja VK:n
  // kokonaisdippivolyymi vähenee 72→48–54 reps.
  //
  // Palautettu alkuperäisestä pushAcc:sta: Penkkipunnerrus (kapea ote) ja
  // Ab wheel (jälkimmäisen lisää toDay() automaattisesti).
  //
  // Säilytetty v4.27.4:stä: Dumbbell pullover (uniikki stretch-ROM pec-insertio-
  // kapasiteetille) + Face pull (posterior balance, "kriittinen dippi-volyymille").
  //
  // Pudotettu: Sivunosto (redundantti Pystypunnerruksen kanssa V3/8-rep-rangessa),
  // Tricep pushdown (korvautuu kapea-ote penkillä kompoundina).
  //
  // Liikkeet (4 kpl + Ab wheel = 5 slottia, sama kpl-määrä kuin pushAcc):
  //   1) Penkkipunnerrus kapea ote — triceps-dominantti, dip-lockout-spesifi
  //   2) Pystypunnerrus — vertikaali-työnnön balanssi vs horisontaalidippi
  //   3) Dumbbell pullover — stretch-mediated pec+lats hypertrofia (UNIIKKI ROM)
  //   4) Face pull — posterior scapular + rotator cuff
  const pushAccPrehab = () => [
    slotAccessory("bench-heavy",         "horisontaalityöntö", "Penkkipunnerrus",    { sets:4, reps:6,  targetVx:3, note:"Kapea ote — triceps-dominantti, dip-lockout-spesifi" }),
    slotAccessory("shoulder-vertical",   "vertikaalityöntö",   "Pystypunnerrus",     { sets:3, reps:8,  targetVx:3 }),
    slotAccessory("pec-stretch",         "horisontaalityöntö", "Dumbbell pullover",  { sets:2, reps:12, targetVx:4, note:"Täysi venytys — pec+lats stretch-hypertrofia" }),
    slotAccessory("scapular-control",    "horisontaaliveto",   "Face pull",          { sets:3, reps:15, targetVx:4, note:"Posterior shoulder balance — kriittinen dippi-volyymille" }),
  ];
  // v4.27.19: mixAcc redukoitu pelkäksi core-slotiksi. Perustelu: LA-päivä
  // sisältää jo etukyykyn (fsWeek, 11/16 vk), MU primaryn, MU-dip-supportin ja
  // mu-transitionin — kaikki streetlifting-spesifistä komposito-volyymia. Erillinen
  // scapular-control (Face pull) LA:lla oli foundation-blokissa triple-coverage
  // (MA + TO + LA = 135 reps/wk, liikaa); v4.27.18 yritti korvata grip-endurancella
  // (Farmer carry) mutta streetlifterille carry on dedikoitua volyymia ilman
  // kisahyötyä (ote tulee jo 94 kg leuka-primarysta + MU-transitionista). Kun
  // slot-pakotetta ei ole, cleanin poiston jälkeen LA-core jää ainoaksi mixAcc:n
  // slotiksi. Face pull foundation-volyymi pysyy 90 reps/wk (MA pullAcc 3×15 +
  // TO pushAccPrehab 3×15) — sama v4.27.18 target, mutta ilman LA-redundanssia.
  const mixAcc = () => [
    slotAccessory("core-hollow",     "core",             "Ab wheel rollout",   { sets:3, reps:10 }),
  ];

  // ─── Warmup ramp helper (v4.25 P2-15) ───
  // Neural primer + liikemallin herätys ennen ensimmäistä workset-sarjaa.
  // UI renderoi nämä listana atleetille. Kuormat lasketaan primary-slotin
  // loadPct:stä × current e1RM; fallback seed-arvo laskelman tueksi.
  const RAMP_DEFAULT = [
    { pct: 0.40, reps: 5, note: "Liikemalli, kevyt" },
    { pct: 0.55, reps: 3, note: "Lämpö" },
    { pct: 0.70, reps: 2, note: "Aktivaatio" },
    { pct: 0.85, reps: 1, note: "Neural primer" },
  ];
  const RAMP_BARBELL = [
    { pct: 0.35, reps: 5, note: "Tyhjä tanko + kevyt" },
    { pct: 0.50, reps: 3, note: "Liikemalli" },
    { pct: 0.65, reps: 2, note: "Lämpö" },
    { pct: 0.78, reps: 1, note: "Aktivaatio" },
    { pct: 0.88, reps: 1, note: "Neural primer (vain top single -päivinä)" },
  ];

  // ─── Day builders (v4.25 P1: warmup-sekvenssit, ramp, core, MU Vx-min 2) ───
  //
  // Kaikki primary/backoff/topSingle käyttää loadPct:tä (v4.22 P2). Moottori laskee
  // actualLoad = currentE1RMExternal × loadPct render-ajassa. Seed-kuormitus
  // (suggestedLoadKg) lasketaan seedL/seedD/seedK:sta kalibroinnista.
  // velocityStop: referenssikynnys (aktiivinen kun Enode/VBT-mittari käytössä);
  // ilman mittaria Vx-logging toimii subjektiivisena auto-regulaationa.
  // warmupSets: neural primer -ramp ennen workset-sarjoja (v4.25 P2-15).

  // v4.25: accessoryList-parametri antaa kutsujalle kontrollin tukiliikkeisiin.
  // null/undefined → default (pullAcc/pushAcc/lowerAcc + core).
  // [] → vain core.
  // [...slots] → erikoislistaus (esim. finisherAcc taper-viikoille).

  // ─── v4.28.0 Backoff-tyylikatalogi (L1/M2/M3) ───
  //
  // Block-periodization: yleinen → spesifi. Sama logiikka sovelletaan kaikkiin
  // kolmeen primaryyn (leuka/kyykky/dippi) yhdenmukaisesti — ei enää asymmetriaa,
  // jossa TI olisi hardkoodattu paused squat ja MA/TO olisivat pelkkä sama liike.
  //
  // Foundation  (vk 1-3):  yleinen volyymi samalla liikkeellä (motor pattern)
  // Strength    (vk 5-7):  tekninen variantti (pause/grip variation) — sticking-point
  // Intensity   (vk 9-11): eccentric-focus tai spesifi ote — CNS-moduloitu
  // Peaking     (vk 13-14): competition-style (ei pause, ei teknisiä modifikaatioita)
  //
  // Grip/tekniikka-variantit: PRIMARY_VARIANTS-katalogi wireataan tähän nyt
  // aktiivisena — foundation=neutraaliote, strength=myötäote, intensity+=kilpaote.
  // K-A6D (2026-06-02): velocityStop poistettu styleistä — engine laskee sen RTF-gated
  // (VELOCITY_VX_RECONCILE). note/variantHint säilyvät.
  const SQUAT_BACKOFF_STYLES = {
    regular:   { note: "Takakyykky — yleinen volyymi (motor pattern)" },
    paused:    { note: "Paused squat 2s — sticking-point specificity" },
    tempo:     { note: "Tempo squat 3s eksentrinen — eccentric control + bottom-position" },
    kisastyle: { note: "Takakyykky kisastyle — competition-specific (EI paused peakingissa)" },
  };
  const PULL_BACKOFF_STYLES = {
    // Foundation: neutraaliote = hauis-akti + grip-variaatio, volyymi-ote
    neutraaliote: { variantHint: "Neutraaliote",   note: "Neutraaliote — volyymi + hauis-akti (foundation grip-variation)" },
    // Strength: myötäote = eri ote, vielä raskas mutta ei kisaspesifi → hauis-overload
    myotaote:     { variantHint: "Myötäoteveto",   note: "Myötäoteveto — eri ote, hauis-overload (strength grip-rotation)" },
    // Intensity/peaking: kisaote, sama spesifinen variantti
    kilpaote:     { variantHint: "Kilpaveto (leveä vastaote)", note: "Kilpaveto — spesifi backoff-volyymi" },
  };
  const DIP_BACKOFF_STYLES = {
    // Foundation: ei backoffia (pushAccPrehab hoitaa volyymin)
    // Strength: kapea ote -dippi = tricep-overload backoff, silti kisaspec
    kapea:        { note: "Kapea ote — ojentaja-overload (strength backoff-variation)" },
    // Intensity+: kisaspec leveä ote
    kilpaote:     { note: "Kilpaote leveä — kisaspesifi backoff-volyymi" },
  };

  // v4.28.0 (H2): Peaking-specific warmup. Vk 13-14 singleille tarvitaan neural primer
  // joka painottaa räjähtävyyttä, ei prehab-volyymia. Valitaan warmup-variantti
  // phase-parametrilla ("peaking" | null).
  const MA_WARMUP_PEAKING = [
    { name: "Hyppynaru / Jumping Jacks", desc: "2 min yleislämmittely — kevyempi taperissa" },
    { name: "Band pull-apart", desc: "1×15 — posterior delt aktivaatio" },
    { name: "Thoracic extension", desc: "1×8 per puoli — T-rangan liikkuvuus" },
    { name: "Band external rotation", desc: "1×10 per puoli — rotator cuff" },
    { name: "Scapular hang", desc: "2×10 s — lapa-aktivaatio" },
    { name: "Räjähtävä leuka BW", desc: "3×1 maksimi nopeus — neural primer singleille (ei 3 toistoa, vaan 3 yksittäistä räjähdystä)" },
    { name: "Warmup ramp (singles)", desc: "60% × 1 · 75% × 1 · 85% × 1 · 90% × 1 → workset" },
  ];
  const TI_WARMUP_PEAKING = [
    { name: "Hyppynaru / Jumping Jacks", desc: "2 min yleislämmittely" },
    { name: "Hip 90/90 + Cossack", desc: "1 min per puoli — lonkka-mobiliteetti" },
    { name: "Empty bar squat", desc: "1×5 — liikemallin herätys (ei 1×8, riittää taperissa)" },
    { name: "Warmup ramp (singles)", desc: "40% × 3 · 60% × 2 · 75% × 1 · 85% × 1 → workset" },
  ];
  const TO_WARMUP_PEAKING = [
    { name: "Hyppynaru / Jumping Jacks", desc: "2 min yleislämmittely" },
    { name: "Band dislocations", desc: "1×10 — olka-mobiliteetti" },
    { name: "Band external rotation", desc: "1×10 per puoli — rotator cuff" },
    { name: "Band pull-apart", desc: "1×15 — posterior balance" },
    { name: "Scapular push-up", desc: "1×8 — serratus aktivaatio" },
    { name: "BW dippi", desc: "1×3 räjähtävä — neural primer" },
    { name: "Warmup ramp (singles)", desc: "60% × 2 · 75% × 1 · 85% × 1 · 90% × 1 → workset" },
  ];

  // v4.30.0 + v4.31.0 + v4.32.6: maDay-parametrit.
  //   pullMeVariant: ME-rotaation pää-leuka-variantti foundation/strength-blokeissa
  //     (vk 1-3 chin-up, vk 4-6 paused pull-up, vk 7 tempo pull-up). Vk 8+ default
  //     "Lisäpainoleuanveto" (kilpa-spesifisyys lukko).
  //   withPullOverload: aktivoi Heavy negative leuka -accessory-slotin pullAcc:iin.
  //     Strength (vk 5-7) + intensity (vk 9-11). Pois deload + foundation + peaking.
  //   withDipTertiary (v4.31.0, v4.32.5 deaktivoitu): vanha LISÄPAINO-tertiary jonka
  //     poisto v4.32.5:llä korjasi venähdys-riskin. Säilytetty parametrina jotta
  //     parametriallekirjoitus ei rikkoudu — kaikilla kutsuilla nyt false.
  //   withDipBWTertiary (v4.32.6): uusi TURVALLINEN BW-tertiary. Lisäpainodippi 3×10 V3 @ 0 kg
  //     (pelkkä kehopaino) MA:lla 4. liikkeeksi (row+curl-jälkeen, ennen face pullia).
  //     Foundation + strength + intensity (vk 1-3, 5-7, 9-11). Pois deload + peaking.
  //     Käyttäjäpalaute (v4.32.5): "aion lisätä BW-dippejä manuaalisesti — tärkeää saada
  //     toistoja sisään tertiary-päivänä". Ratkaisu: BW-dippi default-osana ohjelmaa,
  //     ei lisäpainoa = ei venähdys-riskiä, korkeampi rep-range (8–12) volyymistimuluksena.
  // v4.32.9 M13: ME-rotation variantScale — pull-up-variaatioiden 1RM eroaa
  // kisaliike-leuanvedon 1RM:stä. Aiemmin maDay käytti seedL(pct) = L × pct kaikille
  // variaatioille, joka olettaa Vastaote/Paused/Tempo-pull-up 1RM = leuka-1RM.
  // Tutkimustausta: per-variantti e1RM-tracking on ideaali (Schulz KoW, Coll, Tuchscherer
  // RTS, Helms 3DMJ, Israetel JTS — kaikki suosittavat erillistä trackingia per
  // variantti). Fallback-kerroin käytetään ensimmäisellä viikolla ennen kuin atleetti
  // on suorittanut riittävästi RPE-merkittyjä työsarjoja per variantti.
  // Heuristiikka (Claude + ChatGPT konsensus, ei peer-reviewed-RCT-vahvistettu):
  //   Vastaote-leuanveto (chin-up):    1.05 × leuka-1RM (hauis-bias, hieman vahvempi)
  //   Paused pull-up (1-2s lockout):   0.90 × leuka-1RM (isometric-pause hidastaa)
  //   Tempo pull-up (3s eccentric):    0.94 × leuka-1RM (eccentric-tempo hidastaa)
  //   Default (kisaliike-leuka):       1.00
  const PULL_VARIANT_SCALE = {
    "Vastaote-leuanveto": 1.05,
    "Paused pull-up":     0.90,
    "Tempo pull-up":      0.94,
  };
  function maDay(label, sets, reps, vx, primaryPct, backoffPct, topPct, accessoryList, backoffStyle, phase, pullMeVariant, withPullOverload, withDipTertiary, withDipBWTertiary, topSingleFirst, topConfig) {
    // v4.32.9 M16: topConfig tukee calibration-formaattia (vk 8: 92%×3 V1, vk 12: 95%×2 V1).
    // topConfig = { reps: 3|2, role: "calibration", isCalibration: true } overrideä top single -slotti.
    // v4.25.1 (Enode): allowVelocityInput merkitsee ankkuripisteet joissa
    // per-sarja-velocity on puhdas signaali (ei grind-kontaminaatiota).
    // Primary: vain jos reps===1 JA loadPct ≥ 0.85 (top single/peaking).
    // Top single -slot: aina.
    const primaryIsAnchor = reps === 1 && primaryPct >= 0.85;
    // v4.30.0: ME-rotaatio — kun pullMeVariant on annettu, primary käyttää sitä Lisäpainoleuanvedon sijaan.
    // Vk 10+ pullMeVariant on undefined → palaa kilpa-spesifisyyteen automaattisesti.
    const primaryMovementName = pullMeVariant || "Lisäpainoleuanveto";
    // v4.32.9 M13: variantScale fallback-kg-seed-laskentaan
    const variantScale = pullMeVariant && PULL_VARIANT_SCALE[pullMeVariant] ? PULL_VARIANT_SCALE[pullMeVariant] : 1.00;
    const seedLVariant = pct => Math.round(Math.max(0, pct * (BW + L * variantScale) - BW) * 4) / 4;
    const slots = [
      { role:"primary", category:"vertikaaliveto", defaultMovementName: primaryMovementName,
        sets, reps, targetVx:vx, loadPct:primaryPct, suggestedLoadKg:seedLVariant(primaryPct),
        competitionLift: !pullMeVariant,  // ME-rotation-variantit eivät ole kisaliikkeitä        warmupSets: RAMP_DEFAULT, allowVelocityInput: primaryIsAnchor,
        ...(variantScale !== 1.00 ? { variantScale } : {}),
      },
    ];
    if (backoffPct) {
      // v4.28.0 (M2/M3/H7): block-aware backoff-tyyli (grip-variaatio wireattu)
      //   foundation ei käytä backoffia (null), strength=myotaote, intensity=kilpaote, peaking=finisher erikseen
      const styleKey = backoffStyle || "kilpaote";
      const style = PULL_BACKOFF_STYLES[styleKey] || PULL_BACKOFF_STYLES.kilpaote;
      slots.push({
        role:"backoff", category:"vertikaaliveto", defaultMovementName:"Lisäpainoleuanveto",
        sets:3, reps:reps+1, targetVx:vx+1,             // H7: 2→3 sarjaa yhdenmukaistus TI:n kanssa
        loadPct:backoffPct, suggestedLoadKg:seedL(backoffPct),        note: style.note,
        ...(style.variantHint ? { variantHint: style.variantHint } : {}),
      });
    }
    if (topPct) {
      // v4.25 P2-14: RPE-label korjattu vastaamaan %1RM:ää (92% ≈ RPE 8, 95% ≈ RPE 9)
      const rpeLabel = topPct >= 0.97 ? "RPE 9.5" : topPct >= 0.95 ? "RPE 9" : topPct >= 0.92 ? "RPE 8–8.5" : "RPE 8";
      // v4.32.9 M14: topSingleFirst — heavy-first-järjestys testi/realization-viikoilla.
      // v4.32.9 M16: topConfig tukee calibration-formaattia (vk 8: 92%×3 V1, vk 12: 95%×2 V1).
      const topReps = topConfig?.reps ?? 1;
      const topRole = topConfig?.role ?? "secondary";
      const topIsCalibration = topConfig?.isCalibration === true;
      const topNotePrefix = topIsCalibration ? `${topConfig.weekLabel || "Kalibrointi"} ${topReps}×${topReps} V1 — low-rep e1RM` : `Top single ${rpeLabel}`;
      const topSlot = {
        role: topRole, category:"vertikaaliveto", defaultMovementName:"Lisäpainoleuanveto",
        sets:1, reps: topReps, targetVx:1, loadPct:topPct, suggestedLoadKg:seedL(topPct),
        note: `${topNotePrefix}${topSingleFirst ? " (heavy-first)" : ""}`,
        allowVelocityInput: true,
        ...(topIsCalibration ? { isCalibration: true } : {}),
      };
      if (topSingleFirst) {
        slots.unshift(topSlot);
      } else {
        slots.push(topSlot);
      }
    }
    // v4.25 P2-17: Core-slot MA/TI/TO-päiviin lisätään accessoryna
    // v4.30.0: withPullOverload aktivoi Heavy negative leuka -slotin pullAcc:iin
    // v4.31.0: withDipTertiary aktivoi dip-tertiary-primer -slotin MA-päivälle (v4.32.5 deakti)
    // v4.32.6: withDipBWTertiary aktivoi BW-dipin (turvallinen) MA:n 4. liikkeeksi
    let accessories = accessoryList === undefined ? pullAcc(withPullOverload === true) : accessoryList;
    if (withDipTertiary === true) {
      // Dippi-tertiary-primer: 3×5 Lisäpainodippi @ ~50 % 1RM @ V5, kevyt neural-
      // stimulus 72 h ennen TO-primarya. KUORMITETTU dippaaja: BW olisi V8–V10
      // (liian kevyt primer-rooliksi). loadPct 0.50 → seedD(0.50) ~= 3 kg lisäpainoa
      // (pct × (BW + D) − BW). Engine resolvoi loadPct dynaamisesti per-session
      // oikeaan e1RM:ään (käyttäjän edistyessä paino skaalautuu).
      accessories = [
        ...accessories,
        {
          role: "accessory",
          slotId: "dip-tertiary-primer",
          category: "horisontaalityöntö",
          defaultMovementName: "Lisäpainodippi",
          sets: 3,
          reps: 5,
          targetVx: 5,
          loadPct: 0.50,
          loadPctReferenceMovementName: "Lisäpainodippi",
          suggestedLoadKg: seedD(0.50),
          note: "~50 % 1RM @ V5 (RPE 5–6) — kevyt primer 72 h ennen TO-primarya. Säädä painoa tunteen mukaan, ei grindiä.",
        },
      ];
    }
    if (withDipBWTertiary === true) {
      // v4.32.6: BW-dippi tertiary — pelkkä kehopaino (loadPct = 0), ei venähdys-riskiä.
      // Insertoidaan accessoryyn indeksiin 3 (row+curl-jälkeen, ennen face pullia) →
      // rinta on aktivoitunut kahden vetävän + biceps-curlin jälkeen.
      // v4.32.8: foundation targetVx 3→5 yhdenmukaistus catalog-phaseRep:n kanssa.
      // resolveAccessorySlot yliajaa nämä render-ajassa catalog:n phaseRep:llä, mutta
      // legacy-fallback-arvot päivitetty konsistenssiksi.
      const bwDipReps = phase === "intensity" ? 8 : 10;
      const bwDipFoundationVx = phase === "foundation" ? 5 : 3;
      const bwDipSlot = {
        role: "accessory",
        slotId: "dip-bw-tertiary",
        category: "horisontaalityöntö",
        defaultMovementName: "Lisäpainodippi",
        sets: 3,
        reps: bwDipReps,
        targetVx: bwDipFoundationVx,
        loadPct: 0,                              // 0 = BW only
        loadPctReferenceMovementName: "Lisäpainodippi",
        suggestedLoadKg: 0,
        note: phase === "foundation"
          ? "BW-dippi (0 kg lisäpainoa) — volyymi + ROM-pohja, V5 = volume-zone (ei grindiä, oikea proximity foundation-blokille). Tertiary 72 h ennen TO-primarya."
          : "BW-dippi (0 kg lisäpainoa) — ylläpito, V3. Ei lisäpainoa = ei venähdys-riskiä. Tertiary 72 h ennen TO-primarya.",
      };
      // Insertoi indeksiin 3 (row + curl jälkeen, ennen face pullia).
      // Jos accessory-lista on lyhyempi (esim. < 4), push:taan loppuun.
      const insertIdx = Math.min(3, accessories.length);
      accessories = [
        ...accessories.slice(0, insertIdx),
        bwDipSlot,
        ...accessories.slice(insertIdx),
      ];
    }
    const coreSlot = slotAccessory("core-hollow", "core", "Ab wheel rollout", { sets:2, reps:10, targetVx:3 });
    // v4.33.0 M20b: 8 min yläraaja-prehab-protokolla (Cools 2014/2015 + Reinold 2004/2007 +
    // Tyler 2010 + Decker 1999 + ElMaraghy 2012). Atleetin tendin-riski-historia
    // (olkapää/kyynärpää/rinta-insertio vihoittelee ilman lämmittelyä) edellyttää
    // strukturoitu warmup. Track B Q-B2 -syvätutkimuksen Claude-suositus.
    // v4.34.10: Lähteet pois sulkeista. Käytännön ohjeet, lyhyet imperatiivit.
    const warmupArr = phase === "peaking" ? MA_WARMUP_PEAKING : [
      // v4.34.22 syvätutkimus-pohjainen optimointi (Pri 3 — MA):
      //   POIS: Cross-body + pec minor doorway (Gutiérrez-Espinoza 2019: ei lisähyötyä exerciseen vs. scap wall slide
      //         joka aktivoi serratuksen = pec minor antagonisti). Prone Y siirretty TO/LA-päiviin (LT-rooli ei kriittinen vetopäivänä).
      //   YHDISTÄ: Scap wall slides + serratus punch combo yhdeksi liikkeeksi (Hardwick 2006, Hwang 2017, Kang 2019 meta).
      //   LISÄÄ: Banded posterior shoulder MWM (Satpute 2022 -meta SMD −1.07, Teys 2008: 15.3% ROM + 20.2% PPT).
      //   Tyler 2×/vk (MA + TO) — Tyler 2010 oli kroonisen lateral epicondylosiksen hoito; prevention 2×/vk minimum.
      //   Kesto: ~8 min (ennen ~10-12 min).
      // 1. Yleislämmittely — verenkierto käyntiin
      { name: "Hyppynaru / käsiergometri", desc: "60-90 s reipas tahti. (1) Hyppynaru tai käsiergometri kunnes hengitys nousee. (2) Yhdistä lonkka-pyörittelyt 5/suunta + olkapää-pyörittelyt 10/suunta liikkuessa. Tavoite: verenkierto + nivelneste käyntiin, EI staattista venytystä." },
      // 2. T-rangan liikkuvuus
      { name: "Cat-camel + T-rangan ojennus foam rollerilla", desc: "RINTARANGAN MOBILISOINTI ENNEN VETOA. CAT-CAMEL: (1) Polvi-kämmen-asentoon. (2) Pyöristä selkä ylös (cat) — leuka rintaan, lavat erilleen. (3) Notkista alas (camel) — lavat yhteen, katse ylös. 6 sykliä. T-RANGAN OJENNUS FOAM ROLLERILLA: (4) Asetu selinmakuulle, foam roller poikittain rintarangan alla. (5) Kädet niskan tukena, anna ylävartalon notkahtaa rollerin yli — älä pakota. (6) 8 toistoa per puoli (siirrä rolleria 2-3 kertaa eri kohtiin)." },
      // 3. RC-aktivaatio: side-lying ulkokierto
      { name: "Side-lying ulkokierto (pyyhe kainalossa)", desc: "INFRASPINATUS + TERES MINOR -AKTIVAATIO. (1) Asetu kyljellesi lattialle, alavartalo suorana. (2) Aseta taiteltu PYYHE käsivarren ja kyljen väliin (kyynärpään kohdalle). (3) Yläkäsi: kyynärpää 90° koukussa, kämmen alas. Pidä 2-4 kg käsipaino. (4) Kierrä kämmen ulos kohti kattoa hitaasti 2 s, 1 s pause yläasennossa. (5) Lasku 2 s. (6) 12-15 toistoa. Vaihda puoli. Cue: kyynärpää PYSYY kyljen vieressä, vain käsivarsi rotatoituu." },
      // 4. SA + LT yhdistetty (entinen scap wall slides + serratus punch yhteen)
      { name: "Scap wall slides + serratus punch combo", desc: "SA AKTIVAATIO + LT PRIMING. WALL SLIDE: (1) Selkä seinää vasten, kyynärpäät + ranteet seinässä W-asennossa. (2) Liu'uta käsivarret ylös Y-asentoon, lavat alhaalla + lähekkäin. 8 toistoa. SERRATUS PUNCH: (3) Sama asento, viimeisellä toistolla pidä Y-asento + työnnä kädet ETEEN seinästä irti — lavat eteenpäin. 1 s pause täydessä protraktiossa. (4) 1×8 punch-toistoa. Cue: 'työnnä maa pois alta', ribs down. Hwang 2017: SA optimaalisin 110-120° elevaatiossa." },
      // 5. Banded posterior shoulder MWM (UUSI v4.34.22 — Satpute 2022 -meta)
      { name: "Banded posterior shoulder MWM", desc: "POSTERIOR CAPSULE GLIDE — akuutti ROM + kipu-edut (Satpute 2022 SMD −1.07). (1) Ankkuroi paksu kuminauha olkapään tasolle takaa (squat rack tms). (2) Kierrä kuminauha etu-olkapään ympärille kainalon lähelle. (3) Astu eteenpäin tensioniin — tunne nivelen avautuminen takaa. (4) Tee 15 kevyttä chest press -liikettä eteenpäin (kädet eteen + takaisin). (5) Älä pakota — fokus on joint decompressionissa." },
      // 6. Distal biceps + kyynärpää-prehab (vain MA + TO, ei joka leuka-päivä)
      { name: "Rannekäännöt (kevyt) — kyynärpää-prehab", desc: "DISTAL BICEPS + EXTENSOR-BALANSI (vain 2×/vk: MA + TO). (1) Tartu kevyeen käsipainoon (2-5 kg). (2) Käsivarsi penkillä/reidellä, ranne reunan yli. (3) WRIST CURL: kämmen YLÖS, koukista ranne pohjaan ja takaisin — 12 toistoa. (4) REVERSE WRIST CURL: kämmen ALAS, ojenna ranne ylös ja takaisin — 12 toistoa. Molemmilla käsillä. Cue: hidas + kontrolloitu." },
      // 7. Liike-spesifit primerit
      { name: "BW-leuka (kevyt) + Räjähtävä leuka BW", desc: "LIIKEMALLIN HERÄTYS + NEURAL PRIMER. (1) BW-LEUKA: 5 kontrolloitua toistoa, EI lähelle failurea. (2) Lepo 60 s. (3) RÄJÄHTÄVÄ LEUKA: täysi hangi, vedä MAKSIMI NOPEUDELLA leuka tangon yli. (4) Kontrolloitu lasku 1-2 s. (5) 3 räjähtävää toistoa. KESKEYTÄ heti jos nopeus laskee — primer ei volume." },
      // 8. Spesifinen ramp-up
      { name: "Warmup ramp (primary)", desc: "PRIMARYN LIIKE-SPESIFI RAMP. Worksetin painosta laskettuna: (1) 40% × 5 — liikemallin herätys. (2) 55% × 3 — kuorman tuntu. (3) 70% × 2 — neural primer. (4) 85% × 1 — work-load preview. Lepo 90 s, sitten 1. workset. Lepo settien välissä 60-120 s, 3-5 min ennen ensimmäistä worksetia." },
    ];
    return { dayOfWeek:1, dayType:"heavy", label:label || "MA — Leuka + Selkä",
      warmup: warmupArr,
      slots:[...slots, ...accessories, coreSlot] };
  }

  // v4.28.0 (L1/M2): tiDay käyttää nyt eksplisiittistä backoffConfig-objektia, ei
  // hardkoodattua paused squat -backoffia. Tämä korjaa block-periodization-loukkauksen
  // jossa 2s paused singles esiintyi vielä peaking-viikolla (vk 14, 10 pv ennen kisaa).
  //   backoffConfig = { style: "regular"|"paused"|"tempo"|"kisastyle", pct?: number } | null
  //   jos pct puuttuu, käytetään primaryPct × 0.80 defaulttia.
  //   null = ei backoffia (esim. realization/taper-viikot jos halutaan).
  function tiDay(label, sets, reps, vx, primaryPct, topPct, accessoryList, backoffConfig, phase, primaryNote, topSingleFirst, topConfig) {
    // v4.32.8: primaryNote-parametri lisätty (esim. vk 14 decision-tree: jos vk 13 V0-V1 → harkitse @95%)
    // v4.32.9 M14: topSingleFirst — heavy-first-järjestys vk 8/10/11/12/13
    // v4.32.9 M16: topConfig tukee calibration-formaattia (vk 8: 92%×3 V1, vk 12: 95%×2 V1)
    const primaryIsAnchor = reps === 1 && primaryPct >= 0.85;
    const primarySlot = {
      role:"primary", category:"alaraaja", defaultMovementName:"Takakyykky",
      sets, reps, targetVx:vx, loadPct:primaryPct, suggestedLoadKg:seedK(primaryPct),
      competitionLift:true, isBarbell:true,      warmupSets: RAMP_BARBELL.slice(0, topPct ? 5 : 4),
      allowVelocityInput: primaryIsAnchor,
    };
    if (primaryNote) primarySlot.note = primaryNote;
    const slots = [primarySlot];
    // Backoff: block-aware tyyli (L1 korjaus)
    // v4.32.8: backoffConfig nyt tukee sets+reps+targetVx-override (vk 14 motor-pattern 1×3 V4 @60%)
    if (backoffConfig !== null) {
      const cfg = backoffConfig || { style: "paused" };  // legacy-default jos kutsuja ei anna mitään
      const style = SQUAT_BACKOFF_STYLES[cfg.style] || SQUAT_BACKOFF_STYLES.paused;
      const backoffPct = cfg.pct ?? Math.round(primaryPct * 0.80 * 100) / 100;
      const backoffSets = cfg.sets ?? 3;            // v4.32.8: sets-override (esim. vk 14 motor-pattern 1×3)
      const backoffReps = cfg.reps ?? (reps + 1);   // H7: yhdenmukaistus +1 rep MA/TO:n kanssa
      const backoffVx = cfg.targetVx ?? (vx + 1);   // v4.32.8: vx-override (esim. vk 14 V4 motor-pattern)
      slots.push({
        role:"backoff", category:"alaraaja", defaultMovementName:"Takakyykky",
        sets: backoffSets, reps: backoffReps, targetVx: backoffVx,
        loadPct: backoffPct, suggestedLoadKg: seedK(backoffPct),
        note: cfg.note || style.note,
        isBarbell: true,      });
    }
    if (topPct) {
      const rpeLabel = topPct >= 0.97 ? "RPE 9.5" : topPct >= 0.95 ? "RPE 9" : topPct >= 0.92 ? "RPE 8–8.5" : "RPE 8";
      // v4.32.9 M14 + M16: topSingleFirst + topConfig calibration
      const topReps = topConfig?.reps ?? 1;
      const topRole = topConfig?.role ?? "secondary";
      const topIsCalibration = topConfig?.isCalibration === true;
      const topNotePrefix = topIsCalibration ? `${topConfig.weekLabel || "Kalibrointi"} ${topReps}×${topReps} V1 — low-rep e1RM` : `Top single ${rpeLabel}`;
      const topSlot = {
        role: topRole, category:"alaraaja", defaultMovementName:"Takakyykky",
        sets:1, reps: topReps, targetVx:1, loadPct:topPct, suggestedLoadKg:seedK(topPct),
        note: `${topNotePrefix}${topSingleFirst ? " (heavy-first)" : ""}`,
        isBarbell:true, allowVelocityInput: true,
        ...(topIsCalibration ? { isCalibration: true } : {}),
      };
      if (topSingleFirst) {
        slots.unshift(topSlot);
      } else {
        slots.push(topSlot);
      }
    }
    const accessories = accessoryList === undefined ? lowerAcc() : accessoryList;
    // v4.27.18: TI saa anti-rotation coren (frontaalitason spine-stability raskaassa kyykyssä)
    // MA + TO säilyttävät hollow:n (sagittal flexion tukee leuka/dippi/MU-chainia)
    // v4.32.8: targetVx-fallback ei ohjaa foundationia (phaseVariants V5 yliaja).
    // Hardcoded null = phaseRep on yksin autoritatiivinen source (cleanest).
    const coreSlot = slotAccessory("core-antirotation", "core", "Pallof press", { sets:3, reps:10, targetVx:null, note:"10 toistoa per puoli — anti-rotation, spine-stability raskaaseen kyykkyyn" });
    // v4.32.7: glute pre-activation lisätty Cossack squatin ja goblet-vaiheen väliin.
    // Perustelu: ramp-vaiheessa pakara aktivoituu vasta 60-75% kohdalla — pre-aktivaatiolla
    // pakaran motor unit recruitment käynnistyy alusta → koko rampin glute-osallistuminen
    // paranee → kyykyn alaosan (out-of-the-hole) räjähtävyys nousee. Banded variant lisää
    // glute medius -aktivaation (lateraalinen polvistabilointi 200 kg+ kyykyssä).
    // v4.33.0 M20c: 9 min alaraaja-prehab-protokolla (Behm 2016 + McGill 2002/2015 +
    // Boren 2011 + Distefano 2009 + Reiman 2014 + Rio 2015). Track B Q-B2 -syvätutkimuksen
    // Claude-suositus. Reisi-atrofian rebuild + spinal stiffness + glute aktivaatio
    // ennen raskasta kyykkyä.
    // v4.34.10: Lähteet pois sulkeista. Käytännön ohjeet.
    const warmupArr = phase === "peaking" ? TI_WARMUP_PEAKING : [
      // v4.34.22 syvätutkimus-pohjainen optimointi (Pri 2 — TI):
      //   LISÄÄ: Banded ankle dorsiflexion (knees-to-wall) — Kim 2015 r²=0.435 squat-syvyydelle (suurin yksittäinen
      //          evidence-pohjainen squat-warmup-elementti, PUUTTUI aiemmin).
      //   POIS: Spanish squat — Rio 2015 oli rehab/in-season pain modulation, ei warmup terveelle atleetille.
      //          (Säilytetty optionaalisena jos polvioireita ilmenee.)
      //   POIS: Reverse lunge — overlap BW squatin kanssa.
      //   YHDISTÄ: Banded clamshell + SL glute bridge + lateral walk → "Banded monster walk + SL glute bridge"
      //            (Gasibat 2023: SL bridge yksin aktivoi glute maxin riittävästi neuraaliseen primingiin).
      //   Kesto: ~9 min (ennen ~13 min).
      // 1. Yleislämmittely
      { name: "Pyörä / reipas kävely", desc: "90 s reipas tahti. (1) Kuntopyörä matalalla vastuksella TAI reipas kävely. (2) Yhdistä lonkka-pyörittelyt 5/suunta + nilkkojen pumppaus. (3) Lopeta kun hengitys nousee + alavartalo lämmin. Tavoite: verenkierto + nivelneste käyntiin, EI staattista venytystä." },
      // 2. Banded ankle mobilization (UUSI v4.34.22 — Kim 2015 evidence)
      { name: "Banded ankle dorsiflexion (knees-to-wall)", desc: "ANKLE DORSIFLEXION — kriittinen squat-syvyyden tekijä (Kim 2015 r²=0.435). (1) Asetu polviseisontaan seinää vasten. (2) Aseta paksu kuminauha nilkan etuosan ympärille, ankkuroi se taakse (kiinteään pisteeseen). (3) Etupolvi 10-15 cm seinästä. (4) Liu'uta polvi seinää kohti — kantapää PYSYY maassa. (5) Pidä yläasennossa 2 s, palaa. (6) 8 toistoa per puoli, 2 settiä. Cue: jos kantapää nousee → siirry lähemmäs seinää." },
      // 3. Lonkka-mobiliteetti
      { name: "Hip 90/90 + Cossack squat", desc: "LONKKA + ADDUKTORIT. HIP 90/90: (1) Istu lattialle, etujalka 90° kulmassa edessä, takajalka 90° kulmassa sivussa. (2) Kallista ylävartaloa eteen kohti etujalkaa kunnes tunnet venytyksen pakaran yläosassa. (3) Pidä 30 s. Vaihda puoli. COSSACK SQUAT: (4) Seiso jalat leveässä haara-asennossa. (5) Siirrä paino TOISELLE jalalle, polvi koukistuu, toinen jalka SUORANA + kantapää maassa. (6) Mene niin alas kuin nivelliikkuvuus sallii. (7) 5 toistoa per puoli." },
      // 4. Core stability (McGill Big 3 lite)
      { name: "McGill Big 3 lite", desc: "SELKÄRANGAN STABILITEETTI ENNEN RASKASTA KYYKKYÄ. CURL-UP: (1) Selinmakuulla, toinen polvi koukussa, toinen jalka suorana. (2) Kädet alaselän taakse tueksi. (3) Nosta pää + hartiat 10 cm — ei pyöristä rintarankaa. (4) Pidä 8 s. 3 toistoa. SIDE BRIDGE: (5) Kyljellään, kyynärvarsi tukena, vartalo suorana. (6) Pidä 8 s. 2 toistoa per puoli. BIRD DOG: (7) Polvi-kämmen-asento. (8) Ojenna vastakkainen käsi + jalka suoraksi. (9) Pidä 8 s, vartalo paikallaan. 2 toistoa per puoli." },
      // 5. Glute aktivaatio (yhdistetty banded monster walk + SL glute bridge)
      { name: "Banded monster walk + SL glute bridge", desc: "PAKARA-AKTIVAATIO YHDESSÄ KOMPAKTISSA LIIKKEESSÄ (Gasibat 2023: SL bridge aktivoi glute maxin merkittävästi). MONSTER WALK: (1) Kuminauha polvien ympärille, puolikyykky-asento. (2) Astele eteen-sivu-eteen-sivu pieniä askelia, 10 askelta per suunta — kuminauha kireällä koko ajan. SL GLUTE BRIDGE: (3) Selinmakuulla, toinen polvi koukussa, toinen jalka SUORANA YLHÄÄLLÄ. (4) Nosta lantio ylös aktivoimalla pakara, 2 s pause yläasennossa. (5) 8 toistoa per puoli." },
      // 6. Quad re-aktivaatio + motor pattern
      { name: "BW squat (3 s alas, 1 s pohja)", desc: "QUAD HERÄTYS + KYYKKYPATTERN. (1) Seiso jalat hartialeveydellä, varpaat hieman ulospäin. (2) Lasku 3 s — hidasta tarkoituksellisesti, tunne quad-aktivaatio. (3) 1 s paussi pohjalla — pidä rinta auki, polvi varpaiden suuntaan. (4) Räjähtävä nousu. (5) 10 toistoa. Cue: tämä riittää motor patterniin — reverse lunge poistettu (overlap)." },
      // 7. Spesifinen squat ramp
      { name: "Warmup ramp (primary)", desc: `PRIMARYN LIIKE-SPESIFI RAMP. Worksetin painosta laskettuna: (1) 35% × 5 toistoa — liikemallin herätys, hidas tempo. (2) 50% × 3 toistoa — kuorman tuntu, paussi pohjalla. (3) 65% × 2 toistoa — neural primer. (4) 78% × 1 toisto — work-load preview.${topPct ? " (5) 88% × 1 toisto — top single primer." : ""} Lepo 60-120 s ramp-vaiheessa, 3-5 min ennen ensimmäistä worksetia.\n\nHUOM v4.34.22: Spanish squat (entinen item 6) POISTETTU — Rio 2015 oli rehab-protokolla, ei warmup terveelle atleetille. Jos polvioireita ilmenee, palaa 2×30 s wall sit ennen rampia.` },
    ];
    return { dayOfWeek:2, dayType:"heavy", label:label || "TI — Kyykky + Alavartalo",
      warmup: warmupArr,
      slots:[...slots, ...accessories, coreSlot] };
  }

  function toDay(label, sets, reps, vx, primaryPct, backoffPct, topPct, accessoryList, backoffStyle, phase, topSingleFirst, topConfig) {
    // v4.32.9 M14: topSingleFirst — heavy-first-järjestys vk 8/10/11/12/13
    // v4.32.9 M16: topConfig tukee calibration-formaattia
    const primaryIsAnchor = reps === 1 && primaryPct >= 0.85;
    const slots = [
      { role:"primary", category:"horisontaalityöntö", defaultMovementName:"Lisäpainodippi",
        sets, reps, targetVx:vx, loadPct:primaryPct, suggestedLoadKg:seedD(primaryPct),
        competitionLift:true,        warmupSets: RAMP_DEFAULT,
        allowVelocityInput: primaryIsAnchor,
        techniqueNote: "Kontrolloitu alakohta — ei bouncea. Olkapää noin 90° tai hieman yli. Pec-tear-riski korkea bounce-variaatiossa raskailla kuormilla." },
    ];
    if (backoffPct) {
      // v4.28.0 (M2/H7): block-aware backoff. Foundation pushAccPrehab hoitaa prehab-volyymin;
      // tästä on backoff aktiivinen vain strength+ kun backoffPct annetaan kutsujalta.
      const styleKey = backoffStyle || "kilpaote";
      const style = DIP_BACKOFF_STYLES[styleKey] || DIP_BACKOFF_STYLES.kilpaote;
      slots.push({
        role:"backoff", category:"horisontaalityöntö", defaultMovementName:"Lisäpainodippi",
        sets:3, reps:reps+1, targetVx:vx+1,           // H7: 2→3 sarjaa
        loadPct:backoffPct, suggestedLoadKg:seedD(backoffPct),        note: style.note,
      });
    }
    if (topPct) {
      const rpeLabel = topPct >= 0.97 ? "RPE 9.5" : topPct >= 0.95 ? "RPE 9" : topPct >= 0.92 ? "RPE 8–8.5" : "RPE 8";
      // v4.32.9 M14 + M16
      const topReps = topConfig?.reps ?? 1;
      const topRole = topConfig?.role ?? "secondary";
      const topIsCalibration = topConfig?.isCalibration === true;
      const topNotePrefix = topIsCalibration ? `${topConfig.weekLabel || "Kalibrointi"} ${topReps}×${topReps} V1 — low-rep e1RM` : `Top single ${rpeLabel}`;
      const topSlot = {
        role: topRole, category:"horisontaalityöntö", defaultMovementName:"Lisäpainodippi",
        sets:1, reps: topReps, targetVx:1, loadPct:topPct, suggestedLoadKg:seedD(topPct),
        note: `${topNotePrefix}${topSingleFirst ? " (heavy-first)" : ""}`,
        allowVelocityInput: true,
        ...(topIsCalibration ? { isCalibration: true } : {}),
      };
      if (topSingleFirst) {
        slots.unshift(topSlot);
      } else {
        slots.push(topSlot);
      }
    }

    // v4.34.3: ECCENTRIC-OVERLOAD WEIGHTED DIP -accessory primary-työn jälkeen.
    // Syvätutkimuksen Liike 1: capsule resilience + tendon-loading-adaptaatio dipin
    // alaposition spesifissä asennossa (deep extension + IR + ER-eccentric load) joka
    // EI replikoidu millään penkki-/OHP-variantilla (Vetter 2022, Liu 2025, Spennato/
    // McKenzie SCJ 2021). Sijoitettu HETI primary-työn jälkeen: sama groove, ei extra
    // lämmittely-overhead, capsule capacity työssä paikallaan kun groove on optimissa.
    // Vetoreps:in mukaan phase-aware (foundation 3×5 BW+10kg / strength 3×4 BW+15-20 /
    // intensity 2×3 BW+15kg / peaking POIS / deload SKIP). Kuormat lasketaan dippi-
    // calibroinnista — atleetin BW + lisäkuorma. Tempo 5-0-X-0 (5s eccentric, ei pause,
    // explosive concentric). Strength-vaiheessa 6-1-X-0 (6s ecc + 1s pause).
    const isPeaking = phase === "peaking";
    const isDeload = primaryPct < 0.65;
    if (!isPeaking && !isDeload) {
      let eccSets, eccReps, eccLoadAdd, eccTempo, eccPause, eccLabel;
      if (reps >= 5) {
        // Foundation: 3×5 BW+10kg
        eccSets = 3; eccReps = 5; eccLoadAdd = 10; eccTempo = "5-0-X-0"; eccPause = "1 s alapositio";
        eccLabel = "Foundation eccentric-overload";
      } else if (reps === 4) {
        // Strength: 3×4 BW+17.5kg (väli 15-20)
        eccSets = 3; eccReps = 4; eccLoadAdd = 17.5; eccTempo = "6-1-X-0"; eccPause = "1 s no bounce";
        eccLabel = "Strength eccentric-overload";
      } else {
        // Intensity: 2×3 BW+15kg (maintenance)
        eccSets = 2; eccReps = 3; eccLoadAdd = 15; eccTempo = "5-0-X-0"; eccPause = "ei pausea";
        eccLabel = "Intensity maintenance ecc-overload";
      }
      slots.push({
        role: "accessory",
        category: "horisontaalityöntö",
        defaultMovementName: "Lisäpainodippi",
        slotId: "dip-eccentric-overload",
        sets: eccSets, reps: eccReps,
        targetVx: null,  // ekstsentrisessä työssä Vx ei ole mielekäs metriikka
        suggestedLoadKg: eccLoadAdd,  // kg lisäpainoa (ei loadPct, koska maintenance-kuorma)        allowVelocityInput: false,
        note: `${eccLabel} ${eccSets}×${eccReps} BW+${eccLoadAdd} kg — tempo ${eccTempo}, ${eccPause}. ROM = primary-dipin ROM (ei extra-syvyyttä). Chest leads down (forward lean säilyy). EI valsalvaa alapositiossa. Lepo 2-2.5 min. Jos anterior shoulder discomfort >2/10, pudota 5 kg tai lyhennä ROM 10°. (Track C deep research v4.34.3 — Vetter 2022, Liu 2025)`,
      });
    }
    // v4.34.3: TO yläraaja-prehab REFAKTOROITU 2. KERTAA syvätutkimuksen pohjalta
    // (35 peer-reviewed-lähdettä, McKenzie 2022 EMG dippi-spesifi, Decker 2003 SSC-EMG,
    // Park & Hwang 2019 SA push-up-plus, Reiner 2023 + Warneke 2024 pec-stretch,
    // Caravan 2018 KB armbar SA/LT, Soltani 2025 dynamic vs static).
    //
    // Tutkimuksen mekanismidiagnoosi atleetin oirekuvalle (jäykistyivät, ei pec-pumppia,
    // 48-72 h palautuminen): KOMBINAATIO (g) tekniikkavaje + (a) anterior capsule
    // capacity-deficit + (b) subscapularis-aliaktivaatio. Pelkkä posterior cuff -volyymi
    // (Cools/Reinold-tyyppinen pull-apart + ER + face pull, kuten v4.34.2) EI ratkaise
    // anterior-vajetta — tarvitaan SUBSCAPULARIS-AKTIVAATIO + PEC STERNAL HEAD MOBILITY +
    // SA/LT-priming + LOADED MOBILITY (KB armbar).
    //
    // v4.34.3 protokolla (foundation/strength = 8-12 min, intensity/peaking = lyhennetty
    // 6-8 min koska peaking-vaiheessa neural readiness > capacity building, pitkä warmup
    // kuluttaa CNS:ää).
    // Phase-detection: peaking on eksplisiitti, intensity-detection käyttää heuristiikkaa
    // (primaryPct >= 0.85 && reps <= 3) koska phase-arg ei tällä hetkellä ole vk 9-11
    // call-sitejen läpi propagated. Vk 9-11 dippi: 4×3 @0.85, 4×3 @0.87, 3×3 @0.90.
    const isIntensityWeek = phase === "intensity" || (primaryPct >= 0.85 && reps <= 3);
    // v4.34.5: KÄYTTÄJÄPALAUTE TO-treenin jälkeen (4×6 V3 @ 63 kg = vk 2-3 foundation):
    // herättyä "olkapäät kankeat edestä, rinta hyvä jos edes jumissa". Atleetin diagnoosi:
    // VOIMA RIITTÄÄ MUTTA TEKNIIKKA EI VIELÄ. Kuorma valuu etudeltaan + capsuleen koska
    // BW dippi -warmup oli liian vähän (1×3 slow ecc) — kudokset eivät lämmenneet eikä
    // pec-aktivaatio-pattern internalisoitunut ennen worksetejä. Atleetin sanat:
    // "ihan kevyt kehopainodippi oli niin vähissä, että paikat eivät olleet lämmenneet
    // sarjoihin" + "dippi tarvitsee foundation-vaiheessa toistoja niin että pumppi tulee
    // oikeisiin kohtiin".
    // FIX v4.34.5: BW dippi -volyymi 3-7×kasvatettu (oli 1×3 slow ecc = 3 reps, nyt 2×8
    // standard tempo + 1×3 slow ecc = 19 reps), eksplisiittinen "rinnan pumppaus" -fokus,
    // extended ramp 30%×8 alkuun standardin 40-55-70-85% rinnalle (= +8 reps lisä-pumpissa).
    // v4.34.10: Lähteet pois sulkeista. Käytännön ohjeet — yksiselitteiset imperatiivit.
    // Lisätty Joey Seyforth Banded Posterior Shoulder Mobilization (joint decompression).
    const warmupArr = phase === "peaking" ? TO_WARMUP_PEAKING : (isIntensityWeek ? [
      // v4.34.14: desc-kentät laajennettu numeroituihin suoritusohjeisiin (Option C).
      // INTENSITY-vaiheen versio (~7-9 min)
      { name: "Hyppynaru / shadow boxing / käsiergometri", desc: "90 s reipas tahti. (1) Hyppynaru tai shadow boxing — kunnes hengitys nousee. (2) Käsipyörittelyt eteenpäin 10 + taaksepäin 10. Tavoite: verenkierto + hartiat lämpimäksi." },
      { name: "Belly-press isometric (subscap)", desc: "ANTERIOR CUFF AKTIVAATIO. (1) Aseta kämmen vatsaan, kyynärpää suoraan eteenpäin. (2) Paina vatsaan ranne NEUTRAALINA (ei koukistu). (3) 10 s puristus, 5 s lepo. (4) 2 settiä molemmilla käsillä. Cue: hartia EI nouse korviin." },
      { name: "Side-lying IR @ 90° abd", desc: "SUBSCAP SELEKTIIVINEN HERÄTYS. (1) Asetu kyljellesi, yläkäden kainalo 90° auki, kyynärpää 90° koukussa, kämmen alas. (2) 2-4 kg KB. (3) Kierrä kämmen ylös kohti kattoa 3 s, 1 s pause. (4) Lasku 3 s. (5) 10 toistoa. Vaihda puoli." },
      { name: "Push-up plus", desc: "SERRATUS AKTIVAATIO. (1) Punnerrusasento. (2) Tee normaali punnerrus alas + ylös. (3) Yläpositiossa työnnä lapaluut TÄYDESTI eteen, lavat leviävät. (4) 1 s pause. (5) 8 toistoa." },
      { name: "Doorway PNF (pec sternal)", desc: "PEC MOBILITY ilman capsule-overstretchiä. (1) Ovenkarmilla, kyynärvarsi karmissa hartian tasolla, kainalo 60° auki. (2) Astu eteenpäin → venytys rinnassa. (3) Paina karmia 5 s (isometric), rentoudu 15 s syvempään. (4) 2 toistoa. (5) Toista kainalo 120° — sama. ÄLÄ yli 150°." },
      { name: "🎯 BW dippi PUMP-set (chest-activation)", desc: "INTENSITY-PUMP. (1) Tankodippi BW (lisäpaino 0). (2) 6 toistoa standard tempo: 2 s alas, 1 s pause alapositiossa, normaali ylös. (3) FOKUS: forward lean 30-45° KOKO ajan, rinta menee tankoja kohti. (4) Varmista että RINTA pumppaa lämpimäksi ennen kuormaa — jos pump tulee etudeltaan + tricepsiin = lisää 1 setti rinta-fokuksella." },
      { name: "BW dippi slow eccentric", desc: "NEURAL PRIMER pumppi-setin JÄLKEEN. (1) BW tankodippi. (2) 3 toistoa, 5 s lasku, 1 s pause alapositiossa, normaali ylös. (3) Kontrolloitu — fokus capsule-spesifissä eccentric-laskussa kun rinta on jo lämmin." },
      { name: "Warmup ramp (primary)", desc: "PRIMARYN LIIKE-SPESIFI RAMP. Worksetin painosta laskettuna: 30% × 8 (pump) → 50% × 5 → 70% × 3 → 85% × 1 → workset. Lepo 60-90 s settien välissä, 3 min ennen 1. worksetia." },
    ] : [
      // v4.34.22 KRIITTINEN OPTIMOINTI (Pri 1 — TO foundation/strength) — Alghosi 2025 evidence:
      //   Alghosi 2025 (BMC Musculoskelet Disord, DOI 10.1186/s12891-025-09379-0): SIS-atleetilla staattinen
      //   venyttely heikentää eksentristä IR-voimaa –2.5 Nm (d=0.69) ja proprioseptiikkaa +1.2° (d=2.91)
      //   vs dynaaminen warmup. Atleetin tendinopatia-historia + pec-tear-riski = funktionaalisesti SIS-similar.
      //   Aiempi versio sisälsi 3+ min staattista TUT:ia ennen 80 kg dippiä → AKTIIVISESTI HAITALLINEN.
      //
      //   MUUTOKSET:
      //   1. SIIRRÄ: BW dippi PUMP-set 2×8 KEYNOTE → kohta 6 (oli kohta 9). Sport-spesifi neuromuscular
      //      priming ENNEN pitkiä staattisia pidoja (Behm 2016 + Alghosi 2025 + atleetin field-feedback).
      //   2. POIS: Lift-off prep — Kim 2025 (DOI 10.3390/healthcare13111349): belly-press selektiivisin
      //      subscap-aktivaattori (pienin PICR-shift), lift-off osittain redundantti + nostaa AD/PM-kompensaatiota.
      //   3. LYHENNÄ: KB armbar 30 s → 20 s (Alghosi 2025 staattinen overload-suoja).
      //   4. LYHENNÄ: Side-lying IR tempo 3-3 → 2-2 (dynaamisempi IR-aktivaatio).
      //   5. YHDISTÄ: Push-up plus + Wall slide → yhteen liikkeeseen (Hardwick 2006, päällekkäisyys).
      //   Kesto: ~10 min (ennen ~13 min).
      //
      // 0-2 min: PERFUSION
      { name: "Shadow boxing / hyppynaru / arm circles", desc: "90 s reipas tahti. (1) Hyppynaru tai shadow boxing 60 s — kunnes hengitys nousee. (2) Käsipyörittelyt eteenpäin 10 + taaksepäin 10. (3) Lopeta kun hartiat tuntuvat lämpimältä. Tavoite: verenkierto + nivelneste käyntiin, EI staattista venytystä." },
      // 2-3 min: SUBSCAPULARIS-AKTIVAATIO (anterior cuff)
      { name: "Belt-squeeze belly-press isometric", desc: "UPPER + LOWER SUBSCAP -AKTIVAATIO. Kim 2025 (DOI 10.3390/healthcare13111349): selektiivisin SSC-aktivaattori, pienin PICR-shift (lift-off prep redundantti — POISTETTU v4.34.22). (1) Aseta kämmen vatsaan, kyynärpää suoraan eteenpäin (ei sivulle). (2) Paina vatsaan kuin pumppaisit ilmapatjaa, ranne PYSYY NEUTRAALINA. (3) 10 s puristus, 5 s lepo, toista. 2 settiä molemmilla käsillä. Cue: hartia EI nouse korviin." },
      // 3-4 min: SUBSCAPULARIS @ 90° abd (lyhempi tempo Alghosi 2025 mukaan)
      { name: "Side-lying IR @ 90° abd (2-2 tempo)", desc: "SUBSCAP SELEKTIIVINEN HERÄTYS. (1) Asetu kyljellesi lattialle, alavartalo suorana. (2) Yläkäsi: kainalo 90° auki vartalosta, kyynärpää 90° koukussa, kämmen alas. (3) Pidä 2-4 kg käsipaino. (4) Kierrä kämmen ylös kohti kattoa 2 s, 1 s pause. (5) Lasku 2 s. (6) 10 toistoa. Vaihda puoli. v4.34.22: tempo lyhennetty 3-3 → 2-2 (Alghosi 2025: dynaamisempi IR aktivaatio = parempi proprioseptinen valmistautuminen)." },
      // 4-5 min: SERRATUS + LOWER TRAP YHDISTETTY (entinen Push-up plus + Wall slide → yhteen)
      { name: "Wall slide + serratus punch combo", desc: "SA + LT YHDESSÄ KOMPAKTISSA LIIKKEESSÄ (Hardwick 2006 wall slide aktivoi SA yli 90° elevaatiossa, push-up plus osittain redundantti). WALL SLIDE: (1) Selkä seinää vasten, kyynärpäät + ranteet seinässä W-asennossa. (2) Liu'uta käsivarret ylös Y-asentoon, lavat alhaalla + lähekkäin. SERRATUS PUNCH: (3) Yläasennossa työnnä kädet ETEEN seinästä irti — lavat eteenpäin, 1 s pause täydessä protractionissa. (4) Lasku takaisin W:hen. (5) 8 toistoa. Cue: 'työnnä maa pois alta', ribs down. SA 50-80% MVIC + LT yhtaikaa." },
      // 5-6 min: BANDED POSTERIOR MWM (Satpute 2022 -meta)
      { name: "Banded posterior shoulder MWM", desc: "POSTERIOR CAPSULE GLIDE — Satpute 2022 -meta SMD −1.07 ROM/kipu. (1) Ankkuroi paksu kuminauha olkapään tasolle takaa. (2) Kierrä kuminauha etu-olkapään ympärille kainalon lähelle. (3) Astu eteenpäin tensioniin — tunne nivelen avautuminen takaa. (4) Tee 15 kevyttä chest press -liikettä eteenpäin. (5) Älä pakota — fokus joint decompressionissa." },
      // 6-7 min: 🎯 BW DIPPI PUMP-SET KEYNOTE — SIIRRETTY KOHTAAN 6 (v4.34.22)
      // Behm 2016 + Alghosi 2025 + atleetin field-feedback: dynaaminen sport-spesifi priming ENNEN pitkiä
      // staattisia pidoja, jotta neuromuscular readiness ehtii rakentua ennen ROM-finalisointia.
      { name: "🎯 BW dippi PUMP-set 2×8 (chest-activation, KEYNOTE)", desc: "2×8 standard tempo (2 s alas, 1 s pause alapositiossa, normaali ylös). Lepo 90 s settien välissä. KRIITTINEN FOKUS: forward lean 30-45° KOKO ajan, rinta menee tankoja kohti — TUNNE pec sternal head -aktivaatio (rinta pumppautuu lämpimäksi). Jos pump tulee etudeltaan + tricepsiin = tee 1 LISÄ-set rinta-fokuksella. v4.34.22: SIIRRETTY kohtaan 6 (oli kohta 9) — sport-spesifi priming ennen pitkiä staattisia pidoja (Behm 2016, Alghosi 2025)." },
      // 7-8 min: PEC STERNAL HEAD MOBILITY (PNF, lyhyt — pec-tear-suoja)
      { name: "Doorway PNF pec stretch (≤120° abd)", desc: "PEC STERNAL HEAD MOBILITY. (1) Seiso ovenkarmin kohdalla. (2) Aseta kyynärvarsi karmiin, kainalo 60° auki vartalosta. (3) Astu eteenpäin kunnes tunnet venytyksen rinnassa. (4) PNF: paina kättä karmia vasten 5 s isometric, rentoudu 15 s syvempään venytykseen. (5) 2 toistoa. (6) Toista kainalo 120° — sama. ⚠️ EI YLI 150° (Borstad 2006 + StatPearls: pec-tear-asento 30° humeral extension + 40-90° abd + ER + heavy load → vältä rupture-asentoa). Pec sternal head -fokus." },
      // 8-9 min: LOADED MOBILITY (lyhennetty)
      { name: "Half-kneeling KB armbar (20 s pidot)", desc: "LOADED GH MOBILITY. (1) Toispolviseisontaan. (2) Tartu KB:n kahvaan, työnnä KB suoraan ylös (OHP-lukitus). KB pohjat-ylöspäin, kahva tiukasti puristettuna. (3) Olkapää LUKOSSA alaspäin koko liikkeen ajan. (4) Kallista ylävartaloa hitaasti TAAKSE niin että kuormakättinen olkapää menee horizontal abduction + ER -asentoon. (5) Kahva pysyy SUORAAN ylöspäin. (6) Pidä 20 s tension under tension. (7) 2 toistoa per puoli. KUORMA: 8-12 kg. v4.34.22: pidot lyhennetty 30 s → 20 s (Alghosi 2025 SS-volyymi-suoja)." },
      // 9-10 min: NEURAL PRIMING
      { name: "BW dippi slow eccentric", desc: "1×3, 5 s lasku, 1 s pause alapositiossa — capsule-spesifi neural primer KUN rinta on jo lämmin pump-setistä." },
      // 10-11 min: EXTENDED RAMP
      { name: "Warmup ramp (primary)", desc: "30% × 8 → 45% × 5 → 60% × 3 → 75% × 2 → 85% × 1 → workset." },
      // 11+ (optional): PAPE
      { name: "PAPE 6 s isohold (optional)", desc: "1 set @ sticking-point-syvyydessä, 80%+ 1RM, 6-8 min lepo ennen worksetiä. Skip jos sotkee timingin. Hughes 2024 -meta tukee korkean intensiteetin CA:ta." },
    ]);
    return { dayOfWeek:4, dayType:"heavy", label:label || "TO — Dippi + Työntö",
      warmup: warmupArr,
      slots:[...slots, ...(accessoryList === undefined ? pushAcc() : accessoryList), slotAccessory("core-hollow", "core", "Ab wheel rollout", { sets:2, reps:10, targetVx:3 })] };
  }

  // ─── Finisher-accessory blokki 4:lle (v4.25 P1-11) ───
  // Vk 13–15: kevyt aktivointi ilman fatiikkaa. 2 sarjaa ydin-lihasryhmille,
  // korkea reps + matala intensiteetti → verenkierto + tekninen ylläpito.
  // Tarkoitus: estää "alitreenattu"-tunne taperin aikana, ei lisätä kuormaa.
  const finisherAcc = (intensityLabel = "aktivointi") => [
    slotAccessory("scapular-control", "horisontaaliveto", "Face pull",
      { sets:2, reps:15, targetVx:4, note:`Kevyt — ${intensityLabel}` }),
    slotAccessory("tricep-lockout",   "ojentajaekstensio", "Tricep pushdown",
      { sets:2, reps:12, targetVx:4, note:`Kevyt — ${intensityLabel}` }),
  ];
  const finisherMinimal = (intensityLabel = "vain aktivointi") => [
    slotAccessory("scapular-control", "horisontaaliveto", "Face pull",
      { sets:2, reps:12, targetVx:4, note:`Kevyt — ${intensityLabel}` }),
  ];

  // MU pysyy absoluuttisena kg:ina — MU:ssa e1RM ei ole luotettava (bimodaalinen:
  // joko onnistuu tai ei), ja progressio on pieninä askelina BW:n yli (2.5-5 kg).
  //
  // v4.25 P1-1: fsWeek-parametri lisää etukyykky-secondary-slotin LA:lle.
  // Perustelu: atleetin tavoite 175 → 200+ kg 16 vk:ssa vaatii 2×/vk kyykky-
  // frekvenssin (muscle memory retraining, Psilander et al. 2019). LA-päivä
  // 72h TI:n jälkeen = hyvä palautuminen. Etukyykky (ei takakyykky) = eri
  // motor pattern, matalampi selkäfatiikka. Intensiteetti 55–75% V3–V4 =
  // tekninen volyymi, ei raskas toinen kyykky.
  //
  // v4.25 P1-8: MU targetVx pakotetaan minimiin 2 (ei koskaan Vx1 MU:lle).
  // Perustelu: MU on teknis-voimahybridi, tekniikka rikkoutuu ennen voimaa
  // väsymyksen alla. V1 = RIR 1 = seuraava toisto failure → 4. sarja on
  // "epäpuhdas" kuormitettuna. Riskinhallintapäätös.
  function laDay(label, muLoad, muSets, muNote, muVx, fsWeek, finisher) {
    // v4.28.0 (M4): isSkill-haarassa ei enää käytetä vapaatekstistä muNotea vaan
    // rakennetaan primary-MU-slotin rinnalle skill-spesifiset slotit:
    //   1) Muscle-up eksentrinen (5 × 2, 5-8 s lasku, pec/lats/triceps-kapasiteetti)
    //   2) mu-transition (jo olemassa slotAccessory — nostetaan skill-sarjamäärä 5:een)
    //   3) pull-vertical-explosive (Räjähtävä leuka BW 4×3, neural primer MU:n vedolle)
    // Engine autotrakkaa jokaisen, UI renderöi omalla slot-kohtaisella näkymällä.
    const isSkill = muLoad === 0;
    const slots = [];

    // LA:n 2. kyykky-eksposointi — variaatio etenee blokin mukaan (v4.28.1):
    //   Foundation/Strength (vk 1-7): Paused squat — kisaspesifi liikemalli
    //                                  (sama kuin takakyykky, 2 s pysähdys).
    //                                  Aiemmin etukyykky → motor diversity, mutta
    //                                  kokeneelle kilpailijalle 4 kk kisaan se
    //                                  ei siirry kisakyykkyyn. Paused squat antaa
    //                                  sticking-point-spesifisyyden ALUSTA ALKAEN
    //                                  + säilyttää kisakyykyn liikemallin.
    //   Intensity (vk 9-11):           Box squat — stretch-reflex nollattu,
    //                                  puhdas concentric "kuopasta" (sticking
    //                                  point specificity; TI:ssä jo Paused squat
    //                                  backoffissa, LA tarvitsee eri kulman)
    //   Peaking (vk 13-14):            Takakyykky kisastyle kevyt — opener
    //                                  rehearsal + motor groove, maksimi-
    //                                  specificity ennen kisaa
    //
    // Cross-reference loading: kaikki laskevat Takakyykky-e1RM:stä. refScale
    // skaalaa liikkeen RM-suhteeseen takakyykky-e1RM:än kanssa (Paused squat
    // ~85 %, Box squat ~85 %, Takakyykky self 100 %).
    if (fsWeek && fsWeek.pct > 0) {
      const fsLoadPct = fsWeek.pct;
      const movement  = fsWeek.movement  ?? "Paused squat";  // default = v4.28.1 (oli "Etukyykky")
      const refScale  = fsWeek.refScale  ?? 0.85;          // 85 % takakyykky-e1RM:stä
      const fsLoadScaled = fsLoadPct * refScale;
      // Velocity-stop per liike (biomechanicsin ja CNS:n mukaan):
      //   Paused squat: konservatiivinen (2 s pysähdys, stretch-reflex pois)
      //   Box squat: räjähtävämpi (puhdas concentric boksilta) — legacy
      //   Pin squat (v4.32.8): kuten box squat, starttaus pinniltä = stretch-reflex pois
      //   Takakyykky: normaali (kisaliike)
      const vStop = movement === "Box squat" || movement === "Pin squat"
        ? (fsWeek.vx <= 2 ? 0.50 : 0.60)
        : movement === "Takakyykky"
          ? (fsWeek.vx <= 2 ? 0.40 : 0.55)
          : movement === "Paused squat"
            ? (fsWeek.vx <= 2 ? 0.40 : 0.55)
            : (fsWeek.vx <= 2 ? 0.45 : 0.55);  // muu (esim. Etukyykky-legacy)
      // Warmup: kisakyykky-liikemalli (Takakyykky/Paused squat) käyttää standardi
      // tanko-rampia, box/pin squat kevyempi tekninen ramp (eri liikemalli).
      const wUp = (movement === "Takakyykky" || movement === "Paused squat")
        ? RAMP_BARBELL.slice(0, 4)
        : [
            { pct: 0.30, reps: 5, note: "Tyhjä tanko + kevyt" },
            { pct: 0.50, reps: 3, note: "Liikemalli" },
            { pct: 0.70, reps: 2, note: "Aktivaatio" },
          ];
      slots.push({
        role: "secondary",
        category: "alaraaja",
        defaultMovementName: movement,
        sets: fsWeek.sets,
        reps: fsWeek.reps,
        targetVx: fsWeek.vx,
        loadPct: fsLoadScaled,
        // v4.27.13: loadPct viittaa Takakyykky-e1RM:ään (refScale-skaalaus
        // sisäänrakennettu fsLoadScaled:iin). Engine hakee Takakyykky-liikkeen
        // e1RM:n ja kertoo loadPct:llä → liike saa oikean suhteellisen kuorman.
        loadPctReferenceMovementName: "Takakyykky",
        // H-002 B1: cross-ref-slot-metadata AI Block Tuning -syötteelle ja
        // INVARIANT_VIOLATION_SLOT_MISMATCH-detektorille. refScale = liikkeen
        // RM-suhde Takakyykky-1RM:ään; nominalLoadPct = note's @-pct
        // (viiteliikkeen nimellisessä). loadPct (= nominalLoadPct × refScale)
        // pysyy tehollisena loading-arvona. Additiivinen — ei vaikuta laskentaan.
        refScale: refScale,
        nominalLoadPct: fsLoadPct,
        suggestedLoadKg: Math.round(K * fsLoadScaled / 2.5) * 2.5,
        isBarbell: true,
        note: `${movement} ${fsWeek.note || "— tekninen 2. frekvenssi"}`,        warmupSets: wUp,
      });
    }

    // MU primary (v4.28.0 M4: skill-vaiheessa Muscle-up eksentrinen rakenteellisena slottina)
    if (isSkill) {
      // Skill-vaihe (vk 1-4): rakenteellinen multi-slot — ei vapaatekstiä muNotessa
      slots.push({
        role: "primary",
        category: "vertikaaliveto",
        defaultMovementName: "Muscle-up eksentrinen",
        sets: muSets || 5,
        reps: 2,
        targetVx: null,
        suggestedLoadKg: 0,
        competitionLift: true,
        muSkillPhase: true,
        muAutoRegulate: false,
        note: muNote || "5-8 s lasku MU-yläasennosta — hyppy/avustettu ylös. Pec/lats/triceps eksentrinen kapasiteetti MU:n transitiolle."
      });
    } else {
      // Kuormitettu MU (vk 5+): primary-slotti lisäkuormalla, autoregulaatio käytössä
      slots.push({
        role: "primary",
        category: "vertikaaliveto",
        defaultMovementName: "Muscle-up",
        sets: muSets || 5,
        reps: 1,
        // v4.25 P1-8: kuormitetut MU:t pakotetaan Vx ≥ 2 (ei koskaan Vx1)
        targetVx: Math.max(muVx ?? 2, 2),
        suggestedLoadKg: muLoad,
        competitionLift: true,
        muSkillPhase: false,
        // v4.25 P1-9 flag: engine voi säätää kuormaa viim. session Vx:n mukaan
        muAutoRegulate: true,
        note: muNote || `+${muLoad} kg`
      });
    }

    // MU-tukiliikkeet
    // v4.27.12 KORJAUS: Skill-vaiheen Tempo pause dippi 3×8 V3 poistettu —
    // palautumisvelka-analyysi osoitti sen olevan netto-negatiivinen torstain
    // raskaan push-volyymin (dippi-primary + kapea penkki + pystäri + pullover =
    // ~96 ojentaja/pec-toistoa) jälkeen. 48 h ei riitä tempo-työn oikeaan
    // toteutukseen (triceps/pec-fatiikka → tekniikka rapisee, pec-insertion
    // stretch-stimulus menetetään). Korvattu BW eksentrisellä dipillä: eksentrinen
    // faasi harjoittaa pec-insertion ROM-hallintaa ILMAN concentric-triceps-
    // kuormitusta → ei lisää palautumisvelkaa MA:n leuka-primaryä varten.
    //
    // Samoin mu-transition skill-vaiheessa 4×8 V3 → 3×5 V3 BW: 32 → 15 leuka-
    // toistoa 48 h ennen MA:n leuka-primaryä (selkä/bicep-tuoreus säilyy).
    //
    // Load-vaiheissa säilyy Lisäpainodippi 3×5 V3 MU-lockout-tukena (kevyt
    // volyymi, spesifi MU:n työnnölle).
    const dipSupport = isSkill
      ? slotAccessory("dip-eccentric-bw", "horisontaalityöntö", "BW eksentrinen dippi",
          { sets:4, reps:3, targetVx:null, note:"5 s lasku +10–25 kg vyö (säädä kokemustason mukaan), hyppy/avustettu ylös — vain eksentrinen pec-ROM, ei concentric triceps-kuormaa (TO:n 48 h palautuminen säilyy). Ei Vx-tracking." })
      : slotAccessory("mu-dip-support", "horisontaalityöntö", "Lisäpainodippi",
          { sets:3, reps:5, targetVx:3, note:"Kevyt — MU-lockout-tuki" });

    // v4.28.0 (M4): Skill-vaiheessa räjähtävä leuka BW on nyt rakenteellinen slot
    // (pull-vertical-explosive, neural primer MU:n vedolle), ei pelkkä warmup-rivi.
    // Load-vaiheessa mu-transition hoitaa räjähtävyyden — ei duplikaatiota.
    slots.push(
      slotAccessory("mu-transition", "vertikaaliveto", "Leuanveto chest-to-bar",
        { sets: isSkill ? 4 : 4, reps: isSkill ? 3 : 5, targetVx: 3,
          // v4.34.14: note tehty liike-agnostiseksi (foundation-default vaihtui
          // Weighted inverted row -liikkeeksi, alkuperäinen note oli chest-to-bar-spesifi).
          // resolveAccessorySlot poimii varsinaisen liikkeen phaseVariants[idx]:stä.
          note: isSkill
            ? "MU-transition primer — räjähtävä, 4×3 neural primer MU:n vedolle. Foundation-vaiheen oletus = Weighted inverted row (matala tanko, lisäpaino vyötärölle, false grip jos mahdollista)."
            : "Kevyt — nopeus" })
    );
    // v4.31.0: pull-vertical-explosive aktivoituu nyt skill-vaiheen lisäksi
    // strength + intensity -vaiheissa (3-frequency leukaa varten). Skill-vaihe 4×3,
    // strength + intensity 3×3 (kevyempi koska MA-primary jo kova). Peaking pois.
    // Käyttäjäpalaute v4.30.4: leuka strength-vaiheessa 11 sarjaa/vk on alarajalla,
    // pull-vertical-explosive lopettaminen vk 5:llä on rakenteellinen aukko. Korjaus:
    // 14 sarjaa/vk strength + intensity → MEV-yläpää.
    const fsPhase = fsWeek?.phase || null;
    if (isSkill) {
      slots.push(slotAccessory("pull-vertical-explosive", "vertikaaliveto", "Räjähtävä leuka",
        { sets: 4, reps: 3, targetVx: 4,
          note: "BW räjähtävä — maksimi nopeus ylös, V4 (lopeta heti jos nopeus laskee). RFD-stimulus, rakentaa MU-vedon concentric-nopeutta 48 h ennen MA:n leuka-primaryä." }));
    } else if (fsPhase === "strength" || fsPhase === "intensity") {
      slots.push(slotAccessory("pull-vertical-explosive", "vertikaaliveto", "Räjähtävä leuka",
        { sets: 3, reps: 3, targetVx: 4,
          note: `BW räjähtävä — V4 (lopeta heti jos nopeus laskee). 3-frequency leuka ${fsPhase}-vaiheessa, RFD-stimulus 48 h ennen MA-primarya.` }));
    }
    // v4.31.0: Hip thrust pakara-emphasis -tukiliike strength + intensity -vaiheissa.
    // Käyttäjäpalaute: kyykky strength-vaihe 10–11 sarjaa/vk alarajalla, pakara on
    // alikäytetty tukiliike. Hip thrust matala CNS-kuorma → 72 h LA→TI palautuu täysin.
    // Strength: 3×8 V3 (volyymi-piikki). Intensity: 2×10 V4 (ylläpito kohti taperia).
    if (fsPhase === "strength") {
      slots.push(slotAccessory("glute-emphasis", "alaraaja", "Hip thrust",
        { sets: 3, reps: 8, targetVx: 3,
          note: "Pakara-emphasis, matala CNS — strength-piikki kyykkyyn. 72 h palautuu LA→TI primarya varten." }));
    } else if (fsPhase === "intensity") {
      slots.push(slotAccessory("glute-emphasis", "alaraaja", "Hip thrust",
        { sets: 2, reps: 10, targetVx: 4,
          note: "Pakara-ylläpito, kevyempi taperia kohti." }));
    }

    // v4.34.4: OWEN GAYLE -TYYLIN SHOULDER-STABILIZER-ROTAATIO LA-päivälle.
    // Korvaa v4.34.3:n yksittäisen KB Bottoms-Up Press -slotin phase-aware-rotaatiolla
    // joka noudattaa Owenin explicit-suosituksia (cable Powell early phases → DB Powell
    // peak this movement) + Trap 3 Raise structural balance test/accessory (12.5% × dip 1RM).
    //
    // Foundation (vk 1-4): KB BUP (anterior subscap-rebuild, säilytetty v4.34.3:sta) +
    //   Trap 3 Raise low-load familiarization (7 kg) — opitellaan liike ennen target-kuormaa.
    // Strength (vk 5-8): Cable Powell Raise (Owenin "early phase" — tasaisempi tension) +
    //   Trap 3 Raise @ 10 kg (Owenin structural balance target = 12.5% × 80 kg dip 1RM).
    // Intensity (vk 9-11): DB Powell Raise (Owenin "peak this movement" — vakiomuoto) +
    //   Trap 3 Raise maintenance @ 10 kg (vähemmän volyymia, säilytä motor pattern).
    // Peaking (vk 13-14): POIS — taper, ei stabilizer-volyymia.
    //
    // Trap 3 Raise -kuorma kalibroidaan automaattisesti dippi-calibroinnista:
    //   target = max(7, round(D × 0.125 / 0.5) × 0.5) kg → atleetille 80 × 0.125 = 10 kg.
    // Powell Raise DB on light strict — 5-7 kg riittää, ei skaalaudu 1RM:stä.
    // Powell Raise cable on light strict — 2.5-5 kg cable-paino, ei skaalaudu.
    //
    // Owen lähde: 4 Instagram-postausta + 5 video-kuvakaappausta jotka käyttäjä toimitti
    // (winningstrength.com online coaching client base, streetlifting-spesifi konsensus
    // + Trap 3 Raise structural balance test). Ei suoraa peer-review-RCT:tä, mutta
    // Owen on aktiivinen elite-streetlifting-valmentaja jolla on dokumentoitu kokemus
    // (UK national records + EU coaching).
    const isPeakingLA = fsPhase === "peaking";
    if (!isPeakingLA) {
      // Trap 3 Raise -target lasketaan dippi-calibroinnista: 12.5% × dip 1RM, min 7 kg
      const trap3TargetKg = Math.max(7, Math.round(D * 0.125 / 0.5) * 0.5);

      if (isSkill || fsPhase === "foundation" || fsPhase === null || fsPhase === undefined) {
        // FOUNDATION: Cable OHP (anterior subscap) + Trap 3 Raise familiarization
        // v4.34.14: Half-kneeling KB BUP → Half-kneeling cable OHP. Atleetilla ei ole
        // kahvakuulaa; cable-variantti (Owen Gayle, winningstrength) tuottaa saman
        // anterior-stabilizer-stimuluksen unstable-tension-mekaniikalla.
        slots.push({
          role: "accessory",
          category: "vertikaalityöntö",
          defaultMovementName: "Half-kneeling cable OHP",
          slotId: "anterior-stabilizer-bup",
          sets: 2, reps: 6,
          targetVx: 4, suggestedLoadKg: 8,
          velocityStop: null, allowVelocityInput: false,
          note: "Foundation anterior-stabilizer — kaapelipylvään matala-asetus, toispolviseisontaan, single-arm OHP diagonaalisesti ylös. 5-12 kg. Subscap + SA + RC -koordinaatio (täydentää posterior-fokussissia Powell/Trap 3 -liikkeitä). Tempo 2-1-1-2. Lepo 60-90 s puolien välissä. Vaihtoehto kun KB ei käytössä.",
        });
        // Trap 3 Raise familiarization — 1 painoluokka kevyempi kuin target, opetellaan motor pattern
        const trap3FamKg = Math.max(7, trap3TargetKg - 2.5);
        slots.push({
          role: "accessory",
          category: "muu",
          defaultMovementName: "Trap 3 Raise",
          slotId: "trap3-raise-familiarization",
          sets: 2, reps: 8,
          targetVx: 4, suggestedLoadKg: trap3FamKg,
          velocityStop: null, allowVelocityInput: false,
          note: `Foundation familiarization @ ${trap3FamKg} kg/puoli (target ${trap3TargetKg} kg saavutetaan strength-vaiheessa). Opetellaan motor pattern: 120° kulma vartalosta, peukalo ylös yläasennossa, EI shrug. Tempo 2-1-3-0 (slow eccentric). Lepo 60 s puolien välissä. Owen Gayle structural balance test: 8 reps × 12.5% × dip 1RM.`,
        });
      } else if (fsPhase === "strength") {
        // STRENGTH: Cable Powell Raise + Trap 3 @ structural balance target
        slots.push({
          role: "accessory",
          category: "muu",
          defaultMovementName: "Powell Raise (kaapeli, seisten)",
          slotId: "powell-raise-cable",
          sets: 2, reps: 10,
          targetVx: 4, suggestedLoadKg: 4,  // cable-paino, kevyt
          velocityStop: null, allowVelocityInput: false,
          note: "Strength — Owenin 'early phase' Powell Raise. Cable matalalla, työskentelevä käsi kauempana cablesta, käsi alkaa vastakkaisen lonkan vieressä. Diagonaalisesti ylös 90° kulmaan, peukalo ylös. Cable antaa tasaisen tension koko ROMin yli (toisin kuin DB-versio). Aloita 2.5-5 kg cable-painona. Tempo 2-1-3-0. Lepo 60 s.",
        });
        slots.push({
          role: "accessory",
          category: "muu",
          defaultMovementName: "Trap 3 Raise",
          slotId: "trap3-raise-target",
          sets: 2, reps: 8,
          targetVx: 4, suggestedLoadKg: trap3TargetKg,
          velocityStop: null, allowVelocityInput: false,
          note: `Strength target @ ${trap3TargetKg} kg/puoli (12.5% × dip 1RM = ${(D * 0.125).toFixed(1)} kg). Owenin structural balance target — jos 8 oikein toistoa onnistuu = pass. Jos shrug ilmenee, kevennä 7 kg ja työskentele kohti targetia. Tempo 2-1-3-0. Lepo 60 s puolien välissä.`,
        });
      } else if (fsPhase === "intensity") {
        // INTENSITY: DB Powell Raise (peak) + Trap 3 maintenance
        slots.push({
          role: "accessory",
          category: "muu",
          defaultMovementName: "Powell Raise (DB, side-lying)",
          slotId: "powell-raise-db",
          sets: 2, reps: 8,
          targetVx: 4, suggestedLoadKg: 6,  // DB Powell light: 5-7 kg
          velocityStop: null, allowVelocityInput: false,
          note: "Intensity — Owenin 'peak this movement' DB Powell Raise. Tasaisella penkillä kyljellään, alempi käsi tukee päätä, ylempi käsi nostaa DBn 90°-kulmaan vartalosta (peukalo ylös, käsi diagonaali hieman taakse). EI yli 90° (menettää supraspinatus-tensioin). Aloita 5 kg, max 7 kg. Tempo 2-1-3-0. Lepo 60 s.",
        });
        slots.push({
          role: "accessory",
          category: "muu",
          defaultMovementName: "Trap 3 Raise",
          slotId: "trap3-raise-maintenance",
          sets: 2, reps: 6,  // vähemmän volyymia intensiteetissä
          targetVx: 4, suggestedLoadKg: trap3TargetKg,
          velocityStop: null, allowVelocityInput: false,
          note: `Intensity maintenance @ ${trap3TargetKg} kg/puoli — säilytä motor pattern + structural balance. Vähemmän volyymia (2×6 vs strength-vaiheen 2×8) koska intensity-vaiheessa CNS-kuorma comp-liikkeissä on korkea. Tempo 2-1-3-0.`,
        });
      }

      // v4.34.14: PHASE-ROTAATIO ANTERIOR-STABILIZER-SLOTILLE.
      // Foundation: Cable OHP (yllä, anterior-stabilizer-bup -slotissa).
      // Strength + Intensity: Half Turkish Get-up (DB) — Owen Gayle -tyylin loaded
      // scapular control + RC-stabilointi kuormalla. Täydentää Powell Raise + Trap 3
      // -posterior-fokuksia anteriorisella + GH-stability-stimuluksella. Käyttäjäpalaute
      // LA-treenistä: Cable OHP foundationissa, Half TGU strengthissä+ rotaation kautta.
      if (fsPhase === "strength" || fsPhase === "intensity") {
        slots.push({
          role: "accessory",
          category: "vertikaalityöntö",
          defaultMovementName: "Half Turkish Get-up (DB)",
          slotId: "anterior-stabilizer-tgu",
          sets: 2, reps: 4,  // 4 toistoa per puoli — kuormatettu liike, hidas
          targetVx: 4, suggestedLoadKg: 12,  // 8-16 kg DB
          velocityStop: null, allowVelocityInput: false,
          note: `${fsPhase === "strength" ? "Strength" : "Intensity"} anterior-stabilizer + GH stability. Selältä → kyljelle, DB suoraan ylhäällä koko liikkeen ajan. 8-16 kg käsipaino. Loaded scapular control + RC + serratus -koordinaatio kuormalla — täydentää Powell + Trap 3 -posterior-fokusta. Tempo: 2 s ylös, 1 s pause, 3 s alas. Lepo 60-90 s puolien välissä. Vahvistaa MU-transition + dippi-lockout -olkapään stabilointia.`,
        });
      }
    }

    slots.push(
      dipSupport,
      ...mixAcc()
    );

    // v4.34.14: Decline penkkipunnerrus EZ-tangolla — käyttäjän gym-spesifi
    // dippi-tukiliike LA-päivällä. Sama kuormavektori kuin dipissä (alas + ulos
    // alarintaan), EZ-tanko vähentää kyynärpään ulkokierto-stressiä. Käyttäjä-
    // palaute LA-treenistä: "tein tätä 3×6 80 kg V3 lauantaina, sillä oletin
    // liikkeen olevan hyvä tukiliike dippiin". Lisätään foundation/strength/
    // intensity-phase. Peaking pois (taper).
    if (!isPeakingLA) {
      slots.push({
        role: "accessory",
        category: "horisontaalityöntö",
        defaultMovementName: "Decline penkkipunnerrus (EZ-tanko)",
        slotId: "dip-support-decline",
        sets: 3, reps: 6,
        targetVx: 3, suggestedLoadKg: 80,  // käyttäjän raportoima 3×6×80 V3 lauantaina
        velocityStop: null, allowVelocityInput: false,
        note: "Decline-penkki kallistettuna 15-30° alaspäin, EZ-tanko (käyrä) kapeahkolla otteella. Tanko ALARINTAAN (ei navalle), kyynärpäät 30-45° tucked vartaloa kohti. Sama kuormavektori kuin dipissä → triceps + alarinta -dominantti. Tempo 2-0.5-1-1. Lepo 90-120 s. EZ-tangon käyrä antaa ranteille 5-10° kulman → vähentää kyynärpää-stressiä vs suora tanko.",
      });
    }

    // Mahdollinen "finisher"-override (vk 15 käyttää minimiä)
    if (finisher === "minimal") {
      // Korvataan mixAcc pelkällä 1 slotilla vk 15:lle
      const coreIdx = slots.findIndex(s => s.slotId === "core-hollow");
      if (coreIdx >= 0) slots.splice(coreIdx, 1);
    }

    // v4.34.3: LA-prehab refaktoroitu samalla anterior-stabilizer-evidenssipohjalla
    // kuin TO-prehab. MU vaatii erityisesti subscap + scapular control (false grip
    // -veto + transition-vaihe rasittavat anteriorista capsulea), joten subscap-
    // aktivaatio on kriittinen.
    // v4.34.10: Lähteet pois sulkeista. Käytännön ohjeet.
    // v4.34.22 syvätutkimus-pohjainen optimointi (Pri 4 — LA):
    //   POIS: Lift-off prep (Kim 2025: belly-press selektiivisempi, lift-off redundantti).
    //   YHDISTÄ: Push-up plus + Wall slide (Hardwick 2006, päällekkäisyys).
    //   EHDOLLINEN: False Grip hang vain jos muSets > 0 (vk 5+) — vk 1-3 muSets=0,
    //               ei warmup-perustetta tendon-loadille (atleetin tendinopatia-taipumus).
    //   LISÄÄ: Banded posterior shoulder MWM (Satpute 2022 kaikille upper-body-päiville).
    //   YHDISTÄ fsWeek: glute-trio → "Banded monster walk + SL bridge" (Gasibat 2023, sama kuin TI).
    //   Kesto: ~8 min ilman fsWeekiä, ~11 min fsWeekissä (ennen ~12-14 min).
    const isMUSkillPhase = muLoad === 0;  // vk 1-4 = MU eksentrinen, ei lisäpaino
    return { dayOfWeek:6, dayType:"volume", label:label || "LA — Muscle-up + Kevyt",
      warmup: [
        // 1. Yleislämmittely
        { name: "Shadow boxing / hyppynaru / arm circles", desc: "90 s reipas tahti. (1) Hyppynaru tai shadow boxing 60 s — kunnes hengitys nousee. (2) Käsipyörittelyt eteenpäin 10 + taaksepäin 10. (3) Lonkka-pyörittelyt 5/suunta. Tavoite: verenkierto + nivelneste käyntiin, EI staattista venytystä." },
        // 2. Subscap-aktivaatio (Lift-off poistettu — Kim 2025)
        { name: "Belly-press isometric", desc: "ANTERIOR CUFF — Kim 2025: selektiivisin SSC-aktivaattori (lift-off redundantti, POISTETTU v4.34.22). (1) Aseta kämmen vatsaan, kyynärpää suoraan eteenpäin. (2) Paina vatsaan, ranne PYSYY NEUTRAALINA. (3) 10 s puristus, 5 s lepo, toista. 2 settiä molemmilla käsillä. Cue: hartia EI nouse korviin." },
        // 3. Subscap @ 90° abd (lyhempi tempo)
        { name: "Side-lying IR @ 90° abd (2-2 tempo)", desc: "SUBSCAP SELEKTIIVINEN HERÄTYS. (1) Asetu kyljellesi lattialle. (2) Yläkäsi: kainalo 90° auki, kyynärpää 90° koukussa, kämmen alas. (3) 2-4 kg käsipaino. (4) Kierrä kämmen ylös kohti kattoa 2 s, 1 s pause. (5) Lasku 2 s. (6) 10 toistoa. Vaihda puoli. v4.34.22: tempo lyhennetty 3-3 → 2-2." },
        // 4. SA + LT yhdistetty (Push-up plus + Wall slide combo)
        { name: "Wall slide + serratus punch combo", desc: "SA + LT YHDESSÄ KOMPAKTISSA LIIKKEESSÄ (Hardwick 2006). WALL SLIDE: (1) Selkä seinää vasten, kyynärpäät + ranteet seinässä W-asennossa. (2) Liu'uta käsivarret ylös Y-asentoon, lavat alhaalla + lähekkäin. SERRATUS PUNCH: (3) Yläasennossa työnnä kädet ETEEN seinästä irti — lavat eteenpäin, 1 s pause täydessä protractionissa. (4) Lasku takaisin W:hen. (5) 8 toistoa. Cue: 'työnnä maa pois alta', ribs down." },
        // 5. Banded posterior MWM (UUSI v4.34.22 kaikille upper-body-päiville — Satpute 2022)
        { name: "Banded posterior shoulder MWM", desc: "POSTERIOR CAPSULE GLIDE — Satpute 2022 -meta SMD −1.07 ROM/kipu. (1) Ankkuroi paksu kuminauha olkapään tasolle takaa. (2) Kierrä kuminauha etu-olkapään ympärille kainalon lähelle. (3) Astu eteenpäin tensioniin — tunne nivelen avautuminen takaa. (4) Tee 15 kevyttä chest press -liikettä. (5) Älä pakota — fokus joint decompressionissa." },
        // 6. MU-spesifi — Scapular pull-up
        { name: "Scapular pull-up", desc: "LAPA-AKTIVAATIO + MU TRANSITION-PRIMER. (1) Roiku tangossa myötäotteella, käsivarret SUORINA. (2) Aktivoi vain lapaluut — vedä lapaluut alas (depression) ilman että kyynärpäät koukistuvat. Koko vartalo nousee 2-3 cm. (3) Lasku takaisin täyteen hangiin. (4) 10 toistoa, 2 settiä. Cue: kyynärpäät suoriksi koko ajan." },
        // 7. False Grip hang VAIN jos MU-load > 0 (v4.34.22 ehdollinen)
        ...(isMUSkillPhase ? [] : [
          { name: "False Grip hang", desc: "MU TRANSITION RANNETUKI (vk 5+, kun MU saa lisäpainoa — vk 1-3 ohitetaan koska muSets=0 = ei warmup-perustetta tendon-loadille atleetin tendinopatia-taipumuksessa). (1) Vie ranteet TANGON YLÄPUOLELLE (kämmenet osoittavat taakse, rystyset kohti kattoa). (2) Roiku 20 s. 2-3 settiä. Cue: ranteet pysyvät tangon päällä koko hangin ajan." },
        ]),
        // 8. Kyynärpää-prehab MU-vetoon (vain MA + TO päivinä — Tyler 2010 minimum 2×/vk)
        // LA:ssa ei toistuvasti — siirretty optionaaliseksi jos atleete kokee kyynärpääoireita
        // 9. Alaraaja-elementit (jos LA-kyykkypäivä, fsWeek)
        ...(fsWeek ? [
          { name: "Banded ankle dorsiflexion (knees-to-wall)", desc: "ANKLE DORSIFLEXION — kriittinen squat-syvyyden tekijä (Kim 2015). (1) Polviseisontaan seinää vasten. (2) Paksu kuminauha nilkan etuosan ympärille, ankkuroi taakse. (3) Etupolvi 10-15 cm seinästä. (4) Liu'uta polvi seinää kohti — kantapää PYSYY maassa. (5) 8 toistoa per puoli, 2 settiä." },
          { name: "Hip 90/90 + Cossack squat", desc: "LONKKA-MOBILITEETTI 2. KYYKKYÄ VARTEN. HIP 90/90: (1) Istu lattialle, etujalka 90° edessä, takajalka 90° sivussa. (2) Kallista ylävartaloa eteen, tunne venytys pakaran yläosassa. (3) Pidä 30 s. Vaihda puoli. COSSACK SQUAT: (4) Jalat leveässä haara-asennossa. (5) Siirrä paino toiselle jalalle, polvi koukistuu, toinen suorana. (6) 5 toistoa per puoli." },
          { name: "Banded monster walk + SL glute bridge", desc: "PAKARA-AKTIVAATIO YHDESSÄ KOMPAKTISSA LIIKKEESSÄ (Gasibat 2023). MONSTER WALK: (1) Kuminauha polvien ympärille, puolikyykky-asento. (2) Astele eteen-sivu-eteen-sivu pieniä askelia, 10 askelta per suunta. SL GLUTE BRIDGE: (3) Selinmakuulla, toinen polvi koukussa, toinen jalka SUORANA YLHÄÄLLÄ. (4) Nosta lantio ylös aktivoimalla pakara, 2 s pause. (5) 8 toistoa per puoli. v4.34.22: glute-trio yhdistetty (sama kuin TI)." },
        ] : []),
        // 10. MU neural-primer
        { name: "Räjähtävä leuka BW", desc: "MU-VEDON RÄJÄHTÄVYYS-PRIMER. (1) Tartu tankoon myötäotteella hartioiden leveydeltä. (2) Täysi hangi. (3) VEDÄ MAKSIMI NOPEUDELLA — leuka tangon yli mahdollisimman nopeasti. (4) Kontrolloitu lasku 1-2 s. (5) 3 toistoa per setti, 3 settiä, 60-90 s lepo. KESKEYTÄ heti jos nopeus laskee — primer ei volume." },
        // 11. Squat ramp (jos LA-kyykkypäivä)
        ...(fsWeek ? [{ name: `${fsWeek.movement ?? "Paused squat"}-lämmittely`, desc: "Ks. slotin warmupSets — ennen MU:ta" }] : []),
      ],
      slots };
  }

  // ─── Calibration day (v4.32.8 REFACTOR — DiStasio 2014 + Tuchscherer RTS) ───
  //
  // v4.27.15 oli AMRAP @85 % × tekninen failure (V0). Vaiheen 1 + 2 syvätutkimus
  // identifioi tämän suboptimaaliseksi:
  //   - DiStasio 2014, Reynolds 2006: Brzycki/Epley-kaavojen tarkkuus on paras
  //     2-5 toiston alueella (±2.7-3.1 kg) ja heikkenee 6+ rep -alueelle
  //   - Tuchscherer RTS Manual + Helms MASS 2023: AMRAP-cappaus @ RPE 9 / V1
  //     säilyttää e1RM-tarkkuuden mutta vähentää CNS-kustannusta dramaattisesti
  //   - Trained-atleetin AMRAP @85 % tuottaa 4-8 reps = tarkkuusalueen alaraja
  //   - 92 % × 3 V1 = 2-3 toistoa = kaavojen tarkkuusalueen ydin
  //
  // Uusi protokolla per liike:
  //   1. Lämmittely (ramppi 40% → 80% × 1)
  //   2. 1 sarja @92 % × 3 toistoa @ V1 (RPE 8, eli 1 toisto varalla)
  //   3. Atleetti raportoi actualVx (yleensä V1, joskus V0 = oli liian raskas
  //      tai V2 = oli liian kevyt — molemmat informatiivisia)
  //   4. Engine laskee Epley+Vara: e1RM = kuorma × (1 + (3 + actualVx) / 30)
  //
  // Tarkkuus & turvallisuus:
  //   - 92 % × 3 V1: e1RM = kuorma × 1.133 = ennuste ~104 % kuormasta
  //     (jos kuorma 92 % nykyisestä e1RM:stä → ennuste = 104 % × 0.92 = 95.7 %
  //     vanhasta e1RM:stä — eli kalibrointi joko vahvistaa nykyisen tai
  //     ehdottaa ~5 % korjausta alas/ylös)
  //   - CNS-kuorma 92 % × 3 << 85 % × failure (~7 reps)
  //   - Tarkkuusero: low-rep ±2.7 kg vs high-rep AMRAP ±5+ kg
  //
  // Rate-limit: kalibrointi-setti EI ankkuroi progression rate-limittiä
  // (setRole === "calibration" suodatetaan computeRateLimitAnchorissa).
  // Kalibrointi on "reset", ei progression-anchor.
  function calibrationDay(weekLabel = "Vk 4") {
    const slots = [
      {
        role: "calibration",
        category: "vertikaaliveto",
        defaultMovementName: "Lisäpainoleuanveto",
        sets: 1,
        reps: 3,                // v4.32.8: low-rep e1RM-tarkkuus (DiStasio 2014)
        targetVx: 1,            // V1 = RPE 8, 1 toisto varalla
        loadPct: 0.92,
        suggestedLoadKg: seedL(0.92),
        isCalibration: true,    // UI-flag: renderöi tarkkuus-info
        note: `${weekLabel} kalibrointi — Leuka 92 % × 3 V1 (RPE 8). Pysäytä 3 toiston jälkeen vaikka tuntuisi siltä että vielä menisi enemmän — tarkoitus on V1, ei V0. Tulos päivittää e1RM:n Epley+Vara-kaavalla.`,
        allowVelocityInput: true,
        warmupSets: [
          { pct: 0.40, reps: 5, note: "Lämmittely" },
          { pct: 0.60, reps: 3, note: "Ramppi" },
          { pct: 0.75, reps: 2, note: "Lämpö" },
          { pct: 0.85, reps: 1, note: "Ankkuri" },
        ],
      },
      {
        role: "calibration",
        category: "horisontaalityöntö",
        defaultMovementName: "Lisäpainodippi",
        sets: 1,
        reps: 3,
        targetVx: 1,
        loadPct: 0.92,
        suggestedLoadKg: seedD(0.92),
        isCalibration: true,
        note: `${weekLabel} kalibrointi — Dippi 92 % × 3 V1 (RPE 8). Säilytä kontrolloitu alakohta — ei bouncea, pec-tear-riski raskailla. Pysäytä 3 toistossa.`,
        allowVelocityInput: true,
        warmupSets: [
          { pct: 0.40, reps: 5, note: "Lämmittely" },
          { pct: 0.60, reps: 3, note: "Ramppi" },
          { pct: 0.75, reps: 2, note: "Lämpö" },
          { pct: 0.85, reps: 1, note: "Ankkuri" },
        ],
      },
      {
        role: "calibration",
        category: "alaraaja",
        defaultMovementName: "Takakyykky",
        sets: 1,
        reps: 3,
        targetVx: 1,
        loadPct: 0.92,
        suggestedLoadKg: seedK(0.92),
        isBarbell: true,
        isCalibration: true,
        note: `${weekLabel} kalibrointi — Kyykky 92 % × 3 V1 (RPE 8). Säilytä syvyys + selän neutraali. Pysäytä 3 toistossa — ei grindiä neljänteen.`,        allowVelocityInput: true,
        warmupSets: [
          { pct: 0.35, reps: 5, note: "Tyhjä tanko + kevyt" },
          { pct: 0.50, reps: 3, note: "Ramppi" },
          { pct: 0.65, reps: 2, note: "Lämmittely" },
          { pct: 0.78, reps: 1, note: "Aktivaatio" },
          { pct: 0.85, reps: 1, note: "Ankkuri" },
        ],
      },
    ];
    return {
      dayOfWeek: 6,
      dayType: "heavy",     // kalibrointi on raskas diagnoosi, ei volyymi
      label: `LA — Kalibrointi AMRAP (${weekLabel}) 🎯`,
      warmup: [
        { name: "Hyppynaru / Jumping Jacks", desc: "3 min — perusteellinen lämmittely" },
        { name: "Band pull-apart + dislocations", desc: "2×15 — olkapäät ja lavat valmiiksi" },
        { name: "Hip 90/90 + Cossack", desc: "1 min per puoli — lonkka-mobilitetti kyykyjä varten" },
        { name: "Scapular pull-up / push-up", desc: "2×8 — lapa-aktivaatio" },
        { name: "Dynaaminen priming", desc: "Räjähtävä BW-leuka 2×3, BW-dippi 2×5 — neural primer" },
      ],
      slots,
    };
  }

  // ─── 16-week plan (v4.22 P2 REFACTOR) ───
  //
  // Kaikki kuormat RELATIIVISIA nykyiseen e1RM:ään (loadPct). Moottori skaalaa
  // automaattisesti viikolta toiselle kun top-sarjat rakentavat e1RM-historian.
  // Peaking-haara (vk 13–16) skaalautuu vk 12:n RPE9-testissä päivitettyyn
  // e1RM:ään, joten jos kehitys oli 3 %, peak-kuormat eivät ole 108 % vaan 103 %.
  //
  // Volyymiprogressio: blokki 1 nouseva (MEV→MAV), blokki 2 tasainen, blokki 3
  // laskeva (MAV→MEV), blokki 4 minimaalinen (realization).
  //
  // Intensiteetti: 65% → 85% → 92% primary-progressio. 100+ % kuormia EI
  // suunnitella — vain "Top single RPE 8" -kohdissa (vk 12 ja vk 14 PR-yritys).
  // ─── LA:n 2. kyykky-progressio (v4.25 P1-1, v4.27.20 block-specific variation) ───
  // % on suhteessa takakyykky-e1RM:ään; laDay() skaalaa movementin mukaan
  // (refScale: Etukyykky 0.85, Box squat 0.85, Takakyykky self 1.00).
  //
  // Block-periodization-rakenne (general → specific):
  //   Foundation vk 1-3: Etukyykky — motor pattern, quad-dominant variation
  //   Strength  vk 5-7:  Etukyykky — GPP, moderate strength
  //   Intensity vk 9-11: Box squat — sticking-point specificity (stretch-reflex
  //                      nollattu, puhdas concentric; TI:ssä on Paused squat)
  //   Peaking   vk 13-14: Takakyykky kisastyle kevyt — opener rehearsal,
  //                       motor groove, CNS primer ilman fatiikkaa
  //
  // Deload-viikot 4, 8, 12 intentionaalisesti ilman LA-kyykkyä:
  //   vk 4  = Takakyykky AMRAP-kalibrointi (calibrationDay, v4.27.15)
  //   vk 8  = puhdas palautuminen ennen intensity-blokkia
  //   vk 12 = puhdas palautuminen ennen peakingia
  // Vk 15-16 taperissa ei myöskään — viimeinen raskas on vk 14.
  //
  // Volyymirakenne: Foundation nouseva (3→4 sarjaa), Strength tasainen,
  // Intensity laskeva volyymi/raskaampi, Peaking minimaalinen (realization).
  // v4.31.0: phase-kenttä lisätty jokaiseen fsWeek-objektiin. laDay() käyttää tätä
  // päättääkseen vaihespesifit lisät (hip thrust strength+intensity, pull-vertical-explosive
  // strength+intensity, jne). Foundation/strength erottelu pelkän pct-arvon perusteella
  // olisi hauras (Paused squat aktiivinen molemmissa) — phase-merkintä on selkeä.
  const FS = {
    // Foundation — Takakyykky regular, motor pattern + tekninen volyymi
    // v4.32.8: Paused squat → Takakyykky regular foundationissa. Vaiheen 2 löydös
    // (ChatGPT): Paused squat 2×/vk vk 1-7 (LA fsWeek + TI strength backoff vk 5-7)
    // = paused-overdose. Foundation-vaiheessa Stone/ISSA-block-doktriinin mukaan
    // pääliikkeen variaatio kuuluu strength-blokkiin, foundation = generaalinen
    // motor pattern. Pidetään paused vain TI strength-vaiheessa (vk 5-7), LA siirtyy
    // generaaliseen Takakyykkyyn. Refscale 1.00 koska Takakyykky = self.
    // pct-arvot säädetty että absoluuttinen kuorma säilyy "tekninen 2. frekvenssi"-
    // tasolla (~50 % nykyisestä e1RM:stä, ei stimulus-tasolla).
    w1:  { sets:3, reps:5, vx:4, pct:0.50, movement:"Takakyykky", refScale:1.00, phase:"foundation", note:"@50 % Takakyykky — tekninen ramp, motor pattern palautus" },
    w2:  { sets:3, reps:5, vx:4, pct:0.55, movement:"Takakyykky", refScale:1.00, phase:"foundation", note:"@55 % Takakyykky — tekninen volyymi" },
    w3:  { sets:4, reps:5, vx:3, pct:0.58, movement:"Takakyykky", refScale:1.00, phase:"foundation", note:"@58 % Takakyykky — tekninen volyymi-peak blokki 1" },
    // Strength — Paused squat, sticking-point specificity (säilyy v4.32.8:ssä)
    w5:  { sets:3, reps:5, vx:3, pct:0.65, movement:"Paused squat", refScale:0.85, phase:"strength", note:"@65 % Takakyykky — Paused squat 2 s, voima-blokki alkaa" },
    w6:  { sets:3, reps:5, vx:3, pct:0.68, movement:"Paused squat", refScale:0.85, phase:"strength", note:"@68 % Takakyykky — Paused squat 2 s" },
    w7:  { sets:4, reps:5, vx:3, pct:0.70, movement:"Paused squat", refScale:0.85, phase:"strength", note:"@70 % Takakyykky — Paused squat 2 s" },
    // Intensity — Pin squat, sticking-point specificity raw-spesifisesti
    // v4.32.8 muutos: Box squat → Pin squat. Modern raw -konsensus (Smith JTS,
    // Tuchscherer RTS, Nuckols Stronger By Science): box squat on suboptimaalinen
    // raw-atleetille — eri stance, eri lonkka-aktivaatio, eri CNS-firing-sekvenssi
    // kuin raw squat. Box squat -perinne (Westside) on luotu multiply-geared-
    // kontekstiin jossa squat-suit auttaa eccentricia. Pin squat (turvapalikat
    // pohjalla, starttaus nollasta) antaa saman SSC-nollausefektin raw-spesifisellä
    // mekaniikalla. Pin squat ~85 % Takakyykky-RM:stä → refScale säilyy 0.85.
    w9:  { sets:3, reps:5, vx:3, pct:0.58, movement:"Pin squat", refScale:0.85, phase:"intensity", note:"@58 % Takakyykky — Pin squat, starttaus nollasta turvapalikoilta, sticking-point bottom" },
    w10: { sets:3, reps:5, vx:3, pct:0.62, movement:"Pin squat", refScale:0.85, phase:"intensity", note:"@62 % Takakyykky — Pin squat" },
    w11: { sets:3, reps:4, vx:2, pct:0.65, movement:"Pin squat", refScale:0.85, phase:"intensity", note:"@65 % Takakyykky — Pin squat, viim. raskaampi" },
    // Peaking — Takakyykky kisastyle kevyt, maksimi-specificity
    // refScale 1.00 = ei skaalausta; % suoraan Takakyykky-e1RM:stä.
    // Löydetään opener-tunne ilman CNS-fatiikkaa.
    w13: { sets:3, reps:3, vx:3, pct:0.65, movement:"Takakyykky", refScale:1.00, phase:"peaking", note:"@65 % kisakyykky — opener rehearsal, kisastyle" },
    w14: { sets:2, reps:3, vx:3, pct:0.60, movement:"Takakyykky", refScale:1.00, phase:"peaking", note:"@60 % kisakyykky — motor groove, kevyt" },
  };

  // v4.28.0 backoffConfig-builderit — block-aware backoff kaikille kolmelle primaryille.
  // Tämä korvaa aiemmat null/numero-argumentit rakennetulla objektilla joka
  // eksplisiittisesti ilmaisee sekä % että block-phaseen sidotun tyylin.
  const tiBackoffRegular   = (pct) => ({ style: "regular",   pct });   // foundation
  const tiBackoffPaused    = (pct) => ({ style: "paused",    pct });   // strength
  const tiBackoffTempo     = (pct) => ({ style: "tempo",     pct });   // intensity
  const tiBackoffKisastyle = (pct) => ({ style: "kisastyle", pct });   // peaking/realization

  const weekPlans = [
    // ── BLOKKI 1: FOUNDATION HYBRIDI A→B (vk 1–4) ──
    // v4.32.9 M17 PÄIVITYS: Foundation re-kalibroitu sub-PR muscle memory -atleetille.
    // Atleetin oma data: vk 1 nykyinen 4×6 × 120 kg @ 68.6% → estimaatti +7.5 kg/vk
    // alkuvaiheessa. Claude-research-verdict: +17-20% / 16 vk realistinen, foundation
    // hybridi A→B (vk 1-2 säilytä backoff reisi-rebuild, vk 3+ siirry intensiteetti-
    // painotteiseen, backoff vähenee).
    //
    // v4.34.14: Foundation-progression pehmennetty atleetin palautteen perusteella.
    // Edellinen (v4.32.9 M17): 68.6 → 74.3 → 80% (+5.7pp + 5.7pp/vk = liian aggressiivinen).
    // Foundation = volyymi-rebuild + neural reintro, EI intensiteetti-spurtti. ~+2.5pp/vk
    // sopii hypertrofia-foundationiin paremmin (Mike Israetel volume-block-suositus).
    //
    // Vk 1: 4×6 V3 @68.6% + reg backoff 3×7 @55% (reisi-rebuild + neural reintro)
    // Vk 2: 4×6 V3 @71%   + reg backoff 3×7 @58% (volume + lievä intensifikaatio)
    // Vk 3: 4×5 V3 @75%   + reg backoff 2×6 @61% (siirtymä, backoff vähenee)
    //
    // v4.34.21: RPE-merkinnät poistettu päivien otsikoista — Vx (Vara) on engineen
    // implementoitu autoreguloiva mittari, RPE oli päällekkäinen subjektiivinen label
    // joka aiheutti hämmennystä (V3 = strict RPE 7, mutta label sanoi vk 1 "RPE 6-7"
    // joka ehdotti hieman löysempää otetta — engine ei välitä RPE:stä, joten label
    // oli vain pedagoginen vihje muscle-memory-atleetille). Vx on objective + autoreguloiva.
    // v4.34.15: Vastaote-leuanveto → Lisäpainoleuanveto unifikaatio.
    // Atleetin palaute: "vastaote ja lisäpainoleuanveto ovat sama liike". Käytännössä
    // kisaleuka tehdään vastaotteella, joten erillinen "Vastaote-leuanveto" -liike +
    // variantScale 1.05 oli vääräpaikkainen. Yhtenäistetty Lisäpainoleuanvetoon → e1RM-
    // historia jatkuu saumattomasti vk 1 → vk 4 deload → vk 8 cal → ... ilman variantti-
    // resetiä joka aiheutti vk 9 erosion-spiralin.
    // M2/OBS-022 (2026-06-10): SISÄ-BLOKKI-INTENSIFIKAATIO — primary-slottien reps+Vx
    // ramppaa loading-viikkojen sisällä (HANDOFF §4-taulukko, sign-off 2026-06-02):
    // Foundation 6V3→6V2→6V1 (76,9→78,9→81,1 %) · Strength 4V3→4V2→3V1 (81,1→83,3→88,2 %)
    // · Intensity 3V2→3V1→2V1 (85,7→88,2→90,9 %). Kanoninen %-lähde = vReps(reps+targetVx)
    // → kuorma nousee blokin sisällä YHDESTÄ lähteestä; loadPct-parametri on tier 1/2/3
    // -liikkeillä dead-arvo (vReps ohittaa; säilytetty seed-fallbackia varten). Backoff
    // perii reps+1/Vx+1 → ramppaa mukana. Deload-vk:t (4/8/12) + Peaking-taper (vk13–16,
    // mökki→93 %-aktivointi→opener-taper) ENNALLAAN — nouseva ramppi ei sovi taperiin
    // (Bosquet 2007; Akselin ratifiointi 2026-06-10). Vx→V0 EI käytetä (VL-cap, §4).
    { week:1, days:[
      maDay("MA — Lisäpainoleuanveto 4×6 @68.6%", 4,6,3, 0.686, null, null, undefined, undefined, "foundation", null, false, false, true),
      tiDay("TI — Kyykky 4×6 @68.6%",             4,6,3, 0.686, null, undefined, tiBackoffRegular(0.55)),
      toDay("TO — Dippi 4×6 @68.6%",              4,6,3, 0.686, null, null, pushAccPrehab()),
      laDay("LA — MU skill + tekninen takakyykky (eksentrinen + transition + räjähtävä)", 0, 5, null, null, FS.w1),
    ]},
    { week:2, days:[
      // v4.34.14: 74.3% → 71% (Foundation-progressionin pehmennys, ~+2.4pp vk 1:stä)
      maDay("MA — Lisäpainoleuanveto 4×6 V2 @79%", 4,6,2, 0.71, null, null, undefined, undefined, "foundation", null, false, false, true),
      tiDay("TI — Kyykky 4×6 V2 @79%",             4,6,2, 0.71, null, undefined, tiBackoffRegular(0.58)),
      toDay("TO — Dippi 4×6 V2 @79%",              4,6,2, 0.71, null, null, pushAccPrehab()),
      laDay("LA — MU skill + tekninen takakyykky", 0, 5, null, null, FS.w2),
    ]},
    { week:3, days:[
      // v4.34.14: 80% → 75% (Foundation-progressionin pehmennys, ~+4pp vk 2:sta)
      maDay("MA — Lisäpainoleuanveto 4×6 V1 @81%", 4,6,1, 0.75, null, null, undefined, undefined, "foundation", null, false, false, true),
      // Backoff: 2×6 @61% (vähennetty 3×7→2×6 — siirtymä intensifikaatioon, hybridi A→B vk 3)
      tiDay("TI — Kyykky 4×6 V1 @81%",          4,6,1, 0.75, null, undefined, { style: "regular", pct: 0.61, sets: 2, reps: 6, targetVx: 4, note: "Hybridi A→B siirtymä — backoff vähennetty 3×7→2×6, intensifikaatio alkaa" }),
      toDay("TO — Dippi 4×6 V1 @81%",             4,6,1, 0.75, null, null, pushAccPrehab()),
      laDay("LA — MU: ENSIMMÄINEN STRICT 🎯 + tekninen takakyykky", 0, 5, "🎯 Tavoite: ensimmäinen puhdas strict muscle-up (eksentrinen → full MU)", null, FS.w3),
    ]},
    { week:4, days:[
      maDay("MA — Deload 3×5 @55%",       3,5,4, 0.55, null, null),
      // Deload TI käyttää regular-backoffia (ei paused) — matala kuorma, motor pattern only
      tiDay("TI — Deload 3×5 @55%",       3,5,4, 0.55, null, undefined, tiBackoffRegular(0.44)),
      toDay("TO — Deload 3×5 @55%",       3,5,4, 0.55, null, null),
      // v4.27.15: AMRAP-kalibrointi. v4.28.0 (H3): Vk 4 on AMRAP-piste KOKO SYKLIN e1RM-
      // lähtötasolle (post-foundation, volyymin jälkeen matala CNS-velka → tolereoi
      // @85% AMRAPin). Vk 8 ja 12 käyttävät tarkoituksella top single -metodia (ks. ao.
      // viikkojen kommentit) koska niiden fatiikka-profiilit eroavat tarkasti.
      calibrationDay("Vk 4"),
    ]},

    // ── BLOKKI 2: VOIMA — Akkumulaatio (vk 5–8) ──
    // v4.25 P1-3: volyymi LASKEE hypertrofia-blokista voima-blokkiin (block-teoria):
    // vk 5: 4×4 @75% + backoff 3×5 @65% (strength-spec backoff)
    // vk 6: 4×4 @78% + backoff 3×5 @65%
    // vk 7: 4×4 @82% + backoff 3×5 @68% (EI top @88% — v4.28.0 H4: near-max density vähennetty
    //       5→4 session/6 viikossa; strength-piikki on 4×4@82 volyymin piikki, ei intensity-testi.
    //       Vk 8 väliteste @92% on luotettavampi e1RM-päivitys kuin duplikoitu vk 7 @88%.)
    // v4.28.0 (L1/M3): TI backoff = Paused squat 2s (sticking-point, strength-spec).
    //                  MA backoff grip-variation = Myötäoteveto (hauis-overload, strength-rotation).
    //                  TO backoff = Kapea ote -dippi (ojentaja-overload, strength-spec).
    // v4.34.15: ME-ROTAATIO POISTETTU strength-blokista (vk 5-7).
    // Atleetin palaute: "varmista että vk 5/6/7 variaatiovaihtelu on loogista vk 16
    // suorituskykyyn nähden" + "vastaote ja lisäpainoleuanveto ovat sama liike".
    //
    // Aiempi rotaatio: vk 5-6 Paused pull-up, vk 7 Tempo pull-up. Ongelmat:
    //   1. Jokainen variantti-vaihto resetoi e1RM-historian (engine ei jaa)
    //   2. Kokeneelle atleetille (PR 94 kg) varianttirotaatio ei tuo lisäarvoa
    //      kisaspesifisyyteen — Westside-tyylin ME-rotaatio toimii AINOASTAAN
    //      ei-kisablokeissa (off-season), ei kisapiikkivaiheessa
    //   3. Tempo pull-up (3 s eccentric) on capacity-stimulus, ei 1RM-spesifi
    //   4. 3 eri varianttia 3 viikossa = liian nopea rotaatio (tyypillinen 3-4 vk/variantti)
    //
    // KORJAUS vk 5-7: kaikki Lisäpainoleuanveto, jatkuva intensiteettiprogressionn.
    // Tämä mahdollistaa e1RM:n täyden akkumulaation foundationista (vk 1-3) → strength
    // (vk 5-7) → cal (vk 8) saumattomasti, mikä parantaa vk 9-16 peakingia merkittävästi.
    //
    // Jos halutaan lockout-spesifiä työtä, lisätään 1 BACKOFF-slot Paused pull-up:lla
    // strength-blokin sisällä — ei korvata päärekistöä.
    { week:5, days:[
      maDay("MA — Lisäpainoleuanveto 4×4 V3 @81%",  4,4,3, 0.75, 0.65, null, undefined, "myotaote", "strength", null, true, false, true),
      tiDay("TI — Kyykky 4×4 V3 @81%",       4,4,3, 0.75, null, undefined, tiBackoffPaused(0.60)),
      toDay("TO — Dippi 4×4 V3 @81%",        4,4,3, 0.75, 0.65, null, undefined, "kapea"),
      laDay("LA — MU +2.5 kg + paused squat", 2.5, 3, "Ensimmäinen painolla (+2.5 kg) — jos strict puhdas", 2, FS.w5),
    ]},
    { week:6, days:[
      maDay("MA — Lisäpainoleuanveto 4×4 @78 %",  4,4,2, 0.78, 0.65, null, undefined, "myotaote", "strength", null, true, false, true),
      tiDay("TI — Kyykky 4×4 @78%",       4,4,2, 0.78, null, undefined, tiBackoffPaused(0.62)),
      toDay("TO — Dippi 4×4 @78%",        4,4,2, 0.78, 0.65, null, undefined, "kapea"),
      laDay("LA — MU +2.5–5 kg + paused squat", 2.5, 3, "+2.5 kg (tai +5 jos edellinen meni hyvin)", 2, FS.w6),
    ]},
    { week:7, days:[
      // v4.28.0 (H4): Vk 7 top single @88% POISTETTU kaikilta kolmelta — strength-blokin
      // piikki on volyymi-intensiteetti 4×4@82 (26 reps), ei near-max-test. Top @88%
      // oli duplikaatti vk 8 välitestille @92%. Vähentää near-max-sessioita 5→4 (vk 7–12).
      maDay("MA — Lisäpainoleuanveto 4×3 V1 @88%",   4,3,1, 0.82, 0.68, null, undefined, "myotaote", "strength", null, true, false, true),
      tiDay("TI — Kyykky 4×3 V1 @88%", 4,3,1, 0.82, null, undefined, tiBackoffPaused(0.66)),
      toDay("TO — Dippi 4×3 V1 @88%",  4,3,1, 0.82, 0.68, null, undefined, "kapea"),
      laDay("LA — MU +5 kg + paused squat",      5, 3, "+5 kg — raskas viikko", 2, FS.w7),
    ]},
    { week:8, days:[
      // v4.32.9 M16 + M14 PÄIVITYS: top single @92% → calibration 92%×3 V1.
      // DiStasio 2014: low-rep e1RM-tarkkuus ±2.7 kg vs single ±5+ kg (single kärsii
      // päiväkohtaisesta varianssista). Yhdenmukainen formaatti vk 4 ↔ vk 8 ↔ vk 12
      // = puhdas trendi-arvio. Helms 2018 + Tuchscherer RTS heavy-first (topSingleFirst=true).
      maDay("MA — Deload + kalibrointi 92%×3 V1 🎯", 3,3,4, 0.58, null, 0.92, undefined, undefined, undefined, undefined, undefined, undefined, undefined, true, { reps: 3, role: "calibration", isCalibration: true, weekLabel: "Vk 8" }),
      tiDay("TI — Deload + kalibrointi 92%×3 V1 🎯", 3,3,4, 0.58, 0.92, undefined, tiBackoffRegular(0.46), undefined, undefined, true, { reps: 3, role: "calibration", isCalibration: true, weekLabel: "Vk 8" }),
      toDay("TO — Deload + kalibrointi 92%×3 V1 🎯", 3,3,4, 0.58, null, 0.92, undefined, undefined, undefined, true, { reps: 3, role: "calibration", isCalibration: true, weekLabel: "Vk 8" }),
      laDay("LA — Deload",                0, 2, "Kevyt tekninen — lepo ennen blokki 3"),
    ]},

    // ── BLOKKI 3: INTENSIFIKAATIO (vk 9–12) ──
    // v4.25 P1-4: Vk 9 ei top singleä — 7 near-max-session 7 viikossa oli liikaa.
    // Vk 10 on ensimmäinen intensifikaation top @92%, vk 11 top @95% (ei 97%).
    // MEV-volyymia, intensiteetti rakentuu asteittain.
    // v4.28.0 (L1): TI backoff = Tempo squat 3s eksentrinen (ei paused) — intensity-blokissa
    //    eri CNS-stimulus kuin LA:n box squat (joka eliminoi stretch-refleksin kokonaan).
    //    Kaksi eri mutta toisiaan täydentävää sticking-point-ärsykettä samassa viikossa.
    // v4.28.0 (H5): Vk 9 muSets 4→3 — yhdenmukaistus muiden intensity-viikkojen kanssa,
    //    ei erillistä "bump" ilman perustelua. Intensifikaatio nostaa kuormaa, ei sarjoja.
    { week:9, days:[
      // v4.30.0: Vk 9+ ME-rotaatio päättyy → kilpa-spesifisyys lukko. Heavy negative -overload säilyy intensitassa.
      maDay("MA — Leuka 4×3 V2 @86%",  4,3,2, 0.85, 0.70, null, undefined, "kilpaote", "intensity", undefined, true, false, true),
      tiDay("TI — Kyykky 4×3 V2 @86%", 4,3,2, 0.85, null, undefined, tiBackoffTempo(0.68)),
      toDay("TO — Dippi 4×3 V2 @86%",  4,3,2, 0.85, 0.70, null, undefined, "kilpaote"),
      // H5: 4→3 sarjaa (yhdenmukaistus vk 10-11 kanssa)
      laDay("LA — MU +7.5 kg + pin squat", 7.5, 3, "+7.5 kg — intensifikaatio alkaa", 2, FS.w9),
    ]},
    { week:10, days:[
      // v4.32.9 M14: top single heavy-first (topSingleFirst=true) — Helms 2018 / Tuchscherer RTS
      maDay("MA — Top@92% (heavy-first) + Leuka 4×3 @87%",  4,3,1, 0.87, null, 0.92, undefined, undefined, "intensity", undefined, true, false, true, true),
      tiDay("TI — Top@92% (heavy-first) + Kyykky 4×3 @87%", 4,3,1, 0.87, 0.92, undefined, tiBackoffTempo(0.70), undefined, undefined, true),
      toDay("TO — Top@92% (heavy-first) + Dippi 4×3 @87%",  4,3,1, 0.87, null, 0.92, undefined, undefined, undefined, true),
      laDay("LA — MU +10 kg + pin squat",     10, 3, "+10 kg", 2, FS.w10),
    ]},
    { week:11, days:[
      // v4.25 P1-5: 4×3 → 3×3 (Prilepin: 85–95% max 14 reps/sessio, optimal 10).
      // Top @97% → @95% (edelleen near-max, mutta CNS-palautuminen parempi vk 12:een).
      // v4.32.9 M14: heavy-first
      maDay("MA — Top@95% (heavy-first) + Leuka 3×2 V1 @91%",  3,2,1, 0.90, null, 0.95, undefined, undefined, "intensity", undefined, true, false, true, true),
      tiDay("TI — Top@95% (heavy-first) + Kyykky 3×2 V1 @91%", 3,2,1, 0.90, 0.95, undefined, tiBackoffTempo(0.72), undefined, undefined, true),
      toDay("TO — Top@95% (heavy-first) + Dippi 3×2 V1 @91%",  3,2,1, 0.90, null, 0.95, undefined, undefined, undefined, true),
      laDay("LA — MU +12.5 kg (viim. raskas) + pin squat", 12.5, 3, "+12.5 kg", 2, FS.w11),
    ]},
    { week:12, days:[
      // RPE9-testi: 2×2 @ kevyt, 1 × top @ 95 % RPE9. Tulos päivittää e1RM:n
      // jota vk 13–16 käyttää uudelleenkalibroidussa peaking-laskennassa.
      // v4.25: 97% → 95% (97% on RPE 9.5+, ei 9) — testi luotettavampi ja turvallisempi.
      // v4.28.0 (H3): Miksi RPE9 top single eikä AMRAP? Vk 12 on KISAA edeltävä
      // RPE-testi — tarkoitus on saada e1RM, jonka kehitys PEAK-kuormien laskentaan.
      // AMRAP tuottaisi 4-8 reps joka on liian pitkä lähellä kisaa. RPE9 single on
      // 1 rep ja antaa suoraan near-max-datapisteen kevyellä CNS-kuormalla.
      // v4.32.9 M16 + M14: top single @95% RPE9 → calibration 95%×2 V1, heavy-first.
      // Peaking-spesifisempi 95%×2 V1 vs 92%×3 V1 (Claude-research-suositus): peaking
      // CNS-fresh, low-rep e1RM, parempi reliabiliteetti kuin pelkkä single.
      maDay("MA — Deload + kalibrointi 95%×2 V1 (peak-test) 🎯", 2,2,4, 0.55, null, 0.95, undefined, undefined, undefined, undefined, undefined, undefined, undefined, true, { reps: 2, role: "calibration", isCalibration: true, weekLabel: "Vk 12" }),
      tiDay("TI — Deload + kalibrointi 95%×2 V1 (peak-test) 🎯", 2,2,4, 0.55, 0.95, undefined, tiBackoffRegular(0.44), undefined, undefined, true, { reps: 2, role: "calibration", isCalibration: true, weekLabel: "Vk 12" }),
      toDay("TO — Deload + kalibrointi 95%×2 V1 (peak-test) 🎯", 2,2,4, 0.55, null, 0.95, undefined, undefined, undefined, true, { reps: 2, role: "calibration", isCalibration: true, weekLabel: "Vk 12" }),
      laDay("LA — Kevyt aktivointi",              0, 2, "Lepo — kevyt liike"),
    ]},

    // ── BLOKKI 4: REALIZATION + TAPER (vk 13–16) ──
    // Huom: kuormat skaalautuvat AUTOMAATTISESTI vk 12:n RPE9-testissä
    // päivittyneen e1RM:n mukaan. Jos kehitys oli +3 %, peak 95 % = 0.98 × old_1RM.
    // v4.25 P1-6: Vk 13 backoff 3×3 @75 % POISTETTU — realization ei saa olla
    // volyymipiikki. Pidetään top single @93 % valinnaisena intensiteettiärsykkeenä.
    // v4.25 P1-11: Vk 13–15 saavat kevyet finisher-accessoryt ("alitreenattu"-tunne).
    // v4.28.0 (L1): TI peaking = Takakyykky kisastyle (EI paused!) — Zourdos 2016,
    //    Stone 2000: T-10 pv ennen kisaa ei teknisiä modifikaatioita. Competition-style
    //    motor groove ensisijainen, paused squat -spesifisyys tarpeeton.
    // v4.28.0 (H2): phase="peaking" → MA/TI/TO saavat tiivistetyn peaking-warmupin
    //    (singles-focused neural primer, ei hypertrofia-blokin laajaa prehabia).
    // v4.34.28: Vk 13 = MÖKKI / aktiivinen palautuminen (käyttäjäpalaute 2026-05-05).
    // Atleetti palaa mökiltä vk 12-13 jälkeen — vk 13 ei ole varsinainen treeni-vk.
    // Samalla saadaan Bosquet 2007 -sweet-spot-taperi (14 vrk = vk 14-15) cowork-auditin
    // kohdan 3.2 mukaisesti (aiempi 28 vrk taper ylitti Bosquet-ylärajan).
    //
    // Ohjelma tarjoaa kevyttä aktiivista palautumista — ei kuormaa, ei intensiteettiä.
    // Atleetti voi tehdä tai jättää tekemättä; lähinnä muistutus liikkua kevyesti.
    // Aiempi vk 13 realization-sisältö siirtynyt vk 14:ään (peaking 1).
    { week:13, days:[
      { dayOfWeek:1, dayType:"speed", label:"MA — 🌲 Mökki: aktiivinen palautuminen",
        warmup: [
          { name: "Kävely", desc: "20-30 min reippaasti — verenkierto + nivelnesteet" },
        ],
        slots: [
          { role:"accessory", category:"muu", defaultMovementName:"Kevyt liikkuvuus",
            sets:1, reps:10, targetVx:5, suggestedLoadKg:0,
            note:"Hartiarullaus, lonkka 90/90, T-rangan rotaatio · 5-10 min · ei kuormaa" },
        ],
      },
      { dayOfWeek:3, dayType:"speed", label:"KE — 🌲 Mökki: kevyt body weight",
        warmup: [
          { name: "Lämmittely", desc: "5 min kävely + dynaaminen venyttely" },
        ],
        slots: [
          { role:"accessory", category:"muu", defaultMovementName:"BW liikkuvuus + skapula",
            sets:2, reps:10, targetVx:5, suggestedLoadKg:0,
            note:"Push-up plus + scapular pull-up + glute bridge — 2 kierrosta, V5 (ei väsymystä)" },
        ],
      },
      { dayOfWeek:5, dayType:"speed", label:"PE — 🌲 Mökki: lepopäivä",
        warmup: [],
        slots: [],
      },
    ]},
    { week:14, days:[
      // v4.34.28 PÄIVITYS: Vk 13 on nyt MÖKKILEPO (ei realization). Vk 14 on paluu mökiltä —
      // kevyt mutta intensiivinen peaking-vk joka aktivoi CNS:n vk 15 opener-rehearsaliin.
      // Bosquet 2007: 14 vrk taper sweet-spot = vk 14 + vk 15 (kisapäivä la vk 16).
      // Pritchard 2016: peak-intensity 90-95% × 1.9±0.8 vk pre-comp = vk 14-15 ✓.
      //
      // v4.25 P1-7: Peaking intensiteetti 97% → 93% (97% 12 pv ennen kisaa liian raskas,
      // Zourdos 2016 tapering, Stone 2000). PR-yritys tulee kisapäivänä.
      // Finisher minimal = vain 1 slot, 2×12 kevyt.
      // v4.32.8 PÄIVITYS (Track C v2 vaiheen 2 syvätutkimus):
      //   1) Backoff palautettu KEVYTTÄ MOTOR-PATTERN -muodossa (1×3 @60% V4).
      //      Bosquet 2007 + Pritchard 2016 -elite-data: volyymi-leikkaus 41-60 %,
      //      ei 100 %. Israetel/JTS: "1-3 reps norm through taper". Pieni
      //      motor-pattern-säilytys-backoff pitää bar-feel + barbell-käyrän alaosan
      //      refleksin lämpiminä ilman CNS-fatiguen lisäystä.
      //   2) DECISION-TREE NOTE (v4.34.28 päivitetty): atleetin oma päätös
      //      perustuu vk 12 cal-tuloksiin + mökiltä-paluun palautumiseen, ei vk 13:een.
      maDay("MA — Peaking 2×1 @93% + kevyt (paluu mökiltä)",       2,1,1, 0.93, null, null, finisherMinimal("kevyt"), undefined, "peaking"),
      tiDay("TI — Peaking kyykky 2×1 @93% + 1×3 motor-pattern + kevyt", 2,1,1, 0.93, null, finisherMinimal("kevyt"),
        { style: "regular", pct: 0.60, sets: 1, reps: 3, targetVx: 4, note: "Motor-pattern-säilytys 1×3 @60% — kevyt, EI grindiä, pidetään bar-feel kisaa varten" },
        "peaking",
        "🎯 PEAKING DECISION-TREE: vk 13 oli MÖKKILEPO (ei realizationia). Mökiltä-paluu = kevyt mutta intensiivinen aktivointi. Jos vk 12 cal antoi >+5% e1RM-nousun ja palautuminen tuntuu täydelliseltä → harkitse 1 ekstra-sarja 95 % V1 LA-päivän opener-rehearsalissa. Päätös atleetilla, ei automaattinen. Pritchard 2016: peak-intensity 90-95% 1.9±0.8 vk ennen kisaa = vk 14-15."),
      toDay("TO — Peaking 2×1 @93% + kevyt (paluu mökiltä)",       2,1,1, 0.93, null, null, finisherMinimal("kevyt"), undefined, "peaking"),
      laDay("LA — MU opener rehearsal + kisakyykky kevyt", 15, 3, "Opener harjoitus +15 kg (V2 — tekniikka edellä)", 2, FS.w14),
    ]},
    { week:15, days:[
      // Taper: opener-harjoitus vk 15. Kuormat suhteessa atleetin nykyiseen
      // e1RM:ään. Opener = 88 %, "lämmittely" = 82 %.
      //
      // v4.25 P1-11: Finisher-slot (2×12 face pull V4) jokaiselle raskaalle
      // päivälle. Perustelu (user): "vk 13–15 pitää olla tukiliikkeitä,
      // muuten tulee alitreenattu tunne". Face pull V4 = ei lisäkuormaa,
      // scapular/rotator cuff aktivointi = parempaa kisavalmistautumista.
      // v4.28.0 (L2): Taper-viikon warmupit lisätty — taper on TUEN paikka, ei aukko.
      // Lyhyempi kuin hypertrofia/strength-warmup (alempi volyymi, low prehab),
      // mutta singles-focused neural primer säilyy.
      { dayOfWeek:1, dayType:"heavy", label:"MA — Taper opener-harjoitus",
        warmup: [
          { name: "Hyppynaru / Jumping Jacks", desc: "2 min yleislämmittely — kevyt" },
          { name: "Band pull-apart", desc: "1×12 — posterior delt" },
          { name: "Band external rotation", desc: "1×10 per puoli — rotator cuff" },
          { name: "Scapular hang", desc: "2×10 s — lapa-aktivaatio" },
          { name: "Räjähtävä leuka BW", desc: "3×1 maksimi nopeus — neural primer opener-singleille" },
          { name: "Warmup ramp", desc: "60% × 2 · 72% × 1 → workset (@82% lämmittely, @88% opener)" },
        ],
        slots:[
        { role:"primary",   category:"vertikaaliveto", defaultMovementName:"Lisäpainoleuanveto",
          sets:1, reps:1, targetVx:3, loadPct:0.82, suggestedLoadKg:seedL(0.82), note:"@82% = lämmittely", allowVelocityInput:true },
        { role:"secondary", category:"vertikaaliveto", defaultMovementName:"Lisäpainoleuanveto",
          sets:1, reps:1, targetVx:3, loadPct:0.88, suggestedLoadKg:seedL(0.88), note:"Opener @88%", competitionLift:true, allowVelocityInput:true },
        // TAPER-VOLYYMIKORJAUS (2026-08-12): tukiliikkeet takaisin. Raa'at slotit
        // ILMAN slotId:tä — ACCESSORY_SLOT_CATALOG:in peaking-repScheme pakottaisi
        // sets:2 (engine.js:7286 `phaseRep?.sets ?? slot.sets`), mikä on koko
        // volyymiromahduksen rakenteellinen juuri KUN slotilla on slotId.
        // Liikevalinta: VAIN liikkeitä jotka esiintyvät ohjelmassa vk 5-12, jotta
        // kuorma resolvoituu historiasta eikä jää tyhjäksi. (Ensiluonnos käytti
        // Penkkipunnerrusta ja Tricep pushdownia joita ohjelma EI käytä lainkaan —
        // verifiointi kaatoi sen.) V4 = ei lähelle failurea, ei CNS-kuormaa.
        // Vaakaveto EI ole minkään kisaliikkeen kattama (MU/leuka/dippi = pysty) →
        // se on tukiliike joka PEAKKAA muiden mukana: raskaampi, matalampi toisto,
        // varat säilyttäen (V4). Vrt. ACCESSORY_SLOT_CATALOG pull-horizontal-heavy
        // peaking = 2×6 V4. Atletin haaste 12.8.2026 — perusteltu, korjattu 8 → 6.
        { role:"accessory", category:"horisontaaliveto", defaultMovementName:"Pendlay row",
          sets:4, reps:6, targetVx:4, _noBlockScale:true, note:"Raskas vaakaveto — peakkaa, mutta V4 (varaa jää)" },
        { role:"accessory", category:"hauisfleksio", defaultMovementName:"Hauiskääntö tanko",
          sets:3, reps:10, targetVx:4, _noBlockScale:true, note:"Kyynärpään tuki vetoon — kevyt" },
        ...finisherMinimal("taper-aktivointi"),
      ]},
      { dayOfWeek:2, dayType:"heavy", label:"TI — Taper kyykky",
        warmup: [
          { name: "Hyppynaru / Jumping Jacks", desc: "2 min yleislämmittely" },
          { name: "Hip 90/90 + Cossack", desc: "30 s per puoli — lonkka-mobiliteetti" },
          { name: "Empty bar squat", desc: "1×5 — liikemallin herätys" },
          { name: "Warmup ramp", desc: "50% × 3 · 65% × 2 · 78% × 1 → workset (@85% lämmittely, @90% opener)" },
        ],
        slots:[
        { role:"primary",   category:"alaraaja", defaultMovementName:"Takakyykky",
          sets:1, reps:1, targetVx:3, loadPct:0.85, suggestedLoadKg:seedK(0.85), note:"@85%", isBarbell:true, allowVelocityInput:true },
        { role:"secondary", category:"alaraaja", defaultMovementName:"Takakyykky",
          sets:1, reps:1, targetVx:3, loadPct:0.90, suggestedLoadKg:seedK(0.90), note:"Opener @90%", isBarbell:true, competitionLift:true, allowVelocityInput:true },
        // TAPER-VOLYYMIKORJAUS (2026-08-12): ks. MA-päivän perustelu.
        // HUOM: kevyt motor-pattern-kyykky (2×3 @60 %) POISTETTIIN verifioinnissa —
        // se pudotti kyykyn KISA-AVAUKSEN 141 → 131 kg (per-laji-e1RM 156,7 → 145,6),
        // koska kevyt sarja painaa liikkeen e1RM-arviota jolta attemptsPct lasketaan.
        // Bar-feel tulee jo saman päivän singleistä @85 % ja @90 %.
        { role:"accessory", category:"alaraaja", defaultMovementName:"Jalkaprässi",
          sets:4, reps:8, targetVx:4, _noBlockScale:true, note:"Quad-volyymi ilman selkä-CNS:ää — V4" },
        { role:"accessory", category:"core", defaultMovementName:"Hanging leg raise",
          sets:3, reps:10, targetVx:3, _noBlockScale:true, note:"Vartalon jäykkyys kyykkyyn" },
      ]},
      { dayOfWeek:4, dayType:"heavy", label:"TO — Taper dippi",
        warmup: [
          { name: "Hyppynaru / Jumping Jacks", desc: "2 min yleislämmittely" },
          { name: "Band dislocations", desc: "1×10 — olka-mobiliteetti" },
          { name: "Band external rotation", desc: "1×10 per puoli — rotator cuff" },
          { name: "Scapular push-up", desc: "1×8 — serratus aktivaatio" },
          { name: "BW dippi", desc: "1×3 räjähtävä — neural primer" },
          { name: "Warmup ramp", desc: "60% × 2 · 72% × 1 → workset (@82% lämmittely, @88% opener)" },
        ],
        slots:[
        { role:"primary",   category:"horisontaalityöntö", defaultMovementName:"Lisäpainodippi",
          sets:1, reps:1, targetVx:3, loadPct:0.82, suggestedLoadKg:seedD(0.82), note:"@82%", allowVelocityInput:true },
        { role:"secondary", category:"horisontaalityöntö", defaultMovementName:"Lisäpainodippi",
          sets:1, reps:1, targetVx:3, loadPct:0.88, suggestedLoadKg:seedD(0.88), note:"Opener @88%", competitionLift:true, allowVelocityInput:true },
        // TAPER-VOLYYMIKORJAUS (2026-08-12): ks. MA-päivän perustelu.
        // Vaakatyöntö on vain osittain dipin kattama → peakkaa. Katalogi bench-heavy
        // peaking = 2×5 V4. Korjattu 6 → 5 (atletin haaste 12.8.2026).
        { role:"accessory", category:"horisontaalityöntö", defaultMovementName:"Close-grip bench",
          sets:4, reps:5, targetVx:4, _noBlockScale:true, note:"Raskas vaakatyöntö — peakkaa, V4 (varaa jää)" },
        { role:"accessory", category:"ojentajaekstensio", defaultMovementName:"Skull crusher",
          sets:3, reps:10, targetVx:4, _noBlockScale:true, note:"Dipin lukituksen tuki — kevyt" },
        { role:"accessory", category:"vertikaalityöntö", defaultMovementName:"Pystypunnerrus",
          sets:3, reps:6, targetVx:4, _noBlockScale:true, note:"Pystytyöntö dipin lukitukseen — raskaampi, V4" },
      ]},
      { dayOfWeek:6, dayType:"volume", label:"LA — MU opener",
        warmup: [
          { name: "Hyppynaru / Jumping Jacks", desc: "2 min kevyt" },
          { name: "Scapular pull-up", desc: "2×10 — lapa-aktivaatio" },
          { name: "False Grip hang", desc: "2×15 s — ranteiden asento" },
          { name: "Band dislocations", desc: "1×10 — olka-mobiliteetti MU:n lukitukseen" },
          { name: "Räjähtävä leuka BW", desc: "3×1 — maksimi nopeus, MU-vedon primer" },
          { name: "Band MU -harjoitus", desc: "2×1 — MU-liikemallin herätys kevyemmällä assistilla" },
        ],
        slots:[
        { role:"primary", category:"vertikaaliveto", defaultMovementName:"Muscle-up",
          sets:3, reps:1, targetVx:null, suggestedLoadKg:5, note:"Opener +5 kg", competitionLift:true },
        // TAPER-VOLYYMIKORJAUS (2026-08-12): ks. MA-päivän perustelu. LA oli aiemmin
        // 1 slotti / 3 sarjaa koko päivässä — kevyin treenipäivä koko 16 vk:n ohjelmassa.
        { role:"accessory", category:"vertikaaliveto", defaultMovementName:"Leuanveto chest-to-bar",
          sets:3, reps:5, targetVx:3, _noBlockScale:true, note:"Vetovolyymi kisaliikkeen ympärille" },
        { role:"accessory", category:"horisontaalityöntö", defaultMovementName:"Lisäpainodippi",
          sets:3, reps:5, targetVx:3, _noBlockScale:true, note:"MU:n yläasennon tuki — kevyt kuorma" },
        { role:"accessory", category:"core", defaultMovementName:"Pallof press",
          sets:3, reps:10, targetVx:4, _noBlockScale:true, note:"10 toistoa per puoli — anti-rotaatio" },
      ]},
    ]},
    { week:16, days:[
      { dayOfWeek:1, dayType:"heavy", label:"MA T-6 — Kevyt aktivointi",
        warmup: [
          { name: "Hyppynaru / Jumping Jacks", desc: "2 min yleislämmittely" },
          { name: "Band pull-apart", desc: "1×12 — posterior delt" },
          { name: "Band dislocations", desc: "1×10 — olka-mobiliteetti" },
          { name: "Scapular hang", desc: "2×10 s — lapa-aktivaatio" },
          { name: "BW-leuka", desc: "1×3 kevyt — liikemallin herätys" },
          { name: "Warmup ramp", desc: "50% × 2 · 65% × 1 → workset (@75% RPE 6)" },
        ],
        slots:[
        { role:"primary",   category:"vertikaaliveto",   defaultMovementName:"Lisäpainoleuanveto",
          sets:2, reps:1, targetVx:4, loadPct:0.75, suggestedLoadKg:seedL(0.75), note:"75 % openerista — RPE 6", allowVelocityInput:true },
        { role:"accessory", category:"horisontaalityöntö", defaultMovementName:"Lisäpainodippi",
          sets:2, reps:1, targetVx:4, loadPct:0.75, suggestedLoadKg:seedD(0.75), note:"75 % openerista", allowVelocityInput:true },
      ]},
      { dayOfWeek:2, dayType:"heavy", label:"TI T-5 — Kevyt kyykky",
        warmup: [
          { name: "Hyppynaru / Jumping Jacks", desc: "2 min kevyt" },
          { name: "Hip 90/90 + Cossack", desc: "30 s per puoli — mobiliteetti" },
          { name: "Empty bar squat", desc: "1×5 — liikemallin herätys" },
          { name: "Warmup ramp", desc: "50% × 2 · 65% × 1 → workset (@78% RPE 6)" },
        ],
        slots:[
        { role:"primary", category:"alaraaja", defaultMovementName:"Takakyykky",
          sets:2, reps:1, targetVx:4, loadPct:0.78, suggestedLoadKg:seedK(0.78), isBarbell:true, note:"78 % openerista", allowVelocityInput:true },
      ]},
      // v4.25 P1-6 (user-agreed): TO T-3 -sessio oli 5–10 % liian kuormittava 72 h
      // ennen kisaa. 88 % → 85 %, MU 3×1 → 2×1. Zourdos 2016 tapering:
      // T-3 -session tarkoitus = neural priming, EI voimatestaus. 85 % riittää
      // "herättely"-efektiin mutta jättää CNS-varastot täyteen kisapäivään.
      { dayOfWeek:4, dayType:"heavy", label:"TO T-3 — Herättely + opener-rehearsal",
        warmup: [
          { name: "Hyppynaru / Jumping Jacks", desc: "2 min kevyt" },
          { name: "Band dislocations", desc: "1×10 — olka-mobiliteetti" },
          { name: "Band external rotation", desc: "1×10 per puoli — rotator cuff" },
          { name: "Scapular pull-up + push-up", desc: "1×5 kumpaakin — lapa-aktivaatio" },
          { name: "BW-leuka + BW-dippi", desc: "1×3 kumpaakin kevyt — liikemallien primer" },
          { name: "Warmup ramp", desc: "50% × 2 · 65% × 1 · 75% × 1 → workset" },
        ],
        slots:[
        { role:"primary",   category:"vertikaaliveto", defaultMovementName:"Lisäpainoleuanveto",
          sets:1, reps:1, targetVx:3, loadPct:0.80, suggestedLoadKg:seedL(0.80), note:"@80% lämmittely", allowVelocityInput:true },
        { role:"secondary", category:"vertikaaliveto", defaultMovementName:"Lisäpainoleuanveto",
          sets:1, reps:1, targetVx:3, loadPct:0.85, suggestedLoadKg:seedL(0.85), note:"Opener rehearsal @85% (EI openeri — liian lähellä kisaa)", competitionLift:true, allowVelocityInput:true },
        { role:"accessory", category:"horisontaalityöntö", defaultMovementName:"Lisäpainodippi",
          sets:1, reps:1, targetVx:3, loadPct:0.85, suggestedLoadKg:seedD(0.85), note:"Opener rehearsal @85%", allowVelocityInput:true },
        { role:"accessory", category:"vertikaaliveto", defaultMovementName:"Muscle-up",
          sets:2, reps:1, targetVx:null, suggestedLoadKg:5, note:"Opener practice (2 sarjaa, ei 3 — CNS-säästö)" },
      ]},
      // Kisapäivä: avauspainot realistisiksi. Opener 88 %, 2nd 96 %, 3rd 102 % —
      // tämä olettaa realistista ~2–5 % kehitystä, ei 10 %+. Jos kehitys on ollut
      // suurempi, vk 12:n RPE9-testi nostaa e1RM:n, ja kaikki lasketaan sen päälle.
      { dayOfWeek:7, dayType:"competition", label:"SU T-0 — KISA 🏆",
        warmup: [
          { name: "Hyppynaru / Jumping Jacks", desc: "3 min perusteellinen lämmittely — kisalämpö" },
          { name: "Band pull-apart + dislocations", desc: "1×15 kumpaakin — olkapäät ja lavat" },
          { name: "Hip 90/90 + Cossack", desc: "30 s per puoli — lonkat kisakyykkyyn" },
          { name: "Scapular pull-up / push-up", desc: "1×5 kumpaakin — lapa-aktivaatio" },
          { name: "Dynaaminen priming", desc: "BW-leuka 1×3 räjähtävä + BW-dippi 1×3 — CNS-primer" },
          { name: "Liikekohtainen ramp", desc: "Jokaisen liikkeen ramp erikseen: MU bändi → BW → +5, Leuka 50→65→80%, Dippi 50→65→80%, Kyykky 40→60→75→85% — kisaproto" },
        ],
        slots:[
        { role:"primary",   category:"vertikaaliveto",   defaultMovementName:"Muscle-up",
          sets:3, reps:1, targetVx:null, suggestedLoadKg:5, note:"1. Muscle-up — Opener +5 · 2nd +10 · 3rd +15 kg", competitionLift:true },
        { role:"secondary", category:"vertikaaliveto",   defaultMovementName:"Lisäpainoleuanveto",
          sets:3, reps:1, targetVx:null, loadPct:0.88, suggestedLoadKg:seedL(0.88),
          note:"2. Leuanveto — Opener 88% · 2nd 96% · 3rd 102% (laskettuna vk 12 RPE9-testissä)",
          competitionLift:true, attemptsPct:[0.88, 0.96, 1.02], allowVelocityInput:true },
        { role:"backoff",   category:"horisontaalityöntö", defaultMovementName:"Lisäpainodippi",
          sets:3, reps:1, targetVx:null, loadPct:0.88, suggestedLoadKg:seedD(0.88),
          note:"3. Dippi — Opener 88% · 2nd 96% · 3rd 102%",
          competitionLift:true, attemptsPct:[0.88, 0.96, 1.02], allowVelocityInput:true },
        { role:"accessory", category:"alaraaja",         defaultMovementName:"Takakyykky",
          sets:3, reps:1, targetVx:null, loadPct:0.90, suggestedLoadKg:seedK(0.90),
          note:"4. Kyykky — Opener 90% · 2nd 97% · 3rd 103%",
          competitionLift:true, isBarbell:true, attemptsPct:[0.90, 0.97, 1.03], allowVelocityInput:true },
      ]},
    ]},
    { week:17, days:[
      // ── v4.59.0: VIIKKO 17 — LAUANTAI-KISAVIIKKO ──────────────────────────
      //
      // MIKSI TÄMÄ VIIKKO ON OLEMASSA:
      // Ohjelma ei ole ankkuroitu kisapäivään (streetliftingConfig.competitionDate
      // on null) — viikot lasketaan pelkästä startDateISO:sta. Vk 16:n kisapäivä on
      // SUNNUNTAI (dayOfWeek 7), mutta streetlifting- ja voimanostokisat ovat
      // käytännössä lauantaisin. Jos atletin kisa osuu lauantaille, vk 16 huipentuu
      // 1 pv liian aikaisin JA ohjelma loppuu (resolveMesocyclePosition palauttaa
      // "after-end", engine.js) jättäen kisaa edeltävän viikon täysin tyhjäksi.
      // Vk 17 antaa lauantai-kisalle oikean taper-viikon.
      //
      // KÄYTTÖ: atletti ohittaa vk 16:n sunnuntain kisapäivän ja jatkaa vk 17:ään.
      // Vk 16 säilyy ennallaan (= sunnuntai-kisan normaalipolku muille).
      //
      // AJOITUS (kisa LA, dayOfWeek 6):
      //   MA = T-5 · TI = T-4 · TO = T-2 · LA = T-0
      // TO on 48 h kisasta. Vk 16:n oma kommentti (v4.25 P1-6) kertoo että T-3
      // @88 % oli jo LIIAN kuormittava ja laskettiin 85 %:iin — 48 h päässä
      // opener-rehearsalia EI tehdä lainkaan, vain liikemallin herätys @70 %.
      //
      // VOLYYMI: MA saa aitoa tukiliikevolyymiä, koska vk 16 on jo kaksi kevyttä
      // viikkoa peräkkäin (T-6/T-5/T-3 = 11 työsarjaa). Kolmas peräkkäinen
      // minimiviikko tuottaisi alitreenatun tunteen ilman palautumishyötyä.
      // _noBlockScale: blokki 4:n accessory-skalaari (×0.50) ei saa puolittaa
      // jo valmiiksi taperoitua viikkoa — sama peruste kuin vk 15:ssä (4.58.0).
      { dayOfWeek:1, dayType:"heavy", label:"MA T-5 — Viimeinen kohtalainen",
        warmup: [
          { name: "Hyppynaru / Jumping Jacks", desc: "2 min yleislämmittely" },
          { name: "Band pull-apart", desc: "1×12 — posterior delt" },
          { name: "Band external rotation", desc: "1×10 per puoli — rotator cuff" },
          { name: "Scapular hang", desc: "2×10 s — lapa-aktivaatio" },
          { name: "Warmup ramp", desc: "50% × 3 · 65% × 2 · 72% × 1 → workset (@80%)" },
        ],
        slots:[
        { role:"primary",   category:"vertikaaliveto", defaultMovementName:"Lisäpainoleuanveto",
          sets:2, reps:1, targetVx:3, loadPct:0.80, suggestedLoadKg:seedL(0.80),
          note:"@80% — viimeinen kohtalainen veto", allowVelocityInput:true },
        { role:"secondary", category:"horisontaalityöntö", defaultMovementName:"Lisäpainodippi",
          sets:2, reps:1, targetVx:3, loadPct:0.80, suggestedLoadKg:seedD(0.80),
          note:"@80%", allowVelocityInput:true },
        { role:"accessory", category:"horisontaaliveto", defaultMovementName:"Pendlay row",
          sets:3, reps:6, targetVx:4, _noBlockScale:true, note:"Tukivolyymi — V4, ei grindiä" },
        { role:"accessory", category:"horisontaalityöntö", defaultMovementName:"Close-grip bench",
          sets:3, reps:6, targetVx:4, _noBlockScale:true, note:"Ojentajan tuki — V4" },
      ]},
      { dayOfWeek:2, dayType:"heavy", label:"TI T-4 — Kevyt kyykky",
        warmup: [
          { name: "Hyppynaru / Jumping Jacks", desc: "2 min kevyt" },
          { name: "Hip 90/90 + Cossack", desc: "30 s per puoli — mobiliteetti" },
          { name: "Empty bar squat", desc: "1×5 — liikemallin herätys" },
          { name: "Warmup ramp", desc: "50% × 3 · 65% × 2 → workset (@78%)" },
        ],
        slots:[
        { role:"primary", category:"alaraaja", defaultMovementName:"Takakyykky",
          sets:2, reps:1, targetVx:4, loadPct:0.78, suggestedLoadKg:seedK(0.78), isBarbell:true,
          note:"78 % openerista — viimeinen kyykky ennen kisaa", allowVelocityInput:true },
        { role:"accessory", category:"alaraaja", defaultMovementName:"Jalkaprässi",
          sets:3, reps:8, targetVx:4, _noBlockScale:true, note:"Quad-volyymi ilman selkä-CNS:ää" },
        { role:"accessory", category:"core", defaultMovementName:"Hanging leg raise",
          sets:3, reps:10, targetVx:3, _noBlockScale:true, note:"Vartalon jäykkyys" },
      ]},
      { dayOfWeek:4, dayType:"speed", label:"TO T-2 — Vain aktivointi (EI opener-rehearsalia)",
        warmup: [
          { name: "Hyppynaru / Jumping Jacks", desc: "2 min kevyt" },
          { name: "Band dislocations", desc: "1×10 — olka-mobiliteetti" },
          { name: "Scapular pull-up + push-up", desc: "1×5 kumpaakin — lapa-aktivaatio" },
          { name: "BW-leuka + BW-dippi", desc: "1×3 kumpaakin — liikemallien primer" },
        ],
        slots:[
        // 48 h kisasta: liikemallin herätys, EI voimatestaus. Ks. vk 16 v4.25 P1-6.
        { role:"primary",   category:"vertikaaliveto", defaultMovementName:"Lisäpainoleuanveto",
          sets:1, reps:1, targetVx:4, loadPct:0.70, suggestedLoadKg:seedL(0.70),
          note:"@70% — pelkkä herätys, CNS säästöön" },
        { role:"accessory", category:"horisontaalityöntö", defaultMovementName:"Lisäpainodippi",
          sets:1, reps:1, targetVx:4, loadPct:0.70, suggestedLoadKg:seedD(0.70), note:"@70% herätys" },
        ...finisherMinimal("kisa-aktivointi"),
      ]},
      { dayOfWeek:6, dayType:"competition", label:"LA T-0 — KISA 🏆",
        warmup: [
          { name: "Hyppynaru / Jumping Jacks", desc: "3 min perusteellinen — kisalämpö" },
          { name: "Band pull-apart + dislocations", desc: "1×15 kumpaakin — olkapäät ja lavat" },
          { name: "Hip 90/90 + Cossack", desc: "30 s per puoli — lonkat kisakyykkyyn" },
          { name: "Scapular pull-up / push-up", desc: "1×5 kumpaakin — lapa-aktivaatio" },
          { name: "Dynaaminen priming", desc: "BW-leuka 1×3 räjähtävä + BW-dippi 1×3 — CNS-primer" },
          { name: "Liikekohtainen ramp", desc: "Jokaisen liikkeen ramp erikseen: MU bändi → BW → +5, Leuka 50→65→80%, Dippi 50→65→80%, Kyykky 40→60→75→85% — kisaproto" },
        ],
        slots:[
        { role:"primary",   category:"vertikaaliveto",   defaultMovementName:"Muscle-up",
          sets:3, reps:1, targetVx:null, suggestedLoadKg:5, note:"1. Muscle-up — Opener +5 · 2nd +10 · 3rd +15 kg", competitionLift:true },
        { role:"secondary", category:"vertikaaliveto",   defaultMovementName:"Lisäpainoleuanveto",
          sets:3, reps:1, targetVx:null, loadPct:0.88, suggestedLoadKg:seedL(0.88),
          note:"2. Leuanveto — Opener 88% · 2nd 96% · 3rd 102%",
          competitionLift:true, attemptsPct:[0.88, 0.96, 1.02], allowVelocityInput:true },
        { role:"backoff",   category:"horisontaalityöntö", defaultMovementName:"Lisäpainodippi",
          sets:3, reps:1, targetVx:null, loadPct:0.88, suggestedLoadKg:seedD(0.88),
          note:"3. Dippi — Opener 88% · 2nd 96% · 3rd 102%",
          competitionLift:true, attemptsPct:[0.88, 0.96, 1.02], allowVelocityInput:true },
        { role:"accessory", category:"alaraaja",         defaultMovementName:"Takakyykky",
          sets:3, reps:1, targetVx:null, loadPct:0.90, suggestedLoadKg:seedK(0.90),
          note:"4. Kyykky — Opener 90% · 2nd 97% · 3rd 103%",
          competitionLift:true, isBarbell:true, attemptsPct:[0.90, 0.97, 1.03], allowVelocityInput:true },
      ]},
    ]},
  ];

  return {
    mesocycleId: uid(),
    type: "streetlifting_16w",
    startDateISO: startDateISO || todayISO(),
    weekCount: 17,
    streetliftingConfig: {
      calibration: { leukaExtKg: L, dippiExtKg: D, kyykkyExtKg: K, bwKg: BW },
      competitionDate: null,
    },
    _programMeta: {
      tierProgressionApplied: false,
      source: "Akseli reference program, 15v empiria",
      handTuned: true,
    },
    weekDefs: [
      { week:1,  deltaPctBase:0,     label:"Vk 1 — Hypertrofia: aloitus",     heavyReps:6, heavyTargetVx:3 },
      { week:2,  deltaPctBase:0.03,  label:"Vk 2 — Hypertrofia: kasvu",        heavyReps:6, heavyTargetVx:3 },
      { week:3,  deltaPctBase:0.06,  label:"Vk 3 — Hypertrofia: piikki",       heavyReps:6, heavyTargetVx:2 },
      { week:4,  deltaPctBase:-0.25, label:"Vk 4 — Deload + testaus",          heavyReps:5, heavyTargetVx:4 },
      { week:5,  deltaPctBase:0.02,  label:"Vk 5 — Voima: aloitus",           heavyReps:4, heavyTargetVx:2 },
      { week:6,  deltaPctBase:0.05,  label:"Vk 6 — Voima: kasvu",             heavyReps:4, heavyTargetVx:2 },
      { week:7,  deltaPctBase:0.08,  label:"Vk 7 — Voima: piikki",            heavyReps:4, heavyTargetVx:1 },
      { week:8,  deltaPctBase:-0.25, label:"Vk 8 — Deload + välitesti",       heavyReps:3, heavyTargetVx:4 },
      { week:9,  deltaPctBase:0.05,  label:"Vk 9 — Intensiteetti",             heavyReps:3, heavyTargetVx:1 },
      { week:10, deltaPctBase:0.08,  label:"Vk 10 — Intensiteetti+",           heavyReps:3, heavyTargetVx:1 },
      { week:11, deltaPctBase:0.10,  label:"Vk 11 — Intensiteetti: piikki",   heavyReps:3, heavyTargetVx:1 },
      { week:12, deltaPctBase:-0.20, label:"Vk 12 — Deload + RPE9 testi 🎯", heavyReps:2, heavyTargetVx:4 },
      { week:13, deltaPctBase:0.08,  label:"Vk 13 — Realization",             heavyReps:2, heavyTargetVx:1 },
      { week:14, deltaPctBase:0.10,  label:"Vk 14 — Peaking",                 heavyReps:1, heavyTargetVx:1 },
      { week:15, deltaPctBase:-0.15, label:"Vk 15 — Taper",                   heavyReps:1, heavyTargetVx:3 },
      { week:16, deltaPctBase:-0.25, label:"Vk 16 — Kisaviikko 🏆",           heavyReps:1, heavyTargetVx:0 },
    ],
    weekPlans,
    postCycleAnalysis: null,
    accessorySlotOverrides: {}, // { [slotId]: { movementName, locked, variantIndex, reason, swappedAt } }
    // H-015 (2026-06-10): liike-korvaus vaivan ajaksi. { [originalName]: { replacementName,
    // reason ("vaiva"|"aikapula"|"muu"|null), startedISO, endedISO|null } }. endedISO=null =
    // aktiivinen. Engine lukee defensiivisesti (|| {}) → vanhat mesot yhteensopivia ilman migraatiota.
    movementSubstitutions: {},
    insertedDeloads: [], // [{ afterProgramWeek: N, invokedDateISO, reason }] — laajentaa kalenteripituutta
    replacedWithDeload: [], // [{ programWeek: N, invokedDateISO, reason }] — korvaa kyseisen vk:n kevennyksellä, ei pidennä
    // v4.30.2: ohjelmaversio auto-rebuild -mekanismille. Init() vertaa tätä
    // PROGRAM_BUILD_VERSION-vakioon ja kutsuu rebuildStreetlifting16WMesocycle:n
    // jos versiot eroavat → uudet ohjelmamuutokset näkyvät heti ilman edistyksen menetystä.
    programVersion: PROGRAM_BUILD_VERSION,
  };
}

// ═══════════════════════════════════════════════════════════════
// v4.30.2: AUTO-REBUILD MEKANISMI
// ═══════════════════════════════════════════════════════════════
//
// Ongelma: createStreetlifting16WMesocycle rakentaa weekPlans kerran
// (mesocyclen luonti­hetkellä) ja tallentaa sen IndexedDB:hen. Kun data.js
// muuttuu (esim. ME-rotaatio, uudet liikkeet, korjatut Vx-arvot), olemassa
// oleva mesocycle ei päivity — käyttäjä joutuu aloittamaan uuden ohjelman
// nähdäkseen muutokset, mikä hävittää vk-numeron + kalibroinnin.
//
// Ratkaisu: rebuildStreetlifting16WMesocycle korvaa weekPlans + weekDefs
// uusilla, mutta säilyttää käyttäjän edistystiedot:
//   - mesocycleId, startDateISO (vk-numero pysyy oikeana)
//   - streetliftingConfig.calibration (AMRAP-vk 4 -tulokset)
//   - streetliftingConfig.competitionDate
//   - accessorySlotOverrides (käyttäjän omat liike­swapit)
//   - insertedDeloads, replacedWithDeload (kevennysten muutokset)
//   - postCycleAnalysis (jos on)
//
// Init():ssä kutsutaan kun mesocycle.programVersion !== PROGRAM_BUILD_VERSION.

function rebuildStreetlifting16WMesocycle(existingMesocycle) {
  if (!existingMesocycle || existingMesocycle.type !== "streetlifting_16w") {
    return existingMesocycle;
  }
  // Käytä olemassa olevaa kalibrointia → seed-kuormat säilyvät, vaikka weekPlans rakennetaan uudelleen
  const cal = existingMesocycle.streetliftingConfig?.calibration || {};
  const fresh = createStreetlifting16WMesocycle(existingMesocycle.startDateISO, cal);
  // Säilytä edistystiedot, korvaa vain rakenteet
  return {
    ...existingMesocycle,
    // Korvataan uudella ajantasaisella koodilla:
    weekDefs: fresh.weekDefs,
    weekPlans: fresh.weekPlans,
    programVersion: PROGRAM_BUILD_VERSION,
    // Säilytetään streetliftingConfig kokonaisuudessaan, mutta varmistetaan että
    // kalibrointi on edelleen siellä (ei putoa pois jos fresh oletti tyhjän cal:n)
    streetliftingConfig: {
      ...fresh.streetliftingConfig,
      ...existingMesocycle.streetliftingConfig,
    },
    // mesocycleId, startDateISO, weekCount, accessorySlotOverrides, insertedDeloads,
    // replacedWithDeload, postCycleAnalysis säilyvät alkuperäisestä (...existingMesocycle).
  };
}

// ── Wizard-integraation tunnistusfunktiot (v4.39.0 — Track B Vaihe 2A) ──
//
// Pää-sovellus näyttää onboarding-bannerin uusille käyttäjille ja Asetukset-
// linkin olemassa oleville. Nämä funktiot tunnistavat käyttäjän tilan.
//
// SUUNNITTELUVALINTA: detectIsNewUser tarkistaa AINOASTAAN sessions + sets
// -storeja — ei movementProgressia eikä mesocyclejä. Syy: ohjelmiston ensim-
// mäinen avaus voi luoda streetlifting_16w-mesocyclen automaattisesti
// (createDefaultMesocycle), jolloin mesocycles-store EI ole tyhjä vaikka
// käyttäjä ei ole tehnyt yhtään sessiota. "Uusi käyttäjä" määritellään
// käytännössä = "ei vielä yhtään harjoituskertaa kirjattu".
async function detectIsNewUser() {
  try {
    const sessions = await dbGetAll(STORES.sessions);
    if (Array.isArray(sessions) && sessions.length > 0) return false;
    const sets = await dbGetAll(STORES.sets);
    if (Array.isArray(sets) && sets.length > 0) return false;
    return true;
  } catch (e) {
    console.warn("[data] detectIsNewUser failed:", e);
    return false; // safe fallback: ei näytä onboardingia jos virhe
  }
}

// detectWizardStatus avaa LeVeWizardDB:n LUKU-VAIN ilman versionumeroa (sama
// pattern kuin wizard-movement-bank.js lukee LeVeCoachDB:tä). Tämä EI laukaise
// wizard-migraatioita pää-app:sta.
//
// Palauttaa: { exists, completed, schemaVersion, migratedFrom, lastStepIndex,
//              wizardId, completedAtISO } tai null jos DB ei avaudu.
async function detectWizardStatus() {
  if (typeof indexedDB === "undefined" || !indexedDB) return null;
  return new Promise((resolve) => {
    let req;
    try {
      req = indexedDB.open("LeVeWizardDB"); // ei versionumeroa → ei migraatioita
    } catch {
      resolve(null);
      return;
    }
    // Jos LeVeWizardDB ei vielä ole olemassa, onupgradeneeded laukeaa →
    // keskeytetään luonti (sama pattern kuin movement-bank).
    req.onupgradeneeded = (event) => {
      try { event.target.transaction.abort(); } catch { /* ignore */ }
    };
    req.onsuccess = async () => {
      const db = req.result;
      const result = {
        exists: false,
        completed: false,
        schemaVersion: null,
        migratedFrom: null,
        lastStepIndex: 0,
        wizardId: null,
        completedAtISO: null,
      };
      try {
        if (!db.objectStoreNames.contains("wizardConfigs") ||
            !db.objectStoreNames.contains("wizardMeta")) {
          db.close();
          resolve(result);
          return;
        }
        // Lue activeWizardId metasta
        const activeId = await new Promise((res) => {
          const tx = db.transaction("wizardMeta", "readonly");
          const r = tx.objectStore("wizardMeta").get("activeWizardId");
          r.onsuccess = () => res(r.result && r.result.value);
          r.onerror   = () => res(null);
        });
        if (!activeId) {
          db.close();
          resolve(result);
          return;
        }
        const cfg = await new Promise((res) => {
          const tx = db.transaction("wizardConfigs", "readonly");
          const r = tx.objectStore("wizardConfigs").get(activeId);
          r.onsuccess = () => res(r.result || null);
          r.onerror   = () => res(null);
        });
        if (cfg) {
          result.exists = true;
          result.completed = !!cfg.completedAtISO;
          result.schemaVersion = cfg.schemaVersion || null;
          result.migratedFrom = cfg.migratedFrom || null;
          result.lastStepIndex = typeof cfg.lastStepIndex === "number" ? cfg.lastStepIndex : 0;
          result.wizardId = cfg.wizardId;
          result.completedAtISO = cfg.completedAtISO || null;
        }
      } catch (e) {
        result._error = String(e);
      } finally {
        try { db.close(); } catch { /* ignore */ }
        resolve(result);
      }
    };
    req.onerror   = () => resolve(null);
    req.onblocked = () => resolve(null);
  });
}

// Onboarding-bannerin sulkemis-tila — tallennetaan appMeta:han jotta
// käyttäjä ei näe banneria uudelleen jos hän on sulkenut sen.
async function isOnboardingDismissed() {
  try {
    const meta = await dbGet(STORES.appMeta, "onboardingDismissed");
    return !!(meta && meta.value === true);
  } catch {
    return false;
  }
}

async function setOnboardingDismissed(dismissed) {
  try {
    await dbPut(STORES.appMeta, { key: "onboardingDismissed", value: !!dismissed, updatedAtISO: nowISO() });
    return true;
  } catch (e) {
    console.warn("[data] setOnboardingDismissed failed:", e);
    return false;
  }
}

// ── Export module ──
export {
  // Constants
  APP_VERSION,
  SCHEMA_VERSION,
  PROGRAM_BUILD_VERSION,
  rebuildStreetlifting16WMesocycle,
  TIMEZONE,
  STORES,
  CATEGORIES,
  PULL_VOLUME_CATEGORIES,
  INJURY_RISK_CATEGORIES,
  INJURY_RISK_LOADED_MOVEMENTS,
  MRV_SETS_PER_CATEGORY,
  CATEGORY_LABELS_SHORT,
  CATEGORY_COLORS,
  PRESET_MOVEMENTS,
  ACCESSORY_SLOT_CATALOG,
  MOVEMENT_DESCRIPTIONS,
  PRIMARY_VARIANTS,
  VARIANT_DAY_TYPE_MAP,
  ISOLATION_CATEGORIES,
  isIsolationMovement,
  BACKUP_REMINDER_DAYS,
  shouldShowBackupReminder,
  maintenanceStatus,
  // Utilities
  uid,
  nowISO,
  todayISO,
  parseNumericInput,
  // Guards
  GUARDS,
  validateVelocity,
  validateMvReps,
  validateLoad,
  validateReps,
  validateHRV,
  validateBodyweight,
  isVelocityTypo,
  // DB operations
  openDB,
  getDB,
  initDB,
  dbPut,
  dbGet,
  dbGetAll,
  dbGetByIndex,
  dbDelete,
  dbClear,
  dbPutBulk,
  seedPresets,
  // Movements
  getAllMovements,
  getMovementsByCategory,
  getPrimaryMovement,
  addMovement,
  updateMovement,
  deleteMovement,
  // Variants
  getVariantsForMovement,
  addVariant,
  getVariantByName,
  getAllVariants,
  ensureAllVariantsSeeded,
  // Sessions
  getAllSessions,
  getSession,
  saveSession,
  deleteSession,
  // Sets
  getSetsForSession,
  getSetsForMovement,
  getAllSets,
  saveSet,
  saveSets,
  deleteSet,
  // Pending workout (autosave, v4.28.1)
  savePendingWorkoutLocal,
  loadPendingWorkoutLocal,
  clearPendingWorkoutLocal,
  // Measurements
  getMeasurementsByType,
  getMeasurementsByDate,
  // v4.52.15 H-006b B4 (A4): kaikki mittaukset typesta riippumatta
  getAllMeasurements,
  saveMeasurement,
  getLatestBodyweight,
  saveBodyweightEntry,
  // PRs
  getAllPRs,
  savePR,
  deletePR,
  seedHistoricalPRsIfNeeded,
  // Mesocycles
  MESOCYCLE_TEMPLATES,
  getAllMesocycles,
  getActiveMesocycle,
  setActiveMesocycle,
  saveMesocycle,
  createDefaultMesocycle,
  createPeakingMesocycle,
  gammaPeakingStartDate, // H-019 B-C3: γ-aloituspäivä kisapäivästä (B8-UI + testit)
  createHypertrofiaMesocycle,
  createMaksimivoimaMesocycle,
  createEksenterinenMesocycle,
  createDUPMesocycle,
  createSiirtymaMesocycle,
  createPalautuminenMesocycle,
  createStreetlifting16WMesocycle,
  // v4.44.0 (Track B Vaihe 2C-β2): aito intensifikaatio + peaking-skeleton multi-blockille
  createIntensifikaatioMesocycle,
  createMultiBlockPeakingSkeleton,
  // v4.48.0 (Track B Vaihe 2D-β): klassiset voimanosto-ohjelmat
  createWendler531Mesocycle,
  createTopSetBackoffMesocycle,
  createMadcow5x5Mesocycle,
  amrapToE1RM,
  calculateE1RM_Epley,
  calculateE1RM_Brzycki,
  // v4.49.0 (Track B Vaihe 2D-γ): edistyneet metodologiat
  createWestsideConjugateMesocycle,
  createGZCLMesocycle,
  createSheikoDerivedMesocycle,
  createMinimalistRPMesocycle,
  createSmolovJrMesocycle,
  createCoanPhillipiMesocycle,
  // Custom program generator (v4.27)
  generateCustomMesocycle,
  // v4.42.0 (Track B Vaihe 2C-α): multi-blokki-mesocycle
  generateMultiBlockMesocycle,
  PRIMARY_CATEGORY_PROFILES,
  PRIMARY_SPECIFIC_PROFILES,
  GOAL_SKELETONS,
  // Baselines
  getBaseline,
  saveBaseline,
  // Recommendations
  saveRecommendation,
  // Decision Traces
  saveDecisionTrace,
  purgeOldDecisionTraces,
  maybeAutoPurgeTraces,
  DEFAULT_TRACE_RETENTION_DAYS,
  getTracesForRec,
  // Movement Progress
  getMovementProgress,
  getAllMovementProgress,
  saveMovementProgress,
  // Protocols
  getAllProtocols,
  saveProtocol,
  // App Meta & Settings
  getAppMeta,
  updateLastOpened,
  getSettings,
  saveSettings,
  // v4.51.0 (Track B 2D-δ-C): Adaptive multi-suggestion auto-learn
  updateAggressivenessLearned,
  resetAggressivenessLearned,
  resetLearnedAcrossSetFatigue,
  // v4.51.2: migration helper — lisää uudet preset-liikkeet olemassa oleviin DB:ihin
  ensureNewPresetMovements,
  // Backup / Restore
  exportFullBackup,
  importFullBackup,
  // Auto-backup (v4.26.0, päivitetty v4.34.6: daily + retention 14)
  getBackupStatus,
  getLatestBackupSnapshot,
  getAllBackupSnapshots,
  createBackupSnapshot,
  maybeCreateWeeklyBackup,
  restoreFromSnapshot,
  // v4.34.6: persistent storage + pre-rebuild snapshot + Monday-snap
  requestPersistentStorage,
  createPreRebuildSnapshot,
  snapToMostRecentMonday,
  // v4.34.7: orphan-mesocycle cleanup
  cleanupOrphanMesocycles,
  // CSV
  parseCSV,
  importHistoricalCSV,
  // Wizard-integraatio (v4.39.0, Track B Vaihe 2A)
  detectIsNewUser,
  detectWizardStatus,
  isOnboardingDismissed,
  setOnboardingDismissed,
};
