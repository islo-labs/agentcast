#!/usr/bin/env node

import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, statSync, existsSync, mkdirSync, copyFileSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline";

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
  console.log(`agentreel — Turn your apps into launch videos

Usage:
  agentreel --cmd "npx my-tool"             # CLI launch video
  agentreel --url http://localhost:3000      # browser launch video

Flags:
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

// ── CLI Recording ─────────────────────────────────────────

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

function extractHighlights(outputs, context, guidelines) {
  const session = outputs.map(o =>
    `$ ${o.command}\n${o.stdout}${o.stderr ? `\n(stderr: ${o.stderr})` : ""}`
  ).join("\n\n");

  const extra = guidelines ? `\nGuidelines: ${guidelines}` : "";
  const outputBlock = session.trim()
    ? `Terminal output:\n---\n${session.slice(0, 6000)}\n---`
    : "(No terminal output captured — generate representative output from context.)";

  const prompt = `Create highlights for a sleek launch video (like a product launch reel).
Mix these highlight types for maximum impact:

1. Text slides — bold narrative statements:
   {"label":"...", "statement":"Line one.\\nLine two."}
2. Terminal highlights — actual CLI demo:
   {"label":"...", "lines":[{"text":"...", "isPrompt":true|false, "color":"#hex", "bold":true|false, "dim":true|false}]}
3. Animated tree — shows the tool's architecture/hierarchy as a branching visualization:
   {"label":"...", "tree":{"root":"Root Label", "depth":4, "branching":[3,2,3], "nodeLabels":[["Child1","Child2","Child3"],["Grandchild1","Grandchild2"]]}}
   The tree auto-generates a fractal structure. Make it CONTEXTUAL — root=the tool name, first-level children=its main modules/stages, second-level=sub-components. branching can be a number (uniform) or array (per-level). nodeLabels[0]=level 1 labels, nodeLabels[1]=level 2 labels (cycled if fewer than nodes).
4. Side-by-side panels — two content cards comparing concepts:
   {"label":"...", "panels":{"left":{"title":"...", "content":"Line1.\\nLine2."}, "right":{"title":"...", "content":"Line1.\\nLine2."}}}
5. Diagram — manual node-and-edge flow (for pipelines/flows, not hierarchies):
   {"label":"...", "diagram":{"nodes":[{"id":"...", "label":"...", "x":0.0-1.0, "y":0.0-1.0}], "edges":[{"from":"id", "to":"id"}]}}

${outputBlock}

Context: ${context}${extra}

Structure: Open with a text slide (the hook), then 1-2 terminal highlights showing the tool in action, then a tree or panels to visualize the architecture, then close with a text slide (the payoff). 5-6 highlights total.
IMPORTANT: Trees and diagrams must reflect the ACTUAL tool being demoed — use real module names, real pipeline stages, real concepts from the context. Do NOT use generic labels.
Colors (light terminal): green="#16a34a" purple="#6d28d9" blue="#2563eb" red="#dc2626" dim="#9ca3af" default="#1a1a1a"
For text slides: keep statements punchy, 1-2 lines max.
Return ONLY JSON array.`;

  const result = parseJSON(claude(prompt), null);
  if (result) return result;

  console.error("  Retrying highlight extraction...");
  const retry = parseJSON(claude(`Generate a launch video with 4 highlights. Context: ${context}
Mix types: text slides {"label":"...", "statement":"Bold text"} and terminal {"label":"...", "lines":[{"text":"cmd", "isPrompt":true}, {"text":"output", "color":"#16a34a"}]}.
Start with a text slide hook, then terminal demos, end with a text slide payoff. Return ONLY JSON array.`), null);
  if (retry) return retry;

  return [
    { label: "Intro", statement: context || "Demo" },
    { label: "Run", lines: [
      { text: context || "demo", isPrompt: true },
      { text: "  Done.", color: "#16a34a" },
    ]},
  ];
}

// ── Browser Recording ─────────────────────────────────────

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

async function recordBrowser(url, authState, guidelines) {
  const { chromium } = await import("playwright");
  const fs = await import("node:fs");
  const { mkdtemp } = await import("node:fs/promises");
  const videoDir = await mkdtemp(join(tmpdir(), "agentreel-"));
  const outFile = join(tmpdir(), "agentreel-browser.mp4");

  // Step 1: Navigate and extract page content
  console.error(`  Loading ${url}...`);
  const browser = await chromium.launch({ headless: true });
  const scoutCtx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const scoutPage = await scoutCtx.newPage();
  try { await scoutPage.goto(url, { waitUntil: "networkidle", timeout: 15000 }); }
  catch { await scoutPage.goto(url, { timeout: 15000 }); }
  await scoutPage.waitForTimeout(1000);

  // Extract visible text, title, headings
  const pageContent = await scoutPage.evaluate(() => {
    const title = document.title || "";
    const meta = document.querySelector('meta[name="description"]')?.getAttribute("content") || "";
    const headings = Array.from(document.querySelectorAll("h1, h2, h3")).map(h => h.textContent?.trim()).filter(Boolean).slice(0, 10);
    const buttons = Array.from(document.querySelectorAll("button, a[href]")).map(b => b.textContent?.trim()).filter(t => t && t.length < 40).slice(0, 10);
    const body = document.body?.innerText?.slice(0, 3000) || "";
    return { title, meta, headings, buttons, body };
  });
  await scoutPage.close();
  await scoutCtx.close();

  const siteContext = `Website: ${url}
Title: ${pageContent.title}
Description: ${pageContent.meta}
Headings: ${pageContent.headings.join(", ")}
Buttons/Links: ${pageContent.buttons.join(", ")}
Content (truncated): ${pageContent.body.slice(0, 1500)}`;

  console.error(`  Page: "${pageContent.title}" — ${pageContent.headings.slice(0, 3).join(", ")}`);

  // Step 2: Generate Playwright demo script using actual page content
  const extra = guidelines ? `\nGuidelines: ${guidelines}` : "";
  console.error(`  Generating demo script...`);
  const scriptCode = claude(`Generate a Playwright JS async function body that demos this website.

${siteContext}${extra}

The code runs inside: async (page) => { YOUR_CODE_HERE }

IMPORTANT RULES:
- page is already at ${url} — do NOT call page.goto()
- Start by scrolling down slowly to show the full page
- Use page.evaluate(() => window.scrollBy(0, 400)) for scrolling
- Click interesting buttons/links using page.click() with {timeout:5000, force:true}
- Add await page.waitForTimeout(2000) between actions
- Total ~25 seconds of activity
- Wrap each action in try/catch so failures don't stop the demo
- Return ONLY valid JS code — no comments before the first statement, no markdown

Example pattern:
await page.waitForTimeout(2000);
try { await page.evaluate(() => window.scrollBy({top: 500, behavior: 'smooth'})); } catch {}
await page.waitForTimeout(2000);
try { await page.click('text=Get Started', {timeout: 5000, force: true}); } catch {}
await page.waitForTimeout(2000);`);

  // Step 3: Record with video
  console.error(`  Recording ${url}...`);
  const recordingStartMs = Date.now();
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
  await page.waitForTimeout(1500);

  try {
    const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
    const demoFn = new AsyncFunction("page", scriptCode);
    await demoFn(page);
  } catch (e) {
    console.error(`  Demo script error: ${e.message}`);
    // Fallback: at least scroll the page
    try {
      for (let i = 0; i < 5; i++) {
        await page.evaluate(() => window.scrollBy({ top: 400, behavior: "smooth" }));
        await page.waitForTimeout(2000);
      }
    } catch {}
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

  return { videoPath: outFile, clicks, siteContext };
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

function wrapBrowserHighlights(browserHighlights, context, guidelines) {
  const clipCount = browserHighlights.length;
  const extra = guidelines ? `\nGuidelines: ${guidelines}` : "";

  const prompt = `Create a launch video structure that wraps ${clipCount} browser demo clips.
The browser clips are already recorded — you need to create the narrative beats AROUND them.

Context: ${context}${extra}

Return a JSON array mixing these types:
1. Text slides: {"label":"...", "statement":"Line one.\\nLine two."}
2. Panels: {"label":"...", "panels":{"left":{"title":"...", "content":"..."}, "right":{"title":"...", "content":"..."}}}
3. Trees: {"label":"...", "tree":{"root":"...", "depth":4, "branching":[4,3,2], "nodeLabels":[["child1","child2"]], "outro":"Closing text."}}
4. Browser clip placeholder: {"_browserClip": true}

Structure: Open with a text slide hook, then alternate browser clips with narrative beats, close with a text slide or tree with outro. Use "_browserClip" as a placeholder where each recorded browser clip should go (use exactly ${clipCount} of them).

Return ONLY JSON array.`;

  try {
    const result = parseJSON(claude(prompt, 60000), null);
    if (result && Array.isArray(result)) {
      // Replace _browserClip placeholders with actual browser highlights
      const final = [];
      let clipIdx = 0;
      for (const item of result) {
        if (item._browserClip && clipIdx < browserHighlights.length) {
          final.push(browserHighlights[clipIdx++]);
        } else if (!item._browserClip) {
          final.push(item);
        }
      }
      // Append any remaining browser clips
      while (clipIdx < browserHighlights.length) {
        final.push(browserHighlights[clipIdx++]);
      }
      return final;
    }
  } catch {}

  // Fallback: just wrap with a simple text slide
  return [
    { label: "Intro", statement: context || "Demo" },
    ...browserHighlights,
  ];
}

// ── SVG Fallback ───────────────────────────────────────────

function escSvg(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function renderSVG(props, output) {
  const FONT = '"SF Mono", "Fira Code", monospace';
  const SANS = '-apple-system, system-ui, sans-serif';
  const W = 700;
  const PAD = 32, LINE_H = 22, TERM_PAD = 16, BAR_H = 36, GAP = 28, FS = 13;

  let y = PAD, blocks = "";
  blocks += `<text x="${W / 2}" y="${y + 28}" font-family="${escSvg(SANS)}" font-size="32" font-weight="800" fill="#111" text-anchor="middle">${escSvg(props.title)}</text>`;
  y += props.subtitle ? 68 : 56;
  if (props.subtitle) blocks += `<text x="${W / 2}" y="${y - 22}" font-family="${escSvg(SANS)}" font-size="16" fill="#999" text-anchor="middle">${escSvg(props.subtitle)}</text>`;

  for (const hl of props.highlights) {
    if (!hl.lines?.length) continue;
    y += 8;
    const bodyH = TERM_PAD * 2 + hl.lines.length * LINE_H;
    blocks += `<rect x="${PAD}" y="${y}" width="${W - PAD * 2}" height="${BAR_H + bodyH}" rx="12" fill="#f0f0f0"/>`;
    blocks += `<circle cx="${PAD + 16}" cy="${y + BAR_H / 2}" r="4" fill="rgba(0,0,0,0.06)"/><circle cx="${PAD + 30}" cy="${y + BAR_H / 2}" r="4" fill="rgba(0,0,0,0.06)"/><circle cx="${PAD + 44}" cy="${y + BAR_H / 2}" r="4" fill="rgba(0,0,0,0.06)"/>`;
    blocks += `<rect x="${PAD}" y="${y + BAR_H}" width="${W - PAD * 2}" height="${bodyH}" fill="#f8f8f8" rx="0"/>`;
    let ly = y + BAR_H + TERM_PAD;
    for (const line of hl.lines) {
      const color = line.dim ? "#9ca3af" : line.color || "#1a1a1a";
      const prefix = line.isPrompt ? `<tspan fill="#16a34a">$ </tspan>` : "";
      const text = line.isPrompt ? line.text.replace(/^\$\s*/, "") : line.text;
      blocks += `<text x="${PAD + TERM_PAD}" y="${ly + FS}" font-family="${escSvg(FONT)}" font-size="${FS}" font-weight="${line.bold ? 700 : 400}" fill="${color}">${prefix}${escSvg(text)}</text>`;
      ly += LINE_H;
    }
    y += BAR_H + bodyH + GAP;
  }
  if (props.endUrl) { blocks += `<text x="${W / 2}" y="${y + 16}" font-family="${escSvg(SANS)}" font-size="14" fill="#999" text-anchor="middle">${escSvg(props.endUrl)}</text>`; y += 28; }
  y += PAD;

  writeFileSync(output, `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${y}" viewBox="0 0 ${W} ${y}"><rect width="${W}" height="${y}" fill="#fff"/>${blocks}</svg>`);
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

// ── Main ───────────────────────────────────────────────────

async function main() {
  const flags = parseArgs();
  const output = flags.output || "agentreel.mp4";

  if (!flags.cmd && !flags.url) {
    console.error("Please provide --cmd or --url.\n");
    printUsage();
    process.exit(1);
  }

  // ── CLI mode ─────────────────────────────────────────
  if (flags.cmd) {
    const title = flags.title || flags.cmd;
    console.error("Step 1/3: Recording CLI demo...");
    const steps = planDemoSteps(flags.cmd, flags.cmd, flags.guidelines);
    console.error(`  ${steps.length} steps planned`);
    const outputs = executeSteps(steps, process.cwd());
    console.error("Step 2/3: Extracting highlights...");
    const highlights = extractHighlights(outputs, flags.cmd, flags.guidelines);
    console.error(`  ${highlights.length} highlights`);
    console.error("Step 3/3: Rendering...");
    await render({ title, highlights, endText: flags.cmd }, output, flags.music);
    if (!flags.noShare) await shareFlow(resolve(output), title, flags.cmd);
    return;
  }

  // ── Browser mode ─────────────────────────────────────
  if (flags.url) {
    await ensurePlaywright();
    console.error("Step 1/4: Recording browser demo...");
    const { videoPath, clicks, siteContext } = await recordBrowser(flags.url, flags.auth, flags.guidelines);
    const publicDir = join(ROOT, "public");
    if (!existsSync(publicDir)) mkdirSync(publicDir, { recursive: true });
    copyFileSync(videoPath, join(publicDir, "browser-demo.mp4"));
    console.error("Step 2/4: Building browser clips...");
    const browserClips = buildBrowserHighlights(clicks, siteContext, flags.guidelines);
    console.error("Step 3/4: Generating launch video...");
    const highlights = wrapBrowserHighlights(browserClips, siteContext, flags.guidelines);
    console.error(`  ${highlights.length} highlights (${browserClips.length} browser clips + narrative beats)`);
    const title = flags.title || siteContext.split("\n")[1]?.replace("Title: ", "") || flags.url;
    console.error("Step 4/4: Rendering...");
    await render({ title, subtitle: flags.subtitle, highlights, endText: flags.url, endUrl: flags.url }, output, flags.music);
    if (!flags.noShare) await shareFlow(resolve(output), title, flags.url);
  }
}

main();
