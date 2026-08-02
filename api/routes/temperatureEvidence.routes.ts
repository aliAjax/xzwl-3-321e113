import { Router } from 'express';
import { temperatureEvidenceController } from '../controllers/temperatureEvidence.controller';
import { authMiddleware } from '../middleware/auth.middleware';
import { requireRoles } from '../middleware/permission.middleware';

const router = Router();

router.use(authMiddleware);

// 司机离线上报与历史回填：司机可提交离线数据，管理员/调度员可回填。
router.post('/ingest', requireRoles('admin', 'dispatcher', 'driver'), temperatureEvidenceController.ingest);

// CSV 导入：仅管理员/调度员。
router.post('/ingest-csv', requireRoles('admin', 'dispatcher'), temperatureEvidenceController.ingestCsv);

// 时间线查询。
router.get('/timeline/:orderId', requireRoles('admin', 'dispatcher', 'driver'), temperatureEvidenceController.getTimeline);

export default router;
