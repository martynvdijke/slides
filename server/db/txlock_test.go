package db

import (
	"database/sql"
	"strings"
	"testing"
)

// TestTransactionsBeginImmediate is the regression guard for the WAL
// read-then-write upgrade race behind the intermittent "activate question"
// failure. A deferred transaction that runs a SELECT and later an UPDATE can
// be rejected instantly with SQLITE_BUSY (snapshot) if another writer commits
// in between, and busy_timeout does not retry that. The DSN sets
// _txlock=immediate so DB.Begin() acquires the write lock up front, which
// turns a competing writer into a waiter instead of a failed activate.
//
// The test holds a transaction open after only a *read*: under the old
// deferred behaviour a second connection could still write; under
// BEGIN IMMEDIATE the write lock is already held, so the competing write must
// block and then fail with a busy/locked error.
func TestTransactionsBeginImmediate(t *testing.T) {
	path := tmpDB(t)

	tx, err := DB.Begin()
	if err != nil {
		t.Fatalf("Begin: %v", err)
	}
	defer tx.Rollback()
	var n int
	if err := tx.QueryRow("SELECT COUNT(*) FROM questions").Scan(&n); err != nil {
		t.Fatalf("tx read: %v", err)
	}

	// A second handle with a tiny busy timeout: the competing write must be
	// refused promptly while the read-only-so-far transaction is open.
	other, err := sql.Open("sqlite", path+"?_pragma=busy_timeout(25)&_pragma=journal_mode(WAL)")
	if err != nil {
		t.Fatalf("open second handle: %v", err)
	}
	defer other.Close()

	_, err = other.Exec("UPDATE events SET show_podium=0")
	if err == nil {
		t.Fatal("competing write succeeded while a transaction was open: transactions are not BEGIN IMMEDIATE")
	}
	msg := strings.ToLower(err.Error())
	if !strings.Contains(msg, "locked") && !strings.Contains(msg, "busy") {
		t.Fatalf("competing write error = %v, want a SQLITE_BUSY/locked error", err)
	}
}
