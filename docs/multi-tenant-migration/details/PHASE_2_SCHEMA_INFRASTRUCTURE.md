# Phase 2: Schema Infrastructure - Self-Service Schema Management

**Status:** 18% Complete  
**Duration:** 8-12 weeks  
**Dependencies:** Phase 1 Core Loop (recommended 80%+)

---

## 🎯 Goal

Enable **customer self-service schema management** with visual editor, hot reload, and runtime schema updates.

**Key Innovation:** Time to add entity type: **2-3 minutes** (down from 2-4 hours of manual coding).

---

## 📊 Progress Tracking

| Component                      | Status         | Progress |
| ------------------------------ | -------------- | -------- |
| 2.1 Schema Format & Validation | 🟡 Partial     | 90%      |
| 2.2 Schema Compiler            | ⏳ Not Started | 0%       |
| 2.3 Hot Reload System          | ⏳ Not Started | 0%       |
| 2.4 Customer Admin UI - Web    | ⏳ Not Started | 0%       |
| 2.5 Customer Admin UI - Tauri  | ⏳ Not Started | 0%       |
| 2.6 Relish Admin UI            | ⏳ Not Started | 0%       |
| **Overall**                    | **🟠 Started** | **18%**  |

---

## 🐕 Dogfooding Strategy

Both admin UIs will **use Relish authorization internally** to manage access control.

### Permission Schema for Customer Admin UI

```yaml
# Roles
tenant:admin → User        # Full schema edit access
tenant:viewer → User       # Read-only access

# Permissions
schema:view → tenant:viewer
schema:edit → tenant:admin
schema:publish → tenant:admin
schema:rollback → tenant:admin
```

### Permission Schema for Relish Admin UI

```yaml
# Roles
relish:operator → User       # Read-only
relish:admin → User          # Manage tenants
relish:superadmin → User     # Full access

# Permissions
tenant:view → relish:operator
tenant:create → relish:admin
tenant:suspend → relish:admin
tenant:delete → relish:superadmin
metrics:view → relish:operator
```

---

## 📋 Task List

### 2.1 Schema Validation Rules (Week 1)

**Current Status:** Schema format defined (90%), validation incomplete

#### Tasks

- [ ] **Complete schema validation rules**

  - [ ] Required field enforcement (`name`, `id`, `type`)
  - [ ] Type checking (string, number, boolean, reference, array)
  - [ ] Pattern validation (regex patterns)
  - [ ] Entity reference validation (foreign keys exist)
  - [ ] Relationship cardinality enforcement (one-to-one, one-to-many, many-to-many)
  - [ ] Circular dependency detection
  - [ ] Reserved keyword checking

- [ ] **Add validation error messages**

  - [ ] Clear error descriptions (e.g., "Field 'email' must be unique")
  - [ ] Line numbers for YAML errors
  - [ ] Suggested fixes (e.g., "Did you mean 'User'?")
  - [ ] Severity levels (error, warning, info)

- [ ] **Create runtime validator** (`schema/validator.ts`)

  ```typescript
  export class SchemaValidator {
    validate(schema: Schema): ValidationResult {
      const errors: ValidationError[] = [];

      // Check required fields
      for (const entity of schema.entities) {
        if (!entity.name) {
          errors.push({
            type: "error",
            message: "Entity name is required",
            path: `entities[${entity}]`,
            line: entity.line,
          });
        }
      }

      // Check foreign key references
      for (const entity of schema.entities) {
        for (const field of entity.fields) {
          if (field.type === "reference") {
            if (!schema.entities.find((e) => e.name === field.referenceType)) {
              errors.push({
                type: "error",
                message: `Referenced entity '${field.referenceType}' does not exist`,
                path: `entities[${entity.name}].fields[${field.name}]`,
                line: field.line,
                suggestion: "Define the entity first",
              });
            }
          }
        }
      }

      // Check circular dependencies
      const graph = this.buildDependencyGraph(schema);
      const cycles = this.detectCycles(graph);
      for (const cycle of cycles) {
        errors.push({
          type: "error",
          message: `Circular dependency detected: ${cycle.join(" → ")}`,
          path: "entities",
        });
      }

      return { valid: errors.length === 0, errors };
    }
  }
  ```

- [ ] **Update JSON Schema** (`schema/relish.schema.json`)
  - [ ] Add validation rules for all properties
  - [ ] Add regex patterns for IDs and names
  - [ ] Add enum constraints for types
  - [ ] Add min/max constraints for numbers

#### Files to Update/Create

```
schema/
├── relish.schema.json       # JSON Schema with validation rules
├── validator.ts             # Runtime validation (NEW)
├── validation-errors.ts     # Error types (NEW)
└── tests/
    └── validator.test.ts    # Validation tests (NEW)
```

#### Acceptance Criteria

