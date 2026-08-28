import { useState, Suspense, useMemo, memo } from 'react'
import { Html, useGLTF, Billboard } from '@react-three/drei'
import * as THREE from 'three'

const STATUS_CONFIG = {
  PRODUCTION:  { color: '#22c55e', emissive: '#16a34a', label: 'Production',  hex: '#22c55e' },
  ON:          { color: '#f59e0b', emissive: '#d97706', label: 'Idle',        hex: '#f59e0b' },
  IDLE:        { color: '#f59e0b', emissive: '#d97706', label: 'Idle',        hex: '#f59e0b' },
  OFF:         { color: '#8796a8', emissive: '#5f6d7e', label: 'Off',         hex: '#8796a8' },
  MAINTENANCE: { color: '#ef4444', emissive: '#dc2626', label: 'Maintenance', hex: '#ef4444' },
}


function ProceduralCNC3D({ statusColor = '#3b82f6' }) {
  return (
    <group position={[0, 0, 0]}>
      {/* Main Lower Machine Body Base */}
      <mesh position={[0, 0.5, 0]} castShadow receiveShadow>
        <boxGeometry args={[2.4, 1.0, 2.0]} />
        <meshStandardMaterial color="#1e293b" roughness={0.4} metalness={0.6} />
      </mesh>

      {/* Main Upper Machine Housing */}
      <mesh position={[0, 1.5, -0.1]} castShadow receiveShadow>
        <boxGeometry args={[2.3, 1.1, 1.7]} />
        <meshStandardMaterial color="#e2e8f0" roughness={0.3} metalness={0.4} />
      </mesh>

      {/* Colored Machine Accent Stripe */}
      <mesh position={[0, 1.02, 0.86]}>
        <boxGeometry args={[2.32, 0.08, 0.04]} />
        <meshStandardMaterial color={statusColor} emissive={statusColor} emissiveIntensity={0.4} />
      </mesh>

      {/* Front Glass Door Window */}
      <mesh position={[-0.2, 1.45, 0.77]}>
        <boxGeometry args={[1.2, 0.85, 0.05]} />
        <meshPhysicalMaterial
          color="#38bdf8"
          transmission={0.6}
          opacity={0.7}
          transparent
          roughness={0.1}
          ior={1.5}
        />
      </mesh>

      {/* Internal Spindle / Chuck (Visible through glass) */}
      <mesh position={[-0.2, 1.45, 0.2]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.2, 0.2, 0.4, 16]} />
        <meshStandardMaterial color="#94a3b8" metalness={0.9} roughness={0.2} />
      </mesh>

      {/* CNC Control Panel Screen & Arm */}
      <group position={[0.85, 1.5, 0.85]} rotation={[0, -0.3, 0]}>
        {/* Support Arm */}
        <mesh position={[0, 0, -0.2]}>
          <cylinderGeometry args={[0.03, 0.03, 0.5, 8]} />
          <meshStandardMaterial color="#64748b" metalness={0.7} />
        </mesh>
        {/* Monitor Screen Frame */}
        <mesh position={[0, 0.1, 0]}>
          <boxGeometry args={[0.55, 0.45, 0.08]} />
          <meshStandardMaterial color="#0f172a" roughness={0.5} />
        </mesh>
        {/* Glowing Screen Display */}
        <mesh position={[0, 0.12, 0.045]}>
          <planeGeometry args={[0.45, 0.32]} />
          <meshBasicMaterial color="#0284c7" />
        </mesh>
      </group>
    </group>
  )
}

function MachineModel({ type, statusColor }) {
  const { scene } = useGLTF('/assets/shopfloor/cnc1.glb')
  const clonedScene = useMemo(() => scene.clone(true), [scene])
  
  return (
    <group position={[0, 0, 0]} scale={[1, 1, 1]}>
      <primitive object={clonedScene} position={[0, 0, 0]} />
    </group>
  )
}

