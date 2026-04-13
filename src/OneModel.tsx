import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";

const FONT = "'Suisse Intl', Inter, -apple-system, Helvetica, Arial, sans-serif";

const WORDS = ["tasks", "environments", "robots"];
const WIDEST = WORDS.reduce((a, b) => (b.length > a.length ? b : a));
const SIZE = 90;
const LINE_GAP = 40;

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
  const flip1Dur = sec(1);
  const flip2Dur = sec(1);
  const flip1 = interpolate(frame, [tFlip1, tFlip1 + flip1Dur], [0, 1], clamp);
  const flip2 = interpolate(frame, [tFlip2, tFlip2 + flip2Dur], [0, 1], clamp);

  // Determine which word is active and how many middle chars are visible.
  // Outgoing half (0→0.5): shrink from full length to 0 by removing outer chars.
  // Incoming half (0.5→1): grow from 0 to full length by adding outer chars.
  let wordIdx = 0;
  let nChars = WORDS[0].length;

  if (flip2 >= 0.5) {
    wordIdx = 2;
    nChars = Math.ceil(WORDS[2].length * (flip2 - 0.5) * 2);
  } else if (flip2 > 0) {
    wordIdx = 1;
    nChars = Math.ceil(WORDS[1].length * (1 - flip2 * 2));
  } else if (flip1 >= 0.5) {
    wordIdx = 1;
    nChars = Math.ceil(WORDS[1].length * (flip1 - 0.5) * 2);
  } else if (flip1 > 0) {
    wordIdx = 0;
    nChars = Math.ceil(WORDS[0].length * (1 - flip1 * 2));
  }

  const word = WORDS[wordIdx];
  const start = Math.floor((word.length - nChars) / 2);
  const displayed = word.slice(start, start + nChars);

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
          alignItems: "center",
          gap: LINE_GAP,
          opacity: modelFade,
        }}
      >
        {/* Line 1: "One model" */}
        <span style={{ ...textStyle, color: "#ffffff" }}>
          One model
        </span>

        {/* Line 2: "different [word]" — word shrinks from edges to middle, then grows back */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 24,
            opacity: secondOpacity,
          }}
        >
          <span style={{ ...textStyle, color: "#ffffff" }}>
            different
          </span>
          {/* Fixed-width slot sized to the widest word so "different" doesn't drift */}
          <span style={{ ...textStyle, position: "relative", display: "inline-block", color: "#7dd3fc" }}>
            <span style={{ visibility: "hidden" }}>{WIDEST}</span>
            <span style={{ position: "absolute", left: 0, right: 0, textAlign: "center" }}>
              {displayed}
            </span>
          </span>
        </div>
      </div>
    </AbsoluteFill>
  );
};
