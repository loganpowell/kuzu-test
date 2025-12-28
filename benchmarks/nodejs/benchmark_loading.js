const kuzu = require("kuzu");
const fs = require("fs");
const path = require("path");

/**
 * Monitor memory usage during operations
 */
class MemoryMonitor {
  constructor() {
    this.baseline = null;
  }

  start() {
    this.baseline = process.memoryUsage().heapUsed;
  }

  getCurrentMB() {
    return process.memoryUsage().heapUsed / (1024 * 1024);
  }

  getDeltaMB() {
    if (this.baseline === null) return 0;
    const current = process.memoryUsage().heapUsed;
    return (current - this.baseline) / (1024 * 1024);
  }
}

/**
 * Calculate directory size recursively
 */
function getDirectorySize(dirPath) {
  let totalSize = 0;

  if (!fs.existsSync(dirPath)) return 0;

  const files = fs.readdirSync(dirPath, { withFileTypes: true });

  for (const file of files) {
    const filePath = path.join(dirPath, file.name);

    if (file.isDirectory()) {
      totalSize += getDirectorySize(filePath);
    } else {
      totalSize += fs.statSync(filePath).size;
    }
  }

  return totalSize;
}

/**
 * Format bytes to human-readable string
 */
function formatSize(bytes) {
  const units = ["B", "KB", "MB", "GB"];
  let size = bytes;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }

  return `${size.toFixed(2)} ${units[unitIndex]}`;
}

/**
 * Loading benchmark class
 */
class LoadingBenchmark {
  constructor(baseDir) {
    this.baseDir = baseDir;
    this.dataDir = path.join(baseDir, "data");
    this.dbBase = path.join(baseDir, "db");
    this.resultsDir = path.join(baseDir, "results");
    this.results = [];

    // Ensure results directory exists
    if (!fs.existsSync(this.resultsDir)) {
      fs.mkdirSync(this.resultsDir, { recursive: true });
    }
  }

  async createFreshDB(dbName) {
    const dbPath = path.join(this.dbBase, dbName);

    // Remove if exists
    if (fs.existsSync(dbPath)) {
      fs.rmSync(dbPath, { recursive: true, force: true });
    }

    // Create database and schema
    const db = new kuzu.Database(dbPath);
    const conn = new kuzu.Connection(db);

    // Create schema
    await conn.query(`
            CREATE NODE TABLE User(
                id STRING, name STRING, email STRING,
                created_at TIMESTAMP, metadata STRING,
                PRIMARY KEY (id)
            )
        `);

    await conn.query(`
            CREATE NODE TABLE Resource(
                id STRING, type STRING, name STRING,
                owner_id STRING, created_at TIMESTAMP, metadata STRING,
                PRIMARY KEY (id)
            )
        `);

    await conn.query(`
            CREATE NODE TABLE UserGroup(
                id STRING, name STRING, description STRING,
                created_at TIMESTAMP, metadata STRING,
                PRIMARY KEY (id)
            )
        `);

    await conn.query(`
            CREATE REL TABLE MEMBER_OF(
                FROM User TO UserGroup,
                joined_at TIMESTAMP, role STRING
            )
        `);

    await conn.query(`
            CREATE REL TABLE HAS_PERMISSION_USER(
                FROM User TO Resource,
                can_create BOOLEAN, can_read BOOLEAN,
                can_update BOOLEAN, can_delete BOOLEAN,
                granted_at TIMESTAMP, granted_by STRING
            )
        `);

    await conn.query(`
            CREATE REL TABLE HAS_PERMISSION_GROUP(
                FROM UserGroup TO Resource,
                can_create BOOLEAN, can_read BOOLEAN,
                can_update BOOLEAN, can_delete BOOLEAN,
                granted_at TIMESTAMP, granted_by STRING
            )
        `);

    await conn.query(`
            CREATE REL TABLE INHERITS_FROM(
                FROM UserGroup TO UserGroup,
                created_at TIMESTAMP
            )
        `);

    return { db, conn, dbPath };
  }

