#!/usr/bin/env python3
"""
HTTP server with COOP/COEP headers for WASM with SharedArrayBuffer support
"""
import http.server
import socketserver
from functools import partial


class CORSRequestHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        # Required headers for SharedArrayBuffer
        self.send_header("Cross-Origin-Opener-Policy", "same-origin")
        self.send_header("Cross-Origin-Embedder-Policy", "require-corp")
        # CORS headers for development
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "*")
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(200)
        self.end_headers()


PORT = 8080

with socketserver.TCPServer(("", PORT), CORSRequestHandler) as httpd:
    print(f"🚀 Server running at http://localhost:{PORT}")
    print(f"📦 WASM benchmarks: http://localhost:{PORT}/benchmarks/wasm/")
    print("✅ COOP/COEP headers enabled for SharedArrayBuffer support")
    print("\nPress Ctrl+C to stop the server")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n\n👋 Server stopped")
