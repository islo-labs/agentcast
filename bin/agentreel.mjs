#!/usr/bin/env node

import { execFileSync, spawnSync, spawn } from "node:child_process";
import { readFileSync, writeFileSync, statSync, existsSync, mkdirSync, copyFileSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline";
import vm from "node:vm";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

// ── Helpers ────────────────────────────────────────────────

function claude(prompt, timeout = 300000) {
  const result = execFileSync("claude", ["-p", prompt, "--output-format", "text"], {
    encoding: "utf-8", timeout, stdio: ["ignore", "pipe", "ignore"],
  }).trim();
  return stripFences(result);
}

function stripFences(text) {
  if (!text.includes("```")) return text;
  for (let part of text.split("```")) {
    part = part.trim();
    if (part.startsWith("json")) part = part.slice(4).trim();
    if (part.startsWith("[") || part.startsWith("{")) return part;
  }
  return text;
}

function parseJSON(text, fallback) {
  try { return JSON.parse(text); }
  catch { return fallback; }
}

// ── CLI flags ──────────────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2);
  const flags = {};
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--help" || a === "-h") { printUsage(); process.exit(0); }
    if (a === "--version" || a === "-v") {
      console.log(JSON.parse(readFileSync(join(ROOT, "package.json"), "utf-8")).version);
      process.exit(0);
    }
    if (a === "--cmd" || a === "-c") flags.cmd = args[++i];
    else if (a === "--url" || a === "-u") flags.url = args[++i];
    else if (a === "--pr") flags.pr = args[++i];
    else if (a === "--start") flags.start = args[++i];
    else if (a === "--title" || a === "-t") flags.title = args[++i];
    else if (a === "--subtitle" || a === "-s") flags.subtitle = args[++i];
    else if (a === "--output" || a === "-o") flags.output = args[++i];
    else if (a === "--music") flags.music = args[++i];
    else if (a === "--auth" || a === "-a") flags.auth = args[++i];
    else if (a === "--guidelines" || a === "-g") flags.guidelines = args[++i];
    else if (a === "--no-share") flags.noShare = true;
  }
  return flags;
}

function printUsage() {
  console.log(`agentreel — Turn your apps into demo videos

Usage:
  agentreel --pr 123                        # demo a PR
  agentreel --cmd "npx my-tool"             # CLI demo
  agentreel --url http://localhost:3000      # browser demo

Flags:
      --pr <ref>        PR number, owner/repo#N, or GitHub URL
      --start <cmd>     start a dev server for browser PR demos
  -c, --cmd <cmd>       CLI command to demo
  -u, --url <url>       URL to demo (browser mode)
  -t, --title <text>    video title
  -s, --subtitle <text> video subtitle
  -o, --output <file>   output file (default: agentreel.mp4)
  -a, --auth <file>     Playwright auth state for browser demos
  -g, --guidelines <t>  highlight generation guidelines
      --music <file>    background music mp3
      --no-share        skip the share prompt`);
}

// ── PR Context ─────────────────────────────────────────────

function fetchPRContext(prRef) {
  try { execFileSync("gh", ["--version"], { stdio: "ignore" }); }
  catch {
    console.error("Error: `gh` CLI required for --pr mode. Install from https://cli.github.com");
    process.exit(1);
  }
  const pr = JSON.parse(execFileSync("gh", [
    "pr", "view", String(prRef), "--json", "title,body,headRefName,url,number",
  ], { encoding: "utf-8", timeout: 30000 }));

  let diff = "";
  try { diff = execFileSync("gh", ["pr", "diff", String(prRef)], { encoding: "utf-8", timeout: 30000 }); }
  catch {}

  let readme = "";
  for (const name of ["README.md", "readme.md", "README"]) {
    const p = join(process.cwd(), name);
    if (existsSync(p)) { readme = readFileSync(p, "utf-8"); break; }
  }
  return { ...pr, diff, readme };
}

