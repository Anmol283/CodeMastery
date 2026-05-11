import { learningTopics, learnersPlatformMeta } from '../data/topics.js';
import { searchTopicVideos } from '../services/learnersPlatformYoutubeService.js';
import { getRedisCacheStatus } from '../../../server/utils/redisCache.js';
import { Assessment } from '../../../server/models/index.js';
import {
  generateAssessmentFeedback,
  generateTopicAssessment,
} from '../services/learnersPlatformAssessmentService.js';

const filterTopics = (topics, query) => {
  const search = String(query.search || '').trim().toLowerCase();
  const level = String(query.level || 'all').trim().toLowerCase();
  const category = String(query.category || 'all').trim().toLowerCase();

  return topics.filter((topic) => {
    const matchesSearch =
      !search ||
      topic.title.toLowerCase().includes(search) ||
      topic.description.toLowerCase().includes(search) ||
      topic.tags.some((tag) => tag.toLowerCase().includes(search));

    const matchesLevel = level === 'all' || topic.level.toLowerCase() === level;
    const matchesCategory = category === 'all' || topic.category.toLowerCase() === category;

    return matchesSearch && matchesLevel && matchesCategory;
  });
};

const getMeta = (req, res) => {
  res.json({
    meta: learnersPlatformMeta,
    filters: {
      levels: ['All', 'Beginner', 'Intermediate', 'Advanced'],
      categories: ['All', ...new Set(learningTopics.map((topic) => topic.category))]
    }
  });
};

const getTopics = (req, res) => {
  const topics = filterTopics(learningTopics, req.query);

  res.json({
    topics,
    total: topics.length
  });
};

const getFeaturedTopics = (req, res) => {
  const featuredTopics = learningTopics.filter((topic) => topic.featured);

  res.json({
    topics: featuredTopics,
    total: featuredTopics.length
  });
};

const getTopicBySlug = (req, res) => {
  const topic = learningTopics.find((entry) => entry.slug === req.params.slug);

  if (!topic) {
    return res.status(404).json({
      message: 'Learning topic not found'
    });
  }

  return res.json({ topic });
};

const getTopicVideos = async (req, res) => {
  const topic = learningTopics.find((entry) => entry.slug === req.params.slug);

  if (!topic) {
    return res.status(404).json({
      message: 'Learning topic not found'
    });
  }

  const result = await searchTopicVideos(topic.title, topic.level.toLowerCase());

  return res.json({
    topic: {
      slug: topic.slug,
      title: topic.title,
      level: topic.level,
      category: topic.category,
    },
    videos: result.videos || [],
    source: 'youtube',
    configured: result.configured,
    message: result.message || null,
    cached: Boolean(result.cached),
    fetchedAt: result.fetchedAt || null,
    videoCount: typeof result.videoCount === 'number' ? result.videoCount : (result.videos || []).length,
    cache: {
      ...getRedisCacheStatus(),
      key: result.cacheKey || null,
      ttlSeconds: result.cacheTtlSeconds || null,
    }
  });
};

const getTopicAssessment = async (req, res) => {
  const topic = learningTopics.find((entry) => entry.slug === req.params.slug);

  if (!topic) {
    return res.status(404).json({
      message: 'Learning topic not found'
    });
  }

  // For DSA topics, fetch MCQs from the Assessment database
  if (req.params.slug === 'data-structures-and-algorithms') {
    try {
      // Fetch all DSA-related MCQs from Assessment table
      const databaseMcqs = await Assessment.findAll({
        where: {
          type: 'mcq'
        },
        attributes: [
          'id',
          'assessment_id',
          'type',
          'topic_slug',
          'title',
          'prompt',
          'focus_area',
          'options',
          'correct_option_index',
          'explanation',
          'related_problem_id'
        ],
        order: [['topic_slug', 'ASC'], ['created_at', 'ASC']],
        limit: 10
      });

      // Transform database MCQs to match frontend expectations
      const mcqs = databaseMcqs.map((mcq) => ({
        id: mcq.assessment_id,
        type: 'mcq',
        title: mcq.title,
        prompt: mcq.prompt,
        focusArea: mcq.focus_area,
        options: mcq.options || [],
        correctOptionIndex: mcq.correct_option_index,
        explanation: mcq.explanation,
        relatedProblemId: mcq.related_problem_id
      }));

      return res.json({
        topic: {
          slug: topic.slug,
          title: topic.title,
          level: topic.level,
          category: topic.category,
        },
        assessment: {
          source: 'database',
          generatedAt: new Date().toISOString(),
          cached: false,
          dueProblemCount: 0,
          focusAreas: [...new Set(mcqs.map(m => m.focusArea).filter(Boolean))],
          mcqs: mcqs.slice(0, 5),
          interviewQuestions: [],
          basedOnSolvedProblems: [],
        },
        cache: {
          ...getRedisCacheStatus(),
          key: null,
          ttlSeconds: null,
        }
      });
    } catch (error) {
      console.error('Error fetching assessments from database:', error);
      // Fall back to Gemini generation if database fails
    }
  }

  // For other topics, use the adaptive/Gemini-based assessment
  const solvedProblems = Array.isArray(req.body?.solvedProblems) ? req.body.solvedProblems : [];
  const assessment = await generateTopicAssessment(topic, solvedProblems);

  return res.json({
    topic: {
      slug: topic.slug,
      title: topic.title,
      level: topic.level,
      category: topic.category,
    },
    assessment: {
      source: assessment.source,
      generatedAt: assessment.generatedAt,
      cached: Boolean(assessment.cached),
      dueProblemCount: assessment.dueProblemCount,
      focusAreas: assessment.focusAreas || [],
      mcqs: assessment.mcqs || [],
      interviewQuestions: assessment.interviewQuestions || [],
      basedOnSolvedProblems: assessment.basedOnSolvedProblems || [],
    },
    cache: {
      ...getRedisCacheStatus(),
      key: assessment.cacheKey || null,
      ttlSeconds: assessment.cacheTtlSeconds || null,
    }
  });
};

const getTopicAssessmentFeedback = async (req, res) => {
  const topic = learningTopics.find((entry) => entry.slug === req.params.slug);

  if (!topic) {
    return res.status(404).json({
      message: 'Learning topic not found'
    });
  }

  const assessment = req.body?.assessment || {};
  const responses = req.body?.responses || {};
  const feedback = await generateAssessmentFeedback({ topic, assessment, responses });

  return res.json({
    topic: {
      slug: topic.slug,
      title: topic.title,
      level: topic.level,
      category: topic.category,
    },
    feedback,
  });
};

export {
  getMeta,
  getTopics,
  getFeaturedTopics,
  getTopicBySlug,
  getTopicAssessment,
  getTopicAssessmentFeedback,
  getTopicVideos,
};
