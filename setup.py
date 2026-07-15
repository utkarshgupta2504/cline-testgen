"""
Build shim: metadata lives in pyproject.toml. This only exists to bundle the Node
project (src/ + package.json + lockfile) INTO the Python package at build time, so the
wheel is self-contained and `pip install git+https://…` works without the repo layout.

The copy runs during `build_py`, before files are collected into the wheel, placing
everything under `cline_py/js/`. In a dev/editable checkout the runtime prefers the
live repo `src/` instead, so this duplication only exists inside built artifacts.
"""
import shutil
from pathlib import Path

from setuptools import setup
from setuptools.command.build_py import build_py

ROOT = Path(__file__).parent


class build_py_with_js(build_py):
    def run(self):
        src = ROOT / "src"
        dst = ROOT / "cline_py" / "js"
        if src.exists():
            dst.mkdir(parents=True, exist_ok=True)
            if (dst / "src").exists():
                shutil.rmtree(dst / "src")
            # copy the JS source (runners, tools, sdk-entry) — never node_modules/logs
            shutil.copytree(src, dst / "src")
            for f in ("package.json", "package-lock.json"):
                p = ROOT / f
                if p.exists():
                    shutil.copy2(p, dst / f)
        super().run()


setup(cmdclass={"build_py": build_py_with_js})
