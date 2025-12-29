// KuzuDB WASM Authorization Benchmarks
// This script tests KuzuDB WASM performance for authorization workloads

let db = null;
let conn = null;
let kuzuModule = null; // Cache the WASM module
let benchmarkResults = {
  bundleSize: {},
  loading: {},
  queries: [],
  memory: {},
};

// UI Elements
const statusDiv = document.getElementById("status");
const btnLoadData = document.getElementById("btnLoadData");
const btnRunQueries = document.getElementById("btnRunQueries");
const btnClearDB = document.getElementById("btnClearDB");
const btnExportResults = document.getElementById("btnExportResults");

// Results containers
const bundleSizeDiv = document.getElementById("bundleSize");
const loadingResultsDiv = document.getElementById("loadingResults");
const queryResultsDiv = document.getElementById("queryResults");
const memoryResultsDiv = document.getElementById("memoryResults");
const loadProgressBar = document.getElementById("loadProgress");

// Update status message
function updateStatus(message, type = "loading") {
  statusDiv.textContent = message;
  statusDiv.className = `status ${type}`;
}

// Format bytes to human-readable
function formatBytes(bytes) {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

// Format milliseconds
function formatMs(ms) {
  return ms.toFixed(2) + "ms";
}

// Measure bundle size
async function measureBundleSize() {
  try {
    // Note: Bundle size measurement from CDN blocked by COEP policy
    // Using approximate values from package documentation
    const wasmSize = 8 * 1024 * 1024; // ~8MB (approximate)
    const jsSize = 500 * 1024; // ~500KB (approximate)
    const totalSize = wasmSize + jsSize;

    benchmarkResults.bundleSize = {
      wasm: wasmSize,
      js: jsSize,
      total: totalSize,
      wasmFormatted: formatBytes(wasmSize),
      jsFormatted: formatBytes(jsSize),
      totalFormatted: formatBytes(totalSize),
      note: "Approximate values (CDN blocked by COEP)",
    };

    bundleSizeDiv.innerHTML = `
<div class="metric">
    <span class="metric-label">WASM Binary:</span>
    <span class="metric-value">~${formatBytes(wasmSize)}</span>
</div>
<div class="metric">
    <span class="metric-label">JavaScript:</span>
    <span class="metric-value">~${formatBytes(jsSize)}</span>
</div>
<div class="metric">
    <span class="metric-label">Total Bundle:</span>
    <span class="metric-value">~${formatBytes(totalSize)}</span>
</div>
<div style="margin-top: 10px; font-size: 0.9em; color: #666;">
    ℹ️ Approximate values (actual measurement blocked by COEP policy)
</div>
        `;
  } catch (error) {
    bundleSizeDiv.innerHTML = `⚠️ Bundle size estimation unavailable`;
  }
}

// Initialize KuzuDB WASM
async function initKuzuDB() {
  try {
    // Only load the module once - cache it
    if (!kuzuModule) {
      updateStatus("Loading KuzuDB WASM module...", "loading");
      console.log("[KuzuDB] Loading WASM module for the first time...");

      // Dynamic import of KuzuDB WASM (correct package name)
      const kuzu_wasm = await import(
        "https://cdn.jsdelivr.net/npm/@kuzu/kuzu-wasm@latest/dist/kuzu-browser.js"
      );

      // Initialize the WASM module - do this only once
      kuzuModule = await kuzu_wasm.default();
      window.kuzu = kuzuModule;
      console.log("[KuzuDB] WASM module loaded and cached");
    } else {
      console.log("[KuzuDB] Reusing cached WASM module");
    }

    updateStatus("Creating in-memory database...", "loading");

    // Close existing connections if any
    if (conn) {
      try {
        await conn.close();
      } catch (e) {
        // Ignore close errors
      }
    }
    if (db) {
      try {
        await db.close();
      } catch (e) {
        // Ignore close errors
      }
    }

    // Create new database and connection
    db = await kuzuModule.Database();
    conn = await kuzuModule.Connection(db);

    updateStatus("✅ KuzuDB WASM initialized successfully!", "success");

    // Enable buttons
    btnLoadData.disabled = false;
    btnClearDB.disabled = false;

    // Measure bundle size (only on first load)
    if (!benchmarkResults.bundleSize.total) {
      await measureBundleSize();
    }

    // Start memory monitoring (only once)
    if (!window.memoryMonitoringStarted) {
      startMemoryMonitoring();
      window.memoryMonitoringStarted = true;
    }

    return true;
  } catch (error) {
    updateStatus(
      `❌ Failed to initialize KuzuDB WASM: ${error.message}`,
      "error"
    );
    console.error("Initialization error:", error);
    return false;
  }
}

// Create schema
async function createSchema() {
  updateStatus("Creating database schema...", "loading");

  const schemaStatements = [
    // Create node tables
    `CREATE NODE TABLE User(id INT64, name STRING, email STRING, PRIMARY KEY(id))`,
    `CREATE NODE TABLE Resource(id INT64, name STRING, type STRING, PRIMARY KEY(id))`,
    `CREATE NODE TABLE UserGroup(id INT64, name STRING, description STRING, PRIMARY KEY(id))`,

    // Create relationship tables
    `CREATE REL TABLE MEMBER_OF(FROM User TO UserGroup)`,
    `CREATE REL TABLE HAS_PERMISSION_USER(FROM User TO Resource, permission STRING)`,
    `CREATE REL TABLE HAS_PERMISSION_GROUP(FROM UserGroup TO Resource, permission STRING)`,
    `CREATE REL TABLE INHERITS_FROM(FROM UserGroup TO UserGroup)`,
  ];

  for (const stmt of schemaStatements) {
    await conn.execute(stmt);
  }
}

// Fetch CSV files and write them to WASM filesystem for COPY FROM
async function fetchAndWriteCSVFiles() {
  const baseUrl = "../../data/csv/";
  const files = [
    "users.csv",
    "resources.csv",
    "groups.csv",
    "user_permissions.csv",
    "group_permissions.csv",
    "member_of.csv",
    "inherits_from.csv",
  ];

  updateStatus("Fetching CSV files from server...", "loading");

  const counts = {};
  for (const file of files) {
    const response = await fetch(baseUrl + file);
    if (!response.ok) {
      throw new Error(`Failed to fetch ${file}: ${response.statusText}`);
    }
    const csvText = await response.text();

    // Count lines for reporting (excluding header)
    const lines = csvText.trim().split("\n");
    counts[file] = lines.length - 1; // Subtract header

    // Write to WASM filesystem
    await window.kuzu.FS.writeFile(`/${file}`, csvText);
  }

  return counts;
}

// Get current memory snapshot (synchronous, for benchmarking)
function getMemorySnapshot() {
  if (!performance.memory) {
    return null;
  }

  const jsHeapUsed = performance.memory.usedJSHeapSize;
  let wasmMemory = 0;

  try {
    if (window.kuzu && window.kuzu.HEAP8) {
      wasmMemory = window.kuzu.HEAP8.length;
    } else if (window.kuzu && window.kuzu.buffer) {
      wasmMemory = window.kuzu.buffer.byteLength;
    }
  } catch (e) {
    // WASM memory not accessible
  }

  return {
    bytes: jsHeapUsed + wasmMemory,
    jsHeapUsed,
    wasmMemory,
    method: "performance.memory",
  };
}

// Get accurate memory measurement (async, waits for GC - use after benchmarks)
async function getAccurateMemory() {
  // Try performance.measureUserAgentSpecificMemory() (more accurate)
  // See: https://web.dev/articles/monitor-total-page-memory-usage
  if (
    window.crossOriginIsolated &&
    performance.measureUserAgentSpecificMemory
  ) {
    try {
      const result = await performance.measureUserAgentSpecificMemory();
      return {
        bytes: result.bytes,
        method: "measureUserAgentSpecificMemory",
        breakdown: result.breakdown,
      };
    } catch (error) {
      console.warn("measureUserAgentSpecificMemory failed:", error);
    }
  }

  // Fallback to synchronous snapshot
  return getMemorySnapshot();
}

// Load data into database using COPY FROM
async function loadData() {
  try {
    btnLoadData.disabled = true;
    updateStatus("Fetching CSV files from server...", "loading");

    // Force garbage collection if available (helps get clean baseline)
    if (window.gc) {
      window.gc();
    }

    // Take baseline memory snapshot BEFORE loading (synchronous, no blocking)
    const memoryBefore = getMemorySnapshot();

    const startTime = performance.now();

    // Create schema
    await createSchema();

    // Fetch CSV files and write them to WASM filesystem
    const counts = await fetchAndWriteCSVFiles();
    loadingResultsDiv.innerHTML = `Loaded from CSV:\n- ${counts["users.csv"]} users\n- ${counts["resources.csv"]} resources\n- ${counts["groups.csv"]} groups\n- ${counts["user_permissions.csv"]} user permissions\n- ${counts["group_permissions.csv"]} group permissions\n- ${counts["member_of.csv"]} memberships\n- ${counts["inherits_from.csv"]} inheritances`;

    // Use COPY FROM to bulk load data (much faster than row-by-row inserts)
    updateStatus("Loading users...", "loading");
    loadProgressBar.style.width = "14%";
    await conn.execute("COPY User FROM '/users.csv' (HEADER=true)");

    updateStatus("Loading resources...", "loading");
    loadProgressBar.style.width = "28%";
    await conn.execute("COPY Resource FROM '/resources.csv' (HEADER=true)");

    updateStatus("Loading groups...", "loading");
    loadProgressBar.style.width = "42%";
    await conn.execute("COPY UserGroup FROM '/groups.csv' (HEADER=true)");

    updateStatus("Loading memberships...", "loading");
    loadProgressBar.style.width = "56%";
    await conn.execute("COPY MEMBER_OF FROM '/member_of.csv' (HEADER=true)");

    updateStatus("Loading user permissions...", "loading");
    loadProgressBar.style.width = "70%";
    await conn.execute(
      "COPY HAS_PERMISSION_USER FROM '/user_permissions.csv' (HEADER=true)"
    );

    updateStatus("Loading group permissions...", "loading");
    loadProgressBar.style.width = "84%";
    await conn.execute(
      "COPY HAS_PERMISSION_GROUP FROM '/group_permissions.csv' (HEADER=true)"
    );

    updateStatus("Loading group inheritances...", "loading");
    loadProgressBar.style.width = "98%";
    await conn.execute(
      "COPY INHERITS_FROM FROM '/inherits_from.csv' (HEADER=true)"
    );

    loadProgressBar.style.width = "100%";
    const endTime = performance.now();
    const loadTime = endTime - startTime;

    // Take memory snapshot AFTER loading to measure delta (synchronous, no blocking)
    const memoryAfter = getMemorySnapshot();
    const memoryDelta =
      memoryAfter && memoryBefore
        ? memoryAfter.bytes - memoryBefore.bytes
        : null;

    const totalRecords =
      counts["users.csv"] +
      counts["resources.csv"] +
      counts["groups.csv"] +
      counts["user_permissions.csv"] +
      counts["group_permissions.csv"] +
      counts["member_of.csv"] +
      counts["inherits_from.csv"];

    benchmarkResults.loading = {
      loadTimeMs: loadTime,
      totalRecords,
      recordsPerSecond: (totalRecords / (loadTime / 1000)).toFixed(0),
      users: counts["users.csv"],
      resources: counts["resources.csv"],
      groups: counts["groups.csv"],
      userPermissions: counts["user_permissions.csv"],
      groupPermissions: counts["group_permissions.csv"],
      memberships: counts["member_of.csv"],
      inheritances: counts["inherits_from.csv"],
      memoryUsedMB: memoryDelta ? memoryDelta / (1024 * 1024) : null,
      memoryMethod: memoryAfter?.method || "unavailable",
    };

    let memoryInfo = "";
    if (memoryDelta !== null) {
      memoryInfo = `\nMemory Used: ${formatBytes(memoryDelta)} (${
        memoryAfter.method
      })`;
    }

    loadingResultsDiv.innerHTML = `
✅ Data loaded successfully!

Load Time: ${formatMs(loadTime)}
Total Records: ${totalRecords.toLocaleString()}
Throughput: ${
      benchmarkResults.loading.recordsPerSecond
    } records/sec${memoryInfo}

Breakdown:
- Users: ${counts["users.csv"]}
- Resources: ${counts["resources.csv"]}
- Groups: ${counts["groups.csv"]}
- User Permissions: ${counts["user_permissions.csv"]}
- Group Permissions: ${counts["group_permissions.csv"]}
- Memberships: ${counts["member_of.csv"]}
- Inheritances: ${counts["inherits_from.csv"]}
        `;

    updateStatus("✅ Data loaded successfully!", "success");
    btnRunQueries.disabled = false;
  } catch (error) {
    updateStatus(`❌ Error loading data: ${error.message}`, "error");
    loadingResultsDiv.innerHTML = `❌ Error: ${error.message}`;
    console.error("Load error:", error);
  } finally {
    btnLoadData.disabled = false;
  }
}

// Run query benchmarks
async function runQueryBenchmarks() {
  try {
    btnRunQueries.disabled = true;
    updateStatus("Running query benchmarks...", "loading");

    const queries = [
      {
        name: "Direct Permission Check",
        query: `MATCH (u:User)-[p:HAS_PERMISSION_USER]->(r:Resource)
                        WHERE u.id = 'user_1' AND r.id = 'resource_1' AND p.can_read = true
                        RETURN u.id AS user_id, r.id AS resource_id, p.can_read`,
      },
      {
        name: "Group-Based Permission",
        query: `MATCH (u:User)-[:MEMBER_OF]->(g:UserGroup)-[p:HAS_PERMISSION_GROUP]->(r:Resource)
                        WHERE u.id = 'user_1' AND r.id = 'resource_1' AND p.can_read = true
                        RETURN u.id AS user_id, r.id AS resource_id, p.can_read`,
      },
      {
        name: "User Groups",
        query: `MATCH (u:User)-[:MEMBER_OF]->(g:UserGroup)
                        WHERE u.id = 'user_1'
                        RETURN g.id, g.name`,
      },
      {
        name: "List Readable Resources",
        query: `MATCH (u:User)-[p:HAS_PERMISSION_USER]->(r:Resource)
                        WHERE u.id = 'user_1' AND p.can_read = true
                        RETURN r.id, r.name LIMIT 10`,
      },
      {
        name: "Count User Permissions",
        query: `MATCH (u:User)-[p:HAS_PERMISSION_USER]->(r:Resource)
                        WHERE u.id = 'user_1'
                        RETURN COUNT(*) AS count`,
      },
    ];

    const results = [];
    let resultHTML =
      "<table><tr><th>Query</th><th>Avg (ms)</th><th>Min (ms)</th><th>Max (ms)</th></tr>";

    for (const query of queries) {
      const iterations = 10;
      const times = [];

      // Warm-up
      await conn.execute(query.query);

      // Measure
      for (let i = 0; i < iterations; i++) {
        const start = performance.now();
        await conn.execute(query.query);
        const end = performance.now();
        times.push(end - start);
      }

      const avg = times.reduce((a, b) => a + b, 0) / times.length;
      const min = Math.min(...times);
      const max = Math.max(...times);

      results.push({
        name: query.name,
        avgMs: avg,
        minMs: min,
        maxMs: max,
      });

      resultHTML += `<tr><td>${query.name}</td><td>${formatMs(
        avg
      )}</td><td>${formatMs(min)}</td><td>${formatMs(max)}</td></tr>`;
    }

    resultHTML += "</table>";

    benchmarkResults.queries = results;
    queryResultsDiv.innerHTML = resultHTML;

    updateStatus("✅ Query benchmarks complete!", "success");
  } catch (error) {
    updateStatus(`❌ Error running queries: ${error.message}`, "error");
    queryResultsDiv.innerHTML = `❌ Error: ${error.message}`;
    console.error("Query error:", error);
  } finally {
    btnRunQueries.disabled = false;
  }
}

// Memory monitoring - measures both JS heap and WASM linear memory
// Note: Uses synchronous performance.memory for real-time monitoring.
// measureUserAgentSpecificMemory() would be more accurate but waits for GC.
function startMemoryMonitoring() {
  setInterval(() => {
    const snapshot = getMemorySnapshot();
    if (!snapshot) return;

    const jsHeapUsed = snapshot.jsHeapUsed;
    const wasmMemory = snapshot.wasmMemory;
    const jsHeapTotal = performance.memory?.totalJSHeapSize || 0;
    const jsHeapLimit = performance.memory?.jsHeapSizeLimit || 0;

    benchmarkResults.memory = {
      // Modern API measurement
      bytes: snapshot.bytes,
      method: snapshot.method,
      // Legacy values for backwards compatibility
      jsHeapUsed,
      wasmMemory,
      totalMemory: snapshot.bytes,
      jsHeapTotal,
      jsHeapLimit,
      jsHeapUsedFormatted: formatBytes(jsHeapUsed),
      wasmMemoryFormatted: formatBytes(wasmMemory),
      totalMemoryFormatted: formatBytes(snapshot.bytes),
      jsHeapTotalFormatted: formatBytes(jsHeapTotal),
      jsHeapLimitFormatted: formatBytes(jsHeapLimit),
      // For backwards compatibility with report
      used: snapshot.bytes,
      total: jsHeapTotal,
      limit: jsHeapLimit,
      usedFormatted: formatBytes(snapshot.bytes),
      totalFormatted: formatBytes(jsHeapTotal),
      limitFormatted: formatBytes(jsHeapLimit),
    };

    let memoryHTML = `
<div class="metric">
    <span class="metric-label">Total Memory:</span>
    <span class="metric-value">${formatBytes(snapshot.bytes)}</span>
</div>
<div class="metric">
    <span class="metric-label">Method:</span>
    <span class="metric-value">${snapshot.method}</span>
</div>`;

    if (snapshot.method === "performance.memory" && jsHeapUsed > 0) {
      memoryHTML += `
<div class="metric">
    <span class="metric-label">JS Heap Used:</span>
    <span class="metric-value">${formatBytes(jsHeapUsed)}</span>
</div>`;

      if (wasmMemory > 0) {
        memoryHTML += `
<div class="metric">
    <span class="metric-label">WASM Memory:</span>
    <span class="metric-value">${formatBytes(wasmMemory)}</span>
</div>`;
      }

      memoryHTML += `
<div class="metric">
    <span class="metric-label">JS Heap Total:</span>
    <span class="metric-value">${formatBytes(jsHeapTotal)}</span>
</div>`;
    }

    memoryResultsDiv.innerHTML = memoryHTML;
  }, 1000);
}

// Clear database
async function clearDatabase() {
  if (confirm("Are you sure you want to clear the database?")) {
    updateStatus("Clearing database...", "loading");
    // Re-initialize to clear
    await initKuzuDB();
    loadingResultsDiv.innerHTML = "Database cleared. Ready to load data.";
    queryResultsDiv.innerHTML = "Waiting to start...";
    btnRunQueries.disabled = true;
    updateStatus("✅ Database cleared", "success");
  }
}

// Export results - saves to server
async function exportResults() {
  try {
    updateStatus("Saving results to server...", "loading");

    const response = await fetch("/save-results", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(benchmarkResults, null, 2),
    });

    if (response.ok) {
      const result = await response.json();
      updateStatus(`✅ Results saved to server: ${result.file}`, "success");
      console.log(`Results saved: ${result.file}`);
    } else {
      throw new Error(`Server error: ${response.status}`);
    }
  } catch (error) {
    // Fallback to local download if server save fails
    console.warn("Server save failed, falling back to local download:", error);
    updateStatus("⚠️ Server save failed, downloading locally...", "loading");

    const resultsJson = JSON.stringify(benchmarkResults, null, 2);
    const blob = new Blob([resultsJson], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `kuzu-wasm-benchmark-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);

    setTimeout(() => {
      updateStatus(
        "✅ Results downloaded locally (server unavailable)",
        "success"
      );
    }, 1000);
  }
}

// Event listeners
btnLoadData.addEventListener("click", loadData);
btnRunQueries.addEventListener("click", runQueryBenchmarks);
btnClearDB.addEventListener("click", clearDatabase);
btnExportResults.addEventListener("click", exportResults);

// Initialize on page load
initKuzuDB();
