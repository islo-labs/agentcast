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
  endText?: string; // closing CTA command, e.g. "npm install itsovertime"
  endUrl?: string; // URL shown under CTA, e.g. "github.com/islo-labs/overtime"
  gradient?: [string, string]; // background gradient colors
}

export const defaultProps: CastProps = {
  title: "itsovertime",
  subtitle: "Cron for AI agents",
  highlights: [
    {
      label: "Initialize",
      overlay: "One command.",
      lines: [
        { text: "npx @islo-labs/overtime init", isPrompt: true },
        { text: "" },
        { text: "  itsovertime  Cron for AI agents", bold: true, color: "#bd93f9" },
        { text: "" },
        { text: "  ✓ Created overtime.yml", color: "#50fa7b" },
      ],
    },
    {
      label: "Configure",
      overlay: "Plain English schedules.",
      lines: [
        { text: "cat overtime.yml", isPrompt: true },
        { text: "shifts:", dim: true },
        { text: "  - name: pr-review", color: "#f8f8f2" },
        { text: '    schedule: "every hour"', color: "#50fa7b" },
        { text: '    task: "Review open PRs..."', color: "#50fa7b" },
        { text: "    notify: slack", color: "#f8f8f2" },
      ],
      zoomLine: 3,
    },
    {
      label: "Run",
      overlay: "Fully autonomous.",
      lines: [
        { text: "npx @islo-labs/overtime", isPrompt: true },
        { text: "" },
        { text: "┌─ itsovertime ───────────────────────────┐", color: "#bd93f9" },
        { text: "│ pr-review    every hour     ⟳ running   │", color: "#f1fa8c" },
        { text: "│ dep-updates  Mon at 2am     idle        │", dim: true },
        { text: "└──────────────────────────────────────────┘", color: "#bd93f9" },
        { text: "" },
        { text: "  ✓ PR #42 reviewed — approved", color: "#50fa7b" },
        { text: "  ✓ PR #43 reviewed — changes requested", color: "#f1fa8c" },
      ],
      zoomLine: 3,
    },
  ],
  endText: "npx @islo-labs/overtime",
  endUrl: "github.com/islo-labs/overtime",
  gradient: ["#0f0f1a", "#1a0f2e"],
};