- ✅ All validation rules implemented
- ✅ Clear error messages with line numbers
- ✅ Circular dependency detection working
- ✅ Foreign key validation working
- ✅ All tests passing

---

### 2.2 Schema Compiler (Week 1-3)

**Goal:** Generate TypeScript artifacts from YAML schema

#### Architecture

```
YAML Schema → Parser → AST → Generators → Artifacts
                                        ├── TypeScript types
                                        ├── Runtime validators
                                        ├── CSV loaders
                                        ├── Index definitions
                                        └── Test templates
```

#### Tasks

- [ ] **Setup compiler project**

  ```bash
  mkdir -p schema/compiler/src/{parsers,generators,templates}
  cd schema/compiler
  npm init -y
  ```

- [ ] **Create YAML parser** (`src/parsers/yaml-parser.ts`)

  ```typescript
  export class YAMLParser {
    parse(yamlContent: string): SchemaAST {
      const raw = yaml.load(yamlContent);
      return {
        version: raw.version,
        entities: raw.entities.map((e) => this.parseEntity(e)),
        relationships: raw.relationships.map((r) => this.parseRelationship(r)),
      };
    }

    private parseEntity(raw: any): EntityNode {
      return {
        name: raw.name,
        fields: raw.fields.map((f) => this.parseField(f)),
        indexes: raw.indexes || [],
        metadata: { line: raw.__line__ },
      };
    }
  }
  ```

- [ ] **Create AST types** (`src/parsers/ast-types.ts`)

  ```typescript
  export interface SchemaAST {
    version: string;
    entities: EntityNode[];
    relationships: RelationshipNode[];
  }

  export interface EntityNode {
    name: string;
    fields: FieldNode[];
    indexes: IndexNode[];
    metadata: NodeMetadata;
  }

  export interface FieldNode {
    name: string;
    type: FieldType;
    required: boolean;
    unique: boolean;
    pattern?: string;
    referenceType?: string;
    metadata: NodeMetadata;
  }
  ```

- [ ] **Create TypeScript type generator** (`src/generators/type-generator.ts`)

  ```typescript
  export class TypeGenerator {
    generate(ast: SchemaAST): string {
      let output = "// Generated by Relish Schema Compiler\n\n";

      for (const entity of ast.entities) {
        output += this.generateInterface(entity);
        output += "\n\n";
      }

      return output;
    }

    private generateInterface(entity: EntityNode): string {
      const fields = entity.fields
        .map(
          (f) => `  ${f.name}${f.required ? "" : "?"}: ${this.mapType(f.type)};`
        )
        .join("\n");

      return `export interface ${entity.name} {\n${fields}\n}`;
    }

    private mapType(fieldType: FieldType): string {
      switch (fieldType) {
        case "string":
          return "string";
        case "number":
          return "number";
        case "boolean":
          return "boolean";
        case "reference":
          return "string"; // ID reference
        case "array":
          return "string[]";
      }
    }
  }
  ```

- [ ] **Create validator generator** (`src/generators/validator-gen.ts`)

  ```typescript
  export class ValidatorGenerator {
    generate(ast: SchemaAST): string {
      let output = "export const validators = {\n";

      for (const entity of ast.entities) {
        output += `  ${entity.name}: (data: any): ValidationResult => {\n`;
        output += `    const errors: string[] = [];\n`;

        for (const field of entity.fields) {
          if (field.required) {
            output += `    if (!data.${field.name}) errors.push('${field.name} is required');\n`;
          }
          if (field.pattern) {
            output += `    if (data.${field.name} && !/${field.pattern}/.test(data.${field.name})) {\n`;
            output += `      errors.push('${field.name} does not match pattern');\n`;
            output += `    }\n`;
          }
        }

        output += `    return { valid: errors.length === 0, errors };\n`;
        output += `  },\n`;
      }

      output += "};\n";
      return output;
    }
  }
  ```

- [ ] **Create CSV loader generator** (`src/generators/loader-gen.ts`)

  ```typescript
  export class LoaderGenerator {
    generate(ast: SchemaAST): string {
      let output = 'import Papa from "papaparse";\n\n';

      for (const entity of ast.entities) {
        output += `export async function load${entity.name}(csv: string): Promise<${entity.name}[]> {\n`;
        output += `  const result = Papa.parse<${entity.name}>(csv, { header: true });\n`;
        output += `  return result.data;\n`;
        output += `}\n\n`;
      }

      return output;
    }
  }
  ```

- [ ] **Create index generator** (`src/generators/index-gen.ts`)

  ```typescript
  export class IndexGenerator {
    generate(ast: SchemaAST): string {
      let output = "-- Generated index definitions\n\n";

      for (const entity of ast.entities) {
        for (const index of entity.indexes) {
          output += `CREATE INDEX idx_${entity.name}_${index.field} ON ${entity.name}(${index.field});\n`;
        }

        // Unique constraints
        const uniqueFields = entity.fields.filter((f) => f.unique);
        for (const field of uniqueFields) {
          output += `CREATE UNIQUE INDEX idx_${entity.name}_${field.name}_unique ON ${entity.name}(${field.name});\n`;
        }
      }

      return output;
    }
  }
  ```

