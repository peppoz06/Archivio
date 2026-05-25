const dentaturaFrontale = new Image();
// asset effects removed: do not load external image for xray overlay
// dentaturaFrontale.src = "asset/dentatura-frontale.jpeg";

const otturazione = new Image();
// asset effects removed: do not load external restoration image
// otturazione.src = "asset/otturazione.jpeg";
// Radiograph image for smile-triggered overlay (folder: interazione)
const radiografiaImg = new Image();
radiografiaImg.src = 'interazione/radiografiabase.jpg';
radiografiaImg.crossOrigin = 'anonymous';
let radiografiaLoaded = false;
radiografiaImg.onload = () => { radiografiaLoaded = true; };
radiografiaImg.onerror = (e) => { console.error('Failed to load radiograph image:', radiografiaImg.src, e); };
// DOM overlay element (placed above the video/canvas)
let radiographOverlayEl = null;
let overlayDebugEl = null;
// proximity multiplier for trackpoint sensitivity (higher = more permissive)
let PROXIMITY_MULT = 0.18; // reduced sensitivity to avoid false positives
// debounce: number of consecutive frames a fingertip must remain within threshold
const PROXIMITY_REQUIRED_FRAMES = 3;
// track consecutive hits for landmark indices
const _consecutiveHits = {};
// When true, the live webcam stream will be hidden visually (video kept playing for detection).
const HIDE_VIDEO_STREAM = true;
let overlayStatusEl = null;
let _preloadFailures = [];

function ensureOverlayDebug() {
    if (overlayDebugEl) return overlayDebugEl;
    try {
        const d = document.createElement('div');
        d.id = 'overlayDebug';
        d.style.position = 'fixed';
        d.style.right = '18px';
        d.style.bottom = '18px';
        d.style.padding = '8px 10px';
        d.style.background = 'rgba(0,0,0,0.6)';
        d.style.color = '#fff';
        d.style.fontFamily = 'monospace';
        d.style.fontSize = '12px';
        d.style.zIndex = '9999';
        d.style.border = '1px solid rgba(255,255,255,0.06)';
        d.style.borderRadius = '6px';
        d.textContent = '';
        document.body.appendChild(d);
        overlayDebugEl = d;
        return overlayDebugEl;
    } catch (e) {
        return null;
    }
}

// Map specific face-landmark indices to radiograph assets
const LANDMARK_IMAGE_MAP = {
    234: 'interazione/radiografia_Adx1.jpg',
    187: 'interazione/radiografia_Adx2.jpg',
    32: 'interazione/radiografia_Bdx2.jpg',
    352: 'interazione/radiografia_Asx1.jpg',
    411: 'interazione/radiografia_Asx2.jpg',
    436: 'interazione/radiografia_Asx3.jpg',
    172: 'interazione/radiografia_Bdx1.jpg',
    397: 'interazione/radiografia_Bsx1.jpg',
    394: 'interazione/radiografia_Bsx2.jpg',
    428: 'interazione/radiografia_Bsx3.jpg'
};


function showOverlayDebug(msg) {
    try {
        const el = ensureOverlayDebug();
        if (!el) return;
        el.textContent = msg;
        // fade effect
        el.style.opacity = '1';
        clearTimeout(el._hideTimer);
        el._hideTimer = setTimeout(() => { try { el.style.opacity = '0.85'; } catch (e) {} }, 2400);
    } catch (e) {}
}

function ensureOverlayStatus() {
    if (overlayStatusEl) return overlayStatusEl;
    try {
        const s = document.createElement('div');
        s.id = 'overlayStatus';
        s.style.position = 'fixed';
        s.style.left = '18px';
        s.style.bottom = '18px';
        s.style.padding = '8px 10px';
        s.style.background = 'rgba(0,0,0,0.6)';
        s.style.color = '#fff';
        s.style.fontFamily = 'monospace';
        s.style.fontSize = '12px';
        s.style.zIndex = '10000';
        s.style.border = '1px solid rgba(255,255,255,0.06)';
        s.style.borderRadius = '6px';
        s.style.maxWidth = '320px';
        s.innerHTML = '<strong>Overlay status</strong><br><div id="overlayStatusInner">initializing...</div>';
        document.body.appendChild(s);
        overlayStatusEl = s;
        return overlayStatusEl;
    } catch (e) { return null; }
}

function updateOverlayStatus() {
    try {
        const el = ensureOverlayStatus();
        if (!el) return;
        const inner = document.getElementById('overlayStatusInner');
        const overlay = radiographOverlayEl;
        const lines = [];
        lines.push(`<div style="margin-bottom:6px"><em>Preload failures:</em> ${_preloadFailures.length}</div>`);
        if (_preloadFailures.length > 0) {
            _preloadFailures.slice(-3).forEach(p => lines.push(`<div style="color:#f88;">• ${p}</div>`));
        }
        if (overlay) {
            lines.push(`<div>overlay.src: ${overlay.src.split('/').pop()}</div>`);
            lines.push(`<div>display: ${overlay.style.display || 'n/a'} opacity: ${overlay.style.opacity || 'n/a'}</div>`);
            const la = overlay.dataset && overlay.dataset.landmarkActive ? overlay.dataset.landmarkActive : 'none';
            lines.push(`<div>landmarkActive: ${la}</div>`);
        } else {
            lines.push('<div>overlay element: not present</div>');
        }
        inner.innerHTML = lines.join('');
    } catch (e) {}
}

