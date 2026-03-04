import { http, HttpResponse } from 'msw'
import {
  APPLICATIONS,
  getMessages,
  getMessage,
  getMessageTypes,
  getAppRole,
  getMessageTypesSummary,
  getMessageTypeSummary,
  replayMessage,
  replayMessages,
  replayByFilter,
  computeSummary,
} from './data.js'

const BASE = '/api'

// Petit délai simulant la latence réseau
const delay = (min = 100, max = 400) =>
  new Promise(r => setTimeout(r, min + Math.random() * (max - min)))

export const handlers = [
  // ── GET /api/applications ──────────────────────────────────────────────────
  http.get(`${BASE}/applications`, async () => {
    await delay()
    return HttpResponse.json(
      APPLICATIONS.map(({ name, displayName, connectionError }) => ({
        name,
        displayName,
        connectionError,
      }))
    )
  }),

  // ── GET /api/inbox-outbox/summary ─────────────────────────────────────────
  // Supporte ?application=X pour filtrer
  http.get(`${BASE}/inbox-outbox/summary`, async ({ request }) => {
    await delay()
    const url    = new URL(request.url)
    const appFilter = url.searchParams.get('application')

    const apps = appFilter
      ? APPLICATIONS.filter(a => a.name === appFilter)
      : APPLICATIONS

    const summaries = apps.map(a => {
      const s = computeSummary(a.name)
      if (s === null) {
        return { application: a.name, connectionError: true }
      }
      return s
    })

    return HttpResponse.json(summaries)
  }),

  // ── GET /api/inbox-outbox/message-types/summary ───────────────────────────
  http.get(`${BASE}/inbox-outbox/message-types/summary`, async () => {
    await delay()
    return HttpResponse.json(getMessageTypesSummary())
  }),

  // ── GET /api/inbox-outbox/message-types/:type/summary ─────────────────────
  http.get(`${BASE}/inbox-outbox/message-types/:type/summary`, async ({ params }) => {
    await delay(50, 150)
    return HttpResponse.json(getMessageTypeSummary(params.type))
  }),

  // ── GET /api/inbox-outbox/applications/:app/message-types ────────────────
  http.get(`${BASE}/inbox-outbox/applications/:app/message-types`, async ({ params }) => {
    await delay(50, 150)
    const { app } = params
    return HttpResponse.json({ types: getMessageTypes(app), role: getAppRole(app) })
  }),

  // ── GET /api/inbox-outbox/applications/:app/messages ──────────────────────
  http.get(`${BASE}/inbox-outbox/applications/:app/messages`, async ({ params, request }) => {
    await delay()
    const { app } = params
    const url       = new URL(request.url)
    const statuses  = url.searchParams.getAll('statuses') // multi-valeur
    const direction = url.searchParams.get('direction')
    const types     = url.searchParams.getAll('types')    // multi-valeur
    const page      = parseInt(url.searchParams.get('page') ?? '1', 10)
    const pageSize  = parseInt(url.searchParams.get('pageSize') ?? '50', 10)

    let messages = getMessages(app)
    if (messages === null) {
      return HttpResponse.json({ error: 'Connection error' }, { status: 503 })
    }

    if (statuses.length) messages = messages.filter(m => statuses.includes(m.statut))
    if (direction)       messages = messages.filter(m => m.direction === direction)
    if (types.length)    messages = messages.filter(m => types.includes(m.type))

    const total = messages.length
    const start = (page - 1) * pageSize
    const items = messages.slice(start, start + pageSize)

    return HttpResponse.json({ items, total, page, pageSize })
  }),

  // ── GET /api/inbox-outbox/applications/:app/messages/:id ──────────────────
  http.get(`${BASE}/inbox-outbox/applications/:app/messages/:id`, async ({ params }) => {
    await delay()
    const { app, id } = params
    const msg = getMessage(app, id)
    if (!msg) return HttpResponse.json({ error: 'Not found' }, { status: 404 })
    return HttpResponse.json(msg)
  }),

  // ── POST /api/inbox-outbox/applications/:app/messages/replay-by-filter ───
  http.post(`${BASE}/inbox-outbox/applications/:app/messages/replay-by-filter`, async ({ params, request }) => {
    await delay(300, 800)
    const { app } = params
    const body     = await request.json()
    const updated  = replayByFilter(app, { statuses: body.statuses, types: body.types })
    return HttpResponse.json({ replayed: updated.length, messages: updated })
  }),

  // ── POST /api/inbox-outbox/applications/:app/messages/:id/replay ──────────
  http.post(`${BASE}/inbox-outbox/applications/:app/messages/:id/replay`, async ({ params }) => {
    await delay()
    const { app, id } = params
    const updated = replayMessage(app, id)
    if (!updated) return HttpResponse.json({ error: 'Not found' }, { status: 404 })
    return HttpResponse.json(updated)
  }),

  // ── POST /api/inbox-outbox/applications/:app/messages/replay ──────────────
  http.post(`${BASE}/inbox-outbox/applications/:app/messages/replay`, async ({ params, request }) => {
    await delay(200, 600)
    const { app } = params
    const body = await request.json()
    const ids  = body?.ids ?? []
    const updated = replayMessages(app, ids)
    return HttpResponse.json({ replayed: updated.length, messages: updated })
  }),
]
