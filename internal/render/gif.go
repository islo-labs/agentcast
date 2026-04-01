package render

import (
	"fmt"
	"image"
	"image/color"
	"image/draw"
	"image/gif"
	"io"
	"os"
	"strings"

	"golang.org/x/image/font"
	"golang.org/x/image/font/inconsolata"
	"golang.org/x/image/math/fixed"

	"github.com/adamgold/agentcast/internal/asciicast"
	"github.com/adamgold/agentcast/internal/vt"
)

// Theme colors (Dracula)
var (
	themeBG      = color.RGBA{40, 42, 54, 255}
	themeFG      = color.RGBA{248, 248, 242, 255}
	themeTitleBG = color.RGBA{33, 34, 44, 255}
	themeDotRed  = color.RGBA{255, 85, 85, 255}
	themeDotYel  = color.RGBA{241, 250, 140, 255}
	themeDotGrn  = color.RGBA{80, 250, 123, 255}
	themeDimFG   = color.RGBA{98, 114, 164, 255}
)

const (
	cellW       = 8  // inconsolata character width
	cellH       = 16 // inconsolata character height
	padX        = 16 // horizontal padding
	padY        = 8  // vertical padding
	titleBarH   = 36 // macOS-style title bar height
	dotRadius   = 6
	dotSpacing  = 20
	dotStartX   = 20
	dotCenterY  = 18
	statsBarH   = 28 // bottom stats bar
)

type GIFOptions struct {
	MaxWidth     int     // max terminal columns to render (0 = use recording width)
	MaxHeight    int     // max terminal rows (0 = use recording height)
	IdleLimit    float64 // max idle time in seconds before compressing (default 2.0)
	FrameRate    float64 // frames per second of recording time (default 10)
	SpeedUp      float64 // additional speed multiplier (default 1.0)
	ShowStats    bool    // show stats bar at bottom
	Title        string  // override title
}

// RenderGIF generates an animated GIF from an asciicast file.
func RenderGIF(castFile *os.File, out io.Writer, opts GIFOptions) error {
	if opts.IdleLimit <= 0 {
		opts.IdleLimit = 2.0
	}
	if opts.FrameRate <= 0 {
		opts.FrameRate = 10
	}
	if opts.SpeedUp <= 0 {
		opts.SpeedUp = 1.0
	}

	r, err := asciicast.NewReader(castFile)
	if err != nil {
		return fmt.Errorf("parse cast: %w", err)
	}
	header := r.Header()

	cols := header.Width
	rows := header.Height
	if opts.MaxWidth > 0 && cols > opts.MaxWidth {
		cols = opts.MaxWidth
	}
	if opts.MaxHeight > 0 && rows > opts.MaxHeight {
		rows = opts.MaxHeight
	}

	title := opts.Title
	if title == "" {
		title = header.Title
	}
	if title == "" {
		title = "cast"
	}

	var events []asciicast.Event
	for {
		e, err := r.NextEvent()
		if err != nil {
			break
		}
		events = append(events, e)
	}
	if len(events) == 0 {
		return fmt.Errorf("no events in recording")
	}

	totalDuration := events[len(events)-1].Time

	var statsText string
	if opts.ShowStats {
		statsText = fmt.Sprintf(" %s  •  %dx%d  •  %d events",
			formatDur(totalDuration), cols, rows, len(events))
	}

	imgW := padX*2 + cols*cellW
	imgH := titleBarH + padY*2 + rows*cellH
	if opts.ShowStats {
		imgH += statsBarH
	}

	palette := buildPalette()
	screen := vt.NewScreen(cols, rows)

	frameInterval := 1.0 / opts.FrameRate
	var frames []*image.Paletted
	var delays []int

	eventIdx := 0
	var prevScreen *vt.Screen
	lastEventTime := 0.0
	hasContent := false

	for sampleTime := 0.0; sampleTime <= totalDuration+frameInterval; sampleTime += frameInterval {
		for eventIdx < len(events) && events[eventIdx].Time <= sampleTime {
			hasContent = true
			e := events[eventIdx]
			gap := e.Time - lastEventTime
			if gap > opts.IdleLimit {
				// idle compression handled by frame timing
			}
			lastEventTime = e.Time

			switch e.Type {
			case asciicast.Output:
				screen.Write([]byte(e.Data))
			case asciicast.Resize:
				var w, h int
				fmt.Sscanf(e.Data, "%dx%d", &w, &h)
				if w > 0 && h > 0 {
					screen.Resize(min(w, cols), min(h, rows))
				}
			}
			eventIdx++
		}

		// Skip frames before any events arrive (don't start with blank frames)
		if !hasContent {
			continue
		}

		if prevScreen != nil && screen.Equal(prevScreen) {
			if len(delays) > 0 {
				delays[len(delays)-1] += int(100 * frameInterval / opts.SpeedUp)
			}
			continue
		}

		// Render on RGBA, then quantize to paletted
		rgba := renderFrameRGBA(screen, imgW, imgH, cols, rows, title, statsText, opts.ShowStats)
		paletted := quantize(rgba, palette)
		frames = append(frames, paletted)
		delays = append(delays, int(100*frameInterval/opts.SpeedUp))

		prevScreen = screen.Clone()
	}

	if len(frames) == 0 {
		return fmt.Errorf("no frames generated")
	}

	for i := range delays {
		if delays[i] > 200 {
			delays[i] = 200
		}
		if delays[i] < 2 {
			delays[i] = 2
		}
	}
	delays[len(delays)-1] = 200

	// Add summary card as final frame (the "money shot" for social media)
	if opts.ShowStats {
		summary := renderSummaryFrame(palette, imgW, imgH, title, totalDuration, len(events), cols, rows)
		frames = append(frames, summary)
		delays = append(delays, 400) // hold summary for 4 seconds
	}

	return gif.EncodeAll(out, &gif.GIF{Image: frames, Delay: delays, LoopCount: 0})
}

