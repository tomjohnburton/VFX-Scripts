#!/usr/bin/env node
// Renders SubgoalBuilder once per scenario JSON in scenarios/.
//
//   npm run render-scenarios             # PNG sequences (with alpha)
//   npm run render-scenarios -- --mp4    # MP4s
//   npm run render-scenarios -- --jpeg   # JPEG sequences (no alpha, ~3-5x faster)
//   npm run render-scenarios -- --force  # re-render even if output already exists
//   npm run render-scenarios -- microwave [cooking ...]   # only listed scenarios
//
// Output:
//   out/scenarios/<name>/      (PNG or JPEG frames)
//   out/scenarios/<name>.mp4   (with --mp4)
//
// Speed wins vs the old CLI-per-scenario approach:
//   1. Bundles Webpack once, reuses the bundle + browser for every scenario.
//   3. Optional --jpeg drops alpha encoding (much faster).
//   5. Skips scenarios whose output dir/file already exists (use --force to override).

import { mkdirSync, readdirSync, readFileSync, existsSync, statSync } from "node:fs";
import { dirname, join, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { bundle } from "@remotion/bundler";
import { renderFrames, renderMedia, selectComposition } from "@remotion/renderer";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..");
const scenariosDir = join(repoRoot, "scenarios");
const publicDir = join(repoRoot, "public");
const entryPoint = join(repoRoot, "src", "index.ts");

const args = process.argv.slice(2);
const wantMp4 = args.includes("--mp4");
const wantJpeg = args.includes("--jpeg");
const force = args.includes("--force");
const filters = args.filter((a) => !a.startsWith("--"));

const imageFormat = wantJpeg ? "jpeg" : "png";
const frameExt = wantJpeg ? "jpeg" : "png";

const allFiles = readdirSync(scenariosDir).filter((f) => f.endsWith(".json"));
const files = filters.length
  ? allFiles.filter((f) => filters.includes(basename(f, ".json")))
  : allFiles;

if (!files.length) {
  console.error("No scenarios to render.");
  process.exit(1);
}

// Parse + validate all scenarios up front so we fail fast before the expensive bundle step.
const MIN_STEP_DURATION = 5;
const jobs = [];
for (const file of files) {
  const path = join(scenariosDir, file);
  const scenario = JSON.parse(readFileSync(path, "utf8"));
  const name = scenario.name || basename(file, ".json");

  for (let i = 0; i < scenario.steps.length; i++) {
    const step = scenario.steps[i];
    const imgPath = join(publicDir, step.image);
    if (!existsSync(imgPath)) {
      console.error(`✗ ${name}: missing image "public/${step.image}"`);
      process.exit(1);
    }
    const dur = step.complete - step.typeStart;
    if (dur < MIN_STEP_DURATION) {
      console.warn(`⚠ ${name} step ${i + 1}: window is ${dur}s. Expected ≥ ${MIN_STEP_DURATION}s — will be clamped.`);
    }
  }

  const composition = scenario.composition || "SubgoalBuilder";
  const outDir = join(repoRoot, "out", "scenarios");
  mkdirSync(outDir, { recursive: true });
  const outPath = wantMp4 ? join(outDir, `${name}.mp4`) : join(outDir, name);

  jobs.push({ name, composition, scenario, outPath });
}

// --- Skip step: scenarios whose output already exists (use --force to re-render) ---
const mtime = (p) => (existsSync(p) ? statSync(p).mtimeMs : 0);
const pending = [];
for (const job of jobs) {
  const scenarioPath = join(scenariosDir, `${job.name}.json`);
  const outExists = existsSync(job.outPath);
  const outNewer = outExists && mtime(job.outPath) >= mtime(scenarioPath);
  // For frame sequences, also require at least one frame to be present.
  const hasFrames = !wantMp4 && outExists
    ? readdirSync(job.outPath).some((f) => f.endsWith(`.${frameExt}`))
    : true;
  if (!force && outExists && outNewer && hasFrames) {
    console.log(`↷ ${job.name}: up to date (${job.outPath}) — skipping`);
    continue;
  }
  pending.push(job);
}

if (!pending.length) {
  console.log("\n✓ Nothing to render. Use --force to re-render.");
  process.exit(0);
}

// --- Bundle once, reuse for every scenario ---
console.log(`\n⧗ Bundling once for ${pending.length} scenario(s)...`);
const bundleStart = Date.now();
const serveUrl = await bundle({
  entryPoint,
  webpackOverride: (c) => c,
});
console.log(`✓ Bundled in ${((Date.now() - bundleStart) / 1000).toFixed(1)}s`);

for (const job of pending) {
  const inputProps = { steps: job.scenario.steps, fadeStart: job.scenario.fadeStart };

  const composition = await selectComposition({
    serveUrl,
    id: job.composition,
    inputProps,
  });

  console.log(`\n▶ ${job.name} (${job.composition}) → ${job.outPath}`);
  const t0 = Date.now();

  if (wantMp4) {
    await renderMedia({
      serveUrl,
      composition,
      codec: "h264",
      outputLocation: job.outPath,
      inputProps,
      concurrency: null, // = all cores
      imageFormat: "jpeg",
    });
  } else {
    mkdirSync(job.outPath, { recursive: true });
    await renderFrames({
      serveUrl,
      composition,
      inputProps,
      outputDir: job.outPath,
      imageFormat,
      // jpegQuality only applies when imageFormat === "jpeg"
      ...(wantJpeg ? { jpegQuality: 92 } : {}),
      concurrency: null, // = all cores
      frameRange: null,
      onFrameUpdate: () => {},
      onStart: () => {},
    });
  }

  console.log(`  ↳ done in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}

console.log("\n✓ Done");
