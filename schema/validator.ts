/**
 * Schema Validator
 *
 * Phase 2.1: Schema Validation Rules
 *
 * Validates schema definitions for:
 * - Required fields
 * - Type checking
 * - Entity references
 * - Circular dependencies
 * - Reserved keywords
 * - Naming conventions
 */

import { ValidationError, ValidationResult } from "./validation-errors";

// Reserved keywords that cannot be used as entity/field names
const RESERVED_KEYWORDS = new Set([
  "id",
  "type",
  "from",
  "to",
  "node",
  "rel",
  "table",
  "create",
  "drop",
  "select",
  "insert",
  "update",
  "delete",
  "where",
  "and",
  "or",
  "not",
  "null",
  "true",
  "false",
  "schema",
  "database",
  "index",
]);

// Valid data types
const VALID_TYPES = new Set([
  "string",
  "number",
  "integer",
  "boolean",
  "date",
  "timestamp",
  "json",
  "enum",
]);

export interface Schema {
  version: string;
  name: string;
  description?: string;
  entities: Record<string, Entity>;
  relationships?: Record<string, Relationship>;
}

export interface Entity {
  description?: string;
  fields: Field[];
  indexes?: Index[];
}

export interface Relationship {
  description?: string;
  from: string;
  to: string;
  properties?: Field[];
  cardinality?: "one-to-one" | "one-to-many" | "many-to-many";
}

export interface Field {
  name: string;
  type: string;
  required?: boolean;
  unique?: boolean;
  pattern?: string;
  enum?: string[];
  min?: number;
  max?: number;
  default?: any;
}

export interface Index {
  fields: string[];
  unique?: boolean;
}

export class SchemaValidator {
  validate(schema: Schema): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationError[] = [];

    // Validate top-level schema
    this.validateTopLevel(schema, errors);

    // Validate entities
    this.validateEntities(schema, errors, warnings);

    // Validate relationships
    if (schema.relationships) {
      this.validateRelationships(schema, errors, warnings);
    }

    // Check for circular dependencies
    this.detectCircularDependencies(schema, errors);

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  private validateTopLevel(schema: Schema, errors: ValidationError[]): void {
    // Version is required
    if (!schema.version) {
      errors.push({
        type: "error",
        message: "Schema version is required",
        path: "version",
      });
    } else if (!/^\d+\.\d+(\.\d+)?$/.test(schema.version)) {
      errors.push({
        type: "error",
        message:
          'Schema version must follow semver format (e.g., "1.0" or "1.2.3")',
        path: "version",
        suggestion: 'Use format like "1.0" or "1.2.3"',
      });
    }

    // Name is required
    if (!schema.name) {
      errors.push({
        type: "error",
        message: "Schema name is required",
        path: "name",
      });
    } else if (schema.name.length > 100) {
      errors.push({
        type: "error",
        message: "Schema name must be 100 characters or less",
        path: "name",
      });
    }

    // At least one entity is required
    if (!schema.entities || Object.keys(schema.entities).length === 0) {
      errors.push({
        type: "error",
        message: "Schema must define at least one entity",
        path: "entities",
      });
    }
  }

