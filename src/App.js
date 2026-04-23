import React, { useState, useEffect } from "react";
import { initializeApp } from "firebase/app";
import { getFirestore, doc, setDoc, getDoc } from "firebase/firestore";

// ─── Firebase config ──────────────────────────────────────────────────────────
const firebaseConfig = {
  apiKey: "AIzaSyAk2U6Yw0kD-RiZqllrmKCuVTH5IZagN3s",
  authDomain: "paie-hubert.firebaseapp.com",
  projectId: "paie-hubert",
  storageBucket: "paie-hubert.firebasestorage.app",
  messagingSenderId: "227675242980",
  appId: "1:227675242980:web:311063ecd097c13c5cc7f1"
};

let db = null;
try {
  const app = initializeApp(firebaseConfig);
  db = getFirestore(app);
} catch(e) { console.error("Firebase init error:", e); }

async function fbSave(data) {
  if (!db) return;
  try { await setDoc(doc(db, "paie", "donnees"), data); }
  catch(e) { console.error("Firebase save error:", e); }
}

async function fbLoad() {
  if (!db) return null;
  try {
    const snap = await getDoc(doc(db, "paie", "donnees"));
    return snap.exists() ? snap.data() : null;
  } catch(e) { console.error("Firebase load error:", e); return null; }
}

// ─── Constantes ───────────────────────────────────────────────────────────────
const DEPOT = { lat: 49.3667, lng: 1.1833, nom: "Amfreville-la-Mi-Voie" };
const STORAGE_KEY = "hubert_paie_v4";
const NB_ZONES = 10;
const ZONES = Array.from({ length: NB_ZONES }, (_, i) => i + 1);
const MOIS_NOMS = ["Janvier","Février","Mars","Avril","Mai","Juin","Juillet","Août","Septembre","Octobre","Novembre","Décembre"];
const MOTIFS_ABS = ["Congés payés","Maladie","CFA","Accident du travail","Jour férié","Absence injustifiée","Formation","Autre"];
const HEURES_REF = 35, SEUIL_HS50 = 43;
const HEURES_STD = { norm: 7.83, ven: 3.68, paul: 7 };

const SALARIES = [
  { id: 1, nom: "HUBERT Paul",        coef: "Cadre",    forfait: true,  fraisPro: true  },
  { id: 2, nom: "EL YAHYAOUI Mourad", coef: "250",      forfait: false, fraisPro: false },
  { id: 3, nom: "LANNEE Xavier",      coef: "270",      forfait: false, fraisPro: false },
  { id: 4, nom: "MOREAU Dominique",   coef: "250",      forfait: false, fraisPro: false },
  { id: 5, nom: "VINCENT Dominique",  coef: "270",      forfait: false, fraisPro: false },
  { id: 6, nom: "CHEIKH Djamel",      coef: "250",      forfait: false, fraisPro: false },
  { id: 7, nom: "COULIBALY Sekou",    coef: "Apprenti", forfait: false, fraisPro: false },
];

// ─── Jours fériés (algorithme Meeus/Jones/Butcher) ───────────────────────────
function getPaques(y) {
  const a=y%19,b=Math.floor(y/100),c=y%100,d=Math.floor(b/4),e=b%4;
  const f=Math.floor((b+8)/25),g=Math.floor((b-f+1)/3);
  const h=(19*a+b-d-g+15)%30,i=Math.floor(c/4),k=c%4;
  const l=(32+2*e+2*i-h-k)%7,m=Math.floor((a+11*h+22*l)/451);
  const month=Math.floor((h+l-7*m+114)/31);
  const day=((h+l-7*m+114)%31)+1;
  return new Date(y, month-1, day);
}

function getJoursFeries(y) {
  const p = getPaques(y);
  const add = (d,n) => new Date(d.getTime()+n*86400000);
  const fmt = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  const list = [
    [new Date(y,0,1),  "1er janvier"],
    [add(p,1),         "Lundi de Pâques"],
    [new Date(y,4,1),  "Fête du Travail"],
    [new Date(y,4,8),  "Victoire 1945"],
    [add(p,39),        "Ascension"],
    [add(p,50),        "Lundi de Pentecôte"],
    [new Date(y,6,14), "Fête Nationale"],
    [new Date(y,7,15), "Assomption"],
    [new Date(y,10,1), "Toussaint"],
    [new Date(y,10,11),"Armistice"],
    [new Date(y,11,25),"Noël"],
  ];
  const map = {};
  list.forEach(([d,n]) => { map[fmt(d)] = n; });
  return map;
}

// ─── Utilitaires dates ────────────────────────────────────────────────────────
function isoWeekToMonday(year, week) {
  const jan4 = new Date(year, 0, 4);
  const dayOfWeek = jan4.getDay() || 7;
  const monday = new Date(jan4);
  monday.setDate(jan4.getDate() - (dayOfWeek - 1) + (week - 1) * 7);
  return monday;
}

function addDays(d, n) { return new Date(d.getTime() + n * 86400000); }

function fmtDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function fmtDateFR(d) {
  const jours = ["Dim","Lun","Mar","Mer","Jeu","Ven","Sam"];
  return `${jours[d.getDay()]} ${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}`;
}

function isWeekend(d) { return d.getDay()===0 || d.getDay()===6; }

function getISOWeek(d) {
  const tmp = new Date(d); tmp.setHours(0,0,0,0);
  tmp.setDate(tmp.getDate()+4-(tmp.getDay()||7));
  const jan1 = new Date(tmp.getFullYear(),0,1);
  return Math.ceil((((tmp-jan1)/86400000)+1)/7);
}

// ─── Haversine ────────────────────────────────────────────────────────────────
function haversine(lat1,lng1,lat2,lng2) {
  const R=6371, dLat=(lat2-lat1)*Math.PI/180, dLng=(lng2-lng1)*Math.PI/180;
  const a=Math.sin(dLat/2)**2+Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)**2;
  return R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));
}

function kmToZone(km) {
  if(km<10) return 1; if(km<20) return 2; if(km<30) return 3; if(km<40) return 4;
  if(km<50) return 5; if(km<60) return 6; if(km<70) return 7; if(km<90) return 8;
  if(km<110) return 9; return 10;
}

// ─── Structure données ────────────────────────────────────────────────────────
function defaultChantierJour() {
  return { chId: "", zoneForce: "" };
}

function defaultJour(dateStr, isFerie, ferieNom, isWE, sal) {
  const dow = new Date(dateStr).getDay(); // 0=dim,6=sam
  let heuresPre = "";
  if (!isWE && !isFerie) {
    if (sal.forfait) heuresPre = "7";
    else heuresPre = dow === 5 ? "3.68" : "7.83";
  }
  return {
    dateStr, isFerie, ferieNom: ferieNom||"", isWE,
    heures: heuresPre, heuresValidee: false,
    chantiers: [defaultChantierJour(), defaultChantierJour(), defaultChantierJour()],
    zoneRetenue: "", // auto ou forcée
    vehEnt: false,
    absent: isFerie||isWE, motifs: isFerie ? ["Jour férié"] : [],
    inclus: !isWE, // samedi/dimanche non inclus par défaut
  };
}

function defaultSaisie(sal, joursConfig) {
  const jours = {};
  joursConfig.forEach(jc => {
    jours[jc.dateStr] = defaultJour(jc.dateStr, jc.isFerie, jc.ferieNom, jc.isWE, sal);
  });
  return { salId: sal.id, jours, primes: [], observation: "" };
}

function buildJoursConfig(lundi, feries) {
  const configs = [];
  for (let i = 0; i < 7; i++) {
    const d = addDays(lundi, i);
    const ds = fmtDate(d);
    const we = isWeekend(d);
    const ferie = feries[ds];
    configs.push({ dateStr: ds, isFerie: !!ferie, ferieNom: ferie||"", isWE: we });
  }
  return configs;
}

function defaultSemaine(annee, numSem) {
  const lundi = isoWeekToMonday(annee, numSem);
  const feries = { ...getJoursFeries(annee-1), ...getJoursFeries(annee), ...getJoursFeries(annee+1) };
  const joursConfig = buildJoursConfig(lundi, feries);
  const saisies = {};
  SALARIES.forEach(s => { saisies[s.id] = defaultSaisie(s, joursConfig); });
  return { id: `${annee}-S${numSem}`, annee, numSem, lundi: fmtDate(lundi), joursConfig, saisies };
}

