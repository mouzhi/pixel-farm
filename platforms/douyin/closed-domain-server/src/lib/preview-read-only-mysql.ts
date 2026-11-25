import mysql, { Pool, PoolOptions } from 'mysql2/promise';

import { DEFAULT_DATABASE, assertReadOnlySQL, normalizeDatabaseName } from './read-only-sql';

const previewPools = new Map<string, Pool>();

function parseMySQLAddress(): { host: string; port: number } {
  const address = process.env.MYSQL_ADDRESS;
  if (!address) {
    throw new Error('封闭域预览只读 DB 查询失败：MYSQL_ADDRESS 环境变量未设置');
  }

  const lastColonIndex = address.lastIndexOf(':');
  if (lastColonIndex === -1) {
    throw new Error('封闭域预览只读 DB 查询失败：MYSQL_ADDRESS 格式错误，应为 host:port');
  }

  const host = address.substring(0, lastColonIndex);
  const port = Number.parseInt(address.substring(lastColonIndex + 1), 10);
  if (Number.isNaN(port)) {
    throw new Error('封闭域预览只读 DB 查询失败：MYSQL_ADDRESS 端口格式错误');
  }

  return { host, port };
}

async function getPreviewReadOnlyPool(database = DEFAULT_DATABASE): Promise<Pool> {
  const targetDatabase = normalizeDatabaseName(database);
  const existingPool = previewPools.get(targetDatabase);
  if (existingPool) {
    return existingPool;
  }

  const { host, port } = parseMySQLAddress();
  const mysqlUser = process.env.MYSQL_USERNAME;
  const mysqlPassword = process.env.MYSQL_PASSWORD;

  if (!mysqlUser) {
    throw new Error('封闭域预览只读 DB 查询失败：MYSQL_USERNAME 环境变量未设置');
  }
  if (!mysqlPassword) {
    throw new Error('封闭域预览只读 DB 查询失败：MYSQL_PASSWORD 环境变量未设置');
  }

  const dbConfig: PoolOptions = {
    host,
    port,
    user: mysqlUser,
    password: mysqlPassword,
    database: targetDatabase,
    waitForConnections: true,
    connectionLimit: 4,
    queueLimit: 0,
  };

  const pool = mysql.createPool(dbConfig);
  try {
    await pool.execute('SELECT 1');
    previewPools.set(targetDatabase, pool);
    return pool;
  } catch (error: unknown) {
    await pool.end().catch(() => undefined);
    console.error('[ClosedDomain][PreviewDB] 数据库连接失败:', error);
    throw new Error('封闭域预览只读 DB 查询失败：数据库连接失败，请检查 MYSQL_* 环境变量');
  }
}

export async function queryPreviewReadOnlyMySQL<T = unknown>(
  sql: string,
  database = DEFAULT_DATABASE,
): Promise<T> {
  const trimmedSQL = sql.trim();
  if (!trimmedSQL) {
    throw new Error('封闭域预览只读 DB 查询失败：sql 不能为空');
  }
  assertReadOnlySQL(trimmedSQL);

  try {
    const pool = await getPreviewReadOnlyPool(database);
    const [rows] = await pool.query(trimmedSQL);
    return rows as T;
  } catch (error: unknown) {
    console.error('[ClosedDomain][PreviewDB] 只读查询失败:', error);
    throw error;
  }
}
