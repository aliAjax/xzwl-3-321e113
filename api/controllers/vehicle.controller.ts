import { Request, Response } from 'express';
import { vehicleService } from '../services/vehicle.service';
import type { Vehicle, TemperatureZone } from '@shared/types';

export const vehicleController = {
  async getAll(req: Request, res: Response): Promise<Response> {
    try {
      const vehicles = await vehicleService.getAllVehicles();
      return res.status(200).json(vehicles);
    } catch (error) {
      return res.status(500).json({ message: '获取车辆列表失败', error: (error as Error).message });
    }
  },

  async getById(req: Request, res: Response): Promise<Response> {
    try {
      const { id } = req.params;

      if (!id) {
        return res.status(400).json({ message: '车辆ID不能为空' });
      }

      const vehicle = await vehicleService.getVehicleById(id);

      if (!vehicle) {
        return res.status(404).json({ message: '车辆不存在' });
      }

      return res.status(200).json(vehicle);
    } catch (error) {
      return res.status(500).json({ message: '获取车辆详情失败', error: (error as Error).message });
    }
  },

  async getByPlateNo(req: Request, res: Response): Promise<Response> {
    try {
      const { plateNo } = req.params;

      if (!plateNo) {
        return res.status(400).json({ message: '车牌号不能为空' });
      }

      const vehicle = await vehicleService.getVehicleByPlateNo(plateNo);

      if (!vehicle) {
        return res.status(404).json({ message: '车辆不存在' });
      }

      return res.status(200).json(vehicle);
    } catch (error) {
      return res.status(500).json({ message: '获取车辆详情失败', error: (error as Error).message });
    }
  },

  async getByStatus(req: Request, res: Response): Promise<Response> {
    try {
      const { status } = req.params;

      if (!status) {
        return res.status(400).json({ message: '车辆状态不能为空' });
      }

      const vehicles = await vehicleService.getVehiclesByStatus(status as 'active' | 'maintenance' | 'disabled');
      return res.status(200).json(vehicles);
    } catch (error) {
      return res.status(500).json({ message: '获取车辆列表失败', error: (error as Error).message });
    }
  },

  async getAvailable(req: Request, res: Response): Promise<Response> {
    try {
      const vehicles = await vehicleService.getAvailableVehicles();
      return res.status(200).json(vehicles);
    } catch (error) {
      return res.status(500).json({ message: '获取可用车辆失败', error: (error as Error).message });
    }
  },

  async getByTemperatureZone(req: Request, res: Response): Promise<Response> {
    try {
      const { temperatureZone } = req.params;

      if (!temperatureZone) {
        return res.status(400).json({ message: '温控区域不能为空' });
      }

      const vehicles = await vehicleService.getVehiclesByTemperatureZone(temperatureZone as TemperatureZone);
      return res.status(200).json(vehicles);
    } catch (error) {
      return res.status(500).json({ message: '获取车辆列表失败', error: (error as Error).message });
    }
  },

  async getWithCapacity(req: Request, res: Response): Promise<Response> {
    try {
      const { minCapacity } = req.query;

      if (!minCapacity) {
        return res.status(400).json({ message: '最小载重不能为空' });
      }

      const vehicles = await vehicleService.getVehiclesWithCapacity(parseInt(minCapacity as string));
      return res.status(200).json(vehicles);
    } catch (error) {
      return res.status(500).json({ message: '获取车辆列表失败', error: (error as Error).message });
    }
  },

  async search(req: Request, res: Response): Promise<Response> {
    try {
      const { plateNo } = req.query;

      if (!plateNo) {
        return res.status(400).json({ message: '车牌号不能为空' });
      }

      const vehicles = await vehicleService.searchVehiclesByPlateNo(plateNo as string);
      return res.status(200).json(vehicles);
    } catch (error) {
      return res.status(500).json({ message: '搜索车辆失败', error: (error as Error).message });
    }
  },

  async create(req: Request, res: Response): Promise<Response> {
    try {
      const data = req.body as Omit<Vehicle, 'id' | 'createdAt'>;

      if (!data.plateNo || !data.vehicleType) {
        return res.status(400).json({ message: '车牌号和车型不能为空' });
      }

      const vehicle = await vehicleService.createVehicle(data);
      return res.status(201).json(vehicle);
    } catch (error) {
      return res.status(500).json({ message: '创建车辆失败', error: (error as Error).message });
    }
  },

  async update(req: Request, res: Response): Promise<Response> {
    try {
      const { id } = req.params;
      const data = req.body as Partial<Omit<Vehicle, 'id' | 'createdAt'>>;

      if (!id) {
        return res.status(400).json({ message: '车辆ID不能为空' });
      }

      const exists = await vehicleService.vehicleExists(id);
      if (!exists) {
        return res.status(404).json({ message: '车辆不存在' });
      }

      const vehicle = await vehicleService.updateVehicle(id, data);

      if (!vehicle) {
        return res.status(404).json({ message: '车辆不存在' });
      }

      return res.status(200).json(vehicle);
    } catch (error) {
      return res.status(500).json({ message: '更新车辆失败', error: (error as Error).message });
    }
  },

  async updateStatus(req: Request, res: Response): Promise<Response> {
    try {
      const { id } = req.params;
      const { status } = req.body as { status: 'active' | 'maintenance' | 'disabled' };

      if (!id || !status) {
        return res.status(400).json({ message: '车辆ID和状态不能为空' });
      }

      const exists = await vehicleService.vehicleExists(id);
      if (!exists) {
        return res.status(404).json({ message: '车辆不存在' });
      }

      const vehicle = await vehicleService.updateVehicleStatus(id, status);

      if (!vehicle) {
        return res.status(404).json({ message: '车辆不存在' });
      }

      return res.status(200).json(vehicle);
    } catch (error) {
      return res.status(500).json({ message: '更新车辆状态失败', error: (error as Error).message });
    }
  },

  async assignDriver(req: Request, res: Response): Promise<Response> {
    try {
      const { vehicleId } = req.params;
      const { driverId } = req.body as { driverId: string | null };

      if (!vehicleId) {
        return res.status(400).json({ message: '车辆ID不能为空' });
      }

      const exists = await vehicleService.vehicleExists(vehicleId);
      if (!exists) {
        return res.status(404).json({ message: '车辆不存在' });
      }

      const vehicle = await vehicleService.assignDriver(vehicleId, driverId);

      if (!vehicle) {
        return res.status(404).json({ message: '车辆不存在' });
      }

      return res.status(200).json(vehicle);
    } catch (error) {
      return res.status(500).json({ message: '分配司机失败', error: (error as Error).message });
    }
  },

  async delete(req: Request, res: Response): Promise<Response> {
    try {
      const { id } = req.params;

      if (!id) {
        return res.status(400).json({ message: '车辆ID不能为空' });
      }

      const exists = await vehicleService.vehicleExists(id);
      if (!exists) {
        return res.status(404).json({ message: '车辆不存在' });
      }

      const success = await vehicleService.deleteVehicle(id);

      if (!success) {
        return res.status(404).json({ message: '车辆不存在' });
      }

      return res.status(200).json({ message: '删除成功' });
    } catch (error) {
      return res.status(500).json({ message: '删除车辆失败', error: (error as Error).message });
    }
  },

  async count(req: Request, res: Response): Promise<Response> {
    try {
      const count = await vehicleService.countVehicles();
      return res.status(200).json({ count });
    } catch (error) {
      return res.status(500).json({ message: '获取车辆数量失败', error: (error as Error).message });
    }
  },
};
