import { BaseRepository } from './base';
import type { TemperatureEvidence } from '../../shared/types';

/**
 * 温度证据账本仓储。
 * 证据采用只追加、不覆盖模型：本仓储只提供插入与查询，不暴露更新/删除接口。
 */
class TemperatureEvidenceRepository extends BaseRepository<TemperatureEvidence> {
  protected tableName = 'temperature_evidence';
  protected fieldMap: Record<keyof TemperatureEvidence, string> = {
    id: 'id',
    batchId: 'batch_id',
    source: 'source',
    readingKey: 'reading_key',
    contentHash: 'content_hash',
    rawPayload: 'raw_payload',
    temperatureCenti: 'temperature_centi',
    observedAt: 'observed_at',
    receivedAt: 'received_at',
    orderId: 'order_id',
    taskId: 'task_id',
    nodeId: 'node_id',
    nodeType: 'node_type',
    minTempCenti: 'min_temp_centi',
    maxTempCenti: 'max_temp_centi',
    isAbnormal: 'is_abnormal',
    createdAt: 'created_at',
  };
  protected jsonFields: Array<keyof TemperatureEvidence> = ['rawPayload'];
  protected booleanFields: Array<keyof TemperatureEvidence> = ['isAbnormal'];

  findByReadingKey(readingKey: string): TemperatureEvidence | undefined {
    return this.findOneByField('readingKey', readingKey);
  }

  findByOrderId(orderId: string): TemperatureEvidence[] {
    return this.findByField('orderId', orderId, { orderBy: 'observedAt', orderDir: 'ASC' });
  }

  findByBatchId(batchId: string): TemperatureEvidence[] {
    return this.findByField('batchId', batchId, { orderBy: 'observedAt', orderDir: 'ASC' });
  }

  countAbnormalByOrderId(orderId: string): number {
    const row = this.db
      .prepare(
        `SELECT COUNT(*) as count FROM ${this.tableName}
         WHERE order_id = ? AND is_abnormal = 1`
      )
      .get(orderId) as { count: number };
    return row.count;
  }

  append(evidence: Omit<TemperatureEvidence, 'createdAt'> & { createdAt?: string }): TemperatureEvidence {
    return this.create(evidence);
  }

  /**
   * 在单个数据库事务内执行回调。
   * 用于保证“写入证据 + 创建/关联工单”要么全部成功、要么全部回滚，
   * 避免证据已写入但工单缺失的不一致状态。
   */
  runInTransaction<T>(fn: () => T): T {
    return this.db.transaction(fn)();
  }

  // 只追加、不覆盖：显式禁用继承自 BaseRepository 的 update / delete。
  // 数据库层另有触发器兜底（见 V008 迁移）。
  update(): TemperatureEvidence | undefined {
    throw new Error('temperature_evidence 为只追加账本，禁止更新');
  }

  delete(): boolean {
    throw new Error('temperature_evidence 为只追加账本，禁止删除');
  }
}

export const temperatureEvidenceRepository = new TemperatureEvidenceRepository();
