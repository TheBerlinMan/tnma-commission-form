# TNMA Bag Commissions

A single-page, slide-based commission survey for handmade bags. No build step and no
framework — `index.html`, `styles.css`, `script.js`, and the images in `assets/`.

Submissions are relayed to email by
[tnma-form-relay](https://github.com/TheBerlinMan/tnma-form-relay).

---

## Contents

- [How submission works](#how-submission-works)
- [Fields the relay will receive](#fields-the-relay-will-receive) ← the part you need for `forms.ts`
- [Registry entries to paste into form-relay](#registry-entries-to-paste-into-form-relay)
- [Before go-live](#before-go-live)
- [Local development](#local-development)
- [Things worth knowing](#things-worth-knowing)

---

## How submission works

The survey is not a native `<form>` — it's a slide deck whose inputs are gathered by
`collectData()` in `script.js`. On the review slide, `buildSurveyPayload()` flattens
everything into a flat map of strings and POSTs it as JSON:

```
POST https://form-relay-eta.vercel.app/f/tnma-bag-commission
Content-Type: application/json
```

`200 {"ok":true}` advances to the thank-you slide. Anything else keeps the visitor on
the review slide with their answers intact and shows an error, so they can retry.

The waitlist (shown only when `SPOTS_FILLED` is flipped to `true`) posts to a separate
waitlist-kind form:

```
POST https://form-relay-eta.vercel.app/f/tnma-bag-waitlist
Content-Type: application/json
```

Both IDs are set at the top of `script.js`:

```js
const RELAY_BASE = 'https://form-relay-eta.vercel.app/f';
const COMMISSION_FORM_ID = 'tnma-bag-commission';
const WAITLIST_FORM_ID = 'tnma-bag-waitlist';
```

---

## Fields the relay will receive

**Every value is a string.** The relay's `validateSubmission()` does
`typeof raw[field.name] === 'string' ? … : ''`, so an array or a number would be
silently coerced to empty and dropped. The two multi-selects are therefore joined
into one comma-separated string on the client, and the two numeric fields are sent
as numeric strings.

**Values are sent as human labels, not slugs.** The client swaps `everyday-items`
→ `The day's little things`, `bag-4` → `Bag 4`, and so on, so the notification email
reads exactly like the on-screen review. Nothing in the relay needs to know the slugs.

### Commission survey → `tnma-bag-commission`

| Field | Label | Type | Required | Max | Example value |
|---|---|---|---|---|---|
| `name` | Name | `text` | ✅ | 200 | `Thomas Anderson` |
| `email` | Email | `email` | ✅ | — | `you@example.com` |
| `phone` | Phone | `phone` | — | 40 | `+1 555 000 0000` |
| `usage` | Primary use | `text` | — | 200 | `Groceries, Clothes` |
| `bagSize` | Preferred size | `text` | ✅ | 40 | `Standard` |
| `heaviestItem` | Heaviest item | `text` | ✅ | 200 | `a full water bottle` |
| `specificFit` | Needs to fit | `text` | — | 200 | `a 15" laptop` |
| `favoriteColors` | Favorite colors | `text` | ✅ | 200 | `olive green, cream, rust` |
| `dislikedColors` | Colors to avoid | `text` | — | 200 | `neon colors` |
| `allergies` | Fabric allergies | `text` | — | 200 | `wool, latex` |
| `additionalPreferences` | Additional preferences | `textarea` | — | 5000 | free text |
| `instaMatch` | Match an Insta bag | `text` | ✅ | 10 | `Yes` |
| `instaBag` | Matched bag | `text` | — | 20 | `Bag 4` |
| `tattoo` | Tattoo embroidery | `text` | ✅ | 10 | `Yes` |
| `tattooPicks` | Tattoo selections | `text` | — | 200 | `Peace sign, XIII` |
| `tattooCount` | Tattoo count | `number` | — | — | `2` |
| `depositTotal` | Deposit total ($) | `number` | — | — | `100` |
| `_honey` | — (honeypot, not a declared field) | — | — | — | always `""` |

Notes on specific fields:

- **`usage`** is a checkbox group — zero or more of `Groceries`, `Clothes`,
  `Laptop / Books / Other Tech`, `The day's little things`, joined with `, `.
  Longest possible value is ~75 chars.
- **`instaBag`** is only sent when `instaMatch` is `Yes`; otherwise it's `""`.
  Same for **`tattooPicks`** and `tattoo`. A radio left checked from an earlier
  pass through the survey can't leak into the email.
- **`tattooCount`** and **`depositTotal`** are computed, not asked. `depositTotal`
  is `50 + tattooCount × TATTOO_PRICE`, and it's the number the visitor is told to
  send — having it in the email means you don't have to recompute it. `TATTOO_PRICE`
  is a constant at the top of `script.js`.
- **Empty optional fields are dropped by the relay** (it only keeps non-empty
  values after validation), so unanswered questions simply won't appear in the
  notification email rather than showing as blank rows.

### Waitlist → `tnma-bag-waitlist`

| Field | Label | Type | Required | Example |
|---|---|---|---|---|
| `email` | Email | `email` | ✅ | `you@example.com` |
| `_honey` | — (honeypot) | — | — | always `""` |

No `name` is collected — the closed-spots view asks for an email only. `name` stays
declared as optional in the registry; it just won't be sent. That's safe all the way
down: the relay passes it as `name ?? null` into Neon, `firstName: undefined` to the
Resend Audience, and `visitorName: undefined` into the thanks template.

**A waitlist signup does not email you.** `kind: 'waitlist'` takes a different branch
in `app.ts` — it writes the row, syncs the Audience, sends the visitor their thanks
email, and returns. It never calls `sendNotification()`. So a signup shows up in:

- the Neon `waitlist_signups` table (source of truth),
- the Resend Audience named by `audienceId`,
- the Monday digest, under "Waitlists (total size)".

`subjectTemplate` is required by the `FormConfig` type but is **unused** for waitlist
forms — only `sendNotification()` interpolates it. `to[0]` is still load-bearing: it
becomes the `replyTo` on the thanks email, so a visitor who replies reaches you.

If you'd rather be pinged per signup, that's a change in the relay (call
`sendNotification` in the waitlist branch too), not on this site.

---

## Registry entries to paste into form-relay

Add both to the `forms` array in `src/config/forms.ts`, then deploy.
**Replace `allowedOrigins` and `audienceId` before this works.**

```ts
// ── Bags by TNMA — commission survey ──────────────────────────────────────
{
  id: 'tnma-bag-commission',
  clientName: 'Bags by TNMA',
  to: ['tommyonik@gmail.com'],
  subjectTemplate: 'New bag commission from {{name}} (${{depositTotal}} deposit)',
  accentColor: '#8a3324',
  logoUrl: 'https://form-relay-eta.vercel.app/tnma.png',
  redirectUrl: 'https://REPLACE-WITH-SITE-ORIGIN/?sent=1',
  allowedOrigins: ['https://REPLACE-WITH-SITE-ORIGIN'],
  replyToField: 'email',
  autoReply: {
    subject: 'I received your bag commission survey',
    body: [
      'Thanks for submitting your commission survey — I have your answers.',
      'Your spot is confirmed once your deposit arrives. You can send it on Venmo (@Thomas-Onik) or Zelle at (201) 300-7370.',
      'I may reach out during the design process with a question or two.',
    ],
  },
  fields: [
    { name: 'name', label: 'Name', type: 'text', required: true, maxLength: 200 },
    { name: 'email', label: 'Email', type: 'email', required: true },
    { name: 'phone', label: 'Phone', type: 'phone', maxLength: 40 },
    { name: 'usage', label: 'Primary use', type: 'text', maxLength: 200 },
    { name: 'bagSize', label: 'Preferred size', type: 'text', required: true, maxLength: 40 },
    { name: 'heaviestItem', label: 'Heaviest item', type: 'text', required: true, maxLength: 200 },
    { name: 'specificFit', label: 'Needs to fit', type: 'text', maxLength: 200 },
    { name: 'favoriteColors', label: 'Favorite colors', type: 'text', required: true, maxLength: 200 },
    { name: 'dislikedColors', label: 'Colors to avoid', type: 'text', maxLength: 200 },
    { name: 'allergies', label: 'Fabric allergies', type: 'text', maxLength: 200 },
    { name: 'additionalPreferences', label: 'Additional preferences', type: 'textarea', maxLength: 5000 },
    { name: 'instaMatch', label: 'Match an Insta bag', type: 'text', required: true, maxLength: 10 },
    { name: 'instaBag', label: 'Matched bag', type: 'text', maxLength: 20 },
    { name: 'tattoo', label: 'Tattoo embroidery', type: 'text', required: true, maxLength: 10 },
    { name: 'tattooPicks', label: 'Tattoo selections', type: 'text', maxLength: 200 },
    { name: 'tattooCount', label: 'Tattoo count', type: 'number' },
    { name: 'depositTotal', label: 'Deposit total ($)', type: 'number' },
  ],
},

// ── Bags by TNMA — waitlist (shown once all spots are filled) ─────────────
{
  id: 'tnma-bag-waitlist',
  kind: 'waitlist',
  clientName: 'Bags by TNMA',
  to: ['tommyonik@gmail.com'],
  // Required by the type, but unused for kind:'waitlist' — no notification is sent.
  subjectTemplate: 'New bag waitlist signup: {{email}}',
  accentColor: '#8a3324',
  logoUrl: 'https://form-relay-eta.vercel.app/tnma.png',
  redirectUrl: 'https://REPLACE-WITH-SITE-ORIGIN/?waitlist=1',
  allowedOrigins: ['https://REPLACE-WITH-SITE-ORIGIN'],
  waitlist: {
    audienceId: 'REPLACE_WITH_AUDIENCE_ID', // Resend Dashboard → Audiences
    thanksSubject: "You're on the bag commission waitlist",
    thanksBody: [
      "You're on the list. If a spot opens up in this round, or when the next round of commissions opens, you'll hear from me here.",
    ],
  },
  fields: [
    { name: 'email', label: 'Email', type: 'email', required: true },
    { name: 'name', label: 'Name', type: 'text', maxLength: 200 },
  ],
},
```

`subjectTemplate` uses `{{field}}` interpolation against submitted values, so
`${{depositTotal}}` renders as `$100`. If a field is empty it interpolates to an
empty string and the extra whitespace is collapsed.

---

## Before go-live

1. **Register both forms** in `tnma-form-relay`'s `src/config/forms.ts` and deploy it.
2. **Set `allowedOrigins`** on both to this site's real `https://` origin, no
   trailing slash. This is the most common failure: a missing origin returns
   `403 {"ok":false,"error":"Origin not allowed"}` and nothing is emailed. The
   relay's own CORS layer also only reflects origins that appear in some form's
   `allowedOrigins`, so the browser can't even read the response without it.
3. **Create the Resend Audience** and put its id in the waitlist entry's
   `audienceId` — the relay throws at cold start (500ing *every* form) if a
   `kind: 'waitlist'` entry has no `waitlist` config.
4. **Send one real test submission** and confirm the email arrives with every
   field rendered as expected.
5. **Set `dailyCap`** if you want something tighter than the default of 200.
   Six spots means real volume is tiny; a cap of ~50 still leaves plenty of room.

---

## Local development

Serve over HTTP rather than opening the file directly — a `file://` page sends
`Origin: null`, which can never match an allowlist entry:

```sh
python3 -m http.server 8000
```

To test submissions against the live relay, temporarily add `http://localhost`
to the form's `allowedOrigins`. The relay matches with `startsWith`, so that one
entry covers every localhost port. **Remove it before go-live.**

---

## Things worth knowing

- **A `200` does not guarantee an email was sent.** The relay deliberately returns
  a fake success for honeypot hits, rate-limit trips, duplicate payloads within
  5 minutes, and daily-cap overruns, so bots never learn what got caught. When
  testing, confirm against the inbox, not the response.
- **Duplicate suppression is payload-identical within 5 minutes.** Submitting the
  survey, hitting restart, and re-submitting the exact same answers inside that
  window is accepted but not re-emailed.
- **Rate limit is 10 requests per IP per form per 10 minutes.**
- **The honeypot must stay in the layout.** `.honeypot` uses off-screen
  positioning rather than `display: none` because bots skip hidden fields. Don't
  "clean it up" into a `hidden` attribute.
- **Required fields are enforced client-side too.** `advance()` in `script.js`
  gates forward navigation on `validateSlide()`, so a missed required field is
  caught on the slide that owns it rather than coming back as a 422 on the final
  screen. Keep the two `required` sets — HTML attributes and the registry — in sync.
- **Turnstile is not wired into this page.** If `TURNSTILE_SECRET_KEY` is ever set
  on the relay deployment, every submission from this site starts failing the spam
  check and returning a fake success. A `cf-turnstile-response` token would need
  to be added to the payload first.