- [ ] **Create test generator** (`src/generators/test-gen.ts`)

  ```typescript
  export class TestGenerator {
    generate(ast: SchemaAST): string {
      let output = 'import { describe, it, expect } from "jest";\n\n';

      for (const entity of ast.entities) {
        output += `describe('${entity.name}', () => {\n`;
        output += `  it('validates required fields', () => {\n`;
        output += `    const data = {};\n`;
        output += `    const result = validators.${entity.name}(data);\n`;
        output += `    expect(result.valid).toBe(false);\n`;
        output += `  });\n`;
        output += `});\n\n`;
      }

      return output;
    }
  }
  ```

- [ ] **Create main compiler** (`src/index.ts`)

  ```typescript
  export class SchemaCompiler {
    async compile(schemaPath: string, outputDir: string): Promise<void> {
      // Parse YAML
      const yamlContent = await fs.readFile(schemaPath, "utf-8");
      const ast = this.parser.parse(yamlContent);

      // Validate
      const validation = this.validator.validate(ast);
      if (!validation.valid) {
        throw new Error(`Validation failed:\n${validation.errors.join("\n")}`);
      }

      // Generate artifacts
      const types = this.typeGenerator.generate(ast);
      const validators = this.validatorGenerator.generate(ast);
      const loaders = this.loaderGenerator.generate(ast);
      const indexes = this.indexGenerator.generate(ast);
      const tests = this.testGenerator.generate(ast);

      // Write files
      await fs.writeFile(path.join(outputDir, "types.ts"), types);
      await fs.writeFile(path.join(outputDir, "validators.ts"), validators);
      await fs.writeFile(path.join(outputDir, "loaders.ts"), loaders);
      await fs.writeFile(path.join(outputDir, "indexes.sql"), indexes);
      await fs.writeFile(path.join(outputDir, "schema.test.ts"), tests);

      console.log(`✅ Schema compiled successfully to ${outputDir}`);
    }
  }
  ```

- [ ] **Add CLI** (`src/cli.ts`)

  ```typescript
  #!/usr/bin/env node
  import { program } from "commander";

  program
    .command("compile")
    .argument("<schema>", "Path to schema.yaml")
    .option("-o, --output <dir>", "Output directory", "./generated")
    .action(async (schema, options) => {
      const compiler = new SchemaCompiler();
      await compiler.compile(schema, options.output);
    });

  program.parse();
  ```

#### Files to Create

```
schema/compiler/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts                 # Main compiler
│   ├── cli.ts                   # CLI interface
│   ├── parsers/
│   │   ├── yaml-parser.ts       # YAML → AST
│   │   ├── ast-types.ts         # AST type definitions
│   │   └── validator.ts         # Schema validation
│   ├── generators/
│   │   ├── type-generator.ts    # TypeScript interfaces
│   │   ├── validator-gen.ts     # Runtime validators
│   │   ├── loader-gen.ts        # CSV loaders
│   │   ├── index-gen.ts         # Index definitions
│   │   └── test-gen.ts          # Test generation
│   └── templates/
│       ├── entity.ts.hbs        # Handlebars template
│       └── validator.ts.hbs     # Validator template
└── tests/
    ├── compiler.test.ts
    ├── generators.test.ts
    └── fixtures/
        └── sample-schema.yaml
```

#### Acceptance Criteria

- ✅ Compiler generates TypeScript types
- ✅ Compiler generates runtime validators
- ✅ Compiler generates CSV loaders
- ✅ Compiler generates index definitions
- ✅ Compiler generates test templates
- ✅ CLI working: `relish-schema compile schema.yaml`
- ✅ All tests passing

---

### 2.3 Hot Reload System (Week 4-5)

**Goal:** Runtime schema updates without downtime

#### Architecture

```
Schema Upload → Validation → Compilation → Version Storage → Activation → Runtime Reload
                                                                       → Client Sync
                                                                       → Index Rebuild
```

#### Tasks

