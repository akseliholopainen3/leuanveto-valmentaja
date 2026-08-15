// sw.js — Service Worker (offline-first, network-first navigation, cache-first assets)
// LeVe AI v4.49.3 — DEEP-2: rec.rtfModelStatus engine.js recommend()-output:iin
// + audit-dokumentaatio päivitetty 2D-δ pre-requisite -lukon avautumisesta.
//
// DEEP-2 (engine.js recommend()): Lasketaan computeRtfVelocityModel-pohjainen
// status primaryMovementId:lle. rec.rtfModelStatus = "reliable" | "preview" |
// "unreliable" | "insufficient" | "no-data" + rec.rtfModelStats { n, r2, slope,
// intercept }. RTF_MODEL_STATUS-trace dokumentoi tilan auditille ja UI:n
// "Miksi tämä paino?"-näkymälle (Q3).
//
// docs/ENGINE_BULLETPROOF_AUDIT.md: osio 1.2 + 13 + 11 + 3 (pre-requisite-checklist)
// päivitetty 2D-ε:n valmistumiseen — 4 systemic-buggia 0/8, 2D-δ TURVALLINEN.
//
// LeVe AI v4.49.2 — Track B Vaihe 2D-ε engine-korjaukset (QF-1/3/4/5 + MED-4 + Q1).
//
// QF-4 (engine.js:3105 DELOAD_OVERRIDE): label-pohjainen aktivointi pakottaa
// volume-day myös presetti-built-in deload-vk:lle (streetlifting_16w vk 4/8/12,
// default-meso vk 4). DELOAD_HEAVY_DAYTYPE 7/8 → 0/8.
//
// QF-5 (engine.js:2847 VL_CAP_RESOLVED): vlCapForContext-funktioon emit-callback,
// recommend()-funktioon kutsu joka emittoi VL_CAP_RESOLVED-tracen primary-slotin
// kontekstilla — audit-engine voi verifioida cap%, source ja targetRir.
//
// MED-4 (engine.js:2827 BLOCK_PHASE_TARGET_RIR.hypertrophy): lisätty hypertrophy: 2.5
// (MAV-mid-range, Pareja-Blanco 25-35% VL). Audit-engine deriveBlockPhase tunnistaa
// hypertrofia-meson erikseen. Elite-female K2 9 → 0.
//
// QF-1 (index.html:11816 K1 warmup-ramp): UI lukee primary-slot.warmupSets-skeletonia
// hardcoded [0.30,0.55,0.75,0.90] sijaan. Engine.js injektoi ENGINE_DEFAULT_WARMUP_RAMP
// (Helms 2017 40/55/70/85%) primary-slot:eihin joilla skeleton puuttuu. K1 6/8 → 0/8.
//
// QF-3 (index.html:6248 K3 vel-panel): "🎯 Zone-kynnys"-rivi POISTETTU vel-panelista.
// velocityStop näkyy edelleen exercise-heading-subBits:issä per-slot ("💎 Velocity-
// ankkuri · zone ≥ X.XX m/s"). Audit-engine K3-säännön kynnys tiukennettu 0.15 m/s.
// K3 1/8 → 0/8.
//
// Q1 (engine.js:2664 slot.targetVx + bias-detection): targetRep1VelocityRange ottaa
// slot.targetVx + biasDetected. Hybridi-päätös: RTF-reliable + ei-bias → slot luotettu,
// muuten min(slot, block-default). detectGrindyBias laskee VBT_E1RM_CROSSCHECK
// SIGNIFICANT ≥3 viim. 8 sessiossa. SLOT_TARGETVx_RESOLVED-trace dokumentoi päätöksen.
// K2 7/8 → 0/8.
//
// Audit-engine.mjs (tools/engine-pilot/lib/): K1 Variant B poistettu (UI korjattu),
// K2 käyttää tutkimusrange-tarkistusta + hand-tuned preset opt-out, K3 kynnys tiuken-
// nettu, deriveBlockPhase tunnistaa "Loading"/"Overreach" labelit + hypertrofia-meson.
//
// Akselin streetlifting_16w preset säilyy PRESET_PROGRESSION_BY_DESIGN (30) +
// uusi PRESET_TARGETVX_BY_DESIGN (7) — molemmat INFO-tasolla _programMeta.handTuned:in
// kautta.
//
// v4.38.9 — Accessory-liikkeiden kuormat näkyviin Dashboardin
// päivänäkymässä. Aiemmin vain pääliikkeen (⭐) kuorma näkyi; backoff +
// secondary + calibration näkyivät jo, mutta accessory-liikkeet (Chest-
// supported row, Incline curl jne.) jäivät ilman kuormaa.
//
// Käyttäjäpalaute 2026-05-11: "miksi muut kuin pääliikkeen painot eivät näy
// tässä näkymässä, onko tarkoituksellista?". Vastaus: oli osin tarkoitukselli-
// nen design-päätös (focus pääliikkeeseen), mutta käyttäjä halusi nähdä koko
// session yhdellä silmäyksellä → korjattu.
//
// KORJAUS:
// (refresh) state.movementProgressMap = Map(movementId → progress).
//   Ladataan getAllMovementProgress:n kautta refresh()-funktiossa kaikkien
//   muiden state-tietojen ohessa. Sync-lookup Dashboardin renderöinnissä
//   ilman async-kutsuja.
// (renderDashboard slotRowsHTML) Lisätty accessory-haara:
//   slot.role === "accessory" → state.movementProgressMap.get(movementId) →
//   suggestedLoadKg | lastLoadKg | 0 (BW) | null (tyhjä = uusi liike).
//   Sama logiikka kuin workout-flow:ssa (rivi ~10739) — varmistaa konsistenssin
//   Dashboardin ja itse treenissä näkyvien kuormien välillä.
//
// v4.38.8 (edellinen) — Dynaaminen "0,"-prefiksi velocity-syötössä (≥ 1.0 m/s tuki).
//
// Käyttäjäpalaute v4.38.7:n jälkeen (2026-05-11): "0,"-prefiksi-malli toimi
// nopeasti ≤ 0.99 m/s arvoille, mutta räjähtävän leuanvedon yli 1.0 m/s -
// arvot näyttivät harhaanjohtavasti "0,120" (vaikka tallennettu arvo oli oikein
// 1.20 m/s). UX-bugi joka olisi tullut vastaan vk:n 5+ speed-day-treeneissä.
//
// KORJAUS:
//   - CSS: .vel-rep-input-wrap.over-one ::before { content: ""; opacity: 0 }
//     → kun inputissa on 3+ merkkiä, "0,"-prefiksi piilotetaan ja padding-left
//     pienennetään 22px → 6px. Input näyttää raakaa arvoa "120" (= 1.20 m/s).
//   - Smooth transition 0.15s opacity + padding → visuaalisesti pehmeä siirtymä.
//   - JS-toggle updatePrefixToggle (attachVelocityRepLiveSummary):
//     wrap.classList.toggle("over-one", inp.value.length >= 3).
//   - Sama toggle updateRtfPrefix (openRtfTestModal).
//   - Ajetaan myös initial-tilassa (re-renderin jälkeen), ei pelkästään input-
//     eventeissä.
//   - Ohjeteksti rep-gridin yläpuolella päivitetty: "2 numeroa = '0,XX' · 3
//     numeroa = ≥ 1,0 m/s (esim. 120 = 1,20)".
//
// Visuaaliset cuet käyttäjälle:
//   - 1-2 numeroa: "0,"-prefiksi näkyy → arvo 0.10–0.99 m/s
//   - 3 numeroa: prefiksi katoaa, raaka luku bold-fontilla → arvo 1.00–2.99 m/s
//
// Akselin streetlifting-kisaliikkeet ovat kaikki < 1.0 m/s, mutta Räjähtävä
// leuanveto saavuttaa 0.85–1.05 m/s + tulevat speed-day-liikkeet voivat
// koskettaa 1.0 m/s rajan. Tämä fix kattaa kaikki rep-MV-tasot 0.10–2.99 m/s.
//
// v4.38.7 (edellinen) — Kaksi UI-bug-fixiä käyttäjäpalautteen pohjalta (2026-05-11):
//
// BUG #1: Yksinumero-syöte rep-grid:ssä rikkoi VL%-laskennan.
//   Käyttäjäpalaute: R1-kenttään kirjoitettu "7" (yksi numero) → app tulkitsi
//   0.07 m/s → live-summary näytti "hidastuminen -671.4 %".
//   Syy: input-parsing hyväksyi raw >= 1 → "7" → 7 → 7/100 = 0.07.
//   Yhdistettynä validiin viimeisen rep:n arvoon 54 (= 0.54 m/s) → laskelma
//   meni miinusprosenttiin.
//   KORJAUS: raw >= 10 (= 0.10 m/s) — yksinumeroinen syöte (1-9) filtteröityy
//   automaattisesti pois sekä live-summarystä, work-set-save:sta että RTF-modal-
//   save:sta. Käyttäjä näkee tyhjän rep-kentän kunnes toinen numero on syötetty.
//   Korjattu neljässä paikassa (kaikki rep-input-parsingit yhtenäisellä rajalla).
//
// BUG #2: "Velocity: [object Object]" -näyttö sessio-detail-näkymässä.
//   Käyttäjäpalaute: pistari-sessio näytti readiness-detail-rivillä
//   "Velocity: [object Object] · HRV: [object Object]".
//   Syy: index.html:7664-7666 renderöi r.channels.velocity / .hrv / .vx -kentät
//   suoraan template-stringissä, mutta ne ovat objekteja
//   ({ z, class, channel, baseline }), ei stringejä.
//   KORJAUS: formatChannel-helper joka poimii .class:n (GREEN/YELLOW/RED) +
//   liittää z-arvon sulkeissa jos saatavilla. Vx-kentän nimi korjattu:
//   r.channels.vx → r.channels.vara (Vara-objektin oikea avain).
//
// HUOM: olemassa olevat tallennetut mvReps-arrayt joissa on bug-arvoja (esim.
// 0.07) jäävät tietokantaan. Käyttäjä voi halutessaan poistaa kyseiset sarjat
// Historia-välilehdeltä. Live-laskennat eivät enää näytä virheellisiä
// arvoja uusille syötteille.
//
// v4.38.6 (edellinen) — KRIITTINEN BUG-FIX: ReferenceError currentSet bindWorkoutEvents:issa.
//
// Käyttäjäpalaute 2026-05-11: työsarja-näkymässä "Bindausvirhe — tarkista konsoli"
// laukesi heti kun käyttäjä yritti kirjata painoja. Sovellus oli käyttökelvoton.
// Syy: v4.38.3:n refaktorissa attachVelocityRepLiveSummary extractattiin
// nimettäväksi funktioksi, mutta bindWorkoutEvents-funktion ulompi scope
// jätettiin viittaamaan currentSet-muuttujaan (rivi 11260, targetVx-kentässä).
// currentSet on määriteltynä callback-handlerien SISÄLLÄ, ei bind-funktion
// ylimmässä scopessa. ReferenceError → bind() rejected → kaikki click-handlerit
// jäivät attachimatta → koko työsarja-näkymä jumissa.
//
// KORJAUS v4.38.6 (index.html bindWorkoutEvents):
//   const exerciseForCap = w.exercises[w.currentExerciseIdx];
//   const currentSetForCap = exerciseForCap?.sets?.[w.currentSetIdx];  ← LISÄTTY
//   ...
//   targetVx: currentSetForCap?.targetVx ?? null,  ← oli: currentSet?.targetVx
//
// Refaktoroinnin TESTAUSPUUTE — tämä on toinen kerta kun vastaava bugi ilmenee
// (vrt. v4.34.29: "TDZ-fix targetReps siirretty prev-ghost-koodin edelle").
// Oppi: ennen extracted-funktion käyttöönottoa, suorita silmämääräinen scope-
// tarkistus muuttujille jotka aiemmin olivat inline:n sisäisiä.
//
// v4.38.5 (edellinen) — Pikalisäpäivitys: kisaliikkeiden tunnistus toimii myös
// vanhoilla movements-tietokannoilla joissa isCompetitionLift-flag puuttuu.
//
// Käyttäjäpalaute v4.38.4:n migration jälkeen (2026-05-10): Asetukset →
// "Henkilökohtainen kalibrointi" -kortti näytti "Ei kisaliikkeitä rekisteröity."
// vaikka streetlifting_16w-mesosyklissä on kolme kisaliikettä (Lisäpainoleuanveto,
// Lisäpainodippi, Takakyykky). Syy: olemassa olevat movements:it on rekisteröity
// vanhalla version koodilla joka ei asettanut isCompetitionLift-flagia.
// Korjaus: name-pohjainen fallback isCompetitionLiftMovement-helperissä.
//
// MUUTOKSET v4.38.5:
// (engine.js) Uusi vakio COMPETITION_LIFT_NAMES_FALLBACK (Set) joka kattaa
//   streetlifting + voimanosto kisaliikkeet: Lisäpainoleuanveto, Lisäpainodippi,
//   Takakyykky, Muscle-up, Penkkipunnerrus, Maastaveto.
//   Uusi helper isCompetitionLiftMovement(movement) — palauttaa true jos
//   isCompetitionLift === true TAI nimi löytyy fallback-listasta.
// (index.html) Dashboard-banneri (Phase 3.6A) + Asetukset RTF-kalibrointi-kortti
//   (Phase 3B) käyttävät nyt isCompetitionLiftMovement-helperia (filter:n sijaan
//   m => m.isCompetitionLift). Ei muuta toiminnallisuutta uusille asennuksille,
//   mutta vanhat movements-tietokannat näyttävät kisaliikkeet oikein.
// (test-runner.js) testIsCompetitionLiftMovement: 12 assertiota — eksplisiittinen
//   flag voittaa, fallback nimillä, accessoryt + variantit eivät tunnisteta
//   kisaliikkeiksi.
//
// v4.38.4 (edellinen) — Phase 2.7 (kaksisuuntainen autoregulaatio) + Phase 3.6
// (RTF-testin auto-suggestio) + UI-stringien siivous.
//
// Käyttäjäpalaute v4.38.3 jälkeen: nopeus-vararajat-mallin yksisuuntaisuus
// (vain ylitreenamissuoja) ei riittänyt eliittitason vaatimuksiin. Akselin
// huoli alistimuloiduista sarjoista on perusteltu — Phase 2.7 lisää rep 1
// -tavoiterangen ja kaksisuuntaisen palautteen.
//
// Käytettävyysparannus: tutkijanimet (Pareja-Blanco / Behrmann / Jukic /
// Sánchez-Moreno) poistettu KÄYTTÄJÄLLE NÄKYVISTÄ stringeistä — säilyvät
// koodikommenteissa kehittäjälle. Tämä noudattaa peruslinjaa: sovellus
// puhuu suomeksi, akateemiset perustelut säilyvät dokumentaatiossa.
//
// MUUTOKSET v4.38.4:
// (Phase 2.7A) targetRep1VelocityRange(movementName, blockPhase, rtfModel)
//   — uusi engine-helper joka palauttaa rep 1:n hyväksyttävän nopeushaarukan
//   blokin tavoite-RIR:n ympärille (±1.5 RIR). Käyttää reliable-RTF-mallia
//   tai fallback MOVEMENT_MVT + DEFAULT_RTF_SLOPE (0.045 m/s/RIR).
//   BLOCK_PHASE_TARGET_RIR-mappi: foundation 4, strength 2.5, intensity 1.5,
//   peaking 1, speed-strength 4 (mid-arvot blokki-rangeista).
// (Phase 2.7B) Live-summary 4-tilainen: ALI (sininen, kuorma kevyt) /
//   OPTIMAALI (vihreä) / VAR (keltainen) / STOP (punainen). Värikoodit
//   CSS:ssä: vl-state-under, vl-state-optimal, vl-cap-warn, vl-cap-stop.
//   ALI-state-banner näyttää konkreetin tavoiterangen + nostosuosituksen.
// (Phase 2.7C) Anomaly recovery: jos viimeinen rep on edellistä nopeampi
//   (= "palautui"), käytä kahden viimeisen rep:n mediaania cap-vertailussa.
//   Estää väärän STOP-ehdotuksen yksittäisestä teknisestä lipsahduksesta.
// (Phase 2.7D) Post-set toastit + UNDER_STIMULATED-decisionTrace:
//   - 🔵 ali-stim: rep 1 yli rangen + VL alle cap × 0.5 → "kuorma alle
//     kapasiteettisi, harkitse nostoa"
//   - 🟢 optimaali: rep 1 rangessa + VL cap × 0.5–0.95 (ei traceen, mutta
//     yhteenvetotoast jos ei muita varoituksia)
//   - 🛑 STOP-ehdotus laajennettu: cap-source näkyy ("oma malli" vs
//     "blokki-oletus")
// (Phase 3.6A) Dashboard-bannerin RTF-kalibrointimuistutus puuttuville
//   kisaliikkeille. Klikkaus → Asetukset-välilehti. Näkyy vain kun
//   velocity-mittaus on käytössä.
// (Phase 3.6B) Treenin tallennushetkellä AMRAP-sarjojen tunnistus:
//   primary + actualVx 0 + reps ≥ targetReps + 2 + mvReps[].length ≥ 4.
//   Per-kandidaatti modal: "Tallenna kalibrointitestinä?" → luo rinnakkain
//   rtf_calibration-session + rtf_test-set. Akselin yleisin käyttötapa:
//   tee viimeinen sarja failureen → kalibrointimalli rakentuu ilman
//   erillistä testiä.
// (Phase 3.6C) Asetukset RTF-kortti merkityksellisempi: 🔴 "Testi puuttuu"
//   -indikaattori + punainen vasen reuna kun status === "no-data". V@RIR
//   -kentät käyttäjäystävällisesti ("Failurella" / "1 varaa" / "3 varaa" /
//   "5 varaa" sen sijaan että "RIR 0" / "RIR 1" / jne.).
// (UI-siivous) Pareja-Blanco / Behrmann / Jukic / Sánchez-Moreno -nimet
//   poistettu kaikista käyttäjälle näkyvistä teksteistä:
//   - STOP-suggestion: "Lopeta sarja tähän — lisätoistot eivät enää tuota
//     voiman lisäystä, vain ylimääräistä väsymystä"
//   - VL-cap settings: "Sarjan lopetusraja (%) per blokki" — kuvaus selkeää
//     suomea ilman tutkijanimi-viittauksia
//   - ENODE_LOW_VELOCITY_CAVEAT: "Enode-mittaus tällä hidasalueella…"
//   - Stale profile reason: "Malli vanhentunut: N päivää ilman uutta dataa"
//   - RTF-modaali: "Kalibrointitesti" tutkijanimien sijaan
//   - Vx-konflikti-toast: "Raportoit varaa X mutta nopeusmittaus viittaa Y"
//   - Tutkijaviittaukset säilyvät koodikommenteissa (kehittäjän referenssi)
// (Phase 2.7-test) testTargetRep1VelocityRange — strength/foundation/peaking
//   ranges, speed-strength etusija liikenimellä, RTF-mallin käyttö, preview-
//   fallback, tuntematon liike → DEFAULT_MVT. ~12 uutta assertiota.
//
// v4.38.3 (edellinen) — Velocity DR Phase 3.5 + 4 (yksilöllinen cap RTF-mallista
// + Vx-velocity-konfliktin tunnistus).
//
// Phase 3.5 sulkee silmukan datan ja autoregulaation välillä: kun atletti on
// kerännyt yhden RTF-testin per kisaliike (Phase 3) ja malli on r² ≥ 0.85,
// VL-cap muunnetaan automaattisesti yksilölliseksi populaatio-default-arvon
// sijaan. Phase 4 tunnistaa Vx-velocity-konfliktit (grindaus-bias) ja kirjaa
// päätösketjuun, mutta EI ylioppikkaa atletin raportoimaa Vx:ää automaattisesti
// (DR-suositus: käyttäjä päättää).
//
// MUUTOKSET v4.38.3:
// (3.5A) BLOCK_PHASE_TARGET_RIR-mappi engine.js:ssä — mid-arvot DR-rangeista:
//        Foundation 4 (RIR 4-5), Strength 2.5 (RIR 2-3), Intensity 1.5 (RIR 1-2),
//        Peaking 1 (RIR 0-1), Speed-strength 4 (RIR 4-5).
// (3.5A) vlCapForContext laajennettu: rtfModel + rep1Velocity ctx-paramit.
//        Kun rtfModel.status === "reliable" + rep1Velocity > 0:
//          targetRir = BLOCK_PHASE_TARGET_RIR[effectivePhase]
//          velocityAtTarget = intercept + slope × targetRir
//          cap_individual = (rep1Velocity - velocityAtTarget) / rep1Velocity * 100
//        Sanity-clamp [3, 60] — ulkopuoliset arvot → fallback default.
//        Source: "rtf-individual" (Phase 3.5) vs "block-phase" / "fallback".
// (3.5B) Live-summary rep-gridissä laskee cap-arvon dynaamisesti rep1V:n
//        muuttuessa. UI-badge "🎯 RTF-yksilöllinen (RIR-tav. X, r² Y%)" kun
//        source === "rtf-individual". STOP-ehdotus näyttää RTF-tagin selkeästi.
// (3.5C) Save-layer-trace VL_CAP_TRIGGERED sisältää nyt rtfTargetRir + rtfR2 +
//        velocityAtTargetRir-kentät, jotta blokki-vaihtoehdot ja kalibraation
//        luotettavuus voidaan jälkikäteen analysoida.
// (4A)   predictVxFromVelocity(mvReps, rtfModel, reportedVx) — engine.js:n uusi
//        helperi joka invertoi RTF-mallin: predictedRir = (lastMv - intercept) /
//        slope. Clamp [0, 5] (Vx-skaala). Konflikti = abs(reportedVx -
//        predictedVx) ≥ VX_CONFLICT_DELTA (1.5). Direction:
//        "athlete-overestimates-rir" (grindaus-bias) tai
//        "athlete-underestimates-rir" (lopetti aikaisin).
// (4B)   Save-layer: VX_VELOCITY_CONFLICT-trace kun mvReps + reliable RTF-malli
//        + delta ≥ 1.5. Tallennus saveSets:in jälkeen, toast:
//        "🎯 N sarjassa Vx-poikkeama ≥ 1.5 (RTF-malli): X× yliarvio varaa
//        (grindaus-bias). Tarkista kalibraatio kun aikaa." HUOM: actualVx EI
//        ylioppiku automaattisesti — käyttäjä päättää (DR-suositus).
// (3.5D + 4C) Testit: testVlCapWithRtfModel + testVxVelocityConflict —
//        BLOCK_PHASE_TARGET_RIR-arvot, yksilöllinen cap eri blokkivaiheissa
//        (foundation/strength/intensity/peaking/speed-strength), preview-fallback,
//        unreliable RTF, sanity-range [3, 60], grindaus-bias-skenaario,
//        aligned-skenaario, early-stop-skenaario, pre-condition tarkistukset.
//        ~25 uutta assertiota.
//
// Phase 4.5 (myöhemmin): auto-konservatiivinen min(reportedVx, predictedVx) -
// ratkaisu kun konflikti on ylittynyt N peräkkäisessä sessiossa. Tällä hetkellä
// vain havaintoraportointi.
//
// Phase 1+2+3+3.5+4 yhteenveto: VBT-syvätutkimuksen Pareja-Blanco-tradition
// VL-cap, Jukic 2024 yksilöllinen RIR-velocity-malli, ja konfliktin tunnistus
// kaikki integroitu. DR-synteesin "action list":sta kuitatut: 8/10
// koodimuutosta. Avoinna: Phase 2.5 (between-set load-decrement +
// recommend()-syöte), Phase 5 (2-piste mini-L-V-confirmation-sessio blokin
// alussa), Phase 6 (vk 4/8/12 deload-kalibroinnin vaihto AMRAP @92 % →
// 2-piste mini-L-V).
//
// v4.38.2 (edellinen) — Velocity DR Phase 3 (RTF-testi yksilölliselle RIR-velocity-mallille).
//
// VBT-syvätutkimuksen synteesi (Claude DR + ChatGPT DR + verifikaatio 2026-05-09)
// → Phase 3 toteuttaa Jukic et al. 2024 (Scand J Med Sci Sports) yksilöllisen
// RIR-velocity-mallin: yksi reps-to-failure -testi per kisaliike riittää
// r² ≥ 0.85 -tarkkuuteen vs populaatio-mappauksen 0.45–0.49.
//
// MUUTOKSET v4.38.2:
// (3A) computeRtfVelocityModel(allSets, movementId) — engine.js:n uusi funktio.
//      Suodattaa rtf_test-roolin setit, kerää (RIR, MV) -pisteet rep-by-rep
//      mvReps[]:istä (RIR_i = M-1-i), lineaarinen regressio velocity = intercept
//      + slope × RIR. Palauttaa { status, n, slope, intercept, r2, velocityAtRir,
//      rtfMvtIndividual, sessionsCount, loadsUsed }.
//      Status: reliable (r²≥0.85, slope>0) / preview (r²≥0.70) / unreliable.
//      vlCapFromRtfModel(rtfModel, targetRir, rep1Velocity) — Phase 3.5 helper
//      yksilölliselle cap-arvolle (käyttöön myöhemmin).
//      Vakiot: RTF_MIN_REPS_PER_SET=4, RTF_MIN_SESSIONS_FOR_MODEL=1 (Jukic 2024),
//      RTF_R2_THRESHOLD_RELIABLE=0.85, RTF_R2_THRESHOLD_PREVIEW=0.70.
// (3B) Asetukset → "🎯 RTF-kalibrointi (yksilöllinen RIR-velocity)" -kortti per
//      kisaliike (isCompetitionLift): näkyvät tila-badge (no-data / preview /
//      reliable + r²), datapisteet (n / sessiot / kuormat), V@RIR 0/1/3/5,
//      slope, intercept (V@failure = yksilöllinen MVT). Vertailu populaatio-MVT:hen
//      (esim. Lisäpainoleuanveto 0.23 m/s Sánchez-Moreno 2017).
// (3C) openRtfTestModal(movementId, movementName) — bottom-sheet modaali RTF-testin
//      tallennukseen. Pyytää: päivämäärä, kuorma (suositus ~75% e1RM auto-täytetty),
//      mvReps[] rep-grid AMRAP-tyylisesti ("0,"-prefiksi-malli + "+ rep" / "− rep"),
//      todelliset toistot failureen (auto = mvReps.length). Live-summary mean/peak/VL%.
// (3D) Save-layer luo:
//      - dummy session: { sessionType: "rtf_calibration", mesocycleId nykyinen }
//      - set: { setRole: "rtf_test", externalLoadKg, reps=totalReps, targetVx=0,
//        actualVx=0 (failure), velocityRep1=mvReps[0], velocityMean=mean, mvReps,
//        deviceMeta: { source: "rtf-test-modal" }, dateISO }
//      Re-render Asetukset päivittää RTF-kortin tilan välittömästi.
// (3E) Testit: testRtfVelocityModel — no-data, lineaarinen 8-rep AMRAP (status
//      reliable + slope > 0 + r² ≥ 0.85), liian vähän dataa, useat sessiot
//      yhdistettynä, väärä movementId / setRole, vlCapFromRtfModel-helper RIR 0
//      ja RIR 1 -tasoille. ~16 uutta assertiota.
//
// Phase 3.5 (myöhemmin): vlCapForContext laajennetaan käyttämään yksilöllistä
// cap-arvoa kun rtfModel.status === "reliable" liikkeelle. Blokki-spesifi
// targetRir (peaking RIR 1, strength RIR 2-3, foundation RIR 4-5) → V@target
// → VL_cap%. Tämä korvaa populaatio-pohjaisen VL_CAP_PER_BLOCK-default-arvon.
//
// v4.38.1 (edellinen) — Velocity DR Phase 2 (VL-cap within-set stop -autoregulaatio).
//
// VBT-syvätutkimuksen synteesi (Claude DR + ChatGPT DR + verifikaatio 2026-05-09)
// → Phase 2 nostaa Pareja-Blanco-tradition VL-cap-arvot ENSISIJAISEEN
// päätösketjun pisteeseen (within-set stop) eikä pelkkänä UI-warning.
//
// MUUTOKSET v4.38.1:
// (2A) VL_CAP_PER_BLOCK-vakio engine.js:ssä — Foundation 30 / Strength 17.5 /
//      Intensity 12.5 / Peaking 7.5 / Speed-strength 12.5 (range-keskellä).
//      Tutkimuspohja: Pareja-Blanco 2017/2020/2023 + Galiano 2022 + Held 2022 +
//      Lyu 2026 + Sánchez-Moreno 2020 + Jukic 2023.
// (2A) vlCapForContext({blockPhase, exerciseName, dayType, targetVx, settings})
//      → resolvoi cap (settings-override → default), phase-tag, source.
//      Speed-strength etusija liikenimen (Räjähtävä leuanveto/leuka) tai
//      speed-day + Vx≥4 -kombo:n kautta.
// (2B) Settings UI: viisi cap-input-kenttää per blokki Asetukset → Kynnysarvot.
//      data.js settings-defaults: vlCapFoundation/Strength/Intensity/Peaking/
//      SpeedStrength. vlStopPercent jää legacy-fallbackiksi.
// (2C) Live-summary rep-gridissä käyttää nyt blokki-spesifiä cap-arvoa.
//      Visualisointi 3-portaisesti: vl < cap×0.75 = OK,
//      cap×0.75 ≤ vl < cap = WARN (keltainen), vl ≥ cap = STOP (punainen
//      summary, punainen rep-input drop-kohdassa, "🛑 STOP-ehdotus" -panel).
// (2D) saveDecisionTrace kun setti tallennetaan VL > cap -tilanteessa.
//      ruleId="VL_CAP_TRIGGERED", before/after-rakenne kuten muut traces:
//      before { plannedReps, vlCap, blockPhase, capSource },
//      after  { actualReps, actualVl, droppedAtRep, rep1Velocity, lastRepVelocity }.
//      Tallennus saveSets:in JÄLKEEN consistency:n vuoksi (jos sets fail → ei traces).
//      Toast: "VL-cap ylitti N sarjassa — kirjattu päätösketjuun" (warn).
// (2E) Testit: testVlCapPerBlock — defaults, blokki-vaihe, speed-strength
//      etusija, settings-override, fallback. 11 uutta testiä.
//
// Phase 2.5 (myöhemmin): VL_CAP_TRIGGERED-tracejen analyysi recommend():issa →
// between-set load-decrement (jos sarjan 1 within-set-VL ylittää cap-arvon ennen
// 50% suunnitelluista repeistä, pudota seuraavan sarjan kuorma 2.5–5 %).
// Coaching-konsensus, ei suoraa RCT-evidenssiä — odottaa pilotti-dataa.
//
// v4.38.0 (edellinen) — Velocity DR Phase 1 (mvReps[] + UI rep-grid + stale profile).
//
// VBT-syvätutkimuksen synteesi (Claude DR + ChatGPT DR + verifikaatio 2026-05-09)
// → 4 sub-vaiheen velocity-arkkitehtuurin nostokertoimet:
// (1A) MOVEMENT_MVT-aliakset Räjähtäville pull-up-varianteille (alias 0.23 =
//      Lisäpainoleuanveto, perustelu: V1RM = liikemekaniikka, ei sub-max intent).
// (1A) ENODE_LOW_VELOCITY_CAVEAT — Behrmann 2025 -laitevarauksen integraatio
//      (MAPE 4–42 % < 0.5 m/s alueella) sekä VBT-promotion-tilan deviceCaveat-
//      kentässä että UI-tasolla rep-gridin alla.
// (1B) SCHEMA_VERSION 4 → 5: set-objektille uusi optional kenttä mvReps[]:
//      number[] | null per-rep MPV-tallennukseen. Migration ei vaadi datakonver-
//      siota — vanhat setit jäävät undefined-tilaan, lukulogiikka käyttää ?? null.
//      Pre-migration backup ajetaan automaattisesti createPreMigrationBackupIfNeeded:ssa.
// (1B) validateMvReps + GUARD-laajennus.
// (1C) Working-set velocity entry UI: rep-grid (auto-fit minmax 72px), "0,"-prefiksi-
//      malli (käyttäjä syöttää 2 numeroa "53" → 0.53 m/s), live-summary mean/peak/VL%
//      (warn jos > vlStopPercent), gating laajennettu primary/backoff/top/calibration-
//      sarjoille (ei enää pelkkä allowVelocityInput-flag).
// (1C) Save-layer (index.html:11762+): mvReps[] suodatetaan validiksi arrayksi,
//      velocityMean/Peak/Rep1/LossPercent johdetaan automaattisesti arrayn pohjalta.
// (1D) Stale profile -aikatriggeri computeVBTPromotionStatus:issa:
//      14 pv ilman uutta ankkuria → freshness="stale" (warning, regressio toimii)
//      21 pv ilman uutta ankkuria → freshness="needs-recalibration" (blokkaa
//      promotion, suosittelee 2-piste mini-L-V-vahvistustestiä, ~45 % + ~85 % e1RM).
//      Tutkimuspohja: Häkkinen 2000 / Hortobágyi 1993 / Hwang 2017 strength-decay
//      proxy:t — spesifit slope/intercept-decay-arvot ovat tutkimusaukko.
//
// Foundation Phase 2:lle (VL-cap within-set stop -autoregulaatio recommend()-funktioon),
// Phase 3:lle (RTF-testi-sessiotyyppi Jukic 2024) ja Phase 4:lle (min(Vx_reported,
// Vx_velocity) -konfliktiratkaisu) on nyt rakennettu — schema kestää, UI kerää,
// laitevarauksen disclaimer näkyy oikeissa paikoissa.
//
// v4.37.0 (edellinen) — Sykli-välilehden redesign (Claude Design "Cycle View v3").
//
// Atletin pyyntö 2026-05-08: parempi yleisnäkymä jossa atletti näkee yhdellä
// silmäyksellä missä blokin osassa on, kuinka edistynyt suhteessa suunnitelmaan,
// ja milloin seuraava kriittinen vaihe (deload + AI-tuning vk 4/8/12).
//
// MUUTOKSET v4.37.0:
// - CSS: uudet luokat .cv-hero, .cv-tl-wrap, .cv-tl-wk, .cv-week-card, .cv-day,
//   .cv-crit, .cv-nw, .cv-legend (säilyttää aiemmat .card-luokat)
// - Block colors --b-found / --b-strength / --b-intens / --b-peak / --b-deload
//   lisätty :root-tasolle
// - renderMesocycle() yläosa korvattu Cycle View Variant -komponenteilla:
//   1. Block-hero-kortti (eyebrow + name + sub + progress-meter + foot)
//   2. 16 vk timeline (horisontaalinen scroll, värikoodatut pylväät)
//   3. Tämä viikko -kortti (status-bullet + päivänpäivä + fokus + load)
//   4. Ensi viikko -preview (delta-pilli + day-pillit)
//   5. Kriittinen ikkuna -banneri kun deload < 14 pv
// - Säilyttää: ohjelman idea, autoreg, volyymi, ohjelma-overview details-elementit
// - Ei AI Block Tuning -modaalia tässä versiossa (handoff Tier 2 tulee myöhemmin)
//
// VERIFIOINTI:
// - 304/304 selaintestiä OK
// - UI-rendering ei kaadu (Claude Preview testattu)
// - Timeline + komponentit renderöityvät oikein
//
// v4.36.0 — Lämmittelynäkymä-redesign (Claude Design "Variant A").
//
// Atletin palaute 2026-05-08: nykyinen yksirivinen warmup-näkymä on epäselkkeä
// (anatomia, sitaatit, version-bumput sekoittuneet yhdeksi tekstiksi). Claude
// Designin tuotos: kompakti rivilistaus 5 rivillä + reveal-nappi loppuihin +
// tap-rivi avaa inline detail-paneelin (uusi schema: steps + cue + meta;
// legacy: full desc).
//
// MUUTOKSET v4.36.0:
// - CSS: uudet luokat .wu-block, .wu-head, .wu-row, .wu-more, .wu-detail
//   (säilyttää legacy .warmup-line:n koskemattomana)
// - Render: warmupBlockHTML korvaa warmupLineHTML:n koti-näkymässä
// - Helper-funktiot _wuParseDose/_wuParseWhy parsivat dose+why legacy desc:istä
//   jos uusi schema (item.dose, item.why) puuttuu → non-breaking fallback
// - Event delegation: tap-rivi → inline expand, "Näytä loput N" → reveal kaikki
// - Migration: vaiheittainen — data.js warmup-blokit voivat lisätä uudet kentät
//   (dose, why, steps, cue, citation, changelog) yksitellen ilman flag:ia
//
// VERIFIOINTI:
// - 304/304 selaintestiä OK (engine ennallaan)
// - UI-rendering ei kaadu kun warmup-data puuttuu
//
// v4.35.3 — KOKO sovelluksen e1RM-yhtenäistäminen + yksikkö-bug-korjaus.
// Atletin palaute v4.35.2:n jälkeen 2026-05-08: "et näytä ratkaisevan selkeitä
// ongelmia" + Lisäpainodippi näkyi 100.9 ↓-92.4 kg (= -92 kg pudotus).
//
// JUURISYYT v4.35.3:ssa korjattu:
// 1) Yksikkö-bug: computeMovementE1RMBest palautti aina ext-arvon, mutta
//    legacy computeMovementE1RM palauttaa system-arvon system-load-liikkeille.
//    Lisäpainodippi (system-load): UI näytti ext-luvun system-otsikon alla
//    → näytti -92 kg pudotuksena. KORJATTU: palautusarvon yksikkö matchaa
//    legacy-funktioon (barbell → ext, system-load → system).
// 2) UI-näkymät joita v4.35.1/.2 ei korjannut:
//    - ENNUSTE KISAAN -näkymä (computeStreetliftingOpenerStrategy syöte)
//    - Liikepankki-näkymä (movementE1RMs-kartta)
//    - KUORMITETUT-näkymä (currentE1RM)
//    - showMovementDetail-modaali (currentE1RM)
//    Kaikki kutsuvat nyt computeMovementE1RMBest:iä → yhtenäinen luku
//    KAIKKIALLA sovelluksessa.
//
// Yhteensä 6 erillistä UI-kohtaa korjattu (3 v4.35.1/.2:ssa + 4 v4.35.3:ssa,
// josta 1 päällekkäinen, joten +4 uutta v4.35.3:ssa).
//
// v4.35.2 — Edistyminen-välilehden e1RM yhtenäistäminen JATKUU.
// v4.35.1 korjasi vain renderPerLiftAutoregStatus-funktion (Koti-näkymän kortin),
// MUTTA käyttäjän näkemä Edistyminen-välilehti käyttää eri funktioita:
// renderProgress() (kisaliike-kortit) + renderTrends() (per-liike trendit).
// Atletin palaute 2026-05-08 v4.35.1:n jälkeen: "ei mikään muuttunut" — koska
// tämä funktio ei vaikuttanut hänen näkemäänsä lukemaan.
// v4.35.2 korjaa kaikki kolme funktiota:
//   - renderPerLiftAutoregStatus (v4.35.1) — Koti-näkymän kortit
//   - renderProgress (v4.35.2) — Edistyminen-välilehden kisaliike-kortit (current-arvo)
//   - renderTrends (v4.35.2) — Trendit-välilehden per-liike-kortit
// Kaikki kolme käyttävät nyt computeMovementE1RMBest:iä → yhtenäinen luku.
//
// v4.35.1 — Edistyminen-välilehden e1RM yhtenäistetty recommend()-funktion
// kanssa. Atletin palaute 2026-05-08: e1RM näytti 170.8 (median) Edistyminen-
// näkymässä mutta 184.9 (PLAN_BASED) recommend-tracessa → epäjohdonmukainen.
// Korjaus: uusi computeMovementE1RMBest-funktio joka käyttää SAMAA priorisointia
// kuin recommend() (cal → plan-based → median). Edistyminen-välilehti kutsuu nyt
// tätä, joten kaikkialla näkyy sama luku. Ei muuta progressio-target-laskentaa.
//
// v4.35.0 — ELIITTITASON PROGRESSIO-MALLI (Helms 2018, Cumming 2024,
// Issurin 2010): refaktoroitu rikkinäinen cap-only-pohja tutkimuspohjaiseksi.
//
// Yhdenseuraussessio (2026-05-08): atletin palaute "kymmeniä auditointeja ja silti
// ohjelma on lapsen kengissä — miksi?". Vastaus: pohja-algoritmi (loadPct ×
// baseline + adhoc-capit) ei ollut tutkimukseen perustuva. Refaktorointi:
//   • PROGRESSION_CONFIG-vakio (engine.js:52-110) — magic numbers yhteen paikkaan
//   • computeProgressionTarget-funktio (engine.js:1847-2010) — yksi keskitetty
//     päätös progressiolle: regain-multiplier (Cumming 2024 retraining ~33-50%
//     nopeampi), Helms 2018 Vx-mismatch-säätö (1Vx = 2% session-välillä),
//     viikoittainen baseline +2.5%/vk (Helms 2018 + RP), V0-grindi-suoja,
//     yliajot cal/deload/speed-päivissä
//   • Integroitu primary-haaraan + cross-reference-haaraan (sama logiikka molemmille)
//   • 12 yksikkötestiä eristyksessä (E1-E12, regain FAR/NEAR, PR-vaihe, V0-fail,
//     deload, speed, no-history, no-plan, Helms Vx-adj, PLAN_BASED-harmonisointi,
//     multi-week, hard-cap)
//   • 304 testiä OK, ei regressiota nykyisiin 281+ testiin
//
// ATLETIN ESIMERKKI (vk 1 LA Takakyykky 120 kg V4 helposti, cfg 185):
//   ratio 0.65 < 0.85 → REGAIN_FAR (×2.0). weekly = 0.025 × 2.0 × 1 = 5%.
//   Autoreg = 120 × 1.05 = 126 kg V4. Plan-floor 102. Hard-cap 138. Final 126.
//   → osuu atletin odotukseen 126-132 kg (eliittitasoinen progressio regainissa).
//
// Lisäksi korjattu sw.js:n APP_VERSION-uudelleenmääritysbugi: aiemmissa versioissa
// jokainen const APP_VERSION = "..." -bumppi jätti vanhat määritykset aktiivisina
// → SyntaxError SW:n parserissa. Nyt vain yksi aktiivinen, vanhat historiana
// kommenteissa.
//
// v4.34.50 — PROGRESSION_FLOOR_CAP_CROSSREF (regression-suoja
// secondary-sloteille, atletin 2. palaute 2026-05-08):
//
// Atletti suoraan: "Jos olen tehnyt secondary kyykyn 120 kg viime lauantaina,
// et voi laskea 102 kg seuraavalle. Jokin on pahasti pielessä."
//
// JUURISYY: Primary-slotille on ollut PROGRESSION_FLOOR_CAP (engine.js:3131)
// joka estää kuorman laskun viime sessiosta — mutta cross-reference-haara
// (engine.js:3300+, secondary-slotit kuten LA Takakyykky streetlifting_16w:ssä)
// ei tunnistanut tätä suojaa. v4.34.49:n cfg-floor parani tilannetta vain
// osittain (94 → 102 kg), mutta atletin todellinen suoritus 120 kg jäi alaksi.
//
// KORJAUS engine.js:3370 (kun PROGRESSION_RATE_LIMIT_CROSSREF on käsitelty):
// Lisätty PROGRESSION_FLOOR_CAP_CROSSREF samoilla säännöillä kuin primary:
//   - useLastAnchor (uusi Vx >= viim. Vx)
//   - !lastSession.isCalibration
//   - weekDef.deltaPctBase >= 0
//   - dayPlan.dayType !== "speed"
// Floor: lastSession.medianLoad SUORAAN (ei -2.5%). Atletti pystyi tähän
// kuormaan viim. session targetin Vx:llä → seuraavan sessio sama-Vx target
// ei saa olla pienempi.
//
// VAIKUTUS ATLETIN VK 2 LA -SESSIOON
// - Ennen v4.34.49: 94 kg (= 0.55 × 170 historia)
// - v4.34.49 (cfg-floor): 102 kg (= 0.55 × 185 cfg)
// - v4.34.50 (floor-cap): 120 kg (= viime suorituksen taso)
// Atletti voi tehdä 130 V4 → engine oppii ja vk 3 LA target on >= 130 kg.

