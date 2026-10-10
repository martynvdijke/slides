package db

import "testing"

func TestEnsureEventIdempotent(t *testing.T) {
	tmpDB(t)

	first, created, err := EnsureEvent("feature-test", "Feature test", "seeded")
	if err != nil {
		t.Fatalf("EnsureEvent create: %v", err)
	}
	if !created {
		t.Fatal("first EnsureEvent should report created=true")
	}
	if first.Code != "feature-test" || first.Name != "Feature test" {
		t.Fatalf("unexpected event: code=%q name=%q", first.Code, first.Name)
	}
	if len(first.RoomCode) != roomCodeLen {
		t.Fatalf("room_code = %q, want %d chars", first.RoomCode, roomCodeLen)
	}
	if exists, err := RoomCodeExists(first.RoomCode); err != nil || !exists {
		t.Fatalf("seeded room code %q should resolve: exists=%v err=%v", first.RoomCode, exists, err)
	}

	second, created2, err := EnsureEvent("feature-test", "Feature test", "seeded")
	if err != nil {
		t.Fatalf("EnsureEvent second: %v", err)
	}
	if created2 {
		t.Fatal("second EnsureEvent should report created=false")
	}
	if second.ID != first.ID || second.RoomCode != first.RoomCode {
		t.Fatalf("second call changed the event: id %d->%d room %q->%q", first.ID, second.ID, first.RoomCode, second.RoomCode)
	}

	// The room code resolves back to the event.
	resolved, err := GetEventByRoomCode(first.RoomCode)
	if err != nil {
		t.Fatalf("GetEventByRoomCode: %v", err)
	}
	if resolved.Code != "feature-test" {
		t.Fatalf("resolved code = %q, want feature-test", resolved.Code)
	}
}
