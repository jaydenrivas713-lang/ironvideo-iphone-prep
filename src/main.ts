import './style.css';

const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = `
  <main class="shell">
    <header class="top"><div class="mark">IV</div><div><p class="eyebrow">EVEN REALITIES G2</p><h1>IronVideo <span>Offline</span></h1></div></header>
    <p class="intro">Prepare videos on your iPhone. Save them to Files. Play them on your G2 without Wi-Fi or your PC.</p>
    <section class="panel">
      <label class="file-button" for="videoFile">＋ Choose video from Files</label>
      <input id="videoFile" type="file" accept="video/*,.mp4,.mov,.m4v,.webm" />
      <div class="field"><label for="videoUrl">Or use a direct video-file URL</label><input id="videoUrl" type="url" placeholder="https://site.com/video.mp4" autocapitalize="off" autocomplete="url" /></div>
      <div class="grid"><div class="field"><label for="fps">Frame rate</label><select id="fps"><option value="6">6 FPS · smaller file</option><option value="8" selected>8 FPS · recommended</option><option value="10">10 FPS · smoother</option></select></div><div class="field"><label for="limit">Max length</label><select id="limit"><option value="15">15 seconds</option><option value="30" selected>30 seconds</option><option value="45">45 seconds</option><option value="60">60 seconds</option></select></div></div>
      <button id="prepare" class="primary" disabled>Prepare G2 video</button>
      <p id="selected" class="muted">Choose a video to begin.</p>
    </section>
    <section class="panel status-panel"><div class="status-head"><span class="dot"></span><strong id="statusTitle">Ready</strong><span id="percent">0%</span></div><progress id="progress" max="100" value="0"></progress><p id="statusText" class="muted">Video conversion happens locally in your browser.</p><button id="save" class="secondary" hidden>Save .ivf to Files</button></section>
    <section class="note"><strong>Important</strong><p>Use a video saved in Files for the most reliable result. Direct URLs only work when the video host allows browser access (CORS). A YouTube page link is not a direct video-file URL.</p><p>For a first test, use a short MP4 clip. G2 playback is grayscale and low-resolution by design.</p></section>
    <footer>IRONVIDEO · LOCAL PREPARATION · NO UPLOAD</footer>
  </main>
  <video id="sourceVideo" playsinline muted preload="metadata"></video>
  <canvas id="workCanvas" width="576" height="288"></canvas>
`;

const fileInput = document.querySelector<HTMLInputElement>('#videoFile')!;
const urlInput = document.querySelector<HTMLInputElement>('#videoUrl')!;
const fpsInput = document.querySelector<HTMLSelectElement>('#fps')!;
const limitInput = document.querySelector<HTMLSelectElement>('#limit')!;
const prepareButton = document.querySelector<HTMLButtonElement>('#prepare')!;
const saveButton = document.querySelector<HTMLButtonElement>('#save')!;
const selectedText = document.querySelector<HTMLParagraphElement>('#selected')!;
const statusTitle = document.querySelector<HTMLElement>('#statusTitle')!;
const statusText = document.querySelector<HTMLParagraphElement>('#statusText')!;
const percentText = document.querySelector<HTMLElement>('#percent')!;
const progress = document.querySelector<HTMLProgressElement>('#progress')!;
const video = document.querySelector<HTMLVideoElement>('#sourceVideo')!;
const canvas = document.querySelector<HTMLCanvasElement>('#workCanvas')!;
const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
let sourceFile: File | null = null;
let sourceObjectUrl = '';
let resultBlob: Blob | null = null;
let resultName = 'ironvideo.ivf';
let busy = false;

