# iPusnas Downloader CLI

A powerful CLI tool to download and decrypt books from the iPusnas (National Library of Indonesia) digital library ecosystem.

![License](https://img.shields.io/badge/license-MIT-blue)
![Version](https://img.shields.io/badge/version-1.0.0-green)

## Features

- **📚 Search & Borrow**: Search the entire iPusnas catalog and borrow books directly from the terminal.
- **🔓 Auto-Decryption**: Automatically downloads, unpacks (MDRM), and decrypts books into standard PDF format.
- **🔄 Smart Session**: Handles authentication automatically. If your session expires during a download, it auto-refreshes and retries seamlessly.
- **⚡ Fast & Interactive**: Built with Bun for speed, featuring interactive prompts, spinners, and progress bars.
- **🛠️ Resilient**: Auto-retries on network failures and handles device token rotation automatically.

## Prerequisites

- **Bun**: This project uses [Bun](https://bun.sh) as the runtime and package manager.
- **QPDF**: Required for PDF decryption.
  - Linux: `sudo apt install qpdf`
  - Windows: Download from [GitHub](https://github.com/qpdf/qpdf/releases) and add to PATH.

## Installation

1. Clone the repository:

   ```bash
   git clone https://github.com/username/ipusnas-downloader.git
   cd ipusnas-downloader
   ```

2. Install dependencies:

   ```bash
   bun install
   ```

3. Build the binary:
   ```bash
   bun run build
   # Binary created at: bin/ipusnas
   ```

## Usage

You can run the tool directly using `bun run start` or use the built binary `./bin/ipusnas`.

### 1. Login

```bash
./bin/ipusnas login
```

_Prompts for your iPusnas email and password._

**Auto-Login (Optional):**
Set environment variables to skip manual login:

```bash
export IPUSNAS_EMAIL="your@email.com"
export IPUSNAS_PASSWORD="yourpassword"
```

### 2. Search & Download

```bash
./bin/ipusnas search "prabowo"
```

_Displays a list of matching books. Select one to borrow and download._

### 3. Direct Download

If you already have the Book URL or ID:

```bash
./bin/ipusnas download "https://ipusnas2.perpusnas.go.id/book/uuid-here"
```

### 4. Verbose Mode

For debugging or detailed logs:

```bash
./bin/ipusnas search "java" --verbose
```

### 5. Check Session

```bash
./bin/ipusnas info
```

## Disclaimer

This tool is for **educational and archival purposes only**. Please respect copyright laws and the terms of service of the National Library of Indonesia.
