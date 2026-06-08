import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { calculateSlaDeadline } from '../shared/types.js';
import type { TemperatureZone, NodeType, EscalationLevel } from '../shared/types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.resolve(__dirname, '../data');
const dbPath = path.join(dataDir, 'cold-chain.db');

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

if (!fs.existsSync(dbPath)) {
  console.log('数据库不存在，跳过迁移');
  process.exit(0);
}

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

console.log('开始迁移 SLA 截止时间字段...');

try {
  const addColumnSql = `ALTER TABLE exception_handlings ADD COLUMN sla_deadline DATETIME`;
  db.exec(addColumnSql);
  console.log('✓ 添加 sla_deadline 列成功');
} catch (error) {
  const errMsg = (error as Error).message;
  if (errMsg.includes('duplicate column name') || errMsg.includes('already exists')) {
    console.log('- sla_deadline 列已存在，跳过添加');
  } else {
    console.error('✗ 添加 sla_deadline 列失败:', error);
  }
}

try {
  const indexSql = 'CREATE INDEX IF NOT EXISTS idx_exception_sla_deadline ON exception_handlings(sla_deadline)';
  db.exec(indexSql);
  console.log('✓ 创建索引成功');
} catch (error) {
  console.error('✗ 创建索引失败:', error);
}

console.log('\n开始为现有记录回填 SLA 截止时间...');

try {
  const recordsToUpdate = db.prepare(`
    SELECT eh.*, 
           c.priority as customer_priority,
           n.node_type as node_type
    FROM exception_handlings eh
    LEFT JOIN orders o ON eh.order_id = o.id
    LEFT JOIN customers c ON o.customer_id = c.id
    LEFT JOIN delivery_nodes n ON eh.node_id = n.id
    WHERE eh.sla_deadline IS NULL
  `).all() as Array<{
    id: string;
    exception_time: string;
    temperature_zone: TemperatureZone;
    node_type?: NodeType;
    escalation_level: EscalationLevel;
    customer_priority?: number;
  }>;

  const updateStmt = db.prepare(`
    UPDATE exception_handlings 
    SET sla_deadline = ?, updated_at = ?
    WHERE id = ?
  `);

  let updatedCount = 0;
  const now = new Date().toISOString();

  for (const record of recordsToUpdate) {
    try {
      const nodeType: NodeType = (record.node_type as NodeType) || 'warehouse_in';
      const customerPriority = record.customer_priority || 3;
      
      const slaDeadline = calculateSlaDeadline(
        record.exception_time,
        record.temperature_zone,
        customerPriority,
        nodeType,
        record.escalation_level
      );

      updateStmt.run(slaDeadline, now, record.id);
      updatedCount++;
    } catch (e) {
      console.warn(`- 跳过记录 ${record.id}:`, (e as Error).message);
    }
  }

  console.log(`✓ 回填完成，共更新 ${updatedCount} 条记录`);
} catch (error) {
  console.error('✗ 回填 SLA 截止时间失败:', error);
}

console.log('\n数据库迁移完成！');
db.close();
