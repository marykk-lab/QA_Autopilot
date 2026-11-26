import type { NextConfig } from "next";

const config: NextConfig = {
  // The route handlers read target.json, write spec files and spawn Playwright,
  // so they run in Node and are never statically optimised.
  serverExternalPackages: ["@playwright/test"],

  // Both spellings of the loopback address. Next 16 blocks dev resources served
  // to an origin it doesn't recognise, and the symptom is nasty: the page renders
  // but never hydrates, so every button silently does nothing.
  allowedDevOrigins: ["127.0.0.1", "localhost"],
};

export default config;
