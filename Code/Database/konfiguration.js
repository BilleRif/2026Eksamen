const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

const envPaths = [
  path.resolve(__dirname, '..', '.env'),
  path.resolve(__dirname, '..', '..', '.env')
];

const envPath = envPaths.find(filePath => fs.existsSync(filePath));

dotenv.config(envPath ? { path: envPath } : {});

// Cross-platform tedious-config (mssql default driver). Virker på
// Windows, macOS og Linux uden ODBC-dependencies. DB_INSTANCE er
// valgfri; hvis den ikke er sat, bruges DB_PORT (default 1433).
// Tedious tillader ikke port + instanceName samtidig — instance
// vinder hvis begge er sat, fordi SQL Server Browser slår dynamisk
// port op for instansen.
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
