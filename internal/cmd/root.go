package cmd

import (
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"

	"github.com/spf13/cobra"

	"github.com/adamgold/agentcast/internal/session"
)

var version = "dev"

var rootCmd = &cobra.Command{
	Use:   "agentcast [url]",
	Short: "Generate a viral video from your Claude Code session",
	Long: `Run after Claude is done. Takes a screenshot of the result,
reads the session log, and renders a polished video.

  agentcast                        # screenshot frontmost window
  agentcast http://localhost:3000  # screenshot a URL
  agentcast --screenshot img.png   # use existing screenshot`,
	Args: cobra.MaximumNArgs(1),
	RunE: runCast,
}

func runCast(cmd *cobra.Command, args []string) error {
	screenshotFlag, _ := cmd.Flags().GetString("screenshot")
	sessionFlag, _ := cmd.Flags().GetString("session")
	output, _ := cmd.Flags().GetString("output")
	promptFlag, _ := cmd.Flags().GetString("prompt")

	if output == "" {
		output = "agentcast.mp4"
	}

	// 1. Get screenshot
	screenshotPath, err := captureScreenshot(args, screenshotFlag)
	if err != nil {
		return fmt.Errorf("screenshot: %w", err)
	}
	fmt.Fprintf(os.Stderr, "Screenshot: %s\n", screenshotPath)

	// Copy screenshot into Remotion's public dir so it can be served
	webDir := findWebDir()
	publicDir := filepath.Join(webDir, "public")
	os.MkdirAll(publicDir, 0o755)
	destScreenshot := filepath.Join(publicDir, "screenshot.png")
	if err := copyFile(screenshotPath, destScreenshot); err != nil {
		return fmt.Errorf("copy screenshot: %w", err)
	}

	// 2. Parse session
	var sessionPath string
	if sessionFlag != "" {
		sessionPath = sessionFlag
	} else {
		sessionPath, _ = session.FindLatestSession()
	}

	prompt := promptFlag
	duration := ""
	cost := ""
	filesChanged := 0
	linesAdded := 0
	linesRemoved := 0

	if sessionPath != "" {
		sess, err := session.Parse(sessionPath)
		if err == nil {
			stats := sess.Stats()
			if prompt == "" {
				prompt = sess.Prompt
			}
			duration = formatDuration(sess.Duration.Seconds())
			filesChanged = stats.FilesChanged
			linesAdded = stats.Writes + stats.Edits
			linesRemoved = stats.Edits

			// Estimate cost from actions (rough: ~$0.01 per action)
			estimatedCost := float64(stats.TotalActions) * 0.003
			if estimatedCost > 0 {
				cost = fmt.Sprintf("$%.2f", estimatedCost)
			}

			fmt.Fprintf(os.Stderr, "Session: %d actions, %s\n", stats.TotalActions, duration)
		}
	}

	if prompt == "" {
		prompt = "Build something amazing"
	}
	if duration == "" {
		duration = "~1 minute"
	}

	// 3. Render via Remotion
	fmt.Fprintf(os.Stderr, "Rendering video...\n")

	props := map[string]interface{}{
		"prompt":        prompt,
		"screenshotUrl": "screenshot.png",
		"duration":      duration,
		"cost":          cost,
		"filesChanged":  filesChanged,
		"linesAdded":    linesAdded,
		"linesRemoved":  linesRemoved,
	}
	propsJSON, _ := json.Marshal(props)

	absOutput, _ := filepath.Abs(output)

	renderCmd := exec.Command(
		filepath.Join(webDir, "node_modules", ".bin", "remotion"),
		"render", "CastVideo", absOutput,
		"--props", string(propsJSON),
	)
	renderCmd.Dir = webDir
	renderCmd.Stdout = os.Stderr
	renderCmd.Stderr = os.Stderr

	if err := renderCmd.Run(); err != nil {
		return fmt.Errorf("render failed: %w", err)
	}

	info, _ := os.Stat(absOutput)
	if info != nil {
		fmt.Fprintf(os.Stderr, "\nSaved: %s (%.1f KB)\n", output, float64(info.Size())/1024)
	}
	return nil
}

