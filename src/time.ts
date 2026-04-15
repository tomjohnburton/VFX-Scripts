// Scenario timestamps are authored as mm.ss where the integer part is minutes
// and the two-digit decimal part is seconds (0-59). Examples:
//   0.53 -> 53s, 1.32 -> 92s, 2.05 -> 125s.
export const mmssToSec = (x: number): number => {
  const minutes = Math.floor(x);
  const seconds = Math.round((x - minutes) * 100);
  return minutes * 60 + seconds;
};
