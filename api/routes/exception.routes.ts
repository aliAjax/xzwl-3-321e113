import { Router } from 'express';
import { exceptionHandlingController } from '../controllers/exception.controller';
import { authMiddleware } from '../middleware/auth.middleware';
import { requireRoles } from '../middleware/permission.middleware';

const router = Router();

router.use(authMiddleware);

router.get('/stats', exceptionHandlingController.getStats);
router.get('/workorder-stats', exceptionHandlingController.getWorkorderStats);
router.get('/drivers', exceptionHandlingController.getDrivers);
router.get('/users', exceptionHandlingController.getUsers);
router.get('/dispatchers', exceptionHandlingController.getDispatchers);
router.get('/node/:nodeId', exceptionHandlingController.getByNodeId);
router.get('/:taskId/temperature-records', exceptionHandlingController.getTemperatureRecords);

router.use(requireRoles('admin', 'dispatcher'));

router.get('/sync', exceptionHandlingController.syncExceptions);
router.get('/:id', exceptionHandlingController.getDetail);
router.get('/', exceptionHandlingController.getList);
router.post('/', exceptionHandlingController.createException);
router.put('/:id', exceptionHandlingController.handleException);
router.post('/:id/assign', exceptionHandlingController.assignException);
router.post('/:id/escalate', exceptionHandlingController.escalateException);
router.post('/:id/note', exceptionHandlingController.addNote);
router.post('/:id/close', exceptionHandlingController.closeException);
router.post('/:id/reopen', exceptionHandlingController.reopenException);

export default router;
