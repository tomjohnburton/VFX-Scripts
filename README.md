# Remotion Compositions

Programmatic video built with [Remotion](https://www.remotion.dev). Compositions render at **23.976 fps** (24000/1001) at either 1920×1080 or 3840×2160 (4K), so they drop straight into DaVinci timelines at that base rate.

## Quickstart

```bash
npm install
npm run dev        # open Remotion Studio to preview and scrub
```

Studio runs at `http://localhost:3000`. Pick a composition from the sidebar.

## Rendering

Two output formats:

```bash
# MP4 (fast preview, no alpha)
npx remotion render <CompositionId> out/<name>.mp4

# PNG sequence (transparent alpha — use this for DaVinci compositing)
npx remotion render <CompositionId> out/<name>_seq --image-format=png --sequence
```

Then in DaVinci: **Media Pool → Import → select the first PNG**. DaVinci auto-detects the sequence. Set the timeline to 23.976 fps.

## Project structure

```
src/
├── Root.tsx                  # registers all compositions
├── index.ts                  # entry point
└── <Composition>.tsx         # one file per composition
public/                       # assets (images, videos, fonts)
scenarios/                    # JSON configs for SubgoalBuilder
scripts/                      # batch render helpers
out/                          # render outputs (gitignored)
remotion.config.ts
```

Assets in `public/` are served by Remotion and referenced via `staticFile("filename.jpg")`.

## Composition catalog

| ID | Duration | Description | Assets |
|---|---|---|---|
| `PromptBox` | 12s | Large centered pill text box: bounces in, types a prompt, loading outline completes to blue, arrow → tick | — |
| `PromptBoxSmall` | 12s | Same as `PromptBox` but ~half size, top-left, white background | — |
| `PromptBoxBottom` | 12s, **4K** (3840×2160) | Scaled-up white prompt box that slides up from the bottom-middle. Takes a `prompt` prop | — |
| `SubgoalBuilder` | ~36s, **4K** (3840×2160) | Full prompt → large center subgoal card → shrinks to stacked column → completes with checkmark. Driven by scenario JSONs | per-scenario |
| `PromptFlow` | 35s | Three-step flow (left column): prompt box + stacked subgoal cards with mosaic image reveals; each step has custom completion timing | `World Model Vis_01_01_01_18.jpg`, `pick_up_burrito.jpg`, `place_burrito.jpg` |
| `OneModel` | 9s | "One model" slides left, "different tasks" appears; "tasks" 3D-flips backward to reveal "environments" then "robots" | — |

## Example prompts

The fastest way to work with this project is to describe what you want and let Claude build it. Examples below are grouped by pattern.

### Starting a new composition

**Trigger phrase:** "Let's make a new composition" (or just "new composition") — Claude scaffolds a `src/Foo.tsx`, registers it in `Root.tsx`, and renders it without you having to think about the boilerplate.

Examples:

- *"Let's make a new composition: a pill-shaped text box bounces up from the bottom, types 'Open the microwave', then shows a loading outline that completes to blue and turns the send arrow into a tick. Hold for 3 seconds then fade."*
- *"Let's make a new composition: two videos in `public/` play side-by-side. After 2s one fills the screen and a caption types over it, then shrinks back and the other does the same."*
- *"New composition — text 'One model' appears centered for 2 seconds, slides left to reveal 'different tasks', then 'tasks' 3D-rotates backward to reveal 'environments', then again to 'robots'."*
- *"New composition: recreate this diagram as an animated reveal" (paste screenshot)*

### Using assets from `public/`

Drop files into `public/` then reference them by filename:

- *"I added `world_model.jpg` to public — use it in the subgoal card with a mosaic pixel reveal that resolves over the loading duration"*
- *"I've added two MOVs to public. In the new composition play them side-by-side first, then…"*
- *"There's a new font in public called suisse-intl-regular.ttf — use it as the default font"*

### Controlling timing

Be specific about seconds, not frames:

- *"Step 1 should start at 2.5s and the subgoal card should turn blue at 11s"*
- *"Step 2 should start at 13s"*
- *"Hold for 3 seconds after completion, then fade over 1 second"*
- *"Increase the typing duration — it feels too fast"*

### Iterative tweaks

Short, targeted prompts work best — reference the specific element:

- *"Make the text box half the size"*
- *"Move the prompt box to the top-left"*
- *"Use white instead of indigo for the loading outline"*
- *"No background — I need transparency for compositing"*
- *"The tick flashes after it appears — stop that"*
- *"3px blue border instead of 4px"*
- *"Loading outline should run once, not loop"*

### Referencing visual bugs

Pasting a screenshot of the current render with a description of what's wrong works well:

- *"[screenshot] the text is duplicated — only show one word at a time"*
- *"[screenshot] the image jumps when the border appears — content shifts 2px"*
- *"[screenshot] 'One model' is off-center to the right"*

### Exporting

- *"Render it as an image sequence"* → PNG sequence with alpha for DaVinci
- *"Render as mp4"* → quick MP4 preview
- *"Render the PromptFlow composition"* → just rebuilds a specific composition

## Batch rendering `PromptBox` from a list

`PromptBox` and `PromptBoxBottom` both accept a `prompt` prop. To render each composition once per prompt, edit the `PROMPTS` (and optionally `COMPOSITIONS`) arrays in `scripts/render-prompts.mjs` and run:

```bash
# PNG sequences (with alpha, for DaVinci)
# → out/prompts/image_sequence/<composition>/<slug>/
npm run render-prompts

# MP4s
# → out/prompts/mp4/<composition>/<slug>.mp4
npm run render-prompts -- --mp4
```

Output filenames are slugged from each prompt (e.g. `"Open the microwave"` → `open-the-microwave`). Re-running overwrites previous outputs, so it's safe to tweak the list or the composition and re-render.

## Scenarios

Scenario JSON files in `scenarios/` drive the card-based compositions (`SubgoalBuilder`, `SubgoalBuilderV2`, etc.). Each file describes the prompts, images, timing, and which composition to render:

```json
{
  "name": "microwave",
  "composition": "SubgoalBuilder",
  "steps": [
    { "prompt": "Open the microwave", "image": "World Model Vis_01_01_01_18.jpg", "typeStart": 2.5, "complete": 11 },
    { "prompt": "Pick up the burrito in the microwave", "image": "pick_up_burrito.jpg", "typeStart": 13, "complete": 24 },
    { "prompt": "Place burrito on the table", "image": "place_burrito.jpg", "typeStart": 27, "complete": 31 }
  ],
  "fadeStart": 34
}
```

- `composition` — which registered composition to render (optional, defaults to `SubgoalBuilder`). Any composition that accepts `{ steps, fadeStart }` works (e.g. `SubgoalBuilderV2`).
- `typeStart` — when the prompt starts typing (seconds)
- `complete` — when that card turns blue + shows the checkmark (seconds)
- `fadeStart` — when the whole composition fades out (seconds)
- `image` — filename in `public/` (must already exist)

### Adding a scenario

1. Drop the images into `public/`.
2. Create `scenarios/<name>.json` following the shape above.
3. Render:

```bash
npm run render-scenarios                       # all scenarios → PNG sequences
npm run render-scenarios -- --mp4              # all → MP4s
npm run render-scenarios -- microwave          # just "microwave"
npm run render-scenarios -- --mp4 microwave    # just "microwave" as MP4
```

Output: `out/scenarios/<name>/` (PNG sequence) or `out/scenarios/<name>.mp4`.

Studio previews the scenario loaded in `Root.tsx` (`microwave.json` by default) — swap the import there to preview a different one.

## Adding a composition manually

If you'd rather write it yourself:

1. Create `src/YourComposition.tsx` — export a `React.FC` that uses `useCurrentFrame`, `useVideoConfig`, `interpolate`, `spring`, etc.
2. Register it in `src/Root.tsx`:
   ```tsx
   <Composition
     id="YourComposition"
     component={YourComposition}
     durationInFrames={Math.round(10 * FPS)}
     fps={FPS}
     width={1920}
     height={1080}
   />
   ```
3. Preview with `npm run dev`, render with the commands above.

See any existing composition (e.g. `PromptBoxSmall.tsx`) for patterns — entrance springs, frame-based timing helpers (`const sec = (s) => Math.round(s * fps)`), typing effects, loading outlines, etc.

## Font

The project uses **Suisse Intl** (Regular, 400), pulled from installed system fonts. If Suisse Intl isn't installed on your machine, install the Regular weight to `~/Library/Fonts/` or the compositions will fall back to Inter / system-ui. Only use weight 400 — heavier weights aren't included and will shift visually.
