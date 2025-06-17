# 📚 iPusnas Downloader CLI

A Node.js command-line tool to download and decrypt DRM-protected books from [ipusnas.perpusnas.go.id](https://ipusnas.perpusnas.go.id/).

---

## ⚙️ Requirements

- Node.js (v14 or higher)
- QPDF binary included in `bin/qpdf` or accessible in your system PATH

---

## 🚀 Installation

1. **Clone the repository:**

```bash
git clone https://github.com/yourname/ipusnas-downloader.git
cd ipusnas-downloader
```

2. **Install dependencies:**

```bash
npm install
```

3. **(Optional)** Make script executable:

```bash
chmod +x index.js
```

---

## 📅 Usage

### ✅ First-time Login

```bash
node index.js --login <email> <password>
```

> 🔐 Saves the authentication token to `token.json`.

---

### 📘 Download a Book

You can provide either a full Ipusnas book URL or just the book ID:

```bash
node index.js <book-id>
```

Or:

```bash
node index.js https://ipusnas2.perpusnas.go.id/book/<book-id>/<something>
```

---

## ℹ️ Help

```bash
node index.js --help
```

Displays usage instructions.

---

## 📂 Output

- Downloads and intermediate files are stored in the `temp/` directory
- Final decrypted PDF is saved in the current directory as `<book-title>_decrypted.pdf`

---

## ✨ Features

- 🔐 Authenticated API access
- 📦 Supports `.mdrm` DRM-protected files
- 🔓 Auto password generation and PDF decryption using QPDF
- 📉 CLI progress bars for download
- 🔧 Automatically cleans up encrypted files

---

## ⚠️ Troubleshooting

- **Token not found or expired:**

  ```
  node index.js --login <email> <password>
  ```

- **QPDF not found or fails:**

  - Ensure the binary exists at `bin/qpdf` or is in your system PATH
  - Make sure it has execute permission

---

## 📄 License

MIT License

---

## 👥 Credits

Made for learning and accessing public digital libraries more effectively.
