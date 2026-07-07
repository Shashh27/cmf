import { useState, useCallback, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Canvas } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { Button, Modal, Tag, Descriptions } from 'antd'
import * as THREE from 'three'
import axios from 'axios'
import FactoryScene from './FactoryScene'
import MachineGrid from './MachineGrid'
import { API_BASE_URL } from '../../Config/auth'

const STATUS_ORDER = ['PRODUCTION', 'ON', 'IDLE', 'OFF', 'MAINTENANCE']

const STATUS_CONFIG = {
  PRODUCTION:  { color: '#22c55e', label: 'Production' },
  ON:          { color: '#f59e0b', label: 'Idle' },
  IDLE:        { color: '#f59e0b', label: 'Idle' },
  OFF:         { color: '#6b7c8f', label: 'Off' },
  MAINTENANCE: { color: '#ef4444', label: 'Maintenance' },
}

const WORKCENTER_COLORS = {
  MILLING: '#3b82f6',
  TURNING: '#f97316',
  GRINDING: '#06b6d4',
  'DIE SINKING': '#8b5cf6',
  CNC: '#6366f1',
  VMC: '#0ea5e9',
  HMC: '#14b8a6',
}

const COL_SPACING = 4.5
const ROW_SPACING = 4.5
const WC_COLUMNS = 4          // machines per row inside each work-center bay
const BAY_PADDING = 1.5
const BAY_GAP_X = 2
const BAY_GAP_Z = 3
const MACHINE_PAD = 3.5

// Match FactoryScene hall size — keep camera inside the shop floor
const FLOOR_HALF_W = 38       // FW/2 minus margin
const FLOOR_HALF_D = 30       // FD/2 minus margin
const FLOOR_MAX_H = 22        // below roof, above machines
const CAM_MIN_Y = 1.5
const CAM_MIN_DIST = 3          // close-up on a single machine
const CAM_MAX_DIST = 95         // full hall overview (FW=80, FD=64, fov=50)

function BoundedOrbitControls({ controlsRef }) {
  const clampCamera = useCallback(() => {
    const controls = controlsRef.current
    if (!controls) return

    const target = controls.target
    target.x = THREE.MathUtils.clamp(target.x, -FLOOR_HALF_W, FLOOR_HALF_W)
    target.y = THREE.MathUtils.clamp(target.y, 1, FLOOR_MAX_H)
    target.z = THREE.MathUtils.clamp(target.z, -FLOOR_HALF_D, FLOOR_HALF_D)

    const camera = controls.object
    camera.position.y = Math.max(camera.position.y, CAM_MIN_Y)

    const offset = camera.position.clone().sub(target)
    const dist = offset.length()
    if (dist > CAM_MAX_DIST) {
      offset.multiplyScalar(CAM_MAX_DIST / dist)
      camera.position.copy(target).add(offset)
    } else if (dist < CAM_MIN_DIST) {
      offset.multiplyScalar(CAM_MIN_DIST / Math.max(dist, 0.001))
      camera.position.copy(target).add(offset)
    }
  }, [controlsRef])

  return (
    <OrbitControls
      ref={controlsRef}
      makeDefault
      enablePan
      enableZoom
      enableRotate
      mouseButtons={{
        LEFT: THREE.MOUSE.ROTATE,
        MIDDLE: THREE.MOUSE.DOLLY,
        RIGHT: THREE.MOUSE.PAN,
      }}
      minPolarAngle={0.2}
      maxPolarAngle={Math.PI / 2.05}
      minDistance={CAM_MIN_DIST}
      maxDistance={CAM_MAX_DIST}
      target={[0, 2, 0]}
      dampingFactor={0.08}
      enableDamping
      onChange={clampCamera}
    />
  )
}

function useClock() {
  const [time, setTime] = useState(new Date())
  useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 1000)
    return () => clearInterval(id)
  }, [])
  return time
}

function useStats(machines) {
  const counts = {}
  machines.forEach(m => { counts[m.status] = (counts[m.status] || 0) + 1 })
  return { total: machines.length, counts }
}

function StatusPill({ status, count }) {
  const s = STATUS_CONFIG[status] || { color: '#64748b', label: status }
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: s.color + '12', borderRadius: 6, padding: '6px 12px', border: `1px solid ${s.color}33` }}>
      <div style={{ width: 8, height: 8, borderRadius: '50%', background: s.color }} />
      <span style={{ color: '#1e293b', fontSize: 11, fontWeight: 600 }}>{s.label}</span>
      <span style={{ color: s.color, fontSize: 12, fontWeight: 700 }}>{count}</span>
    </div>
  )
}

