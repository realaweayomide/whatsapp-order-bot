// order.js — the conversation. One function: a message plus the current state goes in,
// a reply plus the new state comes out.
//
// Deliberately NOT an LLM. A customer ordering food needs the same answer every time, must
// never be charged for a hallucinated item, and shouldn't wait on a model round-trip. This is
// a small state machine over a few intents — faster, free, and testable.

import { DEFAULT_MENU, matchItem, money, renderMenu } from './menu.js'

const WORD_NUMBERS = { one:1, two:2, three:3, four:4, five:5, six:6, seven:7, eight:8, nine:9, ten:10, a:1, an:1 }

export const newSession = () => ({ stage: 'idle', cart: [], name: null, address: null, updatedAt: Date.now() })

const total = (cart) => cart.reduce((n, l) => n + l.qty * l.price, 0)

function cartText(cart, cur) {
  if (!cart.length) return 'Your basket is empty.'
  return cart.map((l) => `• ${l.qty} × ${l.name} — ${money(l.qty * l.price, cur)}`).join('\n') +
    `\n\n*Total: ${money(total(cart), cur)}*`
}

/** Pull "2 jollof, 1 coke" out of a line. Handles "x2", "2x", word numbers, commas and "and". */
function parseLines(text, menu) {
  const out = [], unknown = [], ambiguous = []
  const chunks = text.split(/,|\band\b|\bplus\b|\n/i).map((s) => s.trim()).filter(Boolean)

  for (const chunk of chunks) {
    let qty = 1
    let rest = chunk

    let m = chunk.match(/^(\d+|\b(?:one|two|three|four|five|six|seven|eight|nine|ten|a|an)\b)\s*x?\s+(.+)$/i)
    if (m) { qty = Number(m[1]) || WORD_NUMBERS[m[1].toLowerCase()] || 1; rest = m[2] }
    else {
      m = chunk.match(/^(.+?)\s*[x*]\s*(\d+)$/i)          // "coke x3"
      if (m) { rest = m[1]; qty = Number(m[2]) }
    }
    if (qty < 1) qty = 1
    if (qty > 50) qty = 50   // someone fat-fingered a phone number

    const hit = matchItem(rest, menu)
    if (!hit) { if (rest.length > 1) unknown.push(rest); continue }
    if (hit.ambiguous) { ambiguous.push({ typed: rest, options: hit.ambiguous }); continue }
    out.push({ id: hit.item.id, name: hit.item.name, price: hit.item.price, qty })
  }
  return { lines: out, unknown, ambiguous }
}

function addToCart(cart, lines) {
  const next = cart.map((l) => ({ ...l }))
  for (const line of lines) {
    const found = next.find((l) => l.id === line.id)
    if (found) found.qty += line.qty
    else next.push(line)
  }
  return next
}

/**
 * @param {string} text        what the customer sent
 * @param {object} session     previous state (use newSession())
 * @param {object} cfg         { menu, currency, businessName }
 * @returns {{reply:string, session:object, order?:object}}
 */
export function handleMessage(text, session, cfg = {}) {
  const menu = cfg.menu || DEFAULT_MENU
  const cur = cfg.currency || '₦'
  const biz = cfg.businessName || 'our kitchen'
  const s = { ...session, updatedAt: Date.now() }
  const msg = (text || '').trim()
  const low = msg.toLowerCase()

  const reply = (r, extra = {}) => ({ reply: r, session: { ...s, ...extra } })

  if (!msg) return reply('Sorry, I didn\'t catch that. Type *menu* to see what we have.')

  // ── global commands, available at any point ──
  if (/^(menu|list|what do you have)\b/.test(low))
    return reply(`*${biz} — menu*\n\n${renderMenu(menu, cur)}\n\nReply with what you'd like, e.g. *2 jollof and 1 coke*.`)

  if (/^(cancel|clear|start over|reset)\b/.test(low))
    return reply('No problem — I\'ve cleared your basket. Type *menu* to start again.', { stage: 'idle', cart: [], name: null, address: null })

  if (/^(cart|basket|my order)\b/.test(low))
    return reply(cartText(s.cart, cur) + (s.cart.length ? '\n\nType *done* when you\'re ready.' : ''))

  if (/^(help|hi|hello|hey|good (morning|afternoon|evening))\b/.test(low) && s.stage === 'idle')
    return reply(`Hello! 👋 Welcome to *${biz}*.\n\n${renderMenu(menu, cur)}\n\nReply with what you'd like, e.g. *2 jollof and 1 coke*.`)

  // ── checkout flow ──
  if (s.stage === 'awaiting_name') {
    if (msg.length < 2) return reply('Please send your name so we know who the order is for.')
    return reply(`Thanks ${msg.split(' ')[0]}. What address should we deliver to?`, { stage: 'awaiting_address', name: msg })
  }

  if (s.stage === 'awaiting_address') {
    if (msg.length < 6) return reply('That looks a bit short — please send the full delivery address.')
    return {
      reply: `Please confirm:\n\n${cartText(s.cart, cur)}\n\n*Name:* ${s.name}\n*Address:* ${msg}\n\nReply *confirm* to place the order, or *cancel* to start over.`,
      session: { ...s, stage: 'awaiting_confirm', address: msg },
    }
  }

  if (s.stage === 'awaiting_confirm') {
    if (/^(confirm|yes|yep|ok|okay|y)\b/.test(low)) {
      const order = {
        ref: 'ORD-' + Math.random().toString(36).slice(2, 7).toUpperCase(),
        items: s.cart, total: total(s.cart), currency: cur,
        name: s.name, address: s.address, placedAt: new Date().toISOString(),
      }
      return {
        reply: `✅ Order *${order.ref}* confirmed!\n\n${cartText(s.cart, cur)}\n\nDelivering to ${s.address}.\nWe'll message you when it's on the way.`,
        session: newSession(),
        order,
      }
    }
    return reply('Reply *confirm* to place the order, or *cancel* to start over.')
  }

  // ── ordering ──
  if (/^(done|checkout|that'?s all|finish)\b/.test(low)) {
    if (!s.cart.length) return reply('Your basket is empty. Type *menu* to see what we have.')
    return reply(`${cartText(s.cart, cur)}\n\nWhat name is the order for?`, { stage: 'awaiting_name' })
  }

  const { lines, unknown, ambiguous } = parseLines(msg, menu)

  if (ambiguous.length) {
    const a = ambiguous[0]
    return reply(`Did you mean *${a.options[0].name}* or *${a.options[1].name}*? Please send the full name.`)
  }

  if (!lines.length) {
    return reply(unknown.length
      ? `Sorry, we don't have "${unknown[0]}". Here's what we do have:\n\n${renderMenu(menu, cur)}`
      : `I didn't understand that. Type *menu* to see the list, or tell me what you'd like, e.g. *2 jollof*.`)
  }

  const cart = addToCart(s.cart, lines)
  let r = `Added:\n${lines.map((l) => `• ${l.qty} × ${l.name}`).join('\n')}`
  if (unknown.length) r += `\n\n(We don't have "${unknown[0]}" — skipped.)`
  r += `\n\n${cartText(cart, cur)}\n\nAnything else? Type *done* when you're ready.`
  return reply(r, { stage: 'ordering', cart })
}
