// ── KawaiiDB Mock Data ───────────────────────────────────────────────────────
import { T } from "../tokens";

export const DB_TYPES = {
  mysql:      { label: "MySQL",      abbr: "My", color: T.blue,   versions: "v5.7 / v8.x", defaultPort: 3306 },
  postgresql: { label: "PostgreSQL", abbr: "Pg", color: T.green,  versions: "v12 - v16",   defaultPort: 5432 },
  sqlite:     { label: "SQLite",     abbr: "SL", color: T.purple, versions: "v3.x",        defaultPort: null },
  mongodb:    { label: "MongoDB",    abbr: "Mg", color: T.amber,  versions: "v5 - v7",     defaultPort: 27017 },
  mariadb:    { label: "MariaDB",    abbr: "Ma", color: T.cyan,   versions: "v10.x / v11.x", defaultPort: 3306 },
  redis:      { label: "Redis",      abbr: "Rd", color: T.red,    versions: "v6 - v7",     defaultPort: 6379 },
  oracle:     { label: "Oracle",     abbr: "Or", color: T.amber,  versions: "v19c / v21c", defaultPort: 1521 },
  sqlserver:  { label: "SQL Server", abbr: "Ms", color: T.blue,   versions: "2019 / 2022", defaultPort: 1433 },
};

export const CONNECTIONS = [
  { id: "c1", name: "prod-main-db",  type: "mysql",      version: "MySQL 8.0",      host: "db.prod.internal:3306",    database: "ecommerce_prod", status: "online",  favorite: true,  folder: "Production", lastUsed: "12 min ago" },
  { id: "c2", name: "analytics-pg",  type: "postgresql",  version: "PostgreSQL 16",  host: "analytics.internal:5432",  database: "warehouse",      status: "online",  favorite: true,  folder: "Production", lastUsed: "1 hour ago" },
  { id: "c3", name: "user-service",  type: "postgresql",  version: "PostgreSQL 15",  host: "users.staging:5432",       database: "user_svc",       status: "offline", favorite: false, folder: "Staging",    lastUsed: "3 hours ago" },
  { id: "c4", name: "logs-mongo",    type: "mongodb",     version: "MongoDB 7.0",    host: "mongo.cluster:27017",      database: "app_logs",       status: "online",  favorite: false, folder: null,         lastUsed: "30 min ago" },
  { id: "c5", name: "local-sqlite",  type: "sqlite",      version: "SQLite 3.42",    host: "~/dev/app.db",             database: "app_data",       status: "online",  favorite: false, folder: "Local Dev",  lastUsed: "5 min ago" },
  { id: "c6", name: "staging-mysql", type: "mysql",       version: "MySQL 8.0",      host: "staging.db:3306",          database: "cms_staging",    status: "offline", favorite: false, folder: "Staging",    lastUsed: "2 days ago" },
];

export const SCHEMA_TREE = {
  connection: "prod-main-db",
  dbType: "MySQL 8.0",
  databases: [
    {
      name: "ecommerce_prod",
      tables: [
        { name: "users", rowCount: 1247 },
        { name: "products", rowCount: 3456 },
        { name: "orders", rowCount: 8432 },
        { name: "order_items", rowCount: 24891 },
        { name: "categories", rowCount: 48 },
        { name: "payments", rowCount: 7891 },
        { name: "sessions", rowCount: 12045 },
        { name: "reviews", rowCount: 5672 },
        { name: "coupons", rowCount: 234 },
        { name: "shipping_addresses", rowCount: 3891 },
        { name: "wishlists", rowCount: 1567 },
        { name: "audit_log", rowCount: 45678 },
      ],
      views: ["v_active_orders", "v_user_stats", "v_revenue_daily"],
      storedProcedures: ["sp_process_order", "sp_calc_discount", "sp_update_inventory", "sp_generate_report", "sp_cleanup_sessions"],
      functions: ["fn_calc_tax", "fn_format_currency"],
    },
    { name: "information_schema", tables: [] },
    { name: "performance_schema", tables: [] },
  ],
};

