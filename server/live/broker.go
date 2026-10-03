package live

import (
	"encoding/json"
	"sync"
	"sync/atomic"
	"time"
)

type Frame struct {
	Kind string
	Data []byte
}

const (
	KindRefresh   = "refresh"
	KindReactions = "reactions"
)

type Broker struct {
	mu      sync.Mutex
	subs    map[string]map[chan Frame]struct{}
	closed  bool
	dropped atomic.Uint64

	rMu       sync.Mutex
	reactions map[string]map[string]int
	timers    map[string]*time.Timer
}

func New() *Broker {
	return &Broker{
		subs:      make(map[string]map[chan Frame]struct{}),
		reactions: make(map[string]map[string]int),
		timers:    make(map[string]*time.Timer),
	}
}

func (b *Broker) Subscribe(event string) (<-chan Frame, func()) {
	ch := make(chan Frame, 16)
	b.mu.Lock()
	defer b.mu.Unlock()
	if b.closed {
		close(ch)
		return ch, func() {}
	}
	m, ok := b.subs[event]
	if !ok {
		m = make(map[chan Frame]struct{})
		b.subs[event] = m
	}
	m[ch] = struct{}{}
	var once sync.Once
	unsub := func() {
		once.Do(func() {
			b.mu.Lock()
			defer b.mu.Unlock()
			if m2, ok := b.subs[event]; ok {
				if _, exists := m2[ch]; exists {
					delete(m2, ch)
					if len(m2) == 0 {
						delete(b.subs, event)
					}
					close(ch)
				}
			}
		})
	}
	return ch, unsub
}

func (b *Broker) Broadcast(event string, payload []byte) {
	b.broadcastFrame(event, Frame{Kind: KindRefresh, Data: payload})
}

func (b *Broker) broadcastFrame(event string, f Frame) {
	b.mu.Lock()
	defer b.mu.Unlock()
	if b.closed {
		return
	}
	m, ok := b.subs[event]
	if !ok {
		return
	}
	for ch := range m {
		cp := make([]byte, len(f.Data))
		copy(cp, f.Data)
		fr := Frame{Kind: f.Kind, Data: cp}
		select {
		case ch <- fr:
		default:
			b.dropped.Add(1)
		}
	}
}

func (b *Broker) AddReaction(event, emoji string) {
	b.rMu.Lock()
	defer b.rMu.Unlock()
	if b.reactions[event] == nil {
		b.reactions[event] = make(map[string]int)
	}
	total := 0
	for _, v := range b.reactions[event] {
		total += v
	}
	if total >= 500 {
		return
	}
	b.reactions[event][emoji]++
	if _, ok := b.timers[event]; !ok {
		t := time.AfterFunc(150*time.Millisecond, func() { b.flushReactions(event) })
		b.timers[event] = t
	}
}

func (b *Broker) flushReactions(event string) {
	b.rMu.Lock()
	counts := b.reactions[event]
	delete(b.reactions, event)
	delete(b.timers, event)
	b.rMu.Unlock()
	if len(counts) == 0 {
		return
	}
	broadcastReactionsImpl(b, event, counts)
}

func broadcastReactionsImpl(b *Broker, event string, counts map[string]int) {
	type rc struct {
		Emoji string `json:"emoji"`
		Count int    `json:"count"`
	}
	var list []rc
	for e, c := range counts {
		list = append(list, rc{Emoji: e, Count: c})
	}
	inner, _ := json.Marshal(list)
	env := map[string]any{"type": "reactions", "data": json.RawMessage(inner)}
	// Actually envelope field is data: we can just marshal envelope
	data, _ := json.Marshal(env)
	b.broadcastFrame(event, Frame{Kind: KindReactions, Data: data})
}

func (b *Broker) Subscribers(event string) int {
	b.mu.Lock()
	defer b.mu.Unlock()
	return len(b.subs[event])
}

func (b *Broker) DroppedTotal() uint64 { return b.dropped.Load() }

func (b *Broker) Close() {
	b.mu.Lock()
	defer b.mu.Unlock()
	if b.closed {
		return
	}
	b.closed = true
	for _, m := range b.subs {
		for ch := range m {
			close(ch)
		}
	}
	b.subs = make(map[string]map[chan Frame]struct{})
	b.rMu.Lock()
	for _, t := range b.timers {
		t.Stop()
	}
	b.timers = make(map[string]*time.Timer)
	b.reactions = make(map[string]map[string]int)
	b.rMu.Unlock()
}
