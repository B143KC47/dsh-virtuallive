/** Layered 2D illustration, articulated resident motion, and floor picking owned by one mount. */
import { canStandAt } from '../home-space.ts'
import { residentPresenceAt } from '../home-interaction.ts'
import type { ResidentState, RoomPoint } from '../types.ts'
import { projectFloor, unprojectFloor } from './room-projection.ts'
import { drawResident } from './resident-sprite.ts'
import { RESIDENT_STRIDE_DISTANCE, residentLocomotionAt } from './resident-motion.ts'
import { loadResidentArtwork, type ResidentArtwork } from './resident-art.ts'
import { ROOM_WALLPAPERS, drawFurniture, furnitureAtPoint, loadFurnitureArtwork, type LoadedFurniture } from './furniture-art.ts'

/** Render budget and DOM-lifetime callbacks supplied by the room component. */
export interface SceneOptions {
  pixelRatioLimit: number
  maximumFrameRate: number
  onDestination: (point: RoomPoint) => void
  /** Opens the phone when its painted screen is selected; absent means ordinary floor picking. */
  onPhoneOpen?: () => void
  onFailure: (error: Error) => void
  onReady: () => void
}

/** A mounted room owns its images, canvas, observers, and animation scheduling. */
export class HomeScene {
  private readonly canvas = document.createElement('canvas')
  private readonly background = new Image()
  private readonly context: CanvasRenderingContext2D
  private readonly resize: ResizeObserver
  private readonly visibility: IntersectionObserver
  private readonly motion = matchMedia('(prefers-reduced-motion: reduce)')
  private readonly lifetime = new AbortController()
  private artwork: ResidentArtwork | undefined
  private furniture: LoadedFurniture[] | undefined
  private wallpaper: ResidentState['home']['background'] = 'afternoon'
  private state: ResidentState
  private speaking = false
  private frame: number | undefined
  private visible = true
  private width = 0
  private height = 0
  private lastPaint = 0
  private pointer: { x: number; y: number } | undefined
  private disposed = false

  /**
   * Mount a painted home and animate only its separately owned resident layer.
   * @param container - Owns image dimensions and the renderer's DOM elements.
   * @param initial - Committed resident facts.
   * @param options - Resolution, animation budget, and parent-owned callbacks.
   */
  constructor(private readonly container: HTMLElement, initial: ResidentState, private readonly options: SceneOptions) {
    this.state = initial
    const context = this.canvas.getContext('2d')
    if (context === null) throw new Error('The browser could not create a 2D canvas')
    this.context = context
    this.background.alt = ''
    this.background.setAttribute('aria-hidden', 'true')
    this.canvas.setAttribute('aria-hidden', 'true')
    container.append(this.background, this.canvas)
    this.canvas.addEventListener('pointerdown', this.pointerDown)
    this.canvas.addEventListener('pointerup', this.pointerUp)
    this.canvas.addEventListener('pointercancel', this.pointerCancel)
    document.addEventListener('visibilitychange', this.schedule)
    this.motion.addEventListener('change', this.schedule)
    this.resize = new ResizeObserver(() => { this.fit() })
    this.resize.observe(container)
    this.visibility = new IntersectionObserver((entries) => {
      this.visible = entries.some(entry => entry.isIntersecting)
      this.schedule()
    })
    this.visibility.observe(container)
    this.fit()
    const signal = this.lifetime.signal
    void Promise.all([
      loadImage(ROOM_WALLPAPERS.afternoon, signal, this.background), loadResidentArtwork(url => loadImage(url, signal)).then((artwork) => {
        if (signal.aborted) artwork.surface.dispose()
        else this.artwork = artwork
        return artwork
      }),
      loadFurnitureArtwork(url => loadImage(url, signal)), loadImage(ROOM_WALLPAPERS.night, signal),
    ])
      .then(([, artwork, furniture]) => {
        if (this.disposed) { artwork.surface.dispose(); return }
        this.artwork = artwork
        this.furniture = furniture
        this.update(this.state, this.speaking)
        this.options.onReady()
        this.schedule()
      }).catch((error: unknown) => {
        if (this.disposed) return
        this.lifetime.abort()
        this.artwork?.surface.dispose()
        this.artwork = undefined
        this.options.onFailure(error instanceof Error ? error : new Error('Room artwork loading failed', { cause: error }))
      })
  }

