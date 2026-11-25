const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

/**
 * 抖音云开通时机：按沙盒 env 决定 skip / 等待 / 迁库 / 失败。
 *
 * 环境变量（均为 SCREAMING_SNAKE_CASE）：
 * - HAS_CALLED_DATABASE_INIT_TOOL（启动时未置位则跳过；dev_run.sh 会轮询 ~/.bashrc，置位后自动重跑本脚本并重启后端）
 * - DATABASE_INIT_ERROR_CODE / DATABASE_INIT_FAILED_REASON
 * - RESOURCE_INIT_ERROR_CODE / RESOURCE_INIT_FAILED_REASON
 * - MYSQL_ADDRESS / MYSQL_USERNAME / MYSQL_PASSWORD（可连）
 *
 * 平台数字码 → 产品对用户文案（打进 [mysql-gate] reason=）：
 * 抖音云 RESOURCE_INIT_ERROR_CODE:
 *   4010018  账号已欠费，请充值后重试或联系平台客服处理
 *   407004   兴趣卡开通已达上限，请联系平台处理
 *   407005   账号实名信息异常，请修改后继续使用
 *   407006   账号未完成实名，请先完成实名后继续使用
 *   407007   账号实名信息异常，请修改后继续使用
 *   407008   账号属于未成年用户，不支持使用平台
 * 数据库 DATABASE_INIT_ERROR_CODE:
 *   4010018  账号已欠费，请充值后重试或联系平台客服处理
 *   4010030  系统异常，可联系平台客服处理
 *   407009   系统异常，可联系平台客服处理
 * 未知码 / 等待 MYSQL_* 超时：系统异常，可联系平台客服处理
 */

console.log('[DEBUG] Script started');
console.log('[DEBUG] __dirname:', __dirname);

const OPENING_WAIT_MS = 5 * 60 * 1000;
const OPENING_POLL_MS = 5 * 1000;
const GATE_ENV_KEYS = [
  'MYSQL_ADDRESS',
  'MYSQL_USERNAME',
  'MYSQL_PASSWORD',
  'HAS_CALLED_DATABASE_INIT_TOOL',
  'DATABASE_INIT_ERROR_CODE',
  'DATABASE_INIT_FAILED_REASON',
  'RESOURCE_INIT_ERROR_CODE',
  'RESOURCE_INIT_FAILED_REASON',
];

/** 产品对用户文案。未知码走兜底，不把平台原始 reason 直接给用户。 */
const GENERIC_PLATFORM_USER_MESSAGE = '系统异常，可联系平台客服处理';

const CLOUD_USER_MESSAGES = {
  '4010018': '账号已欠费，请充值后重试或联系平台客服处理',
  '407004': '兴趣卡开通已达上限，请联系平台处理',
  '407005': '账号实名信息异常，请修改后继续使用',
  '407006': '账号未完成实名，请先完成实名后继续使用',
  '407007': '账号实名信息异常，请修改后继续使用',
  '407008': '账号属于未成年用户，不支持使用平台',
};

const DATABASE_USER_MESSAGES = {
  '4010018': '账号已欠费，请充值后重试或联系平台客服处理',
  '4010030': '系统异常，可联系平台客服处理',
  '407009': '系统异常，可联系平台客服处理',
};

const resolvePlatformUserMessage = (kind, code) => {
  const table = kind === 'cloud' ? CLOUD_USER_MESSAGES : DATABASE_USER_MESSAGES;
  return table[code] || GENERIC_PLATFORM_USER_MESSAGE;
};

const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

const readEnv = key => {
  const value = process.env[key];
  return typeof value === 'string' ? value.trim() : '';
};

const isTruthyEnv = key => {
  const flag = readEnv(key).toLowerCase();
  return flag === '1' || flag === 'true' || flag === 'yes';
};

const reloadSandboxEnvironment = () => {
  try {
    const printfFormat = `${GATE_ENV_KEYS.map(() => '%s').join('\\0')}\\0`;
    const printfArgs = GATE_ENV_KEYS.map(key => `"\${${key}-}"`).join(' ');
    const output = execFileSync(
      'bash',
      [
        '-c',
        `if [ -f "$HOME/.bashrc" ]; then source "$HOME/.bashrc" >/dev/null 2>&1 || true; fi; printf "${printfFormat}" ${printfArgs}`,
      ],
      {
        encoding: 'utf8',
        env: process.env,
      },
    );
    const values = output.split('\0');

    GATE_ENV_KEYS.forEach((key, index) => {
      const value = values[index];
      if (value) {
        process.env[key] = value;
      } else {
        delete process.env[key];
      }
    });
  } catch (error) {
    console.warn(`[WARN] Failed to reload sandbox environment from $HOME/.bashrc: ${error.message}`);
  }
};

