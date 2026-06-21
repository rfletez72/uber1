'use strict';

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => sequelize.define('UberEventStore', {
  id:      { type: DataTypes.BIGINT, autoIncrement: true, primaryKey: true },
  type:    { type: DataTypes.STRING(32), allowNull: false },
  storeId: { type: DataTypes.STRING(64), allowNull: true },
  orderId: { type: DataTypes.STRING(128), allowNull: true },
  meta:    { type: DataTypes.TEXT, allowNull: true }, // JSON string of remaining payload fields
}, {
  tableName: 'UberEventStore',
  timestamps: true,
  updatedAt: false
});
