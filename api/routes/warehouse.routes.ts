import { Router } from 'express';
import { warehouseController } from '../controllers/warehouse.controller';
import { authMiddleware } from '../middleware/auth.middleware';
import { requireRoles } from '../middleware/permission.middleware';

const router = Router();

router.get('/pending-orders', authMiddleware, requireRoles('admin', 'dispatcher'), warehouseController.getPendingOrders);
router.get('/customers', authMiddleware, requireRoles('admin', 'dispatcher'), warehouseController.getCustomers);
router.get('/stats', authMiddleware, requireRoles('admin', 'dispatcher'), warehouseController.getStats);
router.post('/register', authMiddleware, requireRoles('admin', 'dispatcher'), warehouseController.registerWarehouseIn);

export default router;
