# WhatsApp Order Bot

Takes food orders over WhatsApp. Understands *"2 jollof and 1 coke"*, survives typos, builds a
basket, collects delivery details and confirms the order.

**[▶ Try the simulator](#)** _(add your deployed URL)_ · built by [Ayomide Awe](https://github.com/realaweayomide)

## Try it in 30 seconds

```bash
npm install
npm start      # → http://localhost:3000
```

No WhatsApp account, no Meta developer account, no phone number. The page is a chat simulator
running the **real conversation engine** — the same code that handles live messages.

That isn't a toy stand-in. Needing a verified Meta business account before you can see your own
bot work is the single biggest reason these projects stall.

## Deliberately not an LLM

A customer ordering dinner needs the same answer every time, must never be charged for an item
the bot invented, and shouldn't wait on a model round-trip. So the conversation is a small state
machine with fuzzy item matching:

- **Quantities** — `2 jollof`, `two jollof`, `coke x3`, `jollof and coke`
- **Typos** — `chiken suya` → Chicken Suya, via Dice coefficient over bigrams
- **Ambiguity is asked about, not guessed** — type `rice` when the menu has both Jollof Rice and
  Fried Rice and it asks which, rather than silently picking one and charging you for it
- **Unknown items** are named and skipped, not ignored
- **Absurd quantities capped** — someone pastes a phone number, you don't get an order for 8,031 cokes

Matching is forgiving; *billing* is not. That's the line.

## The conversation

```
idle ──► ordering ──► awaiting_name ──► awaiting_address ──► awaiting_confirm ──► order
                 ▲                                                   │
                 └───────────────── cancel ◄─────────────────────────┘
```

`menu`, `cart`, `cancel` and `help` work at any point.

## Going live on WhatsApp

Set these and restart — the conversation logic doesn't change:

```
WHATSAPP_TOKEN=...              # Meta Cloud API token
WHATSAPP_PHONE_NUMBER_ID=...
WHATSAPP_VERIFY_TOKEN=any-string-you-choose
```

Point Meta's webhook at `https://your-host/webhook` using that verify token. The `GET /webhook`
handshake and `POST /webhook` message handling are both implemented.

The webhook **acknowledges immediately (200) and then processes**, because Meta retries anything
slow — a bot that replies before acking ends up sending every message twice.

## Your own menu

Drop a `menu.json` next to `server.js`:

```json
[{ "id": "jollof", "name": "Jollof Rice", "price": 3500, "aliases": ["jollof", "party rice"] }]
```

Aliases are what customers actually type. `BUSINESS_NAME` and `CURRENCY` are env vars.

## What I'd change for production

- **Sessions are in memory** and orders append to `orders.json`. Restart and in-flight baskets
  are gone. Fine for a demo, wrong for a shop — both belong in a database.
- **No payment step.** Real orders need a payment link and reconciliation.
- **No business hours, stock levels or delivery zones** — all of which turn out to matter the
  first day it runs for real.

## Tests

```bash
npm test     # 16 conversation tests, no server and no network
```

## License

MIT
