import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";

const FONT = "'Suisse Intl', Inter, -apple-system, Helvetica, Arial, sans-serif";

const WORDS = ["tasks", "environments", "robots"];
const WIDEST = WORDS.reduce((a, b) => (b.length > a.length ? b : a));
const SIZE = 90;
const LINE_GAP = 0;

export const OneModel: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const sec = (s: number) => Math.round(s * fps);
  const clamp = { extrapolateLeft: "clamp" as const, extrapolateRight: "clamp" as const };

  const tHold = sec(2);
  const tFlip1 = sec(4.5);
  const tFlip2 = sec(6.2);

  // Entrance
  const modelFade = interpolate(frame, [0, sec(0.4)], [0, 1], clamp);

  // Shift upward so "different [word]" fits underneath
  const shiftSpring = frame >= tHold
    ? spring({ frame: frame - tHold, fps, config: { damping: 20, stiffness: 100 } })
    : 0;
  const lineOffset = (SIZE + LINE_GAP) / 2;
  const shiftY = interpolate(shiftSpring, [0, 1], [lineOffset, 0]);
  const secondOpacity = interpolate(shiftSpring, [0.3, 0.8], [0, 1], clamp);

  // Flips — linear
  const flip1Dur = sec(0.28);
  const flip2Dur = sec(0.28);
  const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
  const flip1 = easeOut(interpolate(frame, [tFlip1, tFlip1 + flip1Dur], [0, 1], clamp));
  const flip2 = easeOut(interpolate(frame, [tFlip2, tFlip2 + flip2Dur], [0, 1], clamp));

  // Cuboid-style flip: each completed flip advances the cube -90° around its
  // horizontal center axis. Front face = WORDS[0], top = WORDS[1], back = WORDS[2].
  const cubeRot = -(flip1 + flip2) * 90;

  // Per-flip progress for blur (0 at rest, 1 at peak).
  const flipActive = flip1 > 0 && flip1 < 1 ? flip1 : flip2 > 0 && flip2 < 1 ? flip2 : 0;
  const blurPx = flipActive === 0 ? 0 : Math.sin(flipActive * Math.PI) * 4;

  // Cuboid half-depth — tuned to text cap-height so the cube reads as proportional.
  const faceDepth = SIZE * 0.55;

  const textStyle: React.CSSProperties = {
    fontSize: SIZE,
    fontWeight: 400,
    whiteSpace: "nowrap",
  };

  return (
    <AbsoluteFill style={{ fontFamily: FONT, background: "#0a0a0a" }}>
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          transform: `translate(-50%, -50%) translateY(${shiftY}px)`,
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-start",
          gap: LINE_GAP,
          opacity: modelFade,
        }}
      >
        {/* Line 1: "One model" */}
        <span style={{ ...textStyle, color: "#ffffff" }}>
          One model
        </span>

        {/* Line 2: "different [word]" — left-aligned under "One model" */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 24,
            height: SIZE * 1.2,
            opacity: secondOpacity,
          }}
        >
          <span style={{ ...textStyle, color: "#ffffff" }}>different</span>
          {/* Fixed-width slot houses the rotating cuboid */}
          <span
            style={{
              ...textStyle,
              position: "relative",
              display: "inline-block",
              perspective: 1400,
            }}
          >
            <span style={{ visibility: "hidden" }}>{WIDEST}</span>
            {/* Rotating cuboid — faces attached to a shared 3D origin */}
            <span
              style={{
                position: "absolute",
                left: 0,
                top: 0,
                width: "100%",
                height: "100%",
                transformStyle: "preserve-3d",
                transform: `rotateX(${cubeRot}deg)`,
                willChange: "transform",
              }}
            >
              {WORDS.map((w, i) => {
                // Each face rotated by i * 90° around X, then pushed out by faceDepth.
                const faceRot = i * 90;
                return (
                  <span
                    key={w}
                    style={{
                      ...textStyle,
                      color: "#ffffff",
                      position: "absolute",
                      left: 0,
                      top: 0,
                      width: "100%",
                      textAlign: "left",
                      transform: `rotateX(${faceRot}deg) translateZ(${faceDepth}px)`,
                      backfaceVisibility: "hidden",
                      filter: blurPx > 0 ? `blur(${blurPx}px)` : undefined,
                      willChange: "transform, filter",
                    }}
                  >
                    {w}
                  </span>
                );
              })}
            </span>
          </span>
        </div>
      </div>
    </AbsoluteFill>
  );
};
