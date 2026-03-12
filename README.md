# DEMAF — Dashboard d'exploitation Inbox/Outbox

DEMAF est un outil interne permettant aux équipes d'exploitation de surveiller et d'administrer les files de messages asynchrones (pattern inbox/outbox) réparties sur l'ensemble du SI.

Il offre une vue consolidée de l'état des messages dans toutes les applications, et permet de relancer manuellement les messages en erreur sans intervention directe en base.

## Fonctionnalités

- Tableau de bord des messages par application et par type, avec compteurs par statut (`A_TRAITER`, `EN_TRAITEMENT`, `TRAITE`, `EN_ERREUR`)
- Consultation de la liste des messages et de leurs métadonnées
- Rejeu unitaire, par sélection ou en masse sur filtre
- Rafraîchissement automatique (polling)

## Architecture

```
frontend/       Vue.js 3 + Vuetify
backend/        Spring Boot (Java) — agrège les données des sidecars
sidecar/        Composant déployé au plus près de chaque application métier
```

Le backend orchestre les appels vers les sidecars (un par application), qui sont les seuls à accéder directement aux bases de données. Le frontend ne communique qu'avec le backend.

## Prérequis

### Frontend
- Node.js >= 18
- npm ou yarn

### Backend
- Java 21+
- Maven ou Gradle
- Accès réseau aux sidecars

### Sidecar
- Java 21+
- Accès JDBC à la base de données de l'application cible (Oracle ou PostgreSQL)

### Déploiement
- OpenShift / Kubernetes
- ConfigMap listant les URLs des sidecars

## Lancement en développement

```bash
# Frontend
cd frontend
npm install
npm run dev

# Backend
cd backend
./mvnw spring-boot:run
```

## Documentation

Les spécifications fonctionnelles, techniques et les contrats OpenAPI sont dans le dossier [`specs/`](specs/).
