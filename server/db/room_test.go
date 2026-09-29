package db

import (
	"strings"
	"testing"
)

func TestGenRoomCodeFormatAndUniqueness(t *testing.T) {
	seen := map[string]int{}
	for i := 0; i < 500; i++ {
		code, err := GenRoomCode()
		if err != nil {
			t.Fatalf("GenRoomCode() error: %v", err)
		}
		if len(code) != roomCodeLen {
			t.Fatalf("GenRoomCode() = %q, want length %d", code, roomCodeLen)
		}
		for _, r := range code {
			if !strings.ContainsRune(roomAlphabet, r) {
				t.Fatalf("GenRoomCode() = %q contains %q outside the alphabet", code, r)
			}
		}
		seen[code]++
	}
	// 500 draws from a 32^5 space should be essentially all distinct.
	if len(seen) < 490 {
		t.Fatalf("only %d unique codes out of 500; generator looks weak", len(seen))
	}
}

func TestNormalizeRoomCode(t *testing.T) {
	cases := map[string]string{
		"  ab2c3 ":  "AB2C3",
		"AB2C3":     "AB2C3",
		"ab2c3":     "AB2C3",
		"\tZx9Yw\n": "ZX9YW",
	}
	for in, want := range cases {
		if got := NormalizeRoomCode(in); got != want {
			t.Errorf("NormalizeRoomCode(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestRoomCodeLookupRoundTrip(t *testing.T) {
	tmpDB(t)

	ev, err := CreateEvent("Room Test", "room-test", "", "")
	if err != nil {
		t.Fatalf("CreateEvent: %v", err)
	}
	if ev.RoomCode != "" {
		t.Fatalf("fresh event room_code = %q, want empty", ev.RoomCode)
	}

	code, err := GenRoomCode()
	if err != nil {
		t.Fatalf("GenRoomCode: %v", err)
	}
	if exists, err := RoomCodeExists(code); err != nil || exists {
		t.Fatalf("RoomCodeExists(%q) = %v, %v; want false, nil", code, exists, err)
	}
	if err := SetEventRoomCode(ev.ID, code); err != nil {
		t.Fatalf("SetEventRoomCode: %v", err)
	}
	if exists, err := RoomCodeExists(code); err != nil || !exists {
		t.Fatalf("RoomCodeExists after set = %v, %v; want true, nil", exists, err)
	}

	// Lookup is case- and whitespace-insensitive.
	got, err := GetEventByRoomCode(strings.ToLower(" " + code + " "))
	if err != nil {
		t.Fatalf("GetEventByRoomCode: %v", err)
	}
	if got.ID != ev.ID || got.RoomCode != code {
		t.Fatalf("GetEventByRoomCode returned id=%d room=%q, want id=%d room=%q", got.ID, got.RoomCode, ev.ID, code)
	}

	if _, err := GetEventByRoomCode(""); err == nil {
		t.Fatal("GetEventByRoomCode(\"\") should error")
	}
}

func TestBackfillRoomCodes(t *testing.T) {
	tmpDB(t)

	// Two events created without a room code.
	a, err := CreateEvent("Backfill A", "backfill-a", "", "")
	if err != nil {
		t.Fatalf("CreateEvent A: %v", err)
	}
	b, err := CreateEvent("Backfill B", "backfill-b", "", "")
	if err != nil {
		t.Fatalf("CreateEvent B: %v", err)
	}

	if err := backfillRoomCodes(); err != nil {
		t.Fatalf("backfillRoomCodes: %v", err)
	}

	for _, id := range []int64{a.ID, b.ID} {
		ev, err := GetEventByID(id)
		if err != nil {
			t.Fatalf("GetEventByID(%d): %v", id, err)
		}
		if len(ev.RoomCode) != roomCodeLen {
			t.Fatalf("event %d room_code = %q, want %d chars", id, ev.RoomCode, roomCodeLen)
		}
		if exists, err := RoomCodeExists(ev.RoomCode); err != nil || !exists {
			t.Fatalf("backfilled code %q should resolve: %v, %v", ev.RoomCode, exists, err)
		}
	}
}
