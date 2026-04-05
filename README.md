# agentreel

Turn your web apps and CLIs into viral clips — or demo what a PR does.

https://github.com/user-attachments/assets/474fd85d-3b35-48f4-82b8-1b337840fb51

> Turn on sound

## Install

```bash
npx agentreel
```

## Usage

```bash
# Demo a PR (reads context from GitHub):
agentreel --pr 123
agentreel --pr owner/repo#123
agentreel --pr https://github.com/owner/repo/pull/123

# PR demo with a dev server (for web UI changes):
agentreel --pr 123 --start "npm run dev"

# CLI demo:
agentreel --cmd "npx my-cli-tool"

# Browser demo:
agentreel --url http://localhost:3000
```

## Modes

### PR demo (`--pr`)

Point it at a pull request. It fetches the diff, description, and README from GitHub, then AI plans and records a demo showing what the PR actually does.

- **1920x1080 landscape** — chapter-based walkthrough
- **4-6 chapters**, 12s each — full command + output flows
- No music, no marketing overlays — just the real demo
- Great for attaching to PRs so reviewers can see the change in action

Requires [`gh` CLI](https://cli.github.com) to be installed and authenticated.

### Marketing reel (`--cmd` / `--url`)

The original mode — creates a short, polished clip for social media.

- **1080x1080 square** — optimized for Twitter/X, LinkedIn, Reels
- **3-4 highlight snippets**, 4.5s each — the best moments
- Music, animated transitions, text overlays, cursor animations
- Prompts you to share on Twitter

## How it works

1. **PR mode**: Fetches PR diff + README from GitHub, AI decides CLI or browser demo, plans steps that show the actual changes
2. **Manual mode**: You provide a CLI command or URL, AI plans an impressive demo
3. AI executes the demo (terminal PTY or Playwright browser)
4. AI picks the best moments as highlights
5. Renders video with Remotion

## Flags

```
    --pr <ref>          PR number, owner/repo#N, or full GitHub URL
    --start <cmd>       command to start a dev server (for browser PR demos)
-c, --cmd <command>     CLI command to demo
-u, --url <url>         URL to demo (browser mode)
-t, --title <text>      video title
-o, --output <file>     output file (default: agentreel.mp4)
-a, --auth <file>       Playwright storage state (cookies/auth) for browser demos
-g, --guidelines <text> guidelines for highlight generation
    --music <file>      path to background music mp3
    --no-share          skip the share prompt
```

## Requirements

- Node.js 18+
- Claude CLI (`claude`) — plans and records demos
- `gh` CLI — required for `--pr` mode

## Credits

Default background music: ["Go Create"](https://uppbeat.io/track/all-good-folks/go-create) by All Good Folks (via [Uppbeat](https://uppbeat.io))

## License

MIT
