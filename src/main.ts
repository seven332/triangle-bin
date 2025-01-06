function printNoWebGPU() {
  document.getElementById('text')!.textContent = 'WebGPU is not supported on this browser.'
}

async function main() {
  const device = await (await navigator.gpu?.requestAdapter())?.requestDevice()
  if (!device) {
    printNoWebGPU()
    return
  }

  const canvas = document.querySelector('canvas') as HTMLCanvasElement;
  const context = canvas.getContext('webgpu') as GPUCanvasContext;
  const presentationFormat = navigator.gpu.getPreferredCanvasFormat();

  context.configure({
    device,
    format: presentationFormat,
  });

  const module = device.createShaderModule({
    code: `
struct Varyings {
  @builtin(position) position: vec4f,
  @location(0) color: vec4f,
}

@group(0) @binding(0) var<uniform> max: u32;
@group(0) @binding(1) var<storage, read_write> index: atomic<u32>;

@vertex
fn triangle_bin_vert(@builtin(vertex_index) vertexIndex : u32) -> Varyings {
  const positions = array<vec2f, 4>(
    vec2f(0, 0),
    vec2f(0, 1),
    vec2f(1, 0),
    vec2f(1, 1)
  );
  const colors = array<vec4f, 4>(
    vec4f(1, 0, 0, 1),
    vec4f(0, 1, 0, 1),
    vec4f(0, 0, 1, 1),
    vec4f(1, 1, 1, 1)
  );
  var out: Varyings;
  let p = positions[vertexIndex] * 2 - 1;
  out.position = vec4f(p.x, -p.y, 0, 1);
  out.color = colors[vertexIndex];
  return out;
}

@fragment
fn triangle_bin_frag(in: Varyings) -> @location(0) vec4f {
    return select(vec4f(0), in.color, atomicAdd(&index, 1) < max);
}`,
  });

  const pipeline = device.createRenderPipeline({
    layout: 'auto',
    vertex: {
      module,
      entryPoint: 'triangle_bin_vert',
    },
    fragment: {
      module,
      entryPoint: 'triangle_bin_frag',
      targets: [{
          format: presentationFormat,
      }],
    },
    primitive: {
      topology: 'triangle-list',
    },
  });

  const uniformBuffer = device.createBuffer({
    size: 1024,
    usage: GPUBufferUsage.UNIFORM,
  });
  device.queue.writeBuffer(uniformBuffer, 0, new Uint32Array([1]));

  const storageBuffer = device.createBuffer({
    size: 1024,
    usage: GPUBufferUsage.STORAGE,
  });
  device.queue.writeBuffer(storageBuffer, 0, new Uint32Array([1024]));
}

main();
