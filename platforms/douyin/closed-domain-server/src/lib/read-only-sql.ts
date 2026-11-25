export const DEFAULT_DATABASE = 'myapp';
const DATABASE_NAME_PATTERN = /^[a-zA-Z0-9_]{1,64}$/;
const READ_ONLY_SQL_PATTERN = /^(select|show|desc|describe|explain)\b/i;
const DISALLOWED_SQL_PATTERNS: Array<{ pattern: RegExp; message: string }> = [
    {
        pattern: /\binto\s+(outfile|dumpfile)\b/i,
        message: '禁止 SELECT ... INTO OUTFILE/DUMPFILE',
    },
    { pattern: /\bfor\s+update\b/i, message: '禁止 FOR UPDATE' },
    { pattern: /\bfor\s+share\b/i, message: '禁止 FOR SHARE' },
    { pattern: /\block\s+in\s+share\s+mode\b/i, message: '禁止 LOCK IN SHARE MODE' },
];

export type ReadOnlySQLValue =
    | string
    | number
    | bigint
    | boolean
    | Date
    | null;

function maskSQLLiteralsAndComments(sql: string): string {
    let result = '';
    let quote: string | null = null;
    let inLineComment = false;
    let inBlockComment = false;

    for (let index = 0; index < sql.length; index += 1) {
        const char = sql[index];
        const next = sql[index + 1];

        if (inLineComment) {
            result += char === '\n' || char === '\r' ? char : ' ';
            if (char === '\n' || char === '\r') {
                inLineComment = false;
            }
            continue;
        }

        if (inBlockComment) {
            result += ' ';
            if (char === '*' && next === '/') {
                result += ' ';
                index += 1;
                inBlockComment = false;
            }
            continue;
        }

        if (quote) {
            result += ' ';
            if (char === '\\' && quote !== '`' && next !== undefined) {
                result += ' ';
                index += 1;
                continue;
            }
            if (char === quote) {
                if (next === quote) {
                    result += ' ';
                    index += 1;
                    continue;
                }
                quote = null;
            }
            continue;
        }

        if (char === '-' && next === '-') {
            result += '  ';
            index += 1;
            inLineComment = true;
            continue;
        }
        if (char === '#') {
            result += ' ';
            inLineComment = true;
            continue;
        }
        if (char === '/' && next === '*') {
            result += '  ';
            index += 1;
            inBlockComment = true;
            continue;
        }
        if (char === '\'' || char === '"' || char === '`') {
            result += ' ';
            quote = char;
            continue;
        }

        result += char;
    }

    return result;
}

function hasExecutableTokenAfterStatementTerminator(sql: string): boolean {
    let quote: string | null = null;
    let inLineComment = false;
    let inBlockComment = false;
    let sawTerminator = false;

    for (let index = 0; index < sql.length; index += 1) {
        const char = sql[index];
        const next = sql[index + 1];

        if (inLineComment) {
            if (char === '\n' || char === '\r') {
                inLineComment = false;
            }
            continue;
        }

        if (inBlockComment) {
            if (char === '*' && next === '/') {
                index += 1;
                inBlockComment = false;
            }
            continue;
        }

        if (quote) {
            if (char === '\\' && quote !== '`') {
                index += 1;
                continue;
            }
            if (char === quote) {
                if (next === quote) {
                    index += 1;
                    continue;
                }
                quote = null;
            }
            continue;
        }

        if (char === '-' && next === '-') {
            index += 1;
            inLineComment = true;
            continue;
        }
        if (char === '#') {
            inLineComment = true;
            continue;
        }
        if (char === '/' && next === '*') {
            index += 1;
            inBlockComment = true;
            continue;
        }
        if (char === '\'' || char === '"' || char === '`') {
            quote = char;
            continue;
        }
        if (char === ';') {
            sawTerminator = true;
            continue;
        }
        if (sawTerminator && /\S/.test(char)) {
            return true;
        }
    }

    return false;
}

function formatDateForSQL(value: Date): string {
    return value.toISOString().replace('T', ' ').replace('Z', '');
}

