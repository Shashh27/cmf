import { useState, useCallback, useEffect, useRef, useMemo, useLayoutEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Canvas, useThree, useFrame } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { Button, Modal, Tag, Descriptions } from 'antd'
import * as THREE from 'three'
import FactoryScene from './FactoryScene'
import MachineGrid from './MachineGrid'
import { applyOverviewCamera, clampOrbitCamera, computeCameraPreset, getMachineFocusPose } from './shopFloorCamera'
import './shopFloor.css'
import { API_BASE_URL } from '../Config/auth'
import { getApiWsUrl } from '../auth/apiUrl'
import { useAuth } from '../auth/AuthContext.jsx'

/** Always visible in header — show 0 when no machines in that state */
const HEADER_STATUS_PILLS = ['PRODUCTION', 'IDLE', 'OFF']

function getHeaderStatusCount(status, counts) {
  if (status === 'IDLE') return (counts.IDLE || 0) + (counts.ON || 0)
  return counts[status] || 0
}

function matchesStatusFilter(machine, filter) {
  if (filter === 'ALL') return true
  if (filter === 'IDLE') return machine.status === 'IDLE' || machine.status === 'ON'
  return machine.status === filter
}

const STATUS_CONFIG = {
  PRODUCTION:  { color: '#22c55e', label: 'Production' },
  ON:          { color: '#f59e0b', label: 'Idle' },
  IDLE:        { color: '#f59e0b', label: 'Idle' },
  OFF:         { color: '#6b7c8f', label: 'Off' },
  MAINTENANCE: { color: '#ef4444', label: 'Maintenance' },
}

// Spread hues evenly so every work center gets a visually distinct flag colour.
function workCenterColorAt(index) {
  const hue = Math.round((index * 137.508) % 360)
  const lightness = 40 + (index % 3) * 5
  const saturation = 78 + (index % 2) * 12
  return `hsl(${hue}, ${saturation}%, ${lightness}%)`
}

const COL_SPACING = 4.5
const ROW_SPACING = 4.5
const WC_COLUMNS = 4          // machines per row inside each work-center bay
const BAY_PADDING = 1.5
const BAY_GAP_X = 2
const BAY_GAP_Z = 3
const MACHINE_PAD = 3.5

// Match FactoryScene hall size — keep camera inside the shop floor
const CAM_MIN_DIST = 5
const CAM_MAX_DIST = 110

function getMonitoringWsUrl() {
  return getApiWsUrl('monitoring/live/ws')
}

function SceneCameraRig({ machines, zones, controlsRef, layoutKey, frameRef, selectedMachine }) {
  const { camera, size } = useThree()
  const framedKeyRef = useRef('')
  const animRef = useRef(null)
  const lastFocusedIdRef = useRef(null)

  const frameScene = useCallback(() => {
    camera.aspect = size.width / Math.max(size.height, 1)
    applyOverviewCamera(camera, controlsRef.current, machines, zones)
    framedKeyRef.current = layoutKey
    animRef.current = null
    lastFocusedIdRef.current = null
    if (controlsRef.current) controlsRef.current.enabled = true
  }, [camera, controlsRef, layoutKey, machines, size.height, size.width, zones])

  useLayoutEffect(() => {
    if (framedKeyRef.current === layoutKey) return
    frameScene()
  }, [frameScene, layoutKey])

  useEffect(() => {
    frameRef.current = frameScene
  }, [frameRef, frameScene])

  useEffect(() => {
    if (!selectedMachine) {
      lastFocusedIdRef.current = null
      if (controlsRef.current) controlsRef.current.enabled = true
      return
    }
    if (lastFocusedIdRef.current === selectedMachine.id) return
    lastFocusedIdRef.current = selectedMachine.id

    const controls = controlsRef.current
    const { position, target, fov } = getMachineFocusPose(selectedMachine, camera.position)
    if (controls) controls.enabled = false

    animRef.current = {
      fromPos: camera.position.clone(),
      fromTarget: controls?.target.clone() ?? target.clone(),
      toPos: position,
      toTarget: target,
      fromFov: camera.fov,
      toFov: fov,
      t: 0,
    }
  }, [selectedMachine, camera, controlsRef])

  useFrame((_, delta) => {
    const anim = animRef.current
    if (!anim) return

    // ~0.7s ease — quick but readable fly-in
    anim.t = Math.min(1, anim.t + delta / 0.7)
    const ease = 1 - (1 - anim.t) ** 3

    camera.position.lerpVectors(anim.fromPos, anim.toPos, ease)
    camera.fov = THREE.MathUtils.lerp(anim.fromFov, anim.toFov, ease)
    camera.updateProjectionMatrix()

    const controls = controlsRef.current
    if (controls) {
      controls.target.lerpVectors(anim.fromTarget, anim.toTarget, ease)
      controls.update()
    } else {
      camera.lookAt(new THREE.Vector3().lerpVectors(anim.fromTarget, anim.toTarget, ease))
    }

    if (anim.t >= 1) {
      camera.position.copy(anim.toPos)
      camera.fov = anim.toFov
      camera.updateProjectionMatrix()
      if (controls) {
        controls.target.copy(anim.toTarget)
        clampOrbitCamera(controls)
        controls.enabled = true
        controls.update()
      }
      animRef.current = null
    }
  })

  return null
}

