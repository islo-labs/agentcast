export interface ClickEvent {
  x: number; // viewport X (0-1280)
  y: number; // viewport Y (0-800)
  timeSec: number; // seconds relative to highlight start
}

export interface DiagramNode {
  id: string;
  label: string;
  x: number; // 0-1 normalized position
  y: number; // 0-1 normalized position
  color?: string; // hex color override
}

export interface DiagramEdge {
  from: string; // node id
  to: string; // node id
}

export interface DiagramData {
  nodes: DiagramNode[];
  edges: DiagramEdge[];
}

export interface PanelData {
  title: string;
  stat?: string; // big number/word at top (e.g. "1", "3x", "AI")
  statLabel?: string; // label under the stat (e.g. "command", "faster")
  content: string; // multi-line via \n — each line gets an animated checkmark
  color?: string; // accent color
}

export interface TreeData {
  root: string; // root node label
  depth: number; // levels deep (3-5)
  branching: number | number[]; // uniform (3) or per-level ([4, 2, 3])
  nodeLabels?: string[][]; // labels by level
  outro?: string; // text that scrolls in at the bottom (multi-line via \n)
}

// A highlight is one "moment" in the video.
// Exactly one of: lines, videoSrc, statement, diagram, panels.
export interface Highlight {
  label: string;
  overlay?: string; // text overlay (browser clips only)

  // Terminal lines
  lines?: TermLine[];
  zoomLine?: number;

  // Browser video clip
  videoSrc?: string;
  videoStartSec?: number;
  videoEndSec?: number;
  focusX?: number;
  focusY?: number;
  clicks?: ClickEvent[];

  // Text slide — bold narrative statement
  statement?: string;

  // Diagram — animated node/edge visualization
  diagram?: DiagramData;

  // Side-by-side panels
  panels?: { left: PanelData; right: PanelData };

  // Auto-generated fractal tree
  tree?: TreeData;
}

export interface TermLine {
  text: string;
  color?: string;
  bold?: boolean;
  dim?: boolean;
  isPrompt?: boolean;
}

export interface CastProps {
  title: string;
  subtitle?: string;
  highlights: Highlight[];
  endText?: string;
  endUrl?: string;
}

export const defaultProps: CastProps = {
  title: "agentreel",
  subtitle: "Turn your apps into demo videos",
  highlights: [
    {
      label: "The Problem",
      statement: "Your app is amazing.\nBut nobody knows it yet.",
    },
    {
      label: "How It Works",
      panels: {
        left: {
          title: "You",
          stat: "1",
          statLabel: "command",
          content: "Point it at your app\nHit enter",
          color: "#111111",
        },
        right: {
          title: "AI",
          stat: "5",
          statLabel: "steps automated",
          content: "Records the demo\nExtracts highlights\nBuilds the narrative\nAnimates the tree\nRenders the video",
          color: "#22c55e",
        },
      },
    },
    {
      label: "Record",
      lines: [
        { text: "npx agentreel --cmd 'my-cli-tool'", isPrompt: true },
        { text: "" },
        { text: "  agentreel  Turn your apps into viral clips", bold: true, color: "#6d28d9" },
        { text: "" },
        { text: "  ✓ Recording CLI demo...", color: "#16a34a" },
      ],
    },
    {
      label: "Pipeline",
      tree: {
        root: "agentreel",
        depth: 4,
        branching: [5, 3, 2],
        nodeLabels: [
          ["Record", "Plan", "Extract", "Render", "Share"],
        ],
        outro: "Ready to share.\nIn seconds.",
      },
    },
  ],
  endText: "npx agentreel",
};