function escapeStringForSQL(value: string): string {
    return value
        .replace(/\\/g, '\\\\')
        .replace(/\u0000/g, '\\0')
        .replace(/\n/g, '\\n')
        .replace(/\r/g, '\\r')
        .replace(/\u001a/g, '\\Z')
        .replace(/'/g, "\\'");
}

export function serializeReadOnlySQLValue(value: ReadOnlySQLValue): string {
    if (value === null) {
        return 'NULL';
    }
    if (typeof value === 'number') {
        if (!Number.isFinite(value)) {
            throw new Error('封闭域只读 DB 查询失败：number 参数必须是有限值');
        }
        return String(value);
    }
    if (typeof value === 'bigint') {
        return value.toString();
    }
    if (typeof value === 'boolean') {
        return value ? '1' : '0';
    }
    if (value instanceof Date) {
        return `'${escapeStringForSQL(formatDateForSQL(value))}'`;
    }
    return `'${escapeStringForSQL(value)}'`;
}

export function formatReadOnlySQL(
    sql: string,
    params: readonly ReadOnlySQLValue[] = [],
): string {
    if (params.length === 0) {
        let quote: string | null = null;
        let inLineComment = false;
        let inBlockComment = false;

        for (let index = 0; index < sql.length; index += 1) {
            const char = sql[index];
            const next = sql[index + 1];

            if (inLineComment) {
                if (char === '\n' || char === '\r') {
                    inLineComment = false;
                }
                continue;
            }

            if (inBlockComment) {
                if (char === '*' && next === '/') {
                    index += 1;
                    inBlockComment = false;
                }
                continue;
            }

            if (quote) {
                if (char === '\\' && quote !== '`') {
                    index += 1;
                    continue;
                }
                if (char === quote) {
                    if (next === quote) {
                        index += 1;
                        continue;
                    }
                    quote = null;
                }
                continue;
            }

            if (char === '-' && next === '-') {
                index += 1;
                inLineComment = true;
                continue;
            }
            if (char === '#') {
                inLineComment = true;
                continue;
            }
            if (char === '/' && next === '*') {
                index += 1;
                inBlockComment = true;
                continue;
            }
            if (char === '\'' || char === '"' || char === '`') {
                quote = char;
                continue;
            }
            if (char === '?') {
                throw new Error('封闭域只读 DB 查询失败：抖音云只读代理不支持未绑定的 ? 占位符，请先把参数格式化为完整 SQL');
            }
        }
        return sql;
    }

    let result = '';
    let quote: string | null = null;
    let inLineComment = false;
    let inBlockComment = false;
    let paramIndex = 0;

    for (let index = 0; index < sql.length; index += 1) {
        const char = sql[index];
        const next = sql[index + 1];

        if (inLineComment) {
            result += char;
            if (char === '\n' || char === '\r') {
                inLineComment = false;
            }
            continue;
        }

        if (inBlockComment) {
            result += char;
            if (char === '*' && next === '/') {
                result += next;
                index += 1;
                inBlockComment = false;
            }
            continue;
        }

        if (quote) {
            result += char;
            if (char === '\\' && quote !== '`' && next !== undefined) {
                result += next;
                index += 1;
                continue;
            }
            if (char === quote) {
                if (next === quote) {
                    result += next;
                    index += 1;
                    continue;
                }
                quote = null;
            }
            continue;
        }

        if (char === '-' && next === '-') {
            result += char + next;
            index += 1;
            inLineComment = true;
            continue;
        }
        if (char === '#') {
            result += char;
            inLineComment = true;
            continue;
        }
        if (char === '/' && next === '*') {
            result += char + next;
            index += 1;
            inBlockComment = true;
            continue;
        }
        if (char === '\'' || char === '"' || char === '`') {
            result += char;
            quote = char;
            continue;
        }
        if (char === '?') {
            if (paramIndex >= params.length) {
                throw new Error('封闭域只读 DB 查询失败：SQL ? 占位符数量多于提供的参数数量');
            }
            result += serializeReadOnlySQLValue(params[paramIndex]);
            paramIndex += 1;
            continue;
        }
        result += char;
    }

    if (paramIndex !== params.length) {
        throw new Error('封闭域只读 DB 查询失败：提供的参数数量多于 SQL ? 占位符数量');
    }

    return result;
}

export function assertReadOnlySQL(sql: string): void {
    if (/\/\*!/.test(sql)) {
        throw new Error('封闭域只读 DB 查询失败：禁止 MySQL 可执行版本注释');
    }

    const semanticSQL = maskSQLLiteralsAndComments(sql).trim();
    if (!READ_ONLY_SQL_PATTERN.test(semanticSQL)) {
        throw new Error('封闭域只读 DB 查询失败：仅允许 SELECT/SHOW/DESC/DESCRIBE/EXPLAIN');
    }
    if (hasExecutableTokenAfterStatementTerminator(sql)) {
        throw new Error('封闭域只读 DB 查询失败：禁止多语句');
    }

    const disallowed = DISALLOWED_SQL_PATTERNS.find(({ pattern }) => pattern.test(semanticSQL));
    if (disallowed) {
        throw new Error(`封闭域只读 DB 查询失败：${disallowed.message}`);
    }
}

export function normalizeDatabaseName(database = DEFAULT_DATABASE): string {
    const targetDatabase = database.trim() || DEFAULT_DATABASE;
    if (!DATABASE_NAME_PATTERN.test(targetDatabase)) {
        throw new Error('封闭域只读 DB 查询失败：database 只能包含字母、数字、下划线且长度不超过 64');
    }
    return targetDatabase;
}
