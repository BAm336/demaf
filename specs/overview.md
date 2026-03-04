# Spécifications - Application d'exploitation Inbox/Outbox

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
Développer une application d'exploitation permettant de **visualiser à la demande** l'état des messages dans les tables inbox/outbox, notamment :
- Nombre de messages par statut (A_TRAITER, EN_TRAITEMENT, TRAITE, EN_ERREUR, etc.)
- Consultation détaillée des messages en erreur
- Rejeu manuel des messages (unitaire ou par lot)

**Note importante** : Il ne s'agit PAS d'un monitoring temps réel continu mais d'un outil de consultation et d'administration à la demande.
