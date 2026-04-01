import React from "react";
import {
  AbsoluteFill,
  Img,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { CastProps } from "./types";

const BG = "#0f0f1a";
const ACCENT = "#50fa7b";
const DIM = "#6272a4";
const WHITE = "#f8f8f2";

export const CastVideo: React.FC<CastProps> = ({
  prompt,
  screenshotUrl,
  duration,
  cost,
  filesChanged,
  linesAdded,
  linesRemoved,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Act timing
  const promptEnd = fps * 2;
  const transitionDur = fps * 0.5;
  const resultStart = promptEnd;
  const resultEnd = resultStart + fps * 4;
  const statsStart = resultEnd;

  return (
    <AbsoluteFill style={{ backgroundColor: BG }}>
      {/* Act 1: The Prompt */}
      <PromptAct
        frame={frame}
        fps={fps}
        prompt={prompt}
        fadeOutStart={promptEnd - transitionDur}
        fadeOutEnd={promptEnd}
      />

      {/* Act 2: The Result */}
      <ResultAct
        frame={frame}
        fps={fps}
        screenshotUrl={screenshotUrl}
        fadeInStart={resultStart}
        fadeInEnd={resultStart + transitionDur}
        fadeOutStart={resultEnd - transitionDur}
        fadeOutEnd={resultEnd}
      />

      {/* Act 3: The Stats */}
      <StatsAct
        frame={frame}
        fps={fps}
        duration={duration}
        cost={cost}
        filesChanged={filesChanged}
        linesAdded={linesAdded}
        linesRemoved={linesRemoved}
        fadeInStart={statsStart}
        fadeInEnd={statsStart + transitionDur}
      />

      {/* Watermark */}
      <div
        style={{
          position: "absolute",
          bottom: 30,
          width: "100%",
          textAlign: "center",
          fontFamily: "monospace",
          fontSize: 16,
          color: "#44475a",
          letterSpacing: 2,
        }}
      >
        agentcast.dev
      </div>
    </AbsoluteFill>
  );
};

const PromptAct: React.FC<{
  frame: number;
  fps: number;
  prompt: string;
  fadeOutStart: number;
  fadeOutEnd: number;
}> = ({ frame, fps, prompt, fadeOutStart, fadeOutEnd }) => {
  const scale = spring({ fps, frame, config: { damping: 12 } });
  const opacity = interpolate(frame, [fadeOutStart, fadeOutEnd], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Typing effect
  const charsVisible = Math.min(
    prompt.length,
    Math.floor(frame * (prompt.length / (fps * 1.2)))
  );
  const displayText = prompt.slice(0, charsVisible);
  const showCursor = frame % (fps / 2) < fps / 4 && charsVisible < prompt.length;

  return (
    <AbsoluteFill
      style={{
        opacity,
        justifyContent: "center",
        alignItems: "center",
        padding: 80,
      }}
    >
      <div
        style={{
          transform: `scale(${scale})`,
          textAlign: "center",
        }}
      >
        <div
          style={{
            fontFamily: "monospace",
            fontSize: 18,
            color: DIM,
            marginBottom: 20,
            letterSpacing: 3,
            textTransform: "uppercase",
          }}
        >
          I asked Claude to
        </div>
        <div
          style={{
            fontFamily:
              '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
            fontSize: 48,
            fontWeight: 700,
            color: WHITE,
            lineHeight: 1.3,
            maxWidth: 800,
          }}
        >
          "{displayText}
          {showCursor && (
            <span style={{ color: ACCENT }}>|</span>
          )}
          "
        </div>
      </div>
    </AbsoluteFill>
  );
};

const ResultAct: React.FC<{
  frame: number;
  fps: number;
  screenshotUrl: string;
  fadeInStart: number;
  fadeInEnd: number;
  fadeOutStart: number;
  fadeOutEnd: number;
}> = ({
  frame,
  fps,
  screenshotUrl,
  fadeInStart,
  fadeInEnd,
  fadeOutStart,
  fadeOutEnd,
}) => {
  const fadeIn = interpolate(frame, [fadeInStart, fadeInEnd], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const fadeOut = interpolate(frame, [fadeOutStart, fadeOutEnd], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const opacity = Math.min(fadeIn, fadeOut);

  const localFrame = frame - fadeInStart;
  const scale = spring({
    fps,
    frame: localFrame,
    config: { damping: 15, stiffness: 80 },
  });
  const imgScale = interpolate(scale, [0, 1], [0.8, 1]);

  return (
    <AbsoluteFill
      style={{
        opacity,
        justifyContent: "center",
        alignItems: "center",
        padding: 60,
      }}
    >
      <div
        style={{
          transform: `scale(${imgScale})`,
          borderRadius: 16,
          overflow: "hidden",
          boxShadow: "0 25px 80px rgba(0,0,0,0.6)",
          border: "1px solid rgba(255,255,255,0.1)",
        }}
      >
        <Img
          src={screenshotUrl.startsWith("http") ? screenshotUrl : staticFile(screenshotUrl)}
          style={{
            width: 900,
            height: "auto",
            display: "block",
          }}
        />
      </div>
    </AbsoluteFill>
  );
};

const StatsAct: React.FC<{
  frame: number;
  fps: number;
  duration: string;
  cost: string;
  filesChanged: number;
  linesAdded: number;
  linesRemoved: number;
  fadeInStart: number;
  fadeInEnd: number;
}> = ({
  frame,
  fps,
  duration,
  cost,
  filesChanged,
  linesAdded,
  linesRemoved,
  fadeInStart,
  fadeInEnd,
}) => {
  const opacity = interpolate(frame, [fadeInStart, fadeInEnd], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const localFrame = frame - fadeInStart;

  const durationScale = spring({
    fps,
    frame: localFrame,
    config: { damping: 12 },
  });
  const statsScale = spring({
    fps,
    frame: Math.max(0, localFrame - 8),
    config: { damping: 12 },
  });
  const costScale = spring({
    fps,
    frame: Math.max(0, localFrame - 16),
    config: { damping: 12 },
  });

  return (
    <AbsoluteFill
      style={{
        opacity,
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      {/* Duration - the hero number */}
      <div
        style={{
          transform: `scale(${durationScale})`,
          textAlign: "center",
          marginBottom: 40,
        }}
      >
        <div
          style={{
            fontFamily:
              '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
            fontSize: 96,
            fontWeight: 800,
            color: ACCENT,
          }}
        >
          {duration}
        </div>
      </div>

      {/* Stats line */}
      <div
        style={{
          transform: `scale(${statsScale})`,
          display: "flex",
          gap: 40,
          marginBottom: 30,
        }}
      >
        <StatBadge value={`${filesChanged}`} label="files" />
        <StatBadge value={`+${linesAdded}`} label="added" color={ACCENT} />
        <StatBadge value={`-${linesRemoved}`} label="removed" color="#ff5555" />
      </div>

      {/* Cost */}
      <div
        style={{
          transform: `scale(${costScale})`,
          fontFamily: "monospace",
          fontSize: 24,
          color: DIM,
        }}
      >
        {cost}
      </div>
    </AbsoluteFill>
  );
};

const StatBadge: React.FC<{
  value: string;
  label: string;
  color?: string;
}> = ({ value, label, color = WHITE }) => (
  <div style={{ textAlign: "center" }}>
    <div
      style={{
        fontFamily: "monospace",
        fontSize: 36,
        fontWeight: 700,
        color,
      }}
    >
      {value}
    </div>
    <div
      style={{
        fontFamily: "monospace",
        fontSize: 14,
        color: DIM,
        marginTop: 4,
        textTransform: "uppercase",
        letterSpacing: 2,
      }}
    >
      {label}
    </div>
  </div>
);
