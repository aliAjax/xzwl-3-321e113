import { Request, Response } from 'express';
import { temperatureZoneService } from '../services/temperatureZone.service';
import type { TemperatureZone } from '../../shared/types';

export const temperatureZoneController = {
  async getSummary(req: Request, res: Response): Promise<Response> {
    try {
      const summary = temperatureZoneService.getSummary();
      return res.status(200).json(summary);
    } catch (error) {
      return res.status(500).json({ message: '获取温区汇总数据失败', error: (error as Error).message });
    }
  },

  async getZoneSummary(req: Request, res: Response): Promise<Response> {
    try {
      const { zone } = req.params;
      const validZones: TemperatureZone[] = ['frozen', 'chilled', 'ambient'];

      if (!validZones.includes(zone as TemperatureZone)) {
        return res.status(400).json({ message: '无效的温区类型' });
      }

      const stats = temperatureZoneService.getZoneSummaryByZone(zone as TemperatureZone);
      return res.status(200).json(stats);
    } catch (error) {
      return res.status(500).json({ message: '获取温区数据失败', error: (error as Error).message });
    }
  },

  async getAbnormalRecords(req: Request, res: Response): Promise<Response> {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 10;

      const records = temperatureZoneService.getAbnormalRecords(limit);
      return res.status(200).json(records);
    } catch (error) {
      return res.status(500).json({ message: '获取异常温度记录失败', error: (error as Error).message });
    }
  },

  async getZoneOrders(req: Request, res: Response): Promise<Response> {
    try {
      const { zone } = req.params;
      const validZones: TemperatureZone[] = ['frozen', 'chilled', 'ambient'];

      if (!validZones.includes(zone as TemperatureZone)) {
        return res.status(400).json({ message: '无效的温区类型' });
      }

      const data = temperatureZoneService.getZoneOrders(zone as TemperatureZone);
      return res.status(200).json(data);
    } catch (error) {
      return res.status(500).json({ message: '获取温区订单失败', error: (error as Error).message });
    }
  },

  async getZoneVehicles(req: Request, res: Response): Promise<Response> {
    try {
      const { zone } = req.params;
      const validZones: TemperatureZone[] = ['frozen', 'chilled', 'ambient'];

      if (!validZones.includes(zone as TemperatureZone)) {
        return res.status(400).json({ message: '无效的温区类型' });
      }

      const vehicles = temperatureZoneService.getZoneVehicles(zone as TemperatureZone);
      return res.status(200).json(vehicles);
    } catch (error) {
      return res.status(500).json({ message: '获取温区车辆失败', error: (error as Error).message });
    }
  },
};