function setStatus(title: string, message: string, pct?: number) {
  statusTitle.textContent = title;
  statusText.textContent = message;
  if (pct !== undefined) { progress.value = pct; percentText.textContent = `${Math.round(pct)}%`; }
}
function safeName(name: string) {
  const base = name.replace(/\.[^.]+$/, '').replace(/[^a-z0-9_-]+/gi, '-').replace(/^-+|-+$/g, '').slice(0, 48);
  return `${base || 'ironvideo'}.ivf`;
}
function loadSource(file: File) {
  if (sourceObjectUrl) URL.revokeObjectURL(sourceObjectUrl);
  sourceFile = file;
  sourceObjectUrl = URL.createObjectURL(file);
  video.src = sourceObjectUrl;
  video.load();
  resultBlob = null; saveButton.hidden = true;
  selectedText.textContent = `${file.name} · ${(file.size / 1024 / 1024).toFixed(1)} MB`;
  prepareButton.disabled = false;
  resultName = safeName(file.name);
  setStatus('Video selected', 'Ready to convert on this iPhone.', 0);
}
fileInput.addEventListener('change', () => { const file = fileInput.files?.[0]; if (file) loadSource(file); });
urlInput.addEventListener('change', () => { if (urlInput.value.trim()) { sourceFile = null; resultBlob = null; saveButton.hidden = true; selectedText.textContent = 'Direct URL selected. The video host must allow CORS.'; prepareButton.disabled = false; resultName = safeName(urlInput.value.split('/').pop()?.split('?')[0] || 'ironvideo'); } });
video.addEventListener('error', () => { if (!busy) setStatus('Could not open video', 'Try importing an MP4 or MOV from Files. Some URL hosts block browser access.', 0); });
function waitForEvent(target: EventTarget, eventName: string, timeoutMs = 15000): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => { cleanup(); reject(new Error(`Timed out waiting for ${eventName}.`)); }, timeoutMs);
    const cleanup = () => { clearTimeout(timer); target.removeEventListener(eventName, done); target.removeEventListener('error', fail); };
    const done = () => { cleanup(); resolve(); };
    const fail = () => { cleanup(); reject(new Error('The browser could not decode this video. Try an MP4 or MOV.')); };
    target.addEventListener(eventName, done, { once: true }); target.addEventListener('error', fail, { once: true });
  });
}
async function seekTo(seconds: number) {
  if (Math.abs(video.currentTime - seconds) < 0.001 && video.readyState >= 2) return;
  const wait = waitForEvent(video, 'seeked', 15000);
  video.currentTime = seconds;
  await wait;
}
function packGray4(image: ImageData): Uint8Array {
  const pixels = image.data;
  const packed = new Uint8Array((canvas.width * canvas.height) >> 1);
  let out = 0;
  for (let i = 0; i < pixels.length; i += 8) {
    const r0 = pixels[i], g0 = pixels[i + 1], b0 = pixels[i + 2];
    const r1 = pixels[i + 4], g1 = pixels[i + 5], b1 = pixels[i + 6];
    const gray0 = Math.max(0, Math.min(15, Math.round((0.299 * r0 + 0.587 * g0 + 0.114 * b0) / 17)));
    const gray1 = Math.max(0, Math.min(15, Math.round((0.299 * r1 + 0.587 * g1 + 0.114 * b1) / 17)));
    packed[out++] = (gray0 << 4) | gray1;
  }
  return packed;
}
async function prepareVideo() {
  if (busy) return;
  const url = urlInput.value.trim();
  if (!sourceFile && !url) return;
  busy = true; prepareButton.disabled = true; saveButton.hidden = true; resultBlob = null;
  let localUrl = false;
  try {
    if (!sourceFile) {
      if (sourceObjectUrl) URL.revokeObjectURL(sourceObjectUrl);
      sourceObjectUrl = url; video.crossOrigin = 'anonymous'; video.src = url; video.load(); localUrl = true;
    }
    if (video.readyState < 1) await waitForEvent(video, 'loadedmetadata', 20000);
    if (!Number.isFinite(video.duration) || video.duration <= 0) throw new Error('Video duration could not be read.');
    const fps = Number(fpsInput.value);
    const maxSeconds = Number(limitInput.value);
    const duration = Math.min(video.duration, maxSeconds);
    const frameCount = Math.max(1, Math.floor(duration * fps));
    const frameBytes = (576 * 288) >> 1;
    const expectedMB = frameCount * frameBytes / 1024 / 1024;
    if (expectedMB > 48) throw new Error('This clip would create a very large file. Choose a shorter clip or lower FPS.');
    setStatus('Preparing video', `Converting ${duration.toFixed(1)} seconds at ${fps} FPS. Keep this page open.`, 0);
    const chunks: Uint8Array[] = [];
    for (let frame = 0; frame < frameCount; frame++) {
      await seekTo(Math.min(frame / fps, Math.max(0, video.duration - 0.01)));
      ctx.fillStyle = 'black'; ctx.fillRect(0, 0, 576, 288);
      const vw = video.videoWidth, vh = video.videoHeight;
      const scale = Math.min(576 / vw, 288 / vh);
      const dw = Math.max(1, Math.round(vw * scale)), dh = Math.max(1, Math.round(vh * scale));
      ctx.drawImage(video, Math.round((576 - dw) / 2), Math.round((288 - dh) / 2), dw, dh);
      chunks.push(packGray4(ctx.getImageData(0, 0, 576, 288)));
      if (frame % 2 === 0 || frame === frameCount - 1) {
        const pct = ((frame + 1) / frameCount) * 100;
        setStatus('Preparing video', `Frame ${frame + 1} of ${frameCount} · approx. ${expectedMB.toFixed(1)} MB`, pct);
        await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
      }
    }
    const metadata = { format: 'IronVideo Frame Bundle', version: 1, width: 576, height: 288, fps, frameCount, duration: frameCount / fps, title: sourceFile?.name || resultName.replace(/\.ivf$/i, ''), packing: 'two 4-bit grayscale pixels per byte; first pixel in high nibble' };
    const metaBytes = new TextEncoder().encode(JSON.stringify(metadata));
    const header = new Uint8Array(8 + metaBytes.length);
    header.set([73, 86, 70, 49], 0); // IVF1
    new DataView(header.buffer).setUint32(4, metaBytes.length, true);
    header.set(metaBytes, 8);
    resultBlob = new Blob([header, ...chunks], { type: 'application/octet-stream' });
    resultName = safeName(sourceFile?.name || resultName);
    saveButton.hidden = false;
    setStatus('Ready to save', `${frameCount} frames · ${(resultBlob.size / 1024 / 1024).toFixed(1)} MB. Tap Save .ivf to Files.`, 100);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    setStatus('Preparation failed', message.includes('tainted') || message.toLowerCase().includes('cross-origin') ? 'This video host blocks browser access. Download the video to Files first, then import it.' : message, 0);
  } finally {
    busy = false; prepareButton.disabled = !(sourceFile || urlInput.value.trim());
    if (localUrl) { video.removeAttribute('src'); video.load(); video.crossOrigin = null; }
  }
}
prepareButton.addEventListener('click', () => void prepareVideo());
saveButton.addEventListener('click', async () => {
  if (!resultBlob) return;
  const outputFile = new File([resultBlob], resultName, { type: 'application/octet-stream' });
  try {
    if (navigator.share && (!navigator.canShare || navigator.canShare({ files: [outputFile] }))) {
      await navigator.share({ files: [outputFile], title: resultName });
      setStatus('Share sheet opened', 'Choose Save to Files, then import the .ivf in IronVideo G2 Player.', 100);
      return;
    }
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') return;
  }
  const blobUrl = URL.createObjectURL(resultBlob);
  const a = document.createElement('a'); a.href = blobUrl; a.download = resultName; a.rel = 'noopener'; document.body.appendChild(a); a.click(); a.remove();
  window.setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
  setStatus('Download started', 'Save the .ivf to Files, then import it in IronVideo G2 Player.', 100);
});
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', () => { navigator.serviceWorker.register('./sw.js').catch(() => {/* PWA offline caching requires HTTPS or localhost. */}); });
}
