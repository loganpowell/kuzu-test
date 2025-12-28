#!/usr/bin/env python3
"""
Simple HTTP server for WASM benchmarks with POST endpoint to save results.
"""

import json
import os
from datetime import datetime
from http.server import HTTPServer, SimpleHTTPRequestHandler
from pathlib import Path


class BenchmarkServerHandler(SimpleHTTPRequestHandler):
    """HTTP handler that serves files and accepts POST requests to save results."""

    def do_POST(self):
        """Handle POST requests to save benchmark results."""
        if self.path == "/save-results":
            try:
                # Read the request body
                content_length = int(self.headers["Content-Length"])
                post_data = self.rfile.read(content_length)
                results = json.loads(post_data.decode("utf-8"))

                # Save to results directory
                results_dir = Path(__file__).parent.parent.parent / "results"
                results_dir.mkdir(exist_ok=True)

                timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")
                filename = f"kuzu-wasm-benchmark-{timestamp}.json"
                filepath = results_dir / filename

                with open(filepath, "w") as f:
                    json.dump(results, f, indent=2)

                # Send success response
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.send_header("Access-Control-Allow-Origin", "*")
                self.end_headers()
                response = {"success": True, "file": str(filename)}
                self.wfile.write(json.dumps(response).encode())

                print(f"✅ Saved benchmark results to: {filepath}")

            except Exception as e:
                self.send_response(500)
                self.send_header("Content-Type", "application/json")
                self.send_header("Access-Control-Allow-Origin", "*")
                self.end_headers()
                response = {"success": False, "error": str(e)}
                self.wfile.write(json.dumps(response).encode())
                print(f"❌ Error saving results: {e}")
        else:
            self.send_error(404, "Not Found")

    def do_OPTIONS(self):
        """Handle CORS preflight requests."""
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, GET, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()


def run_server(port=8080):
    """Run the server."""
    # Change to project root so paths work correctly
    project_root = Path(__file__).parent.parent.parent
    os.chdir(project_root)

    server_address = ("", port)
    httpd = HTTPServer(server_address, BenchmarkServerHandler)

    print(f"🚀 WASM Benchmark Server running on http://localhost:{port}")
    print(f"📂 Serving files from: {project_root}")
    print(f"💾 Results will be saved to: {project_root / 'results'}")
    print(f"\n🌐 Open: http://localhost:{port}/benchmarks/wasm/")
    print("\nPress Ctrl+C to stop the server")

    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n\n👋 Server stopped")


if __name__ == "__main__":
    run_server()
