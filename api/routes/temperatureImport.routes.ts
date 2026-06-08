import { Router } from 'express';
import { temperatureImportController } from '../controllers/temperatureImport.controller';
import { authMiddleware } from '../middleware/auth.middleware';
import { requireRoles } from '../middleware/permission.middleware';

const router = Router();

router.use(authMiddleware);
router.use(requireRoles('admin', 'dispatcher'));

router.post('/parse-columns', temperatureImportController.parseColumns);
router.post('/preview', temperatureImportController.previewImport);
router.post('/import', temperatureImportController.confirmImport);

export default router;
