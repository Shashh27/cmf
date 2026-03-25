
import React, { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { Spin, Empty, Typography } from "antd";
import axios from "axios";
import { API_BASE_URL } from "../../Config/auth";

const { Text } = Typography;

const modelCache = new Map();

const ModelViewer3D = ({ documentId, height = 160, showControls = false, initialView = 'default', showEdgeButton = true, restrictZoom = true }) => {
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
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.2;
      rendererRef.current = renderer;

      const scene = new THREE.Scene();
      sceneRef.current = scene;

      const camera = new THREE.PerspectiveCamera(45, width / heightPx, 0.1, 5000);
      camera.position.set(0, 0, 3);
      cameraRef.current = camera;

      // --- LIGHTING SETUP ---
      // 1. Hemisphere Light (Natural outdoor-like lighting from all angles)
      const hemisphereLight = new THREE.HemisphereLight(0xffffff, 0x444444, 1.5);
      scene.add(hemisphereLight);

      // 2. Main Directional Light (Key Light from above-right)
      const mainLight = new THREE.DirectionalLight(0xffffff, 1.2);
      mainLight.position.set(5, 10, 7.5);
      scene.add(mainLight);

      // 3. Fill Directional Light (Softens shadows from above-left)
      const fillLight = new THREE.DirectionalLight(0xffffff, 0.6);
      fillLight.position.set(-5, 5, -7.5);
      scene.add(fillLight);

      // 4. Bottom Light (For bottom view visibility)
      const bottomLight = new THREE.DirectionalLight(0xffffff, 0.8);
      bottomLight.position.set(0, -10, 0);
      scene.add(bottomLight);

      // 5. Stronger Ambient Light (General brightness from all directions)
      const ambient = new THREE.AmbientLight(0xffffff, 0.8);
      scene.add(ambient);

      // Always enable OrbitControls for manual rotation and zoom
      const controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.dampingFactor = 0.08;
      controls.enablePan = false;
      
      // Controls are now always enabled for rotation and zoom
      controls.enableRotate = true;
      controls.enableZoom = true;
      
      controlsRef.current = controls;

      const loader = new GLTFLoader();
      
      // Add DRACOLoader for much faster loading of compressed meshes
      const dracoLoader = new DRACOLoader();
      // Using Google's hosted draco decoder for convenience and speed
      dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/');
      loader.setDRACOLoader(dracoLoader);

      const loadModel = async () => {
        try {
          setLoading(true);
          setError("");

          let arrayBuffer;
          if (modelCache.has(documentId)) {
            arrayBuffer = modelCache.get(documentId);
          } else {
            const response = await axios.get(
              `${API_BASE_URL}/documents/${documentId}/3d`,
              { responseType: "arraybuffer" }
            );
            arrayBuffer = response.data;
            modelCache.set(documentId, arrayBuffer);
          }

          const blob = new Blob([arrayBuffer], { type: "model/gltf-binary" });
          objectUrl = URL.createObjectURL(blob);

          loader.load(
            objectUrl,
            gltf => {
              if (!mounted) {
                URL.revokeObjectURL(objectUrl);
                return;
              }
              const sceneLocal = sceneRef.current;
              const cameraLocal = cameraRef.current;
              if (!sceneLocal || !cameraLocal) {
                setLoading(false);
                URL.revokeObjectURL(objectUrl);
                return;
              }

              const model = gltf.scene;
              
              // Enhance material appearance and add edges for better visibility
              model.traverse(node => {
                if (node.isMesh) {
                  if (node.material) {
                    node.material.color.convertSRGBToLinear();
                    if (node.material.metalness !== undefined) {
                      node.material.metalness = Math.min(node.material.metalness, 0.7);
                    }
                    if (node.material.roughness !== undefined) {
                      node.material.roughness = Math.max(node.material.roughness, 0.3);
                    }
                  }
                  
                  // Add colored edges for better visibility
                  const edges = new THREE.EdgesGeometry(node.geometry);
                  const edgeMaterial = new THREE.LineBasicMaterial({ 
                    color: 0x0066cc, // Blue color for edges
                    linewidth: 2
                  });
                  const edgesMesh = new THREE.LineSegments(edges, edgeMaterial);
                  edgesMesh.visible = false; // Initially hidden
                  node.add(edgesMesh);
                }
              });

              modelRef.current = model;
              sceneLocal.add(model);

              // Center the model correctly
              const box = new THREE.Box3().setFromObject(model);
              const center = box.getCenter(new THREE.Vector3());
              const size = box.getSize(new THREE.Vector3());

              model.position.x -= center.x;
              model.position.y -= center.y;
              model.position.z -= center.z;

              const maxDim = Math.max(size.x, size.y, size.z) || 1;
              const fov = (cameraLocal.fov * Math.PI) / 180;
              
              let cameraZ = maxDim / (2 * Math.tan(fov / 2));
              cameraZ *= 1.5;

              cameraLocal.near = maxDim / 100;
              cameraLocal.far = maxDim * 100;
              cameraLocal.updateProjectionMatrix();
              
              cameraLocal.position.set(0, 0, cameraZ);
              cameraLocal.lookAt(0, 0, 0);

              if (controlsRef.current) {
                controlsRef.current.target.set(0, 0, 0);
                if (restrictZoom) {
                  controlsRef.current.minDistance = cameraZ / 2;
                  controlsRef.current.maxDistance = cameraZ * 2;
                } else {
                  controlsRef.current.minDistance = 0;
                  controlsRef.current.maxDistance = Infinity;
                }
                controlsRef.current.update();
              }

              baseDistanceRef.current = cameraZ;
              
              // Set initial view if specified
              if (initialView !== 'default') {
                setCameraView(initialView, cameraLocal, controlsRef.current, cameraZ);
              }
              
              setLoading(false);
              URL.revokeObjectURL(objectUrl);

              const renderScene = () => {
                if (!mounted) return;
                animationFrameRef.current = requestAnimationFrame(renderScene);
                const currentCamera = cameraRef.current;
                const currentScene = sceneRef.current;
                const currentRenderer = rendererRef.current;
                const currentControls = controlsRef.current;
                if (!currentCamera || !currentScene || !currentRenderer) return;
                
                if (currentControls) {
                  currentControls.update();
                }
                currentRenderer.render(currentScene, currentCamera);
              };

              renderScene();
            },
            undefined,
            error => {
              console.error("GLTFLoader error:", error);
              if (!mounted) return;
              setLoading(false);
              setError("Failed to parse 3D model data");
              URL.revokeObjectURL(objectUrl);
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
        mounted = false;
        window.removeEventListener("resize", handleResize);
        if (objectUrl) {
          URL.revokeObjectURL(objectUrl);
        }
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
  }, [documentId, height, showControls, initialView]);

  useEffect(() => {
    if (modelRef.current) {
      modelRef.current.traverse(node => {
        if (node.isLineSegments) {
          node.visible = showEdges;
        }
      });
    }
  }, [showEdges]);

  // View presets for different camera positions
  const setCameraView = (viewType, camera, controls, distance) => {
    if (!camera || !controls) return;
  
    const dist = distance || baseDistanceRef.current;
  
    // Reset camera up vector before setting new position
    camera.up.set(0, 1, 0);
  
    switch(viewType) {
      case 'front':
        camera.position.set(0, 0, dist);
        break;
      case 'back':
        camera.position.set(0, 0, -dist);
        break;
      case 'left':
        camera.position.set(-dist, 0, 0);
        break;
      case 'right':
        camera.position.set(dist, 0, 0);
        break;
      case 'top':
        camera.position.set(0, dist, 0);
        camera.up.set(0, 0, -1); // Point camera's "up" to the back
        break;
      case 'bottom':
        camera.position.set(0, -dist, 0);
        camera.up.set(0, 0, 1); // Point camera's "up" to the front
        break;
      case 'isometric':
        camera.position.set(dist, dist, dist);
        break;
      default:
        camera.position.set(0, 0, dist);
    }
  
    camera.lookAt(0, 0, 0);
    controls.target.set(0, 0, 0);
    controls.update();
  };

  return (
    <div
      ref={containerRef}
      className="w-full h-full bg-white rounded border border-gray-200 overflow-hidden relative"
      style={{ minHeight: height, maxWidth: '100%' }}
    >
      <canvas ref={canvasRef} style={{ width: "100%", height: "100%", display: "block", maxWidth: '100%' }} />
      {showEdgeButton && (
        <div className="absolute top-2 right-2">
          <button 
            onClick={() => setShowEdges(!showEdges)}
            className="px-2 py-1 bg-gray-200 text-gray-800 rounded text-xs hover:bg-gray-300"
          >
            {showEdges ? 'Hide Edges' : 'Show Edges'}
          </button>
        </div>
      )}
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

