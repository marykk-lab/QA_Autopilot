# Competitor & market analysis

*Researched 1 Oct 2026. Pricing from secondary sources (comparison blogs), not
vendor price pages — **re-check every number against the vendor's own site before
putting it in a pitch**, because most of these tools quote rather than publish.*

## The finding that matters most

**Playwright now ships its own AI test agents, free and built in.** `npx playwright
init-agents --loop=claude-code` installs three agents:

| Agent | What it does |
|---|---|
| 🎭 Planner | Explores the app and produces a Markdown test plan |
| 🎭 Generator | Turns that plan into Playwright test files, verifying selectors live |
| 🎭 Healer | Runs the suite and repairs failing tests until they pass |

It works with VS Code (1.105+), **Claude Code**, Codex and OpenCode. Cost: zero.

This is the same core idea as this project — natural language in, Playwright tests
out — from the people who make Playwright. **Pretending it doesn't exist would sink
the pitch the moment anyone searches for it.** Naming it first, and being precise
about what it doesn't do, is the stronger move.

## What Playwright's own agents do *not* do

1. **They are a developer tool, not a product.** They require a terminal, a Node
   project, an editor, and a paid coding-agent subscription. A manual QA tester or
   a product manager cannot use them.
2. **No interface.** No web UI, no place for a non-developer to type a test and see
   it run.
3. **No team layer.** No shared test library, no run history, no dashboard, no
   roles — nothing that makes a test suite a team asset rather than one dev's folder.
4. **Local only.** No hosted runs, no scheduled regression runs, no CI reporting of
   its own.

## The field

| Tool | Approach | Price (Oct 2026, verify) | Lock-in |
|---|---|---|---|
| **Playwright + Test Agents** | CLI agents in your editor | **Free** (plus your LLM/agent subscription) | None — plain Playwright |
| **Claude Code + Playwright MCP** | Workflow, not a product: an agent drives a browser and writes tests | Agent subscription only | None — plain Playwright |
| **testRigor** | English-like proprietary test language | ~$300/mo (Linux+Chrome) to ~$900/mo | **High** — tests are in their DSL |
| **mabl** | Agentic creation + auto-healing, credit model | ~$499/mo entry, custom above | **High** — platform-hosted |
| **Testim** (Tricentis) | AI locators, agentic authoring | Custom / quote | **High** |
| **Autify Nexus** | NL test creation, credit model | $99/mo annual ($120 monthly); free tier w/ 2 000 credits | **High** |
| **Reflect** | No-code recorder + NL | Sales contact only, 5 000–40 000 credits/mo | **High** |

Two clusters: **free developer tooling with no product layer**, and **$300–900/month
enterprise platforms that own your tests**. There is very little in between.

### Cost per generated test (the number that wins arguments)

Published estimates for LLM test generation:

| Approach | Cost per test |
|---|---|
| Recording-based (cheap model) | $0.02–0.08 |
| Prompt-based (frontier model) | $0.10–0.30 |
| Autonomous agent exploration | $0.50–2.00 |

This prototype is prompt-based, and caching makes a repeated request free. So the
marginal cost of a test here is **cents** — against $300–900/month for a seat you
may barely use. That gap is the commercial argument.

## Where this project fits

> **For small teams that can't justify $500/month, but whose testers aren't
> developers: a web UI where anyone describes a test in plain language, and the
> output is plain Playwright code the team owns and can run anywhere.**

Three defensible claims, in priority order:

1. **No lock-in.** The deliverable is a `.spec.ts` file. Delete the platform
   tomorrow and every test still runs. Nothing in the paid cluster can say that.
2. **Non-developers can use it.** This is the gap Playwright's own agents leave
   wide open, and it's the whole reason a product exists on top of them.
3. **Cents, not hundreds.** Transparent per-test cost instead of credit bundles.

## Honest risks — put these in the documentation, not just in your head

- **Microsoft could close gap 2 at any time.** A web UI on top of the Playwright
  agents is an obvious next step for them. The project's defence is being small,
  cheap and self-hostable, not being technically ahead.
- **Generated tests need review.** A test that asserts the wrong thing is worse
  than no test. Any serious version needs a human approval step before a test
  enters the suite.