function createOverlayTestPanel() {
    try {
        const panel = document.createElement('div');
        panel.id = 'overlayTestPanel';
        panel.style.position = 'fixed';
        panel.style.right = '18px';
        panel.style.top = '18px';
        panel.style.zIndex = '10001';
        panel.style.background = 'rgba(0,0,0,0.6)';
        panel.style.color = '#fff';
        panel.style.padding = '8px';
        panel.style.borderRadius = '8px';
        panel.style.fontFamily = 'monospace';
        panel.style.fontSize = '12px';
        panel.innerHTML = '<strong>Overlay test</strong><div style="margin-top:6px" id="overlayTestButtons"></div>';
        document.body.appendChild(panel);

        const container = document.getElementById('overlayTestButtons');
        // base image
        const baseBtn = document.createElement('button');
        baseBtn.textContent = 'Test base';
        baseBtn.style.margin = '4px';
        baseBtn.onclick = () => {
            const overlay = ensureRadiographOverlay();
            if (!overlay) return;
            const p = radiografiaImg.src;
            const img = new Image();
            img.onload = () => { overlay.src = p; overlay.style.display='block'; overlay.style.opacity='0.98'; showOverlayDebug('Base loaded'); updateOverlayStatus(); };
            img.onerror = (e) => { _preloadFailures.push(p); showOverlayDebug('Base failed'); updateOverlayStatus(); };
            img.src = p;
        };
        container.appendChild(baseBtn);

        Object.entries(LANDMARK_IMAGE_MAP).forEach(([idx, path]) => {
            const b = document.createElement('button');
            b.textContent = `${idx}`;
            b.title = path.split('/').pop();
            b.style.margin = '4px';
            b.onclick = () => {
                const overlay = ensureRadiographOverlay();
                if (!overlay) return;
                const img = new Image();
                img.onload = () => { 
                    try { overlay.dataset.landmarkActive = String(idx); } catch (e) {}
                    try { overlay.dataset.persistent = '1'; } catch (e) {}
                    overlay.src = path; overlay.style.display='block'; overlay.style.opacity='0.98'; showOverlayDebug(`Loaded ${path.split('/').pop()}`); updateOverlayStatus();
                };
                img.onerror = (e) => { _preloadFailures.push(path); showOverlayDebug(`Failed ${path.split('/').pop()}`); updateOverlayStatus(); };
                img.src = path;
            };
            container.appendChild(b);
        });
    } catch (e) { console.warn('Failed to create overlay test panel', e && e.message); }
}

// create the test panel after DOM ready
if (document.readyState === 'complete' || document.readyState === 'interactive') {
    setTimeout(createOverlayTestPanel, 400);
} else {
    document.addEventListener('DOMContentLoaded', () => setTimeout(createOverlayTestPanel, 400));
}

function ensureRadiographOverlay() {
    if (radiographOverlayEl) return radiographOverlayEl;
    try {
        const frame = document.getElementById('webcamFrame') || document.getElementById('container');
        if (!frame) return null;
        const img = document.createElement('img');
        img.id = 'radiographOverlay';
        img.src = radiografiaImg.src;
        img.style.position = 'absolute';
        img.style.left = '0';
        img.style.top = '0';
        img.style.width = '100%';
        img.style.height = '100%';
        img.style.objectFit = 'cover';
        // place overlay above video/canvas; debug canvas sits above it
        img.style.zIndex = '10';
        img.style.pointerEvents = 'none';
        img.style.opacity = '0';
        img.style.transition = 'opacity 220ms ease';
        img.style.display = 'none';
        // add listeners to observe load errors and success
    img.addEventListener('load', () => { console.log('Radiograph overlay loaded:', img.src); showOverlayDebug('Overlay image loaded'); updateOverlayStatus(); });
    img.addEventListener('error', (e) => { console.error('Radiograph overlay failed to load:', img.src, e); showOverlayDebug('Overlay load failed: ' + img.src.split('/').pop()); _preloadFailures.push(img.src); updateOverlayStatus(); });

        // Preload mapped images so 404s surface early
        try {
            Object.values(LANDMARK_IMAGE_MAP).forEach(p => {
                const pre = new Image();
                pre.src = p;
                pre.onload = () => { console.log('Preloaded', p); updateOverlayStatus(); };
                pre.onerror = (e) => { console.warn('Preload failed', p, e); _preloadFailures.push(p); updateOverlayStatus(); };
            });
            const basePre = new Image(); basePre.src = radiografiaImg.src; basePre.onload = () => {}; basePre.onerror = () => {};
        } catch (e) {}

        frame.appendChild(img);
        radiographOverlayEl = img;
    console.log('Created radiograph overlay element, initial src=', img.src);
    showOverlayDebug('Overlay created');
        updateOverlayStatus();
        return radiographOverlayEl;
    } catch (e) {
        return null;
    }
}

// Try to create the overlay immediately; if DOM isn't ready, create it on DOMContentLoaded
try {
    if (!ensureRadiographOverlay()) {
        document.addEventListener('DOMContentLoaded', () => { try { ensureRadiographOverlay(); } catch (e) {} });
    }
} catch (e) {}
 
const video = document.getElementById("webcam");
 const canvas = document.getElementById("canvas");
 const ctx = canvas.getContext("2d");
 const status = document.getElementById("status");
 // Visible button in webinteraction.html — use let so we can create it dynamically if missing
 let startBtn = document.getElementById("startBtn") || document.getElementById("cameraToggle");
 const faceList = document.getElementById("faceList");
 const handList = document.getElementById("handList");
 const toggleNumbers = document.getElementById("toggleNumbers");

