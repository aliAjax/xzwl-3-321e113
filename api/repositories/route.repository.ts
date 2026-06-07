import { BaseRepository } from './base';
import type { Route, RouteStop } from '../../shared/types';

class RouteRepository extends BaseRepository<Route> {
  protected tableName = 'routes';
  protected fieldMap: Record<keyof Route, string> = {
    id: 'id',
    name: 'name',
    description: 'description',
    stops: 'stops_json',
    createdAt: 'created_at',
  };
  protected jsonFields: Array<keyof Route> = ['stops'];

  findByName(name: string): Route | undefined {
    return this.findOneByField('name', name);
  }

  searchByName(name: string): Route[] {
    const rows = this.db
      .prepare(`SELECT * FROM ${this.tableName} WHERE name LIKE ? ORDER BY created_at DESC`)
      .all(`%${name}%`) as Record<string, unknown>[];
    return rows.map(row => this.fromDatabase(row));
  }

  findByAddress(address: string): Route[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM ${this.tableName} 
         WHERE stops_json LIKE ? 
         ORDER BY created_at DESC`
      )
      .all(`%${address}%`) as Record<string, unknown>[];
    return rows.map(row => this.fromDatabase(row));
  }

  addStop(routeId: string, stop: Omit<RouteStop, 'order'>): Route | undefined {
    const route = this.findById(routeId);
    if (!route) return undefined;

    const newStop: RouteStop = {
      ...stop,
      order: route.stops.length + 1,
    };

    const updatedStops = [...route.stops, newStop];
    return this.update(routeId, { stops: updatedStops });
  }

  removeStop(routeId: string, stopOrder: number): Route | undefined {
    const route = this.findById(routeId);
    if (!route) return undefined;

    const updatedStops = route.stops
      .filter(s => s.order !== stopOrder)
      .map((s, index) => ({ ...s, order: index + 1 }));

    return this.update(routeId, { stops: updatedStops });
  }

  reorderStops(routeId: string, newOrder: number[]): Route | undefined {
    const route = this.findById(routeId);
    if (!route) return undefined;

    const stopMap = new Map(route.stops.map(s => [s.order, s]));
    const updatedStops = newOrder.map((order, index) => {
      const stop = stopMap.get(order);
      if (!stop) return null;
      return { ...stop, order: index + 1 };
    }).filter(Boolean) as RouteStop[];

    if (updatedStops.length !== route.stops.length) {
      return undefined;
    }

    return this.update(routeId, { stops: updatedStops });
  }

  createRoute(data: Omit<Route, 'id' | 'createdAt'> & { id?: string; createdAt?: string }): Route {
    return this.create(data);
  }

  updateRoute(id: string, data: Partial<Omit<Route, 'id' | 'createdAt'>>): Route | undefined {
    return this.update(id, data);
  }
}

export const routeRepository = new RouteRepository();
