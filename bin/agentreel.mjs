#!/usr/bin/env node

import { execFileSync, spawn } from "node:child_process";
import { readFileSync, statSync, existsSync, mkdirSync, copyFileSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

// ── CLI flags ───────────────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2);
  const flags = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--help" || arg === "-h") { printUsage(); process.exit(0); }
    if (arg === "--version" || arg === "-v") {
      const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf-8"));
      console.log(pkg.version);
      process.exit(0);
    }
    if (arg === "--cmd" || arg === "-c") flags.cmd = args[++i];
    else if (arg === "--url" || arg === "-u") flags.url = args[++i];
    else if (arg === "--pr") flags.pr = args[++i];
    else if (arg === "--start") flags.start = args[++i];
    else if (arg === "--title" || arg === "-t") flags.title = args[++i];
    else if (arg === "--output" || arg === "-o") flags.output = args[++i];
    else if (arg === "--music") flags.music = args[++i];
    else if (arg === "--auth" || arg === "-a") flags.auth = args[++i];
    else if (arg === "--guidelines" || arg === "-g") flags.guidelines = args[++i];
    else if (arg === "--no-share") flags.noShare = true;
  }
  return flags;
}

function printUsage() {
  console.log(`agentreel — Turn your web apps and CLIs into viral clips

Usage:
  agentreel --pr 123                             # demo a PR (reads context from GitHub)
  agentreel --pr owner/repo#123                  # demo a PR (explicit repo)
  agentreel --cmd "npx my-cli-tool"              # CLI demo
  agentreel --url http://localhost:3000           # browser demo

Flags:
      --pr <ref>          PR number, owner/repo#N, or full GitHub URL
      --start <cmd>       command to start a dev server (for browser PR demos)
  -c, --cmd <command>     CLI command to demo
  -u, --url <url>         URL to demo (browser mode)
  -t, --title <text>      video title
  -o, --output <file>     output file (default: agentreel.mp4)
  -a, --auth <file>       Playwright storage state (cookies/auth) for browser demos
  -g, --guidelines <text>  guidelines for highlight generation (e.g. "focus on speed")
      --music <file>      path to background music mp3
      --no-share          skip the share prompt
  -h, --help              show help
  -v, --version           show version`);
}

// ── Recording + Highlights ──────────────────────────────────

function findPython() {
  const venvPython = join(ROOT, "scripts", ".venv", "bin", "python");
  if (existsSync(venvPython)) return venvPython;
  return "python3";
}

function ensureBrowserDeps() {
  const venvDir = join(ROOT, "scripts", ".venv");
  const venvPython = join(venvDir, "bin", "python");
  const browsersDir = join(venvDir, "playwright-browsers");

  if (existsSync(venvPython)) {
    try {
      execFileSync(venvPython, ["-c", "import playwright"], {
        stdio: "ignore",
      });
      return; // all good
    } catch {
      // playwright missing, install below
    }
  } else {
    console.error("  Setting up Python environment...");
    execFileSync("python3", ["-m", "venv", venvDir], {
      stdio: ["ignore", "inherit", "inherit"],
    });
  }

  const pip = join(venvDir, "bin", "pip");
  console.error("  Installing playwright...");
  execFileSync(pip, ["install", "-q", "playwright"], {
    stdio: ["ignore", "inherit", "inherit"],
  });

  console.error("  Installing Chromium (one-time, ~150MB)...");
  execFileSync(venvPython, ["-m", "playwright", "install", "chromium"], {
    stdio: ["ignore", "inherit", "inherit"],
    env: { ...process.env, PLAYWRIGHT_BROWSERS_PATH: browsersDir },
    cwd: tmpdir(),
  });
}

function recordCLI(command, workDir, context, guidelines) {
  const python = findPython();
  const script = join(ROOT, "scripts", "cli_demo.py");
  const outFile = join(tmpdir(), "agentreel-cli-demo.cast");

  const args = [script, command, workDir, outFile];
  if (context) args.push(context);
  if (guidelines) args.push(guidelines);

  console.error(`Agent planning CLI demo for: ${command}`);
  execFileSync(python, args, { stdio: ["ignore", "inherit", "inherit"], env: process.env });
  return outFile;
}

