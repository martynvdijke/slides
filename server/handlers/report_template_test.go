package handlers

import (
	"bytes"
	"strings"
	"testing"
	"time"
)

func TestRenderEventReport_XSS(t *testing.T) {
	var buf bytes.Buffer
	data := ReportData{
		Event: ReportEvent{
			Name: "Test Event",
			Code: "test-123",
		},
		GeneratedAt: time.Now(),
		Questions: []ReportQuestion{
			{
				Prompt: `<script>alert(1)</script>`,
				Kind:   "poll",
				Total:  1,
				Results: []ReportResultRow{
					{Label: `<b>bold</b>`, Count: 1},
				},
				Options: []string{"<b>bold</b>", "safe"},
			},
		},
	}
	if err := RenderEventReport(&buf, data); err != nil {
		t.Fatalf("RenderEventReport: %v", err)
	}
	out := buf.String()
	if strings.Contains(out, "<script>") {
		t.Fatalf("output contains raw <script>, not escaped")
	}
	if !strings.Contains(out, "&lt;script&gt;") {
		t.Fatalf("output missing escaped &lt;script&gt;, got:\n%s", out)
	}
	if strings.Contains(out, "<b>bold</b>") {
		t.Fatalf("output contains raw <b> tag, not escaped")
	}
}

func TestRenderEventReport_EmptyEvent(t *testing.T) {
	var buf bytes.Buffer
	data := ReportData{
		Event:       ReportEvent{Name: "Empty", Code: "empty"},
		GeneratedAt: time.Now(),
	}
	if err := RenderEventReport(&buf, data); err != nil {
		t.Fatalf("RenderEventReport: %v", err)
	}
	out := buf.String()
	if !strings.Contains(out, "<html") || !strings.Contains(out, "</html>") {
		t.Fatalf("not valid HTML")
	}
	if !strings.Contains(out, "No questions") {
		t.Fatalf("expected empty questions placeholder")
	}
}