// ─── Calculs ──────────────────────────────────────────────────────────────────
function calcHS(totalH) {
  const norm = Math.min(totalH, HEURES_REF);
  const hs25 = Math.max(0, Math.min(totalH, SEUIL_HS50) - HEURES_REF);
  const hs50 = Math.max(0, totalH - SEUIL_HS50);
  return { norm, hs25, hs50 };
}

function getZoneJour(jour, chantiers) {
  if (jour.zoneRetenue) return parseInt(jour.zoneRetenue);
  let maxZone = 0;
  jour.chantiers.forEach(cj => {
    const ch = chantiers.find(c => c.id === cj.chId);
    if (ch) maxZone = Math.max(maxZone, parseInt(cj.zoneForce)||ch.zone||0);
    else if (cj.zoneForce) maxZone = Math.max(maxZone, parseInt(cj.zoneForce)||0);
  });
  return maxZone || 0;
}

function calcSemaineSal(saisie, sal, chantiers) {
  if (!saisie) return null;
  let totalH=0, paniers=0, absHeures=0;
  const trajet=Object.fromEntries(ZONES.map(z=>[z,0]));
  const transport=Object.fromEntries(ZONES.map(z=>[z,0]));
  const absMotifsSet = new Set();

  Object.values(saisie.jours).forEach(j => {
    if (!j.inclus) return;
    const h = parseFloat(j.heures)||0;
    if (j.absent || j.isFerie) {
      absHeures += sal.forfait ? 7 : (new Date(j.dateStr).getDay()===5 ? 3.68 : 7.83);
      (j.motifs||[]).forEach(m => absMotifsSet.add(m));
      return;
    }
    totalH += h;
    if (!sal.forfait) {
      if (h > 4) paniers++;
      const zone = getZoneJour(j, chantiers);
      if (zone > 0) {
        trajet[zone]++;
        if (!j.vehEnt) transport[zone]++;
      }
    }
  });

  const { norm, hs25, hs50 } = sal.forfait ? {norm:0,hs25:0,hs50:0} : calcHS(totalH);
  const primesTotal = (saisie.primes||[]).reduce((a,p)=>a+(parseFloat(p.montant)||0),0);
  return { norm, hs25, hs50, totalH, absHeures, absMots:[...absMotifsSet], paniers, trajet, transport, primesTotal, primes: saisie.primes||[] };
}

function cumulMois(semaines, salId, chantiers) {
  const sal = SALARIES.find(s=>s.id===salId);
  let norm=0,hs25=0,hs50=0,paniers=0,primes=0;
  const trajet=Object.fromEntries(ZONES.map(z=>[z,0]));
  const transport=Object.fromEntries(ZONES.map(z=>[z,0]));
  const toutePrimes=[];
  const toutesAbsences=[];
  semaines.forEach(sem=>{
    const r=calcSemaineSal(sem.saisies[salId],sal,chantiers);
    if(!r) return;
    norm+=r.norm; hs25+=r.hs25; hs50+=r.hs50;
    paniers+=r.paniers; primes+=r.primesTotal;
    ZONES.forEach(z=>{trajet[z]+=r.trajet[z]; transport[z]+=r.transport[z];});
    toutePrimes.push(...r.primes);
    // Absences structurées
    const absences=(sem.saisies[salId]?.absences)||[];
    toutesAbsences.push(...absences);
  });
  // Cumul heures absence
  const absH=toutesAbsences.reduce((a,ab)=>a+(parseFloat(ab.heures)||0),0);
  return {norm,hs25,hs50,absH,paniers,trajet,transport,primes,toutePrimes,toutesAbsences};
}

function zoneColor(z) {
  const c=["","#2ecc71","#27ae60","#f1c40f","#e67e22","#e74c3c","#9b59b6","#3498db","#1abc9c","#e91e63","#607d8b"];
  return c[z]||"#999";
}

// ─── Export CSV ───────────────────────────────────────────────────────────────
function exportCSV(semMois, extras, chantiers, moisIdx, annee) {
  if(!semMois.length){alert("Aucune donnée.");return;}
  const rows=[];
  rows.push(`ENTREPRISE HUBERT PEINTURE – Variables de paie – ${MOIS_NOMS[moisIdx-1]} ${annee}`);
  rows.push("");
  const hdr=["SALARIÉ","Coef.","H norm.","HS 25%","HS 50%","Abs. Heures","Dates absence","Motif absence",
    ...ZONES.map(z=>`Trajet Z${z}`),...ZONES.map(z=>`Transport Z${z}`),
    "Primes €","Détail primes","Acompte €","Saisie arrêt €","Observations"];
  rows.push(hdr.join(";"));
  SALARIES.forEach(sal=>{
    const ex=extras[sal.id]||{};
    if(sal.forfait){
      rows.push([sal.nom,"Cadre","","","","","",
        ...ZONES.map(()=>""),...ZONES.map(()=>""),"","",
        ex.acompte||"",ex.saisieArr||"",
        ex.fraisPro?`Frais pro: ${ex.fraisPro}€`:""].join(";"));
      return;
    }
    const c=cumulMois(semMois,sal.id,chantiers);
    const detailPrimes=c.toutePrimes.map(p=>`${p.libelle||"Prime"}: ${p.montant}€${p.chantierNom?" ("+p.chantierNom+")":""}`).join(" | ");
    // Une ligne par absence
    const absLignes=c.toutesAbsences.filter(a=>a.heures||a.motif);
    if(absLignes.length===0){
      rows.push([sal.nom,sal.coef,c.norm.toFixed(2),c.hs25.toFixed(2),c.hs50.toFixed(2),
        "","","",
        ...ZONES.map(z=>c.trajet[z]||""),...ZONES.map(z=>c.transport[z]||""),
        c.primes.toFixed(2),detailPrimes,
        ex.acompte||"",ex.saisieArr||"",ex.obs||""].join(";"));
    } else {
      absLignes.forEach((ab,i)=>{
        const dateStr=ab.dateDebut&&ab.dateFin?`du ${ab.dateDebut} au ${ab.dateFin}`:ab.dateDebut||"";
        rows.push([i===0?sal.nom:"",i===0?sal.coef:"",
          i===0?c.norm.toFixed(2):"",i===0?c.hs25.toFixed(2):"",i===0?c.hs50.toFixed(2):"",
          ab.heures||"",dateStr,ab.motif||"",
          ...(i===0?ZONES.map(z=>c.trajet[z]||""):ZONES.map(()=>"")),
          ...(i===0?ZONES.map(z=>c.transport[z]||""):ZONES.map(()=>"")),
          i===0?c.primes.toFixed(2):"",i===0?detailPrimes:"",
          i===0?ex.acompte||"":"",i===0?ex.saisieArr||"":"",i===0?ex.obs||"":""].join(";"));
      });
    }
  });
  const blob=new Blob(["\uFEFF"+rows.join("\n")],{type:"text/csv;charset=utf-8;"});
  const url=URL.createObjectURL(blob);
  const a=document.createElement("a");
  a.href=url; a.download=`Saisie_EV_${MOIS_NOMS[moisIdx-1]}_${annee}.csv`;
  a.click(); URL.revokeObjectURL(url);
}

