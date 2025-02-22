function printNoWebGPU() {
  document.getElementById('text')!.textContent = 'WebGPU is not supported on this browser.'
}

interface InputValue {
  value: number;
}

function inputValue(id: string, valueId: string, defaultValue: number) {
  const inputElement = document.getElementById(id) as HTMLInputElement;
  function getValue() {
    const value = parseInt(inputElement.value);
    return isNaN(value) ? defaultValue : value;
  }
  const valueElement = document.getElementById(valueId) as HTMLSpanElement;
  let value: InputValue = {
    value: getValue(),
  };
  valueElement.textContent = value.value.toString();
  inputElement.addEventListener('input', () => {
    value.value = getValue();
    valueElement.textContent = value.value.toString();
  });
  return value
}

async function main() {
  const deviceOrNull = await (await navigator.gpu?.requestAdapter())?.requestDevice()
  if (!deviceOrNull) {
    printNoWebGPU()
    return
  }
  const device = deviceOrNull;

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
      topology: 'triangle-strip',
    },
  });

  const uniformBuffer = device.createBuffer({
    size: 4,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  const storageBuffer = device.createBuffer({
    size: 4,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });

  const bindGroup = device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries: [
      {
        binding: 0,
        resource: {
          buffer: uniformBuffer,
        },
      },
      {
        binding: 1,
        resource: {
          buffer: storageBuffer,
        },
      },
    ],
  });

  let seconds = inputValue('seconds', 'seconds-value', 8);
  let percent = inputValue('percent', 'percent-value', 100);

  function frame() {
    const width = Math.round(window.innerWidth * percent.value / 100);
    const height = Math.round(window.innerHeight * percent.value / 100);
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width
      canvas.height = height
      context.configure({
        device,
        format: presentationFormat,
      });
    }

    device.queue.writeBuffer(storageBuffer, 0, new Uint32Array([0]));
    const cycle = seconds.value * 1000;
    const total = width * height
    const speed = Math.round(total / cycle)
    device.queue.writeBuffer(uniformBuffer, 0, new Uint32Array([new Date().getTime() * speed % total]));

    const commandEncoder = device.createCommandEncoder();

    const renderPassDescriptor: GPURenderPassDescriptor = {
      colorAttachments: [
        {
          view: context.getCurrentTexture().createView(),
          clearValue: [0, 0, 0, 0],
          loadOp: 'clear',
          storeOp: 'store',
        },
      ],
    };

    const passEncoder = commandEncoder.beginRenderPass(renderPassDescriptor);
    passEncoder.setPipeline(pipeline);
    passEncoder.setBindGroup(0, bindGroup);
    passEncoder.draw(4);
    passEncoder.end();
  
    device.queue.submit([commandEncoder.finish()]);
    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
}

main();