export const TABLE_COLUMNS = [
  { name: "id",         type: "INT",          pk: true },
  { name: "username",   type: "VARCHAR(50)" },
  { name: "email",      type: "VARCHAR(255)" },
  { name: "first_name", type: "VARCHAR(100)" },
  { name: "last_name",  type: "VARCHAR(100)" },
  { name: "status",     type: "ENUM" },
  { name: "role",       type: "VARCHAR(20)" },
  { name: "created_at", type: "DATETIME" },
  { name: "updated_at", type: "DATETIME" },
  { name: "last_login", type: "DATETIME" },
];

export const TABLE_DATA = [
  { id: 1,  username: "john_smith",  email: "john@example.com",  first_name: "John",   last_name: "Smith",    status: "active",   role: "admin",  created_at: "2024-01-15 09:23", updated_at: "2024-03-12 14:30", last_login: "2024-03-12 14:30" },
  { id: 2,  username: "sarah_dev",   email: "sarah@company.io",  first_name: "Sarah",  last_name: "Johnson",  status: "active",   role: "editor", created_at: "2024-02-03 11:45", updated_at: "2024-03-11 16:20", last_login: "2024-03-11 16:20" },
  { id: 3,  username: "mike_ops",    email: "mike@devops.net",   first_name: "Mike",   last_name: "Williams", status: "active",   role: "viewer", created_at: "2024-01-22 08:10", updated_at: "2024-03-10 09:15", last_login: "2024-03-10 09:15" },
  { id: 4,  username: "alex_eng",    email: "alex@startup.co",   first_name: "Alex",   last_name: "Brown",    status: "inactive", role: "editor", created_at: "2024-03-10 15:30", updated_at: "2024-03-10 15:30", last_login: null },
  { id: 5,  username: "lisa_qa",     email: "lisa@testing.org",  first_name: "Lisa",   last_name: "Davis",    status: "active",   role: "viewer", created_at: "2024-02-28 12:00", updated_at: "2024-03-09 18:45", last_login: "2024-03-09 18:45" },
  { id: 6,  username: "dave_admin",  email: "dave@admin.io",     first_name: "Dave",   last_name: "Chen",     status: "active",   role: "admin",  created_at: "2024-01-05 14:20", updated_at: "2024-03-12 10:00", last_login: "2024-03-12 10:00" },
  { id: 7,  username: "emma_pm",     email: "emma@project.com",  first_name: "Emma",   last_name: "Wilson",   status: "active",   role: "editor", created_at: "2024-04-01 09:00", updated_at: "2024-03-08 11:30", last_login: "2024-03-08 11:30" },
  { id: 8,  username: "tom_data",    email: "tom@analytics.co",  first_name: "Tom",    last_name: "Anderson", status: "active",   role: "viewer", created_at: "2024-03-15 16:45", updated_at: "2024-03-07 14:20", last_login: "2024-03-07 14:20" },
  { id: 9,  username: "nina_fe",     email: "nina@frontend.dev", first_name: "Nina",   last_name: "Garcia",   status: "active",   role: "editor", created_at: "2024-02-14 10:30", updated_at: "2024-03-06 09:10", last_login: "2024-03-06 09:10" },
  { id: 10, username: "jake_be",     email: "jake@backend.io",   first_name: "Jake",   last_name: "Martinez", status: "pending",  role: "viewer", created_at: "2024-03-01 14:00", updated_at: "2024-03-01 14:00", last_login: null },
  { id: 11, username: "sophia_ux",   email: "sophia@design.co",  first_name: "Sophia", last_name: "Lee",      status: "active",   role: "editor", created_at: "2024-01-30 08:00", updated_at: "2024-03-05 12:45", last_login: "2024-03-05 12:45" },
  { id: 12, username: "ryan_devops", email: "ryan@infra.net",    first_name: "Ryan",   last_name: "Taylor",   status: "active",   role: "admin",  created_at: "2024-01-10 11:15", updated_at: "2024-03-04 16:30", last_login: "2024-03-04 16:30" },
  { id: 13, username: "olivia_ml",   email: "olivia@ml.ai",      first_name: "Olivia", last_name: "Thomas",   status: "active",   role: "viewer", created_at: "2024-02-20 13:00", updated_at: "2024-03-03 10:20", last_login: "2024-03-03 10:20" },
  { id: 14, username: "ethan_sec",   email: "ethan@security.io", first_name: "Ethan",  last_name: "Jackson",  status: "inactive", role: "admin",  created_at: "2024-01-08 09:30", updated_at: "2024-02-15 08:00", last_login: null },
  { id: 15, username: "mia_cloud",   email: "mia@cloud.dev",     first_name: "Mia",    last_name: "White",    status: "active",   role: "editor", created_at: "2024-03-05 10:00", updated_at: "2024-03-12 15:00", last_login: "2024-03-12 15:00" },
  { id: 16, username: "noah_api",    email: "noah@api.dev",       first_name: "Noah",   last_name: "Harris",   status: "active",   role: "viewer", created_at: "2024-02-10 07:30", updated_at: "2024-03-02 11:45", last_login: "2024-03-02 11:45" },
];