// Safe status helper — will no-op if #status is not present
function setStatus(msg) {
    try {
        if (status) status.textContent = msg || '';
    } catch (e) {
        // ignore
    }
}

 let detector = null;
 let isDetecting = false;
 let showNumbers = true;  // Toggle for showing numbers
let handModel = null;
let hands = [];
let handDetector = null;
// Separate mirroring flags: face tracking should not be mirrored, but keep hand mirroring
const MIRROR_FACE = false;
const MIRROR_HAND = true;

// MediaPipe handedness is from camera perspective; swap for selfie-view UI labels.
function normalizeHandednessLabel(label) {
    if (label === 'Left') return 'Right';
    if (label === 'Right') return 'Left';
    return label || 'Unknown';
}

function mirrorPointX(point) {
    if (!point) return point;
    // Mirror horizontally around the canvas center
    return { ...point, x: (typeof canvas !== 'undefined' && canvas.width) ? (canvas.width - point.x) : point.x };
}

function mirrorKeypointsX(keypoints, mirror = MIRROR_HAND) {
    if (!mirror || !Array.isArray(keypoints)) return keypoints;
    return keypoints.map(mirrorPointX);
}

// Colors for different hands
const handColors = [
    "#FF0000",
    "#00FF00",
    "#0088FF",
    "#FF00FF",
    "#FFFF00",
    "#00FFFF",
];

// Hand landmark connections
const HAND_CONNECTIONS = [
  [0,1],[1,2],[2,3],[3,4],
  [0,5],[5,6],[6,7],[7,8],
  [0,9],[9,10],[10,11],[11,12],
  [0,13],[13,14],[14,15],[15,16],
  [0,17],[17,18],[18,19],[19,20]
];

const LANDMARK_NAMES = [
  "Wrist","Thumb CMC","Thumb MCP","Thumb IP","Thumb Tip",
  "Index MCP","Index PIP","Index DIP","Index Tip",
  "Middle MCP","Middle PIP","Middle DIP","Middle Tip",
  "Ring MCP","Ring PIP","Ring DIP","Ring Tip",
  "Pinky MCP","Pinky PIP","Pinky DIP","Pinky Tip"
];

function getDistance(p1, p2) {
    return Math.hypot(p1.x - p2.x, p1.y - p2.y);
}

