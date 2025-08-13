// ===== Helpers =====
const $ = id => document.getElementById(id);
const fmt = s => {
  s = Math.max(0, s|0); const m = (s/60|0).toString().padStart(2,'0');
  return `${m}:${(s%60).toString().padStart(2,'0')}`;
};

// ===== State =====
let ctx, srcNode, gainNode, analyser, rafId, media, files = [], index = -1;
let shaper, bass, mid, treble;  // EQ nodes
let limiterOn = true;

// Create/refresh graph for a new <audio>
function buildGraph() {
  if (ctx) ctx.close().catch(()=>{});
  ctx = new (window.AudioContext || window.webkitAudioContext)();

  // Media element & source
  media = new Audio();
  media.preload = 'metadata';
  media.crossOrigin = 'anonymous';
  const url = URL.createObjectURL(files[index]);
  media.src = url;

  srcNode = ctx.createMediaElementSource(media);

  // Gain (Boost)
  gainNode = ctx.createGain();
  gainNode.gain.value = parseFloat($('boost').value);

  // EQ: bass (lowshelf), mid (peaking), treble (highshelf)
  bass = ctx.createBiquadFilter();   bass.type = 'lowshelf';  bass.frequency.value = 120;  bass.gain.value = 0;
  mid = ctx.createBiquadFilter();    mid.type = 'peaking';    mid.frequency.value = 1000;  mid.Q.value = 1.0; mid.gain.value = 0;
  treble = ctx.createBiquadFilter(); treble.type = 'highshelf';treble.frequency.value = 6000; treble.gain.value = 0;

  // Soft limiter (waveshaper) — tames clipping at high boosts
  shaper = ctx.createWaveShaper();
  setLimiterCurve($('limiter').checked);

  // Visualizer
  analyser = ctx.createAnalyser();
  analyser.fftSize = 2048;

  // Connect: src -> gain -> EQ -> shaper -> analyser -> output
  srcNode.connect(gainNode);
  gainNode.connect(bass);
  bass.connect(mid);
  mid.connect(treble);
  treble.connect(shaper);
  shaper.connect(analyser);
  analyser.connect(ctx.destination);

  media.addEventListener('ended', nextTrack);
  media.addEventListener('timeupdate', updateSeek);
  media.addEventListener('loadedmetadata', () => {
    $('title').textContent = files[index]?.name || 'Unknown';
    $('time').textContent = `00:00 / ${fmt(media.duration)}`;
    draw();
  });
}

function setLimiterCurve(on) {
  limiterOn = on;
  // Curve: gentle soft-clip around ±0.7; bypass = linear
  const k = 3; // strength
  const n = 1024;
  const curve = new Float32Array(n);
  for (let i=0; i<n; i++) {
    const x = (i/(n-1))*2 - 1;
    curve[i] = on ? ((1 + k) * x) / (1 + k * Math.abs(x)) : x;
  }
  shaper.curve = curve;
  shaper.oversample = '4x';
}

// ===== UI Bindings =====
$('fileInput').addEventListener('change', e => {
  files = Array.from(e.target.files || []);
  buildPlaylist();
  if (files.length) { index = 0; buildGraph(); play(); }
});

$('playBtn').addEventListener('click', () => (media?.paused ? play() : pause()));
$('prevBtn').addEventListener('click', prevTrack);
$('nextBtn').addEventListener('click', nextTrack);

$('seek').addEventListener('input', e => {
  if (!media || !isFinite(media.duration)) return;
  const pos = (parseInt(e.target.value,10) / 1000) * media.duration;
  media.currentTime = pos;
});

$('boost').addEventListener('input', e => {
  const v = parseFloat(e.target.value);
  $('boostVal').textContent = v.toFixed(2)+'×';
  if (gainNode) gainNode.gain.value = v;
});

$('limiter').addEventListener('change', e => setLimiterCurve(e.target.checked));

$('bass').addEventListener('input', e => {
  const db = parseFloat(e.target.value); $('bassVal').textContent = db+' dB';
  if (bass) bass.gain.value = db;
});
$('mid').addEventListener('input', e => {
  const db = parseFloat(e.target.value); $('midVal').textContent = db+' dB';
  if (mid) mid.gain.value = db;
});
$('treble').addEventListener('input', e => {
  const db = parseFloat(e.target.value); $('trebleVal').textContent = db+' dB';
  if (treble) treble.gain.value = db;
});
$('resetEq').addEventListener('click', () => {
  ['bass','mid','treble'].forEach(id => { $(id).value = 0; $(`${id}Val`).textContent = '0 dB'; });
  if (bass) bass.gain.value = 0; if (mid) mid.gain.value = 0; if (treble) treble.gain.value = 0;
});

// ===== Playlist =====
function buildPlaylist() {
  const ol = $('playlist'); ol.innerHTML = '';
  files.forEach((f, i) => {
    const li = document.createElement('li');
    li.textContent = f.name;
    if (i===index) li.classList.add('active');
    li.onclick = () => { index = i; buildGraph(); play(); highlight(); };
    ol.appendChild(li);
  });
}
function highlight() {
  [...$('playlist').children].forEach((li,i)=>li.classList.toggle('active', i===index));
}
function nextTrack() {
  if (!files.length) return;
  index = (index + 1) % files.length; buildGraph(); play(); highlight();
}
function prevTrack() {
  if (!files.length) return;
  index = (index - 1 + files.length) % files.length; buildGraph(); play(); highlight();
}

// ===== Playback/Seek =====
async function play() {
  if (!ctx) return;
  if (ctx.state === 'suspended') await ctx.resume();
  await media.play().catch(()=>{ /* user gesture needed */ });
  $('playBtn').textContent = '⏸';
}
function pause() { media?.pause(); $('playBtn').textContent = '▶'; }
function updateSeek() {
  if (!media || !isFinite(media.duration)) return;
  const pos = media.currentTime, dur = media.duration;
  $('seek').value = Math.round((pos / dur) * 1000);
  $('time').textContent = `${fmt(pos)} / ${fmt(dur)}`;
}

// ===== Visualizer =====
function draw() {
  cancelAnimationFrame(rafId);
  const c = $('canvas'), g = c.getContext('2d');
  const buf = new Uint8Array(analyser.frequencyBinCount);
  const W=c.width, H=c.height;
  (function loop(){
    rafId = requestAnimationFrame(loop);
    g.clearRect(0,0,W,H);
    analyser.getByteTimeDomainData(buf);
    g.beginPath();
    for (let x=0; x<W; x++){
      const i = Math.floor(x / W * buf.length);
      const v = (buf[i]-128)/128;
      const y = H/2 + v * (H*0.45);
      x===0 ? g.moveTo(x,y) : g.lineTo(x,y);
    }
    g.strokeStyle = '#66d9ef'; g.lineWidth = 2; g.stroke();
  })();
}

// iOS/Autoplay caveat: first tap on Play initializes audio context.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && ctx && ctx.state === 'suspended') ctx.resume();
});
