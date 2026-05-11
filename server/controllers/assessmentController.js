import { Assessment } from '../models/index.js';
import { asyncHandler, ValidationError, NotFoundError } from '../middleware/errorHandler.js';

export const getAssessmentsByTopic = asyncHandler(async (req, res) => {
  const { topic_slug } = req.params;

  if (!topic_slug) {
    throw new ValidationError('Topic slug is required');
  }

  const assessments = await Assessment.findAll({
    where: { topic_slug },
    attributes: [
      'id',
      'assessment_id',
      'type',
      'title',
      'prompt',
      'focus_area',
      'options',
      'correct_option_index',
      'explanation',
      'related_problem_id',
      'answer_guide'
    ],
    order: [['created_at', 'ASC']]
  });

  if (assessments.length === 0) {
    throw new NotFoundError(`No assessments found for topic: ${topic_slug}`);
  }

  res.json({
    topic: topic_slug,
    total: assessments.length,
    assessments
  });
});

export const getAllAssessments = asyncHandler(async (req, res) => {
  const { focusArea, type } = req.query;

  const where = {};
  if (focusArea) where.focus_area = focusArea;
  if (type) where.type = type;

  const assessments = await Assessment.findAll({
    where,
    attributes: [
      'id',
      'assessment_id',
      'type',
      'topic_slug',
      'title',
      'prompt',
      'focus_area'
    ],
    order: [['topic_slug', 'ASC'], ['created_at', 'ASC']],
    limit: 100
  });

  if (assessments.length === 0) {
    throw new NotFoundError('No assessments found');
  }

  const groupedByTopic = {};
  assessments.forEach((assessment) => {
    if (!groupedByTopic[assessment.topic_slug]) {
      groupedByTopic[assessment.topic_slug] = [];
    }
    groupedByTopic[assessment.topic_slug].push(assessment);
  });

  res.json({
    total: assessments.length,
    topics: Object.keys(groupedByTopic),
    assessments: groupedByTopic
  });
});

export const getAssessmentById = asyncHandler(async (req, res) => {
  const { assessment_id } = req.params;

  if (!assessment_id) {
    throw new ValidationError('Assessment ID is required');
  }

  const assessment = await Assessment.findOne({
    where: { assessment_id }
  });

  if (!assessment) {
    throw new NotFoundError(`Assessment not found: ${assessment_id}`);
  }

  res.json({ assessment });
});
