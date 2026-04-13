import { AbsoluteFill, Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";

const FONT = "'Suisse Intl', Inter, -apple-system, Helvetica, Arial, sans-serif";

const BOX_BG = "#ffffff";
const BORDER = "rgba(0,0,0,0.10)";
const BLUE = "#7dd3fc";
const PLACEHOLDER_COLOR = "rgba(0,0,0,0.30)";
const TEXT_COLOR = "#1a1a1e";
const LABEL_COLOR = "#6b7280";

const LEFT = 60;
const COL_W = 360;

const STEPS = [
  { prompt: "Open the microwave", image: "World Model Vis_01_01_01_18.jpg" },
  { prompt: "Pick up the burrito in the microwave", image: "pick_up_burrito.jpg" },
  { prompt: "Place burrito on the table", image: "place_burrito.jpg" },
];

export const PromptFlow: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const sec = (s: number) => Math.round(s * fps);
  const clamp = { extrapolateLeft: "clamp" as const, extrapolateRight: "clamp" as const };

  // --- Per-step timing ---
  const stepTimings = [
    { typeStart: sec(2.5), complete: sec(11) },
    { typeStart: sec(13), complete: sec(24) },
    { typeStart: sec(27), complete: sec(31) },
  ].map((s) => ({
    typeStart: s.typeStart,
    typeEnd: s.typeStart + sec(1.8),
    enter: s.typeStart + sec(2.4),
    loadStart: s.typeStart + sec(2.7),
    subgoals: s.typeStart + sec(2.8),
    complete: s.complete,
  }));

  const tFadeStart = sec(34);
  const tFadeEnd = sec(35);

  // --- Active step for prompt box ---
  let activeIdx = -1;
  for (let i = stepTimings.length - 1; i >= 0; i--) {
    if (frame >= stepTimings[i].typeStart) { activeIdx = i; break; }
  }

  const st = activeIdx >= 0 ? stepTimings[activeIdx] : null;
  const activePrompt = activeIdx >= 0 ? STEPS[activeIdx].prompt : "";

  // Prompt box state (derived from active step)
  const showPlaceholder = activeIdx < 0;
  const isTyping = st ? frame >= st.typeStart && frame < st.typeEnd : false;
  const hasTyped = st ? frame >= st.typeEnd : false;
  const isEntered = st ? frame >= st.enter : false;
  const isLoading = st ? frame >= st.loadStart : false;
  const isComplete = st ? frame >= st.complete : false;

  const typeProgress = st ? interpolate(frame, [st.typeStart, st.typeEnd], [0, 1], clamp) : 0;
  const charsVisible = Math.floor(typeProgress * activePrompt.length);
  const typedText = activePrompt.slice(0, charsVisible);
  const cursorOn = (isTyping || (hasTyped && !isEntered)) && Math.floor(frame / 4) % 2 === 0;

  // Entrance (once)
  const entranceY = spring({ frame, fps, config: { damping: 11, stiffness: 120, mass: 0.8 } });
  const translateY = interpolate(entranceY, [0, 1], [200, 0]);
  const entranceOpacity = interpolate(frame, [0, sec(0.2)], [0, 1], clamp);

  // Enter pulse
  const enterElapsed = st ? frame - st.enter : -1;
  const pulseScale = isEntered
    ? 1 + 0.05 * Math.max(0, Math.sin(Math.min(enterElapsed / fps, 0.3) / 0.3 * Math.PI))
    : 1;

  // Loading outline
  const loadProgress = st ? interpolate(frame, [st.loadStart, st.complete], [0, 1], clamp) : 0;

  // Color shift white → blue
  const colorShift = st ? interpolate(frame, [st.complete, st.complete + sec(0.5)], [0, 1], clamp) : 0;
  const olR = Math.round(interpolate(colorShift, [0, 1], [255, 125]));
  const olG = Math.round(interpolate(colorShift, [0, 1], [255, 211]));
  const olB = Math.round(interpolate(colorShift, [0, 1], [255, 252]));
  const outlineColor = `rgb(${olR},${olG},${olB})`;

  // Arrow → tick
  const tickRaw = (st && isComplete) ? spring({ frame: frame - st.complete, fps, config: { damping: 30, stiffness: 120 } }) : 0;
  const tickProgress = Math.min(1, Math.max(0, tickRaw));

  const boxBackground = colorShift > 0
    ? `linear-gradient(135deg, rgba(125,211,252,${0.08 * colorShift}), rgba(125,211,252,${0.04 * colorShift})), ${BOX_BG}`
    : BOX_BG;

  // --- Prompt box dimensions ---
  const promptY = 60;
  const boxW = COL_W;
  const boxH = 48;
  const boxR = 10;
  const boxPerimeter = 2 * (boxW + boxH) - 8 * boxR + 2 * Math.PI * boxR;

  // --- Subgoal card dimensions ---
  const imgW = COL_W - 32;
  const imgH = Math.round(imgW * (9 / 16));
  const sgH = 36 + imgH + 16 + 1 + 32 + 36;
  const cardGap = 12;
  const firstCardY = promptY + boxH + 24;

  // Final fade
  const finalFade = interpolate(frame, [tFadeStart, tFadeEnd], [1, 0], clamp);

  return (
    <AbsoluteFill style={{ fontFamily: FONT, opacity: finalFade }}>

      {/* === Prompt Box === */}
      <div
        style={{
          position: "absolute", left: LEFT, top: promptY,
          transform: `translateY(${translateY}px) scale(${pulseScale})`,
          transformOrigin: "top left",
          opacity: entranceOpacity,
          width: boxW, height: boxH,
        }}
      >
        <div
          style={{
            position: "absolute", inset: 0, borderRadius: boxR,
            background: boxBackground,
            border: `1px solid ${isComplete ? `rgba(125,211,252,${0.4 * colorShift})` : BORDER}`,
            boxShadow: "0 2px 12px rgba(0,0,0,0.15)",
          }}
        />
        {isLoading && !isComplete && (
          <svg width={boxW + 4} height={boxH + 4} style={{ position: "absolute", left: -2, top: -2, pointerEvents: "none" }}>
            <rect x={2} y={2} width={boxW} height={boxH} rx={boxR} ry={boxR}
              fill="none" stroke={outlineColor} strokeWidth={2.5}
              strokeDasharray={`${boxPerimeter}`} strokeDashoffset={boxPerimeter * (1 - loadProgress)}
              strokeLinecap="round" style={{ filter: `drop-shadow(0 0 4px ${outlineColor})` }}
            />
          </svg>
        )}
        {isComplete && (
          <svg width={boxW + 4} height={boxH + 4} style={{ position: "absolute", left: -2, top: -2, pointerEvents: "none" }}>
            <rect x={2} y={2} width={boxW} height={boxH} rx={boxR} ry={boxR}
              fill="none" stroke={outlineColor} strokeWidth={2.5}
              strokeLinecap="round" style={{ filter: `drop-shadow(0 0 4px ${outlineColor})` }}
            />
          </svg>
        )}
        <div style={{ position: "relative", height: "100%", display: "flex", alignItems: "center", padding: "0 16px", zIndex: 1 }}>
          {showPlaceholder && (
            <span style={{ color: PLACEHOLDER_COLOR, fontSize: 16, fontStyle: "italic" }}>Type Prompt</span>
          )}
          {!showPlaceholder && (
            <span style={{ color: isComplete ? BLUE : TEXT_COLOR, fontSize: 16, fontWeight: 500 }}>
              {typedText}
              <span style={{ opacity: cursorOn ? 1 : 0, color: TEXT_COLOR, marginLeft: 1, fontWeight: 300 }}>▎</span>
            </span>
          )}
          {hasTyped && (
            <div
              style={{
                position: "absolute", right: 6, top: "50%",
                transform: `translateY(-50%) scale(${isEntered ? pulseScale : 1})`,
                width: 34, height: 34, borderRadius: 8,
                background: isComplete ? `linear-gradient(135deg, ${BLUE}, #38bdf8)` : isEntered ? "rgba(0,0,0,0.85)" : "rgba(0,0,0,0.5)",
                display: "flex", alignItems: "center", justifyContent: "center",
                boxShadow: isComplete ? "0 0 12px rgba(125,211,252,0.4)" : isEntered ? "0 0 8px rgba(0,0,0,0.2)" : "none",
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12h14M12 5l7 7-7 7" opacity={1 - tickProgress} />
                <path d="M5 12l5 5L20 7" opacity={tickProgress} strokeDasharray="24" strokeDashoffset={24 * (1 - tickProgress)} />
              </svg>
            </div>
          )}
        </div>
      </div>

      {/* === Subgoal Cards === */}
      {STEPS.map((step, i) => {
        const st = stepTimings[i];
        if (frame < st.subgoals) return null;

        const cardY = firstCardY + i * (sgH + cardGap);
        const cardE = spring({ frame: frame - st.subgoals, fps, config: { damping: 16, stiffness: 140 } });
        const cardComplete = frame >= st.complete;
        const cardColorShift = interpolate(frame, [st.complete, st.complete + sec(0.5)], [0, 1], clamp);

        // Mosaic reveal
        const revealProgress = interpolate(frame, [st.subgoals, st.complete], [0, 1], clamp);
        const mosaicScale = interpolate(revealProgress, [0, 0.5, 0.85, 1], [0.02, 0.06, 0.3, 1]);
        const blurAmount = interpolate(revealProgress, [0, 0.5, 0.85, 1], [8, 4, 2, 0]);

        return (
          <div
            key={i}
            style={{
              position: "absolute", left: LEFT, top: cardY,
              width: COL_W,
              opacity: cardE,
              transform: `translateY(${20 * (1 - cardE)}px)`,
              borderRadius: 12,
              background: BOX_BG,
              border: `1px solid ${BORDER}`,
              outline: cardComplete ? `3px solid ${BLUE}` : "none",
              outlineOffset: -1,
              boxShadow: "0 4px 16px rgba(0,0,0,0.12)",
              overflow: "hidden",
            }}
          >
            <div style={{ padding: "14px 16px 8px", fontSize: 11, fontWeight: 600, color: LABEL_COLOR, letterSpacing: 1.5, textTransform: "uppercase" }}>
              Visual Subgoal
            </div>
            <div style={{ margin: "0 16px 16px", width: imgW, height: imgH, borderRadius: 8, overflow: "hidden", background: "#e5e7eb" }}>
              <div style={{ width: imgW, height: imgH, overflow: "hidden" }}>
                <Img
                  src={staticFile(step.image)}
                  style={{
                    width: Math.max(2, Math.round(imgW * mosaicScale)),
                    height: Math.max(2, Math.round(imgH * mosaicScale)),
                    imageRendering: mosaicScale < 1 ? "pixelated" : "auto",
                    transform: `scale(${1 / mosaicScale})`,
                    transformOrigin: "top left",
                    filter: `blur(${blurAmount}px) saturate(${interpolate(revealProgress, [0, 1], [0.2, 1])})`,
                  }}
                />
              </div>
            </div>
            <div style={{ margin: "0 16px", height: 1, background: "rgba(0,0,0,0.06)" }} />
            <div style={{ padding: "12px 16px 6px", fontSize: 11, fontWeight: 600, color: LABEL_COLOR, letterSpacing: 1.5, textTransform: "uppercase" }}>
              Textual Subgoal
            </div>
            <div style={{ padding: "0 16px 16px", fontSize: 16, fontWeight: 500, color: TEXT_COLOR, lineHeight: 1.35 }}>
              "{step.prompt}"
            </div>
          </div>
        );
      })}
    </AbsoluteFill>
  );
};
