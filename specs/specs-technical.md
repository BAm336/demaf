# Spécifications - Application d'exploitation Inbox/Outbox

## Architecture Technique

### 1 Stack Technique

#### Backend
- **Framework** : Quarkus (choix retenu pour expérimentation sur projet non critique)
- **Langage** : Java
- **API** : REST (exposition via OpenAPI)
- **Accès données** : JdbcTemplate ou équivalent Quarkus
- **Pool de connexions** : HikariCP ou Agroal (natif Quarkus)

#### Frontend
- **Framework** : Vue.js 3
- **Composants** : Vuetify
- **Communication** : Fetch API

#### Déploiement
- **Platform** : OpenShift
- **Containerisation** : Docker (image native Quarkus)
- **Configuration** : ConfigMap / Secrets Kubernetes

### 2 Schéma des Tables

Les tables inbox et outbox ont une structure homogène sur l'ensemble des ~20 bases (Oracle et PostgreSQL). Les noms de tables sont fixes et identiques partout.

#### Table Outbox

```sql
CREATE TABLE EVT_T_DOMAIN_EVENT_OUTBOX
(
    DEO_ID                 INTEGER           NOT NULL,
    DEO_IDENTIFIANT        VARCHAR2(36)      NOT NULL UNIQUE,
    DEO_TYPE_MESSAGE       VARCHAR2(100)     NOT NULL,
    DEO_PAYLOAD            CLOB              NOT NULL,
    DEO_DATE_INSERTION     TIMESTAMP         NOT NULL,
    DEO_DATE_PUBLICATION   TIMESTAMP,
    DEO_UTILISATEUR        VARCHAR2(100)     NOT NULL,
    DEO_STATUS             VARCHAR2(40)      NOT NULL,
    DEO_NB_TENTATIVE_ENVOI INTEGER DEFAULT 0 NOT NULL,
    CONSTRAINT EVT_PK_DEO PRIMARY KEY (DEO_ID)
);
```

