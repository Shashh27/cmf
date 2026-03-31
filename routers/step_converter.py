"""
STEP / STL → GLB converter
File: step_converter.py

Speed strategy for large files (100-200 MB):
  STL  → load with process=False (skip expensive vertex merge) → export GLB in memory
  STEP → FreeCAD tessellates to STL → same fast GLB export

No file size limits. No mesh simplification. Full geometry always preserved.
The only knob that matters for speed is process=False on trimesh load.
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
    """Convert STEP/STL files to GLB.

    STL  → GLB : fully in-memory, process=False, no temp files     (~2-8s for 200 MB)
    STEP → GLB : FreeCAD tessellates to STL, then same GLB export  (~5-15s for complex parts)
    """

    # ------------------------------------------------------------------
    # FIND FREECAD
    # ------------------------------------------------------------------
    @staticmethod
    def find_freecad() -> str | None:
        """Locate FreeCAD executable (headless CLI preferred)"""

        env_path = os.getenv("FREECAD_PATH")
        if env_path and os.path.exists(env_path):
            logger.info(f"FreeCAD found via FREECAD_PATH: {env_path}")
            return env_path

        for name in ("freecadcmd", "FreeCADCmd", "FreeCADCmd.exe", "freecad", "FreeCAD", "FreeCAD.exe"):
            found = shutil.which(name)
            if found:
                logger.info(f"FreeCAD found in PATH: {found}")
                return found

        for path in (
            "/usr/bin/freecadcmd",
            "/usr/bin/FreeCADCmd",
            "/usr/bin/freecad",
            "/usr/local/bin/freecadcmd",
            "/usr/local/bin/FreeCADCmd",
            "/usr/local/bin/freecad",
        ):
            if os.path.exists(path):
                logger.info(f"FreeCAD found at: {path}")
                return path

        if os.name == "nt":
            candidates: list[str] = []
            for env_var in ("ProgramFiles", "ProgramFiles(x86)"):
                base = os.environ.get(env_var, "")
                if not base or not os.path.isdir(base):
                    continue
                try:
                    for entry in os.listdir(base):
                        if entry.lower().startswith("freecad"):
                            candidates += [
                                os.path.join(base, entry, "bin", "FreeCADCmd.exe"),
                                os.path.join(base, entry, "bin", "FreeCAD.exe"),
                            ]
                except Exception:
                    pass
            pf = os.environ.get("ProgramFiles", r"C:\Program Files")
            for ver in ("0.21", "0.20", ""):
                suffix = f" {ver}" if ver else ""
                candidates.append(os.path.join(pf, f"FreeCAD{suffix}", "bin", "FreeCADCmd.exe"))
            for path in candidates:
                if os.path.exists(path):
                    logger.info(f"FreeCAD found at: {path}")
                    return path

        logger.error("❌ FreeCAD not found")
        return None

    # ------------------------------------------------------------------
    # STEP → STL via FreeCAD  (writes one temp file — unavoidable for STEP)
    # ------------------------------------------------------------------
    @staticmethod
    def _step_to_stl_bytes(step_content: bytes) -> bytes:
        """Run FreeCAD to tessellate a STEP file. Returns raw STL bytes or b''."""

        freecad_path = StepConverter.find_freecad()
        if not freecad_path:
            logger.error("FreeCAD is required for STEP conversion but was not found")
            return b""

        input_path = script_path = stl_path = None
        try:
            with tempfile.NamedTemporaryFile(suffix=".step", delete=False) as f:
                f.write(step_content)
                input_path = f.name

            with tempfile.NamedTemporaryFile(suffix=".stl", delete=False) as f:
                stl_path = f.name

            script = f"""
import sys, FreeCAD, Import, Mesh

doc = FreeCAD.newDocument("conv")
Import.insert(r"{input_path}", "conv")
objects = doc.Objects
if not objects:
    print("NO_OBJECTS")
    sys.exit(1)

final = Mesh.Mesh()
for o in objects:
    if hasattr(o, "Mesh"):
        final.addMesh(o.Mesh)
    elif hasattr(o, "Shape"):
        final.addMesh(Mesh.Mesh(o.Shape.tessellate(0.1)))

