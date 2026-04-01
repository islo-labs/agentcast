package render

import (
	"fmt"
	"image"
	"image/color"
	"image/gif"
	"io"
	"strings"

	"golang.org/x/image/font"
	"golang.org/x/image/font/inconsolata"

	"github.com/adamgold/agentcast/internal/session"
)

var (
	actionReadFG  = themeDimFG
	actionWriteFG = color.RGBA{80, 250, 123, 255}  // green
	actionEditFG  = color.RGBA{241, 250, 140, 255}  // yellow
	actionBashFG  = color.RGBA{139, 233, 253, 255}  // cyan
	actionGrepFG  = color.RGBA{189, 147, 249, 255}  // purple
	actionAgentFG = color.RGBA{255, 121, 198, 255}  // pink

	actionWriteBG = color.RGBA{30, 60, 40, 255}
	actionEditBG  = color.RGBA{50, 50, 30, 255}
	actionBashBG  = color.RGBA{25, 45, 55, 255}
)

const (
	sessCols = 72
	sessRows = 22
)

// RenderSessionGIF creates an animated GIF showing the agent's action timeline.
func RenderSessionGIF(sess session.Session, out io.Writer, title string) error {
	imgW := padX*2 + sessCols*cellW
	imgH := titleBarH + padY*2 + sessRows*cellH + statsBarH
	palette := buildSessionPalette()

	face := inconsolata.Regular8x16
	boldFace := inconsolata.Bold8x16

	stats := sess.Stats()

	if title == "" {
		title = "Claude Code session"
	}

	type displayLine struct {
		icon   string
		text   string
		fg     color.RGBA
		bg     color.RGBA
		bold   bool
	}

	// Build timeline of display lines from actions
	var timeline []displayLine
	maxVisible := sessRows - 4

	for _, a := range sess.Actions {
		var dl displayLine
		switch a.Type {
		case session.ActionRead:
			dl = displayLine{icon: "  ", text: a.Detail, fg: actionReadFG}
		case session.ActionWrite:
			dl = displayLine{icon: "  ", text: a.Detail, fg: actionWriteFG, bg: actionWriteBG, bold: true}
		case session.ActionEdit:
			dl = displayLine{icon: "  ", text: a.Detail, fg: actionEditFG, bg: actionEditBG, bold: true}
		case session.ActionBash:
			dl = displayLine{icon: "  ", text: a.Detail, fg: actionBashFG, bg: actionBashBG}
		case session.ActionSearch:
			dl = displayLine{icon: "  ", text: a.Detail, fg: actionGrepFG}
		case session.ActionAgent:
			dl = displayLine{icon: "  ", text: a.Detail, fg: actionAgentFG, bold: true}
		default:
			continue
		}

		// Trim text to fit
		maxLen := sessCols - 4
		if len(dl.text) > maxLen {
			dl.text = dl.text[:maxLen-3] + "..."
		}
		timeline = append(timeline, dl)
	}

	if len(timeline) == 0 {
		return fmt.Errorf("no actions to render")
	}

	var frames []*image.Paletted
	var delays []int

	addFrame := func(img *image.RGBA, delayCs int) {
		frames = append(frames, quantize(img, palette))
		delays = append(delays, delayCs)
	}

	// Animate: each frame adds one action
	visible := make([]displayLine, 0, maxVisible)

	for i, dl := range timeline {
		visible = append(visible, dl)
		if len(visible) > maxVisible {
			visible = visible[len(visible)-maxVisible:]
		}

		img := image.NewRGBA(image.Rect(0, 0, imgW, imgH))
		fillRGBA(img, 0, 0, imgW, imgH, themeBG)

		// Title bar
		fillRGBA(img, 0, 0, imgW, titleBarH, themeTitleBG)
		drawDotRGBA(img, dotStartX, dotCenterY, dotRadius, themeDotRed)
		drawDotRGBA(img, dotStartX+dotSpacing, dotCenterY, dotRadius, themeDotYel)
		drawDotRGBA(img, dotStartX+2*dotSpacing, dotCenterY, dotRadius, themeDotGrn)
		drawTextRGBA(img, dotStartX+3*dotSpacing+10, dotCenterY+5, title, themeDimFG, face)

		// Progress bar at top of terminal area
		termTop := titleBarH
		progW := int(float64(imgW) * float64(i+1) / float64(len(timeline)))
		fillRGBA(img, 0, termTop, progW, 2, color.RGBA{80, 250, 123, 255})

		// Actions
		y := titleBarH + padY + 8
		for _, vl := range visible {
			// Line background
			if vl.bg != (color.RGBA{}) {
				fillRGBA(img, padX, y-2, imgW-padX*2, cellH+2, vl.bg)
			}

			f := face
			if vl.bold {
				f = boldFace
			}
			drawTextRGBA(img, padX+cellW, y+cellH-5, vl.icon+vl.text, vl.fg, f)
			y += cellH + 2
		}

		// Stats bar
		barY := imgH - statsBarH
		fillRGBA(img, 0, barY, imgW, statsBarH, themeTitleBG)
		elapsed := ""
		if i < len(sess.Actions) && !sess.Actions[0].Time.IsZero() {
			d := sess.Actions[min(i, len(sess.Actions)-1)].Time.Sub(sess.Actions[0].Time)
			elapsed = formatDur(d.Seconds())
		}
		statsStr := fmt.Sprintf(" %s  |  %d/%d actions", elapsed, i+1, len(timeline))
		drawTextRGBA(img, padX, barY+18, statsStr, themeDimFG, face)

		// Timing: writes/edits hold longer, reads flash by
		delay := 8 // default ~80ms
		switch dl.fg {
		case actionWriteFG, actionEditFG:
			delay = 15 // hold writes/edits longer
		case actionReadFG:
			delay = 4 // reads flash by
		case actionBashFG:
			delay = 12
		case actionAgentFG:
			delay = 18
		}
		addFrame(img, delay)
	}

	// Summary frame
	{
		img := image.NewRGBA(image.Rect(0, 0, imgW, imgH))
		fillRGBA(img, 0, 0, imgW, imgH, themeBG)
		fillRGBA(img, 0, 0, imgW, titleBarH, themeTitleBG)
		drawDotRGBA(img, dotStartX, dotCenterY, dotRadius, themeDotRed)
		drawDotRGBA(img, dotStartX+dotSpacing, dotCenterY, dotRadius, themeDotYel)
		drawDotRGBA(img, dotStartX+2*dotSpacing, dotCenterY, dotRadius, themeDotGrn)

		// Full progress bar
		fillRGBA(img, 0, titleBarH, imgW, 2, color.RGBA{80, 250, 123, 255})

		centerY := imgH/2 - 20

		// Title
		drawCentered(img, imgW, centerY-40, title, themeFG, boldFace)

		// Duration
		durStr := formatDur(stats.Duration.Seconds())
		drawCentered(img, imgW, centerY, durStr, color.RGBA{80, 250, 123, 255}, boldFace)

		// Stats
		var statParts []string
		if stats.FilesChanged > 0 {
			statParts = append(statParts, fmt.Sprintf("%d files changed", stats.FilesChanged))
		}
		if stats.Edits > 0 {
			statParts = append(statParts, fmt.Sprintf("%d edits", stats.Edits))
		}
		if stats.Writes > 0 {
			statParts = append(statParts, fmt.Sprintf("%d files written", stats.Writes))
		}
		if stats.Commands > 0 {
			statParts = append(statParts, fmt.Sprintf("%d commands", stats.Commands))
		}
		statsLine := strings.Join(statParts, "  |  ")
		drawCentered(img, imgW, centerY+30, statsLine, themeDimFG, face)

		// Action count
		actLine := fmt.Sprintf("%d actions in %s", stats.TotalActions, durStr)
		drawCentered(img, imgW, centerY+55, actLine, themeDimFG, face)

		// Watermark
		drawCentered(img, imgW, imgH-padY-cellH, "recorded with agentcast", color.RGBA{68, 71, 90, 255}, face)

		addFrame(img, 400)
	}

	return gif.EncodeAll(out, &gif.GIF{Image: frames, Delay: delays, LoopCount: 0})
}

func drawCentered(img *image.RGBA, imgW, y int, text string, c color.RGBA, f font.Face) {
	x := (imgW - len(text)*cellW) / 2
	if x < padX {
		x = padX
	}
	drawTextRGBA(img, x, y, text, c, f)
}

func buildSessionPalette() color.Palette {
	p := buildPalette()
	p = append(p,
		actionWriteFG, actionEditFG, actionBashFG, actionGrepFG, actionAgentFG,
		actionWriteBG, actionEditBG, actionBashBG,
	)
	return p
}
