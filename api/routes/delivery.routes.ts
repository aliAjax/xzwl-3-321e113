import { Router } from 'express';
import { deliveryController } from '../controllers/delivery.controller';
import { authMiddleware } from '../middleware/auth.middleware';
import { requireRoles } from '../middleware/permission.middleware';

const router = Router();

router.get('/tasks/driver/:driverId?', authMiddleware, requireRoles('admin', 'dispatcher', 'driver'), deliveryController.getDriverTasks);
router.get('/tasks/:taskId', authMiddleware, requireRoles('admin', 'dispatcher', 'driver'), deliveryController.getTaskById);
router.get('/tasks/:taskId/nodes', authMiddleware, requireRoles('admin', 'dispatcher', 'driver'), deliveryController.getTaskNodes);
router.patch('/nodes/:nodeId', authMiddleware, requireRoles('admin', 'dispatcher', 'driver'), deliveryController.updateNode);
router.post('/nodes/:nodeId/start', authMiddleware, requireRoles('driver'), deliveryController.startNode);
router.post('/tasks/:taskId/nodes', authMiddleware, requireRoles('driver'), deliveryController.createNode);
router.post('/tasks/:taskId/complete', authMiddleware, requireRoles('driver'), deliveryController.completeTask);
router.get('/batches/:batchId/tasks', authMiddleware, requireRoles('admin', 'dispatcher'), deliveryController.getTasksByBatchId);
router.get('/exceptions', authMiddleware, requireRoles('admin', 'dispatcher'), deliveryController.getExceptions);

export default router;