function BoundedOrbitControls({ controlsRef, initialTarget }) {
  const clampCamera = useCallback(() => {
    clampOrbitCamera(controlsRef.current)
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
      target={initialTarget || [0, 2, 0]}
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
  return useMemo(() => {
    const counts = {}
    machines.forEach(m => {
      const status = m.status || m.machine_state || 'OFF'
      counts[status] = (counts[status] || 0) + 1
    })
    return { total: machines.length, counts }
  }, [machines])
}

function StatusPill({ status, count, isActive, onClick }) {
  const s = STATUS_CONFIG[status] || { color: '#64748b', label: status }
  return (
    <button
      type="button"
      onClick={onClick}
      className={`shop-floor-pill shop-floor-status-pill${isActive ? ' is-active' : ''}`}
      style={{
        background: isActive ? s.color + '28' : s.color + '12',
        borderColor: isActive ? s.color : s.color + '44',
        color: '#1e293b',
      }}
    >
      <span className="pill-dot" style={{ background: s.color }} />
      <span>{s.label}</span>
      <span className="pill-count" style={{ color: s.color }}>{count}</span>
    </button>
  )
}

function WorkCenterChip({ workCenterKey, count, workCenters, isActive, onClick }) {
  const cfg = workCenters[workCenterKey] || { label: workCenterKey, color: '#64748b' }
  return (
    <button
      type="button"
      onClick={onClick}
      className="shop-floor-wc-chip"
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
  const displayName = [machine.make, machine.model].filter(Boolean).join(' ').trim() || 'Live Order Details'
  const hasOrderInfo = Boolean(
    machine.saleOrderNumber || machine.partNumber || machine.operationName || machine.operationNumber
  )

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
        <Descriptions.Item label="Last updated">
          {machine.lastUpdated
            ? new Date(machine.lastUpdated).toLocaleString('en-IN')
            : '—'}
        </Descriptions.Item>
      </Descriptions>
      {hasOrderInfo && (
        <Descriptions
          bordered
          size="small"
          column={1}
          style={{ marginTop: 12 }}
          title="Live Order Details"
          styles={{ label: { width: 140, background: '#fafafa' } }}
        >
          <Descriptions.Item label="Sale order">{machine.saleOrderNumber || '—'}</Descriptions.Item>
          <Descriptions.Item label="Part number">{machine.partNumber || '—'}</Descriptions.Item>
          <Descriptions.Item label="Operation">{machine.operationName || '—'}</Descriptions.Item>
          <Descriptions.Item label="Operation no.">{machine.operationNumber || '—'}</Descriptions.Item>
          <Descriptions.Item label="Completed qty">{machine.completedQty ?? 0}</Descriptions.Item>
          <Descriptions.Item label="Target qty">{machine.targetQty ?? 0}</Descriptions.Item>
        </Descriptions>
      )}
    </Modal>
  )
}

const EXACT_BLUEPRINT_MACHINES = [
  // Even 6-unit grid — ROW_BACK=-14, ROW_FRONT=-8 / grind z=3,9
  // Walkway clear: x=-4 .. 0 (center x=-2)

  // --- Turning centre (left of walkway) ---
  { id: 'tekcel', make: 'Tekcel', model: '', workCenter: 'Turning centre', x: -25, z: -14, isVertical: true },
  { id: 'stc25', make: 'STC 25', model: '', workCenter: 'Turning centre', x: -19, z: -14 },
  { id: 'pinacho225', make: 'Pinacho 225', model: '', workCenter: 'Turning centre', x: -13, z: -14 },
  { id: 'mazak', make: 'Mazak SQT 10M', model: '', workCenter: 'Turning centre', x: -19, z: -8 },
  { id: 'stallion', make: 'Stallion 200', model: '', workCenter: 'Turning centre', x: -13, z: -8 },
  { id: 'tc46mc', make: 'TC-46-MC', model: '', workCenter: 'Turning centre', x: -7, z: -8 },

  // --- Milling centre (right of walkway) ---
  { id: 'bfw', make: 'BFW BMV-50', model: '', workCenter: 'Milling centre', x: 9, z: -14 },
  { id: 'mitsubishi', make: 'Mitsubishi MV5C', model: '', workCenter: 'Milling centre', x: 15, z: -14 },
  { id: 'mikron', make: 'Mikron WF41C', model: '', workCenter: 'Milling centre', x: 21, z: -14 },
  { id: 'dmu1', make: 'DMU 60', model: '', workCenter: 'Milling centre', x: 27, z: -14 },
  { id: 'dmu2', make: 'DMU 80H', model: '', workCenter: 'Milling centre', x: 33, z: -14 },
  { id: 'dmu125u', make: 'DMU 125U Deckel MAHO', model: '', workCenter: 'Milling centre', x: 3, z: -8 },
  { id: 'ams850', make: 'AMS 850 ACE Micromatic', model: '', workCenter: 'Milling centre', x: 9, z: -8 },
  { id: 'wh10cnc', make: 'WH10CNC Varns 800RF TOS', model: '', workCenter: 'Milling centre', x: 15, z: -8 },

  // --- EDM Room ---
  { id: 'ona_qxsf', make: 'EDM Room ONA-QX3F', model: '', workCenter: 'EDM Room', x: 6, z: -24 },

  // --- Grinding Room ---
  { id: 'schaublin1', make: 'Schublin 125 I', model: '', workCenter: 'Grinding Room', x: -31, z: 3 },
  { id: 'schaublin2', make: 'Schublin 125 II', model: '', workCenter: 'Grinding Room', x: -25, z: 3 },
  { id: 'voumand', make: 'Voumard', model: '', workCenter: 'Grinding Room', x: -19, z: 3 },
  { id: 'magerle', make: 'Magerle', model: '', workCenter: 'Grinding Room', x: -13, z: 3 },
  { id: 'horder', make: 'Herder-S-devlieg', model: '', workCenter: 'Grinding Room', x: -31, z: 9, isVertical: true },
  { id: 'kellenberger', make: 'Kellenberger', model: '', workCenter: 'Grinding Room', x: -19, z: 9 },
  { id: 'studer', make: 'Studer RHU 650', model: '', workCenter: 'Grinding Room', x: -13, z: 9 },

  // --- Thread Grinding Room ---
  { id: 'thread_grinding', make: 'Thread Grinding Room', model: '', workCenter: 'Thread Grinding Room', x: -7, z: 6 },
]

const BLUEPRINT_WORK_CENTER_ZONES = [
  { workCenter: 'Turning centre', position: { x: -16, y: 0.02, z: -11 }, width: 24, depth: 12, color: '#3b82f6' },
  { workCenter: 'Milling centre', position: { x: 18, y: 0.02, z: -11 }, width: 36, depth: 12, color: '#10b981' },
  { workCenter: 'EDM Room', position: { x: 6, y: 0.02, z: -24 }, width: 12, depth: 6, color: '#8b5cf6' },
  { workCenter: 'Grinding Room', position: { x: -22, y: 0.02, z: 6 }, width: 24, depth: 12, color: '#0f766e' },
  { workCenter: 'Thread Grinding Room', position: { x: -7, y: 0.02, z: 6 }, width: 8, depth: 12, color: '#b91c1c' },
]

function buildWorkCenters(apiMachines) {
  const names = ['Turning centre', 'Milling centre', 'EDM Room', 'Grinding Room', 'Thread Grinding Room']
  const workCenters = {}
  names.forEach((name, i) => {
    workCenters[name] = { label: name, color: BLUEPRINT_WORK_CENTER_ZONES[i]?.color || workCenterColorAt(i) }
  })
  return workCenters
}

function buildLayout(apiMachines, filterWorkCenter = 'ALL', workCenterColorMap = null) {
  const workCenters = workCenterColorMap || buildWorkCenters(apiMachines)

  const apiMap = new Map()
  if (Array.isArray(apiMachines)) {
    apiMachines.forEach(m => {
      const name = (m.machine_make || m.machine_name || '').toLowerCase()
      if (name) apiMap.set(name, m)
    })
  }

  const machines = EXACT_BLUEPRINT_MACHINES.map(bm => {
    const live = Array.from(apiMap.entries()).find(([k]) => k.includes(bm.make.toLowerCase()) || bm.make.toLowerCase().includes(k))?.[1]
    const rawStatus = live?.status || live?.machine_status?.status || 'OFF'

    return {
      id: bm.id,
      type: bm.workCenter.toUpperCase(),
      workCenter: bm.workCenter,
      position: { x: bm.x, y: 0, z: bm.z },
      status: rawStatus,
      make: bm.make,
      model: bm.model,
      cncController: live?.cnc_controller || 'N/A',
      yearOfInstallation: live?.year_of_installation || 'N/A',
      mhr: live?.mhr || 'N/A',
      remarks: live?.remarks || '',
      lastUpdated: live?.last_updated || null,
      saleOrderNumber: live?.sale_order_number || null,
      partNumber: live?.part_number || null,
      operationName: live?.operation_name || null,
      operationNumber: live?.operation_number || null,
      completedQty: live?.completed_qty || 0,
      targetQty: live?.target_qty || 0,
    }
  })

  let filteredMachines = machines
  let zones = BLUEPRINT_WORK_CENTER_ZONES

  if (filterWorkCenter !== 'ALL') {
    filteredMachines = machines.filter(m => m.workCenter.toLowerCase() === filterWorkCenter.toLowerCase())
    zones = BLUEPRINT_WORK_CENTER_ZONES.filter(z => z.workCenter.toLowerCase() === filterWorkCenter.toLowerCase())
  }

  return { machines: filteredMachines, workCenters, zones }
}

export default function ShopFloor() {
  const navigate = useNavigate()
  const { logoutToLogin } = useAuth()
  const [selected, setSelected] = useState(null)
  const [showLegend, setShowLegend] = useState(false)
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false)
  const [allMachines, setAllMachines] = useState([])
  const [selectedWorkCenter, setSelectedWorkCenter] = useState('ALL')
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [loading, setLoading] = useState(true)
  const controlsRef = useRef()
  const frameSceneRef = useRef(() => {})
  const time = useClock()

  const scopedMachines = useMemo(() => {
    if (selectedWorkCenter === 'ALL') return allMachines
    return allMachines.filter(
      (m) => (m.work_center_name || 'Unassigned').trim() === selectedWorkCenter,
    )
  }, [allMachines, selectedWorkCenter])

  const allWorkCenters = useMemo(() => buildWorkCenters(allMachines), [allMachines])

  const { machines: layoutMachines, zones: workCenterZones } = useMemo(
    () => buildLayout(scopedMachines, selectedWorkCenter, allWorkCenters),
    [scopedMachines, selectedWorkCenter, allWorkCenters],
  )

  const visibleMachines = useMemo(() => {
    if (statusFilter === 'ALL') return layoutMachines
    return layoutMachines.filter((m) => matchesStatusFilter(m, statusFilter))
  }, [layoutMachines, statusFilter])

  const stats = useStats(scopedMachines)

  const workCenterCounts = useMemo(() => {
    const counts = {}
    allMachines.forEach((m) => {
      const name = (m.work_center_name || 'Unassigned').trim()
      counts[name] = (counts[name] || 0) + 1
    })
    return counts
  }, [allMachines])

  const cameraLayoutKey = `${selectedWorkCenter}:${statusFilter}:${visibleMachines.length}:${workCenterZones.length}`

  const cameraPreset = useMemo(
    () => computeCameraPreset(
      layoutMachines,
      workCenterZones,
      typeof window !== 'undefined' ? (window.innerWidth - 240) / Math.max(window.innerHeight, 1) : 1,
    ),
    [cameraLayoutKey, layoutMachines, workCenterZones],
  )

  useEffect(() => {
    setSelected((prev) => (prev && layoutMachines.some((m) => m.id === prev) ? prev : null))
  }, [layoutMachines])

  useEffect(() => {
    const handler = (e) => {
      if ((e.key === 'r' || e.key === 'R') && frameSceneRef.current) {
        frameSceneRef.current()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  useEffect(() => {
    let socket
    let reconnectTimer
    let closed = false

    const connectSocket = () => {
      socket = new WebSocket(getMonitoringWsUrl())

      socket.onmessage = event => {
        try {
          const data = JSON.parse(event.data)
          const normalized = Array.isArray(data) ? data : []
          setAllMachines(normalized)
          setLoading(false)
        } catch (error) {
          console.error('Failed to parse monitoring websocket payload:', error)
          setLoading(false)
        }
      }

      socket.onerror = () => {
        setLoading(false)
      }

      socket.onclose = () => {
        if (!closed) {
          reconnectTimer = window.setTimeout(connectSocket, 5000)
        }
      }
    }

    connectSocket()

    return () => {
      closed = true
      if (reconnectTimer) window.clearTimeout(reconnectTimer)
      if (socket && socket.readyState < WebSocket.CLOSING) socket.close()
    }
  }, [])

  useEffect(() => {
    setSelected(null)
  }, [selectedWorkCenter, statusFilter])

  const handleSelect = useCallback(id => setSelected(prev => prev === id ? null : id), [])
  const selectedMachine = layoutMachines.find(m => m.id === selected)
  const hasVisibleMachines = visibleMachines.length > 0

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: '#475569', fontSize: 14, background: '#f5f5f5' }}>
        Loading shop floor data...
      </div>
    )
  }

  return (
    <div className="shop-floor-root">
      <div className="shop-floor-header">
        <div className="shop-floor-header-filters">
          <button
            type="button"
            onClick={() => setStatusFilter('ALL')}
            className={`shop-floor-pill shop-floor-pill-all${statusFilter === 'ALL' ? ' is-active' : ''}`}
          >
            <span className="pill-label-long">MACHINES: <span style={{ color: 'inherit' }}>{stats.total}</span></span>
            <span className="pill-label-short">ALL: {stats.total}</span>
          </button>
          {HEADER_STATUS_PILLS.map(st => (
            <StatusPill
              key={st}
              status={st}
              count={getHeaderStatusCount(st, stats.counts)}
              isActive={statusFilter === st}
              onClick={() => setStatusFilter(st)}
            />
          ))}
        </div>
        <div className="shop-floor-header-actions">
          <Button
            size="small"
            onClick={() => {
              const stored = localStorage.getItem('user');
              let role = 'admin';
              if (stored) {
                try {
                  const u = JSON.parse(stored);
                  role = (u.role || u.user_role || 'admin').toLowerCase();
                } catch {}
              }
              if (role === 'mc' || role.includes('coordinator')) {
                navigate('/manufacturing_coordinator/shop-floor');
              } else {
                navigate('/admin/shop-floor');
              }
            }}
            type="primary"
          >
            Shop Floor
          </Button>
          <span className="shop-floor-clock">
            {time.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </span>
          <Button size="small" onClick={() => setShowLogoutConfirm(true)} danger>
            Logout
          </Button>
        </div>
      </div>

      <div className="shop-floor-canvas-wrap">
        {layoutMachines.length > 0 ? (
        <Canvas
          shadows
          camera={{ position: cameraPreset.position, fov: cameraPreset.fov, near: 0.1, far: 320 }}
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
            machines={layoutMachines}
            selected={selected}
            onSelect={handleSelect}
            workCenters={allWorkCenters}
            workCenterZones={workCenterZones}
            statusFilter={statusFilter}
          />
          <SceneCameraRig
            machines={layoutMachines}
            zones={workCenterZones}
            controlsRef={controlsRef}
            layoutKey={cameraLayoutKey}
            frameRef={frameSceneRef}
            selectedMachine={selectedMachine}
          />
          <BoundedOrbitControls controlsRef={controlsRef} initialTarget={cameraPreset.target} />
        </Canvas>
        ) : (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
            color: '#64748b',
            fontSize: 14,
          }}>
            {hasVisibleMachines ? 'No machines match the selected filter.' : 'No machines in this work center.'}
          </div>
        )}

        <div className={`shop-floor-wc-panel${showLegend ? '' : ' is-hidden'}`}>
          <div style={{ color: '#475569', fontSize: 9, fontWeight: 700, marginBottom: 8, letterSpacing: '0.06em' }}>WORK CENTERS</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <WorkCenterChip
              workCenterKey="ALL"
              count={allMachines.length}
              workCenters={{ ALL: { label: 'All Work Centers', color: '#64748b' } }}
              isActive={selectedWorkCenter === 'ALL'}
              onClick={() => setSelectedWorkCenter('ALL')}
            />
            {Object.keys(allWorkCenters).map(k => (
              <WorkCenterChip
                key={k}
                workCenterKey={k}
                count={workCenterCounts[k] || 0}
                workCenters={allWorkCenters}
                isActive={selectedWorkCenter === k}
                onClick={() => setSelectedWorkCenter(k)}
              />
            ))}
          </div>
        </div>
        <button
          type="button"
          onClick={() => setShowLegend(v => !v)}
          className="shop-floor-wc-toggle"
          style={{ left: showLegend ? 'min(230px, calc(100% - 120px))' : 10 }}
        >
          {showLegend ? '◀ Hide' : 'Work Centers ▶'}
        </button>

        <SelectedMachineModal
          machine={selectedMachine}
          workCenters={allWorkCenters}
          open={Boolean(selectedMachine)}
          onClose={() => setSelected(null)}
        />

        {/* Logout confirmation modal */}
        <Modal
          title="Confirm Logout"
          open={showLogoutConfirm}
          onOk={async () => {
            setShowLogoutConfirm(false)
            await logoutToLogin(navigate)
          }}
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