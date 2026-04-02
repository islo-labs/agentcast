#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, statSync, existsSync, mkdirSync, copyFileSync, createReadStream } from "node:fs";
import { join, dirname, basename, resolve } from "node:path";
import { homedir, tmpdir } from "node:os";
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
    if (arg === "--version" || arg === "-v") { console.log("0.1.0"); process.exit(0); }
    if (arg === "--cmd" || arg === "-c") flags.cmd = args[++i];
    else if (arg === "--url" || arg === "-u") flags.url = args[++i];
    else if (arg === "--prompt" || arg === "-p") flags.prompt = args[++i];
    else if (arg === "--title" || arg === "-t") flags.title = args[++i];
    else if (arg === "--output" || arg === "-o") flags.output = args[++i];
    else if (arg === "--music") flags.music = args[++i];
    else if (arg === "--session") flags.session = args[++i];
    else if (arg === "--no-share") flags.noShare = true;
  }
  return flags;
}

function printUsage() {
  console.log(`agentcast — Turn Claude Code sessions into viral demo videos

Usage:
  agentcast                                          # auto-detect from session
  agentcast --cmd "npx @islo-labs/overtime"           # manual CLI demo
  agentcast --url http://localhost:3000               # manual browser demo

Flags:
  -c, --cmd <command>     CLI command to demo
  -u, --url <url>         URL to demo (browser mode)
  -p, --prompt <text>     description of what the tool does
  -t, --title <text>      video title
  -o, --output <file>     output file (default: agentcast.mp4)
      --music <file>      path to background music mp3
      --session <file>    path to Claude Code session .jsonl
      --no-share          skip the share prompt
  -h, --help              show help
  -v, --version           show version`);
}

// ── Session parser ──────────────────────────────────────────

function findLatestSession() {
  const cwd = process.cwd();
  const projectKey = cwd.replaceAll("/", "-");
  const projectDir = join(homedir(), ".claude", "projects", projectKey);

  if (!existsSync(projectDir)) return null;

  let newest = null;
  let newestTime = 0;
  for (const entry of readdirSync(projectDir)) {
    if (!entry.endsWith(".jsonl")) continue;
    const full = join(projectDir, entry);
    const mtime = statSync(full).mtimeMs;
    if (mtime > newestTime) { newestTime = mtime; newest = full; }
  }
  return newest;
}

function parseSession(path) {
  const lines = readFileSync(path, "utf-8").split("\n").filter(Boolean);
  const session = { prompt: "", title: "", actions: [], startTime: null, endTime: null };

  for (const line of lines) {
    let obj;
    try { obj = JSON.parse(line); } catch { continue; }

    const ts = obj.timestamp ? new Date(obj.timestamp) : null;
    if (ts && !isNaN(ts)) {
      if (!session.startTime || ts < session.startTime) session.startTime = ts;
      if (!session.endTime || ts > session.endTime) session.endTime = ts;
    }

    if (obj.type === "user" && !session.prompt) {
      session.prompt = extractPrompt(obj);
    }
    if (obj.type === "custom-title" && obj.customTitle) {
      session.title = obj.customTitle;
    }
    if (obj.type === "assistant") {
      const content = obj.message?.content;
      if (!Array.isArray(content)) continue;
      for (const block of content) {
        if (block.type !== "tool_use") continue;
        const action = parseToolUse(block.name, block.input, ts);
        if (action) session.actions.push(action);
      }
    }
  }

  session.actions.sort((a, b) => (a.time || 0) - (b.time || 0));
  if (session.startTime && session.endTime) {
    session.durationMs = session.endTime - session.startTime;
  }
  return session;
}

function extractPrompt(obj) {
  const content = obj.message?.content;
  if (typeof content === "string") return cleanPrompt(content);
  if (Array.isArray(content)) {
    for (const block of content) {
      if (block.type === "text" && block.text) return cleanPrompt(block.text);
    }
  }
  return "";
}

function cleanPrompt(s) {
  for (const line of s.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || /^[│├└─┌┐]/.test(trimmed)) continue;
    return trimmed.slice(0, 200);
  }
  return s.slice(0, 200);
}

