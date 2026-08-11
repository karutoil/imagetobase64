(() => {
  "use strict";

  const dropzone = document.getElementById("dropzone");
  const fileInput = document.getElementById("file-input");
  const result = document.getElementById("result");
  const preview = document.getElementById("preview");
  const meta = document.getElementById("meta");
  const output = document.getElementById("output");
  const btnCopy = document.getElementById("btn-copy");
  const btnCopyDataUri = document.getElementById("btn-copy-datauri");
  const btnDownload = document.getElementById("btn-download");
  const btnClear = document.getElementById("btn-clear");
  const toastEl = document.getElementById("toast");
  const fmtRaw = document.getElementById("fmt-raw");
  const fmtDataUri = document.getElementById("fmt-datauri");
  const qualitySlider = document.getElementById("quality");
  const qualityValue = document.getElementById("quality-value");
  const qualityHint = document.getElementById("quality-hint");
  const statsEl = document.getElementById("stats");

  /** Balanced default: good visual quality with strong size wins for Base64 embeds. */
  const DEFAULT_QUALITY = 0.82;
  const MAX_DIMENSION = 4096;

  /** @type {{
   *   sourceName: string,
   *   sourceType: string,
   *   sourceSize: number,
   *   width: number,
   *   height: number,
   *   quality: number,
   *   raw: string,
   *   dataUri: string,
   *   outputBytes: number,
   *   canvas: HTMLCanvasElement,
   *   encodeMime: string
   * } | null} */
  let current = null;
  let format = "raw";
  let toastTimer = 0;
  let encodeGen = 0;
  let webpSupported = null;

  function formatBytes(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  }

  function showToast(message, kind = "success") {
    toastEl.hidden = false;
    toastEl.textContent = message;
    toastEl.className = `toast show ${kind}`;
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => {
      toastEl.classList.remove("show");
    }, 2200);
  }

  function setFormat(next) {
    format = next;
    fmtRaw.classList.toggle("active", next === "raw");
    fmtDataUri.classList.toggle("active", next === "datauri");
    if (current) {
      output.value = next === "raw" ? current.raw : current.dataUri;
    }
  }

  function qualityLabel(q) {
    if (q >= 0.92) return "Maximum detail · larger Base64";
    if (q >= 0.82) return "Balanced · recommended for embeds";
    if (q >= 0.7) return "Compact · still looks sharp";
    if (q >= 0.55) return "Small · fine for thumbnails";
    return "Tiny · visible compression";
  }

  function updateQualityUi(q) {
    const pct = Math.round(q * 100);
    qualityValue.textContent = `${pct}%`;
    qualityHint.textContent = qualityLabel(q);
  }

  function clearResult() {
    encodeGen += 1;
    current = null;
    result.classList.add("hidden");
    preview.removeAttribute("src");
    meta.textContent = "";
    statsEl.innerHTML = "";
    output.value = "";
    btnCopy.disabled = true;
    btnCopyDataUri.disabled = true;
    btnDownload.disabled = true;
    fileInput.value = "";
    setQuality(DEFAULT_QUALITY, { reencodeNow: false });
  }

  function detectWebpSupport() {
    if (webpSupported !== null) return Promise.resolve(webpSupported);
    return new Promise((resolve) => {
      const c = document.createElement("canvas");
      c.width = 1;
      c.height = 1;
      c.toBlob(
        (blob) => {
          webpSupported = !!(blob && blob.type === "image/webp");
          resolve(webpSupported);
        },
        "image/webp",
        0.8
      );
    });
  }

  /**
   * @param {HTMLImageElement | ImageBitmap} image
   * @param {number} maxDim
   */
  function fitSize(image, maxDim) {
    const w = "naturalWidth" in image ? image.naturalWidth : image.width;
    const h = "naturalHeight" in image ? image.naturalHeight : image.height;
    if (w <= maxDim && h <= maxDim) return { width: w, height: h, scaled: false };
    const scale = Math.min(maxDim / w, maxDim / h);
    return {
      width: Math.max(1, Math.round(w * scale)),
      height: Math.max(1, Math.round(h * scale)),
      scaled: true,
    };
  }

  /**
   * @param {File} file
   * @returns {Promise<HTMLImageElement>}
   */
  function loadImage(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        resolve(img);
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error("Could not decode image."));
      };
      img.src = url;
    });
  }

  /**
   * @param {HTMLCanvasElement} canvas
   * @param {string} mime
   * @param {number} quality
   * @returns {Promise<Blob>}
   */
  function canvasToBlob(canvas, mime, quality) {
    return new Promise((resolve, reject) => {
      canvas.toBlob(
        (blob) => {
          if (!blob) reject(new Error("Encoding failed."));
          else resolve(blob);
        },
        mime,
        quality
      );
    });
  }

  /**
   * @param {Blob} blob
   * @returns {Promise<string>}
   */
  function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error("Could not read encoded image."));
      reader.readAsDataURL(blob);
    });
  }

  function savingsPercent(original, encoded) {
    if (!original) return 0;
    return Math.round(((original - encoded) / original) * 100);
  }

  function renderStats() {
    if (!current) {
      statsEl.innerHTML = "";
      return;
    }

    const saved = savingsPercent(current.sourceSize, current.outputBytes);
    const ratio = current.outputBytes / Math.max(current.sourceSize, 1);
    const savedLabel =
      saved > 0
        ? `${saved}% smaller than original`
        : saved < 0
          ? `${Math.abs(saved)}% larger than original`
          : "Same size as original";

    const barWidth = Math.min(100, Math.max(4, Math.round(ratio * 100)));

    statsEl.innerHTML = `
      <div class="stat-row">
        <span class="stat-label">Original</span>
        <span class="stat-value">${formatBytes(current.sourceSize)} · ${escapeHtml(current.sourceType || "image")}</span>
      </div>
      <div class="stat-row">
        <span class="stat-label">WebP output</span>
        <span class="stat-value">${formatBytes(current.outputBytes)} · q${Math.round(current.quality * 100)}</span>
      </div>
      <div class="stat-bar" aria-hidden="true">
        <div class="stat-bar-track">
          <div class="stat-bar-fill original" style="width:100%"></div>
          <div class="stat-bar-fill output" style="width:${barWidth}%"></div>
        </div>
      </div>
      <div class="stat-savings ${saved > 0 ? "good" : saved < 0 ? "warn" : ""}">${savedLabel}</div>
      <div class="stat-row subtle">
        <span class="stat-label">Base64 length</span>
        <span class="stat-value">${current.raw.length.toLocaleString()} chars</span>
      </div>
      <div class="stat-row subtle">
        <span class="stat-label">Dimensions</span>
        <span class="stat-value">${current.width}×${current.height}px</span>
      </div>
    `;
  }

  function applyEncodedResult(dataUri, outputBytes, quality, encodeMime) {
    if (!current) return;
    const comma = dataUri.indexOf(",");
    const raw = comma >= 0 ? dataUri.slice(comma + 1) : dataUri;

    current.raw = raw;
    current.dataUri = dataUri;
    current.outputBytes = outputBytes;
    current.quality = quality;
    current.encodeMime = encodeMime;

    preview.src = dataUri;
    const baseName = (current.sourceName || "image").replace(/\.[^.]+$/, "") || "image";
    meta.innerHTML = [
      `<div><strong>${escapeHtml(baseName)}.webp</strong></div>`,
      `<div>image/webp · ${formatBytes(outputBytes)}</div>`,
    ].join("");

    output.value = format === "raw" ? raw : dataUri;
    btnCopy.disabled = false;
    btnCopyDataUri.disabled = false;
    btnDownload.disabled = false;
    renderStats();
  }

  /**
   * Re-encode the current canvas at the chosen quality.
   * @param {number} quality
   * @param {{ silent?: boolean }} [opts]
   */
  /**
   * For JPEG fallback, flatten transparency onto white.
   * @param {HTMLCanvasElement} source
   * @returns {HTMLCanvasElement}
   */
  function flattenForJpeg(source) {
    const flat = document.createElement("canvas");
    flat.width = source.width;
    flat.height = source.height;
    const ctx = flat.getContext("2d");
    if (!ctx) return source;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, flat.width, flat.height);
    ctx.drawImage(source, 0, 0);
    return flat;
  }

  async function reencode(quality, opts = {}) {
    if (!current?.canvas) return;
    const gen = ++encodeGen;
    const useWebp = await detectWebpSupport();
    const mime = useWebp ? "image/webp" : "image/jpeg";
    const encodeCanvas = useWebp ? current.canvas : flattenForJpeg(current.canvas);

    try {
      const blob = await canvasToBlob(encodeCanvas, mime, quality);
      if (gen !== encodeGen) return;
      const dataUri = await blobToDataUrl(blob);
      if (gen !== encodeGen) return;
      applyEncodedResult(dataUri, blob.size, quality, mime);
      if (!opts.silent) {
        const label = useWebp ? "WebP" : "JPEG";
        showToast(`Encoded as ${label} @ ${Math.round(quality * 100)}%`);
      }
    } catch {
      if (gen !== encodeGen) return;
      showToast("Could not encode image.", "error");
    }
  }

  /**
   * @param {File} file
   */
  async function processFile(file) {
    if (!file || !file.type.startsWith("image/")) {
      showToast("Please provide an image file.", "error");
      return;
    }

    const gen = ++encodeGen;
    const quality = Number(qualitySlider.value) || DEFAULT_QUALITY;
    setQuality(quality, { reencodeNow: false });

    try {
      showToast("Encoding locally…");
      const img = await loadImage(file);
      if (gen !== encodeGen) return;

      const size = fitSize(img, MAX_DIMENSION);
      const canvas = document.createElement("canvas");
      canvas.width = size.width;
      canvas.height = size.height;
      const ctx = canvas.getContext("2d", { alpha: true });
      if (!ctx) throw new Error("Canvas unsupported.");

      // Preserve transparency for WebP; white fill for JPEG fallback is handled by encoder.
      ctx.clearRect(0, 0, size.width, size.height);
      ctx.drawImage(img, 0, 0, size.width, size.height);

      current = {
        sourceName: file.name || "pasted-image",
        sourceType: file.type,
        sourceSize: file.size,
        width: size.width,
        height: size.height,
        quality,
        raw: "",
        dataUri: "",
        outputBytes: 0,
        canvas,
        encodeMime: "image/webp",
      };

      result.classList.remove("hidden");
      await reencode(quality, { silent: true });
      if (gen !== encodeGen) return;

      const useWebp = await detectWebpSupport();
      const saved = current ? savingsPercent(current.sourceSize, current.outputBytes) : 0;
      if (!useWebp) {
        showToast("WebP unsupported — used JPEG instead", "error");
      } else if (saved > 0) {
        showToast(`WebP ready · ${saved}% smaller`);
      } else {
        showToast("WebP ready");
      }
    } catch (err) {
      if (gen !== encodeGen) return;
      clearResult();
      showToast(err instanceof Error ? err.message : "Could not process image.", "error");
    }
  }

  function escapeHtml(str) {
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  /**
   * @param {DataTransfer | null} dt
   * @returns {File | null}
   */
  function imageFromDataTransfer(dt) {
    if (!dt) return null;

    const files = dt.files;
    if (files && files.length) {
      for (const file of files) {
        if (file.type.startsWith("image/")) return file;
      }
    }

    const items = dt.items;
    if (items) {
      for (const item of items) {
        if (item.kind === "file" && item.type.startsWith("image/")) {
          return item.getAsFile();
        }
      }
    }

    return null;
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      output.focus();
      output.select();
      try {
        const ok = document.execCommand("copy");
        window.getSelection()?.removeAllRanges();
        return ok;
      } catch {
        return false;
      }
    }
  }

  document.addEventListener("paste", (e) => {
    const file = imageFromDataTransfer(e.clipboardData);
    if (file) {
      e.preventDefault();
      processFile(file);
    }
  });

  dropzone.addEventListener("click", (e) => {
    if (e.target.closest(".file-label")) return;
    fileInput.click();
  });

  dropzone.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      fileInput.click();
    }
  });

  ["dragenter", "dragover"].forEach((evt) => {
    dropzone.addEventListener(evt, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropzone.classList.add("dragover");
    });
  });

  ["dragleave", "drop"].forEach((evt) => {
    dropzone.addEventListener(evt, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropzone.classList.remove("dragover");
    });
  });

  dropzone.addEventListener("drop", (e) => {
    const file = imageFromDataTransfer(e.dataTransfer);
    if (file) processFile(file);
    else showToast("Drop an image file.", "error");
  });

  window.addEventListener("dragover", (e) => e.preventDefault());
  window.addEventListener("drop", (e) => {
    if (e.target.closest("#dropzone")) return;
    e.preventDefault();
    const file = imageFromDataTransfer(e.dataTransfer);
    if (file) processFile(file);
  });

  fileInput.addEventListener("change", () => {
    const file = fileInput.files && fileInput.files[0];
    if (file) processFile(file);
  });

  let qualityDebounce = 0;
  function setQuality(q, { reencodeNow = true } = {}) {
    const clamped = Math.min(0.98, Math.max(0.4, q));
    qualitySlider.value = String(clamped);
    qualitySlider.setAttribute("aria-valuenow", String(Math.round(clamped * 100)));
    updateQualityUi(clamped);
    document.querySelectorAll(".preset").forEach((btn) => {
      const pq = Number(btn.getAttribute("data-quality"));
      btn.classList.toggle("active", Math.abs(pq - clamped) < 0.001);
    });
    if (reencodeNow && current) {
      window.clearTimeout(qualityDebounce);
      qualityDebounce = window.setTimeout(() => {
        reencode(clamped, { silent: true });
      }, 80);
    }
  }

  qualitySlider.addEventListener("input", () => {
    setQuality(Number(qualitySlider.value));
  });

  document.querySelectorAll(".preset").forEach((btn) => {
    btn.addEventListener("click", () => {
      setQuality(Number(btn.getAttribute("data-quality")));
    });
  });

  fmtRaw.addEventListener("click", () => setFormat("raw"));
  fmtDataUri.addEventListener("click", () => setFormat("datauri"));

  btnCopy.addEventListener("click", async () => {
    if (!current) return;
    const ok = await copyText(current.raw);
    showToast(ok ? "Base64 copied" : "Copy failed", ok ? "success" : "error");
  });

  btnCopyDataUri.addEventListener("click", async () => {
    if (!current) return;
    const ok = await copyText(current.dataUri);
    showToast(ok ? "Data URI copied" : "Copy failed", ok ? "success" : "error");
  });

  btnDownload.addEventListener("click", () => {
    if (!current) return;
    const text = format === "raw" ? current.raw : current.dataUri;
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const base = (current.sourceName || "image").replace(/\.[^.]+$/, "") || "image";
    a.href = url;
    a.download = `${base}-webp-base64.txt`;
    a.click();
    URL.revokeObjectURL(url);
  });

  btnClear.addEventListener("click", clearResult);

  setQuality(DEFAULT_QUALITY, { reencodeNow: false });
  detectWebpSupport();
})();
