import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.resolve(__dirname, '../data');
const dbPath = path.join(dataDir, 'cold-chain.db');

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

const migrations = [
  `ALTER TABLE exception_handlings 
   ADD COLUMN escalation_level VARCHAR(20) NOT NULL DEFAULT 'level_1' 
   CHECK (escalation_level IN ('level_1', 'level_2', 'level_3'))`,
  
  `ALTER TABLE exception_handlings 
   ADD COLUMN assignee_id VARCHAR(36) REFERENCES users(id)`,
  
  `ALTER TABLE exception_handlings 
   ADD COLUMN is_closed BOOLEAN NOT NULL DEFAULT 0`,

  `ALTER TABLE exception_handlings 
   ADD COLUMN closed_by VARCHAR(36) REFERENCES users(id)`,

  `ALTER TABLE exception_handlings 
   ADD COLUMN closed_at DATETIME`,
  
  `CREATE TABLE IF NOT EXISTS exception_processing_notes (
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
  )`,
];

const indexes = [
  'CREATE INDEX IF NOT EXISTS idx_exception_assignee ON exception_handlings(assignee_id)',
  'CREATE INDEX IF NOT EXISTS idx_exception_closed ON exception_handlings(is_closed)',
  'CREATE INDEX IF NOT EXISTS idx_exception_escalation ON exception_handlings(escalation_level)',
  'CREATE INDEX IF NOT EXISTS idx_processing_notes_exception ON exception_processing_notes(exception_handling_id)',
  'CREATE INDEX IF NOT EXISTS idx_processing_notes_created ON exception_processing_notes(created_at)',
];

console.log('开始迁移异常工单表结构...');

migrations.forEach((sql, index) => {
  try {
    db.exec(sql);
    console.log(`✓ 执行迁移 ${index + 1}/${migrations.length}`);
  } catch (error) {
    if ((error as Error).message.includes('duplicate column name') || 
        (error as Error).message.includes('already exists')) {
      console.log(`- 迁移 ${index + 1} 已存在，跳过`);
    } else {
      console.error(`✗ 迁移 ${index + 1} 失败:`, error);
    }
  }
});

indexes.forEach((sql, index) => {
  try {
    db.exec(sql);
    console.log(`✓ 创建索引 ${index + 1}/${indexes.length}`);
  } catch (error) {
    console.error(`✗ 索引 ${index + 1} 失败:`, error);
  }
});

console.log('数据库迁移完成！');
db.close();
