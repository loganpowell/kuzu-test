/**
 * Validation Error Types
 *
 * Phase 2.1: Schema Validation Rules
 */

export type ErrorSeverity = "error" | "warning" | "info";

export interface ValidationError {
  type: ErrorSeverity;
  message: string;
  path: string;
  line?: number;
  column?: number;
  suggestion?: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationError[];
}

export class ValidationException extends Error {
  constructor(public errors: ValidationError[]) {
    super(`Schema validation failed with ${errors.length} error(s)`);
    this.name = "ValidationException";
  }
}
