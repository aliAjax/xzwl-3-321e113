import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import * as migrations from './migrations/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.resolve(__dirname, '../data');
const dbPath = path.join(dataDir, 'cold-chain.db');

interface MigrationRecord {
  id: string;
  name: string;
  executed_at: string;
  success: number;
  error_message?: string;
}

interface MigrationModule {
  id: string;
  description: string;
  up: (db: Database.Database) => void;
}

function initMigrationTable(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id VARCHAR(100) PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      executed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      success INTEGER NOT NULL DEFAULT 1,
      error_message TEXT
    )
  `);
}

function getExecutedMigrations(db: Database.Database): Set<string> {
  const rows = db.prepare('SELECT id FROM schema_migrations WHERE success = 1').all() as { id: string }[];
  return new Set(rows.map(r => r.id));
}

function recordMigration(db: Database.Database, id: string, name: string, success: boolean, errorMessage?: string): void {
  db.prepare(`
    INSERT OR REPLACE INTO schema_migrations (id, name, executed_at, success, error_message)
    VALUES (?, ?, CURRENT_TIMESTAMP, ?, ?)
  `).run(id, name, success ? 1 : 0, errorMessage || null);
}

function getMigrationList(): MigrationModule[] {
  const migrationList: MigrationModule[] = [];
  const keys = Object.keys(migrations).sort();
  
  for (const key of keys) {
    const mod = (migrations as Record<string, MigrationModule>)[key];
    if (mod && typeof mod.id === 'string' && typeof mod.up === 'function') {
      migrationList.push(mod);
    }
  }
  
  return migrationList;
}

function runMigrations(db: Database.Database, targetVersion?: string): { success: boolean; executed: string[]; failed?: string; error?: string } {
  initMigrationTable(db);
  
  const executed = getExecutedMigrations(db);
  const migrationList = getMigrationList();
  const executedList: string[] = [];
  
  db.exec('BEGIN TRANSACTION');
  
  try {
    for (const migration of migrationList) {
      if (targetVersion && migration.id > targetVersion) {
        break;
      }
      
      if (executed.has(migration.id)) {
        console.log(`⊘ ${migration.id} - ${migration.description} (已执行)`);
        continue;
      }
      
      console.log(`▶ 执行 ${migration.id} - ${migration.description}...`);
      
      try {
        migration.up(db);
        recordMigration(db, migration.id, migration.description, true);
        executedList.push(migration.id);
        console.log(`✓ ${migration.id} - 执行成功`);
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error);
        recordMigration(db, migration.id, migration.description, false, errMsg);
        db.exec('ROLLBACK');
        console.error(`\n✗ 迁移失败: ${migration.id}`);
        console.error(`  错误信息: ${errMsg}`);
        console.error(`  已回滚所有未提交的更改`);
        return { success: false, executed: executedList, failed: migration.id, error: errMsg };
      }
    }
    
    db.exec('COMMIT');
    return { success: true, executed: executedList };
  } catch (error) {
    db.exec('ROLLBACK');
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error(`\n✗ 迁移执行过程中发生错误: ${errMsg}`);
    return { success: false, executed: executedList, error: errMsg };
  }
}

function showStatus(db: Database.Database): void {
  initMigrationTable(db);
  
  const executed = getExecutedMigrations(db);
  const migrationList = getMigrationList();
  
  console.log('\n=== 迁移状态 ===\n');
  
  for (const migration of migrationList) {
    const status = executed.has(migration.id) ? '✓ 已执行' : '○ 待执行';
    console.log(`${status}  ${migration.id}  ${migration.description}`);
  }
  
  const pendingCount = migrationList.filter(m => !executed.has(m.id)).length;
  console.log(`\n总计: ${migrationList.length} 个迁移, 待执行: ${pendingCount} 个`);
  
  if (pendingCount > 0) {
    console.log('\n提示: 运行 npm run db:migrate 执行待执行的迁移');
  }
}

function ensureDataDir(): void {
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
    console.log(`✓ 创建数据目录: ${dataDir}`);
  }
}

function main(): void {
  const args = process.argv.slice(2);
  const command = args[0] || 'migrate';
  
  ensureDataDir();
  
  const dbExists = fs.existsSync(dbPath);
  const db = new Database(dbPath);
  
  try {
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    
    if (!dbExists) {
      console.log(`✓ 创建新数据库: ${dbPath}`);
    } else {
      console.log(`使用现有数据库: ${dbPath}`);
    }
    
    console.log('');
    
    switch (command) {
      case 'migrate': {
        const targetVersion = args[1];
        console.log('=== 开始执行数据库迁移 ===\n');
        const result = runMigrations(db, targetVersion);
        
        console.log('');
        if (result.success) {
          if (result.executed.length === 0) {
            console.log('✓ 所有迁移已是最新版本');
          } else {
            console.log(`✓ 迁移完成，共执行 ${result.executed.length} 个迁移`);
          }
          process.exit(0);
        } else {
          console.log(`\n✗ 迁移失败，请修复问题后重试`);
          console.log(`  已执行 ${result.executed.length} 个迁移`);
          if (result.failed) {
            console.log(`  失败的迁移: ${result.failed}`);
          }
          process.exit(1);
        }
        break;
      }
      
      case 'status': {
        showStatus(db);
        break;
      }
      
      case 'history': {
        initMigrationTable(db);
        const records = db.prepare('SELECT * FROM schema_migrations ORDER BY executed_at DESC').all() as MigrationRecord[];
        console.log('\n=== 迁移历史 ===\n');
        for (const record of records) {
          const status = record.success ? '✓ 成功' : '✗ 失败';
          console.log(`${status}  ${record.id}  ${record.executed_at}`);
          if (record.error_message) {
            console.log(`   错误: ${record.error_message}`);
          }
        }
        break;
      }
      
      case 'reset': {
        console.warn('\n⚠  警告: 此操作将删除所有数据并重新初始化数据库！');
        console.warn('   请确保已备份重要数据。\n');
        
        const confirm = args[1] === '--force' || process.env.DB_RESET_FORCE === 'true';
        if (!confirm) {
          console.log('请添加 --force 参数确认执行此操作:');
          console.log('  npm run db:migrate -- reset --force');
          process.exit(1);
        }
        
        console.log('正在重置数据库...');
        db.close();
        fs.unlinkSync(dbPath);
        console.log('✓ 已删除旧数据库');
        
        const newDb = new Database(dbPath);
        newDb.pragma('journal_mode = WAL');
        newDb.pragma('foreign_keys = ON');
        
        const result = runMigrations(newDb);
        newDb.close();
        
        if (result.success) {
          console.log(`✓ 数据库重置完成，共执行 ${result.executed.length} 个迁移`);
          process.exit(0);
        } else {
          console.log('✗ 数据库重置失败');
          process.exit(1);
        }
        break;
      }
      
      default:
        console.log(`未知命令: ${command}`);
        console.log('\n可用命令:');
        console.log('  migrate [version]  - 执行所有待执行的迁移（可选指定目标版本）');
        console.log('  status             - 显示迁移状态');
        console.log('  history            - 显示迁移历史');
        console.log('  reset --force      - 重置数据库（删除所有数据）');
        console.log('\n示例:');
        console.log('  npm run db:migrate');
        console.log('  npm run db:migrate -- status');
        console.log('  npm run db:migrate -- migrate V003');
        process.exit(1);
    }
  } finally {
    if (db.open) {
      db.close();
    }
  }
}

main();