- [ ] **Create schema version storage** (Durable Object)

  ```typescript
  export class SchemaVersionDO {
    private versions: Map<number, SchemaVersion> = new Map();
    private activeVersion: number = 1;

    async uploadVersion(schema: Schema): Promise<number> {
      // Validate schema
      const validation = this.validator.validate(schema);
      if (!validation.valid) {
        throw new Error(`Invalid schema: ${validation.errors.join(", ")}`);
      }

      // Compile schema
      const artifacts = await this.compiler.compile(schema);

      // Store version
      const version = this.versions.size + 1;
      this.versions.set(version, {
        version,
        schema,
        artifacts,
        uploadedAt: Date.now(),
        uploadedBy: "user:admin",
        active: false,
      });

      return version;
    }

    async activateVersion(version: number): Promise<void> {
      const schemaVersion = this.versions.get(version);
      if (!schemaVersion) {
        throw new Error(`Version ${version} not found`);
      }

      // Deactivate current version
      const current = this.versions.get(this.activeVersion);
      if (current) {
        current.active = false;
      }

      // Activate new version
      schemaVersion.active = true;
      this.activeVersion = version;

      // Broadcast to clients
      await this.broadcastSchemaChange(version);

      // Rebuild indexes
      await this.rebuildIndexes(schemaVersion);
    }
  }
  ```

- [ ] **Add API endpoints** (`cloudflare/worker/src/admin/schema-manager.ts`)

  ```typescript
  // Upload and validate schema
  app.post("/admin/schema/upload", async (c) => {
    const schema = await c.req.json();
    const schemaVersion = await c.env.SCHEMA_VERSION.get();
    const version = await schemaVersion.uploadVersion(schema);
    return c.json({ version, status: "uploaded" });
  });

  // List versions
  app.get("/admin/schema/versions", async (c) => {
    const schemaVersion = await c.env.SCHEMA_VERSION.get();
    const versions = await schemaVersion.listVersions();
    return c.json({ versions });
  });

  // Activate version
  app.post("/admin/schema/activate/:version", async (c) => {
    const version = parseInt(c.req.param("version"));
    const schemaVersion = await c.env.SCHEMA_VERSION.get();
    await schemaVersion.activateVersion(version);
    return c.json({ version, status: "activated" });
  });

  // Get current schema
  app.get("/admin/schema/current", async (c) => {
    const schemaVersion = await c.env.SCHEMA_VERSION.get();
    const current = await schemaVersion.getCurrentVersion();
    return c.json(current);
  });

  // Rollback to previous version
  app.post("/admin/schema/rollback/:version", async (c) => {
    const version = parseInt(c.req.param("version"));
    const schemaVersion = await c.env.SCHEMA_VERSION.get();
    await schemaVersion.activateVersion(version);
    return c.json({ version, status: "rolled-back" });
  });
  ```

- [ ] **Implement runtime artifact loader**

  ```typescript
  export class RuntimeLoader {
    private moduleCache = new Map<number, any>();

    async loadVersion(version: number): Promise<void> {
      // Fetch artifacts from DO
      const artifacts = await this.fetchArtifacts(version);

      // Dynamic import of generated modules
      const typesModule = await import(artifacts.types);
      const validatorsModule = await import(artifacts.validators);
      const loadersModule = await import(artifacts.loaders);

      // Cache modules
      this.moduleCache.set(version, {
        types: typesModule,
        validators: validatorsModule,
        loaders: loadersModule,
      });

      // Update global references
      global.currentSchema = this.moduleCache.get(version);
    }

    invalidateCache(version: number): void {
      this.moduleCache.delete(version);
      delete require.cache[require.resolve(`./generated/v${version}/types`)];
    }
  }
  ```

- [ ] **Implement index rebuilding**

  ```typescript
  async rebuildIndexes(schemaVersion: SchemaVersion): Promise<void> {
    const newEntities = schemaVersion.schema.entities;
    const oldEntities = this.previousSchema?.entities || [];

    // Add indexes for new entities
    for (const entity of newEntities) {
      if (!oldEntities.find(e => e.name === entity.name)) {
        await this.createIndexes(entity);
      }
    }

    // Remove indexes for deleted entities
    for (const entity of oldEntities) {
      if (!newEntities.find(e => e.name === entity.name)) {
        await this.dropIndexes(entity);
      }
    }

    // Update indexes for changed entities
    for (const entity of newEntities) {
      const oldEntity = oldEntities.find(e => e.name === entity.name);
      if (oldEntity && this.hasIndexChanges(entity, oldEntity)) {
        await this.updateIndexes(entity, oldEntity);
      }
    }
  }
  ```

- [ ] **Implement client-side schema sync**

  ```typescript
  // In client SDK
  export class SchemaSync {
    private currentSchemaVersion: number = 1;

    async checkForUpdates(): Promise<void> {
      const response = await fetch(`${this.workerUrl}/admin/schema/current`);
      const { version } = await response.json();

      if (version > this.currentSchemaVersion) {
        await this.updateSchema(version);
      }
    }

    private async updateSchema(version: number): Promise<void> {
      // Fetch new schema artifacts
      const artifacts = await this.fetchArtifacts(version);

      // Rebuild WASM graph with new schema
      await this.kuzu.createSchema(artifacts.schema);

      // Reload data
      await this.reloadData();

      this.currentSchemaVersion = version;
    }
  }
  ```

