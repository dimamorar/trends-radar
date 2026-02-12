declare module 'bun:sqlite' {
  export interface SQLiteQueryResult {
    lastInsertRowid: number | bigint;
    changes: number;
  }

  export interface Statement {
    run(...params: unknown[]): SQLiteQueryResult;
    get<T = unknown>(...params: unknown[]): T | null;
    all<T = unknown>(...params: unknown[]): T[];
  }

  export interface DatabaseOptions {
    readonly?: boolean;
    create?: boolean;
  }

  export class Database {
    constructor(filename: string, options?: DatabaseOptions);
    query(sql: string): Statement;
    exec(sql: string): void;
    // biome-ignore lint/suspicious/noExplicitAny: generic transaction callback needs any for inference
    transaction<T extends (...args: any[]) => any>(fn: T): T;
    close(): void;
  }
}
