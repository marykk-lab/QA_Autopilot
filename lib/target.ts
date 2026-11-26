import { readFile } from "node:fs/promises";
import path from "node:path";

/**
 * What the generator is allowed to know about the site under test.
 *
 * Without this the model cannot write a test that logs in: the request says
 * "as the standard user" and nothing in the system knows what that user's
 * password is. It then does the only correct thing available — emits a
 * process.env placeholder — and the test can't run. Supplying the context is
 * the fix; loosening the "never invent a credential" rule would not be.
 *
 * `target.local.json` overrides `target.json` and is gitignored, so a real
 * application's credentials never have to be committed.
 */
export interface Target {
  description?: string;
  credentials?: {
    role: string;
    username?: string;
    password?: string;
    /** Preferred: name an env var instead of putting a secret in this file. */
    usernameEnv?: string;
    passwordEnv?: string;
  }[];
  notes?: string[];
  inspect?: {
    /** Defaults to BASE_URL, so switching sites is usually one env var. */
    baseURL?: string;
    signIn?: {
      path?: string;
      credential: string;
      /**
       * How to find each field. Real login forms vary, so each one takes a
       * strategy rather than assuming a placeholder:
       *   { "label": "Email" } | { "placeholder": "Username" }
       *   { "role": "textbox", "name": "Email" } | { "css": "#email" }
       */
      username: FieldLocator;
      password: FieldLocator;
      submit: FieldLocator;
      /** Optional: dismiss a cookie banner before filling anything. */
      dismiss?: FieldLocator;
      /** Something that only exists once signed in, to confirm it worked. */
      confirm?: FieldLocator;
    };
    pages: {
      name: string;
      path: string;
      requiresSignIn?: boolean;
      /** Wait for this before capturing — the surest fix for a late-rendering page. */
      waitFor?: FieldLocator;
      /** Also capture the accessibility tree inside iframes on this page. */
      frames?: boolean;
      /**
       * States that only exist after interacting — dialogs, menus, expanded
       * panels. A static snapshot can't see them, and the model then guesses
       * selectors for exactly the part of the UI the task is about.
       */
      states?: {
        name: string;
        click: FieldLocator[];
        waitFor?: FieldLocator;
      }[];
    }[];
    /** How long to let a page settle before deciding its tree has stopped changing. */
    settleMs?: number;
  };
}

export interface FieldLocator {
  label?: string;
  placeholder?: string;
  role?: string;
  name?: string;
  text?: string;
  css?: string;
}

/**
 * Resolves a credential to real values, reading env vars where the config names
 * them. Secrets belong in .env, not in a file that gets committed — a generated
 * spec is a repo file, so anything inlined here ends up in version control.
 */
export function resolveCredential(credential: NonNullable<Target["credentials"]>[number]): {
  username: string;
  password: string;
} {
  const username = credential.usernameEnv ? process.env[credential.usernameEnv] : credential.username;
  const password = credential.passwordEnv ? process.env[credential.passwordEnv] : credential.password;

  const missing = [
    !username && (credential.usernameEnv ?? "username"),
    !password && (credential.passwordEnv ?? "password"),
  ].filter(Boolean);
  if (missing.length) {
    throw new Error(
      `Credential "${credential.role}" is missing ${missing.join(" and ")}. ` +
        `Set it in .env (gitignored) or in target.local.json.`,
    );
  }
  return { username: username!, password: password! };
}

export async function loadTarget(): Promise<Target> {
  for (const file of ["target.local.json", "target.json"]) {
    try {
      // Resolved against the project root explicitly: the same function is called
      // from a CLI script and from a bundled route handler, and only one of those
      // can rely on the process's working directory being this repo.
      //
      // turbopackIgnore: the path is a fixed pair of filenames, not user input.
      // Without it the bundler traces the entire project into the server output
      // because it cannot prove that.
      const configPath = path.resolve(/*turbopackIgnore: true*/ process.cwd(), file);
      return JSON.parse(await readFile(configPath, "utf8")) as Target;
    } catch {
      continue;
    }
  }
  return {};
}

/** Rendered into the user message. Empty string when there's nothing to say. */
export function renderTarget(target: Target): string {
  const sections: string[] = [];

  if (target.description) sections.push(target.description);

  if (target.credentials?.length) {
    sections.push(
      [
        "Test accounts that exist on this site:",
        ...target.credentials.map((c) => {
          const user = c.usernameEnv
            ? `username from process.env.${c.usernameEnv}`
            : `username "${c.username}"`;
          const pass = c.passwordEnv
            ? `password from process.env.${c.passwordEnv}`
            : `password "${c.password}"`;
          return `- ${c.role}: ${user}, ${pass}`;
        }),
      ].join("\n"),
    );
  }

  if (target.notes?.length) {
    sections.push(["Known behaviour:", ...target.notes.map((n) => `- ${n}`)].join("\n"));
  }

  return sections.join("\n\n");
}
