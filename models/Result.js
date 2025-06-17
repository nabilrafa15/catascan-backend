const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');
const User = require('./User');

const Result = sequelize.define('Result', {
  image_path: DataTypes.TEXT,
  prediction: DataTypes.STRING,
  explanation: DataTypes.TEXT,
  confidence_scores: DataTypes.JSONB
});

Result.belongsTo(User);
module.exports = Result;
