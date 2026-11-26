export interface TestRequest {
  /** What the user typed, e.g. "log in as the standard user and check the products page". */
  description: string;
  /** Site under test. */
  baseURL: string;
}

export interface GeneratedTest {
  /** File name only, e.g. "standard-user-login.spec.ts". */
  filename: string;
  /** The complete Playwright spec file contents. */
  code: string;
  /** Where this came from — shown in the CLI so a demo is never misleading. */
  source: "claude" | "cache";
  /** Populated when source === "claude". */
  usage?: { inputTokens: number; outputTokens: number; estimatedCostUsd: number };
}

export interface Generator {
  generate(request: TestRequest): Promise<GeneratedTest>;
}
