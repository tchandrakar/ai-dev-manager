export const T = {
  bg0: "#070B14",
  bg1: "#0D1117",
  bg2: "#111827",
  bg3: "#1C2333",
  bg4: "#243042",
  border: "#1E2D45",
  border2: "#263554",
  txt: "#E6EDF3",
  txt2: "#8B949E",
  txt3: "#4A5568",
  blue: "#4F9EFF",
  green: "#3FB950",
  amber: "#F5A623",
  red: "#F85149",
  purple: "#BC8CFF",
  cyan: "#79C0FF",
  teal: "#2DD4BF",

  // Provider colors
  claude: "#BC8CFF",
  openai: "#3FB950",
  gemini: "#4F9EFF",

  // Fonts
  fontUI: "'Outfit', 'Helvetica Neue', Arial, sans-serif",
  fontMono: "'JetBrains Mono', 'Fira Code', 'Courier New', monospace",
};

export const severityColor = (s) => ({
  critical: T.red,
  warning: T.amber,
  info: T.cyan,
}[s] ?? T.txt2);

export const riskColor = (score) => {
  if (score >= 7) return T.red;
  if (score >= 4) return T.amber;
  return T.green;
};