export const QUERY_RESULTS = [
  { id: 1, username: "john_smith", email: "john@example.com",  total_orders: 156, lifetime_value: "$24,892.50", created_at: "2024-01-15", status: "active" },
  { id: 2, username: "sarah_dev",  email: "sarah@company.io",  total_orders: 89,  lifetime_value: "$18,456.00", created_at: "2024-02-03", status: "active" },
  { id: 3, username: "mike_ops",   email: "mike@devops.net",   total_orders: 67,  lifetime_value: "$12,340.75", created_at: "2024-01-22", status: "active" },
  { id: 4, username: "alex_eng",   email: "alex@startup.co",   total_orders: 45,  lifetime_value: "$8,920.30",  created_at: "2024-03-10", status: "active" },
  { id: 5, username: "lisa_qa",    email: "lisa@testing.org",   total_orders: 34,  lifetime_value: "$6,780.00",  created_at: "2024-02-28", status: "active" },
  { id: 6, username: "dave_admin", email: "dave@admin.io",      total_orders: 28,  lifetime_value: "$5,100.50",  created_at: "2024-01-05", status: "active" },
  { id: 7, username: "emma_pm",    email: "emma@project.com",   total_orders: 22,  lifetime_value: "$4,250.00",  created_at: "2024-04-01", status: "active" },
  { id: 8, username: "tom_data",   email: "tom@analytics.co",   total_orders: 19,  lifetime_value: "$3,890.25",  created_at: "2024-03-15", status: "active" },
];

export const ACTIVE_QUERIES = [
  { pid: 4521, user: "root",       db: "ecommerce", query: "SELECT u.*, COUNT(o.id) FROM users u LEFT JOIN...",         duration: "0.023s", state: "executing", durationColor: T.green },
  { pid: 4523, user: "app_user",   db: "analytics", query: "INSERT INTO daily_stats SELECT DATE(created_at)...",        duration: "1.2s",   state: "executing", durationColor: T.green },
  { pid: 4525, user: "report_svc", db: "warehouse", query: "SELECT p.name, SUM(oi.quantity) FROM products p...",        duration: "4.7s",   state: "sending",   durationColor: T.amber },
  { pid: 4527, user: "cron_job",   db: "ecommerce", query: "DELETE FROM sessions WHERE expired_at < NOW()...",          duration: "12.3s",  state: "executing", durationColor: T.red },
  { pid: 4529, user: "app_user",   db: "ecommerce", query: "UPDATE products SET stock_quantity = stock_quantity...",     duration: "0.001s", state: "executing", durationColor: T.green },
  { pid: 4531, user: "analytics",  db: "warehouse", query: "SELECT DATE(created_at), COUNT(*) FROM orders...",          duration: "2.1s",   state: "executing", durationColor: T.green },
];

