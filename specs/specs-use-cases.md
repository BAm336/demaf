# Spécifications - Application de Monitoring Inbox/Outbox

## 1. Contexte et Objectifs

### Contexte
L'entreprise dispose d'un Système d'Information distribué avec de nombreuses applications communiquant via :
- API REST (contrats OpenAPI)
- Messages asynchrones (RabbitMQ)

Chaque application utilise le pattern inbox/outbox pour garantir la fiabilité des échanges asynchrones :
- **Inbox** : Messages entrants à traiter
- **Outbox** : Messages sortants à envoyer

Ces tables techniques sont réparties sur environ 20 bases de données (Oracle et PostgreSQL).

### Objectifs
Développer une application de monitoring permettant de **visualiser à la demande** l'état des messages dans les tables inbox/outbox, notamment :
- Nombre de messages par statut (A_TRAITER, EN_TRAITEMENT, TRAITE, EN_ERREUR, etc.)
- Consultation détaillée des messages en erreur
- Rejeu manuel des messages (unitaire ou par lot)

**Note importante** : Il ne s'agit PAS d'un monitoring temps réel continu mais d'un outil de consultation et d'administration à la demande.

---

## 2. Périmètre Fonctionnel

### 2.1 Visualisation des Données

#### Vue d'ensemble (Niveau 1)
- Affichage d'un tableau récapitulatif de toutes les applications
- Pour chaque application : nombre de messages par statut, pour inbox et outbox
  - Cellule affichée `—` si la direction n'est pas applicable (ex. app producteur → pas d'inbox)
  - Cellule affichée `N/A` si la datasource est inaccessible
- Colonnes affichées paramétrables par l'utilisateur (toggle) ; **par défaut seules les colonnes "Traité" et "En erreur" sont visibles**
- **Clic sur une ligne** → navigation vers la liste des messages de l'application avec le filtre statut `EN_ERREUR` pré-sélectionné par défaut
- **Clic sur un compteur EN_ERREUR** → même navigation (filtre `EN_ERREUR`)
- Possibilité de filtrer par application spécifique via dropdown/select
- Rafraîchissement manuel ou automatique (polling toutes les 5-10s si la page est active)

#### Vue détaillée par application (Niveau 2)
- Sélection d'une application dans le filtre
- Affichage des compteurs détaillés par statut pour cette application uniquement
- Temps de réponse quasi-instantané (1 seule datasource interrogée)

#### Liste des messages (Niveau 3)
- Consultation de la liste des messages d'une application
- Filtrage par statut (focus sur les messages EN_ERREUR)
- Affichage des **métadonnées uniquement** :
  - Identifiant (`DEO_IDENTIFIANT` / `DEI_TYPE_IDENTIFIANT`)
  - User (`DEO_UTILISATEUR` / `DEI_UTILISATEUR`)
  - Timestamp (`DEO_DATE_INSERTION` / `DEI_DATE_RECEPTION`)
  - Type de message (`DEO_TYPE_MESSAGE` / `DEI_TYPE_MESSAGE`)
  - Statut (`DEO_STATUS` / `DEI_STATUS`)
  - Compteur de rejeux manuels (`nbRejeux`)
- Pagination (50-100 lignes par page)
- Tri par timestamp (plus récents en premier)

#### Détail d'un message (Niveau 4)
- Ouverture modal/drawer au clic sur une ligne
- Affichage de toutes les métadonnées du message
- **Message d'erreur non affiché en V1** (colonne absente — prévu en phase ultérieure)
- **Le payload n'est pas affiché** (seulement les métadonnées)

### 2.2 Fonctionnalités d'Administration

#### Rejeu de messages
- **Rejeu unitaire** : Bouton sur le détail d'un message
- **Rejeu par lot** : Sélection multiple via checkboxes dans le tableau (limité à la page affichée)
- **Rejeu par filtre** : Bouton "Rejouer tous les résultats (N)" visible dès qu'au moins un filtre est actif (statut et/ou type) et que le total est > 0 — rejoue l'intégralité des messages correspondants, indépendamment de la pagination

