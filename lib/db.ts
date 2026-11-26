import type { User } from "@supabase/supabase-js";
import { createClient } from "./supabase/server";
import { readPinnedBaseURL } from "./generate";
import type { GeneratedTest } from "./types";
import type { RunResult } from "./runner";

/**
 * Recording approvals and runs.
 *
 * The spec files on disk stay the source of truth for the test code — they are
 * plain Playwright files and have to keep working without this app. These rows
 * are the history around them: what was approved, what it cost, and how it ran.
 *
 * Every function returns a warning string instead of throwing. A database that
 * is down must not stop a test from being approved or run; it must also not
 * pretend it saved something, so the warning is passed back to the UI.
 */

export async function recordSpec(
  user: User,
  test: GeneratedTest,
  baseURL: string,
  description: string | null,
): Promise<string | null> {
  const supabase = await createClient();
  const { error } = await supabase.from("specs").upsert(
    {
      user_id: user.id,
      filename: test.filename,
      code: test.code,
      // Omitted rather than nulled when absent: on a re-approval the upsert only
      // writes the columns it is given, so an existing description survives. The
      // (description, code) pair is the unit the eval set measures.
      ...(description ? { description } : {}),
      base_url: readPinnedBaseURL(test.code) ?? baseURL,
      source: test.source,
      input_tokens: test.usage?.inputTokens ?? null,
      output_tokens: test.usage?.outputTokens ?? null,
      cost_usd: test.usage?.estimatedCostUsd ?? null,
      approved_at: new Date().toISOString(),
    },
    { onConflict: "user_id,filename" },
  );
  return error ? `Approved on disk, but not recorded in the database: ${error.message}` : null;
}

export async function recordRun(user: User, run: RunResult): Promise<string | null> {
  const supabase = await createClient();
  const { data: spec } = await supabase
    .from("specs")
    .select("id")
    .eq("user_id", user.id)
    .eq("filename", run.filename)
    .maybeSingle();

  const { error } = await supabase.from("runs").insert({
    user_id: user.id,
    spec_id: spec?.id ?? null,
    filename: run.filename,
    passed: run.passed,
    results: run.specs,
    run_error: run.runError ?? null,
    duration_ms: run.specs.reduce((total, s) => total + s.durationMs, 0),
  });
  return error ? `Run finished, but not recorded in the database: ${error.message}` : null;
}

export interface LastRun {
  passed: boolean;
  at: string;
}

/**
 * Last known result per spec, so a reloaded page doesn't show every test as
 * "not run" when it ran five minutes ago.
 */
export async function lastRuns(user: User): Promise<Record<string, LastRun>> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("runs")
    .select("filename, passed, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(200);

  const latest: Record<string, LastRun> = {};
  for (const row of data ?? []) {
    latest[row.filename] ??= { passed: row.passed, at: row.created_at };
  }
  return latest;
}
