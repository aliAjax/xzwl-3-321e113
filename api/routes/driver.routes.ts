import { Router } from 'express';
import { driverController } from '../controllers/driver.controller';
import { authMiddleware } from '../middleware/auth.middleware';
import { requireRoles } from '../middleware/permission.middleware';

const router = Router();

router.get('/', authMiddleware, requireRoles('admin', 'dispatcher'), driverController.getAll);
router.get('/count', authMiddleware, requireRoles('admin', 'dispatcher'), driverController.count);
router.get('/search', authMiddleware, requireRoles('admin', 'dispatcher'), driverController.search);
router.get('/on-duty', authMiddleware, requireRoles('admin', 'dispatcher'), driverController.getOnDuty);
router.get('/status/:status', authMiddleware, requireRoles('admin', 'dispatcher'), driverController.getByStatus);
router.get('/name/:name', authMiddleware, requireRoles('admin', 'dispatcher'), driverController.getByName);
router.get('/:id', authMiddleware, requireRoles('admin', 'dispatcher'), driverController.getById);
router.post('/', authMiddleware, requireRoles('admin'), driverController.create);
router.put('/:id', authMiddleware, requireRoles('admin'), driverController.update);
router.patch('/:id/status', authMiddleware, requireRoles('admin', 'driver'), driverController.updateStatus);
router.delete('/:id', authMiddleware, requireRoles('admin'), driverController.delete);

export default router;
