import React from "react";
import {
  AbsoluteFill,
  Audio,
  interpolate,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
  Sequence,
  Easing,
  OffthreadVideo,
} from "remotion";
import { CastProps, Highlight, ClickEvent } from "./types";

// ─── Theme ────────────────────────────────────────────────

const SURFACE = "#ffffff";
const TEXT = "#111111";
const TEXT_DIM = "#999999";
const ACCENT = "#22c55e";
const CARD_BORDER = "rgba(0,0,0,0.06)";
const CARD_SHADOW = "0 4px 24px rgba(0,0,0,0.06)";

// Terminal — light theme
const TERM_BG = "#f8f8f8";
const TERM_BAR = "#f0f0f0";
const TERM_BORDER = "rgba(0,0,0,0.06)";
const TERM_ACCENT = "#16a34a";
const TERM_TEXT = "#1a1a1a";
const TERM_DIM = "#9ca3af";
const TERM_CURSOR = "#1a1a1a";

// ─── Fonts ────────────────────────────────────────────────

const SANS =
  '-apple-system, BlinkMacSystemFont, "SF Pro Display", system-ui, sans-serif';
const MONO =
  '"SF Mono", "Fira Code", "Cascadia Code", "JetBrains Mono", monospace';

// ─── Timing ───────────────────────────────────────────────

const TIMING = {
  title: 2.5, termHighlight: 4.5, browserHighlight: 7.0,
  textSlide: 3.5, diagram: 5.0, tree: 6.0, transition: 0.6, end: 3.5,
};

const VIEWPORT_W = 1280;
const VIEWPORT_H = 800;
const VIDEO_AREA_W = 880;
const VIDEO_AREA_H = 550;

function getHighlightDuration(h: Highlight): number {
  if (h.statement) return TIMING.textSlide;
  if (h.diagram) return TIMING.diagram;
  if (h.panels) return TIMING.diagram;
  if (h.tree) return TIMING.tree;
  return h.videoSrc ? TIMING.browserHighlight : TIMING.termHighlight;
}

