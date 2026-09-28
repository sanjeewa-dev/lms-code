import { Router } from 'express';
import { resolveTenant, requireTenantMatch, enterTenantContext } from '../middleware/tenant';
import { authenticate } from '../middleware/auth';
import classRoutes from './classes';
import paymentRoutes from './payments';
import materialRoutes from './materials';
import submissionRoutes from './submissions';
import quizRoutes from './quizzes';
import quizTopicRoutes from './quizTopics';
import questionBankRoutes from './questionBank';
import quizAnalyticsRoutes from './quizAnalytics';
import scheduleRoutes from './schedules';
import featureRoutes from './features';
import overviewRoutes from './overview';
import profileRoutes from './profile';
import settingsRoutes from './settings';
import attendanceRoutes from './attendance';
import notificationRoutes from './notifications';
import gradebookRoutes from './gradebook';
import smartRoutes from './smart';
import liveRoutes from './live';
import aiStudentRoutes from './aiStudent';
import aiTeacherRoutes from './aiTeacher';
import interventionRoutes from './interventions';
import parentTrustRoutes from './parentTrust';
import chatRoutes from './chat';
import materialOrderRoutes from './materialOrders';

// Mounted at /api/t/:slug - all routes require an authenticated user that
// belongs to the resolved tenant, and run inside the tenant query context.
const router = Router({ mergeParams: true });

router.use(resolveTenant, authenticate, requireTenantMatch, enterTenantContext);

router.use(classRoutes);
router.use(paymentRoutes);
router.use(materialRoutes);
router.use(materialOrderRoutes);
router.use(submissionRoutes);
router.use(quizRoutes);
router.use(quizTopicRoutes);
router.use(questionBankRoutes);
router.use(quizAnalyticsRoutes);
router.use(scheduleRoutes);
router.use(featureRoutes);
router.use(overviewRoutes);
router.use(profileRoutes);
router.use(settingsRoutes);
router.use(attendanceRoutes);
router.use(notificationRoutes);
router.use(gradebookRoutes);
router.use(liveRoutes);
router.use(smartRoutes);
router.use(aiStudentRoutes);
router.use(aiTeacherRoutes);
router.use(interventionRoutes);
router.use(parentTrustRoutes);
router.use(chatRoutes);

export default router;