func renderSummaryFrame(palette color.Palette, imgW, imgH int, title string, duration float64, eventCount, cols, rows int) *image.Paletted {
	img := image.NewRGBA(image.Rect(0, 0, imgW, imgH))

	// Dark background
	fillRGBA(img, 0, 0, imgW, imgH, themeBG)

	// Title bar (same chrome)
	fillRGBA(img, 0, 0, imgW, titleBarH, themeTitleBG)
	drawDotRGBA(img, dotStartX, dotCenterY, dotRadius, themeDotRed)
	drawDotRGBA(img, dotStartX+dotSpacing, dotCenterY, dotRadius, themeDotYel)
	drawDotRGBA(img, dotStartX+2*dotSpacing, dotCenterY, dotRadius, themeDotGrn)

	face := inconsolata.Regular8x16
	boldFace := inconsolata.Bold8x16

	// Center the summary content vertically
	centerY := imgH / 2

	// Title (large, centered)
	titleX := (imgW - len(title)*cellW) / 2
	if titleX < padX {
		titleX = padX
	}
	drawTextRGBA(img, titleX, centerY-40, title, themeFG, boldFace)

	// Duration prominently
	durStr := formatDur(duration)
	durX := (imgW - len(durStr)*cellW) / 2
	drawTextRGBA(img, durX, centerY, durStr, color.RGBA{80, 250, 123, 255}, boldFace)

	// Stats line
	statsLine := fmt.Sprintf("%d events  |  %dx%d", eventCount, cols, rows)
	statsX := (imgW - len(statsLine)*cellW) / 2
	drawTextRGBA(img, statsX, centerY+30, statsLine, themeDimFG, face)

	// Watermark
	watermark := "recorded with agentcast"
	wmX := (imgW - len(watermark)*cellW) / 2
	drawTextRGBA(img, wmX, imgH-padY-cellH, watermark, color.RGBA{68, 71, 90, 255}, face)

	return quantize(img, palette)
}

func renderFrameRGBA(screen *vt.Screen, imgW, imgH, cols, rows int, title, statsText string, showStats bool) *image.RGBA {
	img := image.NewRGBA(image.Rect(0, 0, imgW, imgH))

	// Fill background
	fillRGBA(img, 0, 0, imgW, imgH, themeBG)

	// Title bar
	fillRGBA(img, 0, 0, imgW, titleBarH, themeTitleBG)

	// Window dots
	drawDotRGBA(img, dotStartX, dotCenterY, dotRadius, themeDotRed)
	drawDotRGBA(img, dotStartX+dotSpacing, dotCenterY, dotRadius, themeDotYel)
	drawDotRGBA(img, dotStartX+2*dotSpacing, dotCenterY, dotRadius, themeDotGrn)

	// Title text
	drawTextRGBA(img, dotStartX+3*dotSpacing+10, dotCenterY+5, title, themeDimFG, inconsolata.Regular8x16)

	// Terminal content
	termOffX := padX
	termOffY := titleBarH + padY

	face := inconsolata.Regular8x16
	boldFace := inconsolata.Bold8x16

	for y := 0; y < min(rows, screen.Height); y++ {
		for x := 0; x < min(cols, screen.Width); x++ {
			cell := screen.Cells[y][x]
			px := termOffX + x*cellW
			py := termOffY + y*cellH

			bg := resolveColor(cell.BG, themeBG)
			if bg != themeBG {
				fillRGBA(img, px, py, cellW, cellH, bg)
			}

			if cell.Char != ' ' && cell.Char != 0 {
				fg := resolveColor(cell.FG, themeFG)
				f := face
				if cell.Bold {
					f = boldFace
				}
				drawCharRGBA(img, px, py+cellH-3, cell.Char, fg, f)
			}
		}
	}

	if showStats && statsText != "" {
		barY := imgH - statsBarH
		fillRGBA(img, 0, barY, imgW, statsBarH, themeTitleBG)
		drawTextRGBA(img, padX, barY+18, statsText, themeDimFG, inconsolata.Regular8x16)
	}

	return img
}

