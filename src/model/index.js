'use strict';

const { Sequelize } = require('sequelize');

const sequelize = new Sequelize(
  process.env.DB_NAME,
  process.env.DB_USER,
  process.env.DB_PASS,
  {
    host: process.env.DB_SERVER,
    port: 1433,
    dialect: 'mssql',
    dialectOptions: {
      options: {
        encrypt: true,
        trustServerCertificate: false
      }
    },
    logging: false
  }
);

// Export sequelize before loading models — UberAccount/UberStores import ./db
// which re-exports from here, so sequelize must exist before those requires run.
module.exports.sequelize = sequelize;

const UberAccount = require('./UberAccount');
const UberStores = require('./UberStores');

UberAccount.hasMany(UberStores, { foreignKey: 'idUberAccount' });
UberStores.belongsTo(UberAccount, { foreignKey: 'idUberAccount' });

sequelize.authenticate()
  .then(() => console.log('SQL Server connected successfully.'))
  .catch(err => console.error('SQL Server connection failed:', err.message));

async function syncTables() {
  await sequelize.sync({ alter: false });
}

module.exports.syncTables = syncTables;
