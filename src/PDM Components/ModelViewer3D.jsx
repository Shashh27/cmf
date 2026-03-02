import React, { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { Spin, Empty, Typography } from "antd";
import { API_BASE_URL } from "../Config/auth";

const { Text } = Typography;

const modelCache = new Map();

const ModelViewer3D = ({ documentId, height = 160, showControls = false }) => {
  const containerRef = useRef(null);
  const canvasRef = useRef(null);
  const rendererRef = useRef(null);
  const sceneRef = useRef(null);
  const cameraRef = useRef(null);
  const modelRef = useRef(null);
  const animationFrameRef = useRef(null);
  const controlsRef = useRef(null);
  const baseDistanceRef = useRef(3);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!documentId) {
      return;
    }

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

      const renderer = new THREE.WebGLRenderer({
        canvas,
        antialias: true,
        alpha: true,
      });
      renderer.setPixelRatio(window.devicePixelRatio || 1);
      renderer.setSize(width, heightPx, false);
      rendererRef.current = renderer;

      const scene = new THREE.Scene();
      sceneRef.current = scene;

      const camera = new THREE.PerspectiveCamera(45, width / heightPx, 0.1, 5000);
      camera.position.set(0, 0, 3);
      cameraRef.current = camera;

      const ambient = new THREE.AmbientLight(0xffffff, 0.8);
      scene.add(ambient);

      const directional = new THREE.DirectionalLight(0xffffff, 0.6);
      directional.position.set(5, 10, 7.5);
      scene.add(directional);

      const grid = new THREE.GridHelper(10, 10, 0x888888, 0x444444);
      grid.position.y = -1;
      scene.add(grid);

      if (showControls) {
        const controls = new OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.dampingFactor = 0.08;
        controls.enablePan = false;
        controlsRef.current = controls;
      }

      const loader = new GLTFLoader();

      const loadModel = async () => {
        try {
          setLoading(true);
          setError("");

          let arrayBuffer;
          if (modelCache.has(documentId)) {
            arrayBuffer = modelCache.get(documentId);
          } else {
            const response = await fetch(`${API_BASE_URL}/documents/${documentId}/3d`);
            if (!response.ok) {
              let message = "Unable to load 3D model";
              try {
                const data = await response.json();
                if (data && data.detail) {
                  message = typeof data.detail === "string" ? data.detail : JSON.stringify(data.detail);
                } else if (response.status === 404) {
                  message = "No 3D preview available for this document";
                }
              } catch (e) {}
              throw new Error(message);
            }
            arrayBuffer = await response.arrayBuffer();
            modelCache.set(documentId, arrayBuffer);
          }

          const blob = new Blob([arrayBuffer], { type: "model/gltf-binary" });
          objectUrl = URL.createObjectURL(blob);

          loader.load(
            objectUrl,
            gltf => {
              if (!mounted) {
                return;
              }
              const sceneLocal = sceneRef.current;
              const cameraLocal = cameraRef.current;
              if (!sceneLocal || !cameraLocal) {
                return;
              }

              const model = gltf.scene;
              modelRef.current = model;
              sceneLocal.add(model);

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
              const fov = (cameraLocal.fov * Math.PI) / 180;
              let cameraZ = finalMaxDim / (2 * Math.tan(fov / 2));
              cameraZ *= 1.8;
              cameraLocal.near = Math.max(cameraZ / 100, 0.1);
              cameraLocal.far = cameraZ * 10;
              cameraLocal.updateProjectionMatrix();
              cameraLocal.position.set(0, 0, cameraZ);
              cameraLocal.lookAt(new THREE.Vector3(0, 0, 0));
              baseDistanceRef.current = cameraZ;

              setLoading(false);

              const renderScene = () => {
                animationFrameRef.current = requestAnimationFrame(renderScene);
                const currentModel = modelRef.current;
                const currentCamera = cameraRef.current;
                const currentScene = sceneRef.current;
                const currentRenderer = rendererRef.current;
                const currentControls = controlsRef.current;
                if (!currentCamera || !currentScene || !currentRenderer) {
                  return;
                }
                if (!showControls && currentModel) {
                  currentModel.rotation.y += 0.0025;
                }
                if (currentControls) {
                  currentControls.update();
                }
                currentRenderer.render(currentScene, currentCamera);
              };

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
          setError(e && e.message ? e.message : "Unable to load 3D model");
        }
      };

      const handleResize = () => {
        const renderer = rendererRef.current;
        const camera = cameraRef.current;
        const containerResize = containerRef.current;
        if (!renderer || !camera || !containerResize) {
          return;
        }
        const rectResize = containerResize.getBoundingClientRect();
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
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      const scene = sceneRef.current;
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
      const renderer = rendererRef.current;
      if (renderer) {
        renderer.dispose();
        rendererRef.current = null;
      }
      const controls = controlsRef.current;
      if (controls) {
        controls.dispose();
        controlsRef.current = null;
      }
      modelRef.current = null;
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };

    initScene();

    return () => {
      cleanup();
    };
  }, [documentId, height, showControls]);

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
      style={{ minHeight: height, maxWidth: '100%' }}
    >
      <canvas ref={canvasRef} style={{ width: "100%", height: "100%", display: "block", maxWidth: '100%' }} />
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-white/70">
          <Spin>
            <span className="text-sm text-gray-700">Loading 3D model...</span>
          </Spin>
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

