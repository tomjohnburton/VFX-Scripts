#!/usr/bin/env node
// Renders each prompt-aware composition once per prompt.
// Edit PROMPTS and COMPOSITIONS below, then run:
//   npm run render-prompts          # PNG sequences (with alpha)
//   npm run render-prompts -- --mp4 # MP4s
//
// Output:
//   out/prompts/image_sequence/<composition>/<slug>/  (PNG frames with alpha)
//   out/prompts/mp4/<composition>/<slug>.mp4          (with --mp4)

import { execSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const PROMPTS = [
  "Open the microwave",
  "Pick up the burrito in the microwave",
  "Place burrito on the table",
  "Peel the courgette with the peeler",
  "Slice the courgette with the knife",
  "Place the white liner in the trash",
  "Fold the blue t-shirt",
  "Place the envelope into the backpack",
  "Stack the plastic containers insider each other",
  "Place the blue shirt in the paper bag"
];

const COMPOSITIONS = ["PromptBoxBottom"];

const slug = (s) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..");
const wantMp4 = process.argv.includes("--mp4");

const formatDir = wantMp4 ? "mp4" : "image_sequence";

for (const composition of COMPOSITIONS) {
  const compOutRoot = join(repoRoot, "out", "prompts", formatDir, composition);
  mkdirSync(compOutRoot, { recursive: true });

  for (const prompt of PROMPTS) {
    const name = slug(prompt);
    const outPath = wantMp4 ? join(compOutRoot, `${name}.mp4`) : join(compOutRoot, name);
    const extraFlags = wantMp4 ? "" : "--image-format=png --sequence";
    const propsArg = `--props='${JSON.stringify({ prompt })}'`;

    console.log(`\n▶ ${composition} · "${prompt}" → ${outPath}`);
    execSync(
      `npx remotion render ${composition} "${outPath}" ${propsArg} ${extraFlags}`,
      { cwd: repoRoot, stdio: "inherit" }
    );
  }
}

console.log("\n✓ Done");
