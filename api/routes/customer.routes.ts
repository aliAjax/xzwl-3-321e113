import { Router } from 'express';
import { customerController } from '../controllers/customer.controller';
import { authMiddleware } from '../middleware/auth.middleware';
import { requireRoles } from '../middleware/permission.middleware';

const router = Router();

router.get('/', authMiddleware, requireRoles('admin', 'dispatcher'), customerController.getAll);
router.get('/count', authMiddleware, requireRoles('admin', 'dispatcher'), customerController.count);
router.get('/search', authMiddleware, requireRoles('admin', 'dispatcher'), customerController.search);
router.get('/priority/:priority', authMiddleware, requireRoles('admin', 'dispatcher'), customerController.getByPriority);
router.get('/name/:name', authMiddleware, requireRoles('admin', 'dispatcher'), customerController.getByName);
router.get('/:id', authMiddleware, requireRoles('admin', 'dispatcher'), customerController.getById);
router.post('/', authMiddleware, requireRoles('admin'), customerController.create);
router.put('/:id', authMiddleware, requireRoles('admin'), customerController.update);
router.delete('/:id', authMiddleware, requireRoles('admin'), customerController.delete);

export default router;
