# Spécifications - Application d'exploitation Inbox/Outbox

## Architecture Technique

### 1 Stack Technique

#### Backend DEMAF
- **Framework** : Spring Boot
- **Langage** : Java
- **API** : REST (exposition via OpenAPI)
- **Client HTTP** : Spring WebClient (appels vers les composants techniques)

#### Composant technique (sidecar)
- Un composant par application métier, déployé en sidecar
- Accès direct à la base de données de l'application (JDBC)
- Expose une API REST normalisée (contrat défini dans la section 3)
- **Accès données** : Spring Data / Hibernate
- **Pool de connexions** : HikariCP

#### Frontend
- **Framework** : Vue.js 3
- **Composants** : Vuetify
- **Communication** : Fetch API

#### Déploiement
- **Platform** : OpenShift
- **Containerisation** : Docker
- **Configuration** : ConfigMap / Secrets Kubernetes

---

### 2 Schéma des Tables

Les tables inbox et outbox ont une structure homogène sur l'ensemble des ~20 bases (Oracle et PostgreSQL). Les noms de tables sont fixes et identiques partout. Ce schéma est la responsabilité des composants techniques (sidecars) — le backend DEMAF n'a pas d'accès direct aux bases.

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

> **Note V0** : Aucune colonne `message_erreur` dans les tables actuelles. Elle sera ajoutée en phase ultérieure via ALTER TABLE.

#### Colonnes absentes en V0 et comportement attendu

| Donnée | Comportement V0 |
|--------|-----------------|
| Message d'erreur | Non affiché |

---

### 3 Contrat API des composants techniques (sidecar)

Chaque composant technique expose une API REST normalisée. Le backend DEMAF est le seul consommateur de ces APIs — le frontend ne les appelle jamais directement.

#### Configuration côté sidecar

```yaml
# application.yml du sidecar
demaf:
  sidecar:
    role: "both"   # both | producer | consumer
  datasource:
    jdbc-url: "jdbc:oracle:thin:@host:1521:sid"
    username: "${DB_USER}"
    password: "${DB_PASSWORD}"
```

Le champ `role` indique quelles tables sont présentes :
- `both` (défaut) : tables inbox **et** outbox présentes
- `producer` : table outbox uniquement
- `consumer` : table inbox uniquement

#### Endpoints exposés par le sidecar

**Synthèse des compteurs**
- `GET /inbox-outbox/summary`
- Retourne les compteurs par statut pour inbox et/ou outbox selon le `role`
- Réponse :
  ```json
  {
    "role": "both",
    "inbox":  { "A_TRAITER": 3, "EN_TRAITEMENT": 1, "TRAITE": 120, "EN_ERREUR": 5 },
    "outbox": { "A_TRAITER": 0, "EN_TRAITEMENT": 0, "TRAITE": 98,  "EN_ERREUR": 2 }
  }
  ```
- `inbox` est `null` si `role=producer`, `outbox` est `null` si `role=consumer`

**Types de messages disponibles**
- `GET /inbox-outbox/message-types`
- Retourne les types de messages distincts présents dans les tables, avec leur direction
- Réponse :
  ```json
  {
    "role": "both",
    "types": ["ORDER_CREATED", "INVOICE_SENT", "STOCK_UPDATED"]
  }
  ```

**Liste des messages**
- `GET /inbox-outbox/messages`
- Paramètres : `direction` (`inbox`|`outbox`), `statuses` (multi-valeur), `types` (multi-valeur), `page`, `pageSize`
- Retourne les métadonnées paginées (pas le payload) :
  ```json
  {
    "total": 345,
    "page": 1,
    "pageSize": 50,
    "items": [
      {
        "id": "uuid",
        "direction": "inbox",
        "type": "ORDER_CREATED",
        "user": "jdupont",
        "timestamp": "2025-03-01T10:23:00Z",
        "status": "EN_ERREUR",
        "replayCount": 0
      }
    ]
  }
  ```

**Détail d'un message**
- `GET /inbox-outbox/messages/{id}`
- Retourne toutes les métadonnées (pas le payload)

**Rejeu unitaire**
- `POST /inbox-outbox/messages/{id}/replay`
- Effectue `UPDATE ... SET status = 'A_TRAITER' WHERE id = ?`

**Rejeu par lot**
- `POST /inbox-outbox/messages/replay`
- Body : `{ "ids": ["uuid1", "uuid2"] }`

**Rejeu par filtre**
- `POST /inbox-outbox/messages/replay-by-filter`
- Body : `{ "direction": "inbox", "statuses": ["EN_ERREUR"], "types": ["ORDER_CREATED"] }`
- Effectue un `UPDATE ... WHERE` côté sidecar sans limite de pagination

