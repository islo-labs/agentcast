import React from "react";
import {
  AbsoluteFill,
  Audio,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
  Sequence,
  Easing,
  OffthreadVideo,
} from "remotion";
import { CastProps, Highlight } from "./types";

const ACCENT = "#50fa7b";
const DIM = "#6272a4";
const WHITE = "#f8f8f2";
const TERM_BG = "#282a36";
const TITLE_BAR = "#1e1f29";
const CURSOR_COLOR = "#f8f8f2";

const TITLE_DUR = 2.5;
const HIGHLIGHT_DUR = 4.5;
const TRANSITION_DUR = 0.5;
const END_DUR = 3.5;

const SANS =
  '-apple-system, BlinkMacSystemFont, "SF Pro Display", system-ui, sans-serif';
const MONO =
  '"SF Mono", "Fira Code", "Cascadia Code", "JetBrains Mono", monospace';

// ─── Transition variants ──────────────────────────────────
// Each highlight enters differently to keep the eye engaged.

type TransitionStyle = "rise" | "zoomIn" | "slideLeft" | "drop";
const TRANSITIONS: TransitionStyle[] = ["rise", "zoomIn", "slideLeft", "drop"];

function getEntryTransform(
  style: TransitionStyle,
  progress: number // 0 → 1 spring
): { scale: number; x: number; y: number } {
  switch (style) {
    case "rise":
      return {
        scale: interpolate(progress, [0, 1], [0.82, 1]),
        x: 0,
        y: interpolate(progress, [0, 1], [80, 0]),
      };
    case "zoomIn":
      return {
        scale: interpolate(progress, [0, 1], [0.6, 1]),
        x: 0,
        y: 0,
      };
    case "slideLeft":
      return {
        scale: interpolate(progress, [0, 1], [0.9, 1]),
        x: interpolate(progress, [0, 1], [120, 0]),
        y: 0,
      };
    case "drop":
      return {
        scale: interpolate(progress, [0, 1], [0.85, 1]),
        x: 0,
        y: interpolate(progress, [0, 1], [-70, 0]),
      };
  }
}

// ─── Main Composition ─────────────────────────────────────

