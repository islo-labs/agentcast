package render

import (
	"fmt"
	"image"
	"image/color"
	"image/gif"
	"io"

	"golang.org/x/image/font"
	"golang.org/x/image/font/inconsolata"
	"golang.org/x/image/math/fixed"

	"github.com/adamgold/agentcast/internal/diff"
)

var (
	diffGreen     = color.RGBA{80, 250, 123, 255}
	diffRed       = color.RGBA{255, 85, 85, 255}
	diffGreenBG   = color.RGBA{30, 60, 40, 255}
	diffRedBG     = color.RGBA{60, 30, 35, 255}
	diffHeaderFG  = color.RGBA{139, 233, 253, 255}
	diffFileFG    = color.RGBA{189, 147, 249, 255}
	diffContextFG = color.RGBA{98, 114, 164, 255}
)

const (
	diffCols = 80
	diffRows = 24
)

// RenderDiffGIF creates an animated GIF that "types out" a diff.
func RenderDiffGIF(summary diff.Summary, out io.Writer) error {
	imgW := padX*2 + diffCols*cellW
	imgH := titleBarH + padY*2 + diffRows*cellH + statsBarH
	palette := buildDiffPalette()

	var frames []*image.Paletted
	var delays []int

	addFrame := func(img *image.RGBA, delayCs int) {
		frames = append(frames, quantize(img, palette))
		delays = append(delays, delayCs)
	}

	face := inconsolata.Regular8x16
	boldFace := inconsolata.Bold8x16

	// Build the "script" — a sequence of lines to animate
	type scriptLine struct {
		text  string
		fg    color.RGBA
		bg    color.RGBA
		bold  bool
		pause int // centiseconds to hold after this line
	}

	var script []scriptLine

	// Title card frame
	script = append(script, scriptLine{text: "", pause: 50}) // blank starter

	for _, f := range summary.Files {
		// File header
		script = append(script, scriptLine{
			text: fmt.Sprintf("  %s", f.Path),
			fg:   diffFileFG,
			bold: true,
			pause: 30,
		})

		for _, line := range f.Lines {
			switch line.Type {
			case diff.LineAdd:
				text := fmt.Sprintf("+ %s", line.Text)
				if len(text) > diffCols-4 {
					text = text[:diffCols-4]
				}
				script = append(script, scriptLine{
					text: text, fg: diffGreen, bg: diffGreenBG, pause: 6,
				})
			case diff.LineRemove:
				text := fmt.Sprintf("- %s", line.Text)
				if len(text) > diffCols-4 {
					text = text[:diffCols-4]
				}
				script = append(script, scriptLine{
					text: text, fg: diffRed, bg: diffRedBG, pause: 6,
				})
			case diff.LineContext:
				text := fmt.Sprintf("  %s", line.Text)
				if len(text) > diffCols-4 {
					text = text[:diffCols-4]
				}
				script = append(script, scriptLine{
					text: text, fg: diffContextFG, pause: 3,
				})
			case diff.LineHeader:
				script = append(script, scriptLine{
					text: "", pause: 10, // gap between hunks
				})
			}
		}

		// Gap between files
		script = append(script, scriptLine{text: "", pause: 20})
	}

	// Stats line
	statsLine := fmt.Sprintf("  %d files changed, +%d -%d",
		summary.Stats.FilesChanged, summary.Stats.Additions, summary.Stats.Deletions)

	// Render frames — each frame adds one more line to the screen
	// We keep a rolling window of visible lines
	visibleLines := make([]scriptLine, 0, diffRows)
	maxVisible := diffRows - 2 // leave room for padding

	for i, sl := range script {
		if sl.text != "" || i == 0 {
			visibleLines = append(visibleLines, sl)
			if len(visibleLines) > maxVisible {
				visibleLines = visibleLines[len(visibleLines)-maxVisible:]
			}
		}

		img := image.NewRGBA(image.Rect(0, 0, imgW, imgH))

		// Background
		fillRGBA(img, 0, 0, imgW, imgH, themeBG)

		// Title bar
		fillRGBA(img, 0, 0, imgW, titleBarH, themeTitleBG)
		drawDotRGBA(img, dotStartX, dotCenterY, dotRadius, themeDotRed)
		drawDotRGBA(img, dotStartX+dotSpacing, dotCenterY, dotRadius, themeDotYel)
		drawDotRGBA(img, dotStartX+2*dotSpacing, dotCenterY, dotRadius, themeDotGrn)
		drawTextRGBA(img, dotStartX+3*dotSpacing+10, dotCenterY+5, summary.Title, themeDimFG, face)

		// Diff lines
		termY := titleBarH + padY
		for _, vl := range visibleLines {
			if vl.text == "" {
				termY += cellH
				continue
			}

			// Line background for add/remove
			if vl.bg != (color.RGBA{}) {
				fillRGBA(img, padX, termY, imgW-padX*2, cellH, vl.bg)
			}

			f := face
			if vl.bold {
				f = boldFace
			}
			drawTextRGBA(img, padX+cellW, termY+cellH-3, vl.text, vl.fg, f)
			termY += cellH
		}

		// Stats bar
		barY := imgH - statsBarH
		fillRGBA(img, 0, barY, imgW, statsBarH, themeTitleBG)

		// Accumulate stats as lines appear
		addCount := 0
		rmCount := 0
		for j := 0; j <= i && j < len(script); j++ {
			if script[j].fg == diffGreen {
				addCount++
			}
			if script[j].fg == diffRed {
				rmCount++
			}
		}
		progressStats := fmt.Sprintf(" +%d -%d", addCount, rmCount)
		drawTextRGBA(img, padX, barY+18, progressStats, themeDimFG, face)

		addFrame(img, sl.pause)
	}

	// Final summary frame — hold longer
	{
		img := image.NewRGBA(image.Rect(0, 0, imgW, imgH))
		fillRGBA(img, 0, 0, imgW, imgH, themeBG)
		fillRGBA(img, 0, 0, imgW, titleBarH, themeTitleBG)
		drawDotRGBA(img, dotStartX, dotCenterY, dotRadius, themeDotRed)
		drawDotRGBA(img, dotStartX+dotSpacing, dotCenterY, dotRadius, themeDotYel)
		drawDotRGBA(img, dotStartX+2*dotSpacing, dotCenterY, dotRadius, themeDotGrn)

		centerY := imgH / 2

		// Title
		titleX := (imgW - len(summary.Title)*cellW) / 2
		if titleX < padX {
			titleX = padX
		}
		drawTextRGBA(img, titleX, centerY-48, summary.Title, themeFG, boldFace)

		// Stats prominently
		drawTextRGBA(img, (imgW-len(statsLine)*cellW)/2, centerY-10, statsLine, diffGreen, boldFace)

		// Duration if available
		if summary.Duration > 0 {
			durStr := fmt.Sprintf("  in %s", formatDur(summary.Duration.Seconds()))
			drawTextRGBA(img, (imgW-len(durStr)*cellW)/2, centerY+20, durStr, themeDimFG, face)
		}

		// Watermark
		wm := "recorded with agentcast"
		drawTextRGBA(img, (imgW-len(wm)*cellW)/2, imgH-padY-cellH, wm, color.RGBA{68, 71, 90, 255}, face)

		addFrame(img, 400) // hold 4 seconds
	}

	if len(frames) == 0 {
		return fmt.Errorf("no diff content to render")
	}

	return gif.EncodeAll(out, &gif.GIF{Image: frames, Delay: delays, LoopCount: 0})
}

func buildDiffPalette() color.Palette {
	p := buildPalette()
	// Add diff-specific colors
	p = append(p,
		diffGreen, diffRed, diffGreenBG, diffRedBG,
		diffHeaderFG, diffFileFG, diffContextFG,
	)
	return p
}

func drawTextWithFace(img *image.RGBA, x, y int, text string, c color.RGBA, f font.Face) {
	d := &font.Drawer{
		Dst:  img,
		Src:  image.NewUniform(c),
		Face: f,
		Dot:  fixed.P(x, y),
	}
	d.DrawString(text)
}
