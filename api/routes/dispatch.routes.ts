import { Router } from 'express';
import { dispatchController } from '../controllers/dispatch.controller';
import { authMiddleware } from '../middleware/auth.middleware';
import { requireRoles } from '../middleware/permission.middleware';

const router = Router();

router.post('/matches', authMiddleware, requireRoles('admin', 'dispatcher'), dispatchController.findMatches);
router.post('/preview', authMiddleware, requireRoles('admin', 'dispatcher'), dispatchController.preview);
router.post('/', authMiddleware, requireRoles('admin', 'dispatcher'), dispatchController.create);
router.get('/active', authMiddleware, requireRoles('admin', 'dispatcher'), dispatchController.getActive);
router.get('/date-range', authMiddleware, requireRoles('admin', 'dispatcher'), dispatchController.getByDateRange);
router.get('/:id', authMiddleware, requireRoles('admin', 'dispatcher'), dispatchController.getById);
router.post('/:batchId/cancel', authMiddleware, requireRoles('admin', 'dispatcher'), dispatchController.cancel);

export default router;
