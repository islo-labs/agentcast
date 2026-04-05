# agentreel

Turn your apps into demo videos.

## Run

```bash
npm install
node bin/agentreel.mjs --help
npx remotion studio  # preview video template
```

## Architecture

- `bin/agentreel.mjs` — CLI: PR context, demo planning, recording, highlight extraction, rendering
- `src/CastVideo.tsx` — Remotion video composition (reel + demo modes)
- `src/types.ts` — highlight types
- `src/Root.tsx` — composition config (square 1080x1080 reel, landscape 1920x1080 demo)
- `public/music.mp3` — default background track
