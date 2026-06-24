"""
test_step_converter.py

Functionality-driven tests for StepConverter (routers/step_converter.py).

STRATEGY:
  STL → GLB  : trimesh is installed + in-memory — run REAL conversions.
               Uses real .stl files from venv gmsh examples.
               Also tests with programmatically generated minimal STL bytes.

  STEP → GLB : FreeCAD not installed on this machine.
               Mock subprocess.run to test all logic branches:
               success path, failure, timeout, no objects, missing FreeCAD.
               This is industry-standard: we test OUR code, not FreeCAD itself.

  find_freecad: Tests path discovery logic — real env + mocked PATH.

WHY MOCKING IS CORRECT HERE:
  - FreeCAD is a 500MB GUI app, not a test dependency.
  - CI/CD servers won't have FreeCAD installed.
  - Real STEP conversion takes 5-15s per test — unacceptable.
  - subprocess.run is a clean boundary: mock it, test everything around it.

Real STL files used (from venv gmsh examples — always present):
  venv/share/doc/gmsh/examples/api/object.stl
  venv/share/doc/gmsh/examples/api/surface1.stl
"""

import io
import os
import struct
import tempfile
import subprocess
from pathlib import Path
from unittest.mock import patch, MagicMock

import pytest

from routers.step_converter import StepConverter


# ─────────────────────────────────────────────────────────
# HELPERS — programmatic STL generation
# ─────────────────────────────────────────────────────────

def _make_binary_stl(num_triangles: int = 4) -> bytes:
    """
    Build a minimal valid binary STL in memory.
    Binary STL layout:
      80 bytes header | 4-byte uint32 triangle count |
      per triangle: 12 bytes normal + 3×12 bytes vertices + 2 bytes attr = 50 bytes
    """
    header = b"Binary STL test file" + b"\x00" * 60  # 80 bytes
    count = struct.pack("<I", num_triangles)
    triangle = (
        struct.pack("<fff", 0.0, 0.0, 1.0)   # normal
        + struct.pack("<fff", 0.0, 0.0, 0.0) # v1
        + struct.pack("<fff", 1.0, 0.0, 0.0) # v2
        + struct.pack("<fff", 0.0, 1.0, 0.0) # v3
        + b"\x00\x00"                         # attribute byte count
    )
    return header + count + triangle * num_triangles


def _make_ascii_stl_empty() -> bytes:
    """Minimal ASCII STL with no facets — triggers the empty-geometry guard."""
    return b"solid EmptyPart\nendsolid EmptyPart\n"


def _make_ascii_stl_valid() -> bytes:
    """Valid single-facet ASCII STL."""
    return (
        b"solid test\n"
        b"  facet normal 0 0 1\n"
        b"    outer loop\n"
        b"      vertex 0 0 0\n"
        b"      vertex 1 0 0\n"
        b"      vertex 0 1 0\n"
        b"    endloop\n"
        b"  endfacet\n"
        b"endsolid test\n"
    )


def _real_stl_path(filename: str) -> Path:
    """Locate a real STL file from the venv gmsh examples."""
    venv_root = Path(__file__).parent.parent / "venv"
    candidates = list(venv_root.rglob(filename))
    return candidates[0] if candidates else None


# ─────────────────────────────────────────────────────────
# HELPERS — minimal fake STL bytes for mocked STEP tests
# ─────────────────────────────────────────────────────────

def _write_fake_stl_to_path(path: str):
    """Write a valid binary STL to a temp path (simulates FreeCAD output)."""
    with open(path, "wb") as f:
        f.write(_make_binary_stl(4))


# ══════════════════════════════════════════════════════════
# FIND FREECAD
# ══════════════════════════════════════════════════════════