function extractHighlightsFromCast(castPath, context, guidelines) {
  const python = findPython();
  const script = join(ROOT, "scripts", "cli_demo.py");
  const outFile = castPath + "-highlights.json";

  const args = [script, "--highlights", castPath, outFile];
  if (context) args.push(context);
  if (guidelines) args.push(guidelines);

  execFileSync(python, args, { stdio: ["ignore", "inherit", "inherit"], env: process.env });
  return outFile;
}

// ── Browser Recording ───────────────────────────────────────

function browserEnv() {
  const browsersDir = join(ROOT, "scripts", ".venv", "playwright-browsers");
  return { ...process.env, PLAYWRIGHT_BROWSERS_PATH: browsersDir };
}

function recordBrowser(url, task, authState, guidelines) {
  const python = findPython();
  const script = join(ROOT, "scripts", "browser_demo.py");
  const outFile = join(tmpdir(), "agentreel-browser-demo.mp4");

  console.error(`Agent demoing browser app: ${url}`);
  const args = [script, url, outFile, task];
  if (authState) args.push("--auth", authState);
  if (guidelines) args.push("--guidelines", guidelines);
  execFileSync(python, args, {
    stdio: ["ignore", "inherit", "inherit"],
    env: browserEnv(),
    timeout: 300000,
  });
  return outFile;
}

function extractBrowserHighlights(videoPath, task) {
  const python = findPython();
  const script = join(ROOT, "scripts", "browser_demo.py");
  const outFile = videoPath + "-highlights.json";

  execFileSync(python, [script, "--highlights", videoPath, outFile, task], {
    stdio: ["ignore", "inherit", "inherit"],
    env: browserEnv(),
  });
  return outFile;
}

// ── Browser Highlight Builder ───────────────────────────────