function planDemoFromPR(prContext, guidelines) {
  const extra = guidelines ? `\nAdditional guidelines: ${guidelines}` : "";
  const result = claude(`You are planning a demo for a Pull Request.

PR Title: ${prContext.title}
PR Description: ${prContext.body || "(none)"}

Diff (truncated):
${prContext.diff.slice(0, 8000)}

README (truncated):
${prContext.readme.slice(0, 3000)}${extra}

Return JSON: {"type":"cli"|"browser", "command":"..." or null, "url":"..." or null, "description":"one sentence", "title":"2-4 words", "guidelines":"what to demo"}
Show actual changes honestly. Return ONLY JSON.`);
  return parseJSON(result, { type: "cli", command: prContext.title, description: prContext.title, title: prContext.title, guidelines: "" });
}

// ── CLI Demo ───────────────────────────────────────────────

function planDemoSteps(command, context, guidelines) {
  const extra = guidelines ? `\nIMPORTANT guidelines:\n${guidelines}` : "";
  const result = claude(`Plan a terminal demo for: ${command}
Context: ${context}${extra}

Return a JSON array of steps. Each: {"type":"command", "value":"shell command", "delay":1, "description":"what it does"}
5-8 steps, realistic shell commands only. Return ONLY JSON.`);
  return parseJSON(result, [{ type: "command", value: command, delay: 1, description: "Run" }]);
}

function executeSteps(steps, workDir) {
  const outputs = [];
  for (const step of steps) {
    if (step.type !== "command") continue;
    console.error(`  $ ${step.value}`);
    const result = spawnSync("sh", ["-c", step.value], {
      cwd: workDir, encoding: "utf-8", timeout: 15000,
      env: { ...process.env, PS1: "$ ", TERM: "dumb" },
    });
    outputs.push({
      command: step.value,
      description: step.description || "",
      stdout: (result.stdout || "").slice(0, 2000),
      stderr: (result.stderr || "").slice(0, 500),
    });
  }
  return outputs;
}

function extractHighlights(outputs, context, guidelines, isDemo) {
  const session = outputs.map(o =>
    `$ ${o.command}\n${o.stdout}${o.stderr ? `\n(stderr: ${o.stderr})` : ""}`
  ).join("\n\n");

  const extra = guidelines ? `\nGuidelines: ${guidelines}` : "";
  const outputBlock = session.trim()
    ? `Terminal output:\n---\n${session.slice(0, 6000)}\n---`
    : "(No terminal output captured — generate representative output from context.)";

  let prompt;
  if (isDemo) {
    prompt = `Create chapter-based highlights for a demo video.
${outputBlock}

Context: ${context}${extra}

Return JSON array. Each: {"label":"Chapter Name", "lines":[{"text":"...", "isPrompt":true|false, "color":"#hex", "bold":true|false, "dim":true|false}]}
4-6 chapters, 12-20 lines each. Show complete commands + output.
Colors: green="#50fa7b" yellow="#f1fa8c" purple="#bd93f9" red="#ff5555" dim="#6272a4" white="#f8f8f2"
Return ONLY JSON array.`;
  } else {
    prompt = `Create highlights for a CLI demo video.
${outputBlock}

Context: ${context}${extra}

Return JSON array. Each: {"label":"Name", "lines":[{"text":"...", "isPrompt":true|false, "color":"#hex", "bold":true|false, "dim":true|false}]}
3-4 highlights, 4-8 lines each.
Colors: green="#50fa7b" yellow="#f1fa8c" purple="#bd93f9" red="#ff5555" dim="#6272a4" white="#f8f8f2"
Return ONLY JSON array.`;
  }

  const result = parseJSON(claude(prompt), null);
  if (result) return result;

  console.error("  Retrying highlight extraction...");
  const retry = parseJSON(claude(`Generate ${isDemo ? 4 : 3} terminal highlights as JSON.
Context: ${context}
Each: {"label":"Name", "lines":[{"text":"cmd", "isPrompt":true}, {"text":"output", "color":"#50fa7b"}]}
8-15 lines per highlight. Return ONLY JSON array.`), null);
  if (retry) return retry;

  return [{ label: "Run", lines: [
    { text: context || "demo", isPrompt: true },
    { text: "  Done.", color: "#50fa7b" },
  ]}];
}

// ── Browser Demo ───────────────────────────────────────────

async function ensurePlaywright() {
  try {
    await import("playwright");
  } catch {
    console.error("Installing playwright...");
    execFileSync("npm", ["install", "--no-save", "playwright"], {
      cwd: ROOT, stdio: ["ignore", "inherit", "inherit"],
    });
  }
}

