import { Problem, Topic, sequelize } from '../models/index.js';
import { problemsData, topicsData } from '../seeders/index.js';

async function seedLocalProblems() {
  try {
    const dialect = sequelize.getDialect();
    const allowRemoteSeed = process.env.ALLOW_REMOTE_PROBLEM_SEED === 'true';

    if (dialect !== 'sqlite' && !allowRemoteSeed) {
      throw new Error(
        'Refusing to seed a non-SQLite database. Set ALLOW_REMOTE_PROBLEM_SEED=true to explicitly allow a non-destructive remote seed.'
      );
    }

    await sequelize.authenticate();
    if (dialect === 'sqlite') {
      await sequelize.sync();
    }

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

    console.log(
      `Problem seed complete (${dialect}): added ${createdTopics} topics and ${createdProblems} problems.`
    );
  } finally {
    await sequelize.close();
  }
}

seedLocalProblems().catch((error) => {
  console.error('Local problem seeding failed:', error);
  process.exitCode = 1;
});
