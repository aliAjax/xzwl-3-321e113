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
   ADD COLUMN sla_deadline DATETIME`,
];

const indexes = [
  'CREATE INDEX IF NOT EXISTS idx_exception_sla_deadline ON exception_handlings(sla_deadline)',
];

console.log('开始迁移 SLA 截止时间字段...');

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
