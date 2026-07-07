import * as THREE from 'three'

const FW = 80          // hall width  (X)
const FD = 64          // hall depth  (Z)
const WH = 25          // column / roof height
const RUNWAY_X = FW / 2 - 5     // crane runway offset from centre
const RUNWAY_H = 17.5          // crane rail height (raised near roof)
const ROOF_H = WH - 0.9        // roof truss grid sits just under the slab

/* ---------- yellow floor aisle marking ---------- */
function Lane({ x1, z1, x2, z2, w = 0.25 }) {
  const dx = x2 - x1, dz = z2 - z1
  const len = Math.sqrt(dx * dx + dz * dz)
  const angle = Math.atan2(dx, dz)
  return (
    <mesh position={[(x1 + x2) / 2, 0.015, (z1 + z2) / 2]} rotation={[0, angle, 0]}>
      <boxGeometry args={[w, 0.01, len]} />
      <meshStandardMaterial color="#f5c518" roughness={0.5} emissive="#f5c518" emissiveIntensity={0.15} />
    </mesh>
  )
}

/* ---------- green industrial I-beam column ---------- */
function Column({ x, z }) {
  return (
    <group position={[x, 0, z]}>
      {/* main shaft */}
      <mesh position={[0, WH / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.6, WH, 0.6]} />
        <meshStandardMaterial color="#3d8b78" roughness={0.65} metalness={0.25} />
      </mesh>
      {/* base plate */}
      <mesh position={[0, 0.12, 0]} receiveShadow>
        <boxGeometry args={[1.1, 0.24, 1.1]} />
        <meshStandardMaterial color="#2f6c5d" roughness={0.8} metalness={0.2} />
      </mesh>
      {/* corbel that carries the crane rail */}
      <mesh position={[0, RUNWAY_H - 0.4, 0]} castShadow>
        <boxGeometry args={[1.0, 0.5, 0.8]} />
        <meshStandardMaterial color="#357f6d" roughness={0.6} metalness={0.3} />
      </mesh>
    </group>
  )
}

/* ---------- orange crane runway beam (runs along Z) ---------- */
function RunwayBeam({ x }) {
  return (
    <group position={[x, RUNWAY_H, 0]}>
      <mesh castShadow>
        <boxGeometry args={[0.55, 0.9, FD]} />
        <meshStandardMaterial color="#e8821e" roughness={0.5} metalness={0.35} />
      </mesh>
      {/* rail cap */}
      <mesh position={[0, 0.5, 0]}>
        <boxGeometry args={[0.18, 0.12, FD]} />
        <meshStandardMaterial color="#9ca3af" roughness={0.4} metalness={0.6} />
      </mesh>
    </group>
  )
}

/* ---------- yellow gantry crane bridge (spans X) ---------- */
function CraneBridge({ z }) {
  const span = RUNWAY_X * 2
  return (
    <group position={[0, RUNWAY_H + 0.85, z]}>
      {/* twin box girders */}
      <mesh position={[0, 0, 0.5]} castShadow>
        <boxGeometry args={[span, 0.7, 0.45]} />
        <meshStandardMaterial color="#f2b705" roughness={0.5} metalness={0.3} />
      </mesh>
      <mesh position={[0, 0, -0.5]} castShadow>
        <boxGeometry args={[span, 0.7, 0.45]} />
        <meshStandardMaterial color="#f2b705" roughness={0.5} metalness={0.3} />
      </mesh>
      {/* end trucks */}
      <mesh position={[span / 2 - 0.3, -0.5, 0]}>
        <boxGeometry args={[0.8, 0.8, 1.8]} />
        <meshStandardMaterial color="#1f2937" roughness={0.6} metalness={0.4} />
      </mesh>
      <mesh position={[-span / 2 + 0.3, -0.5, 0]}>
        <boxGeometry args={[0.8, 0.8, 1.8]} />
        <meshStandardMaterial color="#1f2937" roughness={0.6} metalness={0.4} />
      </mesh>
      {/* hoist trolley */}
      <mesh position={[4, -0.55, 0]} castShadow>
        <boxGeometry args={[1.8, 0.9, 1.6]} />
        <meshStandardMaterial color="#374151" roughness={0.55} metalness={0.4} />
      </mesh>
    </group>
  )
}

