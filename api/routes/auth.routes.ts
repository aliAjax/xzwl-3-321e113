import { Router } from 'express';
import { authController } from '../controllers/auth.controller';
import { authMiddleware } from '../middleware/auth.middleware';
import { requireRoles } from '../middleware/permission.middleware';

const router = Router();

router.post('/login', authController.login);
router.get('/me', authMiddleware, requireRoles('admin', 'dispatcher', 'driver'), authController.me);

export default router;
