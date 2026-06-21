'use strict';

const fs = require('fs');
const path = require('path');
const { Sequelize } = require('sequelize');
const basename = path.basename(__filename);

const db = {};
let started = false;

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
    logging: false,
    pool: { max: 5, min: 0, idle: 10000 }
  }
);

fs
  .readdirSync(__dirname)
  .filter(file => file.indexOf('.') !== 0 && file !== basename && file.slice(-3) === '.js')
  .forEach(file => {
    const model = require(path.join(__dirname, file))(sequelize);
    db[model.name] = model;
  });

db.UberAccount.hasMany(db.UberStores, { foreignKey: 'idUberAccount' });
db.UberStores.belongsTo(db.UberAccount, { foreignKey: 'idUberAccount' });

db.dbo = sequelize;
db.Sequelize = Sequelize;

function syncTables(force) {
  db.dbo.sync({ force })
    .then(() => console.log('DB tables synced'))
    .catch(err => {
      console.error('Error syncing tables:', err.message);
      process.exit(1);
    });
}

module.exports = (force) => {
  if (!started) {
    started = true;
    db.dbo.authenticate()
      .then(() => {
        console.log('SQL Server connected successfully.');
        syncTables(force);
      })
      .catch(err => {
        console.error('SQL Server connection failed:', err.message);
        process.exit(1);
      });
  }
  return db;
};