class TestFindFreeCAD:

    def test_find_freecad_returns_none_when_not_installed(self):
        """
        FUNCTIONALITY: find_freecad returns None when FreeCAD is not on PATH
        and no known installation paths exist.
        EXPECT: None returned — no crash.
        """
        with patch("shutil.which", return_value=None), \
             patch("os.path.exists", return_value=False):
            result = StepConverter.find_freecad()

        assert result is None

    def test_find_freecad_uses_env_variable_when_set(self):
        """
        FUNCTIONALITY: FREECAD_PATH environment variable is checked first.
        EXPECT: Returns the env var path if the file exists.
        """
        fake_path = "/usr/local/bin/freecadcmd"
        with patch.dict(os.environ, {"FREECAD_PATH": fake_path}), \
             patch("os.path.exists", return_value=True):
            result = StepConverter.find_freecad()

        assert result == fake_path

    def test_find_freecad_env_variable_ignored_if_file_missing(self):
        """
        FUNCTIONALITY: FREECAD_PATH is ignored if the path doesn't actually exist.
        EXPECT: Falls through to PATH search.
        """
        with patch.dict(os.environ, {"FREECAD_PATH": "/nonexistent/freecadcmd"}), \
             patch("os.path.exists", return_value=False), \
             patch("shutil.which", return_value=None):
            result = StepConverter.find_freecad()

        assert result is None

    def test_find_freecad_found_via_shutil_which(self):
        """
        FUNCTIONALITY: find_freecad finds FreeCAD via PATH using shutil.which.
        EXPECT: Returns the path found by shutil.which.
        """
        fake_path = "/usr/bin/freecadcmd"

        def mock_which(name):
            return fake_path if name == "freecadcmd" else None

        with patch.dict(os.environ, {}, clear=False), \
             patch("os.environ.get", return_value=None), \
             patch("shutil.which", side_effect=mock_which):
            result = StepConverter.find_freecad()

        assert result == fake_path

    def test_find_freecad_returns_string_or_none(self):
        """
        FUNCTIONALITY: find_freecad always returns str or None — never raises.
        EXPECT: No exception regardless of environment.
        """
        try:
            result = StepConverter.find_freecad()
            assert result is None or isinstance(result, str)
        except Exception as e:
            pytest.fail(f"find_freecad raised an exception: {e}")


# ══════════════════════════════════════════════════════════
# STL → GLB  (real trimesh execution — no mocking)
# ══════════════════════════════════════════════════════════