export const CastVideo: React.FC<CastProps> = ({
  title,
  subtitle,
  highlights,
  endText,
  endUrl,
  gradient,
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const g = gradient || ["#0f0f1a", "#1a0f2e"];

  const titleFrames = Math.round(TITLE_DUR * fps);
  const highlightFrames = Math.round(HIGHLIGHT_DUR * fps);
  const endFrames = Math.round(END_DUR * fps);

  // Animated gradient — hue rotates slowly over time
  const gradAngle = interpolate(frame, [0, durationInFrames], [125, 200], {
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill
      style={{
        background: `linear-gradient(${gradAngle}deg, ${g[0]}, ${g[1]}, ${g[0]})`,
        backgroundSize: "200% 200%",
      }}
    >
      {/* Subtle animated glow blobs in background */}
      <AnimatedBackground frame={frame} duration={durationInFrames} />

      {/* Global watermark — always visible */}
      <div
        style={{
          position: "absolute",
          bottom: 28,
          width: "100%",
          textAlign: "center",
          zIndex: 5,
          fontFamily: MONO,
          fontSize: 12,
          color: "rgba(255,255,255,0.18)",
          letterSpacing: 2,
        }}
      >
        made with agentreel
      </div>

      <MusicTrack />

      <Sequence durationInFrames={titleFrames}>
        <TitleCard title={title} subtitle={subtitle} />
      </Sequence>

      {highlights.map((h, i) => (
        <Sequence
          key={i}
          from={titleFrames + i * highlightFrames}
          durationInFrames={highlightFrames}
        >
          {h.videoSrc ? (
            <BrowserHighlightClip
              highlight={h}
              index={i}
              total={highlights.length}
              transition={TRANSITIONS[i % TRANSITIONS.length]}
            />
          ) : (
            <HighlightClip
              highlight={h}
              index={i}
              total={highlights.length}
              transition={TRANSITIONS[i % TRANSITIONS.length]}
            />
          )}
        </Sequence>
      ))}

      <Sequence
        from={titleFrames + highlights.length * highlightFrames}
        durationInFrames={endFrames}
      >
        <EndCard text={endText || title} url={endUrl} />
      </Sequence>
    </AbsoluteFill>
  );
};

// ─── Animated Background ──────────────────────────────────

const AnimatedBackground: React.FC<{
  frame: number;
  duration: number;
}> = ({ frame, duration }) => {
  // Two soft gradient blobs that drift slowly
  const blob1X = interpolate(frame, [0, duration], [20, 60], {
    extrapolateRight: "clamp",
  });
  const blob1Y = interpolate(frame, [0, duration], [30, 50], {
    extrapolateRight: "clamp",
  });
  const blob2X = interpolate(frame, [0, duration], [70, 35], {
    extrapolateRight: "clamp",
  });
  const blob2Y = interpolate(frame, [0, duration], [60, 30], {
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill style={{ opacity: 0.3 }}>
      <div
        style={{
          position: "absolute",
          width: 500,
          height: 500,
          borderRadius: "50%",
          background:
            "radial-gradient(circle, rgba(80,250,123,0.15) 0%, transparent 70%)",
          left: `${blob1X}%`,
          top: `${blob1Y}%`,
          transform: "translate(-50%, -50%)",
          filter: "blur(80px)",
        }}
      />
      <div
        style={{
          position: "absolute",
          width: 400,
          height: 400,
          borderRadius: "50%",
          background:
            "radial-gradient(circle, rgba(189,147,249,0.12) 0%, transparent 70%)",
          left: `${blob2X}%`,
          top: `${blob2Y}%`,
          transform: "translate(-50%, -50%)",
          filter: "blur(80px)",
        }}
      />
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
    return (
      <Audio src={staticFile("music.mp3")} volume={Math.min(fadeIn, fadeOut)} />
    );
  } catch {
    return null;
  }
};

// ─── Mouse Pointer ────────────────────────────────────────
// macOS-style cursor that moves to the terminal and "clicks" before typing starts.

const MousePointer: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Pointer moves in from bottom-right, arrives at terminal center, clicks, then fades
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

  // Click effect — brief scale down
  const isClicking = frame >= clickFrame && frame < clickFrame + 4;
  const clickScale = isClicking ? 0.85 : 1;

  if (opacity <= 0) return null;

  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: y,
        zIndex: 100,
        opacity,
        transform: `scale(${clickScale})`,
        transformOrigin: "top left",
        pointerEvents: "none",
      }}
    >
      {/* macOS cursor SVG */}
      <svg width="24" height="28" viewBox="0 0 24 28" fill="none">
        <path
          d="M2 2L2 22L7.5 16.5L12.5 26L16 24.5L11 15H19L2 2Z"
          fill="white"
          stroke="black"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
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
        backgroundColor: blinkOn ? CURSOR_COLOR : "transparent",
        marginLeft: 1,
        verticalAlign: "text-bottom",
        borderRadius: 1,
      }}
    />
  );
};

// ─── Text Overlay (colored accent words) ──────────────────

