import React, { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { Spin, Empty, Typography } from "antd";
import { API_BASE_URL } from "../Config/auth";

const { Text } = Typography;

const ModelViewer3D = ({ documentId, height = 160 }) => {
  const containerRef = useRef(null);
  const canvasRef = useRef(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!documentId) {
      return;
    }

    let renderer;
    let scene;
    let camera;
    let controls;
    let animationFrame;
    let model;
    let objectUrl;
    let mounted = true;

    const initScene = () => {
      const container = containerRef.current;
      const canvas = canvasRef.current;
      if (!container || !canvas) {
        return;
      }

      const rect = container.getBoundingClientRect();
      const width = rect.width || 300;
      const heightPx = rect.height || height;

      renderer = new THREE.WebGLRenderer({
        canvas,
        antialias: true,
        alpha: true,
      });
      renderer.setPixelRatio(window.devicePixelRatio || 1);
      renderer.setSize(width, heightPx, false);

      scene = new THREE.Scene();

      camera = new THREE.PerspectiveCamera(45, width / heightPx, 0.1, 5000);
      camera.position.set(0, 0, 3);

      const ambient = new THREE.AmbientLight(0xffffff, 0.8);
      scene.add(ambient);

      const directional = new THREE.DirectionalLight(0xffffff, 0.6);
      directional.position.set(5, 10, 7.5);
      scene.add(directional);

      const grid = new THREE.GridHelper(10, 10, 0x888888, 0x444444);
      grid.position.y = -1;
      scene.add(grid);

      const loader = new GLTFLoader();

      const loadModel = async () => {
        try {
          setLoading(true);
          setError("");
          const response = await fetch(`${API_BASE_URL}/documents/${documentId}/3d`);
          if (!response.ok) {
            throw new Error("Failed to load 3D model");
          }
          const arrayBuffer = await response.arrayBuffer();
          const blob = new Blob([arrayBuffer], { type: "model/gltf-binary" });
          objectUrl = URL.createObjectURL(blob);

          loader.load(
            objectUrl,
            gltf => {
              if (!mounted) {
                return;
              }
              model = gltf.scene;
              scene.add(model);

              const box = new THREE.Box3().setFromObject(model);
              let size = box.getSize(new THREE.Vector3());
              let center = box.getCenter(new THREE.Vector3());

              const maxDim = Math.max(size.x, size.y, size.z) || 1;
              const maxTarget = 50;
              if (maxDim > maxTarget) {
                const scale = maxTarget / maxDim;
                model.scale.setScalar(scale);
                box.setFromObject(model);
                size = box.getSize(new THREE.Vector3());
                center = box.getCenter(new THREE.Vector3());
              }

              model.position.x += model.position.x - center.x;
              model.position.y += model.position.y - center.y;
              model.position.z += model.position.z - center.z;

              const finalMaxDim = Math.max(size.x, size.y, size.z) || 1;
              const fov = (camera.fov * Math.PI) / 180;
              let cameraZ = finalMaxDim / (2 * Math.tan(fov / 2));
              cameraZ *= 1.8;
              camera.near = Math.max(cameraZ / 100, 0.1);
              camera.far = cameraZ * 10;
              camera.updateProjectionMatrix();
              camera.position.set(0, 0, cameraZ);
              camera.lookAt(new THREE.Vector3(0, 0, 0));

              setLoading(false);
              renderScene();
            },
            undefined,
            () => {
              if (!mounted) {
                return;
              }
              setLoading(false);
              setError("Unable to load 3D model");
            }
          );
        } catch (e) {
          if (!mounted) {
            return;
          }
          setLoading(false);
          setError("Unable to load 3D model");
        }
      };

      const renderScene = () => {
        animationFrame = requestAnimationFrame(renderScene);
        if (model) {
          model.rotation.y += 0.0025;
        }
        renderer.render(scene, camera);
      };

      const handleResize = () => {
        if (!renderer || !camera || !container) {
          return;
        }
        const rectResize = container.getBoundingClientRect();
        const widthResize = rectResize.width || 300;
        const heightResize = rectResize.height || height;
        camera.aspect = widthResize / heightResize;
        camera.updateProjectionMatrix();
        renderer.setSize(widthResize, heightResize, false);
      };

      window.addEventListener("resize", handleResize);
      loadModel();

      return () => {
        window.removeEventListener("resize", handleResize);
      };
    };

    const cleanup = () => {
      mounted = false;
      if (animationFrame) {
        cancelAnimationFrame(animationFrame);
      }
      if (scene) {
        scene.traverse(child => {
          if (child.isMesh) {
            child.geometry.dispose();
            if (Array.isArray(child.material)) {
              child.material.forEach(m => m.dispose && m.dispose());
            } else if (child.material && child.material.dispose) {
              child.material.dispose();
            }
          }
        });
      }
      if (renderer) {
        renderer.dispose();
      }
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };

    initScene();

    return () => {
      cleanup();
    };
  }, [documentId, height]);

  if (!documentId) {
    return (
      <div className="w-full h-full flex items-center justify-center">
        <Empty description="No 3D model selected" />
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="w-full h-full bg-white rounded border border-gray-200 overflow-hidden relative"
      style={{ minHeight: height }}
    >
      <canvas ref={canvasRef} style={{ width: "100%", height: "100%", display: "block" }} />
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-white/70">
          <Spin tip="Loading 3D model..." />
        </div>
      )}
      {error && !loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-white/80">
          <Text type="danger" className="text-xs">
            {error}
          </Text>
        </div>
      )}
    </div>
  );
};

export default ModelViewer3D;

