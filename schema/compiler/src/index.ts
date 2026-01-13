/**
 * Schema Compiler Main Entry Point
 *
 * Phase 2.2: Schema Compiler
 */

export { SchemaParser } from "./parser.js";
export { TypeGenerator } from "./generators/type-generator.js";
export { SQLGenerator } from "./generators/sql-generator.js";
export * from "./types.js";

import { SchemaParser } from "./parser.js";
import { TypeGenerator } from "./generators/type-generator.js";
import { SQLGenerator } from "./generators/sql-generator.js";
import type { SchemaAST, CompilerOutput } from "./types.js";

/**
 * Main compiler class that orchestrates parsing and code generation
 */
export class SchemaCompiler {
  private parser: SchemaParser;
  private typeGenerator: TypeGenerator;
  private sqlGenerator: SQLGenerator;

  constructor() {
    this.parser = new SchemaParser();
    this.typeGenerator = new TypeGenerator();
    this.sqlGenerator = new SQLGenerator();
  }

  /**
   * Compile a schema from YAML or JSON string
   */
  compile(content: string, format: "yaml" | "json" = "yaml"): CompilerOutput {
    // Parse schema
    const ast = this.parser.parse(content, format);

    // Generate outputs
    return {
      types: this.typeGenerator.generate(ast),
      sql: this.sqlGenerator.generate(ast),
    };
  }

  /**
   * Compile from AST (useful when schema is already parsed)
   */
  compileFromAST(ast: SchemaAST): CompilerOutput {
    return {
      types: this.typeGenerator.generate(ast),
      sql: this.sqlGenerator.generate(ast),
    };
  }

  /**
   * Parse schema without generating code
   */
  parseSchema(content: string, format: "yaml" | "json" = "yaml"): SchemaAST {
    return this.parser.parse(content, format);
  }
}

/**
 * Convenience function to compile a schema in one call
 */
export function compile(
  content: string,
  format: "yaml" | "json" = "yaml"
): CompilerOutput {
  const compiler = new SchemaCompiler();
  return compiler.compile(content, format);
}
