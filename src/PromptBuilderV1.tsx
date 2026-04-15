import { AbsoluteFill, Audio, Sequence, interpolate, interpolateColors, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { mmssToSec } from "./time";

const FONT = "'SF Mono', 'SFMono-Regular', ui-monospace, Menlo, Monaco, Consolas, monospace";

const YELLOW = "#f5d547";
const YELLOW_DEEP = "#e5c22a";
const GREEN = "#b5d978";
const GREEN_DEEP = "#8fbf4d";
const INK = "#1a1a1e";
const PLACEHOLDER_COLOR = "rgba(26,26,30,0.40)";

const KEYBOARD_SOUNDS = [
  "Rapid,_chaotic_keybo_#1-1776185434981.wav",
  "Rapid,_chaotic_keybo_#2-1776185368203.wav",
  "Rapid,_chaotic_keybo_#3-1776185392391.wav",
  "Rapid,_chaotic_keybo_#4-1776185414155.wav",
];

const ENTER_SOUNDS = ["enter1.wav", "enter2.wav", "enter3.wav"];
const pickEnter = (i: number) => ENTER_SOUNDS[(i * 2654435761) % ENTER_SOUNDS.length];

export type PromptBuilderV1Step = {
  prompt: string;
  typeStart: number; // mm.ss
  complete: number;  // mm.ss
};

export type PromptBuilderV1Props = {
  steps: PromptBuilderV1Step[];
  start: number;
  end: number;
};

const PROMPT_W = 1600;
const PROMPT_H = 160;
const PROMPT_R = 32;

const PROMPT_LABEL_SIZE = 44;
const PROMPT_TEXT_SIZE = 64;
const PROMPT_TEXT_LINE_H = 1.2;
const PROMPT_PAD_TOP = 28;
const PROMPT_PAD_BOTTOM = 36;
const PROMPT_PAD_X = 48;
const PROMPT_LABEL_GAP = 10;

const estimateLines = (text: string) => {
  const innerW = PROMPT_W - PROMPT_PAD_X * 2;
  const charW = PROMPT_TEXT_SIZE * 0.6;
  const charsPerLine = Math.max(1, Math.floor(innerW / charW));
  return Math.max(1, Math.ceil((text.length + 2) / charsPerLine));
};
const cardHeightFor = (text: string) => {
  const lines = estimateLines(text);
  return PROMPT_PAD_TOP + PROMPT_LABEL_SIZE + PROMPT_LABEL_GAP
    + Math.round(lines * PROMPT_TEXT_SIZE * PROMPT_TEXT_LINE_H) + PROMPT_PAD_BOTTOM;
};

export const PromptBuilderV1: React.FC<PromptBuilderV1Props> = ({ steps, start, end }) => {
  const frame = useCurrentFrame();
  const { fps, height } = useVideoConfig();

  const sec = (s: number) => Math.round(s * fps);
  const clamp = { extrapolateLeft: "clamp" as const, extrapolateRight: "clamp" as const };

  const baseSec = mmssToSec(start);
  const absFrame = (mmss: number) => sec(mmssToSec(mmss) - baseSec);

  const stepTimings = steps.map((s) => {
    const typeStart = absFrame(s.typeStart);
    const typeEnd = typeStart + sec(0.9);
    const enter = typeStart + sec(1.1);
    const requested = absFrame(s.complete);
    // Without the visual-subgoal drawer, we just need enough time for the
    // green card to fade in and breathe before reverting to yellow.
    const minComplete = enter + sec(1.7);
    const complete = Math.max(requested, minComplete);
    return { typeStart, typeEnd, enter, complete };
  });

  const tFadeStart = absFrame(end);
  const tFadeEnd = tFadeStart + sec(1);

  let activeIdx = -1;
  for (let i = stepTimings.length - 1; i >= 0; i--) {
    if (frame >= stepTimings[i].typeStart) { activeIdx = i; break; }
  }
  const st = activeIdx >= 0 ? stepTimings[activeIdx] : null;
  const activePrompt = activeIdx >= 0 ? steps[activeIdx].prompt : "";

  const showPlaceholder = activeIdx < 0 || (st ? frame >= st.enter : false);
  const isTyping = st ? frame >= st.typeStart && frame < st.typeEnd : false;
  const hasTyped = st ? frame >= st.typeEnd : false;
  const isEntered = st ? frame >= st.enter : false;
  const showEnterButton = st ? frame >= st.typeStart : false;

  const typeProgress = st ? interpolate(frame, [st.typeStart, st.typeEnd], [0, 1], clamp) : 0;
  const charsVisible = Math.floor(typeProgress * activePrompt.length);
  const typedText = activePrompt.slice(0, charsVisible);
  const cursorOn = (isTyping || hasTyped || showPlaceholder) && Math.floor(frame / 20) % 2 === 0;

  const entranceY = spring({ frame, fps, config: { damping: 11, stiffness: 120, mass: 0.8 } });
  const promptY = interpolate(entranceY, [0, 1], [400, 0]);
  const entranceOpacity = interpolate(frame, [0, sec(0.2)], [0, 1], clamp);

  const enterElapsed = st ? frame - st.enter : -1;
  const promptPulseScale = isEntered
    ? 1 + 0.04 * Math.max(0, Math.sin(Math.min(enterElapsed / fps, 0.3) / 0.3 * Math.PI))
    : 1;

  const tickRaw = (st && isEntered) ? spring({ frame: frame - st.enter, fps, config: { damping: 30, stiffness: 120 } }) : 0;
  const tickProgress = Math.min(1, Math.max(0, tickRaw));

  let greenProgress = 0;
  if (st) {
    if (frame < st.enter) {
      greenProgress = 0;
    } else if (frame < st.complete) {
      greenProgress = interpolate(frame, [st.enter, st.enter + sec(0.4)], [0, 1], clamp);
    } else {
      greenProgress = interpolate(frame, [st.complete, st.complete + sec(0.2)], [1, 0], clamp);
    }
  }
  const isGreenCard = greenProgress > 0.5;
  const promptBg = interpolateColors(greenProgress, [0, 1], [YELLOW, GREEN]);
  const promptBorder = interpolateColors(greenProgress, [0, 1], [YELLOW_DEEP, GREEN_DEEP]);
  const promptCardH = cardHeightFor(activePrompt);
  const currentPromptH = interpolate(greenProgress, [0, 1], [PROMPT_H, promptCardH]);

  const yellowContentOpacity = interpolate(greenProgress, [0, 0.5], [1, 0], clamp);
  const greenContentOpacity = interpolate(greenProgress, [0.5, 1], [0, 1], clamp);

  const MARGIN_X = 120;
  const MARGIN_Y = 120;
  const promptLeft = MARGIN_X;
  const promptTop = height - currentPromptH - MARGIN_Y;

  const finalFade = interpolate(frame, [tFadeStart, tFadeEnd], [1, 0], clamp);

  return (
    <AbsoluteFill style={{ fontFamily: FONT, opacity: finalFade }}>

      {stepTimings.map((t, i) => (
        <Sequence key={`kbd-${i}`} from={t.typeStart} durationInFrames={Math.max(1, t.typeEnd - t.typeStart)}>
          <Audio src={staticFile(KEYBOARD_SOUNDS[i % KEYBOARD_SOUNDS.length])} volume={0.6} />
        </Sequence>
      ))}

      {stepTimings.map((t, i) => (
        <Sequence key={`enter-${i}`} from={t.typeEnd} durationInFrames={sec(1)}>
          <Audio src={staticFile(pickEnter(i))} volume={0.7} />
        </Sequence>
      ))}

      <div
        style={{
          position: "absolute",
          left: promptLeft,
          top: promptTop,
          transform: `translateY(${promptY}px) scale(${promptPulseScale})`,
          transformOrigin: "bottom center",
          opacity: entranceOpacity,
          width: PROMPT_W,
          height: currentPromptH,
          zIndex: 20,
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: PROMPT_R,
            background: promptBg,
            border: `2px solid ${promptBorder}`,
            boxShadow: "0 16px 60px rgba(0,0,0,0.25)",
            overflow: "hidden",
          }}
        />

        {yellowContentOpacity > 0 && (
          <div
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              bottom: 0,
              height: PROMPT_H,
              display: "flex",
              alignItems: "center",
              padding: "0 52px",
              opacity: yellowContentOpacity,
              zIndex: 1,
            }}
          >
            {showPlaceholder && (
              <span style={{ fontSize: 60, display: "inline-flex", alignItems: "center" }}>
                <span style={{ opacity: cursorOn ? 0.85 : 0, background: INK, width: 3, height: 68, marginRight: 2 }} />
                <span style={{ color: PLACEHOLDER_COLOR, fontStyle: "italic", fontWeight: 400 }}>Type Prompt</span>
              </span>
            )}
            {!showPlaceholder && (
              <span style={{ color: INK, fontSize: 60, fontWeight: 500, display: "inline-flex", alignItems: "center" }}>
                {typedText}
                <span style={{ opacity: cursorOn ? 0.85 : 0, background: INK, width: 3, height: 68, marginLeft: 2 }} />
              </span>
            )}
            {showEnterButton && (
              <div
                style={{
                  position: "absolute",
                  right: 20,
                  top: "50%",
                  transform: `translateY(-50%) scale(${isEntered ? promptPulseScale : 1})`,
                  width: 120,
                  height: 120,
                  borderRadius: 48,
                  background: INK,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  boxShadow: "0 0 24px rgba(0,0,0,0.25)",
                }}
              >
                <svg width={48} height={48} viewBox="0 0 24 24" fill="none" stroke={YELLOW} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12h14M12 5l7 7-7 7" opacity={1 - tickProgress} />
                  <path d="M5 12l5 5L20 7" opacity={tickProgress} strokeDasharray="24" strokeDashoffset={24 * (1 - tickProgress)} />
                </svg>
              </div>
            )}
          </div>
        )}

        {greenContentOpacity > 0 && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              padding: `${PROMPT_PAD_TOP}px ${PROMPT_PAD_X}px ${PROMPT_PAD_BOTTOM}px`,
              opacity: greenContentOpacity,
              display: "flex",
              flexDirection: "column",
              zIndex: 1,
            }}
          >
            <div style={{ fontSize: PROMPT_LABEL_SIZE, fontWeight: 700, color: INK, letterSpacing: 4, textTransform: "uppercase", marginBottom: PROMPT_LABEL_GAP }}>
              Textual Subgoal
            </div>
            <div style={{ fontSize: PROMPT_TEXT_SIZE, fontWeight: 500, color: INK, lineHeight: PROMPT_TEXT_LINE_H }}>
              "{isGreenCard ? activePrompt : typedText}"
            </div>
          </div>
        )}
      </div>

    </AbsoluteFill>
  );
};
