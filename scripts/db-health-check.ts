import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import * as migrations from './migrations/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.resolve(__dirname, '../data');
const dbPath = path.join(dataDir, 'cold-chain.db');

interface TableSchema {
  name: string;
  columns: string[];
}

interface CheckResult {
  type: 'table' | 'column' | 'migration' | 'connection';
  name: string;
  status: 'pass' | 'fail' | 'warning';
  message: string;
}

const expectedSchema: TableSchema[] = [
  {
    name: 'users',
    columns: ['id', 'username', 'password_hash', 'role', 'name', 'phone', 'driver_id', 'created_at'],
  },
  {
    name: 'customers',
    columns: ['id', 'name', 'contact_name', 'phone', 'address', 'priority', 'created_at'],
  },
  {
    name: 'orders',
    columns: ['id', 'order_no', 'customer_id', 'temperature_zone', 'min_temp', 'max_temp', 'goods_name', 'quantity', 'weight', 'delivery_address', 'scheduled_delivery_time', 'status', 'remarks', 'created_at', 'updated_at'],
  },
  {
    name: 'vehicles',
    columns: ['id', 'plate_no', 'vehicle_type', 'temperature_zones', 'capacity', 'driver_id', 'available_start_time', 'available_end_time', 'status', 'created_at'],
  },
  {
    name: 'drivers',
    columns: ['id', 'name', 'phone', 'license_no', 'license_type', 'status', 'created_at'],
  },
  {
    name: 'routes',
    columns: ['id', 'name', 'description', 'stops_json', 'created_at'],
  },
  {
    name: 'loading_batches',
    columns: ['id', 'batch_no', 'vehicle_id', 'driver_id', 'route_id', 'order_ids_json', 'status', 'departure_time', 'created_at'],
  },
  {
    name: 'delivery_tasks',
    columns: ['id', 'batch_id', 'order_id', 'driver_id', 'vehicle_id', 'status', 'created_at'],
  },
  {
    name: 'delivery_nodes',
    columns: ['id', 'task_id', 'node_type', 'node_name', 'status', 'recorded_at', 'location_text', 'exception_description', 'temperature', 'operator_id', 'operator_name', 'client_submit_id', 'version', 'created_at', 'updated_at'],
  },
  {
    name: 'exception_handlings',
    columns: ['id', 'node_id', 'task_id', 'order_id', 'driver_id', 'temperature_zone', 'exception_description', 'exception_time', 'handling_status', 'handling_result', 'handling_notes', 'handled_by', 'handled_at', 'escalation_level', 'assignee_id', 'is_closed', 'closed_by', 'closed_at', 'sla_deadline', 'created_at', 'updated_at'],
  },
  {
    name: 'exception_processing_notes',
    columns: ['id', 'exception_handling_id', 'note', 'created_by', 'created_by_name', 'action_type', 'old_value', 'new_value', 'created_at'],
  },
  {
    name: 'temperature_evidence',
    columns: ['id', 'batch_id', 'source', 'reading_key', 'content_hash', 'raw_payload', 'temperature_centi', 'observed_at', 'received_at', 'order_id', 'task_id', 'node_id', 'node_type', 'min_temp_centi', 'max_temp_centi', 'is_abnormal', 'created_at'],
  },
  {
    name: 'schema_migrations',
    columns: ['id', 'name', 'executed_at', 'success', 'error_message'],
  },
];

