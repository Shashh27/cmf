import React, { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { Spin, Typography } from "antd";
import axios from "axios";
import { API_BASE_URL } from "../Config/auth";

const { Text } = Typography;

const modelCache = new Map();

const ModelViewer3D = ({
  documentId,
  height = 160,
  showControls = false,
  initialView = 'default',
  showEdgeButton = true,
  restrictZoom = true,
}) => {
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
  const [showEdges, setShowEdges] = useState(false);
  const [activeView, setActiveView] = useState('front'); // ← tracks active button

  // ── View presets ────────────────────────────────────────────
  const setCameraView = (viewType, camera, controls, distance) => {
    if (!camera || !controls) return;
    const dist = distance || baseDistanceRef.current;
    camera.up.set(0, 1, 0);

    switch (viewType) {
      case 'front':      camera.position.set(0, 0, dist);        break;
      case 'back':       camera.position.set(0, 0, -dist);       break;
      case 'left':       camera.position.set(-dist, 0, 0);       break;
      case 'right':      camera.position.set(dist, 0, 0);        break;
      case 'top':        camera.position.set(0, dist, 0.01);     break;
      case 'bottom':     camera.position.set(0, -dist, 0.01);    break;
      case 'isometric':  camera.position.set(dist, dist, dist);  break;
      default:           camera.position.set(0, 0, dist);
    }

    camera.lookAt(0, 0, 0);
    controls.target.set(0, 0, 0);
    controls.update();
    setActiveView(viewType); // ← highlight the clicked button
  };

  // ── Main effect ─────────────────────────────────────────────
  useEffect(() => {
    if (!documentId) return;

    let objectUrl;
    let mounted = true;

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
            } else if (child.material?.dispose) {
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

      sceneRef.current = null;
      cameraRef.current = null;
      modelRef.current = null;

      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };

    const initScene = () => {
      const container = containerRef.current;
      const canvas = canvasRef.current;
      if (!container || !canvas) return;

      const rect = container.getBoundingClientRect();
      const width = rect.width || 300;
      const heightPx = rect.height || height;

      // ── Renderer — crisp at retina/high-DPI screens ──
      const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
      renderer.setPixelRatio(window.devicePixelRatio || 1);
      renderer.setSize(width, heightPx, false);
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.2;
      rendererRef.current = renderer;

      // ── Scene & Camera ──
      const scene = new THREE.Scene();
      sceneRef.current = scene;

      const camera = new THREE.PerspectiveCamera(45, width / heightPx, 0.1, 5000);
      camera.position.set(0, 0, 3);
      cameraRef.current = camera;

      // ── Lighting ──
      scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 1.5));

      const mainLight = new THREE.DirectionalLight(0xffffff, 1.2);
      mainLight.position.set(5, 10, 7.5);
      scene.add(mainLight);

      const fillLight = new THREE.DirectionalLight(0xffffff, 0.6);
      fillLight.position.set(-5, 5, -7.5);
      scene.add(fillLight);

      const bottomLight = new THREE.DirectionalLight(0xffffff, 0.8);
      bottomLight.position.set(0, -10, 0);
      scene.add(bottomLight);

      scene.add(new THREE.AmbientLight(0xffffff, 0.8));

      // ── Controls ──
      const controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.dampingFactor = 0.08;
      controls.enablePan = false;
      controls.enableRotate = true;
      controls.enableZoom = true;
      controlsRef.current = controls;

      // ── Loaders ──
      const loader = new GLTFLoader();
      const dracoLoader = new DRACOLoader();
      dracoLoader.setDecoderPath('/static/draco/');
      loader.setDRACOLoader(dracoLoader);

      // ── Load model ──
      const loadModel = async () => {
        try {
          setLoading(true);
          setError("");

          let arrayBuffer;
          if (modelCache.has(documentId)) {
            arrayBuffer = modelCache.get(documentId);
          } else {
            try {
              const response = await axios.get(
                `${API_BASE_URL}/documents/${documentId}/3d`,
                { responseType: "arraybuffer" }
              );
              arrayBuffer = response.data;
              modelCache.set(documentId, arrayBuffer);
            } catch (apiError) {
              let errorMessage = "Unable to load 3D model";
              if (apiError.response?.data) {
                try {
                  if (apiError.response.data instanceof ArrayBuffer) {
                    const jsonStr = new TextDecoder('utf-8').decode(apiError.response.data);
                    const errorData = JSON.parse(jsonStr);
                    errorMessage = errorData.detail || errorData.message || `Error ${apiError.response.status}`;
                  } else if (typeof apiError.response.data === 'object') {
                    errorMessage = apiError.response.data.detail || apiError.response.data.message || apiError.message;
                  } else {
                    errorMessage = String(apiError.response.data);
                  }
                } catch {
                  errorMessage = apiError.response?.statusText || apiError.message;
                }
              } else {
                errorMessage = apiError.message;
              }
              throw new Error(errorMessage);
            }
          }

          const blob = new Blob([arrayBuffer], { type: "model/gltf-binary" });
          objectUrl = URL.createObjectURL(blob);

          loader.load(
            objectUrl,
            gltf => {
              if (!mounted) { URL.revokeObjectURL(objectUrl); return; }
              const sceneLocal = sceneRef.current;
              const cameraLocal = cameraRef.current;
              if (!sceneLocal || !cameraLocal) { setLoading(false); URL.revokeObjectURL(objectUrl); return; }

              const model = gltf.scene;

              model.traverse(node => {
                if (node.isMesh) {
                  if (node.material) {
                    node.material.color.convertSRGBToLinear();
                    node.material.polygonOffset = true;
                    node.material.polygonOffsetFactor = 1;
                    node.material.polygonOffsetUnits = 1;
                    if (node.material.metalness !== undefined)
                      node.material.metalness = Math.min(node.material.metalness, 0.7);
                    if (node.material.roughness !== undefined)
                      node.material.roughness = Math.max(node.material.roughness, 0.3);
                  }

                  const edges = new THREE.EdgesGeometry(node.geometry, 20);
                  const edgeMaterial = new THREE.LineBasicMaterial({
                    color: 0x333333,
                    depthTest: true,
                    transparent: true,
                    opacity: 0.6,
                  });
                  const edgesMesh = new THREE.LineSegments(edges, edgeMaterial);
                  edgesMesh.name = "modelEdges";
                  edgesMesh.visible = true;
                  node.add(edgesMesh);
                }
              });

              modelRef.current = model;
              sceneLocal.add(model);

              // Center & fit camera
              const box = new THREE.Box3().setFromObject(model);
              const center = box.getCenter(new THREE.Vector3());
              const size = box.getSize(new THREE.Vector3());

              model.position.sub(center);

              const maxDim = Math.max(size.x, size.y, size.z) || 1;
              const fov = (cameraLocal.fov * Math.PI) / 180;
              const cameraZ = (maxDim / (2 * Math.tan(fov / 2))) * 1.5;

              cameraLocal.near = maxDim / 100;
              cameraLocal.far = maxDim * 100;
              cameraLocal.updateProjectionMatrix();
              cameraLocal.position.set(0, 0, cameraZ);
              cameraLocal.lookAt(0, 0, 0);

              if (controlsRef.current) {
                controlsRef.current.target.set(0, 0, 0);
                controlsRef.current.minDistance = restrictZoom ? cameraZ / 2 : 0;
                controlsRef.current.maxDistance = restrictZoom ? cameraZ * 2 : Infinity;
                controlsRef.current.update();
              }

              baseDistanceRef.current = cameraZ;

              if (initialView !== 'default') {
                setCameraView(initialView, cameraLocal, controlsRef.current, cameraZ);
              }

              setLoading(false);
              URL.revokeObjectURL(objectUrl);

              const renderScene = () => {
                if (!mounted) return;
                animationFrameRef.current = requestAnimationFrame(renderScene);
                if (!cameraRef.current || !sceneRef.current || !rendererRef.current) return;
                if (controlsRef.current) controlsRef.current.update();
                rendererRef.current.render(sceneRef.current, cameraRef.current);
              };
              renderScene();
            },
            undefined,
            err => {
              console.error("GLTFLoader error:", err);
              if (!mounted) return;
              setLoading(false);
              setError("Failed to parse 3D model data");
              URL.revokeObjectURL(objectUrl);
            }
          );
        } catch (e) {
          if (!mounted) return;
          setLoading(false);
          setError(e?.message || "Unable to load 3D model");
        }
      };

      // ── Resize handler ──
      const handleResize = () => {
        if (!rendererRef.current || !cameraRef.current || !containerRef.current) return;
        const r = containerRef.current.getBoundingClientRect();
        const w = r.width || 300;
        const h = r.height || height;
        cameraRef.current.aspect = w / h;
        cameraRef.current.updateProjectionMatrix();
        rendererRef.current.setPixelRatio(window.devicePixelRatio || 1);
        rendererRef.current.setSize(w, h, false);
      };

      window.addEventListener("resize", handleResize);
      loadModel();

      return () => window.removeEventListener("resize", handleResize);
    };

    // Wait for modal DOM to be fully painted before initialising Three.js
    initScene();

    return () => {
      cleanup();
    };
  }, [documentId, height, showControls, initialView]);

  // ── Toggle hidden edges ─────────────────────────────────────
  useEffect(() => {
    if (!modelRef.current) return;
    modelRef.current.traverse(node => {
      if (node.isLineSegments && node.name === "modelEdges") {
        node.material.depthTest = !showEdges;
        node.material.opacity = showEdges ? 0.4 : 0.6;
        node.material.needsUpdate = true;
      }
    });
  }, [showEdges]);

  // ── Render ──────────────────────────────────────────────────
  return (
    <div
      ref={containerRef}
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        minHeight: height,
        maxWidth: '100%',
        background: '#fff',
        borderRadius: 4,
        border: '1px solid #e8e8e8',
        overflow: 'hidden',
      }}
    >
      {/* Canvas */}
      <canvas
        ref={canvasRef}
        style={{
          display: 'block',
          width: '100%',
          height: '100%',
          maxWidth: '100%',
        }}
      />

      {/* View buttons — active button turns blue */}
      <div style={{ position: 'absolute', top: 8, left: 8, display: 'flex', gap: 4 }}>
        {['front', 'isometric', 'top', 'bottom'].map(view => {
          const isActive = activeView === view;
          return (
            <button
              key={view}
              onClick={() => setCameraView(view, cameraRef.current, controlsRef.current)}
              style={{
                backgroundColor: isActive ? '#1677FF' : '#f0f0f0',
                color: isActive ? '#fff' : '#333',
                border: isActive ? 'none' : '1px solid #d9d9d9',
                borderRadius: 4,
                padding: '4px 8px',
                fontSize: 11,
                cursor: 'pointer',
                transition: 'background-color 0.2s, color 0.2s',
              }}
            >
              {view.charAt(0).toUpperCase() + view.slice(1)}
            </button>
          );
        })}
      </div>

      {/* Show/Hide hidden edges */}
      {showEdgeButton && (
        <div style={{ position: 'absolute', top: 8, right: 8 }}>
          <button
            onClick={() => setShowEdges(prev => !prev)}
            style={{
              backgroundColor: showEdges ? '#1677FF' : '#f0f0f0',
              color: showEdges ? '#fff' : '#333',
              border: showEdges ? 'none' : '1px solid #d9d9d9',
              borderRadius: 4,
              padding: '4px 8px',
              fontSize: 11,
              cursor: 'pointer',
              transition: 'background-color 0.2s, color 0.2s',
            }}
          >
            {showEdges ? 'Hide Hidden Edges' : 'Show Hidden Edges'}
          </button>
        </div>
      )}

      {/* Loading overlay */}
      {loading && (
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(255,255,255,0.75)',
        }}>
          <Spin>
            <span style={{ fontSize: 13, color: '#555' }}>Loading 3D model...</span>
          </Spin>
        </div>
      )}

      {/* Error overlay */}
      {error && !loading && (
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(255,255,255,0.85)',
          padding: 16,
        }}>
          <Text type="danger" style={{ fontSize: 12, textAlign: 'center', wordBreak: 'break-word' }}>
            {error}
          </Text>
        </div>
      )}
    </div>
  );
};

export default ModelViewer3D;