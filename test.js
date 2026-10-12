// Conversation tests. No server, no network — just the state machine.
import { handleMessage, newSession } from './src/order.js'
import { matchItem } from './src/menu.js'

let fails = 0
const check = (name, cond, detail='') => {
  console.log((cond ? '  PASS  ' : '  FAIL  ') + name + (detail ? '  → ' + detail : ''))
  if (!cond) fails++
}

// a whole order, start to finish
let s = newSession()
const say = (t) => { const r = handleMessage(t, s); s = r.session; return r }

check('greets and shows menu', /menu|Jollof/i.test(say('hi').reply))
let r = say('2 jollof and 1 coke')
check('parses quantities and multiple items', s.cart.length === 2 && s.cart[0].qty === 2, JSON.stringify(s.cart.map(c=>c.qty+'x'+c.name)))
check('totals correctly', /7,800/.test(r.reply), '2*3500 + 800 = 7800')
check('handles typos', (say('chiken suya'), s.cart.some(l => l.id === 'suya')))
check('handles "coke x3" form', (say('water x3'), s.cart.find(l => l.id === 'water')?.qty === 3))
check('rejects unknown items', /don't have/i.test(say('pizza').reply))
r = say('done');       check('asks for name', /name/i.test(r.reply))
r = say('Ayomide');    check('asks for address', /address/i.test(r.reply))
r = say('12 Allen Avenue, Ikeja'); check('asks to confirm', /confirm/i.test(r.reply))
r = say('confirm')
check('creates an order', !!r.order && /^ORD-/.test(r.order.ref), r.order?.ref)
check('order total is right', r.order.total === 2*3500 + 800 + 4000 + 3*300, String(r.order?.total))
check('resets session after ordering', s.cart.length === 0)

// edge cases
s = newSession()
check('cancel clears the basket', (say('2 jollof'), say('cancel'), s.cart.length === 0))
check('empty basket cannot check out', /empty/i.test(say('done').reply))
check('ambiguity is asked about, not guessed',
  (() => { const m = matchItem('rice'); return m && m.ambiguous && m.ambiguous.length === 2 })())
check('caps absurd quantities', (() => { const t = newSession()
  return handleMessage('9999 coke', t).session.cart[0].qty === 50 })())

console.log('\n  ' + (fails ? fails + ' FAILED' : 'all passed'))
process.exit(fails)
