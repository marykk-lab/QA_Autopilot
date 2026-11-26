import { listSuite } from "@/lib/generate";
import { listDescriptions } from "@/lib/cache";
import { lastRuns } from "@/lib/db";
import { BASE_URL } from "@/lib/app-config";
import { currentUser } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { Workbench } from "./workbench";

export const dynamic = "force-dynamic";

/**
 * The suite, the examples and the target are read on the server, so the first
 * paint already shows the real state instead of three loading placeholders.
 */
export default async function Home() {
  const user = await currentUser();
  if (!user) redirect("/login");

  const [tests, examples, latest] = await Promise.all([
    listSuite(),
    listDescriptions(),
    lastRuns(user),
  ]);

  return (
    <Workbench
      email={user.email ?? ""}
      baseURL={BASE_URL}
      liveGeneration={Boolean(process.env.ANTHROPIC_API_KEY)}
      initialTests={tests}
      initialLastRuns={latest}
      examples={examples}
    />
  );
}