function buildBrowserHighlights(clicks, videoPath, task, guidelines) {
  const CLIP_DUR = 7;
  const MIN_HIGHLIGHTS = 3;
  const MAX_HIGHLIGHTS = 4;
  // Ask Claude to generate labels/overlays based on the task
  let labels, overlays;
  try {
    const guidelinesLine = guidelines ? `\nGuidelines: ${guidelines}` : "";
    const genPrompt = `Generate exactly 4 highlight labels and overlay captions for a short browser demo video.
Task: ${task}${guidelinesLine}

Return a JSON object: {"labels": ["word1", "word2", "word3", "word4"], "overlays": ["**caption1**", "**caption2**", "**caption3**", "**caption4**"]}
Labels: 1-2 words each, specific to this app (not generic). Overlays: short punchy captions with **markdown bold** for emphasis. Return ONLY JSON.`;
    const result = execFileSync("claude", ["-p", genPrompt, "--output-format", "text"], {
      encoding: "utf-8", timeout: 30000, stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    const parsed = JSON.parse(result.replace(/```json?\n?/g, "").replace(/```/g, "").trim());
    labels = parsed.labels?.length >= 4 ? parsed.labels : null;
    overlays = parsed.overlays?.length >= 4 ? parsed.overlays : null;
  } catch { /* fall through */ }
  if (!labels) labels = ["Overview", "Interact", "Navigate", "Result"];
  if (!overlays) overlays = ["**First look**", "**Key action**", "**Exploring**", "**The result**"];

  // Estimate video duration from last click or default to 25s
  const lastClickTime = clicks.length > 0 ? clicks[clicks.length - 1].timeSec : 0;
  const videoDur = Math.max(25, lastClickTime + 5);

  // Build click-based highlights
  const clickHighlights = [];
  if (clicks.length >= 1) {
    // Group clicks that are within 3s of each other
    const clusters = [];
    let cluster = [clicks[0]];

    for (let i = 1; i < clicks.length; i++) {
      if (clicks[i].timeSec - cluster[cluster.length - 1].timeSec < 3) {
        cluster.push(clicks[i]);
      } else {
        clusters.push(cluster);
        cluster = [clicks[i]];
      }
    }
    clusters.push(cluster);

    // Take top clusters by density, sorted by time
    const ranked = clusters
      .map((c) => ({ cluster: c }))
      .sort((a, b) => b.cluster.length - a.cluster.length)
      .slice(0, MAX_HIGHLIGHTS)
      .sort((a, b) => a.cluster[0].timeSec - b.cluster[0].timeSec);

    for (const r of ranked) {
      const first = r.cluster[0];
      const last = r.cluster[r.cluster.length - 1];
      const center = (first.timeSec + last.timeSec) / 2;
      const startSec = Math.max(0, center - CLIP_DUR / 2);
      const endSec = startSec + CLIP_DUR;

      const hlClicks = r.cluster.map(c => ({
        x: Math.max(0, Math.min(1280, c.x)),
        y: Math.max(0, Math.min(800, c.y)),
        timeSec: c.timeSec - startSec,
      }));

      const focusX = hlClicks.reduce((s, c) => s + c.x, 0) / hlClicks.length / 1280;
      const focusY = hlClicks.reduce((s, c) => s + c.y, 0) / hlClicks.length / 800;

      clickHighlights.push({
        videoSrc: "browser-demo.mp4",
        videoStartSec: Math.round(startSec * 10) / 10,
        videoEndSec: Math.round(endSec * 10) / 10,
        focusX,
        focusY,
        clicks: hlClicks,
      });
    }
  }

  // Pad to MIN_HIGHLIGHTS with evenly-spaced filler clips
  const highlights = [...clickHighlights];
  if (highlights.length < MIN_HIGHLIGHTS) {
    // Find time gaps not covered by existing highlights
    const covered = highlights.map(h => [h.videoStartSec, h.videoEndSec]);
    const fillerCount = MIN_HIGHLIGHTS - highlights.length;

    // Divide full video into slots, pick uncovered ones
    const slotDur = videoDur / (fillerCount + covered.length + 1);
    for (let i = 0; i < fillerCount; i++) {
      const candidate = slotDur * (i + 1);
      // Skip if overlaps with existing highlight
      const overlaps = covered.some(([s, e]) => candidate >= s && candidate <= e);
      const startSec = overlaps
        ? Math.max(0, videoDur - CLIP_DUR * (fillerCount - i))
        : Math.max(0, candidate - CLIP_DUR / 2);
      highlights.push({
        videoSrc: "browser-demo.mp4",
        videoStartSec: Math.round(startSec * 10) / 10,
        videoEndSec: Math.round((startSec + CLIP_DUR) * 10) / 10,
      });
    }
  }

  // Sort by start time and assign labels
  highlights.sort((a, b) => a.videoStartSec - b.videoStartSec);
  for (let i = 0; i < highlights.length; i++) {
    highlights[i].label = labels[i % labels.length];
    highlights[i].overlay = overlays[i % overlays.length];
  }

  console.error(`  ${highlights.length} highlights (${clickHighlights.length} from clicks, ${highlights.length - clickHighlights.length} filler)`);
  return highlights;
}

// ── Render ──────────────────────────────────────────────────

async function renderVideo(props, output, musicPath) {
  const publicDir = join(ROOT, "public");
  if (!existsSync(publicDir)) mkdirSync(publicDir, { recursive: true });
  if (musicPath && existsSync(musicPath)) {
    copyFileSync(musicPath, join(publicDir, "music.mp3"));
  }

  const absOutput = resolve(output);
  const propsJSON = JSON.stringify(props);

  // Render using Remotion's Node.js API — no CLI binary needed
  const { bundle } = await import("@remotion/bundler");
  const { renderMedia, selectComposition } = await import("@remotion/renderer");

  const entryPoint = join(ROOT, "src", "index.ts");

  console.error("  Bundling...");
  const serveUrl = await bundle({
    entryPoint,
    webpackOverride: (config) => config,
  });

  console.error("  Preparing renderer...");
  const composition = await selectComposition({
    serveUrl,
    id: "CastVideo",
    inputProps: props,
    onBrowserDownload: () => {
      console.error("  Downloading renderer (one-time, ~90MB)...");
      return { onProgress: () => {} };
    },
  });

  console.error("  Rendering...");
  await renderMedia({
    composition,
    serveUrl,
    codec: "h264",
    outputLocation: absOutput,
    inputProps: props,
  });

  const size = statSync(absOutput).size;
  console.error(`\nDone: ${output} (${Math.round(size / 1024)} KB)`);
}

// ── Share ───────────────────────────────────────────────────

function askYesNo(question) {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stderr });
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase() !== "n");
    });
  });
}