function checkConnection(dbPath: string): CheckResult {
  if (!fs.existsSync(dbPath)) {
    return {
      type: 'connection',
      name: 'database',
      status: 'fail',
      message: `数据库文件不存在: ${dbPath}`,
    };
  }
  try {
    const db = new Database(dbPath, { readonly: true });
    db.close();
    return {
      type: 'connection',
      name: 'database',
      status: 'pass',
      message: '数据库连接正常',
    };
  } catch (error) {
    return {
      type: 'connection',
      name: 'database',
      status: 'fail',
      message: `数据库连接失败: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

function checkTables(db: Database.Database): CheckResult[] {
  const results: CheckResult[] = [];
  const existingTables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[];
  const existingTableNames = new Set(existingTables.map(t => t.name));

  for (const table of expectedSchema) {
    if (existingTableNames.has(table.name)) {
      results.push({
        type: 'table',
        name: table.name,
        status: 'pass',
        message: `表 ${table.name} 存在`,
      });
    } else {
      results.push({
        type: 'table',
        name: table.name,
        status: 'fail',
        message: `缺失表: ${table.name}`,
      });
    }
  }

  return results;
}

function checkColumns(db: Database.Database): CheckResult[] {
  const results: CheckResult[] = [];
  const existingTables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[];
  const existingTableNames = new Set(existingTables.map(t => t.name));

  for (const table of expectedSchema) {
    if (!existingTableNames.has(table.name)) {
      continue;
    }

    const columns = db.prepare(`PRAGMA table_info(${table.name})`).all() as { name: string }[];
    const columnNames = new Set(columns.map(c => c.name));

    for (const expectedColumn of table.columns) {
      if (columnNames.has(expectedColumn)) {
        results.push({
          type: 'column',
          name: `${table.name}.${expectedColumn}`,
          status: 'pass',
          message: `字段 ${table.name}.${expectedColumn} 存在`,
        });
      } else {
        results.push({
          type: 'column',
          name: `${table.name}.${expectedColumn}`,
          status: 'fail',
          message: `缺失字段: ${table.name}.${expectedColumn}`,
        });
      }
    }
  }

  return results;
}

function checkMigrations(db: Database.Database): CheckResult[] {
  const results: CheckResult[] = [];

  const migrationTableExists = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='schema_migrations'").get();
  
  if (!migrationTableExists) {
    results.push({
      type: 'migration',
      name: 'schema_migrations',
      status: 'fail',
      message: '迁移记录表不存在，请先运行 npm run db:migrate',
    });
    return results;
  }

  const executedMigrations = db.prepare("SELECT id, success FROM schema_migrations").all() as { id: string; success: number }[];
  const executedIds = new Set(executedMigrations.filter(m => m.success === 1).map(m => m.id));
  const failedMigrations = executedMigrations.filter(m => m.success === 0);

  if (failedMigrations.length > 0) {
    for (const m of failedMigrations) {
      results.push({
        type: 'migration',
        name: m.id,
        status: 'fail',
        message: `迁移 ${m.id} 执行失败，请检查并修复`,
      });
    }
  }

  const migrationList = Object.values(migrations).filter(
    (m): m is { id: string; description: string } => 
      typeof m === 'object' && m !== null && 'id' in m && 'description' in m
  ).sort((a, b) => a.id.localeCompare(b.id));

  for (const migration of migrationList) {
    if (executedIds.has(migration.id)) {
      results.push({
        type: 'migration',
        name: migration.id,
        status: 'pass',
        message: `迁移 ${migration.id} 已执行`,
      });
    } else {
      results.push({
        type: 'migration',
        name: migration.id,
        status: 'warning',
        message: `迁移 ${migration.id} 待执行，请运行 npm run db:migrate`,
      });
    }
  }

  return results;
}

function printResults(displayResults: CheckResult[], allResults: CheckResult[]): { pass: number; fail: number; warning: number } {
  let pass = 0, fail = 0, warning = 0;

  console.log('\n=== 数据库健康检查报告 ===\n');

  const grouped: Record<string, CheckResult[]> = {
    connection: [],
    table: [],
    column: [],
    migration: [],
  };

  for (const r of displayResults) {
    grouped[r.type].push(r);
  }

  for (const r of allResults) {
    if (r.status === 'pass') pass++;
    else if (r.status === 'fail') fail++;
    else warning++;
  }

  for (const type of ['connection', 'table', 'column', 'migration'] as const) {
    const items = grouped[type];
    if (items.length === 0) continue;

    const typeLabels: Record<string, string> = {
      connection: '连接检查',
      table: '数据表检查',
      column: '字段检查',
      migration: '迁移检查',
    };

    console.log(`${typeLabels[type]} (${items.length} 项):`);
    
    for (const item of items) {
      const statusIcon = item.status === 'pass' ? '✓' : item.status === 'fail' ? '✗' : '⚠';
      const statusColor = item.status === 'pass' ? '' : item.status === 'fail' ? '' : '';
      console.log(`  ${statusIcon} ${item.message}`);
    }
    console.log('');
  }

  console.log('=== 汇总 ===');
  console.log(`通过: ${pass} 项`);
  if (warning > 0) console.log(`警告: ${warning} 项`);
  console.log(`失败: ${fail} 项`);

  return { pass, fail, warning };
}

function main(): void {
  const args = process.argv.slice(2);
  const verbose = args.includes('--verbose') || args.includes('-v');
  const jsonOutput = args.includes('--json');

  console.log(`数据库路径: ${dbPath}`);

  const allResults: CheckResult[] = [];

  const connResult = checkConnection(dbPath);
  allResults.push(connResult);

  if (connResult.status === 'fail') {
    console.log('\n错误: 无法连接到数据库');
    console.log('请先运行以下命令初始化数据库:');
    console.log('  npm run db:migrate');
    process.exit(1);
  }

  const db = new Database(dbPath, { readonly: true });
  
  try {
    allResults.push(...checkTables(db));
    allResults.push(...checkColumns(db));
    allResults.push(...checkMigrations(db));
  } finally {
    db.close();
  }

  const displayResults = verbose ? allResults : allResults.filter(r => r.status !== 'pass');
  const summary = printResults(displayResults, allResults);

  if (jsonOutput) {
    console.log('\n=== JSON 输出 ===');
    console.log(JSON.stringify({
      database: dbPath,
      results: allResults,
      summary,
    }, null, 2));
  }

  if (summary.fail > 0) {
    console.log('\n❌ 检查未通过，存在必须修复的问题');
    console.log('\n建议操作:');
    console.log('  1. 运行 npm run db:migrate 执行待执行的迁移');
    console.log('  2. 如果迁移失败，查看错误信息并修复');
    console.log('  3. 如需重置数据库，运行 npm run db:reset (注意：这将删除所有数据)');
    process.exit(1);
  } else if (summary.warning > 0) {
    console.log('\n⚠️  检查通过，但有待执行的迁移');
    console.log('建议运行: npm run db:migrate');
    process.exit(0);
  } else {
    console.log('\n✅ 数据库健康检查通过！');
    process.exit(0);
  }
}

main();
