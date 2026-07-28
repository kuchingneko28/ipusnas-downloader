# iPusnas Downloader CLI

A powerful CLI tool to download and decrypt books from the iPusnas (National Library of Indonesia) digital library ecosystem.

![License](https://img.shields.io/badge/license-MIT-blue)
![Version](https://img.shields.io/badge/version-1.0.0-green)

## Features

- **📚 Search & Borrow**: Search the catalog with pagination, borrow, download, and return books.
- **🔓 Auto-Decryption**: Downloads and decrypts PDF (qpdf) and EPUB from MDRM archives.
- **🔐 PoP Registration**: Register device key via ADB with a patched APK, or manually with `--token`.
- **🔄 Auto-Session**: Token refresh on expiry — no need to re-login mid-session.
- **⚡ Fast & Interactive**: Built with Bun, interactive prompts, spinners, and progress bars.
- **🛠️ Doctor**: Health check command to verify session and device registration.

## Prerequisites

- **Bun**: This project uses [Bun](https://bun.sh) as the runtime and package manager.
- **QPDF**: Required for PDF decryption.
  - **Good News:** The setup script will attempt to install/download this for you automatically!

## Installation

1. Clone the repository:

   ```bash
   git clone https://github.com/username/ipusnas-downloader.git
   cd ipusnas-downloader
   ```

2. Run the setup script:

   ```bash
   bun run setup
   ```

   This command will:
   - Install dependencies (`bun install`)
   - Download the correct `qpdf` binary for your OS (Windows/Linux)
   - Build the project to `bin/ipusnas`

3. Verify installation:

   ```bash
   # From source
   bun run start doctor

   # Or using the binary
   ./bin/ipusnas doctor
   ```

### Device Registration

Requires a patched iPusnas APK on an Android device with USB debugging.

**Download:** [GitHub Releases](https://github.com/kuchingneko28/ipusnas-pelir/releases) → `ipusnas-patcher-signed.zip`

```bash
sha256sum ipusnas-patcher-signed.zip
# ef0b297a7610c4130fed4c3015bd9250f4e2f33bf32747e020001dd77c7df3fe
unzip ipusnas-patcher-signed.zip
adb install-multiple base.apk split_config.arm64_v8a.apk split_config.in.apk split_config.xxhdpi.apk
```

Or use **SAI (Split APKs Installer)** from Google Play — select all 4 `.apk` files.

The patched APK logs the Play Integrity token to logcat so the CLI can capture it via ADB during register.

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
./bin/ipusnas search "prabowo" --verbose
```

### 5. Doctor

```bash
./bin/ipusnas doctor --verbose
```

### 6. Custom QPDF Path (Optional)

If you prefer to use your own `qpdf` binary instead of the monitored one, you can set the `QPDF_PATH` environment variable in your `.env` file:

```bash
QPDF_PATH="/usr/bin/qpdf"
```

## Disclaimer

This tool is for **educational and archival purposes only**. Please respect copyright laws and the terms of service of the National Library of Indonesia.
