const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");
const express = require("express");
const cors = require("cors");
const rateLimit = require("express-rate-limit");
require("dotenv").config();

const app = express();
const port = process.env.PORT || 3000;

const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20 });
app.use(cors());
app.use(express.json());
app.use(limiter);

// Add new function for batch status tracking
const downloadStatus = new Map();
let browser = null;

function generateBatchId() {
  return `batch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

function updateBatchStatus(batchId, url, status) {
  if (!downloadStatus.has(batchId)) {
    downloadStatus.set(batchId, new Map());
  }
  downloadStatus.get(batchId).set(url, status);
}

async function initializeBrowser() {
  if (!browser) {
    browser = await chromium.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
  }
  return browser;
}

// Add function to save download logs
async function saveDownloadLog(originalUrl, generatedText, filePath, fileSize) {
  const fileSizeMB = fileSize
    ? (fileSize / 1024 / 1024).toFixed(2) + " MB"
    : "Unknown";

  const logEntry = `
=== Download Log Entry ===
Date: ${new Date().toLocaleString()}
Original URL: ${originalUrl}
Generated Text: ${generatedText}
Downloaded File: ${filePath}
File Size: ${fileSizeMB}
=====================
`;

  const logsDir = path.join(__dirname, "logs");
  const logFile = path.join(logsDir, "download_logs.txt");

  // Create logs directory if it doesn't exist
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir);
  }

  // Append to log file
  await fs.promises.appendFile(logFile, logEntry);

  return { originalUrl, generatedText, filePath, fileSize };
}

async function downloadFile(url) {
  console.log("🔗 Processing URL:", url);

  if (!browser) {
    browser = await initializeBrowser();
  }

  const context = await browser.newContext({
    acceptDownloads: true,
    viewport: { width: 1280, height: 720 },
  });
  const page = await context.newPage();

  try {
    console.log("🔑 Navigating to login page...");
    await page.goto("https://stocip.com/login", { waitUntil: "networkidle" });
    await page.waitForSelector('input[type="text"], input[type="email"]');
    await page.fill(
      'input[type="text"], input[type="email"]',
      process.env.STOCIP_EMAIL
    );
    await page.fill('input[type="password"]', process.env.STOCIP_PASSWORD);

    console.log("🔓 Attempting to log in...");
    await Promise.all([
      page.waitForNavigation({ waitUntil: "networkidle" }),
      page.click('button[type="submit"]'),
    ]);

    console.log("✅ Login successful!");

    console.log("📄 Navigating to download page...");
    await page.goto("https://stocip.com/product/envato-file-download/", {
      waitUntil: "networkidle",
    });

    await page.waitForSelector(".download-input");
    await page.fill(".download-input", url);

    // Get the generated text from the input after filling
    const generatedText = await page.$eval(".download-input", (el) => el.value);

    console.log("⏳ Initiating download process...");
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.click('button[type="submit"]'),
    ]);

    // Wait for the input to be updated with the download link
    await page.waitForTimeout(3000);

    // Now get the final placeholder text that contains the direct download URL
    const finalPlaceholderText = await page.$eval(
      ".download-input",
      (el) => el.value || el.getAttribute("placeholder") || ""
    );
    console.log("📋 Generated placeholder text:", finalPlaceholderText);

    const suggestedFilename = download.suggestedFilename();
    console.log("📦 Suggested filename:", suggestedFilename);

    const filePath = await download.path();
    const downloadsPath = path.join(
      process.env.DOWNLOAD_PATH ||
        path.join("C:", "Users", "AliPc", "Downloads"),
      suggestedFilename || path.basename(filePath)
    );

    await fs.promises.copyFile(filePath, downloadsPath);
    console.log(`✅ File downloaded successfully to: ${downloadsPath}`);

    // Get file stats
    const stats = await fs.promises.stat(downloadsPath);
    console.log(`📊 File size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);

    // Save download log with the final placeholder text
    await saveDownloadLog(url, finalPlaceholderText, downloadsPath, stats.size);

    return {
      success: true,
      filePath: downloadsPath,
      fileName: suggestedFilename,
      fileSize: stats.size,
      generatedText: finalPlaceholderText,
    };
  } catch (error) {
    console.error("❌ Download failed:", error);
    throw error;
  } finally {
    await context.close();
  }
}

