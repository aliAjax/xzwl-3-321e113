import { Router } from 'express';
import { exceptionHandlingController } from '../controllers/exception.controller';
import { authMiddleware } from '../middleware/auth.middleware';
import { requireRoles } from '../middleware/permission.middleware';

const router = Router();

router.use(authMiddleware);
router.use(requireRoles('admin', 'dispatcher'));

router.get('/sync', exceptionHandlingController.syncExceptions);
router.get('/stats', exceptionHandlingController.getStats);
router.get('/drivers', exceptionHandlingController.getDrivers);
router.get('/:id', exceptionHandlingController.getDetail);
router.get('/:taskId/temperature-records', exceptionHandlingController.getTemperatureRecords);
router.get('/', exceptionHandlingController.getList);
router.put('/:id', exceptionHandlingController.handleException);

export default router;
