import { Router } from 'express';
import { temperatureLedgerController } from '../controllers/temperature-ledger.controller';
import { authMiddleware } from '../middleware/auth.middleware';
import { requireRoles } from '../middleware/permission.middleware';

const router = Router();

router.use(authMiddleware);

router.post(
  '/evidence',
  requireRoles('admin', 'dispatcher', 'driver'),
  temperatureLedgerController.append
);

router.post(
  '/evidence/csv',
  requireRoles('admin', 'dispatcher'),
  temperatureLedgerController.importCsv
);

router.post(
  '/evidence/driver-offline',
  requireRoles('admin', 'dispatcher', 'driver'),
  temperatureLedgerController.uploadDriverOffline
);

router.post(
  '/evidence/backfill',
  requireRoles('admin', 'dispatcher'),
  temperatureLedgerController.backfillHistorical
);

router.get(
  '/evidence/node/:nodeId',
  requireRoles('admin', 'dispatcher', 'driver'),
  temperatureLedgerController.getByNode
);

router.get(
  '/evidence/task/:taskId',
  requireRoles('admin', 'dispatcher', 'driver'),
  temperatureLedgerController.getByTask
);

router.get(
  '/evidence/order/:orderId',
  requireRoles('admin', 'dispatcher', 'driver'),
  temperatureLedgerController.getByOrder
);

router.get(
  '/evidence/reading/:readingKey',
  requireRoles('admin', 'dispatcher', 'driver'),
  temperatureLedgerController.getByReadingKey
);

router.get(
  '/evidence/batch/:batchId',
  requireRoles('admin', 'dispatcher'),
  temperatureLedgerController.getByBatch
);

export default router;
