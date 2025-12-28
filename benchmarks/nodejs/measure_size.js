#!/usr/bin/env node
/**
 * Measure Node.js KuzuDB package size
 * Run this after installing kuzu: npm install kuzu
 */

const fs = require("fs");
const path = require("path");

function getDirectorySize(dirPath) {
  let totalSize = 0;

  try {
    const items = fs.readdirSync(dirPath, { withFileTypes: true });

    for (const item of items) {
      const itemPath = path.join(dirPath, item.name);

      if (item.isFile()) {
        totalSize += fs.statSync(itemPath).size;
      } else if (item.isDirectory()) {
        totalSize += getDirectorySize(itemPath);
      }
    }
  } catch (err) {
    // Permission denied or other error
  }

  return totalSize;
}

function formatSize(bytes) {
  const units = ["B", "KB", "MB", "GB"];
  let size = bytes;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }

  return `${size.toFixed(2)} ${units[unitIndex]}`;
}

function findFiles(dir, extensions) {
  let results = [];

  try {
    const items = fs.readdirSync(dir, { withFileTypes: true });

    for (const item of items) {
      const itemPath = path.join(dir, item.name);

      if (item.isFile()) {
        const ext = path.extname(item.name);
        if (extensions.includes(ext)) {
          results.push(itemPath);
        }
      } else if (item.isDirectory()) {
        results = results.concat(findFiles(itemPath, extensions));
      }
    }
  } catch (err) {
    // Ignore errors
  }

  return results;
}

function main() {
  console.log("=".repeat(60));
  console.log("Node.js KuzuDB Package Size Measurement");
  console.log("=".repeat(60));

  try {
    // Try to resolve kuzu package
    const kuzuPath = require.resolve("kuzu");
    const kuzuDir = path.dirname(kuzuPath);
    const packageRoot = path.join(kuzuDir, "..");

    console.log(`\nPackage location: ${packageRoot}`);

    // Measure total size
    const totalSize = getDirectorySize(packageRoot);
    console.log(`Total package size: ${formatSize(totalSize)}`);

    // Find native bindings
    const nativeExtensions = [".node", ".so", ".dylib", ".dll"];
    const nativeFiles = findFiles(packageRoot, nativeExtensions);

    let nativeSize = 0;
    if (nativeFiles.length > 0) {
      console.log("\nNative binding files:");
      for (const file of nativeFiles) {
        const size = fs.statSync(file).size;
        nativeSize += size;
        console.log(`  - ${path.basename(file)}: ${formatSize(size)}`);
      }
      console.log(`\nTotal native size: ${formatSize(nativeSize)}`);
      console.log(
        `JavaScript/metadata size: ${formatSize(totalSize - nativeSize)}`
      );
    } else {
      console.log("\nNo native binding files found");
    }

    // Save results
    const results = {
      platform: "Node.js",
      total_bytes: totalSize,
      native_bytes: nativeSize,
      total_formatted: formatSize(totalSize),
      native_formatted: formatSize(nativeSize),
    };

    const resultsDir = path.join(__dirname, "..", "..", "results");
    if (!fs.existsSync(resultsDir)) {
      fs.mkdirSync(resultsDir, { recursive: true });
    }

    const outputFile = path.join(resultsDir, "nodejs_library_size.json");
    fs.writeFileSync(outputFile, JSON.stringify(results, null, 2));

    console.log(`\n📊 Results saved to: ${outputFile}`);
  } catch (err) {
    console.error("❌ Error: KuzuDB package not found");
    console.error("   Run: npm install kuzu");
    console.error(`   ${err.message}`);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}
