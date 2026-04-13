import { Composition } from "remotion";
import { PromptBox } from "./PromptBox";
import { PromptBoxSmall } from "./PromptBoxSmall";
import { PromptBoxBottom } from "./PromptBoxBottom";
import { SubgoalBuilder } from "./SubgoalBuilder";
import { SubgoalBuilderV2 } from "./SubgoalBuilderV2";
import { PromptFlow } from "./PromptFlow";
import { OneModel } from "./OneModel";
import microwaveScenario from "../scenarios/microwave.json";

const FPS = 24000 / 1001;

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
        durationInFrames={Math.round((microwaveScenario.fadeStart + 2) * FPS)}
        fps={FPS}
        width={3840}
        height={2160}
        defaultProps={{
          steps: microwaveScenario.steps,
          fadeStart: microwaveScenario.fadeStart,
        }}
      />
      <Composition
        id="SubgoalBuilderV2"
        component={SubgoalBuilderV2}
        durationInFrames={Math.round((microwaveScenario.fadeStart + 2) * FPS)}
        fps={FPS}
        width={3840}
        height={2160}
        defaultProps={{
          steps: microwaveScenario.steps,
          fadeStart: microwaveScenario.fadeStart,
        }}
      />
    </>
  );
};
