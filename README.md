# 📚 iPusnas Downloader CLI

A Node.js command-line tool to download and decrypt DRM-protected books from [ipusnas.perpusnas.go.id](https://ipusnas2.perpusnas.go.id/).

> ⚠️ **Important:** You must have **borrowed the book** in the iPusnas app **before** using this tool. This tool does not bypass borrowing restrictions.

---

## ⚙️ Requirements

- Node.js (v14 or higher)
- QPDF binary included in `bin/qpdf` or available in your system `PATH`

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

## 🗕️ Usage

### ✅ First-Time Login

```bash
node index.js --login <email> <password>
```

> 🔐 Saves the authentication token to `token.json` for future use.

---

### 📘 Download a Book

You can provide either the full book URL or just the book ID:

```bash
node index.js <book-id>
```

Or:

```bash
node index.js https://ipusnas2.perpusnas.go.id/book/<book-id>/<extra>
```

---

## ℹ️ Help

```bash
node index.js --help
```

Displays usage instructions and available commands.

---

## 📂 Output

- Temporary and intermediate files are stored in the `temp/` directory.
- Final decrypted PDF is saved in the current directory as:
  **`<book-title>_decrypted.pdf`**

---

## ✨ Features

- 🔐 Authenticated API access with token management
- 📆 Handles `.mdrm` encrypted book packages
- 🔓 Automatically decrypts PDFs using QPDF
- 📉 Visual CLI progress bars during download
- 🧹 Automatically removes encrypted and temporary files

---

## ⚠️ Troubleshooting

- **Token missing or expired:**

  Re-login to generate a new token:

  ```bash
  node index.js --login <email> <password>
  ```

- **QPDF issues:**

  - Make sure the `bin/qpdf` binary exists and is executable.
  - Alternatively, install QPDF system-wide and ensure it’s in your `PATH`.

---

## 📄 License

MIT License

---

## 👥 Credits

Made for educational purposes and to facilitate easier access to books **you’ve already borrowed** from the official iPusnas platform.
