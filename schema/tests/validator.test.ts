/**
 * Schema Validator Tests
 *
 * Phase 2.1: Schema Validation Rules
 */

import { describe, it, expect } from "vitest";
import { SchemaValidator, Schema } from "../validator";

describe("SchemaValidator", () => {
  const validator = new SchemaValidator();

  describe("Top-Level Validation", () => {
    it("should require version", () => {
      const schema = {
        name: "Test Schema",
        entities: {
          User: {
            fields: [{ name: "id", type: "string" }],
          },
        },
      } as any;

      const result = validator.validate(schema);
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          type: "error",
          message: "Schema version is required",
          path: "version",
        })
      );
    });

    it("should validate version format", () => {
      const schema = {
        version: "invalid",
        name: "Test Schema",
        entities: {
          User: {
            fields: [{ name: "id", type: "string" }],
          },
        },
      } as Schema;

      const result = validator.validate(schema);
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          message: expect.stringContaining("semver format"),
        })
      );
    });

    it("should accept valid version formats", () => {
      const schema1 = {
        version: "1.0",
        name: "Test Schema",
        entities: {
          User: {
            fields: [{ name: "id", type: "string" }],
          },
        },
      } as Schema;

      const schema2 = {
        version: "1.2.3",
        name: "Test Schema",
        entities: {
          User: {
            fields: [{ name: "id", type: "string" }],
          },
        },
      } as Schema;

      expect(validator.validate(schema1).valid).toBe(true);
      expect(validator.validate(schema2).valid).toBe(true);
    });

    it("should require name", () => {
      const schema = {
        version: "1.0",
        entities: {
          User: {
            fields: [{ name: "id", type: "string" }],
          },
        },
      } as any;

      const result = validator.validate(schema);
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          message: "Schema name is required",
        })
      );
    });

    it("should require at least one entity", () => {
      const schema = {
        version: "1.0",
        name: "Test Schema",
        entities: {},
      } as Schema;

      const result = validator.validate(schema);
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          message: expect.stringContaining("at least one entity"),
        })
      );
    });
  });

  describe("Entity Validation", () => {
    it("should validate entity identifier format", () => {
      const schema = {
        version: "1.0",
        name: "Test Schema",
        entities: {
          "123Invalid": {
            fields: [{ name: "id", type: "string" }],
          },
        },
      } as Schema;

      const result = validator.validate(schema);
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          message: expect.stringContaining(
            "must start with a letter or underscore"
          ),
        })
      );
    });

    it("should reject reserved keywords as entity names", () => {
      const schema = {
        version: "1.0",
        name: "Test Schema",
        entities: {
          table: {
            fields: [{ name: "id", type: "string" }],
          },
        },
      } as Schema;

      const result = validator.validate(schema);
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          message: expect.stringContaining("reserved keyword"),
        })
      );
    });

    it("should require at least one field", () => {
      const schema = {
        version: "1.0",
        name: "Test Schema",
        entities: {
          User: {
            fields: [],
          },
        },
      } as Schema;

      const result = validator.validate(schema);
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          message: expect.stringContaining("at least one field"),
        })
      );
    });

    it("should detect duplicate field names", () => {
      const schema = {
        version: "1.0",
        name: "Test Schema",
        entities: {
          User: {
            fields: [
              { name: "id", type: "string" },
              { name: "id", type: "number" },
            ],
          },
        },
      } as Schema;

      const result = validator.validate(schema);
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          message: expect.stringContaining("Duplicate field name"),
        })
      );
    });

    it("should warn about missing primary key", () => {
      const schema = {
        version: "1.0",
        name: "Test Schema",
        entities: {
          User: {
            fields: [{ name: "name", type: "string" }],
          },
        },
      } as Schema;

      const result = validator.validate(schema);
      expect(result.warnings).toContainEqual(
        expect.objectContaining({
          message: expect.stringContaining("no 'id' field"),
        })
      );
    });
  });

  describe("Field Validation", () => {
    it("should require field name", () => {
      const schema = {
        version: "1.0",
        name: "Test Schema",
        entities: {
          User: {
            fields: [{ type: "string" } as any],
          },
        },
      } as Schema;

      const result = validator.validate(schema);
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          message: "Field name is required",
        })
      );
    });

    it("should require field type", () => {
      const schema = {
        version: "1.0",
        name: "Test Schema",
        entities: {
          User: {
            fields: [{ name: "id" } as any],
          },
        },
      } as Schema;

      const result = validator.validate(schema);
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          message: "Field type is required",
        })
      );
    });

    it("should validate field type", () => {
      const schema = {
        version: "1.0",
        name: "Test Schema",
        entities: {
          User: {
            fields: [{ name: "id", type: "invalid-type" }],
          },
        },
      } as Schema;

      const result = validator.validate(schema);
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          message: expect.stringContaining("Invalid field type"),
        })
      );
    });

    it("should accept valid field types", () => {
      const validTypes = [
        "string",
        "number",
        "integer",
        "boolean",
        "date",
        "timestamp",
        "json",
        "enum",
      ];

      for (const type of validTypes) {
        const schema = {
          version: "1.0",
          name: "Test Schema",
          entities: {
            User: {
              fields: [
                { name: "id", type: "string" },
                {
                  name: "field",
                  type,
                  enum: type === "enum" ? ["a", "b"] : undefined,
                },
              ],
            },
          },
        } as Schema;

        const result = validator.validate(schema);
        const typeErrors = result.errors.filter((e) =>
          e.message.includes("Invalid field type")
        );
        expect(typeErrors).toHaveLength(0);
      }
    });

    it("should require enum values for enum type", () => {
      const schema = {
        version: "1.0",
        name: "Test Schema",
        entities: {
          User: {
            fields: [
              { name: "id", type: "string" },
              { name: "status", type: "enum" },
            ],
          },
        },
      } as Schema;

      const result = validator.validate(schema);
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          message: expect.stringContaining(
            "Enum field must have at least one value"
          ),
        })
      );
    });

    it("should validate regex patterns", () => {
      const schema = {
        version: "1.0",
        name: "Test Schema",
        entities: {
          User: {
            fields: [
              { name: "id", type: "string" },
              { name: "email", type: "string", pattern: "[invalid(" },
            ],
          },
        },
      } as Schema;

      const result = validator.validate(schema);
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          message: expect.stringContaining("Invalid regex pattern"),
        })
      );
    });

    it("should validate min/max constraints", () => {
      const schema = {
        version: "1.0",
        name: "Test Schema",
        entities: {
          User: {
            fields: [
              { name: "id", type: "string" },
              { name: "age", type: "number", min: 100, max: 10 },
            ],
          },
        },
      } as Schema;

      const result = validator.validate(schema);
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          message: expect.stringContaining(
            "min value must be less than or equal to max"
          ),
        })
      );
    });
  });

  describe("Index Validation", () => {
    it("should require index fields", () => {
      const schema = {
        version: "1.0",
        name: "Test Schema",
        entities: {
          User: {
            fields: [{ name: "id", type: "string" }],
            indexes: [{ fields: [] }],
          },
        },
      } as Schema;

      const result = validator.validate(schema);
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          message: expect.stringContaining(
            "Index must specify at least one field"
          ),
        })
      );
    });

    it("should validate that indexed fields exist", () => {
      const schema = {
        version: "1.0",
        name: "Test Schema",
        entities: {
          User: {
            fields: [{ name: "id", type: "string" }],
            indexes: [{ fields: ["nonexistent"] }],
          },
        },
      } as Schema;

      const result = validator.validate(schema);
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          message: expect.stringContaining("non-existent field"),
        })
      );
    });
  });

  describe("Relationship Validation", () => {
    it("should require from entity", () => {
      const schema = {
        version: "1.0",
        name: "Test Schema",
        entities: {
          User: {
            fields: [{ name: "id", type: "string" }],
          },
        },
        relationships: {
          belongs_to: {
            to: "User",
          } as any,
        },
      } as Schema;

      const result = validator.validate(schema);
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          message: expect.stringContaining('must specify "from" entity'),
        })
      );
    });

    it("should require to entity", () => {
      const schema = {
        version: "1.0",
        name: "Test Schema",
        entities: {
          User: {
            fields: [{ name: "id", type: "string" }],
          },
        },
        relationships: {
          belongs_to: {
            from: "User",
          } as any,
        },
      } as Schema;

      const result = validator.validate(schema);
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          message: expect.stringContaining('must specify "to" entity'),
        })
      );
    });

    it("should validate that referenced entities exist", () => {
      const schema = {
        version: "1.0",
        name: "Test Schema",
        entities: {
          User: {
            fields: [{ name: "id", type: "string" }],
          },
        },
        relationships: {
          belongs_to: {
            from: "User",
            to: "NonExistent",
          },
        },
      } as Schema;

      const result = validator.validate(schema);
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          message: expect.stringContaining('non-existent entity "NonExistent"'),
        })
      );
    });

    it("should suggest similar entity names", () => {
      const schema = {
        version: "1.0",
        name: "Test Schema",
        entities: {
          User: {
            fields: [{ name: "id", type: "string" }],
          },
        },
        relationships: {
          belongs_to: {
            from: "User",
            to: "Usr",
          },
        },
      } as Schema;

      const result = validator.validate(schema);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          suggestion: expect.stringContaining("User"),
        })
      );
    });

    it("should validate cardinality", () => {
      const schema = {
        version: "1.0",
        name: "Test Schema",
        entities: {
          User: {
            fields: [{ name: "id", type: "string" }],
          },
        },
        relationships: {
          belongs_to: {
            from: "User",
            to: "User",
            cardinality: "invalid" as any,
          },
        },
      } as Schema;

      const result = validator.validate(schema);
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          message: expect.stringContaining("Invalid cardinality"),
        })
      );
    });
  });

  describe("Circular Dependency Detection", () => {
    it("should warn about circular dependencies", () => {
      const schema = {
        version: "1.0",
        name: "Test Schema",
        entities: {
          A: { fields: [{ name: "id", type: "string" }] },
          B: { fields: [{ name: "id", type: "string" }] },
          C: { fields: [{ name: "id", type: "string" }] },
        },
        relationships: {
          a_to_b: { from: "A", to: "B" },
          b_to_c: { from: "B", to: "C" },
          c_to_a: { from: "C", to: "A" },
        },
      } as Schema;

      const result = validator.validate(schema);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          type: "warning",
          message: expect.stringContaining("Circular dependency detected"),
        })
      );
    });

    it("should allow self-referential relationships", () => {
      const schema = {
        version: "1.0",
        name: "Test Schema",
        entities: {
          User: { fields: [{ name: "id", type: "string" }] },
        },
        relationships: {
          manages: { from: "User", to: "User" },
        },
      } as Schema;

      const result = validator.validate(schema);
      const circularErrors = result.errors.filter((e) =>
        e.message.includes("Circular dependency")
      );
      expect(circularErrors).toHaveLength(0);
    });
  });

  describe("Valid Schema", () => {
    it("should accept a complete valid schema", () => {
      const schema = {
        version: "1.0",
        name: "Authorization Schema",
        description: "Multi-tenant authorization graph",
        entities: {
          User: {
            description: "Application user",
            fields: [
              { name: "id", type: "string", required: true },
              {
                name: "email",
                type: "string",
                unique: true,
                pattern: "^[\\w.-]+@[\\w.-]+\\.\\w+$",
              },
              { name: "active", type: "boolean", default: true },
            ],
            indexes: [{ fields: ["email"], unique: true }],
          },
          Group: {
            fields: [
              { name: "id", type: "string", required: true },
              { name: "name", type: "string", required: true },
            ],
          },
          Resource: {
            fields: [
              { name: "id", type: "string", required: true },
              {
                name: "type",
                type: "enum",
                enum: ["document", "folder", "project"],
              },
            ],
          },
        },
        relationships: {
          member_of: {
            from: "User",
            to: "Group",
            cardinality: "many-to-many",
          },
          has_permission: {
            from: "User",
            to: "Resource",
            properties: [
              { name: "permission", type: "string", required: true },
            ],
          },
        },
      } as Schema;

      const result = validator.validate(schema);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });
});
