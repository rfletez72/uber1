'use strict';

const { DataTypes } = require('sequelize');
const sequelize = require('./db');

const UberStores = sequelize.define('UberStores', {
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
    type: DataTypes.DATE
  },
  idUberAccount: {
    type: DataTypes.BIGINT,
    allowNull: true,
    references: { model: 'UberAccount', key: 'id' }
  },
  store_id: {
    type: DataTypes.STRING(64),
    allowNull: false,
    unique: true
  },
  name: {
    type: DataTypes.STRING(255)
  },
  pos_endpoint: {
    type: DataTypes.STRING(500),
    allowNull: true
  },
  status: {
    type: DataTypes.STRING(32)
  },
  // ── Location ──────────────────────────────────────────────────────────────
  address: {
    type: DataTypes.STRING(255)
  },
  address_2: {
    type: DataTypes.STRING(255)
  },
  city: {
    type: DataTypes.STRING(100)
  },
  state: {
    type: DataTypes.STRING(50)
  },
  postal_code: {
    type: DataTypes.STRING(20)
  },
  country: {
    type: DataTypes.STRING(10)
  },
  latitude: {
    type: DataTypes.FLOAT
  },
  longitude: {
    type: DataTypes.FLOAT
  },
  // ── Uber metadata ─────────────────────────────────────────────────────────
  timezone: {
    type: DataTypes.STRING(64)
  },
  avg_prep_time: {
    type: DataTypes.INTEGER
  },
  web_url: {
    type: DataTypes.STRING(500)
  },
  pos_integration_enabled: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  }
}, {
  tableName: 'UberStores',
  timestamps: true
});

module.exports = UberStores;