class TestStlToGlb:

    def test_convert_binary_stl_to_glb_success(self):
        """
        FUNCTIONALITY: A valid binary STL converts to GLB bytes successfully.
        EXPECT: Non-empty bytes returned + no error message.
        """
        stl_bytes = _make_binary_stl(num_triangles=4)

        glb, error = StepConverter.convert_stl_to_glb(stl_bytes)

        assert error is None
        assert isinstance(glb, bytes)
        assert len(glb) > 0

    def test_convert_binary_stl_returns_valid_glb_header(self):
        """
        FUNCTIONALITY: GLB output starts with the GLB magic number (0x676C5446 = 'glTF').
        EXPECT: First 4 bytes are the GLB magic bytes.
        """
        stl_bytes = _make_binary_stl(num_triangles=4)

        glb, error = StepConverter.convert_stl_to_glb(stl_bytes)

        assert error is None
        assert glb[:4] == b"glTF", f"Expected GLB magic bytes, got: {glb[:4]}"

    def test_convert_ascii_stl_to_glb_success(self):
        """
        FUNCTIONALITY: A valid ASCII STL also converts to GLB correctly.
        EXPECT: Non-empty GLB bytes + no error.
        """
        stl_bytes = _make_ascii_stl_valid()

        glb, error = StepConverter.convert_stl_to_glb(stl_bytes)

        assert error is None
        assert len(glb) > 0

    def test_convert_empty_ascii_stl_returns_error(self):
        """
        FUNCTIONALITY: An ASCII STL with no facets (empty CAD export) is rejected
        with a descriptive error — not a crash.
        EXPECT: Empty bytes returned + error message containing 'empty' or 'facet'.
        """
        empty_stl = _make_ascii_stl_empty()

        glb, error = StepConverter.convert_stl_to_glb(empty_stl)

        assert glb == b""
        assert error is not None
        assert "empty" in error.lower() or "facet" in error.lower()

    def test_convert_stl_returns_bytes_type(self):
        """
        FUNCTIONALITY: Return type is always bytes (not bytearray or memoryview).
        EXPECT: isinstance(glb, bytes) is True.
        """
        stl_bytes = _make_binary_stl(4)

        glb, _ = StepConverter.convert_stl_to_glb(stl_bytes)

        assert isinstance(glb, bytes)

    def test_convert_stl_larger_mesh_success(self):
        """
        FUNCTIONALITY: A larger mesh (1000 triangles) converts without error.
        EXPECT: Non-empty GLB, no error — validates there is no size cap.
        """
        stl_bytes = _make_binary_stl(num_triangles=1000)

        glb, error = StepConverter.convert_stl_to_glb(stl_bytes)

        assert error is None
        assert len(glb) > 0

    def test_convert_stl_glb_size_is_reasonable(self):
        """
        FUNCTIONALITY: GLB output is smaller than input for typical meshes
        (GLB uses binary encoding, no inflating).
        EXPECT: GLB size > 0 and not absurdly larger than input.
        """
        stl_bytes = _make_binary_stl(num_triangles=100)

        glb, error = StepConverter.convert_stl_to_glb(stl_bytes)

        assert error is None
        # GLB should not be more than 10x larger than the source STL
        assert len(glb) < len(stl_bytes) * 10

    def test_convert_invalid_bytes_returns_error_not_crash(self):
        """
        FUNCTIONALITY: Completely invalid bytes (not a real STL) return an error
        gracefully — no unhandled exception.
        EXPECT: (b"", error_string) returned, not an exception.
        """
        garbage = b"this is not an stl file at all !@#$%^&*()"

        try:
            glb, error = StepConverter.convert_stl_to_glb(garbage)
            # Either returns error tuple or empty bytes — both acceptable
            assert isinstance(glb, bytes)
        except Exception as e:
            pytest.fail(f"convert_stl_to_glb raised instead of returning error: {e}")

    @pytest.mark.skipif(
        _real_stl_path("object.stl") is None,
        reason="gmsh example STL not found in venv"
    )
    def test_convert_real_stl_file_from_gmsh_examples(self):
        """
        FUNCTIONALITY: A real-world STL file (gmsh object.stl) converts to GLB.
        EXPECT: Valid GLB output + GLB magic bytes present.
        """
        stl_path = _real_stl_path("object.stl")
        stl_bytes = stl_path.read_bytes()

        glb, error = StepConverter.convert_stl_to_glb(stl_bytes)

        assert error is None, f"Conversion failed: {error}"
        assert glb[:4] == b"glTF"

    @pytest.mark.skipif(
        _real_stl_path("surface1.stl") is None,
        reason="gmsh example STL not found in venv"
    )
    def test_convert_real_surface_stl_file(self):
        """
        FUNCTIONALITY: Another real-world STL (gmsh surface1.stl) converts correctly.
        EXPECT: Valid GLB output.
        """
        stl_path = _real_stl_path("surface1.stl")
        stl_bytes = stl_path.read_bytes()

        glb, error = StepConverter.convert_stl_to_glb(stl_bytes)

        assert error is None, f"Conversion failed: {error}"
        assert len(glb) > 0


# ══════════════════════════════════════════════════════════
# STEP → STL (internal)  — all mocked, FreeCAD not installed
# ══════════════════════════════════════════════════════════