const TextOverlay: React.FC<{ text: string }> = ({ text }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const showAt = fps * 1.8;
  const hideAt = fps * (HIGHLIGHT_DUR - 0.8);

  const enterProgress = spring({
    fps,
    frame: Math.max(0, frame - showAt),
    config: { damping: 16, stiffness: 100 },
  });
  const exitOpacity = interpolate(frame, [hideAt, hideAt + fps * 0.3], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const opacity = Math.min(enterProgress, exitOpacity);
  const y = interpolate(enterProgress, [0, 1], [20, 0]);
  const scale = interpolate(enterProgress, [0, 1], [0.9, 1]);

  if (frame < showAt) return null;

  // Parse **bold** syntax for colored accent words
  const parts = text.split(/(\*\*.*?\*\*)/);

  return (
    <div
      style={{
        position: "absolute",
        bottom: 55,
        left: 0,
        width: "100%",
        textAlign: "center",
        zIndex: 20,
        opacity,
        transform: `translateY(${y}px) scale(${scale})`,
      }}
    >
      <span
        style={{
          fontFamily: SANS,
          fontSize: 36,
          fontWeight: 700,
          color: WHITE,
          backgroundColor: "rgba(0,0,0,0.55)",
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
          padding: "12px 30px",
          borderRadius: 12,
          letterSpacing: -0.5,
          display: "inline-block",
        }}
      >
        {parts.map((part, i) => {
          if (part.startsWith("**") && part.endsWith("**")) {
            return (
              <span key={i} style={{ color: ACCENT, fontWeight: 800 }}>
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

  const titleSpring = spring({ fps, frame, config: { damping: 14 } });
  const subSpring = spring({
    fps,
    frame: Math.max(0, frame - 8),
    config: { damping: 14 },
  });
  const fadeOut = interpolate(
    frame,
    [fps * (TITLE_DUR - TRANSITION_DUR), fps * TITLE_DUR],
    [1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );
  const titleZoom = interpolate(frame, [0, fps * TITLE_DUR], [1, 1.08], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill
      style={{
        opacity: fadeOut,
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      <div
        style={{
          transform: `scale(${titleSpring * titleZoom}) translateY(${interpolate(titleSpring, [0, 1], [30, 0])}px)`,
          textAlign: "center",
        }}
      >
        <div
          style={{
            fontFamily: SANS,
            fontSize: 76,
            fontWeight: 800,
            color: WHITE,
            letterSpacing: -3,
          }}
        >
          {title}
        </div>
        {subtitle && (
          <div
            style={{
              transform: `translateY(${interpolate(subSpring, [0, 1], [20, 0])}px)`,
              opacity: subSpring,
              fontFamily: SANS,
              fontSize: 28,
              color: DIM,
              marginTop: 16,
              letterSpacing: 1,
            }}
          >
            {subtitle}
          </div>
        )}
      </div>
    </AbsoluteFill>
  );
};

// ─── Highlight Clip ───────────────────────────────────────

const HighlightClip: React.FC<{
  highlight: Highlight;
  index: number;
  total: number;
  transition: TransitionStyle;
}> = ({ highlight, index, total, transition }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Entry animation — varies per clip
  const enterSpring = spring({
    fps,
    frame,
    config: { damping: 18, stiffness: 80 },
  });
  const entry = getEntryTransform(transition, enterSpring);

  // Fade transitions
  const fadeIn = interpolate(frame, [0, fps * TRANSITION_DUR], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const fadeOut = interpolate(
    frame,
    [fps * (HIGHLIGHT_DUR - TRANSITION_DUR), fps * HIGHLIGHT_DUR],
    [1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );
  const opacity = Math.min(fadeIn, fadeOut);

  // Zoom in/out cycle
  const zoomIn = interpolate(
    frame,
    [fps * 0.8, fps * 2.0],
    [1, 1.12],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: Easing.out(Easing.cubic),
    }
  );
  const zoomOut = interpolate(
    frame,
    [fps * 2.5, fps * (HIGHLIGHT_DUR - 0.5)],
    [1.12, 1.02],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: Easing.inOut(Easing.cubic),
    }
  );
  const zoom = frame < fps * 2.5 ? zoomIn : zoomOut;

  // Vertical pan
  const panY = interpolate(
    frame,
    [fps * 0.8, fps * 2.0, fps * 3.5],
    [0, -15, 5],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  // Line timing
  const lineDelay = fps * 0.15;
  const firstLineFrame = fps * 0.35;

  // Cursor tracking
  const lastVisibleLineIdx = highlight.lines.findIndex((_, i) => {
    return frame < firstLineFrame + (i + 1) * lineDelay;
  });
  const cursorLineIdx =
    lastVisibleLineIdx === -1
      ? highlight.lines.length - 1
      : Math.max(0, lastVisibleLineIdx - 1);

  return (
    <AbsoluteFill style={{ opacity }}>
      {/* Label + progress dots */}
      <div
        style={{
          position: "absolute",
          top: 45,
          left: 0,
          width: "100%",
          textAlign: "center",
          zIndex: 10,
        }}
      >
        <span
          style={{
            fontFamily: MONO,
            fontSize: 13,
            color: ACCENT,
            letterSpacing: 4,
            textTransform: "uppercase",
            opacity: interpolate(enterSpring, [0, 1], [0, 0.6]),
          }}
        >
          {highlight.label}
        </span>
        <div
          style={{
            marginTop: 10,
            display: "flex",
            justifyContent: "center",
            gap: 8,
          }}
        >
          {Array.from({ length: total }).map((_, i) => (
            <div
              key={i}
              style={{
                width: i === index ? 24 : 8,
                height: 6,
                borderRadius: 3,
                backgroundColor:
                  i === index ? ACCENT : "rgba(255,255,255,0.12)",
              }}
            />
          ))}
        </div>
      </div>

      {/* Terminal window */}
      <AbsoluteFill
        style={{
          justifyContent: "center",
          alignItems: "center",
          padding: 40,
          paddingTop: 100,
          paddingBottom: 100,
        }}
      >
        <div
          style={{
            transform: `scale(${entry.scale * zoom}) translate(${entry.x}px, ${entry.y + panY}px)`,
            transformOrigin: "center center",
            width: 820,
            borderRadius: 14,
            overflow: "hidden",
            boxShadow:
              "0 40px 120px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.06)",
          }}
        >
          {/* macOS title bar */}
          <div
            style={{
              backgroundColor: TITLE_BAR,
              padding: "12px 16px",
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <div
              style={{
                width: 12,
                height: 12,
                borderRadius: 6,
                backgroundColor: "#ff5555",
              }}
            />
            <div
              style={{
                width: 12,
                height: 12,
                borderRadius: 6,
                backgroundColor: "#f1fa8c",
              }}
            />
            <div
              style={{
                width: 12,
                height: 12,
                borderRadius: 6,
                backgroundColor: "#50fa7b",
              }}
            />
            <div
              style={{
                flex: 1,
                textAlign: "center",
                fontFamily: MONO,
                fontSize: 12,
                color: "rgba(255,255,255,0.25)",
              }}
            >
              Terminal
            </div>
          </div>

          {/* Terminal body */}
          <div
            style={{
              backgroundColor: TERM_BG,
              padding: "20px 24px",
              minHeight: 280,
            }}
          >
            {highlight.lines.map((line, lineIdx) => {
              const lineFrame = firstLineFrame + lineIdx * lineDelay;
              const lineSpring = spring({
                fps,
                frame: Math.max(0, frame - lineFrame),
                config: { damping: 20, stiffness: 120 },
              });
              const lineOpacity = interpolate(lineSpring, [0, 1], [0, 1]);
              const lineX = interpolate(lineSpring, [0, 1], [12, 0]);

              let displayText = line.text;
              let isTyping = false;
              if (line.isPrompt) {
                const typingEnd = lineFrame + fps * 0.6;
                if (frame < typingEnd) {
                  const progress = interpolate(
                    frame,
                    [lineFrame, typingEnd],
                    [0, 1],
                    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
                  );
                  const chars = Math.floor(progress * line.text.length);
                  displayText = line.text.slice(0, chars);
                  isTyping = chars < line.text.length;
                }
              }

              const isZoomed = highlight.zoomLine === lineIdx;
              const lineZoom = isZoomed
                ? interpolate(
                    frame,
                    [lineFrame + fps * 0.5, lineFrame + fps * 1],
                    [1, 1.05],
                    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
                  )
                : 1;

              const showCursor = lineIdx === cursorLineIdx;

              return (
                <div
                  key={lineIdx}
                  style={{
                    opacity: lineOpacity,
                    transform: `translateX(${lineX}px) scale(${lineZoom})`,
                    transformOrigin: "left center",
                    fontFamily: MONO,
                    fontSize: 16,
                    lineHeight: 1.7,
                    color: line.dim ? DIM : line.color || WHITE,
                    fontWeight: line.bold ? 700 : 400,
                    whiteSpace: "pre",
                    display: "flex",
                    alignItems: "center",
                  }}
                >
                  {line.isPrompt && (
                    <span style={{ color: ACCENT, marginRight: 8 }}>$</span>
                  )}
                  <span>{displayText}</span>
                  {showCursor && <Cursor visible blink={!isTyping} />}
                </div>
              );
            })}
          </div>
        </div>
      </AbsoluteFill>

      {/* Mouse pointer — appears at start of each clip */}
      <MousePointer />

      {/* Text overlay */}
      {highlight.overlay && <TextOverlay text={highlight.overlay} />}
    </AbsoluteFill>
  );
};

// ─── Browser Highlight Clip ───────────────────────────────

const BrowserHighlightClip: React.FC<{
  highlight: Highlight;
  index: number;
  total: number;
  transition: TransitionStyle;
}> = ({ highlight, index, total, transition }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const enterSpring = spring({
    fps,
    frame,
    config: { damping: 18, stiffness: 80 },
  });
  const entry = getEntryTransform(transition, enterSpring);

  const fadeIn = interpolate(frame, [0, fps * TRANSITION_DUR], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const fadeOut = interpolate(
    frame,
    [fps * (HIGHLIGHT_DUR - TRANSITION_DUR), fps * HIGHLIGHT_DUR],
    [1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );
  const opacity = Math.min(fadeIn, fadeOut);

  // Zoom in/out cycle
  const zoomIn = interpolate(frame, [fps * 0.8, fps * 2.0], [1, 1.08], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const zoomOut = interpolate(
    frame,
    [fps * 2.5, fps * (HIGHLIGHT_DUR - 0.5)],
    [1.08, 1.01],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: Easing.inOut(Easing.cubic),
    }
  );
  const zoom = frame < fps * 2.5 ? zoomIn : zoomOut;

  const panY = interpolate(
    frame,
    [fps * 0.8, fps * 2.0, fps * 3.5],
    [0, -10, 5],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  const videoSrc = highlight.videoSrc!;
  const startFrom = Math.round((highlight.videoStartSec || 0) * fps);

  return (
    <AbsoluteFill style={{ opacity }}>
      {/* Label + progress dots */}
      <div
        style={{
          position: "absolute",
          top: 45,
          left: 0,
          width: "100%",
          textAlign: "center",
          zIndex: 10,
        }}
      >
        <span
          style={{
            fontFamily: MONO,
            fontSize: 13,
            color: ACCENT,
            letterSpacing: 4,
            textTransform: "uppercase",
            opacity: interpolate(enterSpring, [0, 1], [0, 0.6]),
          }}
        >
          {highlight.label}
        </span>
        <div
          style={{
            marginTop: 10,
            display: "flex",
            justifyContent: "center",
            gap: 8,
          }}
        >
          {Array.from({ length: total }).map((_, i) => (
            <div
              key={i}
              style={{
                width: i === index ? 24 : 8,
                height: 6,
                borderRadius: 3,
                backgroundColor:
                  i === index ? ACCENT : "rgba(255,255,255,0.12)",
              }}
            />
          ))}
        </div>
      </div>

      {/* Browser window */}
      <AbsoluteFill
        style={{
          justifyContent: "center",
          alignItems: "center",
          padding: 40,
          paddingTop: 100,
          paddingBottom: 100,
        }}
      >
        <div
          style={{
            transform: `scale(${entry.scale * zoom}) translate(${entry.x}px, ${entry.y + panY}px)`,
            transformOrigin: "center center",
            width: 880,
            borderRadius: 14,
            overflow: "hidden",
            boxShadow:
              "0 40px 120px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.06)",
          }}
        >
          {/* Browser chrome */}
          <div
            style={{
              backgroundColor: TITLE_BAR,
              padding: "10px 16px",
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <div style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: "#ff5555" }} />
            <div style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: "#f1fa8c" }} />
            <div style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: "#50fa7b" }} />
            {/* Address bar */}
            <div
              style={{
                flex: 1,
                marginLeft: 8,
                backgroundColor: "rgba(255,255,255,0.06)",
                borderRadius: 6,
                padding: "6px 12px",
                fontFamily: SANS,
                fontSize: 12,
                color: "rgba(255,255,255,0.4)",
              }}
            >
              {highlight.videoSrc ? "localhost:3000" : ""}
            </div>
          </div>

          {/* Video content */}
          <div
            style={{
              width: "100%",
              aspectRatio: "16/10",
              backgroundColor: "#fff",
              overflow: "hidden",
            }}
          >
            <OffthreadVideo
              src={staticFile(videoSrc)}
              startFrom={startFrom}
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
            />
          </div>
        </div>
      </AbsoluteFill>

      {/* Mouse pointer */}
      <MousePointer />

      {/* Text overlay */}
      {highlight.overlay && <TextOverlay text={highlight.overlay} />}
    </AbsoluteFill>
  );
};

// ─── End Card (CTA) ───────────────────────────────────────

const EndCard: React.FC<{ text: string; url?: string }> = ({ text, url }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const cmdSpring = spring({ fps, frame, config: { damping: 14 } });
  const urlSpring = spring({
    fps,
    frame: Math.max(0, frame - 10),
    config: { damping: 14 },
  });
  const brandSpring = spring({
    fps,
    frame: Math.max(0, frame - 18),
    config: { damping: 14 },
  });
  const endZoom = interpolate(frame, [0, fps * END_DUR], [1.05, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });

  return (
    <AbsoluteFill
      style={{
        justifyContent: "center",
        alignItems: "center",
        transform: `scale(${endZoom})`,
      }}
    >
      <div
        style={{
          transform: `scale(${cmdSpring}) translateY(${interpolate(cmdSpring, [0, 1], [25, 0])}px)`,
          textAlign: "center",
        }}
      >
        <div
          style={{
            fontFamily: MONO,
            fontSize: 30,
            color: WHITE,
            padding: "18px 36px",
            borderRadius: 14,
            backgroundColor: "rgba(255,255,255,0.05)",
            border: "1px solid rgba(255,255,255,0.1)",
            boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
          }}
        >
          <span style={{ color: ACCENT }}>$ </span>
          {text}
          <Cursor visible blink />
        </div>
      </div>

      {url && (
        <div
          style={{
            marginTop: 24,
            opacity: urlSpring,
            transform: `translateY(${interpolate(urlSpring, [0, 1], [15, 0])}px)`,
            fontFamily: SANS,
            fontSize: 20,
            color: DIM,
            letterSpacing: 0.5,
          }}
        >
          {url}
        </div>
      )}

      <div
        style={{
          position: "absolute",
          bottom: 40,
          opacity: brandSpring * 0.4,
          transform: `translateY(${interpolate(brandSpring, [0, 1], [10, 0])}px)`,
          fontFamily: MONO,
          fontSize: 13,
          color: DIM,
          letterSpacing: 3,
        }}
      >
        made with agentreel
      </div>
    </AbsoluteFill>
  );
};
