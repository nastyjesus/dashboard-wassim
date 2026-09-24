# Migration DNS papaparfait.fr vers Cloudflare — checklist

**Pourquoi** : faire pointer `app.papaparfait.fr` sur le worker de la PWA, et
pouvoir vérifier un domaine d'envoi d'e-mails en deux clics. Le site WordPress
et la boîte mail **restent chez o2switch** : on ne déplace que les réponses DNS.

**Durée** : 30 minutes de saisie, puis 1 à 24 h de propagation.
**Risque réel** : couper les e-mails. Tout ce document existe pour ça.

---

## La règle d'or, et l'erreur à ne pas commettre

Le MX de `papaparfait.fr` pointe sur **`papaparfait.fr` lui-même**. Donc :

> Si la racine passe en 🟠 orange (proxy Cloudflare), `papaparfait.fr` ne résout
> plus vers `109.234.164.216` mais vers une IP Cloudflare, **qui n'accepte pas le
> SMTP**. Les serveurs qui t'écrivent obtiennent cette IP et le mail rebondit.

Le nuage gris posé sur la ligne MX **ne protège pas** : ce qui compte, c'est la
cible. Même piège pour :

- `mail` en CNAME vers la racine → suit la racine proxifiée, donc IP Cloudflare ;
- les 4 SRV caldav/carddav qui visent `papaparfait.fr` sur les ports **2079 et
  2080** — Cloudflare ne proxifie que 80/443, la synchro agenda et contacts meurt.

Deux façons de s'en sortir. **Commence par l'option A.**

### Option A — tout en gris (recommandée pour la première bascule)

Aucun enregistrement proxifié. Cloudflare ne fait que répondre aux questions
DNS : exactement le comportement d'aujourd'hui, avec la zone chez Cloudflare.
Tu perds le CDN (que tu n'as pas aujourd'hui), tu ne risques rien, et
`app.papaparfait.fr` fonctionnera quand même — un enregistrement de worker n'a
pas besoin du proxy sur les autres hôtes.

### Option B — orange sur le site, plus tard

Une fois l'option A vérifiée et stable, si tu veux le CDN sur le site :

1. crée `mx` en **A → `109.234.164.216`, gris** ;
2. change le MX pour qu'il vise **`mx.papaparfait.fr`** au lieu de la racine ;
3. change les 4 SRV caldav/carddav pour viser **`mx.papaparfait.fr`** ;
4. remplace `mail` CNAME par un **A → `109.234.164.216`, gris** ;
5. **seulement ensuite**, passe `papaparfait.fr` et `www` en orange ;
6. rejoue le vérificateur (en ajustant les cibles attendues dans le script).

---

## La zone à reconstituer (option A : tout gris)

| Nom | Type | Valeur | Nuage |
|---|---|---|---|
| `papaparfait.fr` | A | `109.234.164.216` | ⚪ gris |
| `www` | CNAME | `papaparfait.fr` | ⚪ gris |
| `papaparfait.fr` | MX | `papaparfait.fr` — priorité 0 | — |
| `mail` | CNAME | `papaparfait.fr` | ⚪ gris |
| `webmail` | A | `109.234.164.216` | ⚪ gris |
| `autodiscover` | A | `109.234.164.216` | ⚪ gris |
| `autoconfig` | A | `109.234.164.216` | ⚪ gris |
| `ftp` | CNAME | `papaparfait.fr` | ⚪ gris |
| `webdisk` | A | `109.234.164.216` | ⚪ gris |
| `whm` | A | `109.234.164.216` | ⚪ gris |
| `cpanel` | A | `109.234.164.216` | ⚪ gris |
| `cpcontacts` | A | `109.234.164.216` | ⚪ gris |
| `cpcalendars` | A | `109.234.164.216` | ⚪ gris |
| `papaparfait.fr` | TXT | `v=spf1 ip4:109.234.164.216 +a +mx +include:spf.jabatus.fr ~all` | — |
| `_dmarc` | TXT | `v=DMARC1; p=none;` | — |
| `default._domainkey` | TXT | la clé DKIM ci-dessous | — |
| `_carddavs._tcp` | SRV | prio 0, poids 0, port **2080**, cible `papaparfait.fr` | — |
| `_caldavs._tcp` | SRV | prio 0, poids 0, port **2080**, cible `papaparfait.fr` | — |
| `_carddav._tcp` | SRV | prio 0, poids 0, port **2079**, cible `papaparfait.fr` | — |
| `_caldav._tcp` | SRV | prio 0, poids 0, port **2079**, cible `papaparfait.fr` | — |
| `_autodiscover._tcp` | SRV | prio 0, poids 0, port **443**, cible `cpanelemaildiscovery.cpanel.net` | — |
| `_carddavs._tcp` | TXT | `path=/` | — |
| `_caldavs._tcp` | TXT | `path=/` | — |
| `_carddav._tcp` | TXT | `path=/` | — |
| `_caldav._tcp` | TXT | `path=/` | — |