export const ER_TABLES = [
  {
    name: "users", x: 80, y: 140, w: 240, h: 230, accent: T.teal, rowCount: "1,247", selected: true,
    columns: [
      { name: "id", type: "INT", pk: true },
      { name: "username", type: "VARCHAR(50)" },
      { name: "email", type: "VARCHAR(255)" },
      { name: "first_name", type: "VARCHAR(100)" },
      { name: "last_name", type: "VARCHAR(100)" },
      { name: "status", type: "ENUM" },
      { name: "role", type: "VARCHAR(20)" },
      { name: "created_at", type: "DATETIME" },
    ],
  },
  {
    name: "orders", x: 480, y: 110, w: 240, h: 212, accent: T.blue, rowCount: "8,432",
    columns: [
      { name: "id", type: "INT", pk: true },
      { name: "user_id", type: "INT", fk: true },
      { name: "total_amount", type: "DECIMAL" },
      { name: "status", type: "ENUM" },
      { name: "shipping_addr_id", type: "INT", fk: true },
      { name: "created_at", type: "DATETIME" },
      { name: "updated_at", type: "DATETIME" },
    ],
  },
  {
    name: "order_items", x: 880, y: 100, w: 260, h: 194, accent: T.green, rowCount: "24,891",
    columns: [
      { name: "id", type: "INT", pk: true },
      { name: "order_id", type: "INT", fk: true },
      { name: "product_id", type: "INT", fk: true },
      { name: "quantity", type: "INT" },
      { name: "unit_price", type: "DECIMAL" },
      { name: "subtotal", type: "DECIMAL" },
    ],
  },
  {
    name: "products", x: 880, y: 420, w: 240, h: 212, accent: T.amber, rowCount: "3,456",
    columns: [
      { name: "id", type: "INT", pk: true },
      { name: "name", type: "VARCHAR(200)" },
      { name: "sku", type: "VARCHAR(50)" },
      { name: "price", type: "DECIMAL" },
      { name: "category_id", type: "INT", fk: true },
      { name: "stock_quantity", type: "INT" },
      { name: "created_at", type: "DATETIME" },
    ],
  },
  {
    name: "categories", x: 1280, y: 420, w: 220, h: 176, accent: T.purple, rowCount: "48",
    columns: [
      { name: "id", type: "INT", pk: true },
      { name: "name", type: "VARCHAR(100)" },
      { name: "parent_id", type: "INT", fk: true },
      { name: "slug", type: "VARCHAR(100)" },
      { name: "sort_order", type: "INT" },
    ],
  },
  {
    name: "payments", x: 480, y: 460, w: 240, h: 212, accent: T.red, rowCount: "7,891",
    columns: [
      { name: "id", type: "INT", pk: true },
      { name: "order_id", type: "INT", fk: true },
      { name: "amount", type: "DECIMAL" },
      { name: "method", type: "ENUM" },
      { name: "status", type: "ENUM" },
      { name: "transaction_id", type: "VARCHAR(100)" },
      { name: "paid_at", type: "DATETIME" },
    ],
  },
];

export const ER_RELATIONSHIPS = [
  { from: "users",      fromField: "id",  to: "orders",      toField: "user_id",         label: "1 : N" },
  { from: "orders",     fromField: "id",  to: "order_items",  toField: "order_id",        label: "1 : N" },
  { from: "products",   fromField: "id",  to: "order_items",  toField: "product_id",      label: "1 : N" },
  { from: "orders",     fromField: "id",  to: "payments",     toField: "order_id",        label: "1 : N" },
  { from: "categories", fromField: "id",  to: "products",     toField: "category_id",     label: "1 : N" },
  { from: "categories", fromField: "id",  to: "categories",   toField: "parent_id",       label: "self" },
];

export const DEMO_SQL = `SELECT
  u.id,
  u.username,
  u.email,
  COUNT(o.id) AS total_orders,
  SUM(o.total_amount) AS lifetime_value
FROM users u
LEFT JOIN orders o ON u.id = o.user_id
WHERE u.created_at >= '2024-01-01'
  AND u.status = 'active'
GROUP BY u.id, u.username, u.email
HAVING COUNT(o.id) > 0
ORDER BY lifetime_value DESC
LIMIT 50;`;

export const BAD_SQL = `SELECT *
FROM orders o
WHERE o.status = 'completed'
  AND o.total_amount > 100
  AND (
    SELECT COUNT(*)
    FROM order_items oi
    WHERE oi.order_id = o.id
  ) > 3
ORDER BY o.created_at DESC
-- no LIMIT clause!`;

export const OPTIMIZED_SQL = `-- Optimized: replaced SELECT * with specific cols
SELECT
  o.id, o.total_amount, o.status, o.created_at,
  COUNT(oi.id) AS item_count
FROM orders o
INNER JOIN order_items oi ON oi.order_id = o.id
WHERE o.status = 'completed'
  AND o.total_amount > 100
GROUP BY o.id, o.total_amount, o.status, o.created_at
HAVING COUNT(oi.id) > 3
ORDER BY o.created_at DESC
LIMIT 100;

-- Recommended index:
-- CREATE INDEX idx_orders_status_amount
--   ON orders(status, total_amount);`;

