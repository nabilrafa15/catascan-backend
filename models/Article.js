const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');
const User = require('./User');

const Article = sequelize.define('Article', {
  title: DataTypes.TEXT,
  content: DataTypes.TEXT
});

Article.belongsTo(User);
module.exports = Article;