> Le rejeu par filtre est particulièrement utile lorsque le volume de messages en erreur dépasse la taille d'une page. Le backend applique les critères comme un `UPDATE ... WHERE`, sans nécessiter de connaître les IDs individuels.

#### Mécanisme de rejeu
Le rejeu consiste simplement à :
1. Effectuer un UPDATE SQL : `SET DEO_STATUS = 'A_TRAITER'` (outbox) / `SET DEI_STATUS = 'A_TRAITER'` (inbox)
2. Le scheduler applicatif existant retraite automatiquement ces messages

**Pas de publication directe dans RabbitMQ** : on s'appuie sur les mécanismes existants.

> Le compteur de rejeux est géré par le sidecar.

#### Gestion des droits
- **V1** : Aucune authentification — application accessible librement (réseau interne)
- Gestion des rôles (visualisation vs administration) : reportée en phase ultérieure

#### Traçabilité
- **V1** : Logs applicatifs uniquement (qui a déclenché le rejeu et sur quel message)
- Compteur de rejeux en base : reporté en phase ultérieure

### 2.3 Rafraîchissement des données

#### Approche retenue (phase 1)
- **Pas de polling continu** quand personne ne consulte
- Rafraîchissement automatique (polling 5-10s) uniquement si :
  - La page est ouverte dans le navigateur
  - L'utilisateur n'a pas mis en pause le refresh
- Indicateur visuel : badge "Auto-refresh actif" avec possibilité de pause

#### Évolution possible (phase 2)
- Migration vers WebSocket/STOMP pour notifications temps réel
- Publication des changements de statut via `/topic/inbox/{application}`
- Mise à jour automatique du dashboard sans polling

---

## 3. Architecture Technique

### 3.1 Stack Technique

#### Backend
- **Framework** : Spring Boot
- **Langage** : Java
- **API** : REST (exposition via OpenAPI)
- **Accès données** : Spring data
- **Pool de connexions** : HikariCP

#### Frontend
- **Framework** : Vue.js 3
- **Composants** : Vuetify
- **Communication** : Fetch API

#### Déploiement
- **Platform** : OpenShift
- **Containerisation** : Docker
- **Configuration** : ConfigMap / Secrets Kubernetes

### 3.2 Gestion des Datasources

#### Nombre de datasources
- Environ 20 datasources (Oracle et PostgreSQL)
- Configuration dynamique via fichier YAML ou ConfigMap

#### Configuration
Les noms de tables étant fixes (`EVT_T_DOMAIN_EVENT_INBOX` / `EVT_T_DOMAIN_EVENT_OUTBOX`), seules les informations de connexion sont nécessaires :

```yaml
demaf:
  datasources:
    - name: "App1"
      jdbc-url: "jdbc:oracle:thin:@host:1521:sid"
      username: "${APP1_DB_USER}"
      password: "${APP1_DB_PASSWORD}"
      role: "both"        # both | producer | consumer
    - name: "App2"
      jdbc-url: "jdbc:postgresql://host:5432/db"
      username: "${APP2_DB_USER}"
      password: "${APP2_DB_PASSWORD}"
      role: "consumer"
```

