import type { Database } from 'better-sqlite3';
import { calculateSlaDeadline } from '../../shared/types.js';
import type { TemperatureZone, NodeType, EscalationLevel } from '../../shared/types.js';

export const id = 'V006__add_sla_deadline';
export const description = '给exception_handlings添加sla_deadline字段并回填';

function columnExists(db: Database, table: string, column: string): boolean {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  return columns.some(col => col.name === column);
}

export function up(db: Database): void {
  if (!columnExists(db, 'exception_handlings', 'sla_deadline')) {
    db.exec(`ALTER TABLE exception_handlings ADD COLUMN sla_deadline DATETIME`);
  }

  db.exec(`CREATE INDEX IF NOT EXISTS idx_exception_sla_deadline ON exception_handlings(sla_deadline)`);

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

  if (recordsToUpdate.length > 0) {
    const updateStmt = db.prepare(`
      UPDATE exception_handlings 
      SET sla_deadline = ?, updated_at = ?
      WHERE id = ?
    `);

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
      } catch (e) {
        console.warn(`  ⚠ 跳过记录 ${record.id}:`, (e as Error).message);
      }
    }
  }
}
