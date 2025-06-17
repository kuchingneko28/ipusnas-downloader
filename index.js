#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const IpusnasDownloader = require("./IpusnasDownloader");

const args = process.argv.slice(2);
const tokenPath = path.join(__dirname, "token.json");

function showHelp() {
  console.log(`
📚 iPusnas Downloader CLI

Usage:
  node index.js --login <email> <password>    Log in and save token
  node index.js <book_id>                     Download book by ID
  node index.js <book_url>                    Download book from full Ipusnas URL

Examples:
  node index.js --login user@example.com secret123
  node index.js 53aa0e2e-8092-4aac-884f-29d0961e22fa
  node index.js https://ipusnas2.perpusnas.go.id/book/53aa0e2e-8092-4aac-884f-29d0961e22fa/...

Notes:
  - You must log in first before downloading any book.
  - The token will be saved to token.json in the current directory.
`);
}

if (args.length === 0 || args[0] === "--help" || args[0] === "-h") {
  showHelp();
  process.exit(0);
}

if (args[0] === "--login") {
  const email = args[1];
  const password = args[2];

  if (!email || !password) {
    console.error("❌ Usage: node index.js --login <email> <password>");
    process.exit(1);
  }

  const book = new IpusnasDownloader(null);
  book
    .login(email, password)
    .then((res) => {
      if (res) console.log("✅ Login successful. Token saved to token.json");
    })
    .catch((err) => {
      console.error("❌ Login failed:", err.message);
      process.exit(1);
    });

  return;
}

let bookId = args[0];
const urlPattern = /\/book\/([a-f0-9\-]{36})\//;
const match = bookId.match(urlPattern);
if (match) {
  bookId = match[1];
}

if (!/^[a-f0-9\-]{36}$/.test(bookId)) {
  console.error("❌ Invalid book ID format.");
  process.exit(1);
}

const book = new IpusnasDownloader(bookId);

(async () => {
  if (!fs.existsSync(tokenPath) || fs.readFileSync(tokenPath).length == 0) {
    console.error("❌ Token file not found. Please log in first using:");
    console.error("   node index.js --login <email> <password>");
    process.exit(1);
  }

  await book.run();
})();