TTL : laisser **Auto** partout.

### La clé DKIM

Vérifiée le 24 septembre 2026 contre le DNS public (411 caractères). Une seule
ligne, sans espace ni retour ajouté :

```
v=DKIM1; k=rsa; p=MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA06MqiGA6rQai3KV/oYUo1PHx4FahoWyCwSjLiyOLI4o4XaJhbffnNgzvvD6l+mDbDORbEpJVnbErc2OBK3Wd7ZGs0IvdjNiVxbFlXwk+6sHMMP//y+NR673r8qA8wv1yfiHIf7mIhnKXnQKb8+xArICbf6CnS1np+bYblNwYRMopl/nC3BXKPTtcOU1PaZcU+cATv9KVf/5qt/hWH1rRX9+52D9FfbnkrK1eI8tRjOmr8y/uO8V77XvLEjh9ynFPa3ZtYJ/fk/6Df09KypIgfQ1o/o0I+j0FV9rqCLIr7A2Sj8Yslzt4RuCecCCw3d6VZw37zroP07XUDKT1SqzCmQIDAQAB;
```

Si Cloudflare refuse la longueur, colle-la sans les espaces après les
points-virgules. Le vérificateur compare le début **et** la fin de la clé :
une recopie tronquée sera détectée.

---

## La checklist

### Ce qu'on ne peut pas vérifier avant la bascule (constaté le 24/09/2026)

Les deux serveurs de noms Cloudflare assignés (`hadlee.ns.cloudflare.com`,
`justin.ns.cloudflare.com`) répondent **REFUSED** à toute requête sur
`papaparfait.fr` tant que la délégation n'est pas faite : Cloudflare ne sert la
zone qu'une fois le domaine effectivement délégué. La zone n'est donc
vérifiable **qu'après** le changement de serveurs de noms.

Ce qui rend la chose acceptable : la **TTL de délégation chez AFNIC est de
1 heure** (mesurée sur `d.nic.fr`). Un retour arrière se propage donc en une
heure au pire, pas en 48. D'où la règle : on bascule le matin, on vérifie dans
la foulée, on garde la zone o2switch intacte.

### Avant de toucher à quoi que ce soit

- [ ] Capture d'écran de la zone complète dans cPanel o2switch → *Zone Editor*.
- [ ] Baseline enregistrée : `node scripts/dns-papaparfait.mjs` → doit afficher
      « Zone conforme ». *(Fait le 24 septembre 2026 : 25/25 OK, plus la clé
      DKIM entière.)*
- [ ] Noter où le domaine est **acheté** (le registrar) : c'est là que se
      changent les serveurs de noms, pas forcément chez l'hébergeur.

### Créer la zone chez Cloudflare

