import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";

const FONT = "'Suisse Intl', Inter, -apple-system, Helvetica, Arial, sans-serif";

const BOX_BG = "#ffffff";
const BORDER = "rgba(0,0,0,0.10)";
const BLUE = "#7dd3fc";
const PLACEHOLDER_COLOR = "rgba(0,0,0,0.30)";
const TEXT_COLOR = "#1a1a1e";

const PROMPT_TEXT = "Open the microwave";

export const PromptBoxSmall: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const sec = (s: number) => Math.round(s * fps);
  const clamp = { extrapolateLeft: "clamp" as const, extrapolateRight: "clamp" as const };

  const tTypeStart = sec(2.5);
  const tTypeEnd = tTypeStart + sec(1.8);
  const tEnter = tTypeEnd + sec(0.6);
  const tLoadStart = tEnter + sec(0.3);
  const tComplete = sec(8);
  const tFadeStart = sec(11);
  const tFadeEnd = sec(12);

  // Bounce entrance from bottom
  const entranceY = spring({ frame, fps, config: { damping: 11, stiffness: 120, mass: 0.8 } });
  const translateY = interpolate(entranceY, [0, 1], [200, 0]);
  const entranceOpacity = interpolate(frame, [0, sec(0.2)], [0, 1], clamp);

  // Typing
  const typeProgress = interpolate(frame, [tTypeStart, tTypeEnd], [0, 1], clamp);
  const charsVisible = Math.floor(typeProgress * PROMPT_TEXT.length);
  const typedText = PROMPT_TEXT.slice(0, charsVisible);
  const isTyping = frame >= tTypeStart && frame < tTypeEnd;
  const hasTyped = frame >= tTypeEnd;
  const showPlaceholder = frame < tTypeStart;
  const cursorOn = (isTyping || (hasTyped && frame < tEnter)) && Math.floor(frame / 4) % 2 === 0;

  // Enter pulse: pop out then bounce back to 1.0
  const enterElapsed = frame - tEnter;
  const pulseScale = frame >= tEnter
    ? 1 + 0.05 * Math.max(0, Math.sin(Math.min(enterElapsed / fps, 0.3) / 0.3 * Math.PI))
    : 1;

  // Loading: single line, runs once from 0→1
  const isLoading = frame >= tLoadStart;
  const isComplete = frame >= tComplete;
  const loadProgress = interpolate(frame, [tLoadStart, tComplete], [0, 1], clamp);

  // Color: white during loading → blue on completion
  const colorShift = interpolate(frame, [tComplete, tComplete + sec(0.5)], [0, 1], clamp);
  const outlineR = Math.round(interpolate(colorShift, [0, 1], [255, 125]));
  const outlineG = Math.round(interpolate(colorShift, [0, 1], [255, 211]));
  const outlineB = Math.round(interpolate(colorShift, [0, 1], [255, 252]));
  const outlineColor = `rgb(${outlineR},${outlineG},${outlineB})`;

  // Arrow → tick (smooth, no overshoot)
  const tickRaw = isComplete
    ? spring({ frame: frame - tComplete, fps, config: { damping: 30, stiffness: 120 } })
    : 0;
  const tickProgress = Math.min(1, Math.max(0, tickRaw));

  // Final fade
  const finalFade = interpolate(frame, [tFadeStart, tFadeEnd], [1, 0], clamp);

  // Box dimensions: half the pill size, rectangle with small radius
  const boxW = 360;
  const boxH = 48;
  const boxR = 10;
  const perimeter = 2 * (boxW + boxH) - 8 * boxR + 2 * Math.PI * boxR;

  // Box bg tints blue on complete
  const boxBackground = colorShift > 0
    ? `linear-gradient(135deg, rgba(125,211,252,${0.08 * colorShift}), rgba(125,211,252,${0.04 * colorShift})), ${BOX_BG}`
    : BOX_BG;

  return (
    <AbsoluteFill style={{ fontFamily: FONT, opacity: finalFade }}>
      <div
        style={{
          position: "absolute",
          left: 60,
          top: 60,
          transform: `translateY(${translateY}px) scale(${pulseScale})`,
          transformOrigin: "top left",
          opacity: entranceOpacity,
          width: boxW,
          height: boxH,
        }}
      >
        {/* Box background */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: boxR,
            background: boxBackground,
            border: `1px solid ${isComplete ? `rgba(125,211,252,${0.4 * colorShift})` : BORDER}`,
            boxShadow: "0 2px 12px rgba(0,0,0,0.15)",
          }}
        />

        {/* Single loading outline */}
        {isLoading && (
          <svg
            width={boxW + 4}
            height={boxH + 4}
            style={{ position: "absolute", left: -2, top: -2, pointerEvents: "none" }}
          >
            <rect
              x={2} y={2} width={boxW} height={boxH}
              rx={boxR} ry={boxR}
              fill="none"
              stroke={outlineColor}
              strokeWidth={2.5}
              strokeDasharray={`${perimeter}`}
              strokeDashoffset={perimeter * (1 - loadProgress)}
              strokeLinecap="round"
              style={{ filter: `drop-shadow(0 0 4px ${outlineColor})` }}
            />
          </svg>
        )}

        {/* Text content */}
        <div
          style={{
            position: "relative",
            height: "100%",
            display: "flex",
            alignItems: "center",
            padding: "0 16px",
            zIndex: 1,
          }}
        >
          {showPlaceholder && (
            <span style={{ color: PLACEHOLDER_COLOR, fontSize: 16, fontStyle: "italic", fontWeight: 400 }}>
              Type Prompt
            </span>
          )}
          {!showPlaceholder && (
            <span style={{ color: isComplete ? BLUE : TEXT_COLOR, fontSize: 16, fontWeight: 500 }}>
              {typedText}
              <span style={{ opacity: cursorOn ? 1 : 0, color: TEXT_COLOR, marginLeft: 1, fontWeight: 300 }}>▎</span>
            </span>
          )}

          {/* Button: arrow → tick */}
          {hasTyped && (
            <div
              style={{
                position: "absolute",
                right: 6,
                top: "50%",
                transform: `translateY(-50%) scale(${frame >= tEnter ? pulseScale : 1})`,
                width: 34,
                height: 34,
                borderRadius: 8,
                background: isComplete
                  ? `linear-gradient(135deg, ${BLUE}, #38bdf8)`
                  : frame >= tEnter
                    ? `rgba(0,0,0,0.85)`
                    : `rgba(0,0,0,0.5)`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                boxShadow: isComplete
                  ? `0 0 12px rgba(125,211,252,0.4)`
                  : frame >= tEnter
                    ? `0 0 8px rgba(0,0,0,0.2)`
                    : "none",
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                <path
                  d="M5 12h14M12 5l7 7-7 7"
                  opacity={1 - tickProgress}
                />
                <path
                  d="M5 12l5 5L20 7"
                  opacity={tickProgress}
                  strokeDasharray="24"
                  strokeDashoffset={24 * (1 - tickProgress)}
                />
              </svg>
            </div>
          )}
        </div>
      </div>
    </AbsoluteFill>
  );
};