// v4.46.0: Track B Vaihe 2C-δ — Isometric-pitojen e1RM-mallinnus.
// Wizard q26 isometric_hold-PR:t (Front Lever, Planche, HSPU, One-arm pull-up)
// muunnetaan e1RM-kg-vastineeksi heuristic-kerroin per liike-taso (Steven Low
// OG2 + Sommer SSC + Heavyweight Cali/Frinks n=322, kaikki EI peer-reviewed).
// Hold-keston vaikutus: <5s 0.70×, 5-15s 1.00×, 15-30s 1.15×, >30s 1.30×.
// Pidot migroidaan movementProgress:iin e1RM-baselineina source="wizard-2c-delta-isometric"
// EMPIRINEN HEURISTIIKKA -merkinnällä. Yksilövaihtelu ±15-25 %.
// Mapper 2C-gamma-v1.0 → 2C-delta-v1.0.
//
// v4.45.0: Track B Vaihe 2C-γ — Tier-pohjainen kg/vk-progressiokerroin.
// Pää-app:n weekDef.deltaPctBase säädetään q08_selfLevel:n (+ q02_sex)
// mukaan: beginner 1.0×, intermediate 0.40×, advanced 0.15×, elite 0.05×;
// naisille × 0.55. Vk 1 akklimatisaatio + vk 4 deload säilyvät.
// Lähde: Latella 2020 powerlifting Australia n=1897 + Nuckols Stronger by
// Science -kyselydata, EMPIRINEN (yksilövaihtelu ±50-100 %). Williams 2017
// PDF: untrained > trained periodisaatiossa (tier-kertoimet noudattavat).
// Mapper 2C-beta2-v1.0 → 2C-gamma-v1.0. PROGRAM_BUILD_VERSION säilyy 4.38.9.
//
// v4.44.0: Track B Vaihe 2C-β2 — Korjauspaketti pilottiohjelman puutteille.
// 5 isoa korjausta:
//   1. createIntensifikaatioMesocycle (data.js) - aito Issurin-intensifikaatio
//      matala volyymi, korkea intensiteetti (V1-V2, primary 1-3 reps),
//      kapea accessory-työ. Korvaa "yhdistelma":n joka tuotti ylimäärä-accessoryja.
//   2. createMultiBlockPeakingSkeleton (data.js) - 2 vk taper+kisaviikko,
//      EI strength-toistoja peaking-viikoille. Korvaa "maksimivoima":n
//      jonka pilottiohjelmassa peaking vk 13-14 oli identinen strength vk 5:n kanssa.
//   3. applySplitFilter (mapper) - q21="upper_lower"/"ppl"/"broscience" säätää
//      accessory:t per päivä primary:n kategorian mukaan (ei chest press
//      kyykky-päivänä).
//   4. applyVolumeCap (mapper) - rajaa accessory-sarjat per kategoria per
//      viikko blokin tyypin mukaan (Helms/Schoenfeld MV-perusta).
//   5. UI-toisto-bugi (index.html) - "PÄÄLIIKKEET + BACKOFF" -osio poistettu
//      details-näkymästä, summary näyttää primary+backoff suoraan
//      lisätiedoineen (loadInfo). Sama tieto ei enää toistu kortissa.
// Mapper 2C-beta-v1.0 → 2C-beta2-v1.0.
//
// v4.43.0: Track B Vaihe 2C-β — Session-fokus-labelit per päivä.
// Wizard-generoidun ohjelman päiväkortit Dashboardilla saavat fokus-pohjaisen
// labelin ("Pullup-fokus (volyymi)") yleisten "Perusvoima A" -etikettien
// sijaan. Pure UI -muutos — dayType ja treenin sisältö säilyvät. Mapper
// 2C-alpha-v1.0 → 2C-beta-v1.0.
//
// v4.49.0: Track B Vaihe 2D-γ — 6 edistynyttä metodologiaa (Westside/GZCL/Sheiko/RP/SmolovJr/CoanPhillipi).
//          PROGRAM_STYLES 11 → 17 tyyliä. Liikepankki +10 (Floor/Pin/JM press, Rack pull, GHR, Hyperextensio,
//          Dumbbell fly, Power shrug, Wide-grip + Long pause bench).
//          Tutkimusdokumentit: VAIHE_2D_GAMMA_OSA1 (Westside/GZCL/Sheiko) + OSA2 (RP/Smolov/Coan-Phillipi).
//          Kriittiset korjaukset: Coan-Phillipi 10+1 vk (EI 12 vk), Mark Phillipi (EI Karl), Effective reps =
//          Beardsley (EI Israetel), Smolov Intro -luvut korjattu Tsatsoulinen kanoniin.
// v4.48.0: Track B Vaihe 2D-β — klassiset voimanosto-ohjelmat (Wendler/TSB/Madcow).
//          PROGRAM_STYLES 8 → 11 tyyliä (single-wendler531 + single-top-set-backoff + single-madcow-5x5).
//          AMRAP-tuki (Epley + Brzycki, Reynolds 2006 >10 reps -varoitus).
//          Liikepankki: Yhden jalan jalkaprässi.
// v4.47.0: Track B Vaihe 2D-α — adaptive multi-suggestion (PROGRAM_STYLES + pickProgramStyle).
//          Wizard 3.3 pysyy ennallaan (Tapa 3); top-3 style-kandidaatit näytetään
//          preview-modaalissa, käyttäjä voi vaihtaa stylen vapaasti.
//          GOAL_SKELETONS laajennettu 4 → 7 tyyliin (eksentrinen / siirtyma / palautuminen).
// v4.42.0: Track B Vaihe 2C-α — multi-blokki-mesocycle (Issurin block-malli).
// v4.41.0: Track B Vaihe 2B-γ — q26-PR-migraatio + q30-energiabudjetti.
// v4.40.0: Track B Vaihe 2B-β — wizard-pohjaisen ohjelman generointi.
// v4.39.0: Track B Vaihe 2A — wizard-integraatio pää-sovellukseen.
// v4.50.0: Track B Vaihe 2D-δ-B — engine-puoli adaptive multi-suggestion -arkkitehtuurille.
//          generateSuggestions() tuottaa SAFE/TARGET/AGGRESSIVE-tier-variantit
//          aritmeettisesti TARGET-laskennasta. Backward compat: rec.targetExternalLoad /
//          targetVx / deltaPct = TARGET-tier:n arvot. rec.suggestions[], defaultSuggestionId,
//          suggestionContext lisätty. SUGGESTIONS_GENERATED + SUGGESTION_SUPPRESSED tracet.
//          Audit-engine.mjs verifioi rakenteen ja TARGET-parity:n. UI + auto-learn 2D-δ-C:ssä.
// v4.51.0 (Track B Vaihe 2D-δ-C): Adaptive multi-suggestion UI + auto-learn.
//          Workout-näkymä renderöi 1-3 suggestion-korttia primary-työsarjoille
//          (Varovainen / Tavoite / Rohkea), default-kortti highlightattu "Suositus"-merkillä.
//          Atletti voi vaihtaa valinnan ennen 1. työsarjan completionia → exercise.loadKg
//          + targetVx päivittyy kaikille jäljellä oleville sarjoille; valinta lukittuu
//          1. työsarjan jälkeen. "Miksi tämä?" -painike avaa per-kortti delta-rationale,
//          ja erillinen "Näytä koko päätösketju" avaa jaettu trace-explainer-paneeli
//          (top-3 priorisointi: PLAN_BASED_E1RM, CFG_DRIFT_APPLIED, VARA_TREND_CORRECTION,
//          VBT_E1RM_CROSSCHECK, SLOT_TARGETVx_RESOLVED, VL_CAP_RESOLVED, RTF_MODEL_STATUS)
//          suomenkielellä ilman tutkijaviittauksia. Auto-learn data.js:n
//          updateAggressivenessLearned() lukee viim. 3 session.selectedSuggestionId:t ja
//          päivittää settings.aggressivenessLearned ∈ [-1, +1] saveSession-jälkeen.
//          Reset-säännöt: 3× SAFE-streak -0.15, 3× AGGRESSIVE-streak +0.15, FAILURE V0
//          -0.30, RED-cap -0.30. Engine.js generateSuggestions yhdistää
//          settings.preferredSuggestionBias + aggressivenessLearned effectiveBias:ksi
//          (raja-arvot ±0.4). Wizard q33_aggressivenessDefault seedaa alkuarvon
//          (stable=-0.3, balanced=0, challenging=+0.3). Settings UI näyttää bar-graphin
//          oppimistilasta + nollaus-painike. 32 uutta selain-testiä (testAdaptiveSuggestions
//          T1-T14 + testAdaptiveSuggestionsLearned L1-L7 + lisät). Akselin regressio
//          bittitarkasti läpi (64/64 päivää, 0 ERROR, 41 audit-flaggia = baseline-identti).
// v4.51.1 (Track B 2D-δ-C5 send-ready): Kriittinen syntaxbug-korjaus +
//          cold-start UX-hint + invariantti 31. v4.51.0:n duplikoitu
//          escapeHtml-funktio (rivit 3674 + 6133) esti ESM-module-lataamisen
//          → koko UI jäi tyhjäksi. Korjattu poistamalla v4.51.0-duplikaatti.
//          Cold-start: kun rec.suggestions kaikilla load === null, UI näyttää
//          "💡 Ensimmäiset sessiot — syötä kuorma manuaalisesti, engine
//          kalibroituu 2-3 sessiossa". Wizard-mapper invariantti 30 → 31
//          (q33_aggressivenessDefault lisäys schemassa). Pilot-regressio
//          bittitarkasti: Akseli 64/64 0 ERROR, beginner 12/12 0 flagia,
//          elite-female 12/12 0 flagia.
// v4.51.2: ensureNewPresetMovements()-migraatio init():iin. seedPresets() ajaa
//          vain kerran (first install), joten v4.48.0:n "Yhden jalan jalkaprässi"
//          yms. uudet liikkeet eivät tulleet automaattisesti vanhoille
//          käyttäjille. Nyt jokainen sovelluksen avaus tarkistaa puuttuvat
//          preset-liikkeet ja lisää ne idempotentisti olemassa olevaan
//          DB:hen ilman duplikointia. Live-verifioitu: poistettu liike IDB:stä,
//          reload palauttaa sen automaattisesti.
// v4.51.3: Wizard reaktiivisuus-bugin korjaus. Aiemmin conditionally visible
//          kysymykset (q28_targetType riippuvainen q27_targetDate:sta, q30_energyBudget
//          riippuvainen q14_cutting:sta) eivät ilmestyneet DOM:iin kun referenssi-
//          kysymys täytettiin — onChange-handleri tallensi vastauksen stateStoreen
//          mutta EI re-renderöinyt stagea. Käyttäjä asetti q27_targetDate:n, q28
//          ei ilmestynyt UI:hin, ja "Seuraava"-klikkaus näytti "Mikä on tavoitepäivän
//          luonne?: Pakollinen kenttä puuttuu" -alapalkki-virheen kysymyksestä
//          jota käyttäjä ei voinut nähdä. Korjattu: renderStep kerää triggerQuestionIds-
//          setin (kaikki requiredIf.questionId-arvot), ja onChange-handleri re-renderöi
//          stagen jos vastattu kysymys on listalla. Live-verifioitu DOM-tasolla:
//          ennen q27:n täyttöä 0 q28-painiketta, jälkeen 4 painiketta ilmestyivät.
// v4.51.4: Wizard done-view UX-korjaus. Käyttäjäpalaute: "vastasin 28/30 onnistuneesti,
//          sovellus ei palannut kotinäkymään vaan alkoi alusta 1/8". Root-cause:
//          done-view jätti käyttäjän paikalleen "Aloita uudelleen" -painikkeen
//          kanssa ilman selkeää paluuohjausta pää-sovellukseen → käyttäjä
//          todennäköisesti klikkasi restart erehdyksessä → wizard tyhjentyi
//          → seuraava avaus alkoi alusta. Korjaus: lisätty "← Palaa sovellukseen"
//          -primary CTA (href="../") + restart painike pienempänä + confirm-
//          dialogi joka kertoo että vastaukset poistuvat. Live-verifioitu.
// v4.51.5: Wizard-PR-migraation e1RM-laskenta — 1×1RM-yritys EI saa Epley-korjausta.
//          Käyttäjäpalaute: "kaveriasi arvioitu 180×1 nostettu e1RM 186, lisäpainoleuka
//          160 → 165 — miksi ohjelma nosti maksimiarvioita?". Root-cause:
//          _computeE1RMFromPR() käytti w × (1 + r/30) kaikille r-arvoille, mukaan
//          lukien r=1. Epley-kaava on suunniteltu r ≥ 2 -tilanteille (ennustaa 1RM
//          tehdyistä toistoista) — yksittäinen 1RM-yritys ON 1RM. Korjaus: if
//          (r === 1) return w. 5-rep PR:t säilyvät Epley-korjattuina (150×5 → 175).
// v4.51.6: Wizard q31_preferredDays — atletti voi valita treenipäivät itse.
//          Käyttäjäpalaute: "miksi en voi valita ti, to ja su itse — sovellus
//          optimoi sitten liikkeet palautumistarpeet huomioiden". Aiemmin
//          pickPreferredDaysOfWeek palautti hardkoodatut päivät (3/vk → Ti/To/La).
//          Nyt: uusi checkboxes-kysymys q31 (optional, MA-SU). Validointi: jos
//          täytetty, määrä = q24.daysPerWeek. Mapper prioritisoi atletin valinnan,
//          fallback defaulttiin. SCHEMA_INVARIANTS 31 → 32.
// v4.51.7: Wendler 5/3/1 -mesocyclen kanoninen rakenne säilyy. Käyttäjäpalaute:
//          "klikkasin wendler 531, ohjelma näytti 'leuanveto (kehopaino) 1×5'".
//          Root-cause: generateCustomMesocycle kutsui distributePrimariesToDays:tä
//          Wendler-skeletonille, mikä korvasi Wendlerin 4 kanonista liikettä
//          (Pystypunnerrus, Maastaveto, Penkkipunnerrus, Takakyykky) atletin
//          q09_sport-defaultilla. Jos pullup_bar puuttui kalustosta, fallback
//          oli "Leuanveto (kehonpaino)" KAIKILLE 4 päivälle. Tämä rikkoi
//          Wendlerin metodologian (Wendler itse kieltää substituution).
//          Korjaus: ohitetaan distributePrimariesToDays kun goal === "wendler531".
//          Atletin 1RM-data (penkki/maave) käytetään TM-laskennassa
//          movementProgress.e1RM:n kautta (PR-migraatio).
// v4.51.8: pickProgramStyle:n Wendler 5/3/1 -kandidaatti tarkistaa nyt 3
//          edellytystä ennen suositusta: (1) barbell_rack kalustossa, (2) 1RM-
//          PR-data 4 kisaliikkeelle (Pystypunnerrus/Maastaveto/Penkkipunnerrus/
//          Takakyykky), (3) ei absoluuttisia vammoja jotka estäisivät noita
//          liikkeitä. Aiemmin Wendler nousi top-suositukseksi pelkän max-tavoite
//          + kokenut-yhdistelmän perusteella, vaikka atletilla ei ollut
//          edellytyksiä. Confidence-rangaistukset: ei tankoa = 0 (force out),
//          puuttuvat 3+ PR:t = -30, puuttuvat 1-2 PR:t = -10 + selkeä viesti
//          mitä puuttuu, jokainen estävä vamma = -25.
// v4.51.9: q17_equipment UX-korjaus. Käyttäjäpalaute: "klikkasin yleiset
//          kuntosalilaitteet, enkä klikkaillut kaikkia muitakin koska luulin
//          että tämä sisältää kaiken". Aiemmin labelit antoivat ymmärtää että
//          'Yleiset kuntosalilaitteet' olisi katto-luokka — todellisuudessa se
//          tarkoittaa vain laite-pohjaisia liikkeitä (leg press, smith jne.).
//          Käyttäjä jätti merkitsemättä tankon + räkin → Wendler-suositus
//          tönäisi väärille raiteille. Korjaus: tarkemmat labelfi-tekstit
//          ("Tanko + räkki (squat rack, levypainot)", "Erilliset kuntosalilaitteet
//          (leg press, smith, hack squat, hauislaite ym.)") + helperFi joka
//          ohjeistaa selkeästi valitsemaan useita vaihtoehtoja.
// v4.51.10: Wizard skipped-stage saa "Muokkaa silti" -painikkeen.
//           Käyttäjäpalaute: "Vaihe 4/8 (PR-data) ohitettiin koska sovellus
//           käyttää aiempaa PR-dataa, mutta haluaisin päivittää sitä".
//           Aiemmin skipped-vaihe näytti pelkän info-tekstin eikä antanut
//           atletille mahdollisuutta muokata. Korjaus: evaluateVisible saa
//           neljannen parametrin skipOverrides (Set<qid>) joka ohittaa
//           skipIfMainAppHas-tarkistuksen valituille kysymyksille. UI:hin
//           lisätty "✎ Muokkaa silti" -painike skipped-näkymään (mukana
//           selventävä ohje). WizardController säilyttää _skipOverrides
//           transient-tilana (sovelluksen sulkemisessa nollautuu). Klikkaus
//           paljastaa stagen kysymykset välittömästi re-renderöinnillä.
// v4.51.11: docs + esittely.html stand-alone esittelysivu eliittitason
//           urheilijoille. Asetukset-näkymässä uusi "Tietoja LeVe AI:sta"
//           -kortti johon "Avaa esittely" -linkki (target=_blank). Sivu
//           on jaettavissa suoralla URL:llä (kaverille linkkinä) ja
//           käyttää samaa värimaailmaa (#0b1220 / #e8eefc) kuin pää-app.
//           Ei sekoita arjen käyttöä — esittely on omassa polussaan ja
//           kortti on Asetukset-näkymän loppupuolella, Diagnostiikan EDELLÄ.
// v4.52.47: Pilari 3 — wizard-generaattorin preview surfacea nyt
//           _wizardMeta.goalConflictAdvisory:n (rehellinen tavoite-ristiriita /
//           resurssirajoite -advisory, aiemmin laskettu mutta ei näytetty).
// v4.52.48: Pilari 3 R2 — 6 materialisaatio-korjausta (A aloittelija-turvaraja,
//           B aikabudjetti-cap, C q34-palautuminen, D primaari-demote, E soutu-
//           substituutio, F vamma-modified) + Käsipainosoutu katalogiin (OBS-053).
// v4.52.49: Pilari 3 R2 (Cowork re-arvio) — aloitus-intensiteetti-degradaatio
//           propagoituu sessiotason slot.targetVx:ään (näyttö = live, AUKKO 2).
// v4.52.50: Pilari 3 R3 (Cowork re-arvio 2) — P2 hypertrofia MEV-floor (≥10
//           settiä/päälihas/vk + komposiitti) + P6 kavennettu olkapää-blocklist
//           (penkki säilyy). P3 lykätty γ/M2.
// v4.52.51: Pilari 3 R4 (Cowork re-arvio 3) — MEV-floor jakautuminen: per-(sessio×
//           liike)-katto 6 + add-movement + spread (P2 olkapää HSPU 10×15 → HSPU+
//           pystypunnerrus, selkä levitetty). Vain hypertrofia.
// v4.52.52: Pilari 3 R5 (Cowork re-arvio 4) — P2 kalustovirhe: GHR→machines +
//           Käsipainopenkki→penkki-proxy + substituutit (lattiapunnerrus/Nordic ham/
//           käsipaino-RDL). Yksikään liike ei vaadi q17:stä puuttuvaa kalustoa.
// v4.52.53: Pilari 3 R5b (Cowork re-arvio 5) — P8 kalustovirhe: Lisäpainoleuanveto/
//           dippi vaativat painolähteen (leukatanko/dip + käsipaino/tanko/laite) →
//           P8 (pelkkä leukatanko) → Leuanveto (kehonpaino). Bounded scan: 11/11 puhdas.
// v4.52.54: Retroauditti K1-K6 (Fable 5) — MEV-floor: spread-roolirajaus + deload-
//           kynnys −0.20 + peritty Vx · duplikaatti-rivien merge · MEV-advisory
//           post-aktivointi-toastiksi · wizard-pilot Stop hookiin (+ splitFilter-
//           _demotedPrimary-guard, pilotin 1. saalis) · RDL→OBS-044-addendum.
// v4.52.55: Ohjelmointikone KORI 1+2 (Akselin 9 kenttähavaintoa, A1→ratifiointi) —
//           E4 TÄNÄÄN TEHTY=toteuma · E3 swap-kuormat uuden liikkeen datasta +
//           näkyvä palauta · E1 ramppi ykkösen eteen · E2 kortin sarjamäärä slotista ·
//           E5 Haara C (eri-liike-apuliike omasta e1RM:stä) · K2c evidenssi-sort
//           suorituspäivällä · K2a paluuramppi ei-primary-sloteille · K2b post-break-
//           ankkurikatto (tuore evidenssi cappaa vanhan).
// v4.52.56: Ohjelmointikone KORI 3+4 — K3-1 across-set-väsymysmalli (symmetrinen:
//           preskriptio-allowance + estimointi-positiokrediitit + kestävyys-katto) ·
//           K3-4 VAROVAINEN historia-tietoiseksi (≤ viime session demonstroitu) ·
//           K3-3 D1-v2 sarjasta-sarjaan (V0 → −5 % kaikissa blokeissa, deficit ≥2 →
//           −2,5 %) · K3-2 ykkösen tulos re-ankkuroi työsarjat · K4-1 viikkovolyymi
//           lihasryhmittäin (Sykli-kortti) · K4-2 cold-start-accessoryn rehellinen UX.
// v4.52.57: S10-juurikorjaus — PLAN_BASED-inversio system-%-kontraktiin (1c978a9:n
//           unohtunut 9. lokus): 4 lokusta jaetulla planBasedInvertE1RM-helperillä
//           (recommend-ydin, kortti-Best/F-3, inflation-streak, cfg-drift) + S10-fixture
//           re-ankkurointi + uusi F-3-lukkotesti (kortti=live BW-plan-based). 854/854.
// v4.52.58: KORI 5 (la vk10 -kenttähavainnot + audit-triage) — K5-1 apuliike-regression-
//           lattia · K5-2 ramppi-mikrokuormalattia (BW-variantti <10 kg) · K5-3 SAFE=TARGET-
//           dedupe · K5-4 label-kg-strippaus · K5-5 toteuma-layout · K5-6 stale K-A1-kanava
//           eläkkeelle · K5-7 deload-day-kerroin (negatiivista basea ei laimenneta, Helms).
// v4.52.59: KORI 6 (Akselin 5.7-havainnot + luottamusinfra) — K6-2 PRESCRIPTION_SANITY-
//           vahti · K6-2b deload-ankkuriohitus (vahdin 1. saalis: post-deload-romahdus) ·
//           K6-3 yksi e1RM-totuus (loadType 14 BW-presettiin) · K6-1 perustelu-lohko
//           jokaiseen kuormaan · K6-4 rehellinen progressio-badge + double progression -vihje ·
//           K6-5 otsikkototuus + ensi viikon päivävalinta selkeäksi.
// v4.53.0: KORI 7 — VALMENTAJA-LINSSIN AUKOT KIINNI (milestone). K7-1 aamucheck-in
//          4. readiness-kanavana (Hooper/McLean; laitteeton atleetti ei ole enää aina
//          GREEN) · K7-2 automaattinen deload-ehdotus (cross-movement väsymysaggregaatti,
//          advisory) · K7-3 failure-syyn erottelu (voima/tekniikka/kipu/ote → eri reaktiot) ·
//          K7-4 MU-skill-syyt + regressio-drillit · K7-5 kipu-liikennevalo (Silbernagel) ·
//          K7-6 kisapäivän in-meet-yritysvalinta · K7-7 syklin loppuanalyysi → seuraavan
//          blokin heikkousdiagnoosi + kisapäivä-tietoisuus.
// v4.53.1: VAIHE 8a V1 — ENSIMMÄINEN OPITTAVA PARAMETRI (learnedAcrossSetFatigue).
//          Engine oppii SINUN sarjasta-sarjaan-väsymyksesi (mediaani (reps+Vx)-erotuksista,
//          deload-sessiot pois) ja mitoittaa työsarjat kestäväsi mukaan — tutkimusrajoissa
//          (prior 0.5, clamp ±2 SD [0.25,0.75], LEARNED_PARAM_OUTLIER). Ko-opittavuus:
//          sama arvo preskriptioon/estimointiin/re-ankkurointiin. Oppii treenin päätöksessä
//          (settings.learnedParams); recommend() pysyy puhtaana → cold-start bittitarkka.
//          Legibiliteetti: 🧭-perustelu + Asetukset-näyttö + nollaus. Uudelleenkäytettävä
//          learnedParams-koneisto (updateLearnedParam) seuraaville 8a-parametreille.
// v4.54.0: KORI 8 — PROGRESSIO-MONIPUOLISUUS (#6: "muita keinoja tulla vahvemmaksi").
//          Engine kohteli jumitusta binäärisenä (progressio kuormalla TAI vaihda liike).
//          Nyt kun liike on tasanteella (kuorma ei nouse), engine ehdottaa oikean
//          EI-kuorma-työkalun kontekstin mukaan: toistot (double progression) / sarjat /
//          tiheys / tempo·tauko / mikrokuorma — valmentajan tikapuut ennen liikkeen vaihtoa.
//          Deterministinen advisory (ei opittava, ei kompoundautumisriskiä); recommend()-
//          kuorma koskematon. Näkyy 🧭 "Miksi tämä paino?" -lohkossa kaikille liikkeille.
// v4.55.0: MULL-2 — VOLYYMIMAAMERKIT (#8, lainalaisuus MEV/MAV/MRV). K4-1 laski
//          viikkovolyymin muttei tulkinnut sitä tavoitteeseen nähden. Nyt Sykli-kortti
//          näyttää ⚠ ali-annostellut tavoite-synergistit (esim. hauis leuanvedossa —
//          #8:n täsmävastaus) + ▲ palautuskattoa (MRV) lähestyvät lihakset. Advisory,
//          ei rajoitin (atletti = valmentaja). Askel kohti varauksetonta eliittitasoa.
// v4.56.0: MULL-3 — WITHIN-SESSION-ENNAKOINTI (#16, reaktiivisesta ennakoivaan).
//          Engine säiti ennen vasta failuren jälkeen; nyt ENNUSTAA opitusta across-set-
//          mallista jos mitoitettu tai ylikirjoitettu sarjasarja ei kestä (viimeinen sarja
//          yli targetin) → ⚠ Kestävyys-ennuste + kestävä vaihtoehto (vähemmän sarjoja tai
//          kevyempi kuorma) ENNEN grindiä. K3-1-kalibroitu kuorma ei false-fire. Advisory,
//          UI-side (recommend() byte-identtinen). Sulkee auditin #16 = 2/3 varaukseton-eliitti.
// v4.56.1: H-019 OSA A — completed-FANTOMIKENTTÄ + OBS-044-katalogisiivous.
//          A1-sweep (424 settiä): persistoidut setit eivät kanna completed-kenttää →
//          computePriorSet/computePriorSessionSummary/computeAcrossSetDecay olivat
//          sokeita KOKO historialle: "ensimmäinen kirjaus" vaikka historiaa on (kenttä-
//          case Jalkaprässi/RDL), delta-chip/ghost tyhjiä, 8a-oppiminen inertti.
//          Ehto poistettu 3 lokuksesta (tuotantoschema-semantiikka + A4-lukko).
//          Katalogi: Hollow/L-sit-duplikaattirivit pois, nimi-dedup normalisoitu,
//          addMovement-guard, T3 → globaali uniikkius. EI heal-migraatiota (orvot 0).
// v4.56.2: H-019 väli-fix — CAP_YELLOW ei laimenna deloadia (vain positiivinen delta
//          puolitetaan; cap-only: readiness ei koskaan nosta kuormaa suunnitellusta) +
//          DELOAD_DEPTH_CLAMP: kevennysten summa capataan tasan −30 %:iin (invariantti C:n
//          syvä raja + JS-float-artefaktin inklusiivisuus). Returner-fleet-violaatio → 0.
// v4.57.0: H-019 OSA B — γ-kisa-peaking (la 22.8.2026: MU + dippi + leuka). Kisatehdas
//          (5 vk: 2×intensity + 2×peaking + taper; kisapäivä 12 slottia, 3 yritystä/laji,
//          strategiat varma/normaali/aggressiivinen), porrastetut readiness-capit
//          (työviikot täysi cap-only · taper YELLOW advisory / RED aktiivinen · kisapäivä
//          ei cappeja, K7-6 yksin), VL-capit viikkoleimoista + tutkimuskaton clamp
//          (intensity ≤15 / peaking ≤10), per-laji-yrityskuormat omista e1RM:istään,
//          B8-syöttö-UI + B9-odottava aktivointi (mikään ei muutu ennen 20.7.) + B10-taper-note.
const APP_VERSION = "4.63.0";

