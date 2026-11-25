import { isBPreviewRuntime } from './closed-domain-runtime';
import {
  ClosedDomainMySQLProxyResponse,
  queryClosedDomainMySQL,
} from './read-only-mysql-proxy';
import { queryPreviewReadOnlyMySQL } from './preview-read-only-mysql';
import { formatReadOnlySQL, type ReadOnlySQLValue } from './read-only-sql';

export async function queryClosedDomainReadOnly<T = unknown>(
  sql: string,
  options?: {
    database?: string;
    sqlParams?: readonly ReadOnlySQLValue[];
  },
): Promise<ClosedDomainMySQLProxyResponse<T>> {
  const formattedSQL = formatReadOnlySQL(sql, options?.sqlParams);

  if (isBPreviewRuntime()) {
    console.info('[ClosedDomain][PreviewDB] Using direct read-only MySQL connection');
    const rows = await queryPreviewReadOnlyMySQL<T>(formattedSQL, options?.database);
    return {
      code: 0,
      data: rows,
    };
  }

  console.info('[ClosedDomain][CloudProxyDB] Using closed-domain read-only MySQL proxy');
  return queryClosedDomainMySQL<T>(formattedSQL, options?.database);
}
