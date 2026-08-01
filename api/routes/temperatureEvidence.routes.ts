import { Router } from 'express';
import { temperatureEvidenceController } from '../controllers/temperatureEvidence.controller';
import { authMiddleware } from '../middleware/auth.middleware';

const router = Router();

router.use(authMiddleware);

// 追加证据：CSV导入（admin/dispatcher）、司机离线上报（driver）、历史回填（admin/dispatcher）共用入口
router.post('/', temperatureEvidenceController.append);
router.get('/nodes/:nodeId/timeline', temperatureEvidenceController.getNodeTimeline);
router.get('/batches/:batchId', temperatureEvidenceController.getBatchEvidence);

export default router;