// v4.52.46 oli aiempi APP_VERSION tässä kohdassa.
// v4.52.42 oli aiempi APP_VERSION (H-017 D1); 4.52.43 = OBS-048/049 kuorman-johto-korjaus.
// v4.52.39 oli aiempi APP_VERSION tässä kohdassa.
// v4.52.38 oli aiempi APP_VERSION tässä kohdassa.
// v4.52.37 oli aiempi APP_VERSION tässä kohdassa.
// v4.52.36 oli aiempi APP_VERSION tässä kohdassa.
// v4.52.35 oli aiempi APP_VERSION tässä kohdassa.
// v4.52.34 oli aiempi APP_VERSION tässä kohdassa.
// v4.52.33 oli aiempi APP_VERSION tässä kohdassa.
// v4.52.32 oli aiempi APP_VERSION tässä kohdassa.
// v4.52.31 oli aiempi APP_VERSION tässä kohdassa.
// v4.52.30 oli aiempi APP_VERSION tässä kohdassa.
// v4.52.29 oli aiempi APP_VERSION tässä kohdassa.
// v4.52.28 oli aiempi APP_VERSION tässä kohdassa.
// v4.52.27 oli aiempi APP_VERSION tässä kohdassa.
// v4.52.26 oli aiempi APP_VERSION tässä kohdassa.
// v4.52.25 oli aiempi APP_VERSION tässä kohdassa.
// v4.52.24 oli aiempi APP_VERSION tässä kohdassa.
// v4.52.23 oli aiempi APP_VERSION tässä kohdassa.
// v4.52.22 oli aiempi APP_VERSION tässä kohdassa.
// v4.52.21 oli aiempi APP_VERSION tässä kohdassa.
// v4.52.20 oli aiempi APP_VERSION tässä kohdassa.
// v4.52.19 oli aiempi APP_VERSION tässä kohdassa.
// v4.52.18 oli aiempi APP_VERSION tässä kohdassa.
// v4.52.17 oli aiempi APP_VERSION tässä kohdassa.
// v4.52.16 oli aiempi APP_VERSION tässä kohdassa.
// v4.52.15 oli aiempi APP_VERSION tässä kohdassa.
// v4.52.14 oli aiempi APP_VERSION tässä kohdassa.
// v4.52.13 oli aiempi APP_VERSION tässä kohdassa.
// v4.52.12 oli aiempi APP_VERSION tässä kohdassa.
// v4.52.11 oli aiempi APP_VERSION tässä kohdassa.
// v4.52.10 oli aiempi APP_VERSION tässä kohdassa.
// v4.52.9 oli aiempi APP_VERSION tässä kohdassa.
// v4.52.8 oli aiempi APP_VERSION tässä kohdassa.
// v4.52.7 oli aiempi APP_VERSION tässä kohdassa.
// v4.52.6 oli aiempi APP_VERSION tässä kohdassa.
// v4.52.5 oli aiempi APP_VERSION tässä kohdassa.
// v4.52.4 oli aiempi APP_VERSION tässä kohdassa.
// v4.52.3 oli aiempi APP_VERSION tässä kohdassa.
// v4.52.2 oli aiempi APP_VERSION tässä kohdassa.
// v4.52.1 oli aiempi APP_VERSION tässä kohdassa.
// v4.52.0 oli aiempi APP_VERSION tässä kohdassa.
// v4.51.12 oli aiempi APP_VERSION tässä kohdassa.
// v4.51.11 oli aiempi APP_VERSION tässä kohdassa.
// v4.34.50 oli aiempi APP_VERSION (= "4.34.50") tässä kohdassa.
// v4.34.49 muutoshistoria:
// (1) MU eksentrinen näytti "+64.5 kg" skill-vaiheessa (vk 1-4) vaikka slot on
//     BW + kuminauha (suggestedLoadKg=0). Syy: UI:n primary-slot-rendering käytti
//     rec.targetExternalLoad fallbackia kun aktiivisen liikkeen e1RM=0, mikä
//     vuoti Lisäpainoleuanveto-targetin (0.55 × leuka-e1RM ≈ 64.5) MU-rivillä.
//     KORJAUS index.html:2655 — jos slot.suggestedLoadKg===0 tai muSkillPhase===true,
//     näytä "BW" (ei rec.targetExternalLoad). Vaikuttaa MU eksentrinen vk 1-4.
// (2) Vk 2 LA Takakyykky näytti 94 kg (= 0.55 × 170 historia-mediani) vaikka
//     atletin Asetuksissa cfg.kyykkyExtKg = 185 (= 102 kg). Syy: cross-reference-
//     haara engine.js:3300 käytti pelkkää historia-mediania ja ohitti cfg-arvon.
//     KORJAUS: cfg-floor — käytä max(historia-mediani, cfg-arvo) × loadPct.
//     Säilyttää konservatismin (cfg ei voi LASKEA kuormaa), mutta atletin
//     intentionaalinen cfg-arvo toimii alarajana. Jos historia > cfg, historia
//     voittaa kuten ennen. Uusi trace CFG_FLOOR_APPLIED audit-trailiin.
// 276/276 OK, ei regressiota. Streetlifting_16w-meson rakenne ennallaan.