  async benchmarkLoad(formatType, method) {
    console.log("\n" + "=".repeat(60));
    console.log(
      `Benchmarking: ${formatType.toUpperCase()} with ${method.toUpperCase()}`
    );
    console.log("=".repeat(60));

    const dbName = `bench_${formatType}_${method}_nodejs`;
    const memMonitor = new MemoryMonitor();
    memMonitor.start();

    // Create fresh database
    console.log("Creating fresh database with schema...");
    const startTime = Date.now();
    const { db, conn, dbPath } = await this.createFreshDB(dbName);
    const schemaTime = (Date.now() - startTime) / 1000;
    console.log(`  ✓ Schema created in ${schemaTime.toFixed(3)}s`);

    // Data directory
    const dataPath = path.join(this.dataDir, formatType);
    const extension = formatType === "parquet" ? "parquet" : formatType;

    const tables = [
      ["User", "users"],
      ["Resource", "resources"],
      ["UserGroup", "groups"],
      ["MEMBER_OF", "member_of"],
      ["HAS_PERMISSION_USER", "user_permissions"],
      ["HAS_PERMISSION_GROUP", "group_permissions"],
      ["INHERITS_FROM", "inherits_from"],
    ];

    // Load data
    console.log(`\nLoading data using ${method.toUpperCase()}...`);
    const loadTimes = {};
    const totalLoadStart = Date.now();

    for (const [tableName, fileName] of tables) {
      const filePath = path.join(dataPath, `${fileName}.${extension}`);

      if (!fs.existsSync(filePath)) {
        console.log(`  ⚠️  Skipping ${tableName}: file not found`);
        continue;
      }

      const start = Date.now();

      try {
        await conn.query(`COPY ${tableName} FROM "${filePath}"`);
        const elapsed = (Date.now() - start) / 1000;
        loadTimes[tableName] = elapsed;
        console.log(`  ✓ ${tableName}: ${elapsed.toFixed(3)}s`);
      } catch (err) {
        console.log(`  ❌ ${tableName}: ${err.message}`);
      }
    }

    const totalLoadTime = (Date.now() - totalLoadStart) / 1000;

    // Get database size
    const dbSize = getDirectorySize(dbPath);

    // Get memory usage
    const memoryUsed = memMonitor.getDeltaMB();

    // Count actual records from CSV files (safer than database queries in Node.js kuzu@0.8.2)
    console.log("\nCalculating record counts from CSV files...");
    const counts = {};
    let totalRecords = 0;

    for (const [tableName, fileName] of tables) {
      const filePath = path.join(dataPath, `${fileName}.${extension}`);
      if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, "utf8");
        // Count lines minus header
        const lineCount =
          content.split("\n").filter((line) => line.trim()).length - 1;
        counts[tableName] = lineCount;
        totalRecords += lineCount;
      } else {
        counts[tableName] = 0;
      }
    }

    console.log(
      `  ✓ Total records (from CSV): ${totalRecords.toLocaleString()}`
    );

    // Compile results
    const result = {
      platform: "Node.js",
      format: formatType,
      method: method,
      schema_time_sec: schemaTime,
      total_load_time_sec: totalLoadTime,
      table_load_times_sec: loadTimes,
      db_size_bytes: dbSize,
      db_size_formatted: formatSize(dbSize),
      memory_used_mb: memoryUsed,
      record_counts: counts,
      total_records: totalRecords,
      records_per_second: totalLoadTime > 0 ? totalRecords / totalLoadTime : 0,
    };

    this.results.push(result);

    // Print summary
    console.log("\n" + "=".repeat(60));
    console.log("Summary");
    console.log("=".repeat(60));
    console.log(`Total load time: ${totalLoadTime.toFixed(3)}s`);
    console.log(`Database size: ${formatSize(dbSize)}`);
    console.log(`Memory used: ${memoryUsed.toFixed(2)} MB`);
    console.log(`Records loaded: ${totalRecords.toLocaleString()}`);
    console.log(
      `Throughput: ${result.records_per_second.toFixed(0)} records/sec`
    );

    // Cleanup
    conn.close();
    db.close();

    return result;
  }

  async runAllBenchmarks() {
    console.log("\n" + "=".repeat(60));
    console.log("KuzuDB Loading Benchmark Suite (Node.js)");
    console.log("=".repeat(60));

    const formats = ["csv"]; // Parquet crashes with bus error in Node.js kuzu@0.8.2
    const methods = ["copy"];

    console.log(`\nFormats: ${formats.map((f) => f.toUpperCase()).join(", ")}`);
    console.log(`Methods: ${methods.map((m) => m.toUpperCase()).join(", ")}`);
    console.log(
      `\nNote: Parquet SKIPPED - crashes with bus error in Node.js kuzu@0.8.2`
    );

    for (const formatType of formats) {
      for (const method of methods) {
        try {
          await this.benchmarkLoad(formatType, method);
        } catch (err) {
          console.error(
            `\n❌ Error benchmarking ${formatType}/${method}:`,
            err.message
          );
        }
      }
    }

    this.saveResults();
    this.printComparison();
  }

  saveResults() {
    const outputFile = path.join(
      this.resultsDir,
      "nodejs_loading_benchmark_results.json"
    );
    fs.writeFileSync(outputFile, JSON.stringify(this.results, null, 2));
    console.log(`\n📊 Results saved to: ${outputFile}`);
  }

  printComparison() {
    if (this.results.length === 0) return;

    console.log("\n" + "=".repeat(60));
    console.log("Comparison");
    console.log("=".repeat(60));
    console.log(
      "\nFormat     Method   Load Time    DB Size      Memory     Records/s"
    );
    console.log("-".repeat(70));

    for (const result of this.results) {
      console.log(
        `${result.format.padEnd(10)} ` +
          `${result.method.padEnd(8)} ` +
          `${result.total_load_time_sec.toFixed(3).padEnd(12)} ` +
          `${result.db_size_formatted.padEnd(12)} ` +
          `${result.memory_used_mb.toFixed(2).padEnd(10)} ` +
          `${result.records_per_second.toFixed(0)}`
      );
    }
  }
}

async function main() {
  const baseDir = path.join(__dirname, "..", "..");
  const benchmark = new LoadingBenchmark(baseDir);
  await benchmark.runAllBenchmarks();
}

if (require.main === module) {
  main().catch((err) => {
    console.error("Error:", err);
    process.exit(1);
  });
}

module.exports = { LoadingBenchmark };
