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

        # 1️⃣ Try PATH first
        freecad = shutil.which("FreeCAD")
        if freecad:
            logger.info(f"FreeCAD found in PATH: {freecad}")
            return freecad

        # 2️⃣ Common install locations (Windows)
        possible_paths = [
            r"C:\Users\SMPM\AppData\Local\Programs\FreeCAD 1.0\bin\FreeCAD.exe",
            r"C:\Program Files\FreeCAD 1.0\bin\FreeCAD.exe",
            r"C:\Program Files\FreeCAD 0.21\bin\FreeCAD.exe",
            r"C:\Program Files\FreeCAD 0.20\bin\FreeCAD.exe",
            r"C:\Program Files (x86)\FreeCAD 1.0\bin\FreeCAD.exe",
            r"C:\Program Files (x86)\FreeCAD 0.21\bin\FreeCAD.exe",
        ]

        # 3️⃣ Linux paths
        if os.name != "nt":
            possible_paths.extend([
                "/usr/bin/freecad",
                "/usr/local/bin/freecad",
            ])

        for path in possible_paths:
            if os.path.exists(path):
                logger.info(f"FreeCAD found at: {path}")
                return path

        logger.error("❌ FreeCAD not found")
        return None

    # ------------------------------------------------------------------
    # STEP → STL
    # ------------------------------------------------------------------
    @staticmethod
    def convert_step_to_stl(step_content: bytes, output_stl_path: str) -> bool:
        """Convert STEP bytes to STL file"""

        freecad_path = StepConverter.find_freecad()
        if not freecad_path:
            logger.error("FreeCAD is required but not found")
            return False

        try:
            # Save STEP file
            with tempfile.NamedTemporaryFile(suffix=".step", delete=False) as tmp_step:
                tmp_step.write(step_content)
                step_path = tmp_step.name

            # FreeCAD Python script
            script = f"""
import sys
import FreeCAD
import Import
import Mesh
import Part

doc = FreeCAD.newDocument("temp")
Import.insert(r"{step_path}", "temp")

objects = [o for o in doc.Objects if hasattr(o, "Shape")]
if not objects:
    print("No shapes found")
    sys.exit(1)

shapes = [o.Shape for o in objects]
compound = Part.makeCompound(shapes)

mesh = Mesh.Mesh(compound.tessellate(0.1))
mesh.write(r"{output_stl_path}")

FreeCAD.closeDocument("temp")
print("SUCCESS")
"""

            with tempfile.NamedTemporaryFile(
                suffix=".py", mode="w", delete=False, encoding="utf-8"
            ) as tmp_script:
                tmp_script.write(script)
                script_path = tmp_script.name

            # Run FreeCAD
            result = subprocess.run(
                [freecad_path, "-c", script_path],
                capture_output=True,
                text=True,
                timeout=90
            )

            # Cleanup
            for f in (step_path, script_path):
                try:
                    os.unlink(f)
                except Exception:
                    pass

            if result.returncode == 0 and os.path.exists(output_stl_path):
                logger.info("✅ STEP → STL successful")
                return True

            logger.error("❌ FreeCAD error")
            logger.error(result.stderr)
            return False

        except subprocess.TimeoutExpired:
            logger.error("❌ FreeCAD conversion timeout")
            return False

        except Exception as e:
            logger.exception("❌ STEP → STL failed")
            return False

    # ------------------------------------------------------------------
    # STEP → GLB
    # ------------------------------------------------------------------
    @staticmethod
    def convert_step_to_glb(step_content: bytes) -> bytes:
        """Convert STEP bytes directly to GLB"""

        try:
            import trimesh
            import numpy

            with tempfile.NamedTemporaryFile(suffix=".stl", delete=False) as tmp_stl:
                stl_path = tmp_stl.name

            if not StepConverter.convert_step_to_stl(step_content, stl_path):
                return b""

            mesh = trimesh.load(stl_path, force="mesh")

            os.unlink(stl_path)

            if mesh.is_empty:
                logger.error("❌ Empty mesh")
                return b""

            glb = mesh.export(file_type="glb")
            logger.info("✅ STEP → GLB successful")

            return glb if isinstance(glb, bytes) else bytes(glb)

        except ImportError:
            logger.error("❌ trimesh/numpy not installed")
            return b""

        except Exception:
            logger.exception("❌ STEP → GLB failed")
            return b""

    @staticmethod
    def convert_stl_to_glb(stl_content: bytes) -> bytes:
        """Convert STL bytes directly to GLB"""

        try:
            import trimesh
            import numpy

            with tempfile.NamedTemporaryFile(suffix=".stl", delete=False) as tmp_stl:
                tmp_stl.write(stl_content)
                stl_path = tmp_stl.name

            mesh = trimesh.load(stl_path, force="mesh")

            os.unlink(stl_path)

            if mesh.is_empty:
                logger.error("❌ Empty mesh from STL")
                return b""

            glb = mesh.export(file_type="glb")
            logger.info("✅ STL → GLB successful")

            return glb if isinstance(glb, bytes) else bytes(glb)

        except ImportError:
            logger.error("❌ trimesh/numpy not installed")
            return b""

        except Exception:
            logger.exception("❌ STL → GLB failed")
            return b""