function AndonTower({ status, x = 0, z = 0 }) {
  const s = STATUS_CONFIG[status] || STATUS_CONFIG.OFF

  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, 1.7, 0]}>
        <cylinderGeometry args={[0.028, 0.028, 0.6, 8]}/>
        <meshStandardMaterial color="#94a3b8" roughness={0.4} metalness={0.7}/>
      </mesh>
      <mesh position={[0, 2.02, 0]}>
        <cylinderGeometry args={[0.08, 0.08, 0.12, 12]}/>
        <meshStandardMaterial color="#ef4444" emissive="#dc2626" emissiveIntensity={status === 'MAINTENANCE' ? 1.2 : 0.05} roughness={0.2}/>
      </mesh>
      <mesh position={[0, 2.17, 0]}>
        <cylinderGeometry args={[0.08, 0.08, 0.12, 12]}/>
        <meshStandardMaterial color="#f59e0b" emissive="#d97706" emissiveIntensity={status === 'ON' || status === 'IDLE' ? 1.2 : 0.05} roughness={0.2}/>
      </mesh>
      <mesh position={[0, 2.32, 0]}>
        <cylinderGeometry args={[0.08, 0.08, 0.12, 12]}/>
        <meshStandardMaterial color={s.color} emissive={s.emissive} emissiveIntensity={status === 'PRODUCTION' ? 1.0 : status === 'OFF' ? 0.55 : 0.05} roughness={0.2}/>
      </mesh>
      <mesh position={[0, 2.41, 0]}>
        <cylinderGeometry args={[0.08, 0.05, 0.06, 12]}/>
        <meshStandardMaterial color="#475569" roughness={0.5}/>
      </mesh>
      <mesh rotation={[-Math.PI/2,0,0]} position={[0,0.012,0]}>
        <circleGeometry args={[0.5, 24]}/>
        <meshBasicMaterial color={s.color} transparent opacity={0.25} depthWrite={false} side={THREE.DoubleSide}/>
      </mesh>
    </group>
  )
}

function MachineStateIcon({ status, isSelected }) {
  const s = STATUS_CONFIG[status] || STATUS_CONFIG.OFF

  const innerShape = status === 'MAINTENANCE' ? (
    <mesh rotation={[0, Math.PI / 4, 0]}>
      <octahedronGeometry args={[0.34, 0]} />
      <meshBasicMaterial color={s.color} />
    </mesh>
  ) : (
    <mesh>
      <sphereGeometry args={[0.36, 28, 28]} />
      <meshBasicMaterial color={s.color} />
    </mesh>
  )

  return (
    <group position={[0, 3.35, 0]} scale={isSelected ? 1.18 : 1}>
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.44, 0.11, 20, 40]} />
        <meshStandardMaterial color="#141414" roughness={0.4} metalness={0.55} />
      </mesh>
      {status === 'OFF' && (
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.35, 0.38, 32]} />
          <meshBasicMaterial color="#f1f5f9" depthWrite={false} />
        </mesh>
      )}
      {innerShape}
      {isSelected && (
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.56, 0.62, 40]} />
          <meshBasicMaterial color={s.color} transparent opacity={0.45} depthWrite={false} />
        </mesh>
      )}
    </group>
  )
}

function WorkCenterFlag({ workCenter, color }) {
  const flagH = 44
  const pointW = 14

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      userSelect: 'none',
      pointerEvents: 'none',
    }}>
      <div style={{
        width: 3,
        height: 14,
        background: 'linear-gradient(180deg, #e2e8f0, #475569)',
        borderRadius: 2,
      }} />
      <div style={{
        width: 32,
        height: 4,
        background: '#334155',
        borderRadius: 2,
        marginBottom: 2,
      }} />
      <div style={{
        display: 'flex',
        alignItems: 'center',
        filter: 'drop-shadow(0 6px 14px rgba(15,23,42,0.35))',
      }}>
        <div style={{
          width: 0,
          height: 0,
          borderTop: `${flagH / 2}px solid transparent`,
          borderBottom: `${flagH / 2}px solid transparent`,
          borderRight: `${pointW}px solid ${color}`,
        }} />
        <div style={{
          background: color,
          color: '#ffffff',
          height: flagH,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '0 22px',
          fontFamily: "'Inter',system-ui,sans-serif",
          borderTop: '2px solid rgba(255,255,255,0.35)',
          borderBottom: '2px solid rgba(0,0,0,0.12)',
          minWidth: 80,
        }}>
          <span style={{
            fontSize: 8,
            fontWeight: 700,
            letterSpacing: '0.14em',
            color: 'rgba(255,255,255,0.9)',
            textTransform: 'uppercase',
            marginBottom: 2,
          }}>
            Work Center
          </span>
          <span style={{
            fontSize: 15,
            fontWeight: 800,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            whiteSpace: 'nowrap',
            lineHeight: 1.1,
            textShadow: '0 1px 2px rgba(0,0,0,0.25)',
          }}>
            {workCenter}
          </span>
        </div>
        <div style={{
          width: 0,
          height: 0,
          borderTop: `${flagH / 2}px solid transparent`,
          borderBottom: `${flagH / 2}px solid transparent`,
          borderLeft: `${pointW}px solid ${color}`,
        }} />
      </div>
    </div>
  )
}