  private validateEntities(
    schema: Schema,
    errors: ValidationError[],
    warnings: ValidationError[]
  ): void {
    for (const [entityName, entity] of Object.entries(schema.entities)) {
      const basePath = `entities.${entityName}`;

      // Validate entity name
      this.validateIdentifier(entityName, basePath, errors);

      // Check for reserved keywords
      if (RESERVED_KEYWORDS.has(entityName.toLowerCase())) {
        errors.push({
          type: "error",
          message: `Entity name "${entityName}" is a reserved keyword`,
          path: basePath,
          suggestion: `Choose a different name like "${entityName}Entity"`,
        });
      }

      // Entity must have fields
      if (!entity.fields || entity.fields.length === 0) {
        errors.push({
          type: "error",
          message: `Entity "${entityName}" must have at least one field`,
          path: `${basePath}.fields`,
        });
        continue;
      }

      // Validate fields
      const fieldNames = new Set<string>();
      let hasPrimaryKey = false;

      for (let i = 0; i < entity.fields.length; i++) {
        const field = entity.fields[i];
        const fieldPath = `${basePath}.fields[${i}]`;

        // Validate field name
        if (!field.name) {
          errors.push({
            type: "error",
            message: "Field name is required",
            path: `${fieldPath}.name`,
          });
          continue;
        }

        this.validateIdentifier(field.name, `${fieldPath}.name`, errors);

        // Check for duplicate field names
        if (fieldNames.has(field.name)) {
          errors.push({
            type: "error",
            message: `Duplicate field name "${field.name}" in entity "${entityName}"`,
            path: fieldPath,
          });
        }
        fieldNames.add(field.name);

        // Check for reserved keywords
        if (RESERVED_KEYWORDS.has(field.name.toLowerCase())) {
          warnings.push({
            type: "warning",
            message: `Field name "${field.name}" is a reserved keyword`,
            path: `${fieldPath}.name`,
            suggestion: `Consider using a different name`,
          });
        }

        // Validate field type
        if (!field.type) {
          errors.push({
            type: "error",
            message: "Field type is required",
            path: `${fieldPath}.type`,
          });
        } else if (!VALID_TYPES.has(field.type)) {
          errors.push({
            type: "error",
            message: `Invalid field type "${field.type}"`,
            path: `${fieldPath}.type`,
            suggestion: `Use one of: ${Array.from(VALID_TYPES).join(", ")}`,
          });
        }

        // Validate enum values
        if (field.type === "enum") {
          if (!field.enum || field.enum.length === 0) {
            errors.push({
              type: "error",
              message: "Enum field must have at least one value",
              path: `${fieldPath}.enum`,
            });
          }
        }

        // Validate pattern if present
        if (field.pattern) {
          try {
            new RegExp(field.pattern);
          } catch (e) {
            errors.push({
              type: "error",
              message: `Invalid regex pattern: ${(e as Error).message}`,
              path: `${fieldPath}.pattern`,
            });
          }
        }

        // Validate min/max constraints
        if (field.min !== undefined && field.max !== undefined) {
          if (field.min > field.max) {
            errors.push({
              type: "error",
              message:
                "Field min value must be less than or equal to max value",
              path: fieldPath,
            });
          }
        }

        // Track primary keys (convention: 'id' field or explicitly marked)
        if (field.name === "id") {
          hasPrimaryKey = true;
        }
      }

      // Warn if no primary key field
      if (!hasPrimaryKey) {
        warnings.push({
          type: "warning",
          message: `Entity "${entityName}" has no 'id' field`,
          path: basePath,
          suggestion: 'Consider adding an "id" field as a unique identifier',
        });
      }

      // Validate indexes
      if (entity.indexes) {
        for (let i = 0; i < entity.indexes.length; i++) {
          const index = entity.indexes[i];
          const indexPath = `${basePath}.indexes[${i}]`;

          if (!index.fields || index.fields.length === 0) {
            errors.push({
              type: "error",
              message: "Index must specify at least one field",
              path: `${indexPath}.fields`,
            });
          }

          // Validate that indexed fields exist
          for (const fieldName of index.fields || []) {
            if (!fieldNames.has(fieldName)) {
              errors.push({
                type: "error",
                message: `Index references non-existent field "${fieldName}"`,
                path: indexPath,
                suggestion: `Available fields: ${Array.from(fieldNames).join(
                  ", "
                )}`,
              });
            }
          }
        }
      }
    }
  }

