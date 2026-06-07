import { Router } from 'express';
import { vehicleController } from '../controllers/vehicle.controller';
import { authMiddleware } from '../middleware/auth.middleware';
import { requireRoles } from '../middleware/permission.middleware';

const router = Router();

router.get('/', authMiddleware, requireRoles('admin', 'dispatcher'), vehicleController.getAll);
router.get('/count', authMiddleware, requireRoles('admin', 'dispatcher'), vehicleController.count);
router.get('/search', authMiddleware, requireRoles('admin', 'dispatcher'), vehicleController.search);
router.get('/available', authMiddleware, requireRoles('admin', 'dispatcher'), vehicleController.getAvailable);
router.get('/capacity', authMiddleware, requireRoles('admin', 'dispatcher'), vehicleController.getWithCapacity);
router.get('/status/:status', authMiddleware, requireRoles('admin', 'dispatcher'), vehicleController.getByStatus);
router.get('/temperature-zone/:temperatureZone', authMiddleware, requireRoles('admin', 'dispatcher'), vehicleController.getByTemperatureZone);
router.get('/plate-no/:plateNo', authMiddleware, requireRoles('admin', 'dispatcher'), vehicleController.getByPlateNo);
router.get('/:id', authMiddleware, requireRoles('admin', 'dispatcher'), vehicleController.getById);
router.post('/', authMiddleware, requireRoles('admin'), vehicleController.create);
router.put('/:id', authMiddleware, requireRoles('admin'), vehicleController.update);
router.patch('/:id/status', authMiddleware, requireRoles('admin'), vehicleController.updateStatus);
router.patch('/:vehicleId/assign-driver', authMiddleware, requireRoles('admin', 'dispatcher'), vehicleController.assignDriver);
router.delete('/:id', authMiddleware, requireRoles('admin'), vehicleController.delete);

export default router;
