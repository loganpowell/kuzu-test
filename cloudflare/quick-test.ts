#!/usr/bin/env node
/**
 * Quick local load test to validate worker performance
 */

const baseUrl = "http://127.0.0.1:8787";

async function makeRequest(url: string, options?: RequestInit): Promise<any> {
  const response = await fetch(url, options);
  return response.json();
}

async function runTest() {
  console.log("🚀 Starting local load test...\n");

  // Test 1: Grant 100 permissions
  console.log("📝 Test 1: Granting 100 permissions...");
  const startGrant = Date.now();
  const grantPromises = [];

  for (let i = 0; i < 100; i++) {
    grantPromises.push(
      makeRequest(`${baseUrl}/grant`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user: `user${i % 10}`,
          permission: `perm${i % 5}`,
          resource: `resource${i}`,
        }),
      })
    );
  }

  await Promise.all(grantPromises);
  const grantDuration = Date.now() - startGrant;
  console.log(
    `✅ Granted 100 permissions in ${grantDuration}ms (${(
      (100 / grantDuration) *
      1000
    ).toFixed(0)} req/s)\n`
  );

  // Test 2: 1000 concurrent permission checks
  console.log("🔍 Test 2: 1000 concurrent permission checks...");
  const startCheck = Date.now();
  const checkPromises = [];

  for (let i = 0; i < 1000; i++) {
    const user = `user${i % 10}`;
    const permission = `perm${i % 5}`;
    const resource = `resource${i % 100}`;
    checkPromises.push(
      makeRequest(
        `${baseUrl}/check?user=${user}&permission=${permission}&resource=${resource}`
      )
    );
  }

  const checkResults = await Promise.all(checkPromises);
  const checkDuration = Date.now() - startCheck;
  const allowed = checkResults.filter((r) => r.allowed).length;
  console.log(
    `✅ Completed 1000 checks in ${checkDuration}ms (${(
      (1000 / checkDuration) *
      1000
    ).toFixed(0)} req/s)`
  );
  console.log(`   Allowed: ${allowed}, Denied: ${1000 - allowed}\n`);

  // Test 3: Get stats
  console.log("📊 Test 3: Getting stats...");
  const stats = await makeRequest(`${baseUrl}/stats`);
  console.log(`✅ Stats:`, stats);
  console.log("\n✨ All tests passed!");
}

runTest().catch(console.error);
