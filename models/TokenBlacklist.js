const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

const TokenBlacklist = sequelize.define('TokenBlacklist', {
  token: {
    type: DataTypes.TEXT,
    allowNull: false,
    unique: true,
  },
});

module.exports = TokenBlacklist;
