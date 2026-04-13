import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";

const FONT = "'Suisse Intl', Inter, -apple-system, Helvetica, Arial, sans-serif";

const PILL_BG = "#1a1a1e";
const BORDER = "rgba(255,255,255,0.12)";
const WHITE = "#ffffff";
const BLUE = "#7dd3fc";
const PLACEHOLDER_COLOR = "rgba(255,255,255,0.28)";
const TEXT_COLOR = "#e5e7eb";

export type PromptBoxProps = {
  prompt: string;
};

export const PromptBox: React.FC<PromptBoxProps> = ({ prompt }) => {
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

  // Bounce entrance
  const entranceY = spring({ frame, fps, config: { damping: 11, stiffness: 120, mass: 0.8 } });
  const translateY = interpolate(entranceY, [0, 1], [300, 0]);
  const entranceOpacity = interpolate(frame, [0, sec(0.2)], [0, 1], clamp);

  // Typing
  const typeProgress = interpolate(frame, [tTypeStart, tTypeEnd], [0, 1], clamp);
  const charsVisible = Math.floor(typeProgress * prompt.length);
  const typedText = prompt.slice(0, charsVisible);
  const isTyping = frame >= tTypeStart && frame < tTypeEnd;
  const hasTyped = frame >= tTypeEnd;
  const showPlaceholder = frame < tTypeStart;
  const cursorOn = (isTyping || (hasTyped && frame < tEnter)) && Math.floor(frame / 4) % 2 === 0;

  // Enter pulse: single pop then settle
  const enterPulse = frame >= tEnter
    ? spring({ frame: frame - tEnter, fps, config: { damping: 14, stiffness: 300, mass: 0.6 } })
    : 0;
  const pulseScale = 1 + 0.035 * (1 - enterPulse);

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

  // Pill dimensions
  const pillW = 720;
  const pillH = 64;
  const pillR = pillH / 2;
  const perimeter = 2 * (pillW - pillH) + 2 * Math.PI * pillR;

  const pillBackground = colorShift > 0
    ? `linear-gradient(135deg, rgba(125,211,252,${0.06 * colorShift}), rgba(125,211,252,${0.03 * colorShift})), ${PILL_BG}`
    : PILL_BG;

  return (
    <AbsoluteFill style={{ fontFamily: FONT, opacity: finalFade }}>
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          transform: `translate(-50%, -50%) translateY(${translateY}px) scale(${pulseScale})`,
          opacity: entranceOpacity,
          width: pillW,
          height: pillH,
        }}
      >
        {/* Pill background */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: pillR,
            background: pillBackground,
            border: `1px solid ${isComplete ? `rgba(125,211,252,${0.3 * colorShift})` : BORDER}`,
            boxShadow: "0 4px 20px rgba(0,0,0,0.4)",
          }}
        />

        {/* Single loading outline */}
        {isLoading && (
          <svg
            width={pillW + 4}
            height={pillH + 4}
            style={{ position: "absolute", left: -2, top: -2, pointerEvents: "none" }}
          >
            <rect
              x={2} y={2} width={pillW} height={pillH}
              rx={pillR} ry={pillR}
              fill="none"
              stroke={outlineColor}
              strokeWidth={3}
              strokeDasharray={`${perimeter}`}
              strokeDashoffset={perimeter * (1 - loadProgress)}
              strokeLinecap="round"
              style={{ filter: `drop-shadow(0 0 6px ${outlineColor})` }}
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
            padding: "0 28px",
            zIndex: 1,
          }}
        >
          {showPlaceholder && (
            <span style={{ color: PLACEHOLDER_COLOR, fontSize: 22, fontStyle: "italic", fontWeight: 400 }}>
              Type Prompt
            </span>
          )}
          {!showPlaceholder && (
            <span style={{ color: isComplete ? BLUE : TEXT_COLOR, fontSize: 22, fontWeight: 500 }}>
              {typedText}
              <span style={{ opacity: cursorOn ? 1 : 0, color: WHITE, marginLeft: 1, fontWeight: 300 }}>▎</span>
            </span>
          )}

          {/* Button: arrow → tick */}
          {hasTyped && (
            <div
              style={{
                position: "absolute",
                right: 10,
                top: "50%",
                transform: `translateY(-50%) scale(${frame >= tEnter ? pulseScale : 1})`,
                width: 44,
                height: 44,
                borderRadius: 22,
                background: isComplete
                  ? `linear-gradient(135deg, ${BLUE}, #38bdf8)`
                  : frame >= tEnter
                    ? `rgba(255,255,255,0.9)`
                    : `rgba(255,255,255,0.5)`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                boxShadow: isComplete
                  ? `0 0 16px rgba(125,211,252,0.4)`
                  : frame >= tEnter
                    ? `0 0 12px rgba(255,255,255,0.3)`
                    : "none",
              }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={isComplete ? "#fff" : "#000"} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
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
