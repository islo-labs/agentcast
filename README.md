# agentcast

Turn Claude Code sessions into viral demo videos.

<p align="center">
  <a href="agentcast-readme-demo.mp4">
    <img src="demo.gif" alt="agentcast demo" width="540" />
  </a>
</p>

## Install

```bash
npm install -g agentcast
```

## Usage

```bash
# Auto-detect from your last Claude session:
agentcast

# Manual CLI demo:
agentcast --cmd "npx @islo-labs/overtime" -p "Cron for AI agents"

# Manual browser demo (coming soon):
agentcast --url http://localhost:3000

# With options:
agentcast --cmd "npx my-tool" \
  --title "my-tool" \
  --prompt "What the tool does" \
  --music ~/music/track.mp3 \
  --output demo.mp4
```

## How it works

1. Reads your Claude Code session to understand what was built
2. Claude plans and executes a demo of your CLI tool
3. Claude picks the 3-4 best highlights
4. Renders a Screen Studio-quality video with music, cursor, and transitions

## What you get

A 15-20 second 1080x1080 video with:
- Title card
- 3-4 highlight clips — terminal on gradient, typing cursor, smooth transitions
- End card with install command
- Background music

Ready for Twitter/X, LinkedIn, Reels.

## Requirements

- Node.js 18+
- Python 3.10+
- Claude CLI (`claude`)

## Credits

Default background music: ["Go Create"](https://uppbeat.io/track/all-good-folks/go-create) by All Good Folks (via [Uppbeat](https://uppbeat.io))

## License

MIT