async function shareFlow(outputPath, title, prompt) {
  const shouldShare = await askYesNo("Share to Twitter? [Y/n] ");
  if (!shouldShare) return;

  const name = title || "this";
  const desc = prompt || "";
  const text = desc
    ? `Introducing ${name} — ${desc}\n\nMade with https://github.com/islo-labs/agentreel`
    : `Introducing ${name}\n\nMade with https://github.com/islo-labs/agentreel`;
  const tweetText = encodeURIComponent(text);
  const intentURL = `https://twitter.com/intent/tweet?text=${tweetText}`;

  console.error(`\n  Opening Twitter — attach your video to the tweet.`);
  console.error(`  Video: ${resolve(outputPath)}\n`);

  const openCmd = process.platform === "darwin" ? "open" : "xdg-open";
  try {
    execFileSync(openCmd, [intentURL], { stdio: "ignore" });
  } catch {
    console.error(`  Link: ${intentURL}`);
  }
}

// ── PR Context ─────────────────────────────────────────────

function fetchPRContext(prRef) {
  try {
    execFileSync("gh", ["--version"], { stdio: "ignore" });
  } catch {
    console.error("Error: `gh` CLI is required for --pr mode. Install it from https://cli.github.com");
    process.exit(1);
  }

  const prJson = execFileSync("gh", [
    "pr", "view", String(prRef),
    "--json", "title,body,headRefName,baseRefName,url,number",
  ], { encoding: "utf-8", timeout: 30000 });
  const pr = JSON.parse(prJson);

  let diff = "";
  try {
    diff = execFileSync("gh", ["pr", "diff", String(prRef)], {
      encoding: "utf-8", timeout: 30000,
    });
  } catch (e) {
    console.error(`  Warning: could not fetch PR diff: ${e.message}`);
  }

  // Read README from cwd (the agent already has the repo checked out)
  let readme = "";
  for (const name of ["README.md", "readme.md", "README", "README.rst"]) {
    const p = join(process.cwd(), name);
    if (existsSync(p)) {
      readme = readFileSync(p, "utf-8");
      break;
    }
  }

  return { ...pr, diff, readme };
}

function planDemoFromPR(prContext, guidelines) {
  const guidelinesBlock = guidelines
    ? `\nAdditional guidelines: ${guidelines}`
    : "";

  const prompt = `You are planning a demo for a Pull Request. Your job is to decide whether this is a CLI or browser demo, and provide the details needed to record it.

PR Title: ${prContext.title}
PR Description: ${prContext.body || "(no description)"}

Diff (truncated):
${prContext.diff.slice(0, 8000)}

README (truncated):
${prContext.readme.slice(0, 3000)}${guidelinesBlock}

Return a JSON object with these fields:
{
  "type": "cli" or "browser",
  "command": "the command to run" (for CLI demos, e.g. "npx my-tool --help") or null,
  "url": "http://localhost:3000/relevant-page" (for browser demos) or null,
  "description": "one-sentence summary of what the PR does",
  "title": "short video title (2-4 words)",
  "guidelines": "specific instructions for the demo recorder about what steps to show and what to focus on"
}

Rules:
- If the PR changes a CLI tool, script, or backend logic that can be demonstrated in a terminal, use "cli".
- If the PR changes a web UI, frontend, or something best shown in a browser, use "browser".
- The "guidelines" field should tell the demo recorder exactly what to demonstrate — the specific feature or fix from this PR.
- The demo should show the actual changes working honestly, not market the product.
- Return ONLY the JSON object, no markdown fences.`;

  const result = execFileSync("claude", ["-p", prompt, "--output-format", "text"], {
    encoding: "utf-8",
    timeout: 60000,
    stdio: ["ignore", "pipe", "ignore"],
  }).trim();

  // Strip markdown fences if present
  let text = result;
  if (text.includes("```")) {
    const parts = text.split("```");
    for (let part of parts) {
      part = part.trim();
      if (part.startsWith("json")) part = part.slice(4).trim();
      if (part.startsWith("{")) { text = part; break; }
    }
  }

  return JSON.parse(text);
}

