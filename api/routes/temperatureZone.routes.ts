import { Router } from 'express';
import { temperatureZoneController } from '../controllers/temperatureZone.controller';
import { authMiddleware } from '../middleware/auth.middleware';
import { requireRoles } from '../middleware/permission.middleware';

const router = Router();

router.get('/summary', authMiddleware, requireRoles('admin', 'dispatcher'), temperatureZoneController.getSummary);
router.get('/zone/:zone', authMiddleware, requireRoles('admin', 'dispatcher'), temperatureZoneController.getZoneSummary);
router.get('/abnormal-records', authMiddleware, requireRoles('admin', 'dispatcher'), temperatureZoneController.getAbnormalRecords);
router.get('/zone/:zone/orders', authMiddleware, requireRoles('admin', 'dispatcher'), temperatureZoneController.getZoneOrders);
router.get('/zone/:zone/vehicles', authMiddleware, requireRoles('admin', 'dispatcher'), temperatureZoneController.getZoneVehicles);

export default router;
