/**
 * Schema Compiler Tests
 *
 * Phase 2.2: Schema Compiler
 */

import { describe, it, expect } from "vitest";
import { SchemaCompiler, compile } from "../src/index.js";

const sampleYAML = `
version: "1.0"
name: "Test Schema"
description: "A test authorization schema"

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
        required: true
      - name: active
        type: boolean
        default: true
    indexes:
      - fields: [email]
        unique: true

  Group:
    description: "User group"
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
    description: "User membership in group"
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
`;

describe("SchemaCompiler", () => {
  describe("Parsing", () => {
    it("should parse YAML schema", () => {
      const compiler = new SchemaCompiler();
      const ast = compiler.parseSchema(sampleYAML, "yaml");

      expect(ast.version).toBe("1.0");
      expect(ast.name).toBe("Test Schema");
      expect(Object.keys(ast.entities)).toHaveLength(3);
      expect(ast.entities.User).toBeDefined();
      expect(ast.entities.Group).toBeDefined();
      expect(ast.entities.Resource).toBeDefined();
    });

    it("should parse entity fields", () => {
      const compiler = new SchemaCompiler();
      const ast = compiler.parseSchema(sampleYAML, "yaml");

      const userFields = ast.entities.User.fields;
      expect(userFields).toHaveLength(3);
      expect(userFields[0].name).toBe("id");
      expect(userFields[0].type).toBe("string");
      expect(userFields[0].required).toBe(true);
    });

    it("should parse relationships", () => {
      const compiler = new SchemaCompiler();
      const ast = compiler.parseSchema(sampleYAML, "yaml");

      expect(ast.relationships).toBeDefined();
      expect(Object.keys(ast.relationships!)).toHaveLength(2);
      expect(ast.relationships!.member_of.from).toBe("User");
      expect(ast.relationships!.member_of.to).toBe("Group");
    });

    it("should throw on invalid schema", () => {
      const compiler = new SchemaCompiler();
      const invalidYAML = `
        version: "1.0"
        # Missing name and entities
      `;

      expect(() => {
        compiler.parseSchema(invalidYAML, "yaml");
      }).toThrow("Invalid schema");
    });
  });

  describe("TypeScript Generation", () => {
    it("should generate TypeScript interfaces", () => {
      const output = compile(sampleYAML, "yaml");

      expect(output.types).toContain("export interface User {");
      expect(output.types).toContain("export interface Group {");
      expect(output.types).toContain("export interface Resource {");
    });

    it("should include field types", () => {
      const output = compile(sampleYAML, "yaml");

      expect(output.types).toContain("id: string;");
      expect(output.types).toContain("email: string;");
      expect(output.types).toContain("active?: boolean;");
    });

    it("should handle optional fields", () => {
      const output = compile(sampleYAML, "yaml");

      // Required fields should not have ?
      expect(output.types).toContain("id: string;");
      expect(output.types).toContain("email: string;");

      // Optional fields should have ?
      expect(output.types).toContain("active?: boolean;");
    });

    it("should handle enum types", () => {
      const output = compile(sampleYAML, "yaml");

      expect(output.types).toContain(
        "type?: 'document' | 'folder' | 'project';"
      );
    });

    it("should generate schema type helpers", () => {
      const output = compile(sampleYAML, "yaml");

      expect(output.types).toContain(
        "export type EntityType = 'User' | 'Group' | 'Resource';"
      );
      expect(output.types).toContain("export interface SchemaTypes {");
      expect(output.types).toContain("User: User;");
      expect(output.types).toContain("Group: Group;");
    });

    it("should include JSDoc comments", () => {
      const output = compile(sampleYAML, "yaml");

      expect(output.types).toContain("* Application user");
      expect(output.types).toContain("* User group");
    });

    it("should include generation header", () => {
      const output = compile(sampleYAML, "yaml");

      expect(output.types).toContain("Generated TypeScript Types");
      expect(output.types).toContain("Schema: Test Schema");
      expect(output.types).toContain("Version: 1.0");
      expect(output.types).toContain("DO NOT EDIT MANUALLY");
    });
  });

  describe("SQL Generation", () => {
    it("should generate CREATE NODE TABLE statements", () => {
      const output = compile(sampleYAML, "yaml");

      expect(output.sql).toContain("CREATE NODE TABLE User(");
      expect(output.sql).toContain("CREATE NODE TABLE Group(");
      expect(output.sql).toContain("CREATE NODE TABLE Resource(");
    });

    it("should include field definitions", () => {
      const output = compile(sampleYAML, "yaml");

      expect(output.sql).toContain("id STRING NOT NULL");
      expect(output.sql).toContain("email STRING NOT NULL");
      expect(output.sql).toContain("active BOOLEAN");
    });

    it("should include primary keys", () => {
      const output = compile(sampleYAML, "yaml");

      expect(output.sql).toContain("PRIMARY KEY(id)");
    });

    it("should generate CREATE REL TABLE statements", () => {
      const output = compile(sampleYAML, "yaml");

      expect(output.sql).toContain(
        "CREATE REL TABLE member_of(FROM User TO Group);"
      );
      expect(output.sql).toContain(
        "CREATE REL TABLE has_permission(FROM User TO Resource, permission STRING NOT NULL);"
      );
    });

    it("should handle relationship properties", () => {
      const output = compile(sampleYAML, "yaml");

      expect(output.sql).toContain("permission STRING NOT NULL");
    });

    it("should include SQL comments", () => {
      const output = compile(sampleYAML, "yaml");

      expect(output.sql).toContain("-- Application user");
      expect(output.sql).toContain("-- User group");
      expect(output.sql).toContain("-- User membership in group");
    });

    it("should include generation header", () => {
      const output = compile(sampleYAML, "yaml");

      expect(output.sql).toContain("Generated KuzuDB SQL Schema");
      expect(output.sql).toContain("Schema: Test Schema");
      expect(output.sql).toContain("Version: 1.0");
      expect(output.sql).toContain("DO NOT EDIT MANUALLY");
    });

    it("should map field types correctly", () => {
      const yamlWithTypes = `
version: "1.0"
name: "Type Test"
entities:
  Test:
    fields:
      - name: id
        type: string
      - name: count
        type: integer
      - name: amount
        type: number
      - name: active
        type: boolean
      - name: created
        type: timestamp
      - name: data
        type: json
`;
      const output = compile(yamlWithTypes, "yaml");

      expect(output.sql).toContain("id STRING");
      expect(output.sql).toContain("count INT64");
      expect(output.sql).toContain("amount DOUBLE");
      expect(output.sql).toContain("active BOOLEAN");
      expect(output.sql).toContain("created TIMESTAMP");
      expect(output.sql).toContain("data STRING"); // JSON stored as STRING
    });
  });

  describe("Full Compilation", () => {
    it("should compile schema to both TypeScript and SQL", () => {
      const output = compile(sampleYAML, "yaml");

      expect(output.types).toBeTruthy();
      expect(output.sql).toBeTruthy();
      expect(output.types.length).toBeGreaterThan(0);
      expect(output.sql.length).toBeGreaterThan(0);
    });

    it("should handle JSON format", () => {
      const jsonSchema = JSON.stringify({
        version: "1.0",
        name: "JSON Test",
        entities: {
          User: {
            fields: [{ name: "id", type: "string", required: true }],
          },
        },
      });

      const output = compile(jsonSchema, "json");

      expect(output.types).toContain("export interface User");
      expect(output.sql).toContain("CREATE NODE TABLE User");
    });
  });

  describe("Edge Cases", () => {
    it("should handle entities without indexes", () => {
      const simpleYAML = `
version: "1.0"
name: "Simple"
entities:
  User:
    fields:
      - name: id
        type: string
`;
      const output = compile(simpleYAML, "yaml");

      expect(output.types).toContain("export interface User");
      expect(output.sql).toContain("CREATE NODE TABLE User");
    });

    it("should handle schemas without relationships", () => {
      const noRelsYAML = `
version: "1.0"
name: "No Relations"
entities:
  User:
    fields:
      - name: id
        type: string
`;
      const output = compile(noRelsYAML, "yaml");

      expect(output.types).toBeTruthy();
      expect(output.sql).toBeTruthy();
      expect(output.sql).not.toContain("CREATE REL TABLE");
    });

    it("should handle empty descriptions", () => {
      const noDescYAML = `
version: "1.0"
name: "No Descriptions"
entities:
  User:
    fields:
      - name: id
        type: string
`;
      const output = compile(noDescYAML, "yaml");

      expect(output.types).toBeTruthy();
      expect(output.sql).toBeTruthy();
    });
  });
});
