import { sequelize } from '../config/database.js';
import { DataTypes } from 'sequelize';

const Assessment = sequelize.define('Assessment', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  assessment_id: {
    type: DataTypes.STRING(100),
    allowNull: false,
    unique: true,
    comment: 'Unique identifier for assessment (e.g., arrays-mcq-1)'
  },
  type: {
    type: DataTypes.ENUM('mcq', 'interview'),
    allowNull: false,
    defaultValue: 'mcq'
  },
  topic_slug: {
    type: DataTypes.STRING(100),
    allowNull: false,
    comment: 'Topic this assessment belongs to (e.g., data-structures-and-algorithms)'
  },
  title: {
    type: DataTypes.STRING(255),
    allowNull: false,
    comment: 'Assessment title (e.g., Two Pointer Technique)'
  },
  prompt: {
    type: DataTypes.TEXT,
    allowNull: false,
    comment: 'Question or prompt for the assessment'
  },
  focus_area: {
    type: DataTypes.STRING(100),
    allowNull: false,
    comment: 'Focus area/topic category (e.g., Arrays, Trees)'
  },
  options: {
    type: DataTypes.JSON,
    allowNull: true,
    comment: 'Array of options for MCQ questions'
  },
  correct_option_index: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'Index of correct option (for MCQ)'
  },
  explanation: {
    type: DataTypes.TEXT,
    allowNull: false,
    comment: 'Explanation for the answer'
  },
  related_problem_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'Related problem ID if applicable'
  },
  answer_guide: {
    type: DataTypes.JSON,
    allowNull: true,
    comment: 'Guide for interview questions'
  }
}, {
  timestamps: true,
  underscored: true,
  tableName: 'assessments'
});

export default Assessment;
