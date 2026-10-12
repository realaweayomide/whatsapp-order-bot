// whatsapp-order-bot — takes orders over WhatsApp.
//
// Runs in two modes:
//   • Simulator (default) — a chat UI at / so you can see the whole flow with no credentials.
//   • Live — set WHATSAPP_TOKEN + WHATSAPP_PHONE_NUMBER_ID and point Meta's webhook at /webhook.
//
// The conversation logic is identical in both. The only difference is where messages come from
// and where replies go, which is the point: you can develop and demo the entire thing without
// a Meta developer account, a verified business, or a phone number.

import express from 'express'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { handleMessage, newSession } from './src/order.js'
import { DEFAULT_MENU } from './src/menu.js'

const app = express()
app.use(express.json())
app.use(express.static('public'))

const TOKEN = process.env.WHATSAPP_TOKEN
const PHONE_ID = process.env.WHATSAPP_PHONE_NUMBER_ID
const VERIFY = process.env.WHATSAPP_VERIFY_TOKEN || 'dev-verify-token'
const LIVE = Boolean(TOKEN && PHONE_ID)

const CFG = {
  menu: loadMenu(),
  currency: process.env.CURRENCY || '₦',
  businessName: process.env.BUSINESS_NAME || "Mama Ada's Kitchen",
}

function loadMenu() {
  if (existsSync('menu.json')) {
    try { return JSON.parse(readFileSync('menu.json', 'utf8')) }
    catch { console.warn('[bot] menu.json is not valid JSON — using the default menu') }
  }
  return DEFAULT_MENU
}

// Sessions in memory, orders appended to a file. Both would be a database in production;
// see the README for why that's the right shortcut for a demo and the wrong one for a shop.
const sessions = new Map()
const ORDERS = 'orders.json'
const getSession = (id) => sessions.get(id) || newSession()

function saveOrder(order, from) {
  const all = existsSync(ORDERS) ? JSON.parse(readFileSync(ORDERS, 'utf8')) : []
  all.push({ ...order, from })
  writeFileSync(ORDERS, JSON.stringify(all, null, 2))
  console.log(`[bot] order ${order.ref} — ${CFG.currency}${order.total} from ${from}`)
}

/** One entry point for both modes. */
function converse(from, text) {
  const { reply, session, order } = handleMessage(text, getSession(from), CFG)
  sessions.set(from, session)
  if (order) saveOrder(order, from)
  return { reply, order }
}

// ── WhatsApp Cloud API ───────────────────────────────────────────────────────

// Meta calls this once to verify the webhook before it will send you anything.
app.get('/webhook', (req, res) => {
  if (req.query['hub.mode'] === 'subscribe' && req.query['hub.verify_token'] === VERIFY) {
    return res.status(200).send(req.query['hub.challenge'])
  }
  res.sendStatus(403)
})

app.post('/webhook', async (req, res) => {
  res.sendStatus(200) // acknowledge immediately — Meta retries anything slow

  try {
    const msg = req.body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0]
    if (!msg || msg.type !== 'text') return
    const from = msg.from
    const { reply } = converse(from, msg.text?.body || '')
    await sendWhatsApp(from, reply)
  } catch (err) {
    console.error('[bot] webhook error:', err.message)
  }
})

async function sendWhatsApp(to, text) {
  if (!LIVE) return console.log(`[bot] (not live) would send to ${to}: ${text.slice(0, 60)}…`)
  const r = await fetch(`https://graph.facebook.com/v21.0/${PHONE_ID}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
    body: JSON.stringify({ messaging_product: 'whatsapp', to, type: 'text', text: { body: text } }),
  })
  if (!r.ok) console.error('[bot] send failed:', r.status, (await r.text()).slice(0, 200))
}

// ── simulator + admin ────────────────────────────────────────────────────────

app.post('/api/simulate', (req, res) => {
  const from = (req.body?.from || 'sim-user').toString()
  const text = (req.body?.text || '').toString().slice(0, 500)
  const { reply, order } = converse(from, text)
  res.json({ reply, order: order || null })
})

app.post('/api/reset', (req, res) => {
  sessions.delete((req.body?.from || 'sim-user').toString())
  res.json({ ok: true })
})

app.get('/api/orders', (req, res) => {
  res.json(existsSync(ORDERS) ? JSON.parse(readFileSync(ORDERS, 'utf8')) : [])
})

app.get('/api/config', (req, res) => {
  res.json({ live: LIVE, businessName: CFG.businessName, currency: CFG.currency, menu: CFG.menu })
})

const PORT = process.env.PORT || 3000
app.listen(PORT, () => {
  console.log(`whatsapp-order-bot on http://localhost:${PORT}`)
  console.log(LIVE
    ? `  mode: LIVE — point Meta's webhook at /webhook (verify token: ${VERIFY})`
    : '  mode: simulator — open the page and chat. Set WHATSAPP_TOKEN to go live.')
})
