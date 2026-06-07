import { Request, Response } from 'express';
import { authService } from '../services/auth.service';
import type { LoginRequest } from '@shared/types';

export const authController = {
  async login(req: Request, res: Response): Promise<Response> {
    try {
      const { username, password } = req.body as LoginRequest;

      if (!username || !password) {
        return res.status(400).json({ message: '用户名和密码不能为空' });
      }

      const result = await authService.login({ username, password });

      if (!result) {
        return res.status(401).json({ message: '用户名或密码错误' });
      }

      return res.status(200).json(result);
    } catch (error) {
      return res.status(500).json({ message: '登录失败', error: (error as Error).message });
    }
  },

  async me(req: Request, res: Response): Promise<Response> {
    try {
      if (!req.user) {
        return res.status(401).json({ message: '未登录' });
      }

      return res.status(200).json({ user: req.user });
    } catch (error) {
      return res.status(500).json({ message: '获取用户信息失败', error: (error as Error).message });
    }
  },
};