  /**
   * Replace committed facts while retaining an in-progress walk's original timing.
   * @param state - Current resident projection.
   * @param speaking - Whether an active model turn can animate a talking expression.
   */
  update(state: ResidentState, speaking: boolean): void {
    this.state = state
    this.speaking = speaking
    if (this.artwork && this.wallpaper !== state.home.background) {
      this.wallpaper = state.home.background
      this.background.src = ROOM_WALLPAPERS[this.wallpaper]
    }
    this.schedule()
  }

  private fit(): void {
    const { width, height } = this.container.getBoundingClientRect()
    this.width = width; this.height = height
    const ratio = Math.min(devicePixelRatio, this.options.pixelRatioLimit)
    this.canvas.width = Math.round(width * ratio)
    this.canvas.height = Math.round(height * ratio)
    this.context.setTransform(ratio, 0, 0, ratio, 0, 0)
    this.context.imageSmoothingEnabled = true
    this.context.imageSmoothingQuality = 'high'
    this.schedule()
  }

  private readonly schedule = (): void => {
    if (this.frame !== undefined) cancelAnimationFrame(this.frame)
    this.frame = undefined
    if (this.disposed || !this.visible || document.hidden || !this.artwork || !this.width || !this.height) return
    this.lastPaint = 0
    this.frame = requestAnimationFrame(this.paint)
  }

  private readonly paint = (time: number): void => {
    this.frame = undefined
    if (this.disposed || !this.artwork || !this.furniture) return
    try { this.paintFrame(time, this.artwork, this.furniture) }
    catch (error) {
      this.artwork.surface.dispose()
      this.artwork = undefined
      this.options.onFailure(error instanceof Error ? error : new Error('Room animation failed', { cause: error }))
    }
  }

  private paintFrame(time: number, artwork: ResidentArtwork, furniture: LoadedFurniture[]): void {
    const now = Date.now()
    const presence = residentPresenceAt(this.state, now, { width: this.width, height: this.height })
    const position = presence.position
    const interval = 1000 / this.options.maximumFrameRate
    const elapsed = time - this.lastPaint
    if (elapsed >= interval - 0.5) {
      this.lastPaint += interval * Math.max(1, Math.floor((elapsed + 0.5) / interval))
      const floor = projectFloor(position), interaction = presence.interaction
      const point = interaction ? { ...interaction.attachment.illustration, scale: interaction.attachment.scale } : floor
      const depth = interaction?.attachment.depth ?? position.z
      const stride = projectFloor({
        x: position.x + Math.sin(presence.facing) * RESIDENT_STRIDE_DISTANCE,
        z: position.z + Math.cos(presence.facing) * RESIDENT_STRIDE_DISTANCE,
      })
      const x = point.x * this.width, y = point.y * this.height, height = point.scale * this.height
      this.context.clearRect(0, 0, this.width, this.height)
      drawFurniture(this.context, furniture, this.state.home, {
        width: this.width, height: this.height, depth, interaction, side: 'behind',
      })
      const shadow = this.context.createRadialGradient(x, y, 0, x, y, height * 0.18)
      shadow.addColorStop(0, 'rgba(39, 29, 27, 0.23)')
      shadow.addColorStop(1, 'rgba(39, 29, 27, 0)')
      this.context.save()
      this.context.translate(x, y)
      this.context.scale(1, 0.22)
      this.context.translate(-x, -y)
      this.context.fillStyle = shadow
      this.context.beginPath()
      this.context.arc(x, y, height * 0.18, 0, Math.PI * 2)
      if (!interaction) this.context.fill()
      this.context.restore()
      this.context.save()
      if (this.state.home.background === 'night') this.context.filter = 'brightness(0.8) saturate(0.85)'
      const expression = interaction?.action === 'read' ? { ...this.state.expression, activity: 'reading' as const } : this.state.expression
      const locomotion = residentLocomotionAt(this.state.journey, now, presence.moving)
      drawResident(this.context, artwork, expression, {
        x, y, height, moving: presence.moving, facing: presence.facing, time: time / 1000,
        posture: interaction?.pose ?? (presence.moving ? 'walking' : 'standing'),
        ...(interaction ? { groundY: interaction.attachment.ground.y * this.height, rotation: interaction.attachment.rotation } : {}),
        motion: !this.motion.matches, speaking: this.speaking,
        stride: { x: (stride.x - floor.x) * this.width, y: (stride.y - floor.y) * this.height },
        projectStride: (amount) => {
          const foot = projectFloor({
            x: position.x + Math.sin(presence.facing) * RESIDENT_STRIDE_DISTANCE * amount,
            z: position.z + Math.cos(presence.facing) * RESIDENT_STRIDE_DISTANCE * amount,
          })
          return { x: (foot.x - floor.x) * this.width, y: (foot.y - floor.y) * this.height }
        },
        distance: locomotion.distance, walkAmount: interaction ? 0 : locomotion.amount,
      })
      this.context.restore()
      drawFurniture(this.context, furniture, this.state.home, { width: this.width, height: this.height, depth, interaction, side: 'front' })
    }
    if (presence.moving || !this.motion.matches) this.frame = requestAnimationFrame(this.paint)
  }

