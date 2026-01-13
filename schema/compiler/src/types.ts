/**
 * AST Types for Schema Compiler
 *
 * Phase 2.2: Schema Compiler
 */

export interface SchemaAST {
  version: string;
  name: string;
  description?: string;
  entities: Record<string, EntityNode>;
  relationships?: Record<string, RelationshipNode>;
}

export interface EntityNode {
  name: string;
  description?: string;
  fields: FieldNode[];
  indexes?: IndexNode[];
}

export interface RelationshipNode {
  name: string;
  description?: string;
  from: string;
  to: string;
  properties?: FieldNode[];
  cardinality?: "one-to-one" | "one-to-many" | "many-to-many";
}

export interface FieldNode {
  name: string;
  type: FieldType;
  description?: string;
  required?: boolean;
  unique?: boolean;
  pattern?: string;
  enum?: string[];
  min?: number;
  max?: number;
  default?: any;
}

export interface IndexNode {
  fields: string[];
  unique?: boolean;
}

export type FieldType =
  | "string"
  | "number"
  | "integer"
  | "boolean"
  | "date"
  | "timestamp"
  | "json"
  | "enum";

export interface CompilerOutput {
  types: string;
  sql: string;
  validators?: string;
  loaders?: string;
}