- [ ] Compte sur [dash.cloudflare.com](https://dash.cloudflare.com), plan **Free**.
- [ ] *Add a site* → `papaparfait.fr` → laisser Cloudflare scanner.
- [ ] **Comparer l'import ligne par ligne avec le tableau ci-dessus.** Le scan
      rate souvent la clé DKIM et les SRV : ajoute à la main ce qui manque.
- [ ] Vérifier les 4 TXT `path=/` sur `_carddav(s)._tcp` et `_caldav(s)._tcp` —
      les plus souvent oubliés après les SRV.
- [ ] **Tous les nuages en gris** (option A). Cloudflare en met certains en
      orange par défaut : les repasser un par un.
- [ ] Relire la clé DKIM : début `p=MIIBIjANBgkqhkiG…`, fin `…DKT1SqzCmQIDAQAB;`.

### Basculer (registrar : Scaleway)

- [ ] Dans le dashboard Cloudflare, vérifier deux choses : le statut de la zone
      est **Pending nameserver update** (pas « Moved » ni « Deleted »), et les
      deux serveurs affichés sont bien ceux qu'on va saisir.
- [ ] Choisir un **matin de semaine**. Pas un vendredi soir, pas la veille d'un
      week-end : si quelque chose casse, il faut être là pour le voir.
- [ ] [console.scaleway.com](https://console.scaleway.com) → **Domains & DNS**
      → `papaparfait.fr` → onglet **Serveurs de noms** (Nameservers).
- [ ] Passer sur **serveurs de noms externes** (Use external nameservers) et
      saisir :
      `hadlee.ns.cloudflare.com` et `justin.ns.cloudflare.com`.
      Retirer `ns1.o2switch.net` et `ns2.o2switch.net`. Enregistrer.
- [ ] **Ne rien supprimer chez o2switch** : la zone d'origine reste le filet de
      sécurité tant que tout n'est pas vérifié.
- [ ] Attendre — la délégation se propage en une heure au plus (TTL AFNIC
      3600 s). Cloudflare passera la zone en **Active**.

### Vérifier, sérieusement

- [ ] `node scripts/dns-papaparfait.mjs hadlee.ns.cloudflare.com` → la zone
      Cloudflare elle-même, sans passer par un cache. **C'est le test le plus
      important** : il dit si les 25 enregistrements ont bien été recréés
      (9 A, 3 CNAME, 1 MX, 7 TXT, 5 SRV), chacun contrôlé sur son vrai type.
- [ ] `node scripts/dns-papaparfait.mjs` puis
      `node scripts/dns-papaparfait.mjs 1.1.1.1` → ce que voient les autres,
      une fois la propagation faite.
- [ ] Ouvrir `https://papaparfait.fr` : le site répond.
- [ ] **Envoyer un e-mail depuis une adresse externe (Gmail) vers ton adresse
      `@papaparfait.fr`** — et vérifier qu'il arrive. C'est le seul test qui
      compte vraiment.
- [ ] Envoyer un e-mail **depuis** ton adresse vers Gmail, puis dans Gmail :
      *Afficher l'original* → SPF `pass`, DKIM `pass`, DMARC `pass`.
- [ ] Ouvrir le webmail et vérifier la synchro agenda/contacts si tu l'utilises.

### En cas de problème

- [ ] Remettre `ns1.o2switch.net` et `ns2.o2switch.net` chez Scaleway. La zone
      d'origine est intacte chez o2switch : elle reprend la main en une heure au
      plus (TTL de délégation 3600 s). Aucune donnée perdue.
- [ ] Ne pas improviser de correction dans Cloudflare pendant que le mail est
      coupé : on revient d'abord à l'état qui marche, on corrige ensuite.

---

## Une fois que c'est fait

Préviens Claude Code, qui enchaîne :

1. `app.papaparfait.fr` posé sur le worker `papa-parfait-web`, avec redirection
   depuis l'adresse `workers.dev` ;
2. bascule du lien de partage dans l'app (`LIEN_APP`) ;
3. signal à Claude Cowork pour remplacer les CTA du site en une passe ;
4. vérification du domaine d'envoi (Resend) pour l'alerte du week-end — trois
   enregistrements de plus dans la zone, cette fois en deux clics.

---

*Zone relevée et vérifiée le 24 septembre 2026. Le vérificateur vit dans
`scripts/dns-papaparfait.mjs` : il interroge un résolveur public, jamais le cache
du système, et hurle si un enregistrement e-mail atterrit sur une IP Cloudflare.*
