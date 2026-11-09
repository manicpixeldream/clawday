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
const slots = [[20, 30], [50, 30], [80, 30], [20, 70], [50, 70], [80, 70]];
const moves = { up: [0, -10], left: [-10, 0], down: [0, 10], right: [10, 0] };
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
  return rack.find(ball => ball.x === x && ball.depth === depth);
}

function position(node, x, depth) {
  node.style.left = x + '%';
  node.style.top = depth + '%';
}

function updateAim() {
  position($('aim'), x, depth);
  $('aim').classList.toggle('aligned', Boolean(target()));
  $('aimStatus').textContent = rack.length
    ? 'Position ' + x / 10 + ', ' + depth / 10 + (target() ? ' · Capsule in range' : ' · No capsule in range')
    : 'Add tasks to load capsules.';
}

function move(direction) {
  if (grabbing) return;
  const [dx, dy] = moves[direction];
  x = Math.max(10, Math.min(90, x + dx));
  depth = Math.max(10, Math.min(90, depth + dy));
  updateAim();
}

function renderRack(active) {
  const pending = new Set(active.map(task => task.id));
  const previous = rack.filter(ball => pending.has(ball.id));
  const loaded = new Set(previous.map(ball => ball.id));
  const waiting = active.filter(task => !loaded.has(task.id));
  rack = slots.flatMap(([x, depth], index) => {
    const ball = previous.find(ball => ball.index === index);
    const task = ball ? null : waiting.shift();
    return ball ?? (task ? { id: task.id, x, depth, index } : []);
  });
  $('balls').replaceChildren(...rack.map(ball => {
    const sprite = element('div', 'capsule', '');
    sprite.dataset.slot = ball.index;
    position(sprite, ball.x, ball.depth);
    return sprite;
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
  $('claw').classList.add('dropping');
  try {
    await new Promise(resolve => setTimeout(resolve, 340));
    if (pick) {
      $('balls').querySelector('[data-slot="' + pick.index + '"]').hidden = true;
      $('claw').classList.add('holding');
    }
    $('claw').classList.remove('dropping');
    await new Promise(resolve => setTimeout(resolve, 340));
    if (!pick) {
      toast('Miss! Move the target over a capsule and try again.');
      return;
    }
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
    $('claw').classList.remove('dropping', 'holding');
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
$('machine').querySelectorAll('[data-move]').forEach(button => {
  button.onclick = () => move(button.dataset.move);
});
$('machine').addEventListener('keydown', event => {
  const direction = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' }[event.key];
  if (direction) {
    event.preventDefault();
    move(direction);
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
