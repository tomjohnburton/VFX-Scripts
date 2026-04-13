import { AbsoluteFill, Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";

const FONT = "'Suisse Intl', Inter, -apple-system, Helvetica, Arial, sans-serif";

const BOX_BG = "#ffffff";
const BORDER = "rgba(0,0,0,0.10)";
const BLUE = "#7dd3fc";
const PLACEHOLDER_COLOR = "rgba(0,0,0,0.30)";
const TEXT_COLOR = "#1a1a1e";
const LABEL_COLOR = "#6b7280";

export type SubgoalBuilderV2Step = {
  prompt: string;
  image: string;
  typeStart: number;
  complete: number;
};

export type SubgoalBuilderV2Props = {
  steps: SubgoalBuilderV2Step[];
  fadeStart: number;
};

// Prompt box + card share width; card stacks flush above the prompt box like a drawer.
const BOX_W = 1400;
const BOX_H = 160;
const BOX_R = 32;

const IMG_W = BOX_W - 80;
const IMG_H = Math.round(IMG_W * (9 / 16));
// Extra bottom padding so text clears the overlapping prompt box (see CARD_OVERLAP).
const CARD_BOTTOM_PAD = 72 + 48;
// padding + label + gap + image + gap + divider + label + text + padding
const CARD_H = 36 + 48 + 18 + IMG_H + 24 + 1 + 28 + 56 + 56 + CARD_BOTTOM_PAD;

export const SubgoalBuilderV2: React.FC<SubgoalBuilderV2Props> = ({ steps, fadeStart }) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();

  const sec = (s: number) => Math.round(s * fps);
  const clamp = { extrapolateLeft: "clamp" as const, extrapolateRight: "clamp" as const };

  // --- Per-step timings ---
  // Each step: type → enter → drawer opens → card visible → complete → drawer closes.
  // Monotonicity guards: each phase at least 1 frame, complete ≥ drawerOpenEnd + reveal.
  const stepTimings = steps.map((s) => {
    const typeStart = sec(s.typeStart);
    const typeEnd = typeStart + sec(1.8);
    const enter = typeStart + sec(2.4);
    const drawerOpenStart = typeStart + sec(2.8);
    const drawerOpenEnd = drawerOpenStart + sec(0.6);
    const requested = sec(s.complete);
    const minComplete = drawerOpenEnd + sec(1.0);
    const complete = Math.max(requested, minComplete);
    const drawerCloseStart = complete + sec(0.9);
    const drawerCloseEnd = drawerCloseStart + sec(0.35);
    return { typeStart, typeEnd, enter, drawerOpenStart, drawerOpenEnd, complete, drawerCloseStart, drawerCloseEnd };
  });

  const tFadeStart = sec(fadeStart);
  const tFadeEnd = tFadeStart + sec(1);

  // --- Active step for prompt box (latest typeStart ≤ frame) ---
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
  const isBlue = st ? frame >= st.enter : false;

  const typeProgress = st ? interpolate(frame, [st.typeStart, st.typeEnd], [0, 1], clamp) : 0;
  const charsVisible = Math.floor(typeProgress * activePrompt.length);
  const typedText = activePrompt.slice(0, charsVisible);
  const cursorOn = (isTyping || (hasTyped && !isEntered)) && Math.floor(frame / 4) % 2 === 0;

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
    ? `linear-gradient(135deg, rgba(125,211,252,${0.08 * colorShift}), rgba(125,211,252,${0.04 * colorShift})), ${BOX_BG}`
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

      {/* === Drawer: one card at a time, emerges from top of prompt box === */}
      {steps.map((step, i) => {
        const cst = stepTimings[i];
        if (frame < cst.drawerOpenStart || frame >= cst.drawerCloseEnd) return null;

        // Drawer progress: 0 = closed (hidden), 1 = fully open
        let drawerProgress: number;
        if (frame < cst.drawerOpenEnd) {
          // Opening
          const raw = spring({ frame: frame - cst.drawerOpenStart, fps, config: { damping: 22, stiffness: 130 } });
          drawerProgress = Math.min(1, Math.max(0, raw));
        } else if (frame < cst.drawerCloseStart) {
          drawerProgress = 1;
        } else {
          // Closing (quick)
          drawerProgress = interpolate(frame, [cst.drawerCloseStart, cst.drawerCloseEnd], [1, 0], clamp);
        }

        const translateY = (1 - drawerProgress) * CARD_H;

        // Mosaic image reveal: fixed ~0.7s window, starts right after drawer opens.
        // Decoupled from `complete` so long steps don't stretch the animation.
        const revealEnd = Math.min(cst.drawerOpenEnd + sec(0.7), cst.complete);
        const revealProgress = interpolate(frame, [cst.drawerOpenEnd, revealEnd], [0, 1], clamp);
        const mosaicScale = interpolate(revealProgress, [0, 0.4, 0.8, 1], [0.04, 0.12, 0.45, 1]);
        const blurAmount = interpolate(revealProgress, [0, 0.4, 0.8, 1], [10, 5, 2, 0]);

        // Completion: pulse + white fade + black checkmark
        const completeRaw = frame >= cst.complete
          ? spring({ frame: frame - cst.complete, fps, config: { damping: 22, stiffness: 140 } })
          : 0;
        const completeProgress = Math.min(1, Math.max(0, completeRaw));
        const pulseElapsed = frame - cst.complete;
        const completePulse = frame >= cst.complete
          ? 1 + 0.03 * Math.max(0, Math.sin(Math.min(pulseElapsed / fps, 0.4) / 0.4 * Math.PI))
          : 1;

        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: cardLeft,
              top: cardTop,
              width: BOX_W,
              height: CARD_H,
              // Clip so the card is hidden until the drawer opens
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
                  // Flat bottom — blends with prompt box top; rounded top corners
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
                <div style={{ padding: `0 40px ${CARD_BOTTOM_PAD}px`, fontSize: 56, fontWeight: 500, color: TEXT_COLOR, lineHeight: 1.25 }}>
                  "{step.prompt}"
                </div>
              </div>

              {/* Completion overlay: white fade + large black checkmark */}
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
      })}

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
