#!/usr/bin/env python3
"""
PhishGuard Release Packager
Generates clean, production-ready distribution ZIP files free of temporary caches,
virtual environments, and system metadata (.DS_Store).

Outputs:
  - dist/phishguard-full-project.zip  (Complete project with 1-click launchers & backend)
  - dist/phishguard-extension-only.zip (Browser extension only, ready for distribution)
"""

import os
import shutil
import zipfile
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent
DIST_DIR = ROOT_DIR / "dist"

EXCLUDE_PATTERNS = {
    ".DS_Store",
    "__pycache__",
    ".pytest_cache",
    ".coverage",
    ".venv",
    "venv",
    ".git",
    "dist",
    ".deps_installed",
    ".installed_requirements"
}


def should_exclude(path: Path) -> bool:
    for part in path.parts:
        if part in EXCLUDE_PATTERNS or part.endswith(".pyc") or part.endswith(".pyo"):
            return True
    return False


def build_full_zip():
    DIST_DIR.mkdir(exist_ok=True)
    out_zip = DIST_DIR / "phishguard-full-project.zip"
    if out_zip.exists():
        out_zip.unlink()

    included_items = [
        "backend",
        "extension",
        "benchmarks",
        "demo",
        "docs",
        "start.sh",
        "start.bat",
        "run_windows.ps1",
        "Dockerfile",
        "docker-compose.yml",
        "README.md",
        ".gitignore",
    ]

    print("[*] Creating dist/phishguard-full-project.zip ...")
    with zipfile.ZipFile(out_zip, "w", zipfile.ZIP_DEFLATED) as zf:
        for item_name in included_items:
            item_path = ROOT_DIR / item_name
            if not item_path.exists():
                continue

            if item_path.is_file():
                zf.write(item_path, arcname=f"phishguard/{item_name}")
            else:
                for file_path in item_path.rglob("*"):
                    if file_path.is_file() and not should_exclude(file_path):
                        rel_path = file_path.relative_to(ROOT_DIR)
                        zf.write(file_path, arcname=f"phishguard/{rel_path}")

    size_mb = out_zip.stat().st_size / (1024 * 1024)
    print(f"    ✓ dist/phishguard-full-project.zip ({size_mb:.2f} MB)")


def build_extension_zip():
    DIST_DIR.mkdir(exist_ok=True)
    out_zip = DIST_DIR / "phishguard-extension-only.zip"
    if out_zip.exists():
        out_zip.unlink()

    ext_dir = ROOT_DIR / "extension"
    if not ext_dir.exists():
        return

    print("[*] Creating dist/phishguard-extension-only.zip ...")
    with zipfile.ZipFile(out_zip, "w", zipfile.ZIP_DEFLATED) as zf:
        for file_path in ext_dir.rglob("*"):
            if file_path.is_file() and not should_exclude(file_path):
                rel_path = file_path.relative_to(ext_dir)
                zf.write(file_path, arcname=str(rel_path))

    size_kb = out_zip.stat().st_size / 1024
    print(f"    ✓ dist/phishguard-extension-only.zip ({size_kb:.1f} KB)")


def main():
    print("=" * 64)
    print("       🛡️  PhishGuard Distribution Packaging Utility")
    print("=" * 64)

    build_full_zip()
    build_extension_zip()

    print("\n" + "=" * 64)
    print("  [SUCCESS] All distribution packages generated in dist/")
    print("=" * 64)
    print("You can upload dist/phishguard-full-project.zip to GitHub Releases")
    print("or share it directly with evaluators and users.\n")


if __name__ == "__main__":
    main()