// ═══════════════════════════════════════════════════════════════════════════════
// APP
// ═══════════════════════════════════════════════════════════════════════════════
export default function App() {
  const now = new Date();
  const curWeek = getISOWeek(now);
  const [annee, setAnnee]         = useState(now.getFullYear());
  const [mois, setMois]           = useState(now.getMonth()+1);
  const [semaines, setSemaines]   = useState([]);
  const [semId, setSemId]         = useState(null);
  const [salId, setSalId]         = useState(1);
  const [extras, setExtras]       = useState({});
  const [chantiers, setChantiers] = useState([]);
  const [vue, setVue]             = useState("saisie");
  const [toast, setToast]         = useState({msg:"",ok:true});
  const [geoLoading, setGeoLoading] = useState(false);
  const [newCh, setNewCh]         = useState({nom:"",adresse:"",ville:""});
  const [newNumSem, setNewNumSem] = useState(curWeek);
  const [newAnnee, setNewAnnee]   = useState(now.getFullYear());

  const [syncing, setSyncing] = useState(true);

  useEffect(()=>{
    async function charger() {
      const data = await fbLoad();
      if (data) {
        if(data.semaines)  setSemaines(data.semaines);
        if(data.extras)    setExtras(data.extras);
        if(data.chantiers) setChantiers(data.chantiers);
      } else {
        try {
          const d = JSON.parse(localStorage.getItem(STORAGE_KEY)||"{}");
          if(d.semaines)  setSemaines(d.semaines);
          if(d.extras)    setExtras(d.extras);
          if(d.chantiers) setChantiers(d.chantiers);
        } catch(e) {}
      }
      setSyncing(false);
    }
    charger();
  },[]);

  useEffect(()=>{
    if (syncing) return;
    const data = {semaines, extras, chantiers};
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    fbSave(data);
  },[semaines, extras, chantiers]);

  function showToast(msg,ok=true){setToast({msg,ok});setTimeout(()=>setToast({msg:"",ok:true}),3500);}

  const semMois  = semaines.filter(s=>s.annee===annee && s.joursConfig.some(j=>new Date(j.dateStr).getMonth()===mois-1));
  const semaine  = semaines.find(s=>s.id===semId);
  const sal      = SALARIES.find(s=>s.id===salId);
  const saisieAct= semaine?.saisies[salId];
  const calcSem  = semaine&&saisieAct ? calcSemaineSal(saisieAct,sal,chantiers) : null;

  function ajouterSemaine(){
    const existant=semaines.find(s=>s.annee===newAnnee&&s.numSem===newNumSem);
    if(existant){setSemId(existant.id);showToast("Cette semaine existe déjà",false);return;}
    const sem=defaultSemaine(newAnnee,newNumSem);
    setSemaines(p=>[...p,sem].sort((a,b)=>a.annee!==b.annee?a.annee-b.annee:a.numSem-b.numSem));
    setSemId(sem.id);
    showToast(`Semaine ${newNumSem} — ${sem.joursConfig[0]?fmtDateFR(new Date(sem.joursConfig[0].dateStr)):""} ajoutée ✓`);
  }

  function supprimerSemaine(id){
    if(!window.confirm("Supprimer cette semaine ?"))return;
    setSemaines(p=>p.filter(s=>s.id!==id));
    if(semId===id)setSemId(null);
  }

  function updateJour(dateStr,field,val){
    setSemaines(p=>p.map(s=>{
      if(s.id!==semId)return s;
      const saisie=s.saisies[salId];
      const j=saisie.jours[dateStr];
      return{...s,saisies:{...s.saisies,[salId]:{...saisie,jours:{...saisie.jours,[dateStr]:{...j,[field]:val}}}}};
    }));
  }

  function updateChantierJour(dateStr,idx,field,val){
    setSemaines(p=>p.map(s=>{
      if(s.id!==semId)return s;
      const saisie=s.saisies[salId];
      const j=saisie.jours[dateStr];
      const ch=[...j.chantiers];
      ch[idx]={...ch[idx],[field]:val};
      return{...s,saisies:{...s.saisies,[salId]:{...saisie,jours:{...saisie.jours,[dateStr]:{...j,chantiers:ch}}}}};
    }));
  }

  function toggleVehAll(){
    if(!semaine||!saisieAct)return;
    const actifs=Object.values(saisieAct.jours).filter(j=>j.inclus&&!j.absent&&!j.isFerie);
    const tousCoches=actifs.every(j=>j.vehEnt);
    setSemaines(p=>p.map(s=>{
      if(s.id!==semId)return s;
      const saisie=s.saisies[salId];
      const newJours={};
      Object.entries(saisie.jours).forEach(([ds,j])=>{
        newJours[ds]={...j,vehEnt:(j.inclus&&!j.absent&&!j.isFerie)?!tousCoches:j.vehEnt};
      });
      return{...s,saisies:{...s.saisies,[salId]:{...saisie,jours:newJours}}};
    }));
  }

  function updateMotifs(dateStr,motif,checked){
    setSemaines(p=>p.map(s=>{
      if(s.id!==semId)return s;
      const saisie=s.saisies[salId];
      const j=saisie.jours[dateStr];
      const motifs=checked?[...(j.motifs||[]),motif]:(j.motifs||[]).filter(m=>m!==motif);
      return{...s,saisies:{...s.saisies,[salId]:{...saisie,jours:{...saisie.jours,[dateStr]:{...j,motifs}}}}};
    }));
  }

  function validerTousJours(){
    setSemaines(p=>p.map(s=>{
      if(s.id!==semId)return s;
      const saisie=s.saisies[salId];
      const newJours={};
      Object.entries(saisie.jours).forEach(([ds,j])=>{
        newJours[ds]={...j,heuresValidee:true};
      });
      return{...s,saisies:{...s.saisies,[salId]:{...saisie,jours:newJours}}};
    }));
  }

  function ajouterPrime(){
    setSemaines(p=>p.map(s=>{
      if(s.id!==semId)return s;
      const saisie=s.saisies[salId];
      const primes=[...(saisie.primes||[]),{id:Date.now().toString(),montant:"",libelle:"",chantierNom:"",semId:semId}];
      return{...s,saisies:{...s.saisies,[salId]:{...saisie,primes}}};
    }));
  }

  function updatePrime(primeId,field,val){
    // Vérif doublon chantier+salarié
    if(field==="chantierNom"&&val){
      const existeDeja=semaines.some(s=>s.id!==semId&&s.saisies[salId]?.primes?.some(p=>p.chantierNom===val));
      if(existeDeja) showToast(`⚠️ Une prime existe déjà pour ${sal.nom} sur "${val}" dans un autre mois`,false);
    }
    setSemaines(p=>p.map(s=>{
      if(s.id!==semId)return s;
      const saisie=s.saisies[salId];
      const primes=(saisie.primes||[]).map(p=>p.id===primeId?{...p,[field]:val}:p);
      return{...s,saisies:{...s.saisies,[salId]:{...saisie,primes}}};
    }));
  }

  function supprimerPrime(primeId){
    setSemaines(p=>p.map(s=>{
      if(s.id!==semId)return s;
      const saisie=s.saisies[salId];
      const primes=(saisie.primes||[]).filter(p=>p.id!==primeId);
      return{...s,saisies:{...s.saisies,[salId]:{...saisie,primes}}};
    }));
  }

  function ajouterAbsence(){
    setSemaines(p=>p.map(s=>{
      if(s.id!==semId)return s;
      const saisie=s.saisies[salId];
      const absences=[...(saisie.absences||[]),{id:Date.now().toString(),heures:"",dateDebut:"",dateFin:"",motif:""}];
      return{...s,saisies:{...s.saisies,[salId]:{...saisie,absences}}};
    }));
  }

  function updateAbsence(absId,field,val){
    setSemaines(p=>p.map(s=>{
      if(s.id!==semId)return s;
      const saisie=s.saisies[salId];
      const absences=(saisie.absences||[]).map(a=>a.id===absId?{...a,[field]:val}:a);
      return{...s,saisies:{...s.saisies,[salId]:{...saisie,absences}}};
    }));
  }

  function supprimerAbsence(absId){
    setSemaines(p=>p.map(s=>{
      if(s.id!==semId)return s;
      const saisie=s.saisies[salId];
      const absences=(saisie.absences||[]).filter(a=>a.id!==absId);
      return{...s,saisies:{...s.saisies,[salId]:{...saisie,absences}}};
    }));
  }

  function updateExtra(sId,field,val){setExtras(p=>({...p,[sId]:{...(p[sId]||{}),[field]:val}}));}

  // Géolocalisation
  async function ajouterChantier(){
    if(!newCh.nom||!newCh.ville){showToast("❌ Nom et ville requis",false);return;}
    setGeoLoading(true);
    try{
      const q=`${newCh.adresse} ${newCh.ville} France`.trim();
      const res=await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=1`,{headers:{"Accept-Language":"fr","User-Agent":"HubertPeinture/1.0"}});
      const data=await res.json();
      if(!data.length)throw new Error();
      const lat=parseFloat(data[0].lat),lng=parseFloat(data[0].lon);
      const km=haversine(DEPOT.lat,DEPOT.lng,lat,lng);
      const zone=kmToZone(km);
      const ch={id:Date.now().toString(),nom:newCh.nom,adresse:newCh.adresse,ville:newCh.ville,lat,lng,km:Math.round(km*10)/10,zone};
      setChantiers(p=>[...p,ch]);
      setNewCh({nom:"",adresse:"",ville:""});
      showToast(`✓ ${ch.nom} — Zone ${zone} (${ch.km} km à vol d'oiseau)`);
    }catch(e){showToast("❌ Adresse introuvable",false);}
    setGeoLoading(false);
  }

  // ─── Rendu jours ──────────────────────────────────────────────────────────
  function renderJours(){
    if(!semaine||!saisieAct) return null;
    const joursAffich=semaine.joursConfig.filter(jc=>jc.inclus!==false);
    const jours=Object.values(saisieAct.jours).filter(j=>j.inclus);
    const absManquantes=calcSem&&calcSem.totalH<HEURES_REF&&!sal.forfait;

    return(
      <div>
        {/* Boutons validation globale + veh all */}
        <div style={S.jourActions}>
          <button style={S.btnValAll} onClick={validerTousJours}>✓ Valider toutes les heures</button>
          <div style={S.vehAllWrap}>
            <input type="checkbox" id="vehAll"
              checked={jours.filter(j=>!j.absent&&!j.isFerie).every(j=>j.vehEnt)}
              onChange={toggleVehAll}/>
            <label htmlFor="vehAll" style={S.vehAllLbl}>🚐 Véhicule entreprise toute la semaine</label>
          </div>
        </div>

        {absManquantes&&(
          <div style={S.absAlert}>
            ⚠️ Total semaine : {calcSem.totalH.toFixed(2)}h — inférieur à 35h, veuillez renseigner les absences
          </div>
        )}

        <div style={{overflowX:"auto"}}>
          <table style={S.jtbl}>
            <thead>
              <tr>
                <th style={S.jth}>Jour</th>
                <th style={S.jth}>Heures</th>
                <th style={S.jth}>Chantier(s) / Zone</th>
                <th style={S.jth} title="Véhicule entreprise">🚐</th>
                <th style={S.jth}>Absent</th>
                <th style={S.jth}>Motif(s) absence</th>
              </tr>
            </thead>
            <tbody>
              {semaine.joursConfig.map((jc,idx)=>{
                const j=saisieAct.jours[jc.dateStr];
                if(!j) return null;
                const d=new Date(jc.dateStr);
                const h=parseFloat(j.heures)||0;
                const pan=!j.absent&&!j.isFerie&&h>4;
                const dow=d.getDay();
                let rowBg="#fff";
                if(j.isFerie) rowBg="#fff3cd";
                else if(jc.isWE) rowBg="#f8d7da";
                else if(idx%2===0) rowBg="#f8fafc";

                // Style heures selon validation
                const hStyle=j.heuresValidee
                  ?{...S.hInput,color:"#1a3a5c",fontWeight:700}
                  :{...S.hInput,color:"#aaa"};

                // Zone calculée
                const zoneAuto=getZoneJour(j,chantiers);

                return(
                  <tr key={jc.dateStr} style={{background:rowBg}}>
                    <td style={S.jtd}>
                      <div style={S.jourNomWrap}>
                        <span style={{...S.jourNom,...(jc.isWE?{color:"#e74c3c"}:{}),...(j.isFerie?{color:"#e67e22",fontWeight:700}:{})}}>
                          {fmtDateFR(d)}
                        </span>
                        {j.isFerie&&<span style={S.ferieBadge} title={j.ferieNom}>🗓 {j.ferieNom}</span>}
                        {pan&&<span title="Panier dû">🍽</span>}
                        {j.vehEnt&&!j.absent&&<span title="Veh. entreprise">🚐</span>}
                      </div>
                      {jc.isWE&&!j.inclus&&(
                        <button style={S.btnInclure} onClick={()=>updateJour(jc.dateStr,"inclus",true)}>
                          + Inclure (travail exceptionnel)
                        </button>
                      )}
                    </td>
                    <td style={S.jtd}>
                      {!j.absent&&!j.isFerie?(
                        <div style={S.hWrap}>
                          <input type="number" min="0" max="12" step="0.5"
                            style={hStyle} value={j.heures||""}
                            onChange={e=>updateJour(jc.dateStr,"heures",e.target.value)}/>
                          <button style={{...S.btnVal,...(j.heuresValidee?S.btnValOn:{})}}
                            onClick={()=>updateJour(jc.dateStr,"heuresValidee",!j.heuresValidee)}
                            title={j.heuresValidee?"Validé — cliquer pour modifier":"Cliquer pour valider"}>
                            {j.heuresValidee?"✓":"?"}
                          </button>
                        </div>
                      ):<span style={{color:"#ccc",fontSize:12}}>—</span>}
                    </td>
                    <td style={S.jtd}>
                      {!j.absent&&!j.isFerie&&!sal.forfait?(
                        <div style={S.chWrap}>
                          {j.chantiers.map((cj,ci)=>{
                            const chObj=chantiers.find(c=>c.id===cj.chId);
                            return(
                              <div key={ci} style={S.chRow}>
                                <select style={S.chSel} value={cj.chId}
                                  onChange={e=>updateChantierJour(jc.dateStr,ci,"chId",e.target.value)}>
                                  <option value="">{ci===0?"— chantier —":"+ 2e chantier"}</option>
                                  {chantiers.map(c=><option key={c.id} value={c.id}>{c.nom} · Z{c.zone}</option>)}
                                </select>
                                {cj.chId&&(
                                  <input type="number" min="1" max="10" placeholder="Z" title="Forcer la zone"
                                    style={S.zForce} value={cj.zoneForce}
                                    onChange={e=>updateChantierJour(jc.dateStr,ci,"zoneForce",e.target.value)}/>
                                )}
                              </div>
                            );
                          })}
                          {zoneAuto>0&&(
                            <div style={S.zAutoWrap}>
                              <span style={{...S.zBadgeSm,background:zoneColor(zoneAuto)}}>Z{zoneAuto} retenue</span>
                              <input type="number" min="1" max="10" placeholder="Forcer zone"
                                style={S.zForceGlobal} value={j.zoneRetenue}
                                onChange={e=>updateJour(jc.dateStr,"zoneRetenue",e.target.value)}
                                title="Forcer la zone globale"/>
                            </div>
                          )}
                        </div>
                      ):<span style={{color:"#ccc",fontSize:12}}>—</span>}
                    </td>
                    <td style={{...S.jtd,textAlign:"center"}}>
                      {!j.absent&&!j.isFerie&&(
                        <input type="checkbox" checked={j.vehEnt||false}
                          onChange={e=>updateJour(jc.dateStr,"vehEnt",e.target.checked)}/>
                      )}
                    </td>
                    <td style={{...S.jtd,textAlign:"center"}}>
                      {!j.isFerie&&(
                        <input type="checkbox" checked={j.absent||false}
                          onChange={e=>{
                            updateJour(jc.dateStr,"absent",e.target.checked);
                            if(e.target.checked) updateJour(jc.dateStr,"heures","");
                          }}/>
                      )}
                    </td>
                    <td style={S.jtd}>
                      {(j.absent||j.isFerie)&&(
                        <div style={S.motifsWrap}>
                          <select style={S.sel2} value=""
                            onChange={e=>{if(e.target.value&&!(j.motifs||[]).includes(e.target.value))
                              updateMotifs(jc.dateStr,e.target.value,true);}}>
                            <option value="">+ Ajouter motif</option>
                            {MOTIFS_ABS.filter(m=>!(j.motifs||[]).includes(m)).map(m=><option key={m}>{m}</option>)}
                          </select>
                          <div style={S.motifsChips}>
                            {(j.motifs||[]).map(m=>(
                              <span key={m} style={S.motifChip}>
                                {m}
                                {!j.isFerie&&<button style={S.motifX}
                                  onClick={()=>updateMotifs(jc.dateStr,m,false)}>×</button>}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Récap zones */}
        {calcSem&&ZONES.some(z=>calcSem.trajet[z]>0)&&(
          <div style={S.zRec}>
            <div style={S.zRecTitre}>Récap zones cette semaine</div>
            <div style={S.zRecRow}>
              {ZONES.map(z=>calcSem.trajet[z]>0&&(
                <span key={z} style={S.zChip}>
                  <span style={{...S.zChipZ,background:zoneColor(z)}}>Z{z}</span>
                  <span style={S.zChipT}>Tj:{calcSem.trajet[z]}</span>
                  <span style={S.zChipTr}>Tr:{calcSem.transport[z]}</span>
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  // ─── RENDU PRINCIPAL ──────────────────────────────────────────────────────
  return(
    <div style={S.root}>
      {/* HEADER */}
      <div style={S.header}>
        <div style={S.headerL}>
          <div style={S.logo}>H</div>
          <div>
            <div style={S.htitle}>HUBERT PEINTURE</div>
            <div style={S.hsub}>Variables de paie · Convention Bâtiment &lt;10 salariés</div>
          </div>
        </div>
        <div style={S.headerR}>
          {syncing && <span style={S.syncBadge}>⏳ Chargement…</span>}
          <select style={S.hsel} value={mois} onChange={e=>setMois(+e.target.value)}>
            {MOIS_NOMS.map((m,i)=><option key={i} value={i+1}>{m}</option>)}
          </select>
          <select style={S.hsel} value={annee} onChange={e=>setAnnee(+e.target.value)}>
            {[2025,2026,2027,2028].map(a=><option key={a}>{a}</option>)}
          </select>
        </div>
      </div>

      {/* NAV */}
      <div style={S.nav}>
        {[["saisie","📝 Saisie semaine"],["recap","📊 Récap mensuel"],["chantiers","📍 Chantiers"]].map(([k,l])=>(
          <button key={k} style={{...S.navBtn,...(vue===k?S.navOn:{})}} onClick={()=>setVue(k)}>{l}</button>
        ))}
      </div>

      {toast.msg&&<div style={{...S.toast,...(!toast.ok?S.toastErr:{})}}>{toast.msg}</div>}

      {/* ══ SAISIE ══ */}
      {vue==="saisie"&&(
        <div style={S.body}>
          {/* Ajout semaine */}
          <div style={S.semAddBar}>
            <span style={S.semTitle}>Ajouter une semaine :</span>
            <input type="number" min="1" max="53" style={S.numInput}
              value={newNumSem} onChange={e=>setNewNumSem(+e.target.value)}
              placeholder="N° semaine"/>
            <select style={S.selAnnee} value={newAnnee} onChange={e=>setNewAnnee(+e.target.value)}>
              {[2025,2026,2027,2028].map(a=><option key={a}>{a}</option>)}
            </select>
            {newNumSem&&newAnnee&&(()=>{
              const lundi=isoWeekToMonday(newAnnee,newNumSem);
              const ven=addDays(lundi,4);
              return<span style={S.semPreview}>{fmtDateFR(lundi)} → {fmtDateFR(ven)}</span>;
            })()}
            <button style={S.btnAddSem} onClick={ajouterSemaine}>+ Ajouter</button>
          </div>

          {/* Liste semaines */}
          {semMois.length>0&&(
            <div style={S.semBar}>
              <span style={S.semTitle2}>Semaines — {MOIS_NOMS[mois-1]} {annee} :</span>
              <div style={S.semBtns}>
                {semMois.map(s=>{
                  const lundi=new Date(s.lundi);
                  return(
                    <div key={s.id} style={S.semWrap}>
                      <button style={{...S.semBtn,...(semId===s.id?S.semOn:{})}} onClick={()=>setSemId(s.id)}>
                        S{s.numSem} · {fmtDateFR(lundi)}
                      </button>
                      {semId===s.id&&(
                        <button style={S.semX} onClick={()=>supprimerSemaine(s.id)}>✕</button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {!semaine&&(
            <div style={S.vide}><div style={S.videIco}>📋</div><div>Saisissez un numéro de semaine et cliquez "+ Ajouter"</div></div>
          )}

          {semaine&&(
            <div style={S.grid}>
              {/* SIDEBAR */}
              <div style={S.sidebar}>
                <div style={S.sideTop}>
                  <div style={S.sideTitre}>Salariés</div>
                  <div style={S.sideInfo}>
                    Sem. {semaine.numSem} · {semaine.joursConfig[0]?fmtDateFR(new Date(semaine.joursConfig[0].dateStr)):""} au {semaine.joursConfig[4]?fmtDateFR(new Date(semaine.joursConfig[4].dateStr)):""}
                  </div>
                </div>
                {SALARIES.map(s=>{
                  const sai=semaine.saisies[s.id];
                  const ok=sai&&Object.values(sai.jours).some(j=>parseFloat(j.heures)>0||j.absent);
                  const valide=sai&&Object.values(sai.jours).filter(j=>j.inclus&&!j.absent&&!j.isFerie).every(j=>j.heuresValidee);
                  return(
                    <div key={s.id} style={{...S.salCard,...(salId===s.id?S.salOn:{}),...(valide&&ok?{borderLeftColor:"#27ae60"}:{})}}
                      onClick={()=>setSalId(s.id)}>
                      <div style={S.salNom}>{s.nom}</div>
                      <div style={S.salSub}>{s.forfait?"Cadre forfait":`Coef. ${s.coef}`}</div>
                      {ok&&<span style={{...S.okBadge,...(valide?{color:"#27ae60"}:{color:"#e67e22"})}}>
                        {valide?"✓":"~"}
                      </span>}
                    </div>
                  );
                })}
              </div>

              {/* FORMULAIRE */}
              <div style={S.form}>
                <div style={S.formTop}>
                  <div>
                    <div style={S.formNom}>{sal.nom}</div>
                    <div style={S.formSub}>{sal.forfait?"Cadre — forfait":`Ouvrier · Coef. ${sal.coef} · Base 35h/sem.`}</div>
                  </div>
                  {calcSem&&!sal.forfait&&(
                    <div style={S.pills}>
                      <Pill label="H norm." val={calcSem.norm.toFixed(1)} color="#1a3a5c"/>
                      <Pill label="HS 25%" val={calcSem.hs25.toFixed(1)} color="#e67e22" dim={calcSem.hs25===0}/>
                      <Pill label="HS 50%" val={calcSem.hs50.toFixed(1)} color="#c0392b" dim={calcSem.hs50===0}/>
                      <Pill label="Paniers" val={calcSem.paniers} color="#27ae60"/>
                    </div>
                  )}
                </div>

                {/* Jours */}
                <Sec titre="📅 Jours de la semaine">{renderJours()}</Sec>

                {/* Absences */}
                <Sec titre="🏥 Absences de la semaine">
                  <div style={S.absNote}>Une ligne par période d'absence — ces données alimentent directement le Saisie EV.</div>
                  {(saisieAct.absences||[]).map((ab,ai)=>(
                    <div key={ab.id} style={S.absRow}>
                      <F label="Nb heures" value={ab.heures} type="number"
                        onChange={v=>updateAbsence(ab.id,"heures",v)} placeholder="ex: 7.83"/>
                      <div style={{display:"flex",flexDirection:"column",gap:4}}>
                        <label style={{fontSize:11,fontWeight:600,color:"#666"}}>Du</label>
                        <input type="date" style={S.inputDate} value={ab.dateDebut||""}
                          onChange={e=>updateAbsence(ab.id,"dateDebut",e.target.value)}/>
                      </div>
                      <div style={{display:"flex",flexDirection:"column",gap:4}}>
                        <label style={{fontSize:11,fontWeight:600,color:"#666"}}>Au</label>
                        <input type="date" style={S.inputDate} value={ab.dateFin||""}
                          onChange={e=>updateAbsence(ab.id,"dateFin",e.target.value)}/>
                      </div>
                      <div style={{display:"flex",flexDirection:"column",gap:4}}>
                        <label style={{fontSize:11,fontWeight:600,color:"#666"}}>Motif</label>
                        <select style={S.sel2} value={ab.motif||""}
                          onChange={e=>updateAbsence(ab.id,"motif",e.target.value)}>
                          <option value="">— Motif —</option>
                          {MOTIFS_ABS.map(m=><option key={m}>{m}</option>)}
                        </select>
                      </div>
                      <button style={{...S.btnDel,alignSelf:"flex-end"}} onClick={()=>supprimerAbsence(ab.id)}>✕</button>
                    </div>
                  ))}
                  <button style={S.btnAddPrime} onClick={ajouterAbsence}>+ Ajouter une absence</button>
                </Sec>

                {/* Primes */}
                {!sal.forfait&&(
                  <Sec titre="💰 Primes de chantier">
                    {(saisieAct.primes||[]).map(p=>(
                      <div key={p.id} style={S.primeRow}>
                        <F label="Montant (€)" value={p.montant} type="number"
                          onChange={v=>updatePrime(p.id,"montant",v)}/>
                        <F label="Libellé" value={p.libelle}
                          onChange={v=>updatePrime(p.id,"libelle",v)} placeholder="ex: Prime productivité"/>
                        <F label="Chantier concerné" value={p.chantierNom}
                          onChange={v=>updatePrime(p.id,"chantierNom",v)} placeholder="ex: M. Dupont"/>
                        <button style={{...S.btnDel,alignSelf:"flex-end"}} onClick={()=>supprimerPrime(p.id)}>✕</button>
                      </div>
                    ))}
                    <button style={S.btnAddPrime} onClick={ajouterPrime}>+ Ajouter une prime</button>
                  </Sec>
                )}

                {/* Données mensuelles */}
                <Sec titre="📌 Données mensuelles">
                  <div style={S.r3}>
                    {sal.forfait&&(
                      <F label="Frais pro mensuels (€)" value={(extras[1]||{}).fraisPro||""} type="number"
                        onChange={v=>updateExtra(1,"fraisPro",v)}/>
                    )}
                    <F label="Acompte versé (€)" value={(extras[salId]||{}).acompte||""} type="number"
                      onChange={v=>updateExtra(salId,"acompte",v)}/>
                    <F label="Saisie arrêt sur salaire (€)" value={(extras[salId]||{}).saisieArr||""} type="number"
                      onChange={v=>updateExtra(salId,"saisieArr",v)}/>
                    <F label="Observations" value={(extras[salId]||{}).obs||""}
                      onChange={v=>updateExtra(salId,"obs",v)}/>
                  </div>
                </Sec>

                {/* Nav salariés */}
                <div style={S.navSal}>
                  {salId>1&&<button style={S.btnPrev} onClick={()=>setSalId(salId-1)}>← {SALARIES[salId-2].nom}</button>}
                  <div/>
                  {salId<SALARIES.length&&<button style={S.btnNext} onClick={()=>setSalId(salId+1)}>{SALARIES[salId].nom} →</button>}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ══ RÉCAP ══ */}
      {vue==="recap"&&(
        <div style={S.body}>
          <div style={S.recapBar}>
            <div style={S.bigTitle}>Récapitulatif — {MOIS_NOMS[mois-1]} {annee}</div>
            <button style={S.btnExp} onClick={()=>exportCSV(semMois,extras,chantiers,mois,annee)}>⬇ Exporter CSV</button>
          </div>
          {semMois.length===0&&<div style={S.vide}><div style={S.videIco}>📊</div><div>Aucune semaine pour ce mois.</div></div>}
          {semMois.length>0&&(
            <>
              <div style={{overflowX:"auto",marginBottom:28}}>
                <table style={S.rtbl}>
                  <thead><tr>
                    <th style={{...S.rth,textAlign:"left",minWidth:170}}>Salarié</th>
                    <th style={S.rth}>H norm.</th><th style={S.rth}>HS 25%</th><th style={S.rth}>HS 50%</th>
                    <th style={S.rth}>Abs. H</th><th style={S.rth}>Paniers</th><th style={S.rth}>Primes €</th>
                    <th style={S.rth}>Acompte</th><th style={S.rth}>Saisie arrêt</th>
                    <th style={{...S.rth,minWidth:160}}>Observations</th>
                  </tr></thead>
                  <tbody>
                    {SALARIES.map((s,i)=>{
                      const ex=extras[s.id]||{};
                      if(s.forfait) return(
                        <tr key={s.id} style={i%2===0?S.trEven:{}}>
                          <td style={S.rtdN}><b>{s.nom}</b><div style={S.rtdSub}>Cadre forfait</div></td>
                          <td style={S.rtd} colSpan={6}>—</td>
                          <td style={S.rtd}>{ex.acompte||"—"}</td>
                          <td style={S.rtd}>{ex.saisieArr||"—"}</td>
                          <td style={S.rtd}>{ex.fraisPro?`Frais pro: ${ex.fraisPro}€`:"—"}</td>
                        </tr>
                      );
                      const c=cumulMois(semMois,s.id,chantiers);
                      return(
                        <tr key={s.id} style={i%2===0?S.trEven:{}}>
                          <td style={S.rtdN}><b>{s.nom}</b><div style={S.rtdSub}>Coef. {s.coef}</div></td>
                          <td style={S.rtd}>{c.norm.toFixed(2)}</td>
                          <td style={{...S.rtd,color:c.hs25>0?"#e67e22":"#ccc",fontWeight:c.hs25>0?700:400}}>{c.hs25.toFixed(2)}</td>
                          <td style={{...S.rtd,color:c.hs50>0?"#c0392b":"#ccc",fontWeight:c.hs50>0?700:400}}>{c.hs50.toFixed(2)}</td>
                          <td style={{...S.rtd,color:c.absH>0?"#8e44ad":"#ccc"}}>{c.absH.toFixed(2)}</td>
                          <td style={S.rtd}>{c.paniers}</td>
                          <td style={S.rtd}>{c.primes>0?c.primes.toFixed(2):"—"}</td>
                          <td style={S.rtd}>{ex.acompte||"—"}</td>
                          <td style={S.rtd}>{ex.saisieArr||"—"}</td>
                          <td style={S.rtd}>{ex.obs||"—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div style={S.secTitre2}>Trajets & Transports par zone</div>
              <div style={{overflowX:"auto"}}>
                <table style={S.rtbl}>
                  <thead><tr>
                    <th style={{...S.rth,textAlign:"left",minWidth:170}}>Salarié</th>
                    {ZONES.map(z=><th key={`tj${z}`} style={{...S.rth,background:"#1a3a5c"}}>Z{z} Tj</th>)}
                    {ZONES.map(z=><th key={`tr${z}`} style={{...S.rth,background:"#0d2137"}}>Z{z} Tr</th>)}
                  </tr></thead>
                  <tbody>
                    {SALARIES.filter(s=>!s.forfait).map((s,i)=>{
                      const c=cumulMois(semMois,s.id,chantiers);
                      return(
                        <tr key={s.id} style={i%2===0?S.trEven:{}}>
                          <td style={S.rtdN}><b>{s.nom}</b></td>
                          {ZONES.map(z=><td key={`tj${z}`} style={S.rtd}>{c.trajet[z]||"—"}</td>)}
                          {ZONES.map(z=><td key={`tr${z}`} style={{...S.rtd,background:"#f0f5ff"}}>{c.transport[z]||"—"}</td>)}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      {/* ══ CHANTIERS ══ */}
      {vue==="chantiers"&&(
        <div style={S.body}>
          <div style={S.recapBar}>
            <div style={S.bigTitle}>📍 Répertoire des chantiers</div>
            <div style={S.depotTag}>🏢 Dépôt : {DEPOT.nom}</div>
          </div>
          <div style={S.chBox}>
            <div style={S.chBoxTitre}>Ajouter un chantier</div>
            <div style={S.r3}>
              <F label="Nom / Client *" value={newCh.nom} onChange={v=>setNewCh(p=>({...p,nom:v}))} placeholder="ex: M. Dupont"/>
              <F label="Adresse" value={newCh.adresse} onChange={v=>setNewCh(p=>({...p,adresse:v}))} placeholder="ex: 12 rue de la Paix"/>
              <F label="Ville *" value={newCh.ville} onChange={v=>setNewCh(p=>({...p,ville:v}))} placeholder="ex: Rouen"/>
            </div>
            <div style={S.chBtnRow}>
              <button style={S.btnGeo} onClick={ajouterChantier} disabled={geoLoading}>
                {geoLoading?"⏳ Calcul…":"📍 Géolocaliser et ajouter"}
              </button>
              <span style={S.geoNote}>Distance à vol d'oiseau via OpenStreetMap · Dépôt : {DEPOT.nom}</span>
            </div>
          </div>
          {chantiers.length===0&&<div style={S.vide}><div style={S.videIco}>🏗️</div><div>Aucun chantier enregistré</div></div>}
          <div style={S.chGrid}>
            {chantiers.map(c=>(
              <div key={c.id} style={S.chCard}>
                <div style={S.chCardTop}>
                  <div style={S.chNom}>{c.nom}</div>
                  <div style={{...S.zBadge,background:zoneColor(c.zone)}}>Zone {c.zone}</div>
                </div>
                <div style={S.chAddr}>{[c.adresse,c.ville].filter(Boolean).join(", ")}</div>
                <div style={S.chKm}>📏 {c.km} km à vol d'oiseau</div>
                <button style={S.chDel} onClick={()=>setChantiers(p=>p.filter(x=>x.id!==c.id))}>Supprimer</button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Sous-composants ──────────────────────────────────────────────────────────
function Sec({titre,children}){
  return(
    <div style={{marginBottom:22}}>
      <div style={{fontSize:11,fontWeight:700,color:"#1a3a5c",textTransform:"uppercase",
        letterSpacing:.8,marginBottom:10,paddingBottom:6,borderBottom:"1px solid #eef1f6"}}>
        {titre}
      </div>
      {children}
    </div>
  );
}

function F({label,value,onChange,type="text",placeholder=""}){
  return(
    <div style={{display:"flex",flexDirection:"column",gap:4}}>
      <label style={{fontSize:11,fontWeight:600,color:"#666"}}>{label}</label>
      <input type={type} placeholder={placeholder}
        style={{padding:"8px 10px",borderRadius:7,border:"1.5px solid #d5dde8",fontSize:14,outline:"none"}}
        value={value||""} onChange={e=>onChange(e.target.value)}/>
    </div>
  );
}

function Pill({label,val,color,dim}){
  return(
    <div style={{border:`2px solid ${color}`,borderRadius:9,padding:"4px 11px",textAlign:"center",opacity:dim?0.3:1}}>
      <div style={{fontWeight:800,fontSize:16,color}}>{val}</div>
      <div style={{fontSize:10,color:"#999",marginTop:1}}>{label}</div>
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const S={
  root:{fontFamily:"'Segoe UI',system-ui,sans-serif",minHeight:"100vh",background:"#eef1f6",color:"#1a1a2e"},
  header:{background:"linear-gradient(135deg,#1a3a5c,#0d2137)",color:"#fff",padding:"14px 28px",display:"flex",alignItems:"center",justifyContent:"space-between",boxShadow:"0 3px 12px rgba(0,0,0,.25)"},
  headerL:{display:"flex",alignItems:"center",gap:14},
  logo:{width:46,height:46,borderRadius:12,background:"#e8a020",display:"flex",alignItems:"center",justifyContent:"center",fontWeight:900,fontSize:26,color:"#fff",flexShrink:0},
  htitle:{fontWeight:700,fontSize:19,letterSpacing:.5},
  hsub:{fontSize:11,opacity:.6,marginTop:2},
  headerR:{display:"flex",gap:8},
  syncBadge:{fontSize:12,color:"rgba(255,255,255,.7)",padding:"4px 10px",background:"rgba(255,255,255,.1)",borderRadius:6},
  syncBadge:{fontSize:12,color:"rgba(255,255,255,.8)",padding:"4px 10px",background:"rgba(255,255,255,.15)",borderRadius:6},
  hsel:{padding:"6px 10px",borderRadius:7,border:"1px solid rgba(255,255,255,.25)",background:"rgba(255,255,255,.12)",color:"#fff",fontSize:14,cursor:"pointer"},
  nav:{background:"#fff",borderBottom:"2px solid #e0e6f0",padding:"0 28px",display:"flex"},
  navBtn:{padding:"13px 22px",border:"none",background:"transparent",fontSize:14,cursor:"pointer",color:"#666",fontWeight:500,borderBottom:"3px solid transparent",marginBottom:-2},
  navOn:{color:"#1a3a5c",borderBottomColor:"#e8a020",fontWeight:700},
  toast:{background:"#27ae60",color:"#fff",textAlign:"center",padding:"9px",fontSize:14,fontWeight:600},
  toastErr:{background:"#e74c3c"},
  body:{padding:"22px 28px",maxWidth:1450,margin:"0 auto"},
  vide:{textAlign:"center",padding:"70px 20px",color:"#bbb",fontSize:16},
  videIco:{fontSize:54,marginBottom:14},
  semAddBar:{display:"flex",alignItems:"center",gap:10,marginBottom:16,flexWrap:"wrap",background:"#fff",padding:"14px 18px",borderRadius:12,boxShadow:"0 1px 4px rgba(0,0,0,.07)"},
  semTitle:{fontWeight:700,fontSize:14,color:"#1a3a5c",whiteSpace:"nowrap"},
  semTitle2:{fontWeight:700,fontSize:13,color:"#1a3a5c",whiteSpace:"nowrap"},
  numInput:{width:80,padding:"7px 10px",borderRadius:7,border:"1.5px solid #d5dde8",fontSize:14,outline:"none",textAlign:"center"},
  selAnnee:{padding:"7px 10px",borderRadius:7,border:"1.5px solid #d5dde8",fontSize:14,background:"#fff"},
  semPreview:{fontSize:12,color:"#888",fontStyle:"italic"},
  btnAddSem:{padding:"8px 18px",borderRadius:8,background:"#1a3a5c",border:"none",color:"#fff",fontWeight:700,fontSize:14,cursor:"pointer"},
  semBar:{display:"flex",alignItems:"center",gap:10,marginBottom:20,flexWrap:"wrap"},
  semBtns:{display:"flex",gap:8,flexWrap:"wrap"},
  semWrap:{display:"flex",alignItems:"center",gap:3},
  semBtn:{padding:"7px 16px",borderRadius:20,border:"2px solid #c5d3e8",background:"#fff",cursor:"pointer",fontSize:13,fontWeight:500,color:"#555"},
  semOn:{background:"#1a3a5c",color:"#fff",borderColor:"#1a3a5c"},
  semX:{width:22,height:22,borderRadius:"50%",border:"1px solid #e74c3c",background:"#fff",color:"#e74c3c",fontSize:11,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"},
  grid:{display:"grid",gridTemplateColumns:"220px 1fr",gap:20,alignItems:"start"},
  sidebar:{background:"#fff",borderRadius:13,boxShadow:"0 1px 6px rgba(0,0,0,.08)",overflow:"hidden"},
  sideTop:{background:"#1a3a5c",padding:"12px 14px"},
  sideTitre:{color:"#fff",fontWeight:700,fontSize:13,letterSpacing:.5,marginBottom:4},
  sideInfo:{color:"rgba(255,255,255,.65)",fontSize:11},
  salCard:{padding:"11px 14px",borderBottom:"1px solid #f0f3f8",cursor:"pointer",position:"relative",borderLeft:"3px solid transparent"},
  salOn:{background:"#eef4ff",borderLeftColor:"#1a3a5c"},
  salNom:{fontWeight:600,fontSize:13},
  salSub:{fontSize:11,color:"#aaa",marginTop:2},
  okBadge:{position:"absolute",right:10,top:"50%",transform:"translateY(-50%)",fontSize:16,fontWeight:900},
  form:{background:"#fff",borderRadius:13,boxShadow:"0 1px 6px rgba(0,0,0,.08)",padding:24},
  formTop:{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:20,borderBottom:"2px solid #e8a020",paddingBottom:12},
  formNom:{fontWeight:700,fontSize:17,color:"#1a3a5c"},
  formSub:{fontSize:12,color:"#aaa",marginTop:3},
  pills:{display:"flex",gap:8,flexShrink:0},
  jourActions:{display:"flex",alignItems:"center",gap:16,marginBottom:12},
  btnValAll:{padding:"7px 14px",borderRadius:7,background:"#1a3a5c",border:"none",color:"#fff",fontSize:12,fontWeight:600,cursor:"pointer"},
  vehAllWrap:{display:"flex",alignItems:"center",gap:7},
  vehAllLbl:{fontSize:13,cursor:"pointer",fontWeight:500},
  absAlert:{background:"#fff3cd",border:"1px solid #ffc107",borderRadius:8,padding:"8px 14px",fontSize:13,color:"#856404",marginBottom:10},
  jtbl:{width:"100%",borderCollapse:"collapse",fontSize:13,marginBottom:8},
  jth:{background:"#f0f4fa",padding:"8px 10px",fontWeight:700,fontSize:11,color:"#555",textAlign:"center",borderBottom:"2px solid #dde5f0",whiteSpace:"nowrap"},
  jtd:{padding:"8px 10px",borderBottom:"1px solid #f0f3f8",verticalAlign:"top"},
  jourNomWrap:{display:"flex",flexDirection:"column",gap:3},
  jourNom:{fontWeight:600,fontSize:12},
  ferieBadge:{fontSize:10,color:"#e67e22",fontWeight:600},
  btnInclure:{fontSize:10,padding:"2px 7px",borderRadius:5,border:"1px dashed #3498db",background:"#fff",color:"#3498db",cursor:"pointer",marginTop:4},
  hWrap:{display:"flex",alignItems:"center",gap:4},
  hInput:{width:60,padding:"5px 6px",borderRadius:6,border:"1.5px solid #d5dde8",fontSize:14,textAlign:"center",outline:"none"},
  btnVal:{width:24,height:24,borderRadius:5,border:"1.5px solid #d5dde8",background:"#fff",fontSize:12,cursor:"pointer",fontWeight:700,color:"#aaa"},
  btnValOn:{background:"#27ae60",borderColor:"#27ae60",color:"#fff"},
  chWrap:{display:"flex",flexDirection:"column",gap:4},
  chRow:{display:"flex",gap:4,alignItems:"center"},
  chSel:{padding:"4px 6px",borderRadius:6,border:"1.5px solid #d5dde8",fontSize:11,background:"#fff",maxWidth:180},
  zForce:{width:36,padding:"4px",borderRadius:5,border:"1.5px solid #f0a500",fontSize:11,textAlign:"center",outline:"none"},
  zAutoWrap:{display:"flex",alignItems:"center",gap:6,marginTop:3},
  zBadgeSm:{color:"#fff",fontWeight:700,fontSize:10,padding:"2px 7px",borderRadius:4},
  zForceGlobal:{width:40,padding:"3px",borderRadius:5,border:"1px dashed #e67e22",fontSize:11,textAlign:"center",outline:"none"},
  zRec:{marginTop:12,padding:"10px 14px",background:"#f0f4fa",borderRadius:9},
  zRecTitre:{fontSize:11,fontWeight:700,color:"#1a3a5c",marginBottom:7,textTransform:"uppercase",letterSpacing:.5},
  zRecRow:{display:"flex",flexWrap:"wrap",gap:8},
  zChip:{display:"flex",alignItems:"center",gap:5,background:"#fff",border:"1px solid #dde5f0",borderRadius:7,padding:"3px 10px",fontSize:12},
  zChipZ:{color:"#fff",fontWeight:700,fontSize:11,padding:"1px 6px",borderRadius:4},
  zChipT:{color:"#555"},
  zChipTr:{color:"#3498db"},
  motifsWrap:{display:"flex",flexDirection:"column",gap:5},
  motifsChips:{display:"flex",flexWrap:"wrap",gap:4},
  motifChip:{display:"flex",alignItems:"center",gap:3,background:"#fff3cd",border:"1px solid #ffc107",borderRadius:12,padding:"2px 8px",fontSize:11},
  motifX:{border:"none",background:"transparent",cursor:"pointer",color:"#666",fontSize:13,padding:"0 2px"},
  sel2:{padding:"6px 8px",borderRadius:7,border:"1.5px solid #d5dde8",fontSize:12,background:"#fff",width:"100%"},
  absNote:{fontSize:12,color:"#888",fontStyle:"italic",marginBottom:10},
  absRow:{display:"grid",gridTemplateColumns:"100px 1fr 1fr 1fr auto",gap:10,alignItems:"end",marginBottom:10,padding:"10px 12px",background:"#f8fafc",borderRadius:9},
  inputDate:{padding:"8px 10px",borderRadius:7,border:"1.5px solid #d5dde8",fontSize:13,outline:"none"},
  primeRow:{display:"grid",gridTemplateColumns:"1fr 1fr 1fr auto",gap:10,alignItems:"end",marginBottom:10,padding:"10px 12px",background:"#f8fafc",borderRadius:9},
  btnDel:{padding:"8px 10px",borderRadius:7,border:"1px solid #e74c3c",background:"#fff",color:"#e74c3c",cursor:"pointer",fontSize:16},
  btnAddPrime:{padding:"8px 16px",borderRadius:8,border:"2px dashed #e8a020",background:"#fff8ee",color:"#c07010",fontWeight:600,cursor:"pointer",fontSize:13},
  r3:{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:14},
  navSal:{display:"flex",justifyContent:"space-between",marginTop:20,paddingTop:14,borderTop:"1px solid #f0f3f8"},
  btnPrev:{padding:"9px 18px",borderRadius:8,border:"2px solid #dde5f0",background:"#fff",color:"#555",fontWeight:600,cursor:"pointer",fontSize:13},
  btnNext:{padding:"9px 18px",borderRadius:8,border:"none",background:"#1a3a5c",color:"#fff",fontWeight:600,cursor:"pointer",fontSize:13},
  recapBar:{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:22},
  bigTitle:{fontSize:18,fontWeight:700,color:"#1a3a5c"},
  btnExp:{padding:"10px 24px",borderRadius:9,background:"#e8a020",border:"none",color:"#fff",fontWeight:700,fontSize:14,cursor:"pointer"},
  rtbl:{width:"100%",borderCollapse:"collapse",background:"#fff",borderRadius:11,overflow:"hidden",boxShadow:"0 1px 5px rgba(0,0,0,.08)",fontSize:13},
  rth:{background:"#1a3a5c",color:"#fff",padding:"10px 8px",fontWeight:600,textAlign:"center",fontSize:11,whiteSpace:"nowrap"},
  rtd:{padding:"9px 8px",textAlign:"center",borderBottom:"1px solid #f0f3f8"},
  rtdN:{padding:"9px 14px",borderBottom:"1px solid #f0f3f8"},
  rtdSub:{fontSize:11,color:"#aaa",fontWeight:400},
  trEven:{background:"#f8fafc"},
  secTitre2:{fontWeight:700,fontSize:15,color:"#1a3a5c",margin:"8px 0 14px"},
  depotTag:{fontSize:13,color:"#555",background:"#fff",padding:"7px 14px",borderRadius:8,border:"1px solid #e0e6f0"},
  chBox:{background:"#fff",borderRadius:13,boxShadow:"0 1px 6px rgba(0,0,0,.08)",padding:22,marginBottom:26},
  chBoxTitre:{fontWeight:700,fontSize:15,color:"#1a3a5c",marginBottom:16},
  chBtnRow:{display:"flex",alignItems:"center",gap:14,marginTop:14},
  btnGeo:{padding:"10px 22px",borderRadius:9,background:"#1a3a5c",border:"none",color:"#fff",fontWeight:700,fontSize:14,cursor:"pointer"},
  geoNote:{fontSize:11,color:"#aaa"},
  chGrid:{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(240px,1fr))",gap:14},
  chCard:{background:"#fff",borderRadius:11,boxShadow:"0 1px 5px rgba(0,0,0,.08)",padding:16},
  chCardTop:{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:7},
  chNom:{fontWeight:700,fontSize:14,color:"#1a3a5c",flex:1,marginRight:8},
  zBadge:{color:"#fff",fontWeight:700,fontSize:12,padding:"3px 10px",borderRadius:20,flexShrink:0},
  chAddr:{fontSize:12,color:"#888",marginBottom:5},
  chKm:{fontSize:12,color:"#3498db",fontWeight:600},
  chDel:{marginTop:10,padding:"4px 12px",borderRadius:6,border:"1px solid #e74c3c",background:"#fff",color:"#e74c3c",fontSize:11,cursor:"pointer"},
};