// v4.34.49 oli aiempi APP_VERSION tässä kohdassa.
// v4.34.48 muutoshistoria:
// generateBlockTuningPackage on hardkoodattu streetlifting_16w-mesolle (foundation/
// strength/intensity/peaking-blokit, kisaliikkeet, vk 4/8/12 deload-mappi).
// Atletti: "Olisi tärkeää että AI-block-tuning toimisi muillekin mesotyypeille
// jotta sovellus on 9/10 koko järjestelmänä." Uusi yleinen versio:
//   - generateGenericBlockTuningPackage: deload-tunnistus weekDef.deltaPctBase < 0
//   - Etsii primary-liikkeet weekPlans:sta dynaamisesti (ei hardkoodattuja)
//   - Käyttää movementCfg:tä jos olemassa (v4.34.44 yleistys)
//   - Sama markdown + json + AI-prompt -output kuin streetlifting-versio
// UI-kytkentä: btn-generate-block-tuning käyttää nyt streetlifting_16w:lle
// alkuperäistä funktiota, muille mesoille uutta yleistä versiota.
// 4 uutta testiä test-runneriin (276/276), mukaan lukien KAVERI-FIXTURE
// (Maija: penkki+mave, ei velocity-mittaria, 1RM-kalibroitu) joka todistaa
// että koko Vaihe 1-3 -ketju toimii kuvitteelliselle uudelle käyttäjälle.
//
// v4.34.47 (edellinen) — LIIKEPANKKI-MODAALI WIZARDIIN (Vaihe 2-Lite):
// Wizardin Päälikkeet-valinta tarjosi vain 8 hardkoodattua liikettä — 122
// liikepankin liikettä jäi piiloon. Lisätty "+ Lisää muu liike" -chip joka
// avaa showMovementBankModal:in. Modaalissa: tekstihaku + kategoria-suodatus
// (9 kategoriaa) + lista (max 80 näkyvää, lisää-vinkki jos enemmän).
// Klikkaus liikkeelle lisää sen wizardin extraPrimaries-listaan + valinnan-
// listaan. Säilyttää max-3-päälike-rajan. State.movements luetaan suoraan
// (122 liikettä, IDB-pohjainen).
// 260/260 testiä OK, ei regressiota.
//
// v4.34.46 (edellinen) — OHJELMAT-NÄKYMÄN PIKAKORJAUKSET (Vaihe 1.6/3):
// Atletin palaute v4.34.45-pushin jälkeen: "1) miksi liikepankin historia-nappi
// ei toimi? 2) perusjaksot (44 kpl) on tyhjiä ja turhia ohjelmia."
// (1) Liikepankin 📊-painike avasi detail-kortin sivun pohjalle piiloon
// liikelistan alle — käyttäjä luuli ettei nappi tee mitään. KORJAUS:
// scrollIntoView({ behavior: 'smooth', block: 'start' }) detail-divin avauksen
// jälkeen, viewporttiin nyt automaattisesti.
// (2) 44 autocreated default-mesoa olivat kerääntyneet aikojen saatossa init-
// vaiheen sivuvaikutuksena (createDefaultMesocycle joka init jossa active=null
// → save). Vain "Vaihda ohjelma" -toiminto siivosi orphanit. Aiemmin nämä
// olivat näkymättömissä, mutta v4.34.45:n Ohjelmat-sektio paljasti kaikki.
// KORJAUKSET 1.6b-d: (b) Ohjelmat-näkymä suodattaa orphan-mesot pois
// oletuksena (näytä vain merkitykselliset). (c) "🧹 Siivoa tyhjät" -nappi
// jolla atletti voi puhdistaa orphanit yhdellä klikkauksella + vahvistus.
// (d) Init-vaiheessa autocreated default aktivoidaan heti setActiveMesocycle:lla
// → estää uuden orphan-tilanteen kerääntymisen tulevaisuudessa.

