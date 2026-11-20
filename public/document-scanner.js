// Lazy-loaded, client-side document scanner for committee proof uploads.
// OpenCV is fetched only after Super Admin explicitly starts a scan.
let openCvPromise;

function loadOpenCv() {
  if (openCvPromise) return openCvPromise;
  openCvPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-ffv-opencv]');
    const ready = async () => {
      try {
        const candidate = window.cv;
        const cv = candidate && typeof candidate.then === "function" ? await candidate : candidate;
        if (cv?.Mat && cv?.findContours && cv?.warpPerspective) resolve(cv);
        else reject(new Error("OpenCV লোড হয়েছে, কিন্তু প্রয়োজনীয় image processing module পাওয়া যায়নি।"));
      } catch (error) { reject(error); }
    };
    if (window.cv) { ready(); return; }
    const script = existing || document.createElement("script");
    script.src = "https://docs.opencv.org/4.9.0/opencv.js";
    script.async = true;
    script.dataset.ffvOpencv = "true";
    script.onload = ready;
    script.onerror = () => reject(new Error("Document scanner engine লোড হয়নি। Internet connection পরীক্ষা করে আবার চেষ্টা করুন।"));
    if (!existing) document.head.append(script);
  }).catch(error => { openCvPromise = null; throw error; });
  return openCvPromise;
}

function loadImageBitmap(file) {
  if ("createImageBitmap" in window) return createImageBitmap(file, { imageOrientation: "from-image" });
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => { URL.revokeObjectURL(url); resolve(image); };
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error("ছবিটি খোলা যায়নি।")); };
    image.src = url;
  });
}

function orderCorners(points) {
  const sum = points.map(p => p.x + p.y);
  const diff = points.map(p => p.x - p.y);
  return [
    points[sum.indexOf(Math.min(...sum))],
    points[diff.indexOf(Math.max(...diff))],
    points[sum.indexOf(Math.max(...sum))],
    points[diff.indexOf(Math.min(...diff))]
  ];
}

function distance(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }

async function encodeCanvas(canvas, originalSize, mode) {
  // Prefer lossless PNG for small Bengali/English text; aim for ~1MB per scan.
  if (mode === "bw") {
    const lossless = await new Promise(resolve => canvas.toBlob(resolve, "image/png"));
    if (lossless && lossless.size <= 1 * 1024 * 1024) return lossless;
  }
  // Try to meet the 1MB target first. If that needs too much quality loss,
  // retain the highest-quality WebP instead of blindly choosing the smallest file.
  const targetBytes = Math.min(originalSize, 1 * 1024 * 1024);
  const qualities = [0.94, 0.9, 0.86, 0.82];
  let highQuality = null;
  let smallest = null;
  for (const quality of qualities) {
    const blob = await new Promise(resolve => canvas.toBlob(resolve, "image/webp", quality));
    if (!blob) continue;
    if (!highQuality) highQuality = blob;
    smallest = blob;
    if (blob.size <= targetBytes) return blob;
  }
  const best = highQuality || smallest;
  if (!best) throw new Error("Processed image export করা যায়নি।");
  return best;
}

