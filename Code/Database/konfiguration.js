const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

const envPaths = [
  path.resolve(__dirname, '..', '.env'),
  path.resolve(__dirname, '..', '..', '.env')
];

const envPath = envPaths.find(filePath => fs.existsSync(filePath));

dotenv.config(envPath ? { path: envPath } : {});

// Databaseindstillinger til SQL Server.
// Hvis DB_INSTANCE er sat, bruges den i stedet for DB_PORT.
const passwordConfig = {
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  server: process.env.DB_SERVER || 'localhost',
  database: process.env.DB_NAME || 'ProgEksamen',
  port: process.env.DB_INSTANCE
    ? undefined
    : (parseInt(process.env.DB_PORT, 10) || 1433),
  options: {
    instanceName: process.env.DB_INSTANCE || undefined,
    encrypt: true,
    trustServerCertificate: true
  }
};

module.exports = { passwordConfig };
