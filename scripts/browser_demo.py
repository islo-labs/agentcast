"""
Browser demo recorder. Uses claude CLI to generate a Playwright script,
runs it with video recording, then extracts highlight timestamps.

Usage:
    python browser_demo.py <url> <output_video> [task]
    python browser_demo.py --highlights <video_path> <output_json> [task]
"""
import asyncio
import json
import os
import subprocess
import sys
import tempfile
import time


def find_claude():
    """Find the claude CLI binary."""
    import shutil
    claude = shutil.which("claude")
    if claude:
        return claude
    for path in [
        os.path.expanduser("~/.local/bin/claude"),
        "/usr/local/bin/claude",
    ]:
        if os.path.isfile(path):
            return path
    return "claude"


def generate_playwright_script(url, task):
    """Use claude CLI to generate a Playwright demo script."""
    prompt = (
        f"Generate a Playwright Python async function that demos a web app at {url}. "
        f"Task: {task}. "
        f"The function signature is: async def demo(page). "
        f"Navigate to the URL, wait for load, interact with key features — "
        f"click buttons, fill forms, scroll. Take about 20 seconds total. "
        f"Add page.wait_for_timeout(1500) between actions so the viewer can see each step. "
        f"IMPORTANT rules for robust scripts: "
        f"- Use timeout=5000 on every click/fill/action so failures are fast. "
        f"- Use force=True on all click() calls to bypass overlapping labels/overlays. "
        f"- Click visible labels and buttons, never hidden inputs (like sr-only radio buttons). "
        f"- Wrap each action in try/except and continue on failure — the demo must finish. "
        f"Return ONLY the Python function code, no imports, no markdown fences."
    )

    claude = find_claude()
    print(f"Using claude at: {claude}", file=sys.stderr)

    result = subprocess.run(
        [claude, "-p", prompt, "--output-format", "text"],
        capture_output=True,
        text=True,
        timeout=120,
    )

    text = result.stdout.strip()
    if "```" in text:
        parts = text.split("```")
        for part in parts:
            part = part.strip()
            if part.startswith("python"):
                part = part[6:].strip()
            if "async def demo" in part:
                text = part
                break
    return text


def extract_highlights(video_path, task):
    """Ask Claude to suggest highlight timestamps for a browser recording."""
    claude = find_claude()

    prompt = (
        f"I recorded a browser demo video of a web app. The task was: {task}. "
        f"The video is about 20 seconds long. "
        f"Suggest 3-4 highlight moments as a JSON array. Each highlight has: "
        f'"label" (1-2 words), "overlay" (short caption with **bold** for accent), '
        f'"videoStartSec" (start time in seconds), "videoEndSec" (end time). '
        f"Each clip should be 5-8 seconds to show the full interaction. Cover: page load, key interaction, result. "
        f"Return ONLY the JSON array."
    )

    result = subprocess.run(
        [claude, "-p", prompt, "--output-format", "text"],
        capture_output=True,
        text=True,
        timeout=120,
    )

    text = result.stdout.strip()
    if result.returncode != 0 or not text:
        print(f"Claude returned no output (exit {result.returncode}), using default highlights", file=sys.stderr)
        if result.stderr:
            print(f"  stderr: {result.stderr[:200]}", file=sys.stderr)
        text = ""

    if "```" in text:
        parts = text.split("```")
        for part in parts:
            part = part.strip()
            if part.startswith("json"):
                part = part[4:].strip()
            if part.startswith("["):
                text = part
                break

    try:
        highlights = json.loads(text)
    except (json.JSONDecodeError, ValueError):
        print(f"Could not parse highlights, using defaults", file=sys.stderr)
        highlights = [
            {"label": "Overview", "overlay": "**Quick look**", "videoStartSec": 1, "videoEndSec": 7},
            {"label": "Features", "overlay": "**Key features**", "videoStartSec": 7, "videoEndSec": 14},
            {"label": "Result", "overlay": "**See it work**", "videoStartSec": 14, "videoEndSec": 20},
        ]

    for h in highlights:
        h["videoSrc"] = "browser-demo.mp4"

    return highlights


