// The canvas is a low-resolution viewport into a world with width, height and depth.
const cabinet = (() => {
  const canvas = document.getElementById('cabinet');
  const ctx = canvas.getContext('2d');
  const chute = { x: 94, depth: 92 };
  let faces = [];

  function project([x, y, z]) {
    x -= 50;
    y -= 48;
    z -= 50;
    const horizontal = x * .998 - z * .063;
    const forward = x * .063 + z * .998;
    const vertical = y * .867 - forward * .498;
    const depth = y * .498 + forward * .867;
    const zoom = 600 / (310 - depth);
    return [200 + horizontal * zoom, 143 - vertical * zoom, depth];
  }

  function face(vertices, color) {
    const points = vertices.map(project);
    const depth = points.reduce((sum, point) => sum + point[2], 0) / points.length;
    faces.push({ points, depth, color });
  }

  function box(x, y, z, w, h, d, colors) {
    const a = [x, y, z], b = [x + w, y, z], c = [x + w, y, z + d], e = [x, y, z + d];
    const top = [a, b, c, e].map(([px, py, pz]) => [px, py + h, pz]);
    face(top, colors[0]);
    face([e, c, top[2], top[3]], colors[1]);
    face([b, c, top[2], top[1]], colors[2]);
  }

  const frame = ['#ff866e', '#bf3446', '#702044'];
  const rail = ['#c6b8f4', '#7868a8', '#493b77'];
  const gold = ['#fff3aa', '#eda956', '#a95840'];
  const capsuleColors = [
    ['#ffb5db', '#e7519c', '#8e2d76'],
    ['#c3fff1', '#3bbcae', '#236c83'],
    ['#fff2af', '#f5ae54', '#a7594d']
  ];

  function capsule(x, y, z, ball) {
    const { size, index } = ball;
    const colors = capsuleColors[index % capsuleColors.length];
    const left = x - size / 2, back = z - size / 2;
    box(left, y, back, size, size * .72, size, colors);
    box(x - size * .28, y + size * .73, z - size * .22, size * .56, .4, size * .44,
      ['#fff0cc', '#bfb5c8', '#a59ab1']);
    box(left, y + size * .78, back, size, size * .22, size,
      ['#d6f7ff44', '#a2dfff76', '#8699df76']);
    box(left, y + size, back, size, .35, size * .12,
      ['#e7f8ffb0', '#e7f8ff80', '#e7f8ff80']);
  }

  function draw({ x, depth, height = 76, grip = 1, rack, held, prize, aligned }) {
    faces = [];
    ctx.fillStyle = '#150d27';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    box(-4, -16, -4, 108, 16, 108, ['#46265f', '#a43f80', '#5e285f']);
    box(0, 0, -2, 100, 91, 2, ['#593b81', '#2d1c48', '#3e285c']);
    for (let i = 0; i < 100; i += 10) {
      box(i, 0, 0, .35, .1, 100, ['#6c488b', '#6c488b', '#6c488b']);
      box(0, 0, i, 100, .1, .35, ['#6c488b', '#6c488b', '#6c488b']);
    }
    faces.forEach(item => { item.depth -= 1000; });
    for (const corner of [[-2, -2], [98, -2], [-2, 98], [98, 98]]) {
      box(corner[0], 0, corner[1], 4, 96, 4, frame);
    }
    box(-2, 92, 98, 104, 7, 4, frame);
    for (const post of [-2, 98]) {
      for (let level = 12; level < 90; level += 13) {
        const light = level % 2 ? '#ffcf67' : '#fff2d4';
        box(post, level, 102, 4, 4, .8, [light, light, '#d16e58']);
      }
    }
    box(98, 92, 0, 4, 7, 98, frame);
    box(-2, 88, 0, 3, 3, 98, rail);
    box(98, 88, 0, 3, 3, 98, rail);
    box(0, 86, depth - 2, 100, 4, 4, rail);
    box(x - 4, 84, depth - 4, 8, 8, 8, gold);
    box(x - 1, height + 3, depth - 1, 2, 84 - height, 2, rail);
    box(x - 5, height, depth - 4, 10, 5, 8, gold);
    for (const side of [-1, 1]) {
      const jaw = x + side * (5 + grip * 3);
      box(Math.min(x, jaw), height - 3, depth - 1, Math.abs(jaw - x), 3, 3, gold);
      box(jaw - 1, height - 8, depth - 1, 2, 6, 3, gold);
      box(jaw - (side > 0 ? 3 : 0), height - 9, depth - 1, 3, 2, 3, gold);
    }
    const reticle = aligned ? '#96ffce' : '#ffd57c';
    for (const offset of [-7, 7]) {
      box(x + offset, .2, depth - 7, .7, .1, 14, [reticle, reticle, reticle]);
      box(x - 7, .2, depth + offset, 14, .1, .7, [reticle, reticle, reticle]);
    }
    box(85, .15, 85, 14, .2, 14, ['#130c22', '#130c22', '#130c22']);
    box(85, 0, 84, 15, 2, 2, gold);
    box(84, 0, 85, 2, 2, 15, gold);
    rack.forEach(ball => {
      if (ball !== held) capsule(ball.x, 0, ball.depth, ball);
    });
    if (held && !prize) capsule(x, height - held.size - 3, depth, held);
    if (prize && held) capsule(prize.x, prize.height, prize.depth, held);
    faces.sort((a, b) => a.depth - b.depth).forEach(({ points, color }) => {
      ctx.beginPath();
      points.forEach(([px, py], index) => {
        if (index === 0) ctx.moveTo(Math.round(px), Math.round(py));
        else ctx.lineTo(Math.round(px), Math.round(py));
      });
      ctx.closePath();
      ctx.fillStyle = color;
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.fill();
      ctx.stroke();
    });
  }

  return { draw, chute };
})();
