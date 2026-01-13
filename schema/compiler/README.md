# Schema Compiler

**Phase 2.2: Schema Compiler** ✅ Complete

A TypeScript-based compiler that generates type-safe code and SQL from YAML/JSON schema definitions.

## Features

- ✅ Parse YAML or JSON schema definitions
- ✅ Generate TypeScript interfaces with JSDoc comments
- ✅ Generate KuzuDB SQL CREATE TABLE statements
- ✅ Support for entities (nodes) and relationships (edges)
- ✅ Type mapping (string, number, boolean, enum, timestamps, JSON)
- ✅ Required/optional field handling
- ✅ Enum type generation
- ✅ Comprehensive test suite (24 tests)

## Installation

```bash
cd schema/compiler
pnpm install
pnpm build
```

## Usage

### CLI

```bash
# Compile a YAML schema
node dist/cli.js example.yaml

# Compile with custom output directory
node dist/cli.js schema.yaml ./generated

# Compile JSON schema
node dist/cli.js schema.json ./output
```

### Programmatic API

```typescript
import { compile, SchemaCompiler } from "@relish/schema-compiler";

// Simple compilation
const output = compile(yamlContent, "yaml");
console.log(output.types); // TypeScript interfaces
console.log(output.sql); // KuzuDB SQL

// Advanced usage
const compiler = new SchemaCompiler();
const ast = compiler.parseSchema(yamlContent, "yaml");
const output = compiler.compileFromAST(ast);
```

## Input Format

Schemas are defined in YAML or JSON:

```yaml
version: "1.0"
name: "My Schema"
description: "Optional description"

entities:
  User:
    description: "User entity"
    fields:
      - name: id
        type: string
        required: true
      - name: email
        type: string
        unique: true
      - name: role
        type: enum
        enum: [admin, user, guest]
      - name: active
        type: boolean
        default: true
    indexes:
      - fields: [email]
        unique: true

  Resource:
    fields:
      - name: id
        type: string
        required: true
      - name: name
        type: string

relationships:
  has_permission:
    from: User
    to: Resource
    properties:
      - name: permission
        type: string
        required: true
```

## Output

### TypeScript Types

Generated interfaces with full type safety:

```typescript
/**
 * User entity
 */
export interface User {
  id: string;
  email?: string;
  role?: "admin" | "user" | "guest";
  active?: boolean;
}

export interface Resource {
  id: string;
  name?: string;
}

export type EntityType = "User" | "Resource";

export interface SchemaTypes {
  User: User;
  Resource: Resource;
}
```

### KuzuDB SQL

Ready-to-run SQL statements:

```sql
-- User entity
CREATE NODE TABLE User(
  id STRING NOT NULL,
  email STRING,
  role STRING,
  active BOOLEAN,
  PRIMARY KEY(id)
);

CREATE NODE TABLE Resource(
  id STRING NOT NULL,
  name STRING,
  PRIMARY KEY(id)
);

-- Relationship Tables
CREATE REL TABLE has_permission(FROM User TO Resource, permission STRING NOT NULL);
```

## Type Mapping

| Schema Type | TypeScript          | KuzuDB SQL |
| ----------- | ------------------- | ---------- |
| string      | string              | STRING     |
| number      | number              | DOUBLE     |
| integer     | number              | INT64      |
| boolean     | boolean             | BOOLEAN    |
| date        | Date \| string      | DATE       |
| timestamp   | Date \| string      | TIMESTAMP  |
| json        | Record<string, any> | STRING     |
| enum        | 'val1' \| 'val2'    | STRING     |

## Testing

```bash
pnpm test          # Run all tests
pnpm test:watch    # Watch mode
```

Test Coverage:

- ✅ YAML/JSON parsing (4 tests)
- ✅ TypeScript generation (7 tests)
- ✅ SQL generation (8 tests)
- ✅ Full compilation (2 tests)
- ✅ Edge cases (3 tests)

## Example

See `example.yaml` for a complete authorization schema with:

- User, Group, Resource, Role entities
- Multiple relationship types
- Enum fields
- Timestamps
- Property-enriched relationships

Run the example:

```bash
pnpm build
node dist/cli.js example.yaml ./generated
```

Output files:

- `generated/example.types.ts` - TypeScript interfaces
- `generated/example.sql` - KuzuDB SQL schema

## Architecture

```
YAML/JSON Input
     ↓
SchemaParser
     ↓
   AST (Abstract Syntax Tree)
     ↓
  ┌──┴──┐
  ↓     ↓
TypeGen  SQLGen
  ↓     ↓
  └──┬──┘
     ↓
Output (types.ts, schema.sql)
```

## Next Steps

**Phase 2.3: Hot Reload System** (Next)

- [ ] Watch schema files for changes
- [ ] Automatic recompilation
- [ ] Live reload in development
- [ ] Schema version management

See [PHASE_2_SCHEMA_INFRASTRUCTURE.md](../../docs/multi-tenant-migration/details/PHASE_2_SCHEMA_INFRASTRUCTURE.md) for full roadmap.
