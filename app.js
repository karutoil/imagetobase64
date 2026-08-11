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

  /** @type {{ raw: string, dataUri: string, name: string, type: string, size: number } | null} */
  let current = null;
  let format = "raw";
  let toastTimer = 0;

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

  function clearResult() {
    current = null;
    result.classList.add("hidden");
    preview.removeAttribute("src");
    meta.textContent = "";
    output.value = "";
    btnCopy.disabled = true;
    btnCopyDataUri.disabled = true;
    btnDownload.disabled = true;
    fileInput.value = "";
  }

  /**
   * @param {File} file
   */
  function processFile(file) {
    if (!file || !file.type.startsWith("image/")) {
      showToast("Please provide an image file.", "error");
      return;
    }

    const reader = new FileReader();
    reader.onerror = () => showToast("Could not read that file.", "error");
    reader.onload = () => {
      const dataUri = String(reader.result);
      const comma = dataUri.indexOf(",");
      const raw = comma >= 0 ? dataUri.slice(comma + 1) : dataUri;

      current = {
        raw,
        dataUri,
        name: file.name || "pasted-image",
        type: file.type,
        size: file.size,
      };

      preview.src = dataUri;
      meta.innerHTML = [
        `<div><strong>${escapeHtml(current.name)}</strong></div>`,
        `<div>${escapeHtml(current.type)} · ${formatBytes(current.size)}</div>`,
        `<div>${raw.length.toLocaleString()} base64 chars</div>`,
      ].join("");

      output.value = format === "raw" ? raw : dataUri;
      btnCopy.disabled = false;
      btnCopyDataUri.disabled = false;
      btnDownload.disabled = false;
      result.classList.remove("hidden");
      showToast("Converted locally");
    };
    reader.readAsDataURL(file);
  }

  function escapeHtml(str) {
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  /**
   * Extract an image File from a paste or drop DataTransfer.
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
      // Fallback for older browsers / insecure contexts
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

  // Paste anywhere on the page
  document.addEventListener("paste", (e) => {
    const file = imageFromDataTransfer(e.clipboardData);
    if (file) {
      e.preventDefault();
      processFile(file);
    }
  });

  // Dropzone interactions
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

  // Also allow dropping on the whole window
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
    const base = current.name.replace(/\.[^.]+$/, "") || "image";
    a.href = url;
    a.download = `${base}-base64.txt`;
    a.click();
    URL.revokeObjectURL(url);
  });

  btnClear.addEventListener("click", clearResult);
})();
