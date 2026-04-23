import { Sequelize } from 'sequelize';

// This creates an in-memory database so we can test without a real server
const sequelize = new Sequelize('sqlite::memory:', {
  logging: false
});

export default sequelize;