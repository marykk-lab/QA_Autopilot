const $ = (id) => document.getElementById(id);

/** The test currently awaiting review. Nothing is written to disk until it's approved. */
let pending = null;

// ---------- api ----------

async function api(path, options) {
  const res = await fetch(path, options);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    // Static files are read per request but routes are not: a server started
    // before an endpoint existed serves this page and 404s the call.
    if (res.status === 404 && path.startsWith("/api/")) {
      throw new Error(
        `This page is newer than the server process (${path} doesn't exist on it). ` +
          `Restart it: stop npm run dev and start it again.`,
      );
    }
    throw new Error(body.error ?? `Request failed (${res.status})`);
  }
  return body;
}

const post = (path, data) =>
  api(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(data),
  });

// ---------- boot ----------

(async function init() {
  try {
    const { baseURL, liveGeneration } = await api("/api/config");
    $("target").textContent = new URL(baseURL).host;
    const mode = $("mode");
    mode.textContent = liveGeneration ? "live generation" : "cache-only";
    mode.title = liveGeneration
      ? "ANTHROPIC_API_KEY is set — new requests go to Claude"
      : "No ANTHROPIC_API_KEY — only cached requests can be served";
    if (!liveGeneration) mode.classList.add("subtle");
  } catch {
    $("mode").textContent = "server unreachable";
  }

  const { examples } = await api("/api/examples").catch(() => ({ examples: [] }));
  const container = $("examples");
  if (!examples.length) {
    $("examples-hint").hidden = true;
  }
  for (const text of examples) {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "chip";
    chip.textContent = text;
    chip.addEventListener("click", () => {
      $("description").value = text;
      $("compose").requestSubmit();
    });
    container.append(chip);
  }

  await refreshSuite();
})();

// ---------- step 1: generate ----------

$("compose").addEventListener("submit", async (event) => {
  event.preventDefault();
  const description = $("description").value.trim();
  if (!description) return;

  const button = $("generate-btn");
  button.disabled = true;
  button.textContent = "Generating…";
  showError(null);

  try {
    pending = await post("/api/generate", { description });
    renderReview(pending);
  } catch (error) {
    showError(error.message);
    $("review-panel").hidden = true;
  } finally {
    button.disabled = false;
    button.textContent = "Generate test";
  }
});

function renderReview(test, context) {
  $("review-title").textContent = context
    ? "Review the fix before it replaces the test"
    : "Review before it joins the suite";
  $("review-filename").textContent = test.filename;
  $("review-code").innerHTML = highlight(test.code);

  const source = $("review-source");
  if (test.source === "claude") {
    const { inputTokens, outputTokens, estimatedCostUsd } = test.usage;
    const prefix = test.attempt ? `repair ${test.attempt}` : "Claude";
    source.textContent = `${prefix} · ${inputTokens} in / ${outputTokens} out · $${estimatedCostUsd.toFixed(4)}`;
  } else {
    source.textContent = "replayed from cache · no API call";
  }

  $("review-panel").hidden = false;
  $("review-panel").scrollIntoView({ behavior: "smooth", block: "nearest" });
}

// ---------- step 2: review ----------

$("discard-btn").addEventListener("click", () => {
  pending = null;
  $("review-panel").hidden = true;
});

$("approve-btn").addEventListener("click", async () => {
  if (!pending) return;
  const button = $("approve-btn");
  button.disabled = true;
  button.textContent = "Saving…";

  try {
    await post("/api/approve", { filename: pending.filename, code: pending.code });
    const filename = pending.filename;
    pending = null;
    $("review-panel").hidden = true;
    await refreshSuite();
    await runTest(filename);
  } catch (error) {
    showError(error.message);
  } finally {
    button.disabled = false;
    button.textContent = "Approve & run";
  }
});

// ---------- step 3: suite ----------

async function refreshSuite() {
  const { tests } = await api("/api/tests");
  const list = $("suite");
  const existing = new Set([...list.children].map((li) => li.dataset.file));

  for (const filename of tests) {
    if (existing.has(filename)) continue;
    list.append(suiteItem(filename));
  }
}

