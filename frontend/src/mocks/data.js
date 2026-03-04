// ─── Applications fictives ────────────────────────────────────────────────────
// role 'producer' : émet uniquement (outbox), pas d'inbox
// role 'consumer' : reçoit uniquement (inbox), pas d'outbox
// role 'both'     : émet et reçoit
export const APPLICATIONS = [
  { name: 'App-Commandes',   displayName: 'App Commandes',   connectionError: false, role: 'producer' },
  { name: 'App-Facturation', displayName: 'App Facturation', connectionError: false, role: 'both'     },
  { name: 'App-Stock',       displayName: 'App Stock',       connectionError: false, role: 'consumer' },
  { name: 'App-CRM',         displayName: 'App CRM',         connectionError: false, role: 'consumer' },
  { name: 'App-RH',          displayName: 'App RH',          connectionError: true,  role: 'both'     },
  { name: 'App-Paiement',    displayName: 'App Paiement',    connectionError: false, role: 'both'     },
]

// ─── Messages d'erreur variés et réalistes ────────────────────────────────────
const ERROR_MESSAGES = [
  'java.lang.RuntimeException: Connection timeout after 30000ms\n\tat com.demaf.connector.HttpConnector.send(HttpConnector.java:142)\n\tat com.demaf.processor.MessageProcessor.process(MessageProcessor.java:87)',
  'org.springframework.dao.DataAccessException: Unable to acquire JDBC Connection; nested exception is java.sql.SQLTransientConnectionException: HikariPool-1 - Connection is not available, request timed out after 30000ms',
  'com.demaf.exception.ValidationException: Schema validation failed — field "montant" expects type NUMBER, got STRING at path $.payload.montant',
  'javax.jms.JMSException: Could not connect to broker URL: tcp://broker:61616. Reason: java.net.ConnectException: Connection refused',
  'org.apache.kafka.common.errors.TimeoutException: Expiring 3 record(s) for DEMAF-INBOX-0: 30038 ms has passed since batch creation',
  'com.demaf.exception.BusinessException: Duplicate message detected — correlationId CORR-A3F8B291 already processed at 2026-02-17T14:23:11Z',
  'java.io.IOException: Remote host closed connection during handshake — SSL/TLS negotiation failed with peer 10.0.1.42:8443',
  'org.springframework.web.client.HttpServerErrorException: 503 Service Unavailable — downstream service /api/erp/validate returned 503',
]

// ─── Types de messages par application ET par direction ───────────────────────
// Contrainte intra-app : un type ne peut pas apparaître en inbox ET outbox de la même app.
// Flux inter-apps : un même type peut être en outbox d'une app et en inbox d'une autre
// (c'est précisément le rôle de l'ESB — router les événements entre applications).
//
// Flux modélisés :
//   ORDER_CREATED / ORDER_CANCELLED  : Commandes → Facturation, Stock, CRM
//   ORDER_SHIPPED                    : Commandes → CRM
//   INVOICE_SENT                     : Facturation → Paiement
//   PAYMENT_CONFIRMED / PAYMENT_FAILED : Paiement → Facturation
//
const TYPES_BY_APP = {
  'App-Commandes': {
    INBOX:  [],
    OUTBOX: ['ORDER_CREATED', 'ORDER_UPDATED', 'ORDER_CANCELLED', 'ORDER_SHIPPED', 'ORDER_RETURNED'],
  },
  'App-Facturation': {
    // Reçoit les commandes depuis App-Commandes et les confirmations depuis App-Paiement
    INBOX:  ['ORDER_CREATED', 'ORDER_CANCELLED', 'PAYMENT_CONFIRMED', 'PAYMENT_FAILED'],
    // Émet les factures vers App-Paiement
    OUTBOX: ['INVOICE_SENT', 'CREDIT_NOTE_ISSUED', 'REMINDER_SENT'],
  },
  'App-Stock': {
    // Reçoit les commandes depuis App-Commandes
    INBOX:  ['ORDER_CREATED', 'ORDER_UPDATED', 'ORDER_CANCELLED', 'REORDER_TRIGGERED', 'INVENTORY_SYNC'],
    OUTBOX: [],
  },
  'App-CRM': {
    // Reçoit les commandes et livraisons depuis App-Commandes
    INBOX:  ['ORDER_CREATED', 'ORDER_SHIPPED', 'CUSTOMER_UPDATED', 'OPPORTUNITY_WON', 'TICKET_OPENED'],
    OUTBOX: [],
  },
  'App-RH': {
    INBOX:  ['HR_REQUEST', 'EMPLOYEE_CREATED', 'LEAVE_APPROVED'],
    OUTBOX: ['PAYROLL_EXPORTED'],
  },
  'App-Paiement': {
    // Reçoit les factures depuis App-Facturation
    INBOX:  ['INVOICE_SENT', 'CHARGEBACK_RECEIVED'],
    // Émet les confirmations vers App-Facturation
    OUTBOX: ['PAYMENT_CONFIRMED', 'PAYMENT_FAILED', 'REFUND_ISSUED'],
  },
}

