import { Request, Response } from 'express';
import { customerService } from '../services/customer.service';
import type { Customer } from '@shared/types';

export const customerController = {
  async getAll(req: Request, res: Response): Promise<Response> {
    try {
      const customers = await customerService.getAllCustomers();
      return res.status(200).json(customers);
    } catch (error) {
      return res.status(500).json({ message: '获取客户列表失败', error: (error as Error).message });
    }
  },

  async getById(req: Request, res: Response): Promise<Response> {
    try {
      const { id } = req.params;

      if (!id) {
        return res.status(400).json({ message: '客户ID不能为空' });
      }

      const customer = await customerService.getCustomerById(id);

      if (!customer) {
        return res.status(404).json({ message: '客户不存在' });
      }

      return res.status(200).json(customer);
    } catch (error) {
      return res.status(500).json({ message: '获取客户详情失败', error: (error as Error).message });
    }
  },

  async getByName(req: Request, res: Response): Promise<Response> {
    try {
      const { name } = req.params;

      if (!name) {
        return res.status(400).json({ message: '客户名称不能为空' });
      }

      const customer = await customerService.getCustomerByName(name);

      if (!customer) {
        return res.status(404).json({ message: '客户不存在' });
      }

      return res.status(200).json(customer);
    } catch (error) {
      return res.status(500).json({ message: '获取客户详情失败', error: (error as Error).message });
    }
  },

  async getByPriority(req: Request, res: Response): Promise<Response> {
    try {
      const { priority } = req.params;

      if (!priority) {
        return res.status(400).json({ message: '优先级不能为空' });
      }

      const customers = await customerService.getCustomersByPriority(parseInt(priority as string));
      return res.status(200).json(customers);
    } catch (error) {
      return res.status(500).json({ message: '获取客户列表失败', error: (error as Error).message });
    }
  },

  async search(req: Request, res: Response): Promise<Response> {
    try {
      const { name } = req.query;

      if (!name) {
        return res.status(400).json({ message: '客户名称不能为空' });
      }

      const customers = await customerService.searchCustomersByName(name as string);
      return res.status(200).json(customers);
    } catch (error) {
      return res.status(500).json({ message: '搜索客户失败', error: (error as Error).message });
    }
  },

  async create(req: Request, res: Response): Promise<Response> {
    try {
      const data = req.body as Omit<Customer, 'id' | 'createdAt'>;

      if (!data.name || !data.contactName || !data.phone) {
        return res.status(400).json({ message: '客户名称、联系人姓名和电话不能为空' });
      }

      const customer = await customerService.createCustomer(data);
      return res.status(201).json(customer);
    } catch (error) {
      return res.status(500).json({ message: '创建客户失败', error: (error as Error).message });
    }
  },

  async update(req: Request, res: Response): Promise<Response> {
    try {
      const { id } = req.params;
      const data = req.body as Partial<Omit<Customer, 'id' | 'createdAt'>>;

      if (!id) {
        return res.status(400).json({ message: '客户ID不能为空' });
      }

      const exists = await customerService.customerExists(id);
      if (!exists) {
        return res.status(404).json({ message: '客户不存在' });
      }

      const customer = await customerService.updateCustomer(id, data);

      if (!customer) {
        return res.status(404).json({ message: '客户不存在' });
      }

      return res.status(200).json(customer);
    } catch (error) {
      return res.status(500).json({ message: '更新客户失败', error: (error as Error).message });
    }
  },

  async delete(req: Request, res: Response): Promise<Response> {
    try {
      const { id } = req.params;

      if (!id) {
        return res.status(400).json({ message: '客户ID不能为空' });
      }

      const exists = await customerService.customerExists(id);
      if (!exists) {
        return res.status(404).json({ message: '客户不存在' });
      }

      const success = await customerService.deleteCustomer(id);

      if (!success) {
        return res.status(404).json({ message: '客户不存在' });
      }

      return res.status(200).json({ message: '删除成功' });
    } catch (error) {
      return res.status(500).json({ message: '删除客户失败', error: (error as Error).message });
    }
  },

  async count(req: Request, res: Response): Promise<Response> {
    try {
      const count = await customerService.countCustomers();
      return res.status(200).json({ count });
    } catch (error) {
      return res.status(500).json({ message: '获取客户数量失败', error: (error as Error).message });
    }
  },
};