// ── Dev Server ─────────────────────────────────────────────

function startDevServer(command) {
  console.error(`  Starting dev server: ${command}`);
  const proc = spawn("sh", ["-c", command], {
    stdio: ["ignore", "pipe", "pipe"],
    detached: true,
  });

  // Wait for server to be ready (look for common ready signals in output)
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      console.error("  Dev server ready (timeout — assuming started)");
      resolve(proc);
    }, 30000);

    const onData = (data) => {
      const text = data.toString();
      if (/localhost|ready|started|listening|compiled/i.test(text)) {
        clearTimeout(timeout);
        // Give it a moment to fully start
        setTimeout(() => {
          console.error("  Dev server ready");
          resolve(proc);
        }, 2000);
      }
    };

    proc.stdout.on("data", onData);
    proc.stderr.on("data", onData);

    proc.on("error", (err) => {
      clearTimeout(timeout);
      reject(new Error(`Dev server failed to start: ${err.message}`));
    });

    proc.on("exit", (code) => {
      clearTimeout(timeout);
      if (code !== null && code !== 0) {
        reject(new Error(`Dev server exited with code ${code}`));
      }
    });
  });
}

function stopDevServer(proc) {
  if (!proc || proc.killed) return;
  try {
    // Kill the process group (detached process + children)
    process.kill(-proc.pid, "SIGTERM");
  } catch {
    try { proc.kill("SIGTERM"); } catch { /* already dead */ }
  }
}

// ── Main ────────────────────────────────────────────────────

