// menu.js — the catalogue, and matching what a customer typed to what you sell.
//
// Real customers don't type your SKU. They type "2 jollof", "chiken suya", "coke x3".
// So matching has to be forgiving about typos, plurals, word order and partial names —
// but NOT so forgiving that "rice" silently becomes "Fried Rice" when you also sell
// "Jollof Rice". Ambiguity gets asked about, not guessed.

export const DEFAULT_MENU = [
  { id: 'jollof',   name: 'Jollof Rice',       price: 3500, aliases: ['jollof', 'party rice'] },
  { id: 'fried',    name: 'Fried Rice',        price: 3500, aliases: ['fried'] },
  { id: 'suya',     name: 'Chicken Suya',      price: 4000, aliases: ['suya', 'chicken'] },
  { id: 'plantain', name: 'Fried Plantain',    price: 1000, aliases: ['plantain', 'dodo'] },
  { id: 'moimoi',   name: 'Moi Moi',           price: 1200, aliases: ['moi moi', 'moimoi'] },
  { id: 'coke',     name: 'Coca-Cola (50cl)',  price: 800,  aliases: ['coke', 'cola'] },
  { id: 'water',    name: 'Bottled Water',     price: 300,  aliases: ['water'] },
]

const norm = (s) => s.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim()

/** Dice coefficient over bigrams — forgiving about typos, cheap, no dictionary needed. */
function similarity(a, b) {
  const grams = (s) => { const t = norm(s).replace(/\s/g, ''); const g = new Set()
    for (let i = 0; i < t.length - 1; i++) g.add(t.slice(i, i + 2)); return g }
  const A = grams(a), B = grams(b)
  if (!A.size || !B.size) return a === b ? 1 : 0
  let shared = 0
  for (const g of A) if (B.has(g)) shared++
  return (2 * shared) / (A.size + B.size)
}

/**
 * @returns {{item, score}|{ambiguous:[...]}|null}
 */
export function matchItem(text, menu = DEFAULT_MENU) {
  const q = norm(text)
  if (!q) return null

  const scored = menu.map((item) => {
    const candidates = [item.name, item.id, ...(item.aliases || [])]
    let best = 0
    for (const c of candidates) {
      const n = norm(c)
      // a contained alias is a strong signal — "2 jollof please" contains "jollof"
      if (q === n) best = Math.max(best, 1)
      else if (new RegExp(`\\b${n.replace(/\s+/g, '\\s+')}\\b`).test(q)) best = Math.max(best, 0.9)
      else best = Math.max(best, similarity(q, n))
    }
    return { item, score: best }
  }).sort((a, b) => b.score - a.score)

  const top = scored[0]
  if (!top || top.score < 0.45) return null

  // If two items are close, don't guess — the caller will ask.
  const rival = scored[1]
  if (rival && top.score - rival.score < 0.08 && rival.score >= 0.45) {
    return { ambiguous: [top.item, rival.item] }
  }
  return top
}

export const money = (kobo, currency = '₦') =>
  currency + Number(kobo).toLocaleString('en-NG')

export function renderMenu(menu = DEFAULT_MENU, currency = '₦') {
  return menu.map((m, i) => `${i + 1}. ${m.name} — ${money(m.price, currency)}`).join('\n')
}
