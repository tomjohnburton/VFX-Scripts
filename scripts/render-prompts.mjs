#!/usr/bin/env node
// Renders PromptBuilderV1 once per prompt JSON in prompts/, in parallel.
//
//   npm run render-prompts                   # PNG sequences (with alpha)
//   npm run render-prompts -- --mp4          # MP4s (H.264, no alpha)
//   npm run render-prompts -- --prores       # ProRes 4444 .mov (alpha + audio)
//   npm run render-prompts -- --webm         # VP8 WebM (alpha + audio)
//   npm run render-prompts -- --jpeg         # JPEG sequences (no alpha, faster)
//   npm run render-prompts -- --force        # re-render even if output exists
//   npm run render-prompts -- --parallel 4   # concurrent renders (default 2)
//   npm run render-prompts -- zucchini [...] # only listed prompts
//
// Output:
//   out/prompts/<name>/      (PNG or JPEG frames)
//   out/prompts/<name>.mp4   (with --mp4)
//   out/prompts/<name>.mov   (with --prores)
//   out/prompts/<name>.webm  (with --webm)

import { mkdirSync, readdirSync, readFileSync, existsSync, statSync } from "node:fs";
import { dirname, join, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { cpus } from "node:os";
import { bundle } from "@remotion/bundler";
import { renderFrames, renderMedia, selectComposition } from "@remotion/renderer";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..");
const promptsDir = join(repoRoot, "prompts");
const entryPoint = join(repoRoot, "src", "index.ts");

const args = process.argv.slice(2);
const wantMp4 = args.includes("--mp4");
const wantProRes = args.includes("--prores");
const wantWebm = args.includes("--webm");
const wantJpeg = args.includes("--jpeg");
const force = args.includes("--force");

const parallelIdx = args.indexOf("--parallel");
const parallel = parallelIdx >= 0 ? Math.max(1, parseInt(args[parallelIdx + 1], 10) || 2) : 2;

const filters = args.filter((a, i) => {
  if (a.startsWith("--")) return false;
  if (parallelIdx >= 0 && i === parallelIdx + 1) return false;
  return true;
});

const videoModes = [wantMp4, wantProRes, wantWebm].filter(Boolean).length;
if (videoModes > 1) {
  console.error("Pick only one of --mp4, --prores, --webm.");
  process.exit(1);
}
const wantVideo = videoModes === 1;

const imageFormat = wantJpeg ? "jpeg" : "png";
const frameExt = wantJpeg ? "jpeg" : "png";

if (!existsSync(promptsDir)) {
  console.error(`No prompts/ directory at ${promptsDir}`);
  process.exit(1);
}

const allFiles = readdirSync(promptsDir).filter((f) => f.endsWith(".json"));
const files = filters.length
  ? allFiles.filter((f) => filters.includes(basename(f, ".json")))
  : allFiles;

if (!files.length) {
  console.error("No prompt JSONs to render.");
  process.exit(1);
}

const jobs = [];
for (const file of files) {
  const path = join(promptsDir, file);
  const scenario = JSON.parse(readFileSync(path, "utf8"));
  const name = scenario.name || basename(file, ".json");
  const composition = scenario.composition || "PromptBuilderV1";
  const outDir = join(repoRoot, "out", "prompts");
  mkdirSync(outDir, { recursive: true });
  const videoExt = wantProRes ? "mov" : wantWebm ? "webm" : "mp4";
  const outPath = wantVideo ? join(outDir, `${name}.${videoExt}`) : join(outDir, name);
  jobs.push({ name, composition, scenario, outPath, sourcePath: path });
}

const mtime = (p) => (existsSync(p) ? statSync(p).mtimeMs : 0);
const pending = [];
for (const job of jobs) {
  const outExists = existsSync(job.outPath);
  const outNewer = outExists && mtime(job.outPath) >= mtime(job.sourcePath);
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

console.log(`\n⧗ Bundling once for ${pending.length} prompt job(s)...`);
const bundleStart = Date.now();
const serveUrl = await bundle({ entryPoint, webpackOverride: (c) => c });
console.log(`✓ Bundled in ${((Date.now() - bundleStart) / 1000).toFixed(1)}s`);
console.log(`⚙ Rendering up to ${parallel} at a time...`);

// Split cores across concurrent renders so they don't thrash.
const coresPerJob = Math.max(1, Math.floor(cpus().length / parallel));

const runJob = async (job) => {
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

  console.log(`▶ ${job.name} (${job.composition}) → ${job.outPath}`);
  const t0 = Date.now();

  if (wantVideo) {
    const codec = wantProRes ? "prores" : wantWebm ? "vp8" : "h264";
    await renderMedia({
      serveUrl,
      composition,
      codec,
      ...(wantProRes ? { proResProfile: "4444", pixelFormat: "yuva444p10le" } : {}),
      outputLocation: job.outPath,
      inputProps,
      concurrency: coresPerJob,
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
      ...(wantJpeg ? { jpegQuality: 92 } : {}),
      concurrency: coresPerJob,
      frameRange: null,
      onFrameUpdate: () => {},
      onStart: () => {},
    });
    // Also export audio alongside the frame sequence.
    const audioPath = `${job.outPath}.wav`;
    await renderMedia({
      serveUrl,
      composition,
      codec: "wav",
      outputLocation: audioPath,
      inputProps,
      concurrency: coresPerJob,
    });
    console.log(`  ↳ ${job.name} audio → ${audioPath}`);
  }

  console.log(`  ↳ ${job.name} done in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
};

const queue = [...pending];
const worker = async () => {
  while (queue.length) {
    const job = queue.shift();
    if (!job) return;
    try {
      await runJob(job);
    } catch (err) {
      console.error(`✗ ${job.name} failed:`, err.message);
      process.exitCode = 1;
    }
  }
};
await Promise.all(Array.from({ length: Math.min(parallel, pending.length) }, worker));

console.log("\n✓ Done");
