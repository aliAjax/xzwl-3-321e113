import { orderRepository } from '../repositories/order.repository';
import { vehicleRepository } from '../repositories/vehicle.repository';
import { driverRepository } from '../repositories/driver.repository';
import { taskRepository } from '../repositories/task.repository';
import { nodeRepository } from '../repositories/node.repository';
import { batchRepository } from '../repositories/batch.repository';
import type { DashboardStats, DeliveryTask, DeliveryNode, OrderStatus } from '../../shared/types';

export const dashboardService = {
  getStats(): DashboardStats {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const todayStr = today.toISOString();
    const tomorrowStr = tomorrow.toISOString();

    const todayTasks = taskRepository.findByDateRange(todayStr, tomorrowStr);
    const todayDeliveries = todayTasks.filter(t => t.status === 'completed').length;

    const exceptionNodes = nodeRepository.findExceptionsByDateRange(todayStr, tomorrowStr);
    const exceptionOrderIds = [...new Set(exceptionNodes.map(n => {
      const task = taskRepository.findById(n.taskId);
      return task?.orderId;
    }))].filter(Boolean) as string[];
    const exceptionOrders = exceptionOrderIds.length;

    const inTransitVehicles = batchRepository.findActiveBatches().filter(b => b.status === 'departed').length;

    const pendingOrders = orderRepository.findByStatus('created').length +
      orderRepository.findByStatus('warehoused').length;

    const todayTasksWithDetails = todayTasks
      .map(t => taskRepository.findByIdWithDetails(t.id))
      .filter((t): t is DeliveryTask => t !== undefined);

    const recentExceptions = nodeRepository.findRecentExceptions(10);

    return {
      todayDeliveries,
      exceptionOrders,
      inTransitVehicles,
      pendingOrders,
      todayTasks: todayTasksWithDetails,
      recentExceptions,
    };
  },

  getOverviewStats() {
    const totalOrders = orderRepository.count();
    const totalVehicles = vehicleRepository.count();
    const totalDrivers = driverRepository.count();
    const totalTasks = taskRepository.count();

    const activeVehicles = vehicleRepository.findByStatus('active').length;
    const onDutyDrivers = driverRepository.findByStatus('on_duty').length;

    const completedOrders = orderRepository.findByStatus('completed').length;
    const cancelledOrders = orderRepository.findByStatus('cancelled').length;
    const inTransitOrders = orderRepository.findByStatus('in_transit').length;

    const activeBatches = batchRepository.findActiveBatches().length;
    const totalExceptions = nodeRepository.findRecentExceptions(1000).length;

    return {
      totalOrders,
      totalVehicles,
      totalDrivers,
      totalTasks,
      activeVehicles,
      onDutyDrivers,
      completedOrders,
      cancelledOrders,
      inTransitOrders,
      activeBatches,
      totalExceptions,
      completionRate: totalOrders > 0 ? (completedOrders / totalOrders) * 100 : 0,
    };
  },

  getTodayTimeline() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const todayStr = today.toISOString();
    const tomorrowStr = tomorrow.toISOString();

    const nodes = nodeRepository.findByDateRange(todayStr, tomorrowStr);
    const sortedNodes = nodes.sort((a, b) =>
      new Date(a.recordedAt || a.createdAt).getTime() - new Date(b.recordedAt || b.createdAt).getTime()
    );

    return sortedNodes;
  },

  getStatusDistribution() {
    const statuses: OrderStatus[] = ['created', 'warehoused', 'loading', 'in_transit', 'delivered', 'completed', 'cancelled'];
    const distribution = statuses.map(status => ({
      status,
      count: orderRepository.findByStatus(status).length,
    }));

    return distribution;
  },

  getTemperatureZoneDistribution() {
    const zones = ['frozen', 'chilled', 'ambient'] as const;
    const distribution = zones.map(zone => ({
      zone,
      count: orderRepository.findByTemperatureZone(zone).length,
    }));

    return distribution;
  },

  getVehicleUtilization() {
    const activeVehicles = vehicleRepository.findByStatus('active');
    const totalCapacity = activeVehicles.reduce((sum, v) => sum + v.capacity, 0);

    const activeBatches = batchRepository.findActiveBatches();
    let usedCapacity = 0;

    for (const batch of activeBatches) {
      const orders = batch.orderIds
        .map(id => orderRepository.findById(id))
        .filter(Boolean);
      usedCapacity += orders.reduce((sum, o) => sum + (o?.weight || 0), 0);
    }

    return {
      totalVehicles: activeVehicles.length,
      totalCapacity,
      usedCapacity,
      utilizationRate: totalCapacity > 0 ? (usedCapacity / totalCapacity) * 100 : 0,
    };
  },

  getDriverPerformance(driverId?: string) {
    const drivers = driverId
      ? [driverRepository.findById(driverId)].filter(Boolean)
      : driverRepository.findAll();

    const performance = drivers.map(driver => {
      if (!driver) return null;

      const tasks = taskRepository.findByDriverId(driver.id);
      const totalTasks = tasks.length;
      const completedTasks = tasks.filter(t => t.status === 'completed').length;

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayStr = today.toISOString();
      const todayTasks = tasks.filter(t => new Date(t.createdAt) >= today);
      const todayCompleted = todayTasks.filter(t => t.status === 'completed').length;

      const taskNodes = tasks.flatMap(t => nodeRepository.findByTaskId(t.id));
      const exceptions = taskNodes.filter(n => n.status === 'exception').length;

      return {
        driver,
        totalTasks,
        completedTasks,
        todayTasks: todayTasks.length,
        todayCompleted,
        exceptions,
        completionRate: totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0,
        exceptionRate: totalTasks > 0 ? (exceptions / totalTasks) * 100 : 0,
      };
    }).filter(Boolean);

    return performance;
  },

  getWeeklyTrend() {
    const days: { date: string; deliveries: number; exceptions: number }[] = [];

    for (let i = 6; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      date.setHours(0, 0, 0, 0);
      const nextDate = new Date(date);
      nextDate.setDate(nextDate.getDate() + 1);

      const dateStr = date.toISOString();
      const nextDateStr = nextDate.toISOString();

      const tasks = taskRepository.findByDateRange(dateStr, nextDateStr);
      const deliveries = tasks.filter(t => t.status === 'completed').length;

      const exceptions = nodeRepository.findExceptionsByDateRange(dateStr, nextDateStr).length;

      days.push({
        date: date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' }),
        deliveries,
        exceptions,
      });
    }

    return days;
  },

  getTopRoutes(limit: number = 5) {
    const batches = batchRepository.findAll();
    const routeCounts = new Map<string, number>();

    for (const batch of batches) {
      const count = routeCounts.get(batch.routeId) || 0;
      routeCounts.set(batch.routeId, count + 1);
    }

    const sortedRoutes = Array.from(routeCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([routeId, count]) => {
        const route = batchRepository.findByIdWithDetails(routeId)?.route;
        return {
          routeId,
          routeName: route?.name || '未知线路',
          batchCount: count,
        };
      });

    return sortedRoutes;
  },

  getTopCustomers(limit: number = 5) {
    const orders = orderRepository.findAll();
    const customerCounts = new Map<string, { count: number; weight: number }>();

    for (const order of orders) {
      const existing = customerCounts.get(order.customerId) || { count: 0, weight: 0 };
      customerCounts.set(order.customerId, {
        count: existing.count + 1,
        weight: existing.weight + order.weight,
      });
    }

    const sortedCustomers = Array.from(customerCounts.entries())
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, limit)
      .map(([customerId, stats]) => {
        const order = orders.find(o => o.customerId === customerId);
        return {
          customerId,
          customerName: order?.customer?.name || '未知客户',
          orderCount: stats.count,
          totalWeight: stats.weight,
        };
      });

    return sortedCustomers;
  },

  getRealtimeVehicles() {
    const activeBatches = batchRepository.findActiveBatches();
    const vehicles = activeBatches
      .map(batch => batchRepository.findByIdWithDetails(batch.id))
      .filter(Boolean)
      .map(batch => ({
        batchId: batch!.id,
        batchNo: batch!.batchNo,
        vehicle: batch!.vehicle,
        driver: batch!.driver,
        status: batch!.status,
        departureTime: batch!.departureTime,
        orderCount: batch!.orderIds.length,
      }));

    return vehicles;
  },

  getAlertList() {
    const alerts: {
      type: string;
      level: 'warning' | 'error' | 'info';
      message: string;
      timestamp: string;
      relatedId?: string;
    }[] = [];

    const recentExceptions = nodeRepository.findRecentExceptions(10);
    for (const exception of recentExceptions) {
      const task = taskRepository.findById(exception.taskId);
      alerts.push({
        type: 'exception',
        level: 'error',
        message: `配送异常: ${exception.exceptionDescription}`,
        timestamp: exception.recordedAt || exception.createdAt,
        relatedId: task?.orderId,
      });
    }

    const activeVehicles = vehicleRepository.findByStatus('active');
    const vehiclesWithoutDriver = activeVehicles.filter(v => !v.driverId);
    for (const vehicle of vehiclesWithoutDriver) {
      alerts.push({
        type: 'vehicle',
        level: 'warning',
        message: `车辆 ${vehicle.plateNo} 未分配司机`,
        timestamp: new Date().toISOString(),
        relatedId: vehicle.id,
      });
    }

    const onDutyDrivers = driverRepository.findByStatus('on_duty');
    const driversWithoutVehicle = onDutyDrivers.filter(d => {
      const vehicle = vehicleRepository.findByDriverId(d.id);
      return !vehicle;
    });
    for (const driver of driversWithoutVehicle) {
      alerts.push({
        type: 'driver',
        level: 'warning',
        message: `司机 ${driver.name} 未分配车辆`,
        timestamp: new Date().toISOString(),
        relatedId: driver.id,
      });
    }

    const pendingOrders = orderRepository.findByStatus('created');
    const now = new Date();
    for (const order of pendingOrders) {
      const scheduledTime = new Date(order.scheduledDeliveryTime);
      const hoursDiff = (scheduledTime.getTime() - now.getTime()) / (1000 * 60 * 60);
      if (hoursDiff < 4 && hoursDiff > 0) {
        alerts.push({
          type: 'order',
          level: 'warning',
          message: `订单 ${order.orderNo} 预计 ${hoursDiff.toFixed(1)} 小时后送达，尚未安排调度`,
          timestamp: new Date().toISOString(),
          relatedId: order.id,
        });
      }
    }

    return alerts.sort((a, b) =>
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
  },

  getTodayTasks(): DeliveryTask[] {
    return this.getStats().todayTasks;
  },

  getRecentExceptions(limit: number = 10): DeliveryNode[] {
    return nodeRepository.findRecentExceptions(limit);
  },

  getStatusCounts() {
    return this.getStatusDistribution();
  },

  getDailyStats(days: number = 7) {
    const trend = this.getWeeklyTrend();
    return days >= trend.length ? trend : trend.slice(-days);
  },
};