---

### 4 Gestion des composants techniques (V0 — liste statique)

#### Configuration DEMAF

Le backend DEMAF dispose d'une liste statique des composants techniques, injectée via ConfigMap :

```yaml
demaf:
  components:
    - name: "App1"
      url: "http://app1-sidecar/inbox-outbox"
      role: "both"
    - name: "App2"
      url: "http://app2-sidecar/inbox-outbox"
      role: "consumer"
```

Aucun credential n'est nécessaire côté DEMAF — la sécurité repose sur les politiques réseau OpenShift (les sidecars ne sont accessibles que depuis le namespace DEMAF).

#### Évolution — Enregistrement dynamique (V1)

> **Réservé pour une phase ultérieure.**
>
> En V1, les sidecars s'enregistreront dynamiquement auprès du backend DEMAF au démarrage via un endpoint dédié (`POST /api/registry/register`), avec un mécanisme de heartbeat périodique et TTL. Cela permettra d'ajouter ou retirer des applications sans redéployer DEMAF. La liste statique sera conservée comme fallback de bootstrap.

---

### 5 Authentification

- **V0** : Aucune authentification — application accessible sur réseau interne, sidecars isolés par politique réseau
- Authentification DEMAF (SSO/OIDC/Keycloak) et sécurisation des appels sidecar : reportées en phase ultérieure

---

### 6 Architecture API REST (DEMAF → Frontend)

Le backend DEMAF agrège les appels aux sidecars et expose une API unifiée au frontend.

#### Endpoints principaux

**Liste des applications disponibles**
- `GET /api/applications`
- Retourne la liste des composants configurés
- Chaque entrée : `name`, `role` (`both` | `producer` | `consumer`), `connectionError` (booléen)

**Vue d'ensemble**
- `GET /api/inbox-outbox/summary`
- Interroge tous les sidecars en parallèle
- Chaque entrée : `application`, `role`, `inbox` (compteurs ou `null`), `outbox` (compteurs ou `null`), `connectionError`

**Vue filtrée par application**
- `GET /api/inbox-outbox/summary?application=XYZ`
- Interroge uniquement le sidecar de l'application XYZ
- Temps de réponse rapide (<1s)

**Liste des messages**
- `GET /api/inbox-outbox/applications/{appName}/messages`
- Paramètres : `direction`, `statuses`, `types`, `page`, `pageSize`
- Proxie vers `GET /inbox-outbox/messages` du sidecar correspondant

**Détail d'un message**
- `GET /api/inbox-outbox/applications/{appName}/messages/{messageId}`

**Rejeu de messages**
- `POST /api/inbox-outbox/applications/{appName}/messages/{messageId}/replay`
- `POST /api/inbox-outbox/applications/{appName}/messages/replay` — body `{ ids: [...] }`
- `POST /api/inbox-outbox/applications/{appName}/messages/replay-by-filter` — body `{ direction?, statuses?, types? }`

**Vue par type de message — synthèse agrégée**
- `GET /api/inbox-outbox/message-types/summary`
- Agrège les compteurs de tous les sidecars par type de message
- Indicateur `partialData: true` si certains sidecars sont inaccessibles

**Vue par type de message — détail du flux**
- `GET /api/inbox-outbox/message-types/{type}/summary`
- Retourne producteurs (outbox) et consommateurs (inbox) pour ce type, avec leurs compteurs

---

### 7 Stratégie d'appels aux sidecars

#### Vue d'ensemble (tous les sidecars)
- Exécution parallèle via `CompletableFuture` / WebClient réactif
- Timeout par sidecar : 5s
- Timeout global : 15-20s
- Si un sidecar ne répond pas : `connectionError: true` pour cette application, les autres résultats sont retournés normalement

#### Vue filtrée (un sidecar)
- Appel direct au sidecar concerné
- Temps de réponse attendu : <1s

#### Rejeu
- Appel POST transmis au sidecar concerné
- Réponse synchrone : le sidecar effectue l'UPDATE et retourne 200 OK

---

### 8 Gestion des Erreurs

#### Sidecar inaccessible
- Ne pas bloquer la requête globale
- Retourner `connectionError: true` pour l'application concernée
- Afficher "N/A" dans le frontend

#### Timeout
- Timeout par sidecar : 5s
- Timeout global : 15-20s

#### Erreurs de rejeu
- Code HTTP approprié (4xx/5xx) retourné par le sidecar, propagé par DEMAF
- Message d'erreur explicite côté frontend
