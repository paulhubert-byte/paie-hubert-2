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
  { id:1, nom:"CHEIKH Djamel",      contrat:"CDI",      coef:250,      tauxH:15.507, abattement:true,  hMensuel:151.67 },
  { id:2, nom:"COULIBALY Sekou",    contrat:"Apprenti", coef:"Apprent",tauxH:8.316,  abattement:false, hMensuel:151.67 },
  { id:3, nom:"EL YAHYAOUI Mourad", contrat:"CDI",      coef:250,      tauxH:15.507, abattement:true,  hMensuel:151.67 },
  { id:4, nom:"LANNEE Xavier",      contrat:"CDI",      coef:270,      tauxH:16.464, abattement:true,  hMensuel:151.67 },
  { id:5, nom:"MOREAU Dominique",   contrat:"CDI",      coef:250,      tauxH:15.507, abattement:true,  hMensuel:151.67 },
  { id:6, nom:"VINCENT Dominique",  contrat:"CDI",      coef:270,      tauxH:16.464, abattement:true,  hMensuel:151.67 },
  { id:7, nom:"HUBERT Paul",        contrat:"CDI",      coef:"Cadre",  tauxH:null,   abattement:false, hMensuel:151.67 },
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
function calcMois(semaines, salId, moisIdx, annee, salaries) {
  const sal = salaries?.find(s=>s.id===salId);
  const isForfait = sal?.forfait || sal?.coef==="Cadre";
  let hs25=0, hs50=0, paniers=0;
  const trajet=Object.fromEntries(ZONES.map(z=>[z,0]));
  const transport=Object.fromEntries(ZONES.map(z=>[z,0]));
  const primes=[];

  // Absences directement depuis les jours saisis (source de vérité)
  const absRaw = []; // [{motif, heures, dateStr}] — un par jour

  semaines.forEach(sem=>{
    const saisie = sem.saisies?.[salId];
    if(!saisie) return;

    const joursDuMois = (saisie.jours||[]).filter(j=>{
      const d=new Date(j.dateStr);
      return d.getMonth()+1===moisIdx && d.getFullYear()===annee;
    });

    // HS sur la semaine entière (convention bâtiment)
    const r = calcSemaine(saisie.jours||[]);
    hs25 += r.hs25; hs50 += r.hs50;

    joursDuMois.forEach(j=>{
      const h=parseFloat(j.heures)||0;
      if(h>4 && j.chantier!=="CFA" && !isForfait) paniers++;
      if(j.chantier && j.chantier!=="CFA" && j.zone){
        trajet[j.zone]=(trajet[j.zone]||0)+1;
        if(!j.vehEnt) transport[j.zone]=(transport[j.zone]||0)+1;
      }
      const absH=parseFloat(j.absHeures)||0;
      if(absH>0 && j.motifAbs){
        absRaw.push({motif:j.motifAbs, heures:absH, dateStr:j.dateStr});
      }
    });

    (saisie.primes||[]).forEach(p=>{ if(p.montant||p.libelle) primes.push(p); });
  });

  // Regrouper les absences par plages consécutives du même motif
  // Ex: CP lundi+mardi+mercredi → une entrée "CP: 23.49h du 07/04 au 09/04"
  // Tri par date puis regroupement
  absRaw.sort((a,b)=>a.dateStr.localeCompare(b.dateStr));
  const absEntries=[]; // [{motif, heures, dateDebut, dateFin}]
  absRaw.forEach(ab=>{
    const last=absEntries[absEntries.length-1];
    // Même motif ET jour consécutif (écart ≤ 3 jours pour passer le week-end)
    const isConsecutif = last && last.motif===ab.motif && (()=>{
      const d1=new Date(last.dateFin), d2=new Date(ab.dateStr);
      return (d2-d1)/86400000 <= 3;
    })();
    if(isConsecutif){
      last.heures=Math.round((last.heures+ab.heures)*100)/100;
      last.dateFin=ab.dateStr;
    } else {
      absEntries.push({motif:ab.motif, heures:ab.heures, dateDebut:ab.dateStr, dateFin:ab.dateStr});
    }
  });

  const absH=absEntries.reduce((s,e)=>s+e.heures,0);
  const H = sal?.hMensuel || H_MOIS;

  return {
    H, hs25:Math.round(hs25*100)/100, hs50:Math.round(hs50*100)/100,
    absH:Math.round(absH*100)/100, paniers, trajet, transport,
    absEntries, // [{motif, {heures, dates[]}}]
    primes, isForfait
  };
}

