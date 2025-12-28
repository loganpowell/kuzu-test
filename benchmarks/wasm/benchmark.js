// KuzuDB WASM Authorization Benchmarks
// This script tests KuzuDB WASM performance for authorization workloads

let db = null;
let conn = null;
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
    updateStatus("Loading KuzuDB WASM module...", "loading");

    // Dynamic import of KuzuDB WASM (correct package name)
    const kuzu_wasm = await import(
      "https://unpkg.com/@kuzu/kuzu-wasm@latest/dist/kuzu-browser.js"
    );

    // Initialize the WASM module
    const kuzu = await kuzu_wasm.default();
    window.kuzu = kuzu;

    updateStatus("Creating in-memory database...", "loading");
    db = await kuzu.Database();
    conn = await kuzu.Connection(db);

    updateStatus("✅ KuzuDB WASM initialized successfully!", "success");

    // Enable buttons
    btnLoadData.disabled = false;
    btnClearDB.disabled = false;

    // Measure bundle size
    await measureBundleSize();

    // Start memory monitoring
    startMemoryMonitoring();

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

// Parse CSV data
function parseCSV(csvText) {
  const lines = csvText.trim().split("\n");
  const headers = lines[0].split(",").map((h) => h.trim());
  const data = [];

  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const values = lines[i].split(",").map((v) => v.trim());
    const row = {};
    headers.forEach((header, index) => {
      let value = values[index];
      // Convert boolean strings
      if (value === "true") value = true;
      else if (value === "false") value = false;
      // Keep as string otherwise
      row[header] = value;
    });
    data.push(row);
  }
  return data;
}

// Fetch CSV data from server (uses same data as Python/Node.js)
async function fetchCSVData() {
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

  updateStatus("Fetching CSV data from server...", "loading");

  const results = {};
  for (const file of files) {
    const response = await fetch(baseUrl + file);
    if (!response.ok) {
      throw new Error(`Failed to fetch ${file}: ${response.statusText}`);
    }
    const csvText = await response.text();
    const key = file.replace(".csv", "").replace(/_/g, "");
    results[key] = parseCSV(csvText);
  }

  return {
    users: results.users,
    resources: results.resources,
    groups: results.groups,
    userPermissions: results.userpermissions,
    groupPermissions: results.grouppermissions,
    memberships: results.memberof,
    inheritances: results.inheritsfrom,
  };
}