// Shared eased entry
function useEntry(fps: number, frame: number) {
  const progress = interpolate(frame, [0, fps * 0.5], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  return {
    scale: interpolate(progress, [0, 1], [0.99, 1]),
    y: interpolate(progress, [0, 1], [6, 0]),
    opacity: progress,
  };
}

// ─── Main Composition ─────────────────────────────────────

export const CastVideo: React.FC<CastProps> = ({
  title,
  subtitle,
  highlights,
  endText,
  endUrl,
}) => {
  const { fps } = useVideoConfig();

  const titleFrames = Math.round(TIMING.title * fps);
  const endFrames = Math.round(TIMING.end * fps);

  const hlDurations = highlights.map((h) => Math.round(getHighlightDuration(h) * fps));
  const hlOffsets: number[] = [];
  let cumulative = 0;
  for (const dur of hlDurations) {
    hlOffsets.push(cumulative);
    cumulative += dur;
  }

  return (
    <AbsoluteFill style={{ backgroundColor: SURFACE }}>
      <MusicTrack />

      <Sequence durationInFrames={titleFrames}>
        <TitleCard title={title} subtitle={subtitle} />
      </Sequence>

      {highlights.map((h, i) => {
        const dur = getHighlightDuration(h);
        return (
          <Sequence key={i} from={titleFrames + hlOffsets[i]} durationInFrames={hlDurations[i]}>
            {h.statement ? (
              <TextSlideClip highlight={h} durationSec={dur} />
            ) : h.panels ? (
              <PanelsClip highlight={h} durationSec={dur} />
            ) : h.tree ? (
              <TreeClip highlight={h} durationSec={dur} />
            ) : h.diagram ? (
              <DiagramClip highlight={h} durationSec={dur} />
            ) : h.videoSrc ? (
              <BrowserHighlightClip highlight={h} durationSec={dur} />
            ) : (
              <HighlightClip highlight={h} durationSec={dur} />
            )}
          </Sequence>
        );
      })}

      <Sequence from={titleFrames + cumulative} durationInFrames={endFrames}>
        <EndCard text={endText || title} url={endUrl} />
      </Sequence>
    </AbsoluteFill>
  );
};

// ─── Music ────────────────────────────────────────────────

const MusicTrack: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  const fadeIn = interpolate(frame, [0, fps], [0, 0.35], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const fadeOut = interpolate(
    frame,
    [durationInFrames - fps * 2, durationInFrames],
    [0.35, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  try {
    return <Audio src={staticFile("music.mp3")} volume={Math.min(fadeIn, fadeOut)} />;
  } catch {
    return null;
  }
};

// ─── Cursor ───────────────────────────────────────────────

const Cursor: React.FC<{ visible: boolean; blink?: boolean }> = ({
  visible,
  blink = true,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  if (!visible) return null;
  const blinkOn = blink ? frame % Math.round(fps / 2) < fps / 4 : true;

  return (
    <span
      style={{
        display: "inline-block",
        width: 9,
        height: 19,
        backgroundColor: blinkOn ? TERM_CURSOR : "transparent",
        marginLeft: 1,
        verticalAlign: "text-bottom",
        borderRadius: 1,
      }}
    />
  );
};

// ─── Text Overlay (browser clips only) ───────────────────

const TextOverlay: React.FC<{ text: string; durationSec: number }> = ({
  text,
  durationSec,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const showAt = fps * 1.8;
  const hideAt = fps * (durationSec - 0.8);

  const enterProgress = interpolate(frame, [showAt, showAt + fps * 0.5], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const exitOpacity = interpolate(frame, [hideAt, hideAt + fps * 0.3], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  if (frame < showAt) return null;

  const parts = text.split(/(\*\*.*?\*\*)/);

  return (
    <div
      style={{
        position: "absolute",
        bottom: 80,
        left: 0,
        width: "100%",
        textAlign: "center",
        zIndex: 20,
        opacity: Math.min(enterProgress, exitOpacity),
      }}
    >
      <span
        style={{
          fontFamily: SANS,
          fontSize: 42,
          fontWeight: 600,
          color: TEXT,
          letterSpacing: -1,
          display: "inline-block",
        }}
      >
        {parts.map((part, i) => {
          if (part.startsWith("**") && part.endsWith("**")) {
            return (
              <span key={i} style={{ color: ACCENT, fontWeight: 700 }}>
                {part.slice(2, -2)}
              </span>
            );
          }
          return <span key={i}>{part}</span>;
        })}
      </span>
    </div>
  );
};

// ─── Title Card ───────────────────────────────────────────

const TitleCard: React.FC<{ title: string; subtitle?: string }> = ({
  title,
  subtitle,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const fadeOut = interpolate(
    frame,
    [fps * (TIMING.title - TIMING.transition), fps * TIMING.title],
    [1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  const words = title.split(" ");
  const WORD_STAGGER = 5;
  const WORD_DUR = 14;
  const lastWordStart = (words.length - 1) * WORD_STAGGER;
  const subtitleStart = lastWordStart + WORD_DUR + 4;

  return (
    <AbsoluteFill style={{ opacity: fadeOut, justifyContent: "center", alignItems: "center" }}>
      <div
        style={{
          textAlign: "center",
          maxWidth: "65%",
          display: "flex",
          flexWrap: "wrap",
          justifyContent: "center",
          gap: "0 16px",
        }}
      >
        {words.map((word, i) => {
          const start = i * WORD_STAGGER;
          const progress = interpolate(frame, [start, start + WORD_DUR], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.out(Easing.cubic),
          });
          return (
            <span
              key={i}
              style={{
                fontFamily: SANS,
                fontSize: 72,
                fontWeight: 700,
                color: TEXT,
                letterSpacing: -3,
                lineHeight: 1.1,
                opacity: progress,
                transform: `translateY(${interpolate(progress, [0, 1], [8, 0])}px)`,
                display: "inline-block",
              }}
            >
              {word}
            </span>
          );
        })}
      </div>

      {subtitle && (
        <div
          style={{
            marginTop: 28,
            textAlign: "center",
            opacity: interpolate(frame, [subtitleStart, subtitleStart + 14], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: Easing.out(Easing.cubic),
            }),
            transform: `translateY(${interpolate(frame, [subtitleStart, subtitleStart + 14], [6, 0], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: Easing.out(Easing.cubic),
            })}px)`,
            fontFamily: SANS,
            fontSize: 22,
            fontWeight: 400,
            color: TEXT_DIM,
            letterSpacing: 0.2,
          }}
        >
          {subtitle}
        </div>
      )}
    </AbsoluteFill>
  );
};

// ─── Text Slide Clip ─────────────────────────────────────

const TextSlideClip: React.FC<{
  highlight: Highlight;
  durationSec: number;
}> = ({ highlight, durationSec }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const lines = (highlight.statement || "").split("\n");
  const LINE_STAGGER = 8;
  const LINE_DUR = 16;

  const fadeIn = interpolate(frame, [0, fps * 0.2], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const fadeOut = interpolate(
    frame,
    [fps * (durationSec - 0.5), fps * durationSec],
    [1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  return (
    <AbsoluteFill
      style={{
        opacity: Math.min(fadeIn, fadeOut),
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      <div style={{ textAlign: "center", maxWidth: "65%", display: "flex", flexDirection: "column", gap: 8 }}>
        {lines.map((line, i) => {
          const start = i * LINE_STAGGER;
          const progress = interpolate(frame, [start, start + LINE_DUR], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.out(Easing.cubic),
          });
          return (
            <div
              key={i}
              style={{
                fontFamily: SANS,
                fontSize: 56,
                fontWeight: 600,
                color: TEXT,
                letterSpacing: -1.5,
                lineHeight: 1.25,
                opacity: progress,
                transform: `translateY(${interpolate(progress, [0, 1], [8, 0])}px)`,
              }}
            >
              {line}
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

// ─── Panels Clip (side-by-side) ──────────────────────────

const PanelsClip: React.FC<{
  highlight: Highlight;
  durationSec: number;
}> = ({ highlight, durationSec }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const panels = highlight.panels!;

  const fadeIn = interpolate(frame, [0, fps * 0.3], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const fadeOut = interpolate(
    frame,
    [fps * (durationSec - 0.5), fps * durationSec],
    [1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  const leftProgress = interpolate(frame, [fps * 0.15, fps * 0.6], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const rightProgress = interpolate(frame, [fps * 0.35, fps * 0.8], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });

  const renderPanel = (
    panel: { title: string; stat?: string; statLabel?: string; content: string; color?: string },
    progress: number,
    lineBaseDelay: number,
  ) => {
    const contentLines = panel.content.split("\n");
    const accent = panel.color || ACCENT;

    // Counting stat — parse numeric value and count up synced with checkmarks
    const statNum = panel.stat ? parseInt(panel.stat, 10) : NaN;
    const isNumericStat = !isNaN(statNum) && statNum > 0;
    const lastCheckDelay = lineBaseDelay + (contentLines.length - 1) * fps * 0.12 + fps * 0.15;
    const countDisplay = isNumericStat
      ? Math.min(
          statNum,
          Math.ceil(
            interpolate(
              frame,
              [lineBaseDelay, lastCheckDelay + fps * 0.1],
              [0, statNum],
              { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
            )
          )
        )
      : null;

    return (
      <div
        style={{
          width: 460,
          opacity: progress,
          transform: `translateY(${interpolate(progress, [0, 1], [12, 0])}px)`,
          borderRadius: 24,
          backgroundColor: SURFACE,
          boxShadow: "0 8px 40px rgba(0,0,0,0.06), 0 0 0 1px rgba(0,0,0,0.04)",
          padding: "40px 44px",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Big counting stat */}
        {panel.stat && (
          <div style={{ marginBottom: 8 }}>
            <span
              style={{
                fontFamily: SANS,
                fontSize: 72,
                fontWeight: 800,
                color: accent,
                letterSpacing: -3,
                lineHeight: 1,
              }}
            >
              {countDisplay !== null ? countDisplay : panel.stat}
            </span>
            {panel.statLabel && (
              <span
                style={{
                  fontFamily: SANS,
                  fontSize: 22,
                  fontWeight: 400,
                  color: TEXT_DIM,
                  marginLeft: 12,
                  letterSpacing: -0.3,
                }}
              >
                {panel.statLabel}
              </span>
            )}
          </div>
        )}

        {/* Title */}
        <div
          style={{
            fontFamily: SANS,
            fontSize: 14,
            fontWeight: 500,
            color: TEXT_DIM,
            letterSpacing: 3,
            textTransform: "uppercase",
            marginBottom: 28,
            marginTop: panel.stat ? 4 : 0,
          }}
        >
          {panel.title}
        </div>

        {/* Content lines with checkmarks */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {contentLines.map((line, i) => {
            const lineDelay = lineBaseDelay + i * fps * 0.12;
            const lineProgress = interpolate(
              frame, [lineDelay, lineDelay + fps * 0.25], [0, 1],
              { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) }
            );
            const checkDelay = lineDelay + fps * 0.15;
            const checkProgress = interpolate(
              frame, [checkDelay, checkDelay + fps * 0.2], [0, 1],
              { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) }
            );
            return (
              <div
                key={i}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 14,
                  opacity: lineProgress,
                }}
              >
                {/* Animated checkmark */}
                <div
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: 11,
                    backgroundColor: `${accent}12`,
                    border: `1.5px solid ${accent}30`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                    transform: `scale(${checkProgress})`,
                  }}
                >
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none"
                    style={{ opacity: checkProgress }}
                  >
                    <path
                      d="M2.5 6L5 8.5L9.5 3.5"
                      stroke={accent}
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </div>
                <div
                  style={{
                    fontFamily: SANS,
                    fontSize: 20,
                    fontWeight: 400,
                    color: "rgba(0,0,0,0.6)",
                    lineHeight: 1.4,
                  }}
                >
                  {line}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <AbsoluteFill
      style={{
        opacity: Math.min(fadeIn, fadeOut),
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      <div style={{ display: "flex", gap: 40, alignItems: "flex-start" }}>
        {renderPanel(panels.left, leftProgress, fps * 0.4)}
        {renderPanel(panels.right, rightProgress, fps * 0.6)}
      </div>
    </AbsoluteFill>
  );
};

// ─── Diagram Clip ────────────────────────────────────────

const DiagramClip: React.FC<{
  highlight: Highlight;
  durationSec: number;
}> = ({ highlight, durationSec }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const diagram = highlight.diagram!;

  const containerW = 700;
  const containerH = 500;

  const sortedNodes = [...diagram.nodes].sort((a, b) => a.x - b.x);
  const nodeIndexMap = new Map(sortedNodes.map((n, i) => [n.id, i]));

  const NODE_STAGGER = fps * 0.12;
  const NODE_DUR = fps * 0.35;
  const FIRST_NODE = fps * 0.4;

  const fadeIn = interpolate(frame, [0, fps * 0.3], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const fadeOut = interpolate(
    frame,
    [fps * (durationSec - 0.5), fps * durationSec],
    [1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  return (
    <AbsoluteFill
      style={{
        opacity: Math.min(fadeIn, fadeOut),
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      <div style={{ position: "relative", width: containerW, height: containerH }}>
        <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}>
          {diagram.edges.map((edge, i) => {
            const fromNode = diagram.nodes.find((n) => n.id === edge.from);
            const toNode = diagram.nodes.find((n) => n.id === edge.to);
            if (!fromNode || !toNode) return null;

            const x1 = fromNode.x * containerW;
            const y1 = fromNode.y * containerH;
            const x2 = toNode.x * containerW;
            const y2 = toNode.y * containerH;
            const length = Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);

            const fromIdx = nodeIndexMap.get(edge.from) ?? 0;
            const toIdx = nodeIndexMap.get(edge.to) ?? 0;
            const edgeStart = FIRST_NODE + Math.max(fromIdx, toIdx) * NODE_STAGGER + fps * 0.15;

            const edgeProgress = interpolate(frame, [edgeStart, edgeStart + fps * 0.5], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: Easing.out(Easing.cubic),
            });

            return (
              <line
                key={i}
                x1={x1} y1={y1} x2={x2} y2={y2}
                stroke="rgba(0,0,0,0.08)"
                strokeWidth={1}
                strokeDasharray={length}
                strokeDashoffset={length * (1 - edgeProgress)}
                strokeLinecap="round"
              />
            );
          })}
        </svg>

        {sortedNodes.map((node, i) => {
          const nodeStart = FIRST_NODE + i * NODE_STAGGER;
          const nodeProgress = interpolate(frame, [nodeStart, nodeStart + NODE_DUR], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.out(Easing.cubic),
          });

          return (
            <div
              key={node.id}
              style={{
                position: "absolute",
                left: node.x * containerW,
                top: node.y * containerH,
                transform: `translate(-50%, -50%) scale(${interpolate(nodeProgress, [0, 1], [0.4, 1])})`,
                opacity: nodeProgress,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 10,
              }}
            >
              <div
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 4,
                  backgroundColor: node.color || ACCENT,
                }}
              />
              <span
                style={{
                  fontFamily: SANS,
                  fontSize: 14,
                  fontWeight: 500,
                  color: TEXT,
                  whiteSpace: "nowrap",
                  letterSpacing: 0.3,
                  opacity: 0.5,
                }}
              >
                {node.label}
              </span>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

// ─── Tree Clip (full-screen scrolling organic tree) ──────

function seededRand(seed: number): number {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

interface OBranch {
  x1: number; y1: number;
  x2: number; y2: number;
  cx: number; cy: number;
  depth: number;
}

interface ONode {
  x: number; y: number;
  depth: number;
  label?: string;
  idx: number;
}

function generateOrganicTree(
  rootLabel: string,
  depth: number,
  branching: number | number[],
  nodeLabels: string[][] | undefined,
  W: number,
) {
  const branches: OBranch[] = [];
  const nodes: ONode[] = [];
  let nodeCount = 0;
  let seedCounter = 0;
  const rand = () => seededRand(seedCounter++);

  const branchAt = (level: number) => {
    if (typeof branching === "number") return branching;
    return branching[Math.min(level, branching.length - 1)] ?? 3;
  };

  const labelCounters: number[] = [];
  const labelAt = (level: number): string | undefined => {
    if (!labelCounters[level]) labelCounters[level] = 0;
    const idx = labelCounters[level]++;
    const lvlLabels = nodeLabels?.[level];
    if (!lvlLabels) return undefined;
    return lvlLabels[idx % lvlLabels.length];
  };

  const rootX = W / 2;
  const rootY = 60;
  nodes.push({ x: rootX, y: rootY, depth: 0, label: rootLabel, idx: nodeCount++ });

  function grow(px: number, py: number, angle: number, level: number, spreadMul: number) {
    if (level >= depth) return;
    const b = branchAt(level);

    // Tall branches — tree must exceed the frame height for scroll
    const baseLengths = [550, 400, 280, 190, 130];
    const baseLen = baseLengths[Math.min(level, baseLengths.length - 1)];
    const spreadAngle = (1.8 - level * 0.15) * spreadMul;

    for (let i = 0; i < b; i++) {
      const t = b === 1 ? 0 : (i / (b - 1)) * 2 - 1;
      const childAngle = angle + t * spreadAngle * 0.5;
      const len = baseLen * (0.85 + rand() * 0.3);

      const ex = px + Math.sin(childAngle) * len;
      const ey = py + Math.cos(childAngle) * len;

      const mx = (px + ex) / 2;
      const my = (py + ey) / 2;
      const perpX = -(ey - py);
      const perpY = ex - px;
      const perpLen = Math.sqrt(perpX * perpX + perpY * perpY) || 1;
      const curveAmt = (rand() - 0.5) * len * 0.3;
      const cx = mx + (perpX / perpLen) * curveAmt;
      const cy = my + (perpY / perpLen) * curveAmt;

      branches.push({ x1: px, y1: py, x2: ex, y2: ey, cx, cy, depth: level + 1 });

      const label = level === 0 ? labelAt(level) : undefined;
      nodes.push({ x: ex, y: ey, depth: level + 1, label, idx: nodeCount++ });

      grow(ex, ey, childAngle, level + 1, spreadMul * 0.65);
    }
  }

  grow(rootX, rootY, 0, 0, 1);

  // Compute total height
  let maxY = rootY;
  for (const n of nodes) { if (n.y > maxY) maxY = n.y; }

  return { branches, nodes, totalHeight: maxY + 80 };
}

const TreeClip: React.FC<{
  highlight: Highlight;
  durationSec: number;
}> = ({ highlight, durationSec }) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const tree = highlight.tree!;

  // Generate tree at full frame width
  const { branches, nodes, totalHeight } = generateOrganicTree(
    tree.root, tree.depth, tree.branching, tree.nodeLabels, width
  );

  // Outro text area below the tree — positioned so it lands centered in frame
  const hasOutro = !!tree.outro;
  const outroY = totalHeight + height / 2 - 40; // center of a frame-height area below tree
  const fullHeight = hasOutro ? outroY + height / 2 + 40 : totalHeight + 80;

  // Scroll: tree + outro taller than frame, camera pans down
  const scrollDistance = Math.max(0, fullHeight - height);

  const scrollStart = fps * 0.3;
  const scrollEnd = fps * (durationSec - (hasOutro ? 1.2 : 0.5));
  const scrollY = scrollDistance > 0
    ? interpolate(frame, [scrollStart, scrollEnd], [0, scrollDistance], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
        easing: Easing.inOut(Easing.quad),
      })
    : 0;

  // Fade in only — no abrupt fadeout, the scroll carries us into the next beat
  const fadeIn = interpolate(frame, [0, fps * 0.3], [0, 1], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp",
  });
  const fadeOut = hasOutro
    ? 1 // no fadeout when outro handles the exit
    : interpolate(frame, [fps * (durationSec - 0.5), fps * durationSec], [1, 0], {
        extrapolateLeft: "clamp", extrapolateRight: "clamp",
      });

  // Nodes/branches reveal based on Y position relative to viewport
  const viewBottom = scrollY + height;

  const dotSize = (d: number) => [14, 8, 5, 3.5, 2.5][Math.min(d, 4)];
  const strokeW = (d: number) => [1.5, 1, 0.6, 0.35, 0.25][Math.min(d, 4)];
  const strokeOp = (d: number) => [0.20, 0.15, 0.10, 0.07, 0.05][Math.min(d, 4)];

  return (
    <AbsoluteFill style={{ opacity: Math.min(fadeIn, fadeOut), overflow: "hidden" }}>
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          width: width,
          height: fullHeight,
          transform: `translateY(${-scrollY}px)`,
        }}
      >
        <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}>
          {branches.map((b, i) => {
            // Reveal when the endpoint scrolls into view
            const revealY = b.y2;
            const revealProgress = interpolate(
              viewBottom,
              [revealY - 80, revealY + 40],
              [0, 1],
              { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
            );

            if (revealProgress <= 0) return null;

            const dx = b.x2 - b.x1;
            const dy = b.y2 - b.y1;
            const approxLen = Math.sqrt(dx * dx + dy * dy) * 1.15;

            return (
              <path
                key={`b-${i}`}
                d={`M ${b.x1} ${b.y1} Q ${b.cx} ${b.cy} ${b.x2} ${b.y2}`}
                fill="none"
                stroke={`rgba(0,0,0,${strokeOp(b.depth)})`}
                strokeWidth={strokeW(b.depth)}
                strokeLinecap="round"
                strokeDasharray={approxLen}
                strokeDashoffset={approxLen * (1 - revealProgress)}
              />
            );
          })}
        </svg>

        {nodes.map((node) => {
          const revealProgress = interpolate(
            viewBottom,
            [node.y - 60, node.y + 40],
            [0, 1],
            { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
          );

          if (revealProgress <= 0) return null;

          const size = dotSize(node.depth);

          return (
            <div
              key={`n-${node.idx}`}
              style={{
                position: "absolute",
                left: node.x,
                top: node.y,
                transform: `translate(-50%, -50%) scale(${revealProgress})`,
                opacity: revealProgress,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 8,
              }}
            >
              <div
                style={{
                  width: size,
                  height: size,
                  borderRadius: size / 2,
                  backgroundColor: node.depth === 0
                    ? TEXT
                    : `rgba(0,0,0,${0.28 - node.depth * 0.05})`,
                }}
              />
              {node.label && (
                <span
                  style={{
                    fontFamily: SANS,
                    fontSize: node.depth === 0 ? 18 : 13,
                    fontWeight: node.depth === 0 ? 600 : 400,
                    color: node.depth === 0 ? TEXT : TEXT_DIM,
                    whiteSpace: "nowrap",
                    letterSpacing: node.depth === 0 ? -0.3 : 0.2,
                  }}
                >
                  {node.label}
                </span>
              )}
            </div>
          );
        })}

        {/* Outro text — scrolls in from below the tree */}
        {hasOutro && (() => {
          const outroLines = tree.outro!.split("\n");
          const outroReveal = interpolate(
            viewBottom,
            [outroY - 100, outroY + 60],
            [0, 1],
            { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
          );
          return (
            <div
              style={{
                position: "absolute",
                left: 0,
                top: outroY,
                width: "100%",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 8,
                opacity: outroReveal,
                transform: `translateY(${interpolate(outroReveal, [0, 1], [30, 0])}px)`,
              }}
            >
              {outroLines.map((line, i) => (
                <div
                  key={i}
                  style={{
                    fontFamily: SANS,
                    fontSize: 56,
                    fontWeight: 600,
                    color: TEXT,
                    letterSpacing: -1.5,
                    lineHeight: 1.25,
                    textAlign: "center",
                  }}
                >
                  {line}
                </div>
              ))}
            </div>
          );
        })()}
      </div>
    </AbsoluteFill>
  );
};

// ─── Mouse Pointer ───────────────────────────────────────

const MousePointer: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const moveEnd = fps * 0.6;
  const clickFrame = fps * 0.7;
  const fadeStart = fps * 1.0;
  const fadeEnd = fps * 1.3;

  const moveProgress = interpolate(frame, [0, moveEnd], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });

  const x = interpolate(moveProgress, [0, 1], [750, 450]);
  const y = interpolate(moveProgress, [0, 1], [800, 480]);

  const opacity = interpolate(frame, [0, 4, fadeStart, fadeEnd], [0, 1, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const isClicking = frame >= clickFrame && frame < clickFrame + 4;

  if (opacity <= 0) return null;

  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: y,
        zIndex: 100,
        opacity,
        transform: `scale(${isClicking ? 0.85 : 1})`,
        transformOrigin: "top left",
        pointerEvents: "none",
      }}
    >
      <svg width="24" height="28" viewBox="0 0 24 28" fill="none">
        <path
          d="M2 2L2 22L7.5 16.5L12.5 26L16 24.5L11 15H19L2 2Z"
          fill={TEXT}
          stroke="white"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
};

// ─── Highlight Clip (terminal) ────────────────────────────

const HighlightClip: React.FC<{
  highlight: Highlight;
  durationSec: number;
}> = ({ highlight, durationSec }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const entry = useEntry(fps, frame);

  const fadeIn = interpolate(frame, [0, fps * TIMING.transition], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const fadeOut = interpolate(
    frame,
    [fps * (durationSec - TIMING.transition), fps * durationSec],
    [1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  const lineDelay = fps * 0.12;
  const firstLineFrame = fps * 0.3;
  const lines = highlight.lines || [];

  const lastVisibleLineIdx = lines.findIndex((_, i) => frame < firstLineFrame + (i + 1) * lineDelay);
  const cursorLineIdx = lastVisibleLineIdx === -1 ? lines.length - 1 : Math.max(0, lastVisibleLineIdx - 1);

  return (
    <AbsoluteFill style={{ opacity: Math.min(fadeIn, fadeOut) }}>
      <AbsoluteFill
        style={{
          justifyContent: "center",
          alignItems: "center",
          padding: 50,
          paddingTop: 70,
          paddingBottom: 90,
        }}
      >
        <div
          style={{
            transform: `scale(${entry.scale}) translateY(${entry.y}px)`,
            transformOrigin: "center center",
            width: 840,
            borderRadius: 16,
            overflow: "hidden",
            boxShadow: `${CARD_SHADOW}, 0 0 0 1px ${CARD_BORDER}`,
          }}
        >
          <div
            style={{
              backgroundColor: TERM_BAR,
              padding: "10px 20px",
              borderBottom: `1px solid ${TERM_BORDER}`,
              display: "flex",
              alignItems: "center",
            }}
          >
            <div style={{ display: "flex", gap: 6 }}>
              <div style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: "rgba(0,0,0,0.06)" }} />
              <div style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: "rgba(0,0,0,0.06)" }} />
              <div style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: "rgba(0,0,0,0.06)" }} />
            </div>
          </div>

          <div
            style={{
              backgroundColor: TERM_BG,
              padding: "24px 28px",
              minHeight: 320,
            }}
          >
            {lines.map((line, lineIdx) => {
              const lineFrame = firstLineFrame + lineIdx * lineDelay;

              const lineProgress = interpolate(frame, [lineFrame, lineFrame + fps * 0.25], [0, 1], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
                easing: Easing.out(Easing.cubic),
              });

              const cleanText = line.isPrompt ? line.text.replace(/^\$\s*/, "") : line.text;
              let displayText = cleanText;
              let isTyping = false;
              if (line.isPrompt) {
                const typingEnd = lineFrame + fps * 0.6;
                if (frame < typingEnd) {
                  const progress = interpolate(frame, [lineFrame, typingEnd], [0, 1], {
                    extrapolateLeft: "clamp",
                    extrapolateRight: "clamp",
                  });
                  displayText = cleanText.slice(0, Math.floor(progress * cleanText.length));
                  isTyping = Math.floor(progress * cleanText.length) < cleanText.length;
                }
              }

              return (
                <div
                  key={lineIdx}
                  style={{
                    opacity: lineProgress,
                    fontFamily: MONO,
                    fontSize: 15,
                    lineHeight: 1.75,
                    color: line.dim ? TERM_DIM : line.color || TERM_TEXT,
                    fontWeight: line.bold ? 700 : 400,
                    whiteSpace: "pre",
                    display: "flex",
                    alignItems: "center",
                  }}
                >
                  {line.isPrompt && <span style={{ color: TERM_ACCENT, marginRight: 8 }}>$</span>}
                  <span>{displayText}</span>
                  {lineIdx === cursorLineIdx && <Cursor visible blink={!isTyping} />}
                </div>
              );
            })}
          </div>
        </div>
      </AbsoluteFill>

      <MousePointer />
    </AbsoluteFill>
  );
};

// ─── Browser Highlight Clip ───────────────────────────────

const BrowserHighlightClip: React.FC<{
  highlight: Highlight;
  durationSec: number;
}> = ({ highlight, durationSec }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const entry = useEntry(fps, frame);

  const fadeIn = interpolate(frame, [0, fps * TIMING.transition], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const fadeOut = interpolate(
    frame,
    [fps * (durationSec - TIMING.transition), fps * durationSec],
    [1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  const fx = highlight.focusX ?? 0.5;
  const fy = highlight.focusY ?? 0.5;
  const focalZoom = interpolate(frame, [0, fps * durationSec], [1, 1.04], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const videoSrc = highlight.videoSrc!;
  const startFrom = Math.round((highlight.videoStartSec || 0) * fps);

  return (
    <AbsoluteFill style={{ opacity: Math.min(fadeIn, fadeOut) }}>
      <AbsoluteFill
        style={{
          justifyContent: "center",
          alignItems: "center",
          padding: 50,
          paddingTop: 70,
          paddingBottom: 90,
        }}
      >
        <div
          style={{
            transform: `scale(${entry.scale}) translateY(${entry.y}px)`,
            transformOrigin: "center center",
            width: 880,
            borderRadius: 16,
            overflow: "hidden",
            boxShadow: `${CARD_SHADOW}, 0 0 0 1px ${CARD_BORDER}`,
          }}
        >
          <div
            style={{
              backgroundColor: TERM_BAR,
              padding: "10px 20px",
              borderBottom: `1px solid ${TERM_BORDER}`,
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <div style={{ display: "flex", gap: 6 }}>
              <div style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: "rgba(0,0,0,0.06)" }} />
              <div style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: "rgba(0,0,0,0.06)" }} />
              <div style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: "rgba(0,0,0,0.06)" }} />
            </div>
            <div
              style={{
                flex: 1,
                marginLeft: 4,
                backgroundColor: "rgba(0,0,0,0.03)",
                borderRadius: 6,
                padding: "5px 12px",
                fontFamily: SANS,
                fontSize: 11,
                color: "rgba(0,0,0,0.25)",
              }}
            >
              localhost:3000
            </div>
          </div>

          <div
            style={{
              width: "100%",
              aspectRatio: "16/10",
              backgroundColor: "#fff",
              overflow: "hidden",
              position: "relative",
            }}
          >
            <div
              style={{
                width: "100%",
                height: "100%",
                transform: `scale(${focalZoom})`,
                transformOrigin: `${fx * 100}% ${fy * 100}%`,
                position: "relative",
              }}
            >
              <OffthreadVideo
                src={staticFile(videoSrc)}
                startFrom={startFrom}
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
              />
              {highlight.clicks && highlight.clicks.length > 0 && (
                <BrowserCursor clicks={highlight.clicks} durationSec={durationSec} />
              )}
            </div>
          </div>
        </div>
      </AbsoluteFill>

      {highlight.overlay && <TextOverlay text={highlight.overlay} durationSec={durationSec} />}
    </AbsoluteFill>
  );
};

// ─── Browser Cursor ──────────────────────────────────────

const BrowserCursor: React.FC<{ clicks: ClickEvent[]; durationSec: number }> = ({
  clicks,
  durationSec,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  if (!clicks || clicks.length === 0) return null;

  const currentSec = frame / fps;
  const scaleX = VIDEO_AREA_W / VIEWPORT_W;
  const scaleY = VIDEO_AREA_H / VIEWPORT_H;

  let targetX: number;
  let targetY: number;

  if (currentSec <= clicks[0].timeSec) {
    targetX = clicks[0].x * scaleX;
    targetY = clicks[0].y * scaleY;
  } else if (currentSec >= clicks[clicks.length - 1].timeSec) {
    targetX = clicks[clicks.length - 1].x * scaleX;
    targetY = clicks[clicks.length - 1].y * scaleY;
  } else {
    let prevIdx = 0;
    for (let i = 1; i < clicks.length; i++) {
      if (clicks[i].timeSec > currentSec) break;
      prevIdx = i;
    }
    const nextIdx = Math.min(prevIdx + 1, clicks.length - 1);
    const prev = clicks[prevIdx];
    const next = clicks[nextIdx];
    const t = (currentSec - prev.timeSec) / (next.timeSec - prev.timeSec || 1);
    const eased = Easing.inOut(Easing.cubic)(Math.min(1, t));
    targetX = interpolate(eased, [0, 1], [prev.x * scaleX, next.x * scaleX]);
    targetY = interpolate(eased, [0, 1], [prev.y * scaleY, next.y * scaleY]);
  }

  const clickWindow = 3 / fps;
  const isClicking = clicks.some((c) => Math.abs(currentSec - c.timeSec) < clickWindow);

  const lastClickTime = clicks[clicks.length - 1].timeSec;
  const cursorOpacity = Math.min(
    interpolate(currentSec, [0, 0.3], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
    interpolate(currentSec, [lastClickTime + 0.3, lastClickTime + 0.8], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })
  );

  if (cursorOpacity <= 0) return null;

  return (
    <>
      {clicks.map((click, i) => {
        const rippleDuration = 0.4;
        if (currentSec < click.timeSec || currentSec > click.timeSec + rippleDuration) return null;
        const progress = (currentSec - click.timeSec) / rippleDuration;
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: click.x * scaleX - 15,
              top: click.y * scaleY - 15,
              width: 30,
              height: 30,
              borderRadius: "50%",
              border: `2px solid ${ACCENT}`,
              transform: `scale(${interpolate(progress, [0, 1], [0.5, 2.5])})`,
              opacity: interpolate(progress, [0, 0.3, 1], [0.6, 0.4, 0]),
              pointerEvents: "none",
              zIndex: 49,
            }}
          />
        );
      })}
      <div
        style={{
          position: "absolute",
          left: targetX,
          top: targetY,
          zIndex: 50,
          opacity: cursorOpacity,
          transform: `scale(${isClicking ? 0.85 : 1})`,
          transformOrigin: "top left",
          pointerEvents: "none",
        }}
      >
        <svg width="24" height="28" viewBox="0 0 24 28" fill="none">
          <path
            d="M2 2L2 22L7.5 16.5L12.5 26L16 24.5L11 15H19L2 2Z"
            fill={TEXT}
            stroke="white"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
        </svg>
      </div>
    </>
  );
};

// ─── End Card ─────────────────────────────────────────────

const EndCard: React.FC<{ text: string; url?: string }> = ({ text, url }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const enterProgress = interpolate(frame, [0, fps * 0.6], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const urlProgress = interpolate(frame, [fps * 0.3, fps * 0.8], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });

  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
      <div
        style={{
          opacity: enterProgress,
          transform: `scale(${interpolate(enterProgress, [0, 1], [0.99, 1])}) translateY(${interpolate(enterProgress, [0, 1], [6, 0])}px)`,
          textAlign: "center",
        }}
      >
        <div
          style={{
            fontFamily: SANS,
            fontSize: 40,
            fontWeight: 600,
            color: TEXT,
            letterSpacing: -1,
          }}
        >
          {text}
        </div>
      </div>

      {url && (
        <div
          style={{
            marginTop: 20,
            opacity: urlProgress,
            transform: `translateY(${interpolate(urlProgress, [0, 1], [6, 0])}px)`,
            fontFamily: SANS,
            fontSize: 18,
            color: TEXT_DIM,
            letterSpacing: 0.5,
          }}
        >
          {url}
        </div>
      )}
    </AbsoluteFill>
  );
};