| Colonne | Description |
|---------|-------------|
| `DEO_ID` | Id technique (PK, alimenté via séquence) |
| `DEO_IDENTIFIANT` | Identifiant UUID du message (UNIQUE) |
| `DEO_TYPE_MESSAGE` | Type fonctionnel du message |
| `DEO_PAYLOAD` | Payload du message (**non affiché** dans l'application) |
| `DEO_DATE_INSERTION` | Date d'insertion dans la table |
| `DEO_DATE_PUBLICATION` | Date de publication dans RabbitMQ (nullable) |
| `DEO_UTILISATEUR` | Utilisateur à l'origine du message |
| `DEO_STATUS` | Statut : `A_TRAITER`, `EN_TRAITEMENT`, `TRAITE`, `EN_ERREUR` |
| `DEO_NB_TENTATIVE_ENVOI` | Nombre de tentatives d'envoi automatique |

#### Table Inbox

```sql
CREATE TABLE EVT_T_DOMAIN_EVENT_INBOX
(
    DEI_TYPE_IDENTIFIANT VARCHAR2(36)  NOT NULL,
    DEI_TYPE_MESSAGE     VARCHAR2(100) NOT NULL,
    DEI_PAYLOAD          CLOB          NOT NULL,
    DEI_DATE_RECEPTION   TIMESTAMP     NOT NULL,
    DEI_UTILISATEUR      VARCHAR2(100) NOT NULL,
    DEI_STATUS           VARCHAR2(40)  NOT NULL,
    CONSTRAINT INBOX_PK PRIMARY KEY (DEI_TYPE_IDENTIFIANT)
);
```

| Colonne | Description |
|---------|-------------|
| `DEI_TYPE_IDENTIFIANT` | Identifiant UUID du message (PK) |
| `DEI_TYPE_MESSAGE` | Type fonctionnel du message |
| `DEI_PAYLOAD` | Payload du message (**non affiché** dans l'application) |
| `DEI_DATE_RECEPTION` | Date de réception du message |
| `DEI_UTILISATEUR` | Utilisateur à l'origine du message |
| `DEI_STATUS` | Statut : `A_TRAITER`, `EN_TRAITEMENT`, `TRAITE`, `EN_ERREUR` |

> **Note V1** : Aucune colonne `message_erreur` ni `rejeu_manuel` dans les tables actuelles. Ces colonnes seront ajoutées en phase ultérieure via ALTER TABLE.

#### Colonnes absentes en V1 et comportement attendu

| Donnée | Comportement V1 |
|--------|-----------------|
| Message d'erreur | Non affiché |
| Compteur de rejeux manuels | Affiché hardcodé à `0` |

### 3 Gestion des Datasources

#### Nombre de datasources
- Environ 20 datasources (Oracle et PostgreSQL)
- Configuration dynamique via fichier YAML ou ConfigMap


#### Pool de connexions
- **Taille minimale** : 1-2 connexions par datasource
- **Justification** : Lectures ponctuelles, pas de charge continue
- **Total** : 20-40 connexions max simultanées
- **Timeouts** : Agressifs (3-5s par requête)

#### Configuration
Format de configuration externalisée (les noms de tables étant fixes, seules les infos de connexion sont nécessaires) :

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

#### Credentials
- Stockage dans Secrets Kubernetes/OpenShift
- Éventuellement HashiCorp Vault pour rotation automatique
- Pas de credentials en clair dans le code ou configuration

### 4 Authentification

- **V1** : Aucune authentification — application accessible librement (déploiement sur réseau interne)
- Authentification (SSO/OIDC/Keycloak) et gestion des rôles : reportées en phase ultérieure

### 5 Architecture API REST

#### Endpoints principaux

**Liste des applications disponibles**
- `GET /api/applications`
- Retourne la liste des applications configurées
- Chaque entrée contient : `name`, `displayName`, `role` (`both` | `producer` | `consumer`), `connectionError` (booléen)

**Vue d'ensemble**
- `GET /api/inbox-outbox/summary`
- Interroge toutes les datasources en parallèle
- Retourne les compteurs par statut pour toutes les applications
- Chaque entrée contient : `application`, `role`, `inbox` (objet compteurs ou `null` si role=producer), `outbox` (objet compteurs ou `null` si role=consumer), `connectionError` (booléen si la datasource est inaccessible)

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
- `POST /api/inbox-outbox/applications/{appName}/messages/replay-by-filter` avec body `{ status?, types?: [...] }` (par filtre — rejoue **tous** les messages correspondants côté serveur, sans limite de pagination)

**Vue par type de message — synthèse agrégée**
- `GET /api/inbox-outbox/message-types/summary`
- Agrège les compteurs de toutes les datasources par type de message
- Exécuté en parallèle sur toutes les datasources (même stratégie que `/summary`)
- Retourne une liste triée par type :
  ```json
  [
    { "type": "ORDER_CREATED", "A_TRAITER": 17, "EN_TRAITEMENT": 5, "TRAITE": 150, "EN_ERREUR": 31 },
    { "type": "INVOICE_SENT",  "A_TRAITER": 4,  "EN_TRAITEMENT": 2, "TRAITE": 9,   "EN_ERREUR": 11 }
  ]
  ```
- Les datasources inaccessibles sont exclues de l'agrégat (les données partielles sont retournées avec un indicateur `partialData: true`)

**Vue par type de message — détail du flux**
- `GET /api/inbox-outbox/message-types/{type}/summary`
- Pour un type donné, retourne la répartition par application et par direction
- Retourne :
  ```json
  {
    "type": "ORDER_CREATED",
    "partialData": false,
    "producers": [
      { "application": "App-Commandes", "A_TRAITER": 6, "EN_TRAITEMENT": 4, "TRAITE": 51, "EN_ERREUR": 3 }
    ],
    "consumers": [
      { "application": "App-Facturation", "A_TRAITER": 14, "EN_TRAITEMENT": 6, "TRAITE": 12, "EN_ERREUR": 23 },
      { "application": "App-Stock",       "A_TRAITER": 3,  "EN_TRAITEMENT": 12, "TRAITE": 98, "EN_ERREUR": 2 },
      { "application": "App-CRM",         "A_TRAITER": 47, "EN_TRAITEMENT": 18, "TRAITE": 35, "EN_ERREUR": 6 }
    ]
  }
  ```

### 6 Stratégie de Requêtage

#### Vue d'ensemble (toutes les applications)
- Exécution parallèle via CompletableFuture ou mécanismes reactifs Quarkus
- Timeout global : 15-20s
- Timeout par datasource : 5s
- Gestion gracieuse des erreurs : si une base ne répond pas, renvoyer "N/A" pour cette app

#### Vue filtrée (une application)
- Requête SQL simple :
  ```sql
  SELECT DEO_STATUS, COUNT(*) FROM EVT_T_DOMAIN_EVENT_OUTBOX GROUP BY DEO_STATUS;
  SELECT DEI_STATUS, COUNT(*) FROM EVT_T_DOMAIN_EVENT_INBOX  GROUP BY DEI_STATUS;
  ```
- Temps de réponse : <1s

#### Liste détaillée
- Requête avec filtres et pagination
- Index requis sur colonnes : status, timestamp

### 7 Gestion des Erreurs

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