// Load data into database
async function loadData() {
  try {
    btnLoadData.disabled = true;
    updateStatus("Fetching CSV data from server...", "loading");

    const startTime = performance.now();

    // Create schema
    await createSchema();

    // Fetch CSV data from server (same as Python/Node.js)
    const data = await fetchCSVData();
    loadingResultsDiv.innerHTML = `Loaded from CSV:\n- ${data.users.length} users\n- ${data.resources.length} resources\n- ${data.groups.length} groups\n- ${data.userPermissions.length} user permissions\n- ${data.groupPermissions.length} group permissions\n- ${data.memberships.length} memberships\n- ${data.inheritances.length} inheritances`;

    // Load users
    updateStatus("Loading users...", "loading");
    loadProgressBar.style.width = "10%";
    for (const user of data.users) {
      await conn.execute(
        `CREATE (u:User {id: $id, name: $name, email: $email})`,
        { id: user.id, name: user.name, email: user.email }
      );
    }

    // Load resources
    updateStatus("Loading resources...", "loading");
    loadProgressBar.style.width = "20%";
    for (const resource of data.resources) {
      await conn.execute(
        `CREATE (r:Resource {id: $id, name: $name, type: $type})`,
        { id: resource.id, name: resource.name, type: resource.type }
      );
    }

    // Load groups
    updateStatus("Loading groups...", "loading");
    loadProgressBar.style.width = "30%";
    for (const group of data.groups) {
      await conn.execute(
        `CREATE (g:UserGroup {id: $id, name: $name, description: $desc})`,
        { id: group.id, name: group.name, desc: group.description }
      );
    }

    // Load memberships
    updateStatus("Loading memberships...", "loading");
    loadProgressBar.style.width = "45%";
    for (const member of data.memberships) {
      await conn.execute(
        `MATCH (u:User {id: $uid}), (g:UserGroup {id: $gid})
         CREATE (u)-[:MEMBER_OF {joined_at: $joined, role: $role}]->(g)`,
        {
          uid: member.user_id,
          gid: member.group_id,
          joined: member.joined_at,
          role: member.role,
        }
      );
    }

    // Load user permissions
    updateStatus("Loading user permissions...", "loading");
    loadProgressBar.style.width = "60%";
    for (const perm of data.userPermissions) {
      await conn.execute(
        `MATCH (u:User {id: $uid}), (r:Resource {id: $rid})
         CREATE (u)-[:HAS_PERMISSION_USER {
           can_create: $create, can_read: $read, 
           can_update: $update, can_delete: $delete,
           granted_at: $granted, granted_by: $by
         }]->(r)`,
        {
          uid: perm.user_id,
          rid: perm.resource_id,
          create: perm.can_create,
          read: perm.can_read,
          update: perm.can_update,
          delete: perm.can_delete,
          granted: perm.granted_at,
          by: perm.granted_by,
        }
      );
    }

    // Load group permissions
    updateStatus("Loading group permissions...", "loading");
    loadProgressBar.style.width = "75%";
    for (const perm of data.groupPermissions) {
      await conn.execute(
        `MATCH (g:UserGroup {id: $gid}), (r:Resource {id: $rid})
         CREATE (g)-[:HAS_PERMISSION_GROUP {
           can_create: $create, can_read: $read,
           can_update: $update, can_delete: $delete,
           granted_at: $granted, granted_by: $by
         }]->(r)`,
        {
          gid: perm.group_id,
          rid: perm.resource_id,
          create: perm.can_create,
          read: perm.can_read,
          update: perm.can_update,
          delete: perm.can_delete,
          granted: perm.granted_at,
          by: perm.granted_by,
        }
      );
    }

    // Load group inheritances
    updateStatus("Loading inheritances...", "loading");
    loadProgressBar.style.width = "90%";
    for (const inherit of data.inheritances) {
      await conn.execute(
        `MATCH (g1:UserGroup {id: $parent}), (g2:UserGroup {id: $child})
         CREATE (g2)-[:INHERITS_FROM {created_at: $created}]->(g1)`,
        {
          parent: inherit.parent_group_id,
          child: inherit.child_group_id,
          created: inherit.created_at,
        }
      );
    }

    loadProgressBar.style.width = "100%";
    const endTime = performance.now();
    const loadTime = endTime - startTime;

    const totalRecords =
      data.users.length +
      data.resources.length +
      data.groups.length +
      data.userPermissions.length +
      data.groupPermissions.length +
      data.memberships.length +
      data.inheritances.length;

    benchmarkResults.loading = {
      loadTimeMs: loadTime,
      totalRecords,
      recordsPerSecond: (totalRecords / (loadTime / 1000)).toFixed(0),
      users: data.users.length,
      resources: data.resources.length,
      groups: data.groups.length,
      userPermissions: data.userPermissions.length,
      groupPermissions: data.groupPermissions.length,
      memberships: data.memberships.length,
      inheritances: data.inheritances.length,
    };

    loadingResultsDiv.innerHTML = `
✅ Data loaded successfully!

Load Time: ${formatMs(loadTime)}
Total Records: ${totalRecords.toLocaleString()}
Throughput: ${benchmarkResults.loading.recordsPerSecond} records/sec

Breakdown:
- Users: ${data.users.length}
- Resources: ${data.resources.length}
- Groups: ${data.groups.length}
- User Permissions: ${data.userPermissions.length}
- Group Permissions: ${data.groupPermissions.length}
- Memberships: ${data.memberships.length}
- Inheritances: ${data.inheritances.length}
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

// Memory monitoring
function startMemoryMonitoring() {
  setInterval(() => {
    if (performance.memory) {
      const used = performance.memory.usedJSHeapSize;
      const total = performance.memory.totalJSHeapSize;
      const limit = performance.memory.jsHeapSizeLimit;

      benchmarkResults.memory = {
        used,
        total,
        limit,
        usedFormatted: formatBytes(used),
        totalFormatted: formatBytes(total),
        limitFormatted: formatBytes(limit),
      };

      memoryResultsDiv.innerHTML = `
<div class="metric">
    <span class="metric-label">Used Heap:</span>
    <span class="metric-value">${formatBytes(used)}</span>
</div>
<div class="metric">
    <span class="metric-label">Total Heap:</span>
    <span class="metric-value">${formatBytes(total)}</span>
</div>
<div class="metric">
    <span class="metric-label">Heap Limit:</span>
    <span class="metric-value">${formatBytes(limit)}</span>
</div>
            `;
    } else {
      memoryResultsDiv.innerHTML =
        "⚠️ Memory API not available in this browser";
    }
  }, 2000);
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

// Export results
function exportResults() {
  const resultsJson = JSON.stringify(benchmarkResults, null, 2);
  const blob = new Blob([resultsJson], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `kuzu-wasm-benchmark-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

// Event listeners
btnLoadData.addEventListener("click", loadData);
btnRunQueries.addEventListener("click", runQueryBenchmarks);
btnClearDB.addEventListener("click", clearDatabase);
btnExportResults.addEventListener("click", exportResults);

// Initialize on page load
initKuzuDB();
