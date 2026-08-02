import { Router } from 'express';
import { temperatureEvidenceController } from '../controllers/temperatureEvidence.controller';
import { authMiddleware } from '../middleware/auth.middleware';
import { requireRoles } from '../middleware/permission.middleware';

const router = Router();

router.use(authMiddleware);

// 司机离线上报：来源在服务端强制为 driver_offline，司机无法伪造其他来源。
router.post('/driver-offline', requireRoles('driver', 'admin', 'dispatcher'), temperatureEvidenceController.ingestDriverOffline);

// 通用入口（CSV 导入 / 历史回填）：仅管理员/调度员，且拒绝 driver_offline 来源。
router.post('/ingest', requireRoles('admin', 'dispatcher'), temperatureEvidenceController.ingest);

// CSV 导入：仅管理员/调度员。
router.post('/ingest-csv', requireRoles('admin', 'dispatcher'), temperatureEvidenceController.ingestCsv);

// 时间线查询。
router.get('/timeline/:orderId', requireRoles('admin', 'dispatcher', 'driver'), temperatureEvidenceController.getTimeline);

export default router;
