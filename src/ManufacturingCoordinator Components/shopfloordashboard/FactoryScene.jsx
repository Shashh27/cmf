import * as THREE from 'three'

const FW = 80 // hall width  (X)
const FD = 64 // hall depth  (Z)

/* ---------- yellow floor aisle marking ---------- */
function Lane({ x1, z1, x2, z2, w = 0.25 }) {
  const dx = x2 - x1
  const dz = z2 - z1
  const len = Math.sqrt(dx * dx + dz * dz)
  const angle = Math.atan2(dx, dz)
  return (
    <mesh position={[(x1 + x2) / 2, 0.015, (z1 + z2) / 2]} rotation={[0, angle, 0]}>
      <boxGeometry args={[w, 0.01, len]} />
      <meshStandardMaterial color="#f5c518" roughness={0.5} emissive="#f5c518" emissiveIntensity={0.15} />
    </mesh>
  )
}

export default function FactoryScene() {
  return (
    <group>
      <ambientLight intensity={1.9} color="#eef2f7" />
      <hemisphereLight args={['#ffffff', '#b8c0cc', 1.1]} />
      <directionalLight
        position={[18, 38, 18]}
        intensity={2.6}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-40}
        shadow-camera-right={40}
        shadow-camera-top={40}
        shadow-camera-bottom={-40}
        shadow-camera-far={140}
        color="#fff6e8"
      />
      <directionalLight position={[-22, 24, -16]} intensity={0.9} color="#e6edff" />

      {/* Open concrete floor — no side walls / pillars / crane */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[FW, FD]} />
        <meshStandardMaterial color="#a09a88" roughness={0.85} metalness={0.05} />
      </mesh>

      {/* Main horizontal aisle */}
      <Lane x1={-FW / 2 + 2} z1={0} x2={FW / 2 - 2} z2={0} w={0.35} />

      {/* Central walkway between Turning / Grinding (left) and Milling (right) */}
      <mesh position={[-2, 0.02, 0]}>
        <boxGeometry args={[4, 0.02, FD - 2]} />
        <meshStandardMaterial color="#888278" roughness={0.85} metalness={0.05} />
      </mesh>
      <Lane x1={-4} z1={-FD / 2 + 2} x2={-4} z2={FD / 2 - 2} w={0.3} />
      <Lane x1={0} z1={-FD / 2 + 2} x2={0} z2={FD / 2 - 2} w={0.3} />
      <Lane x1={-2} z1={-FD / 2 + 2} x2={-2} z2={FD / 2 - 2} w={0.15} />
    </group>
  )
}
