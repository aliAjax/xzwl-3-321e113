export type TemperatureZone = 'frozen' | 'chilled' | 'ambient';
export type OrderStatus = 'created' | 'warehoused' | 'loading' | 'in_transit' | 'delivered' | 'completed' | 'cancelled';
export type NodeType = 'warehouse_in' | 'loading' | 'departure' | 'arrival' | 'delivery' | 'signature';
export type NodeStatus = 'pending' | 'in_progress' | 'completed' | 'exception';
export type UserRole = 'admin' | 'dispatcher' | 'driver';
export type BatchStatus = 'created' | 'loading' | 'departed' | 'completed';

export interface Customer {
  id: string;
  name: string;
  contactName: string;
  phone: string;
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
  createdAt: string;
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

export interface NodeUpdateRequest {
  status: 'completed' | 'exception';
  locationText: string;
  exceptionDescription?: string;
  temperature?: number;
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

export interface DashboardStats {
  todayDeliveries: number;
  exceptionOrders: number;
  inTransitVehicles: number;
  pendingOrders: number;
  todayTasks: DeliveryTask[];
  recentExceptions: DeliveryNode[];
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