function drawHandBoundingBox(keypoints, color, label) {
    const xs = keypoints.map(p => p.x);
    const ys = keypoints.map(p => p.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.strokeRect(minX - 6, minY - 6, maxX - minX + 12, maxY - minY + 12);
    if (label) {
        ctx.fillStyle = color;
        ctx.font = '12px Arial';
        ctx.fillText(label, minX - 4, minY - 10);
    }
}

function drawHandLandmarks(keypoints, color) {
    // draw points
    keypoints.forEach((p, i) => {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        if (showNumbers) {
            ctx.fillStyle = color;
            ctx.font = '10px Arial';
            ctx.fillText(String(i), p.x + 6, p.y - 6);
        }
    });

    // draw connections
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    HAND_CONNECTIONS.forEach(([a, b]) => {
        const p1 = keypoints[a];
        const p2 = keypoints[b];
        if (!p1 || !p2) return;
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();
    });
}

 // Colors for different faces (made neutral to avoid red visual tracking)
 const faceColors = [
     "rgba(228,228,228,0.9)",
     "rgba(200,200,200,0.85)",
     "rgba(180,180,180,0.8)",
     "rgba(160,160,160,0.75)",
     "rgba(140,140,140,0.7)",
     "rgba(120,120,120,0.65)"
 ];

 // Facial feature regions (indices for specific landmarks)
 const FACE_REGIONS = {
     leftEye: [33, 133, 160, 159, 158, 157, 173, 155, 154, 153, 145, 144, 163, 7],
     rightEye: [362, 263, 387, 386, 385, 384, 398, 382, 381, 380, 374, 373, 390, 249],
     lips: [61, 185, 40, 39, 37, 0, 267, 269, 270, 409, 291, 375, 321, 405, 314, 17, 84, 181, 91, 146],
     leftEyebrow: [70, 63, 105, 66, 107, 55, 65],
     rightEyebrow: [336, 296, 334, 293, 300, 285, 295],
     nose: [1, 2, 98, 327, 168]
 };

 // Load the Face Landmarks Detection model
 async function loadModel() {
     try {
         setStatus("Loading face detection model...");
         
         await tf.setBackend('webgl');
         await tf.ready();
         
         detector = await faceLandmarksDetection.createDetector(
             faceLandmarksDetection.SupportedModels.MediaPipeFaceMesh,
             {
                 runtime: 'mediapipe',
                 solutionPath: 'https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh',
                 refineLandmarks: true,
                 maxFaces: 5
             }
         );
         
         setStatus("Model loaded! Click 'Start Camera'");
         // If the visible button is missing, create it under #cameraWrapper or body
         try {
             if (!startBtn) {
                 const container = document.getElementById('cameraWrapper') || document.body;
                 const btn = document.createElement('button');
                 btn.id = 'cameraToggle';
                 btn.className = 'camera-btn link-style';
                 btn.textContent = 'Enable Camera';
                 btn.disabled = false;
                 container.appendChild(btn);
                 startBtn = btn;
                 // attach handler immediately
                 startBtn.addEventListener('click', startCamera);
             } else {
                 startBtn.disabled = false;
             }
         } catch (e) {}
         console.log("Face detection model loaded successfully!");
        // try to load hand model (optional)
        try {
            handModel = await handpose.load();
            console.log('Handpose model loaded');
        } catch (e) {
            console.warn('Handpose model not available:', e && e.message);
            handModel = null;
        }
        // then try the newer tfjs hand-pose-detection MediaPipe Hands detector (preferred)
        try {
            if (window.handPoseDetection && handPoseDetection.createDetector) {
                handDetector = await handPoseDetection.createDetector(
                    handPoseDetection.SupportedModels.MediaPipeHands,
                    {
                        runtime: 'mediapipe',
                        solutionPath: 'https://cdn.jsdelivr.net/npm/@mediapipe/hands',
                        modelType: 'full',
                        maxHands: 4
                    }
                );
                console.log('MediaPipe Hands detector loaded');
            }
        } catch (e) {
            console.warn('Hand detector not available:', e && e.message);
            handDetector = null;
        }
     } catch (error) {
         setStatus("Error loading model: " + (error && error.message));
         console.error(error);
     }
 }

 // Start the webcam
 async function startCamera() {
     try {
         const stream = await navigator.mediaDevices.getUserMedia({
             video: { 
                 width: { ideal: 960 },
                 height: { ideal: 720 },
                 facingMode: "user"
             },
         });
         video.srcObject = stream;

         video.addEventListener("loadeddata", () => {
             // Force canvas to match EXACT video dimensions
             const videoWidth = video.videoWidth;
             const videoHeight = video.videoHeight;
             
             canvas.width = videoWidth;
             canvas.height = videoHeight;
             
             // Also update the display size
             video.width = videoWidth;
             video.height = videoHeight;
             
             console.log(`Video dimensions: ${videoWidth}x${videoHeight}`);
            // Optionally hide the visible webcam stream while keeping the video element
            // active so detections still receive frames. This makes only the overlay images
            // visible to the user when interactions are active.
            try {
                if (typeof HIDE_VIDEO_STREAM !== 'undefined' && HIDE_VIDEO_STREAM) {
                    video.style.opacity = '0';
                    video.style.pointerEvents = 'none';
                    video.style.visibility = 'hidden';
                    // hide the drawing canvas as well so only the radiograph overlay is visible
                    if (canvas) canvas.style.display = 'none';
                }
            } catch (e) {
                console.warn('Could not hide video stream:', e && e.message);
            }
            // Ensure the displayed video and overlay canvas are not visually mirrored.
            try {
                // Explicitly clear any CSS transform that may have been applied inline or by other scripts
                video.style.transform = 'none';
                video.style.webkitTransform = 'none';
                canvas.style.transform = 'none';
                canvas.style.webkitTransform = 'none';
                // Log computed transforms for debugging if needed
                console.debug('Computed video transform:', getComputedStyle(video).transform);
                console.debug('Computed canvas transform:', getComputedStyle(canvas).transform);
                // Reset canvas 2D transform matrix to identity
                ctx.setTransform(1, 0, 0, 1, 0, 0);
            } catch (e) {
                console.warn('Could not reset transforms:', e && e.message);
            }
             
             setStatus("Detecting faces...");
             if (startBtn) startBtn.textContent = "Camera Running";
             if (startBtn) startBtn.disabled = true;
             detectFaces();
         });
     } catch (error) {
         setStatus("Error accessing camera: " + (error && error.message));
         console.error(error);
     }
 }

 // Draw a specific facial region
 function drawRegion(keypoints, indices, color) {
     if (indices.length < 2) return;

     ctx.beginPath();
     ctx.strokeStyle = color;
     ctx.lineWidth = 2;

     for (let i = 0; i < indices.length; i++) {
         const point = keypoints[indices[i]];
         if (i === 0) {
             ctx.moveTo(point.x, point.y);
         } else {
             ctx.lineTo(point.x, point.y);
         }
     }
     ctx.closePath();
     ctx.stroke();
 }

 // Draw bounding box around face
 function drawBoundingBox(keypoints, color) {
     const xs = keypoints.map(p => p.x);
     const ys = keypoints.map(p => p.y);
     
     const minX = Math.min(...xs);
     const maxX = Math.max(...xs);
     const minY = Math.min(...ys);
     const maxY = Math.max(...ys);
     
     ctx.strokeStyle = color;
     ctx.lineWidth = 3;
     ctx.strokeRect(minX, minY, maxX - minX, maxY - minY);
 }

 // Main face detection loop
 async function detectFaces() {
     if (!detector) return;

     isDetecting = true;

     // Detect faces
    const rawFaces = await detector.estimateFaces(video, {
         flipHorizontal: false
     });
    const faces = rawFaces.map(face => ({ ...face, keypoints: mirrorKeypointsX(face.keypoints, MIRROR_FACE) }));
    // Precompute smiling state so cheek logic can decide whether to restore base image
    const smilingFace = faces && faces.some(f => isSmiling(f.keypoints));

    // detect hands: prefer the newer handDetector (MediaPipe Hands) if available
    hands = [];
    if (handDetector) {
        try {
            const raw = await handDetector.estimateHands(video, { flipHorizontal: false });
            // normalize to { keypoints: [{x,y,z}], handedness, score }
            hands = raw.map(h => {
                const kps = mirrorKeypointsX((h.keypoints || h.landmarks || []).map(p => ({ x: p.x, y: p.y, z: p.z || 0 })), MIRROR_HAND);
                const rawLabel = (h.handedness && h.handedness[0] && h.handedness[0].label) || h.handedness || (h.handednessLabel || 'Unknown');
                return { keypoints: kps, handedness: normalizeHandednessLabel(rawLabel), score: h.score || (h.handInViewConfidence || 1) };
            });
        } catch (e) {
            console.warn('handDetector error', e && e.message);
            hands = [];
        }
    } else if (handModel) {
        try {
            const raw = await handModel.estimateHands(video, true);
            // handpose returns objects with landmarks: array of [x,y,z] and annotations
            hands = raw.map(h => {
                const kps = mirrorKeypointsX((h.landmarks || []).map(p => ({ x: p[0], y: p[1], z: p[2] || 0 })), MIRROR_HAND);
                return { keypoints: kps, annotations: h.annotations || {}, handedness: normalizeHandednessLabel(h.handedness || 'Unknown'), score: h.score || 1 };
            });
        } catch (e) {
            hands = [];
        }
    }

    // Show quick debug counts for faces and hands
    try {
        showOverlayDebug(`Faces: ${faces.length}  Hands: ${hands.length}`);
        console.debug('Detection counts', { faces: faces.length, hands: hands.length });
    } catch (e) {}

    // Reset any canvas transform and clear canvas to avoid mirrored drawings
    try {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
    } catch (e) {
        // ignore if context doesn't support setTransform for some reason
    }
    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // (overlay handling moved later so cheek-trigger and hand logic can decide the source)

      // Draw each face with different color
     let infoHTML = "";

     if (faces.length > 0) {
         infoHTML = `<div style="margin-bottom: 10px;"><strong>Tracking ${faces.length} face(s)</strong></div>`;

         faces.forEach((face, index) => {
             const color = faceColors[index % faceColors.length];

            // Draw face landmarks and bounding box so user sees tracking
            try {
                drawFaceLandmarks(face.keypoints, color);
                drawBoundingBox(face.keypoints, color);
            } catch (e) {
                // ignore drawing errors
            }

            // Draw a persistent cheek hotspot to guide the user where to point
            try {
                const faceXs = face.keypoints.map(p => p.x);
                const faceYs = face.keypoints.map(p => p.y);
                const faceMinX = Math.min(...faceXs);
                const faceMaxX = Math.max(...faceXs);
                const faceMinY = Math.min(...faceYs);
                const faceMaxY = Math.max(...faceYs);

                // estimate left cheek position (using mesh index 234 when available)
                const leftCheek = face.keypoints[234] || face.keypoints[61];
                const leftCheekX = leftCheek ? leftCheek.x : (faceMinX + (faceMaxX - faceMinX) * 0.25);
                const leftCheekY = (face.keypoints[10] && face.keypoints[10].y) ? face.keypoints[10].y : (faceMinY + (faceMaxY - faceMinY) * 0.44);
                const guideW = Math.max(28, (faceMaxX - faceMinX) * 0.22);
                const guideH = Math.max(24, (faceMaxY - faceMinY) * 0.18);

                ctx.save();
                ctx.globalAlpha = 0.12;
                ctx.fillStyle = 'rgba(40,160,220,0.95)';
                ctx.beginPath();
                ctx.ellipse(leftCheekX, leftCheekY, guideW/2, guideH/2, 0, 0, Math.PI*2);
                ctx.fill();
                ctx.restore();

                // label
                ctx.fillStyle = 'rgba(220,220,220,0.9)';
                ctx.font = '14px monospace';
                ctx.fillText('Point here', leftCheekX - guideW/2 + 6, leftCheekY - guideH/2 - 8);
            } catch (e) {}

            // MOUTH DETECTION: check if mouth is open, compute overlay and map finger interactions
            const mouthOpen = isMouthOpen(face.keypoints);
            if (mouthOpen) {
                // draw the xray overlay aligned to mouth
                const mouthOverlay = drawXrayMouth(face.keypoints);

                // if there are hands detected, handle finger -> tooth interaction
                if (hands && hands.length > 0) {
                    // map first hand's index finger tip
                    const hand = hands[0];
                    const indexTip = hand.annotations && hand.annotations.indexFinger ? hand.annotations.indexFinger[3] : null;
                    if (indexTip) {
                    const fingerPoint = { x: indexTip.x, y: indexTip.y };
                    if (isFingerInsideMouth(fingerPoint, face.keypoints)) {
                            const mapped = mapFingerToOverlay(fingerPoint, face.keypoints, mouthOverlay);
                            drawFillingOnPoint(mapped, face.keypoints);
                        }
                    }
                }
            }

             // Add info for this face
             const confidence = face.box ? 
                 `${(face.box.probability * 100).toFixed(1)}%` : 
                 "High confidence";

             infoHTML += `<div class="face-info" style="border-color: ${color};">`;
             infoHTML += `<strong>Face ${index + 1}</strong><br>`;
             infoHTML += `<div style="margin: 5px 0;">`;
             infoHTML += `<span class="feature-info">✓ Left Eye</span>`;
             infoHTML += `<span class="feature-info">✓ Right Eye</span>`;
             infoHTML += `<span class="feature-info">✓ Nose</span>`;
             infoHTML += `<span class="feature-info">✓ Mouth</span>`;
             infoHTML += `<span class="feature-info">✓ Eyebrows</span>`;
             infoHTML += `<span class="feature-info">✓ Face Contour</span>`;
             infoHTML += `</div>`;
             infoHTML += `</div>`;
         });
     } else {
         infoHTML = "<div>No faces detected - look at the camera!</div>";
     }

    if (faceList) {
        faceList.innerHTML = infoHTML;
    }

    // Render hand info list
    let handHTML = '';
    if (hands && hands.length > 0) {
        handHTML = `<div style="margin-bottom:10px"><strong>Tracking ${hands.length} hand(s)</strong></div>`;
        hands.forEach((h, i) => {
            const color = handColors[i % handColors.length];
            const label = h.handedness || 'Hand';
            handHTML += `<div class="hand-info" style="border-left:4px solid ${color}; padding:6px; margin-bottom:6px;">`;
            handHTML += `<strong>${label}</strong> — ${h.keypoints ? h.keypoints.length : 0} pts`;
            handHTML += `<div style="font-size:12px; margin-top:6px;">Detection: ${h.score ? (h.score*100).toFixed(1)+'%' : 'n/a'}</div>`;
            if (showNumbers && h.keypoints) {
                const keys = [0,4,8,12,16,20].map(idx => `${idx}:${LANDMARK_NAMES[idx] || idx}`).join(' &nbsp; ');
                handHTML += `<div style="font-size:11px; margin-top:6px;">${keys}</div>`;
            }
            handHTML += `</div>`;
        });
    } else {
        handHTML = '<div>No hands detected - show your hands to the camera!</div>';
    }
    if (handList) handList.innerHTML = handHTML;

    // Draw hands on canvas (over the faces overlays)
    if (hands && hands.length > 0) {
        hands.forEach((h, i) => {
            const color = handColors[i % handColors.length];
            if (h.keypoints && h.keypoints.length > 0) {
                drawHandBoundingBox(h.keypoints, color, h.handedness || 'Hand');
                drawHandLandmarks(h.keypoints, color);

                // if hand is near mouth of any detected face, we can map fingertip to overlay
                // try index fingertip (8)
                const tip = h.keypoints[8];
                if (tip && faces && faces.length > 0) {
                    faces.forEach(face => {
                        if (isMouthOpen(face.keypoints) && isFingerInsideMouth(tip, face.keypoints)) {
                            const mouthOverlay = drawXrayMouth(face.keypoints);
                            const mapped = mapFingerToOverlay(tip, face.keypoints, mouthOverlay);
                            drawFillingOnPoint(mapped, face.keypoints);
                        }
                    });
                }
            }
        });
    }

    // Proximity-to-landmark detection: when the index fingertip points near a mapped face landmark,
    // show the corresponding radiograph. This replaces the previous cheek-box approach.
    try {
        const overlay = ensureRadiographOverlay();
        if (!(hands && hands.length > 0 && faces && faces.length > 0 && overlay)) {
            // nothing to do
        } else {
            // simple: use first hand and first face for now
            const h = hands[0];
            const f = faces[0];
            const tip = h.keypoints && h.keypoints[8];
            if (tip && f && f.keypoints) {
                const faceXs = f.keypoints.map(p => p.x);
                const faceYs = f.keypoints.map(p => p.y);
                const faceW = Math.max(...faceXs) - Math.min(...faceXs) || 1;
                const faceH = Math.max(...faceYs) - Math.min(...faceYs) || 1;
                // threshold relative to face size (tuned via PROXIMITY_MULT)
                const threshold = Math.max(faceW, faceH) * PROXIMITY_MULT;

                // compute closest mapped landmark
                let closest = null;
                let closestDist = Infinity;

                // draw and annotate mapped landmarks for debugging
                ctx.save();
                Object.keys(LANDMARK_IMAGE_MAP).forEach(k => {
                    const idx = Number(k);
                    const kp = f.keypoints[idx];
                    if (!kp) return;
                    const d = Math.hypot(tip.x - kp.x, tip.y - kp.y);
                    // mark mapped point
                    ctx.beginPath();
                    ctx.arc(kp.x, kp.y, 6, 0, Math.PI * 2);
                    ctx.fillStyle = d <= threshold ? 'rgba(80,220,140,0.95)' : 'rgba(200,200,200,0.18)';
                    ctx.fill();
                    ctx.fillStyle = 'rgba(220,220,220,0.95)';
                    ctx.font = '11px monospace';
                    ctx.fillText(String(idx), kp.x + 8, kp.y + 4);
                    ctx.fillText(Math.round(d), kp.x + 8, kp.y + 18);

                    if (d < closestDist) {
                        closestDist = d;
                        closest = { idx, kp, d };
                    }
                });
                ctx.restore();

                if (closest) {
                    // highlight closest
                    ctx.save();
                    ctx.beginPath();
                    ctx.arc(closest.kp.x, closest.kp.y, 12, 0, Math.PI * 2);
                    ctx.strokeStyle = 'rgba(255,220,120,0.95)';
                    ctx.lineWidth = 2;
                    ctx.stroke();
                    ctx.restore();
                }

                if (closest && closestDist <= threshold) {
                    // debounce: require the fingertip to be within threshold for several frames
                    _consecutiveHits[closest.idx] = (_consecutiveHits[closest.idx] || 0) + 1;
                    // reset other counters
                    Object.keys(_consecutiveHits).forEach(k => { if (Number(k) !== Number(closest.idx)) _consecutiveHits[k] = 0; });
                    if (_consecutiveHits[closest.idx] >= PROXIMITY_REQUIRED_FRAMES) {
                        const img = LANDMARK_IMAGE_MAP[closest.idx];
                        console.log('Finger near landmark (stable)', closest.idx, 'dist', Math.round(closestDist), '→', img);
                        showOverlayDebug(`Landmark ${closest.idx} → ${img.split('/').pop()}`);
                        // load image first to ensure it's available before showing overlay
                        try {
                            const loadImg = new Image();
                            // mark the overlay as pending/active immediately to avoid race with smile logic
                            try { overlay.dataset.landmarkActive = String(closest.idx); } catch (e) {}
                            loadImg.onload = () => {
                                try {
                                    // set the src after marking active so smile logic won't hide it
                                    overlay.src = img;
                                    overlay.style.display = 'block';
                                    void overlay.offsetWidth;
                                    overlay.style.opacity = '0.98';
                                    console.log('Overlay image set to', img, ' (landmark', closest.idx, ')');
                                    showOverlayDebug('Overlay → ' + img.split('/').pop());
                                    // detection-based overlays are transient (do not mark persistent)
                                    try { delete overlay.dataset.persistent; } catch (ee) {}
                                    updateOverlayStatus();
                                } catch (e) { console.warn('Failed to set overlay image after load', e && e.message); }
                            };
                            loadImg.onerror = (e) => {
                                console.error('Failed to load landmark image', img, e);
                                showOverlayDebug('Failed to load: ' + img.split('/').pop());
                                try { _preloadFailures.push(img); } catch (ee) {}
                                try { delete overlay.dataset.landmarkActive; } catch (ee) {}
                                updateOverlayStatus();
                            };
                            loadImg.src = img;
                        } catch (e) { console.warn('Error creating loader image', e && e.message); }
                    } else {
                        showOverlayDebug(`Approaching ${closest.idx} (${_consecutiveHits[closest.idx]}/${PROXIMITY_REQUIRED_FRAMES})`);
                    }
                } else {
                    // reset all consecutive counters when no close landmark
                    Object.keys(_consecutiveHits).forEach(k => { _consecutiveHits[k] = 0; });
                    // If there is an active landmark overlay, keep it visible even when the finger
                    // is no longer on a mapped point. This lets the user examine the radiograph
                    // until they point to another landmark or the overlay is changed manually.
                    try {
                        const active = overlay && overlay.dataset && overlay.dataset.landmarkActive;
                        if (active) {
                            // If the active overlay was set by detection (not persistent), hide it now
                            const isPersistent = !!(overlay.dataset && overlay.dataset.persistent);
                            if (!isPersistent) {
                                try { delete overlay.dataset.landmarkActive; } catch (e) {}
                                overlay.style.opacity = '0';
                                setTimeout(() => { if (overlay && overlay.style.opacity === '0') overlay.style.display = 'none'; }, 220);
                                showOverlayDebug(`Cleared transient overlay ${active} (finger left)`);
                                updateOverlayStatus();
                            } else {
                                showOverlayDebug(`Holding persistent overlay for landmark ${active} (finger left)`);
                            }
                        } else if (closest) {
                            showOverlayDebug(`Closest ${closest.idx} d=${Math.round(closestDist)} (thr ${Math.round(threshold)})`);
                        } else {
                            showOverlayDebug('No close landmark');
                        }
                    } catch (e) {}
                }
            }
        }
    } catch (e) {
        console.warn('Landmark proximity detection failed', e && e.message);
    }

    // Show base radiograph when smiling (if no other specific overlay shown)
    try {
        const overlay = ensureRadiographOverlay();
        const smilingFace = faces && faces.some(f => isSmiling(f.keypoints));
        if (overlay && radiografiaLoaded) {
            // Respect both landmarkActive and persistent flags: if an overlay was set by
            // the user or test and marked persistent, do not auto-hide/override it.
            const isLandmarkActive = !!(overlay.dataset && overlay.dataset.landmarkActive);
            const isPersistent = !!(overlay.dataset && overlay.dataset.persistent);
            if (smilingFace && !isLandmarkActive && !isPersistent) {
                console.log('Smiling detected — showing base radiograph', radiografiaImg.src);
                showOverlayDebug('Smile → base radiograph');
                overlay.src = radiografiaImg.src;
                overlay.style.display = 'block';
                void overlay.offsetWidth;
                overlay.style.opacity = '0.98';
                try { delete overlay.dataset.landmarkActive; } catch (e) {}
                try { delete overlay.dataset.persistent; } catch (e) {}
            } else if (!smilingFace) {
                // Only hide the overlay automatically if it's currently the base image and
                // there is no persistent or active landmark overlay set.
                const isShowingBase = overlay.src && overlay.src.indexOf('radiografiabase.jpg') !== -1;
                if (isShowingBase && !isPersistent && !isLandmarkActive) {
                    console.log('No smile — hiding overlay (if showing base)');
                    showOverlayDebug('No smile → hide overlay');
                    overlay.style.opacity = '0';
                    setTimeout(() => { if (overlay && overlay.style.opacity === '0') overlay.style.display = 'none'; }, 240);
                }
            }
        }
    } catch (e) {
        // ignore
    }

     // Continue detection loop
     if (isDetecting) {
         requestAnimationFrame(detectFaces);
     }
 }

 // Event listeners
if (startBtn) startBtn.addEventListener("click", startCamera);

if (toggleNumbers) {
    toggleNumbers.addEventListener("click", () => {
        showNumbers = !showNumbers;
        toggleNumbers.textContent = showNumbers ? "Hide Numbers" : "Show Numbers";
    });
}

 // Load model when page loads
 loadModel();

// Debug: allow clicking the canvas to force Asx1 overlay (useful when hand model isn't detecting)
try {
    const overlay = ensureRadiographOverlay();
    if (canvas) {
        canvas.addEventListener('click', (ev) => {
            try {
                if (overlay) {
                    console.log('Canvas click — forcing Asx1');
                    showOverlayDebug('Canvas → Asx1');
                    overlay.src = 'interazione/radiografia_Asx1.jpg';
                    try { overlay.dataset.landmarkActive = String(352); } catch (e) {}
                    try { overlay.dataset.persistent = '1'; } catch (e) {}
                    overlay.style.display = 'block';
                    void overlay.offsetWidth;
                    overlay.style.opacity = '0.98';
                }
            } catch (e) { console.warn('Canvas click force failed', e && e.message); }
        });
    }
} catch (e) {}

 function drawXrayMouth(face) {
    const left = face[61];
    const right = face[291];
    const top = face[0];
    const bottom = face[17];

    // keypoints are in pixel coordinates; compute mouth box in pixels
    const mouthX = left.x;
    const mouthY = top.y;

    const mouthW = (right.x - left.x) * 2.4;
    const mouthH = (bottom.y - top.y) * 1.45;

    const drawX = mouthX - mouthW * 0.3;
    const drawY = mouthY - mouthH * 0.08;

    // Asset overlay removed: do not draw the x-ray image.
    // If desired, a simple non-asset visual could be drawn here (e.g., translucent rect),
    // but per request we remove asset-based effects.

    return { x: drawX, y: drawY, w: mouthW, h: mouthH };
}

// ---------------------- Helper functions for interactions ------------------

function isMouthOpen(keypoints) {
    // use landmarks 13 (top lip) and 14 (bottom lip) vertical distance
    const top = keypoints[13];
    const bottom = keypoints[14];
    if (!top || !bottom) return false;
    const dy = Math.abs(bottom.y - top.y);
    // threshold relative to face height (use vertical span of keypoints)
    const ys = keypoints.map(p => p.y);
    const faceH = Math.max(...ys) - Math.min(...ys) || 1;
    const rel = dy / faceH;
    // tuned threshold: mouth open when vertical gap > ~0.035 of face height
    return rel > 0.035;
}

// Simple smile detector: compares mouth corner distance to face width
function isSmiling(keypoints) {
    if (!keypoints) return false;
    const left = keypoints[61];
    const right = keypoints[291];
    if (!left || !right) return false;
    const xs = keypoints.map(p => p.x);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const faceW = Math.max(1, maxX - minX);
    const mouthW = Math.abs(right.x - left.x);
    const ratio = mouthW / faceW;
    // tuned threshold: smile when mouth width > ~0.48 of face width
    return ratio > 0.48;
}

function isFingerInsideMouth(fingerPoint, keypoints) {
    // fingerPoint in pixel coords {x,y}
    const left = keypoints[61];
    const right = keypoints[291];
    const top = keypoints[13];
    const bottom = keypoints[14];
    if (!left || !right || !top || !bottom) return false;
    const minX = left.x;
    const maxX = right.x;
    const minY = top.y;
    const maxY = bottom.y;
    return fingerPoint.x >= minX && fingerPoint.x <= maxX && fingerPoint.y >= minY && fingerPoint.y <= maxY;
}

function mapFingerToOverlay(fingerPoint, keypoints, overlayBox) {
    // overlayBox returned by drawXrayMouth: { x, y, w, h }
    const left = keypoints[61];
    const right = keypoints[291];
    const top = keypoints[13];
    const bottom = keypoints[14];
    const minX = left.x;
    const maxX = right.x;
    const minY = top.y;
    const maxY = bottom.y;
    const relativeX = (fingerPoint.x - minX) / (maxX - minX);
    const relativeY = (fingerPoint.y - minY) / (maxY - minY);
    const overlayX = overlayBox.x + relativeX * overlayBox.w;
    const overlayY = overlayBox.y + relativeY * overlayBox.h;
    return { x: overlayX, y: overlayY, relX: relativeX, relY: relativeY };
}


// Draw all facial landmarks (points + optional numbers) and small circles
function drawFaceLandmarks(keypoints, color) {
    // keypoints are already in pixel coordinates (x,y). Draw points and optional indices
    keypoints.forEach((point, index) => {
        ctx.beginPath();
        ctx.arc(point.x, point.y, 1.5, 0, 2 * Math.PI);
        ctx.fillStyle = color;
        ctx.fill();

        if (showNumbers) {
            ctx.fillStyle = color;
            ctx.font = '8px Arial';
            ctx.fillText(String(index), point.x + 3, point.y - 3);
        }
    });

    // draw regions for clarity
    drawRegion(keypoints, FACE_REGIONS.leftEye, color);
    drawRegion(keypoints, FACE_REGIONS.rightEye, color);
    drawRegion(keypoints, FACE_REGIONS.lips, color);
    drawRegion(keypoints, FACE_REGIONS.leftEyebrow, color);
    drawRegion(keypoints, FACE_REGIONS.rightEyebrow, color);
    drawRegion(keypoints, FACE_REGIONS.nose, color);
}

function drawFillingOnPoint(mappedPoint, face) {
    // mappedPoint: { x, y, relX, relY } in overlay pixel coords
    if (!mappedPoint) return;

    const mouthBox = drawXrayMouth(face);
    const size = mouthBox.w * 0.12;

    // visual style: jitter + slight alpha flicker
    const jitterX = (Math.random() - 0.5) * 4; // ±2px
    const jitterY = (Math.random() - 0.5) * 4;
    const flicker = 0.55 + Math.sin(Date.now() / 120) * 0.05; // oscillate around 0.55

    const drawX = mappedPoint.x + jitterX;
    const drawY = mappedPoint.y + jitterY;

    // Asset effect removed: draw a simple subtle marker (non-asset) instead of image
    ctx.save();
    ctx.globalAlpha = Math.max(0.4, Math.min(0.65, flicker));
    ctx.fillStyle = 'rgba(255,200,100,0.85)';
    ctx.beginPath();
    ctx.arc(drawX, drawY, Math.max(4, size * 0.08), 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    status.textContent = "Restoration (marker)";
}
