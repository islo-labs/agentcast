export interface ClickEvent {
  x: number; // viewport X (0-1280)
  y: number; // viewport Y (0-800)
  timeSec: number; // seconds relative to highlight start
}

// A highlight is one "moment" in the demo.
// Either terminal lines (CLI demo) or a video clip (browser demo).
export interface Highlight {
  label: string; // e.g. "Initialize", "Configure", "Run"
  overlay?: string; // big text overlay shown on top (e.g. "One command.")

  // CLI mode — terminal lines
  lines?: TermLine[];
  zoomLine?: number;

  // Browser mode — video clip from recorded session
  videoSrc?: string; // path to video file (served via staticFile)
  videoStartSec?: number; // trim: start time in seconds
  videoEndSec?: number; // trim: end time in seconds
  focusX?: number; // 0-1, focal point X for zoom (default 0.5)
  focusY?: number; // 0-1, focal point Y for zoom (default 0.5)
  clicks?: ClickEvent[]; // click positions for cursor animation
}

export interface TermLine {
  text: string;
  color?: string; // hex color for the line
  bold?: boolean;
  dim?: boolean;
  isPrompt?: boolean; // prefix with $
}

export interface CastProps {
  title: string; // big opening title
  subtitle?: string; // smaller text under title
  highlights: Highlight[];
  endText?: string; // closing CTA command, e.g. "npx agentreel"
  endUrl?: string; // URL shown under CTA, e.g. "github.com/islo-labs/agentreel"
  gradient?: [string, string]; // background gradient colors
  mode?: "reel" | "demo"; // "reel" = 1080x1080 marketing clip, "demo" = 1920x1080 chapter walkthrough
}

export const defaultProps: CastProps = {
  title: "agentreel",
  subtitle: undefined,
  highlights: [
    {
      label: "Record",
      overlay: "One command.",
      lines: [
        { text: "npx agentreel --cmd 'my-cli-tool'", isPrompt: true },
        { text: "" },
        { text: "  agentreel  Turn your apps into viral clips", bold: true, color: "#bd93f9" },
        { text: "" },
        { text: "  ✓ Recording CLI demo...", color: "#50fa7b" },
      ],
    },
    {
      label: "Highlight",
      overlay: "AI picks the best moments.",
      lines: [
        { text: "Extracting highlights...", dim: true },
        { text: "" },
        { text: "  ✓ 4 highlights extracted", color: "#50fa7b" },
        { text: '    "Initialize" — first run', color: "#f8f8f2" },
        { text: '    "Configure" — setup step', color: "#f8f8f2" },
        { text: '    "Run" — the wow moment', color: "#f1fa8c" },
      ],
      zoomLine: 2,
    },
    {
      label: "Share",
      overlay: "Ready to post.",
      lines: [
        { text: "Rendering video...", dim: true },
        { text: "" },
        { text: "  Done: agentreel.mp4 (2.4 MB)", color: "#50fa7b" },
        { text: "" },
        { text: "  Share to Twitter? [Y/n]", color: "#f8f8f2" },
      ],
      zoomLine: 2,
    },
  ],
  endText: "npx agentreel",
  gradient: ["#0f0f1a", "#1a0f2e"],
};
