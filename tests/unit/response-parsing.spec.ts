import { test, expect } from "@playwright/test";
import { parseResponse } from "../../lib/claude";
import { pinBaseURL } from "../../lib/generate";

/**
 * The gate between a model response and a file on disk.
 *
 * These run without a network or an API key, which is why CI gates on them: a
 * generated suite that runs against a live site tells you the site was up, not
 * that this code is correct.
 */

test.describe("parseResponse", () => {
  test("extracts the filename and the code block", () => {
    const { filename, code } = parseResponse(
      [
        "FILENAME: standard-user-login.spec.ts",
        "```typescript",
        'import { test, expect } from "@playwright/test";',
        'test("logs in", async ({ page }) => { await page.goto("/"); });',
        "```",
      ].join("\n"),
    );

    expect(filename).toBe("standard-user-login.spec.ts");
    expect(code).toContain("@playwright/test");
    expect(code.endsWith("\n")).toBe(true);
  });

  test("falls back to a default filename rather than failing", () => {
    const { filename } = parseResponse(
      '```typescript\nimport { test } from "@playwright/test";\n```',
    );
    expect(filename).toBe("generated.spec.ts");
  });

  test("refuses a response with no code block", () => {
    expect(() => parseResponse("Sure! Here is a test you could write.")).toThrow(
      /No TypeScript code block/,
    );
  });

  test("refuses code that does not import Playwright", () => {
    // A plausible-looking file that cannot run is worse than a hard failure:
    // it reaches review looking like a test.
    expect(() => parseResponse('```typescript\nconsole.log("hello");\n```')).toThrow(
      /does not import @playwright\/test/,
    );
  });
});

test.describe("pinBaseURL", () => {
  const spec = {
    filename: "a.spec.ts",
    source: "claude" as const,
    code: [
      'import { test, expect } from "@playwright/test";',
      "",
      'test("works", async ({ page }) => {});',
      "",
    ].join("\n"),
  };

  test("stamps the target after the last import", () => {
    const pinned = pinBaseURL(spec, "https://www.saucedemo.com");
    const lines = pinned.code.split("\n");

    expect(lines[0]).toContain("@playwright/test");
    expect(lines[2]).toBe('test.use({ baseURL: "https://www.saucedemo.com" });');
  });

  test("leaves an existing target alone", () => {
    // Re-stamping is how a repair could silently move a test to another site.
    const already = {
      ...spec,
      code: `import { test } from "@playwright/test";\ntest.use({ baseURL: "http://localhost:3000" });\n`,
    };
    expect(pinBaseURL(already, "https://www.saucedemo.com").code).toBe(already.code);
  });
});