async function recordBrowser(url, task, authState, guidelines) {
  const { chromium } = await import("playwright");
  const fs = await import("node:fs");
  const { mkdtemp } = await import("node:fs/promises");
  const videoDir = await mkdtemp(join(tmpdir(), "agentreel-"));
  const outFile = join(tmpdir(), "agentreel-browser-demo.mp4");

  console.error(`  Recording ${url}...`);

  const extra = guidelines ? `\nGuidelines: ${guidelines}` : "";
  const scriptCode = claude(`Generate a Playwright JS async function body that demos ${url}.
Task: ${task}${extra}
The code will run inside: async (page) => { YOUR_CODE_HERE }
Navigate, click buttons, fill forms, scroll. ~20 seconds total.
Add await page.waitForTimeout(1500) between actions.
Use timeout:5000, force:true on clicks. Wrap actions in try/catch.
Return ONLY the function body, no function declaration, no imports.`);

  const recordingStartMs = Date.now();
  const browser = await chromium.launch({ headless: true });
  const ctxOpts = {
    viewport: { width: 1280, height: 800 },
    recordVideo: { dir: videoDir, size: { width: 1280, height: 800 } },
  };
  if (authState && existsSync(authState)) ctxOpts.storageState = authState;
  const context = await browser.newContext(ctxOpts);

  await context.addInitScript(`
    if (!window.__clicks) {
      window.__clicks = [];
      document.addEventListener('click', e => {
        window.__clicks.push({ x: e.clientX, y: e.clientY, timestamp: Date.now() - ${recordingStartMs} });
      }, true);
    }
  `);

  const page = await context.newPage();
  try { await page.goto(url, { waitUntil: "networkidle", timeout: 15000 }); }
  catch { await page.goto(url, { timeout: 15000 }); }
  await page.waitForTimeout(1000);

  // Run the generated demo script in a sandboxed VM context
  try {
    const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
    const demoFn = new AsyncFunction("page", scriptCode);
    await demoFn(page);
  } catch (e) {
    console.error(`  Demo script error: ${e.message}`);
    await page.waitForTimeout(3000);
  }

  let clicks = [];
  try {
    const raw = await page.evaluate("window.__clicks || []");
    clicks = raw.map(c => ({ x: c.x, y: c.y, timeSec: Math.round(c.timestamp / 100) / 10 }));
  } catch {}

  await page.close();
  await context.close();
  await browser.close();

  const files = fs.readdirSync(videoDir);
  const webm = files.find(f => f.endsWith(".webm"));
  if (webm) {
    try {
      spawnSync("ffmpeg", ["-y", "-i", join(videoDir, webm), "-c:v", "libx264", "-preset", "fast", "-crf", "23", outFile], { timeout: 60000 });
    } catch {
      fs.copyFileSync(join(videoDir, webm), outFile.replace(".mp4", ".webm"));
    }
  }

  return { videoPath: outFile, clicks };
}

