export type TemperatureZone = 'frozen' | 'chilled' | 'ambient';
export type OrderStatus = 'created' | 'warehoused' | 'loading' | 'in_transit' | 'delivered' | 'completed' | 'cancelled';
export type SyncStatus = 'synced' | 'syncing' | 'pending' | 'failed' | 'conflict';
export type ConflictType = 'already_completed' | 'updated_by_other' | 'concurrent_update';

export const TEMPERATURE_ZONE_RANGES: Record<TemperatureZone, { min: number; max: number; label: string }> = {
  frozen: { min: -30, max: -10, label: '冷冻' },
  chilled: { min: 0, max: 8, label: '冷藏' },
  ambient: { min: 15, max: 30, label: '常温' },
};

export interface BatchOrderCreateItem {
  orderNo: string;
  customerId: string;
  temperatureZone: TemperatureZone;
  minTemp: number;
  maxTemp: number;
  goodsName: string;
  quantity: number;
  weight: number;
  deliveryAddress: string;
  scheduledDeliveryTime: string;
  remarks?: string;
}

export interface BatchOrderValidationError {
  rowIndex: number;
  field: string;
  message: string;
}

export interface BatchOrderCreateResult {
  success: boolean;
  orderIds?: string[];
  orderNos?: string[];
  errors?: BatchOrderValidationError[];
}
export type NodeType = 'warehouse_in' | 'loading' | 'departure' | 'arrival' | 'delivery' | 'signature';
export type NodeStatus = 'pending' | 'in_progress' | 'completed' | 'exception';
export type UserRole = 'admin' | 'dispatcher' | 'driver';
export type BatchStatus = 'created' | 'loading' | 'departed' | 'completed';

export interface Customer {
  id: string;
  name: string;
  contactName: string;
  phone: string;
  driverId?: string;
  address: string;
  priority: number;
  createdAt: string;
}

export interface Order {
  id: string;
  orderNo: string;
  customerId: string;
  customer?: Customer;
  temperatureZone: TemperatureZone;
  minTemp: number;
  maxTemp: number;
  goodsName: string;
  quantity: number;
  weight: number;
  deliveryAddress: string;
  scheduledDeliveryTime: string;
  status: OrderStatus;
  remarks: string;
  createdAt: string;
  updatedAt: string;
}

export interface Vehicle {
  id: string;
  plateNo: string;
  vehicleType: string;
  temperatureZones: TemperatureZone[];
  capacity: number;
  driverId?: string;
  availableStartTime: string;
  availableEndTime: string;
  status: 'active' | 'maintenance' | 'disabled';
  createdAt: string;
}

export interface Driver {
  id: string;
  name: string;
  phone: string;
  driverId?: string;
  licenseNo: string;
  licenseType: string;
  status: 'on_duty' | 'off_duty' | 'on_leave';
  createdAt: string;
}

export interface RouteStop {
  order: number;
  address: string;
  estimatedTime: number;
}

export interface Route {
  id: string;
  name: string;
  description: string;
  stops: RouteStop[];
  createdAt: string;
}

export interface LoadingBatch {
  id: string;
  batchNo: string;
  vehicleId: string;
  vehicle?: Vehicle;
  driverId: string;
  driver?: Driver;
  routeId: string;
  route?: Route;
  orderIds: string[];
  orders?: Order[];
  status: BatchStatus;
  departureTime?: string;
  createdAt: string;
}

export interface DeliveryNodeWithDetails extends DeliveryNode {
  task?: DeliveryTask;
  order?: Order;
  driver?: Driver;
  vehicle?: Vehicle;
}

