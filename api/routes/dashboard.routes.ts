import { Router } from 'express';
import { dashboardController } from '../controllers/dashboard.controller';
import { authMiddleware } from '../middleware/auth.middleware';
import { requireRoles } from '../middleware/permission.middleware';

const router = Router();

router.get('/stats', authMiddleware, requireRoles('admin', 'dispatcher'), dashboardController.getStats);
router.get('/today-tasks', authMiddleware, requireRoles('admin', 'dispatcher', 'driver'), dashboardController.getTodayTasks);
router.get('/recent-exceptions', authMiddleware, requireRoles('admin', 'dispatcher'), dashboardController.getRecentExceptions);
router.get('/status-counts', authMiddleware, requireRoles('admin', 'dispatcher'), dashboardController.getStatusCounts);
router.get('/daily-stats', authMiddleware, requireRoles('admin', 'dispatcher'), dashboardController.getDailyStats);

export default router;