- [ ] **Add rollback mechanism**
  ```typescript
  async rollback(toVersion: number): Promise<void> {
    // Validate version exists
    const version = this.versions.get(toVersion);
    if (!version) {
      throw new Error(`Version ${toVersion} not found`);
    }

    // Store current version as backup
    const currentVersion = this.activeVersion;

    try {
      // Activate old version
      await this.activateVersion(toVersion);
    } catch (error) {
      // Rollback failed, restore current
      await this.activateVersion(currentVersion);
      throw error;
    }
  }
  ```

#### Files to Create

```
cloudflare/worker/src/
├── admin/
│   ├── schema-manager.ts      # Schema version API
│   ├── hot-reload.ts          # Runtime reload logic
│   └── index-rebuilder.ts     # Index management
├── durable-objects/
│   └── schema-version-do.ts   # Schema version storage
└── runtime/
    └── artifact-loader.ts     # Dynamic module loading

client/sdk/src/
└── schema-sync.ts             # Client schema sync
```

#### Acceptance Criteria

- ✅ Schema upload working
- ✅ Version storage working
- ✅ Schema activation working
- ✅ Runtime reload working (no downtime)
- ✅ Index rebuilding working
- ✅ Client sync working
- ✅ Rollback working
- ✅ All tests passing

---

### 2.4 Customer Admin UI - Web (Week 6-8)

**Goal:** Visual schema editor for tenant administrators

See [CUSTOMER_ADMIN_UI_WEB.md](./CUSTOMER_ADMIN_UI_WEB.md) for full implementation details.

#### High-Level Tasks

- [ ] Next.js project setup with TypeScript
- [ ] Visual schema editor (drag-and-drop entity builder)
- [ ] Field configuration forms
- [ ] Code preview pane (Monaco Editor)
- [ ] Version management UI
- [ ] Deploy to Cloudflare Pages (via Pulumi)

#### Key Features

- Drag-and-drop entity creation
- Real-time validation feedback
- Live TypeScript preview
- Schema version history
- Diff viewer
- One-click rollback
- Save & Reload vs Save as Draft

---

### 2.5 Customer Admin UI - Tauri (Week 9-10)

**Goal:** Desktop app version of Customer Admin UI

#### High-Level Tasks

- [ ] Tauri project setup
- [ ] Reuse React components from web version
- [ ] Native menu integration (File, Edit, View)
- [ ] Local file system access (import/export schemas)
- [ ] Offline mode with local SQLite cache
- [ ] Auto-update configuration
- [ ] Code signing for macOS/Windows
- [ ] Build for all platforms (macOS, Windows, Linux)

---

### 2.6 Relish Admin UI (Week 11-12)

**Goal:** SaaS operator dashboard for managing tenants

See [RELISH_ADMIN_UI.md](./RELISH_ADMIN_UI.md) for full implementation details.

#### High-Level Tasks

- [ ] Next.js project setup
- [ ] Tenant list view with search/filter
- [ ] Tenant creation wizard
- [ ] Tenant detail page (metrics, users, permissions)
- [ ] Usage metrics dashboard (Recharts)
- [ ] System health monitoring
- [ ] Tenant suspend/resume actions
- [ ] Deploy to Cloudflare Pages (via Pulumi)

---

## 🧪 Test-Driven Development (TDD) Approach

### TDD Workflow for Phase 2

**Schema Compiler & Hot Reload require rigorous TDD:**

1. **Write tests for each generator** before implementing
2. **Test schema validation rules** exhaustively
3. **Test hot reload scenarios** (happy path + edge cases)
4. **Test UI components** in isolation
5. Mark task complete **only when all tests pass**

### Test Framework Setup

```bash
cd schema/compiler
npm install --save-dev jest @types/jest ts-jest

cd ../../admin-ui/customer-admin
npm install --save-dev @testing-library/react @testing-library/jest-dom @testing-library/user-event
npm install --save-dev @playwright/test
```

### Task 2.1: Schema Validation - Test Suite

**Write these tests BEFORE implementing validation:**

