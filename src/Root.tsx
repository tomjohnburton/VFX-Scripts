import { Composition } from "remotion";
import { PromptBox } from "./PromptBox";
import { PromptBoxSmall } from "./PromptBoxSmall";
import { PromptBoxBottom } from "./PromptBoxBottom";
import { SubgoalBuilder } from "./SubgoalBuilder";
import { SubgoalBuilderV2 } from "./SubgoalBuilderV2";
import { SubgoalBuilderV3 } from "./SubgoalBuilderV3";
import { PromptBuilderV1 } from "./PromptBuilderV1";
import { PromptFlow } from "./PromptFlow";
import { OneModel } from "./OneModel";
import microwaveScenario from "../scenarios/microwave.json";
import defaultPrompts from "../prompts/airfryer.json";
import { mmssToSec } from "./time";

const FPS = 24000 / 1001;
const startSec = mmssToSec(microwaveScenario.start);
const endSec = mmssToSec(microwaveScenario.end);
const sceneDurationSec = endSec - startSec + 2;

const promptBuilderDuration = (
  props: { start: number; end: number }
): number => {
  // +1s covers the 1s final fade from `end` → `end+1s`.
  const dur = mmssToSec(props.end) - mmssToSec(props.start) + 1;
  return Math.max(1, Math.round(dur * FPS));
};

export const Root: React.FC = () => {
  return (
    <>
      <Composition
        id="PromptBox"
        component={PromptBox}
        durationInFrames={Math.round(12 * FPS)}
        fps={FPS}
        width={1920}
        height={1080}
        defaultProps={{ prompt: "Open the microwave" }}
      />
      <Composition
        id="PromptBoxSmall"
        component={PromptBoxSmall}
        durationInFrames={Math.round(12 * FPS)}
        fps={FPS}
        width={1920}
        height={1080}
      />
      <Composition
        id="PromptBoxBottom"
        component={PromptBoxBottom}
        durationInFrames={Math.round(9 * FPS)}
        fps={FPS}
        width={3840}
        height={2160}
        defaultProps={{ prompt: "Open the microwave" }}
      />
      <Composition
        id="PromptFlow"
        component={PromptFlow}
        durationInFrames={Math.round(35 * FPS)}
        fps={FPS}
        width={1920}
        height={1080}
      />
      <Composition
        id="OneModel"
        component={OneModel}
        durationInFrames={Math.round(9 * FPS)}
        fps={FPS}
        width={1920}
        height={1080}
      />
      <Composition
        id="SubgoalBuilder"
        component={SubgoalBuilder}
        durationInFrames={Math.round(sceneDurationSec * FPS)}
        fps={FPS}
        width={3840}
        height={2160}
        defaultProps={{
          steps: microwaveScenario.steps,
          start: microwaveScenario.start,
          end: microwaveScenario.end,
        }}
      />
      <Composition
        id="SubgoalBuilderV2"
        component={SubgoalBuilderV2}
        durationInFrames={Math.round(sceneDurationSec * FPS)}
        fps={FPS}
        width={3840}
        height={2160}
        defaultProps={{
          steps: microwaveScenario.steps,
          start: microwaveScenario.start,
          end: microwaveScenario.end,
        }}
      />
      <Composition
        id="PromptBuilderV1"
        component={PromptBuilderV1}
        durationInFrames={promptBuilderDuration(defaultPrompts)}
        fps={FPS}
        width={3840}
        height={2160}
        defaultProps={{
          steps: defaultPrompts.steps,
          start: defaultPrompts.start,
          end: defaultPrompts.end,
        }}
        calculateMetadata={({ props }) => ({
          durationInFrames: promptBuilderDuration(props),
        })}
      />
      <Composition
        id="SubgoalBuilderV3"
        component={SubgoalBuilderV3}
        durationInFrames={Math.round(sceneDurationSec * FPS)}
        fps={FPS}
        width={3840}
        height={2160}
        defaultProps={{
          steps: microwaveScenario.steps,
          start: microwaveScenario.start,
          end: microwaveScenario.end,
        }}
      />
    </>
  );
};
