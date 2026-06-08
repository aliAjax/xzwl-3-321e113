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

console.log('开始迁移：添加 client_submit_id 和 updated_at 字段...');

const migrations = [
  {
    name: '添加 client_submit_id 字段到 delivery_nodes',
    sql: `ALTER TABLE delivery_nodes ADD COLUMN client_submit_id VARCHAR(64)`,
  },
  {
    name: '添加 updated_at 字段到 delivery_nodes',
    sql: `ALTER TABLE delivery_nodes ADD COLUMN updated_at DATETIME`,
  },
  {
    name: '为现有记录填充 updated_at',
    sql: `UPDATE delivery_nodes SET updated_at = created_at WHERE updated_at IS NULL`,
  },
  {
    name: '创建 client_submit_id 唯一索引',
    sql: `CREATE UNIQUE INDEX IF NOT EXISTS idx_nodes_client_submit_id ON delivery_nodes(client_submit_id) WHERE client_submit_id IS NOT NULL`,
  },
  {
    name: '创建 updated_at 索引',
    sql: `CREATE INDEX IF NOT EXISTS idx_nodes_updated ON delivery_nodes(updated_at)`,
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