/* Floating Flag style badge used for 3D machines, matching the WorkCenterFlag style */
function MachineFlag({ name, color }) {
  const flagH = 26
  const pointW = 8

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      userSelect: 'none',
      pointerEvents: 'none',
    }}>
      <div style={{
        width: 2,
        height: 10,
        background: 'linear-gradient(180deg, #e2e8f0, #475569)',
        borderRadius: 1,
      }} />
      <div style={{
        display: 'flex',
        alignItems: 'center',
        filter: 'drop-shadow(0 4px 8px rgba(15,23,42,0.25))',
      }}>
        <div style={{
          width: 0,
          height: 0,
          borderTop: `${flagH / 2}px solid transparent`,
          borderBottom: `${flagH / 2}px solid transparent`,
          borderRight: `${pointW}px solid ${color}`,
        }} />
        <div style={{
          background: color,
          color: '#ffffff',
          height: flagH,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '0 12px',
          fontFamily: "'Inter',system-ui,sans-serif",
          borderTop: '1.5px solid rgba(255,255,255,0.35)',
          borderBottom: '1.5px solid rgba(0,0,0,0.12)',
        }}>
          <span style={{
            fontSize: 10,
            fontWeight: 800,
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
            whiteSpace: 'nowrap',
            lineHeight: 1.1,
            textShadow: '0 1px 2px rgba(0,0,0,0.25)',
          }}>
            {name}
          </span>
        </div>
        <div style={{
          width: 0,
          height: 0,
          borderTop: `${flagH / 2}px solid transparent`,
          borderBottom: `${flagH / 2}px solid transparent`,
          borderLeft: `${pointW}px solid ${color}`,
        }} />
      </div>
    </div>
  )
}
function WorkCenterZone({ workCenter, position, width, depth, color }) {

  const borderGeometry = useMemo(
    () => new THREE.EdgesGeometry(new THREE.PlaneGeometry(width, depth)),
    [width, depth],
  )

  return (
    <group position={[position.x, position.y, position.z]}>
      {/* Soft floor pad + outline only (no raised walls / pillars) */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[width, depth]} />
        <meshStandardMaterial
          color={color}
          transparent
          opacity={0.08}
          roughness={0.9}
          metalness={0.05}
          depthWrite={false}
        />
      </mesh>
      <lineSegments rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]} geometry={borderGeometry}>
        <lineBasicMaterial color={color} transparent opacity={0.40} linewidth={1} />
      </lineSegments>

      <Billboard position={[0, 6.2, 0]} follow>
        <Html
          center
          transform
          distanceFactor={6.5}
          zIndexRange={[500, 400]}
          occlude={false}
          style={{ pointerEvents: 'none' }}
        >
          <WorkCenterFlag workCenter={workCenter} color={color} />
        </Html>
      </Billboard>
    </group>
  )
}

