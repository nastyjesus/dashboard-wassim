// Page admin — une seule page HTML, servie par le worker sur GET /admin.
// Aucune donnée dedans : tout passe par /admin/api/* avec le jeton.
// Charte « Cockpit clair » (apps/on-sort/docs/charte-graphique.md).
//
// Le script client est écrit SANS gabarit `...` ni ${…} : il vit dans un
// String.raw, qui interpréterait ces séquences.

export function pageAdmin() {
  return PAGE;
}

const PAGE = String.raw`<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>QG Admin — Papa Parfait</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;600&family=Saira+Condensed:wght@700;800&display=swap" rel="stylesheet">
<style>
  :root{
    --fond:#ECE6DA; --panneau:#FBFAF7; --encre:#1B1815; --texte:#5C554B; --discret:#8B8375;
    --ligne:#D7CFC0; --accent:#FF8A00; --accent-vif:#FFB020; --accent-encre:#A85400; --accent-doux:#FFE9CC;
    --strip:#1B1815; --strip-texte:#F4EFE6; --reussite:#2E7D52; --reussite-doux:#E2EFE6; --alerte:#C6432E;
    --display:'Saira Condensed', 'Arial Narrow', sans-serif;
    --corps:'IBM Plex Sans', 'Helvetica Neue', Arial, sans-serif;
  }
  *{box-sizing:border-box}
  html,body{margin:0}
  body{background:var(--fond);color:var(--encre);font:400 15px/23px var(--corps);font-variant-numeric:tabular-nums}
  button,input,select,textarea{font:inherit;color:inherit}
  a{color:var(--encre)}
  .cache{display:none !important}

  /* Bandeau instrument */
  .strip{background:var(--strip);color:var(--strip-texte);padding:10px 16px;display:flex;flex-wrap:wrap;gap:10px 18px;align-items:center;position:sticky;top:0;z-index:20}
  .strip .marque{font:800 22px/24px var(--display);letter-spacing:.3px;text-transform:uppercase;margin-right:auto}
  .strip label{font:600 12px/14px var(--corps);letter-spacing:.6px;text-transform:uppercase;color:#BDB4A5;display:flex;gap:8px;align-items:center}
  .strip input,.strip select{background:#2A2622;border:1.5px solid #4A443D;color:var(--strip-texte);border-radius:6px;padding:4px 8px}
  .strip .statut{font:600 12px/14px var(--corps);letter-spacing:.6px;text-transform:uppercase}
  .strip .statut b{color:var(--accent-vif)}
  .strip button{background:transparent;border:1.5px solid #6B635A;color:var(--strip-texte);border-radius:999px;padding:4px 12px;cursor:pointer}
  .strip button:hover{border-color:var(--strip-texte)}
  .jauge{height:3px;background:#3A352F;position:sticky;top:0}
  .jauge i{display:block;height:100%;background:var(--accent);width:0;transition:width .3s}

  /* Onglets */
  nav.onglets{display:flex;gap:4px;padding:0 16px;border-bottom:2px solid var(--encre);overflow-x:auto;background:var(--fond)}
  nav.onglets button{background:none;border:0;border-bottom:4px solid transparent;padding:12px 10px 8px;font:700 15px/18px var(--display);letter-spacing:.5px;text-transform:uppercase;color:var(--texte);cursor:pointer;white-space:nowrap}
  nav.onglets button[aria-selected=true]{color:var(--encre);border-bottom-color:var(--encre)}
  nav.onglets .n{font:600 12px var(--corps);color:var(--discret);margin-left:4px}

  main{padding:16px;max-width:1400px;margin:0 auto}
  h1,h2,h3{font-family:var(--display);margin:0}
  h2{font-weight:700;font-size:30px;line-height:32px}
  h3{font-weight:700;font-size:15px;line-height:18px;letter-spacing:.5px;text-transform:uppercase}

  .panneau{background:var(--panneau);border:2px solid var(--encre);border-radius:10px;padding:16px}
  #form-concours label{display:grid;gap:4px;font-weight:600}
  #form-concours input,#form-concours select{font:inherit;padding:6px 8px;border:1.5px solid var(--encre);border-radius:6px;font-weight:400}
  .grille{display:grid;gap:16px}
  .instr{font:600 12px/14px var(--corps);letter-spacing:.6px;text-transform:uppercase;color:var(--discret)}
  .discret{color:var(--discret)}
  .texte{color:var(--texte)}

  .btn{border:2px solid var(--encre);background:transparent;border-radius:999px;padding:6px 14px;cursor:pointer;font-weight:600;white-space:nowrap}
  .btn:hover{background:var(--fond)}
  .btn.primaire{background:var(--accent);color:var(--encre)}
  .btn.primaire:hover{background:var(--accent-vif)}
  .btn.danger{color:var(--alerte);border-color:var(--alerte)}
  .btn.petit{padding:2px 10px;font-size:13px;border-width:1.5px}
  .btn:disabled{opacity:.5;cursor:wait}

  .tag{display:inline-block;border:1.5px solid var(--encre);border-radius:999px;padding:0 8px;font-size:12px;line-height:19px;font-weight:600;white-space:nowrap}
  .tag.epingle{background:var(--accent);}
  .tag.masque{border-color:var(--discret);color:var(--discret)}
  .tag.ok{border-color:var(--reussite);color:var(--reussite);background:var(--reussite-doux)}
  .tag.ko{border-color:var(--alerte);color:var(--alerte)}
  .tag.leger{border-color:var(--ligne);color:var(--texte)}
  .tags{display:flex;gap:4px;flex-wrap:wrap}

  /* Sorties */
  .sorties{display:grid;grid-template-columns:240px 1fr;gap:16px;align-items:start}
  .filtres{position:sticky;top:110px;display:grid;gap:12px}
  .filtres label{display:grid;gap:4px}
  .filtres input[type=search],.filtres select{width:100%;border:2px solid var(--encre);border-radius:6px;padding:6px 8px;background:var(--panneau)}
  .filtres .coche{display:flex;gap:8px;align-items:center}
  .barre{display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin-bottom:12px}
  .barre .compte{font:700 15px var(--display);letter-spacing:.5px;text-transform:uppercase;margin-right:auto}
  table{width:100%;border-collapse:collapse}
  th{font:600 12px/14px var(--corps);letter-spacing:.6px;text-transform:uppercase;color:var(--discret);text-align:left;padding:8px;border-bottom:2px solid var(--encre)}
  td{padding:8px;border-bottom:1px solid var(--ligne);vertical-align:top}
  td.num,th.num{text-align:right}
  tr.ligne{cursor:pointer}
  tr.ligne:hover td{background:#F3EFE7}
  tr.ligne.masque td{opacity:.55}
  tr.ligne.masque .titre{text-decoration:line-through}
  .titre{font-weight:600}
  .rang{display:inline-block;min-width:30px;text-align:center;font:800 16px/24px var(--display);border:2px solid var(--encre);border-radius:6px}
  .rang.un{background:var(--accent)}
  .vide{padding:32px;text-align:center;color:var(--texte)}

  /* Fiche latérale */
  .voile{position:fixed;inset:0;background:rgba(27,24,21,.35);z-index:40}
  .fiche{position:fixed;top:0;right:0;bottom:0;width:min(640px,100%);background:var(--panneau);border-left:2px solid var(--encre);z-index:41;overflow-y:auto;padding:20px}
  .fiche .entete{display:flex;gap:12px;align-items:flex-start;margin-bottom:12px}
  .fiche .entete h2{flex:1;font-size:26px;line-height:28px}
  .fiche dl{display:grid;grid-template-columns:130px 1fr;gap:6px 12px;margin:16px 0}
  .fiche dt{font:600 12px/23px var(--corps);letter-spacing:.6px;text-transform:uppercase;color:var(--discret)}
  .fiche dd{margin:0;overflow-wrap:anywhere}
  .fiche .actions{display:flex;gap:8px;flex-wrap:wrap;padding:12px 0;border-top:1px solid var(--ligne);border-bottom:1px solid var(--ligne)}
  .fiche section{margin-top:18px}
  .fiche .desc{white-space:pre-wrap;color:var(--texte)}
  .avant{color:var(--discret);text-decoration:line-through;margin-right:6px}

  /* Formulaire */
  form.edition{display:grid;gap:12px}
  form.edition .deux{display:grid;grid-template-columns:1fr 1fr;gap:12px}
  form.edition label{display:grid;gap:4px}
  form.edition input,form.edition select,form.edition textarea{border:2px solid var(--encre);border-radius:6px;padding:6px 8px;background:#fff;width:100%}
  form.edition textarea{min-height:110px;resize:vertical}
  form.edition .jours{display:flex;gap:6px;flex-wrap:wrap}
  form.edition .jours label{display:flex;gap:4px;align-items:center;border:1.5px solid var(--encre);border-radius:999px;padding:2px 10px}
  form.edition .jours input{width:auto}
  .aide{font-size:13px;color:var(--discret);line-height:18px}
  .erreur{color:var(--alerte);font-weight:600}

  /* Top par ville */
  .go{background:var(--accent);border:2px solid var(--encre);border-radius:10px;padding:16px;box-shadow:3px 4px 0 var(--encre);margin-bottom:16px}
  .go .instr{color:var(--encre)}
  .go h3{font:800 28px/30px var(--display);text-transform:none;letter-spacing:0;margin:6px 0}
  .liste-top{display:grid;gap:0}
  .liste-top .item{display:grid;grid-template-columns:40px 1fr auto;gap:12px;padding:12px 0;border-bottom:1px solid var(--ligne);cursor:pointer}

  /* Stats */
  .kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px}
  .kpi .val{font:800 34px/36px var(--display);text-align:right}
  .barres{display:flex;align-items:flex-end;gap:2px;height:80px}
  .barres i{flex:1;background:var(--encre);min-height:1px}

  .toast{position:fixed;left:50%;bottom:20px;transform:translateX(-50%);background:var(--encre);color:var(--strip-texte);padding:10px 18px;border-radius:999px;z-index:60;font-weight:600}
  .toast button{background:none;border:0;color:var(--accent-vif);font-weight:700;margin-left:10px;cursor:pointer}

  /* Connexion */
  .connexion{max-width:420px;margin:12vh auto;padding:0 16px}
  .connexion h1{font:800 44px/44px var(--display);letter-spacing:-.5px;text-transform:uppercase;margin-bottom:12px}
  .connexion input{width:100%;border:2px solid var(--encre);border-radius:6px;padding:10px;margin:12px 0;background:#fff}

  @media (max-width:860px){
    .sorties{grid-template-columns:1fr}
    .filtres{position:static;grid-template-columns:1fr 1fr}
    .col-option{display:none}
    .fiche dl{grid-template-columns:1fr}
    .fiche dt{line-height:14px;margin-top:6px}
    form.edition .deux{grid-template-columns:1fr}
  }
</style>
</head>
<body>

<div id="ecran-connexion" class="connexion cache">
  <h1>QG Admin</h1>
  <p class="texte">Accès réservé. Colle le jeton <b>ADMIN_TOKEN</b> défini dans Cloudflare.</p>
  <form id="form-connexion">
    <input id="jeton" type="password" autocomplete="current-password" placeholder="Jeton admin" required>
    <button class="btn primaire" type="submit">Entrer</button>
    <p id="erreur-connexion" class="erreur"></p>
  </form>
</div>

<div id="app" class="cache">
  <div class="strip">
    <span class="marque">QG Admin · Papa Parfait</span>
    <label>Date <input id="f-date" type="date"></label>
    <label>Âge <select id="f-age"></select></label>
    <label>Rayon <select id="f-rayon"><option>20</option><option>30</option><option selected>40</option><option>60</option></select></label>
    <button id="recharger" type="button">Recharger</button>
    <span class="statut" id="statut"></span>
    <button id="deconnexion" type="button">Sortir</button>
  </div>
  <div class="jauge"><i id="jauge"></i></div>
  <nav class="onglets" role="tablist" id="onglets"></nav>
  <main id="vue"></main>
</div>

<div id="fiche-voile" class="voile cache"></div>
<aside id="fiche" class="fiche cache" aria-modal="true" role="dialog"></aside>
<div id="toast" class="toast cache"></div>

<script>
(function () {
  'use strict';

  // ---------- Utilitaires
  var JOURS = ['dim', 'lun', 'mar', 'mer', 'jeu', 'ven', 'sam'];
  var SOURCES = { openagenda: 'OpenAgenda', datatourisme: 'DATAtourisme', 'mediatheques-lorient': 'Médiathèques Lorient', manuel: 'Manuelle', mock: 'Démo' };
  var MOTIFS = {
    'anti-famille': 'Signal anti-famille (public adulte, sénior…)',
    'jour-incompatible': 'Pas ce jour-là (récurrence sur d’autres jours)',
    'pas-de-signal-enfant': 'Aucun signal enfant détecté',
    'permanent-non-enfant': 'Animation au long cours pas pensée enfants',
    'trop-jeune': 'Enfant trop jeune pour la tranche d’âge',
    'trop-grand': 'Enfant trop grand pour la tranche d’âge',
    'hors-rayon': 'Hors du rayon',
    doublon: 'Doublon d’une autre sortie (même titre, même jour)'
  };
  var ACTIONS = {
    masquer: 'Masquée', reafficher: 'Réaffichée', corriger: 'Corrigée', epingler: 'Épinglée',
    desepingler: 'Désépinglée', 'enregistrer-manuel': 'Sortie manuelle enregistrée',
    'supprimer-manuel': 'Sortie manuelle supprimée', annuler: 'Annulation'
  };
  var ONGLETS = [
    ['sorties', 'Sorties'], ['top', 'Top par ville'], ['sources', 'Sources'],
    ['propositions', 'Propositions'], ['prospection', 'Prospection'], ['concours', 'Concours'], ['stats', 'Stats'], ['journal', 'Journal'], ['villes', 'Villes']
  ];

  function $(id) { return document.getElementById(id); }
  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function stocker(k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) {} }
  function relire(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function prochainSamedi() {
    var d = new Date(); d.setDate(d.getDate() + ((6 - d.getDay() + 7) % 7));
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function dateFr(iso) {
    if (!iso) return '—';
    var d = new Date(iso.length > 10 ? iso : iso + 'T12:00:00');
    return d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', year: iso.length > 10 ? undefined : 'numeric' })
      + (iso.length > 10 ? ' ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '');
  }
  function toast(msg, action) {
    var t = $('toast');
    t.innerHTML = esc(msg) + (action ? ' <button type="button">' + esc(action.libelle) + '</button>' : '');
    t.classList.remove('cache');
    if (action) t.querySelector('button').onclick = function () { t.classList.add('cache'); action.faire(); };
    clearTimeout(toast.minuterie);
    toast.minuterie = setTimeout(function () { t.classList.add('cache'); }, action ? 8000 : 3500);
  }

  // ---------- État
  var etat = {
    jeton: relire('adm-jeton'),
    villes: [],
    mock: false,
    parVille: {},      // id ville -> réponse /admin/api/ville
    erreurs: {},       // id ville -> message
    surcouche: null,
    journal: [],
    propositions: [],
    prospection: null,
    concours: null,
    veille: null,
    filtresProspect: { ville: '', type: '', statut: '', q: '' },
    stats: null,
    onglet: relire('adm-onglet') || 'sorties',
    filtres: { q: '', ville: '', dept: '', source: '', etat: '', gratuit: false, tri: 'score' },
    villeTop: 'rennes',
    ficheCle: null,
    chargement: 0
  };

  // ---------- API
  function api(chemin, options) {
    options = options || {};
    var entetes = { Authorization: 'Bearer ' + etat.jeton };
    if (options.corps) entetes['Content-Type'] = 'application/json';
    return fetch('/admin/api/' + chemin, {
      method: options.corps ? 'POST' : 'GET',
      headers: entetes,
      body: options.corps ? JSON.stringify(options.corps) : undefined
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (b) {
        if (r.status === 401) { deconnecter('Jeton refusé.'); throw new Error('Jeton refusé'); }
        if (!r.ok) throw new Error(b.message || b.error || ('HTTP ' + r.status));
        return b;
      });
    });
  }

  function params() {
    return 'date=' + encodeURIComponent($('f-date').value) + '&age=' + encodeURIComponent($('f-age').value)
      + '&rayon=' + encodeURIComponent($('f-rayon').value);
  }

  // Le plan gratuit Cloudflare coupe parfois une grosse ville (CPU, erreur
  // 1102 → HTTP 503) : on réessaie deux fois, avec une pause, avant d'afficher l'erreur.
  function chargerVille(id, essai) {
    essai = essai || 0;
    etat.erreurs[id] = null;
    return api('ville?ville=' + encodeURIComponent(id) + '&' + params())
      .then(function (r) { etat.parVille[id] = r; })
      .catch(function (e) {
        if (essai < 2 && /503/.test(e.message)) {
          return new Promise(function (ok) { setTimeout(ok, 1500 * (essai + 1)); }).then(function () { return chargerVille(id, essai + 1); });
        }
        etat.erreurs[id] = e.message;
      });
  }

  // Les 18 villes une par une : chaque appel interroge les sources en direct,
  // et en parallèle le plan gratuit Cloudflare coupe le worker (erreur 1102).
  // ~13 s pour tout charger ; la liste se remplit au fil de l'eau.
  function chargerTout() {
    etat.parVille = {}; etat.erreurs = {};
    var file = etat.villes.map(function (v) { return v.id; });
    var total = file.length, faits = 0;
    etat.chargement = total;
    majStatut(0, total);
    function suivant() {
      var id = file.shift();
      if (!id) return Promise.resolve();
      return chargerVille(id).then(function () {
        faits += 1; majStatut(faits, total); rendre();
        return suivant();
      });
    }
    return suivant().then(function () {
      etat.chargement = 0; majStatut(total, total); rendre();
    });
  }

  function chargerSurcouche() {
    return Promise.all([api('surcouche'), api('journal'), api('propositions'), chargerProspection(), chargerConcours(), chargerVeille()]).then(function (r) {
      etat.surcouche = r[0].surcouche; etat.journal = r[1].journal; etat.propositions = r[2].propositions || [];
    });
  }

  function majStatut(faits, total) {
    $('jauge').style.width = (total ? Math.round(faits / total * 100) : 0) + '%';
    var pannes = 0;
    Object.keys(etat.parVille).forEach(function (id) {
      var s = etat.parVille[id].sources || {};
      Object.keys(s).forEach(function (k) { if (!s[k].ok) pannes += 1; });
    });
    var erreurs = Object.keys(etat.erreurs).filter(function (k) { return etat.erreurs[k]; }).length;
    $('statut').innerHTML = (faits < total ? 'Chargement <b>' + faits + '/' + total + '</b>' : 'Villes <b>' + (total - erreurs) + '/' + total + '</b>')
      + (pannes ? ' · Sources en panne <b>' + pannes + '</b>' : ' · Sources ok')
      + (etat.mock ? ' · <b>MODE DÉMO</b>' : '');
  }

  // ---------- Agrégation : une ligne par sortie, toutes villes confondues
  function agreger() {
    var parCle = {};
    etat.villes.forEach(function (v) {
      var r = etat.parVille[v.id];
      if (!r) return;
      r.evenements.forEach(function (ev) {
        var a = parCle[ev.cle];
        if (!a) a = parCle[ev.cle] = { ev: ev, villes: {} };
        a.villes[v.id] = { score: ev.score, motif: ev.motif, rang: ev.rang, raisons: ev.raisons, distanceKm: ev.distanceKm, age: ev.age, lieuType: ev.lieuType, horaires: ev.horaires };
      });
    });
    return Object.keys(parCle).map(function (cle) {
      var a = parCle[cle];
      var meilleur = null, meilleurRang = null;
      Object.keys(a.villes).forEach(function (id) {
        var x = a.villes[id];
        if (x.score != null && (meilleur == null || x.score > meilleur)) meilleur = x.score;
        if (x.rang && (!meilleurRang || x.rang < meilleurRang.rang)) meilleurRang = { rang: x.rang, ville: id };
      });
      a.meilleurScore = meilleur; a.meilleurRang = meilleurRang;
      return a;
    });
  }

  function nomVille(id) {
    for (var i = 0; i < etat.villes.length; i++) if (etat.villes[i].id === id) return etat.villes[i].nom;
    return id;
  }

  function filtrer(lignes) {
    var f = etat.filtres, q = f.q.trim().toLowerCase();
    var deptVilles = f.dept ? etat.villes.filter(function (v) { return v.code === f.dept; }).map(function (v) { return v.id; }) : null;
    return lignes.filter(function (a) {
      var ev = a.ev;
      if (q && (ev.titre + ' ' + (ev.lieuNom || '') + ' ' + (ev.ville || '') + ' ' + ev.description + ' ' + ev.cle).toLowerCase().indexOf(q) < 0) return false;
      // « Dans cette ville » = dans son rayon ; hors rayon, la sortie n'y compte pas.
      var proche = function (id) { return a.villes[id] && a.villes[id].motif !== 'hors-rayon'; };
      if (f.ville && !proche(f.ville)) return false;
      if (deptVilles && !deptVilles.some(proche)) return false;
      if (f.source && ev.origine !== f.source) return false;
      if (f.gratuit && ev.gratuit !== true) return false;
      var vue = f.ville ? a.villes[f.ville] : null;
      var retenue = vue ? vue.score != null : a.meilleurScore != null;
      var enTop = vue ? Boolean(vue.rang) : Boolean(a.meilleurRang);
      switch (f.etat) {
        case 'top': return enTop && !ev.masque;
        case 'retenues': return retenue && !ev.masque;
        case 'ecartees': return !retenue && !ev.masque;
        case 'masquees': return ev.masque;
        case 'corrigees': return Boolean(ev.corrige);
        case 'epinglees': return ev.epingle;
        case 'manuelles': return ev.manuel;
        case 'visibles': return !ev.masque;
      }
      return true;
    }).sort(function (x, y) {
      if (f.tri === 'titre') return x.ev.titre.localeCompare(y.ev.titre);
      if (f.tri === 'ville') return (x.ev.ville || '').localeCompare(y.ev.ville || '');
      if (f.tri === 'date') return (x.ev.dateDebut || '').localeCompare(y.ev.dateDebut || '');
      // Le classement réel d'abord (une épinglée est 01 même avec un petit score).
      var rx = f.ville ? (x.villes[f.ville] && x.villes[f.ville].rang) : (x.meilleurRang && x.meilleurRang.rang);
      var ry = f.ville ? (y.villes[f.ville] && y.villes[f.ville].rang) : (y.meilleurRang && y.meilleurRang.rang);
      if ((rx || 99) !== (ry || 99)) return (rx || 99) - (ry || 99);
      var sx = f.ville && x.villes[f.ville] ? x.villes[f.ville].score : x.meilleurScore;
      var sy = f.ville && y.villes[f.ville] ? y.villes[f.ville].score : y.meilleurScore;
      return (sy == null ? -999 : sy) - (sx == null ? -999 : sx);
    });
  }

  function tagsEtat(ev) {
    var t = [];
    if (ev.epingle) t.push('<span class="tag epingle">Épinglée</span>');
    if (ev.masque) t.push('<span class="tag masque">Masquée</span>');
    if (ev.manuel) t.push('<span class="tag">Manuelle</span>');
    if (ev.corrige) t.push('<span class="tag">Corrigée</span>');
    return t.join(' ');
  }

  // ---------- Vues
  function rendre() {
    var nav = $('onglets');
    var nbJournal = etat.journal.length;
    nav.innerHTML = ONGLETS.map(function (o) {
      var nbAttente = etat.propositions.filter(function (p) { return p.statut === 'attente'; }).length;
      var n = o[0] === 'journal' && nbJournal ? '<span class="n">' + nbJournal + '</span>'
        : o[0] === 'propositions' && nbAttente ? ' <span class="tag epingle">' + nbAttente + '</span>' : '';
      return '<button role="tab" data-onglet="' + o[0] + '" aria-selected="' + (etat.onglet === o[0]) + '">' + esc(o[1]) + n + '</button>';
    }).join('');
    var vues = { sorties: vueSorties, top: vueTop, sources: vueSources, propositions: vuePropositions, prospection: vueProspection, concours: vueConcours, stats: vueStats, journal: vueJournal, villes: vueVilles };
    vues[etat.onglet]();
    if (etat.ficheCle) rendreFiche();
  }

  function optionsVilles(choisie, avecToutes) {
    return (avecToutes ? '<option value="">Toutes les villes</option>' : '') + etat.villes.map(function (v) {
      return '<option value="' + esc(v.id) + '"' + (v.id === choisie ? ' selected' : '') + '>' + esc(v.nom) + '</option>';
    }).join('');
  }

  function vueSorties() {
    var f = etat.filtres;
    var toutes = agreger();
    var lignes = filtrer(toutes);
    var depts = [];
    etat.villes.forEach(function (v) { if (!depts.some(function (d) { return d.code === v.code; })) depts.push({ code: v.code, nom: v.dept }); });
    var sources = {};
    toutes.forEach(function (a) { sources[a.ev.origine] = true; });
    var html = '<div class="sorties"><div class="filtres panneau">'
      + '<label><span class="instr">Recherche</span><input type="search" id="fq" value="' + esc(f.q) + '" placeholder="Titre, lieu, clé…"></label>'
      + '<label><span class="instr">Ville</span><select id="fville">' + optionsVilles(f.ville, true) + '</select></label>'
      + '<label><span class="instr">Département</span><select id="fdept"><option value="">Tous</option>' + depts.map(function (d) {
        return '<option value="' + esc(d.code) + '"' + (f.dept === d.code ? ' selected' : '') + '>' + esc(d.code + ' — ' + d.nom) + '</option>';
      }).join('') + '</select></label>'
      + '<label><span class="instr">Source</span><select id="fsource"><option value="">Toutes</option>' + Object.keys(sources).map(function (s) {
        return '<option value="' + esc(s) + '"' + (f.source === s ? ' selected' : '') + '>' + esc(SOURCES[s] || s) + '</option>';
      }).join('') + '</select></label>'
      + '<label><span class="instr">État</span><select id="fetat">' + [
        ['', 'Toutes'], ['visibles', 'Visibles'], ['top', 'Dans un top 5'], ['retenues', 'Retenues par le scoring'],
        ['ecartees', 'Écartées par le scoring'], ['masquees', 'Masquées'], ['corrigees', 'Corrigées'],
        ['epinglees', 'Épinglées'], ['manuelles', 'Manuelles']
      ].map(function (o) { return '<option value="' + o[0] + '"' + (f.etat === o[0] ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') + '</select></label>'
      + '<label><span class="instr">Tri</span><select id="ftri">' + [['score', 'Score'], ['titre', 'Titre'], ['ville', 'Ville'], ['date', 'Date de début']].map(function (o) {
        return '<option value="' + o[0] + '"' + (f.tri === o[0] ? ' selected' : '') + '>' + o[1] + '</option>';
      }).join('') + '</select></label>'
      + '<label class="coche"><input type="checkbox" id="fgratuit"' + (f.gratuit ? ' checked' : '') + '> Gratuites seulement</label>'
      + '<button class="btn" type="button" id="freset">Effacer les filtres</button>'
      + '</div><div>'
      + '<div class="barre"><span class="compte">' + lignes.length + ' sortie' + (lignes.length > 1 ? 's' : '') + ' sur ' + toutes.length + '</span>'
      + '<button class="btn primaire" type="button" id="ajouter">Ajouter une sortie</button></div>'
      + '<div class="panneau" style="padding:0;overflow-x:auto">';
    if (!lignes.length) {
      html += '<div class="vide">' + (etat.chargement ? 'Chargement des agendas…' : 'Aucune sortie ne correspond à ces filtres.') + '</div>';
    } else {
      html += '<table><thead><tr><th>Top</th><th>Sortie</th><th class="col-option">Source</th><th class="col-option">Villes</th><th class="num">Score</th></tr></thead><tbody>';
      lignes.slice(0, 400).forEach(function (a) {
        var ev = a.ev;
        var vue = f.ville ? a.villes[f.ville] : null;
        var rang = vue ? (vue.rang ? { rang: vue.rang, ville: f.ville } : null) : a.meilleurRang;
        var score = vue ? vue.score : a.meilleurScore;
        var motif = vue ? vue.motif : (a.meilleurScore == null ? (Object.keys(a.villes).map(function (k) { return a.villes[k].motif; })[0]) : null);
        var proches = Object.keys(a.villes).filter(function (id) { return a.villes[id].motif !== 'hors-rayon'; });
        var nbVilles = proches.length;
        html += '<tr class="ligne' + (ev.masque ? ' masque' : '') + '" data-cle="' + esc(ev.cle) + '">'
          + '<td>' + (rang ? '<span class="rang' + (rang.rang === 1 ? ' un' : '') + '">' + String(rang.rang).padStart(2, '0') + '</span>' + (f.ville ? '' : '<div class="aide">' + esc(nomVille(rang.ville)) + '</div>') : '') + '</td>'
          + '<td><div class="titre">' + esc(ev.titre) + '</div><div class="aide">' + esc([ev.lieuNom, ev.ville].filter(Boolean).join(', ')) + (ev.horaires ? ' — ' + esc(ev.horaires) : '') + '</div>'
          + '<div class="tags" style="margin-top:4px">' + tagsEtat(ev) + (motif && !ev.masque ? '<span class="tag leger">' + esc(MOTIFS[motif] || motif) + '</span>' : '') + '</div></td>'
          + '<td class="col-option">' + esc(SOURCES[ev.origine] || ev.origine) + '</td>'
          + '<td class="col-option">' + (nbVilles === 0 ? '<span class="discret">hors rayon</span>' : nbVilles === 1 ? esc(nomVille(proches[0])) : nbVilles + ' villes') + '</td>'
          + '<td class="num">' + (score == null ? '<span class="discret">—</span>' : '<b>' + score + '</b>') + '</td></tr>';
      });
      html += '</tbody></table>';
      if (lignes.length > 400) html += '<div class="vide">400 premières affichées — affine les filtres.</div>';
    }
    html += '</div></div></div>';
    $('vue').innerHTML = html;

    var garder = function (cle, el, prop) {
      el.addEventListener(prop === 'checked' ? 'change' : (el.tagName === 'INPUT' ? 'input' : 'change'), function () {
        etat.filtres[cle] = el[prop || 'value'];
        var focus = document.activeElement && document.activeElement.id;
        vueSorties();
        if (focus && $(focus)) { $(focus).focus(); if ($(focus).setSelectionRange && focus === 'fq') $(focus).setSelectionRange(9999, 9999); }
      });
    };
    garder('q', $('fq')); garder('ville', $('fville')); garder('dept', $('fdept')); garder('source', $('fsource'));
    garder('etat', $('fetat')); garder('tri', $('ftri')); garder('gratuit', $('fgratuit'), 'checked');
    $('freset').onclick = function () { etat.filtres = { q: '', ville: '', dept: '', source: '', etat: '', gratuit: false, tri: 'score' }; vueSorties(); };
    $('ajouter').onclick = function () { ouvrirFormulaire('manuel', null); };
  }

  function vueTop() {
    var r = etat.parVille[etat.villeTop];
    var html = '<div class="barre"><h2 style="margin-right:auto">Ce que voit un papa</h2>'
      + '<select id="tville" class="btn">' + optionsVilles(etat.villeTop) + '</select></div>';
    if (!r) {
      html += '<div class="panneau vide">' + (etat.erreurs[etat.villeTop] ? 'Erreur : ' + esc(etat.erreurs[etat.villeTop]) : 'Chargement…') + '</div>';
    } else {
      var parCle = {};
      r.evenements.forEach(function (ev) { parCle[ev.cle] = ev; });
      var top = r.top.map(function (c) { return parCle[c]; }).filter(Boolean);
      html += '<p class="texte">' + esc(r.ville.nom) + ', ' + esc(dateFr(r.date)) + ', enfant de ' + esc(r.age) + ' an' + (r.age > 1 ? 's' : '') + ', rayon ' + esc(r.rayonKm) + ' km'
        + (r.meteo ? ' — ' + esc(r.meteo.resume) : '') + '. ' + r.stats.retenus + ' sorties retenues sur ' + r.stats.uniques + '.</p>';
      if (!top.length) html += '<div class="panneau vide">Top vide : aucune sortie retenue pour ces réglages.</div>';
      else {
        var p = top[0];
        html += '<div class="go" data-cle="' + esc(p.cle) + '" style="cursor:pointer"><span class="instr">Statut : GO' + (p.epingle ? ' · épinglée' : '') + '</span>'
          + '<h3>' + esc(p.titre) + '</h3><div>' + esc([p.lieuNom, p.ville].filter(Boolean).join(', ')) + (p.horaires ? ' — ' + esc(p.horaires) : '') + '</div>'
          + '<div class="tags" style="margin-top:8px">' + p.raisons.map(function (x) { return '<span class="tag">' + esc(x) + '</span>'; }).join('') + '<span class="tag">score ' + p.score + '</span></div></div>';
        html += '<div class="panneau"><h3>Le reste du top</h3><div class="liste-top">';
        top.slice(1).forEach(function (ev) {
          html += '<div class="item" data-cle="' + esc(ev.cle) + '"><span class="rang">' + String(ev.rang).padStart(2, '0') + '</span>'
            + '<div><div class="titre">' + esc(ev.titre) + ' ' + tagsEtat(ev) + '</div><div class="aide">' + esc(ev.raisons.join(' · ')) + '</div></div>'
            + '<b>' + ev.score + '</b></div>';
        });
        html += '</div></div>';
      }
    }
    $('vue').innerHTML = html;
    $('tville').onchange = function () { etat.villeTop = this.value; vueTop(); };
  }

  function celluleSource(s) {
    if (!s) return '<span class="discret">—</span>';
    return s.ok ? '<span class="tag ok">' + s.count + '</span>' : '<span class="tag ko" title="' + esc(s.erreur || '') + '">panne</span><div class="aide">' + esc(s.erreur || '') + '</div>';
  }

  function vueSources() {
    var cols = ['openagenda', 'datatourisme', 'mediatheques_lorient'];
    if (etat.mock) cols = ['mock'];
    var html = '<h2>Santé des sources</h2><p class="texte">Réponse de chaque agenda, ville par ville, pour la date choisie. Le chiffre = événements actifs ce jour-là (avant scoring).</p>'
      + '<div class="panneau" style="padding:0;overflow-x:auto"><table><thead><tr><th>Ville</th>' + cols.map(function (c) { return '<th>' + esc(c.replace('_', ' ')) + '</th>'; }).join('') + '<th>Météo</th><th class="num">Retenues</th></tr></thead><tbody>';
    etat.villes.forEach(function (v) {
      var r = etat.parVille[v.id];
      html += '<tr><td><b>' + esc(v.nom) + '</b><div class="aide">' + esc(v.code) + '</div></td>';
      if (!r) html += '<td colspan="' + (cols.length + 2) + '">' + (etat.erreurs[v.id] ? '<span class="tag ko">erreur</span> ' + esc(etat.erreurs[v.id]) : '<span class="discret">chargement…</span>') + '</td>';
      else html += cols.map(function (c) { return '<td>' + celluleSource(r.sources[c]) + '</td>'; }).join('')
        + '<td>' + (r.meteo ? esc(r.meteo.resume) : '<span class="discret">indisponible</span>') + '</td><td class="num">' + r.stats.retenus + '</td>';
      html += '</tr>';
    });
    html += '</tbody></table></div><p class="aide">Médiathèques Lorient : interrogée seulement quand Lorient est dans le rayon.</p>';
    $('vue').innerHTML = html;
  }

  function vueStats() {
    if (!etat.stats) {
      $('vue').innerHTML = '<div class="panneau vide">Chargement des stats…</div>';
      api('stats?jours=30').then(function (s) { etat.stats = s; if (etat.onglet === 'stats') vueStats(); })
        .catch(function (e) { $('vue').innerHTML = '<div class="panneau vide erreur">' + esc(e.message) + '</div>'; });
      return;
    }
    var m = etat.stats.mesures, t = m.totaux;
    var libelles = { ouverture: 'Ouvertures', 'arrivee-lien': 'Arrivées par lien', top: 'Tops affichés', 'top-vide': 'Tops vides', garde: 'Sorties gardées', compte: 'Comptes créés', 'alerte-envoyee': 'Alertes envoyées' };
    var pct = function (v) { return v == null ? '—' : v + ' %'; };
    var html = '<h2>Usage — 30 derniers jours</h2><div class="kpis" style="margin:16px 0">'
      + Object.keys(libelles).map(function (k) { return '<div class="panneau kpi"><div class="instr">' + esc(libelles[k]) + '</div><div class="val">' + (t[k] || 0) + '</div></div>'; }).join('')
      + '<div class="panneau kpi"><div class="instr">Garde / top</div><div class="val">' + pct(m.taux.gardeParTop) + '</div></div>'
      + '<div class="panneau kpi"><div class="instr">Compte / garde</div><div class="val">' + pct(m.taux.compteParGarde) + '</div></div>'
      + '<div class="panneau kpi"><div class="instr">Tops vides</div><div class="val">' + pct(m.taux.topVide) + '</div></div></div>';
    var max = 1;
    m.lignes.forEach(function (l) { max = Math.max(max, l.ouverture || 0); });
    html += '<div class="panneau"><h3>Ouvertures par jour</h3><div class="barres" style="margin-top:12px">'
      + m.lignes.map(function (l) { return '<i title="' + esc(l.jour + ' : ' + l.ouverture) + '" style="height:' + Math.round((l.ouverture || 0) / max * 100) + '%"></i>'; }).join('')
      + '</div><div class="aide" style="display:flex;justify-content:space-between"><span>' + esc(m.lignes[0].jour) + '</span><span>' + esc(m.lignes[m.lignes.length - 1].jour) + '</span></div></div>';
    html += '<div class="grille" style="grid-template-columns:repeat(auto-fit,minmax(280px,1fr));margin-top:16px">'
      + '<div class="panneau"><h3>Votes « Ça m’intéresse »</h3><table><tbody>' + Object.keys(etat.stats.votes).map(function (k) {
        return '<tr><td>' + esc(k) + '</td><td class="num"><b>' + etat.stats.votes[k] + '</b></td></tr>';
      }).join('') + '</tbody></table></div>'
      + '<div class="panneau"><h3>Villes demandées</h3>' + (etat.stats.villesDemandees.length ? '<table><tbody>' + etat.stats.villesDemandees.slice(0, 20).map(function (d) {
        return '<tr><td>' + esc(d.ville) + '</td><td class="num"><b>' + d.total + '</b></td></tr>';
      }).join('') + '</tbody></table>' : '<p class="discret">Aucune demande (filet KV). Les demandes principales vivent dans Supabase → demandes_ville_frequence.</p>') + '</div></div>';
    $('vue').innerHTML = html;
  }

  function resumeValeur(v) {
    if (!v) return '<span class="discret">rien</span>';
    if (v.champs) return esc(Object.keys(v.champs).map(function (k) { return k + ' = ' + v.champs[k]; }).join(' · '));
    if (v.dateDebut) return esc(v.titre + ' — ' + v.dateDebut + (v.dateFin && v.dateFin !== v.dateDebut ? ' → ' + v.dateFin : '') + (v.jours && v.jours.length ? ' (' + v.jours.map(function (j) { return JOURS[j]; }).join(', ') + ')' : ''));
    return esc(v.raison ? 'raison : ' + v.raison : 'oui');
  }

  function vueJournal() {
    var html = '<h2>Journal des modifs</h2><p class="texte">Les 300 dernières. « Annuler » remet l’état d’avant pour cette sortie (et s’inscrit au journal).</p><div class="panneau" style="padding:0;overflow-x:auto">';
    if (!etat.journal.length) html += '<div class="vide">Aucune modification pour l’instant.</div>';
    else {
      html += '<table><thead><tr><th>Quand</th><th>Action</th><th>Sortie</th><th class="col-option">Avant → après</th><th></th></tr></thead><tbody>';
      etat.journal.forEach(function (e) {
        html += '<tr><td>' + esc(dateFr(e.le)) + '</td><td><b>' + esc(ACTIONS[e.type] || e.type) + '</b></td>'
          + '<td><div class="titre">' + esc(e.titre || '—') + '</div><div class="aide">' + esc(e.cle) + '</div></td>'
          + '<td class="col-option aide">' + resumeValeur(e.avant) + '<br>→ ' + resumeValeur(e.apres) + '</td>'
          + '<td>' + (e.type === 'annuler' ? '' : '<button class="btn petit" data-annuler="' + esc(e.id) + '">Annuler</button>') + '</td></tr>';
      });
      html += '</tbody></table>';
    }
    $('vue').innerHTML = html + '</div>';
  }

  // Propositions des organisateurs (formulaire du site). Valider crée une
  // sortie manuelle (scorée comme les autres) et prévient l'organisateur.
  var TRANCHES = { '0-3': '0-3 ans', '3-6': '3-6 ans', '6-10': '6-10 ans', '10+': '10 ans et +' };
  var JOURS = ['dim', 'lun', 'mar', 'mer', 'jeu', 'ven', 'sam'];
  function quandProposition(p) {
    if (p.type === 'lieu') {
      return 'Lieu permanent · ' + p.jours.map(function (j) { return JOURS[j]; }).join(', ') + ' · ' + p.horaires
        + ' · du ' + p.periodeDebut + ' au ' + p.periodeFin;
    }
    return p.seances.map(function (s) { return s.date + (s.debut ? ' ' + s.debut + (s.fin ? '–' + s.fin : '') : ''); }).join(' · ');
  }
  function vuePropositions() {
    var html = '<h2>Propositions des organisateurs</h2><p class="texte">Envoyées depuis le formulaire du site. <b>Valider</b> publie la sortie (scorée comme les autres, sans bonus) et prévient l’organisateur ; <b>Refuser</b> le prévient aussi, avec ton motif. Titre, prix et description sont modifiables avant de valider.</p>';
    if (!etat.propositions.length) { $('vue').innerHTML = html + '<div class="panneau vide">Aucune proposition pour l’instant.</div>'; return; }
    etat.propositions.forEach(function (p) {
      var attente = p.statut === 'attente';
      var tarif = p.gratuit ? 'Gratuit' : [p.prixEnfant != null ? 'enfant ' + p.prixEnfant + ' €' : '', p.prixAdulte != null ? 'adulte ' + p.prixAdulte + ' €' : ''].filter(Boolean).join(' · ');
      html += '<div class="panneau" style="margin-bottom:12px" data-proposition="' + esc(p.id) + '">'
        + '<div style="display:flex;gap:16px;flex-wrap:wrap">'
        + (p.photo ? '<img src="/photos/' + esc(p.photo) + '" alt="" style="width:140px;height:140px;object-fit:cover;border:2px solid var(--encre);border-radius:6px">' : '')
        + '<div style="flex:1;min-width:260px">'
        + '<div>' + (attente ? '<span class="tag epingle">En attente</span>' : p.statut === 'publiee' ? '<span class="tag ok">Publiée</span>' : '<span class="tag ko">Refusée</span>')
        + ' <span class="tag leger">' + (p.type === 'lieu' ? 'Lieu' : 'Événement') + '</span> <span class="aide">reçue le ' + esc(dateFr(p.recueLe)) + '</span></div>'
        + (attente ? '<p><input class="p-titre" value="' + esc(p.titre) + '" style="width:100%;font-weight:700"></p>' : '<h3>' + esc(p.titre) + '</h3>')
        + '<p class="aide">' + esc(p.lieuNom) + ' — ' + esc(p.adresse) + ', ' + esc(p.codePostal) + ' ' + esc(p.ville) + '</p>'
        + '<p><b>Quand :</b> ' + esc(quandProposition(p)) + '</p>'
        + '<p><b>Âges :</b> ' + esc(p.tranches.map(function (t) { return TRANCHES[t] || t; }).join(', '))
        + ' · <b>Tarif :</b> ' + (attente
          ? 'enfant <input class="p-prixEnfant" size="4" value="' + esc(p.prixEnfant == null ? '' : p.prixEnfant) + '"> € · adulte <input class="p-prixAdulte" size="4" value="' + esc(p.prixAdulte == null ? '' : p.prixAdulte) + '"> €' + (p.gratuit ? ' (gratuit coché)' : '')
          : esc(tarif))
        + (p.reservation ? ' · <b>réservation obligatoire</b>' : '') + '</p>'
        + (p.billetterie ? '<p class="aide">Billetterie : <a href="' + esc(p.billetterie) + '" target="_blank" rel="noopener">' + esc(p.billetterie) + '</a></p>' : '')
        + (p.urlOfficielle ? '<p class="aide">Page officielle : <a href="' + esc(p.urlOfficielle) + '" target="_blank" rel="noopener">' + esc(p.urlOfficielle) + '</a></p>' : '')
        + '<p class="aide">Proposé par <b>' + esc(p.organisme) + '</b> — ' + esc(p.contactNom) + ', <a href="mailto:' + esc(p.contactEmail) + '">' + esc(p.contactEmail) + '</a>' + (p.telephone ? ', ' + esc(p.telephone) : '') + '</p>'
        + '</div></div>'
        + (attente ? '<textarea class="p-description" rows="5" style="width:100%;margin-top:8px">' + esc(p.description) + '</textarea>'
          : '<p class="desc">' + esc(p.description) + '</p>')
        + (p.motif ? '<p class="aide">Motif du refus : ' + esc(p.motif) + '</p>' : '')
        + (attente ? '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:8px">'
          + '<button class="btn primaire" data-valider="' + esc(p.id) + '">Valider et publier</button>'
          + '<input class="p-motif" placeholder="Motif du refus (envoyé à l’organisateur)" style="flex:1;min-width:220px">'
          + '<button class="btn danger" data-refuser="' + esc(p.id) + '">Refuser</button></div>' : '')
        + '</div>';
    });
    $('vue').innerHTML = html;
  }
  function deciderProposition(id, action, bouton) {
    var bloc = document.querySelector('[data-proposition="' + id + '"]');
    var lire = function (c) { var el = bloc.querySelector('.' + c); return el ? el.value.trim() : ''; };
    var champs = { titre: lire('p-titre'), description: lire('p-description') };
    ['prixEnfant', 'prixAdulte'].forEach(function (k) {
      var v = lire('p-' + k).replace(',', '.');
      champs[k] = v === '' ? null : Number(v);
    });
    bouton.disabled = true;
    api('propositions', { corps: { id: id, action: action, motif: lire('p-motif'), champs: champs } }).then(function () {
      toast(action === 'valider' ? 'Publiée — l’organisateur est prévenu.' : 'Refusée — l’organisateur est prévenu.');
      return chargerSurcouche().then(function () { rendre(); return chargerTout(); });
    }).catch(function (err) { bouton.disabled = false; toast(err.message); });
  }

  // Prospection : les lieux invités à proposer leurs sorties. Wassim envoie
  // à la main depuis contact@ (pas d'envoi automatique : délivrabilité).
  var STATUTS_PROSPECT = [
    ['a-contacter', 'À contacter'], ['contacte', 'Contacté'], ['relance', 'Relancé'],
    ['a-propose', 'A proposé'], ['refus', 'Pas intéressé'], ['injoignable', 'Injoignable']
  ];
  var TYPES_PROSPECT = { spectacle: 'Spectacle jeune public', loisirs: 'Loisirs', musee: 'Musée / sciences', cinema: 'Cinéma' };
  var LIEN_FORMULAIRE = 'https://papaparfait.fr/proposer-une-sortie/';
  var RELANCE_JOURS = 7;
  var PHRASES_TYPE = {
    spectacle: 'vos spectacles jeune public',
    loisirs: 'votre lieu et ses animations pour les enfants',
    musee: 'vos ateliers et visites en famille',
    cinema: 'vos séances pour les enfants'
  };
  function nomVille(id) { var v = etat.villes.filter(function (x) { return x.id === id; })[0]; return v ? v.nom : id; }
  function emailProspect(l) {
    var ville = nomVille(l.ville);
    return {
      sujet: 'Faire connaître ' + PHRASES_TYPE[l.type] + ' aux papas de ' + ville,
      corps: 'Bonjour,\n\n'
        + 'Je m’appelle Wassim, je développe Papa Parfait, une application qui aide les papas à choisir en quelques secondes la meilleure sortie du jour avec leur enfant de 0 à 10 ans, selon son âge, l’heure et la météo. Elle est ouverte à ' + ville + '.\n\n'
        + 'J’aimerais y faire apparaître ' + PHRASES_TYPE[l.type] + ' (' + l.nom + ') : beaucoup de lieux comme le vôtre ne figurent dans aucun agenda public, et ce sont souvent les sorties que les parents cherchent.\n\n'
        + 'C’est gratuit et ça prend trois minutes : ' + LIEN_FORMULAIRE + '\n'
        + 'Prix, âges, horaires, photo : vous gardez la main sur ce qui est affiché, et votre lieu est crédité sur la fiche.\n\n'
        + 'Et si vous voulez aller plus loin : nous organisons des jeux-concours avec les lieux partenaires (quelques places offertes, une page dédiée sur notre site, que vous pouvez partager à votre communauté). Dites-moi si cela vous intéresse.\n\n'
        + 'Je reste disponible si vous avez la moindre question.\n\n'
        + 'Bonne journée,\nWassim — Papa Parfait\ncontact@papaparfait.fr'
    };
  }
  function aRelancer(l) {
    return l.statut === 'contacte' && l.contacteLe && (Date.now() - new Date(l.contacteLe).getTime()) > RELANCE_JOURS * 86400000;
  }
  // Veille concurrente, en tête de la prospection : ses sorties absentes de
  // nos sources désignent les lieux à démarcher en priorité.
  function panneauVeille() {
    var v = etat.veille;
    var html = '<div class="panneau" style="margin-bottom:16px"><div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;align-items:center">'
      + '<h3 style="margin:0">Veille : sélection « ce week-end » de rennesenfamille.fr</h3>'
      + '<button class="btn petit" id="relever-veille">Relever maintenant</button></div>';
    if (!v || !v.releve) return html + '<p class="aide">Pas encore de relevé : il se fait chaque vendredi après l’alerte, ou avec le bouton.</p></div>';
    var r = v.releve;
    html += '<p>Samedi ' + esc(r.dateISO) + ' (relevé le ' + esc(dateFr(r.le)) + ') : <b>' + r.total + '</b> sorties chez elle — '
      + '<span class="tag ko">' + r.absentes + ' absentes de nos sources</span> <span class="tag">' + r.ecartees + ' écartées par notre filtre</span> <span class="tag ok">' + r.retenues + ' retenues</span></p>';
    if (v.historique.length > 1) {
      html += '<p class="aide">Évolution des absentes : ' + v.historique.slice().reverse().map(function (h) { return esc(h.dateISO.slice(5)) + ' ' + h.absentes + '/' + h.total; }).join(' → ') + '</p>';
    }
    html += '<details><summary>Le détail</summary><table><thead><tr><th>Sa sortie</th><th>Lieu</th><th>Chez nous</th></tr></thead><tbody>'
      + r.lignes.map(function (l) {
        var chez = l.statut === 'absente' ? '<span class="tag ko">absente</span>'
          : l.statut === 'ecartee' ? '<span class="tag">écartée : ' + esc(l.motif) + '</span><div class="aide">' + esc(l.notre) + '</div>'
            : '<span class="tag ok">retenue (' + l.score + ')</span><div class="aide">' + esc(l.notre) + '</div>';
        return '<tr><td>' + esc(l.titre) + (l.heure ? ' <span class="aide">' + esc(l.heure) + '</span>' : '') + '</td><td>' + esc(l.lieu || '—') + '</td><td>' + chez + '</td></tr>';
      }).join('') + '</tbody></table></details></div>';
    return html;
  }
  function chargerVeille() {
    return api('veille').then(function (d) { etat.veille = d; }).catch(function () { etat.veille = null; });
  }

  function vueProspection() {
    var doc = etat.prospection;
    var html = '<h2>Prospection des lieux</h2><p class="texte">Lieux à inviter à proposer leurs sorties (formulaire du site). <b>Écrire</b> ouvre ta messagerie avec l’e-mail prérempli — envoie depuis contact@papaparfait.fr — puis passe le lieu en « Contacté ». Un lieu qui envoie une proposition passe tout seul en « A proposé ».</p>';
    html += panneauVeille();
    if (!doc) { $('vue').innerHTML = html + '<div class="panneau vide">Chargement…</div>'; return; }
    if (!doc.lieux.length) { $('vue').innerHTML = html + '<div class="panneau vide">Aucun lieu pour l’instant.</div>'; brancherVeille(); return; }
    var f = etat.filtresProspect;
    var compte = {};
    doc.lieux.forEach(function (l) { compte[l.statut] = (compte[l.statut] || 0) + 1; });
    var nbRelance = doc.lieux.filter(aRelancer).length;
    html += '<div class="panneau" style="margin-bottom:12px;display:flex;gap:8px;flex-wrap:wrap">'
      + STATUTS_PROSPECT.map(function (s) { return '<span class="tag' + (s[0] === 'a-propose' ? ' ok' : '') + '">' + esc(s[1]) + ' : ' + (compte[s[0]] || 0) + '</span>'; }).join(' ')
      + (nbRelance ? ' <span class="tag epingle">À relancer : ' + nbRelance + '</span>' : '') + '</div>';
    html += '<div class="filtres">'
      + '<label><span class="instr">Recherche</span><input type="search" id="pq" value="' + esc(f.q) + '" placeholder="Nom, commune…"></label>'
      + '<label><span class="instr">Ville</span><select id="pville">' + optionsVilles(f.ville, true) + '</select></label>'
      + '<label><span class="instr">Type</span><select id="ptype"><option value="">Tous</option>' + Object.keys(TYPES_PROSPECT).map(function (t) {
        return '<option value="' + t + '"' + (f.type === t ? ' selected' : '') + '>' + esc(TYPES_PROSPECT[t]) + '</option>';
      }).join('') + '</select></label>'
      + '<label><span class="instr">Statut</span><select id="pstatut"><option value="">Tous</option><option value="relancer"' + (f.statut === 'relancer' ? ' selected' : '') + '>À relancer</option>' + STATUTS_PROSPECT.map(function (s) {
        return '<option value="' + s[0] + '"' + (f.statut === s[0] ? ' selected' : '') + '>' + esc(s[1]) + '</option>';
      }).join('') + '</select></label></div>';
    var q = f.q.toLowerCase();
    var lieux = doc.lieux.filter(function (l) {
      if (f.ville && l.ville !== f.ville) return false;
      if (f.type && l.type !== f.type) return false;
      if (f.statut === 'relancer' ? !aRelancer(l) : (f.statut && l.statut !== f.statut)) return false;
      if (q && (l.nom + ' ' + (l.commune || '')).toLowerCase().indexOf(q) < 0) return false;
      return true;
    }).sort(function (a, b) { return nomVille(a.ville).localeCompare(nomVille(b.ville)) || a.type.localeCompare(b.type) || a.nom.localeCompare(b.nom); });
    html += '<p class="aide">' + lieux.length + ' lieu(x)</p><div class="panneau" style="padding:0;overflow-x:auto"><table><thead><tr><th>Lieu</th><th>Ville</th><th>Contact</th><th>Statut</th><th class="col-option">Note</th></tr></thead><tbody>';
    lieux.forEach(function (l) {
      var mail = emailProspect(l);
      var contact = l.email
        ? '<a class="btn petit" href="mailto:' + esc(l.email) + '?subject=' + encodeURIComponent(mail.sujet) + '&body=' + encodeURIComponent(mail.corps) + '">Écrire</a> '
          + '<button class="btn petit" data-copier="' + esc(l.id) + '">Copier</button><div class="aide">' + esc(l.email) + '</div>'
        : (l.pageContact ? '<a class="btn petit" href="' + esc(l.pageContact) + '" target="_blank" rel="noopener">Page contact</a> <button class="btn petit" data-copier="' + esc(l.id) + '">Copier</button>' : '<span class="discret">—</span>');
      html += '<tr><td><div class="titre">' + (l.site ? '<a href="' + esc(l.site) + '" target="_blank" rel="noopener">' + esc(l.nom) + '</a>' : esc(l.nom)) + '</div>'
        + '<div class="aide">' + esc(TYPES_PROSPECT[l.type] || l.type) + (l.pourquoi ? ' · ' + esc(l.pourquoi) : '') + '</div></td>'
        + '<td>' + esc(nomVille(l.ville)) + (l.commune && l.commune !== nomVille(l.ville) ? '<div class="aide">' + esc(l.commune) + '</div>' : '') + '</td>'
        + '<td>' + contact + (l.telephone ? '<div class="aide">' + esc(l.telephone) + '</div>' : '') + '</td>'
        + '<td><select data-statut="' + esc(l.id) + '">' + STATUTS_PROSPECT.map(function (s) {
          return '<option value="' + s[0] + '"' + (l.statut === s[0] ? ' selected' : '') + '>' + esc(s[1]) + '</option>';
        }).join('') + '</select>' + (aRelancer(l) ? '<div><span class="tag epingle">À relancer</span></div>' : '')
        + (l.contacteLe ? '<div class="aide">contacté le ' + esc(dateFr(l.contacteLe)) + '</div>' : '') + '</td>'
        + '<td class="col-option"><input data-note="' + esc(l.id) + '" value="' + esc(l.note || '') + '" placeholder="Note…" style="width:100%;min-width:160px"></td></tr>';
    });
    $('vue').innerHTML = html + '</tbody></table></div>';
    brancherVeille();
    [['pq', 'q', 'oninput'], ['pville', 'ville', 'onchange'], ['ptype', 'type', 'onchange'], ['pstatut', 'statut', 'onchange']].forEach(function (c) {
      $(c[0])[c[2]] = function () {
        f[c[1]] = $(c[0]).value;
        if (c[0] === 'pq') { clearTimeout(vueProspection.attente); vueProspection.attente = setTimeout(function () { vueProspection(); var el = $('pq'); el.focus(); el.setSelectionRange(el.value.length, el.value.length); }, 250); }
        else vueProspection();
      };
    });
  }
  function brancherVeille() {
    var b = $('relever-veille');
    if (!b) return;
    b.onclick = function () {
      b.disabled = true; b.textContent = 'Relevé en cours…';
      api('veille', { corps: {} }).then(function () { return chargerVeille(); })
        .then(function () { toast('Veille relevée.'); vueProspection(); })
        .catch(function (err) { b.disabled = false; b.textContent = 'Relever maintenant'; toast(err.message); });
    };
  }
  function majProspect(id, champs) {
    return api('prospection', { corps: Object.assign({ id: id }, champs) }).then(function (r) {
      etat.prospection.lieux = etat.prospection.lieux.map(function (l) { return l.id === id ? r.lieu : l; });
    }).catch(function (err) { toast(err.message); });
  }
  function chargerProspection() {
    return api('prospection').then(function (d) { etat.prospection = d; }).catch(function () { etat.prospection = { lieux: [] }; });
  }

  // Concours avec des lieux partenaires (src/concours.js). Participation sur
  // une page du site ; tirage ici, après la clôture, puis envoi aux gagnants.
  function chargerConcours() {
    return api('concours').then(function (d) { etat.concours = d.concours; }).catch(function () { etat.concours = []; });
  }
  function etatConcours(c) {
    if (c.prevenusLe) return '<span class="tag ok">Gagnants prévenus</span>';
    if (c.tirageLe) return '<span class="tag epingle">Tiré — à prévenir</span>';
    if (c.ouvert) return '<span class="tag ok">Ouvert</span>';
    return new Date().toISOString().slice(0, 10) < c.debut ? '<span class="tag leger">À venir</span>' : '<span class="tag">Clos — à tirer</span>';
  }
  function vueConcours() {
    var html = '<h2>Concours</h2><p class="texte">Des places offertes par un lieu partenaire, à gagner sur une page du site. L’alerte du week-end est une option décochée, jamais une condition. Tirage après la clôture, puis « Prévenir les gagnants » (après relecture).</p>';
    var liste = etat.concours || [];
    liste.forEach(function (c) {
      var lien = '/concours/' + encodeURIComponent(c.id) + '/reglement';
      html += '<div class="panneau" style="margin-bottom:12px"><div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap">'
        + '<div><h3 style="margin:0">' + esc(c.titre) + '</h3><div class="aide">' + esc(c.lot) + ' · ' + esc(c.partenaire) + ' · du ' + esc(c.debut) + ' au ' + esc(c.fin)
        + ' · ' + esc((c.villes || []).map(nomVille).join(', ') || 'toutes villes') + '</div>'
        + '<div class="aide">Identifiant du bloc : <code>' + esc(c.id) + '</code> · <a href="' + lien + '" target="_blank" rel="noopener">règlement</a></div></div>'
        + '<div>' + etatConcours(c) + '<div class="aide" style="text-align:right"><b>' + c.nbParticipants + '</b> participant(s) · ' + c.nbAlerte + ' abonné(s) à l’alerte</div></div></div>';
      if (c.gagnants && c.gagnants.length) {
        html += '<p><b>Gagnants</b> (tirés le ' + esc(dateFr(c.tirageLe)) + ' parmi ' + c.tirageParmi + ') : '
          + c.gagnants.map(function (g) { return esc(g.prenom) + (g.email ? ' &lt;' + esc(g.email) + '&gt;' : '') + ' (' + esc(nomVille(g.villeId)) + ')'; }).join(', ') + '</p>';
      }
      html += '<div style="display:flex;gap:8px;flex-wrap:wrap">'
        + (!c.tirageLe && !c.ouvert && c.nbParticipants ? '<button class="btn primaire" data-tirer="' + esc(c.id) + '">Tirer au sort</button>' : '')
        + (c.tirageLe && !c.prevenusLe ? '<button class="btn primaire" data-prevenir="' + esc(c.id) + '">Prévenir les gagnants</button>' : '')
        + (c.nbParticipants ? '<button class="btn" data-export="' + esc(c.id) + '">Exporter (CSV)</button>' : '')
        + (!c.tirageLe ? '<button class="btn" data-editer-concours="' + esc(c.id) + '">Modifier</button>' : '')
        + '</div></div>';
    });
    var e = etat.concoursEdite || {};
    html += '<h3>' + (e.id ? 'Modifier le concours' : 'Nouveau concours') + '</h3><form id="form-concours" class="panneau" style="display:grid;gap:8px;max-width:640px">'
      + '<label>Identifiant (dans l’adresse, ex. nocturnes-parc-2026) <input name="id" value="' + esc(e.id || '') + '"' + (e.id ? ' readonly' : '') + ' required></label>'
      + '<label>Titre <input name="titre" value="' + esc(e.titre || '') + '" required></label>'
      + '<label>Lot (ex. 2 × 4 entrées pour les Nocturnes) <input name="lot" value="' + esc(e.lot || '') + '" required></label>'
      + '<label>Partenaire <input name="partenaire" value="' + esc(e.partenaire || '') + '" required></label>'
      + '<label>Site du partenaire <input name="partenaireUrl" value="' + esc(e.partenaireUrl || '') + '" placeholder="https://"></label>'
      + '<label>Nombre de gagnants <input name="nbGagnants" type="number" min="1" max="50" value="' + esc(e.nbGagnants || 1) + '" required></label>'
      + '<label>Début <input name="debut" type="date" value="' + esc(e.debut || '') + '" required></label>'
      + '<label>Fin (incluse) <input name="fin" type="date" value="' + esc(e.fin || '') + '" required></label>'
      + '<label>Villes concernées <span class="aide">(Ctrl+clic pour en choisir plusieurs ; aucune = toutes)</span><select name="villes" multiple size="6">' + etat.villes.map(function (v) {
        return '<option value="' + esc(v.id) + '"' + ((e.villes || []).indexOf(v.id) >= 0 ? ' selected' : '') + '>' + esc(v.nom) + '</option>';
      }).join('') + '</select></label>'
      + '<div><button class="btn primaire" type="submit">Enregistrer</button> ' + (e.id ? '<button class="btn" type="button" id="annuler-concours">Annuler</button>' : '') + '</div>'
      + '<p class="erreur" id="erreur-concours"></p></form>';
    $('vue').innerHTML = html;
    $('form-concours').onsubmit = function (ev) {
      ev.preventDefault();
      var f = ev.target;
      var corps = {
        id: f.id.value, titre: f.titre.value, lot: f.lot.value, partenaire: f.partenaire.value, partenaireUrl: f.partenaireUrl.value,
        nbGagnants: f.nbGagnants.value, debut: f.debut.value, fin: f.fin.value,
        villes: [].slice.call(f.villes.selectedOptions).map(function (o) { return o.value; })
      };
      api('concours', { corps: { action: 'enregistrer', concours: corps } }).then(function () {
        etat.concoursEdite = null; toast('Concours enregistré.'); return chargerConcours();
      }).then(vueConcours).catch(function (err) { $('erreur-concours').textContent = err.message; });
    };
    if ($('annuler-concours')) $('annuler-concours').onclick = function () { etat.concoursEdite = null; vueConcours(); };
  }
  function actionConcours(id, action, bouton) {
    bouton.disabled = true;
    api('concours', { corps: { action: action, id: id } }).then(function (r) {
      toast(action === 'tirer' ? r.gagnants.length + ' gagnant(s) tiré(s) parmi ' + r.parmi + '. Relis avant de prévenir.' : r.prevenus + ' gagnant(s) prévenu(s)' + (r.echecs ? ', ' + r.echecs + ' échec(s)' : '') + '.');
      return chargerConcours();
    }).then(vueConcours).catch(function (err) { bouton.disabled = false; toast(err.message); });
  }
  function exporterConcours(id) {
    fetch('/admin/api/concours/participants?id=' + encodeURIComponent(id), { headers: { Authorization: 'Bearer ' + etat.jeton } })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.blob(); })
      .then(function (b) {
        var a = document.createElement('a');
        a.href = URL.createObjectURL(b); a.download = 'concours-' + id + '.csv';
        document.body.appendChild(a); a.click(); a.remove();
      }).catch(function (err) { toast(err.message); });
  }

  function vueVilles() {
    var html = '<h2>Villes ouvertes</h2><p class="texte">Lecture seule : ouvrir ou fermer une ville reste un changement de code (apps/on-sort/src/config.js + workers/on-sort/src/villes.js).</p>'
      + '<div class="panneau" style="padding:0;overflow-x:auto"><table><thead><tr><th>Ville</th><th>Département</th><th class="num">Sorties du jour</th><th class="num">Retenues</th><th class="num">Top</th><th class="col-option">Préférée</th></tr></thead><tbody>';
    etat.villes.forEach(function (v) {
      var r = etat.parVille[v.id];
      var pref = null;
      if (r && r.top.length) r.evenements.forEach(function (ev) { if (ev.cle === r.top[0]) pref = ev; });
      html += '<tr class="ligne" data-ville="' + esc(v.id) + '"><td><b>' + esc(v.nom) + '</b></td><td>' + esc(v.code + ' — ' + v.dept) + '</td>'
        + (r ? '<td class="num">' + r.stats.uniques + '</td><td class="num">' + r.stats.retenus + '</td><td class="num">' + r.top.length + '</td><td class="col-option">' + (pref ? esc(pref.titre) : '<span class="tag ko">top vide</span>') + '</td>'
          : '<td colspan="4" class="discret">' + (etat.erreurs[v.id] ? esc(etat.erreurs[v.id]) : 'chargement…') + '</td>') + '</tr>';
    });
    $('vue').innerHTML = html + '</tbody></table></div>';
  }

  // ---------- Fiche d'une sortie
  function trouver(cle) {
    var a = null;
    agreger().forEach(function (x) { if (x.ev.cle === cle) a = x; });
    return a;
  }

  function ouvrirFiche(cle) { etat.ficheCle = cle; rendreFiche(); }
  function fermerFiche() { etat.ficheCle = null; $('fiche').classList.add('cache'); $('fiche-voile').classList.add('cache'); }

  function champ(nom, valeur, ev) {
    var origine = ev.original && Object.prototype.hasOwnProperty.call(ev.original, nom)
      ? '<span class="avant">' + esc(ev.original[nom] == null ? 'vide' : ev.original[nom]) + '</span>' : '';
    return origine + (valeur == null || valeur === '' ? '<span class="discret">—</span>' : valeur);
  }

  function rendreFiche() {
    var a = trouver(etat.ficheCle);
    var fiche = $('fiche');
    if (!a) { fermerFiche(); return; }
    var ev = a.ev;
    var age = ev.ageMin != null ? (ev.ageMax != null ? ev.ageMin + '-' + ev.ageMax + ' ans' : 'dès ' + ev.ageMin + ' ans') : null;
    var html = '<div class="entete"><h2>' + esc(ev.titre) + '</h2><button class="btn petit" id="fermer" type="button">Fermer</button></div>'
      + '<div class="tags">' + tagsEtat(ev) + '<span class="tag leger">' + esc(SOURCES[ev.origine] || ev.origine) + '</span></div>'
      + '<div class="actions">'
      + (ev.masque ? '<button class="btn" data-act="reafficher">Réafficher</button>' : '<button class="btn danger" data-act="masquer">Masquer</button>')
      + (ev.epingle ? '<button class="btn" data-act="desepingler">Désépingler</button>' : '<button class="btn primaire" data-act="epingler">Épingler en tête</button>')
      + (ev.manuel ? '<button class="btn" data-act="modifier-manuel">Modifier</button><button class="btn danger" data-act="supprimer-manuel">Supprimer</button>'
        : '<button class="btn" data-act="corriger">Corriger</button>')
      + '<button class="btn" data-act="dupliquer">Dupliquer en manuelle</button>'
      + (ev.url ? '<a class="btn" href="' + esc(ev.url) + '" target="_blank" rel="noopener noreferrer">Fiche source</a>' : '')
      + '</div>'
      + '<dl>'
      + '<dt>Dates</dt><dd>' + champ('dateDebut', esc(dateFr(ev.dateDebut)), ev) + (ev.dateFin && ev.dateFin !== ev.dateDebut ? ' → ' + champ('dateFin', esc(dateFr(ev.dateFin)), ev) : '') + '</dd>'
      + '<dt>Horaires</dt><dd>' + champ('horaires', esc(ev.horaires), ev) + '</dd>'
      + '<dt>Lieu</dt><dd>' + champ('lieuNom', esc(ev.lieuNom), ev) + '</dd>'
      + '<dt>Adresse</dt><dd>' + champ('adresse', esc(ev.adresse), ev) + '</dd>'
      + '<dt>Ville</dt><dd>' + champ('ville', esc(ev.ville), ev) + '</dd>'
      + '<dt>Position</dt><dd>' + (ev.lat != null ? esc(ev.lat + ', ' + ev.lon) : '<span class="discret">inconnue — pas de filtre de distance</span>') + '</dd>'
      + '<dt>Gratuit</dt><dd>' + champ('gratuit', ev.gratuit == null ? null : (ev.gratuit ? 'oui' : 'non'), ev) + '</dd>'
      + '<dt>Âge (forcé)</dt><dd>' + (age ? esc(age) : '<span class="discret">lu dans le texte</span>') + '</dd>'
      + (ev.source ? '<dt>Mention</dt><dd>' + esc(ev.source) + (ev.majLe ? ' — maj ' + esc(ev.majLe) : '') + '</dd>' : '')
      + '<dt>Clé</dt><dd class="aide">' + esc(ev.cle) + '</dd>'
      + '</dl>';
    html += '<section><h3>Score par ville</h3><table><thead><tr><th>Ville</th><th>Rang</th><th class="num">Score</th><th>Pourquoi</th></tr></thead><tbody>';
    // Villes où la sortie compte d'abord (rang, puis score) ; les « hors rayon »
    // tiennent sur une seule ligne, sinon une sortie locale liste 17 villes vides.
    var ids = Object.keys(a.villes);
    var loin = ids.filter(function (id) { return a.villes[id].motif === 'hors-rayon'; });
    ids = ids.filter(function (id) { return a.villes[id].motif !== 'hors-rayon'; }).sort(function (p, q) {
      var x = a.villes[p], y = a.villes[q];
      return ((x.rang || 99) - (y.rang || 99)) || ((y.score == null ? -999 : y.score) - (x.score == null ? -999 : x.score));
    });
    ids.forEach(function (id) {
      var x = a.villes[id];
      html += '<tr><td>' + esc(nomVille(id)) + '</td><td>' + (x.rang ? '<span class="rang' + (x.rang === 1 ? ' un' : '') + '">' + String(x.rang).padStart(2, '0') + '</span>' : '') + '</td>'
        + '<td class="num">' + (x.score == null ? '—' : '<b>' + x.score + '</b>') + '</td>'
        + '<td class="aide">' + (x.motif ? '<b>' + esc(MOTIFS[x.motif] || x.motif) + '</b>' + (x.distanceKm != null ? ' (' + x.distanceKm + ' km)' : '')
          : esc(x.raisons.join(' · ')) + (x.lieuType && x.lieuType !== 'inconnu' ? ' · lieu ' + esc(x.lieuType) : '') + (x.age ? ' · âge lu ' + x.age.min + (x.age.max != null ? '-' + x.age.max : '+') : '')) + '</td></tr>';
    });
    if (loin.length) html += '<tr><td colspan="4" class="aide"><b>Hors du rayon</b> : ' + esc(loin.map(nomVille).join(', ')) + '</td></tr>';
    html += '</tbody></table><p class="aide">Score : famille ×2, ponctuel +1,5, âge +2, distance (≤12 km +3, ≤20 +2, ≤30 +0,5, au-delà −1,5), météo ±, gratuit +1, horaire en semaine −3. Une épinglée passe devant tout le monde dans les villes où elle est retenue.</p></section>';
    html += '<section><h3>Description</h3><p class="desc">' + champ('description', esc(ev.description), ev) + '</p></section>';
    fiche.innerHTML = html;
    fiche.classList.remove('cache'); $('fiche-voile').classList.remove('cache');
    $('fermer').onclick = fermerFiche;
    fiche.querySelectorAll('[data-act]').forEach(function (b) {
      b.onclick = function () { actionFiche(b.getAttribute('data-act'), a); };
    });
  }

  function actionFiche(act, a) {
    var ev = a.ev;
    var villesTouchees = Object.keys(a.villes);
    if (act === 'masquer') {
      var raison = prompt('Pourquoi la masquer ? (facultatif, pour le journal)', '');
      if (raison === null) return;
      return agir({ type: 'masquer', cle: ev.cle, titre: ev.titre, raison: raison }, villesTouchees);
    }
    if (act === 'reafficher' || act === 'epingler' || act === 'desepingler') return agir({ type: act, cle: ev.cle, titre: ev.titre }, villesTouchees);
    if (act === 'supprimer-manuel') {
      if (!confirm('Supprimer définitivement « ' + ev.titre + ' » ? (annulable depuis le journal)')) return;
      return agir({ type: 'supprimer-manuel', cle: ev.cle, titre: ev.titre }, villesTouchees);
    }
    if (act === 'corriger') return ouvrirFormulaire('corriger', ev);
    if (act === 'modifier-manuel') return ouvrirFormulaire('manuel', ev, ev.cle);
    if (act === 'dupliquer') return ouvrirFormulaire('manuel', ev);
  }

  // Applique une action, recharge la surcouche et les villes concernées.
  function agir(action, villesARecharger) {
    return api('action', { corps: action }).then(function (r) {
      etat.surcouche = r.surcouche;
      etat.journal = [r.entree].concat(etat.journal);
      var idJournal = r.entree.id;
      toast(ACTIONS[action.type] || 'Fait', action.type === 'annuler' ? null : {
        libelle: 'Annuler', faire: function () { agir({ type: 'annuler', journalId: idJournal }, villesARecharger); }
      });
      rendre();
      var ids = villesARecharger && villesARecharger.length ? villesARecharger : etat.villes.map(function (v) { return v.id; });
      // Une ville après l'autre (limite CPU du plan gratuit en parallèle).
      return ids.reduce(function (p, id) {
        return p.then(function () { return chargerVille(id).then(rendre); });
      }, Promise.resolve()).then(function () { majStatut(etat.villes.length, etat.villes.length); rendre(); });
    }).catch(function (e) { toast('Échec : ' + e.message); throw e; });
  }

  // ---------- Formulaire : corriger une sortie / créer ou modifier une manuelle
  function ouvrirFormulaire(mode, ev, cleManuelle) {
    var manuel = mode === 'manuel';
    var correction = !manuel && ev && etat.surcouche && etat.surcouche.corrections[ev.cle] ? etat.surcouche.corrections[ev.cle].champs : {};
    var existant = cleManuelle && etat.surcouche ? etat.surcouche.manuels[cleManuelle] : null;
    // Valeur d'un champ : manuelle existante > duplication d'une sortie > correction en cours.
    var val = function (k) {
      if (existant) return existant[k];
      if (manuel && ev) return ev[k];
      return correction[k];
    };
    var ph = function (k) { return !manuel && ev && ev[k] != null ? ' placeholder="' + esc(ev.original && k in ev.original ? ev.original[k] : ev[k]) + '"' : ''; };
    var input = function (k, libelle, type, extra) {
      var v = val(k);
      return '<label><span class="instr">' + libelle + '</span><input name="' + k + '" type="' + (type || 'text') + '" value="' + esc(v == null ? '' : v) + '"' + ph(k) + (extra || '') + '></label>';
    };
    var jours = existant ? existant.jours || [] : [];
    var villeRattachee = existant ? existant.villeId : '';
    var titre = manuel ? (existant ? 'Modifier la sortie manuelle' : (ev ? 'Dupliquer en sortie manuelle' : 'Ajouter une sortie')) : 'Corriger la sortie';
    var html = '<div class="entete"><h2>' + esc(titre) + '</h2><button class="btn petit" id="fermer" type="button">Fermer</button></div>'
      + (manuel ? '' : '<p class="aide">Un champ rempli remplace la valeur de la source (en grisé). Vide = valeur de la source. La correction tient tant que la source garde la même clé.</p>')
      + '<form class="edition" id="form-edition">'
      + input('titre', 'Titre' + (manuel ? ' *' : ''), 'text', manuel ? ' required maxlength="160"' : ' maxlength="160"')
      + '<label><span class="instr">Description</span><textarea name="description" maxlength="2000"' + ph('description') + '>' + esc(val('description') || '') + '</textarea></label>'
      + '<div class="deux">' + input('dateDebut', 'Début' + (manuel ? ' *' : ''), 'date', manuel ? ' required' : '') + input('dateFin', 'Fin', 'date') + '</div>'
      + (manuel ? '<div><span class="instr">Jours (vide = tous les jours de la plage)</span><div class="jours">' + JOURS.map(function (j, i) {
        return '<label><input type="checkbox" name="jour" value="' + i + '"' + (jours.indexOf(i) >= 0 ? ' checked' : '') + '> ' + j + '</label>';
      }).join('') + '</div><p class="aide">Ex. « chaque samedi jusqu’à fin décembre » : début aujourd’hui, fin 31/12, coche sam.</p></div>' : '')
      + input('horaires', 'Horaires (texte affiché)', 'text', ' placeholder="Samedi 10h-12h"')
      + '<div class="deux">' + input('lieuNom', 'Lieu') + input('ville', 'Ville affichée') + '</div>'
      + input('adresse', 'Adresse')
      + (manuel ? '<label><span class="instr">Ville de rattachement (remplit la position)</span><select name="villeId"><option value="">—</option>' + optionsVilles(villeRattachee) + '</select></label>' : '')
      + '<div class="deux">' + input('lat', 'Latitude' + (manuel ? ' *' : ''), 'number', ' step="any"' + (manuel ? ' required' : '')) + input('lon', 'Longitude' + (manuel ? ' *' : ''), 'number', ' step="any"' + (manuel ? ' required' : '')) + '</div>'
      + input('url', 'Lien (http…)', 'url')
      + '<div class="deux"><label><span class="instr">Gratuit</span><select name="gratuit"><option value="">' + (manuel ? 'Non précisé' : 'Comme la source') + '</option><option value="true"' + (val('gratuit') === true ? ' selected' : '') + '>Oui</option><option value="false"' + (val('gratuit') === false ? ' selected' : '') + '>Non</option></select></label>'
      + '<label><span class="instr">Lieu (météo)</span><select name="lieuType"><option value="">Détecté</option><option value="interieur"' + (val('lieuType') === 'interieur' ? ' selected' : '') + '>Intérieur</option><option value="exterieur"' + (val('lieuType') === 'exterieur' ? ' selected' : '') + '>Extérieur</option></select></label></div>'
      + '<div class="deux">' + input('ageMin', 'Âge min (force)', 'number', ' min="0" max="18"') + input('ageMax', 'Âge max', 'number', ' min="0" max="18"') + '</div>'
      + '<p class="erreur" id="erreur-form"></p>'
      + '<div class="actions"><button class="btn primaire" type="submit">Enregistrer</button><button class="btn" type="button" id="annuler-form">Annuler</button></div>'
      + '</form>';
    var fiche = $('fiche');
    fiche.innerHTML = html;
    fiche.classList.remove('cache'); $('fiche-voile').classList.remove('cache');
    var form = $('form-edition');
    var retour = function () { if (ev && !manuel) rendreFiche(); else if (cleManuelle) rendreFiche(); else fermerFiche(); };
    $('fermer').onclick = retour; $('annuler-form').onclick = retour;
    if (manuel && form.villeId) form.villeId.onchange = function () {
      var v = etat.villes.filter(function (x) { return x.id === form.villeId.value; })[0];
      if (v) { form.lat.value = v.lat; form.lon.value = v.lon; if (!form.ville.value) form.ville.value = v.nom; }
    };
    form.onsubmit = function (e) {
      e.preventDefault();
      var champs = {};
      ['titre', 'description', 'dateDebut', 'dateFin', 'horaires', 'lieuNom', 'ville', 'adresse', 'lat', 'lon', 'url', 'gratuit', 'lieuType', 'ageMin', 'ageMax'].forEach(function (k) {
        var v = form[k].value.trim();
        if (v !== '') champs[k] = (k === 'gratuit') ? v === 'true' : v;
      });
      var action;
      var villes = ev ? Object.keys((trouver(ev.cle) || { villes: {} }).villes) : [];
      if (manuel) {
        champs.jours = Array.prototype.filter.call(form.querySelectorAll('input[name=jour]'), function (c) { return c.checked; }).map(function (c) { return Number(c.value); });
        champs.villeId = form.villeId.value || null;
        action = { type: 'enregistrer-manuel', manuel: champs, titre: champs.titre };
        if (cleManuelle) action.cle = cleManuelle;
        villes = null; // la position peut avoir changé : on recharge tout
      } else {
        action = { type: 'corriger', cle: ev.cle, titre: ev.titre, champs: champs };
      }
      var bouton = form.querySelector('button[type=submit]');
      bouton.disabled = true;
      agir(action, villes).then(function () {
        if (action.type === 'enregistrer-manuel') {
          etat.ficheCle = action.cle || (etat.journal[0] && etat.journal[0].cle);
          rendreFiche();
        } else rendreFiche();
      }).catch(function (err) { bouton.disabled = false; $('erreur-form').textContent = err.message; });
    };
  }

  // ---------- Événements globaux
  document.addEventListener('click', function (e) {
    var onglet = e.target.closest('[data-onglet]');
    if (onglet) { etat.onglet = onglet.getAttribute('data-onglet'); stocker('adm-onglet', etat.onglet); rendre(); return; }
    var tirerC = e.target.closest('[data-tirer]');
    if (tirerC) { actionConcours(tirerC.getAttribute('data-tirer'), 'tirer', tirerC); return; }
    var prevenirC = e.target.closest('[data-prevenir]');
    if (prevenirC) { actionConcours(prevenirC.getAttribute('data-prevenir'), 'prevenir', prevenirC); return; }
    var exporterC = e.target.closest('[data-export]');
    if (exporterC) { exporterConcours(exporterC.getAttribute('data-export')); return; }
    var editerC = e.target.closest('[data-editer-concours]');
    if (editerC) {
      etat.concoursEdite = (etat.concours || []).filter(function (c) { return c.id === editerC.getAttribute('data-editer-concours'); })[0];
      vueConcours(); return;
    }
    var copier = e.target.closest('[data-copier]');
    if (copier) {
      var lieu = etat.prospection.lieux.filter(function (l) { return l.id === copier.getAttribute('data-copier'); })[0];
      var m = emailProspect(lieu);
      navigator.clipboard.writeText('Objet : ' + m.sujet + '\n\n' + m.corps).then(function () { toast('E-mail copié — colle-le dans ta messagerie.'); });
      return;
    }
    var valider = e.target.closest('[data-valider]');
    if (valider) { deciderProposition(valider.getAttribute('data-valider'), 'valider', valider); return; }
    var refuser = e.target.closest('[data-refuser]');
    if (refuser) { deciderProposition(refuser.getAttribute('data-refuser'), 'refuser', refuser); return; }
    var annuler = e.target.closest('[data-annuler]');
    if (annuler) { annuler.disabled = true; agir({ type: 'annuler', journalId: annuler.getAttribute('data-annuler') }, null).catch(function () { annuler.disabled = false; }); return; }
    var ville = e.target.closest('[data-ville]');
    if (ville) { etat.villeTop = ville.getAttribute('data-ville'); etat.onglet = 'top'; rendre(); return; }
    var ligne = e.target.closest('#vue [data-cle]');
    if (ligne) ouvrirFiche(ligne.getAttribute('data-cle'));
  });
  document.addEventListener('change', function (e) {
    var statut = e.target.closest('[data-statut]');
    if (statut) { majProspect(statut.getAttribute('data-statut'), { statut: statut.value }).then(vueProspection); return; }
    var note = e.target.closest('[data-note]');
    if (note) majProspect(note.getAttribute('data-note'), { note: note.value });
  });
  $('fiche-voile').onclick = fermerFiche;
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && etat.ficheCle !== undefined) fermerFiche(); });

  function deconnecter(message) {
    stocker('adm-jeton', null); etat.jeton = null;
    $('app').classList.add('cache'); $('ecran-connexion').classList.remove('cache');
    $('erreur-connexion').textContent = message || '';
  }

  function demarrer() {
    $('ecran-connexion').classList.add('cache');
    api('moi').then(function (r) {
      etat.villes = r.villes; etat.mock = r.mock;
      $('app').classList.remove('cache');
      if (!etat.villes.some(function (v) { return v.id === etat.villeTop; })) etat.villeTop = etat.villes[0].id;
      return chargerSurcouche().then(function () { rendre(); return chargerTout(); });
    }).catch(function (e) {
      if (etat.jeton) { $('ecran-connexion').classList.remove('cache'); $('erreur-connexion').textContent = e.message; }
    });
  }

  var ages = '';
  for (var a = 0; a <= 12; a++) ages += '<option value="' + a + '"' + (a === 3 ? ' selected' : '') + '>' + (a === 0 ? '< 1 an' : a + ' an' + (a > 1 ? 's' : '')) + '</option>';
  $('f-age').innerHTML = ages;
  $('f-date').value = prochainSamedi();
  ['f-date', 'f-age', 'f-rayon'].forEach(function (id) { $(id).onchange = function () { chargerTout(); }; });
  $('recharger').onclick = function () { etat.stats = null; chargerSurcouche().then(chargerTout); };
  $('deconnexion').onclick = function () { deconnecter(''); };
  $('form-connexion').onsubmit = function (e) {
    e.preventDefault();
    etat.jeton = $('jeton').value.trim();
    stocker('adm-jeton', etat.jeton);
    demarrer();
  };

  if (etat.jeton) demarrer(); else $('ecran-connexion').classList.remove('cache');
})();
</script>
</body>
</html>`;
