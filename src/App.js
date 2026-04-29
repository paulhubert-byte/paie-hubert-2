import React, { useState, useEffect } from "react";
import { initializeApp } from "firebase/app";
import { getFirestore, doc, setDoc, getDoc } from "firebase/firestore";

// ─── Firebase ─────────────────────────────────────────────────────────────────
const firebaseConfig = {
  apiKey: "AIzaSyAk2U6Yw0kD-RiZqllrmKCuVTH5IZagN3s",
  authDomain: "paie-hubert.firebaseapp.com",
  projectId: "paie-hubert",
  storageBucket: "paie-hubert.firebasestorage.app",
  messagingSenderId: "227675242980",
  appId: "1:227675242980:web:311063ecd097c13c5cc7f1"
};
let db = null;
try { const app = initializeApp(firebaseConfig); db = getFirestore(app); } catch(e) {}
async function fbSave(data) { if(!db) return; try { await setDoc(doc(db,"paie","donnees"),data); } catch(e){} }
async function fbLoad() { if(!db) return null; try { const s=await getDoc(doc(db,"paie","donnees")); return s.exists()?s.data():null; } catch(e){ return null; } }

// ─── Constantes ───────────────────────────────────────────────────────────────
const DEPOT       = { lat: 49.3569, lng: 1.1019, nom: "Amfreville-la-Mi-Voie" };
const STORAGE_KEY = "hubert_paie_v5";
const NB_ZONES    = 10;
const ZONES       = Array.from({length:NB_ZONES},(_,i)=>i+1);
const MOIS_NOMS   = ["Janvier","Février","Mars","Avril","Mai","Juin","Juillet","Août","Septembre","Octobre","Novembre","Décembre"];
const MOTIFS_ABS  = ["Congés payés","Maladie","Accident du travail","Jour férié","Absence injustifiée","Formation","Autre"];
const HEURES_REF  = 35;
const SEUIL_HS50  = 43;

// Salariés par ordre alphabétique, Paul Hubert en dernier
const SALARIES = [
  { id: 6, nom: "CHEIKH Djamel",      coef: "250",      forfait: false, fraisPro: false },
  { id: 7, nom: "COULIBALY Sekou",    coef: "Apprenti", forfait: false, fraisPro: false },
  { id: 2, nom: "EL YAHYAOUI Mourad", coef: "250",      forfait: false, fraisPro: false },
  { id: 3, nom: "LANNEE Xavier",      coef: "270",      forfait: false, fraisPro: false },
  { id: 4, nom: "MOREAU Dominique",   coef: "250",      forfait: false, fraisPro: false },
  { id: 5, nom: "VINCENT Dominique",  coef: "270",      forfait: false, fraisPro: false },
  { id: 1, nom: "HUBERT Paul",        coef: "Cadre",    forfait: true,  fraisPro: true  },
];

// ─── Jours fériés (Meeus/Jones/Butcher) ──────────────────────────────────────
function getPaques(y) {
  const a=y%19,b=Math.floor(y/100),c=y%100,d=Math.floor(b/4),e=b%4;
  const f=Math.floor((b+8)/25),g=Math.floor((b-f+1)/3);
  const h=(19*a+b-d-g+15)%30,i=Math.floor(c/4),k=c%4;
  const l=(32+2*e+2*i-h-k)%7,m=Math.floor((a+11*h+22*l)/451);
  const month=Math.floor((h+l-7*m+114)/31);
  const day=((h+l-7*m+114)%31)+1;
  return new Date(y,month-1,day);
}
function getJoursFeries(y) {
  const p=getPaques(y);
  const add=(d,n)=>new Date(d.getTime()+n*86400000);
  const fmt=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  const list=[
    [new Date(y,0,1),"1er janvier"],[add(p,1),"Lundi de Pâques"],
    [new Date(y,4,1),"Fête du Travail"],[new Date(y,4,8),"Victoire 1945"],
    [add(p,39),"Ascension"],[add(p,50),"Lundi de Pentecôte"],
    [new Date(y,6,14),"Fête Nationale"],[new Date(y,7,15),"Assomption"],
    [new Date(y,10,1),"Toussaint"],[new Date(y,10,11),"Armistice"],
    [new Date(y,11,25),"Noël"],
  ];
  const map={};
  list.forEach(([d,n])=>{map[fmt(d)]=n;});
  return map;
}

