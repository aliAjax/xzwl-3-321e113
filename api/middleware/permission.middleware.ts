import { Request, Response, NextFunction } from 'express';
import { UserRole } from '@shared/types';

export const requireRoles = (...roles: UserRole[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ message: '用户未认证' });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ message: '权限不足' });
    }

    next();
  };
};