export const AI_ISSUES = [
  { severity: "critical", title: "Full Table Scan",           desc: "SELECT * on orders (8,432 rows) causes full scan. No index on status.", detail: "EXPLAIN → type: ALL, rows: 8432" },
  { severity: "critical", title: "N+1 Correlated Subquery",   desc: "Subquery in WHERE executes per-row. Replace with JOIN for ~94% improvement.", detail: "Impact: 8,432 subquery executions" },
  { severity: "warning",  title: "Missing LIMIT Clause",      desc: "Returns all rows. Add LIMIT for pagination.",                                 detail: "Potential rows returned: 8,432" },
  { severity: "warning",  title: "Unnecessary Columns",       desc: "SELECT * fetches 12 cols, only 4 used.",                                      detail: "Wasted bandwidth: ~68% per row" },
  { severity: "info",     title: "Index Suggestion",          desc: "Add index on orders(status, total_amount)",                                   detail: "Est. improvement: ~94% faster" },
];

export const EXECUTION_PLAN = [
  { table: "orders",      type: "ALL", typeColor: T.red,   rows: "8,432", key: null,       extra: "Using where; filesort" },
  { table: "order_items", type: "ref", typeColor: T.amber, rows: "~6",    key: "order_id", extra: "Using where" },
];

export const SERVER_INFO = [
  { label: "Server",           value: "MySQL 8.0.35" },
  { label: "Uptime",           value: "47d 12h 33m" },
  { label: "Threads",          value: "24 / 151" },
  { label: "Buffer Pool",      value: "2.4 GB / 4 GB", progress: 60, progressColor: T.green },
  { label: "Slow Queries",     value: "142", valueColor: T.amber },
  { label: "Table Cache",      value: "89%", progress: 89, progressColor: T.green },
  { label: "Open Files",       value: "1,247 / 65,535" },
  { label: "Connections Used", value: "24%", progress: 24, progressColor: T.teal },
];

export const QUERY_TYPE_STATS = [
  { type: "SELECT", pct: 52, count: 4368, color: T.blue },
  { type: "INSERT", pct: 22, count: 1848, color: T.green },
  { type: "UPDATE", pct: 15, count: 1260, color: T.amber },
  { type: "DELETE", pct: 5,  count: 420,  color: T.red },
  { type: "Other",  pct: 6,  count: 504,  color: T.purple },
];

// ── History Screen Mock Data ─────────────────────────────────────────────────

export const HISTORY_SUMMARY = {
  totalAnalyses: 47,
  totalThisWeek: 8,
  optimizationsApplied: 31,
  applyRate: "66%",
  indexesCreated: 12,
  indexTables: 4,
  avgImprovement: "78%",
};

