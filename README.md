# iPusnas Downloader CLI

A CLI tool to search, borrow, download, and decrypt books from the iPusnas (National Library of Indonesia) digital library ecosystem.

![License](https://img.shields.io/badge/license-MIT-blue)
![Version](https://img.shields.io/badge/version-1.0.0-green)

## Features

- **Search & Borrow** — interactive catalog search with pagination; borrow, download, and return books.
- **Auto-Decryption** — downloads and decrypts DRM-protected PDF (via qpdf) and EPUB from MDRM archives.
- **PoP Registration** — registers the device PoP key automatically via ADB and a patched APK, or manually with `--token`/`--file`.
- **Auto-Session** — transparent token refresh on expiry — no re-login mid-session.
- **Interactive** — clack prompts, spinners, and a unified command flow.
- **Doctor** — health check for your session and device registration.

## Prerequisites

- **Bun** — this project uses [Bun](https://bun.sh) as runtime and package manager.
- **QPDF** — required for PDF decryption. The setup script auto-installs it for Linux x64 and Windows x64; on other platforms install `qpdf` yourself (or point to it via `QPDF_PATH`).
- **Android device** — for automatic registration: a device with USB debugging enabled and the patched iPusnas APK installed (see below).

## Installation

1. Clone the repository:

   ```bash
   git clone https://github.com/kuchingneko28/ipusnas-downloader.git
   cd ipusnas-downloader
   ```

2. Run the setup script:

   ```bash
   bun run setup
   ```

   This installs dependencies (`bun install`), downloads the correct `qpdf` binary for your OS, and builds the project to `bin/ipusnas`.

3. Verify installation:

   ```bash
   # From source
   bun run start doctor

   # Or using the binary
   ./bin/ipusnas doctor
   ```

## Patched APK (for automatic registration)

Automatic PoP registration needs a patched iPusnas APK on your Android device.

Download it from [GitHub Releases](https://github.com/kuchingneko28/ipusnas-downloader/releases) — the `ipusnas-patcher-signed.zip` asset. Verify it against the checksum published in the release notes:

```bash
sha256sum ipusnas-patcher-signed.zip
unzip ipusnas-patcher-signed.zip
adb install-multiple base.apk split_config.arm64_v8a.apk split_config.in.apk split_config.xxhdpi.apk
```

Or use **SAI (Split APKs Installer)** from Google Play — select all 4 `.apk` files.

The patched app runs Play Integrity on demand: it fetches a nonce from the server, requests a token, then writes both to `/sdcard/Android/data/mam.reader.ipusnas/files/ipusnas_attestation.json` (and logs them under the `ATTEST_DEBUG` logcat tag). The CLI reads that file, falling back to a live logcat stream, and registers the PoP key.

## Usage

Run commands with `bun run start <command>` or the built binary `./bin/ipusnas <command>`. Add `--verbose` for debug logging.

| Command | Description |
| --- | --- |
| `login [--email] [--password]` | Login to iPusnas |
| `register [--token] [--nonce] [--file <path>] [--force]` | Register PoP device key |
| `search [query]` | Search catalog — pick an action from the results |
| `shelf` | List borrowed books — select to download or return |
| `borrow <id or URL>` | Borrow a book by ID or URL |
| `download <id or URL>` | Download and decrypt a book by ID or URL |
| `return <id or URL>` | Return a borrowed book |
| `doctor` | System health check |

### 1. Login

```bash
./bin/ipusnas login
```

_Prompts for your iPusnas email and password. All other commands log in automatically if needed._

**Auto-Login (optional):** skip the prompt with environment variables:

```bash
export IPUSNAS_EMAIL="your@email.com"
export IPUSNAS_PASSWORD="yourpassword"
```

### 2. Register (one-time, per device)

With the device plugged in and USB debugging enabled:

```bash
./bin/ipusnas register
```

The CLI runs the patched app's attestation activity over ADB, captures the fresh token, and registers the PoP key. Re-run with `--force` to re-register, or pass a token manually:

```bash
./bin/ipusnas register --token <integrity-token> --nonce <nonce>
./bin/ipusnas register --file attestation.json   # {"integrity_token": "...", "nonce": "..."}
```

### 3. Search & Download

```bash
./bin/ipusnas search "prabowo"
```

_Displays matching books; select one to borrow and download interactively._

### 4. Direct Download

If you already have the book URL or ID:

```bash
./bin/ipusnas download "https://ipusnas2.perpusnas.go.id/book/uuid-here"
```

### 5. Shelf & Return

```bash
./bin/ipusnas shelf
./bin/ipusnas return <book-id-or-url>
```

### 6. Doctor

```bash
./bin/ipusnas doctor --verbose
```

### 7. Custom QPDF Path (optional)

Point to your own `qpdf` binary instead of the bundled one:

```bash
export QPDF_PATH="/usr/bin/qpdf"
```

## Disclaimer

This tool is for **educational and archival purposes only**. Please respect copyright laws and the terms of service of the National Library of Indonesia.
