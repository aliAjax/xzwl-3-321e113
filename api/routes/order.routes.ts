import { Router } from 'express';
import { orderController } from '../controllers/order.controller';
import { authMiddleware } from '../middleware/auth.middleware';
import { requireRoles } from '../middleware/permission.middleware';

const router = Router();

router.get('/', authMiddleware, requireRoles('admin', 'dispatcher'), orderController.getAll);
router.get('/count', authMiddleware, requireRoles('admin', 'dispatcher'), orderController.count);
router.get('/search', authMiddleware, requireRoles('admin', 'dispatcher'), orderController.search);
router.get('/date-range', authMiddleware, requireRoles('admin', 'dispatcher'), orderController.getByDateRange);
router.get('/status/:status', authMiddleware, requireRoles('admin', 'dispatcher'), orderController.getByStatus);
router.get('/temperature-zone/:temperatureZone', authMiddleware, requireRoles('admin', 'dispatcher'), orderController.getByTemperatureZone);
router.get('/customer/:customerId', authMiddleware, requireRoles('admin', 'dispatcher'), orderController.getByCustomerId);
router.get('/order-no/:orderNo', authMiddleware, requireRoles('admin', 'dispatcher'), orderController.getByOrderNo);
router.get('/:id/timeline', authMiddleware, requireRoles('admin', 'dispatcher', 'driver'), orderController.getTimeline);
router.get('/:id', authMiddleware, requireRoles('admin', 'dispatcher', 'driver'), orderController.getById);
router.post('/', authMiddleware, requireRoles('admin', 'dispatcher'), orderController.create);
router.post('/batch', authMiddleware, requireRoles('admin', 'dispatcher'), orderController.batchCreate);
router.put('/:id', authMiddleware, requireRoles('admin', 'dispatcher'), orderController.update);
router.patch('/:id/status', authMiddleware, requireRoles('admin', 'dispatcher'), orderController.updateStatus);
router.delete('/:id', authMiddleware, requireRoles('admin'), orderController.delete);

export default router;
