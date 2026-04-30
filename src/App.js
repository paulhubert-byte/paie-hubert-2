import React, { useState, useEffect, useRef } from "react";

// ─── Firebase ─────────────────────────────────────────────────────────────────
import { initializeApp } from "firebase/app";
import { getFirestore, doc, setDoc, getDoc } from "firebase/firestore";
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
async function fbSave(data) { if(!db) return; try { await setDoc(doc(db,"paie","v2"),data); } catch(e){} }
async function fbLoad() {
  if(!db) return null;
  try {
    // Essayer d'abord la nouvelle clé v2
    let s=await getDoc(doc(db,"paie","v2"));
    if(s.exists()) return s.data();
    // Sinon essayer l'ancienne clé "donnees"
    s=await getDoc(doc(db,"paie","donnees"));
    if(s.exists()) return s.data();
    return null;
  } catch(e){ return null; }
}

// ─── Constantes ───────────────────────────────────────────────────────────────
const SK = "hubert_paie_v6";
const MOIS = ["Janvier","Février","Mars","Avril","Mai","Juin","Juillet","Août","Septembre","Octobre","Novembre","Décembre"];
const MOTIFS = ["CP","Maladie","CFA","Accident du travail","Jour férié","Absence autorisée","Absence injustifiée","Formation","Autre"];
const H_NORM = 7.83;   // heures normales L-J
const H_VEN  = 3.68;   // heures vendredi
const H_MOIS = 151.67; // base mensuelle annualisée
const H_SEM  = 35;     // base hebdo
const H_HS50 = 43;     // seuil HS50%
const JOURS  = ["Lundi","Mardi","Mercredi","Jeudi","Vendredi"];
const ZONES  = [1,2,3,4,5,6,7,8,9,10];

// ─── Salariés de base ─────────────────────────────────────────────────────────
const SALARIES_DEFAUT = [
  { id:1, nom:"CHEIKH Djamel",      contrat:"CDI",      coef:250,      tauxH:15.507, abattement:true  },
  { id:2, nom:"COULIBALY Sekou",    contrat:"Apprenti", coef:"Apprent",tauxH:8.316,  abattement:false },
  { id:3, nom:"EL YAHYAOUI Mourad", contrat:"CDI",      coef:250,      tauxH:15.507, abattement:true  },
  { id:4, nom:"LANNEE Xavier",      contrat:"CDI",      coef:270,      tauxH:16.464, abattement:true  },
  { id:5, nom:"MOREAU Dominique",   contrat:"CDI",      coef:250,      tauxH:15.507, abattement:true  },
  { id:6, nom:"VINCENT Dominique",  contrat:"CDI",      coef:270,      tauxH:16.464, abattement:true  },
  { id:7, nom:"HUBERT Paul",        contrat:"CDI",      coef:"Cadre",  tauxH:null,   abattement:false },
];