export async function scanDocumentImage(file, mode = "bw", rotation = 0) {
  if (!file?.type?.startsWith("image/")) throw new Error("শুধু image file scan করা যাবে।");
  const cv = await loadOpenCv();
  const bitmap = await loadImageBitmap(file);
  const sourceWidth = bitmap.width, sourceHeight = bitmap.height;
  const scale = Math.min(1, 2800 / Math.max(sourceWidth, sourceHeight));
  const scaledWidth = Math.max(1, Math.round(sourceWidth * scale));
  const scaledHeight = Math.max(1, Math.round(sourceHeight * scale));
  const angle = ((Number(rotation) || 0) % 360 + 360) % 360;
  const swapDimensions = angle === 90 || angle === 270;
  const inputCanvas = document.createElement("canvas");
  inputCanvas.width = swapDimensions ? scaledHeight : scaledWidth;
  inputCanvas.height = swapDimensions ? scaledWidth : scaledHeight;
  const inputContext = inputCanvas.getContext("2d", { alpha: false });
  inputContext.save();
  if (angle === 90) { inputContext.translate(inputCanvas.width, 0); inputContext.rotate(Math.PI / 2); }
  else if (angle === 180) { inputContext.translate(inputCanvas.width, inputCanvas.height); inputContext.rotate(Math.PI); }
  else if (angle === 270) { inputContext.translate(0, inputCanvas.height); inputContext.rotate(-Math.PI / 2); }
  inputContext.drawImage(bitmap, 0, 0, scaledWidth, scaledHeight);
  inputContext.restore();
  bitmap.close?.();

  let src, gray, blurred, edges, hierarchy, contours, kernel, approx, warped, transform, srcPoints, dstPoints, output;
  let cornersDetected = false;
  try {
    src = cv.imread(inputCanvas);
    gray = new cv.Mat();
    blurred = new cv.Mat();
    edges = new cv.Mat();
    hierarchy = new cv.Mat();
    contours = new cv.MatVector();
    kernel = cv.Mat.ones(5, 5, cv.CV_8U);
    approx = new cv.Mat();
    warped = new cv.Mat();

    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
    cv.GaussianBlur(gray, blurred, new cv.Size(5, 5), 0);
    cv.Canny(blurred, edges, 55, 160);
    cv.dilate(edges, edges, kernel);
    cv.findContours(edges, contours, hierarchy, cv.RETR_LIST, cv.CHAIN_APPROX_SIMPLE);

    let bestArea = 0, bestPoints = null;
    const imageArea = inputCanvas.width * inputCanvas.height;
    for (let i = 0; i < contours.size(); i++) {
      const contour = contours.get(i);
      const perimeter = cv.arcLength(contour, true);
      cv.approxPolyDP(contour, approx, 0.02 * perimeter, true);
      const area = Math.abs(cv.contourArea(approx));
      if (approx.rows === 4 && area > imageArea * 0.12 && area > bestArea && cv.isContourConvex(approx)) {
        const points = [];
        for (let j = 0; j < 4; j++) {
          const p = approx.intPtr(j, 0);
          points.push({ x: p[0], y: p[1] });
        }
        bestArea = area;
        bestPoints = points;
      }
      contour.delete();
    }

    if (bestPoints) {
      const [tl, tr, br, bl] = orderCorners(bestPoints);
      const width = Math.round(Math.max(distance(br, bl), distance(tr, tl)));
      const height = Math.round(Math.max(distance(tr, br), distance(tl, bl)));
      if (width > 80 && height > 80) {
        srcPoints = cv.matFromArray(4, 1, cv.CV_32FC2, [tl.x,tl.y,tr.x,tr.y,br.x,br.y,bl.x,bl.y]);
        dstPoints = cv.matFromArray(4, 1, cv.CV_32FC2, [0,0,width-1,0,width-1,height-1,0,height-1]);
        transform = cv.getPerspectiveTransform(srcPoints, dstPoints);
        cv.warpPerspective(src, warped, transform, new cv.Size(width, height), cv.INTER_CUBIC, cv.BORDER_REPLICATE);
        cornersDetected = true;
      }
    }
    if (!cornersDetected) src.copyTo(warped);

    output = new cv.Mat();
    if (mode === "color") {
      warped.copyTo(output);
    } else {
      const mono = new cv.Mat();
      cv.cvtColor(warped, mono, cv.COLOR_RGBA2GRAY);
      cv.adaptiveThreshold(mono, output, 255, cv.ADAPTIVE_THRESH_GAUSSIAN_C, cv.THRESH_BINARY, 31, 13);
      mono.delete();
    }

    const outputCanvas = document.createElement("canvas");
    cv.imshow(outputCanvas, output);
    const blob = await encodeCanvas(outputCanvas, file.size, mode);
    const base = file.name.replace(/\.[^.]+$/, "").replace(/[^a-zA-Z0-9._-]/g, "_").slice(-70) || "document";
    const extension = blob.type === "image/png" ? "png" : "webp";
    const scannedFile = new File([blob], base + "-scan." + extension, { type: blob.type, lastModified: Date.now() });
    return { file: scannedFile, cornersDetected, originalSize: file.size, outputSize: blob.size, width: outputCanvas.width, height: outputCanvas.height };
  } finally {
    [src,gray,blurred,edges,hierarchy,contours,kernel,approx,warped,transform,srcPoints,dstPoints,output].forEach(item => item?.delete?.());
  }
}