function parseToolUse(name, input, ts) {
  if (!input) return null;
  switch (name) {
    case "Read": return { type: "read", filePath: input.file_path, time: ts };
    case "Write": return { type: "write", filePath: input.file_path, size: input.content?.length || 0, time: ts };
    case "Edit": return { type: "edit", filePath: input.file_path, time: ts };
    case "Bash": return { type: "bash", command: input.command, time: ts };
    case "Grep": case "Glob": return { type: "search", time: ts };
    case "Agent": return { type: "agent", time: ts };
    default: return null;
  }
}

// ── Detection ───────────────────────────────────────────────

function detectResult(session) {
  const containsAny = (s, ...subs) => subs.some(sub => s.includes(sub));

  for (const a of session.actions) {
    if (a.type === "bash") {
      const cmd = (a.command || "").toLowerCase();
      if (containsAny(cmd, "npm run dev", "npm start", "npx next", "npx vite", "yarn dev", "pnpm dev", "flask run", "uvicorn")) {
        const url = extractURL(a.command) || "http://localhost:3000";
        return { type: "browser", command: url };
      }
    }
  }

  for (const a of session.actions) {
    if ((a.type === "write" || a.type === "edit") && a.filePath?.endsWith("package.json")) {
      try {
        const pkg = JSON.parse(readFileSync(a.filePath, "utf-8"));
        if (pkg.bin && pkg.name) return { type: "cli", command: `npx ${pkg.name} --help` };
      } catch { /* skip */ }
    }
  }

  for (const a of session.actions) {
    if (a.type === "bash" && a.command?.includes("go build")) {
      const parts = a.command.split(/\s+/);
      const oIdx = parts.indexOf("-o");
      if (oIdx !== -1 && parts[oIdx + 1]) return { type: "cli", command: `${parts[oIdx + 1]} --help` };
    }
  }

  for (let i = session.actions.length - 1; i >= 0; i--) {
    const a = session.actions[i];
    if (a.type !== "bash") continue;
    const cmd = (a.command || "").trim();
    if (containsAny(cmd, "go build", "go test", "npm install", "npm test", "git ", "mkdir", "ls ", "cat ")) continue;
    if (containsAny(cmd, "npx ", "./bin/", "./dist/", "go run", "python ", "node ")) {
      return { type: "cli", command: cmd };
    }
  }

  return { type: "unknown" };
}

function extractURL(cmd) {
  for (const part of (cmd || "").split(/\s+/)) {
    if (part.includes("localhost:")) return part.startsWith("http") ? part : `http://${part}`;
  }
  return null;
}

// ── Recording + Highlights ──────────────────────────────────

function findPython() {
  const venvPython = join(ROOT, "scripts", ".venv", "bin", "python");
  if (existsSync(venvPython)) return venvPython;
  return "python3";
}

function recordCLI(command, workDir, context) {
  const python = findPython();
  const script = join(ROOT, "scripts", "cli_demo.py");
  const outFile = join(tmpdir(), "agentcast-cli-demo.cast");

  const args = [script, command, workDir, outFile];
  if (context) args.push(context);

  console.error(`Agent planning CLI demo for: ${command}`);
  execFileSync(python, args, { stdio: ["ignore", "inherit", "inherit"], env: process.env });
  return outFile;
}

function extractHighlightsFromCast(castPath, context) {
  const python = findPython();
  const script = join(ROOT, "scripts", "cli_demo.py");
  const outFile = castPath + "-highlights.json";

  const args = [script, "--highlights", castPath, outFile];
  if (context) args.push(context);

  execFileSync(python, args, { stdio: ["ignore", "inherit", "inherit"], env: process.env });
  return outFile;
}

// ── Render ──────────────────────────────────────────────────

function renderVideo(props, output, musicPath) {
  const publicDir = join(ROOT, "public");
  if (!existsSync(publicDir)) mkdirSync(publicDir, { recursive: true });
  if (musicPath && existsSync(musicPath)) {
    copyFileSync(musicPath, join(publicDir, "music.mp3"));
  }

  const absOutput = resolve(output);
  const propsJSON = JSON.stringify(props);
  const remotion = join(ROOT, "node_modules", ".bin", "remotion");

  execFileSync(remotion, ["render", "CastVideo", absOutput, "--props", propsJSON], {
    cwd: ROOT,
    stdio: ["ignore", "inherit", "inherit"],
  });

  const size = statSync(absOutput).size;
  console.error(`\nDone: ${output} (${Math.round(size / 1024)} KB)`);
}

// ── Upload + Share ──────────────────────────────────────────