const hasMysqlReady = () => {
  reloadSandboxEnvironment();
  return Boolean(readEnv('MYSQL_ADDRESS') && readEnv('MYSQL_USERNAME') && readEnv('MYSQL_PASSWORD'));
};

const readCloudError = () => {
  reloadSandboxEnvironment();
  const code = readEnv('RESOURCE_INIT_ERROR_CODE');
  const platformReason = readEnv('RESOURCE_INIT_FAILED_REASON');
  if (!code && !platformReason) {
    return null;
  }
  return {
    type: 'cloud',
    code: code || 'UNKNOWN',
    reason: resolvePlatformUserMessage('cloud', code),
  };
};

const readDatabaseError = () => {
  reloadSandboxEnvironment();
  const code = readEnv('DATABASE_INIT_ERROR_CODE');
  const platformReason = readEnv('DATABASE_INIT_FAILED_REASON');
  if (!code && !platformReason) {
    return null;
  }
  return {
    type: 'database',
    code: code || 'UNKNOWN',
    reason: resolvePlatformUserMessage('database', code),
  };
};

const hasCalledDatabaseInitTool = () => {
  reloadSandboxEnvironment();
  return isTruthyEnv('HAS_CALLED_DATABASE_INIT_TOOL');
};

const logInitError = error => {
  console.error(`[mysql-gate] type=${error.type} code=${error.code} reason=${error.reason}`);
};

const resolveMysqlGate = async () => {
  const cloudError = readCloudError();
  if (cloudError) {
    logInitError(cloudError);
    return { action: 'fail', error: cloudError };
  }

  const databaseError = readDatabaseError();
  if (databaseError) {
    logInitError(databaseError);
    return { action: 'fail', error: databaseError };
  }

  if (hasMysqlReady()) {
    return { action: 'migrate' };
  }

  if (hasCalledDatabaseInitTool()) {
    console.log(
      `[mysql-gate] HAS_CALLED_DATABASE_INIT_TOOL=true，等待 MYSQL_* 就绪（最长 ${OPENING_WAIT_MS / 1000}s）`,
    );
    const deadline = Date.now() + OPENING_WAIT_MS;
    while (Date.now() < deadline) {
      const openingCloudError = readCloudError();
      if (openingCloudError) {
        logInitError(openingCloudError);
        return { action: 'fail', error: openingCloudError };
      }
      const openingDbError = readDatabaseError();
      if (openingDbError) {
        logInitError(openingDbError);
        return { action: 'fail', error: openingDbError };
      }
      if (hasMysqlReady()) {
        console.log('[mysql-gate] MYSQL_* 已就绪，开始迁库');
        return { action: 'migrate' };
      }
      await sleep(OPENING_POLL_MS);
    }
    const timeoutError = {
      type: 'database',
      code: '4010030',
      reason: resolvePlatformUserMessage('database', '4010030'),
    };
    logInitError(timeoutError);
    return { action: 'fail', error: timeoutError };
  }

  console.log('[mysql-gate] HAS_CALLED_DATABASE_INIT_TOOL 未置位且 MYSQL_* 未就绪，跳过 init-mysql-db');
  return { action: 'skip' };
};

const parseMySQLAddress = () => {
  const address = process.env.MYSQL_ADDRESS;
  if (!address) {
    throw new Error('数据库资源初始化失败：MYSQL_ADDRESS 环境变量未设置');
  }
  const lastColonIndex = address.lastIndexOf(':');
  if (lastColonIndex === -1) {
    throw new Error('数据库资源初始化失败：MYSQL_ADDRESS 格式错误，应为 host:port');
  }
  const host = address.substring(0, lastColonIndex);
  const portStr = address.substring(lastColonIndex + 1);
  const port = parseInt(portStr, 10);
  if (isNaN(port)) {
    throw new Error('数据库资源初始化失败：MYSQL_ADDRESS 端口格式错误');
  }
  return { host, port };
};

const dbName = 'myapp';
const sqlDir = path.join(__dirname, '..', 'sql');

const BENIGN_DDL_ERROR_CODES = new Map([
  [1007, 'database already exists'],
  [1050, 'table already exists'],
  [1060, 'column already exists'],
  [1061, 'index/key already exists'],
  [1091, 'column/index does not exist, nothing to drop'],
  [1826, 'foreign key name already exists'],
]);

console.log('[DEBUG] SQL directory:', sqlDir);
console.log('[DEBUG] SQL directory exists:', fs.existsSync(sqlDir));

