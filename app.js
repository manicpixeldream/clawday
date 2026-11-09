const KEY = 'clawday-state-v2';
const $ = id => document.getElementById(id);
const modal = $('modal');
const defaults = { points: 0, streak: 0, lastVisit: '', lastCompleted: '', prize: '' };
const milestones = [3, 10, 25];
const empty = () => ({ tasks: [], meta: { ...defaults } });
let state = empty();
let storageAvailable = true;
let grabbing = false;
let saving = false;
let toastTimer;
let renderedDay;
const moves = { up: [0, -2], left: [-2, 0], down: [0, 2], right: [2, 0] };
const gripFailureRate = .2;
let x = 50;
let depth = 50;
let rack = [];

function day(date = new Date()) {
  return [date.getFullYear(), date.getMonth() + 1, date.getDate()]
    .map((part, index) => String(part).padStart(index ? 2 : 4, '0')).join('-');
}

function reportStorageError() {
  storageAvailable = false;
  $('storageNotice').hidden = false;
  $('storageNotice').textContent = 'Browser storage is unavailable. Changes in this tab may be lost on reload.';
}

function readState() {
  const parse = key => {
    try { return JSON.parse(localStorage.getItem(key)); }
    catch (error) {
      if (error instanceof SyntaxError) return null;
      throw error;
    }
  };
  const current = parse(KEY);
  const tasks = current?.tasks ?? parse('clawday-tasks-v1');
  const meta = current?.meta ?? parse('clawday-meta-v1');
  return {
    tasks: Array.isArray(tasks) ? tasks.filter(task => typeof task?.text === 'string')
      .map(task => ({ ...task, id: task.id ?? newId() })) : [],
    meta: { ...defaults, ...meta }
  };
}

function newId() {
  return crypto.randomUUID?.() ?? Math.random().toString(36).slice(2);
}

async function change(apply) {
  const update = () => {
    if (storageAvailable) {
      try { state = readState(); }
      catch { reportStorageError(); }
    }
    visit(state.meta);
    const result = apply(state);
    if (storageAvailable) {
      try { localStorage.setItem(KEY, JSON.stringify(state)); }
      catch { reportStorageError(); }
    }
    render();
    return result;
  };
  return navigator.locks ? navigator.locks.request(KEY, update) : update();
}

function visit(meta) {
  const now = new Date();
  const today = day(now);
  if (meta.lastVisit === today) return;
  now.setDate(now.getDate() - 1);
  meta.streak = meta.lastVisit === day(now) ? meta.streak + 1 : 1;
  meta.lastVisit = today;
}

function element(tag, className, text) {
  const node = document.createElement(tag);
  node.className = className;
  node.textContent = text;
  return node;
}

function showPick(task) {
  const label = element('div', '', '');
  label.append(element('small', '', 'CAPTURED'),
    element('strong', '', task.text));
  $('picked').className = 'picked';
  $('picked').replaceChildren(element('div', 'picked-ball', ''), label);
}

function target() {
  return rack.find(ball => Math.hypot(ball.x - x, ball.depth - depth) <= ball.size * .48);
}

function drawCabinet(pose = {}) {
  cabinet.draw({ x, depth, rack, aligned: Boolean(target()), ...pose });
}

function animate(duration, draw) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
    draw(1);
    return Promise.resolve();
  }
  return new Promise(resolve => {
    const start = performance.now();
    function frame(now) {
      const progress = Math.min(1, (now - start) / duration);
      draw(progress);
      if (progress < 1) requestAnimationFrame(frame);
      else resolve();
    }
    requestAnimationFrame(frame);
  });
}

function updateAim() {
  drawCabinet();
  $('aimStatus').textContent = rack.length
    ? (target() ? 'Capsule in range' : 'Move the claw over a capsule')
    : 'Add tasks to load capsules.';
}

function move(dx, dy) {
  if (grabbing) return;
  x = Math.max(5, Math.min(95, x + dx));
  depth = Math.max(5, Math.min(95, depth + dy));
  updateAim();
}

