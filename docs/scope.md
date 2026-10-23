# Scope

Deliverable for the year project: ~50% working prototype, ~50% documentation + pitch.
This file draws the line so the prototype can be *finished* rather than endlessly
widened.

## Working today (1 Oct 2026)

- `npm run gen -- "<description>"` → a Playwright spec in `tests/generated/`
- Generation via the Claude API (`claude-opus-5`), with the system prompt enforcing
  resilient locators, web-first assertions and a relative `baseURL`
- Response validation: a file that doesn't import `@playwright/test` is rejected
  rather than written
- Prompt-hash cache: repeat requests are free, and the demo runs with no API key
- Screenshot comparison, generated only when the request asks about appearance
- Verified end to end against `https://www.saucedemo.com`: **4 Claude-generated
  specs, 4 passing**, visual baseline included
- **Page-aware generation** (`npm run inspect`): each page's accessibility tree is
  captured from the live site and supplied to the model, so locators come from
  what is actually on the page instead of being guessed
- **Web UI** (`npm run dev`): describe → review → approve → run, pass/fail and the
  real Playwright error inline, light and dark
- **Review step**: generation and approval are separate endpoints, so nothing
  reaches the suite without a human reading it first

## In scope before hand-in

1. ~~**Review step**~~ — done 1 Oct.
2. ~~**Web UI**~~ — done 1 Oct.
3. **Eval set** — the real gap now, and the three failures below show why it matters. Measure how often generation produces a
   correct test, on a site that wasn't built for automation. Without this, every
   quality claim is three hand-picked examples.
4. **Run history** — persist results so the suite page shows what passed last time,
   not just this session.
5. **Repair loop** — on failure, feed the error and page state back and propose a
   fix. Deliberately last: it's the hardest part and Playwright's Healer already
   does it well.
6. **Pitch + docs** — market analysis (done), architecture, cost model, demo script.

## Explicitly out of scope

- Browsers other than Chromium
- Authentication, multi-tenancy, billing
- Hosted/cloud test execution
- Mobile or native app testing
- Competing with the Healer agent on selector self-repair

## Real-world obstacles, and where each one stands

These are the things that actually break browser automation on real sites.

### 1. Late-rendering DOM — handled
A React/Next app renders nothing at `domcontentloaded`. The first version of
`inspect` captured there and returned an **empty tree with no error**, which is the
worst possible failure: the model silently goes back to guessing. Measured against
`fixtures/late-render.html` (content appears after 2s):

| | captured |
|---|---|
| snapshot at `domcontentloaded` | 0 chars |
| settle loop (capture until two reads match) | full tree |

The capture now repeats until the tree stops changing, and warns when a page yields
under 200 characters. A page can also declare `waitFor` (wait for a specific element)
and `inspect.settleMs` for a slower app.

### 2. Content inside iframes — opt-in
`ariaSnapshot()` does not cross frame boundaries. Set `"frames": true` on a page and
each iframe is captured separately. Cross-origin frames are marked unreadable rather
than silently omitted — payment widgets and embedded auth usually fall here.

### 3. State that only exists after a click — handled
A dialog, menu or expanded panel is not in a static page capture. Measured on
Feedboon's "New task" dialog: the model flagged the gap in a TODO and guessed
`input[type='text'], textarea` for the title field. The real field is an `<input>`
with **no type attribute**, so that selector matched the *description* textarea
instead; the title stayed empty, the "Create task" button stayed disabled, and the
click waited 30s for it to become enabled.

A page can now declare `states` — a sequence of clicks plus what to wait for — and
each resulting view is captured as its own tree. With the dialog supplied, the
regenerated test used `getByRole("textbox", { name: "Title *" })` and passed.

### 4. Pages with no meaningful DOM — hard limit
Canvas-rendered apps, WebGL, and some virtualised tables expose almost nothing to the
accessibility tree. There is no snapshot worth giving the model, and no prompt fixes
it. Such apps need a different approach entirely (visual/coordinate-based testing).
Say so rather than pretending the tool covers them.

### 5. Bot protection (Cloudflare and similar) — out of scope by design
Cloudflare, hCaptcha and friends are built to stop exactly this kind of automation,
and working around them means defeating an access control. A QA tool's answer is to
run where protection isn't in the way: **a local instance, a staging environment, or
a production allowlist for the test runner's IP**, arranged with whoever owns the
site. Testing an app you run locally sidesteps this completely — which is the main
practical reason to test a local instance rather than production.

## Known honest limitations

- A generated test can assert the wrong thing while passing. Review is mandatory.
- Generation quality depends on the page trees being current. After a UI change,
  `npm run inspect` must be re-run or locators go stale.
- Only pages listed in `target.json` are captured. A flow that reaches a page not
  in that list is back to guessing.
- **Snapshots capture pages, not post-interaction states.** Anything that only
  appears after a click — an opened menu, a modal, a toast — is not in the tree.
  See `examples/known-limitation-burger-menu.spec.ts`, kept as a failing test on
  purpose. Closing this means driving the browser *during* generation.
- Pricing in the market analysis comes from comparison blogs, not vendor pages.
- No evaluation set yet: there is no measurement of how often generation is
  actually correct. That's the first thing a real product would need.


## What the first real generations taught us

Three consecutive failures on one request, each with a different cause. This is the
most useful evidence the project has produced so far, and it belongs in the pitch.