// v4.34.46 oli aiempi APP_VERSION tässä kohdassa.
// (Aktiivinen APP_VERSION-määritys löytyy ylhäältä.)
const CACHE_NAME = `leve-ai-v${APP_VERSION}`;

// v4.34.9: Kuuntele SKIP_WAITING-message-eventtia, jolla pää-säie voi pakottaa
// uuden SW:n aktivoitumisen heti (update-bannerin "Lataa nyt" -nappi käyttää tätä).
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

const CORE_ASSETS = [
  "./",
  "./index.html",
  "./engine.js",
  "./data.js",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  // v4.39.0 (Track B Vaihe 2A): wizard-tiedostot precachattuina jotta wizard
  // toimii offline ensimmäisestä avauksesta. wizard-sw.js EI tähän — se on
  // 1A:n dormantti tiedosto eikä ajeta SW:nä.
  "./wizard/wizard.html",
  "./wizard/wizard-core.js",
  "./wizard/wizard-data.js",
  "./wizard/wizard-schema.js",
  "./wizard/wizard-styles.css",
  "./wizard/wizard-movement-bank.js",
  // v4.40.0 (Track B Vaihe 2B-β): wizard-pohjainen ohjelma-mapper
  "./wizard/wizard-2b-mapper.js",
];

// Install: cache core assets
// v4.52.13 H-006a-fix7: { cache: "reload" } pakottaa SW:n ohittamaan selaimen
// HTTP-cachen install-vaiheessa. Aiemmin pelkkä cache.addAll(CORE_ASSETS) saattoi
// käyttää selaimen HTTP-cachea (esim. GitHub Pages CDN 304 Not Modified), jolloin
// uuteen leve-ai-v${APP_VERSION}-cacheen tallennettu engine.js OLI VANHA versio.
// Tämä selittää Akselin oireen 2026-05-27: index.html (network-first) tuore,
// mutta engine.js (stale-while-revalidate) vanha → kortti ⚪ vaikka data ok.
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      cache.addAll(CORE_ASSETS.map((url) => new Request(url, { cache: "reload" })))
    )
  );
  self.skipWaiting();
});

