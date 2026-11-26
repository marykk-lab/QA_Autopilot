"use client";

import { useState, type FormEvent } from "react";
import { tokenize } from "@/lib/highlight";
import type { LastRun } from "@/lib/db";
import type { RunResult, SpecResult } from "@/lib/runner";
import type { GeneratedTest } from "@/lib/types";

/** A generation or a repair awaiting review. Nothing is on disk until it's approved. */
interface Pending extends GeneratedTest {
  description?: string;
  /** Set when this came from the repair loop rather than a first generation. */
  attempt?: number;
}

interface RunState {
  status: "idle" | "running" | "passed" | "failed" | "error";
  result?: RunResult;
  error?: string;
  repairError?: string;
  lastRun?: LastRun;
}

interface Props {
  email: string;
  baseURL: string;
  liveGeneration: boolean;
  initialTests: string[];
  initialLastRuns: Record<string, LastRun>;
  examples: string[];
}

async function post<T>(path: string, data: unknown): Promise<T> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(data),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? `Request failed (${res.status})`);
  return body as T;
}

export function Workbench({
  email,
  baseURL,
  liveGeneration,
  initialTests,
  initialLastRuns,
  examples,
}: Props) {
  const [description, setDescription] = useState("");
  const [generating, setGenerating] = useState(false);
  const [composeError, setComposeError] = useState<string | null>(null);

  const [pending, setPending] = useState<Pending | null>(null);
  const [approving, setApproving] = useState(false);
  const [warning, setWarning] = useState<string | null>(null);

  const [tests, setTests] = useState(initialTests);
  const [runs, setRuns] = useState<Record<string, RunState>>(() =>
    Object.fromEntries(
      initialTests.map((f) => [
        f,
        { status: "idle", lastRun: initialLastRuns[f] } satisfies RunState,
      ]),
    ),
  );
  const [runningAll, setRunningAll] = useState(false);

  async function generate(text: string) {
    const trimmed = text.trim();
    if (!trimmed) return;

    setGenerating(true);
    setComposeError(null);
    try {
      setPending(await post<Pending>("/api/generate", { description: trimmed }));
    } catch (error) {
      setComposeError(error instanceof Error ? error.message : String(error));
      setPending(null);
    } finally {
      setGenerating(false);
    }
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    void generate(description);
  }

  async function approve() {
    if (!pending) return;
    setApproving(true);
    setWarning(null);
    try {
      const { warning: saveWarning } = await post<{ warning: string | null }>("/api/approve", {
        filename: pending.filename,
        code: pending.code,
        description: pending.description ?? null,
        source: pending.source,
        usage: pending.usage,
      });
      const { filename } = pending;
      setPending(null);
      setWarning(saveWarning);
      setTests((current) => (current.includes(filename) ? current : [...current, filename].sort()));
      setRuns((current) => ({ ...current, [filename]: { status: "idle" } }));
      await runTest(filename);
    } catch (error) {
      setComposeError(error instanceof Error ? error.message : String(error));
    } finally {
      setApproving(false);
    }
  }

  async function runTest(filename: string) {
    setRuns((current) => ({ ...current, [filename]: { status: "running" } }));
    try {
      const result = await post<RunResult & { warning: string | null }>("/api/run", { filename });
      setRuns((current) => ({
        ...current,
        [filename]: { status: result.passed ? "passed" : "failed", result },
      }));
      if (result.warning) setWarning(result.warning);
    } catch (error) {
      setRuns((current) => ({
        ...current,
        [filename]: { status: "error", error: error instanceof Error ? error.message : String(error) },
      }));
    }
  }

  async function repair(filename: string) {
    setRuns((current) => ({
      ...current,
      [filename]: { ...current[filename]!, repairError: undefined },
    }));
    try {
      setPending(await post<Pending>("/api/repair", { filename }));
    } catch (error) {
      // Inline, next to the button that was clicked — an error at the top of the
      // page reads as "nothing happened".
      setRuns((current) => ({
        ...current,
        [filename]: {
          ...current[filename]!,
          repairError: error instanceof Error ? error.message : String(error),
        },
      }));
    }
  }

  async function runAll() {
    setRunningAll(true);
    try {
      for (const filename of tests) await runTest(filename);
    } finally {
      setRunningAll(false);
    }
  }

  return (
    <>
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true" />
          <h1>AI QA platform</h1>
        </div>
        <div className="topbar-meta">
          <span className="meta-item">
            target <code>{new URL(baseURL).host}</code>
          </span>
          <span
            className={liveGeneration ? "badge" : "badge subtle"}
            title={
              liveGeneration
                ? "ANTHROPIC_API_KEY is set — new requests go to Claude"
                : "No ANTHROPIC_API_KEY — only cached requests can be served"
            }
          >
            {liveGeneration ? "live generation" : "cache-only"}
          </span>
          <span className="meta-item">{email}</span>
          <form action="/auth/signout" method="post">
            <button className="ghost signout" type="submit">
              Sign out
            </button>
          </form>
        </div>
      </header>

      <main>
        {/* Step 1 — describe */}
        <section className="panel" aria-labelledby="compose-title">
          <div className="panel-head">
            <span className="step">1</span>
            <h2 id="compose-title">Describe the test</h2>
          </div>
          <form onSubmit={onSubmit} autoComplete="off">
            <textarea
              rows={3}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="log in as the standard user and check the products page appears"
              aria-label="Test description"
            />
            <div className="compose-actions">
              {examples.length > 0 && <p className="hint">Or try one:</p>}
              <button className="primary" type="submit" disabled={generating}>
                {generating ? "Generating…" : "Generate test"}
              </button>
            </div>
            {examples.length > 0 && (
              <div className="examples">
                {examples.map((text) => (
                  <button
                    key={text}
                    type="button"
                    className="chip"
                    onClick={() => {
                      setDescription(text);
                      void generate(text);
                    }}
                  >
                    {text}
                  </button>
                ))}
              </div>
            )}
          </form>
          {composeError && <p className="error">{composeError}</p>}
        </section>

        {/* Step 2 — review */}
        {pending && (
          <section className="panel" aria-labelledby="review-title">
            <div className="panel-head">
              <span className="step">2</span>
              <h2 id="review-title">
                {pending.attempt
                  ? "Review the fix before it replaces the test"
                  : "Review before it joins the suite"}
              </h2>
              <span className="spacer" />
              <span className="badge subtle">{sourceLabel(pending)}</span>
            </div>
            <p className="note">
              Read it. A generated test that asserts the wrong thing still passes — and then it
              hides the bug instead of catching it.
            </p>
            <div className="code-head">
              <code>{pending.filename}</code>
            </div>
            <pre className="code">
              <code>
                {tokenize(pending.code).map((token, i) =>
                  token.kind === "plain" ? (
                    token.text
                  ) : (
                    <span key={i} className={`tok-${token.kind}`}>
                      {token.text}
                    </span>
                  ),
                )}
              </code>
            </pre>
            <div className="review-actions">
              <button className="primary" onClick={approve} disabled={approving}>
                {approving ? "Saving…" : "Approve & run"}
              </button>
              <button className="ghost" onClick={() => setPending(null)}>
                Discard
              </button>
            </div>
          </section>
        )}

        {/* Step 3 — suite */}
        <section className="panel" aria-labelledby="suite-title">
          <div className="panel-head">
            <span className="step">3</span>
            <h2 id="suite-title">Test suite</h2>
            <span className="spacer" />
            <button className="ghost small" onClick={runAll} disabled={runningAll || !tests.length}>
              Run all
            </button>
          </div>
          <ul className="suite">
            {tests.map((filename) => (
              <SuiteItem
                key={filename}
                filename={filename}
                state={runs[filename] ?? { status: "idle" }}
                onRun={() => runTest(filename)}
                onRepair={() => repair(filename)}
              />
            ))}
          </ul>
          {warning && <p className="warning">{warning}</p>}
          <p className="note">
            These are plain Playwright specs in <code>tests/generated/</code>. Delete this app
            tomorrow and every one of them still runs — that is the point.
          </p>
        </section>
      </main>
    </>
  );
}