const USERS = ['user.dupont', 'user.martin', 'user.bernard', 'user.leroy',
               'system', 'batch.job', 'api.gateway', 'scheduler', 'etl.nightly']

// ─── Profils de distribution par application ──────────────────────────────────
// Les directions absentes (null) correspondent au role de l'app.
const APP_PROFILES = {
  'App-Commandes': {
    // producer — émet uniquement, pas d'inbox
    inbox:  null,
    outbox: { A_TRAITER: 6, EN_TRAITEMENT: 4, TRAITE: 51, EN_ERREUR: 3 },
  },
  'App-Facturation': {
    // both — CRISE : vague d'erreurs sur la facturation
    inbox:  { A_TRAITER: 14, EN_TRAITEMENT: 6, TRAITE: 12, EN_ERREUR: 23 },
    outbox: { A_TRAITER: 4,  EN_TRAITEMENT: 2, TRAITE: 9,  EN_ERREUR: 11 },
    extras: [
      { direction: 'INBOX', status: 'EN_ERREUR', type: 'ORDER_CREATED', count: 345 },
    ],
  },
  'App-Stock': {
    // consumer — reçoit uniquement, volume élevé bien traité
    inbox:  { A_TRAITER: 3, EN_TRAITEMENT: 12, TRAITE: 98, EN_ERREUR: 2 },
    outbox: null,
  },
  'App-CRM': {
    // consumer — backlog important
    inbox:  { A_TRAITER: 47, EN_TRAITEMENT: 18, TRAITE: 35, EN_ERREUR: 6 },
    outbox: null,
  },
  'App-Paiement': {
    // both — CRISE CRITIQUE : paiements en échec
    inbox:  { A_TRAITER: 5, EN_TRAITEMENT: 3, TRAITE: 8, EN_ERREUR: 34 },
    outbox: { A_TRAITER: 2, EN_TRAITEMENT: 1, TRAITE: 6, EN_ERREUR: 19 },
  },
}

// ─── Générateur de messages ───────────────────────────────────────────────────
let msgId = 1