async function getSqlFiles() {
  try {
    const files = await fs.promises.readdir(sqlDir);
    return files.filter(file => file.endsWith('.sql')).sort((a, b) => a.localeCompare(b));
  } catch (error) {
    console.error(`Error reading SQL directory: ${error.message}`);
    return [];
  }
}

async function readSqlFile(filename) {
  const filePath = path.join(sqlDir, filename);
  try {
    return await fs.promises.readFile(filePath, 'utf-8');
  } catch (error) {
    console.error(`Error reading SQL file ${filename}: ${error.message}`);
    return null;
  }
}

async function executeSqlFile(connection, filename, sqlContent) {
  try {
    const cleanedContent = sqlContent
      .split('\n')
      .filter(line => !line.trim().startsWith('--'))
      .join('\n');

    const statements = cleanedContent
      .split(';')
      .map(stmt => stmt.trim())
      .filter(stmt => stmt.length > 0);

    let skippedCount = 0;

    for (const statement of statements) {
      if (statement) {
        try {
          await connection.query(statement);
        } catch (error) {
          const skipReason = BENIGN_DDL_ERROR_CODES.get(error.errno);
          if (!skipReason) {
            throw error;
          }
          skippedCount += 1;
          console.log(`  - skip idempotent DDL (errno=${error.errno}, ${skipReason})`);
        }
      }
    }

    const appliedCount = statements.length - skippedCount;
    console.log(
      `  ✓ Executed: ${filename}, ${appliedCount}/${statements.length} statements applied` +
        (skippedCount > 0 ? `, ${skippedCount} skipped as already applied` : ''),
    );
  } catch (error) {
    throw new Error(`Failed to execute ${filename}: ${error.message}`);
  }
}

async function migrateDatabase() {
  let connection;

  try {
    const { host, port } = parseMySQLAddress();
    const baseConfig = {
      host,
      port,
      user: process.env.MYSQL_USERNAME,
      password: process.env.MYSQL_PASSWORD,
    };

    if (!baseConfig.user) {
      throw new Error('数据库资源初始化失败：MYSQL_USERNAME 环境变量未设置');
    }
    if (!baseConfig.password) {
      throw new Error('数据库资源初始化失败：MYSQL_PASSWORD 环境变量未设置');
    }

    console.log('[DEBUG] Database config:', {
      host: baseConfig.host,
      port: baseConfig.port,
      user: baseConfig.user,
      database: dbName,
      password: baseConfig.password ? '***' : '(empty)',
    });

    console.log('Starting database initialization...\n');

    const sqlFiles = await getSqlFiles();
    if (sqlFiles.length === 0) {
      console.log('No SQL files found in server/sql directory.');
      return;
    }

    console.log(`Found ${sqlFiles.length} SQL file(s):`);
    sqlFiles.forEach(file => console.log(`  - ${file}`));
    console.log('');

    const createDbFiles = sqlFiles.filter(
      f => f.includes('create_database') || f.includes('database'),
    );
    const otherFiles = sqlFiles.filter(f => !createDbFiles.includes(f));

    if (createDbFiles.length > 0) {
      console.log('Step 1: Creating database...');
      connection = await mysql.createConnection(baseConfig);

      for (const filename of createDbFiles) {
        let sqlContent = await readSqlFile(filename);
        if (sqlContent) {
          sqlContent = sqlContent.replace(/`myapp`/g, `\`${dbName}\``);
          await executeSqlFile(connection, filename, sqlContent);
        }
      }

      await connection.end();
      connection = undefined;
      console.log('');
    } else {
      console.log('Step 1: No create-database SQL file found, ensuring default database exists...');
      connection = await mysql.createConnection(baseConfig);
      await connection.query(
        `CREATE DATABASE IF NOT EXISTS \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
      );
      await connection.end();
      connection = undefined;
      console.log(`  ✓ Ensured database ${dbName} exists\n`);
    }

    if (otherFiles.length > 0) {
      console.log('Step 2: Executing remaining SQL files...');
      const dbConfig = { ...baseConfig, database: dbName };
      connection = await mysql.createConnection(dbConfig);

      for (const filename of otherFiles) {
        const sqlContent = await readSqlFile(filename);
        if (sqlContent) {
          await executeSqlFile(connection, filename, sqlContent);
        }
      }

      console.log('');
    }

    console.log('Database initialization completed successfully!');
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

async function main() {
  const gate = await resolveMysqlGate();
  if (gate.action === 'skip') {
    process.exit(0);
  }
  if (gate.action === 'fail') {
    process.exit(1);
  }

  try {
    await migrateDatabase();
  } catch (error) {
    console.error('\nDatabase initialization failed:', error.message);
    process.exit(1);
  }
}

main();