// ─── Utilitaires ──────────────────────────────────────────────────────────────
function isoWeekToMonday(year, week) {
  const jan4 = new Date(year,0,4);
  const dow = jan4.getDay()||7;
  const mon = new Date(jan4);
  mon.setDate(jan4.getDate()-(dow-1)+(week-1)*7);
  return mon;
}
function addDays(d,n){ return new Date(d.getTime()+n*86400000); }
function fmtDate(d){ return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
function fmtJour(d){ const j=["Dim","Lun","Mar","Mer","Jeu","Ven","Sam"]; return `${j[d.getDay()]} ${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}`; }
function fmtDateFR(ds){ if(!ds)return""; const d=new Date(ds); return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`; }
function getISOWeek(d){ const t=new Date(d); t.setHours(0,0,0,0); t.setDate(t.getDate()+4-(t.getDay()||7)); const j=new Date(t.getFullYear(),0,1); return Math.ceil((((t-j)/86400000)+1)/7); }

function paques(y) {
  const a=y%19,b=Math.floor(y/100),c=y%100,d=Math.floor(b/4),e=b%4,f=Math.floor((b+8)/25),g=Math.floor((b-f+1)/3);
  const h=(19*a+b-d-g+15)%30,i=Math.floor(c/4),k=c%4,l=(32+2*e+2*i-h-k)%7,m=Math.floor((a+11*h+22*l)/451);
  return new Date(y,Math.floor((h+l-7*m+114)/31)-1,((h+l-7*m+114)%31)+1);
}
function getFeries(y) {
  const p=paques(y), add=(d,n)=>new Date(d.getTime()+n*86400000);
  const fmt=d=>fmtDate(d);
  return {
    [fmt(new Date(y,0,1))]:"1er janvier",
    [fmt(add(p,1))]:"Lundi de Pâques",
    [fmt(new Date(y,4,1))]:"Fête du Travail",
    [fmt(new Date(y,4,8))]:"Victoire 1945",
    [fmt(add(p,39))]:"Ascension",
    [fmt(add(p,50))]:"Lundi de Pentecôte",
    [fmt(new Date(y,6,14))]:"Fête Nationale",
    [fmt(new Date(y,7,15))]:"Assomption",
    [fmt(new Date(y,10,1))]:"Toussaint",
    [fmt(new Date(y,10,11))]:"Armistice",
    [fmt(new Date(y,11,25))]:"Noël",
  };
}

// Heures standard pour un jour donné
function hStd(dateStr) {
  const dow = new Date(dateStr).getDay(); // 5=vendredi
  return dow===5 ? H_VEN : H_NORM;
}

// Calcul HS semaine
function calcSemaine(jours) {
  const total = jours.reduce((s,j)=>s+(parseFloat(j.heures)||0),0);
  const hs25 = Math.max(0, Math.min(total,H_HS50)-H_SEM);
  const hs50 = Math.max(0, total-H_HS50);
  const absH = jours.reduce((s,j)=>s+(parseFloat(j.absHeures)||0),0);
  return {total, hs25, hs50, absH};
}

// ─── Calcul mensuel salarié ───────────────────────────────────────────────────
function calcMois(semaines, salId) {
  let hs25=0, hs50=0, absH=0, paniers=0;
  const trajet=Object.fromEntries(ZONES.map(z=>[z,0]));
  const transport=Object.fromEntries(ZONES.map(z=>[z,0]));
  const absences=[]; // {heures, motif, dates}
  const primes=[];

  semaines.forEach(sem=>{
    const saisie = sem.saisies?.[salId];
    if(!saisie) return;
    const r = calcSemaine(saisie.jours||[]);
    hs25 += r.hs25; hs50 += r.hs50; absH += r.absH;
    // Paniers : jours > 4h sans CFA
    (saisie.jours||[]).forEach(j=>{
      const h=parseFloat(j.heures)||0;
      if(h>4 && j.chantier!=="CFA") paniers++;
      if(j.chantier && j.chantier!=="CFA" && j.zone) {
        trajet[j.zone]=(trajet[j.zone]||0)+1;
        if(!j.vehEnt) transport[j.zone]=(transport[j.zone]||0)+1;
      }
    });
    // Absences
    (saisie.absences||[]).forEach(ab=>{ if(ab.heures||ab.motif) absences.push(ab); });
    // Primes
    (saisie.primes||[]).forEach(p=>{ if(p.montant||p.libelle) primes.push(p); });
  });

  const H = Math.round((H_MOIS - absH + hs25 + hs50)*100)/100;
  return {H, hs25:Math.round(hs25*100)/100, hs50:Math.round(hs50*100)/100, absH:Math.round(absH*100)/100, paniers, trajet, transport, absences, primes};
}

// ─── Génération Excel ─────────────────────────────────────────────────────────
async function genererExcel(moisIdx, annee, semaines, salaries, chantiers, extras) {
  const XLSX = await import("https://cdn.sheetjs.com/xlsx-0.20.1/package/xlsx.mjs");
  const wb = XLSX.utils.book_new();
  const moisNom = MOIS[moisIdx-1];

  // Filtrer semaines du mois
  const semMois = semaines.filter(s=>s.mois===moisIdx&&s.annee===annee);

  // ── Structure colonnes (fidèle au template) ──
  // A=Nom B=Coef C=Abattement D=H E=HS25% F=HS50%
  // G=AbsH H=AbsMotif I=AbsDates J=PrimeMontant K=PrimeLibellé
  // L=PanierQté M..W=Trajet(1..10) X..AH=Transport(1..10)
  // AI=Acompte AJ=Saisie AK=Observations
  // Ligne 1: Nom + Contrat, Taux H en col B5
  // 2 lignes par salarié

  const aoa = [];
  const merges = [];
  const addM=(r,c,re,ce)=>merges.push({s:{r,c},e:{r:re,c:ce}});

  // Ligne 1
  aoa.push(["Entreprise HUBERT",...Array(9).fill(null),moisNom,...Array(25).fill(null)]);
  // Ligne 2 vide
  aoa.push(Array(37).fill(null));
  // Ligne 3 groupes
  aoa.push(["SALARIÉ",null,"Abattement","TEMPS DE TRAVAIL",null,null,"ABSENCES",null,null,"PRIME",null,"Panier Repas","TRAJET",...Array(10).fill(null),"TRANSPORT",...Array(10).fill(null),"Acompte","Saisie","Observations"]);
  // Ligne 4 sous-en-têtes
  aoa.push([null,"Coef.",null,"H","HS 25 %","HS 50 %","nombre heures","motif","dates","Montant","Libellé",null,"Zone","Zone","Zone","Zone","Zone","Zone","Zone","Zone","Zone","Zone","Zone","Zone","Zone","Zone","Zone","Zone","Zone","Zone","Zone","Zone","Zone","Zone",null,null,null]);
  // Ligne 5 zones
  aoa.push([null,"Taux H",null,null,null,null,null,null,null,null,null,"Qté",1,2,3,4,5,6,7,8,9,10,1,2,3,4,5,6,7,8,9,10,null,null,null,null,null]);

  // Merges en-têtes
  addM(0,10,0,11); // mois K1:L1
  addM(2,0,4,1);   // SALARIÉ A3:B5
  addM(2,2,4,2);   // Abattement C3:C5
  addM(2,3,2,5);   // TEMPS DE TRAVAIL D3:F3
  addM(2,6,2,8);   // ABSENCES G3:I3
  addM(2,9,2,10);  // PRIME J3:K3
  addM(2,11,3,11); // Panier L3:L4
  addM(2,12,2,22); // TRAJET M3:W3
  addM(2,23,2,33); // TRANSPORT X3:AH3
  addM(2,34,4,34); // Acompte
  addM(2,35,4,35); // Saisie
  addM(2,36,4,36); // Observations
  addM(3,3,4,3);   // H
  addM(3,4,4,4);   // HS25
  addM(3,5,4,5);   // HS50
  addM(3,6,4,6);   // AbsH
  addM(3,7,4,7);   // motif
  addM(3,8,4,8);   // dates
  addM(3,9,4,9);   // Montant
  addM(3,10,4,10); // Libellé

  // Données salariés
  let dataRow = 5;
  salaries.forEach((sal,si)=>{
    const c = calcMois(semMois, sal.id);
    const ex = extras[sal.id]||{};
    const tauxH = ex.tauxH!==undefined ? ex.tauxH : sal.tauxH;

    // Regrouper absences par motif
    const absMap={};
    c.absences.forEach(ab=>{
      const k=ab.motif||"Absence";
      if(!absMap[k]) absMap[k]={heures:0,dates:[]};
      absMap[k].heures = Math.round((absMap[k].heures+(parseFloat(ab.heures)||0))*100)/100;
      if(ab.dateStr) absMap[k].dates.push(fmtDateFR(ab.dateStr));
    });
    const absEntries=Object.entries(absMap);
    const nbAbs=Math.max(1,absEntries.length);
    const nbPrimes=Math.max(1,c.primes.length);
    const nbRows=Math.max(nbAbs,nbPrimes,1);

    // Ligne 1 salarié (nom, coef, abattement, HS, absences, primes, paniers, trajet, transport)
    const row1 = Array(37).fill(null);
    row1[0] = sal.nom;
    row1[1] = sal.coef;
    row1[2] = sal.abattement ? "OUI" : null;
    // Absences ligne 1
    if(absEntries.length>0){
      const [motif,data]=absEntries[0];
      row1[6]=Math.round(data.heures*100)/100;
      row1[7]=motif;
      if(data.dates.length===1) row1[8]=data.dates[0];
      else if(data.dates.length>1) row1[8]=`${data.dates[0]} au ${data.dates[data.dates.length-1]}`;
    }
    // Primes ligne 1
    if(c.primes.length>0){
      row1[9]=c.primes[0].montant||null;
      row1[10]=c.primes[0].libelle||null;
    }
    aoa.push(row1);

    // Ligne 2 salarié (contrat, taux H, H, HS25, HS50, paniers, trajet, transport, acompte, obs)
    const row2 = Array(37).fill(null);
    row2[0] = sal.contrat;
    row2[1] = tauxH;
    row2[3] = c.H;
    row2[4] = c.hs25||null;
    row2[5] = c.hs50||null;
    row2[11] = c.paniers||null;
    ZONES.forEach((z,i)=>{
      row2[12+i] = c.trajet[z]||null;   // M..V (col 12..21)
      row2[23+i] = c.transport[z]||null; // X..AG (col 23..32)
    });
    row2[34] = ex.acompte||null;
    row2[35] = ex.saisieArr||null;
    // Observations (frais pro Paul Hubert)
    const obsParts=[];
    if(ex.fraisPro) obsParts.push(`Frais pro: ${ex.fraisPro}€`);
    if(ex.obs) obsParts.push(ex.obs);
    row2[36] = obsParts.join(" | ")||null;
    aoa.push(row2);

    // Lignes supplémentaires (absences 2+, primes 2+)
    for(let i=1;i<nbRows;i++){
      const rowX = Array(37).fill(null);
      if(i<absEntries.length){
        const [motif,data]=absEntries[i];
        rowX[6]=Math.round(data.heures*100)/100;
        rowX[7]=motif;
        if(data.dates.length===1) rowX[8]=data.dates[0];
        else if(data.dates.length>1) rowX[8]=`${data.dates[0]} au ${data.dates[data.dates.length-1]}`;
      }
      if(i<c.primes.length){
        rowX[9]=c.primes[i].montant||null;
        rowX[10]=c.primes[i].libelle||null;
      }
      aoa.push(rowX);
    }

    // Merges pour ce salarié
    const r1=dataRow, r2=dataRow+1, rEnd=dataRow+nbRows+1-1;
    addM(r1,0,r1,0); // nom seul
    if(rEnd>r2){
      // Fusionner cols fixes sur lignes supp
      [1,2,3,4,5,11,...Array(10).fill(0).map((_,i)=>12+i),...Array(10).fill(0).map((_,i)=>23+i),34,35,36].forEach(col=>{
        if(rEnd>r2) addM(r2,col,rEnd,col);
      });
    }
    // Merge abattement sur 3 lignes si pas de lignes supp
    addM(r1,2,r2+(nbRows-1),2);

    dataRow += 1+nbRows;
  });

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!merges"] = merges;

  // Largeurs colonnes
  ws["!cols"] = [
    {wch:21.9},{wch:9.3},{wch:5.0},{wch:8.4},{wch:9.3},{wch:9.1},
    {wch:10.9},{wch:16.1},{wch:20.9},{wch:12.4},{wch:19.7},{wch:11.7},
    ...Array(10).fill({wch:6.7}), // trajet
    ...Array(10).fill({wch:6.7}), // transport
    {wch:12.9},{wch:9.0},{wch:34.9}
  ];

  XLSX.utils.book_append_sheet(wb, ws, moisNom);
  XLSX.writeFile(wb, `Saisie_EV_${moisNom}_${annee}.xlsx`);
}

// ═══════════════════════════════════════════════════════════════════════════════
// APP
// ═══════════════════════════════════════════════════════════════════════════════
export default function App() {
  const now = new Date();
  const [annee, setAnnee]         = useState(now.getFullYear());
  const [mois, setMois]           = useState(now.getMonth()+1);
  const [semaines, setSemaines]   = useState([]);
  const [salaries, setSalaries]   = useState(SALARIES_DEFAUT);
  const [chantiers, setChantiers] = useState([]);
  const [extras, setExtras]       = useState({}); // {salId:{acompte,saisieArr,fraisPro,obs,tauxH}}
  const [vue, setVue]             = useState("saisie");
  const [semId, setSemId]         = useState(null);
  const [salId, setSalId]         = useState(1);
  const [toast, setToast]         = useState({msg:"",ok:true});
  const [syncing, setSyncing]     = useState(true);
  const [newSem, setNewSem]       = useState({num:getISOWeek(now),annee:now.getFullYear()});
  const [newCh, setNewCh]         = useState({nom:"",ville:""});
  const [geoLoading, setGeoLoading] = useState(false);
  // Modal absence
  const [modalAbs, setModalAbs]   = useState(null); // {semId,salId,jourIdx,manquant}

  // ─── Persistence ──────────────────────────────────────────────────────────
  useEffect(()=>{
    async function load(){
      // Essai Firebase d'abord
      const data=await fbLoad();
      const src=data||JSON.parse(localStorage.getItem(SK)||localStorage.getItem("hubert_paie_v5")||localStorage.getItem("hubert_paie_v4")||"{}");
      if(src.semaines) setSemaines(src.semaines);
      if(src.salaries) setSalaries(src.salaries);
      if(src.chantiers)setChantiers(src.chantiers);
      if(src.extras)   setExtras(src.extras);
      setSyncing(false);
    }
    load();
  },[]);

  useEffect(()=>{
    if(syncing)return;
    const d={semaines,salaries,chantiers,extras};
    localStorage.setItem(SK,JSON.stringify(d));
    fbSave(d);
  },[semaines,salaries,chantiers,extras]);

  function toast_(msg,ok=true){setToast({msg,ok});setTimeout(()=>setToast({msg:"",ok:true}),3000);}

  // ─── Semaines ─────────────────────────────────────────────────────────────
  const semMois = semaines.filter(s=>s.mois===mois&&s.annee===annee);
  const semaine = semaines.find(s=>s.id===semId);
  const sal     = salaries.find(s=>s.id===salId);

  function ajouterSemaine(){
    if(semaines.find(s=>s.numSem===newSem.num&&s.annee===newSem.annee)){
      toast_("Semaine déjà existante",false); return;
    }
    const lundi=isoWeekToMonday(newSem.annee,newSem.num);
    const feries={...getFeries(newSem.annee-1),...getFeries(newSem.annee),...getFeries(newSem.annee+1)};
    const jours=JOURS.map((_,i)=>{
      const d=addDays(lundi,i);
      const ds=fmtDate(d);
      const ferie=feries[ds];
      const hRef=hStd(ds);
      return {idx:i,dateStr:ds,ferie:ferie||null,heures:ferie?String(hRef):"",
              absHeures:ferie?String(hRef):"",motifAbs:ferie?"Jour férié":"",
              chantier:"",zone:null,vehEnt:false,valide:false};
    });
    // Mois de la semaine = mois du lundi (ou du mercredi si à cheval)
    const moisSem = addDays(lundi,2).getMonth()+1;
    const anneeSem = addDays(lundi,2).getFullYear();
    const sem={
      id:`${newSem.annee}-S${newSem.num}`,
      numSem:newSem.num, annee:newSem.annee,
      mois:moisSem, lundi:fmtDate(lundi),
      saisies: Object.fromEntries(salaries.map(s=>[s.id,{
        jours: jours.map(j=>({...j})),
        absences:[], primes:[]
      }]))
    };
    setSemaines(p=>[...p,sem].sort((a,b)=>a.annee!==b.annee?a.annee-b.annee:a.numSem-b.numSem));
    setSemId(sem.id);
    toast_(`Semaine ${newSem.num} ajoutée ✓`);
  }

  // ─── Mise à jour saisie ───────────────────────────────────────────────────
  function updateJour(semId, salId, jourIdx, field, val){
    setSemaines(p=>p.map(sem=>{
      if(sem.id!==semId)return sem;
      const saisie=sem.saisies[salId];
      const jours=saisie.jours.map((j,i)=>i===jourIdx?{...j,[field]:val}:j);
      return{...sem,saisies:{...sem.saisies,[salId]:{...saisie,jours}}};
    }));
  }

  function updateSaisie(semId, salId, field, val){
    setSemaines(p=>p.map(sem=>{
      if(sem.id!==semId)return sem;
      return{...sem,saisies:{...sem.saisies,[salId]:{...sem.saisies[salId],[field]:val}}};
    }));
  }

  // Validation des heures d'un jour
  function validerHeures(semId, salId, jourIdx){
    const sem=semaines.find(s=>s.id===semId);
    const saisie=sem?.saisies[salId];
    const jour=saisie?.jours[jourIdx];
    if(!jour)return;
    const h=parseFloat(jour.heures)||0;
    const ref=hStd(jour.dateStr);
    if(jour.ferie){
      updateJour(semId,salId,jourIdx,"valide",true);
      updateJour(semId,salId,jourIdx,"absHeures",String(ref));
      updateJour(semId,salId,jourIdx,"motifAbs","Jour férié");
      return;
    }
    if(h<ref && h>=0){
      const manquant=Math.round((ref-h)*100)/100;
      setModalAbs({semId,salId,jourIdx,manquant,dateStr:jour.dateStr});
    } else {
      updateJour(semId,salId,jourIdx,"valide",true);
    }
  }

  // ─── Géolocalisation chantier ─────────────────────────────────────────────
  async function ajouterChantier(){
    if(!newCh.nom||!newCh.ville){toast_("Nom et ville requis",false);return;}
    setGeoLoading(true);
    try{
      const q=`${newCh.nom} ${newCh.ville} France`;
      const res=await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=1&countrycodes=fr`,
        {headers:{"Accept-Language":"fr","User-Agent":"HubertPeinture/1.0"}});
      const data=await res.json();
      if(!data.length)throw new Error();
      const lat=parseFloat(data[0].lat),lng=parseFloat(data[0].lon);
      // Distance vol d'oiseau depuis dépôt (Amfreville-la-Mi-Voie)
      const dLat=(lat-49.3569)*Math.PI/180,dLng=(lng-1.1019)*Math.PI/180;
      const a=Math.sin(dLat/2)**2+Math.cos(49.3569*Math.PI/180)*Math.cos(lat*Math.PI/180)*Math.sin(dLng/2)**2;
      const km=6371*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));
      const zone=km<10?1:km<20?2:km<30?3:km<40?4:km<50?5:km<60?6:km<70?7:km<90?8:km<110?9:10;
      const ch={id:Date.now().toString(),nom:newCh.nom,ville:newCh.ville,lat,lng,km:Math.round(km*10)/10,zone};
      setChantiers(p=>[...p,ch].sort((a,b)=>a.nom.localeCompare(b.nom)));
      setNewCh({nom:"",ville:""});
      toast_(`✓ ${ch.nom} — Zone ${zone} (${ch.km} km)`);
    }catch(e){toast_("Adresse introuvable",false);}
    setGeoLoading(false);
  }

  // ─── RENDU ────────────────────────────────────────────────────────────────
  const saisieAct = semaine?.saisies[salId];
  const calcSem   = saisieAct ? calcSemaine(saisieAct.jours||[]) : null;

  return (
    <div style={CSS.root}>
      {/* HEADER */}
      <div style={CSS.header}>
        <div style={CSS.headerL}>
          <div style={CSS.logo}>H</div>
          <div>
            <div style={CSS.htitle}>HUBERT PEINTURE</div>
            <div style={CSS.hsub}>Variables de paie</div>
          </div>
        </div>
        <div style={CSS.headerR}>
          {syncing&&<span style={CSS.syncBadge}>⏳</span>}
          <select style={CSS.hsel} value={mois} onChange={e=>setMois(+e.target.value)}>
            {MOIS.map((m,i)=><option key={i} value={i+1}>{m}</option>)}
          </select>
          <select style={CSS.hsel} value={annee} onChange={e=>setAnnee(+e.target.value)}>
            {[2025,2026,2027,2028].map(a=><option key={a}>{a}</option>)}
          </select>
        </div>
      </div>

      {/* NAV */}
      <div style={CSS.nav}>
        {[["saisie","📝 Saisie"],["recap","📊 Récap"],["chantiers","📍 Chantiers"],["salaries","👷 Salariés"]].map(([k,l])=>(
          <button key={k} style={{...CSS.navBtn,...(vue===k?CSS.navOn:{})}} onClick={()=>setVue(k)}>{l}</button>
        ))}
      </div>

      {toast.msg&&<div style={{...CSS.toast,...(!toast.ok?CSS.toastErr:{})}}>{toast.msg}</div>}

      {/* ══ SAISIE ══ */}
      {vue==="saisie"&&(
        <div style={CSS.body}>
          <div style={CSS.saisieLayout}>

            {/* COLONNE 1 : Semaines */}
            <div style={CSS.col1}>
              <div style={CSS.col1Title}>Semaines — {MOIS[mois-1]} {annee}</div>
              <div style={CSS.semAddBox}>
                <div style={{display:"flex",gap:4,alignItems:"center"}}>
                  <div style={CSS.field}>
                    <label style={CSS.label}>Sem.</label>
                    <input type="number" min="1" max="53" style={{...CSS.input,width:46}} value={newSem.num}
                      onChange={e=>setNewSem(p=>({...p,num:+e.target.value}))}/>
                  </div>
                  <div style={CSS.field}>
                    <label style={CSS.label}>Année</label>
                    <select style={{...CSS.input,width:68}} value={newSem.annee} onChange={e=>setNewSem(p=>({...p,annee:+e.target.value}))}>
                      {[2025,2026,2027,2028].map(a=><option key={a}>{a}</option>)}
                    </select>
                  </div>
                  <button style={{...CSS.btnPrimary,marginTop:14}} onClick={ajouterSemaine}>+</button>
                </div>
                {newSem.num&&newSem.annee&&(()=>{
                  const l=isoWeekToMonday(newSem.annee,newSem.num);
                  return <div style={{fontSize:9,color:"#888",marginTop:3}}>{fmtJour(l)} → {fmtJour(addDays(l,4))}</div>;
                })()}
              </div>
              <div style={CSS.semList}>
                {semMois.length===0&&<div style={{fontSize:10,color:"#bbb",padding:6}}>Aucune semaine</div>}
                {semMois.map(s=>(
                  <button key={s.id}
                    style={{...CSS.semBtn,...(semId===s.id?CSS.semBtnOn:{})}}
                    onClick={()=>setSemId(s.id)}>
                    <div style={{fontWeight:600}}>S{s.numSem}</div>
                    <div style={{fontSize:9,opacity:.7}}>{fmtJour(new Date(s.lundi))}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* COLONNE 2 : Salariés */}
            <div style={CSS.col2}>
              <div style={CSS.col2Title}>Salariés</div>
              <div style={CSS.salList}>
                {!semaine&&<div style={{fontSize:10,color:"#bbb",padding:10}}>Sélectionnez une semaine</div>}
                {semaine&&salaries.map(s=>{
                  const sai=semaine.saisies[s.id];
                  const done=sai?.jours.every(j=>j.valide||!!j.ferie);
                  return(
                    <div key={s.id} style={{...CSS.salCard,...(salId===s.id?CSS.salOn:{})}}
                      onClick={()=>setSalId(s.id)}>
                      <div style={{flex:1}}>
                        <div style={CSS.salNom}>{s.nom}</div>
                        <div style={{fontSize:9,color:"#aaa"}}>{s.contrat} · {s.coef}</div>
                      </div>
                      <span style={CSS.salCheck}>{done?"✓":""}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* COLONNE 3 : Formulaire */}
            <div style={CSS.col3}>
              {(!semaine||!sal||!saisieAct)&&<Vide icone="📋" texte="Sélectionnez une semaine et un salarié"/>}
              {semaine&&sal&&saisieAct&&(
                <div style={CSS.formCard}>
                  {/* En-tête salarié */}
                  <div style={CSS.formHead}>
                    <div>
                      <div style={CSS.formNom}>{sal.nom}</div>
                      <div style={CSS.formSub}>{sal.contrat} · Coef. {sal.coef}{sal.tauxH?` · ${sal.tauxH}€/h`:""} · S{semaine.numSem}</div>
                    </div>
                    <div style={{display:"flex",gap:10,alignItems:"center"}}>
                      {/* Actions globales semaine */}
                      <div style={{display:"flex",gap:6,alignItems:"center",background:"#f8fafc",borderRadius:7,padding:"4px 8px",border:"1px solid #e0e6f0"}}>
                        {/* Veh entreprise toute la semaine */}
                        <label style={{fontSize:10,cursor:"pointer",display:"flex",alignItems:"center",gap:3}}>
                          <input type="checkbox"
                            checked={saisieAct.jours.filter(j=>!j.ferie&&j.heures).every(j=>j.vehEnt)}
                            onChange={e=>{
                              const val=e.target.checked;
                              setSemaines(p=>p.map(s=>{
                                if(s.id!==semId)return s;
                                const jours=s.saisies[salId].jours.map(j=>(!j.ferie&&j.heures)?{...j,vehEnt:val}:j);
                                return{...s,saisies:{...s.saisies,[salId]:{...s.saisies[salId],jours}}};
                              }));
                            }}/>
                          🚐 sem.
                        </label>
                        {/* Motif absence toute la semaine */}
                        <select style={{...CSS.input,fontSize:10,padding:"2px 5px"}}
                          value=""
                          onChange={e=>{
                            if(!e.target.value)return;
                            const motif=e.target.value;
                            setSemaines(p=>p.map(s=>{
                              if(s.id!==semId)return s;
                              const jours=s.saisies[salId].jours.map(j=>{
                                if(j.ferie)return j;
                                const hRef=hStd(j.dateStr);
                                return{...j,heures:"0",absHeures:String(hRef),motifAbs:motif,valide:true};
                              });
                              // Ajouter absences consolidées
                              const totalAbs=jours.reduce((acc,j)=>acc+(parseFloat(j.absHeures)||0),0);
                              const absences=[{heures:totalAbs,motif,dateStr:jours[0]?.dateStr,id:Date.now().toString()}];
                              return{...s,saisies:{...s.saisies,[salId]:{...s.saisies[salId],jours,absences}}};
                            }));
                            e.target.value="";
                          }}>
                          <option value="">🏥 Absent sem.</option>
                          {MOTIFS.map(m=><option key={m}>{m}</option>)}
                        </select>
                      </div>
                      {calcSem&&(
                        <div style={CSS.pills}>
                          <Pill l="Total" v={calcSem.total.toFixed(1)+"h"} c="#1a3a5c"/>
                          <Pill l="HS 25%" v={calcSem.hs25.toFixed(1)+"h"} c="#e67e22" dim={!calcSem.hs25}/>
                          <Pill l="HS 50%" v={calcSem.hs50.toFixed(1)+"h"} c="#c0392b" dim={!calcSem.hs50}/>
                          <Pill l="Abs." v={calcSem.absH.toFixed(1)+"h"} c="#8e44ad" dim={!calcSem.absH}/>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Table jours */}
                  <table style={CSS.jtbl}>
                    <thead>
                      <tr>
                        <th style={CSS.jth}>Jour</th>
                        <th style={CSS.jth}>Heures</th>
                        <th style={CSS.jth}>Chantier</th>
                        <th style={CSS.jth}>Zone</th>
                        <th style={CSS.jth}>🚐</th>
                        <th style={CSS.jth}>Absence / Motif</th>
                      </tr>
                    </thead>
                    <tbody>
                      {saisieAct.jours.map((j,i)=>{
                        const bg=j.ferie?"#fffbea":j.valide&&parseFloat(j.heures)<hStd(j.dateStr)?"#fdf0ff":j.valide?"#f0fff4":"#fff";
                        const hRef=hStd(j.dateStr);
                        // Présaisie : gris si pas encore validé
                        const hDisplay = j.heures !== "" ? j.heures : (sal.id===7 ? "7" : String(hRef));
                        return(
                          <tr key={i} style={{background:bg}}>
                            <td style={CSS.jtd}>
                              <div style={{fontWeight:600,fontSize:11}}>{fmtJour(new Date(j.dateStr))}</div>
                              {j.ferie&&<div style={{fontSize:9,color:"#e67e22"}}>{j.ferie}</div>}
                            </td>
                            <td style={CSS.jtd}>
                              <div style={{display:"flex",gap:3,alignItems:"center"}}>
                                <input type="number" min="0" max="12" step="0.5"
                                  style={{...CSS.hInput,...(!j.valide?{color:"#bbb"}:{fontWeight:700,color:"#1a3a5c"})}}
                                  value={hDisplay}
                                  onChange={e=>{updateJour(semId,salId,i,"heures",e.target.value);updateJour(semId,salId,i,"valide",false);}}
                                  onBlur={()=>{
                                    // Si vide, pré-remplir
                                    if(j.heures===""){
                                      updateJour(semId,salId,i,"heures",sal.id===7?"7":String(hRef));
                                    }
                                    validerHeures(semId,salId,i);
                                  }}/>
                                <span style={{fontSize:9,color:"#aaa"}}>/{hRef}</span>
                              </div>
                            </td>
                            <td style={CSS.jtd}>
                              <div style={{display:"flex",gap:3,alignItems:"center"}}>
                                <select style={CSS.chSel} value={j.chantier||""}
                                  onChange={e=>{
                                    const v=e.target.value;
                                    // Propager chantier + zone au reste de la semaine
                                    const ch=chantiers.find(c=>c.id===v);
                                    const z=v==="CFA"?null:(ch?ch.zone:j.zone);
                                    setSemaines(p=>p.map(s=>{
                                      if(s.id!==semId)return s;
                                      const jours=s.saisies[salId].jours.map((jj,ii)=>{
                                        if(ii<i||jj.ferie)return jj;
                                        return{...jj,chantier:v,zone:jj.zoneForce||z};
                                      });
                                      return{...s,saisies:{...s.saisies,[salId]:{...s.saisies[salId],jours}}};
                                    }));
                                  }}>
                                  <option value="">— chantier —</option>
                                  <option value="CFA">CFA</option>
                                  {chantiers.map(c=><option key={c.id} value={c.id}>{c.nom} · Z{c.zone}</option>)}
                                </select>
                                {/* Contrôle saisie texte chantier */}
                                {j.chantier&&j.chantier!=="CFA"&&(
                                  <span style={{fontSize:9,color:"#27ae60",fontWeight:700}}>✓</span>
                                )}
                                {!j.chantier&&!j.ferie&&j.valide&&(
                                  <span style={{fontSize:9,color:"#e67e22"}} title="Chantier non renseigné">⚠</span>
                                )}
                              </div>
                            </td>
                            <td style={{...CSS.jtd,textAlign:"center"}}>
                              {j.chantier&&j.chantier!=="CFA"&&(
                                <div style={{display:"flex",gap:2,alignItems:"center"}}>
                                  <select style={CSS.zSel} value={j.zoneForce||j.zone||""}
                                    onChange={e=>{
                                      const z=+e.target.value;
                                      // Zone forcée : propager au reste de la semaine
                                      setSemaines(p=>p.map(s=>{
                                        if(s.id!==semId)return s;
                                        const jours=s.saisies[salId].jours.map((jj,ii)=>{
                                          if(ii<i||jj.ferie||jj.chantier!==j.chantier)return jj;
                                          return{...jj,zone:z,zoneForce:z};
                                        });
                                        return{...s,saisies:{...s.saisies,[salId]:{...s.saisies[salId],jours}}};
                                      }));
                                    }}>
                                    {ZONES.map(z=><option key={z} value={z}>{z}</option>)}
                                  </select>
                                  {j.zoneForce&&<span style={{fontSize:8,color:"#e67e22"}} title="Zone forcée manuellement">F</span>}
                                </div>
                              )}
                            </td>
                            <td style={{...CSS.jtd,textAlign:"center"}}>
                              {j.chantier&&j.chantier!=="CFA"&&(
                                <input type="checkbox" checked={j.vehEnt||false}
                                  onChange={e=>updateJour(semId,salId,i,"vehEnt",e.target.checked)}/>
                              )}
                            </td>
                            <td style={CSS.jtd}>
                              {j.valide&&(j.absHeures||j.ferie)&&(
                                <span style={{fontSize:10,color:"#8e44ad"}}>{j.absHeures}h — {j.motifAbs}</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>

                  {/* Bas : primes + données mensuelles */}
                  <div style={CSS.formBottom}>
                    <div style={CSS.primeSection}>
                      <div style={CSS.secTitle}>💰 Primes</div>
                      {(saisieAct.primes||[]).map((p,i)=>(
                        <div key={i} style={CSS.primeRow}>
                          <input style={{...CSS.input,width:65}} type="number" placeholder="€" value={p.montant||""}
                            onChange={e=>{const pr=[...(saisieAct.primes||[])];pr[i]={...pr[i],montant:e.target.value};updateSaisie(semId,salId,"primes",pr);}}/>
                          <input style={{...CSS.input,flex:1}} placeholder="Libellé" value={p.libelle||""}
                            onChange={e=>{const pr=[...(saisieAct.primes||[])];pr[i]={...pr[i],libelle:e.target.value};updateSaisie(semId,salId,"primes",pr);}}/>
                          <button style={CSS.btnDel} onClick={()=>updateSaisie(semId,salId,"primes",(saisieAct.primes||[]).filter((_,j)=>j!==i))}>✕</button>
                        </div>
                      ))}
                      <button style={CSS.btnAdd} onClick={()=>updateSaisie(semId,salId,"primes",[...(saisieAct.primes||[]),{montant:"",libelle:""}])}>+ Prime</button>
                    </div>

                    <div style={CSS.mensuelSection}>
                      <div style={CSS.secTitle}>📌 Données mensuelles</div>
                      <div style={CSS.mensuelRow}>
                        <div style={CSS.field}>
                          <label style={CSS.label}>Taux H (€)</label>
                          <input type="number" style={{...CSS.input,width:65}} value={(extras[salId]||{}).tauxH??sal.tauxH??""}
                            onChange={e=>setExtras(p=>({...p,[salId]:{...(p[salId]||{}),tauxH:e.target.value}}))}/>
                        </div>
                        <div style={CSS.field}>
                          <label style={CSS.label}>Acompte (€)</label>
                          <input type="number" style={{...CSS.input,width:65}} value={(extras[salId]||{}).acompte||""}
                            onChange={e=>setExtras(p=>({...p,[salId]:{...(p[salId]||{}),acompte:e.target.value}}))}/>
                        </div>
                        <div style={CSS.field}>
                          <label style={CSS.label}>Saisie arrêt</label>
                          <input type="number" style={{...CSS.input,width:65}} value={(extras[salId]||{}).saisieArr||""}
                            onChange={e=>setExtras(p=>({...p,[salId]:{...(p[salId]||{}),saisieArr:e.target.value}}))}/>
                        </div>
                        {sal.id===7&&(
                          <div style={CSS.field}>
                            <label style={CSS.label}>Frais pro (€)</label>
                            <input type="number" style={{...CSS.input,width:65}} value={(extras[salId]||{}).fraisPro||""}
                              onChange={e=>setExtras(p=>({...p,[salId]:{...(p[salId]||{}),fraisPro:e.target.value}}))}/>
                          </div>
                        )}
                        <div style={{...CSS.field,flex:1}}>
                          <label style={CSS.label}>Observations</label>
                          <input style={{...CSS.input}} value={(extras[salId]||{}).obs||""}
                            onChange={e=>setExtras(p=>({...p,[salId]:{...(p[salId]||{}),obs:e.target.value}}))}/>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Navigation salariés — salarié suivant visible en bas */}
                  <div style={CSS.navSal}>
                    {salaries.findIndex(s=>s.id===salId)>0&&(
                      <button style={CSS.btnSec} onClick={()=>setSalId(salaries[salaries.findIndex(s=>s.id===salId)-1].id)}>
                        ← {salaries[salaries.findIndex(s=>s.id===salId)-1].nom}
                      </button>
                    )}
                    {salaries.findIndex(s=>s.id===salId)<salaries.length-1?(
                      <button style={{...CSS.btnPrimary,display:"flex",alignItems:"center",gap:6}}
                        onClick={()=>setSalId(salaries[salaries.findIndex(s=>s.id===salId)+1].id)}>
                        <span style={{fontSize:10,opacity:.7}}>Suivant →</span>
                        <span style={{fontWeight:700}}>{salaries[salaries.findIndex(s=>s.id===salId)+1].nom}</span>
                      </button>
                    ):<div style={{fontSize:11,color:"#27ae60",fontWeight:700,padding:"5px 10px",background:"#f0fff4",borderRadius:7}}>✓ Tous les salariés saisis</div>}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ══ RÉCAP ══ */}
      {vue==="recap"&&(
        <div style={CSS.body}>
          <div style={CSS.recapBar}>
            <div style={CSS.bigTitle}>Récapitulatif — {MOIS[mois-1]} {annee}</div>
            <button style={CSS.btnExp}
              onClick={()=>genererExcel(mois,annee,semaines,salaries,chantiers,extras)}>
              ⬇ Exporter Excel (Saisie EV)
            </button>
          </div>
          {semMois.length===0&&<Vide icone="📊" texte="Aucune semaine saisie pour ce mois"/>}
          {semMois.length>0&&(
            <div style={{overflowX:"auto"}}>
              <table style={CSS.rtbl}>
                <thead><tr>
                  <th style={{...CSS.rth,textAlign:"left",minWidth:160}}>Salarié</th>
                  <th style={CSS.rth}>H mois</th>
                  <th style={CSS.rth}>HS 25%</th>
                  <th style={CSS.rth}>HS 50%</th>
                  <th style={CSS.rth}>Abs. H</th>
                  <th style={CSS.rth}>Paniers</th>
                  <th style={CSS.rth}>Acompte</th>
                  <th style={{...CSS.rth,minWidth:140}}>Obs.</th>
                </tr></thead>
                <tbody>
                  {salaries.map((s,i)=>{
                    const c=calcMois(semMois,s.id);
                    const ex=extras[s.id]||{};
                    return(
                      <tr key={s.id} style={i%2===0?{background:"#f8fafc"}:{}}>
                        <td style={{padding:"9px 14px",fontWeight:600}}>{s.nom}</td>
                        <td style={CSS.rtd}>{c.H}</td>
                        <td style={{...CSS.rtd,color:c.hs25>0?"#e67e22":"#ccc",fontWeight:c.hs25>0?700:400}}>{c.hs25||"—"}</td>
                        <td style={{...CSS.rtd,color:c.hs50>0?"#c0392b":"#ccc",fontWeight:c.hs50>0?700:400}}>{c.hs50||"—"}</td>
                        <td style={{...CSS.rtd,color:c.absH>0?"#8e44ad":"#ccc"}}>{c.absH||"—"}</td>
                        <td style={CSS.rtd}>{c.paniers||"—"}</td>
                        <td style={CSS.rtd}>{ex.acompte||"—"}</td>
                        <td style={CSS.rtd}>{[ex.fraisPro&&`FP:${ex.fraisPro}€`,ex.obs].filter(Boolean).join(" · ")||"—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ══ CHANTIERS ══ */}
      {vue==="chantiers"&&(
        <div style={CSS.body}>
          <div style={CSS.card}>
            <div style={CSS.cardTitle}>Ajouter un chantier</div>
            <div style={CSS.row}>
              <F label="Nom / Client *" value={newCh.nom} onChange={v=>setNewCh(p=>({...p,nom:v}))} placeholder="ex: M. Dupont"/>
              <F label="Ville *" value={newCh.ville} onChange={v=>setNewCh(p=>({...p,ville:v}))} placeholder="ex: Rouen"/>
              <button style={CSS.btnPrimary} onClick={ajouterChantier} disabled={geoLoading}>
                {geoLoading?"⏳ Calcul…":"📍 Ajouter"}
              </button>
            </div>
            <div style={{fontSize:11,color:"#aaa",marginTop:6}}>Distance à vol d'oiseau depuis Amfreville-la-Mi-Voie</div>
          </div>
          <div style={{marginTop:8,padding:"10px 16px",background:"#e8f4fd",borderRadius:8,fontSize:13,color:"#1a5276"}}>
            ℹ️ Le chantier <b>CFA</b> est intégré par défaut — pas de trajet, transport ni panier.
          </div>
          {chantiers.length===0&&<Vide icone="🏗️" texte="Aucun chantier enregistré"/>}
          <div style={CSS.chGrid}>
            {chantiers.map(c=>(
              <div key={c.id} style={CSS.chCard}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                  <div style={{fontWeight:700,fontSize:14,color:"#1a3a5c"}}>{c.nom}</div>
                  <div style={{...CSS.zoneBadge,background:zoneColor(c.zone)}}>Z{c.zone}</div>
                </div>
                <div style={{fontSize:12,color:"#888",marginTop:4}}>{c.ville}</div>
                <div style={{fontSize:12,color:"#3498db",marginTop:2}}>📏 {c.km} km</div>
                <button style={CSS.btnDelSm} onClick={()=>setChantiers(p=>p.filter(x=>x.id!==c.id))}>Supprimer</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ══ SALARIÉS ══ */}
      {vue==="salaries"&&(
        <div style={CSS.body}>
          <div style={CSS.card}>
            <div style={CSS.cardTitle}>Gestion des salariés</div>
            <table style={CSS.rtbl}>
              <thead><tr>
                <th style={{...CSS.rth,textAlign:"left"}}>Nom</th>
                <th style={CSS.rth}>Contrat</th>
                <th style={CSS.rth}>Coef.</th>
                <th style={CSS.rth}>Taux H</th>
                <th style={CSS.rth}>Abatt.</th>
                <th style={CSS.rth}>Action</th>
              </tr></thead>
              <tbody>
                {salaries.map((s,i)=>(
                  <tr key={s.id} style={i%2===0?{background:"#f8fafc"}:{}}>
                    <td style={{padding:"8px 14px",fontWeight:600}}>{s.nom}</td>
                    <td style={CSS.rtd}>{s.contrat}</td>
                    <td style={CSS.rtd}>{s.coef}</td>
                    <td style={CSS.rtd}>
                      <input type="number" style={{...CSS.input,width:80}} value={s.tauxH||""}
                        onChange={e=>setSalaries(p=>p.map(x=>x.id===s.id?{...x,tauxH:parseFloat(e.target.value)||null}:x))}/>
                    </td>
                    <td style={{...CSS.rtd,textAlign:"center"}}>
                      <input type="checkbox" checked={s.abattement||false}
                        onChange={e=>setSalaries(p=>p.map(x=>x.id===s.id?{...x,abattement:e.target.checked}:x))}/>
                    </td>
                    <td style={{...CSS.rtd,textAlign:"center"}}>
                      <button style={CSS.btnDelSm} onClick={()=>{if(window.confirm(`Supprimer ${s.nom} ?`))setSalaries(p=>p.filter(x=>x.id!==s.id));}}>✕</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{marginTop:14}}>
              <div style={CSS.secTitle}>Ajouter un salarié</div>
              <AjoutSalarié onAdd={s=>setSalaries(p=>[...p,{...s,id:Date.now()}])} />
            </div>
          </div>
        </div>
      )}

      {/* Modal absence */}
      {modalAbs&&(
        <ModalAbsence
          {...modalAbs}
          onConfirm={(absH,motif)=>{
            updateJour(modalAbs.semId,modalAbs.salId,modalAbs.jourIdx,"absHeures",String(absH));
            updateJour(modalAbs.semId,modalAbs.salId,modalAbs.jourIdx,"motifAbs",motif);
            // Ajouter à la liste des absences de la saisie
            const sem=semaines.find(s=>s.id===modalAbs.semId);
            const saisie=sem?.saisies[modalAbs.salId];
            const newAbs=[...(saisie?.absences||[]),{
              heures:absH, motif, dateStr:modalAbs.dateStr,
              id:Date.now().toString()
            }];
            updateSaisie(modalAbs.semId,modalAbs.salId,"absences",newAbs);
            updateJour(modalAbs.semId,modalAbs.salId,modalAbs.jourIdx,"valide",true);
            setModalAbs(null);
          }}
          onCancel={()=>setModalAbs(null)}
        />
      )}
    </div>
  );
}

// ─── Sous-composants ──────────────────────────────────────────────────────────
function Pill({l,v,c,dim}){
  return(
    <div style={{border:`2px solid ${c}`,borderRadius:6,padding:"2px 8px",textAlign:"center",opacity:dim?0.3:1}}>
      <div style={{fontWeight:800,fontSize:13,color:c}}>{v}</div>
      <div style={{fontSize:9,color:"#999"}}>{l}</div>
    </div>
  );
}
function Vide({icone,texte}){
  return <div style={{textAlign:"center",padding:"60px 20px",color:"#bbb"}}><div style={{fontSize:48,marginBottom:12}}>{icone}</div>{texte}</div>;
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
function ModalAbsence({manquant,dateStr,onConfirm,onCancel}){
  const [absH,setAbsH]=useState(String(manquant));
  const [motif,setMotif]=useState("");
  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.5)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:1000}}>
      <div style={{background:"#fff",borderRadius:14,padding:28,width:400,boxShadow:"0 8px 32px rgba(0,0,0,.2)"}}>
        <div style={{fontWeight:700,fontSize:16,color:"#1a3a5c",marginBottom:8}}>⚠️ Absence détectée</div>
        <div style={{fontSize:13,color:"#666",marginBottom:16}}>
          Le {fmtDateFR(dateStr)} — il manque <b>{manquant}h</b> par rapport à la référence.
        </div>
        <F label="Heures d'absence" value={absH} type="number" onChange={setAbsH}/>
        <div style={{marginTop:12}}>
          <label style={{fontSize:11,fontWeight:600,color:"#666"}}>Motif *</label>
          <select style={{width:"100%",padding:"8px 10px",borderRadius:7,border:"1.5px solid #d5dde8",fontSize:14,marginTop:4}}
            value={motif} onChange={e=>setMotif(e.target.value)}>
            <option value="">— Choisir un motif —</option>
            {MOTIFS.map(m=><option key={m}>{m}</option>)}
          </select>
        </div>
        <div style={{display:"flex",gap:10,marginTop:20,justifyContent:"flex-end"}}>
          <button style={{padding:"8px 18px",borderRadius:7,border:"1px solid #ccc",background:"#fff",cursor:"pointer"}} onClick={onCancel}>Annuler</button>
          <button style={{padding:"8px 18px",borderRadius:7,border:"none",background:"#1a3a5c",color:"#fff",fontWeight:600,cursor:"pointer"}}
            disabled={!motif||!absH}
            onClick={()=>onConfirm(parseFloat(absH),motif)}>Confirmer</button>
        </div>
      </div>
    </div>
  );
}
function AjoutSalarié({onAdd}){
  const [s,setS]=useState({nom:"",contrat:"CDI",coef:"",tauxH:"",abattement:false});
  return(
    <div style={{display:"flex",gap:10,flexWrap:"wrap",alignItems:"flex-end"}}>
      <F label="Nom *" value={s.nom} onChange={v=>setS(p=>({...p,nom:v}))} placeholder="NOM Prénom"/>
      <F label="Contrat" value={s.contrat} onChange={v=>setS(p=>({...p,contrat:v}))}/>
      <F label="Coef." value={s.coef} onChange={v=>setS(p=>({...p,coef:v}))}/>
      <F label="Taux H" value={s.tauxH} type="number" onChange={v=>setS(p=>({...p,tauxH:v}))}/>
      <div style={{display:"flex",flexDirection:"column",gap:4}}>
        <label style={{fontSize:11,fontWeight:600,color:"#666"}}>Abattement</label>
        <input type="checkbox" checked={s.abattement} onChange={e=>setS(p=>({...p,abattement:e.target.checked}))}/>
      </div>
      <button style={{padding:"8px 16px",borderRadius:7,background:"#27ae60",border:"none",color:"#fff",fontWeight:600,cursor:"pointer"}}
        disabled={!s.nom}
        onClick={()=>{onAdd({...s,tauxH:parseFloat(s.tauxH)||null,coef:isNaN(+s.coef)?s.coef:+s.coef});setS({nom:"",contrat:"CDI",coef:"",tauxH:"",abattement:false});}}>
        Ajouter
      </button>
    </div>
  );
}
function zoneColor(z){const c=["","#2ecc71","#27ae60","#f1c40f","#e67e22","#e74c3c","#9b59b6","#3498db","#1abc9c","#e91e63","#607d8b"];return c[z]||"#999";}

// ─── Styles ── Layout fixe 100vh, zéro scroll ─────────────────────────────────
const CSS={
  // Layout global : colonne verticale, hauteur fixe
  root:{fontFamily:"'Segoe UI',system-ui,sans-serif",height:"100vh",display:"flex",flexDirection:"column",background:"#eef1f6",color:"#1a1a2e",overflow:"hidden"},

  // Header compact
  header:{background:"linear-gradient(135deg,#1a3a5c,#0d2137)",color:"#fff",padding:"6px 16px",display:"flex",alignItems:"center",justifyContent:"space-between",flexShrink:0,height:44},
  headerL:{display:"flex",alignItems:"center",gap:10},
  logo:{width:28,height:28,borderRadius:7,background:"#e8a020",display:"flex",alignItems:"center",justifyContent:"center",fontWeight:900,fontSize:15,color:"#fff"},
  htitle:{fontWeight:700,fontSize:14,letterSpacing:.3},
  hsub:{fontSize:10,opacity:.6,marginLeft:6},
  headerR:{display:"flex",gap:6,alignItems:"center"},
  syncBadge:{fontSize:11,color:"rgba(255,255,255,.7)",padding:"2px 7px",background:"rgba(255,255,255,.15)",borderRadius:5},
  hsel:{padding:"3px 7px",borderRadius:5,border:"1px solid rgba(255,255,255,.25)",background:"rgba(255,255,255,.12)",color:"#fff",fontSize:12,cursor:"pointer"},

  // Barre de nav horizontale compacte
  nav:{background:"#fff",borderBottom:"2px solid #e0e6f0",padding:"0 16px",display:"flex",flexShrink:0},
  navBtn:{padding:"6px 14px",border:"none",background:"transparent",fontSize:12,cursor:"pointer",color:"#666",fontWeight:500,borderBottom:"2px solid transparent",marginBottom:-2},
  navOn:{color:"#1a3a5c",borderBottomColor:"#e8a020",fontWeight:700},

  // Toast
  toast:{background:"#27ae60",color:"#fff",textAlign:"center",padding:"5px",fontSize:12,fontWeight:600,flexShrink:0},
  toastErr:{background:"#e74c3c"},

  // Zone de contenu : flex grow, overflow hidden
  body:{flex:1,overflow:"hidden",padding:"8px 12px",display:"flex",flexDirection:"column",gap:6},

  // Layout saisie : 3 colonnes fixes
  saisieLayout:{flex:1,display:"grid",gridTemplateColumns:"160px 180px 1fr",gap:8,overflow:"hidden",minHeight:0},

  // Colonne 1 : semaines
  col1:{display:"flex",flexDirection:"column",gap:4,overflow:"hidden"},
  col1Title:{fontSize:10,fontWeight:700,color:"#1a3a5c",textTransform:"uppercase",letterSpacing:.5,padding:"0 2px"},
  semAddBox:{background:"#fff",borderRadius:8,padding:"8px 10px",boxShadow:"0 1px 3px rgba(0,0,0,.08)"},
  semAddRow:{display:"flex",gap:4,marginTop:4},
  semList:{flex:1,overflowY:"auto",display:"flex",flexDirection:"column",gap:3},
  semBtn:{padding:"5px 10px",borderRadius:7,border:"1.5px solid #c5d3e8",background:"#fff",cursor:"pointer",fontSize:11,fontWeight:500,color:"#555",textAlign:"left"},
  semBtnOn:{background:"#1a3a5c",color:"#fff",borderColor:"#1a3a5c"},

  // Colonne 2 : salariés
  col2:{display:"flex",flexDirection:"column",gap:4,overflow:"hidden"},
  col2Title:{fontSize:10,fontWeight:700,color:"#1a3a5c",textTransform:"uppercase",letterSpacing:.5,padding:"0 2px"},
  salList:{flex:1,overflowY:"auto",background:"#fff",borderRadius:8,boxShadow:"0 1px 3px rgba(0,0,0,.08)",overflow:"hidden"},
  salCard:{padding:"7px 10px",borderBottom:"1px solid #f0f3f8",cursor:"pointer",display:"flex",alignItems:"center",gap:6},
  salOn:{background:"#eef4ff",borderLeft:"3px solid #1a3a5c"},
  salNom:{fontWeight:600,fontSize:11,flex:1},
  salCheck:{fontSize:12,color:"#27ae60"},

  // Colonne 3 : formulaire saisie
  col3:{display:"flex",flexDirection:"column",gap:6,overflow:"hidden"},
  formCard:{background:"#fff",borderRadius:8,boxShadow:"0 1px 4px rgba(0,0,0,.08)",padding:"10px 14px",flex:1,display:"flex",flexDirection:"column",overflow:"hidden"},
  formHead:{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8,paddingBottom:7,borderBottom:"2px solid #e8a020",flexShrink:0},
  formNom:{fontWeight:700,fontSize:14,color:"#1a3a5c"},
  formSub:{fontSize:10,color:"#aaa",marginTop:1},
  pills:{display:"flex",gap:6},

  // Table jours : compact
  jtbl:{width:"100%",borderCollapse:"collapse",fontSize:11},
  jth:{background:"#f0f4fa",padding:"4px 6px",fontWeight:700,fontSize:10,color:"#555",textAlign:"center",borderBottom:"1px solid #dde5f0",whiteSpace:"nowrap"},
  jtd:{padding:"4px 6px",borderBottom:"1px solid #f5f7fa",verticalAlign:"middle"},
  hInput:{width:52,padding:"3px 5px",borderRadius:5,border:"1.5px solid #d5dde8",fontSize:12,textAlign:"center",outline:"none"},
  chSel:{padding:"3px 5px",borderRadius:5,border:"1.5px solid #d5dde8",fontSize:11,background:"#fff",maxWidth:160},
  zSel:{padding:"3px 4px",borderRadius:5,border:"1.5px solid #d5dde8",fontSize:11,background:"#fff",width:44},

  // Bas du formulaire : primes + données mensuelles sur une ligne
  formBottom:{display:"flex",gap:10,flexShrink:0,marginTop:6,alignItems:"flex-start"},
  primeSection:{flex:1},
  mensuelSection:{flex:1},
  secTitle:{fontSize:10,fontWeight:700,color:"#1a3a5c",textTransform:"uppercase",letterSpacing:.5,marginBottom:4},
  primeRow:{display:"flex",gap:5,marginBottom:4,alignItems:"center"},
  mensuelRow:{display:"flex",gap:6,flexWrap:"wrap"},

  // Navigation salariés
  navSal:{display:"flex",justifyContent:"space-between",marginTop:6,flexShrink:0},

  // Inputs compacts
  input:{padding:"4px 8px",borderRadius:6,border:"1.5px solid #d5dde8",fontSize:11,outline:"none"},
  label:{fontSize:10,fontWeight:600,color:"#666"},
  preview:{fontSize:10,color:"#888",fontStyle:"italic",alignSelf:"center"},

  // Boutons compacts
  btnPrimary:{padding:"5px 12px",borderRadius:6,background:"#1a3a5c",border:"none",color:"#fff",fontWeight:700,fontSize:11,cursor:"pointer"},
  btnSec:{padding:"5px 12px",borderRadius:6,border:"1.5px solid #c5d3e8",background:"#fff",color:"#555",fontWeight:600,fontSize:11,cursor:"pointer"},
  btnExp:{padding:"6px 16px",borderRadius:7,background:"#e8a020",border:"none",color:"#fff",fontWeight:700,fontSize:12,cursor:"pointer"},
  btnAdd:{padding:"4px 10px",borderRadius:6,border:"1.5px dashed #e8a020",background:"#fff8ee",color:"#c07010",fontWeight:600,cursor:"pointer",fontSize:10},
  btnDel:{padding:"3px 7px",borderRadius:5,border:"1px solid #e74c3c",background:"#fff",color:"#e74c3c",cursor:"pointer",fontSize:12},
  btnDelSm:{padding:"2px 7px",borderRadius:4,border:"1px solid #e74c3c",background:"#fff",color:"#e74c3c",cursor:"pointer",fontSize:10},

  // Récap
  recapLayout:{flex:1,overflow:"auto"},
  recapBar:{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10,flexShrink:0},
  bigTitle:{fontSize:15,fontWeight:700,color:"#1a3a5c"},
  rtbl:{width:"100%",borderCollapse:"collapse",background:"#fff",borderRadius:8,overflow:"hidden",boxShadow:"0 1px 4px rgba(0,0,0,.08)",fontSize:12},
  rth:{background:"#1a3a5c",color:"#fff",padding:"7px 8px",fontWeight:600,textAlign:"center",fontSize:10,whiteSpace:"nowrap"},
  rtd:{padding:"7px 8px",textAlign:"center",borderBottom:"1px solid #f0f3f8"},

  // Chantiers
  chGrid:{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(200px,1fr))",gap:10,overflowY:"auto",flex:1},
  chCard:{background:"#fff",borderRadius:8,padding:12,boxShadow:"0 1px 3px rgba(0,0,0,.08)"},
  zoneBadge:{color:"#fff",fontWeight:700,fontSize:11,padding:"2px 8px",borderRadius:16},

  // Salariés
  row:{display:"flex",gap:8,alignItems:"flex-end",flexWrap:"wrap"},
  field:{display:"flex",flexDirection:"column",gap:3},
  card:{background:"#fff",borderRadius:8,padding:14,boxShadow:"0 1px 4px rgba(0,0,0,.08)",marginBottom:10},
  cardTitle:{fontWeight:700,fontSize:13,color:"#1a3a5c",marginBottom:10},
};
