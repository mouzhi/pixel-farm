import mysql, { Pool, PoolOptions, ResultSetHeader, RowDataPacket } from 'mysql2/promise';

/** 示例表 `table_name`，按实际 schema 修改。 */
export interface TableNameRow extends RowDataPacket {
  id: number;
  column1: string;
  column2: string;
  status?: string;
  created_at?: Date;
}

export interface CreateEntityInput {
  column1: string;
  column2: string;
}

export interface UpdateEntityInput {
  column1: string;
  column2: string;
}

/** 示例表 `users`。 */
export interface UserRow extends RowDataPacket {
  id: number;
  uid: string;
  name: string;
  email: string | null;
  birthday?: string | null;
  lastProcessed?: string | Date | null;
}

export interface CreateUserInput {
  uid: string;
  name: string;
  email: string;
}

export interface UpdateUserInput {
  name: string;
  lastProcessed: string | number | Date | null;
}

interface GreetingRow extends RowDataPacket {
  text: string;
}

// 解析 MYSQL_ADDRESS 环境变量，格式为 host:port。
const parseMySQLAddress = (): { host: string; port: number } => {
  const address = process.env.MYSQL_ADDRESS;
  if (!address) {
    throw new Error('数据库资源初始化失败：MYSQL_ADDRESS 环境变量未设置');
  }

  const lastColonIndex = address.lastIndexOf(':');
  if (lastColonIndex === -1) {
    throw new Error('数据库资源初始化失败：MYSQL_ADDRESS 格式错误，应为 host:port');
  }

  const host = address.substring(0, lastColonIndex);
  const port = Number.parseInt(address.substring(lastColonIndex + 1), 10);
  if (Number.isNaN(port)) {
    throw new Error('数据库资源初始化失败：MYSQL_ADDRESS 端口格式错误');
  }

  return { host, port };
};

let connectionPool: Pool | undefined;

/**
 * 获取数据库连接池，首次调用时基于环境变量初始化。
 */
export async function getConnection(): Promise<Pool> {
  if (connectionPool) {
    return connectionPool;
  }

  const { host, port } = parseMySQLAddress();
  const mysqlUser = process.env.MYSQL_USERNAME;
  const mysqlPassword = process.env.MYSQL_PASSWORD;

  if (!mysqlUser) {
    throw new Error('数据库资源初始化失败：MYSQL_USERNAME 环境变量未设置');
  }
  if (!mysqlPassword) {
    throw new Error('数据库资源初始化失败：MYSQL_PASSWORD 环境变量未设置');
  }

  const dbConfig: PoolOptions = {
    host,
    port,
    user: mysqlUser,
    password: mysqlPassword,
    database: 'myapp',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
  };

  const maxRetries = 3;
  const retryDelay = 2 * 60 * 1000;

  for (let i = 0; i < maxRetries; i += 1) {
    try {
      console.log(`[DEBUG] 尝试连接数据库 (${i + 1}/${maxRetries})...`);
      connectionPool = mysql.createPool(dbConfig);
      await connectionPool.execute('SELECT 1');
      console.log('[DEBUG] 数据库连接成功');
      return connectionPool;
    } catch (error: unknown) {
      connectionPool = undefined;
      console.error(`[ERROR] 数据库连接失败 (${i + 1}/${maxRetries}):`, error);

      if (i < maxRetries - 1) {
        console.log(`[DEBUG] 等待 ${retryDelay / 1000} 秒后重试...`);
        await new Promise<void>((resolve) => setTimeout(resolve, retryDelay));
      }
    }
  }

  throw new Error('数据库连接失败，请检查资源配置');
}

export async function getEntityById(id: number): Promise<TableNameRow | null> {
  try {
    const pool = await getConnection();
    const [rows] = await pool.execute<TableNameRow[]>('SELECT * FROM table_name WHERE id = ?', [id]);
    return rows.length > 0 ? rows[0] : null;
  } catch (error: unknown) {
    console.error('根据ID查询实体失败:', error);
    return null;
  }
}

