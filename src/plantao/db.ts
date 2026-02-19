import { createPool } from "mysql2/promise";

export const mariaPool = createPool({
  host: process.env.MARIADB_HOST,
  port: Number(process.env.MARIADB_PORT || 3306),
  user: process.env.MARIADB_USER,
  password: process.env.MARIADB_PASS,
  database: process.env.MARIADB_DB,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});
