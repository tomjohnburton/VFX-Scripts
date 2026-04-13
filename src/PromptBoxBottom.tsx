import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";

const FONT = "'Suisse Intl', Inter, -apple-system, Helvetica, Arial, sans-serif";

const BOX_BG = "#ffffff";
const BORDER = "rgba(0,0,0,0.10)";
const BLUE = "#7dd3fc";
const PLACEHOLDER_COLOR = "rgba(0,0,0,0.30)";
const TEXT_COLOR = "#1a1a1e";

export type PromptBoxBottomProps = {
  prompt: string;
};

export const PromptBoxBottom: React.FC<PromptBoxBottomProps> = ({ prompt }) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();

  const sec = (s: number) => Math.round(s * fps);
  const clamp = { extrapolateLeft: "clamp" as const, extrapolateRight: "clamp" as const };

  const tTypeStart = sec(2.5);
  // Typing speed scales with prompt length for consistent characters-per-second
  const tTypeEnd = tTypeStart + Math.max(sec(0.4), Math.round(prompt.length * 0.035 * fps));
  const tEnter = tTypeEnd + sec(0.5);
  const tComplete = tEnter; // jump straight to blue on enter — no loading
  const tFadeStart = sec(8);
  const tFadeEnd = sec(9);

  // Bounce entrance from below
  const entranceY = spring({ frame, fps, config: { damping: 11, stiffness: 120, mass: 0.8 } });
  const translateY = interpolate(entranceY, [0, 1], [400, 0]);
  const entranceOpacity = interpolate(frame, [0, sec(0.2)], [0, 1], clamp);

  // Typing
  const typeProgress = interpolate(frame, [tTypeStart, tTypeEnd], [0, 1], clamp);
  const charsVisible = Math.floor(typeProgress * prompt.length);
  const typedText = prompt.slice(0, charsVisible);
  const isTyping = frame >= tTypeStart && frame < tTypeEnd;
  const hasTyped = frame >= tTypeEnd;
  const showPlaceholder = frame < tTypeStart;
  const cursorOn = (isTyping || (hasTyped && frame < tEnter)) && Math.floor(frame / 4) % 2 === 0;

  // Enter pulse
  const enterElapsed = frame - tEnter;
  const pulseScale = frame >= tEnter
    ? 1 + 0.04 * Math.max(0, Math.sin(Math.min(enterElapsed / fps, 0.3) / 0.3 * Math.PI))
    : 1;

  const isComplete = frame >= tComplete;

  // Color shift white → blue
  const colorShift = interpolate(frame, [tComplete, tComplete + sec(0.5)], [0, 1], clamp);
  // Arrow → tick
  const tickRaw = isComplete
    ? spring({ frame: frame - tComplete, fps, config: { damping: 30, stiffness: 120 } })
    : 0;
  const tickProgress = Math.min(1, Math.max(0, tickRaw));

  const finalFade = interpolate(frame, [tFadeStart, tFadeEnd], [1, 0], clamp);

  // Box dimensions (scaled for 4K, positioned bottom-center)
  const boxW = 1600;
  const boxH = 160;
  const boxR = 32;
  const marginBottom = 160;

  const boxLeft = (width - boxW) / 2;
  const boxTop = height - boxH - marginBottom;

  const boxBackground = colorShift > 0
    ? `linear-gradient(135deg, rgba(125,211,252,${0.08 * colorShift}), rgba(125,211,252,${0.04 * colorShift})), ${BOX_BG}`
    : BOX_BG;

  // Proportional inner sizes
  const fontSize = 60;
  const btnSize = 120;
  const btnIcon = 48;
  const padX = 52;

  return (
    <AbsoluteFill style={{ fontFamily: FONT, opacity: finalFade }}>
      <div
        style={{
          position: "absolute",
          left: boxLeft,
          top: boxTop,
          transform: `translateY(${translateY}px) scale(${pulseScale})`,
          transformOrigin: "center",
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
            border: `2px solid ${isComplete ? `rgba(125,211,252,${0.4 * colorShift})` : BORDER}`,
            boxShadow: "0 8px 40px rgba(0,0,0,0.2)",
          }}
        />

        {/* Text content */}
        <div
          style={{
            position: "relative",
            height: "100%",
            display: "flex",
            alignItems: "center",
            padding: `0 ${padX}px`,
            zIndex: 1,
          }}
        >
          {showPlaceholder && (
            <span style={{ color: PLACEHOLDER_COLOR, fontSize, fontStyle: "italic", fontWeight: 400 }}>
              Type Prompt
            </span>
          )}
          {!showPlaceholder && (
            <span style={{ color: isComplete ? BLUE : TEXT_COLOR, fontSize, fontWeight: 500 }}>
              {typedText}
              <span style={{ opacity: cursorOn ? 1 : 0, color: TEXT_COLOR, marginLeft: 4, fontWeight: 300 }}>▎</span>
            </span>
          )}

          {/* Button: arrow → tick */}
          {hasTyped && (
            <div
              style={{
                position: "absolute",
                right: 20,
                top: "50%",
                transform: `translateY(-50%) scale(${frame >= tEnter ? pulseScale : 1})`,
                width: btnSize,
                height: btnSize,
                borderRadius: btnSize / 2.5,
                background: isComplete
                  ? `linear-gradient(135deg, ${BLUE}, #38bdf8)`
                  : frame >= tEnter
                    ? `rgba(0,0,0,0.85)`
                    : `rgba(0,0,0,0.5)`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                boxShadow: isComplete
                  ? `0 0 40px rgba(125,211,252,0.4)`
                  : frame >= tEnter
                    ? `0 0 24px rgba(0,0,0,0.2)`
                    : "none",
              }}
            >
              <svg width={btnIcon} height={btnIcon} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
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
