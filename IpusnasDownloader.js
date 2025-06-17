const axios = require("axios");
const crypto = require("crypto");
const AdmZip = require("adm-zip");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");
const cliProgress = require("cli-progress");
const { execSync } = require("child_process");

class IpusnasDownloader {
  constructor(bookId) {
    this.bookId = bookId;
    this.apiLogin = `https://api2-ipusnas.perpusnas.go.id/api/auth/login`;
    this.apiBookDetail = `https://api2-ipusnas.perpusnas.go.id/api/webhook/book-detail?book_id=`;
    this.apiCheckBorrowBook = `https://api2-ipusnas.perpusnas.go.id/api/webhook/check-borrow-status?book_id=`;

    this.headers = {
      Origin: "https://ipusnas2.perpusnas.go.id",
      Referer: "https://ipusnas2.perpusnas.go.id/",
      "User-Agent": "Mozilla/5.0 (Linux; Android 6.0; Nexus 5 Build/MRA58N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Mobile Safari/537.36",
      "Content-Type": "application/vnd.api+json",
    };

    this.tempDir = path.join(__dirname, "temp");
    if (!fs.existsSync(this.tempDir)) fs.mkdirSync(this.tempDir);
  }

  async login(email, password) {
    try {
      const { data } = await axios.post(
        this.apiLogin,
        {
          email,
          password,
        },
        {
          headers: { ...this.headers },
        }
      );

      fs.writeFileSync("token.json", JSON.stringify(data, null, 2));
      console.log(`👤 Logged in as: ${data?.data?.name || email}`);
      console.log(`🆔 User ID: ${data?.data?.id}`);
      return true;
    } catch (err) {
      console.error("❌ Login failed:", err.message);
      console.error("Please check your email/password make sure its valid!");
    }
  }

  async getBookDetail(token, bookId) {
    const { data } = await axios.get(this.apiBookDetail + bookId, {
      headers: { Authorization: `Bearer ${token}`, ...this.headers },
    });
    return data;
  }

  async getBorrowInfo(token, bookId) {
    const { data } = await axios.get(this.apiCheckBorrowBook + bookId, {
      headers: { Authorization: `Bearer ${token}`, ...this.headers },
    });
    return data;
  }

