import { v4 as uuidv4 } from 'uuid';
import type {
  OfflineSyncQueueItem,
  NodeUpdateRequest,
  NodeUpdateResponse,
  SyncConflict,
  SyncStatus,
  NodeType,
  DeliveryTask,
} from '@shared/types';
import { api } from './api';

const STORAGE_KEY = 'offline-sync-queue';
const CONFLICTS_KEY = 'sync-conflicts';
const MAX_RETRIES = 5;
const RETRY_DELAY_BASE = 2000;

type QueueChangeListener = (queue: OfflineSyncQueueItem[]) => void;
type ConflictListener = (conflicts: SyncConflict[]) => void;
type NetworkStatusListener = (isOnline: boolean) => void;

class OfflineSyncManager {
  private queue: OfflineSyncQueueItem[] = [];
  private conflicts: SyncConflict[] = [];
  private isOnline: boolean = navigator.onLine;
  private isProcessing: boolean = false;
  private queueListeners: QueueChangeListener[] = [];
  private conflictListeners: ConflictListener[] = [];
  private networkListeners: NetworkStatusListener[] = [];
  private retryTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    this.loadFromStorage();
    this.setupNetworkListeners();
    if (this.isOnline) {
      this.processQueue();
    }
  }

  private loadFromStorage(): void {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        this.queue = JSON.parse(stored);
      }
      const storedConflicts = localStorage.getItem(CONFLICTS_KEY);
      if (storedConflicts) {
        this.conflicts = JSON.parse(storedConflicts);
      }
    } catch (e) {
      console.error('Failed to load offline sync queue from storage:', e);
      this.queue = [];
      this.conflicts = [];
    }
  }

  private saveToStorage(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.queue));
      localStorage.setItem(CONFLICTS_KEY, JSON.stringify(this.conflicts));
    } catch (e) {
      console.error('Failed to save offline sync queue to storage:', e);
    }
  }

  private setupNetworkListeners(): void {
    window.addEventListener('online', () => {
      this.isOnline = true;
      this.notifyNetworkListeners(true);
      this.processQueue();
    });

    window.addEventListener('offline', () => {
      this.isOnline = false;
      this.notifyNetworkListeners(false);
      if (this.retryTimer) {
        clearTimeout(this.retryTimer);
        this.retryTimer = null;
      }
    });
  }

  private notifyQueueListeners(): void {
    this.queueListeners.forEach((listener) => listener([...this.queue]));
  }

  private notifyConflictListeners(): void {
    this.conflictListeners.forEach((listener) => listener([...this.conflicts]));
  }

  private notifyNetworkListeners(isOnline: boolean): void {
    this.networkListeners.forEach((listener) => listener(isOnline));
  }

  generateClientSubmitId(): string {
    return uuidv4();
  }

  addToQueue(
    nodeId: string,
    taskId: string,
    nodeType: NodeType,
    currentVersion: number,
    request: NodeUpdateRequest
  ): OfflineSyncQueueItem {
    const clientSubmitId = request.clientSubmitId || this.generateClientSubmitId();
    const now = new Date().toISOString();

    const existingIndex = this.queue.findIndex(
      (item) => item.nodeId === nodeId && item.status !== 'synced'
    );

    if (existingIndex >= 0) {
      const existing = this.queue[existingIndex];
      const updatedItem: OfflineSyncQueueItem = {
        ...existing,
        currentVersion,
        request: {
          ...request,
          clientSubmitId,
          version: currentVersion,
          updatedAt: now,
        },
        status: 'pending',
        retryCount: 0,
        errorMessage: undefined,
        lastAttemptAt: undefined,
      };
      this.queue[existingIndex] = updatedItem;
      this.saveToStorage();
      this.notifyQueueListeners();
      if (this.isOnline) {
        this.processQueue();
      }
      return updatedItem;
    }

    const item: OfflineSyncQueueItem = {
      id: uuidv4(),
      clientSubmitId,
      nodeId,
      taskId,
      nodeType,
      currentVersion,
      request: {
        ...request,
        clientSubmitId,
        version: currentVersion,
        updatedAt: now,
      },
      status: 'pending',
      createdAt: now,
      retryCount: 0,
    };

    this.queue.push(item);
    this.saveToStorage();
    this.notifyQueueListeners();

    if (this.isOnline) {
      this.processQueue();
    }

    return item;
  }

  updateItemStatus(clientSubmitId: string, status: SyncStatus, errorMessage?: string): void {
    const index = this.queue.findIndex((item) => item.clientSubmitId === clientSubmitId);
    if (index >= 0) {
      this.queue[index] = {
        ...this.queue[index],
        status,
        errorMessage,
        lastAttemptAt: new Date().toISOString(),
      };
      if (status === 'synced') {
        this.queue.splice(index, 1);
      }
      this.saveToStorage();
      this.notifyQueueListeners();
    }
  }

  updateItemRetryCount(clientSubmitId: string): void {
    const index = this.queue.findIndex((item) => item.clientSubmitId === clientSubmitId);
    if (index >= 0) {
      this.queue[index] = {
        ...this.queue[index],
        retryCount: this.queue[index].retryCount + 1,
        lastAttemptAt: new Date().toISOString(),
      };
      this.saveToStorage();
      this.notifyQueueListeners();
    }
  }

  private async processItem(item: OfflineSyncQueueItem): Promise<boolean> {
    if (!this.isOnline) {
      return false;
    }

    try {
      this.updateItemStatus(item.clientSubmitId, 'syncing');

      const response = await api.patch<NodeUpdateResponse>(
        `/delivery/nodes/${item.nodeId}`,
        item.request
      );

      if (response.isDuplicate) {
        this.updateItemStatus(item.clientSubmitId, 'synced');
        return true;
      }

      if (response.conflict) {
        const conflict: SyncConflict = {
          clientSubmitId: item.clientSubmitId,
          nodeId: item.nodeId,
          taskId: item.taskId,
          conflictType: response.conflict.type,
          message: response.conflict.message,
          currentNode: response.conflict.currentNode,
          submittedData: item.request,
          resolved: false,
          createdAt: new Date().toISOString(),
        };
        this.addConflict(conflict);
        this.updateItemStatus(item.clientSubmitId, 'conflict', response.conflict.message);
        return false;
      }

      this.updateItemStatus(item.clientSubmitId, 'synced');
      return true;
    } catch (error) {
      this.updateItemRetryCount(item.clientSubmitId);

      if (this.queue.find((i) => i.clientSubmitId === item.clientSubmitId)?.retryCount! >= MAX_RETRIES) {
        this.updateItemStatus(
          item.clientSubmitId,
          'failed',
          error instanceof Error ? error.message : '同步失败'
        );
        return false;
      }

      this.updateItemStatus(
        item.clientSubmitId,
        'pending',
        error instanceof Error ? error.message : '同步失败，等待重试'
      );
      return false;
    }
  }

  private async processQueue(): Promise<void> {
    if (this.isProcessing || !this.isOnline) {
      return;
    }

    this.isProcessing = true;

    try {
      const pendingItems = this.queue.filter(
        (item) => item.status === 'pending' || item.status === 'syncing'
      );

      for (const item of pendingItems) {
        if (!this.isOnline) break;
        await this.processItem(item);
      }

      const failedItems = this.queue.filter((item) => item.status === 'pending' && item.retryCount > 0);
      if (failedItems.length > 0 && this.isOnline) {
        const minRetryCount = Math.min(...failedItems.map((i) => i.retryCount));
        const delay = RETRY_DELAY_BASE * Math.pow(2, minRetryCount - 1);
        if (this.retryTimer) {
          clearTimeout(this.retryTimer);
        }
        this.retryTimer = setTimeout(() => {
          this.processQueue();
        }, delay);
      }
    } finally {
      this.isProcessing = false;
    }
  }

  addConflict(conflict: SyncConflict): void {
    const existingIndex = this.conflicts.findIndex(
      (c) => c.clientSubmitId === conflict.clientSubmitId
    );
    if (existingIndex >= 0) {
      this.conflicts[existingIndex] = conflict;
    } else {
      this.conflicts.push(conflict);
    }
    this.saveToStorage();
    this.notifyConflictListeners();
  }

  resolveConflict(clientSubmitId: string, resolution: 'accept_server' | 'force_update'): void {
    const conflict = this.conflicts.find((c) => c.clientSubmitId === clientSubmitId);
    if (!conflict) return;

    if (resolution === 'accept_server') {
      this.conflicts = this.conflicts.filter((c) => c.clientSubmitId !== clientSubmitId);
      this.queue = this.queue.filter((i) => i.clientSubmitId !== clientSubmitId);
      this.saveToStorage();
      this.notifyConflictListeners();
      this.notifyQueueListeners();
    } else if (resolution === 'force_update') {
      const index = this.queue.findIndex((i) => i.clientSubmitId === clientSubmitId);
      if (index >= 0) {
        const latestVersion = conflict.currentNode.version || 1;
        this.queue[index] = {
          ...this.queue[index],
          currentVersion: latestVersion,
          status: 'pending',
          retryCount: 0,
          request: {
            ...this.queue[index].request,
            version: latestVersion,
            updatedAt: new Date().toISOString(),
          },
        };
      }
      this.conflicts = this.conflicts.filter((c) => c.clientSubmitId !== clientSubmitId);
      this.saveToStorage();
      this.notifyConflictListeners();
      this.notifyQueueListeners();
      if (this.isOnline) {
        this.processQueue();
      }
    }
  }

  retryFailedItems(): void {
    this.queue = this.queue.map((item) =>
      item.status === 'failed'
        ? { ...item, status: 'pending' as const, retryCount: 0, errorMessage: undefined }
        : item
    );
    this.saveToStorage();
    this.notifyQueueListeners();
    if (this.isOnline) {
      this.processQueue();
    }
  }

  getQueue(): OfflineSyncQueueItem[] {
    return [...this.queue];
  }

  getConflicts(): SyncConflict[] {
    return [...this.conflicts];
  }

  getIsOnline(): boolean {
    return this.isOnline;
  }

  getNodeSyncStatus(nodeId: string): SyncStatus | undefined {
    const item = this.queue.find((i) => i.nodeId === nodeId && i.status !== 'synced');
    return item?.status;
  }

  getTaskSyncStatus(taskId: string): {
    pending: number;
    syncing: number;
    failed: number;
    conflict: number;
  } {
    const taskItems = this.queue.filter((i) => i.taskId === taskId && i.status !== 'synced');
    return {
      pending: taskItems.filter((i) => i.status === 'pending').length,
      syncing: taskItems.filter((i) => i.status === 'syncing').length,
      failed: taskItems.filter((i) => i.status === 'failed').length,
      conflict: taskItems.filter((i) => i.status === 'conflict').length,
    };
  }

  applyLocalUpdatesToTasks(tasks: DeliveryTask[]): DeliveryTask[] {
    return tasks.map((task) => {
      if (!task.nodes) return task;

      const updatedNodes = task.nodes.map((node) => {
        const syncItem = this.queue.find(
          (item) => item.nodeId === node.id && item.status !== 'synced'
        );
        if (!syncItem) return node;

        return {
          ...node,
          status: syncItem.request.status,
          locationText: syncItem.request.locationText || node.locationText,
          temperature: syncItem.request.temperature ?? node.temperature,
          exceptionDescription: syncItem.request.exceptionDescription || node.exceptionDescription,
          recordedAt: syncItem.request.updatedAt || node.recordedAt,
        };
      });

      return { ...task, nodes: updatedNodes };
    });
  }

  addQueueListener(listener: QueueChangeListener): () => void {
    this.queueListeners.push(listener);
    return () => {
      this.queueListeners = this.queueListeners.filter((l) => l !== listener);
    };
  }

  addConflictListener(listener: ConflictListener): () => void {
    this.conflictListeners.push(listener);
    return () => {
      this.conflictListeners = this.conflictListeners.filter((l) => l !== listener);
    };
  }

  addNetworkListener(listener: NetworkStatusListener): () => void {
    this.networkListeners.push(listener);
    return () => {
      this.networkListeners = this.networkListeners.filter((l) => l !== listener);
    };
  }
}

export const offlineSync = new OfflineSyncManager();
