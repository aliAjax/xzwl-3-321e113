import db from '../db';
import { v4 as uuidv4 } from 'uuid';
import type { Database, RunResult } from 'better-sqlite3';

export interface FindOptions {
  limit?: number;
  offset?: number;
  orderBy?: string;
  orderDir?: 'ASC' | 'DESC';
}

export abstract class BaseRepository<T extends { id: string }> {
  protected db: Database = db;
  protected abstract tableName: string;
  protected abstract fieldMap: Record<keyof T, string>;
  protected abstract jsonFields: Array<keyof T>;

  protected toDatabase(data: Partial<T>): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data)) {
      const dbField = this.fieldMap[key as keyof T];
      if (dbField && value !== undefined) {
        if (this.jsonFields.includes(key as keyof T)) {
          result[dbField] = JSON.stringify(value);
        } else {
          result[dbField] = value;
        }
      }
    }
    return result;
  }

  protected fromDatabase(row: Record<string, unknown>): T {
    const result: Record<string, unknown> = {};
    for (const [tsField, dbField] of Object.entries(this.fieldMap)) {
      if (row[dbField] !== undefined) {
        if (this.jsonFields.includes(tsField as keyof T)) {
          result[tsField] = typeof row[dbField] === 'string' 
            ? JSON.parse(row[dbField] as string) 
            : row[dbField];
        } else {
          result[tsField] = row[dbField];
        }
      }
    }
    return result as T;
  }

  findById(id: string): T | undefined {
    const row = this.db
      .prepare(`SELECT * FROM ${this.tableName} WHERE id = ?`)
      .get(id) as Record<string, unknown> | undefined;
    return row ? this.fromDatabase(row) : undefined;
  }

  findAll(options: FindOptions = {}): T[] {
    let sql = `SELECT * FROM ${this.tableName}`;
    const params: unknown[] = [];

    if (options.orderBy) {
      const orderField = this.fieldMap[options.orderBy as keyof T] || options.orderBy;
      const orderDir = options.orderDir || 'ASC';
      sql += ` ORDER BY ${orderField} ${orderDir}`;
    }

    if (options.limit !== undefined) {
      sql += ' LIMIT ?';
      params.push(options.limit);
    }

    if (options.offset !== undefined) {
      sql += ' OFFSET ?';
      params.push(options.offset);
    }

    const rows = this.db.prepare(sql).all(...params) as Record<string, unknown>[];
    return rows.map(row => this.fromDatabase(row));
  }

  findByField(field: keyof T, value: unknown, options: FindOptions = {}): T[] {
    const dbField = this.fieldMap[field];
    let sql = `SELECT * FROM ${this.tableName} WHERE ${dbField} = ?`;
    const params: unknown[] = [value];

    if (options.orderBy) {
      const orderField = this.fieldMap[options.orderBy as keyof T] || options.orderBy;
      const orderDir = options.orderDir || 'ASC';
      sql += ` ORDER BY ${orderField} ${orderDir}`;
    }

    if (options.limit !== undefined) {
      sql += ' LIMIT ?';
      params.push(options.limit);
    }

    if (options.offset !== undefined) {
      sql += ' OFFSET ?';
      params.push(options.offset);
    }

    const rows = this.db.prepare(sql).all(...params) as Record<string, unknown>[];
    return rows.map(row => this.fromDatabase(row));
  }

  findOneByField(field: keyof T, value: unknown): T | undefined {
    const dbField = this.fieldMap[field];
    const row = this.db
      .prepare(`SELECT * FROM ${this.tableName} WHERE ${dbField} = ? LIMIT 1`)
      .get(value) as Record<string, unknown> | undefined;
    return row ? this.fromDatabase(row) : undefined;
  }

  create(data: Omit<T, 'id' | 'createdAt'> & { id?: string; createdAt?: string }): T {
    const id = (data as { id?: string }).id || uuidv4();
    const dataWithId = { ...data, id } as Partial<T>;
    const dbData = this.toDatabase(dataWithId);
    const fields = Object.keys(dbData);
    const placeholders = fields.map(() => '?').join(', ');
    const values = Object.values(dbData);

    const sql = `INSERT INTO ${this.tableName} (${fields.join(', ')}) VALUES (${placeholders})`;
    this.db.prepare(sql).run(...values);

    return this.findById(id) as T;
  }

  update(id: string, data: Partial<Omit<T, 'id' | 'createdAt'>>): T | undefined {
    const dbData = this.toDatabase(data as Partial<T>);
    if (Object.keys(dbData).length === 0) {
      return this.findById(id);
    }

    const setClause = Object.keys(dbData).map(field => `${field} = ?`).join(', ');
    const values = [...Object.values(dbData), id];

    const sql = `UPDATE ${this.tableName} SET ${setClause} WHERE id = ?`;
    const result = this.db.prepare(sql).run(...values) as RunResult;

    if (result.changes === 0) {
      return undefined;
    }

    return this.findById(id);
  }

  delete(id: string): boolean {
    const result = this.db
      .prepare(`DELETE FROM ${this.tableName} WHERE id = ?`)
      .run(id) as RunResult;
    return result.changes > 0;
  }

  count(): number {
    const row = this.db
      .prepare(`SELECT COUNT(*) as count FROM ${this.tableName}`)
      .get() as { count: number };
    return row.count;
  }

  exists(id: string): boolean {
    const row = this.db
      .prepare(`SELECT 1 as exists FROM ${this.tableName} WHERE id = ?`)
      .get(id) as { exists: number } | undefined;
    return row?.exists === 1;
  }
}
