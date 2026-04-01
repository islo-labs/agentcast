# Contributing to agentcast

Thanks for your interest in contributing!

## Development setup

```bash
git clone git@github.com:islo-labs/agentcast.git
cd agentcast

# Go CLI
make build

# Remotion video renderer
cd web && npm install && cd ..
```

## Running locally

```bash
# Build and run
make build
./bin/agentcast --help

# Run directly
go run ./cmd/cast --help

# Preview the video template in browser
cd web && npm run dev
```

## Testing

```bash
# Go tests
make test

# Render a test video with default props
cd web && npm run render
```

## Project layout

| Directory | What it does |
|-----------|-------------|
| `cmd/cast/` | CLI entry point |
| `internal/cmd/` | Cobra command definitions |
| `internal/session/` | Parses Claude Code JSONL session logs |
| `internal/recorder/` | PTY-based terminal recording |
| `internal/render/` | Go-native GIF rendering |
| `internal/vt/` | Minimal VT100 terminal emulator |
| `web/src/` | Remotion video composition (React) |

## Making changes

### Go CLI
The CLI is in `internal/cmd/root.go`. It orchestrates: screenshot -> session parse -> Remotion render.

### Video template
The video is a Remotion composition at `web/src/CastVideo.tsx`. Edit it and preview with `npm run dev` in the `web/` directory. Props are defined in `web/src/types.ts`.

### Session parser
`internal/session/parse.go` reads Claude Code's JSONL format. If the format changes, this is where to update.

## Pull requests

- Keep PRs focused on a single change
- Add tests for new Go code
- Test the video renders before submitting: `cd web && npm run render`
