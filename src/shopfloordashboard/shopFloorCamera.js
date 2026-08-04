import * as THREE from 'three'

/** Match FactoryScene.jsx hall (FW=80, FD=64, WH=25) with inner margin. */
export const HALL_HALF_W = 36
export const HALL_HALF_D = 28
export const HALL_MAX_H = 21
export const HALL_MIN_H = 5

const MACHINE_HALF = 2.8
const ZONE_PAD = 1.5
const FLAG_HEIGHT = 7.5
const MIN_RADIUS = 12
const INTERIOR_MARGIN = 4

/** Open front of hall (+Z) — camera looks straight into the shop floor. */
export const FRONT_Z = HALL_HALF_D - INTERIOR_MARGIN

/** Screen padding so machines + work-center flags stay inside frame. */
const VIEW_MARGIN = 0.1

export function computeContentBox(machines = [], zones = []) {
  const box = new THREE.Box3()
  let hasPoints = false

  machines.forEach((m) => {
    box.expandByPoint(new THREE.Vector3(m.position.x - MACHINE_HALF, 0, m.position.z - MACHINE_HALF))
    box.expandByPoint(new THREE.Vector3(m.position.x + MACHINE_HALF, 5, m.position.z + MACHINE_HALF))
    hasPoints = true
  })

  zones.forEach((z) => {
    const hw = (z.width || 0) / 2 + ZONE_PAD
    const hd = (z.depth || 0) / 2 + ZONE_PAD
    box.expandByPoint(new THREE.Vector3(z.position.x - hw, 0, z.position.z - hd))
    box.expandByPoint(new THREE.Vector3(z.position.x + hw, FLAG_HEIGHT, z.position.z + hd))
    hasPoints = true
  })

  if (!hasPoints) {
    box.setFromCenterAndSize(new THREE.Vector3(0, 2, 0), new THREE.Vector3(MIN_RADIUS * 2, 6, MIN_RADIUS * 2))
  }

  return box
}

export function computeSceneBounds(machines = [], zones = []) {
  const box = computeContentBox(machines, zones)
  const center = box.getCenter(new THREE.Vector3())
  center.y = 2
  const size = box.getSize(new THREE.Vector3())
  const radius = Math.max(Math.max(size.x, size.z) * 0.55, MIN_RADIUS)
  return { center, radius, box }
}

function getSamplePoints(box) {
  const { min, max } = box
  const xs = [min.x, max.x]
  const zs = [min.z, max.z]
  const ys = [0, 2.5, 5, FLAG_HEIGHT]
  const points = []
  for (const y of ys) {
    for (const x of xs) {
      for (const z of zs) {
        points.push(new THREE.Vector3(x, y, z))
      }
    }
  }
  return points
}

function allPointsVisible(camera, points, margin = VIEW_MARGIN) {
  camera.updateMatrixWorld(true)
  for (const point of points) {
    const projected = point.clone().project(camera)
    if (
      projected.x < -1 + margin
      || projected.x > 1 - margin
      || projected.y < -1 + margin
      || projected.y > 1 - margin
      || projected.z > 1
    ) {
      return false
    }
  }
  return true
}

export function clampInsideHall(position) {
  position.x = THREE.MathUtils.clamp(position.x, -HALL_HALF_W, HALL_HALF_W)
  position.y = THREE.MathUtils.clamp(position.y, HALL_MIN_H, HALL_MAX_H)
  position.z = THREE.MathUtils.clamp(position.z, -HALL_HALF_D, HALL_HALF_D)
  return position
}

/**
 * Fixed front overview — camera at open front (+Z), centered on machines,
 * elevated, looking straight into the hall. Fits all machines in one frame.
 */
export function getFrontOverviewPose(box, camera, aspect) {
  const target = box.getCenter(new THREE.Vector3())
  target.y = 2

  const samplePoints = getSamplePoints(box)
  const camX = THREE.MathUtils.clamp(
    target.x,
    -HALL_HALF_W + INTERIOR_MARGIN,
    HALL_HALF_W - INTERIOR_MARGIN,
  )

  const fovSteps = [38, 42, 46, 50, 54, 58]
  let best = null

  for (const fov of fovSteps) {
    camera.fov = fov
    camera.aspect = aspect
    camera.updateProjectionMatrix()

    let lo = HALL_MIN_H + 6
    let hi = HALL_MAX_H - 0.5
    let bestY = hi

    while (hi - lo > 0.35) {
      const mid = (lo + hi) / 2
      const position = clampInsideHall(new THREE.Vector3(camX, mid, FRONT_Z))

      camera.position.copy(position)
      camera.lookAt(target)
      camera.updateProjectionMatrix()

      if (allPointsVisible(camera, samplePoints)) {
        bestY = mid
        hi = mid
      } else {
        lo = mid
      }
    }

    const position = clampInsideHall(new THREE.Vector3(camX, bestY, FRONT_Z))
    camera.position.copy(position)
    camera.lookAt(target)
    camera.updateProjectionMatrix()

    if (allPointsVisible(camera, samplePoints)) {
      best = {
        position,
        target,
        distance: position.distanceTo(target),
        fov,
      }
      break
    }
  }

  if (!best) {
    const position = clampInsideHall(new THREE.Vector3(camX, HALL_MAX_H - 1, FRONT_Z))
    best = {
      position,
      target,
      distance: position.distanceTo(target),
      fov: fovSteps[fovSteps.length - 1],
    }
  }

  return best
}

