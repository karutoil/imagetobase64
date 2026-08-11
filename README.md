# Image → WebP Base64

A tiny, fully client-side tool that converts images to **WebP Base64**.

**Nothing is uploaded.** Paste, drop, or pick an image — it is re-encoded to WebP in your browser (Canvas API), then exported as Base64. No backend, no analytics, no storage.

## Features

- Paste an image from the clipboard (`Ctrl`/`Cmd`+`V`)
- Drag and drop an image file
- Choose a file from disk
- Re-encode to **WebP** with a quality slider (default **82%** — balanced size vs fidelity)
- Compact / Balanced / High presets
- Live size comparison: original vs WebP output + Base64 length
- Preview of the encoded result
- Copy raw Base64 or a full `data:image/webp;base64,...` URI
- Download the Base64 as `.txt`
- JPEG fallback if the browser cannot encode WebP

## Local use

Open `index.html` in a browser, or serve the folder:

```bash
# Python
python -m http.server 8080

# Node
npx serve .
```

Then visit `http://localhost:8080`.

## Deploy (GitHub Pages)

This repo includes a GitHub Actions workflow (`.github/workflows/pages.yml`) that deploys the static site to GitHub Pages on every push to `main`.

After the first successful run:

1. Repo **Settings → Pages → Build and deployment** should show **GitHub Actions** as the source.
2. The site will be available at `https://<user>.github.io/<repo>/`.

## Privacy

All processing is local. Images never leave your device; there is no server component that receives or stores them.

## License

MIT