// New function to download multiple files using the same session
async function downloadMultipleFiles(urls) {
  console.log("🔗 Starting batch download process for", urls.length, "files");

  if (!browser) {
    browser = await initializeBrowser();
  }

  const context = await browser.newContext({
    acceptDownloads: true,
    viewport: { width: 1280, height: 720 },
  });
  const page = await context.newPage();

  try {
    // Login only once
    console.log("🔑 Navigating to login page...");
    await page.goto("https://stocip.com/login", { waitUntil: "networkidle" });
    await page.waitForSelector('input[type="text"], input[type="email"]');
    await page.fill(
      'input[type="text"], input[type="email"]',
      process.env.STOCIP_EMAIL
    );
    await page.fill('input[type="password"]', process.env.STOCIP_PASSWORD);

    console.log("🔓 Attempting to log in...");
    await Promise.all([
      page.waitForNavigation({ waitUntil: "networkidle" }),
      page.click('button[type="submit"]'),
    ]);

    // Now navigate to download page
    console.log("📄 Navigating to download page...");
    await page.goto("https://stocip.com/product/envato-file-download/", {
      waitUntil: "networkidle2",
      timeout: 60000,
    });

    console.log("🔍 Looking for download link...");
    await page.waitForSelector(".download-input", { timeout: 60000 });

    const downloadUrl = await page.evaluate(() => {
      const inputElement = document.querySelector(".download-input");
      return inputElement ? inputElement.getAttribute("placeholder") : null;
    });

    if (!downloadUrl) {
      throw new Error("❌ Could not find download URL on the page");
    }

    console.log("📥 Found download URL:", downloadUrl);

    // Create downloads directory if it doesn't exist
    const downloadsDir = path.join(__dirname, "downloads");
    if (!fs.existsSync(downloadsDir)) {
      fs.mkdirSync(downloadsDir);
    }

    // Save URL to file in downloads directory
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const fileName = path.join(downloadsDir, `download_url_${timestamp}.txt`);

    fs.writeFileSync(fileName, downloadUrl);
    console.log(`💾 Saved download URL to ${fileName}`);

    // Close the browser after saving
    console.log("🔒 Closing browser...");
    await browser.close();

    console.log("✅ Done! Check the downloads folder for your URL.");
  } catch (error) {
    console.error("Batch API Error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to start batch download",
      error: error.message,
    });
  }
});

// Add endpoint to check batch status
app.get("/api/batch-status/:batchId", (req, res) => {
  const { batchId } = req.params;

  if (!downloadStatus.has(batchId)) {
    return res.status(404).json({
      success: false,
      message: "Batch ID not found",
    });
  }

  const batchMap = downloadStatus.get(batchId);
  const status = Object.fromEntries(batchMap);

  // Clean up completed/failed batches after 1 hour
  const isCompleted = Array.from(batchMap.values()).every(
    (s) => s.status === "completed" || s.status === "failed"
  );

  if (isCompleted) {
    setTimeout(() => {
      downloadStatus.delete(batchId);
    }, 60 * 60 * 1000);
  }

  res.json({
    success: true,
    batchId,
    isCompleted,
    status,
  });
});

app.get("/", (req, res) => {
  res.json({
    message: "Welcome to Stocip Downloader API",
  });
});

app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

app.listen(port, () => {
  console.log(`🚀 Server is running on port ${port}`);
});

// Add cleanup on server shutdown
process.on("SIGINT", async () => {
  if (browser) {
    await browser.close();
  }
  process.exit();
});
