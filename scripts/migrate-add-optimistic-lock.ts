import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.resolve(__dirname, '../data');
const dbPath = path.join(dataDir, 'cold-chain.db');

if (!fs.existsSync(dbPath)) {
  console.error('数据库文件不存在，请先运行 db:init 初始化数据库');
  process.exit(1);
}

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

console.log('开始迁移：添加乐观锁 version 字段...');

const migrations = [
  {
    name: '添加 version 字段到 delivery_nodes',
    sql: `ALTER TABLE delivery_nodes ADD COLUMN version INTEGER DEFAULT 1`,
  },
  {
    name: '为现有记录填充 version',
    sql: `UPDATE delivery_nodes SET version = 1 WHERE version IS NULL`,
  },
  {
    name: '创建 version 索引',
    sql: `CREATE INDEX IF NOT EXISTS idx_nodes_version ON delivery_nodes(id, version)`,
  },
];

for (const migration of migrations) {
  try {
    db.exec(migration.sql);
    console.log(`✓ ${migration.name}`);
  } catch (error) {
    if ((error as Error).message.includes('duplicate column name') || 
        (error as Error).message.includes('already exists')) {
      console.log(`⊘ ${migration.name} (已存在，跳过)`);
    } else {
      console.error(`✗ ${migration.name} 失败:`, (error as Error).message);
      db.close();
      process.exit(1);
    }
  }
}

console.log('\n迁移完成！');
db.close();