```typescript
// schema/validator.test.ts
import { SchemaValidator } from "./validator";

describe("SchemaValidator", () => {
  let validator: SchemaValidator;

  beforeEach(() => {
    validator = new SchemaValidator();
  });

  describe("required fields", () => {
    it("should error if entity name is missing", () => {
      const schema = { entities: [{ fields: [] }] };
      const result = validator.validate(schema);
      expect(result.valid).toBe(false);
      expect(result.errors[0].message).toContain("Entity name is required");
    });

    it("should error if field name is missing", () => {
      const schema = {
        entities: [{ name: "User", fields: [{ type: "string" }] }],
      };
      const result = validator.validate(schema);
      expect(result.valid).toBe(false);
      expect(result.errors[0].message).toContain("Field name is required");
    });
  });

  describe("foreign key validation", () => {
    it("should error if referenced entity does not exist", () => {
      const schema = {
        entities: [
          {
            name: "Document",
            fields: [
              { name: "owner", type: "reference", referenceType: "User" },
            ],
          },
        ],
      };
      const result = validator.validate(schema);
      expect(result.valid).toBe(false);
      expect(result.errors[0].message).toContain(
        "Referenced entity 'User' does not exist"
      );
    });

    it("should pass if referenced entity exists", () => {
      const schema = {
        entities: [
          { name: "User", fields: [] },
          {
            name: "Document",
            fields: [
              { name: "owner", type: "reference", referenceType: "User" },
            ],
          },
        ],
      };
      const result = validator.validate(schema);
      expect(result.valid).toBe(true);
    });
  });

  describe("circular dependency detection", () => {
    it("should error on circular references", () => {
      const schema = {
        entities: [
          {
            name: "User",
            fields: [
              {
                name: "document",
                type: "reference",
                referenceType: "Document",
              },
            ],
          },
          {
            name: "Document",
            fields: [
              { name: "owner", type: "reference", referenceType: "User" },
            ],
          },
        ],
      };
      const result = validator.validate(schema);
      // Note: Circular references are allowed, so this should pass
      // But we should detect circular *dependencies* in schema ordering
      expect(result.valid).toBe(true);
    });
  });

  describe("pattern validation", () => {
    it("should validate regex patterns", () => {
      const schema = {
        entities: [
          {
            name: "User",
            fields: [
              { name: "email", type: "string", pattern: "[invalid regex" },
            ],
          },
        ],
      };
      const result = validator.validate(schema);
      expect(result.valid).toBe(false);
      expect(result.errors[0].message).toContain("Invalid regex pattern");
    });
  });
});
```

**✅ Task 2.1 is DONE when:** All validation tests pass + clear error messages

---

### Task 2.2: Schema Compiler - Test Suite

**Write these tests BEFORE implementing generators:**

```typescript
// schema/compiler/generators/type-generator.test.ts
import { TypeGenerator } from "./type-generator";

describe("TypeGenerator", () => {
  let generator: TypeGenerator;

  beforeEach(() => {
    generator = new TypeGenerator();
  });

  it("should generate TypeScript interface from entity", () => {
    const ast = {
      entities: [
        {
          name: "User",
          fields: [
            { name: "id", type: "string", required: true },
            { name: "email", type: "string", required: true },
            { name: "age", type: "number", required: false },
          ],
        },
      ],
    };

    const output = generator.generate(ast);
    expect(output).toContain("export interface User {");
    expect(output).toContain("  id: string;");
    expect(output).toContain("  email: string;");
    expect(output).toContain("  age?: number;");
  });

  it("should handle reference types correctly", () => {
    const ast = {
      entities: [
        {
          name: "User",
          fields: [{ name: "id", type: "string", required: true }],
        },
        {
          name: "Document",
          fields: [
            {
              name: "owner",
              type: "reference",
              referenceType: "User",
              required: true,
            },
          ],
        },
      ],
    };

    const output = generator.generate(ast);
    expect(output).toContain("owner: string;"); // Reference stored as ID
  });

  it("should handle array types correctly", () => {
    const ast = {
      entities: [
        {
          name: "User",
          fields: [{ name: "tags", type: "array", required: true }],
        },
      ],
    };

    const output = generator.generate(ast);
    expect(output).toContain("tags: string[];");
  });
});

// schema/compiler/generators/validator-gen.test.ts
describe("ValidatorGenerator", () => {
  it("should generate runtime validator", () => {
    const ast = {
      entities: [
        {
          name: "User",
          fields: [
            {
              name: "email",
              type: "string",
              required: true,
              pattern: "^[^@]+@[^@]+$",
            },
          ],
        },
      ],
    };

    const generator = new ValidatorGenerator();
    const output = generator.generate(ast);

    expect(output).toContain("validators.User");
    expect(output).toContain(
      "if (!data.email) errors.push('email is required')"
    );
    expect(output).toContain("does not match pattern");
  });
});

// schema/compiler/index.test.ts
describe("SchemaCompiler", () => {
  it("should compile schema to all artifacts", async () => {
    const compiler = new SchemaCompiler();
    const schemaYaml = `
version: '1.0'
entities:
  - name: User
    fields:
      - name: id
        type: string
        required: true
`;

    const outputDir = "/tmp/test-output";
    await compiler.compile(schemaYaml, outputDir);

    // Verify files exist
    expect(fs.existsSync(`${outputDir}/types.ts`)).toBe(true);
    expect(fs.existsSync(`${outputDir}/validators.ts`)).toBe(true);
    expect(fs.existsSync(`${outputDir}/loaders.ts`)).toBe(true);
    expect(fs.existsSync(`${outputDir}/indexes.sql`)).toBe(true);
  });

  it("should complete compilation in <5 seconds", async () => {
    const compiler = new SchemaCompiler();
    const start = Date.now();
    await compiler.compile(largeSchemaYaml, "/tmp/test-output");
    const duration = Date.now() - start;
    expect(duration).toBeLessThan(5000);
  });
});
```