// Formate une entrée d'absence en texte
function fmtAbs(ab){
  const debut=fmtDateFR(ab.dateDebut), fin=fmtDateFR(ab.dateFin);
  const dates=debut===fin ? debut : `du ${debut} au ${fin}`;
  return {heures:ab.heures, motif:ab.motif, dates};
}
async function genererExcel(moisIdx, annee, semaines, salaries, chantiers, extras) {
  const XLSX = await import("https://cdn.sheetjs.com/xlsx-0.20.1/package/xlsx.mjs");
  const wb   = XLSX.utils.book_new();
  const moisNom = MOIS[moisIdx-1];
  const semMois = semaines.filter(s=>
    s.annee===annee&&
    (s.mois===moisIdx ||
     // Inclure semaines à cheval ayant au moins 1 jour dans le mois
     (s.saisies&&Object.values(s.saisies)[0]?.jours?.some(j=>{
       const d=new Date(j.dateStr);
       return d.getMonth()+1===moisIdx&&d.getFullYear()===annee;
     }))
    )
  );

  // Structure colonnes (35 colonnes A..AI) :
  // A=Nom/Contrat  B=Coef/TauxH  C=Abattement
  // D=H  E=HS25%  F=HS50%
  // G=AbsHeures  H=AbsMotif  I=AbsDates
  // J=PrimeMontant  K=PrimeLibellé
  // L=PanierQté
  // M..V  = Trajet zones 1..10  (col 12..21)
  // W..AF = Transport zones 1..10 (col 22..31)
  // AG=Acompte  AH=Saisie  AI=Observations
  const NC = 35;
  const aoa = [];
  const merges = [];
  const addM = (r,c,re,ce) => merges.push({s:{r,c},e:{r:re,c:ce}});

  // ── Ligne 1 : titre
  const r1=Array(NC).fill(null);
  r1[0]="Entreprise HUBERT PEINTURE";
  r1[10]=`${moisNom}-${String(annee).slice(2)}`;
  aoa.push(r1);

  // ── Ligne 2 vide
  aoa.push(Array(NC).fill(null));

  // ── Ligne 3 : groupes
  const r3=Array(NC).fill(null);
  r3[0]="SALARIE"; r3[2]="Abattement";
  r3[3]="TEMPS DE TRAVAIL"; r3[6]="ABSENCES"; r3[9]="PRIME";
  r3[11]="Paniers\nrepas"; r3[12]="TRAJET"; r3[22]="TRANSPORT";
  r3[32]="Acompte"; r3[33]="Saisie"; r3[34]="Observations";
  aoa.push(r3);

  // ── Ligne 4 : sous-en-têtes
  const r4=Array(NC).fill(null);
  r4[1]="Coef."; r4[3]="H"; r4[4]="HS 25 %"; r4[5]="HS 50 %";
  r4[6]="nombre\nheures"; r4[7]="motif"; r4[8]="dates";
  r4[9]="Montant"; r4[10]="Libellé";
  for(let i=0;i<10;i++){r4[12+i]="Zone"; r4[22+i]="Zone";}
  aoa.push(r4);

  // ── Ligne 5 : taux H + numéros zones
  const r5=Array(NC).fill(null);
  r5[1]="Taux H"; r5[11]="Qté";
  for(let i=0;i<10;i++){r5[12+i]=i+1; r5[22+i]=i+1;}
  aoa.push(r5);

  // Merges en-têtes
  addM(0,0,0,9); addM(0,10,0,11);       // titre + mois
  addM(2,0,4,1);                          // SALARIE A3:B5
  addM(2,2,4,2);                          // Abattement C3:C5
  addM(2,3,2,5);                          // TEMPS DE TRAVAIL D3:F3
  addM(2,6,2,8);                          // ABSENCES G3:I3
  addM(2,9,2,10);                         // PRIME J3:K3
  addM(2,11,3,11);                        // Paniers L3:L4
  addM(2,12,2,21);                        // TRAJET M3:V3
  addM(2,22,2,31);                        // TRANSPORT W3:AF3
  addM(2,32,4,32); addM(2,33,4,33); addM(2,34,4,34); // Acompte/Saisie/Obs
  addM(3,3,4,3); addM(3,4,4,4); addM(3,5,4,5);
  addM(3,6,4,6); addM(3,7,4,7); addM(3,8,4,8);
  addM(3,9,4,9); addM(3,10,4,10);

  // ── Données salariés
  let dataRow = 5; // index 0-based dans aoa

  salaries.forEach(sal=>{
    const c  = calcMois(semMois, sal.id, moisIdx, annee, salaries);
    const ex = extras[sal.id]||{};
    const tauxH = (ex.tauxH!==undefined&&ex.tauxH!=='') ? ex.tauxH : sal.tauxH;

    // ── Construire les absences depuis calcMois (source unique de vérité)
    const absEntries = c.absEntries||[];
    const nbAbs    = absEntries.length;
    const nbPrimes = c.primes.length;
    const nbSuppl  = Math.max(0, nbAbs-1, nbPrimes-1);
    const totalLignes = 2 + nbSuppl;

    // ── LIGNE NOM
    const rowNom = Array(NC).fill(null);
    rowNom[0] = sal.nom;
    rowNom[1] = sal.coef!=="Cadre" ? sal.coef : null;
    rowNom[2] = sal.abattement ? "OUI" : null;
    if(absEntries.length>0){
      const ab=fmtAbs(absEntries[0]);
      rowNom[6]=ab.heures||null; rowNom[7]=ab.motif; rowNom[8]=ab.dates;
    }
    if(c.primes.length>0){
      rowNom[9]=parseFloat(c.primes[0].montant)||null;
      rowNom[10]=c.primes[0].libelle||null;
    }
    aoa.push(rowNom);

    // ── LIGNE DONNÉES
    const rowData = Array(NC).fill(null);
    rowData[0] = sal.contrat;
    rowData[1] = tauxH;
    if(!c.isForfait) rowData[3] = c.H;
    else rowData[3] = sal.hMensuel||H_MOIS;
    rowData[4] = c.hs25||null;
    rowData[5] = c.hs50||null;
    if(!c.isForfait) rowData[11] = c.paniers||null;
    for(let i=0;i<10;i++){
      rowData[12+i] = c.trajet[i+1]||null;
      rowData[22+i] = c.transport[i+1]||null;
    }
    rowData[32] = ex.acompte||null;
    rowData[33] = ex.saisieArr||null;
    const obs=[];
    if(ex.fraisPro) obs.push(`Rembt frais professionnels ${ex.fraisPro}€`);
    if(ex.obs) obs.push(ex.obs);
    rowData[34] = obs.join(" | ")||null;
    aoa.push(rowData);

    // ── LIGNES SUPPLÉMENTAIRES
    for(let i=0;i<nbSuppl;i++){
      const rowX = Array(NC).fill(null);
      if(i+1<absEntries.length){
        const ab=fmtAbs(absEntries[i+1]);
        rowX[6]=ab.heures||null; rowX[7]=ab.motif; rowX[8]=ab.dates;
      }
      if(i+1<c.primes.length){
        rowX[9]=parseFloat(c.primes[i+1].montant)||null;
        rowX[10]=c.primes[i+1].libelle||null;
      }
      aoa.push(rowX);
    }

    // ── LIGNE VIDE de séparation
    aoa.push(Array(NC).fill(null));

    // ── Merges pour ce salarié (sans inclure la ligne vide)
    const rNom  = dataRow;
    const rFin  = dataRow+totalLignes-1;
    const colsFixes=[0,1,2,3,4,5,11,
      ...Array(10).fill(0).map((_,i)=>12+i),
      ...Array(10).fill(0).map((_,i)=>22+i),
      32,33,34];
    colsFixes.forEach(col=>{
      if(rFin>rNom) addM(rNom,col,rFin,col);
    });

    // Marquer les lignes d'absence pour couleur rouge
    // On stocke les indices pour appliquer les styles après
    for(let i=0;i<totalLignes;i++){
      const r=rNom+i;
      const hasAbs = i===0 ? absEntries.length>0 : (i-1)<absEntries.length-1;
      if(hasAbs){
        // Stocker pour style rouge — SheetJS lite ne supporte pas les styles
        // On met le texte en rouge via le format conditionnel pas disponible
        // Solution : on laisse tel quel, les absences sont visibles par leur contenu
      }
    }

    dataRow += totalLignes + 1; // +1 pour la ligne vide
  });

  const ws = XLSX.utils.aoa_to_sheet(aoa);

  // ── Appliquer couleur rouge sur cellules d'absence
  // SheetJS free ne supporte pas les styles, on skip la couleur
  ws["!merges"] = merges;

  ws["!cols"] = [
    {wch:21.9},{wch:9.3},{wch:4.5},{wch:8.4},{wch:9.3},{wch:9.1},
    {wch:10.9},{wch:16.1},{wch:20.9},{wch:12.4},{wch:19.7},{wch:11.7},
    ...Array(10).fill({wch:6.7}),
    ...Array(10).fill({wch:6.7}),
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
  const semMois = semaines.filter(s=>
    s.annee===annee&&
    (s.mois===mois ||
     (s.saisies&&Object.values(s.saisies)[0]?.jours?.some(j=>{
       const d=new Date(j.dateStr);
       return d.getMonth()+1===mois&&d.getFullYear()===annee;
     }))
    )
  );
  const semaine = semaines.find(s=>s.id===semId);
  const sal     = salaries.find(s=>s.id===salId);

  function ajouterSemaine(){
    if(semaines.find(s=>s.numSem===newSem.num&&s.annee===newSem.annee)){
      toast_("Semaine déjà existante",false); return;
    }
    const lundi=isoWeekToMonday(newSem.annee,newSem.num);
    const feries={...getFeries(newSem.annee-1),...getFeries(newSem.annee),...getFeries(newSem.annee+1)};
    // Générer les jours de base (sans heures — dépend du salarié)
    const joursBase=JOURS.map((_,i)=>{
      const d=addDays(lundi,i);
      const ds=fmtDate(d);
      const ferie=feries[ds];
      const hRef=hStd(ds);
      return {idx:i,dateStr:ds,ferie:ferie||null,
              absHeures:ferie?String(hRef):"",motifAbs:ferie?"Jour férié":"",
              chantier:"",zone:null,zoneForce:null,vehEnt:false,valide:false};
    });
    const moisSem = addDays(lundi,2).getMonth()+1;
    const anneeSem = addDays(lundi,2).getFullYear();
    const sem={
      id:`${newSem.annee}-S${newSem.num}`,
      numSem:newSem.num, annee:newSem.annee,
      mois:moisSem, lundi:fmtDate(lundi),
      saisies: Object.fromEntries(salaries.map(s=>{
        const jours=joursBase.map(j=>{
          const hRef = s.id===7 ? 7 : hStd(j.dateStr);
          if(j.ferie){
            // Jour férié : 0h travaillé par défaut, absence = heures de référence
            return {...j, heures:"0", valide:true, absHeures:String(hRef), motifAbs:"Jour férié", presaisie:false};
          }
          // Jour normal : heures pré-remplies, pas encore validées
          return {...j, heures:String(hRef), valide:false, absHeures:"", motifAbs:"", presaisie:true};
        });
        return [s.id, {jours, absences:[], primes:[]}];
      }))
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

  // Validation des heures d'un jour — gère toutes les règles automatiquement
  function validerHeures(semId, salId, jourIdx){
    const sem=semaines.find(s=>s.id===semId);
    const saisie=sem?.saisies[salId];
    const jour=saisie?.jours[jourIdx];
    const salaire=salaries.find(s=>s.id===salId);
    if(!jour||!salaire)return;

    const h=parseFloat(jour.heures)||0;
    const ref=salaire.id===7?7:hStd(jour.dateStr);

    // Jour férié → 0h par défaut, mais si on saisit des heures c'est exceptionnel
    if(jour.ferie){
      if(h===0){
        // Cas normal : pas travaillé, absence = heures de référence
        setSemaines(p=>p.map(s=>{
          if(s.id!==semId)return s;
          const sa=s.saisies[salId];
          const jours=sa.jours.map((jj,ii)=>ii===jourIdx?{...jj,valide:true,absHeures:String(ref),motifAbs:"Jour férié"}:jj);
          return{...s,saisies:{...s.saisies,[salId]:{...sa,jours}}};
        }));
      } else {
        // Exceptionnel : travail un jour férié, pas d'absence
        setSemaines(p=>p.map(s=>{
          if(s.id!==semId)return s;
          const sa=s.saisies[salId];
          const jours=sa.jours.map((jj,ii)=>ii===jourIdx?{...jj,valide:true,absHeures:"",motifAbs:""}:jj);
          return{...s,saisies:{...s.saisies,[salId]:{...sa,jours}}};
        }));
      }
      return;
    }

    // CFA → validé, pas d'absence, pas de panier/trajet
    if(jour.chantier==="CFA"){
      updateJour(semId,salId,jourIdx,"valide",true);
      updateJour(semId,salId,jourIdx,"absHeures","");
      updateJour(semId,salId,jourIdx,"motifAbs","");
      return;
    }

    // Si heures = référence → valide, supprime toute absence sur ce jour
    if(Math.round(h*100)===Math.round(ref*100)){
      setSemaines(p=>p.map(s=>{
        if(s.id!==semId)return s;
        const sa=s.saisies[salId];
        const jours=sa.jours.map((j,i)=>i===jourIdx?{...j,valide:true,absHeures:"",motifAbs:""}:j);
        // Supprimer aussi les absences liées à ce jour dans la liste
        const absences=(sa.absences||[]).filter(a=>a.dateStr!==jour.dateStr);
        return{...s,saisies:{...s.saisies,[salId]:{...sa,jours,absences}}};
      }));
      return;
    }

    // Si heures > référence → HS, valide sans absence
    if(h>ref){
      updateJour(semId,salId,jourIdx,"valide",true);
      updateJour(semId,salId,jourIdx,"absHeures","");
      updateJour(semId,salId,jourIdx,"motifAbs","");
      return;
    }

    // Si heures < référence → vérifier si le total semaine atteint quand même 35h
    // (ex: récup d'heures, décalage sur d'autres jours)
    const totalSem = saisie.jours.reduce((acc,j,i)=>{
      const hj = i===jourIdx ? h : (parseFloat(j.heures)||0);
      return acc+(j.ferie?0:hj);
    },0);

    if(Math.round(totalSem*100)>=Math.round(H_SEM*100)){
      // 35h atteintes sur la semaine → pas d'absence
      setSemaines(p=>p.map(s=>{
        if(s.id!==semId)return s;
        const sa=s.saisies[salId];
        const jours=sa.jours.map((j,i)=>i===jourIdx?{...j,valide:true,absHeures:"",motifAbs:""}:j);
        const absences=(sa.absences||[]).filter(a=>a.dateStr!==jour.dateStr);
        return{...s,saisies:{...s.saisies,[salId]:{...sa,jours,absences}}};
      }));
      return;
    }

    // Heures < référence ET total < 35h → demander motif d'absence
    const manquant=Math.round((ref-h)*100)/100;
    setModalAbs({semId,salId,jourIdx,manquant,dateStr:jour.dateStr,hRef:ref});
  }

  // ─── Géolocalisation chantier ─────────────────────────────────────────────
  async function ajouterChantier(){
    if(!newCh.nom||!newCh.ville){toast_("Nom et ville requis",false);return;}
    setGeoLoading(true);
    try{
      // Chercher d'abord avec nom + ville, sinon juste la ville
      const q=`${newCh.nom} ${newCh.ville} France`;
      const q2=`${newCh.ville} France`;
      let res=await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=1&countrycodes=fr`,
        {headers:{"Accept-Language":"fr","User-Agent":"HubertPeinture/1.0"}});
      let data=await res.json();
      // Si pas de résultat précis, chercher par ville uniquement
      if(!data.length){
        res=await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q2)}&limit=1&countrycodes=fr`,
          {headers:{"Accept-Language":"fr","User-Agent":"HubertPeinture/1.0"}});
        data=await res.json();
      }
      if(!data.length)throw new Error();
      const lat=parseFloat(data[0].lat),lng=parseFloat(data[0].lon);
      // Coordonnées précises du dépôt : 1 Allée de la Batellerie, Amfreville-la-Mi-Voie
      const DLAT=49.3614, DLNG=1.1069;
      const dLat=(lat-DLAT)*Math.PI/180,dLng=(lng-DLNG)*Math.PI/180;
      const a=Math.sin(dLat/2)**2+Math.cos(DLAT*Math.PI/180)*Math.cos(lat*Math.PI/180)*Math.sin(dLng/2)**2;
      const km=6371*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));
      const zone=km<10?1:km<20?2:km<30?3:km<40?4:km<50?5:km<60?6:km<70?7:km<90?8:km<110?9:10;
      const ch={id:Date.now().toString(),nom:newCh.nom,ville:newCh.ville,lat,lng,km:Math.round(km*10)/10,zone,adresseGeo:data[0].display_name};
      setChantiers(p=>[...p,ch].sort((a,b)=>a.nom.localeCompare(b.nom)));
      setNewCh({nom:"",ville:""});
      toast_(`✓ ${ch.nom} — Zone ${zone} (${ch.km} km à vol d'oiseau)`);
    }catch(e){toast_("Adresse introuvable — vérifiez la ville",false);}
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

                        {/* Bouton 35h : remplit et valide toute la semaine */}
                        {(()=>{
                          const toutValide=saisieAct.jours.filter(j=>!j.ferie).every(j=>j.valide);
                          return(
                            <button
                              title={toutValide?"Semaine validée à 35h":"Valider semaine complète 35h"}
                              style={{fontSize:10,padding:"3px 8px",borderRadius:5,cursor:"pointer",fontWeight:700,
                                border:`1.5px solid ${toutValide?"#27ae60":"#1a3a5c"}`,
                                background:toutValide?"#27ae60":"#1a3a5c",color:"#fff"}}
                              onClick={()=>{
                                setSemaines(p=>p.map(s=>{
                                  if(s.id!==semId)return s;
                                  const jours=s.saisies[salId].jours.map(j=>{
                                    if(j.ferie)return j;
                                    const hRef=sal.id===7?7:hStd(j.dateStr);
                                    return{...j,heures:String(hRef),valide:true,presaisie:false,absHeures:"",motifAbs:""};
                                  });
                                  // 35h validées → supprimer toutes les absences
                                  return{...s,saisies:{...s.saisies,[salId]:{...s.saisies[salId],jours,absences:[]}}};
                                }));
                              }}>
                              ✓ 35h
                            </button>
                          );
                        })()}

                        {/* Veh entreprise toute la semaine — propre à chaque salarié */}
                        <label style={{fontSize:10,cursor:"pointer",display:"flex",alignItems:"center",gap:3}}>
                          <input type="checkbox"
                            checked={saisieAct.jours.filter(j=>!j.ferie&&parseFloat(j.heures)>0).length>0 &&
                                     saisieAct.jours.filter(j=>!j.ferie&&parseFloat(j.heures)>0).every(j=>j.vehEnt)}
                            onChange={e=>{
                              const val=e.target.checked;
                              setSemaines(p=>p.map(s=>{
                                if(s.id!==semId)return s;
                                const jours=s.saisies[salId].jours.map(j=>
                                  (!j.ferie&&parseFloat(j.heures)>0)?{...j,vehEnt:val}:j
                                );
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
                                const hRef=sal.id===7?7:hStd(j.dateStr);
                                return{...j,heures:"0",absHeures:String(hRef),motifAbs:motif,valide:true};
                              });
                              const totalAbs=jours.filter(j=>!j.ferie).reduce((acc,j)=>acc+(parseFloat(j.absHeures)||0),0);
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
                        <th style={CSS.jth}>
                          <div style={{display:"flex",alignItems:"center",gap:4,justifyContent:"center"}}>
                            Heures
                            <button style={{fontSize:9,padding:"1px 5px",borderRadius:3,border:"1px solid #27ae60",background:"#f0fff4",color:"#27ae60",cursor:"pointer",fontWeight:700}}
                              title="Valider toutes les heures pré-saisies"
                              onClick={()=>saisieAct.jours.forEach((_,i)=>{ if(!saisieAct.jours[i].valide) validerHeures(semId,salId,i); })}>
                              ✓ tout
                            </button>
                          </div>
                        </th>
                        <th style={CSS.jth}>Chantier</th>
                        <th style={CSS.jth}>Zone</th>
                        <th style={CSS.jth}>🚐</th>
                        <th style={CSS.jth}>Absence / Motif</th>
                      </tr>
                    </thead>
                    <tbody>
                      {saisieAct.jours.map((j,i)=>{
                        const hRef = sal.id===7 ? 7 : hStd(j.dateStr);
                        const estPresaisie = !j.valide && !j.ferie;
                        const estAbsent    = j.valide && parseFloat(j.heures) < hRef && !j.ferie && j.chantier!=="CFA";
                        const estFerieNonTravaille = j.ferie && parseFloat(j.heures)===0;
                        const bg = estFerieNonTravaille ? "#fffbea"
                                 : j.ferie              ? "#fff8dc"  // férié mais travaillé
                                 : estAbsent            ? "#fdf0ff"
                                 : j.valide             ? "#f0fff4"
                                 : "#f8f9fa";
                        return(
                          <tr key={i} style={{background:bg}}>
                            <td style={CSS.jtd}>
                              <div style={{fontWeight:600,fontSize:11}}>{fmtJour(new Date(j.dateStr))}</div>
                              {j.ferie&&<div style={{fontSize:9,color:"#e67e22"}}>{j.ferie}</div>}
                            </td>
                            <td style={CSS.jtd}>
                              <div style={{display:"flex",gap:4,alignItems:"center"}}>
                                {/* Bouton OK — valide les heures pré-saisies en 1 clic */}
                                {!j.ferie&&(
                                  <button
                                    onClick={()=>validerHeures(semId,salId,i)}
                                    title={j.valide ? "Validé" : `Valider ${hRef}h`}
                                    style={{
                                      width:32, height:24, borderRadius:5, cursor:"pointer",
                                      fontSize:10, fontWeight:700,
                                      border: j.valide ? "1.5px solid #27ae60" : "1.5px solid #ccc",
                                      background: j.valide ? "#27ae60" : "#f0f0f0",
                                      color: j.valide ? "#fff" : "#999",
                                      flexShrink:0,
                                    }}>
                                    {j.valide ? "✓" : "OK"}
                                  </button>
                                )}
                                <input type="number" min="0" max="12" step="0.5"
                                  style={{
                                    ...CSS.hInput,
                                    color: estPresaisie ? "#bbb" : estAbsent ? "#8e44ad" : "#1a3a5c",
                                    fontWeight: j.valide ? 700 : 400,
                                    background: estPresaisie ? "#efefef" : "#fff",
                                    border: estPresaisie ? "1.5px dashed #ccc"
                                          : j.valide     ? "1.5px solid #27ae60"
                                          : "1.5px solid #d5dde8",
                                  }}
                                  value={j.heures}
                                  onChange={e=>{
                                    // Modifier les heures → invalide ce jour
                                    setSemaines(p=>p.map(s=>{
                                      if(s.id!==semId)return s;
                                      const sa=s.saisies[salId];
                                      const jours=sa.jours.map((jj,ii)=>ii===i?{...jj,heures:e.target.value,valide:false,presaisie:false}:jj);
                                      return{...s,saisies:{...s.saisies,[salId]:{...sa,jours}}};
                                    }));
                                  }}
                                  onBlur={()=>validerHeures(semId,salId,i)}
                                />
                                <span style={{fontSize:9,color:"#bbb"}}>/{hRef}</span>
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
                                {!j.chantier&&j.valide&&parseFloat(j.heures)>0&&(
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
            <div style={{display:"flex",gap:8}}>
              <button style={{...CSS.btnExp,background:"#27ae60"}}
                onClick={async()=>{
                  const XS=await import("https://cdn.jsdelivr.net/npm/xlsx-style@0.8.13/+esm").catch(()=>null);
                  const XLSX=XS||await import("https://cdn.sheetjs.com/xlsx-0.20.1/package/xlsx.mjs");
                  const hs=!!XS;
                  const moisNom=MOIS[mois-1];
                  const semMoisExp=semaines.filter(s=>s.annee===annee&&(s.mois===mois||(s.saisies&&Object.values(s.saisies)[0]?.jours?.some(j=>{const d=new Date(j.dateStr);return d.getMonth()+1===mois&&d.getFullYear()===annee;}))));
                  const C={sal:"FF1A3A5C",sal2:"FF2E4A6C",ttrav:"FF2980B9",h:"FF3498DB",hs25:"FFE67E22",hs50:"FFC0392B",abs:"FF8E44AD",abs2:"FF9B59B6",prime:"FF27AE60",panier:"FF16A085",trajet:"FF2471A3",transport:"FF1A5276",divers:"FF6C3483",rowP:"FFEEF2F8",rowI:"FFFFFFFF",wh:"FFFFFFFF",gr:"FFCCCCCC"};
                  const mk=(v,bg,fc,bold,sz,ha)=>({v:v??null,t:typeof v==="number"?"n":"s",s:hs?{fill:{patternType:"solid",fgColor:{rgb:bg||"FFFFFFFF"}},font:{name:"Arial",sz:sz||10,bold:!!bold,color:{rgb:fc||"FF333333"}},alignment:{horizontal:ha||"center",vertical:"center"},border:{top:{style:"thin",color:{rgb:"FFCCCCCC"}},bottom:{style:"thin",color:{rgb:"FFCCCCCC"}},left:{style:"thin",color:{rgb:"FFCCCCCC"}},right:{style:"thin",color:{rgb:"FFCCCCCC"}}}}:{}});
                  const ws={};
                  const RC=(r,c)=>XLSX.utils.encode_cell({r,c});
                  let maxR=0;
                  const sc=(r,c,v,bg,fc,bold,sz,ha)=>{ws[RC(r,c)]=mk(v,bg,fc,bold,sz,ha);if(r>maxR)maxR=r;};
                  // Titre
                  sc(0,0,`RÉCAPITULATIF PAIE — ${moisNom.toUpperCase()} ${annee}`,C.sal,C.wh,true,14,"center");
                  // Groupes
                  [[0,4,"SALARIÉ",C.sal],[5,7,"TEMPS DE TRAVAIL",C.ttrav],[8,10,"ABSENCES",C.abs],[11,12,"PRIME",C.prime],[13,13,"PANIER",C.panier],[14,23,"TRAJET",C.trajet],[24,33,"TRANSPORT",C.transport],[34,36,"DIVERS",C.divers]]
                    .forEach(([c1,c2,lab,bg])=>{for(let c=c1;c<=c2;c++)sc(2,c,c===c1?lab:null,bg,C.wh,true,10);});
                  // Colonnes
                  [["Salarié",C.sal2,"left"],["Contrat",C.sal2],["Coef.",C.sal2],["Taux H",C.sal2],["Abt.",C.sal2],["H mois",C.h],["HS 25%",C.hs25],["HS 50%",C.hs50],["Abs. H",C.abs2],["Motif",C.abs2],["Dates",C.abs2],["Montant",C.prime],["Libellé",C.prime],["Paniers",C.panier],...ZONES.map(z=>[`Z${z}`,C.trajet]),...ZONES.map(z=>[`Z${z}`,C.transport]),["Acompte",C.divers],["Saisie",C.divers],["Observations",C.divers,"left"]]
                    .forEach(([lab,bg,ha],i)=>sc(3,i,lab,bg,C.wh,true,9,ha||"center"));
                  // Données
                  salaries.forEach((s,i)=>{
                    const row=4+i,c=calcMois(semMoisExp,s.id,mois,annee,salaries),ex=extras[s.id]||{};
                    const tauxH=(ex.tauxH!==undefined&&ex.tauxH!=='')?ex.tauxH:s.tauxH;
                    const bg=i%2===0?C.rowP:C.rowI;
                    const absM=c.absEntries.map(e=>e.motif).join(" / ")||null;
                    const absD=c.absEntries.map(e=>e.heures+'h · '+fmtAbs(e).dates).join(' / ')||null;
                    const obs=[ex.fraisPro&&`Rembt frais pro ${ex.fraisPro}€`,ex.obs].filter(Boolean).join(" | ")||null;
                    const p0=c.primes[0];
                    sc(row,0,s.nom,bg,C.sal,true,11,"left");
                    sc(row,1,s.contrat,bg,"FF555555",false,9);
                    sc(row,2,s.coef,bg,"FF333333",true);
                    sc(row,3,tauxH||"—",bg);
                    sc(row,4,s.abattement?"OUI":"NON",bg,s.abattement?C.prime:C.gr,true);
                    sc(row,5,c.H,bg,C.sal,true);
                    sc(row,6,c.hs25||"—",bg,c.hs25?C.hs25:C.gr,!!c.hs25);
                    sc(row,7,c.hs50||"—",bg,c.hs50?C.hs50:C.gr,!!c.hs50);
                    sc(row,8,c.absH||"—",bg,c.absH?C.abs:C.gr,!!c.absH);
                    sc(row,9,absM||"—",bg,c.absH?C.abs:C.gr);
                    sc(row,10,absD||"—",bg,c.absH?C.abs:C.gr);
                    sc(row,11,p0?parseFloat(p0.montant)||"—":"—",bg,p0?C.prime:C.gr,!!p0);
                    sc(row,12,p0?p0.libelle||"—":"—",bg,p0?C.prime:C.gr);
                    sc(row,13,c.isForfait?"—":c.paniers||"—",bg,c.paniers?C.panier:C.gr,!!c.paniers);
                    ZONES.forEach((z,j)=>{const v=c.trajet[z]||0;sc(row,14+j,v||null,v?"FFEAF4FB":bg,v?C.trajet:C.gr,!!v);});
                    ZONES.forEach((z,j)=>{const v=c.transport[z]||0;sc(row,24+j,v||null,v?"FFD6EAF8":bg,v?C.transport:C.gr,!!v);});
                    sc(row,34,ex.acompte||"—",bg);
                    sc(row,35,ex.saisieArr||"—",bg);
                    sc(row,36,obs||"—",bg,"FF333333",false,10,"left");
                  });
                  ws["!ref"]=XLSX.utils.encode_range({s:{r:0,c:0},e:{r:maxR,c:36}});
                  ws["!merges"]=[{s:{r:0,c:0},e:{r:0,c:36}},{s:{r:2,c:0},e:{r:2,c:4}},{s:{r:2,c:5},e:{r:2,c:7}},{s:{r:2,c:8},e:{r:2,c:10}},{s:{r:2,c:11},e:{r:2,c:12}},{s:{r:2,c:14},e:{r:2,c:23}},{s:{r:2,c:24},e:{r:2,c:33}},{s:{r:2,c:34},e:{r:2,c:36}}];
                  ws["!cols"]=[{wch:22},{wch:9},{wch:7},{wch:8},{wch:5},{wch:8},{wch:8},{wch:8},{wch:8},{wch:18},{wch:22},{wch:10},{wch:18},{wch:8},...Array(10).fill({wch:5}),...Array(10).fill({wch:5}),{wch:10},{wch:10},{wch:30}];
                  ws["!freeze"]={xSplit:1,ySplit:4};
                  const wb2=XLSX.utils.book_new();
                  XLSX.utils.book_append_sheet(wb2,ws,moisNom);
                  XLSX.writeFile(wb2,`Recap_paie_${moisNom}_${annee}.xlsx`);
                }}>
                📊 Récap Excel</button>
              <button style={CSS.btnExp}
                onClick={()=>genererExcel(mois,annee,semaines,salaries,chantiers,extras)}>
                ⬇ Exporter Excel (Saisie EV)
              </button>
            </div>
          </div>
          {semMois.length===0&&<Vide icone="📊" texte="Aucune semaine saisie pour ce mois"/>}
          {semMois.length>0&&(
            <div style={{overflowX:"auto",flex:1}} id="recap-table">
              <table style={{...CSS.rtbl,borderCollapse:"collapse"}}>
                <thead>
                  <tr>
                    <th colSpan={5} style={{...CSS.rth,background:"#1a3a5c",textAlign:"center",borderRight:"2px solid #fff",fontSize:10}}>SALARIÉ</th>
                    <th colSpan={3} style={{...CSS.rth,background:"#2980b9",textAlign:"center",borderRight:"2px solid #fff",fontSize:10}}>TEMPS DE TRAVAIL</th>
                    <th colSpan={3} style={{...CSS.rth,background:"#8e44ad",textAlign:"center",borderRight:"2px solid #fff",fontSize:10}}>ABSENCES</th>
                    <th colSpan={2} style={{...CSS.rth,background:"#27ae60",textAlign:"center",borderRight:"2px solid #fff",fontSize:10}}>PRIME</th>
                    <th colSpan={1} style={{...CSS.rth,background:"#16a085",textAlign:"center",borderRight:"2px solid #fff",fontSize:10}}>PANIER</th>
                    <th colSpan={10} style={{...CSS.rth,background:"#2471a3",textAlign:"center",borderRight:"2px solid #fff",fontSize:10}}>TRAJET</th>
                    <th colSpan={10} style={{...CSS.rth,background:"#1a5276",textAlign:"center",borderRight:"2px solid #fff",fontSize:10}}>TRANSPORT</th>
                    <th colSpan={3} style={{...CSS.rth,background:"#6c3483",textAlign:"center",fontSize:10}}>DIVERS</th>
                  </tr>
                  <tr>
                    <th style={{...CSS.rth,background:"#2e4a6c",textAlign:"left",minWidth:130,borderRight:"1px solid #3a5a7c"}}>Salarié</th>
                    <th style={{...CSS.rth,background:"#2e4a6c",fontSize:9,borderRight:"1px solid #3a5a7c"}}>Contrat</th>
                    <th style={{...CSS.rth,background:"#2e4a6c",fontSize:9,borderRight:"1px solid #3a5a7c"}}>Coef.</th>
                    <th style={{...CSS.rth,background:"#2e4a6c",fontSize:9,borderRight:"1px solid #3a5a7c"}}>Taux H</th>
                    <th style={{...CSS.rth,background:"#2e4a6c",fontSize:9,borderRight:"2px solid #fff"}}>Abt.</th>
                    <th style={{...CSS.rth,background:"#3498db",borderRight:"1px solid #5dade2"}}>H mois</th>
                    <th style={{...CSS.rth,background:"#e67e22",borderRight:"1px solid #f0a030"}}>HS 25%</th>
                    <th style={{...CSS.rth,background:"#c0392b",borderRight:"2px solid #fff"}}>HS 50%</th>
                    <th style={{...CSS.rth,background:"#9b59b6",borderRight:"1px solid #a569bd"}}>Heures</th>
                    <th style={{...CSS.rth,background:"#9b59b6",borderRight:"1px solid #a569bd",minWidth:100}}>Motif</th>
                    <th style={{...CSS.rth,background:"#9b59b6",minWidth:130,borderRight:"2px solid #fff"}}>Dates</th>
                    <th style={{...CSS.rth,background:"#27ae60",borderRight:"1px solid #2ecc71"}}>Montant</th>
                    <th style={{...CSS.rth,background:"#27ae60",borderRight:"2px solid #fff"}}>Libellé</th>
                    <th style={{...CSS.rth,background:"#16a085",borderRight:"2px solid #fff"}}>Paniers</th>
                    {ZONES.map(z=><th key={`tj${z}`} style={{...CSS.rth,background:"#2980b9",fontSize:9,borderRight:"1px solid #5dade2",minWidth:28}}>Z{z}</th>)}
                    {ZONES.map((z,i)=><th key={`tr${z}`} style={{...CSS.rth,background:"#1a5276",fontSize:9,borderRight:i===9?"2px solid #fff":"1px solid #2471a3",minWidth:28}}>Z{z}</th>)}
                    <th style={{...CSS.rth,background:"#6c3483",borderRight:"1px solid #7d3c98"}}>Acompte</th>
                    <th style={{...CSS.rth,background:"#6c3483",borderRight:"1px solid #7d3c98"}}>Saisie</th>
                    <th style={{...CSS.rth,background:"#6c3483",minWidth:140}}>Observations</th>
                  </tr>
                </thead>
                <tbody>
                  {salaries.map((s,i)=>{
                    const c=calcMois(semMois,s.id,mois,annee,salaries);
                    const ex=extras[s.id]||{};
                    const tauxH=(ex.tauxH!==undefined&&ex.tauxH!=='')?ex.tauxH:s.tauxH;
                    const obs=[ex.fraisPro&&`Rembt frais pro ${ex.fraisPro}€`,ex.obs].filter(Boolean).join(" | ");
                    const rowBg = i%2===0?"#f0f4f8":"#ffffff";
                    const absColor = c.absEntries.length>0?"#8e44ad":"#ccc";
                    return(
                      <tr key={s.id} style={{background:rowBg,borderBottom:"2px solid #c0c8d8"}}>
                        <td style={{padding:"6px 10px",fontWeight:700,fontSize:11,borderRight:"1px solid #d0d8e8",color:"#1a3a5c"}}>{s.nom}</td>
                        <td style={{...CSS.rtd,fontSize:9,borderRight:"1px solid #d0d8e8",color:"#555"}}>{s.contrat}</td>
                        <td style={{...CSS.rtd,fontSize:10,borderRight:"1px solid #d0d8e8",fontWeight:600}}>{s.coef}</td>
                        <td style={{...CSS.rtd,fontSize:10,borderRight:"1px solid #d0d8e8"}}>{tauxH||"—"}</td>
                        <td style={{...CSS.rtd,fontSize:10,fontWeight:700,borderRight:"2px solid #aaa",color:s.abattement?"#27ae60":"#ccc"}}>{s.abattement?"OUI":"NON"}</td>
                        <td style={{...CSS.rtd,fontWeight:700,borderRight:"1px solid #d0d8e8",color:"#1a3a5c"}}>{c.H}</td>
                        <td style={{...CSS.rtd,fontWeight:c.hs25>0?700:400,borderRight:"1px solid #d0d8e8",color:c.hs25>0?"#e67e22":"#ccc"}}>{c.hs25>0?c.hs25:"—"}</td>
                        <td style={{...CSS.rtd,fontWeight:c.hs50>0?700:400,borderRight:"2px solid #aaa",color:c.hs50>0?"#c0392b":"#ccc"}}>{c.hs50>0?c.hs50:"—"}</td>
                        {/* ABSENCES : une ligne par entrée dans chaque cellule */}
                        <td style={{...CSS.rtd,fontSize:9,borderRight:"1px solid #d0d8e8",color:absColor,fontWeight:600,verticalAlign:"top"}}>
                          {c.absEntries.length>0 ? c.absEntries.map((e,k)=><div key={k} style={{padding:"1px 0"}}>{e.heures}h</div>) : "—"}
                        </td>
                        <td style={{...CSS.rtd,fontSize:9,borderRight:"1px solid #d0d8e8",color:absColor,textAlign:"left",verticalAlign:"top"}}>
                          {c.absEntries.length>0 ? c.absEntries.map((e,k)=><div key={k} style={{padding:"1px 0"}}>{e.motif}</div>) : "—"}
                        </td>
                        <td style={{...CSS.rtd,fontSize:9,borderRight:"2px solid #aaa",color:absColor,verticalAlign:"top"}}>
                          {c.absEntries.length>0 ? c.absEntries.map((e,k)=><div key={k} style={{padding:"1px 0"}}>{fmtAbs(e).dates}</div>) : "—"}
                        </td>
                        <td style={{...CSS.rtd,fontSize:10,borderRight:"1px solid #d0d8e8",color:"#27ae60",fontWeight:600}}>{c.primes.map(p=>p.montant?`${p.montant}€`:"").join(" / ")||"—"}</td>
                        <td style={{...CSS.rtd,fontSize:9,borderRight:"2px solid #aaa",color:"#27ae60"}}>{c.primes.map(p=>p.libelle||"").join(" / ")||"—"}</td>
                        <td style={{...CSS.rtd,fontWeight:600,borderRight:"2px solid #aaa",color:"#16a085"}}>{c.isForfait?"—":c.paniers||"—"}</td>
                        {ZONES.map(z=><td key={`tj${z}`} style={{...CSS.rtd,fontSize:10,borderRight:"1px solid #d0d8e8",color:c.trajet[z]>0?"#2980b9":"#ddd",fontWeight:c.trajet[z]>0?700:400,background:c.trajet[z]>0?"#eaf4fb":rowBg}}>{c.trajet[z]||""}</td>)}
                        {ZONES.map((z,zi)=><td key={`tr${z}`} style={{...CSS.rtd,fontSize:10,borderRight:zi===9?"2px solid #aaa":"1px solid #d0d8e8",color:c.transport[z]>0?"#1a5276":"#ddd",fontWeight:c.transport[z]>0?700:400,background:c.transport[z]>0?"#d6eaf8":rowBg}}>{c.transport[z]||""}</td>)}
                        <td style={{...CSS.rtd,borderRight:"1px solid #d0d8e8"}}>{ex.acompte||"—"}</td>
                        <td style={{...CSS.rtd,borderRight:"1px solid #d0d8e8"}}>{ex.saisieArr||"—"}</td>
                        <td style={{...CSS.rtd,fontSize:10,textAlign:"left",minWidth:140}}>{obs||"—"}</td>
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
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:4}}>
                  <div style={{fontWeight:700,fontSize:13,color:"#1a3a5c",flex:1,marginRight:6}}>{c.nom}</div>
                  <div style={{...CSS.zoneBadge,background:zoneColor(c.zone)}}>Z{c.zone}</div>
                </div>
                <div style={{fontSize:11,color:"#888"}}>{c.ville}</div>
                <div style={{fontSize:11,color:"#3498db",marginTop:2}}>📏 {c.km} km à vol d'oiseau</div>
                {c.adresseGeo&&(
                  <div style={{fontSize:9,color:"#bbb",marginTop:2,fontStyle:"italic"}} title={c.adresseGeo}>
                    📍 {c.adresseGeo.split(",").slice(0,2).join(",")}
                  </div>
                )}
                {/* Correction manuelle de la zone */}
                <div style={{display:"flex",alignItems:"center",gap:6,marginTop:8}}>
                  <label style={{fontSize:10,color:"#666"}}>Corriger zone :</label>
                  <select style={{...CSS.input,width:55,fontSize:11,padding:"2px 4px"}}
                    value={c.zone}
                    onChange={e=>setChantiers(p=>p.map(x=>x.id===c.id?{...x,zone:+e.target.value,zoneCorrigee:true}:x))}>
                    {[1,2,3,4,5,6,7,8,9,10].map(z=><option key={z} value={z}>{z}</option>)}
                  </select>
                  {c.zoneCorrigee&&<span style={{fontSize:9,color:"#e67e22",fontWeight:700}}>modifiée</span>}
                </div>
                <button style={{...CSS.btnDelSm,marginTop:6}} onClick={()=>setChantiers(p=>p.filter(x=>x.id!==c.id))}>Supprimer</button>
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
                <th style={CSS.rth}>H mensuel</th>
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
                    <td style={CSS.rtd}>
                      <input type="number" style={{...CSS.input,width:65}} value={s.hMensuel||151.67}
                        onChange={e=>setSalaries(p=>p.map(x=>x.id===s.id?{...x,hMensuel:parseFloat(e.target.value)||151.67}:x))}/>
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
