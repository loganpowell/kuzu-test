import { defineConfig } from "vite";
import { writeFile, mkdir } from "fs/promises";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default defineConfig({
  server: {
    port: 3000,
    open: false,
    headers: {
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
    },
  },
  build: {
    outDir: "dist",
    sourcemap: true,
  },
  optimizeDeps: {
    exclude: ["kuzu-wasm"],
  },
  plugins: [
    {
      name: "save-results",
      configureServer(server) {
        server.middlewares.use(async (req, res, next) => {
          if (req.url === "/api/save-results" && req.method === "POST") {
            let body = "";
            req.on("data", (chunk) => {
              body += chunk.toString();
            });
            req.on("end", async () => {
              try {
                const data = JSON.parse(body);
                const resultsDir = join(__dirname, "results");

                // Create results directory if it doesn't exist
                await mkdir(resultsDir, { recursive: true });

                // Generate filename from timestamp
                const timestamp = data.metadata.timestamp
                  .replace(/[:.]/g, "-")
                  .slice(0, -5);
                const filename = `client-benchmark-${timestamp}.json`;
                const filepath = join(resultsDir, filename);

                // Write file
                await writeFile(filepath, JSON.stringify(data, null, 2));

                res.writeHead(200, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ success: true, filename, filepath }));

                console.log(`✅ Saved benchmark results to: ${filepath}`);
              } catch (error) {
                console.error("Error saving results:", error);
                res.writeHead(500, { "Content-Type": "application/json" });
                res.end(
                  JSON.stringify({ success: false, error: error.message })
                );
              }
            });
          } else {
            next();
          }
        });
      },
    },
  ],
});