function renderRack(active) {
  const columns = Math.max(1, Math.min(active.length, Math.ceil(Math.sqrt(active.length * 1.3))));
  const rows = Math.max(1, Math.ceil(active.length / columns));
  const size = Math.min(15, 72 / columns, 65 / rows);
  rack = active.map(({ id }, index) => ({
    id, index, size,
    x: 7 + (index % columns + .5) * 86 / columns,
    depth: 9 + (Math.floor(index / columns) + .5) * 73 / rows
  }));
  updateAim();
}

function render() {
  const { tasks, meta } = state;
  const today = renderedDay = day();
  const list = $('taskList');
  list.replaceChildren();
  tasks.filter(task => task.done).forEach(task => {
    const row = element('div', 'task done', '');
    row.append(element('i', 'dot', ''), element('span', '', task.text));
    list.append(row);
  });
  const done = tasks.filter(task => task.done).length;
  const active = tasks.filter(task => !task.done);
  if (!grabbing) renderRack(active);
  const next = milestones.find(points => points > meta.points);
  $('queueCount').textContent = active.length;
  $('doneCount').textContent = tasks.filter(task => task.done && task.completedOn === today).length;
  $('points').textContent = meta.points;
  $('streak').textContent = '✦ ' + meta.streak + (meta.streak === 1 ? ' day' : ' days');
  $('dailyBonus').textContent = meta.lastCompleted === today
    ? 'Daily bonus claimed · +2 points' : 'First task today earns a +2 bonus';
  $('nextMilestone').textContent = next ? { 3: 'Bronze prize', 10: 'Silver prize', 25: 'Gold prize' }[next] : 'All prizes unlocked';
  $('milestoneText').textContent = next ? (next - meta.points) + ' points to go' : 'You earned every trophy';
  $('shelfCount').textContent = milestones.filter(points => points <= meta.points).length + ' / 3 unlocked';
  milestones.forEach(points => $('trophy' + points).classList.toggle('unlocked', points <= meta.points));
  $('prizeLine').replaceChildren('Your prize: ', element('b', '', meta.prize || 'set one in setup'));
  $('progressText').textContent = done + ' / ' + tasks.length;
  $('progressBar').style.width = (tasks.length ? done / tasks.length * 100 : 0) + '%';
  $('playBtn').setAttribute('aria-disabled', String(grabbing || !active.length));
  $('preview').textContent = active.length ? active.length + ' sealed capsules' : 'No tasks yet. Add a few!';
}

function toast(message) {
  clearTimeout(toastTimer);
  $('toast').textContent = message;
  $('toast').classList.add('show');
  toastTimer = setTimeout(() => $('toast').classList.remove('show'), 2200);
}

async function setup(start) {
  if (saving) return;
  saving = true;
  try {
    const input = $('taskInput');
    const text = input.value.trim();
    const prize = $('prizeInput').value.trim();
    if (text || start) await change(({ tasks, meta }) => {
      if (text) tasks.push({ id: newId(), text, done: false });
      if (start) meta.prize = prize;
    });
    if (input.value.trim() === text) input.value = '';
    if (start && state.tasks.length) {
      modal.close();
      toast('Machine loaded. Let’s play!');
    } else if (modal.open) {
      input.focus();
    }
  } finally {
    saving = false;
  }
}