function buildBrowserHighlights(clicks, task, guidelines) {
  const CLIP_DUR = 7, MIN = 3, MAX = 4;
  let labels, overlays;
  try {
    const result = claude(`Generate 4 highlight labels and overlays for a browser demo.
Task: ${task}${guidelines ? `\nGuidelines: ${guidelines}` : ""}
Return JSON: {"labels":["w1","w2","w3","w4"], "overlays":["**c1**","**c2**","**c3**","**c4**"]}
Labels: 1-2 words. Overlays: short with **bold**. Return ONLY JSON.`, 30000);
    const parsed = parseJSON(result, {});
    labels = parsed.labels?.length >= 4 ? parsed.labels : null;
    overlays = parsed.overlays?.length >= 4 ? parsed.overlays : null;
  } catch {}
  if (!labels) labels = ["Overview", "Interact", "Navigate", "Result"];
  if (!overlays) overlays = ["**First look**", "**Key action**", "**Exploring**", "**The result**"];

  const lastClick = clicks.length > 0 ? clicks[clicks.length - 1].timeSec : 0;
  const videoDur = Math.max(25, lastClick + 5);

  const highlights = [];
  if (clicks.length >= 1) {
    const clusters = []; let cluster = [clicks[0]];
    for (let i = 1; i < clicks.length; i++) {
      if (clicks[i].timeSec - cluster[cluster.length - 1].timeSec < 3) cluster.push(clicks[i]);
      else { clusters.push(cluster); cluster = [clicks[i]]; }
    }
    clusters.push(cluster);
    const ranked = clusters.sort((a, b) => b.length - a.length).slice(0, MAX).sort((a, b) => a[0].timeSec - b[0].timeSec);
    for (const c of ranked) {
      const center = (c[0].timeSec + c[c.length - 1].timeSec) / 2;
      const start = Math.max(0, center - CLIP_DUR / 2);
      const hlClicks = c.map(k => ({ x: Math.min(1280, Math.max(0, k.x)), y: Math.min(800, Math.max(0, k.y)), timeSec: k.timeSec - start }));
      highlights.push({
        videoSrc: "browser-demo.mp4",
        videoStartSec: Math.round(start * 10) / 10,
        videoEndSec: Math.round((start + CLIP_DUR) * 10) / 10,
        focusX: hlClicks.reduce((s, c) => s + c.x, 0) / hlClicks.length / 1280,
        focusY: hlClicks.reduce((s, c) => s + c.y, 0) / hlClicks.length / 800,
        clicks: hlClicks,
      });
    }
  }

  while (highlights.length < MIN) {
    const slot = videoDur * (highlights.length + 1) / (MIN + 1);
    const start = Math.max(0, slot - CLIP_DUR / 2);
    highlights.push({ videoSrc: "browser-demo.mp4", videoStartSec: Math.round(start * 10) / 10, videoEndSec: Math.round((start + CLIP_DUR) * 10) / 10 });
  }

  highlights.sort((a, b) => a.videoStartSec - b.videoStartSec);
  highlights.forEach((h, i) => { h.label = labels[i % labels.length]; h.overlay = overlays[i % overlays.length]; });
  return highlights;
}

// ── SVG Fallback ───────────────────────────────────────────

