# Spécifications - Application d'exploitation Inbox/Outbox

## Périmètre Fonctionnel

### 1 Visualisation des Données

#### Dashboard — deux onglets

Le dashboard principal expose deux axes de lecture complémentaires, accessibles via deux onglets :

| Onglet | Description |
|--------|-------------|
| **Par application** | Vue agrégée par application (comportement actuel) |
| **Par type de message** | Vue agrégée par type de message, toutes applications confondues |

L'auto-refresh est partagé entre les deux onglets.

---

#### Onglet "Par application"

##### Vue d'ensemble (Niveau 1)
- Affichage d'un tableau récapitulatif de toutes les applications
- Pour chaque application : nombre de messages par statut, pour inbox et outbox
  - Cellule affichée `—` si la direction n'est pas applicable (ex. app producteur → pas d'inbox)
  - Cellule affichée `N/A` si la datasource est inaccessible
- Colonnes affichées paramétrables par l'utilisateur (toggle) ; **par défaut seules les colonnes "Traité" et "En erreur" sont visibles** (les colonnes "À traiter" et "En traitement" sont masquées par défaut)
- **Clic sur une ligne** → navigation vers la liste des messages de l'application avec le filtre statut `EN_ERREUR` pré-sélectionné par défaut
- **Clic sur un compteur EN_ERREUR** → même navigation (filtre `EN_ERREUR`)
- Possibilité de filtrer par application spécifique via dropdown/select
- Rafraîchissement manuel ou automatique (polling toutes les 5-10s si la page est active)

##### Vue détaillée par application (Niveau 2)
- Sélection d'une application dans le filtre
- Affichage des compteurs détaillés par statut pour cette application uniquement
- Temps de réponse quasi-instantané (1 seule datasource interrogée)

---

#### Onglet "Par type de message"

##### Tableau de synthèse par type (Niveau 1 bis)
- Une ligne par type de message connu du système (toutes applications confondues)
- Colonnes : Type de message | A_TRAITER | EN_TRAITEMENT | TRAITE | EN_ERREUR — **totaux agrégés** sur l'ensemble des applications
- Colonnes paramétrables par toggle (mêmes règles que la vue par application : "Traité" et "En erreur" visibles par défaut)
- Rafraîchissement automatique partagé avec l'onglet "Par application"
- **Clic sur une ligne** → navigation vers la page de détail du type `/message-types/{type}`

##### Page de détail d'un type de message (Niveau 2 bis)
- URL : `/message-types/{type}` — page dédiée avec breadcrumb (Accueil > Types > ORDER_CREATED)
- Affiche le **flux complet** du type de message dans le SI, en deux sections :
  - **Producteurs (OUTBOX)** : liste des applications ayant ce type en outbox, avec leurs compteurs par statut
  - **Consommateurs (INBOX)** : liste des applications ayant ce type en inbox, avec leurs compteurs par statut
- Chaque ligne d'application est cliquable → navigation vers la liste des messages filtrée par application et par type
- Indicateur visuel de santé par application (neutre / warning si EN_ERREUR > 0 / critique si EN_ERREUR dominant)
- Auto-refresh actif sur cette page
- **V1 : vue lecture seule** — le rejeu depuis cette vue est reporté en phase ultérieure

#### Liste des messages (Niveau 3)
- Consultation de la liste des messages d'une application
- Filtrage par statut (focus sur les messages EN_ERREUR)
- Affichage des **métadonnées uniquement** :
  - Identifiant (`DEO_IDENTIFIANT` / `DEI_TYPE_IDENTIFIANT`)
  - User (`DEO_UTILISATEUR` / `DEI_UTILISATEUR`)
  - Timestamp (`DEO_DATE_INSERTION` / `DEI_DATE_RECEPTION`)
  - Type de message (`DEO_TYPE_MESSAGE` / `DEI_TYPE_MESSAGE`)
  - Statut (`DEO_STATUS` / `DEI_STATUS`)
  - Compteur de rejeux manuels : **hardcodé à 0 en V1** (colonne absente des tables)
- Pagination (50-100 lignes par page)
- Tri par timestamp (plus récents en premier)

#### Détail d'un message (Niveau 4)
- Ouverture modal/drawer au clic sur une ligne
- Affichage de toutes les métadonnées du message
- **Message d'erreur non affiché en V1** (colonne absente des tables — prévu en phase ultérieure)
- **Le payload n'est pas affiché** (seulement les métadonnées)

### 2 Fonctionnalités d'Administration

#### Rejeu de messages
- **Rejeu unitaire** : Bouton sur le détail d'un message
- **Rejeu par lot** : Sélection multiple via checkboxes dans le tableau (limité à la page affichée)
- **Rejeu par filtre** : Bouton "Rejouer tous les résultats (N)" visible dès qu'au moins un filtre est actif (statut et/ou type) et que le total est > 0 — rejoue l'intégralité des messages correspondants, indépendamment de la pagination

> Le rejeu par filtre est particulièrement utile lorsque le volume de messages en erreur dépasse la taille d'une page (ex. 345 messages `INVOICE_RECEIVED` en erreur). Le backend applique les mêmes critères de filtre qu'un `UPDATE ... WHERE`, sans nécessiter de connaître les IDs individuels.

#### Mécanisme de rejeu
Le rejeu consiste simplement à :
1. Effectuer un UPDATE SQL : `SET DEO_STATUS = 'A_TRAITER'` (outbox) / `SET DEI_STATUS = 'A_TRAITER'` (inbox)
2. Le scheduler applicatif existant retraite automatiquement ces messages

**Pas de publication directe dans RabbitMQ** : on s'appuie sur les mécanismes existants.

> **V1** : Pas de colonne `rejeu_manuel` dans les tables — le compteur est affiché hardcodé à `0`.
> L'incrémentation d'un compteur de rejeux est reportée en phase ultérieure (nécessite un ALTER TABLE).

#### Gestion des droits
- **V1** : Aucune authentification — application accessible librement (réseau interne)
- Gestion des rôles (visualisation vs administration) : reportée en phase ultérieure

#### Traçabilité
- **V1** : Logs applicatifs uniquement (qui a déclenché le rejeu et sur quel message)
- Compteur de rejeux en base : reporté en phase ultérieure

### 3 Rafraîchissement des données

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