**✅ Task 2.2 is DONE when:** All generator tests pass + compilation <5s

---

### Task 2.3: Hot Reload System - Test Suite

**Write these tests BEFORE implementing hot reload:**

```typescript
// cloudflare/worker/src/admin/hot-reload.test.ts
import { SchemaVersionDO } from "../durable-objects/schema-version-do";

describe("SchemaVersionDO", () => {
  let schemaVersion: SchemaVersionDO;

  beforeEach(() => {
    schemaVersion = new SchemaVersionDO();
  });

  describe("uploadVersion", () => {
    it("should validate and store new schema version", async () => {
      const schema = createValidSchema();
      const version = await schemaVersion.uploadVersion(schema);
      expect(version).toBe(1);
    });

    it("should reject invalid schema", async () => {
      const invalidSchema = { entities: [] }; // Missing required fields
      await expect(schemaVersion.uploadVersion(invalidSchema)).rejects.toThrow(
        "Invalid schema"
      );
    });
  });

  describe("activateVersion", () => {
    it("should activate new version", async () => {
      const schema = createValidSchema();
      const version = await schemaVersion.uploadVersion(schema);
      await schemaVersion.activateVersion(version);

      const current = await schemaVersion.getCurrentVersion();
      expect(current.version).toBe(version);
      expect(current.active).toBe(true);
    });

    it("should complete activation in <10 seconds", async () => {
      const schema = createValidSchema();
      const version = await schemaVersion.uploadVersion(schema);

      const start = Date.now();
      await schemaVersion.activateVersion(version);
      const duration = Date.now() - start;

      expect(duration).toBeLessThan(10000);
    });

    it("should broadcast schema change to connected clients", async () => {
      const schema = createValidSchema();
      const version = await schemaVersion.uploadVersion(schema);
      const broadcastSpy = jest.spyOn(
        schemaVersion as any,
        "broadcastSchemaChange"
      );

      await schemaVersion.activateVersion(version);

      expect(broadcastSpy).toHaveBeenCalledWith(version);
    });
  });

  describe("rollback", () => {
    it("should rollback to previous version", async () => {
      const schema1 = createValidSchema();
      const schema2 = createValidSchema();

      const v1 = await schemaVersion.uploadVersion(schema1);
      await schemaVersion.activateVersion(v1);

      const v2 = await schemaVersion.uploadVersion(schema2);
      await schemaVersion.activateVersion(v2);

      await schemaVersion.rollback(v1);

      const current = await schemaVersion.getCurrentVersion();
      expect(current.version).toBe(v1);
    });

    it("should restore previous version on failed activation", async () => {
      const schema1 = createValidSchema();
      const schema2 = createInvalidRuntimeSchema(); // Compiles but fails at runtime

      const v1 = await schemaVersion.uploadVersion(schema1);
      await schemaVersion.activateVersion(v1);

      const v2 = await schemaVersion.uploadVersion(schema2);

      await expect(schemaVersion.activateVersion(v2)).rejects.toThrow();

      const current = await schemaVersion.getCurrentVersion();
      expect(current.version).toBe(v1); // Should still be on v1
    });
  });
});
```

**✅ Task 2.3 is DONE when:** All hot reload tests pass + zero downtime

---

### Task 2.4 & 2.5: Admin UI - Test Suite

**Component Tests:**

```typescript
// admin-ui/customer-admin/components/schema-canvas.test.tsx
import { render, screen, fireEvent } from "@testing-library/react";
import { SchemaCanvas } from "./schema-canvas";

describe("SchemaCanvas", () => {
  it("should render empty canvas", () => {
    render(<SchemaCanvas />);
    expect(screen.getByText("Add Entity")).toBeInTheDocument();
  });

  it("should add entity on button click", () => {
    render(<SchemaCanvas />);
    fireEvent.click(screen.getByText("Add Entity"));
    expect(screen.getByText("NewEntity")).toBeInTheDocument();
  });

  it("should select entity on click", () => {
    render(<SchemaCanvas />);
    fireEvent.click(screen.getByText("Add Entity"));
    const entity = screen.getByText("NewEntity");
    fireEvent.click(entity);
    // Verify entity editor panel opens
    expect(screen.getByText("Edit Entity")).toBeInTheDocument();
  });
});

// admin-ui/customer-admin/components/entity-editor-panel.test.tsx
describe("EntityEditorPanel", () => {
  it("should update entity name", () => {
    render(<EntityEditorPanel />);
    const input = screen.getByLabelText("Entity Name");
    fireEvent.change(input, { target: { value: "User" } });
    expect(input).toHaveValue("User");
  });

  it("should add field on button click", () => {
    render(<EntityEditorPanel />);
    fireEvent.click(screen.getByText("Add Field"));
    expect(screen.getByPlaceholderText("Field name")).toBeInTheDocument();
  });
});
```

