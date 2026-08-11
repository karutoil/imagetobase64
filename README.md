# Image → Base64

A tiny, fully client-side tool that converts images to Base64.

**Nothing is uploaded.** Paste, drop, or pick an image — conversion runs entirely in your browser with the FileReader API. No backend, no analytics, no storage.

## Features

- Paste an image from the clipboard (`Ctrl`/`Cmd`+`V`)
- Drag and drop an image file
- Choose a file from disk
- Preview + file metadata
- Copy raw Base64 or a full `data:` URI
- Toggle output format and download as `.txt`

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
