#!/usr/bin/env tsx
/**
 * Test Server-Side KuzuDB Validation
 *
 * Tests that the Durable Object correctly validates permissions
 * using the server-side KuzuDB instance.
 */

import fetch from "node-fetch";

const BASE_URL = process.env.WORKER_URL || "http://localhost:8787";
const ORG_ID = "org_fresh_dec29"; // Use existing org with data

interface ValidationResponse {
  allowed: boolean;
  reason?: string;
}

async function testValidation(
  userId: string,
  operation: string,
  resourceId: string
): Promise<void> {
  console.log(`\nTesting: ${userId} ${operation} ${resourceId}`);

  try {
    const response = await fetch(`${BASE_URL}/org/${ORG_ID}/validate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, operation, resourceId }),
    });

    const data = (await response.json()) as ValidationResponse;

    if (response.status === 200) {
      console.log(`✅ ALLOWED: ${userId} can ${operation} ${resourceId}`);
    } else if (response.status === 403) {
      console.log(`❌ DENIED: ${data.reason}`);
    } else {
      console.log(`⚠️  ERROR (${response.status}):`, data);
    }
  } catch (error) {
    console.error(`💥 Request failed:`, error);
  }
}

async function main() {
  console.log("=".repeat(60));
  console.log("Server-Side KuzuDB Validation Tests");
  console.log("=".repeat(60));
  console.log(`Worker URL: ${BASE_URL}`);
  console.log(`Organization: ${ORG_ID}`);

  // Test 1: Valid permission (should be allowed) - using real data
  await testValidation("user_000094", "read", "resource_000000");

  // Test 2: Invalid permission (should be denied)
  await testValidation("user_000094", "delete", "resource_000000");

  // Test 3: Different user-resource pair
  await testValidation("user_000867", "read", "resource_000000");

  // Test 4: Non-existent user (should be denied)
  await testValidation("user_nonexistent", "read", "resource_000000");

  // Test 5: Non-existent resource (should be denied)
  await testValidation("user_000094", "read", "resource_nonexistent");

  // Test 6: All operations for user_000094 on resource_000000
  console.log("\n" + "=".repeat(60));
  console.log("Testing all operations for user_000094 on resource_000000:");
  console.log("=".repeat(60));

  for (const op of ["create", "read", "update", "delete"]) {
    await testValidation("user_000094", op, "resource_000000");
  }

  console.log("\n" + "=".repeat(60));
  console.log("Tests complete!");
  console.log("=".repeat(60));
}

main().catch(console.error);