function WorkCenterChip({ workCenterKey, count, workCenters, isActive, onClick }) {
  const cfg = workCenters[workCenterKey] || { label: workCenterKey, color: '#64748b' }
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '5px 10px',
        borderRadius: 6,
        background: isActive ? `${cfg.color}22` : '#f8fafc',
        border: `1px solid ${isActive ? cfg.color : '#e2e8f0'}`,
        cursor: 'pointer',
        width: '100%',
        textAlign: 'left',
      }}
    >
      <div style={{ width: 6, height: 6, borderRadius: 2, background: cfg.color, flexShrink: 0 }} />
      <span style={{ color: '#1e293b', fontSize: 10, fontWeight: 600, flex: 1 }}>{cfg.label}</span>
      <span style={{ color: cfg.color, fontSize: 10, fontWeight: 700 }}>{count}</span>
    </button>
  )
}

function SelectedMachineModal({ machine, workCenters, open, onClose }) {
  if (!machine) return null

  const stateCfg = STATUS_CONFIG[machine.status] || { color: '#64748b', label: machine.status || 'Unknown' }
  const wcCfg = workCenters[machine.workCenter] || { color: '#64748b', label: machine.workCenter }
  const displayName = [machine.make, machine.model].filter(Boolean).join(' ').trim() || 'Machine details'

  return (
    <Modal
      title={displayName}
      open={open}
      onCancel={onClose}
      footer={<Button onClick={onClose}>Close</Button>}
      width={460}
      centered
      destroyOnHidden
      maskClosable
    >
      <Descriptions
        bordered
        size="small"
        column={1}
        styles={{ label: { width: 140, background: '#fafafa' } }}
      >
        <Descriptions.Item label="Work center">{wcCfg.label}</Descriptions.Item>
        <Descriptions.Item label="Status">
          <Tag color={stateCfg.color} style={{ margin: 0 }}>{stateCfg.label}</Tag>
        </Descriptions.Item>
        <Descriptions.Item label="Type">{machine.type || '—'}</Descriptions.Item>
        <Descriptions.Item label="Make">{machine.make || '—'}</Descriptions.Item>
        <Descriptions.Item label="Model">{machine.model || '—'}</Descriptions.Item>
        <Descriptions.Item label="CNC controller">{machine.cncController || '—'}</Descriptions.Item>
        <Descriptions.Item label="Year installed">{machine.yearOfInstallation || '—'}</Descriptions.Item>
        {machine.mhr != null && machine.mhr !== '' && (
          <Descriptions.Item label="MHR">{machine.mhr}</Descriptions.Item>
        )}
      </Descriptions>
      {machine.remarks && (
        <div style={{ marginTop: 12 }}>
          <div style={{ fontSize: 12, color: '#64748b', marginBottom: 4 }}>Remarks</div>
          <div style={{ fontSize: 13, color: '#334155', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
            {machine.remarks}
          </div>
        </div>
      )}
    </Modal>
  )
}

function buildWorkCenters(apiMachines) {
  const names = [...new Set(
    apiMachines.map(m => (m.work_center_name || 'Unassigned').trim())
  )].sort((a, b) => a.localeCompare(b))

  const workCenters = {}
  names.forEach((name, i) => {
    const upper = name.toUpperCase()
    const color = WORKCENTER_COLORS[upper] || WORKCENTER_COLORS[name] || `hsl(${i * 67}, 62%, 48%)`
    workCenters[name] = { label: name, color }
  })
  return workCenters
}

function buildLayout(apiMachines, filterWorkCenter = 'ALL') {
  const workCenters = buildWorkCenters(apiMachines)

  const wcNames = (filterWorkCenter === 'ALL'
    ? Object.keys(workCenters)
    : [filterWorkCenter]
  ).sort()

  const groups = wcNames
    .map(name => ({
      name,
      items: apiMachines.filter(m => (m.work_center_name || 'Unassigned').trim() === name),
    }))
    .filter(g => g.items.length > 0)

  const baysPerRow = filterWorkCenter === 'ALL'
    ? Math.min(3, Math.max(1, groups.length))
    : 1

  const bays = groups.map(g => {
    const count = g.items.length
    const cols = Math.min(WC_COLUMNS, count)
    const rows = Math.ceil(count / WC_COLUMNS)
    const width = (cols - 1) * COL_SPACING + MACHINE_PAD + BAY_PADDING * 2
    const depth = (rows - 1) * ROW_SPACING + MACHINE_PAD + BAY_PADDING * 2
    return { ...g, cols, rows, width, depth }
  })

  const rowCount = Math.ceil(bays.length / baysPerRow) || 1
  const rowLayouts = []
  for (let r = 0; r < rowCount; r++) {
    const slice = bays.slice(r * baysPerRow, (r + 1) * baysPerRow)
    rowLayouts.push({
      width: slice.reduce((sum, b, i) => sum + b.width + (i > 0 ? BAY_GAP_X : 0), 0),
      depth: Math.max(...slice.map(b => b.depth)),
      bays: slice,
    })
  }

  const totalDepth = rowLayouts.reduce(
    (sum, row, i) => sum + row.depth + (i > 0 ? BAY_GAP_Z : 0),
    0
  )

  const zones = []
  const machines = []
  let zCursor = -totalDepth / 2

  rowLayouts.forEach(rowLayout => {
    let xCursor = -rowLayout.width / 2

    rowLayout.bays.forEach(bay => {
      const zoneCenterX = xCursor + bay.width / 2
      const zoneCenterZ = zCursor + rowLayout.depth / 2

      zones.push({
        workCenter: bay.name,
        position: { x: zoneCenterX, y: 0.02, z: zoneCenterZ },
        width: bay.width,
        depth: bay.depth,
        color: workCenters[bay.name]?.color || '#64748b',
      })

      const gridW = (bay.cols - 1) * COL_SPACING
      const gridD = (bay.rows - 1) * ROW_SPACING
      const startX = zoneCenterX - gridW / 2
      const startZ = zoneCenterZ - gridD / 2

      bay.items
        .sort((a, b) => (a.make || '').localeCompare(b.make || ''))
        .forEach((machine, index) => {
          const row = Math.floor(index / WC_COLUMNS)
          const col = index % WC_COLUMNS
          const x = startX + col * COL_SPACING
          const z = startZ + row * ROW_SPACING

          machines.push({
            id: machine.id.toString(),
            type: (machine.type || '').trim().toUpperCase(),
            workCenter: bay.name,
            workCenterId: machine.work_center_id,
            position: { x, y: 0, z },
            status: machine.machine_state || 'OFF',
            make: machine.make,
            model: machine.model,
            cncController: machine.cnc_controller,
            yearOfInstallation: machine.year_of_installation,
            mhr: machine.mhr,
            remarks: machine.remarks,
          })
        })

      xCursor += bay.width + BAY_GAP_X
    })

    zCursor += rowLayout.depth + BAY_GAP_Z
  })

  return { machines, workCenters, zones }
}

export default function ShopFloor() {
  const navigate = useNavigate()
  const [selected, setSelected] = useState(null)
  const [showLegend, setShowLegend] = useState(false)
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false)
  const [allMachines, setAllMachines] = useState([])
  const [machines, setMachines] = useState([])
  const [workCenters, setWorkCenters] = useState({})
  const [workCenterZones, setWorkCenterZones] = useState([])
  const [selectedWorkCenter, setSelectedWorkCenter] = useState('ALL')
  const [loading, setLoading] = useState(true)
  const controlsRef = useRef()
  const time = useClock()
  const stats = useStats(machines)

  useEffect(() => {
    const handler = e => { if ((e.key === 'r' || e.key === 'R') && controlsRef.current) controlsRef.current.reset() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  useEffect(() => { fetchMachines() }, [])

  const fetchMachines = async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/machines/`)
      const data = response.data || []
      setAllMachines(data)
      const { machines: laidOut, workCenters: wcMap, zones } = buildLayout(data, selectedWorkCenter)
      setWorkCenters(wcMap)
      setWorkCenterZones(zones)
      setMachines(laidOut)
    } catch (error) {
      console.error('Failed to fetch machines:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!allMachines.length) return
    const { machines: laidOut, workCenters: wcMap, zones } = buildLayout(allMachines, selectedWorkCenter)
    setWorkCenters(wcMap)
    setWorkCenterZones(zones)
    setMachines(laidOut)
    setSelected(prev => (prev && laidOut.some(m => m.id === prev) ? prev : null))
  }, [selectedWorkCenter, allMachines])

  const handleSelect = useCallback(id => setSelected(prev => prev === id ? null : id), [])
  const selectedMachine = machines.find(m => m.id === selected)

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: '#475569', fontSize: 14, background: '#f5f5f5' }}>
        Loading shop floor data...
      </div>
    )
  }

  return (
    <div style={{ width: '100%', height: '100vh', overflow: 'hidden', position: 'relative', background: '#f5f5f5', fontFamily: "'Inter',system-ui,sans-serif", display: 'flex', flexDirection: 'column' }}>
      <div style={{ background: '#ffffff', borderBottom: '1px solid #e5e7eb', padding: '8px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', zIndex: 10, minHeight: 45, flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
          <div style={{ color: '#475569', fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap' }}>
            MACHINES: <span style={{ color: '#1e293b' }}>{stats.total}</span>
          </div>
          {STATUS_ORDER.filter(st => stats.counts[st] > 0).map(st => <StatusPill key={st} status={st} count={stats.counts[st]} />)}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
          <Button onClick={() => navigate('/manufacturing_coordinator/shop-floor')} type="primary">
            Shop Floor
          </Button>
          <div style={{ color: '#1e293b', fontSize: 15, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
            {time.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </div>
          <Button onClick={() => setShowLogoutConfirm(true)} danger>
            Logout
          </Button>
        </div>
      </div>

      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        <Canvas
          shadows
          camera={{ position: [0, 9, 26], fov: 50, near: 0.1, far: 300 }}
          style={{ width: '100%', height: '100%' }}
          gl={{
            antialias: true,
            logarithmicDepthBuffer: true,
            toneMapping: THREE.ACESFilmicToneMapping,
            toneMappingExposure: 1.05,
            outputColorSpace: THREE.SRGBColorSpace,
          }}
        >
          <FactoryScene />
          <MachineGrid
            machines={machines}
            selected={selected}
            onSelect={handleSelect}
            workCenters={workCenters}
            workCenterZones={workCenterZones}
          />
          <BoundedOrbitControls controlsRef={controlsRef} />
        </Canvas>

        {/* Work center filter */}
        <div style={{ position: 'absolute', top: 14, left: 14, background: '#ffffff', borderRadius: 10, padding: '12px 14px', border: '1px solid #e5e7eb', minWidth: 170, maxWidth: 220, zIndex: 9, opacity: showLegend ? 1 : 0, pointerEvents: showLegend ? 'auto' : 'none', transition: 'opacity 0.2s', boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
          <div style={{ color: '#475569', fontSize: 9, fontWeight: 700, marginBottom: 8, letterSpacing: '0.06em' }}>WORK CENTERS</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <WorkCenterChip
              workCenterKey="ALL"
              count={allMachines.length}
              workCenters={{ ALL: { label: 'All Work Centers', color: '#64748b' } }}
              isActive={selectedWorkCenter === 'ALL'}
              onClick={() => setSelectedWorkCenter('ALL')}
            />
            {Object.keys(workCenters).map(k => (
              <WorkCenterChip
                key={k}
                workCenterKey={k}
                count={allMachines.filter(m => (m.work_center_name || 'Unassigned').trim() === k).length}
                workCenters={workCenters}
                isActive={selectedWorkCenter === k}
                onClick={() => setSelectedWorkCenter(k)}
              />
            ))}
          </div>
        </div>
        <button onClick={() => setShowLegend(v => !v)} style={{ position: 'absolute', top: 14, left: showLegend ? 198 : 14, background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: 6, padding: '5px 10px', color: '#475569', fontSize: 11, fontWeight: 600, cursor: 'pointer', zIndex: 10, transition: 'left 0.2s', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
          {showLegend ? '◀ Hide' : 'Work Centers ▶'}
        </button>

        <SelectedMachineModal
          machine={selectedMachine}
          workCenters={workCenters}
          open={Boolean(selectedMachine)}
          onClose={() => setSelected(null)}
        />

        {/* Logout confirmation modal */}
        <Modal
          title="Confirm Logout"
          open={showLogoutConfirm}
          onOk={() => navigate('/login')}
          onCancel={() => setShowLogoutConfirm(false)}
          okText="Logout"
          cancelText="Cancel"
          okButtonProps={{ danger: true }}
        >
          <p>Are you sure you want to logout?</p>
        </Modal>
      </div>
    </div>
  )
}