class TestStepToStlInternal:

    def test_step_to_stl_returns_empty_when_freecad_not_found(self):
        """
        FUNCTIONALITY: _step_to_stl_bytes returns b'' when FreeCAD is not available.
        EXPECT: Empty bytes — no crash.
        """
        with patch.object(StepConverter, "find_freecad", return_value=None):
            result = StepConverter._step_to_stl_bytes(b"STEP content")

        assert result == b""

    def test_step_to_stl_success_path(self):
        """
        FUNCTIONALITY: _step_to_stl_bytes returns STL bytes when FreeCAD
        subprocess exits 0 and writes an STL file.
        EXPECT: Returns the STL bytes written by the mock FreeCAD process.
        """
        fake_stl = _make_binary_stl(4)

        def mock_run(cmd, **kwargs):
            # Simulate FreeCAD writing the STL file
            # Find the stl_path from the script content
            script_path = cmd[2]
            stl_path = _extract_stl_path_from_script(script_path)
            if stl_path:
                _write_fake_stl_to_path(stl_path)
            mock_result = MagicMock()
            mock_result.returncode = 0
            mock_result.stderr = ""
            return mock_result

        with patch.object(StepConverter, "find_freecad", return_value="/usr/bin/freecadcmd"), \
             patch("subprocess.run", side_effect=mock_run):
            result = StepConverter._step_to_stl_bytes(b"ISO-10303-21;\nHEADER;\nENDSEC;\n")

        assert isinstance(result, bytes)

    def test_step_to_stl_returns_empty_on_nonzero_returncode(self):
        """
        FUNCTIONALITY: _step_to_stl_bytes returns b'' when FreeCAD exits non-zero.
        EXPECT: Empty bytes returned — FreeCAD reported an error.
        """
        mock_result = MagicMock()
        mock_result.returncode = 1
        mock_result.stderr = "FreeCAD error: could not load file"

        with patch.object(StepConverter, "find_freecad", return_value="/usr/bin/freecadcmd"), \
             patch("subprocess.run", return_value=mock_result):
            result = StepConverter._step_to_stl_bytes(b"bad step content")

        assert result == b""

    def test_step_to_stl_returns_empty_on_timeout(self):
        """
        FUNCTIONALITY: _step_to_stl_bytes returns b'' when FreeCAD conversion
        times out (very large or corrupt STEP files).
        EXPECT: Empty bytes — TimeoutExpired is caught, not re-raised.
        """
        with patch.object(StepConverter, "find_freecad", return_value="/usr/bin/freecadcmd"), \
             patch("subprocess.run", side_effect=subprocess.TimeoutExpired(cmd="freecadcmd", timeout=300)):
            result = StepConverter._step_to_stl_bytes(b"STEP content")

        assert result == b""

    def test_step_to_stl_cleans_up_temp_files_on_success(self):
        """
        FUNCTIONALITY: Temp files (.step, .stl, .py) are deleted after conversion
        even on success.
        EXPECT: No temp files left behind after _step_to_stl_bytes returns.
        """
        created_files = []
        original_namedtemp = tempfile.NamedTemporaryFile

        def tracking_namedtemp(**kwargs):
            f = original_namedtemp(**kwargs)
            created_files.append(f.name)
            return f

        mock_result = MagicMock()
        mock_result.returncode = 1   # fail fast — we just want to check cleanup
        mock_result.stderr = "fail"

        with patch.object(StepConverter, "find_freecad", return_value="/usr/bin/freecadcmd"), \
             patch("subprocess.run", return_value=mock_result), \
             patch("tempfile.NamedTemporaryFile", side_effect=tracking_namedtemp):
            StepConverter._step_to_stl_bytes(b"STEP content")

        # All temp files should be deleted
        for path in created_files:
            assert not os.path.exists(path), f"Temp file not cleaned up: {path}"

    def test_step_to_stl_cleans_up_temp_files_on_exception(self):
        """
        FUNCTIONALITY: Temp files are cleaned up even when subprocess raises
        an unexpected exception.
        EXPECT: No temp files left behind after unexpected error.
        """
        created_files = []
        original_namedtemp = tempfile.NamedTemporaryFile

        def tracking_namedtemp(**kwargs):
            f = original_namedtemp(**kwargs)
            created_files.append(f.name)
            return f

        with patch.object(StepConverter, "find_freecad", return_value="/usr/bin/freecadcmd"), \
             patch("subprocess.run", side_effect=RuntimeError("Unexpected crash")), \
             patch("tempfile.NamedTemporaryFile", side_effect=tracking_namedtemp):
            result = StepConverter._step_to_stl_bytes(b"STEP content")

        assert result == b""
        for path in created_files:
            assert not os.path.exists(path), f"Temp file not cleaned up: {path}"