async def record_browser_demo(url, task, output_path):
    """Generate and run a Playwright demo with video recording."""
    from playwright.async_api import async_playwright

    print(f"Generating demo script for {url}...", file=sys.stderr)
    script_code = generate_playwright_script(url, task)
    print(f"Script ready ({len(script_code)} chars)", file=sys.stderr)

    video_dir = tempfile.mkdtemp()
    recording_start_ms = int(time.time() * 1000)

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(
            viewport={"width": 1280, "height": 800},
            record_video_dir=video_dir,
            record_video_size={"width": 1280, "height": 800},
        )

        # Inject click tracker — persists across navigations
        click_tracker_js = (
            "if (!window.__agentreel_clicks) {"
            "  window.__agentreel_clicks = [];"
            "  document.addEventListener('click', function(e) {"
            "    window.__agentreel_clicks.push({"
            "      x: e.clientX,"
            "      y: e.clientY,"
            f"     timestamp: Date.now() - {recording_start_ms}"
            "    });"
            "  }, true);"
            "}"
        )
        await context.add_init_script(click_tracker_js)

        page = await context.new_page()

        # Navigate first
        print(f"Loading {url}...", file=sys.stderr)
        try:
            await page.goto(url, wait_until="networkidle", timeout=15000)
        except Exception as e:
            print(f"Navigation warning: {e}", file=sys.stderr)
            await page.goto(url, timeout=15000)

        await page.wait_for_timeout(1000)

        # Run the generated demo
        try:
            local_ns = {}
            full_code = "import asyncio\n" + script_code
            compiled = compile(full_code, "<demo>", "exec")  # noqa: S102
            exec(compiled, local_ns)  # noqa: S102

            if "demo" in local_ns:
                print("Running demo script...", file=sys.stderr)
                await local_ns["demo"](page)
            else:
                print("No demo() function found, waiting on page...", file=sys.stderr)
                await page.wait_for_timeout(10000)
        except Exception as e:
            print(f"Demo script error: {e}", file=sys.stderr)
            # Scroll around as fallback
            await page.wait_for_timeout(2000)
            await page.evaluate("window.scrollTo({ top: 500, behavior: 'smooth' })")
            await page.wait_for_timeout(2000)
            await page.evaluate("window.scrollTo({ top: 0, behavior: 'smooth' })")
            await page.wait_for_timeout(2000)

        # Extract click data before closing
        try:
            clicks_raw = await page.evaluate("window.__agentreel_clicks || []")
        except Exception:
            clicks_raw = []

        clicks = [
            {"x": c["x"], "y": c["y"], "timeSec": round(c["timestamp"] / 1000.0, 3)}
            for c in clicks_raw
        ]
        clicks_path = output_path.replace(".mp4", "-clicks.json")
        with open(clicks_path, "w") as f:
            json.dump(clicks, f, indent=2)
        print(f"Captured {len(clicks)} clicks -> {clicks_path}", file=sys.stderr)

        # Get the video path before closing
        video = page.video
        await page.close()
        await context.close()
        await browser.close()

    # Find the recorded video and convert to mp4
    for f in os.listdir(video_dir):
        if f.endswith(".webm"):
            webm_path = os.path.join(video_dir, f)

            # Convert webm to mp4 with ffmpeg
            print(f"Converting to mp4...", file=sys.stderr)
            try:
                subprocess.run(
                    ["ffmpeg", "-y", "-i", webm_path, "-c:v", "libx264",
                     "-preset", "fast", "-crf", "23", output_path],
                    capture_output=True,
                    timeout=60,
                )
                print(f"Saved: {output_path}", file=sys.stderr)
            except (subprocess.TimeoutExpired, FileNotFoundError):
                # ffmpeg not available, use webm directly
                import shutil
                mp4_path = output_path.replace(".mp4", ".webm")
                shutil.copy2(webm_path, mp4_path)
                print(f"Saved (webm): {mp4_path}", file=sys.stderr)
            return

    print("Error: no video file recorded", file=sys.stderr)
    sys.exit(1)


if __name__ == "__main__":
    if len(sys.argv) < 3:
        print(
            "Usage:\n"
            "  python browser_demo.py <url> <output_video> [task]\n"
            "  python browser_demo.py --highlights <video_path> <output_json> [task]",
            file=sys.stderr,
        )
        sys.exit(1)

    if sys.argv[1] == "--highlights":
        video_path = sys.argv[2]
        output = sys.argv[3]
        task = sys.argv[4] if len(sys.argv) > 4 else "Demo the web app"
        print(f"Extracting highlights...", file=sys.stderr)
        highlights = extract_highlights(video_path, task)
        with open(output, "w") as f:
            json.dump(highlights, f, indent=2)
        print(f"Saved {len(highlights)} highlights to: {output}", file=sys.stderr)
    else:
        url = sys.argv[1]
        output = sys.argv[2]
        task = sys.argv[3] if len(sys.argv) > 3 else "Explore the main features"
        asyncio.run(record_browser_demo(url, task, output))
