'use strict';

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => sequelize.define('UberErrorLog', {
  id:      { type: DataTypes.BIGINT, autoIncrement: true, primaryKey: true },
  level:   { type: DataTypes.STRING(20), allowNull: false },
  message: { type: DataTypes.TEXT, allowNull: false },
  meta:    { type: DataTypes.TEXT, allowNull: true }, // JSON string of extra fields
}, {
  tableName: 'UberErrorLog',
  timestamps: true,
  updatedAt: false
});
