import sqlite3
from datetime import datetime, timezone
from backend.models import AgentEvent


def now():
    return datetime.now(timezone.utc).isoformat()


class AuditLog:
    def __init__(self, path):
        self.path = str(path)
        with self.connect() as db:
            db.executescript('''
            CREATE TABLE IF NOT EXISTS runs (run_id TEXT PRIMARY KEY, scenario_id TEXT NOT NULL, policy_mode TEXT NOT NULL, version TEXT NOT NULL, status TEXT NOT NULL, created_at TEXT NOT NULL, completed_at TEXT);
            CREATE TABLE IF NOT EXISTS events (event_id TEXT PRIMARY KEY, run_id TEXT NOT NULL REFERENCES runs(run_id), sequence_number INTEGER NOT NULL CHECK(sequence_number > 0), data TEXT NOT NULL, UNIQUE(run_id, sequence_number));
            CREATE TRIGGER IF NOT EXISTS events_sequence BEFORE INSERT ON events WHEN NEW.sequence_number != COALESCE((SELECT MAX(sequence_number) + 1 FROM events WHERE run_id=NEW.run_id), 1) BEGIN SELECT RAISE(ABORT, 'invalid sequence'); END;
            CREATE TRIGGER IF NOT EXISTS events_no_replace BEFORE INSERT ON events WHEN EXISTS (SELECT 1 FROM events WHERE event_id=NEW.event_id OR (run_id=NEW.run_id AND sequence_number=NEW.sequence_number)) BEGIN SELECT RAISE(ABORT, 'duplicate event'); END;
            CREATE TRIGGER IF NOT EXISTS events_no_update BEFORE UPDATE ON events BEGIN SELECT RAISE(ABORT, 'append only'); END;
            CREATE TRIGGER IF NOT EXISTS events_no_delete BEFORE DELETE ON events BEGIN SELECT RAISE(ABORT, 'append only'); END;
            ''')

    def connect(self):
        db = sqlite3.connect(self.path, timeout=10)
        db.row_factory = sqlite3.Row
        db.execute('PRAGMA foreign_keys=ON')
        return db

    def create_run(self, run_id, scenario_id, mode, version):
        with self.connect() as db:
            db.execute('INSERT INTO runs VALUES (?, ?, ?, ?, ?, ?, NULL)', (run_id, scenario_id, mode, version, 'RUNNING', now()))

    def append(self, event):
        with self.connect() as db:
            db.execute('INSERT INTO events VALUES (?, ?, ?, ?)', (event.event_id, event.run_id, event.sequence_number, event.model_dump_json()))

    def finish(self, run_id, status):
        with self.connect() as db:
            db.execute('UPDATE runs SET status=?, completed_at=? WHERE run_id=?', (status, now(), run_id))

    def run(self, run_id):
        with self.connect() as db:
            row = db.execute('SELECT * FROM runs WHERE run_id=?', (run_id,)).fetchone()
            return dict(row) if row else None

    def events(self, run_id):
        with self.connect() as db:
            return [AgentEvent.model_validate_json(row[0]) for row in db.execute('SELECT data FROM events WHERE run_id=? ORDER BY sequence_number', (run_id,))]
