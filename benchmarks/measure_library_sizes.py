#!/usr/bin/env python3
"""
Measure the size of KuzuDB library installations across different platforms.
This helps determine deployment footprint for each client API.
"""

import os
import sys
import json
from pathlib import Path
import subprocess


def get_directory_size(path):
    """Calculate total size of a directory in bytes."""
    total = 0
    try:
        for entry in os.scandir(path):
            if entry.is_file(follow_symlinks=False):
                total += entry.stat().st_size
            elif entry.is_dir(follow_symlinks=False):
                total += get_directory_size(entry.path)
    except PermissionError:
        pass
    return total


def format_size(bytes_size):
    """Format bytes to human-readable format."""
    for unit in ["B", "KB", "MB", "GB"]:
        if bytes_size < 1024.0:
            return f"{bytes_size:.2f} {unit}"
        bytes_size /= 1024.0
    return f"{bytes_size:.2f} TB"


def measure_python_kuzu():
    """Measure Python kuzu package size."""
    print("=" * 60)
    print("Measuring Python KuzuDB Package Size")
    print("=" * 60)

    try:
        import kuzu

        kuzu_path = Path(kuzu.__file__).parent

        # Get total package size
        total_size = get_directory_size(kuzu_path)

        # Find .so files (native libraries)
        so_files = (
            list(kuzu_path.rglob("*.so"))
            + list(kuzu_path.rglob("*.dylib"))
            + list(kuzu_path.rglob("*.pyd"))
        )
        so_size = sum(os.path.getsize(f) for f in so_files)

        print(f"\nPackage location: {kuzu_path}")
        print(f"Total package size: {format_size(total_size)}")
        print(f"Native library size: {format_size(so_size)}")
        print(f"Python/metadata size: {format_size(total_size - so_size)}")

        if so_files:
            print(f"\nNative library files:")
            for so_file in so_files:
                print(f"  - {so_file.name}: {format_size(os.path.getsize(so_file))}")

        return {
            "platform": "Python",
            "total_bytes": total_size,
            "native_bytes": so_size,
            "total_formatted": format_size(total_size),
            "native_formatted": format_size(so_size),
        }
    except ImportError:
        print("❌ KuzuDB not installed in Python environment")
        return None


def measure_nodejs_kuzu():
    """Measure Node.js kuzu package size."""
    print("\n" + "=" * 60)
    print("Measuring Node.js KuzuDB Package Size")
    print("=" * 60)

    nodejs_dir = Path(__file__).parent.parent / "benchmarks" / "nodejs"
    node_modules = nodejs_dir / "node_modules" / "kuzu"

    if not node_modules.exists():
        print(f"❌ KuzuDB not installed in {nodejs_dir}")
        print("   Run: cd benchmarks/nodejs && npm install kuzu")
        return None

    # Get total package size
    total_size = get_directory_size(node_modules)

    # Find native bindings
    native_files = (
        list(node_modules.rglob("*.node"))
        + list(node_modules.rglob("*.dylib"))
        + list(node_modules.rglob("*.so"))
    )
    native_size = sum(os.path.getsize(f) for f in native_files)

    print(f"\nPackage location: {node_modules}")
    print(f"Total package size: {format_size(total_size)}")
    print(f"Native binding size: {format_size(native_size)}")
    print(f"JavaScript/metadata size: {format_size(total_size - native_size)}")

    if native_files:
        print(f"\nNative binding files:")
        for native_file in native_files:
            print(
                f"  - {native_file.name}: {format_size(os.path.getsize(native_file))}"
            )

    return {
        "platform": "Node.js",
        "total_bytes": total_size,
        "native_bytes": native_size,
        "total_formatted": format_size(total_size),
        "native_formatted": format_size(native_size),
    }


def measure_wasm_kuzu():
    """Measure WASM kuzu bundle size."""
    print("\n" + "=" * 60)
    print("Measuring WASM KuzuDB Bundle Size")
    print("=" * 60)

    wasm_dir = Path(__file__).parent.parent / "benchmarks" / "wasm"

    # Look for WASM files
    wasm_files = list(wasm_dir.rglob("*.wasm"))

    if not wasm_files:
        print(f"❌ WASM files not found in {wasm_dir}")
        print("   WASM package needs to be set up")
        return None

    results = []
    for wasm_file in wasm_files:
        size = os.path.getsize(wasm_file)

        # Try to get gzipped size
        try:
            import gzip
            import io

            with open(wasm_file, "rb") as f:
                with gzip.open(io.BytesIO(), "wb") as gz:
                    gz.write(f.read())
                    gzipped_size = gz.tell()
        except Exception:
            gzipped_size = None

        print(f"\nWASM file: {wasm_file.name}")
        print(f"  Raw size: {format_size(size)}")
        if gzipped_size:
            print(f"  Gzipped size: {format_size(gzipped_size)}")
            print(f"  Compression ratio: {size / gzipped_size:.2f}x")

        results.append(
            {
                "file": wasm_file.name,
                "raw_bytes": size,
                "gzipped_bytes": gzipped_size,
                "raw_formatted": format_size(size),
                "gzipped_formatted": (
                    format_size(gzipped_size) if gzipped_size else "N/A"
                ),
            }
        )

    return {"platform": "WASM", "files": results}


def main():
    """Measure library sizes for all platforms."""
    print("\n🔍 KuzuDB Library Size Measurement\n")

    results = {
        "python": measure_python_kuzu(),
        "nodejs": measure_nodejs_kuzu(),
        "wasm": measure_wasm_kuzu(),
    }

    # Save results
    output_dir = Path(__file__).parent.parent / "results"
    output_dir.mkdir(exist_ok=True)
    output_file = output_dir / "library_sizes.json"

    with open(output_file, "w") as f:
        json.dump(results, f, indent=2)

    print("\n" + "=" * 60)
    print("Summary")
    print("=" * 60)

    if results["python"]:
        print(
            f"\n✅ Python: {results['python']['total_formatted']} (native: {results['python']['native_formatted']})"
        )
    else:
        print("\n❌ Python: Not measured")

    if results["nodejs"]:
        print(
            f"✅ Node.js: {results['nodejs']['total_formatted']} (native: {results['nodejs']['native_formatted']})"
        )
    else:
        print("❌ Node.js: Not measured")

    if results["wasm"] and results["wasm"].get("files"):
        for file_info in results["wasm"]["files"]:
            print(
                f"✅ WASM ({file_info['file']}): {file_info['raw_formatted']} (gzipped: {file_info['gzipped_formatted']})"
            )
    else:
        print("❌ WASM: Not measured")

    print(f"\n📊 Results saved to: {output_file}")


if __name__ == "__main__":
    main()
