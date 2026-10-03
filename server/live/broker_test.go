package live

import (
	"testing"
	"time"
)

func TestMultipleSubscribers(t *testing.T) {
	b := New()
	ch1, _ := b.Subscribe("ev")
	ch2, _ := b.Subscribe("ev")
	ch3, _ := b.Subscribe("ev")
	b.Broadcast("ev", []byte("hello"))
	for i, ch := range []<-chan Frame{ch1, ch2, ch3} {
		select {
		case v := <-ch:
			if string(v.Data) != "hello" || v.Kind != KindRefresh {
				t.Fatalf("sub %d got %q kind %q", i, v.Data, v.Kind)
			}
		case <-time.After(200 * time.Millisecond):
			t.Fatalf("sub %d timeout", i)
		}
	}
}

func TestUnsubscribeStopsDelivery(t *testing.T) {
	b := New()
	ch, unsub := b.Subscribe("ev")
	unsub()
	if n := b.Subscribers("ev"); n != 0 {
		t.Fatalf("expected 0 subs got %d", n)
	}
	b.Broadcast("ev", []byte("x"))
	select {
	case v, ok := <-ch:
		if ok {
			t.Fatalf("expected closed channel, got %q", v)
		}
	case <-time.After(50 * time.Millisecond):
		t.Fatalf("channel not closed after unsubscribe")
	}
	b.Broadcast("ev", []byte("y"))
}

func TestUnsubscribeIdempotent(t *testing.T) {
	b := New()
	_, unsub := b.Subscribe("ev")
	unsub()
	unsub()
	unsub()
	if n := b.Subscribers("ev"); n != 0 {
		t.Fatalf("expected 0 got %d", n)
	}
}

func TestDropNewest(t *testing.T) {
	b := New()
	ch, _ := b.Subscribe("ev")
	for i := range 20 {
		b.Broadcast("ev", []byte{byte(i)})
	}
	var got [][]byte
loop:
	for {
		select {
		case v, ok := <-ch:
			if !ok {
				break loop
			}
			got = append(got, v.Data)
			if len(got) > 20 {
				t.Fatal("too many")
			}
		default:
			break loop
		}
	}
	if len(got) != 16 {
		t.Fatalf("expected 16 got %d", len(got))
	}
	for i, v := range got {
		if v[0] != byte(i) {
			t.Fatalf("idx %d expected %d got %d", i, i, v[0])
		}
	}
	if d := b.DroppedTotal(); d != 4 {
		t.Fatalf("expected dropped 4 got %d", d)
	}
}

func TestSubscribersCounts(t *testing.T) {
	b := New()
	if n := b.Subscribers("ev"); n != 0 {
		t.Fatalf("expected 0 got %d", n)
	}
	_, u1 := b.Subscribe("ev")
	if n := b.Subscribers("ev"); n != 1 {
		t.Fatalf("expected 1 got %d", n)
	}
	_, u2 := b.Subscribe("ev")
	if n := b.Subscribers("ev"); n != 2 {
		t.Fatalf("expected 2 got %d", n)
	}
	if n := b.Subscribers("other"); n != 0 {
		t.Fatalf("expected 0 got %d", n)
	}
	u1()
	if n := b.Subscribers("ev"); n != 1 {
		t.Fatalf("expected 1 got %d", n)
	}
	u2()
	if n := b.Subscribers("ev"); n != 0 {
		t.Fatalf("expected 0 got %d", n)
	}
}

func TestClose(t *testing.T) {
	b := New()
	ch1, _ := b.Subscribe("ev")
	ch2, _ := b.Subscribe("other")
	b.Close()
	for i, ch := range []<-chan Frame{ch1, ch2} {
		select {
		case _, ok := <-ch:
			if ok {
				t.Fatalf("ch %d expected closed", i)
			}
		case <-time.After(200 * time.Millisecond):
			t.Fatalf("ch %d not closed", i)
		}
	}
	b.Broadcast("ev", []byte("x"))
	ch3, unsub := b.Subscribe("ev")
	select {
	case _, ok := <-ch3:
		if ok {
			t.Fatal("expected closed channel after Close")
		}
	case <-time.After(200 * time.Millisecond):
		t.Fatal("Subscribe after Close didn't return closed channel")
	}
	unsub()
	b.Close()
	b.Broadcast("ev", nil)
}

func TestPayloadCopied(t *testing.T) {
	b := New()
	ch, _ := b.Subscribe("ev")
	payload := []byte("hello")
	b.Broadcast("ev", payload)
	payload[0] = 'X'
	select {
	case v := <-ch:
		if string(v.Data) != "hello" {
			t.Fatalf("expected copy got %q", v.Data)
		}
	case <-time.After(200 * time.Millisecond):
		t.Fatal("timeout")
	}
}