/* ---------- roof structure : grid of trusses (space-frame look) ---------- */
function Roof() {
  const beam = '#9aa6b2'
  const purlinZ = []
  for (let z = -FD / 2 + 2; z <= FD / 2 - 2; z += 4) purlinZ.push(z)
  const mainX = []
  for (let x = -FW / 2 + 3; x <= FW / 2 - 3; x += 6) mainX.push(x)

  return (
    <group position={[0, ROOF_H, 0]}>
      {/* main rafters spanning the width, repeated along Z */}
      {purlinZ.map((z, i) => (
        <group key={`t${i}`} position={[0, 0, z]}>
          {/* bottom chord */}
          <mesh>
            <boxGeometry args={[FW, 0.12, 0.12]} />
            <meshStandardMaterial color={beam} roughness={0.6} metalness={0.4} />
          </mesh>
          {/* top chord (slightly raised to suggest a pitched truss) */}
          <mesh position={[0, 0.7, 0]}>
            <boxGeometry args={[FW, 0.12, 0.12]} />
            <meshStandardMaterial color={beam} roughness={0.6} metalness={0.4} />
          </mesh>
        </group>
      ))}
      {/* longitudinal purlins running along Z */}
      {mainX.map((x, i) => (
        <mesh key={`p${i}`} position={[x, 0.35, 0]}>
          <boxGeometry args={[0.1, 0.1, FD]} />
          <meshStandardMaterial color={beam} roughness={0.6} metalness={0.4} />
        </mesh>
      ))}
    </group>
  )
}

export default function FactoryScene() {
  // column / runway positions along the length of the hall
  const columnZ = []
  for (let z = -FD / 2 + 2; z <= FD / 2 - 2; z += 8) columnZ.push(z)

  return (
    <group>
      <ambientLight intensity={1.9} color="#eef2f7" />
      <hemisphereLight args={['#ffffff', '#b8c0cc', 1.1]} />
      <directionalLight
        position={[18, 38, 18]} intensity={2.6} castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-40} shadow-camera-right={40}
        shadow-camera-top={40} shadow-camera-bottom={-40}
        shadow-camera-far={140} color="#fff6e8"
      />
      <directionalLight position={[-22, 24, -16]} intensity={0.9} color="#e6edff" />

      {/* Concrete floor */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[FW, FD]} />
        <meshStandardMaterial color="#c9ccd1" roughness={0.85} metalness={0.05} />
      </mesh>
      {/* subtle floor expansion-joint grid */}
      {[-FW / 4, 0, FW / 4].map((x, i) => (
        <mesh key={`fjx${i}`} position={[x, 0.011, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[0.08, FD]} />
          <meshStandardMaterial color="#aeb3ba" roughness={0.9} />
        </mesh>
      ))}
      {[-FD / 4, 0, FD / 4].map((z, i) => (
        <mesh key={`fjz${i}`} position={[0, 0.011, z]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[FW, 0.08]} />
          <meshStandardMaterial color="#aeb3ba" roughness={0.9} />
        </mesh>
      ))}

      {/* Walls on 3 sides (front, +Z, left open for camera view) */}
      {/* back wall (-Z) */}
      <mesh position={[0, WH / 2, -FD / 2]} receiveShadow>
        <boxGeometry args={[FW, WH, 0.4]} />
        <meshStandardMaterial color="#dfe3e9" roughness={0.9} metalness={0.05} side={THREE.DoubleSide} />
      </mesh>
      {/* left wall (-X) */}
      <mesh position={[-FW / 2, WH / 2, 0]} receiveShadow>
        <boxGeometry args={[0.4, WH, FD]} />
        <meshStandardMaterial color="#d8dce3" roughness={0.9} metalness={0.05} side={THREE.DoubleSide} />
      </mesh>
      {/* right wall (+X) */}
      <mesh position={[FW / 2, WH / 2, 0]} receiveShadow>
        <boxGeometry args={[0.4, WH, FD]} />
        <meshStandardMaterial color="#d8dce3" roughness={0.9} metalness={0.05} side={THREE.DoubleSide} />
      </mesh>

      {/* Concrete roof slab resting directly on the wall tops */}
      <mesh position={[0, WH + 0.25, 0]} receiveShadow castShadow>
        <boxGeometry args={[FW, 0.5, FD]} />
        <meshStandardMaterial color="#c4c8ce" roughness={0.92} metalness={0.04} />
      </mesh>

      {/* Structural columns down both runway lines */}
      {columnZ.map((z, i) => <Column key={`cL${i}`} x={-RUNWAY_X} z={z} />)}
      {columnZ.map((z, i) => <Column key={`cR${i}`} x={RUNWAY_X} z={z} />)}

      {/* Crane runway beams + travelling bridge */}
      <RunwayBeam x={-RUNWAY_X} />
      <RunwayBeam x={RUNWAY_X} />
      <CraneBridge z={-4} />

      {/* Roof trusses */}
      <Roof />

      {/* Yellow aisle lanes around the perimeter and through the middle */}
      <Lane x1={-FW / 2 + 2} z1={-FD / 2 + 2} x2={FW / 2 - 2} z2={-FD / 2 + 2} />
      <Lane x1={-FW / 2 + 2} z1={FD / 2 - 2} x2={FW / 2 - 2} z2={FD / 2 - 2} />
      <Lane x1={-FW / 2 + 2} z1={-FD / 2 + 2} x2={-FW / 2 + 2} z2={FD / 2 - 2} />
      <Lane x1={FW / 2 - 2} z1={-FD / 2 + 2} x2={FW / 2 - 2} z2={FD / 2 - 2} />
      <Lane x1={-FW / 2 + 2} z1={0} x2={FW / 2 - 2} z2={0} />
    </group>
  )
}