// Activate: clean old caches
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

// Fetch: navigation network-first (3s timeout), assets stale-while-revalidate, others cache-first
self.addEventListener("fetch", (event) => {
  // Only handle GET requests
  if (event.request.method !== "GET") return;

  const url = new URL(event.request.url);

  // v4.34.37: navigation-pyynnöt (= index.html) → network-first 3 s timeout, fallback cache.
  // Tämä takaa että käyttäjä saa AINA uusimman index.html:n + script-viittaukset
  // kun online. Aiempi stale-while-revalidate palveli vanhan HTML:n joka viittasi
  // vanhoihin engine.js + data.js -tiedostoihin → automaattinen päivitys ei toiminut.
  if (event.request.mode === "navigate") {
    event.respondWith(
      Promise.race([
        fetch(event.request).then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((c) => c.put(event.request, clone));
          }
          return response;
        }),
        new Promise((resolve) => setTimeout(() => resolve(null), 3000)),
      ]).then(async (networkResponse) => {
        if (networkResponse) return networkResponse;
        // Timeout tai fail → fallback cache
        const cache = await caches.open(CACHE_NAME);
        const cached = await cache.match(event.request) || await cache.match("./index.html");
        return cached || new Response("Offline", { status: 503 });
      }).catch(async () => {
        const cache = await caches.open(CACHE_NAME);
        const cached = await cache.match(event.request) || await cache.match("./index.html");
        return cached || new Response("Offline", { status: 503 });
      })
    );
    return;
  }

  const isCoreAsset = CORE_ASSETS.some(a => url.pathname.endsWith(a.replace("./", "/")));

  if (isCoreAsset) {
    // Stale-while-revalidate: serve cache immediately, update in background
    event.respondWith(
      caches.open(CACHE_NAME).then(async (cache) => {
        const cached = await cache.match(event.request);
        const fetchPromise = fetch(event.request).then((response) => {
          if (response && response.status === 200) {
            cache.put(event.request, response.clone());
          }
          return response;
        }).catch(() => null);

        return cached || fetchPromise || new Response("Offline", { status: 503 });
      })
    );
  } else {
    // Non-core assets: cache-first, network fallback
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) return cached;
        return fetch(event.request).then((response) => {
          if (response && response.status === 200 && response.type === "basic") {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((c) => c.put(event.request, clone));
          }
          return response;
        }).catch(() => new Response("Offline", { status: 503 }));
      })
    );
  }
});
