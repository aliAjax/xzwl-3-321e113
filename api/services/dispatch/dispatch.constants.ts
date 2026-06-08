import type { LoadingBatch, DeliveryTask } from '../../../shared/types';
import { batchRepository } from '../../repositories/batch.repository';

export const WAREHOUSE_VEHICLE_ID = 'veh-warehouse';
export const WAREHOUSE_DRIVER_ID = 'drv-warehouse';
export const WAREHOUSE_BATCH_PREFIX = 'WH';

export function generateBatchNo(): string {
  const date = new Date();
  const prefix = `BATCH${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`;
  const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
  return `${prefix}${random}`;
}

export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

export function isWarehouseBatch(batch?: LoadingBatch): boolean {
  return Boolean(batch?.batchNo?.startsWith(WAREHOUSE_BATCH_PREFIX));
}

export function isWarehouseTask(task: DeliveryTask): boolean {
  if (task.driverId === WAREHOUSE_DRIVER_ID || task.vehicleId === WAREHOUSE_VEHICLE_ID) {
    return true;
  }

  return isWarehouseBatch(batchRepository.findById(task.batchId));
}
