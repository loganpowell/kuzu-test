#!/usr/bin/env tsx

/**
 * Run the Document Management System Example
 *
 * This script demonstrates a complete full-stack authorization flow
 * with realistic scenarios.
 *
 * Usage:
 *   npm run example:docs
 */

import { runDocumentSystemExample } from "../src/examples/document-system";

runDocumentSystemExample()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error("Error running example:", error);
    process.exit(1);
  });