// quantize converts RGBA to paletted using nearest-color matching (no dithering = sharper text).
func quantize(src *image.RGBA, palette color.Palette) *image.Paletted {
	bounds := src.Bounds()
	dst := image.NewPaletted(bounds, palette)
	draw.Draw(dst, bounds, src, bounds.Min, draw.Src)
	return dst
}

func resolveColor(c vt.Color, def color.RGBA) color.RGBA {
	if c.Default {
		return def
	}
	return color.RGBA{c.R, c.G, c.B, 255}
}

func fillRGBA(img *image.RGBA, x, y, w, h int, c color.RGBA) {
	for dy := 0; dy < h; dy++ {
		for dx := 0; dx < w; dx++ {
			img.SetRGBA(x+dx, y+dy, c)
		}
	}
}

func drawDotRGBA(img *image.RGBA, cx, cy, r int, c color.RGBA) {
	for dy := -r; dy <= r; dy++ {
		for dx := -r; dx <= r; dx++ {
			if dx*dx+dy*dy <= r*r {
				img.SetRGBA(cx+dx, cy+dy, c)
			}
		}
	}
}

func drawTextRGBA(img *image.RGBA, x, y int, text string, c color.RGBA, face font.Face) {
	d := &font.Drawer{
		Dst:  img,
		Src:  image.NewUniform(c),
		Face: face,
		Dot:  fixed.P(x, y),
	}
	d.DrawString(text)
}

func drawCharRGBA(img *image.RGBA, x, y int, ch rune, c color.RGBA, face font.Face) {
	d := &font.Drawer{
		Dst:  img,
		Src:  image.NewUniform(c),
		Face: face,
		Dot:  fixed.P(x, y),
	}
	d.DrawString(string(ch))
}

func buildPalette() color.Palette {
	p := color.Palette{
		themeBG, themeFG, themeTitleBG,
		themeDotRed, themeDotYel, themeDotGrn, themeDimFG,
	}
	for _, c := range vt.AnsiColors() {
		p = append(p, color.RGBA{c.R, c.G, c.B, 255})
	}
	for _, c := range vt.AnsiBrightColors() {
		p = append(p, color.RGBA{c.R, c.G, c.B, 255})
	}
	// Grayscale ramp
	for i := 0; i < 24; i++ {
		v := uint8(i*10 + 8)
		p = append(p, color.RGBA{v, v, v, 255})
	}
	// 6x6x6 color cube (sampled)
	for r := 0; r < 6; r++ {
		for g := 0; g < 6; g += 2 {
			for b := 0; b < 6; b += 2 {
				p = append(p, color.RGBA{uint8(r * 51), uint8(g * 51), uint8(b * 51), 255})
			}
		}
	}
	p = append(p, color.RGBA{0, 0, 0, 255})
	p = append(p, color.RGBA{255, 255, 255, 255})
	return p
}

func formatDur(secs float64) string {
	m := int(secs) / 60
	s := int(secs) % 60
	if m > 0 {
		return fmt.Sprintf("%d:%02d", m, s)
	}
	return fmt.Sprintf("0:%02d", s)
}

// Stats holds session statistics extracted from a recording.
type Stats struct {
	Duration    float64
	Events      int
	OutputBytes int
	Commands    int
	Width       int
	Height      int
	Title       string
}

// ExtractStats reads a cast file and returns session stats.
func ExtractStats(castFile *os.File) (Stats, error) {
	r, err := asciicast.NewReader(castFile)
	if err != nil {
		return Stats{}, err
	}
	h := r.Header()
	st := Stats{Width: h.Width, Height: h.Height, Title: h.Title}

	var lastTime float64
	var outputBuf strings.Builder

	for {
		e, err := r.NextEvent()
		if err != nil {
			break
		}
		st.Events++
		lastTime = e.Time
		if e.Type == asciicast.Output {
			st.OutputBytes += len(e.Data)
			outputBuf.WriteString(e.Data)
		}
	}
	st.Duration = lastTime

	output := outputBuf.String()
	for _, line := range strings.Split(output, "\n") {
		line = stripANSI(line)
		line = strings.TrimSpace(line)
		if strings.HasPrefix(line, "$ ") || strings.HasPrefix(line, "❯ ") || strings.HasPrefix(line, "% ") {
			st.Commands++
		}
	}

	return st, nil
}

func stripANSI(s string) string {
	var out strings.Builder
	inEsc := false
	for _, r := range s {
		if r == 0x1b {
			inEsc = true
			continue
		}
		if inEsc {
			if (r >= 'A' && r <= 'Z') || (r >= 'a' && r <= 'z') {
				inEsc = false
			}
			continue
		}
		out.WriteRune(r)
	}
	return out.String()
}
