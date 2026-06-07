import { Request, Response } from 'express';
import { routeService } from '../services/route.service';
import type { Route, RouteStop } from '@shared/types';

export const routeController = {
  async getAll(req: Request, res: Response): Promise<Response> {
    try {
      const routes = await routeService.getAllRoutes();
      return res.status(200).json(routes);
    } catch (error) {
      return res.status(500).json({ message: '获取线路列表失败', error: (error as Error).message });
    }
  },

  async getById(req: Request, res: Response): Promise<Response> {
    try {
      const { id } = req.params;

      if (!id) {
        return res.status(400).json({ message: '线路ID不能为空' });
      }

      const route = await routeService.getRouteById(id);

      if (!route) {
        return res.status(404).json({ message: '线路不存在' });
      }

      return res.status(200).json(route);
    } catch (error) {
      return res.status(500).json({ message: '获取线路详情失败', error: (error as Error).message });
    }
  },

  async getByName(req: Request, res: Response): Promise<Response> {
    try {
      const { name } = req.params;

      if (!name) {
        return res.status(400).json({ message: '线路名称不能为空' });
      }

      const route = await routeService.getRouteByName(name);

      if (!route) {
        return res.status(404).json({ message: '线路不存在' });
      }

      return res.status(200).json(route);
    } catch (error) {
      return res.status(500).json({ message: '获取线路详情失败', error: (error as Error).message });
    }
  },

  async search(req: Request, res: Response): Promise<Response> {
    try {
      const { name } = req.query;

      if (!name) {
        return res.status(400).json({ message: '线路名称不能为空' });
      }

      const routes = await routeService.searchRoutesByName(name as string);
      return res.status(200).json(routes);
    } catch (error) {
      return res.status(500).json({ message: '搜索线路失败', error: (error as Error).message });
    }
  },

  async getByAddress(req: Request, res: Response): Promise<Response> {
    try {
      const { address } = req.query;

      if (!address) {
        return res.status(400).json({ message: '地址不能为空' });
      }

      const routes = await routeService.getRoutesByAddress(address as string);
      return res.status(200).json(routes);
    } catch (error) {
      return res.status(500).json({ message: '获取线路列表失败', error: (error as Error).message });
    }
  },

  async create(req: Request, res: Response): Promise<Response> {
    try {
      const data = req.body as Omit<Route, 'id' | 'createdAt'>;

      if (!data.name) {
        return res.status(400).json({ message: '线路名称不能为空' });
      }

      const route = await routeService.createRoute(data);
      return res.status(201).json(route);
    } catch (error) {
      return res.status(500).json({ message: '创建线路失败', error: (error as Error).message });
    }
  },

  async update(req: Request, res: Response): Promise<Response> {
    try {
      const { id } = req.params;
      const data = req.body as Partial<Omit<Route, 'id' | 'createdAt'>>;

      if (!id) {
        return res.status(400).json({ message: '线路ID不能为空' });
      }

      const exists = await routeService.routeExists(id);
      if (!exists) {
        return res.status(404).json({ message: '线路不存在' });
      }

      const route = await routeService.updateRoute(id, data);

      if (!route) {
        return res.status(404).json({ message: '线路不存在' });
      }

      return res.status(200).json(route);
    } catch (error) {
      return res.status(500).json({ message: '更新线路失败', error: (error as Error).message });
    }
  },

  async addStop(req: Request, res: Response): Promise<Response> {
    try {
      const { routeId } = req.params;
      const stop = req.body as Omit<RouteStop, 'order'>;

      if (!routeId || !stop.address) {
        return res.status(400).json({ message: '线路ID和站点地址不能为空' });
      }

      const exists = await routeService.routeExists(routeId);
      if (!exists) {
        return res.status(404).json({ message: '线路不存在' });
      }

      const route = await routeService.addStop(routeId, stop);

      if (!route) {
        return res.status(404).json({ message: '线路不存在' });
      }

      return res.status(200).json(route);
    } catch (error) {
      return res.status(500).json({ message: '添加站点失败', error: (error as Error).message });
    }
  },

  async removeStop(req: Request, res: Response): Promise<Response> {
    try {
      const { routeId, stopOrder } = req.params;

      if (!routeId || !stopOrder) {
        return res.status(400).json({ message: '线路ID和站点序号不能为空' });
      }

      const exists = await routeService.routeExists(routeId);
      if (!exists) {
        return res.status(404).json({ message: '线路不存在' });
      }

      const route = await routeService.removeStop(routeId, parseInt(stopOrder as string));

      if (!route) {
        return res.status(404).json({ message: '线路不存在' });
      }

      return res.status(200).json(route);
    } catch (error) {
      return res.status(500).json({ message: '删除站点失败', error: (error as Error).message });
    }
  },

  async reorderStops(req: Request, res: Response): Promise<Response> {
    try {
      const { routeId } = req.params;
      const { newOrder } = req.body as { newOrder: number[] };

      if (!routeId || !newOrder || !Array.isArray(newOrder)) {
        return res.status(400).json({ message: '线路ID和新的排序不能为空' });
      }

      const exists = await routeService.routeExists(routeId);
      if (!exists) {
        return res.status(404).json({ message: '线路不存在' });
      }

      const route = await routeService.reorderStops(routeId, newOrder);

      if (!route) {
        return res.status(404).json({ message: '线路不存在或排序参数无效' });
      }

      return res.status(200).json(route);
    } catch (error) {
      return res.status(500).json({ message: '重新排序站点失败', error: (error as Error).message });
    }
  },

  async delete(req: Request, res: Response): Promise<Response> {
    try {
      const { id } = req.params;

      if (!id) {
        return res.status(400).json({ message: '线路ID不能为空' });
      }

      const exists = await routeService.routeExists(id);
      if (!exists) {
        return res.status(404).json({ message: '线路不存在' });
      }

      const success = await routeService.deleteRoute(id);

      if (!success) {
        return res.status(404).json({ message: '线路不存在' });
      }

      return res.status(200).json({ message: '删除成功' });
    } catch (error) {
      return res.status(500).json({ message: '删除线路失败', error: (error as Error).message });
    }
  },

  async count(req: Request, res: Response): Promise<Response> {
    try {
      const count = await routeService.countRoutes();
      return res.status(200).json({ count });
    } catch (error) {
      return res.status(500).json({ message: '获取线路数量失败', error: (error as Error).message });
    }
  },
};