  async downloadBook(url, name) {
    const safeName = name.trim().replace(/[^a-z0-9_\-\.]/gi, "_");
    const ext = path.extname(new URL(url).pathname) || ".pdf";
    const fileName = `${safeName}${ext}`;
    const inputPath = path.join(this.tempDir, fileName);

    const response = await axios.get(url, {
      headers: { ...this.headers },
      responseType: "stream",
    });

    const totalLength = parseInt(response.headers["content-length"] || "0", 10);
    let downloaded = 0;

    const progressBar = new cliProgress.SingleBar({
      format: `↓ [{bar}] {percentage}% | {humanValue}/{humanTotal})`,
      barCompleteChar: "#",
      barIncompleteChar: ".",
      barsize: 25,
    });

    if (!totalLength) throw new Error("❌ Missing 'content-length' header. The server might not support progress tracking.");

    progressBar.start(totalLength, 0, {
      humanTotal: this.formatBytes(totalLength),
      humanValue: this.formatBytes(0),
    });

    response.data.on("data", (chunk) => {
      downloaded += chunk.length;
      progressBar.update(downloaded, {
        humanValue: this.formatBytes(downloaded),
      });
    });

    const writer = fs.createWriteStream(inputPath);
    response.data.pipe(writer);

    return new Promise((resolve, reject) => {
      writer.on("finish", () => {
        progressBar.stop();
        console.log(`\n✅ Download complete: ${inputPath}`);
        resolve(inputPath);
      });

      writer.on("error", (err) => {
        progressBar.stop();
        console.error("❌ Download failed:", err.message);
        reject(err);
      });
    });
  }
  formatBytes(bytes) {
    if (bytes === 0) return "0 Bytes";
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(2)} ${sizes[i]}`;
  }

  hashString(str) {
    const hash = crypto.createHash("sha256").update(str).digest("hex");
    return hash.slice(7, 23);
  }
  decryptKey(userId, bookId, epustakaId, borrowKey) {
    const formatted = `${userId}${bookId}${epustakaId}`;
    const key = this.hashString(formatted);
    const iv = Buffer.from(borrowKey, "base64").slice(0, 16);
    const ciphertext = Buffer.from(borrowKey, "base64").slice(16);
    const decipher = crypto.createDecipheriv("aes-128-cbc", key, iv);

    let decrypted = decipher.update(ciphertext);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return decrypted.toString("utf-8");
  }

  generatePasswordPDF(decryptedKey) {
    const hash = crypto.createHash("sha384").update(decryptedKey, "utf8").digest("hex");
    return hash.slice(9, 73);
  }
  generatePasswordZip(decryptedKey, useSha512 = false) {
    if (typeof decryptedKey !== "string") {
      throw new TypeError("Password must be a string");
    }
    const algorithm = useSha512 ? "sha512" : "sha1";
    const hash = crypto.createHash(algorithm).update(decryptedKey, "utf-8").digest("hex");
    return hash.slice(59, 105);
  }

  async decryptPDF(inputPath, password, outputPath) {
    try {
      const qpdfPath = path.join(__dirname, "bin", "qpdf");
      execSync(`"${qpdfPath}" --password="${password}" --decrypt "${inputPath}" "${outputPath}"`);
      console.log(`🔓 Decrypted PDF saved to: ${outputPath}`);
    } catch (err) {
      console.error("❌ QPDF decryption failed:", err.message);
    }
    try {
      fs.unlinkSync(inputPath);
      console.log(`🧹 Removed encrypted file: ${inputPath}`);
    } catch (err) {
      console.warn(`⚠️  Could not remove encrypted file: ${err.message}`);
    }
  }

  extractZip(inputPath, passwordZip, bookId) {
    const zip = new AdmZip(inputPath);
    const entry = zip.getEntry(`${bookId}.moco`);
    let buffer;

    try {
      buffer = entry.getData(passwordZip);
    } catch (err) {
      console.error("❌ Failed to extract encrypted zip entry:", err.message);
      return null;
    }

    const outputPdfPath = path.join(this.tempDir, `${bookId}.pdf`);
    fs.writeFileSync(outputPdfPath, buffer);
    console.log(`📦 Extracted → ${outputPdfPath}`);

    try {
      fs.unlinkSync(inputPath);
      console.log(`🧹 Removed zip archive: ${inputPath}`);
    } catch (err) {
      console.warn(`⚠️  Could not remove zip archive: ${err.message}`);
    }

    return outputPdfPath;
  }

  async run() {
    try {
      const {
        data: { access_token, id: user_id },
      } = JSON.parse(fs.readFileSync("token.json", "utf-8"));
      const {
        data: { id: book_id, book_title, using_drm, file_size_info, file_ext, book_author },
      } = await this.getBookDetail(access_token, this.bookId);

      const {
        data: {
          url_file,
          borrow_key,
          epustaka: { id: epustaka_id },
        },
      } = await this.getBorrowInfo(access_token, book_id);

      console.log("📚 iPusnas Downloader");
      console.log(`📘 Book Title     : ${book_title}`);
      console.log(`✍️  Author         : ${book_author}`);
      console.log(`📦 File Size      : ${file_size_info}`);
      console.log(`📄 File Extension : ${file_ext}`);
      console.log(`🔒 DRM Protected  : ${using_drm ? "Yes" : "No"}`);

      const downloadedFile = await this.downloadBook(url_file, book_title);
      const fileExt = path.extname(downloadedFile).toLowerCase();

      if (!using_drm) {
        const finalPath = path.join(__dirname, path.basename(downloadedFile));
        fs.renameSync(downloadedFile, finalPath);
        console.log(`✅ File moved to: ${finalPath}`);
      } else {
        const decryptedKey = this.decryptKey(user_id, book_id, epustaka_id, borrow_key);
        const passwordZip = this.generatePasswordZip(decryptedKey, true);
        const pdfPassword = this.generatePasswordPDF(decryptedKey);

        let targetPDF = downloadedFile;

        if (fileExt === ".mdrm") {
          const extractedPDF = this.extractZip(downloadedFile, passwordZip, book_id);
          if (!extractedPDF) return;
          targetPDF = extractedPDF;
        }
        const safeName = book_title.trim().replace(/[^a-z0-9_\-\.]/gi, "_");
        const fileName = `${safeName}.pdf`;
        const finalPath = path.join(__dirname, path.basename(fileName).replace(".pdf", "_decrypted.pdf"));
        await this.decryptPDF(targetPDF, pdfPassword, finalPath);
      }
    } catch (err) {
      console.error("❌ ", err.message);
    }
  }
}

module.exports = IpusnasDownloader;