function escSvg(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function renderSVG(props, output) {
  const FONT = '"SF Mono", "Fira Code", monospace';
  const SANS = '-apple-system, system-ui, sans-serif';
  const W = props.mode === "demo" ? 1200 : 700;
  const PAD = 32, LINE_H = 22, TERM_PAD = 16, BAR_H = 36, GAP = 28, FS = 13;

  let y = PAD, blocks = "";
  blocks += `<text x="${W / 2}" y="${y + 28}" font-family="${escSvg(SANS)}" font-size="32" font-weight="800" fill="#f8f8f2" text-anchor="middle">${escSvg(props.title)}</text>`;
  y += props.subtitle ? 68 : 56;
  if (props.subtitle) blocks += `<text x="${W / 2}" y="${y - 22}" font-family="${escSvg(SANS)}" font-size="16" fill="#6272a4" text-anchor="middle">${escSvg(props.subtitle)}</text>`;

  for (const hl of props.highlights) {
    if (!hl.lines?.length) continue;
    blocks += `<text x="${PAD}" y="${y + 14}" font-family="${escSvg(FONT)}" font-size="11" fill="#50fa7b" letter-spacing="2">${escSvg(hl.label.toUpperCase())}</text>`;
    y += 24;
    const bodyH = TERM_PAD * 2 + hl.lines.length * LINE_H;
    blocks += `<rect x="${PAD}" y="${y}" width="${W - PAD * 2}" height="${BAR_H + bodyH}" rx="8" fill="#1e1f29"/>`;
    blocks += `<circle cx="${PAD + 16}" cy="${y + BAR_H / 2}" r="5" fill="#ff5555"/><circle cx="${PAD + 34}" cy="${y + BAR_H / 2}" r="5" fill="#f1fa8c"/><circle cx="${PAD + 52}" cy="${y + BAR_H / 2}" r="5" fill="#50fa7b"/>`;
    blocks += `<rect x="${PAD}" y="${y + BAR_H}" width="${W - PAD * 2}" height="${bodyH}" fill="#282a36"/>`;
    let ly = y + BAR_H + TERM_PAD;
    for (const line of hl.lines) {
      const color = line.dim ? "#6272a4" : line.color || "#f8f8f2";
      const prefix = line.isPrompt ? `<tspan fill="#50fa7b">$ </tspan>` : "";
      const text = line.isPrompt ? line.text.replace(/^\$\s*/, "") : line.text;
      blocks += `<text x="${PAD + TERM_PAD}" y="${ly + FS}" font-family="${escSvg(FONT)}" font-size="${FS}" font-weight="${line.bold ? 700 : 400}" fill="${color}">${prefix}${escSvg(text)}</text>`;
      ly += LINE_H;
    }
    y += BAR_H + bodyH + GAP;
  }
  if (props.endUrl) { blocks += `<text x="${W / 2}" y="${y + 16}" font-family="${escSvg(SANS)}" font-size="14" fill="#6272a4" text-anchor="middle">${escSvg(props.endUrl)}</text>`; y += 28; }
  y += PAD;

  writeFileSync(output, `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${y}" viewBox="0 0 ${W} ${y}"><rect width="${W}" height="${y}" fill="#0f0f1a"/>${blocks}</svg>`);
  console.error(`\nDone: ${output} (SVG)`);
}

// ── Video Render ───────────────────────────────────────────

async function renderVideo(props, output, musicPath) {
  const publicDir = join(ROOT, "public");
  if (!existsSync(publicDir)) mkdirSync(publicDir, { recursive: true });
  if (musicPath && existsSync(musicPath)) copyFileSync(musicPath, join(publicDir, "music.mp3"));

  const { bundle } = await import("@remotion/bundler");
  const { renderMedia, selectComposition } = await import("@remotion/renderer");

  console.error("  Bundling...");
  const serveUrl = await bundle({ entryPoint: join(ROOT, "src", "index.ts"), webpackOverride: c => c });

  console.error("  Preparing renderer...");
  const composition = await selectComposition({
    serveUrl, id: "CastVideo", inputProps: props,
    onBrowserDownload: () => { console.error("  Downloading renderer (~90MB)..."); return { onProgress: () => {} }; },
  });

  console.error("  Rendering...");
  await renderMedia({ composition, serveUrl, codec: "h264", outputLocation: resolve(output), inputProps: props });
  console.error(`\nDone: ${output} (${Math.round(statSync(resolve(output)).size / 1024)} KB)`);
}

async function render(props, output, musicPath) {
  try { await renderVideo(props, output, musicPath); }
  catch (e) {
    console.error(`  Video rendering failed: ${e.message}`);
    const svg = output.replace(/\.[^.]+$/, ".svg");
    console.error(`  Falling back to SVG: ${svg}`);
    renderSVG(props, svg);
  }
}

// ── Share ──────────────────────────────────────────────────

async function shareFlow(outputPath, title, desc) {
  const rl = createInterface({ input: process.stdin, output: process.stderr });
  const answer = await new Promise(r => rl.question("Share to Twitter? [Y/n] ", a => { rl.close(); r(a); }));
  if (answer.trim().toLowerCase() === "n") return;

  const name = title || "this";
  const text = desc
    ? `Introducing ${name} — ${desc}\n\nMade with https://github.com/islo-labs/agentreel`
    : `Introducing ${name}\n\nMade with https://github.com/islo-labs/agentreel`;
  const intentURL = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`;
  console.error(`\n  Opening Twitter — attach your video.\n  Video: ${resolve(outputPath)}\n`);
  try { execFileSync(process.platform === "darwin" ? "open" : "xdg-open", [intentURL], { stdio: "ignore" }); }
  catch { console.error(`  Link: ${intentURL}`); }
}

// ── Dev Server ─────────────────────────────────────────────

function startDevServer(command) {
  console.error(`  Starting: ${command}`);
  const proc = spawn("sh", ["-c", command], { stdio: ["ignore", "pipe", "pipe"], detached: true });
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => resolve(proc), 30000);
    const onData = (d) => {
      if (/localhost|ready|started|listening|compiled/i.test(d.toString())) {
        clearTimeout(timeout);
        setTimeout(() => resolve(proc), 2000);
      }
    };
    proc.stdout.on("data", onData);
    proc.stderr.on("data", onData);
    proc.on("error", e => { clearTimeout(timeout); reject(e); });
  });
}

function stopDevServer(proc) {
  if (!proc?.killed) try { process.kill(-proc.pid, "SIGTERM"); } catch { try { proc.kill(); } catch {} }
}

// ── Main ───────────────────────────────────────────────────

async function main() {
  const flags = parseArgs();
  const output = flags.output || "agentreel.mp4";

  if (!flags.cmd && !flags.url && !flags.pr) {
    console.error("Please provide --pr, --cmd, or --url.\n");
    printUsage();
    process.exit(1);
  }

  // ── PR mode ──────────────────────────────────────────
  if (flags.pr) {
    console.error("Fetching PR context...");
    const pr = fetchPRContext(flags.pr);
    console.error(`  PR #${pr.number}: ${pr.title}`);

    console.error("Planning demo...");
    const plan = planDemoFromPR(pr, flags.guidelines);
    console.error(`  Type: ${plan.type}, "${plan.description}"`);

    const title = flags.title || plan.title || pr.title;
    const subtitle = flags.subtitle || plan.description;
    const demoGuidelines = `[demo] ${plan.guidelines || ""}`.trim();

    if (plan.type === "browser") {
      let serverProc = null;
      try {
        if (flags.start) serverProc = await startDevServer(flags.start);
        await ensurePlaywright();
        console.error("Step 1/3: Recording browser demo...");
        const { videoPath, clicks } = await recordBrowser(plan.url || "http://localhost:3000", demoGuidelines, flags.auth, demoGuidelines);
        const publicDir = join(ROOT, "public");
        if (!existsSync(publicDir)) mkdirSync(publicDir, { recursive: true });
        copyFileSync(videoPath, join(publicDir, "browser-demo.mp4"));
        console.error("Step 2/3: Building highlights...");
        const highlights = buildBrowserHighlights(clicks, demoGuidelines, demoGuidelines);
        console.error("Step 3/3: Rendering...");
        await render({ title, subtitle, highlights, endText: pr.title, endUrl: pr.url, mode: "demo" }, output, flags.music);
      } finally { stopDevServer(serverProc); }
    } else {
      if (!plan.command) { console.error("Error: could not determine command to demo."); process.exit(1); }
      console.error("Step 1/3: Recording CLI demo...");
      const steps = planDemoSteps(plan.command, plan.description, demoGuidelines);
      console.error(`  ${steps.length} steps planned`);
      const outputs = executeSteps(steps, process.cwd());
      console.error("Step 2/3: Extracting highlights...");
      const highlights = extractHighlights(outputs, plan.description, demoGuidelines, true);
      console.error(`  ${highlights.length} highlights`);
      console.error("Step 3/3: Rendering...");
      await render({ title, subtitle, highlights, endText: plan.command, endUrl: pr.url, mode: "demo" }, output, flags.music);
    }

    if (!flags.noShare) await shareFlow(resolve(output), title, plan.description);
    return;
  }

  // ── CLI mode ─────────────────────────────────────────
  if (flags.cmd) {
    const title = flags.title || flags.cmd;
    console.error("Step 1/3: Recording CLI demo...");
    const steps = planDemoSteps(flags.cmd, flags.cmd, flags.guidelines);
    console.error(`  ${steps.length} steps planned`);
    const outputs = executeSteps(steps, process.cwd());
    console.error("Step 2/3: Extracting highlights...");
    const highlights = extractHighlights(outputs, flags.cmd, flags.guidelines, false);
    console.error(`  ${highlights.length} highlights`);
    console.error("Step 3/3: Rendering...");
    await render({ title, highlights, endText: flags.cmd }, output, flags.music);
    if (!flags.noShare) await shareFlow(resolve(output), title, flags.cmd);
    return;
  }

  // ── Browser mode ─────────────────────────────────────
  if (flags.url) {
    const title = flags.title || flags.url;
    await ensurePlaywright();
    console.error("Step 1/3: Recording browser demo...");
    const { videoPath, clicks } = await recordBrowser(flags.url, "Explore the main features", flags.auth, flags.guidelines);
    const publicDir = join(ROOT, "public");
    if (!existsSync(publicDir)) mkdirSync(publicDir, { recursive: true });
    copyFileSync(videoPath, join(publicDir, "browser-demo.mp4"));
    console.error("Step 2/3: Building highlights...");
    const highlights = buildBrowserHighlights(clicks, "Explore the main features", flags.guidelines);
    console.error("Step 3/3: Rendering...");
    await render({ title, highlights, endText: flags.url, endUrl: flags.url }, output, flags.music);
    if (!flags.noShare) await shareFlow(resolve(output), title, flags.url);
  }
}

main();
