const kuzu = require("kuzu");
const path = require("path");

/**
 * Create the authorization schema with nodes and relationships.
 * Implements a Zanzibar-inspired authorization model.
 */
async function createSchema(dbPath) {
  console.log("Creating KuzuDB schema for authorization...");

  const db = new kuzu.Database(dbPath);
  const conn = new kuzu.Connection(db);

  // Create User node table
  await conn.query(`
        CREATE NODE TABLE User(
            id STRING,
            name STRING,
            email STRING,
            created_at TIMESTAMP,
            metadata STRING,
            PRIMARY KEY (id)
        )
    `);
  console.log("✓ Created User node table");

  // Create Resource node table
  await conn.query(`
        CREATE NODE TABLE Resource(
            id STRING,
            type STRING,
            name STRING,
            owner_id STRING,
            created_at TIMESTAMP,
            metadata STRING,
            PRIMARY KEY (id)
        )
    `);
  console.log("✓ Created Resource node table");

  // Create Group node table
  await conn.query(`
        CREATE NODE TABLE UserGroup(
            id STRING,
            name STRING,
            description STRING,
            created_at TIMESTAMP,
            metadata STRING,
            PRIMARY KEY (id)
        )
    `);
  console.log("✓ Created Group node table");

  // Create MEMBER_OF relationship (User -> Group)
  await conn.query(`
        CREATE REL TABLE MEMBER_OF(
            FROM User TO UserGroup,
            joined_at TIMESTAMP,
            role STRING
        )
    `);
  console.log("✓ Created MEMBER_OF relationship table");

  // Create HAS_PERMISSION_USER relationship (User -> Resource)
  await conn.query(`
        CREATE REL TABLE HAS_PERMISSION_USER(
            FROM User TO Resource,
            can_create BOOLEAN,
            can_read BOOLEAN,
            can_update BOOLEAN,
            can_delete BOOLEAN,
            granted_at TIMESTAMP,
            granted_by STRING
        )
    `);
  console.log("✓ Created HAS_PERMISSION_USER relationship table");

  // Create HAS_PERMISSION_GROUP relationship (Group -> Resource)
  await conn.query(`
        CREATE REL TABLE HAS_PERMISSION_GROUP(
            FROM UserGroup TO Resource,
            can_create BOOLEAN,
            can_read BOOLEAN,
            can_update BOOLEAN,
            can_delete BOOLEAN,
            granted_at TIMESTAMP,
            granted_by STRING
        )
    `);
  console.log("✓ Created HAS_PERMISSION_GROUP relationship table");

  // Create INHERITS_FROM relationship (Group -> Group)
  await conn.query(`
        CREATE REL TABLE INHERITS_FROM(
            FROM UserGroup TO UserGroup,
            created_at TIMESTAMP
        )
    `);
  console.log("✓ Created INHERITS_FROM relationship table");

  console.log("\n✅ Schema created successfully!");

  return { db, conn };
}

async function printSchemaInfo(conn) {
  console.log("\n" + "=".repeat(60));
  console.log("Schema Information");
  console.log("=".repeat(60));

  const result = await conn.query("CALL SHOW_TABLES() RETURN *;");
  const tables = await result.getAll();

  console.log(`\nTotal tables: ${tables.length}`);
  tables.forEach((table) => {
    console.log(`  - ${table}`);
  });

  console.log("\nNode Tables:");
  console.log("  • User - system users");
  console.log("  • Resource - protected resources (documents, folders, etc.)");
  console.log("  • Group - user groups");

  console.log("\nRelationship Tables:");
  console.log("  • MEMBER_OF: User → Group");
  console.log("  • HAS_PERMISSION_USER: User → Resource");
  console.log("  • HAS_PERMISSION_GROUP: Group → Resource");
  console.log("  • INHERITS_FROM: Group → Group");

  console.log("\n" + "=".repeat(60));
}

async function main() {
  const fs = require("fs");

  // Database path
  const dbPath = path.join(__dirname, "..", "..", "db", "auth_test_nodejs");

  // Remove existing database if it exists
  if (fs.existsSync(dbPath)) {
    console.log(`⚠️  Removing existing database at ${dbPath}`);
    fs.rmSync(dbPath, { recursive: true, force: true });
  }

  // Create schema
  const { db, conn } = await createSchema(dbPath);

  // Print schema information
  await printSchemaInfo(conn);

  console.log(`\n✅ Database ready at: ${dbPath}`);

  // Close connection
  conn.close();
  db.close();
}

if (require.main === module) {
  main().catch((err) => {
    console.error("Error:", err);
    process.exit(1);
  });
}

module.exports = { createSchema, printSchemaInfo };