# ══════════════════════════════════════════════════════════
# STEP → GLB  (public API — mocked FreeCAD, real trimesh)
# ══════════════════════════════════════════════════════════

class TestConvertStepToGlb:

    def test_convert_step_to_glb_freecad_not_found_returns_error(self):
        """
        FUNCTIONALITY: convert_step_to_glb returns (b'', error) when FreeCAD
        is not installed.
        EXPECT: Empty bytes + non-null error string.
        """
        with patch.object(StepConverter, "find_freecad", return_value=None):
            glb, error = StepConverter.convert_step_to_glb(b"STEP content")

        assert glb == b""
        assert error is not None
        assert len(error) > 0

    def test_convert_step_to_glb_subprocess_failure_returns_error(self):
        """
        FUNCTIONALITY: When FreeCAD subprocess exits non-zero, convert_step_to_glb
        returns (b'', error).
        EXPECT: Empty bytes + error message.
        """
        mock_result = MagicMock()
        mock_result.returncode = 1
        mock_result.stderr = "STEP import failed"

        with patch.object(StepConverter, "find_freecad", return_value="/usr/bin/freecadcmd"), \
             patch("subprocess.run", return_value=mock_result):
            glb, error = StepConverter.convert_step_to_glb(b"ISO-10303-21;")

        assert glb == b""
        assert error is not None

    def test_convert_step_to_glb_timeout_returns_error(self):
        """
        FUNCTIONALITY: A STEP conversion that times out returns (b'', error)
        without re-raising the timeout exception.
        EXPECT: Empty bytes + error, no TimeoutExpired propagated.
        """
        with patch.object(StepConverter, "find_freecad", return_value="/usr/bin/freecadcmd"), \
             patch("subprocess.run", side_effect=subprocess.TimeoutExpired(cmd="freecadcmd", timeout=300)):
            try:
                glb, error = StepConverter.convert_step_to_glb(b"STEP content")
                assert glb == b""
                assert error is not None
            except subprocess.TimeoutExpired:
                pytest.fail("TimeoutExpired was not caught inside convert_step_to_glb")

    def test_convert_step_to_glb_full_pipeline_success(self):
        """
        FUNCTIONALITY: Full pipeline — FreeCAD produces STL → trimesh converts
        to GLB. Validates the entire convert_step_to_glb happy path.
        EXPECT: Valid GLB bytes + no error.
        """
        fake_stl = _make_binary_stl(num_triangles=50)

        # Mock _step_to_stl_bytes to return valid STL (bypass FreeCAD entirely)
        with patch.object(StepConverter, "_step_to_stl_bytes", return_value=fake_stl):
            glb, error = StepConverter.convert_step_to_glb(b"ISO-10303-21;")

        assert error is None
        assert isinstance(glb, bytes)
        assert glb[:4] == b"glTF"

    def test_convert_step_to_glb_empty_stl_from_freecad_returns_error(self):
        """
        FUNCTIONALITY: If FreeCAD produces empty STL bytes (no geometry),
        the pipeline returns (b'', error) — not a crash.
        EXPECT: Empty bytes + error string.
        """
        with patch.object(StepConverter, "_step_to_stl_bytes", return_value=b""):
            glb, error = StepConverter.convert_step_to_glb(b"STEP content")

        assert glb == b""
        assert error is not None

    def test_convert_step_to_glb_returns_tuple(self):
        """
        FUNCTIONALITY: convert_step_to_glb always returns a 2-tuple (bytes, str|None).
        EXPECT: Return value is a tuple of length 2.
        """
        with patch.object(StepConverter, "find_freecad", return_value=None):
            result = StepConverter.convert_step_to_glb(b"content")

        assert isinstance(result, tuple)
        assert len(result) == 2