const Machine = memo(function Machine({ id, type, workCenter, position, status, make, model, isSelected, visible, onClick, workCenters }) {
  const [hovered, setHovered] = useState(false)
  const s = STATUS_CONFIG[status] || STATUS_CONFIG.OFF

  // Convert position object to array to avoid read-only errors
  const posArray = useMemo(() => [position.x, position.y, position.z], [position.x, position.y, position.z])

  return (
    <group
      visible={visible}
      position={posArray}
      onClick={e => { e.stopPropagation(); onClick() }}
      onPointerOver={e => { e.stopPropagation(); setHovered(true); document.body.style.cursor = 'pointer' }}
      onPointerOut={() => { setHovered(false); document.body.style.cursor = 'auto' }}
    >
      {/* thin foundation pad the machine stands on */}
      <mesh position={[0,0.04,0]} receiveShadow>
        <boxGeometry args={[3.6,0.08,3.6]}/>
        <meshStandardMaterial color='#b6bbc2' roughness={0.75} metalness={0.08}/>
      </mesh>
      {/* painted safety outline around the pad */}
      <mesh rotation={[-Math.PI/2,0,0]} position={[0,0.085,0]}>
        <ringGeometry args={[1.85,1.95,4]}/>
        <meshStandardMaterial color={hovered ? '#f5c518' : '#f5c51855'} transparent opacity={0.6} depthWrite={false}/>
      </mesh>
      {isSelected && (
        <>
          {/* glowing floor rings — color matches machine state */}
          <mesh rotation={[-Math.PI/2,0,0]} position={[0,0.022,0]}>
            <ringGeometry args={[2.05,2.3,64]}/>
            <meshBasicMaterial color={s.color} transparent opacity={0.75} depthWrite={false}/>
          </mesh>
          <mesh rotation={[-Math.PI/2,0,0]} position={[0,0.018,0]}>
            <ringGeometry args={[2.3,3.0,64]}/>
            <meshBasicMaterial color={s.color} transparent opacity={0.2} depthWrite={false}/>
          </mesh>
          {/* highlight cage around the machine */}
          <mesh position={[0,1.7,0]}>
            <boxGeometry args={[3.7,3.4,3.7]}/>
            <meshBasicMaterial color={s.color} transparent opacity={0.14} depthWrite={false}/>
          </mesh>
          <lineSegments position={[0,1.7,0]}>
            <edgesGeometry args={[new THREE.BoxGeometry(3.7,3.4,3.7)]}/>
            <lineBasicMaterial color={s.color} linewidth={2}/>
          </lineSegments>
          {/* light beam from above */}
          <spotLight position={[0,9,0]} angle={0.5} penumbra={0.6} intensity={6} color={s.color} distance={16} target-position={[0,0,0]}/>
        </>
      )}
      <group position={[0,0.08,0]} scale={[1,1,1]}>
        <Suspense fallback={<ProceduralCNC3D statusColor={s.color} />}>
          <MachineModel type={type} statusColor={s.color}/>
        </Suspense>
      </group>
      <AndonTower status={status} x={1.4} z={-1.4}/>
      <MachineStateIcon status={status} isSelected={isSelected} />

      {/* Machine flag — always visible, floating above the machine model */}
      <Billboard position={[0, 4.4, 0]} follow>
        <Html
          center
          transform
          distanceFactor={6.5}
          zIndexRange={[400, 300]}
          occlude={false}
          style={{ pointerEvents: 'none' }}
        >
          <MachineFlag 
            name={make} 
            color={workCenters[workCenter]?.color || '#64748b'} 
          />
        </Html>
      </Billboard>
    </group>
  )
})

function matchesMachineStatus(machine, filter) {
  if (filter === 'ALL') return true
  if (filter === 'IDLE') return machine.status === 'IDLE' || machine.status === 'ON'
  return machine.status === filter
}

export default function MachineGrid({ machines, selected, onSelect, workCenters, workCenterZones = [], statusFilter = 'ALL' }) {
  return (
    <group>
      {workCenterZones.map(zone => (
        <WorkCenterZone key={zone.workCenter} {...zone} />
      ))}
      {machines.map(m => (
        <Machine 
          key={m.id} 
          {...m}
          visible={matchesMachineStatus(m, statusFilter)}
          isSelected={selected === m.id} 
          onClick={() => onSelect(m.id)}
          workCenters={workCenters}
        />
      ))}
    </group>
  )
}

useGLTF.preload('/assets/shopfloor/cnc1.glb')