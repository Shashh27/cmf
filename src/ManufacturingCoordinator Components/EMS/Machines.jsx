import React, { Suspense, useEffect, useState, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, PresentationControls, Html, Environment, Grid } from '@react-three/drei';
import { Typography, Button, Spin, Space, Badge } from 'antd';
import { ArrowLeftOutlined, BarChartOutlined } from '@ant-design/icons';
import MachineOverlay from './MachineOverlay';
import Productivity from './Productivity';
import * as THREE from 'three';
import { useSpring, animated } from '@react-spring/three';
import { MeshStandardMaterial } from 'three';
import { API_BASE_URL } from '../../Config/auth';
import { authFetch } from '../../api/client.js';
import { useAuth } from '../../auth/AuthContext.jsx';
import { getApiWsUrl } from '../../auth/apiUrl.js';

const { Title, Text } = Typography;

// Rotating Machines Component
function RotatingMachines({ children, speed = 0.0005 }) {
  const groupRef = useRef();
  
  useFrame(() => {
    if (groupRef.current) {
      groupRef.current.rotation.y += speed;
    }
  });

  return <group ref={groupRef}>{children}</group>;
}

// Status Legend Component
const StatusLegend = ({ machineStates, machines, selectedFilter, onFilterChange }) => {
  // Count only machines shown on the floor (live EMS list), not every config machine
  const statuses = machines.map((m) => machineStates[m.id]?.status?.toUpperCase());
  const productionCount = statuses.filter((s) => s === 'PRODUCTION').length;
  const onCount = statuses.filter((s) => s === 'ON').length;
  const offCount = statuses.filter((s) => s === 'OFF' || !s).length;
  const totalCount = machines.length;

  const filterButtons = [
    { key: 'total', label: 'Total', count: totalCount, color: '#6366f1' },
    { key: 'production', label: 'Production', count: productionCount, color: '#22c55e' },
    { key: 'idle', label: 'Idle (On)', count: onCount, color: '#eab308' },
    { key: 'off', label: 'Off', count: offCount, color: '#94A3B8' },
  ];

  return (
    <div style={{
      position: 'absolute',
      top: '20px',
      right: '20px',
      background: 'white',
      padding: '12px',
      borderRadius: '8px',
      boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
      zIndex: 1000
    }}>
      <Space direction="vertical">
        {filterButtons.map((btn) => (
          <Button
            key={btn.key}
            type={selectedFilter === btn.key ? 'primary' : 'default'}
            size="small"
            onClick={() => onFilterChange(btn.key)}
            style={{
              backgroundColor: selectedFilter === btn.key ? btn.color : '#fff',
              borderColor: btn.color,
              color: selectedFilter === btn.key ? '#fff' : '#000',
              width: '140px',
              textAlign: 'left',
            }}
          >
            <span style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
              <span>{btn.label}</span>
              <strong>{btn.count}</strong>
            </span>
          </Button>
        ))}
      </Space>
    </div>
  );
};

const getStatusColor = (status) => {
  switch (status?.toUpperCase()) {
    case 'PRODUCTION':
      return '#22c55e';  // green
    case 'ON':
      return '#eab308';  // yellow
    case 'OFF':
    default:
      return '#94A3B8';  // grey (BEL color)
  }
};

// Status colors configuration with matte finish
const STATUS_COLORS = {
  OFF: "#94A3B8",      // Grey - Machine is OFF
  ON: "#eab308",       // Yellow - Machine is IDLE/ON
  PRODUCTION: "#22c55e"  // Green - Machine is in PRODUCTION
};

// Central Hub Component
function CentralHub() {
  return (
    <group position={[0, 0, 0]}>
    
      <Html position={[0, 2, 0]} center>
        <div className="bg-blue-600 text-white px-6 py-3 rounded-full text-xl font-bold whitespace-nowrap 
                      transform scale-150 shadow-xl border-2 border-blue-400">
          CMF Shop Floor
        </div>
      </Html>
    </group>
  );
}

