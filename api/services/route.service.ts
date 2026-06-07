import { routeRepository } from '../repositories/route.repository';
import { batchRepository } from '../repositories/batch.repository';
import type { Route, RouteStop } from '../../shared/types';

export const routeService = {
  findAll(options?: { limit?: number; offset?: number }): Route[] {
    return routeRepository.findAll({ ...options, orderBy: 'createdAt', orderDir: 'DESC' });
  },

  findById(id: string): Route | undefined {
    return routeRepository.findById(id);
  },

  findByName(name: string): Route | undefined {
    return routeRepository.findByName(name);
  },

  searchByName(name: string): Route[] {
    return routeRepository.searchByName(name);
  },

  findByAddress(address: string): Route[] {
    return routeRepository.findByAddress(address);
  },

  create(data: Omit<Route, 'id' | 'createdAt'>): Route {
    const existing = routeRepository.findByName(data.name);
    if (existing) {
      throw new Error('线路名称已存在');
    }

    const stopsWithOrder = data.stops.map((stop, index) => ({
      ...stop,
      order: index + 1,
    }));

    return routeRepository.createRoute({
      ...data,
      stops: stopsWithOrder,
    });
  },

  update(id: string, data: Partial<Omit<Route, 'id' | 'createdAt'>>): Route | undefined {
    const existing = routeRepository.findById(id);
    if (!existing) {
      return undefined;
    }

    if (data.name && data.name !== existing.name) {
      const existingByName = routeRepository.findByName(data.name);
      if (existingByName) {
        throw new Error('线路名称已存在');
      }
    }

    if (data.stops) {
      data.stops = data.stops.map((stop, index) => ({
        ...stop,
        order: index + 1,
      }));
    }

    return routeRepository.updateRoute(id, data);
  },

  delete(id: string): boolean {
    const batches = batchRepository.findByRouteId(id);
    if (batches.length > 0) {
      throw new Error('线路存在关联批次，无法删除');
    }
    return routeRepository.delete(id);
  },

  count(): number {
    return routeRepository.count();
  },

  exists(id: string): boolean {
    return routeRepository.exists(id);
  },

  addStop(routeId: string, stop: Omit<RouteStop, 'order'>): Route | undefined {
    const route = routeRepository.findById(routeId);
    if (!route) {
      return undefined;
    }

    return routeRepository.addStop(routeId, stop);
  },

  removeStop(routeId: string, stopOrder: number): Route | undefined {
    const route = routeRepository.findById(routeId);
    if (!route) {
      return undefined;
    }

    if (stopOrder < 1 || stopOrder > route.stops.length) {
      throw new Error('站点序号不存在');
    }

    return routeRepository.removeStop(routeId, stopOrder);
  },

  reorderStops(routeId: string, newOrder: number[]): Route | undefined {
    const route = routeRepository.findById(routeId);
    if (!route) {
      return undefined;
    }

    const existingOrders = route.stops.map(s => s.order).sort((a, b) => a - b);
    const sortedNewOrder = [...newOrder].sort((a, b) => a - b);

    if (JSON.stringify(existingOrders) !== JSON.stringify(sortedNewOrder)) {
      throw new Error('新的排序必须包含所有站点且不重复');
    }

    return routeRepository.reorderStops(routeId, newOrder);
  },

  getRouteStops(routeId: string): RouteStop[] | undefined {
    const route = routeRepository.findById(routeId);
    return route?.stops;
  },

  getRouteStats(routeId: string) {
    const route = routeRepository.findById(routeId);
    if (!route) return undefined;

    const batches = batchRepository.findByRouteId(routeId);
    const totalBatches = batches.length;
    const completedBatches = batches.filter(b => b.status === 'completed').length;
    const activeBatches = batches.filter(b =>
      ['created', 'loading', 'departed'].includes(b.status)
    ).length;

    const totalStops = route.stops.length;
    const totalEstimatedTime = route.stops.reduce((sum, s) => sum + s.estimatedTime, 0);

    return {
      route,
      totalStops,
      totalEstimatedTime,
      totalBatches,
      completedBatches,
      activeBatches,
      completionRate: totalBatches > 0 ? (completedBatches / totalBatches) * 100 : 0,
    };
  },

  getRouteBatches(routeId: string) {
    const batches = batchRepository.findByRouteId(routeId);
    return batches.map(batch => batchRepository.findByIdWithDetails(batch.id)).filter(Boolean);
  },

  optimizeRoute(routeId: string): Route | undefined {
    const route = routeRepository.findById(routeId);
    if (!route) {
      return undefined;
    }

    const optimizedStops = [...route.stops].sort((a, b) => a.estimatedTime - b.estimatedTime)
      .map((stop, index) => ({ ...stop, order: index + 1 }));

    return routeRepository.updateRoute(routeId, { stops: optimizedStops });
  },

  getAllRoutes(options?: { limit?: number; offset?: number }): Route[] {
    return this.findAll(options);
  },

  getRouteById(id: string): Route | undefined {
    return this.findById(id);
  },

  getRouteByName(name: string): Route | undefined {
    return this.findByName(name);
  },

  searchRoutesByName(name: string): Route[] {
    return this.searchByName(name);
  },

  getRoutesByAddress(address: string): Route[] {
    return this.findByAddress(address);
  },

  createRoute(data: Omit<Route, 'id' | 'createdAt'>): Route {
    return this.create(data);
  },

  updateRoute(id: string, data: Partial<Omit<Route, 'id' | 'createdAt'>>): Route | undefined {
    return this.update(id, data);
  },

  deleteRoute(id: string): boolean {
    return this.delete(id);
  },

  countRoutes(): number {
    return this.count();
  },

  routeExists(id: string): boolean {
    return this.exists(id);
  },
};
