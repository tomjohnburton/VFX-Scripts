import { AbsoluteFill, Audio, Img, Sequence, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { mmssToSec } from "./time";

const FONT = "'Suisse Intl', Inter, -apple-system, Helvetica, Arial, sans-serif";

const BOX_BG = "#ffffff";
const BORDER = "rgba(0,0,0,0.10)";
const GREEN = "#22c55e";
const PLACEHOLDER_COLOR = "rgba(0,0,0,0.30)";
const TEXT_COLOR = "#1a1a1e";
const LABEL_COLOR = "#6b7280";

const KEYBOARD_SOUNDS = [
  "Rapid,_chaotic_keybo_#1-1776185434981.wav",
  "Rapid,_chaotic_keybo_#2-1776185368203.wav",
  "Rapid,_chaotic_keybo_#3-1776185392391.wav",
  "Rapid,_chaotic_keybo_#4-1776185414155.wav",
];

const ENTER_SOUNDS = ["enter1.wav", "enter2.wav", "enter3.wav"];

// Deterministic pseudo-random pick per step index — stable across renders.
const pickEnter = (i: number) => ENTER_SOUNDS[(i * 2654435761) % ENTER_SOUNDS.length];

export type SubgoalBuilderV2Step = {
  prompt: string;
  image: string;
  typeStart: number; // mm.ss (e.g. 1.32 = 1m32s)
  complete: number;  // mm.ss
};

export type SubgoalBuilderV2Props = {
  steps: SubgoalBuilderV2Step[];
  start: number; // mm.ss — absolute timestamp that maps to frame 0
  end: number;   // mm.ss — absolute timestamp when fade-out begins
};

// Prompt box + card share width; card stacks flush above the prompt box like a drawer.
const BOX_W = 1400;
const BOX_H = 160;
const BOX_R = 32;

const IMG_W = BOX_W - 80;
const IMG_H = Math.round(IMG_W * (9 / 16));
// Extra bottom padding so text clears the overlapping prompt box (see CARD_OVERLAP).
const CARD_BOTTOM_PAD = 72 + 48;
// Textual subgoal: up to 2 lines at fontSize 56 × lineHeight 1.25 = 70px per line.
const TEXT_FONT_SIZE = 56;
const TEXT_LINE_HEIGHT = 1.25;
const TEXT_MAX_LINES = 2;
const TEXT_BLOCK_H = Math.ceil(TEXT_FONT_SIZE * TEXT_LINE_HEIGHT) * TEXT_MAX_LINES;
// padding + label + gap + image + gap + divider + label + text + padding
const CARD_H = 36 + 48 + 18 + IMG_H + 24 + 1 + 28 + 56 + TEXT_BLOCK_H + CARD_BOTTOM_PAD;

export const SubgoalBuilderV2: React.FC<SubgoalBuilderV2Props> = ({ steps, start, end }) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();

  const sec = (s: number) => Math.round(s * fps);
  const clamp = { extrapolateLeft: "clamp" as const, extrapolateRight: "clamp" as const };

  // Scenario timestamps are absolute on the full-video timeline; frame 0 of this
  // composition maps to `start`. Convert any absolute mm.ss timestamp into a
  // frame offset by subtracting the base.
  const baseSec = mmssToSec(start);
  const absFrame = (mmss: number) => sec(mmssToSec(mmss) - baseSec);

  // --- Per-step timings ---
  // Each step: type → enter → drawer opens → card visible → complete → drawer closes.
  // Monotonicity guards: each phase at least 1 frame, complete ≥ drawerOpenEnd + reveal.
  // Compressed so the image is fully revealed by typeStart + 3.0s:
  //   type 0.9s → enter 1.1s → drawerOpen 1.3s → drawerOpenEnd 1.7s → revealEnd 3.0s (1.3s window)
  const stepTimings = steps.map((s) => {
    const typeStart = absFrame(s.typeStart);
    const typeEnd = typeStart + sec(0.9);
    const enter = typeStart + sec(1.1);
    const drawerOpenStart = typeStart + sec(1.3);
    const drawerOpenEnd = drawerOpenStart + sec(0.4);
    const requested = absFrame(s.complete);
    const minComplete = drawerOpenEnd + sec(1.3);
    const complete = Math.max(requested, minComplete);
    const drawerCloseStart = complete + sec(0.9);
    const drawerCloseEnd = drawerCloseStart + sec(0.35);
    return { typeStart, typeEnd, enter, drawerOpenStart, drawerOpenEnd, complete, drawerCloseStart, drawerCloseEnd };
  });

  const tFadeStart = absFrame(end);
  const tFadeEnd = tFadeStart + sec(1);

  // --- Active step for prompt box (latest typeStart ≤ frame) ---
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
  const isBlue = st ? frame >= st.enter : false;
  const isGreen = isBlue;
  const showEnterButton = st ? frame >= st.typeStart : false;

  const typeProgress = st ? interpolate(frame, [st.typeStart, st.typeEnd], [0, 1], clamp) : 0;
  const charsVisible = Math.floor(typeProgress * activePrompt.length);
  const typedText = activePrompt.slice(0, charsVisible);
  const cursorOn = (isTyping || hasTyped || showPlaceholder) && Math.floor(frame / 20) % 2 === 0;

  // One-time entrance slide
  const entranceY = spring({ frame, fps, config: { damping: 11, stiffness: 120, mass: 0.8 } });
  const promptY = interpolate(entranceY, [0, 1], [400, 0]);
  const entranceOpacity = interpolate(frame, [0, sec(0.2)], [0, 1], clamp);

  // Per-step enter pulse
  const enterElapsed = st ? frame - st.enter : -1;
  const promptPulseScale = isEntered
    ? 1 + 0.04 * Math.max(0, Math.sin(Math.min(enterElapsed / fps, 0.3) / 0.3 * Math.PI))
    : 1;

  // Prompt box color shift white → blue on enter (resets when next step starts typing)
  const colorShift = st ? interpolate(frame, [st.enter, st.enter + sec(0.4)], [0, 1], clamp) : 0;

  // Arrow → tick
  const tickRaw = (st && isBlue) ? spring({ frame: frame - st.enter, fps, config: { damping: 30, stiffness: 120 } }) : 0;
  const tickProgress = Math.min(1, Math.max(0, tickRaw));

  const promptBoxBg = colorShift > 0
    ? `linear-gradient(135deg, rgba(34,197,94,${0.08 * colorShift}), rgba(34,197,94,${0.04 * colorShift})), ${BOX_BG}`
    : BOX_BG;

  // --- Position: bottom-right ---
  const MARGIN = 120;
  const pBoxLeft = width - BOX_W - MARGIN;
  const pBoxTop = height - BOX_H - MARGIN;
  // Overlap the card behind the prompt box (card has zIndex 15, box 20)
  // so the card tucks underneath instead of leaving a visible seam.
  const CARD_OVERLAP = 48;
  const cardLeft = pBoxLeft;
  const cardTop = pBoxTop - CARD_H + CARD_OVERLAP;

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

      {stepTimings.map((t, i) => (
        <Sequence key={`alert-${i}`} from={t.complete} durationInFrames={sec(2)}>
          <Audio src={staticFile("alert.wav")} volume={0.8} />
        </Sequence>
      ))}

      {/* === Drawer: opens once, persists across steps; content swaps inside === */}
      {(() => {
        const firstOpen = stepTimings[0];
        const lastStep = stepTimings[stepTimings.length - 1];
        const globalCloseStart = lastStep.complete + sec(0.9);
        const globalCloseEnd = globalCloseStart + sec(0.35);

        if (frame < firstOpen.drawerOpenStart || frame >= globalCloseEnd) return null;

        // Global drawer open/close — only animates at the very start and end.
        let drawerProgress: number;
        if (frame < firstOpen.drawerOpenEnd) {
          const raw = spring({ frame: frame - firstOpen.drawerOpenStart, fps, config: { damping: 22, stiffness: 130 } });
          drawerProgress = Math.min(1, Math.max(0, raw));
        } else if (frame < globalCloseStart) {
          drawerProgress = 1;
        } else {
          drawerProgress = interpolate(frame, [globalCloseStart, globalCloseEnd], [1, 0], clamp);
        }
        const translateY = (1 - drawerProgress) * CARD_H;

        // Active step: latest whose drawerOpenStart has passed.
        let cardIdx = 0;
        for (let i = stepTimings.length - 1; i >= 0; i--) {
          if (frame >= stepTimings[i].drawerOpenStart) { cardIdx = i; break; }
        }
        const cst = stepTimings[cardIdx];
        const step = steps[cardIdx];

        // For the first step, reveal starts at drawerOpenEnd (after the drawer finishes opening).
        // For subsequent steps, reveal starts at that step's drawerOpenStart so the content
        // swap feels instant — the drawer doesn't re-open, it just refreshes.
        const revealStart = cardIdx === 0 ? cst.drawerOpenEnd : cst.drawerOpenStart;
        const revealEnd = Math.min(revealStart + sec(1.3), cst.complete);
        const revealProgress = interpolate(frame, [revealStart, revealEnd], [0, 1], clamp);
        const mosaicScale = interpolate(revealProgress, [0, 0.4, 0.8, 1], [0.04, 0.12, 0.45, 1]);
        const blurAmount = interpolate(revealProgress, [0, 0.4, 0.8, 1], [10, 5, 2, 0]);

        // Per-step completion flash. For non-final steps, fade the overlay back out
        // before the next step's content swaps in, so we don't carry the white flash
        // into the new image.
        const isLastStep = cardIdx === stepTimings.length - 1;
        const nextStart = isLastStep ? Infinity : stepTimings[cardIdx + 1].drawerOpenStart;
        const flashInRaw = frame >= cst.complete
          ? spring({ frame: frame - cst.complete, fps, config: { damping: 22, stiffness: 140 } })
          : 0;
        const flashIn = Math.min(1, Math.max(0, flashInRaw));
        const flashOut = isLastStep
          ? 1
          : interpolate(frame, [nextStart - sec(0.25), nextStart], [1, 0], clamp);
        const completeProgress = flashIn * flashOut;
        const pulseElapsed = frame - cst.complete;
        const completePulse = frame >= cst.complete && frame < nextStart
          ? 1 + 0.03 * Math.max(0, Math.sin(Math.min(pulseElapsed / fps, 0.4) / 0.4 * Math.PI))
          : 1;

        return (
          <div
            style={{
              position: "absolute",
              left: cardLeft,
              top: cardTop,
              width: BOX_W,
              height: CARD_H,
              overflow: "hidden",
              zIndex: 15,
            }}
          >
            <div
              style={{
                position: "absolute",
                inset: 0,
                transform: `translateY(${translateY}px) scale(${completePulse})`,
                transformOrigin: "bottom center",
              }}
            >
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  borderTopLeftRadius: BOX_R,
                  borderTopRightRadius: BOX_R,
                  borderBottomLeftRadius: 0,
                  borderBottomRightRadius: 0,
                  background: BOX_BG,
                  border: `2px solid ${BORDER}`,
                  borderBottom: "none",
                  boxShadow: "0 -16px 60px rgba(0,0,0,0.18)",
                  overflow: "hidden",
                }}
              >
                <div style={{ padding: "36px 40px 18px", fontSize: 48, fontWeight: 600, color: LABEL_COLOR, letterSpacing: 4, textTransform: "uppercase" }}>
                  Visual Subgoal
                </div>
                <div style={{ margin: "0 40px 24px", width: IMG_W, height: IMG_H, borderRadius: 12, overflow: "hidden", background: "#e5e7eb" }}>
                  <div style={{ width: IMG_W, height: IMG_H, overflow: "hidden" }}>
                    <Img
                      key={cardIdx}
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
                <div style={{
                  padding: `0 40px ${CARD_BOTTOM_PAD}px`,
                  fontSize: TEXT_FONT_SIZE,
                  fontWeight: 500,
                  color: TEXT_COLOR,
                  lineHeight: TEXT_LINE_HEIGHT,
                  minHeight: TEXT_BLOCK_H,
                  display: "-webkit-box",
                  WebkitLineClamp: TEXT_MAX_LINES,
                  WebkitBoxOrient: "vertical",
                  overflow: "hidden",
                }}>
                  "{step.prompt}"
                </div>
              </div>

              {completeProgress > 0 && (
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    borderTopLeftRadius: BOX_R,
                    borderTopRightRadius: BOX_R,
                    background: `rgba(255,255,255,${0.85 * completeProgress})`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    pointerEvents: "none",
                  }}
                >
                  <svg
                    width={BOX_W * 0.4}
                    height={BOX_W * 0.4}
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#000"
                    strokeWidth={2.5}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    style={{ transform: `scale(${completeProgress})`, opacity: completeProgress }}
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
          </div>
        );
      })()}

      {/* === Prompt Box (bottom-left) === */}
      <div
        style={{
          position: "absolute",
          left: pBoxLeft,
          top: pBoxTop,
          transform: `translateY(${promptY}px) scale(${promptPulseScale})`,
          transformOrigin: "center",
          opacity: entranceOpacity,
          width: BOX_W,
          height: BOX_H,
          zIndex: 20,
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: BOX_R,
            background: promptBoxBg,
            border: `2px solid ${isGreen ? `rgba(34,197,94,${0.4 * colorShift})` : BORDER}`,
            boxShadow: "0 8px 40px rgba(0,0,0,0.2)",
          }}
        />
        <div style={{ position: "relative", height: "100%", display: "flex", alignItems: "center", padding: "0 52px", zIndex: 1 }}>
          {showPlaceholder && (
            <span style={{ fontSize: 60, display: "inline-flex", alignItems: "center" }}>
              <span style={{ opacity: cursorOn ? 0.8 : 0, background: TEXT_COLOR, width: 3, height: 68, marginRight: 2 }} />
              <span style={{ color: PLACEHOLDER_COLOR, fontStyle: "italic", fontWeight: 400 }}>Type Prompt</span>
            </span>
          )}
          {!showPlaceholder && (
            <span style={{ color: TEXT_COLOR, fontSize: 60, fontWeight: 500, display: "inline-flex", alignItems: "center" }}>
              {typedText}
              <span style={{ opacity: cursorOn ? 0.8 : 0, background: TEXT_COLOR, width: 3, height: 68, marginLeft: 2 }} />
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
                background: isGreen
                  ? `linear-gradient(135deg, ${GREEN}, #16a34a)`
                  : "rgba(0,0,0,0.85)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                boxShadow: isGreen
                  ? "0 0 40px rgba(34,197,94,0.4)"
                  : "0 0 24px rgba(0,0,0,0.2)",
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
