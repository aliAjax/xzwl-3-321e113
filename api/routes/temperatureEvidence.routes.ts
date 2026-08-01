import { Router } from 'express';
import { temperatureEvidenceController } from '../controllers/temperatureEvidence.controller';
import { authMiddleware } from '../middleware/auth.middleware';
import { requireRoles } from '../middleware/permission.middleware';

const router = Router();

router.use(authMiddleware);

router.post(
  '/driver',
  requireRoles('admin', 'dispatcher', 'driver'),
  temperatureEvidenceController.submitDriver
);

router.post(
  '/backfill',
  requireRoles('admin', 'dispatcher'),
  temperatureEvidenceController.submitBackfill
);

router.get(
  '/node/:nodeId',
  requireRoles('admin', 'dispatcher', 'driver'),
  temperatureEvidenceController.getByNode
);

router.get(
  '/node/:nodeId/summary',
  requireRoles('admin', 'dispatcher', 'driver'),
  temperatureEvidenceController.getNodeSummary
);

router.get(
  '/task/:taskId/timeline',
  requireRoles('admin', 'dispatcher', 'driver'),
  temperatureEvidenceController.getTimelineByTask
);

router.get(
  '/batch/:batchId',
  requireRoles('admin', 'dispatcher'),
  temperatureEvidenceController.getByBatch
);

export default router;