**E2E Tests:**

```typescript
// admin-ui/customer-admin/tests/e2e/schema-editor.spec.ts
import { test, expect } from "@playwright/test";

test.describe("Schema Editor E2E", () => {
  test("should create complete schema in <3 minutes", async ({ page }) => {
    const startTime = Date.now();

    await page.goto("/schema");

    // Add User entity
    await page.click("text=Add Entity");
    await page.fill('input[name="entityName"]', "User");
    await page.click("text=Add Field");
    await page.fill('input[placeholder="Field name"]', "email");
    await page.selectOption("select", "string");
    await page.check('input[type="checkbox"][value="required"]');

    // Add Document entity
    await page.click("text=Add Entity");
    await page.fill('input[name="entityName"]', "Document");
    await page.click("text=Add Field");
    await page.fill('input[placeholder="Field name"]', "owner");
    await page.selectOption("select", "reference");
    await page.selectOption('select[name="referenceType"]', "User");

    // Save and activate
    await page.click("text=Save & Activate");
    await expect(
      page.locator("text=Schema activated successfully")
    ).toBeVisible();

    const duration = Date.now() - startTime;
    expect(duration).toBeLessThan(180000); // <3 minutes
  });

  test("should show validation errors for invalid schema", async ({ page }) => {
    await page.goto("/schema");
    await page.click("text=Add Entity");
    // Leave entity name empty
    await page.click("text=Save & Activate");

    await expect(page.locator("text=Entity name is required")).toBeVisible();
  });

  test("should rollback to previous version", async ({ page }) => {
    await page.goto("/schema/versions");
    await page.click('button[aria-label="Rollback to v1"]');
    await expect(page.locator("text=Rolled back to version 1")).toBeVisible();
  });
});
```

**✅ Tasks 2.4-2.6 are DONE when:** All component + E2E tests pass

---

### Overall Phase 2 TDD Completion Criteria

**Phase 2 is considered COMPLETE when:**

- ✅ All validation tests pass (100+ test cases)
- ✅ All compiler generator tests pass
- ✅ All hot reload tests pass
- ✅ All UI component tests pass (>80% coverage)
- ✅ All E2E tests pass (schema creation <3 min)
- ✅ Performance tests meet targets
- ✅ No flaky tests (100% pass rate over 10 runs)

**Run full test suite:**

```bash
# Backend tests
cd schema/compiler && npm test -- --coverage
cd ../../cloudflare/worker && npm test -- --coverage

# Frontend tests
cd admin-ui/customer-admin && npm test -- --coverage

# E2E tests
cd admin-ui/customer-admin && npx playwright test
```

---

## 🧪 Testing Strategy

### Unit Tests

- [ ] Schema validator tests
- [ ] Compiler generators tests
- [ ] Hot reload logic tests
- [ ] UI component tests

### Integration Tests

- [ ] Schema upload → validation → compilation
- [ ] Schema activation → runtime reload → client sync
- [ ] Rollback → restore previous version
- [ ] UI → API → backend flow

### E2E Tests

- [ ] Complete schema creation flow in UI
- [ ] Schema activation with live client
- [ ] Rollback after failed activation

---

## 🎯 Success Criteria

### Performance Targets

- ✅ Time to add entity: <3 minutes (vs 2-4 hours)
- ✅ Schema compilation: <5 seconds
- ✅ Hot reload: <10 seconds
- ✅ Zero downtime during schema updates

### Functionality Targets

- ✅ Visual schema editor working
- ✅ Hot reload system working
- ✅ Version management working
- ✅ Rollback working
- ✅ Both admin UIs deployed
- ✅ Dogfooding: UIs use Relish authorization

### Developer Experience Targets

- ✅ Clear validation errors
- ✅ Live preview working
- ✅ One-click deployment
- ✅ Complete documentation

---

## 📚 Related Documents

- [MASTER_PLAN.md](../MASTER_PLAN.md) - High-level roadmap
- [PHASE_1_CLIENT_SDK.md](./PHASE_1_CLIENT_SDK.md) - Client SDK implementation
- [CUSTOMER_ADMIN_UI_WEB.md](./CUSTOMER_ADMIN_UI_WEB.md) - Customer Admin UI details
- [RELISH_ADMIN_UI.md](./RELISH_ADMIN_UI.md) - Relish Admin UI details

---

**Last Updated:** January 11, 2026  
**Next Review:** Weekly during implementation