// Enhanced CNC Machine Model Component
function MachineModel({ 
  position, 
  data, 
  status, 
  onClick, 
  isHovered,
  onPointerOver, 
  onPointerOut,
  rotation 
}) {
  const hoverScale = isHovered ? 1.1 : 1;
  const yOffset = isHovered ? 0.5 : 0;
  const statusColor = STATUS_COLORS[status] || STATUS_COLORS.OFF;
  
  const { opacity, modelScale, modelY } = useSpring({
    opacity: isHovered ? 1 : 0.3,
    modelScale: isHovered ? hoverScale : 1,
    modelY: isHovered ? yOffset : 0,
    config: { mass: 1, tension: 280, friction: 60 }
  });

  // Material properties - simplified for BEL-like solid colors
  const commonMaterialProps = {
    color: statusColor,
    metalness: 0,
    roughness: 0.5,
    transparent: false,
    opacity: 1
  };

  return (
    <animated.group
      position-y={modelY}
      scale={modelScale}
      position={position}
      rotation={rotation}
      onClick={onClick}
      onPointerOver={onPointerOver}
      onPointerOut={onPointerOut}
      opacity={opacity}
    >
      {/* Heavy Base Platform */}
      <mesh position={[0, 0.3, 0]} castShadow receiveShadow>
        <boxGeometry args={[5, 0.6, 4]} />
        <meshPhysicalMaterial {...commonMaterialProps} />
      </mesh>

      {/* Main Machine Body */}
      <group position={[0, 2.5, 0]}>
        {/* Main Enclosure */}
        <mesh position={[0, 0, 0]} castShadow>
          <boxGeometry args={[4.5, 4, 3.5]} />
          <meshPhysicalMaterial {...commonMaterialProps} />
        </mesh>

        {/* Front Glass Panel */}
        <mesh position={[0, 0, 1.76]} castShadow>
          <boxGeometry args={[4.2, 3.8, 0.1]} />
          <meshPhysicalMaterial 
            color={statusColor}
            transparent={true}
            opacity={0.4}
            metalness={0}
            roughness={0.1}
          />
        </mesh>

        {/* Top Cover with Slope */}
        <mesh position={[0, 2.1, -0.3]} rotation={[-0.2, 0, 0]} castShadow>
          <boxGeometry args={[4.5, 0.2, 4]} />
          <meshPhysicalMaterial {...commonMaterialProps} />
        </mesh>

        {/* Control Panel (Right Side) */}
        <group position={[2.26, 0, 0]}>
          {/* Main Panel Housing */}
          <mesh position={[0.2, 0, -0.5]} castShadow>
            <boxGeometry args={[0.4, 3.5, 2]} />
            <meshPhysicalMaterial {...commonMaterialProps} />
          </mesh>

          {/* Screen */}
          <mesh position={[0.41, 0.5, -0.5]} castShadow>
            <boxGeometry args={[0.05, 1.5, 1.2]} />
            <meshPhysicalMaterial 
              {...commonMaterialProps}
              emissive={statusColor}
              emissiveIntensity={0.3}
            />
          </mesh>

          {/* Control Panel Buttons */}
          <group position={[0.41, -1, -0.5]}>
            {[[-0.3, 0], [0, 0], [0.3, 0], [-0.3, -0.3], [0, -0.3], [0.3, -0.3]].map(([x, y], i) => (
              <mesh key={i} position={[0, y, x]} castShadow>
                <cylinderGeometry args={[0.08, 0.08, 0.05, 16]} />
                <meshPhysicalMaterial 
                  color="#E2E8F0"
                  metalness={0.5}
                  roughness={0.5}
                />
              </mesh>
            ))}
          </group>
        </group>

        {/* Work Area */}
        <group position={[0, -0.5, 0]}>
          {/* X-Axis Rail */}
          <mesh position={[0, 0, 0]} castShadow>
            <boxGeometry args={[3.8, 0.2, 0.4]} />
            <meshPhysicalMaterial 
              color="#CBD5E1"
              metalness={0.7}
              roughness={0.3}
            />
          </mesh>

          {/* Y-Axis Rail */}
          <mesh position={[0, 0, 0]} castShadow>
            <boxGeometry args={[0.4, 0.2, 2.8]} />
            <meshPhysicalMaterial 
              color="#CBD5E1"
              metalness={0.7}
              roughness={0.3}
            />
          </mesh>

          {/* Spindle Head */}
          <group position={[0, 0.5, 0]}>
            <mesh castShadow>
              <boxGeometry args={[0.8, 1, 0.8]} />
              <meshPhysicalMaterial {...commonMaterialProps} />
            </mesh>

            {/* Spindle */}
            <mesh position={[0, -0.7, 0]} castShadow>
              <cylinderGeometry args={[0.15, 0.12, 0.8, 16]} />
              <meshPhysicalMaterial 
                color="#94A3B8"
                metalness={0.8}
                roughness={0.2}
              />
            </mesh>

            {/* Tool Holder */}
            <mesh position={[0, -1.2, 0]} castShadow>
              <cylinderGeometry args={[0.08, 0.08, 0.3, 16]} />
              <meshPhysicalMaterial 
                color="#64748B"
                metalness={0.9}
                roughness={0.1}
              />
            </mesh>
          </group>
        </group>

        {/* Chip Conveyor */}
        <mesh position={[0, -1.8, 1.5]} castShadow>
          <boxGeometry args={[4, 0.3, 0.5]} />
          <meshPhysicalMaterial 
            color="#64748B"
            metalness={0.6}
            roughness={0.4}
          />
        </mesh>
      </group>

      {/* Machine Label */}
      <Html position={[0, 5, 0]} center>
        <div className={`
          transform transition-all duration-300
          ${isHovered ? 'scale-110' : 'scale-100'}
        `}>
          <div className="bg-white/90 backdrop-blur-sm px-3 py-2 rounded-lg shadow-lg min-w-[120px]">
            <div className="text-sm font-bold text-center text-gray-800">
              {data.name}
            </div>
            {data.workshop ? (
              <div className="text-xs text-center text-gray-600">
                {data.workshop}
              </div>
            ) : null}
          </div>
        </div>
      </Html>

      {/* Status Glow Effect */}
      {isHovered && (
        <mesh position={[0, 2, 0]}>
          <sphereGeometry args={[2.5, 32, 32]} />
          <meshBasicMaterial
            color={statusColor}
            transparent
            opacity={0.08}
            side={THREE.BackSide}
            blending={THREE.AdditiveBlending}
          />
        </mesh>
      )}
    </animated.group>
  );
}