export const HISTORY_ENTRIES = [
  {
    id: "h1",
    status: "applied",
    score: 34,
    title: "Full table scan on orders with N+1 subquery",
    sql: "SELECT * FROM orders o WHERE o.status = 'completed' AND ...",
    aiSummary: "Replaced subquery with JOIN, added index — saved 2.3s per exec",
    connectionId: "c1",
    connectionName: "prod-main-db",
    connectionColor: T.blue,
    dbType: "MySQL 8.0",
    database: "ecommerce_prod",
    issues: { critical: 2, warning: 2, info: 1 },
    improvement: 94,
    timeBefore: "2.4s",
    timeAfter: "0.08s",
    date: "Today",
    time: "14:32",
  },
  {
    id: "h2",
    status: "applied",
    score: 52,
    title: "Missing index on users.created_at join",
    sql: "SELECT u.id, u.username, COUNT(o.id) FROM users u LEFT JOIN ...",
    aiSummary: "Added composite index, restructured GROUP BY",
    connectionId: "c1",
    connectionName: "prod-main-db",
    connectionColor: T.blue,
    dbType: "MySQL 8.0",
    database: "ecommerce_prod",
    issues: { critical: 1, warning: 1, info: 2 },
    improvement: 82,
    timeBefore: "1.8s",
    timeAfter: "0.32s",
    date: "Today",
    time: "11:07",
  },
  {
    id: "h3",
    status: "optimized",
    score: 71,
    title: "Redundant subselect in product catalog query",
    sql: "SELECT p.*, (SELECT name FROM categories WHERE id = p.cat_id) ...",
    aiSummary: "Converted subselect to LEFT JOIN, suggested covering index",
    connectionId: "c1",
    connectionName: "prod-main-db",
    connectionColor: T.blue,
    dbType: "MySQL 8.0",
    database: "ecommerce_prod",
    issues: { critical: 0, warning: 1, info: 1 },
    improvement: 67,
    timeBefore: "0.45s",
    timeAfter: "0.15s",
    date: "Yesterday",
    time: "16:45",
  },
  {
    id: "h4",
    status: "indexed",
    score: 45,
    title: "Slow payment lookup by transaction_id",
    sql: "SELECT * FROM payments WHERE transaction_id = ? ORDER BY paid_at",
    aiSummary: "Created idx_payments_txn_id — query now uses index range scan",
    connectionId: "c1",
    connectionName: "prod-main-db",
    connectionColor: T.blue,
    dbType: "MySQL 8.0",
    database: "ecommerce_prod",
    issues: { critical: 1, warning: 0, info: 1 },
    improvement: 91,
    timeBefore: "3.1s",
    timeAfter: "0.28s",
    date: "Yesterday",
    time: "10:22",
  },
  {
    id: "h5",
    status: "dismissed",
    score: 80,
    title: "Minor: analytics aggregation could use materialized view",
    sql: "SELECT DATE(created_at), COUNT(*), SUM(total_amount) FROM orders ...",
    aiSummary: "Suggested materialized view — dismissed (acceptable perf)",
    connectionId: "c2",
    connectionName: "analytics-pg",
    connectionColor: T.green,
    dbType: "PostgreSQL 16",
    database: "warehouse",
    issues: { critical: 0, warning: 0, info: 1 },
    improvement: 23,
    timeBefore: "0.9s",
    timeAfter: "0.7s",
    date: "Mar 10",
    time: "09:15",
  },
  {
    id: "h6",
    status: "applied",
    score: 25,
    title: "Cartesian product in multi-table report join",
    sql: "SELECT * FROM products, categories, order_items WHERE ...",
    aiSummary: "Converted implicit joins to explicit, added missing ON clauses",
    connectionId: "c1",
    connectionName: "prod-main-db",
    connectionColor: T.blue,
    dbType: "MySQL 8.0",
    database: "ecommerce_prod",
    issues: { critical: 3, warning: 1, info: 0 },
    improvement: 97,
    timeBefore: "18.4s",
    timeAfter: "0.52s",
    date: "Mar 9",
    time: "15:38",
  },
  {
    id: "h7",
    status: "applied",
    score: 55,
    title: "Unoptimized user activity aggregation",
    sql: "SELECT u.email, (SELECT MAX(login_at) FROM sessions s WHERE ...) ...",
    aiSummary: "Replaced correlated subqueries with window functions",
    connectionId: "c2",
    connectionName: "analytics-pg",
    connectionColor: T.green,
    dbType: "PostgreSQL 16",
    database: "warehouse",
    issues: { critical: 2, warning: 1, info: 0 },
    improvement: 76,
    timeBefore: "4.2s",
    timeAfter: "1.0s",
    date: "Mar 8",
    time: "13:10",
  },
  {
    id: "h8",
    status: "optimized",
    score: 50,
    title: "Unindexed collection scan on app_logs",
    sql: 'db.app_logs.find({ level: "error", timestamp: { $gte: ... } })',
    aiSummary: "Suggested compound index on { level: 1, timestamp: -1 }",
    connectionId: "c4",
    connectionName: "logs-mongo",
    connectionColor: T.amber,
    dbType: "MongoDB 7.0",
    database: "app_logs",
    issues: { critical: 1, warning: 0, info: 1 },
    improvement: 85,
    timeBefore: "6.8s",
    timeAfter: "1.0s",
    date: "Mar 7",
    time: "09:44",
  },
];