function suiteItem(filename) {
  const li = document.createElement("li");
  li.className = "suite-item";
  li.dataset.file = filename;

  const row = document.createElement("div");
  row.className = "suite-row";

  const name = document.createElement("span");
  name.className = "suite-name";
  name.textContent = filename;

  const status = document.createElement("span");
  status.className = "badge subtle";
  status.textContent = "not run";

  const run = document.createElement("button");
  run.className = "ghost small";
  run.textContent = "Run";
  run.addEventListener("click", () => runTest(filename));

  row.append(name, status, run);
  li.append(row);
  return li;
}

async function runTest(filename) {
  const li = [...$("suite").children].find((el) => el.dataset.file === filename);
  if (!li) return;

  li.scrollIntoView({ behavior: "smooth", block: "center" });
  const status = li.querySelector(".badge");
  const button = li.querySelector("button");
  status.className = "badge running";
  status.textContent = "running…";
  button.disabled = true;
  li.querySelector(".spec-results")?.remove();
  li.querySelectorAll(".failure").forEach((el) => el.remove());
  li.querySelector(".suite-row .primary")?.remove(); // stale repair button
  li.querySelector(".repair-error")?.remove();

  try {
    const result = await post("/api/run", { filename });

    status.className = `badge ${result.passed ? "pass" : "fail"}`;
    status.textContent = result.passed ? "passed" : "failed";

    if (result.specs.length) {
      const results = document.createElement("ul");
      results.className = "spec-results";
      for (const spec of result.specs) {
        const ok = spec.status === "passed";
        const item = document.createElement("li");

        const icon = document.createElement("span");
        icon.className = `spec-icon ${ok ? "pass" : "fail"}`;
        icon.textContent = ok ? "✓" : "✗";

        const title = document.createElement("span");
        title.textContent = spec.title;

        const duration = document.createElement("span");
        duration.className = "duration";
        duration.textContent = `${spec.durationMs} ms`;

        item.append(icon, title, duration);
        results.append(item);

        if (spec.error) results.append(failureBlock(spec.error));
      }
      li.append(results);
    }

    if (result.runError) li.append(failureBlock(result.runError));

    if (!result.passed) li.querySelector(".suite-row").append(repairButton(filename));
  } catch (error) {
    status.className = "badge fail";
    status.textContent = "error";
    li.append(failureBlock(error.message));
  } finally {
    button.disabled = false;
  }
}

function repairButton(filename) {
  const button = document.createElement("button");
  button.className = "primary small";
  button.textContent = "Fix with AI";
  button.addEventListener("click", async () => {
    button.disabled = true;
    button.textContent = "Repairing…";
    try {
      pending = await post("/api/repair", { filename });
      renderReview(pending, `repairing ${filename}`);
    } catch (error) {
      // Inline, next to the button that was clicked — an error at the top of the
      // page reads as "nothing happened".
      const li = button.closest(".suite-item");
      li.querySelector(".repair-error")?.remove();
      const block = failureBlock(error.message);
      block.classList.add("repair-error");
      li.append(block);
    } finally {
      button.disabled = false;
      button.textContent = "Fix with AI";
    }
  });
  return button;
}

function failureBlock(text) {
  const pre = document.createElement("pre");
  pre.className = "failure";
  pre.textContent = text;
  return pre;
}

$("run-all-btn").addEventListener("click", async () => {
  const button = $("run-all-btn");
  button.disabled = true;
  try {
    for (const li of [...$("suite").children]) {
      await runTest(li.dataset.file);
    }
  } finally {
    button.disabled = false;
  }
});

// ---------- helpers ----------

function showError(message) {
  const element = $("compose-error");
  element.hidden = !message;
  element.textContent = message ?? "";
}

/**
 * Minimal TypeScript highlighting — one pass over an alternation so tokens can't
 * nest and mangle each other. Escapes & < > first; quotes are left alone because
 * the result only ever becomes text content inside <pre>.
 */
function highlight(code) {
  const escaped = code.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const pattern =
    /(\/\/[^\n]*|\/\*[\s\S]*?\*\/)|(`(?:[^`\\]|\\.)*`|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')|\b(import|from|export|const|let|async|await|function|return|new|if|else|for|of|true|false|null|undefined)\b/g;

  return escaped.replace(pattern, (match, comment, string, keyword) => {
    if (comment) return `<span class="tok-com">${comment}</span>`;
    if (string) return `<span class="tok-str">${string}</span>`;
    if (keyword) return `<span class="tok-key">${keyword}</span>`;
    return match;
  });
}