async function play() {
  if (grabbing || !rack.length) return;
  grabbing = true;
  $('playBtn').setAttribute('aria-disabled', 'true');
  const pick = target();
  try {
    const bottom = (pick?.size ?? 10) + 3;
    await animate(460, progress => drawCabinet({ height: 76 + (bottom - 76) * progress }));
    await animate(160, progress => drawCabinet({ height: bottom, grip: 1 - progress }));
    if (!pick) {
      await animate(400, progress => drawCabinet({ height: bottom + (76 - bottom) * progress }));
      toast('Miss! Move the target over a capsule and try again.');
      return;
    }
    if (Math.random() < gripFailureRate) {
      await animate(220, progress => drawCabinet({ height: bottom + 22 * progress, grip: 0, held: pick }));
      await animate(260, progress => drawCabinet({
        height: bottom + 22 + (54 - bottom) * progress, held: pick,
        prize: { x: pick.x, depth: pick.depth, height: 22 * (1 - progress ** 2) }
      }));
      toast('The cube slipped! Try another grab.');
      return;
    }
    await animate(400, progress => drawCabinet({ height: bottom + (76 - bottom) * progress, grip: 0, held: pick }));
    const chute = cabinet.chute;
    const delivery = { x: chute.x, depth: chute.depth, held: pick };
    await animate(480, progress => drawCabinet({
      held: pick, grip: 0,
      x: x + (chute.x - x) * progress,
      depth: depth + (chute.depth - depth) * progress
    }));
    await animate(340, progress => drawCabinet({
      ...delivery, grip: progress,
      prize: { ...chute, height: (76 - bottom) * (1 - progress ** 2) }
    }));
    const capture = await change(({ tasks, meta }) => {
      const task = tasks.find(task => task.id === pick.id && !task.done);
      if (!task) return null;
      const today = day();
      const bonus = meta.lastCompleted !== today;
      task.done = true;
      task.completedOn = today;
      meta.points += bonus ? 3 : 1;
      meta.lastCompleted = today;
      return { task, bonus };
    });
    if (capture) {
      showPick(capture.task);
      toast(capture.bonus ? 'Daily bonus! +3 points' : 'Task captured · +1 point');
    } else {
      toast('That task was captured in another tab.');
    }
  } finally {
    grabbing = false;
    render();
  }
}

function openSetup() {
  $('prizeInput').value = state.meta.prize;
  modal.showModal();
  $('taskInput').focus();
}

$('addBtn').onclick = openSetup;
$('closeBtn').onclick = () => modal.close();
$('addTaskBtn').onclick = () => setup(false);
$('startBtn').onclick = () => setup(true);
$('taskInput').onkeydown = event => {
  if (event.key === 'Enter' && !event.isComposing) setup(false);
};
$('playBtn').onclick = play;
const joystick = $('joystick');
let pointer;
let stickX = 0;
let stickY = 0;
let lastFrame;
let steeringFrame;

function steer(event) {
  if (event.pointerId !== pointer) return;
  const bounds = joystick.getBoundingClientRect();
  const dx = event.clientX - bounds.left - bounds.width / 2;
  const dy = event.clientY - bounds.top - 34;
  const radius = Math.max(26, Math.hypot(dx, dy));
  stickX = dx / radius;
  stickY = dy / radius;
  joystick.style.setProperty('--stick-x', stickX * 26 + 'px');
  joystick.style.setProperty('--stick-y', stickY * 22 + 'px');
}

function steerFrame(now) {
  if (pointer === undefined) return;
  const elapsed = Math.min(32, now - (lastFrame ?? now));
  lastFrame = now;
  if (Math.hypot(stickX, stickY) > .15) move(stickX * elapsed * .065, stickY * elapsed * .065);
  steeringFrame = requestAnimationFrame(steerFrame);
}

joystick.addEventListener('pointerdown', event => {
  if (pointer !== undefined || event.button !== 0 || grabbing) return;
  pointer = event.pointerId;
  joystick.setPointerCapture(pointer);
  steer(event);
  steeringFrame = requestAnimationFrame(steerFrame);
});
joystick.addEventListener('pointermove', steer);
joystick.addEventListener('lostpointercapture', event => {
  if (event.pointerId !== pointer) return;
  cancelAnimationFrame(steeringFrame);
  pointer = lastFrame = undefined;
  joystick.style.removeProperty('--stick-x');
  joystick.style.removeProperty('--stick-y');
});
$('machine').addEventListener('keydown', event => {
  const direction = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' }[event.key];
  if (direction) {
    event.preventDefault();
    move(...moves[direction]);
  } else if (event.code === 'Space') {
    event.preventDefault();
    if (!event.repeat) play();
  }
});
window.addEventListener('storage', event => {
  if (!storageAvailable || (event.key !== KEY && event.key !== null)) return;
  try { state = readState(); render(); }
  catch { reportStorageError(); }
});

function updateClock() {
  $('clock').textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (renderedDay && day() !== renderedDay) change(() => {});
}

async function init() {
  await change(() => {});
  updateClock();
  setInterval(updateClock, 1000);
  if (!state.tasks.length && !modal.open) openSetup();
}

init();
