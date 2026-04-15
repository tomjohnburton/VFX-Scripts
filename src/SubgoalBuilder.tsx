import { AbsoluteFill, Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { mmssToSec } from "./time";

const FONT = "'Suisse Intl', Inter, -apple-system, Helvetica, Arial, sans-serif";

const BOX_BG = "#ffffff";
const BORDER = "rgba(0,0,0,0.10)";
const BLUE = "#7dd3fc";
const PLACEHOLDER_COLOR = "rgba(0,0,0,0.30)";
const TEXT_COLOR = "#1a1a1e";
const LABEL_COLOR = "#6b7280";

export type PromptFlowStep = {
  prompt: string;
  image: string;
  typeStart: number; // mm.ss (e.g. 1.32 = 1m32s)
  complete: number;  // mm.ss — when the card turns blue + checkmark appears
};

export type SubgoalBuilderProps = {
  steps: PromptFlowStep[];
  start: number; // mm.ss — absolute timestamp that maps to frame 0
  end: number;   // mm.ss — absolute timestamp when fade-out begins
};

// Large-card (center) size
const CARD_W = 1400;
const IMG_W = CARD_W - 80;
const IMG_H = Math.round(IMG_W * (9 / 16));
// padding + label + gap + image + gap + divider + label + text + padding
const CARD_H = 36 + 48 + 18 + IMG_H + 24 + 1 + 28 + 56 + 56 + 72;
const SMALL_SCALE = 0.45;

export const SubgoalBuilder: React.FC<SubgoalBuilderProps> = ({ steps, start, end }) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();

  const sec = (s: number) => Math.round(s * fps);
  const clamp = { extrapolateLeft: "clamp" as const, extrapolateRight: "clamp" as const };

  // Absolute mm.ss timestamps → frame offsets relative to `start` (frame 0).
  const baseSec = mmssToSec(start);
  const absFrame = (mmss: number) => sec(mmssToSec(mmss) - baseSec);

  // --- Per-step timings derived from scenario ---
  // Phases must be strictly monotonically increasing for interpolate(). If the
  // requested complete is too close to typeStart, push it out so all phases fit.
  const stepTimings = steps.map((s) => {
    const typeStart = absFrame(s.typeStart);
    const typeEnd = typeStart + sec(1.8);
    const enter = typeStart + sec(2.4);
    const cardIn = typeStart + sec(2.8);
    const requested = absFrame(s.complete);
    const window = Math.max(sec(1), requested - cardIn);
    const revealDur = Math.max(1, Math.min(sec(1.6), Math.round(window * 0.4)));
    const holdLargeDur = Math.max(1, Math.min(sec(0.9), Math.round(window * 0.2)));
    const shrinkDur = Math.max(1, Math.min(sec(0.9), Math.round(window * 0.25)));
    const cardRevealEnd = cardIn + revealDur;
    const cardShrink = cardRevealEnd + holdLargeDur;
    const cardAtPosition = cardShrink + shrinkDur;
    const complete = Math.max(requested, cardAtPosition);
    return { typeStart, typeEnd, enter, cardIn, cardRevealEnd, cardShrink, cardAtPosition, complete };
  });

  const tFadeStart = absFrame(end);
  const tFadeEnd = tFadeStart + sec(1);

  // --- Active step for prompt box ---
  let activeIdx = -1;
  for (let i = stepTimings.length - 1; i >= 0; i--) {
    if (frame >= stepTimings[i].typeStart) { activeIdx = i; break; }
  }
  const st = activeIdx >= 0 ? stepTimings[activeIdx] : null;
  const activePrompt = activeIdx >= 0 ? steps[activeIdx].prompt : "";

  const showPlaceholder = activeIdx < 0;
  const isTyping = st ? frame >= st.typeStart && frame < st.typeEnd : false;
  const hasTyped = st ? frame >= st.typeEnd : false;
  const isEntered = st ? frame >= st.enter : false;
  const isBlue = st ? frame >= st.enter : false; // jump straight to blue on enter (no loading)

  const typeProgress = st ? interpolate(frame, [st.typeStart, st.typeEnd], [0, 1], clamp) : 0;
  const charsVisible = Math.floor(typeProgress * activePrompt.length);
  const typedText = activePrompt.slice(0, charsVisible);
  const cursorOn = (isTyping || (hasTyped && !isEntered)) && Math.floor(frame / 4) % 2 === 0;

  // Prompt-box entrance (once)
  const entranceY = spring({ frame, fps, config: { damping: 11, stiffness: 120, mass: 0.8 } });
  const promptY = interpolate(entranceY, [0, 1], [400, 0]);
  const entranceOpacity = interpolate(frame, [0, sec(0.2)], [0, 1], clamp);

  // Enter pulse (per step)
  const enterElapsed = st ? frame - st.enter : -1;
  const promptPulseScale = isEntered
    ? 1 + 0.04 * Math.max(0, Math.sin(Math.min(enterElapsed / fps, 0.3) / 0.3 * Math.PI))
    : 1;

  // Color shift on enter (for reset between steps, colorShift drops back to 0 when new step starts)
  const colorShift = st ? interpolate(frame, [st.enter, st.enter + sec(0.4)], [0, 1], clamp) : 0;

  // Arrow → tick
  const tickRaw = (st && isBlue) ? spring({ frame: frame - st.enter, fps, config: { damping: 30, stiffness: 120 } }) : 0;
  const tickProgress = Math.min(1, Math.max(0, tickRaw));

  const promptBoxBg = colorShift > 0
    ? `linear-gradient(135deg, rgba(125,211,252,${0.08 * colorShift}), rgba(125,211,252,${0.04 * colorShift})), ${BOX_BG}`
    : BOX_BG;

  // Prompt box dimensions (PromptBoxBottom design)
  const pBoxW = 1600;
  const pBoxH = 160;
  const pBoxR = 32;
  const pBoxLeft = (width - pBoxW) / 2;
  const pBoxTop = height - pBoxH - 160;

  // Large card center position
  const centerX = (width - CARD_W) / 2;
  const centerY = 200;

  // Small card column (stacks top-to-bottom on the left)
  const colX = 80;
  const colStartY = 80;
  const colGap = 40;

  // Final fade
  const finalFade = interpolate(frame, [tFadeStart, tFadeEnd], [1, 0], clamp);

  return (
    <AbsoluteFill style={{ fontFamily: FONT, opacity: finalFade }}>

      {/* === Subgoal Cards === */}
      {steps.map((step, i) => {
        const cst = stepTimings[i];
        if (frame < cst.cardIn) return null;

        // Spring in from scale 0 to 1 at center
        const springIn = Math.min(1, Math.max(0, spring({ frame: frame - cst.cardIn, fps, config: { damping: 16, stiffness: 140 } })));

        // Shrink + move to stacked column
        const shrinkProg = interpolate(frame, [cst.cardShrink, cst.cardAtPosition], [0, 1], clamp);
        const smallH = CARD_H * SMALL_SCALE;
        const targetX = colX;
        const targetY = colStartY + i * (smallH + colGap);

        const scale = interpolate(shrinkProg, [0, 1], [1, SMALL_SCALE]);
        const x = interpolate(shrinkProg, [0, 1], [centerX, targetX]);
        const y = interpolate(shrinkProg, [0, 1], [centerY, targetY]);

        // Mosaic image reveal
        const revealProgress = interpolate(frame, [cst.cardIn, cst.cardRevealEnd], [0, 1], clamp);
        const mosaicScale = interpolate(revealProgress, [0, 0.5, 0.85, 1], [0.02, 0.06, 0.3, 1]);
        const blurAmount = interpolate(revealProgress, [0, 0.5, 0.85, 1], [12, 6, 3, 0]);

        // Completion: pulse + white fade + checkmark
        const completeRaw = frame >= cst.complete
          ? spring({ frame: frame - cst.complete, fps, config: { damping: 22, stiffness: 140 } })
          : 0;
        const completeProgress = Math.min(1, Math.max(0, completeRaw));
        const pulseElapsed = frame - cst.complete;
        const completePulse = frame >= cst.complete
          ? 1 + 0.05 * Math.max(0, Math.sin(Math.min(pulseElapsed / fps, 0.5) / 0.5 * Math.PI))
          : 1;

        // z-index: card in center/animating on top
        const isCenterPhase = frame >= cst.cardIn && frame < cst.cardAtPosition;
        const zIndex = isCenterPhase ? 10 : 1;

        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: x,
              top: y,
              width: CARD_W,
              height: CARD_H,
              transform: `scale(${scale * springIn * completePulse})`,
              transformOrigin: "top left",
              opacity: springIn,
              zIndex,
            }}
          >
            <div
              style={{
                position: "absolute",
                inset: 0,
                borderRadius: 20,
                background: BOX_BG,
                border: `2px solid ${BORDER}`,
                boxShadow: "0 16px 60px rgba(0,0,0,0.25)",
                overflow: "hidden",
              }}
            >
              <div style={{ padding: "36px 40px 18px", fontSize: 48, fontWeight: 600, color: LABEL_COLOR, letterSpacing: 4, textTransform: "uppercase" }}>
                Visual Subgoal
              </div>
              <div style={{ margin: "0 40px 24px", width: IMG_W, height: IMG_H, borderRadius: 12, overflow: "hidden", background: "#e5e7eb" }}>
                <div style={{ width: IMG_W, height: IMG_H, overflow: "hidden" }}>
                  <Img
                    src={staticFile(step.image)}
                    style={{
                      width: Math.max(2, Math.round(IMG_W * mosaicScale)),
                      height: Math.max(2, Math.round(IMG_H * mosaicScale)),
                      imageRendering: mosaicScale < 1 ? "pixelated" : "auto",
                      transform: `scale(${1 / mosaicScale})`,
                      transformOrigin: "top left",
                      filter: `blur(${blurAmount}px) saturate(${interpolate(revealProgress, [0, 1], [0.2, 1])})`,
                    }}
                  />
                </div>
              </div>
              <div style={{ margin: "0 40px", height: 1, background: "rgba(0,0,0,0.08)" }} />
              <div style={{ padding: "28px 40px 12px", fontSize: 48, fontWeight: 600, color: LABEL_COLOR, letterSpacing: 4, textTransform: "uppercase" }}>
                Textual Subgoal
              </div>
              <div style={{ padding: "0 40px 72px", fontSize: 56, fontWeight: 500, color: TEXT_COLOR, lineHeight: 1.25 }}>
                "{step.prompt}"
              </div>
            </div>

            {/* Completion overlay: white fade + large black checkmark */}
            {completeProgress > 0 && (
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  borderRadius: 20,
                  background: `rgba(255,255,255,${0.85 * completeProgress})`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  pointerEvents: "none",
                }}
              >
                <svg
                  width={CARD_W * 0.5}
                  height={CARD_W * 0.5}
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#000"
                  strokeWidth={2.5}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  style={{
                    transform: `scale(${completeProgress})`,
                    opacity: completeProgress,
                  }}
                >
                  <path
                    d="M5 12l5 5L20 7"
                    strokeDasharray={24}
                    strokeDashoffset={24 * (1 - completeProgress)}
                  />
                </svg>
              </div>
            )}
          </div>
        );
      })}

      {/* === Prompt Box (bottom) === */}
      <div
        style={{
          position: "absolute",
          left: pBoxLeft,
          top: pBoxTop,
          transform: `translateY(${promptY}px) scale(${promptPulseScale})`,
          transformOrigin: "center",
          opacity: entranceOpacity,
          width: pBoxW,
          height: pBoxH,
          zIndex: 20,
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: pBoxR,
            background: promptBoxBg,
            border: `2px solid ${isBlue ? `rgba(125,211,252,${0.4 * colorShift})` : BORDER}`,
            boxShadow: "0 8px 40px rgba(0,0,0,0.2)",
          }}
        />
        <div style={{ position: "relative", height: "100%", display: "flex", alignItems: "center", padding: "0 52px", zIndex: 1 }}>
          {showPlaceholder && (
            <span style={{ color: PLACEHOLDER_COLOR, fontSize: 60, fontStyle: "italic", fontWeight: 400 }}>
              Type Prompt
            </span>
          )}
          {!showPlaceholder && (
            <span style={{ color: isBlue ? BLUE : TEXT_COLOR, fontSize: 60, fontWeight: 500 }}>
              {typedText}
              <span style={{ opacity: cursorOn ? 1 : 0, color: TEXT_COLOR, marginLeft: 4, fontWeight: 300 }}>▎</span>
            </span>
          )}
          {hasTyped && (
            <div
              style={{
                position: "absolute",
                right: 20,
                top: "50%",
                transform: `translateY(-50%) scale(${isEntered ? promptPulseScale : 1})`,
                width: 120,
                height: 120,
                borderRadius: 48,
                background: isBlue
                  ? `linear-gradient(135deg, ${BLUE}, #38bdf8)`
                  : isEntered
                    ? "rgba(0,0,0,0.85)"
                    : "rgba(0,0,0,0.5)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                boxShadow: isBlue
                  ? "0 0 40px rgba(125,211,252,0.4)"
                  : isEntered
                    ? "0 0 24px rgba(0,0,0,0.2)"
                    : "none",
              }}
            >
              <svg width={48} height={48} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12h14M12 5l7 7-7 7" opacity={1 - tickProgress} />
                <path d="M5 12l5 5L20 7" opacity={tickProgress} strokeDasharray="24" strokeDashoffset={24 * (1 - tickProgress)} />
              </svg>
            </div>
          )}
        </div>
      </div>
    </AbsoluteFill>
  );
};
