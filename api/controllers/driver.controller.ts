import { Request, Response } from 'express';
import { driverService } from '../services/driver.service';
import type { Driver } from '@shared/types';

export const driverController = {
  async getAll(req: Request, res: Response): Promise<Response> {
    try {
      const drivers = await driverService.getAllDrivers();
      return res.status(200).json(drivers);
    } catch (error) {
      return res.status(500).json({ message: '获取司机列表失败', error: (error as Error).message });
    }
  },

  async getById(req: Request, res: Response): Promise<Response> {
    try {
      const { id } = req.params;

      if (!id) {
        return res.status(400).json({ message: '司机ID不能为空' });
      }

      const driver = await driverService.getDriverById(id);

      if (!driver) {
        return res.status(404).json({ message: '司机不存在' });
      }

      return res.status(200).json(driver);
    } catch (error) {
      return res.status(500).json({ message: '获取司机详情失败', error: (error as Error).message });
    }
  },

  async getByName(req: Request, res: Response): Promise<Response> {
    try {
      const { name } = req.params;

      if (!name) {
        return res.status(400).json({ message: '司机姓名不能为空' });
      }

      const driver = await driverService.getDriverByName(name);

      if (!driver) {
        return res.status(404).json({ message: '司机不存在' });
      }

      return res.status(200).json(driver);
    } catch (error) {
      return res.status(500).json({ message: '获取司机详情失败', error: (error as Error).message });
    }
  },

  async getByStatus(req: Request, res: Response): Promise<Response> {
    try {
      const { status } = req.params;

      if (!status) {
        return res.status(400).json({ message: '司机状态不能为空' });
      }

      const drivers = await driverService.getDriversByStatus(status as 'on_duty' | 'off_duty' | 'on_leave');
      return res.status(200).json(drivers);
    } catch (error) {
      return res.status(500).json({ message: '获取司机列表失败', error: (error as Error).message });
    }
  },

  async getOnDuty(req: Request, res: Response): Promise<Response> {
    try {
      const drivers = await driverService.getOnDutyDrivers();
      return res.status(200).json(drivers);
    } catch (error) {
      return res.status(500).json({ message: '获取在岗司机失败', error: (error as Error).message });
    }
  },

  async search(req: Request, res: Response): Promise<Response> {
    try {
      const { name } = req.query;

      if (!name) {
        return res.status(400).json({ message: '司机姓名不能为空' });
      }

      const drivers = await driverService.searchDriversByName(name as string);
      return res.status(200).json(drivers);
    } catch (error) {
      return res.status(500).json({ message: '搜索司机失败', error: (error as Error).message });
    }
  },

  async create(req: Request, res: Response): Promise<Response> {
    try {
      const data = req.body as Omit<Driver, 'id' | 'createdAt'>;

      if (!data.name || !data.phone || !data.licenseNo) {
        return res.status(400).json({ message: '姓名、电话和驾驶证号不能为空' });
      }

      const driver = await driverService.createDriver(data);
      return res.status(201).json(driver);
    } catch (error) {
      return res.status(500).json({ message: '创建司机失败', error: (error as Error).message });
    }
  },

  async update(req: Request, res: Response): Promise<Response> {
    try {
      const { id } = req.params;
      const data = req.body as Partial<Omit<Driver, 'id' | 'createdAt'>>;

      if (!id) {
        return res.status(400).json({ message: '司机ID不能为空' });
      }

      const exists = await driverService.driverExists(id);
      if (!exists) {
        return res.status(404).json({ message: '司机不存在' });
      }

      const driver = await driverService.updateDriver(id, data);

      if (!driver) {
        return res.status(404).json({ message: '司机不存在' });
      }

      return res.status(200).json(driver);
    } catch (error) {
      return res.status(500).json({ message: '更新司机失败', error: (error as Error).message });
    }
  },

  async updateStatus(req: Request, res: Response): Promise<Response> {
    try {
      const { id } = req.params;
      const { status } = req.body as { status: 'on_duty' | 'off_duty' | 'on_leave' };

      if (!id || !status) {
        return res.status(400).json({ message: '司机ID和状态不能为空' });
      }

      const exists = await driverService.driverExists(id);
      if (!exists) {
        return res.status(404).json({ message: '司机不存在' });
      }

      const driver = await driverService.updateDriverStatus(id, status);

      if (!driver) {
        return res.status(404).json({ message: '司机不存在' });
      }

      return res.status(200).json(driver);
    } catch (error) {
      return res.status(500).json({ message: '更新司机状态失败', error: (error as Error).message });
    }
  },

  async delete(req: Request, res: Response): Promise<Response> {
    try {
      const { id } = req.params;

      if (!id) {
        return res.status(400).json({ message: '司机ID不能为空' });
      }

      const exists = await driverService.driverExists(id);
      if (!exists) {
        return res.status(404).json({ message: '司机不存在' });
      }

      const success = await driverService.deleteDriver(id);

      if (!success) {
        return res.status(404).json({ message: '司机不存在' });
      }

      return res.status(200).json({ message: '删除成功' });
    } catch (error) {
      return res.status(500).json({ message: '删除司机失败', error: (error as Error).message });
    }
  },

  async count(req: Request, res: Response): Promise<Response> {
    try {
      const count = await driverService.countDrivers();
      return res.status(200).json({ count });
    } catch (error) {
      return res.status(500).json({ message: '获取司机数量失败', error: (error as Error).message });
    }
  },
};