function SuiteItem({
  filename,
  state,
  onRun,
  onRepair,
}: {
  filename: string;
  state: RunState;
  onRun: () => void;
  onRepair: () => void;
}) {
  const [repairing, setRepairing] = useState(false);

  return (
    <li className="suite-item">
      <div className="suite-row">
        <span className="suite-name">{filename}</span>
        <span className={`badge ${badgeClass(state.status)}`}>{statusLabel(state)}</span>
        <button className="ghost small" onClick={onRun} disabled={state.status === "running"}>
          Run
        </button>
        {state.status === "failed" && (
          <button
            className="primary small"
            disabled={repairing}
            onClick={async () => {
              setRepairing(true);
              try {
                await onRepair();
              } finally {
                setRepairing(false);
              }
            }}
          >
            {repairing ? "Repairing…" : "Fix with AI"}
          </button>
        )}
      </div>

      {state.result?.specs.length ? (
        <ul className="spec-results">
          {state.result.specs.map((spec, i) => (
            <SpecRow key={`${spec.title}-${i}`} spec={spec} />
          ))}
        </ul>
      ) : null}

      {state.result?.runError && <pre className="failure">{state.result.runError}</pre>}
      {state.error && <pre className="failure">{state.error}</pre>}
      {state.repairError && <pre className="failure">{state.repairError}</pre>}
    </li>
  );
}

function SpecRow({ spec }: { spec: SpecResult }) {
  const ok = spec.status === "passed";
  return (
    <>
      <li>
        <span className={`spec-icon ${ok ? "pass" : "fail"}`}>{ok ? "✓" : "✗"}</span>
        <span>{spec.title}</span>
        <span className="duration">{spec.durationMs} ms</span>
      </li>
      {spec.error && <pre className="failure">{spec.error}</pre>}
    </>
  );
}

function sourceLabel(test: Pending): string {
  if (test.source !== "claude" || !test.usage) return "replayed from cache · no API call";
  const { inputTokens, outputTokens, estimatedCostUsd } = test.usage;
  const prefix = test.attempt ? `repair ${test.attempt}` : "Claude";
  return `${prefix} · ${inputTokens} in / ${outputTokens} out · $${estimatedCostUsd.toFixed(4)}`;
}

function badgeClass(status: RunState["status"]): string {
  if (status === "passed") return "pass";
  if (status === "failed" || status === "error") return "fail";
  if (status === "running") return "running";
  return "subtle";
}

/**
 * An idle test shows its last recorded result rather than "not run" — the whole
 * reason runs are persisted is that a reload shouldn't erase what you know.
 */
function statusLabel(state: RunState): string {
  switch (state.status) {
    case "running":
      return "running…";
    case "passed":
      return "passed";
    case "failed":
      return "failed";
    case "error":
      return "error";
    default:
      return state.lastRun
        ? `${state.lastRun.passed ? "passed" : "failed"} · ${relativeTime(state.lastRun.at)}`
        : "not run";
  }
}

function relativeTime(iso: string): string {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}
