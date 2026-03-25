"""
STEP to GLB converter using FreeCAD
File: app/services/step_converter.py

Requirements:
- FreeCAD (Windows/Linux)
- trimesh
- numpy

Install:
pip install trimesh numpy
"""

import tempfile
import os
import subprocess
import logging
import shutil
import io
from pathlib import Path

logger = logging.getLogger(__name__)


class StepConverter:
    """Convert STEP/STL files to STL / GLB using FreeCAD and trimesh"""

    # ------------------------------------------------------------------
    # FIND FREECAD
    # ------------------------------------------------------------------
    @staticmethod
    def find_freecad() -> str | None:
        """Locate FreeCAD executable"""
        # 0️⃣ Explicit override (useful in Docker / custom installs)
        env_path = os.getenv("FREECAD_PATH")
        if env_path and os.path.exists(env_path):
            logger.info(f"FreeCAD found via FREECAD_PATH: {env_path}")
            return env_path

        # 1️⃣ Prefer the headless CLI (faster + does not require X11)
        # Linux packages commonly expose `freecadcmd`; Windows often has `FreeCADCmd.exe`.
        for name in ("freecadcmd", "FreeCADCmd", "FreeCADCmd.exe", "freecad", "FreeCAD", "FreeCAD.exe"):
            found = shutil.which(name)
            if found:
                logger.info(f"FreeCAD found in PATH: {found}")
                return found

        # 2️⃣ Common install locations (Linux/Docker)
        possible_paths = [
            "/usr/bin/freecadcmd",
            "/usr/bin/FreeCADCmd",
            "/usr/bin/freecad",
            "/usr/local/bin/freecadcmd",
            "/usr/local/bin/FreeCADCmd",
            "/usr/local/bin/freecad",
        ]

        for path in possible_paths:
            if os.path.exists(path):
                logger.info(f"FreeCAD found at: {path}")
                return path

        # 3️⃣ Common install locations (Windows)
        if os.name == "nt":
            candidates: list[str] = []
            for env in ("ProgramFiles", "ProgramFiles(x86)"):
                base = os.environ.get(env)
                if not base or not os.path.isdir(base):
                    continue
                # Common: C:\Program Files\FreeCAD 0.21\bin\FreeCADCmd.exe
                try:
                    for entry in os.listdir(base):
                        if entry.lower().startswith("freecad"):
                            candidates.append(os.path.join(base, entry, "bin", "FreeCADCmd.exe"))
                            candidates.append(os.path.join(base, entry, "bin", "FreeCAD.exe"))
                except Exception:
                    pass

            # Also try a couple of direct well-known defaults
            pf = os.environ.get("ProgramFiles", r"C:\Program Files")
            candidates.extend(
                [
                    os.path.join(pf, "FreeCAD 0.21", "bin", "FreeCADCmd.exe"),
                    os.path.join(pf, "FreeCAD 0.20", "bin", "FreeCADCmd.exe"),
                    os.path.join(pf, "FreeCAD", "bin", "FreeCADCmd.exe"),
                ]
            )

            for path in candidates:
                if os.path.exists(path):
                    logger.info(f"FreeCAD found at: {path}")
                    return path

        logger.error("❌ FreeCAD not found")
        return None

    # ------------------------------------------------------------------
    # STEP/STL → STL (via FreeCAD)
    # ------------------------------------------------------------------
    @staticmethod
    def convert_to_stl(content: bytes, extension: str, output_stl_path: str) -> bool:
        """Convert STEP/STL bytes to STL file using FreeCAD"""

        freecad_path = StepConverter.find_freecad()
        if not freecad_path:
            logger.error("FreeCAD is required but not found")
            return False

        try:
            # Save input file
            with tempfile.NamedTemporaryFile(suffix=extension, delete=False) as tmp_input:
                tmp_input.write(content)
                input_path = tmp_input.name

            # FreeCAD Python script
            script = f"""
import sys
import FreeCAD
import Import
import Mesh
import Part

doc = FreeCAD.newDocument("temp")

# Use Import.insert for both STEP and STL
if r"{input_path}".lower().endswith(".stl"):
    # Special handling for STL to ensure it's loaded as a Mesh object
    Mesh.insert(r"{input_path}", "temp")
else:
    Import.insert(r"{input_path}", "temp")

objects = [o for o in doc.Objects]
if not objects:
    print("No objects found")
    sys.exit(1)

final_mesh = Mesh.Mesh()

for o in objects:
    # 1. If it's already a Mesh object (typical for STL imports)
    if hasattr(o, "Mesh"):
        final_mesh.addMesh(o.Mesh)
    # 2. If it's a Part/Shape (typical for STEP imports)
    elif hasattr(o, "Shape"):
        shape_mesh = Mesh.Mesh(o.Shape.tessellate(0.1))
        final_mesh.addMesh(shape_mesh)

final_mesh.write(r"{output_stl_path}")

FreeCAD.closeDocument("temp")
print("SUCCESS")
"""

            with tempfile.NamedTemporaryFile(
                suffix=".py", mode="w", delete=False, encoding="utf-8"
            ) as tmp_script:
                tmp_script.write(script)
                script_path = tmp_script.name

            # Run FreeCAD.
            # - Prefer `FreeCADCmd/freecadcmd` if present (no GUI / no X11 needed)
            # - If we end up using the GUI binary on Linux, wrap with xvfb-run.
            cmd = [freecad_path, "-c", script_path]
            if os.name != "nt":
                bin_name = Path(freecad_path).name.lower()
                is_cmd = ("cmd" in bin_name) or bin_name.endswith("freecadcmd")
                if (not is_cmd) and shutil.which("xvfb-run"):
                    cmd = ["xvfb-run", "-a", "--server-args=-screen 0 1024x768x24"] + cmd

            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=int(os.getenv("FREECAD_CONVERT_TIMEOUT_SEC", "240")),
            )

            # Cleanup
            for f in (input_path, script_path):
                try:
                    os.unlink(f)
                except Exception:
                    pass

            if result.returncode == 0 and os.path.exists(output_stl_path):
                logger.info(f"✅ {extension.upper()} → STL successful via FreeCAD")
                return True

            logger.error(f"❌ FreeCAD error during {extension.upper()} conversion")
            logger.error(result.stderr)
            return False

        except subprocess.TimeoutExpired:
            logger.error("❌ FreeCAD conversion timeout")
            return False

        except Exception as e:
            logger.exception(f"❌ {extension.upper()} → STL failed")
            return False

    # ------------------------------------------------------------------
    # STEP → GLB
    # ------------------------------------------------------------------
    @staticmethod
    def convert_step_to_glb(step_content: bytes) -> bytes:
        """Convert STEP bytes to GLB using FreeCAD for processing"""

        try:
            import trimesh
            import numpy

            with tempfile.NamedTemporaryFile(suffix=".stl", delete=False) as tmp_stl:
                stl_path = tmp_stl.name

            if not StepConverter.convert_to_stl(step_content, ".step", stl_path):
                return b""

            mesh = trimesh.load(stl_path, force="mesh")
            os.unlink(stl_path)

            if mesh.is_empty:
                logger.error("❌ Empty mesh from STEP")
                return b""

            # Export with basic compression if possible
            glb = mesh.export(file_type="glb")
            logger.info("✅ STEP → GLB successful (FreeCAD + Trimesh)")

            return glb if isinstance(glb, bytes) else bytes(glb)

        except Exception:
            logger.exception("❌ STEP → GLB failed")
            return b""

    @staticmethod
    def convert_stl_to_glb(stl_content: bytes) -> bytes:
        """Convert STL bytes to GLB quickly using trimesh (no FreeCAD)"""

        try:
            import trimesh
            import numpy

            # STL is already a triangle mesh; importing it via FreeCAD is slow and unnecessary.
            # Load directly from memory for best latency.
            mesh = trimesh.load(
                io.BytesIO(stl_content),
                file_type="stl",
                force="mesh",
                process=False,
            )
            # Now using FreeCAD for STL too!
            if not StepConverter.convert_to_stl(stl_content, ".stl", stl_path):
                return b""

            mesh = trimesh.load(stl_path, force="mesh")
            os.unlink(stl_path)

            # Now using FreeCAD for STL too!
            if not StepConverter.convert_to_stl(stl_content, ".stl", stl_path):
                return b""

            mesh = trimesh.load(stl_path, force="mesh")
            os.unlink(stl_path)

            # Now using FreeCAD for STL too!
            if not StepConverter.convert_to_stl(stl_content, ".stl", stl_path):
                return b""

            mesh = trimesh.load(stl_path, force="mesh")
            os.unlink(stl_path)


            if mesh.is_empty:
                logger.error("❌ Empty mesh from STL")
                return b""

            glb = mesh.export(file_type="glb")
            logger.info("✅ STL → GLB successful (Trimesh)")

            return glb if isinstance(glb, bytes) else bytes(glb)

        except Exception:
            logger.exception("❌ STL → GLB failed")
            return b""
