'use strict';

const sequelize = require('./db');
const UberAccount = require('./UberAccount');
const UberStores = require('./UberStores');

// One Uber account owns many Stores.
// Store.idUberAccount → UberAccount.id
UberAccount.hasMany(UberStores, { foreignKey: 'idUberAccount' });
UberStores.belongsTo(UberAccount, { foreignKey: 'idUberAccount' });

module.exports = sequelize;
