import { Problem, Topic, sequelize } from '../models/index.js';
import { problemsData, topicsData } from '../seeders/index.js';

async function seedLocalProblems() {
  try {
    if (sequelize.getDialect() !== 'sqlite') {
      throw new Error('The bundled problem seed can only run against the local SQLite database.');
    }

    await sequelize.authenticate();
    await sequelize.sync();

    const { createdTopics, createdProblems } = await sequelize.transaction(async (transaction) => {
      const topicRows = [];
      let createdTopics = 0;
      let createdProblems = 0;

      for (const topicData of topicsData) {
        const [topic, created] = await Topic.findOrCreate({
          where: { slug: topicData.slug },
          defaults: topicData,
          transaction,
        });
        topicRows.push(topic);
        if (created) createdTopics += 1;
      }

      const topicBySeedId = new Map(topicRows.map((topic, index) => [index + 1, topic]));
      for (const problemData of problemsData) {
        const topic = topicBySeedId.get(problemData.topic_id);
        if (!topic) {
          throw new Error(`No bundled topic found for problem "${problemData.slug}".`);
        }

        const [problem, created] = await Problem.findOrCreate({
          where: { slug: problemData.slug },
          defaults: { ...problemData, topic_id: topic.id },
          transaction,
        });
        if (created) createdProblems += 1;
      }

      return { createdTopics, createdProblems };
    });

    console.log(`Local SQLite seed complete: added ${createdTopics} topics and ${createdProblems} problems.`);
  } finally {
    await sequelize.close();
  }
}

seedLocalProblems().catch((error) => {
  console.error('Local problem seeding failed:', error);
  process.exitCode = 1;
});