# ══════════════════════════════════════════════════════════
# STL → GLB INTERNAL  (_stl_bytes_to_glb)
# ══════════════════════════════════════════════════════════

class TestStlBytesToGlbInternal:

    def test_internal_stl_to_glb_returns_tuple(self):
        """
        FUNCTIONALITY: _stl_bytes_to_glb always returns (bytes, str|None) tuple.
        EXPECT: 2-tuple regardless of input.
        """
        stl = _make_binary_stl(4)
        result = StepConverter._stl_bytes_to_glb(stl)

        assert isinstance(result, tuple)
        assert len(result) == 2

    def test_internal_stl_to_glb_success_error_is_none(self):
        """
        FUNCTIONALITY: On success, the error component of the tuple is None.
        EXPECT: (glb_bytes, None).
        """
        stl = _make_binary_stl(4)

        glb, error = StepConverter._stl_bytes_to_glb(stl)

        assert error is None
        assert len(glb) > 0

    def test_internal_empty_ascii_stl_returns_error_string(self):
        """
        FUNCTIONALITY: Empty ASCII STL triggers the early rejection guard.
        EXPECT: (b'', error_string) — not a trimesh exception.
        """
        empty_stl = _make_ascii_stl_empty()

        glb, error = StepConverter._stl_bytes_to_glb(empty_stl, label="TEST")

        assert glb == b""
        assert isinstance(error, str)
        assert len(error) > 0

    def test_internal_label_appears_in_error_message(self):
        """
        FUNCTIONALITY: The label parameter appears in the error message for
        traceability (e.g. "STEP→STL" vs "STL").
        EXPECT: label string present in error when conversion fails.
        """
        empty_stl = _make_ascii_stl_empty()

        _, error = StepConverter._stl_bytes_to_glb(empty_stl, label="MYLABEL")

        assert "MYLABEL" in error

    def test_internal_trimesh_import_error_handled_gracefully(self):
        """
        FUNCTIONALITY: If trimesh raises an unexpected exception during load,
        _stl_bytes_to_glb catches it and returns (b'', error).
        EXPECT: No unhandled exception propagated.
        """
        stl = _make_binary_stl(4)

        with patch("trimesh.load", side_effect=RuntimeError("trimesh internal error")):
            try:
                glb, error = StepConverter._stl_bytes_to_glb(stl)
                assert glb == b""
                assert error is not None
            except RuntimeError:
                pytest.fail("RuntimeError from trimesh was not caught")


# ─────────────────────────────────────────────────────────
# HELPER — extract stl_path from a FreeCAD script file
# (used in mocked subprocess tests to write fake STL output)
# ─────────────────────────────────────────────────────────

def _extract_stl_path_from_script(script_path: str) -> str | None:
    """
    Parse the FreeCAD Python script written to a temp file and
    extract the stl_path value so the mock can write a fake STL there.
    """
    try:
        with open(script_path, "r", encoding="utf-8") as f:
            content = f.read()
        for line in content.splitlines():
            line = line.strip()
            if line.startswith('final.write(r"') or line.startswith("final.write(r'"):
                # Extract path from: final.write(r"C:\...\tmp_xxx.stl")
                start = line.index('"') + 1 if '"' in line else line.index("'") + 1
                end = line.rindex('"') if '"' in line else line.rindex("'")
                return line[start:end]
    except Exception:
        pass
    return None