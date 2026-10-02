# Dynamic components: how Ghost should draw UI it decides on

Status: research and recommendation. Nothing here is built yet.

## What exists today

- The model never builds UI. It emits a **Spec** (`pkg/cards`), the Pod validates it against a closed **catalog** (kind, required data, max actions, allowed button styles; unknown fields and kinds fail closed) and publishes a **Card** over the WebSocket (`card_update`). The phone drops any kind it does not know (`lib/cards.ts`) and renders the rest with a `switch` in `components/cards.tsx`.
- This is the right safety model and it should not change: **the model proposes, the server validates, the client renders from a fixed registry.** A prompt-injected page can never smuggle a layout, a link target, or an action the catalog did not allow.

## What is weak

1. **Six kinds, each hard-coded.** `suggestion`, `goal_update`, `cart`, `browser_view`, `memory_receipt`, `browser_recovery`. Every new answer shape (weather, flight status, a list of reminders, a comparison) needs a new kind on the Pod and a new `case` in the app, so it ships in two places.
2. **Cards carry almost no structure.** `data` is a free map. A cart is bullets of text with no price column, total or image; a flight would be a paragraph. The card cannot be as good as the answer it replaces.
3. **Three card systems.** Approvals (`PermissionCard`), results (`ArtifactCard`) and live surfaces (`LiveSurfaceCard`) each have their own props, state and layout, so they drift apart.
4. **Cards float at the end of the thread** (`ThreadExtras`) rather than sitting where in the conversation they were produced, so history does not read in order and a spent card keeps taking space.
5. **No contract test.** The Go catalog and the TypeScript parser agree by convention only. (The relay and entitlement code already pin their formats with shared fixtures; cards should too.)

## Recommended approach

**Compose cards from a small set of typed blocks, not one kind per use case.**

```
card = { v: 1, id, template?, title, blocks: [ ... ], actions: [ ... ] }

block types (each validated, each with hard limits):
  text      { text }                              short, no markdown beyond bold/code
  facts     { rows: [{ label, value, tone? }] }   key/value (CPU, flight time, price)
  list      { items: [{ title, subtitle?, trailing?, tone? }] }   up to 12
  metric    { label, value, delta?, tone? }       one big number
  progress  { label, value 0..1 }
  media     { ref }                               an uploaded file id, never a URL
  note      { text, tone }                        a caution or a receipt line
```

- **Kinds become server-side templates.** "Flight status" is just a `facts` block plus one action. Adding a template needs **no app release**. Only a genuinely new block type does.
- **One renderer per block** in the app, all built on the glass card, serif title and light body already in the design system, so every dynamic card looks like it belongs.
- **Versioned and forgiving.** `v` on every card; an unknown block type is skipped, and if nothing renders the card falls back to its `TextFallback()` so the owner still gets the answer.
- **Actions stay typed intents resolved on the Pod** (the existing `request_id` pattern). A card can offer "Allow once" but cannot carry a command, a URL to open, or a style outside the catalog. Link-like blocks pass through `link-policy`.
- **Unify approvals, results and surfaces on the same shell and block renderers**, keeping their behaviour but not their separate layouts.
- **Place cards in the thread at the message that produced them**, persist them with history, and collapse a resolved card to one quiet line ("You allowed this") so a long conversation does not fill with spent cards.
- **Pin it with a contract test**: one JSON fixture set read by both the Go validator and the TypeScript parser, like `golden_test.go` / `sealedFetch.test.ts`.

## Order of work

1. Block schema, limits and validation in `pkg/cards`, with the shared fixtures. Old kinds keep working untouched.
2. TypeScript parser and block registry, plus renderers on the glass card, with tests.
3. Re-express `cart`, `memory_receipt`, `goal_update` and `suggestion` as templates over blocks, then remove their special cases.
4. New templates fed by tools that already return structured results (weather, flights, reminders).
5. Inline placement in the thread, persistence in history, and the collapsed resolved state.

## Decisions for the owner

- Whether new templates may be defined by the Pod operator without an app update (recommended: yes, within the block catalog).
- How long a resolved card stays expanded (recommended: collapse on resolve, expand on tap).