// Enhanced Floor Component
function EnhancedFloor() {
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.001, 0]} receiveShadow>
        <planeGeometry args={[100, 100]} />
        <meshPhysicalMaterial 
          color="#ffffff"
          metalness={0.8}
          roughness={0.1}
          envMapIntensity={0.5}
        />
      </mesh>
      <Grid
        position={[0, 0.01, 0]}
        args={[100, 100]}
        cellSize={5}
        cellThickness={1}
        cellColor="#6366f1"
        sectionSize={20}
        sectionThickness={1.5}
        sectionColor="#3730a3"
        fadeDistance={80}
        fadeStrength={1}
        followCamera={false}
      />
    </group>
  );
}

// Enhanced Lighting Setup
function EnhancedLighting() {
  return (
    <>
      <ambientLight intensity={0.4} />
      <directionalLight
        position={[10, 20, 15]}
        intensity={1.2}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
      />
      <pointLight position={[20, 10, -20]} intensity={0.5} color="#ef4444" />
      <pointLight position={[-20, 10, 20]} intensity={0.5} color="#3b82f6" />
      <spotLight
        position={[0, 20, 0]}
        angle={0.3}
        penumbra={1}
        intensity={0.8}
        color="#818CF8"
        castShadow
      />
    </>
  );
}

