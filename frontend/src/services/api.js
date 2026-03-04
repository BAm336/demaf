// Toutes les fonctions qui touchent le réseau sont ici.
// Quand le vrai backend arrive, seuls ces fichiers changent.

const BASE = '/api'

async function fetchJSON(url) {
  const res = await fetch(url)
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw Object.assign(new Error(err.error ?? `HTTP ${res.status}`), { status: res.status })
  }
  return res.json()
}

async function postJSON(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw Object.assign(new Error(err.error ?? `HTTP ${res.status}`), { status: res.status })
  }
  return res.json()
}

// ── Applications ──────────────────────────────────────────────────────────────
export function fetchApplications() {
  return fetchJSON(`${BASE}/applications`)
}

// ── Summary ───────────────────────────────────────────────────────────────────
export function fetchSummary(application = null) {
  const q = application ? `?application=${encodeURIComponent(application)}` : ''
  return fetchJSON(`${BASE}/inbox-outbox/summary${q}`)
}

// ── Types de messages (vue globale) ───────────────────────────────────────────
// Retourne [{ type, A_TRAITER, EN_TRAITEMENT, TRAITE, EN_ERREUR }]
export function fetchMessageTypesSummary() {
  return fetchJSON(`${BASE}/inbox-outbox/message-types/summary`)
}

// Retourne { type, partialData, producers: [...], consumers: [...] }
export function fetchMessageTypeSummary(type) {
  return fetchJSON(`${BASE}/inbox-outbox/message-types/${encodeURIComponent(type)}/summary`)
}

// ── Messages ──────────────────────────────────────────────────────────────────
// Retourne { types: string[], role: 'both'|'producer'|'consumer' }
export function fetchMessageTypes(appName) {
  return fetchJSON(`${BASE}/inbox-outbox/applications/${encodeURIComponent(appName)}/message-types`)
}

export function fetchMessages(appName, { statuses = [], direction, types = [], page = 1, pageSize = 50 } = {}) {
  const params = new URLSearchParams()
  for (const s of statuses) params.append('statuses', s) // multi-valeur : &statuses=A&statuses=B
  if (direction)     params.set('direction', direction)
  for (const t of types) params.append('types', t)
  params.set('page', String(page))
  params.set('pageSize', String(pageSize))
  return fetchJSON(`${BASE}/inbox-outbox/applications/${encodeURIComponent(appName)}/messages?${params}`)
}

export function fetchMessage(appName, id) {
  return fetchJSON(`${BASE}/inbox-outbox/applications/${encodeURIComponent(appName)}/messages/${id}`)
}

// ── Replay ────────────────────────────────────────────────────────────────────
export function replaySingle(appName, id) {
  return postJSON(`${BASE}/inbox-outbox/applications/${encodeURIComponent(appName)}/messages/${id}/replay`)
}

export function replayBatch(appName, ids) {
  return postJSON(`${BASE}/inbox-outbox/applications/${encodeURIComponent(appName)}/messages/replay`, { ids })
}

export function replayByFilter(appName, { statuses, types } = {}) {
  return postJSON(
    `${BASE}/inbox-outbox/applications/${encodeURIComponent(appName)}/messages/replay-by-filter`,
    { statuses: statuses?.length ? statuses : null, types: types?.length ? types : null },
  )
}
