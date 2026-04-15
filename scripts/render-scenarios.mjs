#!/usr/bin/env node
// Renders SubgoalBuilder once per scenario JSON in scenarios/.
//
//   npm run render-scenarios             # PNG sequences (with alpha)
//   npm run render-scenarios -- --mp4    # MP4s (H.264, no alpha)
//   npm run render-scenarios -- --prores # ProRes 4444 .mov (alpha + audio, VFX standard)
//   npm run render-scenarios -- --webm   # VP8 WebM (alpha + audio, web-friendly)
//   npm run render-scenarios -- --jpeg   # JPEG sequences (no alpha, ~3-5x faster)
//   npm run render-scenarios -- --force  # re-render even if output already exists
//   npm run render-scenarios -- microwave [cooking ...]   # only listed scenarios
//
// Output:
//   out/scenarios/<name>/      (PNG or JPEG frames)
//   out/scenarios/<name>.mp4   (with --mp4)
//   out/scenarios/<name>.mov   (with --prores, alpha + audio)
//   out/scenarios/<name>.webm  (with --webm, alpha + audio)
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
const wantProRes = args.includes("--prores");
const wantWebm = args.includes("--webm");
const wantJpeg = args.includes("--jpeg");
const force = args.includes("--force");
const filters = args.filter((a) => !a.startsWith("--"));

const videoModes = [wantMp4, wantProRes, wantWebm].filter(Boolean).length;
if (videoModes > 1) {
  console.error("Pick only one of --mp4, --prores, --webm.");
  process.exit(1);
}
const wantVideo = videoModes === 1;

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

// Scenario timestamps are authored as mm.ss (e.g. 1.32 = 1m32s).
const mmssToSec = (x) => {
  const minutes = Math.floor(x);
  const seconds = Math.round((x - minutes) * 100);
  return minutes * 60 + seconds;
};

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
    const dur = mmssToSec(step.complete) - mmssToSec(step.typeStart);
    if (dur < MIN_STEP_DURATION) {
      console.warn(`⚠ ${name} step ${i + 1}: window is ${dur}s. Expected ≥ ${MIN_STEP_DURATION}s — will be clamped.`);
    }
  }

  const composition = scenario.composition || "SubgoalBuilder";
  const outDir = join(repoRoot, "out", "scenarios");
  mkdirSync(outDir, { recursive: true });
  const videoExt = wantProRes ? "mov" : wantWebm ? "webm" : "mp4";
  const outPath = wantVideo ? join(outDir, `${name}.${videoExt}`) : join(outDir, name);

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
  const hasFrames = !wantVideo && outExists
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
  const inputProps = {
    steps: job.scenario.steps,
    start: job.scenario.start,
    end: job.scenario.end,
  };

  const composition = await selectComposition({
    serveUrl,
    id: job.composition,
    inputProps,
  });

  console.log(`\n▶ ${job.name} (${job.composition}) → ${job.outPath}`);
  const t0 = Date.now();

  if (wantVideo) {
    // ProRes 4444 + WebM (VP8) both support alpha and embed audio from <Audio> tags.
    // H.264 .mp4 has no alpha channel; use --prores or --webm for transparent output.
    const codec = wantProRes ? "prores" : wantWebm ? "vp8" : "h264";
    await renderMedia({
      serveUrl,
      composition,
      codec,
      ...(wantProRes ? { proResProfile: "4444", pixelFormat: "yuva444p10le" } : {}),
      outputLocation: job.outPath,
      inputProps,
      concurrency: null, // = all cores
      imageFormat: wantProRes || wantWebm ? "png" : "jpeg",
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
    const audioPath = `${job.outPath}.wav`;
    await renderMedia({
      serveUrl,
      composition,
      codec: "wav",
      outputLocation: audioPath,
      inputProps,
      concurrency: null,
    });
    console.log(`  ↳ audio → ${audioPath}`);
  }

  console.log(`  ↳ done in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}

console.log("\n✓ Done");
