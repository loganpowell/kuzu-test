# Schema Infrastructure

**Phase 2.1: Schema Format & Validation** ✅ Complete

This directory contains the schema definition format and validation tools for Relish's multi-tenant authorization system.

## Files

- **`relish.schema.json`** - JSON Schema definition for authorization schemas
- **`validator.ts`** - Runtime validator for schema definitions
- **`validation-errors.ts`** - Error types and interfaces
- **`schema.yaml`** - Example schema definition
- **`tests/validator.test.ts`** - Comprehensive test suite (27 tests)

## Schema Format

Schemas are defined in YAML or JSON and include:

- **Entities**: Node types in the authorization graph (User, Group, Resource, etc.)
- **Relationships**: Edge types connecting entities (member_of, has_permission, etc.)
- **Fields**: Properties on entities and relationships
- **Indexes**: Performance optimization for queries

### Example Schema

```yaml
version: "1.0"
name: "Authorization Schema"
description: "Multi-tenant authorization graph"

entities:
  User:
    description: "Application user"
    fields:
      - name: id
        type: string
        required: true
      - name: email
        type: string
        unique: true
        pattern: '^[\w.-]+@[\w.-]+\.\w+$'
      - name: active
        type: boolean
        default: true
    indexes:
      - fields: [email]
        unique: true

  Group:
    fields:
      - name: id
        type: string
        required: true
      - name: name
        type: string
        required: true

  Resource:
    fields:
      - name: id
        type: string
        required: true
      - name: type
        type: enum
        enum: [document, folder, project]

relationships:
  member_of:
    from: User
    to: Group
    cardinality: many-to-many

  has_permission:
    from: User
    to: Resource
    properties:
      - name: permission
        type: string
        required: true
```

## Validation

The `SchemaValidator` provides comprehensive validation:

### Validation Rules

- ✅ **Required Fields**: version, name, entities
- ✅ **Type Checking**: Validates field types (string, number, boolean, etc.)
- ✅ **Entity References**: Ensures relationships reference existing entities
- ✅ **Circular Dependencies**: Detects and warns about cycles
- ✅ **Reserved Keywords**: Prevents use of SQL/KuzuDB keywords
- ✅ **Naming Conventions**: Enforces valid identifiers
- ✅ **Pattern Validation**: Validates regex patterns
- ✅ **Constraints**: Validates min/max, enum values, uniqueness

### Error Messages

The validator provides helpful error messages with:

- **Clear descriptions**: "Entity name 'table' is a reserved keyword"
- **Path information**: `entities.User.fields[2].pattern`
- **Suggestions**: "Did you mean 'User'?" or "Available entities: User, Group, Resource"
- **Severity levels**: error, warning, info

### Usage

```typescript
import { SchemaValidator } from "./validator";
import { Schema } from "./validator";

const validator = new SchemaValidator();
const schema: Schema = {
  version: "1.0",
  name: "My Schema",
  entities: {
    User: {
      fields: [
        { name: "id", type: "string", required: true },
        { name: "email", type: "string", unique: true },
      ],
    },
  },
};

const result = validator.validate(schema);

if (!result.valid) {
  console.error("Schema validation failed:");
  result.errors.forEach((error) => {
    console.error(`  ${error.type}: ${error.message}`);
    console.error(`    at ${error.path}`);
    if (error.suggestion) {
      console.error(`    → ${error.suggestion}`);
    }
  });
}
```

## Testing

Run the test suite:

```bash
cd schema
npx vitest run tests/validator.test.ts
```

All 27 tests passing:

- Top-level validation (5 tests)
- Entity validation (5 tests)
- Field validation (7 tests)
- Index validation (2 tests)
- Relationship validation (5 tests)
- Circular dependency detection (2 tests)
- Valid schema acceptance (1 test)

## Next Steps

**Phase 2.2: Schema Compiler** (Next)

- [ ] Generate TypeScript types from schema
- [ ] Generate runtime validators
- [ ] Generate CSV loaders
- [ ] Generate index definitions
- [ ] Generate test templates

See [PHASE_2_SCHEMA_INFRASTRUCTURE.md](../docs/multi-tenant-migration/details/PHASE_2_SCHEMA_INFRASTRUCTURE.md) for full roadmap.
