import { Router } from 'express';
import * as assessmentController from '../controllers/assessmentController.js';

const router = Router();

// Public routes
router.get('/', assessmentController.getAllAssessments);
router.get('/topic/:topic_slug', assessmentController.getAssessmentsByTopic);
router.get('/:assessment_id', assessmentController.getAssessmentById);

export default router;