// Main Machines Component
const Machines = ({ onBack }) => {
  const { isAuthenticated, bootstrapping } = useAuth();
  const [machines, setMachines] = useState([]);
  const [loading, setLoading] = useState(false);
  const [machineStates, setMachineStates] = useState({});
  const [selectedMachineId, setSelectedMachineId] = useState(null);
  const [selectedMachineName, setSelectedMachineName] = useState(null);
  const [hoveredMachine, setHoveredMachine] = useState(null);
  const [showProductivity, setShowProductivity] = useState(false);
  const [selectedFilter, setSelectedFilter] = useState('total');

  const fetchMachines = async () => {
    try {
      const response = await authFetch(`${API_BASE_URL}/energy-monitoring/machines/`);
      if (!response.ok) return;
      const data = await response.json();
      setMachines(data || []);
    } catch (error) {
      console.error('Error fetching machines:', error);
      setMachines([]);
    }
  };

  const applyMachineStates = (data) => {
    const statesMap = {};
    (data || []).forEach((machine) => {
      statesMap[machine.machine_id] = {
        status: machine.state,
        lastUpdated: machine.timestamp,
      };
    });
    setMachineStates(statesMap);
  };

  // Calculate positions in a hexagonal pattern with increased radius
  const getMachinePosition = (index, totalMachines) => {
    const angle = (index / totalMachines) * Math.PI * 2;
    const radius = 25; // Increased radius for more spacing (was 20 before)
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    return [x, 0, z];
  };

  useEffect(() => {
    if (bootstrapping || !isAuthenticated) return undefined;
    fetchMachines();
  }, [isAuthenticated, bootstrapping]);

  useEffect(() => {
    if (bootstrapping || !isAuthenticated) return undefined;

    let socket;
    let reconnectTimer;
    let closed = false;

    const connect = () => {
      if (closed) return;
      socket = new WebSocket(getApiWsUrl('energy-monitoring/all_machine_states/ws'));
      socket.onmessage = (event) => {
        try {
          applyMachineStates(JSON.parse(event.data));
        } catch (error) {
          console.error('Error parsing machine states WS message:', error);
        }
      };
      socket.onerror = () => {
        socket?.close();
      };
      socket.onclose = () => {
        if (closed) return;
        reconnectTimer = setTimeout(connect, 3000);
      };
    };

    connect();

    return () => {
      closed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      socket?.close();
    };
  }, [isAuthenticated, bootstrapping]);

  const handleMachineClick = (machineId) => {
    const selectedMachine = machines.find(machine => machine.id === machineId);
    console.log("Selected machine:", selectedMachine);
    console.log("Setting machineId:", machineId);
    console.log("Setting machineName:", selectedMachine?.machine_name);
    setSelectedMachineId(machineId);
    setSelectedMachineName(selectedMachine?.machine_name);
    // Reset the tab state to 'overview' when opening a new machine
    localStorage.setItem(`machine_${machineId}_tab`, 'overview');
  };

  // Filter machines based on selected filter
  const getFilteredMachines = () => {
    if (selectedFilter === 'total') return machines;
    
    return machines.filter(machine => {
      const machineState = machineStates[machine.id];
      const status = machineState?.status?.toUpperCase();
      
      switch (selectedFilter) {
        case 'production':
          return status === 'PRODUCTION';
        case 'idle':
          return status === 'ON';
        case 'off':
          return status === 'OFF' || !status;
        default:
          return true;
      }
    });
  };

  if (showProductivity) {
    return <Productivity onBack={() => setShowProductivity(false)} />;
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <Spin size="large" />
      </div>
    );
  }

  return (
    <div style={{ position: 'relative' }}>
      <div style={{ 
        position: 'absolute',
        top: '20px',
        right: '20px',
        zIndex: 10
      }}>
        {!selectedMachineId && (
          <Button 
            type="primary" 
            icon={<BarChartOutlined />}
            onClick={() => setShowProductivity(true)}
            style={{
              backgroundColor: '#52c41a',
              borderRadius: '6px'
            }}
          >
            Productivity
          </Button>
        )}
      </div>

      {!selectedMachineId && (
        <Title 
          level={2} 
          style={{ 
            margin: 0, 
            textAlign: 'center', 
            padding: '20px',
            color: '#000000',
            fontWeight: 600
          }}
        >
          CMF Shop Floor
        </Title>
      )}

      <div style={{ 
        width: '100%', 
        height: 'calc(100vh - 150px)',
        position: 'relative'
      }}>
        {!selectedMachineId ? (
          <>
            <StatusLegend 
              machineStates={machineStates} 
              machines={machines}
              selectedFilter={selectedFilter}
              onFilterChange={setSelectedFilter}
            />
            <Canvas
              camera={{ position: [0, 35, 45], fov: 45 }}
              shadows
              gl={{ 
                antialias: true,
                toneMapping: THREE.ACESFilmicToneMapping,
                toneMappingExposure: 1.2
              }}
            >
              <Suspense fallback={null}>
                <color attach="background" args={['#f8fafc']} />
                <EnhancedLighting />
                <EnhancedFloor />
                
                {/* Add Central Hub */}
                <CentralHub />

                <RotatingMachines speed={0.0005}>
                  {getFilteredMachines().map((machine, index) => {
                    const machineState = machineStates[machine.id];
                    const filteredMachines = getFilteredMachines();
                    const position = getMachinePosition(index, filteredMachines.length);
                    const angle = (index / filteredMachines.length) * Math.PI * 2;
                    
                    return (
                      <group key={machine.id}>
                        <MachineModel
                          position={position}
                          rotation={[0, -angle + Math.PI, 0]}
                          status={machineState?.status?.toUpperCase() || 'OFF'}
                          data={{
                            name: machine.machine_name,
                            workshop: machine.workshop_name || machine.work_center_name || '',
                          }}
                          onClick={() => handleMachineClick(machine.id)}
                          isHovered={hoveredMachine === machine.id}
                          onPointerOver={() => setHoveredMachine(machine.id)}
                          onPointerOut={() => setHoveredMachine(null)}
                        >
                        </MachineModel>
                      </group>
                    );
                  })}
                </RotatingMachines>

                {/* Replace Environment with a simpler setup */}
                {/* <Environment preset="city" /> */}
                <ambientLight intensity={0.8} />
                <directionalLight 
                  position={[10, 10, 5]} 
                  intensity={1} 
                  castShadow 
                  shadow-mapSize-width={2048} 
                  shadow-mapSize-height={2048}
                />

                <OrbitControls 
                  enableZoom={true}
                  enablePan={true}
                  enableRotate={true}
                  minPolarAngle={Math.PI / 4}
                  maxPolarAngle={Math.PI / 2.2}
                  minDistance={30}
                  maxDistance={70}
                />
              </Suspense>
            </Canvas>
          </>
        ) : (
          <MachineOverlay 
            machineId={selectedMachineId}
            machineName={selectedMachineName}
            onBack={() => {
              setSelectedMachineId(null);
              setSelectedMachineName(null);
            }}
          />
        )}
      </div>
    </div>
  );
};

export default Machines; 