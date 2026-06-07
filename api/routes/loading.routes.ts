import { Router } from 'express';
import { loadingController } from '../controllers/loading.controller';
import { authMiddleware } from '../middleware/auth.middleware';
import { requireRoles } from '../middleware/permission.middleware';

const router = Router();

router.get('/batches', authMiddleware, requireRoles('admin', 'dispatcher'), loadingController.getBatches);
router.get('/batches/:id', authMiddleware, requireRoles('admin', 'dispatcher'), loadingController.getBatchById);
router.post('/batches/:batchId/start', authMiddleware, requireRoles('admin', 'dispatcher'), loadingController.startLoading);
router.get('/batches/:batchId/tasks', authMiddleware, requireRoles('admin', 'dispatcher', 'driver'), loadingController.getTasks);
router.patch('/nodes/:nodeId', authMiddleware, requireRoles('admin', 'dispatcher', 'driver'), loadingController.updateNode);
router.post('/batches/:batchId/complete', authMiddleware, requireRoles('admin', 'dispatcher'), loadingController.completeLoading);
router.post('/batches/:batchId/orders', authMiddleware, requireRoles('admin', 'dispatcher'), loadingController.addOrder);
router.delete('/batches/:batchId/orders/:orderId', authMiddleware, requireRoles('admin', 'dispatcher'), loadingController.removeOrder);

export default router;
