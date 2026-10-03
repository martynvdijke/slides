package handlers

import (
	"html/template"
	"io"
	"time"
)

// ReportData is the frozen contract for event report rendering.
type ReportData struct {
	Event       ReportEvent
	GeneratedAt time.Time
	Questions   []ReportQuestion
	Feedback    []ReportQuestion
	QA          []ReportQA
	Leaderboard []ReportLeaderboardRow
	Stats       map[string]any
}

type ReportEvent struct {
	Name        string
	Code        string
	Description string
	Date        string
	Status      string
	Brand       string
}

type ReportResultRow struct {
	Label string
	Count int
}

type ReportQuestion struct {
	Prompt       string
	Kind         string
	Total        int
	Results      []ReportResultRow
	NPS          *float64
	AvgRank      *float64
	CorrectIndex *int
	ShowResults  bool
	Options      []string
}

type ReportQA struct {
	Body   string
	Author string
	Votes  int
}

type ReportLeaderboardRow struct {
	Rank   int
	Name   string
	Emoji  string
	Color  string
	Points int
}

const reportTemplateSrc = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Report - {{.Event.Name}}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#111;background:#fff;line-height:1.5;padding:24px;max-width:900px;margin:0 auto}
h1{font-size:1.8rem;margin-bottom:4px}
h2{font-size:1.25rem;margin:24px 0 12px;border-bottom:2px solid #111;padding-bottom:4px;page-break-after:avoid}
h3{font-size:1rem;margin:16px 0 8px;page-break-after:avoid}
.event-header{border:1px solid #ccc;padding:16px;border-radius:8px;background:#fafafa;margin-bottom:16px;page-break-inside:avoid}
.event-header dt{font-weight:600}
.event-header dd{margin-bottom:4px}
.muted{color:#666;font-size:.9rem}
.badge{display:inline-block;padding:2px 8px;border-radius:999px;font-size:.8rem;background:#eee;border:1px solid #ccc}
.correct{color:#0a7a00;font-weight:700;margin-left:6px}
.bar-row{display:flex;align-items:center;gap:8px;margin:4px 0}
.bar-label{flex:0 0 160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:.9rem}
.bar-track{flex:1;height:18px;background:#e5e7eb;border-radius:4px;overflow:hidden}
.bar-fill{height:100%;background:#111;display:block}
.bar-count{flex:0 0 80px;text-align:right;font-size:.85rem;color:#333}
.option-list{list-style:disc;margin-left:20px;font-size:.9rem}
.qa-item{border:1px solid #e5e7eb;padding:10px 12px;border-radius:6px;margin-bottom:8px;page-break-inside:avoid}
.leaderboard{width:100%;border-collapse:collapse;margin-top:8px}
.leaderboard th,.leaderboard td{border:1px solid #ddd;padding:6px 8px;text-align:left;font-size:.9rem}
.leaderboard th{background:#f3f4f6}
.swatch{display:inline-block;width:14px;height:14px;border-radius:3px;border:1px solid #ccc;vertical-align:middle;margin-right:4px}
.stats-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:8px}
.stat-card{border:1px solid #e5e7eb;padding:8px 10px;border-radius:6px;background:#fafafa}
.stat-card .k{font-size:.8rem;color:#666}
.stat-card .v{font-weight:700}
.question-card{border:1px solid #e5e7eb;padding:12px;border-radius:8px;margin-bottom:12px;page-break-inside:avoid}
.wordcloud{display:flex;flex-wrap:wrap;gap:6px;margin-top:6px}
.wordcloud span{background:#f3f4f6;border:1px solid #e5e7eb;padding:2px 8px;border-radius:999px;font-size:.85rem}
@media print{
  body{padding:0}
  .question-card,.event-header,.qa-item{break-inside:avoid}
  h2{break-after:avoid}
}
</style>
</head>
<body>
<div class="event-header">
<h1>{{.Event.Name}}</h1>
<p class="muted">Code: {{.Event.Code}} {{if .Event.Brand}}| Brand: {{.Event.Brand}}{{end}} {{if .Event.Status}}| Status: {{.Event.Status}}{{end}}</p>
{{if .Event.Description}}<p>{{.Event.Description}}</p>{{end}}
{{if .Event.Date}}<p><strong>Date:</strong> {{.Event.Date}}</p>{{end}}
<p class="muted">Generated at {{.GeneratedAt}}</p>
</div>

{{if .Stats}}
<h2>Stats summary</h2>
<div class="stats-grid">
{{range $k, $v := .Stats}}<div class="stat-card"><div class="k">{{$k}}</div><div class="v">{{$v}}</div></div>{{end}}
</div>
{{end}}

<h2>Questions ({{len .Questions}})</h2>
{{if .Questions}}
{{range $qi, $q := .Questions}}
<div class="question-card">
<h3>{{$q.Prompt}} <span class="badge">{{$q.Kind}}</span> {{if $q.CorrectIndex}}{{if $q.ShowResults}}<span class="correct">&#x2713; correct option {{derefInt $q.CorrectIndex}}</span>{{end}}{{end}}</h3>
<p class="muted">Total responses: {{$q.Total}} {{if $q.NPS}}| NPS: {{printf "%.1f" (derefFloat $q.NPS)}}{{end}} {{if $q.AvgRank}}| Avg rank: {{printf "%.2f" (derefFloat $q.AvgRank)}}{{end}}</p>
{{if $q.Results}}
{{range $r := $q.Results}}
<div class="bar-row">
<span class="bar-label">{{$r.Label}} {{if isCorrect $q $r}}<span class="correct">&#x2713; correct</span>{{end}}</span>
<span class="bar-track"><span class="bar-fill" style="width:{{pct $r.Count $q.Results}}%"></span></span>
<span class="bar-count">{{$r.Count}}</span>
</div>
{{end}}
{{else}}
{{if $q.Options}}
<ul class="option-list">
{{range $opt := $q.Options}}<li>{{$opt}} {{if isCorrectOpt $q $opt}}<span class="correct">&#x2713; correct</span>{{end}}</li>{{end}}
</ul>
{{else}}
<p class="muted">No responses yet.</p>
{{end}}
{{end}}
{{if $q.Options}}
{{if not $q.Results}}
{{/* options already shown above when no results */}}
{{else}}
{{/* also show wordcloud-style option pills when there are results and kind is wordcloud/open */}}
{{end}}
{{end}}
</div>
{{end}}
{{else}}
<p class="muted">No questions.</p>
{{end}}

<h2>Feedback ({{len .Feedback}})</h2>
{{if .Feedback}}
{{range $q := .Feedback}}
<div class="question-card">
<h3>{{$q.Prompt}} <span class="badge">{{$q.Kind}}</span></h3>
<p class="muted">Total responses: {{$q.Total}} {{if $q.NPS}}| NPS: {{printf "%.1f" (derefFloat $q.NPS)}}{{end}} {{if $q.AvgRank}}| Avg rank: {{printf "%.2f" (derefFloat $q.AvgRank)}}{{end}}</p>
{{if $q.Results}}
{{range $r := $q.Results}}<div class="bar-row"><span class="bar-label">{{$r.Label}}</span><span class="bar-track"><span class="bar-fill" style="width:{{pct $r.Count $q.Results}}%"></span></span><span class="bar-count">{{$r.Count}}</span></div>{{end}}
{{else}}
{{if $q.Options}}<ul class="option-list">{{range $opt := $q.Options}}<li>{{$opt}}</li>{{end}}</ul>{{else}}<p class="muted">No responses yet.</p>{{end}}
{{end}}
</div>
{{end}}
{{else}}
<p class="muted">No feedback questions.</p>
{{end}}

<h2>Q&amp;A ({{len .QA}})</h2>
{{if .QA}}
{{range $qa := .QA}}<div class="qa-item"><p>{{$qa.Body}}</p><p class="muted">— {{$qa.Author}} · {{$qa.Votes}} votes</p></div>{{end}}
{{else}}
<p class="muted">No Q&amp;A.</p>
{{end}}

<h2>Leaderboard ({{len .Leaderboard}})</h2>
{{if .Leaderboard}}
<table class="leaderboard">
<thead><tr><th>#</th><th>Name</th><th>Points</th></tr></thead>
<tbody>
{{range $row := .Leaderboard}}<tr><td>{{$row.Rank}}</td><td>{{if $row.Color}}<span class="swatch" style="background:{{$row.Color}}"></span>{{end}}{{$row.Emoji}} {{$row.Name}}</td><td>{{$row.Points}}</td></tr>{{end}}
</tbody>
</table>
{{else}}
<p class="muted">No leaderboard entries.</p>
{{end}}

</body>
</html>
`

var reportTmpl = template.Must(template.New("report").Funcs(template.FuncMap{
	"pct": func(count int, results []ReportResultRow) int {
		max := 0
		for _, r := range results {
			if r.Count > max {
				max = r.Count
			}
		}
		if max == 0 {
			return 0
		}
		return count * 100 / max
	},
	"derefFloat": func(p *float64) float64 {
		if p == nil {
			return 0
		}
		return *p
	},
	"derefInt": func(p *int) int {
		if p == nil {
			return 0
		}
		return *p
	},
	"isCorrect": func(q ReportQuestion, r ReportResultRow) bool {
		if q.CorrectIndex == nil || !q.ShowResults {
			return false
		}
		idx := *q.CorrectIndex
		if idx < 0 || idx >= len(q.Options) {
			return false
		}
		return q.Options[idx] == r.Label
	},
	"isCorrectOpt": func(q ReportQuestion, opt string) bool {
		if q.CorrectIndex == nil || !q.ShowResults {
			return false
		}
		idx := *q.CorrectIndex
		if idx < 0 || idx >= len(q.Options) {
			return false
		}
		return q.Options[idx] == opt
	},
}).Parse(reportTemplateSrc))

// RenderEventReport renders the event report HTML to w.
func RenderEventReport(w io.Writer, data ReportData) error {
	if data.Questions == nil {
		data.Questions = []ReportQuestion{}
	}
	if data.Feedback == nil {
		data.Feedback = []ReportQuestion{}
	}
	if data.QA == nil {
		data.QA = []ReportQA{}
	}
	if data.Leaderboard == nil {
		data.Leaderboard = []ReportLeaderboardRow{}
	}
	return reportTmpl.Execute(w, data)
}