  private readonly pointerDown = (event: PointerEvent): void => {
    if (this.artwork && event.isPrimary && event.button === 0) this.pointer = { x: event.clientX, y: event.clientY }
  }

  private readonly pointerCancel = (): void => { this.pointer = undefined }

  private readonly pointerUp = (event: PointerEvent): void => {
    const start = this.pointer
    this.pointer = undefined
    if (!event.isPrimary || !start || Math.hypot(event.clientX - start.x, event.clientY - start.y) > 6) return
    const box = this.canvas.getBoundingClientRect()
    if (!box.width || !box.height) return
    if (this.furniture && this.options.onPhoneOpen && furnitureAtPoint(
      this.furniture, this.state.home, { width: box.width, height: box.height },
      { x: event.clientX - box.left, y: event.clientY - box.top },
    ) === 'phone') {
      this.options.onPhoneOpen()
      return
    }
    const point = unprojectFloor({ x: (event.clientX - box.left) / box.width, y: (event.clientY - box.top) / box.height })
    const target = { x: Math.round(point.x * 4) / 4, z: Math.round(point.z * 4) / 4 }
    if (canStandAt(target, this.state.home)) this.options.onDestination(target)
  }

  /** Stop pending image loads and animation; release only this mount's DOM effects. */
  dispose(): void {
    this.disposed = true
    this.lifetime.abort()
    if (this.frame !== undefined) cancelAnimationFrame(this.frame)
    this.resize.disconnect()
    this.visibility.disconnect()
    document.removeEventListener('visibilitychange', this.schedule)
    this.motion.removeEventListener('change', this.schedule)
    this.canvas.removeEventListener('pointerdown', this.pointerDown)
    this.canvas.removeEventListener('pointerup', this.pointerUp)
    this.canvas.removeEventListener('pointercancel', this.pointerCancel)
    this.background.remove()
    this.canvas.remove()
    this.canvas.width = 0; this.canvas.height = 0
    this.artwork?.surface.dispose()
    this.artwork = undefined
    this.furniture = undefined
  }
}

function loadImage(url: string, signal: AbortSignal, image = new Image()): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const cleanup = (): void => { image.onload = null; image.onerror = null; signal.removeEventListener('abort', abort) }
    const abort = (): void => { cleanup(); image.src = ''; reject(new DOMException('Room image loading cancelled', 'AbortError')) }
    image.onload = () => { cleanup(); resolve(image) }
    image.onerror = () => { cleanup(); reject(new Error(`Room artwork could not load: ${url}`)) }
    signal.addEventListener('abort', abort, { once: true })
    if (signal.aborted) abort()
    else image.src = url
  })
}
