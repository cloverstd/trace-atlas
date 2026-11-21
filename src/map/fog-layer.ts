import type { CustomLayerInterface, Map as MapLibreMap } from 'maplibre-gl';
import type { View } from './types';
import { maskTransform } from './geometry';
import { cameraView } from './camera';
export class FogLayer implements CustomLayerInterface {
  id = 'trace-atlas-fog';
  type = 'custom' as const;
  renderingMode = '2d' as const;
  private gl!: WebGL2RenderingContext;
  private program!: WebGLProgram;
  private vao!: WebGLVertexArrayObject;
  private buffer!: WebGLBuffer;
  private texture!: WebGLTexture;
  private map!: MapLibreMap;
  private hasFrame = false;
  private frameView?: View;
  opacity = 0.78;
  onAdd(map: MapLibreMap, gl: WebGL2RenderingContext) {
    this.map = map;
    this.gl = gl;
    const shader = (type: number, source: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, source);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error('迷雾着色器初始化失败');
      return s;
    };
    const vertex = shader(
      gl.VERTEX_SHADER,
      '#version 300 es\nin vec2 position;out vec2 uv;void main(){gl_Position=vec4(position,0.,1.);uv=vec2((position.x+1.)*.5,(1.-position.y)*.5);}',
    );
    const fragment = shader(
      gl.FRAGMENT_SHADER,
      `#version 300 es
precision highp float;
uniform sampler2D mask;
uniform float opacity;
uniform bool hasFrame;
uniform vec2 maskScale;
uniform vec2 maskOffset;
uniform vec2 featherStep;
in vec2 uv;
out vec4 color;
float coverage(vec2 p) {
  if (any(lessThan(p, vec2(0.))) || any(greaterThan(p, vec2(1.)))) return 1.;
  return texture(mask, p).a;
}
void main() {
  vec2 p = uv * maskScale + maskOffset;
  float a = 1.;
  if (hasFrame) {
    // A small Gaussian filter softens bitmap stairs without blurring the basemap.
    a = coverage(p) * 4.;
    a += 2. * (coverage(p + vec2(featherStep.x, 0.)) + coverage(p - vec2(featherStep.x, 0.))
      + coverage(p + vec2(0., featherStep.y)) + coverage(p - vec2(0., featherStep.y)));
    a += coverage(p + featherStep) + coverage(p - featherStep)
      + coverage(p + vec2(featherStep.x, -featherStep.y))
      + coverage(p + vec2(-featherStep.x, featherStep.y));
    a /= 16.;
  }
  color = vec4(0., 0., 0., a * opacity);
}`,
    );
    this.program = gl.createProgram()!;
    gl.attachShader(this.program, vertex);
    gl.attachShader(this.program, fragment);
    gl.linkProgram(this.program);
    gl.deleteShader(vertex);
    gl.deleteShader(fragment);
    if (!gl.getProgramParameter(this.program, gl.LINK_STATUS))
      throw new Error('迷雾图层初始化失败');
    this.vao = gl.createVertexArray()!;
    gl.bindVertexArray(this.vao);
    this.buffer = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(this.program, 'position');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);
    this.texture = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      1,
      1,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      new Uint8Array([255, 255, 255, 255]),
    );
    this.hasFrame = false;
  }
  invalidate() {
    this.hasFrame = false;
    this.map?.triggerRepaint();
  }
  frame(bitmap: ImageBitmap, view: View) {
    if (this.gl && !this.gl.isContextLost()) {
      this.gl.bindTexture(this.gl.TEXTURE_2D, this.texture);
      this.gl.texImage2D(
        this.gl.TEXTURE_2D,
        0,
        this.gl.RGBA,
        this.gl.RGBA,
        this.gl.UNSIGNED_BYTE,
        bitmap,
      );
      this.hasFrame = true;
      this.frameView = view;
      this.map.triggerRepaint();
    }
    bitmap.close();
  }
  render(gl: WebGL2RenderingContext) {
    gl.useProgram(this.program);
    gl.bindVertexArray(this.vao);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.STENCIL_TEST);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.uniform1i(gl.getUniformLocation(this.program, 'mask'), 0);
    gl.uniform1f(gl.getUniformLocation(this.program, 'opacity'), this.opacity);
    const current = cameraView(this.map);
    const transform = this.frameView
      ? maskTransform(this.frameView, current)
      : { scale: [1, 1], offset: [0, 0] };
    gl.uniform2f(
      gl.getUniformLocation(this.program, 'maskScale'),
      transform.scale[0],
      transform.scale[1],
    );
    gl.uniform2f(
      gl.getUniformLocation(this.program, 'maskOffset'),
      transform.offset[0],
      transform.offset[1],
    );
    // Keep the feather width stable in screen pixels while panning and zooming.
    const radius = 0.5;
    gl.uniform2f(
      gl.getUniformLocation(this.program, 'featherStep'),
      (radius / current.width) * transform.scale[0],
      (radius / current.height) * transform.scale[1],
    );
    const preciseEnough = !this.frameView || this.frameView.zoom > 7 || current.zoom <= 7;
    gl.uniform1i(
      gl.getUniformLocation(this.program, 'hasFrame'),
      +(this.hasFrame && preciseEnough),
    );
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.bindVertexArray(null);
  }
  onRemove() {
    this.gl.deleteTexture(this.texture);
    this.gl.deleteBuffer(this.buffer);
    this.gl.deleteVertexArray(this.vao);
    this.gl.deleteProgram(this.program);
  }
}
