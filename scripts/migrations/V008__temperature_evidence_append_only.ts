import type { Database } from 'better-sqlite3';

export const id = 'V008__temperature_evidence_append_only';
export const description = '为温度证据账本添加数据库级只追加约束（禁止 UPDATE/DELETE 触发器）';

export function up(db: Database): void {
  // 数据库级只追加约束：任何 UPDATE / DELETE 都被触发器拒绝，
  // 即使绕过仓储层也无法修改或删除已写入的证据。
  db.exec(`
    CREATE TRIGGER IF NOT EXISTS trg_evidence_no_update
    BEFORE UPDATE ON temperature_evidence
    BEGIN
      SELECT RAISE(ABORT, 'temperature_evidence 为只追加账本，禁止更新');
    END
  `);

  db.exec(`
    CREATE TRIGGER IF NOT EXISTS trg_evidence_no_delete
    BEFORE DELETE ON temperature_evidence
    BEGIN
      SELECT RAISE(ABORT, 'temperature_evidence 为只追加账本，禁止删除');
    END
  `);
}
