import { DEFAULT_DATABASE, assertReadOnlySQL, normalizeDatabaseName } from './read-only-sql';

const CLOSED_DOMAIN_MYSQL_PROXY_URL = 'http://closed-domain-sql-proxy.dyc.ivolces.com/vi/mysqlproxy';
const MAX_PROXY_BODY_BYTES = 1 << 20;

export interface ClosedDomainMySQLProxyResponse<T = unknown> {
  code: number;
  message?: string;
  data?: T;
  [key: string]: unknown;
}

type RowRecord = Record<string, unknown>;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function mapColumnsAndRows(columns: unknown, rows: unknown): RowRecord[] | null {
  if (!Array.isArray(columns) || !Array.isArray(rows)) {
    return null;
  }
  if (!columns.every((column) => typeof column === 'string')) {
    return null;
  }

  return rows
    .filter((row): row is unknown[] => Array.isArray(row))
    .map((row) => {
      const mapped: RowRecord = {};
      for (let index = 0; index < columns.length; index += 1) {
        mapped[columns[index]] = row[index];
      }
      return mapped;
    });
}

function normalizeRows(payload: unknown): unknown {
  if (Array.isArray(payload)) {
    return payload;
  }

  if (typeof payload === 'string') {
    try {
      return normalizeRows(JSON.parse(payload));
    } catch {
      return payload;
    }
  }

  if (!isPlainObject(payload)) {
    return payload;
  }

  const directRows = mapColumnsAndRows(payload.columns, payload.rows);
  if (directRows) {
    return directRows;
  }

  const nestedRows = mapColumnsAndRows(payload.columns, payload.data);
  if (nestedRows) {
    return nestedRows;
  }

  for (const key of ['rows', 'list', 'result', 'data']) {
    if (key in payload) {
      const normalized = normalizeRows(payload[key]);
      if (Array.isArray(normalized)) {
        return normalized;
      }
    }
  }

  return payload;
}

function getResponseShape(payload: ClosedDomainMySQLProxyResponse<unknown>): Record<string, unknown> {
  const data = payload.data;
  const normalizedData = normalizeRows(data);
  return {
    code: payload.code,
    message: payload.message ?? '',
    topLevelKeys: Object.keys(payload),
    dataType: Array.isArray(data) ? 'array' : typeof data,
    dataIsArray: Array.isArray(data),
    dataKeys: isPlainObject(data) ? Object.keys(data) : [],
    normalizedDataIsArray: Array.isArray(normalizedData),
    normalizedCount: Array.isArray(normalizedData) ? normalizedData.length : 0,
  };
}

export async function queryClosedDomainMySQL<T = unknown>(
  sql: string,
  database = DEFAULT_DATABASE,
): Promise<ClosedDomainMySQLProxyResponse<T>> {
  const trimmedSQL = sql.trim();
  if (!trimmedSQL) {
    throw new Error('封闭域只读 DB 查询失败：sql 不能为空');
  }
  assertReadOnlySQL(trimmedSQL);

  const targetDatabase = normalizeDatabaseName(database);
  const requestBody = JSON.stringify({
    database: targetDatabase,
    sql: trimmedSQL,
  });
  if (Buffer.byteLength(requestBody, 'utf8') > MAX_PROXY_BODY_BYTES) {
    throw new Error('封闭域只读 DB 查询失败：请求体不能超过 1 MiB');
  }

  const response = await fetch(CLOSED_DOMAIN_MYSQL_PROXY_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: requestBody,
  });

  const responseText = await response.text();
  let payload: ClosedDomainMySQLProxyResponse<T>;
  try {
    payload = JSON.parse(responseText) as ClosedDomainMySQLProxyResponse<T>;
  } catch {
    throw new Error(`封闭域只读 DB 查询失败：代理返回非 JSON，HTTP ${response.status}`);
  }

  console.info('[ClosedDomain][CloudProxyDB] response shape', {
    status: response.status,
    ...getResponseShape(payload as ClosedDomainMySQLProxyResponse<unknown>),
  });

  if (!response.ok) {
    throw new Error(`封闭域只读 DB 查询失败：HTTP ${response.status}, code=${payload.code}, message=${payload.message ?? ''}`);
  }
  if (payload.code !== 0 && payload.code !== 200) {
    throw new Error(`封闭域只读 DB 查询失败：code=${payload.code}, message=${payload.message ?? ''}`);
  }

  return {
    ...payload,
    data: normalizeRows(payload.data) as T,
  };
}