async function main() {
  const flags = parseArgs();
  const output = flags.output || "agentreel.mp4";
  const noShare = flags.noShare;

  if (!flags.cmd && !flags.url && !flags.pr) {
    console.error("Please provide --pr, --cmd, or --url.\n");
    printUsage();
    process.exit(1);
  }

  // ── PR mode ──────────────────────────────────────────────
  if (flags.pr) {
    console.error("Fetching PR context...");
    const prContext = fetchPRContext(flags.pr);
    console.error(`  PR #${prContext.number}: ${prContext.title}`);

    console.error("Planning demo...");
    const plan = planDemoFromPR(prContext, flags.guidelines);
    console.error(`  Type: ${plan.type}, "${plan.description}"`);

    const videoTitle = flags.title || plan.title || prContext.title;
    const description = plan.description;
    // Prepend "demo" to guidelines so downstream scripts know to use chapter-based extraction
    const demoGuidelines = `[demo] ${plan.guidelines || ""}`.trim();

    if (plan.type === "browser") {
      const url = plan.url || "http://localhost:3000";
      let serverProc = null;

      try {
        if (flags.start) {
          serverProc = await startDevServer(flags.start);
        }

        ensureBrowserDeps();
        console.error("Step 1/3: Recording browser demo...");
        const videoPath = recordBrowser(url, demoGuidelines, flags.auth, demoGuidelines);

        const publicDir = join(ROOT, "public");
        if (!existsSync(publicDir)) mkdirSync(publicDir, { recursive: true });
        copyFileSync(videoPath, join(publicDir, "browser-demo.mp4"));

        console.error("Step 2/3: Building highlights...");
        const clicksPath = videoPath.replace(".mp4", "-clicks.json");
        let allClicks = [];
        if (existsSync(clicksPath)) {
          allClicks = JSON.parse(readFileSync(clicksPath, "utf-8"));
          console.error(`  ${allClicks.length} clicks captured`);
        }
        const highlights = buildBrowserHighlights(allClicks, videoPath, demoGuidelines, demoGuidelines);

        console.error("Step 3/3: Rendering video...");
        await renderVideo({
          title: videoTitle,
          subtitle: description,
          highlights,
          endText: prContext.title,
          endUrl: prContext.url,
          mode: "demo",
        }, output, flags.music);
      } finally {
        stopDevServer(serverProc);
      }
    } else {
      // CLI demo
      if (!plan.command) {
        console.error("Error: Claude could not determine a command to demo for this PR.");
        process.exit(1);
      }

      console.error("Step 1/3: Recording CLI demo...");
      const castPath = recordCLI(plan.command, process.cwd(), description, demoGuidelines);

      console.error("Step 2/3: Extracting highlights...");
      const highlightsPath = extractHighlightsFromCast(castPath, description, demoGuidelines);
      const highlights = JSON.parse(readFileSync(highlightsPath, "utf-8"));
      console.error(`  ${highlights.length} highlights extracted`);

      console.error("Step 3/3: Rendering video...");
      await renderVideo({
        title: videoTitle,
        subtitle: description,
        highlights,
        endText: plan.command,
        endUrl: prContext.url,
        mode: "demo",
      }, output, flags.music);
    }

    if (!noShare) {
      await shareFlow(resolve(output), videoTitle, description);
    }
    return;
  }

  // ── Manual modes (--cmd / --url) ─────────────────────────
  let videoTitle = flags.title || flags.cmd || flags.url;

  if (flags.cmd) {
    console.error("Step 1/3: Recording CLI demo...");
    const castPath = recordCLI(flags.cmd, process.cwd(), flags.cmd, flags.guidelines);

    console.error("Step 2/3: Extracting highlights...");
    const highlightsPath = extractHighlightsFromCast(castPath, flags.cmd, flags.guidelines);
    const highlights = JSON.parse(readFileSync(highlightsPath, "utf-8"));
    console.error(`  ${highlights.length} highlights extracted`);

    console.error("Step 3/3: Rendering video...");
    await renderVideo({
      title: videoTitle,
      highlights,
      endText: flags.cmd,
    }, output, flags.music);

    if (!noShare) {
      await shareFlow(resolve(output), videoTitle, flags.cmd);
    }
    return;
  }

  if (flags.url) {
    const task = "Explore the main features of this app";

    ensureBrowserDeps();
    console.error("Step 1/3: Recording browser demo...");
    const videoPath = recordBrowser(flags.url, task, flags.auth, flags.guidelines);

    const publicDir = join(ROOT, "public");
    if (!existsSync(publicDir)) mkdirSync(publicDir, { recursive: true });
    copyFileSync(videoPath, join(publicDir, "browser-demo.mp4"));

    console.error("Step 2/3: Building highlights...");
    const clicksPath = videoPath.replace(".mp4", "-clicks.json");
    let allClicks = [];
    if (existsSync(clicksPath)) {
      allClicks = JSON.parse(readFileSync(clicksPath, "utf-8"));
      console.error(`  ${allClicks.length} clicks captured`);
    }
    const highlights = buildBrowserHighlights(allClicks, videoPath, task, flags.guidelines);

    console.error("Step 3/3: Rendering video...");
    await renderVideo({
      title: videoTitle,
      highlights,
      endText: flags.url,
      endUrl: flags.url,
    }, output, flags.music);

    if (!noShare) {
      await shareFlow(resolve(output), videoTitle, flags.url);
    }
    return;
  }
}

main();