export function computeCameraPreset(machines = [], zones = [], aspect = 1) {
  const cam = new THREE.PerspectiveCamera(42, Math.max(aspect, 0.01), 0.1, 400)
  const { position, target, fov } = applyOverviewCamera(cam, null, machines, zones)
  return {
    position: [position.x, position.y, position.z],
    target: [target.x, target.y, target.z],
    fov,
  }
}

/**
 * Close-up pose when a single machine is selected.
 * Approaches from the current camera side (or front +Z), lower and nearer
 * so the machine fills the view instead of a high bird's-eye hop.
 */
export function getMachineFocusPose(machine, fromCameraPos = null) {
  const px = machine.position?.x ?? 0
  const pz = machine.position?.z ?? 0
  const target = new THREE.Vector3(px, 1.55, pz)

  const dir = new THREE.Vector3(0, 0, 1)
  if (fromCameraPos) {
    dir.set(fromCameraPos.x - px, 0, fromCameraPos.z - pz)
    if (dir.lengthSq() < 0.25) dir.set(0, 0, 1)
    dir.normalize()
  }

  // ~6.5 units out, chest-height look — close enough to "walk up" to the machine
  const position = clampInsideHall(
    new THREE.Vector3(px + dir.x * 6.5, 4.6, pz + dir.z * 6.5),
  )

  // Keep a usable orbit distance after clamp (minDistance is 5)
  const toCam = position.clone().sub(target)
  const dist = toCam.length()
  if (dist < 5.5) {
    toCam.normalize().multiplyScalar(5.5)
    position.copy(target).add(toCam)
    clampInsideHall(position)
  }

  const distance = position.distanceTo(target)
  return { position, target, fov: 42, distance }
}

export function applyMachineFocusCamera(camera, controls, machine) {
  const aspect = camera.aspect > 0 ? camera.aspect : window.innerWidth / Math.max(window.innerHeight, 1)
  camera.aspect = aspect
  const { position, target, fov, distance } = getMachineFocusPose(machine, camera.position)

  camera.fov = fov
  camera.position.copy(position)
  camera.lookAt(target)
  camera.near = Math.max(0.1, distance * 0.002)
  camera.far = Math.max(400, distance * 12)
  camera.updateProjectionMatrix()

  if (controls) {
    controls.target.copy(target)
    controls.update()
  }

  return { position, target, distance, fov }
}

export function applyOverviewCamera(camera, controls, machines, zones) {
  const aspect = camera.aspect > 0 ? camera.aspect : window.innerWidth / Math.max(window.innerHeight, 1)
  camera.aspect = aspect

  const { box } = computeSceneBounds(machines, zones)
  const { position, target, distance, fov } = getFrontOverviewPose(box, camera, aspect)

  camera.fov = fov
  camera.position.copy(position)
  camera.lookAt(target)
  camera.near = Math.max(0.1, distance * 0.002)
  camera.far = Math.max(400, distance * 12)
  camera.updateProjectionMatrix()

  if (controls) {
    controls.target.copy(target)
    controls.minPolarAngle = 0.2
    controls.maxPolarAngle = Math.PI / 2.02
    controls.update()
  }

  return { center: target.clone(), target, position, distance, fov: camera.fov }
}

export function clampOrbitCamera(controls) {
  if (!controls) return

  const target = controls.target
  target.x = THREE.MathUtils.clamp(target.x, -HALL_HALF_W, HALL_HALF_W)
  target.y = THREE.MathUtils.clamp(target.y, 1, HALL_MAX_H)
  target.z = THREE.MathUtils.clamp(target.z, -HALL_HALF_D, HALL_HALF_D)

  const camera = controls.object
  clampInsideHall(camera.position)

  const offset = camera.position.clone().sub(target)
  const dist = offset.length()
  const minDist = 5
  const maxDist = 110

  if (dist > maxDist) {
    offset.multiplyScalar(maxDist / dist)
    camera.position.copy(target).add(offset)
  } else if (dist < minDist) {
    offset.multiplyScalar(minDist / Math.max(dist, 0.001))
    camera.position.copy(target).add(offset)
  }

  clampInsideHall(camera.position)
}
