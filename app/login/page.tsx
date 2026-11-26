import { LoginForm } from "./login-form";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  // Only in-app paths: an open redirect here would hand the session cookie's
  // return trip to whatever host the query string names.
  const target = next?.startsWith("/") && !next.startsWith("//") ? next : "/";

  return (
    <div className="auth-shell">
      <div className="auth-card">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true" />
          <h1>AI QA platform</h1>
        </div>
        <p className="note">
          Sign in to generate tests. The suite, its run history and the cost of each
          generation are kept per account.
        </p>
        <LoginForm next={target} />
      </div>
    </div>
  );
}