Le champ `role` indique quelles tables sont présentes sur cette datasource :
- `both` (défaut) : tables inbox **et** outbox présentes
- `producer` : table outbox uniquement (pas d'inbox)
- `consumer` : table inbox uniquement (pas d'outbox)

#### Pool de connexions
- **Taille minimale** : 1-2 connexions par datasource
- **Justification** : Lectures ponctuelles, pas de charge continue
- **Total** : 20-40 connexions max simultanées
- **Timeouts** : Agressifs (3-5s par requête)

#### Credentials
- Stockage dans Secrets Kubernetes/OpenShift
- Éventuellement HashiCorp Vault pour rotation automatique
- Pas de credentials en clair dans le code ou configuration

### 3.3 Architecture API REST

#### Endpoints principaux

**Liste des applications disponibles**
- `GET /api/applications`
- Retourne la liste des applications configurées
- Chaque entrée contient : `name`, `displayName`, `role` (`both` | `producer` | `consumer`), `connectionError` (booléen)

**Vue d'ensemble**
- `GET /api/inbox-outbox/summary`
- Interroge toutes les datasources en parallèle
- Retourne les compteurs par statut pour toutes les applications
- Chaque entrée contient : `application`, `role`, `inbox` (objet compteurs ou `null` si role=producer), `outbox` (objet compteurs ou `null` si role=consumer), `connectionError` (booléen si datasource inaccessible)

**Vue filtrée par application**
- `GET /api/inbox-outbox/summary?application=XYZ`
- Interroge uniquement la datasource de l'application XYZ
- Temps de réponse rapide (<1s)
- Même structure de réponse que la vue d'ensemble

**Liste des messages**
- `GET /api/inbox-outbox/applications/{appName}/messages?status={status}`
- Paramètres optionnels : status, page, size
- Retourne les métadonnées paginées

**Détail d'un message**
- `GET /api/inbox-outbox/applications/{appName}/messages/{messageId}`
- Retourne toutes les métadonnées du message

**Rejeu de messages**
- `POST /api/inbox-outbox/applications/{appName}/messages/{messageId}/replay` (unitaire)
- `POST /api/inbox-outbox/applications/{appName}/messages/replay` avec body `{ ids: [...] }` (par lot, sélection manuelle)
- `POST /api/inbox-outbox/applications/{appName}/messages/replay-by-filter` avec body `{ status?, types?: [...] }` (par filtre — rejoue tous les messages correspondants côté serveur, sans limite de pagination)

### 3.4 Stratégie de Requêtage

#### Vue d'ensemble (toutes les applications)
- Exécution parallèle via CompletableFuture ou mécanismes reactifs
- Timeout global : 15-20s
- Timeout par datasource : 5s
- Gestion gracieuse des erreurs : si une base ne répond pas, renvoyer "N/A" pour cette app

#### Vue filtrée (une application)
- Requête SQL simple : `SELECT status, COUNT(*) FROM inbox_table GROUP BY status`
- Temps de réponse : <1s

#### Liste détaillée
- Requête avec filtres et pagination
- Index requis sur colonnes : status, timestamp

### 3.5 Gestion des Erreurs

#### Datasource inaccessible
- Ne pas bloquer toute la requête
- Retourner une erreur pour cette datasource spécifique
- Afficher "Erreur" ou "N/A" dans le frontend

#### Timeout
- Timeout par datasource configuré à 5s
- Timeout global pour la requête complète : 15-20s

#### Erreurs de rejeu
- Retourner un code HTTP approprié (4xx/5xx)
- Message d'erreur explicite côté frontend

---

## 4. Cas d'Usage Détaillés

### CU1 : Consulter l'état global des inbox/outbox

**Acteur** : Opérateur, Administrateur

**Préconditions** : Aucune (pas d'authentification en V1)

**Scénario nominal** :
1. L'utilisateur accède à l'application
2. Le système affiche automatiquement la vue d'ensemble
3. Le système interroge les 20 datasources en parallèle (2-3s de chargement)
4. Affichage d'un tableau avec pour chaque application :
   - Nombre de messages A_TRAITER
   - Nombre de messages EN_TRAITEMENT
   - Nombre de messages TRAITE
   - Nombre de messages EN_ERREUR
5. Le tableau se rafraîchit automatiquement toutes les 10s

**Scénario alternatif** :
- Une ou plusieurs datasources sont inaccessibles → afficher "Erreur" pour ces applications

### CU2 : Consulter une application spécifique

**Acteur** : Opérateur, Administrateur

**Préconditions** : Aucune (pas d'authentification en V1), vue d'ensemble affichée

**Scénario nominal** :
1. L'utilisateur sélectionne "App XYZ" dans le dropdown
2. Le système interroge uniquement la datasource XYZ (<1s)
3. Affichage des compteurs détaillés pour cette application
4. Le rafraîchissement auto continue sur cette application uniquement

### CU3 : Consulter les messages en erreur

**Acteur** : Opérateur, Administrateur

**Préconditions** : Vue d'ensemble affichée

**Scénario nominal (clic sur une ligne)** :
1. L'utilisateur clique n'importe où sur la ligne d'une application
2. Le système navigue vers la liste des messages de cette application avec le filtre `EN_ERREUR` pré-sélectionné
3. Pour chaque message : identifiant, user, timestamp, type, statut, nb rejeux
4. L'utilisateur peut modifier les filtres, paginer, trier

**Scénario alternatif (clic sur le compteur EN_ERREUR)** :
- Comportement identique au clic sur la ligne — le compteur est un raccourci visuel vers le même résultat

### CU4 : Consulter le détail d'un message

**Acteur** : Opérateur, Administrateur

**Préconditions** : Liste de messages affichée

**Scénario nominal** :
1. L'utilisateur clique sur une ligne du tableau
2. Ouverture d'un modal/drawer
3. Affichage de toutes les métadonnées du message
4. **V1** : Pas de message d'erreur détaillé (colonne absente en base)

### CU5 : Rejouer un message en erreur

**Acteur** : Administrateur

**Préconditions** : Utilisateur avec droits admin, message en erreur sélectionné

**Scénario nominal** :
1. L'utilisateur clique sur "Rejouer" dans le détail du message
2. Confirmation demandée
3. Le système exécute : `UPDATE ... SET DEO_STATUS='A_TRAITER'` (outbox) / `SET DEI_STATUS='A_TRAITER'` (inbox)
4. Message de succès affiché
5. Le tableau se rafraîchit et le message disparaît de la liste EN_ERREUR
6. Le scheduler applicatif retraite automatiquement le message

**Scénario alternatif** :
- Le message a déjà été rejoué entre-temps → erreur de concurrence

### CU6 : Rejouer plusieurs messages en lot (sélection manuelle)

**Acteur** : Administrateur

**Préconditions** : Utilisateur avec droits admin, liste de messages affichée

**Scénario nominal** :
1. L'utilisateur sélectionne N messages via checkboxes (sur la page courante)
2. L'utilisateur clique sur "Rejouer la sélection (N)"
3. Confirmation avec nombre de messages
4. Le système effectue les UPDATE en batch via `POST .../messages/replay` avec la liste d'IDs
5. Retour immédiat (200 OK)
6. Le tableau se rafraîchit

**Limite** : La sélection est restreinte aux messages de la page affichée. Pour rejouer un volume supérieur à la taille de page, utiliser CU7.

### CU7 : Rejouer tous les messages correspondant aux filtres actifs

**Acteur** : Administrateur

**Préconditions** : Utilisateur avec droits admin, au moins un filtre actif (statut et/ou type de message), total > 0

**Scénario nominal** :
1. L'utilisateur filtre par type (ex. `INVOICE_RECEIVED`) et/ou statut (ex. `EN_ERREUR`)
2. Le système affiche le total correspondant (ex. 345 messages)
3. Le bouton "Rejouer tous les résultats (345)" apparaît
4. L'utilisateur clique sur ce bouton
5. Un dialog de confirmation récapitule les filtres appliqués et le volume concerné, et avertit que l'action dépasse la page affichée
6. L'utilisateur confirme
7. Le système appelle `POST .../messages/replay-by-filter` avec `{ status, types }` — le backend applique les filtres et effectue les UPDATE sans limite de pagination
8. Le tableau se rafraîchit depuis la page 1

**Scénario alternatif** :
- Le volume est très élevé (milliers de messages) → le backend traite en une seule transaction ou en batch interne, le frontend attend le retour 200 OK

### CU8 : Consulter la vue globale par type de message

**Acteur** : Opérateur, Administrateur

**Préconditions** : Aucune (pas d'authentification en V1)

**Scénario nominal** :
1. L'utilisateur accède au dashboard et clique sur l'onglet "Par type de message"
2. Le système agrège les données de toutes les datasources par type de message
3. Affichage d'un tableau : une ligne par type de message, colonnes agrégées (A_TRAITER, EN_TRAITEMENT, TRAITE, EN_ERREUR) toutes applications confondues
4. L'utilisateur identifie qu'`ORDER_CREATED` totalise 31 messages `EN_ERREUR` dans le SI

**Scénario alternatif** :
- Une ou plusieurs datasources sont inaccessibles → les compteurs de cette datasource sont exclus de l'agrégat ; un indicateur signale les données partielles

### CU9 : Consulter le flux d'un type de message

**Acteur** : Opérateur, Administrateur

**Préconditions** : Onglet "Par type de message" affiché (CU8)

**Scénario nominal** :
1. L'utilisateur clique sur la ligne `ORDER_CREATED`
2. Navigation vers la page `/message-types/ORDER_CREATED`
3. Le système affiche le flux complet :
   - Section **Producteurs (OUTBOX)** : App-Commandes avec ses compteurs (51 traités, 3 erreurs…)
   - Section **Consommateurs (INBOX)** : App-Facturation (23 erreurs), App-Stock (2 erreurs), App-CRM (47 à traiter)
4. L'utilisateur identifie que App-Facturation est le maillon dégradé
5. Il clique sur la ligne App-Facturation → navigation vers la liste des messages filtrée (`app=App-Facturation`, `type=ORDER_CREATED`)

**Scénario alternatif** :
- Le type de message n'existe que dans une direction (ex. uniquement en OUTBOX) → la section correspondante est absente ou affichée vide avec un libellé explicite

---

## 5. Problématiques et Solutions

### 5.1 Performance

**Problématique** : Interroger 20 bases peut être long

**Solutions** :
- Parallélisation systématique des requêtes
- Timeouts agressifs par datasource
- Mode filtré pour interroger 1 seule base quand suffisant
- Requêtes SQL optimisées (COUNT avec index)

### 5.2 Fiabilité

**Problématique** : Une base inaccessible ne doit pas bloquer tout le système

**Solutions** :
- Gestion d'erreur granulaire par datasource
- Affichage partiel des résultats disponibles
- Healthchecks désactivés au démarrage (lazy loading)

### 5.3 Sécurité

**Problématique** : 20 couples user/password à gérer

**Solutions** :
- Secrets Kubernetes/OpenShift
- Éventuellement HashiCorp Vault
- Pas de credentials dans le code ou logs

### 5.4 Expérience Utilisateur

**Problématique** : Attente lors du chargement des 20 datasources

**Solutions** :
- Loader avec indicateur de progression
- Mode filtré pour accès rapide à une app
- Rafraîchissement auto intelligent (pause possible)
- Évolution possible : WebSocket pour temps réel

### 5.5 Concurrence sur les rejeux

**Problématique** : Deux utilisateurs rejouent le même message

**Solutions** :
- Vérification du statut avant UPDATE
- Gestion optimiste des conflits
- Message d'erreur explicite si déjà traité

---

## 6. Choix Technologiques et Justifications

### 6.1 Polling vs WebSocket (Phase 1)

**Choix retenu** : Polling avec auto-refresh

**Justifications** :
- Implémentation immédiate plus simple
- Suffisant pour les besoins actuels
- Migration vers WebSocket possible sans refonte majeure
- Charge serveur acceptable (refresh ciblé)

**Évolution prévue** : WebSocket en phase 2 si nécessaire

### 6.2 Affichage Metadata vs Payload

**Choix retenu** : Métadonnées uniquement

**Justifications** :
- Métadonnées suffisantes pour diagnostiquer 90% des erreurs
- Évite problèmes de volumétrie et performance
- Interface plus claire et utilisable
- Payload consultable ultérieurement si vraiment nécessaire

---

## 7. Points d'Attention et Risques

### 7.1 Risques Techniques

| Risque | Probabilité | Impact | Mitigation |
|--------|-------------|--------|------------|
| Datasource inaccessible bloque tout | Moyenne | Élevé | Timeouts + gestion d'erreur granulaire |
| Temps de réponse > 30s | Faible | Moyen | Parallélisation + timeouts agressifs |
| Épuisement pools de connexions | Faible | Moyen | Pools minimaux (1-2 connexions) |
| Tables inbox/outbox non indexées | Moyenne | Élevé | Vérifier indexes avant déploiement |

### 7.2 Risques Fonctionnels

| Risque | Probabilité | Impact | Mitigation |
|--------|-------------|--------|------------|
| Rejeu multiple du même message | Moyenne | Moyen | Vérification statut + compteur rejeux |
| Absence de droits d'administration | Faible | Élevé | Implémenter gestion des rôles en phase 2 |
| Volumétrie excessive de messages | Moyenne | Moyen | Pagination + filtres + archivage des anciennes données |

### 7.3 Dépendances

- Accès en lecture sur les 20 bases de données (credentials à obtenir)
- Structure des tables inbox/outbox validée et homogène sur toutes les bases
- Coordination avec les équipes propriétaires des schedulers
- Infrastructure OpenShift prête (namespace, ressources)

---

## 8. Plan de Déploiement et Phases

### Phase 1 : MVP (2-3 sprints)
- Consultation vue d'ensemble par application (20 datasources)
- Consultation filtrée par application
- Liste des messages avec métadonnées
- Détail d'un message
- Rejeu unitaire
- Rafraîchissement automatique (polling)

### Phase 2 : Administration + Vue par type (2-3 sprints)
- Rejeu par lot (sélection multiple, CU6)
- Rejeu par filtre — tous les messages correspondants en une action (CU7)
- Vue globale par type de message — tableau de synthèse agrégée (CU8)
- Vue de flux par type de message — page de détail avec producteurs / consommateurs (CU9)
- Gestion des droits (visualisation vs administration)
- Traçabilité des rejeux

### Phase 3 : Optimisations (1 sprint)
- Migration vers WebSocket pour temps réel
- Cache léger (Redis) si nécessaire
- Métriques et monitoring de l'application elle-même

### Phase 4 : Évolutions (optionnel)
- Rejeu depuis la vue par type de message (ex. rejouer tous les ORDER_CREATED EN_ERREUR toutes apps)
- Affichage du payload sur demande
- Export CSV des messages
- Statistiques et graphiques (évolution dans le temps)
- Archivage automatique des anciens messages

---

## 9. Indicateurs de Succès

- Temps de réponse vue d'ensemble < 5s dans 95% des cas
- Temps de réponse vue filtrée < 1s dans 99% des cas
- Disponibilité > 99% (hors indisponibilité des datasources sources)
- Aucun impact sur les performances des applications métier
- Adoption par les équipes d'exploitation (> 5 utilisateurs réguliers)
- Réduction du temps de diagnostic des erreurs de 50%

---

## 10. Documentation et Formation

### Documentation à produire
- Guide d'utilisation pour opérateurs
- Guide d'administration (rejeux)
- Documentation technique (architecture, APIs)
- Runbook pour l'équipe de production

### Formation
- Session de présentation pour les équipes d'exploitation
- Tutoriel vidéo pour les cas d'usage courants
- Documentation des bonnes pratiques de rejeu