final.write(r"{stl_path}")
FreeCAD.closeDocument("conv")
print("SUCCESS")
"""
            with tempfile.NamedTemporaryFile(suffix=".py", mode="w", delete=False, encoding="utf-8") as f:
                f.write(script)
                script_path = f.name

            cmd = [freecad_path, "-c", script_path]
            if os.name != "nt":
                bin_name = Path(freecad_path).name.lower()
                is_headless = "cmd" in bin_name or bin_name.endswith("freecadcmd")
                if not is_headless and shutil.which("xvfb-run"):
                    cmd = ["xvfb-run", "-a", "--server-args=-screen 0 1024x768x24"] + cmd

            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=int(os.getenv("FREECAD_CONVERT_TIMEOUT_SEC", "300")),
            )

            if result.returncode != 0 or not os.path.exists(stl_path):
                logger.error(f"❌ FreeCAD STEP→STL failed:\n{result.stderr}")
                return b""

            with open(stl_path, "rb") as f:
                stl_bytes = f.read()

            logger.info(f"✅ FreeCAD STEP→STL: {len(stl_bytes)/1024/1024:.1f} MB STL produced")
            return stl_bytes

        except subprocess.TimeoutExpired:
            logger.error("❌ FreeCAD conversion timed out")
            return b""
        except Exception:
            logger.exception("❌ FreeCAD STEP→STL unexpected error")
            return b""
        finally:
            for p in (input_path, script_path, stl_path):
                if p:
                    try:
                        os.unlink(p)
                    except Exception:
                        pass

    # ------------------------------------------------------------------
    # STL bytes → GLB bytes  (the fast core used by both paths)
    # ------------------------------------------------------------------
    @staticmethod
    def _stl_bytes_to_glb(stl_content: bytes, label: str = "STL") -> tuple[bytes, str | None]:
        """Convert raw STL bytes → GLB bytes entirely in memory.

        Key speed decisions:
        - process=False  → skip trimesh vertex-merge (O(n log n), very slow on 200 MB meshes)
        - No simplification → full geometry always preserved
        - No temp files → pure in-memory pipeline

        Returns:
            tuple: (glb_bytes, error_message) - error_message is None if successful

        process=False is safe here because:
        - GLB/three.js renders correctly even with duplicate vertices
        - The frontend's EdgesGeometry handles any winding inconsistencies visually
        - The user gets the exact mesh they exported from their CAD tool
        """
        try:
            import trimesh

            file_mb = len(stl_content) / (1024 * 1024)

            # ── Early rejection for empty ASCII STL exports ────────────
            # CATIA / SolidWorks sometimes export "solid NAME\nendsolid NAME"
            # with zero facets. Catch this before trimesh tries to load it.
            try:
                head = stl_content[:1024].decode("utf-8", errors="ignore")
                if head.lstrip().startswith("solid") and "facet" not in stl_content[:65536].decode("utf-8", errors="ignore"):
                    error_msg = f"❌ {label}: Empty ASCII STL — no facets found. The CAD export produced no geometry. Re-export with tessellation/mesh enabled."
                    logger.error(error_msg)
                    return b"", error_msg
            except Exception:
                pass  # binary STL — skip text scan

            logger.info(f"Loading {label} ({file_mb:.1f} MB) with process=False ...")

            # process=False is the single most important performance flag.
            # On a 200 MB STL, process=True can take 60-120s; process=False takes 2-5s.
            mesh = trimesh.load(
                io.BytesIO(stl_content),
                file_type="stl",
                force="mesh",
                process=False,      # ← DO NOT change to True — it kills performance on large files
            )

            if mesh.is_empty:
                error_msg = f"❌ {label}: trimesh returned an empty mesh. The file likely has no valid geometry."
                logger.error(error_msg)
                return b"", error_msg

            face_count = len(mesh.faces)
            logger.info(f"{label}: {face_count:,} faces loaded, exporting to GLB ...")

            glb = mesh.export(file_type="glb")
            glb_mb = len(glb) / (1024 * 1024)

            logger.info(
                f"✅ {label} → GLB done | "
                f"input {file_mb:.1f} MB → output {glb_mb:.1f} MB | "
                f"{face_count:,} faces"
            )
            glb_bytes = glb if isinstance(glb, bytes) else bytes(glb)
            return glb_bytes, None

        except Exception:
            error_msg = f"❌ {label} → GLB failed"
            logger.exception(error_msg)
            return b"", error_msg

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------
    @staticmethod
    def convert_step_to_glb(step_content: bytes) -> tuple[bytes, str | None]:
        """STEP → GLB.  FreeCAD tessellates; trimesh exports.

        Returns:
            tuple: (glb_bytes, error_message) - error_message is None if successful
        """
        file_mb = len(step_content) / (1024 * 1024)
        logger.info(f"STEP→GLB started ({file_mb:.1f} MB)")

        stl_bytes = StepConverter._step_to_stl_bytes(step_content)
        if not stl_bytes:
            return b"", "STEP file conversion failed - FreeCAD could not tessellate the geometry"

        return StepConverter._stl_bytes_to_glb(stl_bytes, label="STEP→STL")

    @staticmethod
    def convert_stl_to_glb(stl_content: bytes) -> tuple[bytes, str | None]:
        """STL → GLB.  Fully in-memory, no temp files, no size limit.

        Returns:
            tuple: (glb_bytes, error_message) - error_message is None if successful
        """
        file_mb = len(stl_content) / (1024 * 1024)
        logger.info(f"STL→GLB started ({file_mb:.1f} MB)")

        return StepConverter._stl_bytes_to_glb(stl_content, label="STL")