// ─── Utilitaires dates ────────────────────────────────────────────────────────
function isoWeekToMonday(year,week) {
  const jan4=new Date(year,0,4);
  const dow=jan4.getDay()||7;
  const monday=new Date(jan4);
  monday.setDate(jan4.getDate()-(dow-1)+(week-1)*7);
  return monday;
}
function addDays(d,n){ return new Date(d.getTime()+n*86400000); }
function fmtDate(d){ return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
function fmtDateFR(d){ const j=["Dim","Lun","Mar","Mer","Jeu","Ven","Sam"]; return `${j[d.getDay()]} ${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}`; }
function fmtDateLong(ds){ if(!ds) return ""; const d=new Date(ds); return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`; }
function isWeekend(d){ return d.getDay()===0||d.getDay()===6; }
function getISOWeek(d){ const t=new Date(d); t.setHours(0,0,0,0); t.setDate(t.getDate()+4-(t.getDay()||7)); const j=new Date(t.getFullYear(),0,1); return Math.ceil((((t-j)/86400000)+1)/7); }

// ─── Haversine ────────────────────────────────────────────────────────────────
function haversine(lat1,lng1,lat2,lng2) {
  const R=6371,dLat=(lat2-lat1)*Math.PI/180,dLng=(lng2-lng1)*Math.PI/180;
  const a=Math.sin(dLat/2)**2+Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)**2;
  return R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));
}
function kmToZone(km){ if(km<10)return 1;if(km<20)return 2;if(km<30)return 3;if(km<40)return 4;if(km<50)return 5;if(km<60)return 6;if(km<70)return 7;if(km<90)return 8;if(km<110)return 9;return 10; }

// ─── Heures standard par jour ─────────────────────────────────────────────────
function heuresStd(sal, dateStr) {
  if(sal.forfait) return 7;
  const dow = new Date(dateStr).getDay();
  return dow===5 ? 3.68 : 7.83;
}

// ─── Structure données ────────────────────────────────────────────────────────
function defaultJour(dateStr, isFerie, ferieNom, isWE, sal) {
  const absent = isFerie || isWE;
  const motifs = isFerie ? ["Jour férié"] : [];
  const heuresPre = (!absent) ? String(heuresStd(sal, dateStr)) : "";
  return {
    dateStr, isFerie, ferieNom: ferieNom||"", isWE,
    heures: heuresPre, heuresValidee: false,
    chantiers: [{chId:"",zoneForce:""},{chId:"",zoneForce:""},{chId:"",zoneForce:""}],
    zoneRetenue: "",
    vehEnt: false,
    absent, motifs,
    absHeures: absent ? String(heuresStd(sal, dateStr)) : "",
    inclus: !isWE,
  };
}

function defaultSaisie(sal, joursConfig) {
  const jours={};
  joursConfig.forEach(jc=>{
    jours[jc.dateStr]=defaultJour(jc.dateStr,jc.isFerie,jc.ferieNom,jc.isWE,sal);
  });
  return {salId:sal.id, jours, primes:[], observation:""};
}

function buildJoursConfig(lundi, feries) {
  const configs=[];
  for(let i=0;i<7;i++){
    const d=addDays(lundi,i);
    const ds=fmtDate(d);
    const we=isWeekend(d);
    const ferie=feries[ds];
    configs.push({dateStr:ds,isFerie:!!ferie,ferieNom:ferie||"",isWE:we});
  }
  return configs;
}

function defaultSemaine(annee,numSem) {
  const lundi=isoWeekToMonday(annee,numSem);
  const feries={...getJoursFeries(annee-1),...getJoursFeries(annee),...getJoursFeries(annee+1)};
  const joursConfig=buildJoursConfig(lundi,feries);
  const saisies={};
  SALARIES.forEach(s=>{saisies[s.id]=defaultSaisie(s,joursConfig);});
  return {id:`${annee}-S${numSem}`,annee,numSem,lundi:fmtDate(lundi),joursConfig,saisies};
}

// ─── Calculs ──────────────────────────────────────────────────────────────────
function isCFA(chantiers, chId) {
  return chId === "CFA";
}

function getZoneJour(jour, chantiers) {
  if(jour.zoneRetenue) return parseInt(jour.zoneRetenue)||0;
  let maxZone=0;
  jour.chantiers.forEach(cj=>{
    if(cj.chId==="CFA") return; // CFA pas de zone
    const ch=chantiers.find(c=>c.id===cj.chId);
    const z=parseInt(cj.zoneForce)||(ch?ch.zone:0);
    if(z>maxZone) maxZone=z;
  });
  return maxZone;
}

function jourHasCFA(jour) {
  return jour.chantiers.some(cj=>cj.chId==="CFA");
}

function calcHS(totalH) {
  const hs25=Math.max(0,Math.min(totalH,SEUIL_HS50)-HEURES_REF);
  const hs50=Math.max(0,totalH-SEUIL_HS50);
  return {hs25,hs50};
}

function calcSemaineSal(saisie, sal, chantiers, moisFiltre) {
  if(!saisie) return null;
  let totalH=0, paniers=0;
  const trajet=Object.fromEntries(ZONES.map(z=>[z,0]));
  const transport=Object.fromEntries(ZONES.map(z=>[z,0]));
  // Absences : on collecte depuis les jours
  const absences=[];

  Object.values(saisie.jours).forEach(j=>{
    if(!j.inclus) return;
    // Filtre mois si demandé
    if(moisFiltre!==undefined){
      const moisJour=new Date(j.dateStr).getMonth()+1;
      if(moisJour!==moisFiltre) return;
    }
    const h=parseFloat(j.heures)||0;
    if(j.absent||j.isFerie){
      const absH=parseFloat(j.absHeures)||(sal.forfait?7:heuresStd(sal,j.dateStr));
      if(j.motifs&&j.motifs.length>0){
        j.motifs.forEach(m=>{
          absences.push({heures:absH,motif:m,dateStr:j.dateStr});
        });
      } else {
        absences.push({heures:absH,motif:"",dateStr:j.dateStr});
      }
      return;
    }
    totalH+=h;
    if(!sal.forfait){
      // Panier : >4h ET pas CFA
      if(h>4 && !jourHasCFA(j)) paniers++;
      const zone=getZoneJour(j,chantiers);
      // Pas de trajet/transport si CFA
      if(zone>0 && !jourHasCFA(j)){
        trajet[zone]++;
        if(!j.vehEnt) transport[zone]++;
      }
    }
  });

  const {hs25,hs50}=sal.forfait?{hs25:0,hs50:0}:calcHS(totalH);
  const primesTotal=(saisie.primes||[]).reduce((a,p)=>a+(parseFloat(p.montant)||0),0);
  return {hs25,hs50,totalH,absences,paniers,trajet,transport,primesTotal,primes:saisie.primes||[]};
}

// Cumul mois — ne compte que les jours du mois concerné
function cumulMois(semaines, salId, chantiers, moisIdx) {
  const sal=SALARIES.find(s=>s.id===salId);
  let hs25=0,hs50=0,paniers=0,primes=0;
  const trajet=Object.fromEntries(ZONES.map(z=>[z,0]));
  const transport=Object.fromEntries(ZONES.map(z=>[z,0]));
  const toutePrimes=[];
  const toutesAbsences=[];

  semaines.forEach(sem=>{
    const r=calcSemaineSal(sem.saisies[salId],sal,chantiers,moisIdx);
    if(!r) return;
    hs25+=r.hs25; hs50+=r.hs50;
    paniers+=r.paniers; primes+=r.primesTotal;
    ZONES.forEach(z=>{trajet[z]+=r.trajet[z];transport[z]+=r.transport[z];});
    toutePrimes.push(...r.primes);
    toutesAbsences.push(...r.absences);
  });

  // Regrouper absences par motif+dates consécutives
  const absH=toutesAbsences.reduce((a,b)=>a+(b.heures||0),0);
  return {hs25,hs50,absH,paniers,trajet,transport,primes,toutePrimes,toutesAbsences};
}

function zoneColor(z){ const c=["","#2ecc71","#27ae60","#f1c40f","#e67e22","#e74c3c","#9b59b6","#3498db","#1abc9c","#e91e63","#607d8b"]; return c[z]||"#999"; }

// ─── Export Excel (format Saisie EV exact) ────────────────────────────────────
async function exportExcel(semMois, extras, chantiers, moisIdx, annee) {
  if(!semMois.length){alert("Aucune donnée.");return;}

  // Charger SheetJS dynamiquement
  const XLSX = await import("https://cdn.sheetjs.com/xlsx-0.20.1/package/xlsx.mjs");

  const wb = XLSX.utils.book_new();
  const moisNom = MOIS_NOMS[moisIdx-1];

  // Colonnes : A=Salarié B=Coef C=TauxH D=HS25 E=HS50 F=AbsH G=AbsMotif H=AbsDates
  //            I=PrimeMontant J=PrimeLib
  //            K..U = Trajet zones 1a,1b,2..10 (11 cols)
  //            V..AF = Transport zones 1a,1b,2..10 (11 cols)
  //            AG=Paniers AH=Acompte AI=SaisieArr AJ=Observations

  const TRAJET_ZONES  = ['1a','1b',2,3,4,5,6,7,8,9,10];
  const TRANSP_ZONES  = ['1a','1b',2,3,4,5,6,7,8,9,10];

  // Construire les lignes
  const aoa = []; // array of arrays
  const merges = [];

  // Ligne 1
  aoa.push(['Entreprise HUBERT','','','','','','','','','','',`${moisNom} ${annee}`,'','','','','','','','','','','','','','','','','','','','','']);

  // Ligne 2 vide
  aoa.push([]);

  // Ligne 3 : groupes
  aoa.push(['SALARIÉ','','Abt.','HEURES SUPP.','','ABSENCES','','','PRIME','','',
    'TRAJET','','','','','','','','','','','',
    'TRANSPORT','','','','','','','','','','',
    'Paniers','Acompte','Saisie arrêt','Observations']);

  // Ligne 4 : sous-en-têtes
  aoa.push(['Nom','Coef.','Taux H','HS 25 %','HS 50 %','Nb heures','Motif','Dates','Montant €','Libellé','',
    'Zone','Zone','Zone','Zone','Zone','Zone','Zone','Zone','Zone','Zone','Zone',
    'Zone','Zone','Zone','Zone','Zone','Zone','Zone','Zone','Zone','Zone','Zone',
    '','','','']);

  // Ligne 5 : numéros de zones
  aoa.push(['','','','','','','','','','','',
    ...TRAJET_ZONES,...TRANSP_ZONES,'','','','']);

  // Fusionner en-têtes
  const addMerge=(r,c,re,ce)=>merges.push({s:{r,c},e:{r:re,c:ce}});
  // Ligne 1 (row=0)
  addMerge(0,0,0,9); // Entreprise HUBERT
  addMerge(0,11,0,12); // Mois
  // Ligne 3 (row=2)
  addMerge(2,0,4,1);  // SALARIÉ A-B
  addMerge(2,2,4,2);  // Abt C
  addMerge(2,3,2,4);  // HEURES SUPP D-E
  addMerge(2,5,2,7);  // ABSENCES F-H
  addMerge(2,8,2,10); // PRIME I-J(K vide)
  addMerge(2,11,2,21);// TRAJET K-U
  addMerge(2,22,2,32);// TRANSPORT V-AF
  addMerge(2,33,4,33);// Paniers
  addMerge(2,34,4,34);// Acompte
  addMerge(2,35,4,35);// Saisie arrêt
  addMerge(2,36,4,36);// Observations
  // Ligne 4 (row=3)
  addMerge(3,0,4,0);  // Nom
  addMerge(3,1,4,1);  // Coef
  addMerge(3,2,4,2);  // TauxH
  addMerge(3,3,4,3);  // HS25
  addMerge(3,4,4,4);  // HS50
  addMerge(3,5,4,5);  // AbsH
  addMerge(3,6,4,6);  // AbsMotif
  addMerge(3,7,4,7);  // AbsDates
  addMerge(3,8,4,8);  // PrimeMontant
  addMerge(3,9,4,9);  // PrimeLib

  // Données salariés
  let dataRow = 5; // index 0-based
  SALARIES.forEach(sal=>{
    const ex=extras[sal.id]||{};
    const c=sal.forfait?{hs25:0,hs50:0,absH:0,paniers:0,trajet:{},transport:{},primes:0,toutePrimes:[],toutesAbsences:[]}
      :cumulMois(semMois,sal.id,chantiers,moisIdx);

    // Regrouper absences par motif
    const absMap={};
    c.toutesAbsences.forEach(ab=>{
      const k=ab.motif||"Absence";
      if(!absMap[k]) absMap[k]={heures:0,dates:[]};
      absMap[k].heures+=ab.heures||0;
      if(ab.dateStr) absMap[k].dates.push(fmtDateLong(ab.dateStr));
    });
    const absEntries=Object.entries(absMap);
    const nbAbs=Math.max(1,absEntries.length);

    // Primes
    const primes=c.toutePrimes||[];
    const primeStr=primes.map(p=>`${p.libelle||"Prime"}: ${p.montant}€${p.chantierNom?" ("+p.chantierNom+")":""}`).join(" | ");

    // Observations
    const obsParts=[];
    if(sal.fraisPro&&ex.fraisPro) obsParts.push(`Frais pro: ${ex.fraisPro}€`);
    if(ex.obs) obsParts.push(ex.obs);
    const obsStr=obsParts.join(' | ');

    // Trajet/Transport par zone
    const tj=TRAJET_ZONES.map(z=>c.trajet[z]||c.trajet[String(z)]||0);
    const tr=TRANSP_ZONES.map(z=>c.transport[z]||c.transport[String(z)]||0);

    for(let i=0;i<nbAbs;i++){
      const ab=absEntries[i]||null;
      const datesStr=ab?ab[1].dates.length>0?`du ${ab[1].dates[0]} au ${ab[1].dates[ab[1].dates.length-1]}`:"":"";
      const row=i===0?[
        sal.nom, sal.coef, '',
        c.hs25>0?Math.round(c.hs25*100)/100:'',
        c.hs50>0?Math.round(c.hs50*100)/100:'',
        ab?Math.round(ab[1].heures*100)/100:'',
        ab?ab[0]:'',
        datesStr,
        primes.length>0?primes[0].montant:'',
        primes.length>0?primes[0].libelle:'',
        '',
        ...tj,...tr,
        c.paniers||'',
        ex.acompte||'',ex.saisieArr||'',
        obsStr||(primes.length>1?primes.slice(1).map(p=>`${p.libelle}: ${p.montant}€`).join(' | '):''),
      ]:[
        '','','','','',
        ab?Math.round(ab[1].heures*100)/100:'',
        ab?ab[0]:'',
        datesStr,
        '','','',
        ...TRAJET_ZONES.map(()=>''),
        ...TRANSP_ZONES.map(()=>''),
        '','','','',
      ];
      aoa.push(row);

      // Fusionner colonnes fixes sur plusieurs lignes d'absence
      if(nbAbs>1&&i===0){
        const fixedCols=[0,1,2,3,4,8,9,10,...Array.from({length:11},(_,k)=>k+11),...Array.from({length:11},(_,k)=>k+22),33,34,35,36];
        fixedCols.forEach(col=>{
          addMerge(dataRow,col,dataRow+nbAbs-1,col);
        });
      }
    }
    dataRow+=nbAbs;
  });

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!merges'] = merges;

  // Largeurs colonnes
  ws['!cols'] = [
    {wch:22},{wch:9},{wch:7},{wch:9},{wch:9},{wch:11},{wch:18},{wch:22},
    {wch:12},{wch:20},{wch:5},
    ...Array(11).fill({wch:6}), // trajet
    ...Array(11).fill({wch:6}), // transport
    {wch:8},{wch:12},{wch:12},{wch:35}
  ];

  XLSX.utils.book_append_sheet(wb, ws, moisNom);
  XLSX.writeFile(wb, `Saisie_EV_${moisNom}_${annee}.xlsx`);
}

// ═══════════════════════════════════════════════════════════════════════════════
// APP
// ═══════════════════════════════════════════════════════════════════════════════
export default function App() {
  const now=new Date();
  const [annee,setAnnee]         = useState(now.getFullYear());
  const [mois,setMois]           = useState(now.getMonth()+1);
  const [semaines,setSemaines]   = useState([]);
  const [semId,setSemId]         = useState(null);
  const [salId,setSalId]         = useState(SALARIES[0].id);
  const [extras,setExtras]       = useState({});
  const [chantiers,setChantiers] = useState([]);
  const [vue,setVue]             = useState("saisie");
  const [toast,setToast]         = useState({msg:"",ok:true});
  const [geoLoading,setGeoLoading]= useState(false);
  const [newCh,setNewCh]         = useState({nom:"",adresse:"",ville:""});
  const [newNumSem,setNewNumSem] = useState(getISOWeek(now));
  const [newAnnee,setNewAnnee]   = useState(now.getFullYear());
  const [syncing,setSyncing]     = useState(true);

  useEffect(()=>{
    async function charger(){
      const data=await fbLoad();
      if(data){
        if(data.semaines) setSemaines(data.semaines);
        if(data.extras)   setExtras(data.extras);
        if(data.chantiers)setChantiers(data.chantiers);
      } else {
        try{
          const d=JSON.parse(localStorage.getItem(STORAGE_KEY)||"{}");
          if(d.semaines) setSemaines(d.semaines);
          if(d.extras)   setExtras(d.extras);
          if(d.chantiers)setChantiers(d.chantiers);
        }catch(e){}
      }
      setSyncing(false);
    }
    charger();
  },[]);

  useEffect(()=>{
    if(syncing) return;
    const data={semaines,extras,chantiers};
    localStorage.setItem(STORAGE_KEY,JSON.stringify(data));
    fbSave(data);
  },[semaines,extras,chantiers]);

  function showToast(msg,ok=true){setToast({msg,ok});setTimeout(()=>setToast({msg:"",ok:true}),3500);}

  const semMois=semaines.filter(s=>{
    // Garder semaines qui ont au moins un jour dans le mois sélectionné
    return s.joursConfig&&s.joursConfig.some(j=>new Date(j.dateStr).getMonth()+1===mois&&new Date(j.dateStr).getFullYear()===annee);
  });
  const semaine=semaines.find(s=>s.id===semId);
  const sal=SALARIES.find(s=>s.id===salId);
  const saisieAct=semaine?.saisies[salId];
  const calcSem=semaine&&saisieAct?calcSemaineSal(saisieAct,sal,chantiers,undefined):null;

  function ajouterSemaine(){
    const existant=semaines.find(s=>s.annee===newAnnee&&s.numSem===newNumSem);
    if(existant){setSemId(existant.id);showToast("Semaine déjà existante",false);return;}
    const sem=defaultSemaine(newAnnee,newNumSem);
    setSemaines(p=>[...p,sem].sort((a,b)=>a.annee!==b.annee?a.annee-b.annee:a.numSem-b.numSem));
    setSemId(sem.id);
    showToast(`Semaine ${newNumSem} ajoutée ✓`);
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
      // Contrôle doublon chantier sur même semaine
      if(field==="chId"&&val&&val!=="CFA"){
        const dejaUsed=Object.entries(saisie.jours).some(([ds,jj])=>
          ds!==dateStr&&jj.inclus&&!jj.absent&&jj.chantiers.some(c=>c.chId===val)
        );
        if(dejaUsed){
          // pas d'alerte bloquante, on laisse faire
        }
      }
      return{...s,saisies:{...s.saisies,[salId]:{...saisie,jours:{...saisie.jours,[dateStr]:{...j,chantiers:ch}}}}};
    }));
  }

  // Affecter chantier au reste de la semaine
  function affecterChantierSemaine(dateStr,idx,chId){
    setSemaines(p=>p.map(s=>{
      if(s.id!==semId)return s;
      const saisie=s.saisies[salId];
      const newJours={...saisie.jours};
      let found=false;
      Object.keys(newJours).sort().forEach(ds=>{
        const j=newJours[ds];
        if(ds===dateStr) found=true;
        if(found&&j.inclus&&!j.absent&&!j.isFerie){
          const ch=[...j.chantiers];
          ch[idx]={...ch[idx],chId};
          newJours[ds]={...j,chantiers:ch};
        }
      });
      return{...s,saisies:{...s.saisies,[salId]:{...saisie,jours:newJours}}};
    }));
  }

  // Absent toute la semaine
  function absentTouteSemaine(motif){
    setSemaines(p=>p.map(s=>{
      if(s.id!==semId)return s;
      const saisie=s.saisies[salId];
      const newJours={};
      Object.entries(saisie.jours).forEach(([ds,j])=>{
        if(!j.inclus||j.isWE){newJours[ds]=j;return;}
        const absH=heuresStd(sal,ds);
        newJours[ds]={...j,absent:true,heures:"",absHeures:String(absH),motifs:motif?[motif]:j.motifs||[]};
      });
      return{...s,saisies:{...s.saisies,[salId]:{...saisie,jours:newJours}}};
    }));
  }

  // Propager motif au reste des absences de la semaine
  function propagerMotif(dateStr,motif){
    setSemaines(p=>p.map(s=>{
      if(s.id!==semId)return s;
      const saisie=s.saisies[salId];
      const newJours={};
      Object.entries(saisie.jours).forEach(([ds,j])=>{
        if(j.absent&&j.inclus&&!j.isWE&&ds!==dateStr&&!j.isFerie){
          newJours[ds]={...j,motifs:motif?[motif]:j.motifs};
        } else {
          newJours[ds]=j;
        }
      });
      return{...s,saisies:{...s.saisies,[salId]:{...saisie,jours:newJours}}};
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

  function validerTousJours(){
    setSemaines(p=>p.map(s=>{
      if(s.id!==semId)return s;
      const saisie=s.saisies[salId];
      const newJours={};
      Object.entries(saisie.jours).forEach(([ds,j])=>{newJours[ds]={...j,heuresValidee:true};});
      return{...s,saisies:{...s.saisies,[salId]:{...saisie,jours:newJours}}};
    }));
  }

  function ajouterPrime(){
    setSemaines(p=>p.map(s=>{
      if(s.id!==semId)return s;
      const saisie=s.saisies[salId];
      const primes=[...(saisie.primes||[]),{id:Date.now().toString(),montant:"",libelle:"",chantierNom:""}];
      return{...s,saisies:{...s.saisies,[salId]:{...saisie,primes}}};
    }));
  }

  function updatePrime(pid,field,val){
    if(field==="chantierNom"&&val){
      const existeDeja=semaines.some(s=>s.id!==semId&&s.saisies[salId]?.primes?.some(p=>p.chantierNom===val));
      if(existeDeja) showToast(`⚠️ Prime déjà saisie pour ${sal.nom} sur "${val}"`,false);
    }
    setSemaines(p=>p.map(s=>{
      if(s.id!==semId)return s;
      const saisie=s.saisies[salId];
      const primes=(saisie.primes||[]).map(p=>p.id===pid?{...p,[field]:val}:p);
      return{...s,saisies:{...s.saisies,[salId]:{...saisie,primes}}};
    }));
  }

  function supprimerPrime(pid){
    setSemaines(p=>p.map(s=>{
      if(s.id!==semId)return s;
      const saisie=s.saisies[salId];
      const primes=(saisie.primes||[]).filter(p=>p.id!==pid);
      return{...s,saisies:{...s.saisies,[salId]:{...saisie,primes}}};
    }));
  }

  function updateExtra(sId,field,val){setExtras(p=>({...p,[sId]:{...(p[sId]||{}),[field]:val}}));}

  // Géolocalisation
  async function ajouterChantier(){
    if(!newCh.nom||!newCh.ville){showToast("❌ Nom et ville requis",false);return;}
    setGeoLoading(true);
    try{
      const q=`${newCh.adresse} ${newCh.ville} France`.trim();
      const res=await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=1&countrycodes=fr`,{headers:{"Accept-Language":"fr","User-Agent":"HubertPeinture/1.0"}});
      const data=await res.json();
      if(!data.length)throw new Error();
      const lat=parseFloat(data[0].lat),lng=parseFloat(data[0].lon);
      const km=haversine(DEPOT.lat,DEPOT.lng,lat,lng);
      const zone=kmToZone(km);
      const ch={id:Date.now().toString(),nom:newCh.nom,adresse:newCh.adresse,ville:newCh.ville,lat,lng,km:Math.round(km*10)/10,zone};
      setChantiers(p=>[...p,ch].sort((a,b)=>a.nom.localeCompare(b.nom)));
      setNewCh({nom:"",adresse:"",ville:""});
      showToast(`✓ ${ch.nom} — Zone ${zone} (${ch.km} km à vol d'oiseau)`);
    }catch(e){showToast("❌ Adresse introuvable",false);}
    setGeoLoading(false);
  }

  // ─── Rendu grille jours ───────────────────────────────────────────────────
  function renderJours(){
    if(!semaine||!saisieAct)return null;
    const joursArr=semaine.joursConfig;
    const absManquantes=calcSem&&calcSem.totalH<HEURES_REF&&!sal.forfait&&
      Object.values(saisieAct.jours).some(j=>j.inclus&&!j.absent&&!j.isFerie);

    return(
      <div>
        {/* Actions globales */}
        <div style={S.jourActions}>
          {!sal.forfait&&<button style={S.btnValAll} onClick={validerTousJours}>✓ Valider toutes les heures</button>}
          {!sal.forfait&&(
            <div style={S.vehAllWrap}>
              <input type="checkbox" id="vehAll"
                checked={Object.values(saisieAct.jours).filter(j=>j.inclus&&!j.absent&&!j.isFerie).every(j=>j.vehEnt)}
                onChange={toggleVehAll}/>
              <label htmlFor="vehAll" style={S.vehAllLbl}>🚐 Véhicule entreprise toute la semaine</label>
            </div>
          )}
          <div style={S.absToutWrap}>
            <span style={S.absToutLbl}>Absent toute la semaine :</span>
            <select style={S.sel2} onChange={e=>{if(e.target.value)absentTouteSemaine(e.target.value);e.target.value="";}}>
              <option value="">— Motif —</option>
              {MOTIFS_ABS.map(m=><option key={m}>{m}</option>)}
            </select>
          </div>
        </div>

        {absManquantes&&(
          <div style={S.absAlert}>⚠️ Total semaine : {calcSem.totalH.toFixed(2)}h — inférieur à 35h, vérifiez les absences</div>
        )}

        <div style={{overflowX:"auto"}}>
          <table style={S.jtbl}>
            <thead>
              <tr>
                <th style={S.jth}>Jour</th>
                {!sal.forfait&&<th style={S.jth}>Heures</th>}
                {!sal.forfait&&<th style={S.jth}>Chantier(s)</th>}
                {!sal.forfait&&<th style={S.jth} title="Véhicule entreprise">🚐</th>}
                <th style={S.jth}>Absent</th>
                <th style={S.jth}>Motif(s) / H abs.</th>
              </tr>
            </thead>
            <tbody>
              {joursArr.map((jc)=>{
                const j=saisieAct.jours[jc.dateStr];
                if(!j)return null;
                const d=new Date(jc.dateStr);
                const h=parseFloat(j.heures)||0;
                const pan=!j.absent&&!j.isFerie&&h>4&&!jourHasCFA(j);
                let rowBg="#fff";
                if(j.isFerie) rowBg="#fff3cd";
                else if(jc.isWE) rowBg="#f8d7da";
                else if(Object.keys(saisieAct.jours).indexOf(jc.dateStr)%2===0) rowBg="#f8fafc";

                return(
                  <tr key={jc.dateStr} style={{background:rowBg}}>
                    <td style={S.jtd}>
                      <div style={S.jourNomWrap}>
                        <span style={{...S.jourNom,...(jc.isWE?{color:"#e74c3c"}:{}),...(j.isFerie?{color:"#e67e22",fontWeight:700}:{})}}>
                          {fmtDateFR(d)}
                        </span>
                        {j.isFerie&&<span style={S.ferieBadge}>🗓 {j.ferieNom}</span>}
                        {pan&&<span title="Panier dû">🍽</span>}
                        {j.vehEnt&&!j.absent&&<span title="Veh. entreprise — pas de transport">🚐</span>}
                      </div>
                      {jc.isWE&&!j.inclus&&(
                        <button style={S.btnInclure} onClick={()=>updateJour(jc.dateStr,"inclus",true)}>+ Inclure</button>
                      )}
                    </td>
                    {!sal.forfait&&(
                      <td style={S.jtd}>
                        {!j.absent&&!j.isFerie?(
                          <div style={S.hWrap}>
                            <input type="number" min="0" max="12" step="0.5"
                              style={{...S.hInput,...(!j.heuresValidee?{color:"#bbb"}:{color:"#1a3a5c",fontWeight:700})}}
                              value={j.heures||""}
                              onChange={e=>updateJour(jc.dateStr,"heures",e.target.value)}/>
                            <button style={{...S.btnVal,...(j.heuresValidee?S.btnValOn:{})}}
                              onClick={()=>updateJour(jc.dateStr,"heuresValidee",!j.heuresValidee)}
                              title={j.heuresValidee?"Validé":"Cliquer pour valider"}>
                              {j.heuresValidee?"✓":"?"}
                            </button>
                          </div>
                        ):<span style={{color:"#ccc",fontSize:12}}>—</span>}
                      </td>
                    )}
                    {!sal.forfait&&(
                      <td style={S.jtd}>
                        {!j.absent&&!j.isFerie?(
                          <div style={S.chWrap}>
                            {j.chantiers.map((cj,ci)=>{
                              const chObj=chantiers.find(c=>c.id===cj.chId);
                              return(
                                <div key={ci} style={S.chRow}>
                                  <select style={S.chSel} value={cj.chId||""}
                                    onChange={e=>{
                                      const val=e.target.value;
                                      updateChantierJour(jc.dateStr,ci,"chId",val);
                                      if(val) affecterChantierSemaine(jc.dateStr,ci,val);
                                    }}>
                                    <option value="">{ci===0?"— chantier —":`+ chantier ${ci+1}`}</option>
                                    <option value="CFA">CFA (pas de trajet/transport/panier)</option>
                                    {chantiers.map(c=><option key={c.id} value={c.id}>{c.nom} · Z{c.zone}</option>)}
                                  </select>
                                  {cj.chId&&cj.chId!=="CFA"&&(
                                    <input type="number" min="1" max="10" placeholder="Z" title="Forcer zone"
                                      style={S.zForce} value={cj.zoneForce||""}
                                      onChange={e=>updateChantierJour(jc.dateStr,ci,"zoneForce",e.target.value)}/>
                                  )}
                                </div>
                              );
                            })}
                            {getZoneJour(j,chantiers)>0&&(
                              <div style={S.zAutoWrap}>
                                <span style={{...S.zBadgeSm,background:zoneColor(getZoneJour(j,chantiers))}}>
                                  Z{getZoneJour(j,chantiers)} retenue
                                </span>
                              </div>
                            )}
                          </div>
                        ):<span style={{color:"#ccc",fontSize:12}}>—</span>}
                      </td>
                    )}
                    {!sal.forfait&&(
                      <td style={{...S.jtd,textAlign:"center"}}>
                        {!j.absent&&!j.isFerie&&(
                          <input type="checkbox" checked={j.vehEnt||false}
                            onChange={e=>updateJour(jc.dateStr,"vehEnt",e.target.checked)}/>
                        )}
                      </td>
                    )}
                    <td style={{...S.jtd,textAlign:"center"}}>
                      {!j.isFerie&&(
                        <input type="checkbox" checked={j.absent||false}
                          onChange={e=>{
                            updateJour(jc.dateStr,"absent",e.target.checked);
                            if(e.target.checked){
                              updateJour(jc.dateStr,"heures","");
                              const absH=heuresStd(sal,jc.dateStr);
                              updateJour(jc.dateStr,"absHeures",String(absH));
                            }
                          }}/>
                      )}
                    </td>
                    <td style={S.jtd}>
                      {(j.absent||j.isFerie)&&(
                        <div style={S.motifsWrap}>
                          <div style={S.motifsRow}>
                            <input type="number" min="0" max="12" step="0.5" style={S.absHInput}
                              value={j.absHeures||""} placeholder="H"
                              onChange={e=>updateJour(jc.dateStr,"absHeures",e.target.value)}/>
                            {!j.isFerie&&(
                              <select style={S.sel2} value=""
                                onChange={e=>{
                                  if(!e.target.value)return;
                                  const motif=e.target.value;
                                  const newMotifs=[...(j.motifs||[]).filter(m=>m!==motif),motif];
                                  updateJour(jc.dateStr,"motifs",newMotifs);
                                  propagerMotif(jc.dateStr,motif);
                                  e.target.value="";
                                }}>
                                <option value="">+ Motif</option>
                                {MOTIFS_ABS.filter(m=>!(j.motifs||[]).includes(m)).map(m=><option key={m}>{m}</option>)}
                              </select>
                            )}
                          </div>
                          <div style={S.motifsChips}>
                            {(j.motifs||[]).map(m=>(
                              <span key={m} style={S.motifChip}>
                                {m}
                                {!j.isFerie&&(
                                  <button style={S.motifX}
                                    onClick={()=>updateJour(jc.dateStr,"motifs",(j.motifs||[]).filter(x=>x!==m))}>×</button>
                                )}
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

        {/* Récap zones semaine */}
        {calcSem&&!sal.forfait&&ZONES.some(z=>calcSem.trajet[z]>0)&&(
          <div style={S.zRec}>
            <div style={S.zRecTitre}>Zones cette semaine</div>
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
      <div style={S.header}>
        <div style={S.headerL}>
          <div style={S.logo}>H</div>
          <div>
            <div style={S.htitle}>HUBERT PEINTURE</div>
            <div style={S.hsub}>Variables de paie · Convention Bâtiment &lt;10 salariés</div>
          </div>
        </div>
        <div style={S.headerR}>
          {syncing&&<span style={S.syncBadge}>⏳ Chargement…</span>}
          <select style={S.hsel} value={mois} onChange={e=>setMois(+e.target.value)}>
            {MOIS_NOMS.map((m,i)=><option key={i} value={i+1}>{m}</option>)}
          </select>
          <select style={S.hsel} value={annee} onChange={e=>setAnnee(+e.target.value)}>
            {[2025,2026,2027,2028].map(a=><option key={a}>{a}</option>)}
          </select>
        </div>
      </div>

      <div style={S.nav}>
        {[["saisie","📝 Saisie semaine"],["recap","📊 Récap mensuel"],["chantiers","📍 Chantiers"]].map(([k,l])=>(
          <button key={k} style={{...S.navBtn,...(vue===k?S.navOn:{})}} onClick={()=>setVue(k)}>{l}</button>
        ))}
      </div>

      {toast.msg&&<div style={{...S.toast,...(!toast.ok?S.toastErr:{})}}>{toast.msg}</div>}

      {/* ══ SAISIE ══ */}
      {vue==="saisie"&&(
        <div style={S.body}>
          <div style={S.semAddBar}>
            <span style={S.semTitle}>Ajouter une semaine :</span>
            <input type="number" min="1" max="53" style={S.numInput}
              value={newNumSem} onChange={e=>setNewNumSem(+e.target.value)}/>
            <select style={S.selAnnee} value={newAnnee} onChange={e=>setNewAnnee(+e.target.value)}>
              {[2025,2026,2027,2028].map(a=><option key={a}>{a}</option>)}
            </select>
            {newNumSem&&newAnnee&&(()=>{
              const lundi=isoWeekToMonday(newAnnee,newNumSem);
              return<span style={S.semPreview}>{fmtDateFR(lundi)} → {fmtDateFR(addDays(lundi,4))}</span>;
            })()}
            <button style={S.btnAddSem} onClick={ajouterSemaine}>+ Ajouter</button>
          </div>

          {semMois.length>0&&(
            <div style={S.semBar}>
              <span style={S.semTitle2}>{MOIS_NOMS[mois-1]} {annee} :</span>
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

          {!semaine&&<div style={S.vide}><div style={S.videIco}>📋</div><div>Saisissez un numéro de semaine et cliquez "+ Ajouter"</div></div>}

          {semaine&&(
            <div style={S.grid}>
              <div style={S.sidebar}>
                <div style={S.sideTop}>
                  <div style={S.sideTitre}>Salariés</div>
                  <div style={S.sideInfo}>
                    S{semaine.numSem} · {semaine.joursConfig[0]?fmtDateFR(new Date(semaine.joursConfig[0].dateStr)):""} au {semaine.joursConfig[4]?fmtDateFR(new Date(semaine.joursConfig[4].dateStr)):""}
                  </div>
                </div>
                {SALARIES.map(s=>{
                  const sai=semaine.saisies[s.id];
                  const ok=sai&&Object.values(sai.jours).some(j=>parseFloat(j.heures)>0||j.absent);
                  const valide=sai&&Object.values(sai.jours).filter(j=>j.inclus&&!j.absent&&!j.isFerie).every(j=>j.heuresValidee);
                  return(
                    <div key={s.id}
                      style={{...S.salCard,...(salId===s.id?S.salOn:{}),...(valide&&ok?{borderLeftColor:"#27ae60"}:{})}}
                      onClick={()=>setSalId(s.id)}>
                      <div style={S.salNom}>{s.nom}</div>
                      <div style={S.salSub}>{s.forfait?"Cadre forfait":`Coef. ${s.coef}`}</div>
                      {ok&&<span style={{...S.okBadge,color:valide?"#27ae60":"#e67e22"}}>{valide?"✓":"~"}</span>}
                    </div>
                  );
                })}
              </div>

              <div style={S.form}>
                <div style={S.formTop}>
                  <div>
                    <div style={S.formNom}>{sal.nom}</div>
                    <div style={S.formSub}>{sal.forfait?"Cadre — forfait":`Ouvrier · Coef. ${sal.coef} · Base 35h/sem.`}</div>
                  </div>
                  {calcSem&&!sal.forfait&&(
                    <div style={S.pills}>
                      <Pill label="HS 25%" val={calcSem.hs25.toFixed(1)} color="#e67e22" dim={calcSem.hs25===0}/>
                      <Pill label="HS 50%" val={calcSem.hs50.toFixed(1)} color="#c0392b" dim={calcSem.hs50===0}/>
                      <Pill label="Paniers" val={calcSem.paniers} color="#27ae60"/>
                    </div>
                  )}
                </div>

                <Sec titre="📅 Jours de la semaine">{renderJours()}</Sec>

                {!sal.forfait&&(
                  <Sec titre="💰 Primes de chantier">
                    {(saisieAct.primes||[]).map(p=>(
                      <div key={p.id} style={S.primeRow}>
                        <F label="Montant (€)" value={p.montant} type="number" onChange={v=>updatePrime(p.id,"montant",v)}/>
                        <F label="Libellé" value={p.libelle} onChange={v=>updatePrime(p.id,"libelle",v)} placeholder="ex: Prime productivité"/>
                        <F label="Chantier" value={p.chantierNom} onChange={v=>updatePrime(p.id,"chantierNom",v)} placeholder="ex: M. Dupont"/>
                        <button style={{...S.btnDel,alignSelf:"flex-end"}} onClick={()=>supprimerPrime(p.id)}>✕</button>
                      </div>
                    ))}
                    <button style={S.btnAddPrime} onClick={ajouterPrime}>+ Ajouter une prime</button>
                  </Sec>
                )}

                <Sec titre="📌 Données mensuelles">
                  <div style={S.r3}>
                    {sal.forfait&&(
                      <F label="Frais pro mensuels (€)" value={(extras[1]||{}).fraisPro||""} type="number" onChange={v=>updateExtra(1,"fraisPro",v)}/>
                    )}
                    <F label="Acompte versé (€)" value={(extras[salId]||{}).acompte||""} type="number" onChange={v=>updateExtra(salId,"acompte",v)}/>
                    <F label="Saisie arrêt sur salaire (€)" value={(extras[salId]||{}).saisieArr||""} type="number" onChange={v=>updateExtra(salId,"saisieArr",v)}/>
                    <F label="Observations" value={(extras[salId]||{}).obs||""} onChange={v=>updateExtra(salId,"obs",v)}/>
                  </div>
                </Sec>

                <div style={S.navSal}>
                  {SALARIES.findIndex(s=>s.id===salId)>0&&(
                    <button style={S.btnPrev} onClick={()=>setSalId(SALARIES[SALARIES.findIndex(s=>s.id===salId)-1].id)}>
                      ← {SALARIES[SALARIES.findIndex(s=>s.id===salId)-1].nom}
                    </button>
                  )}
                  <div/>
                  {SALARIES.findIndex(s=>s.id===salId)<SALARIES.length-1&&(
                    <button style={S.btnNext} onClick={()=>setSalId(SALARIES[SALARIES.findIndex(s=>s.id===salId)+1].id)}>
                      {SALARIES[SALARIES.findIndex(s=>s.id===salId)+1].nom} →
                    </button>
                  )}
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
            <button style={S.btnExp} onClick={()=>exportExcel(semMois,extras,chantiers,mois,annee)}>⬇ Exporter Excel (Saisie EV)</button>
          </div>
          {semMois.length===0&&<div style={S.vide}><div style={S.videIco}>📊</div><div>Aucune semaine pour ce mois.</div></div>}
          {semMois.length>0&&(
            <>
              <div style={{overflowX:"auto",marginBottom:28}}>
                <table style={S.rtbl}>
                  <thead><tr>
                    <th style={{...S.rth,textAlign:"left",minWidth:170}}>Salarié</th>
                    <th style={S.rth}>HS 25%</th>
                    <th style={S.rth}>HS 50%</th>
                    <th style={S.rth}>Abs. H</th>
                    <th style={S.rth}>Paniers</th>
                    <th style={S.rth}>Primes €</th>
                    <th style={S.rth}>Acompte</th>
                    <th style={S.rth}>Saisie arrêt</th>
                    <th style={{...S.rth,minWidth:160}}>Observations</th>
                  </tr></thead>
                  <tbody>
                    {SALARIES.map((s,i)=>{
                      const ex=extras[s.id]||{};
                      if(s.forfait)return(
                        <tr key={s.id} style={i%2===0?S.trEven:{}}>
                          <td style={S.rtdN}><b>{s.nom}</b><div style={S.rtdSub}>Cadre forfait</div></td>
                          <td style={S.rtd} colSpan={5}>—</td>
                          <td style={S.rtd}>{ex.acompte||"—"}</td>
                          <td style={S.rtd}>{ex.saisieArr||"—"}</td>
                          <td style={S.rtd}>{ex.fraisPro?`Frais pro: ${ex.fraisPro}€`:"—"}</td>
                        </tr>
                      );
                      const c=cumulMois(semMois,s.id,chantiers,mois);
                      return(
                        <tr key={s.id} style={i%2===0?S.trEven:{}}>
                          <td style={S.rtdN}><b>{s.nom}</b><div style={S.rtdSub}>Coef. {s.coef}</div></td>
                          <td style={{...S.rtd,color:c.hs25>0?"#e67e22":"#ccc",fontWeight:c.hs25>0?700:400}}>{c.hs25>0?c.hs25.toFixed(2):"—"}</td>
                          <td style={{...S.rtd,color:c.hs50>0?"#c0392b":"#ccc",fontWeight:c.hs50>0?700:400}}>{c.hs50>0?c.hs50.toFixed(2):"—"}</td>
                          <td style={{...S.rtd,color:c.absH>0?"#8e44ad":"#ccc"}}>{c.absH>0?c.absH.toFixed(2):"—"}</td>
                          <td style={S.rtd}>{c.paniers||"—"}</td>
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

              <div style={S.secTitre2}>Trajets & Transports par zone — {MOIS_NOMS[mois-1]} {annee}</div>
              <div style={{overflowX:"auto"}}>
                <table style={S.rtbl}>
                  <thead><tr>
                    <th style={{...S.rth,textAlign:"left",minWidth:170}}>Salarié</th>
                    {ZONES.map(z=><th key={`tj${z}`} style={{...S.rth,background:"#1a3a5c"}}>Z{z} Tj</th>)}
                    {ZONES.map(z=><th key={`tr${z}`} style={{...S.rth,background:"#0d2137"}}>Z{z} Tr</th>)}
                  </tr></thead>
                  <tbody>
                    {SALARIES.filter(s=>!s.forfait).map((s,i)=>{
                      const c=cumulMois(semMois,s.id,chantiers,mois);
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
              <F label="Adresse (n° et rue)" value={newCh.adresse} onChange={v=>setNewCh(p=>({...p,adresse:v}))} placeholder="ex: 12 rue de la Paix"/>
              <F label="Ville *" value={newCh.ville} onChange={v=>setNewCh(p=>({...p,ville:v}))} placeholder="ex: Rouen"/>
            </div>
            <div style={S.chBtnRow}>
              <button style={S.btnGeo} onClick={ajouterChantier} disabled={geoLoading}>
                {geoLoading?"⏳ Calcul…":"📍 Géolocaliser et ajouter"}
              </button>
              <span style={S.geoNote}>Distance à vol d'oiseau depuis le dépôt · OpenStreetMap</span>
            </div>
          </div>
          <div style={S.cfaInfo}>
            ℹ️ Le chantier <b>CFA</b> est intégré par défaut — il n'entraîne ni trajet, ni transport, ni panier repas (journée de 7h).
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
      <div style={{fontSize:11,fontWeight:700,color:"#1a3a5c",textTransform:"uppercase",letterSpacing:.8,marginBottom:10,paddingBottom:6,borderBottom:"1px solid #eef1f6"}}>{titre}</div>
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
  headerR:{display:"flex",gap:8,alignItems:"center"},
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
  jourActions:{display:"flex",alignItems:"center",gap:12,marginBottom:12,flexWrap:"wrap"},
  btnValAll:{padding:"7px 14px",borderRadius:7,background:"#1a3a5c",border:"none",color:"#fff",fontSize:12,fontWeight:600,cursor:"pointer"},
  vehAllWrap:{display:"flex",alignItems:"center",gap:7},
  vehAllLbl:{fontSize:13,cursor:"pointer",fontWeight:500},
  absToutWrap:{display:"flex",alignItems:"center",gap:7},
  absToutLbl:{fontSize:12,fontWeight:600,color:"#e74c3c",whiteSpace:"nowrap"},
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
  chSel:{padding:"4px 6px",borderRadius:6,border:"1.5px solid #d5dde8",fontSize:11,background:"#fff",maxWidth:200},
  zForce:{width:36,padding:"4px",borderRadius:5,border:"1.5px solid #f0a500",fontSize:11,textAlign:"center",outline:"none"},
  zAutoWrap:{display:"flex",alignItems:"center",gap:6,marginTop:3},
  zBadgeSm:{color:"#fff",fontWeight:700,fontSize:10,padding:"2px 7px",borderRadius:4},
  zRec:{marginTop:12,padding:"10px 14px",background:"#f0f4fa",borderRadius:9},
  zRecTitre:{fontSize:11,fontWeight:700,color:"#1a3a5c",marginBottom:7,textTransform:"uppercase",letterSpacing:.5},
  zRecRow:{display:"flex",flexWrap:"wrap",gap:8},
  zChip:{display:"flex",alignItems:"center",gap:5,background:"#fff",border:"1px solid #dde5f0",borderRadius:7,padding:"3px 10px",fontSize:12},
  zChipZ:{color:"#fff",fontWeight:700,fontSize:11,padding:"1px 6px",borderRadius:4},
  zChipT:{color:"#555"},
  zChipTr:{color:"#3498db"},
  motifsWrap:{display:"flex",flexDirection:"column",gap:5},
  motifsRow:{display:"flex",gap:5,alignItems:"center"},
  absHInput:{width:50,padding:"4px 6px",borderRadius:6,border:"1.5px solid #d5dde8",fontSize:12,textAlign:"center",outline:"none"},
  motifsChips:{display:"flex",flexWrap:"wrap",gap:4},
  motifChip:{display:"flex",alignItems:"center",gap:3,background:"#fff3cd",border:"1px solid #ffc107",borderRadius:12,padding:"2px 8px",fontSize:11},
  motifX:{border:"none",background:"transparent",cursor:"pointer",color:"#666",fontSize:13,padding:"0 2px"},
  sel2:{padding:"6px 8px",borderRadius:7,border:"1.5px solid #d5dde8",fontSize:12,background:"#fff"},
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
  chBox:{background:"#fff",borderRadius:13,boxShadow:"0 1px 6px rgba(0,0,0,.08)",padding:22,marginBottom:16},
  chBoxTitre:{fontWeight:700,fontSize:15,color:"#1a3a5c",marginBottom:16},
  chBtnRow:{display:"flex",alignItems:"center",gap:14,marginTop:14},
  btnGeo:{padding:"10px 22px",borderRadius:9,background:"#1a3a5c",border:"none",color:"#fff",fontWeight:700,fontSize:14,cursor:"pointer"},
  geoNote:{fontSize:11,color:"#aaa"},
  cfaInfo:{background:"#e8f4fd",border:"1px solid #3498db",borderRadius:9,padding:"10px 16px",fontSize:13,color:"#1a5276",marginBottom:16},
  chGrid:{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(240px,1fr))",gap:14},
  chCard:{background:"#fff",borderRadius:11,boxShadow:"0 1px 5px rgba(0,0,0,.08)",padding:16},
  chCardTop:{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:7},
  chNom:{fontWeight:700,fontSize:14,color:"#1a3a5c",flex:1,marginRight:8},
  zBadge:{color:"#fff",fontWeight:700,fontSize:12,padding:"3px 10px",borderRadius:20,flexShrink:0},
  chAddr:{fontSize:12,color:"#888",marginBottom:5},
  chKm:{fontSize:12,color:"#3498db",fontWeight:600},
  chDel:{marginTop:10,padding:"4px 12px",borderRadius:6,border:"1px solid #e74c3c",background:"#fff",color:"#e74c3c",fontSize:11,cursor:"pointer"},
};
