import type { Database } from 'better-sqlite3';

export const id = 'V005__exception_workorder';
export const description = '异常工单相关字段和处理记录表';

function columnExists(db: Database, table: string, column: string): boolean {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  return columns.some(col => col.name === column);
}

export function up(db: Database): void {
  if (!columnExists(db, 'exception_handlings', 'escalation_level')) {
    db.exec(`
      ALTER TABLE exception_handlings 
      ADD COLUMN escalation_level VARCHAR(20) NOT NULL DEFAULT 'level_1' 
      CHECK (escalation_level IN ('level_1', 'level_2', 'level_3'))
    `);
  }

  if (!columnExists(db, 'exception_handlings', 'assignee_id')) {
    db.exec(`ALTER TABLE exception_handlings ADD COLUMN assignee_id VARCHAR(36) REFERENCES users(id)`);
  }

  if (!columnExists(db, 'exception_handlings', 'is_closed')) {
    db.exec(`ALTER TABLE exception_handlings ADD COLUMN is_closed BOOLEAN NOT NULL DEFAULT 0`);
  }

  if (!columnExists(db, 'exception_handlings', 'closed_by')) {
    db.exec(`ALTER TABLE exception_handlings ADD COLUMN closed_by VARCHAR(36) REFERENCES users(id)`);
  }

  if (!columnExists(db, 'exception_handlings', 'closed_at')) {
    db.exec(`ALTER TABLE exception_handlings ADD COLUMN closed_at DATETIME`);
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS exception_processing_notes (
      id VARCHAR(36) PRIMARY KEY,
      exception_handling_id VARCHAR(36) NOT NULL REFERENCES exception_handlings(id) ON DELETE CASCADE,
      note TEXT NOT NULL,
      created_by VARCHAR(36) REFERENCES users(id),
      created_by_name VARCHAR(100),
      action_type VARCHAR(30) NOT NULL CHECK (action_type IN (
        'create', 'assign', 'escalate', 'add_note', 'update_status', 'close', 'reopen'
      )),
      old_value TEXT,
      new_value TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  const indexes = [
    'CREATE INDEX IF NOT EXISTS idx_exception_assignee ON exception_handlings(assignee_id)',
    'CREATE INDEX IF NOT EXISTS idx_exception_closed ON exception_handlings(is_closed)',
    'CREATE INDEX IF NOT EXISTS idx_exception_escalation ON exception_handlings(escalation_level)',
    'CREATE INDEX IF NOT EXISTS idx_processing_notes_exception ON exception_processing_notes(exception_handling_id)',
    'CREATE INDEX IF NOT EXISTS idx_processing_notes_created ON exception_processing_notes(created_at)',
  ];

  indexes.forEach(sql => db.exec(sql));
}