  private validateRelationships(
    schema: Schema,
    errors: ValidationError[],
    warnings: ValidationError[]
  ): void {
    const entityNames = new Set(Object.keys(schema.entities));

    for (const [relName, rel] of Object.entries(schema.relationships!)) {
      const basePath = `relationships.${relName}`;

      // Validate relationship name
      this.validateIdentifier(relName, basePath, errors);

      // Validate 'from' entity exists
      if (!rel.from) {
        errors.push({
          type: "error",
          message: 'Relationship must specify "from" entity',
          path: `${basePath}.from`,
        });
      } else if (!entityNames.has(rel.from)) {
        errors.push({
          type: "error",
          message: `Relationship references non-existent entity "${rel.from}"`,
          path: `${basePath}.from`,
          suggestion: this.suggestEntityName(rel.from, entityNames),
        });
      }

      // Validate 'to' entity exists
      if (!rel.to) {
        errors.push({
          type: "error",
          message: 'Relationship must specify "to" entity',
          path: `${basePath}.to`,
        });
      } else if (!entityNames.has(rel.to)) {
        errors.push({
          type: "error",
          message: `Relationship references non-existent entity "${rel.to}"`,
          path: `${basePath}.to`,
          suggestion: this.suggestEntityName(rel.to, entityNames),
        });
      }

      // Validate cardinality if specified
      if (rel.cardinality) {
        const validCardinalities = [
          "one-to-one",
          "one-to-many",
          "many-to-many",
        ];
        if (!validCardinalities.includes(rel.cardinality)) {
          errors.push({
            type: "error",
            message: `Invalid cardinality "${rel.cardinality}"`,
            path: `${basePath}.cardinality`,
            suggestion: `Use one of: ${validCardinalities.join(", ")}`,
          });
        }
      }

      // Validate relationship properties (if any)
      if (rel.properties) {
        const propNames = new Set<string>();
        for (let i = 0; i < rel.properties.length; i++) {
          const prop = rel.properties[i];
          const propPath = `${basePath}.properties[${i}]`;

          if (!prop.name) {
            errors.push({
              type: "error",
              message: "Property name is required",
              path: `${propPath}.name`,
            });
            continue;
          }

          this.validateIdentifier(prop.name, `${propPath}.name`, errors);

          // Check for duplicate property names
          if (propNames.has(prop.name)) {
            errors.push({
              type: "error",
              message: `Duplicate property name "${prop.name}"`,
              path: propPath,
            });
          }
          propNames.add(prop.name);

          // Validate property type
          if (!prop.type) {
            errors.push({
              type: "error",
              message: "Property type is required",
              path: `${propPath}.type`,
            });
          } else if (!VALID_TYPES.has(prop.type)) {
            errors.push({
              type: "error",
              message: `Invalid property type "${prop.type}"`,
              path: `${propPath}.type`,
              suggestion: `Use one of: ${Array.from(VALID_TYPES).join(", ")}`,
            });
          }
        }
      }
    }
  }

  private detectCircularDependencies(
    schema: Schema,
    errors: ValidationError[]
  ): void {
    if (!schema.relationships) return;

    // Build dependency graph
    const graph = new Map<string, Set<string>>();
    for (const entity of Object.keys(schema.entities)) {
      graph.set(entity, new Set());
    }

    for (const rel of Object.values(schema.relationships)) {
      if (rel.from && rel.to && rel.from !== rel.to) {
        graph.get(rel.from)?.add(rel.to);
      }
    }

    // Detect cycles using DFS
    const visited = new Set<string>();
    const recStack = new Set<string>();
    const cycles: string[][] = [];

    const dfs = (node: string, path: string[]): void => {
      visited.add(node);
      recStack.add(node);
      path.push(node);

      const neighbors = graph.get(node) || new Set();
      for (const neighbor of neighbors) {
        if (!visited.has(neighbor)) {
          dfs(neighbor, [...path]);
        } else if (recStack.has(neighbor)) {
          // Found a cycle
          const cycleStart = path.indexOf(neighbor);
          const cycle = [...path.slice(cycleStart), neighbor];
          cycles.push(cycle);
        }
      }

      recStack.delete(node);
    };

    for (const entity of Object.keys(schema.entities)) {
      if (!visited.has(entity)) {
        dfs(entity, []);
      }
    }

    // Report cycles as warnings (they may be intentional)
    for (const cycle of cycles) {
      errors.push({
        type: "warning",
        message: `Circular dependency detected: ${cycle.join(" → ")}`,
        path: "relationships",
        suggestion:
          "Ensure this is intentional. Circular dependencies can cause issues with cascading deletes.",
      });
    }
  }

  private validateIdentifier(
    name: string,
    path: string,
    errors: ValidationError[]
  ): void {
    // Must start with letter or underscore
    if (!/^[a-zA-Z_]/.test(name)) {
      errors.push({
        type: "error",
        message: `Identifier "${name}" must start with a letter or underscore`,
        path,
      });
    }

    // Must contain only letters, numbers, and underscores
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
      errors.push({
        type: "error",
        message: `Identifier "${name}" contains invalid characters`,
        path,
        suggestion: "Use only letters, numbers, and underscores",
      });
    }

    // Length constraints
    if (name.length > 64) {
      errors.push({
        type: "error",
        message: `Identifier "${name}" exceeds maximum length of 64 characters`,
        path,
      });
    }
  }

  private suggestEntityName(
    invalidName: string,
    validNames: Set<string>
  ): string {
    const names = Array.from(validNames);
    const similar = names.filter(
      (name) =>
        name.toLowerCase().includes(invalidName.toLowerCase()) ||
        invalidName.toLowerCase().includes(name.toLowerCase())
    );

    if (similar.length > 0) {
      return `Did you mean "${similar[0]}"?`;
    }

    return `Available entities: ${names.join(", ")}`;
  }
}
