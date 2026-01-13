/**
 * YAML/JSON Schema Parser
 *
 * Phase 2.2: Schema Compiler
 */

import YAML from "yaml";
import { SchemaAST, EntityNode, RelationshipNode } from "./types.js";

export class SchemaParser {
  /**
   * Parse YAML or JSON schema into AST
   */
  parse(content: string, format: "yaml" | "json" = "yaml"): SchemaAST {
    const raw = format === "yaml" ? YAML.parse(content) : JSON.parse(content);

    return this.buildAST(raw);
  }

  /**
   * Parse YAML file
   */
  parseYAML(content: string): SchemaAST {
    return this.parse(content, "yaml");
  }

  /**
   * Parse JSON file
   */
  parseJSON(content: string): SchemaAST {
    return this.parse(content, "json");
  }

  private buildAST(raw: any): SchemaAST {
    if (!raw.version || !raw.name || !raw.entities) {
      throw new Error(
        "Invalid schema: missing required fields (version, name, entities)"
      );
    }

    const entities: Record<string, EntityNode> = {};

    // Parse entities
    for (const [name, entityDef] of Object.entries(
      raw.entities as Record<string, any>
    )) {
      entities[name] = {
        name,
        description: entityDef.description,
        fields: entityDef.fields || [],
        indexes: entityDef.indexes,
      };
    }

    // Parse relationships
    const relationships: Record<string, RelationshipNode> = {};
    if (raw.relationships) {
      for (const [name, relDef] of Object.entries(
        raw.relationships as Record<string, any>
      )) {
        relationships[name] = {
          name,
          description: relDef.description,
          from: relDef.from,
          to: relDef.to,
          properties: relDef.properties,
          cardinality: relDef.cardinality,
        };
      }
    }

    return {
      version: raw.version,
      name: raw.name,
      description: raw.description,
      entities,
      relationships:
        Object.keys(relationships).length > 0 ? relationships : undefined,
    };
  }
}
