'use strict';

const { DataTypes } = require('sequelize');
const { sequelize } = require('./index');

const UberAccount = sequelize.define('UberAccount', {
  id: {
    type: DataTypes.BIGINT,
    autoIncrement: true,
    primaryKey: true
  },
  createdAt: {
    type: DataTypes.DATE,
    allowNull: false
  },
  updatedAt: {
    type: DataTypes.DATE,
    allowNull: false
  },
  lastSync: {
    type: DataTypes.DATE,
    allowNull: false
  },
  // Human-readable label for the Uber account (e.g. restaurant chain name).
  // Unique so each Uber account is stored only once.
  client_id: {
    type: DataTypes.STRING(64),
    allowNull: false,
    unique: true
  },
  access_token: {
    type: DataTypes.TEXT,
    allowNull: false
  },
  refresh_token: {
    type: DataTypes.TEXT,
    allowNull: false
  },
  token_type: {
    type: DataTypes.STRING(32),
    allowNull: false,
    defaultValue: 'Bearer'
  },
  scope: {
    type: DataTypes.STRING(255),
    allowNull: false,
    defaultValue: ''
  },
  expires_date: {
    type: DataTypes.DATE,
    allowNull: false
  },
  expires_at: {
    type: DataTypes.BIGINT,
    allowNull: false
  }
}, {
  tableName: 'UberAccount',
  timestamps: true
});

module.exports = UberAccount;
