import path from 'path';
import { Sequelize, DataTypes } from 'sequelize';
import dotenv from 'dotenv';
import dns from 'node:dns/promises';

dotenv.config();

const getDefaultSqlitePath = () => process.env.SQLITE_PATH || path.resolve(process.cwd(), 'server', 'database.sqlite');

// export const resolveDatabaseConfig = () => {
//   const configuredUrl = (process.env.DATABASE_URL || '').trim();
//   const isAivenUrl = /aivencloud\.com/i.test(configuredUrl);
//   const shouldUseSqliteFallback =
//   process.env.USE_SQLITE_FALLBACK === 'true' ||
//   process.env.USE_SQLITE_FALLBACK === '1' ||
//   !configuredUrl;

//   if (shouldUseSqliteFallback) {
//     const sqlitePath = getDefaultSqlitePath();
//     console.warn('⚠️ Remote database unavailable or disabled. Using local SQLite fallback at', sqlitePath);
//     return {
//       dialect: 'sqlite',
//       storage: sqlitePath,
//       logging: process.env.NODE_ENV === 'development' ? console.log : false,
//       define: {
//         timestamps: true,
//         underscored: true,
//         createdAt: 'created_at',
//         updatedAt: 'updated_at'
//       }
//     };
//   }

//   return {
//     url: configuredUrl,
//     dialect: 'mysql',
//     logging: process.env.NODE_ENV === 'development' ? console.log : false,
//     pool: {
//       max: 10,
//       min: 0,
//       acquire: 30000,
//       idle: 10000
//     },
//     dialectOptions: {
//       ssl: {
//         require: true,
//         rejectUnauthorized: false
//       }
//     },
//     define: {
//       timestamps: true,
//       underscored: true,
//       createdAt: 'created_at',
//       updatedAt: 'updated_at'
//     }
//   };
// };
export const resolveDatabaseConfig = () => {
  const configuredUrl = (process.env.DATABASE_URL || '').trim();

  const useSqliteFallback =
    process.env.NODE_ENV !== 'production' &&
    (
      process.env.USE_SQLITE_FALLBACK === 'true' ||
      process.env.USE_SQLITE_FALLBACK === '1' ||
      !configuredUrl
    );

  if (process.env.NODE_ENV === 'production' && !configuredUrl) {
    throw new Error(
      'DATABASE_URL is required in production. Configure it in Render Environment.'
    );
  }

  if (useSqliteFallback) {
    const sqlitePath = getDefaultSqlitePath();

    console.warn(
      'Using local SQLite fallback at',
      sqlitePath
    );

    return {
      dialect: 'sqlite',
      storage: sqlitePath,
      logging: false,
      define: {
        timestamps: true,
        underscored: true,
        createdAt: 'created_at',
        updatedAt: 'updated_at'
      }
    };
  }

  return {
    url: configuredUrl,
    dialect: 'mysql',
    logging: process.env.NODE_ENV === 'development' ? console.log : false,
    pool: {
      max: 10,
      min: 0,
      acquire: 30000,
      idle: 10000
    },
    dialectOptions: {
      ssl: {
        require: true,
        rejectUnauthorized: false
      }
    },
    define: {
      timestamps: true,
      underscored: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at'
    }
  };
};


const databaseConfig = resolveDatabaseConfig();

const sequelize =
  databaseConfig.dialect === 'sqlite'
    ? new Sequelize(databaseConfig)
    : new Sequelize(databaseConfig.url, {
        dialect: databaseConfig.dialect,
        logging: databaseConfig.logging,
        pool: databaseConfig.pool,
        dialectOptions: databaseConfig.dialectOptions,
        define: databaseConfig.define,
      });


// Test connection
// const testConnection = async () => {
//   try {
//     await sequelize.authenticate();
//     console.log('✅ Database connection established successfully.');
//   } catch (error) {
//     if (sequelize.getDialect() === 'sqlite') {
//       console.warn('⚠️ SQLite fallback is active; continuing without the remote database.');
//       return;
//     }

//     console.error('❌ Unable to connect to database:', error.message);
//     process.exit(1);
//   }
// };


const testConnection = async () => {
  try {
    const dbUrl = new URL(process.env.DATABASE_URL);

    console.log('DB host:', dbUrl.hostname);
    console.log('DB port:', dbUrl.port || '3306');

    try {
      const addresses = await dns.lookup(dbUrl.hostname, {
        all: true
      });
      console.log('DB DNS addresses:', addresses);
    } catch (err) {
      console.error(
        'DB DNS lookup failed:',
        err.code,
        err.message
      );
    }

    await sequelize.authenticate();
    console.log('✅ Database connection established successfully.');
  } catch (error) {
    console.error('❌ Unable to connect to database');
    console.error('Error name:', error.name);
    console.error('Error code:', error.original?.code);
    console.error(
      'Error details:',
      error.original?.sqlMessage ||
        error.parent?.message ||
        'No additional details'
    );

    const connectionErrors =
      error.original?.errors || error.parent?.errors || [];

    for (const err of connectionErrors) {
      console.error('Individual connection error:', {
        code: err.code,
        address: err.address,
        port: err.port,
        message: err.message
      });
    }

    throw error;
  }
};


// Sync database
const syncDatabase = async (force = false) => {
  try {
    // In development, only sync without altering to avoid conflicts
    // Foreign key constraints prevent force sync
    await sequelize.sync({ force: false });
    console.log('✅ Database synchronized successfully.');
  } catch (error) {
    // If sync fails due to foreign keys or other constraints, log but continue
    // The tables likely already exist with the correct schema
    console.warn('⚠️  Database sync warning:', error.message);
    console.warn('Continuing anyway - tables may already exist');
  }
};

const ensureAuthSchema = async () => {
  try {
    const queryInterface = sequelize.getQueryInterface();
    const table = await queryInterface.describeTable('users');

    if (!table.phone_number) {
      const columnDefinition = {
        type: DataTypes.STRING(20),
        allowNull: true,
        unique: sequelize.getDialect() !== 'sqlite',
      };

      await queryInterface.addColumn('users', 'phone_number', columnDefinition);
      console.log('Added users.phone_number column for OTP recovery.');
    }
  } catch (error) {
    console.warn('Auth schema check warning:', error.message);
  }
};

export { sequelize, testConnection, syncDatabase, ensureAuthSchema };
export default sequelize;
