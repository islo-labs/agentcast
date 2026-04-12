import { Composition } from "remotion";
import { CastVideo } from "./CastVideo";
import { defaultProps, CastProps, Highlight } from "./types";

const TIMING = { title: 2.5, termHighlight: 4.5, browserHighlight: 7.0, textSlide: 3.5, diagram: 5.0, tree: 6.0, end: 3.5 };

function highlightDuration(h: Highlight): number {
  if (h.statement) return TIMING.textSlide;
  if (h.diagram) return TIMING.diagram;
  if (h.panels) return TIMING.diagram;
  if (h.tree) return TIMING.tree;
  if (h.videoSrc) return TIMING.browserHighlight;
  return TIMING.termHighlight;
}

export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id="CastVideo"
      component={CastVideo as unknown as React.FC<Record<string, unknown>>}
      durationInFrames={450}
      fps={30}
      width={1080}
      height={1080}
      defaultProps={defaultProps as unknown as Record<string, unknown>}
      calculateMetadata={({ props }) => {
        const p = props as unknown as CastProps;
        const fps = 30;

        const titleFrames = Math.round(TIMING.title * fps);
        const highlightFrames = p.highlights.reduce((sum, h) => {
          return sum + Math.round(highlightDuration(h) * fps);
        }, 0);
        const endFrames = Math.round(TIMING.end * fps);

        return {
          durationInFrames: titleFrames + highlightFrames + endFrames,
          width: 1080,
          height: 1080,
        };
      }}
    />
  );
};
