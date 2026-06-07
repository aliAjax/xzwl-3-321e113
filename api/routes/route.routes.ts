import { Router } from 'express';
import { routeController } from '../controllers/route.controller';
import { authMiddleware } from '../middleware/auth.middleware';
import { requireRoles } from '../middleware/permission.middleware';

const router = Router();

router.get('/', authMiddleware, requireRoles('admin', 'dispatcher'), routeController.getAll);
router.get('/count', authMiddleware, requireRoles('admin', 'dispatcher'), routeController.count);
router.get('/search', authMiddleware, requireRoles('admin', 'dispatcher'), routeController.search);
router.get('/address', authMiddleware, requireRoles('admin', 'dispatcher'), routeController.getByAddress);
router.get('/name/:name', authMiddleware, requireRoles('admin', 'dispatcher'), routeController.getByName);
router.get('/:id', authMiddleware, requireRoles('admin', 'dispatcher'), routeController.getById);
router.post('/', authMiddleware, requireRoles('admin', 'dispatcher'), routeController.create);
router.put('/:id', authMiddleware, requireRoles('admin', 'dispatcher'), routeController.update);
router.post('/:routeId/stops', authMiddleware, requireRoles('admin', 'dispatcher'), routeController.addStop);
router.delete('/:routeId/stops/:stopOrder', authMiddleware, requireRoles('admin', 'dispatcher'), routeController.removeStop);
router.patch('/:routeId/stops/reorder', authMiddleware, requireRoles('admin', 'dispatcher'), routeController.reorderStops);
router.delete('/:id', authMiddleware, requireRoles('admin'), routeController.delete);

export default router;