func captureScreenshot(args []string, flagPath string) (string, error) {
	// Explicit screenshot file
	if flagPath != "" {
		if _, err := os.Stat(flagPath); err != nil {
			return "", fmt.Errorf("screenshot file not found: %s", flagPath)
		}
		return flagPath, nil
	}

	// URL argument → use screencapture or headless chrome
	if len(args) > 0 && (strings.HasPrefix(args[0], "http://") || strings.HasPrefix(args[0], "https://")) {
		return screenshotURL(args[0])
	}

	// No args → screenshot frontmost window
	return screenshotWindow()
}

func screenshotWindow() (string, error) {
	if runtime.GOOS != "darwin" {
		return "", fmt.Errorf("auto-screenshot only supported on macOS. Use --screenshot flag")
	}

	tmpFile := filepath.Join(os.TempDir(), "cast-screenshot.png")
	fmt.Fprintf(os.Stderr, "Taking screenshot of frontmost window...\n")

	// -w = interactive window selection, -o = no shadow
	// Using -x for non-interactive (captures main screen) as fallback
	cmd := exec.Command("screencapture", "-x", "-o", tmpFile)
	if err := cmd.Run(); err != nil {
		return "", fmt.Errorf("screencapture failed: %w", err)
	}
	return tmpFile, nil
}

func screenshotURL(url string) (string, error) {
	tmpFile := filepath.Join(os.TempDir(), "cast-screenshot.png")

	// Try Chrome headless first
	chromePaths := []string{
		"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
		"google-chrome",
		"chromium",
	}

	for _, chromePath := range chromePaths {
		cmd := exec.Command(chromePath,
			"--headless",
			"--disable-gpu",
			"--screenshot="+tmpFile,
			"--window-size=1280,800",
			"--hide-scrollbars",
			url,
		)
		if err := cmd.Run(); err == nil {
			return tmpFile, nil
		}
	}

	return "", fmt.Errorf("could not screenshot URL. Install Chrome or use --screenshot flag")
}

func findWebDir() string {
	// Find the web/ directory relative to the cast binary
	exe, _ := os.Executable()
	exeDir := filepath.Dir(exe)

	candidates := []string{
		filepath.Join(exeDir, "..", "web"),
		filepath.Join(exeDir, "web"),
		"web",
	}

	for _, c := range candidates {
		if _, err := os.Stat(filepath.Join(c, "package.json")); err == nil {
			abs, _ := filepath.Abs(c)
			return abs
		}
	}

	// Fallback to cwd/web
	return "web"
}

func copyFile(src, dst string) error {
	data, err := os.ReadFile(src)
	if err != nil {
		return err
	}
	return os.WriteFile(dst, data, 0o644)
}

func formatDuration(secs float64) string {
	if secs < 60 {
		return fmt.Sprintf("%.0f seconds", secs)
	}
	m := int(secs) / 60
	s := int(secs) % 60
	if s == 0 {
		return fmt.Sprintf("%d minutes", m)
	}
	return fmt.Sprintf("%dm %ds", m, s)
}

func Execute() int {
	if err := rootCmd.Execute(); err != nil {
		fmt.Fprintln(os.Stderr, err)
		return 1
	}
	return 0
}

func init() {
	rootCmd.Version = version
	rootCmd.CompletionOptions.HiddenDefaultCmd = true
	rootCmd.Flags().StringP("output", "o", "", "output file (default: cast.mp4)")
	rootCmd.Flags().StringP("screenshot", "s", "", "path to existing screenshot")
	rootCmd.Flags().StringP("session", "", "", "path to Claude Code session .jsonl")
	rootCmd.Flags().StringP("prompt", "p", "", "override the prompt text")
}