- **Selector resilience is the real engineering problem**, not the generation.
  This is where Playwright's Healer agent is genuinely ahead.

## Sources

- [Playwright Test Agents — official docs](https://playwright.dev/docs/test-agents)
- [Playwright AI Test Generation: Complete 2026 Guide](https://blog.buildbetter.ai/playwright-test-generation-with-ai-complete-2026-guide/)
- [12 AI test automation tools for 2026: features, pricing, and trade-offs](https://decode.agency/article/ai-test-automation-tools/)
- [testRigor vs Testim vs Mabl (2026)](https://timetotest.tech/compare/testrigor-testim-mabl/)
- [How Much Does testRigor Pricing Really Cost?](https://getautonoma.com/blog/testrigor-pricing)
- [AI Testing Platforms Compared: How to Choose in 2026](https://getautonoma.com/blog/ai-testing-platform-comparison)
- [Testim AI Test Automation: Features, Pricing, Limits](https://qodex.ai/blog/testim-ai-testing)


---

# Build vs. buy: why not just use Playwright's own agents?

The obvious objection, and the right one to ask. "Playwright Test Agents" and
"Playwright MCP" are two different things, and they answer it differently.

## Playwright Test Agents — can't be built on

Planner, generator and healer are **prompt packs** installed with
`npx playwright init-agents --loop=<editor>`. They run inside a coding agent:
Claude Code, Copilot, Codex, OpenCode. They need a terminal, an editor, and a paid
agent subscription. You can use them; you cannot build a product on them, because
the product would be "install these four other things first".

## Playwright MCP — should be built on

A standalone server (`npx @playwright/mcp@latest --port 8931`) that any program
connects to over HTTP. It exposes 50+ browser tools and returns **accessibility
snapshots, not screenshots**. It already solves things this project solved worse:

| Built here | Already in Playwright MCP |
|---|---|
| `inspect.ts` — snapshot capture, settle loop, sign-in config | live snapshots, taken at any point |
| `states` — click, then capture the dialog | the agent clicks and snapshots natively |
| Selector guessing (three of our four failure classes) | `generate locators`, `verify elements` |
| Credential and sign-in configuration | persistent profiles, storage state |
| — | **extension mode: drives the user's real browser with their real session** |

A live browser would have prevented the dialog failure, the volatile item-count
failure, and the post-click menu failure outright. Our snapshot layer is a weaker,
hand-maintained substitute for something that already exists and is maintained by
the Playwright team.

**Conclusion: replace `lib/inspect.ts` with Playwright MCP.** That deletes roughly
250 lines of code this project is maintaining badly, and removes a whole class of
staleness bug (a snapshot is a photo; MCP looks at the live page).

## What is not in MCP — and is therefore the actual product

MCP supplies tools. It supplies no judgement and no product:

- **The review gate.** MCP will let an agent write whatever it likes. The false
  green documented in `scope.md` — a repair that rewrote a test to target a
  different application and passed — is exactly what an ungated loop produces.
- **A web UI** for describing, reviewing, approving and running.
- **Suite management**, run history, per-test cost.
- **The rules learned by failing**: secrets from env, unique data per run, no
  volatile text in locators, assert only what was asked. These are judgement, and
  no tool server provides them.
- **A path for someone without a terminal** or a per-seat coding-agent subscription.

## The resulting position

> Don't rebuild the engine. Build the layer that rides on it: a reviewed,
> non-developer-facing workflow over Playwright MCP, whose output is portable
> Playwright code the team owns.

This is a narrower claim than the project started with, and a more defensible one.
It also concedes the developer market outright — developers already have the agents,
free, inside the editor they already use. The remaining segment is people who need
tests and cannot write them, priced out of mabl and testRigor at $300–900/month.

## Migration plan (after the current milestone, not before)

1. Stand up `@playwright/mcp` as a child process; connect over HTTP.
2. Replace `inspect.ts` calls with MCP's snapshot and navigation tools.
3. Delete `states`, `settleMs` and the sign-in locator config — all unnecessary
   once the browser is live.
4. Keep `prompt.ts`, the review gate, the suite UI, the repair loop and cost
   reporting unchanged. That is the part worth keeping.