async function uploadToStreamable(filePath) {
  const { FormData, File } = await import("node:buffer")
    .then(() => globalThis)
    .catch(() => globalThis);

  const fileBuffer = readFileSync(filePath);
  const fileName = basename(filePath);

  // Use multipart form upload via fetch
  const boundary = "----agentcast" + Date.now();
  const CRLF = "\r\n";

  const header = [
    `--${boundary}`,
    `Content-Disposition: form-data; name="file"; filename="${fileName}"`,
    "Content-Type: video/mp4",
    "",
  ].join(CRLF);

  const footer = `${CRLF}--${boundary}--${CRLF}`;

  const headerBuf = Buffer.from(header + CRLF);
  const footerBuf = Buffer.from(footer);
  const body = Buffer.concat([headerBuf, fileBuffer, footerBuf]);

  const resp = await fetch("https://api.streamable.com/upload", {
    method: "POST",
    headers: {
      "Content-Type": `multipart/form-data; boundary=${boundary}`,
    },
    body,
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Streamable upload failed (${resp.status}): ${text}`);
  }

  const data = await resp.json();
  return `https://streamable.com/${data.shortcode}`;
}

function openShareURL(videoURL, text) {
  const tweetText = encodeURIComponent(text);
  const encodedURL = encodeURIComponent(videoURL);
  const intentURL = `https://twitter.com/intent/tweet?text=${tweetText}&url=${encodedURL}`;

  console.error(`\n  Share: ${videoURL}`);
  console.error(`  Tweet: ${intentURL}\n`);

  // Open in browser
  const cmd = process.platform === "darwin" ? "open" : "xdg-open";
  try {
    execFileSync(cmd, [intentURL], { stdio: "ignore" });
  } catch {
    console.error("  (Could not open browser — copy the link above)");
  }
}

function askYesNo(question) {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stderr });
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase() !== "n");
    });
  });
}

async function shareFlow(outputPath, title) {
  const shouldShare = await askYesNo("Share to Twitter? [Y/n] ");
  if (!shouldShare) return;

  console.error("Uploading to Streamable...");
  try {
    const url = await uploadToStreamable(outputPath);
    const text = `${title}\n\nMade with @agentcast`;
    openShareURL(url, text);
  } catch (err) {
    console.error(`Upload failed: ${err.message}`);
    console.error("You can manually upload the video and share it.");
  }
}

// ── Main ────────────────────────────────────────────────────

async function main() {
  const flags = parseArgs();
  const output = flags.output || "agentcast.mp4";
  const noShare = flags.noShare;

  let demoCmd = flags.cmd;
  let demoURL = flags.url;
  let prompt = flags.prompt;

  // Auto-detect from Claude session if no manual flags
  if (!demoCmd && !demoURL) {
    const sessionPath = flags.session || findLatestSession();
    if (!sessionPath) {
      console.error("No session found and no --cmd or --url provided.\n");
      printUsage();
      process.exit(1);
    }

    console.error(`Reading session: ${basename(sessionPath)}`);
    const session = parseSession(sessionPath);
    if (!prompt) prompt = session.prompt;

    const detected = detectResult(session);
    if (detected.type === "cli") {
      demoCmd = detected.command;
      console.error(`Detected CLI: ${demoCmd}`);
    } else if (detected.type === "browser") {
      demoURL = detected.command;
      console.error(`Detected browser: ${demoURL}`);
    } else {
      console.error("Couldn't detect what was built. Use --cmd or --url.");
      process.exit(1);
    }
  }

  let videoTitle = flags.title || demoCmd || demoURL;

  if (demoCmd) {
    console.error("Step 1/3: Recording CLI demo...");
    const castPath = recordCLI(demoCmd, process.cwd(), prompt);

    console.error("Step 2/3: Extracting highlights...");
    const highlightsPath = extractHighlightsFromCast(castPath, prompt);
    const highlights = JSON.parse(readFileSync(highlightsPath, "utf-8"));
    console.error(`  ${highlights.length} highlights extracted`);

    console.error("Step 3/3: Rendering video...");
    renderVideo({
      title: videoTitle,
      subtitle: prompt,
      highlights,
      endText: demoCmd,
    }, output, flags.music);

    if (!noShare) {
      await shareFlow(resolve(output), videoTitle);
    }
    return;
  }

  if (demoURL) {
    console.error("Browser demo coming soon.");
    process.exit(1);
  }
}

main();