export async function createEntity(data: CreateEntityInput): Promise<number | null> {
  try {
    const pool = await getConnection();
    const [result] = await pool.execute<ResultSetHeader>(
      'INSERT INTO table_name (column1, column2) VALUES (?, ?)',
      [data.column1, data.column2],
    );
    return result.insertId;
  } catch (error: unknown) {
    console.error('创建实体失败:', error);
    return null;
  }
}

export async function updateEntity(id: number, data: UpdateEntityInput): Promise<boolean> {
  try {
    const pool = await getConnection();
    const [result] = await pool.execute<ResultSetHeader>(
      'UPDATE table_name SET column1 = ?, column2 = ? WHERE id = ?',
      [data.column1, data.column2, id],
    );
    return result.affectedRows > 0;
  } catch (error: unknown) {
    console.error('更新实体失败:', error);
    return false;
  }
}

export async function deleteEntity(id: number): Promise<boolean> {
  try {
    const pool = await getConnection();
    const [result] = await pool.execute<ResultSetHeader>('DELETE FROM table_name WHERE id = ?', [id]);
    return result.affectedRows > 0;
  } catch (error: unknown) {
    console.error('删除实体失败:', error);
    return false;
  }
}

export async function queryEntities(condition: string): Promise<TableNameRow[]> {
  try {
    const pool = await getConnection();
    const [rows] = await pool.execute<TableNameRow[]>(
      'SELECT * FROM table_name WHERE status = ? ORDER BY created_at DESC',
      [condition],
    );
    return rows;
  } catch (error: unknown) {
    console.error('查询实体失败:', error);
    return [];
  }
}

export async function getAllUsers(): Promise<UserRow[]> {
  const pool = await getConnection();
  const [rows] = await pool.execute<UserRow[]>('SELECT * FROM users');
  return rows;
}

export async function getRandomGreeting(): Promise<string | null> {
  try {
    const pool = await getConnection();
    const [rows] = await pool.execute<GreetingRow[]>('SELECT * FROM greetings ORDER BY RAND() LIMIT 1');
    return rows.length > 0 ? rows[0].text : null;
  } catch (error: unknown) {
    console.error('获取问候语失败:', error);
    return null;
  }
}

export async function getUserByUid(uid: string): Promise<UserRow | null> {
  try {
    const pool = await getConnection();
    const [rows] = await pool.execute<UserRow[]>('SELECT * FROM users WHERE uid = ?', [uid]);
    return rows.length > 0 ? rows[0] : null;
  } catch (error: unknown) {
    console.error('根据uid获取用户失败:', error);
    return null;
  }
}

export async function createUser(data: CreateUserInput): Promise<number | null> {
  try {
    const pool = await getConnection();
    const [result] = await pool.execute<ResultSetHeader>(
      'INSERT INTO users (uid, name, email) VALUES (?, ?, ?)',
      [data.uid, data.name, data.email],
    );
    return result.insertId;
  } catch (error: unknown) {
    console.error('创建用户失败:', error);
    return null;
  }
}

export async function updateUser(uid: string, data: UpdateUserInput): Promise<boolean> {
  try {
    const pool = await getConnection();
    const [result] = await pool.execute<ResultSetHeader>(
      'UPDATE users SET name = ?, lastProcessed = ? WHERE uid = ?',
      [data.name, data.lastProcessed, uid],
    );
    return result.affectedRows > 0;
  } catch (error: unknown) {
    console.error('更新用户失败:', error);
    return false;
  }
}

export async function deleteUser(uid: string): Promise<boolean> {
  try {
    const pool = await getConnection();
    const [result] = await pool.execute<ResultSetHeader>('DELETE FROM users WHERE uid = ?', [uid]);
    return result.affectedRows > 0;
  } catch (error: unknown) {
    console.error('删除用户失败:', error);
    return false;
  }
}