function makeMessage(appName, direction, status, forceType = null) {
  const id       = `MSG-${String(msgId++).padStart(5, '0')}`
  const typePool = TYPES_BY_APP[appName]?.[direction] ?? ['GENERIC_EVENT']
  const type     = forceType ?? typePool[Math.floor(Math.random() * typePool.length)]
  const user  = USERS[Math.floor(Math.random() * USERS.length)]

  // Horodatage : messages d'erreur plus récents (plus dramatique à l'écran)
  const maxAge = status === 'EN_ERREUR' ? 2 * 24 * 3600 * 1000 : 7 * 24 * 3600 * 1000
  const delta  = Math.floor(Math.random() * maxAge)
  const ts     = new Date(Date.now() - delta).toISOString()

  const isMoney = type.includes('PAYMENT') || type.includes('INVOICE') || type.includes('REFUND') || type.includes('CHARGEBACK')

  return {
    id,
    application: appName,
    direction,
    type,
    statut: status,
    utilisateur: user,
    timestamp: ts,
    nbRejeux: status === 'EN_ERREUR' ? Math.floor(Math.random() * 5) : 0,
    correlationId: `CORR-${Math.random().toString(36).slice(2, 10).toUpperCase()}`,
    sourceSystem: direction === 'INBOX' ? `SYS-${appName.replace('App-', '').toUpperCase()}` : 'ESB',
    targetSystem: direction === 'INBOX' ? 'ESB' : `SYS-${appName.replace('App-', '').toUpperCase()}`,
    payload: {
      reference: `REF-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
      ...(isMoney ? { montant: (Math.random() * 9900 + 100).toFixed(2), devise: 'EUR' } : {}),
      description: `${type} — ${appName}`,
    },
    errorMessage: status === 'EN_ERREUR'
      ? ERROR_MESSAGES[Math.floor(Math.random() * ERROR_MESSAGES.length)]
      : null,
  }
}

// ─── Construction du jeu de données à partir des profils ─────────────────────
function buildMessages(appName) {
  const profile = APP_PROFILES[appName]
  if (!profile) return []

  const msgs = []
  for (const direction of ['inbox', 'outbox']) {
    const dist = profile[direction]
    if (!dist) continue // direction non applicable pour ce rôle
    for (const [status, count] of Object.entries(dist)) {
      for (let i = 0; i < count; i++) {
        msgs.push(makeMessage(appName, direction.toUpperCase(), status))
      }
    }
  }
  for (const extra of profile.extras ?? []) {
    for (let i = 0; i < extra.count; i++) {
      msgs.push(makeMessage(appName, extra.direction, extra.status, extra.type))
    }
  }

  // Mélange pour ne pas avoir tous les statuts groupés
  return msgs.sort(() => Math.random() - 0.5)
}

// ─── Base de données en mémoire ───────────────────────────────────────────────
export const db = {}

for (const app of APPLICATIONS) {
  if (!app.connectionError) {
    db[app.name] = buildMessages(app.name)
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
export function getMessages(appName) {
  return db[appName] ?? null
}

export function getMessage(appName, id) {
  return (db[appName] ?? []).find(m => m.id === id) ?? null
}

export function replayMessage(appName, id) {
  const msg = getMessage(appName, id)
  if (!msg) return null
  msg.statut    = 'A_TRAITER'
  msg.nbRejeux  = (msg.nbRejeux ?? 0) + 1
  msg.errorMessage = null
  return msg
}

export function replayMessages(appName, ids) {
  return ids.map(id => replayMessage(appName, id)).filter(Boolean)
}

export function replayByFilter(appName, { statuses, types } = {}) {
  let messages = db[appName] ?? []
  if (statuses?.length) messages = messages.filter(m => statuses.includes(m.statut))
  if (types?.length)    messages = messages.filter(m => types.includes(m.type))
  return messages.map(m => replayMessage(appName, m.id)).filter(Boolean)
}

export function getMessageTypes(appName) {
  const messages = db[appName]
  if (!messages) return []
  return [...new Set(messages.map(m => m.type))].sort()
}

export function getAppRole(appName) {
  return APPLICATIONS.find(a => a.name === appName)?.role ?? 'both'
}

export function getMessageTypesSummary() {
  const result = {}
  for (const app of APPLICATIONS) {
    if (app.connectionError) continue
    for (const m of db[app.name] ?? []) {
      if (!result[m.type]) {
        result[m.type] = { type: m.type, A_TRAITER: 0, EN_TRAITEMENT: 0, TRAITE: 0, EN_ERREUR: 0 }
      }
      result[m.type][m.statut]++
    }
  }
  return Object.values(result).sort((a, b) => a.type.localeCompare(b.type))
}

export function getMessageTypeSummary(type) {
  const producers = []
  const consumers = []
  for (const app of APPLICATIONS) {
    if (app.connectionError) continue
    const messages = (db[app.name] ?? []).filter(m => m.type === type)
    const zero = () => ({ application: app.name, A_TRAITER: 0, EN_TRAITEMENT: 0, TRAITE: 0, EN_ERREUR: 0 })
    const outbox = messages.filter(m => m.direction === 'OUTBOX')
    const inbox  = messages.filter(m => m.direction === 'INBOX')
    if (outbox.length) { const c = zero(); for (const m of outbox) c[m.statut]++; producers.push(c) }
    if (inbox.length)  { const c = zero(); for (const m of inbox)  c[m.statut]++; consumers.push(c) }
  }
  return { type, partialData: false, producers, consumers }
}

export function computeSummary(appName) {
  const messages = db[appName]
  if (!messages) return null // connexion error

  const app     = APPLICATIONS.find(a => a.name === appName)
  const role    = app?.role ?? 'both'
  const profile = APP_PROFILES[appName]

  const zero = () => ({ A_TRAITER: 0, EN_TRAITEMENT: 0, TRAITE: 0, EN_ERREUR: 0 })
  const inbox  = profile?.inbox  !== null ? zero() : null
  const outbox = profile?.outbox !== null ? zero() : null

  for (const m of messages) {
    if (m.direction === 'INBOX'  && inbox)  inbox[m.statut]++
    if (m.direction === 'OUTBOX' && outbox) outbox[m.statut]++
  }

  return { application: appName, role, inbox, outbox }
}
