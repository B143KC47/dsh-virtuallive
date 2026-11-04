/** One artwork-owned GPU surface rasterizes continuous meshes without triangle seams. */
import type { ResidentMesh } from './resident-mesh.ts'
import type { ResidentPoint } from './resident-motion.ts'

/** One painted layer and its local articulation, ordered from back to front. */
export interface ResidentMeshLayer { mesh: ResidentMesh; deform: (point: ResidentPoint) => ResidentPoint }

/** Character-height units visible around the selected floor or furniture attachment. */
export interface ResidentView { left: number; top: number; width: number; height: number }

/** A graphics failure stops animation and is reported by the mounted room. */
export class ResidentGraphicsError extends Error {
  /**
   * Identify whether graphics initialization or an active graphics context failed.
   * @param code - Stable graphics failure category for the room's reporting owner.
   */
  constructor(readonly code: 'unavailable' | 'context-lost') {
    super(code === 'unavailable' ? 'The browser could not create the resident animation surface'
      : 'Resident animation stopped because the browser lost its graphics context')
  }
}

/** A mounted artwork owns its GPU textures, buffer, program, and composition canvas. */
export class ResidentSurface {
  private readonly canvas = document.createElement('canvas')
  private readonly gl: WebGLRenderingContext
  private readonly program: WebGLProgram
  private readonly buffer: WebGLBuffer
  private readonly vertices = new Float32Array(32 * 40 * 6 * 4)
  private readonly textures = new Map<HTMLImageElement | HTMLCanvasElement, WebGLTexture>()

  constructor() {
    const gl = this.canvas.getContext('webgl', { alpha: true, antialias: false, premultipliedAlpha: true })
    if (!gl) throw new ResidentGraphicsError('unavailable')
    this.gl = gl
    const program = gl.createProgram(), buffer = gl.createBuffer()
    this.program = program; this.buffer = buffer
    try { this.initialize() }
    catch (error) { this.dispose(); throw error }
  }

  private initialize(): void {
    const gl = this.gl, program = this.program, buffer = this.buffer
    const vertex = shader(gl, gl.VERTEX_SHADER, `
      attribute vec2 position;
      attribute vec2 uv;
      uniform vec4 view;
      varying vec2 texturePosition;
      void main() {
        texturePosition = uv;
        gl_Position = vec4((position.x - view.x) * 2.0 / view.z - 1.0, 1.0 - (position.y - view.y) * 2.0 / view.w, 0.0, 1.0);
      }
    `)
    const fragment = shader(gl, gl.FRAGMENT_SHADER, `
      precision mediump float;
      uniform sampler2D textureImage;
      varying vec2 texturePosition;
      void main() { gl_FragColor = texture2D(textureImage, texturePosition); }
    `)
    gl.attachShader(program, vertex); gl.attachShader(program, fragment); gl.linkProgram(program)
    gl.deleteShader(vertex); gl.deleteShader(fragment)
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error('The browser could not link resident animation shaders')
    gl.useProgram(program); gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
    const position = gl.getAttribLocation(program, 'position'), uv = gl.getAttribLocation(program, 'uv')
    gl.enableVertexAttribArray(position); gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 16, 0)
    gl.enableVertexAttribArray(uv); gl.vertexAttribPointer(uv, 2, gl.FLOAT, false, 16, 8)
    gl.uniform1i(gl.getUniformLocation(program, 'textureImage'), 0)
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true)
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)
  }

  /**
   * Composite locally articulated source textures into the room's 2D canvas.
   * @param context - Room context, translated to the character's floor anchor.
   * @param height - Character height before the context's resolution scale.
   * @param layers - Registered artwork in back-to-front drawing order.
   * @param view - Visible extent around the posture's floor or furniture attachment.
   */
  draw(context: CanvasRenderingContext2D, height: number, layers: readonly ResidentMeshLayer[], view: ResidentView): void {
    if (this.gl.isContextLost()) throw new ResidentGraphicsError('context-lost')
    const matrix = context.getTransform(), resolution = Math.hypot(matrix.a, matrix.b)
    const width = Math.ceil(height * view.width * resolution / 32) * 32
    const canvasHeight = Math.ceil(height * view.height * resolution / 32) * 32
    if (this.canvas.width !== width || this.canvas.height !== canvasHeight) {
      this.canvas.width = width; this.canvas.height = canvasHeight
    }
    const gl = this.gl
    gl.uniform4f(gl.getUniformLocation(this.program, 'view'), view.left, view.top, view.width, view.height)
    gl.viewport(0, 0, width, canvasHeight); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT)
    for (const { mesh, deform } of layers) {
      let texture = this.textures.get(mesh.image)
      if (!texture) {
        const created = gl.createTexture()
        texture = created; this.textures.set(mesh.image, texture)
        gl.bindTexture(gl.TEXTURE_2D, texture)
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, mesh.image)
      } else gl.bindTexture(gl.TEXTURE_2D, texture)
      const points = mesh.points.map(deform)
      let length = 0
      const vertex = (index: number, column: number, row: number): void => {
        const point = points[index] as ResidentPoint
        this.vertices[length++] = point.x; this.vertices[length++] = point.y
        this.vertices[length++] = (mesh.texture.left + column / mesh.columns * mesh.texture.width) / mesh.image.width
        this.vertices[length++] = (mesh.texture.top + row / mesh.rows * mesh.texture.height) / mesh.image.height
      }
      for (let row = 0; row < mesh.rows; row++) {
        for (let column = 0; column < mesh.columns; column++) {
          const a = row * (mesh.columns + 1) + column, b = a + 1, c = a + mesh.columns + 1, d = c + 1
          vertex(a, column, row); vertex(b, column + 1, row); vertex(c, column, row + 1)
          vertex(d, column + 1, row + 1); vertex(c, column, row + 1); vertex(b, column + 1, row)
        }
      }
      gl.bufferData(gl.ARRAY_BUFFER, this.vertices.subarray(0, length), gl.DYNAMIC_DRAW)
      gl.drawArrays(gl.TRIANGLES, 0, length / 4)
    }
    context.drawImage(this.canvas, view.left * height, view.top * height, view.width * height, view.height * height)
  }

  /** Release this mount's textures and GPU resources before dropping its artwork. */
  dispose(): void {
    for (const texture of this.textures.values()) this.gl.deleteTexture(texture)
    this.textures.clear(); this.gl.deleteBuffer(this.buffer); this.gl.deleteProgram(this.program)
    this.gl.getExtension('WEBGL_lose_context')?.loseContext()
    this.canvas.width = 0; this.canvas.height = 0
  }
}

function shader(gl: WebGLRenderingContext, kind: number, source: string): WebGLShader {
  const result = gl.createShader(kind)
  if (!result) throw new Error('The browser could not allocate a resident animation shader')
  gl.shaderSource(result, source); gl.compileShader(result)
  if (!gl.getShaderParameter(result, gl.COMPILE_STATUS)) {
    gl.deleteShader(result)
    throw new Error('The browser could not compile a resident animation shader')
  }
  return result
}