| # | What came back | Why it failed | Fix |
|---|---|---|---|
| 1 | `process.env.SAUCEDEMO_PASSWORD` | The prompt said "never invent a credential", and nothing told the model which accounts exist | `target.json` — declare the test accounts |
| 2 | Correct cart test **plus** unrequested navigation into the product page | The model added assertions nobody asked for, and the extra ones guessed wrong | Prompt rule: assert exactly what was asked |
| 3 | `getByRole("button", { name: "Add to cart Sauce Labs Backpack" })` | The real accessible name is just "Add to cart". The model had never seen the page | `npm run inspect` — supply the accessibility tree |
| 4 | Correct "Open Menu" click, then a guessed `#bm-menu-wrap` for the opened panel | The panel only exists after the click, so it was not in the static tree. The model flagged this itself in a TODO | Open — needs live browser interaction during generation |

Failure 1 was a prompt bug, not a model bug: the model followed the rule it was
given, correctly, and the rule was wrong. Failure 3 is the structural one — no
prompt wording can substitute for seeing the page. That is the single most
important design conclusion in this project.

Failure 4 is the honest edge of the current design, and it is worth demonstrating
rather than hiding: when the model lacked the information it needed, it said so in
a comment instead of failing silently. A generated test that announces its own
uncertainty is reviewable. One that quietly asserts the wrong thing is not — and
that is the whole argument for the review step.


## Two correctness rules learned from generating against a real app

**Secrets must never reach a generated file.** The first Feedboon runs inlined a real
email and password into three spec files and four cache entries — all committed
files. Credentials are now declared as `usernameEnv` / `passwordEnv` in the target
config, and the prompt forbids emitting a literal value even when the model can see
one. Captured page trees are gitignored too: a snapshot of a logged-in page contains
whatever personal data is on screen.

**A test that creates data must survive running twice.** The first passing version
created a task with a fixed title; the second run created a duplicate and the
assertion matched two elements (strict mode violation). Generated tests now give
created records a unique suffix and assert on that exact value. This is the kind of
defect that passes review and fails in CI the next day.


**Locators must not contain volatile text.** A generated test clicked
`getByRole("link", { name: "test_org google.com 62 2" })` — an accessible name that
includes the project's item count. The count was 62 when the tree was captured and 70
when the test ran, so the locator could never match and the click timed out. The
captured tree is a photo of one moment; counts, badges, dates and totals all drift.
The prompt now forbids volatile values in locators and the page-structure preamble
says the tree is point-in-time. The regenerated test navigates by URL instead.

### The pattern worth noticing

Every run against a real application has surfaced a new class of defect, and each one
became a rule:

| Run | Defect | Rule added |
|---|---|---|
| 1 | Credentials inlined into committed spec files | Secrets come from env, never literals |
| 2 | Guessed selectors for a dialog that wasn't captured | Capture post-interaction `states` |
| 3 | Fixed record title collided on the second run | Unique suffix per created record |
| 4 | Locator contained a live item count | No volatile text in locators |

Four rules from four runs on one app. That is the argument for an eval set: finding
these one at a time, by hand, does not scale past a single application — and a rule
learned from Feedboon may not generalise to the next app. Measuring is the only way
to know which of these rules actually hold.


## The repair loop, and the false green it produced first

`npm run fix -- <spec>` (and "Fix with AI" in the UI) feeds a failing test's own
error back to the model, re-runs, and repeats up to three times. Repairs go through
the same human review as a first generation.

It worked immediately on a real failure: `selectOption` against a Radix combobox
(`<button role="combobox">`, not a native `<select>`). The repair changed three
lines — click the combobox, click the option — kept the assertion, and extended the
existing TODO with the reason.

**Then it produced a false green, and that is the more important result.** Repairing
a saucedemo test while the only captured page tree on disk was Feedboon's, the model
rewrote the test to target Feedboon: it deleted the `test.use({ baseURL })` line,
replaced the login steps and the assertion, and kept the original test name. It
passed. The suite reported a green test called "standard user reaches the products
page" that was actually exercising a different application.

No prompt wording prevents this — the model was handed the wrong context and did the
reasonable thing with it. Three structural fixes:

1. **Page trees are stored per target** (`page-cache/<host>.json`), selected by the
   spec's own `test.use({ baseURL })`.
2. **A repair with no matching page tree refuses** rather than guessing, and says
   which `npm run inspect` to run.
3. **The target config is only supplied when its host matches the spec's**, so a
   saucedemo test is never handed Feedboon's accounts and notes.

With those in place the same repair changed exactly one line: `"Log In Now"` →
`"Login"`.

The lesson generalises past this tool: an automatic repair loop is only as safe as
the context it is given, and a repair that makes a test pass is not evidence that it
made the test correct. This is the strongest argument in the project for keeping a
human review step in front of every write.

## Creating data exhausts real resources

Unique titles stop records colliding, but they don't stop a test from consuming
quota. Repeated runs of a "create a project" test filled the Individual plan's 3/3
project limit, after which the test failed legitimately — the app correctly refuses
and shows an upgrade prompt.

A creation test needs teardown, or an environment that resets. Neither exists yet;
`npm run inspect` and the generated tests all assume a stable, hand-maintained
account. That is the next correctness gap after the eval set.