export interface DeliveryNode {
  id: string;
  taskId: string;
  nodeType: NodeType;
  nodeName: string;
  status: NodeStatus;
  recordedAt?: string;
  locationText: string;
  exceptionDescription?: string;
  temperature?: number;
  operatorId: string;
  operatorName: string;
  clientSubmitId?: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface DeliveryTask {
  id: string;
  batchId: string;
  batch?: LoadingBatch;
  orderId: string;
  order?: Order;
  driverId: string;
  driver?: Driver;
  vehicleId: string;
  vehicle?: Vehicle;
  status: OrderStatus;
  nodes?: DeliveryNode[];
  createdAt: string;
}

export interface User {
  id: string;
  username: string;
  role: UserRole;
  name: string;
  phone: string;
  driverId?: string;
  createdAt: string;
}

export interface AuthResponse {
  token: string;
  user: User;
}

export interface LoginRequest {
  username: string;
  password: string;
}

export interface DispatchMatchResult {
  vehicleId: string;
  plateNo: string;
  driverId: string;
  driverName: string;
  temperatureMatch: boolean;
  timeAvailable: boolean;
  conflicts: string[];
  score: number;
}

export interface DispatchRequest {
  orderIds: string[];
  vehicleId: string;
  driverId: string;
  routeId: string;
  scheduledDepartureTime: string;
}

export interface DispatchPreviewRequest {
  orderIds: string[];
  vehicleId: string;
  driverId: string;
  routeId: string;
  scheduledDepartureTime: string;
}

export interface DispatchPreviewOrder {
  id: string;
  orderNo: string;
  goodsName: string;
  quantity: number;
  weight: number;
  temperatureZone: TemperatureZone;
  deliveryAddress: string;
  customerName?: string;
}

export interface DispatchPreviewConflict {
  type: 'vehicle' | 'driver' | 'order' | 'temperature' | 'capacity' | 'time' | 'route';
  severity: 'error' | 'warning';
  message: string;
}

export interface DispatchPreviewSuggestion {
  type: 'alternative_vehicle' | 'alternative_driver' | 'split_batch' | 'adjust_time' | 'change_route';
  priority: number;
  message: string;
  details?: Record<string, unknown>;
}

export interface DispatchPreviewResult {
  canDispatch: boolean;
  totalWeight: number;
  totalQuantity: number;
  temperatureZones: TemperatureZone[];
  estimatedDurationMinutes: number;
  estimatedArrivalTime: string;
  vehicleCapacityUsed: number;
  vehicleCapacityPercent: number;
  conflicts: DispatchPreviewConflict[];
  suggestions: DispatchPreviewSuggestion[];
  orders: DispatchPreviewOrder[];
  vehicle: {
    id: string;
    plateNo: string;
    vehicleType: string;
    capacity: number;
    temperatureZones: TemperatureZone[];
    availableStartTime: string;
    availableEndTime: string;
  } | null;
  driver: {
    id: string;
    name: string;
    phone: string;
  driverId?: string;
    status: string;
  } | null;
  route: {
    id: string;
    name: string;
    stopCount: number;
  } | null;
  scheduledDepartureTime: string;
  warnings: string[];
}

export interface NodeUpdateRequest {
  status: 'completed' | 'exception';
  locationText: string;
  exceptionDescription?: string;
  temperature?: number;
  clientSubmitId?: string;
  updatedAt?: string;
  version?: number;
}

export interface OfflineSyncQueueItem {
  id: string;
  clientSubmitId: string;
  nodeId: string;
  taskId: string;
  nodeType: NodeType;
  currentVersion: number;
  request: NodeUpdateRequest;
  status: SyncStatus;
  createdAt: string;
  lastAttemptAt?: string;
  retryCount: number;
  errorMessage?: string;
}

export interface NodeUpdateResponse {
  success: boolean;
  node?: DeliveryNode;
  isDuplicate?: boolean;
  conflict?: {
    type: ConflictType;
    message: string;
    currentNode: DeliveryNode;
    submittedData: NodeUpdateRequest;
  };
}

export interface SyncConflict {
  clientSubmitId: string;
  nodeId: string;
  taskId: string;
  conflictType: ConflictType;
  message: string;
  currentNode: DeliveryNode;
  submittedData: NodeUpdateRequest;
  resolved: boolean;
  resolution?: 'accept_server' | 'force_update';
  createdAt: string;
}

export interface OrderTimelineEvent {
  id: string;
  nodeType: NodeType;
  nodeName: string;
  status: NodeStatus;
  recordedAt?: string;
  locationText: string;
  exceptionDescription?: string;
  temperature?: number;
  operatorId?: string;
  operatorName?: string;
  createdAt: string;
}

export interface OrderTimeline {
  orderId: string;
  orderNo: string;
  status: OrderStatus;
  events: OrderTimelineEvent[];
  currentNode?: OrderTimelineEvent;
  completedCount: number;
  totalCount: number;
}

export interface WarehouseInRegisterRequest {
  orderId: string;
  locationText: string;
  temperature: number;
  remarks?: string;
}

export interface WarehouseInQueryParams {
  orderNo?: string;
  customerId?: string;
  temperatureZone?: TemperatureZone;
}

export interface TemperatureZoneStats {
  pendingOrders: number;
  inTransitOrders: number;
  availableVehicles: number;
}

export interface TemperatureZoneAbnormalRecord {
  id: string;
  orderId: string;
  orderNo: string;
  temperatureZone: TemperatureZone;
  temperature: number;
  minTemp: number;
  maxTemp: number;
  recordedAt: string;
  locationText: string;
  operatorName: string;
  exceptionDescription?: string;
}

export interface TemperatureZoneSummary {
  frozen: TemperatureZoneStats;
  chilled: TemperatureZoneStats;
  ambient: TemperatureZoneStats;
  recentAbnormalRecords: TemperatureZoneAbnormalRecord[];
}

export type ExceptionHandlingStatus = 'pending' | 'resolved' | 'escalated';
export type ExceptionHandlingResult = 'recovered' | 'compensated' | 're_routed' | 'cancelled' | 'other';
export type EscalationLevel = 'level_1' | 'level_2' | 'level_3';
export type ProcessingNoteActionType = 'create' | 'assign' | 'escalate' | 'add_note' | 'update_status' | 'close' | 'reopen';
export type SlaStatus = 'on_time' | 'warning' | 'overdue' | 'closed';

export interface SlaConfig {
  temperatureZoneMinutes: Record<TemperatureZone, number>;
  customerPriorityMultiplier: Record<number, number>;
  nodeTypeMinutes: Record<NodeType, number>;
  escalationLevelMultiplier: Record<EscalationLevel, number>;
  warningThresholdMinutes: number;
}

export const SLA_CONFIG: SlaConfig = {
  temperatureZoneMinutes: {
    frozen: 60,
    chilled: 120,
    ambient: 240,
  },
  customerPriorityMultiplier: {
    1: 1.0,
    2: 0.8,
    3: 0.6,
    4: 0.5,
    5: 0.4,
  },
  nodeTypeMinutes: {
    warehouse_in: 120,
    loading: 90,
    departure: 60,
    arrival: 60,
    delivery: 30,
    signature: 30,
  },
  escalationLevelMultiplier: {
    level_1: 1.0,
    level_2: 0.7,
    level_3: 0.5,
  },
  warningThresholdMinutes: 30,
};

export function calculateSlaDeadline(
  exceptionTime: string,
  temperatureZone: TemperatureZone,
  customerPriority: number,
  nodeType: NodeType,
  escalationLevel: EscalationLevel
): string {
  const baseMinutes = SLA_CONFIG.nodeTypeMinutes[nodeType] + SLA_CONFIG.temperatureZoneMinutes[temperatureZone];
  const priorityMultiplier = SLA_CONFIG.customerPriorityMultiplier[customerPriority] || 1.0;
  const escalationMultiplier = SLA_CONFIG.escalationLevelMultiplier[escalationLevel] || 1.0;
  const totalMinutes = baseMinutes * priorityMultiplier * escalationMultiplier;
  
  const deadline = new Date(exceptionTime);
  deadline.setMinutes(deadline.getMinutes() + totalMinutes);
  return deadline.toISOString();
}

export function calculateSlaStatus(
  slaDeadline: string | undefined,
  isClosed: boolean,
  now: Date = new Date()
): SlaStatus {
  if (isClosed) return 'closed';
  if (!slaDeadline) return 'on_time';
  
  const deadline = new Date(slaDeadline);
  const diffMs = deadline.getTime() - now.getTime();
  const diffMinutes = diffMs / (1000 * 60);
  
  if (diffMinutes < 0) return 'overdue';
  if (diffMinutes <= SLA_CONFIG.warningThresholdMinutes) return 'warning';
  return 'on_time';
}

export function formatRemainingTime(
  slaDeadline: string | undefined,
  isClosed: boolean,
  now: Date = new Date()
): string {
  if (isClosed) return '已闭环';
  if (!slaDeadline) return '-';
  
  const deadline = new Date(slaDeadline);
  const diffMs = deadline.getTime() - now.getTime();
  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  
  if (diffMinutes < 0) {
    const overdueMinutes = Math.abs(diffMinutes);
    if (overdueMinutes >= 60) {
      const hours = Math.floor(overdueMinutes / 60);
      const mins = overdueMinutes % 60;
      return `超时 ${hours}小时${mins > 0 ? mins + '分钟' : ''}`;
    }
    return `超时 ${overdueMinutes}分钟`;
  }
  
  if (diffMinutes >= 60) {
    const hours = Math.floor(diffMinutes / 60);
    const mins = diffMinutes % 60;
    return `剩余 ${hours}小时${mins > 0 ? mins + '分钟' : ''}`;
  }
  return `剩余 ${diffMinutes}分钟`;
}

export interface ExceptionProcessingNote {
  id: string;
  exceptionHandlingId: string;
  note: string;
  createdBy?: string;
  createdByName?: string;
  actionType: ProcessingNoteActionType;
  oldValue?: string;
  newValue?: string;
  createdAt: string;
}

export interface ExceptionHandling {
  id: string;
  nodeId: string;
  node?: DeliveryNode;
  taskId: string;
  task?: DeliveryTask;
  orderId: string;
  order?: Order;
  driverId: string;
  driver?: Driver;
  temperatureZone: TemperatureZone;
  exceptionDescription: string;
  exceptionTime: string;
  handlingStatus: ExceptionHandlingStatus;
  handlingResult?: ExceptionHandlingResult;
  handlingNotes?: string;
  handledBy?: string;
  handledAt?: string;
  escalationLevel: EscalationLevel;
  assigneeId?: string;
  assignee?: User;
  isClosed: boolean;
  closedAt?: string;
  closedBy?: string;
  slaDeadline?: string;
  processingNotes?: ExceptionProcessingNote[];
  createdAt: string;
  updatedAt: string;
}

export interface ExceptionHandlingWithDetails extends ExceptionHandling {
  order?: Order;
  task?: DeliveryTask;
  driver?: Driver;
  node?: DeliveryNode;
}

export interface ExceptionHandlingQueryParams {
  startDate?: string;
  endDate?: string;
  temperatureZone?: TemperatureZone;
  driverId?: string;
  orderStatus?: OrderStatus;
  handlingStatus?: ExceptionHandlingStatus;
  escalationLevel?: EscalationLevel;
  assigneeId?: string;
  isClosed?: boolean;
  highPriority?: boolean;
  page?: number;
  pageSize?: number;
}

export interface ExceptionHandlingCreateRequest {
  nodeId: string;
}

export interface ExceptionHandlingUpdateRequest {
  handlingStatus: ExceptionHandlingStatus;
  handlingResult: ExceptionHandlingResult;
  handlingNotes: string;
}

export interface ExceptionHandlingAssignRequest {
  assigneeId: string;
  note?: string;
}

export interface ExceptionHandlingEscalateRequest {
  escalationLevel: EscalationLevel;
  note?: string;
}

export interface ExceptionHandlingAddNoteRequest {
  note: string;
}

export interface ExceptionHandlingCloseRequest {
  handlingResult: ExceptionHandlingResult;
  note: string;
}

export interface ExceptionHandlingReopenRequest {
  note: string;
}

export interface ExceptionHandlingWorkorderStats {
  total: number;
  pending: number;
  resolved: number;
  escalated: number;
  closed: number;
  open: number;
  level1: number;
  level2: number;
  level3: number;
  unassigned: number;
  slaOnTime: number;
  slaWarning: number;
  slaOverdue: number;
}

export interface ExceptionHandlingListResponse {
  items: ExceptionHandlingWithDetails[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ExceptionHandlingNodeStatusResponse {
  exists: boolean;
  data: ExceptionHandlingWithDetails | null;
  isHandled: boolean;
  isClosed: boolean;
}

export interface DashboardStats {
  todayDeliveries: number;
  exceptionOrders: number;
  inTransitVehicles: number;
  pendingOrders: number;
  todayTasks: DeliveryTask[];
  recentExceptions: Array<DeliveryNode & { 
    handled: boolean; 
    handlingStatus?: ExceptionHandlingStatus;
    isClosed?: boolean;
    escalationLevel?: EscalationLevel;
    slaDeadline?: string;
  }>;
  pendingExceptionCount: number;
  handledExceptionCount: number;
  workorderStats?: ExceptionHandlingWorkorderStats;
}

export type TemperatureRecordFieldKey = 'orderNo' | 'nodeType' | 'recordedAt' | 'temperature' | 'locationText' | 'operatorName';

export const TEMPERATURE_RECORD_FIELDS: Array<{ key: TemperatureRecordFieldKey; label: string; required: boolean }> = [
  { key: 'orderNo', label: '订单号', required: true },
  { key: 'nodeType', label: '节点类型', required: true },
  { key: 'recordedAt', label: '记录时间', required: true },
  { key: 'temperature', label: '温度', required: true },
  { key: 'locationText', label: '位置', required: false },
  { key: 'operatorName', label: '操作人', required: false },
];

export interface TemperatureRecordColumnMapping {
  orderNo: number | null;
  nodeType: number | null;
  recordedAt: number | null;
  temperature: number | null;
  locationText: number | null;
  operatorName: number | null;
}

export interface TemperatureRecordColumnParseResult {
  headers: string[];
  autoMapping: TemperatureRecordColumnMapping;
  sampleRows: string[][];
  separator: string;
}

export interface TemperatureRecordPreviewWithMappingRequest {
  csvText: string;
  mapping: TemperatureRecordColumnMapping;
}

export type TemperatureRecordStatus = 'importable' | 'abnormal' | 'unmatched';

export interface TemperatureRecordCsvRow {
  orderNo: string;
  nodeType: string;
  recordedAt: string;
  temperature: string;
  locationText?: string;
  operatorName?: string;
}

export interface TemperatureRecordParsed {
  lineNumber: number;
  orderNo: string;
  nodeType: NodeType | null;
  recordedAt: Date | null;
  temperature: number | null;
  locationText: string;
  operatorName: string;
}

export interface TemperatureRecordMatched {
  orderId: string;
  orderNo: string;
  order: Order;
  taskId: string;
  task: DeliveryTask;
  nodeId: string;
  node: DeliveryNode;
}

export interface TemperatureRecordValidationResult {
  lineNumber: number;
  status: TemperatureRecordStatus;
  parsed: TemperatureRecordParsed;
  matched?: TemperatureRecordMatched;
  failureReasons: string[];
  suggestedCorrectionFields: string[];
}

export interface TemperatureRecordImportPreview {
  totalCount: number;
  importableCount: number;
  abnormalCount: number;
  unmatchedCount: number;
  importableRecords: TemperatureRecordValidationResult[];
  abnormalRecords: TemperatureRecordValidationResult[];
  unmatchedRecords: TemperatureRecordValidationResult[];
}

export interface TemperatureRecordImportRequest {
  records: TemperatureRecordValidationResult[];
}

export interface TemperatureRecordImportResult {
  successCount: number;
  failedCount: number;
  skippedCount: number;
  exceptionCreatedCount: number;
  results: Array<{
    lineNumber: number;
    orderNo: string;
    success: boolean;
    isException: boolean;
    isSkipped: boolean;
    nodeId?: string;
    exceptionId?: string;
    message: string;
  }>;
}

export interface DispatchSandboxGenerateRequest {
  orderIds: string[];
  scheduledDepartureTime?: string;
  maxPlans?: number;
}

export interface DispatchSandboxPlan {
  planId: string;
  planName: string;
  vehicleId: string;
  plateNo: string;
  vehicleType: string;
  driverId: string;
  driverName: string;
  routeId: string;
  routeName: string;
  totalWeight: number;
  totalQuantity: number;
  vehicleCapacity: number;
  vehicleCapacityUsed: number;
  vehicleCapacityPercent: number;
  temperatureZones: TemperatureZone[];
  vehicleTemperatureZones: TemperatureZone[];
  temperatureMatch: boolean;
  stopCount: number;
  estimatedDurationMinutes: number;
  estimatedArrivalTime: string;
  scheduledDepartureTime: string;
  conflictCount: number;
  warningCount: number;
  score: number;
  canDispatch: boolean;
  conflicts: DispatchPreviewConflict[];
}

export interface DispatchSandboxPlanDetail extends DispatchPreviewResult {
  planId: string;
  planName: string;
  score: number;
  route: {
    id: string;
    name: string;
    stopCount: number;
    stops: RouteStop[];
  } | null;
}

export interface DispatchSandboxFilteredOrder {
  id: string;
  orderNo: string;
  status: string;
  reason: string;
}

export interface DispatchSandboxResult {
  totalOrders: number;
  dispatchableOrders: number;
  totalWeight: number;
  totalQuantity: number;
  requiredTemperatureZones: TemperatureZone[];
  filteredOrders: DispatchSandboxFilteredOrder[];
  plans: DispatchSandboxPlan[];
}

export interface DispatchSandboxApplyRequest {
  planId: string;
  orderIds: string[];
  vehicleId: string;
  driverId: string;
  routeId: string;
  scheduledDepartureTime: string;
}

// ============================================================
// 温度证据账本（Temperature Evidence Ledger）
// 只追加、不覆盖；同时承接 CSV 导入、司机离线上报和历史回填。
// ============================================================

export type TemperatureEvidenceSource = 'driver_offline' | 'csv_import' | 'historical_backfill';

// 时间线展示优先级：同一 observedAt 时刻，依次采用司机离线、CSV导入、历史回填。
export const TEMPERATURE_EVIDENCE_SOURCE_PRIORITY: Record<TemperatureEvidenceSource, number> = {
  driver_offline: 1,
  csv_import: 2,
  historical_backfill: 3,
};

// 缺少时区时的处理策略：旧 CSV 与历史回填按 +08:00 解析，司机离线数据必须显式携带时区。
export const TEMPERATURE_EVIDENCE_ASSUME_CST: Record<TemperatureEvidenceSource, boolean> = {
  driver_offline: false,
  csv_import: true,
  historical_backfill: true,
};

// 原始载荷仅允许标量字段，避免使用 any。
export type TemperatureEvidenceRawPayload = Record<string, string | number | boolean | null>;

// 账本内温度以摄氏度乘 100 后的整数保存；API 边界再转换。
export function celsiusToCenti(celsius: number): number {
  return Math.round(celsius * 100);
}

export function centiToCelsius(centi: number): number {
  return centi / 100;
}

export interface TemperatureEvidence {
  id: string;
  batchId: string;
  source: TemperatureEvidenceSource;
  readingKey: string;
  contentHash: string;
  rawPayload: TemperatureEvidenceRawPayload;
  temperatureCenti: number;
  observedAt: string; // 设备采集时间，保存为 UTC
  receivedAt: string; // 服务器接收时间，保存为 UTC
  orderId?: string;
  taskId?: string;
  nodeId?: string;
  nodeType?: NodeType;
  minTempCenti?: number;
  maxTempCenti?: number;
  isAbnormal: boolean;
  createdAt: string;
}

export interface TemperatureEvidenceIngestItem {
  readingKey: string;
  observedAt: string; // 可能缺少时区
  temperature: number; // 摄氏度，API 边界值
  orderNo?: string;
  orderId?: string;
  taskId?: string;
  nodeId?: string;
  nodeType?: NodeType;
  locationText?: string;
  operatorName?: string;
  rawPayload?: TemperatureEvidenceRawPayload;
}

export interface TemperatureEvidenceIngestRequest {
  batchId?: string;
  source: TemperatureEvidenceSource;
  items: TemperatureEvidenceIngestItem[];
}

export type TemperatureEvidenceIngestStatus = 'created' | 'duplicate' | 'conflict' | 'rejected';

export interface TemperatureEvidenceIngestOutcome {
  readingKey: string;
  status: TemperatureEvidenceIngestStatus;
  evidenceId?: string;
  isAbnormal?: boolean;
  message: string;
}

export interface TemperatureEvidenceIngestResult {
  batchId: string;
  source: TemperatureEvidenceSource;
  totalCount: number;
  createdCount: number;
  duplicateCount: number;
  conflictCount: number;
  rejectedCount: number;
  hasConflict: boolean;
  outcomes: TemperatureEvidenceIngestOutcome[];
}

export interface TemperatureEvidenceCsvIngestRequest {
  batchId?: string;
  csvText: string;
  mapping?: TemperatureRecordColumnMapping;
}

export interface TemperatureEvidenceTimelineEntry {
  id: string;
  source: TemperatureEvidenceSource;
  readingKey: string;
  temperature: number; // 摄氏度，边界转换后
  observedAt: string; // UTC
  receivedAt: string; // UTC
  nodeId?: string;
  nodeType?: NodeType;
  isAbnormal: boolean;
  locationText?: string;
  operatorName?: string;
}

export interface TemperatureEvidenceTimeline {
  orderId: string;
  orderNo: string;
  entries: TemperatureEvidenceTimelineEntry[];
  totalCount: number;
  abnormalCount: number;
  // 较新的正常温度不能掩盖旧异常，也不能自动关闭工单。
  hasUnresolvedAbnormal: boolean;
}
