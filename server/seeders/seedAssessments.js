import { Assessment } from '../models/index.js';
import mcqAssessments from '../../learners-platform/backend/data/mcq-assessments.js';

const seedAssessments = async () => {
  try {
    console.log('🌱 Seeding assessments...');
    
    let totalInserted = 0;

    for (const [topicSlug, assessments] of Object.entries(mcqAssessments)) {
      console.log(`📚 Processing topic: ${topicSlug}`);
      
      for (const assessment of assessments) {
        const assessmentData = {
          assessment_id: assessment.id,
          type: assessment.type,
          topic_slug: topicSlug,
          title: assessment.title,
          prompt: assessment.prompt,
          focus_area: assessment.focusArea,
          options: assessment.options || null,
          correct_option_index: assessment.correctOptionIndex !== undefined ? assessment.correctOptionIndex : null,
          explanation: assessment.explanation,
          related_problem_id: assessment.relatedProblemId || null,
          answer_guide: assessment.answerGuide || null,
        };

        await Assessment.findOrCreate({
          where: { assessment_id: assessment.id },
          defaults: assessmentData
        });

        totalInserted++;
      }
    }

    console.log(`✅ Successfully seeded ${totalInserted} assessments`);
    return totalInserted;
  } catch (error) {
    console.error('❌ Error seeding assessments:', error);
    throw error;
  }
};

export default seedAssessments;
