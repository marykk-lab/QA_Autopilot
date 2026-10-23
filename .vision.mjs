import { chromium } from "@playwright/test";
import Anthropic from "@anthropic-ai/sdk";
process.loadEnvFile();

const url = process.argv[2];
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1280, height: 900 } });
await p.goto(url, { waitUntil: "networkidle" });
const shot = (await p.screenshot()).toString("base64");
await b.close();

const client = new Anthropic();
const r = await client.messages.create({
  model: "claude-opus-5",
  max_tokens: 1200,
  messages: [{
    role: "user",
    content: [
      { type: "image", source: { type: "base64", media_type: "image/png", data: shot } },
      { type: "text", text:
        `This is ${url}. From the screenshot ALONE — you have no DOM — list the 5 most valuable things to test here. ` +
        `For each: one line of what to test, and mark whether you could verify it from a screenshot alone or whether ` +
        `you'd need to know the app's intended behaviour. Be blunt about what you cannot determine visually.` },
    ],
  }],
});
console.log(r.content.filter(b => b.type === "text").map(b => b.text).join(""));
console.log(`\n--- ${r.usage.input_tokens} in / ${r.usage.output_tokens} out ≈ $${((r.usage.input_tokens/1e6)*5 + (r.usage.output_tokens/1e6)*25).toFixed(4)}`);
