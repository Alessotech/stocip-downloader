const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");
const express = require("express");
const cors = require("cors");
const rateLimit = require("express-rate-limit");
require("dotenv").config();

const app = express();
const port = process.env.PORT || 3000;

const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 5 });
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
    browser = await chromium.launch({ headless: false });
  }
  return browser;
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

    console.log("⏳ Initiating download process...");
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.click('button[type="submit"]'),
    ]);

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

    return {
      success: true,
      filePath: downloadsPath,
      fileName: suggestedFilename,
      fileSize: stats.size,
    };
  } catch (error) {
    console.error("❌ Download failed:", error);
    throw error;
  } finally {
    await context.close();
  }
}

app.post("/api/download", async (req, res) => {
  try {
    const { url } = req.body;
    if (!url) {
      return res
        .status(400)
        .json({ success: false, message: "URL is required" });
    }

    if (!url.startsWith("http")) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid URL format" });
    }

    const result = await downloadFile(url);
    res.json({
      success: true,
      message: "Download completed successfully",
      ...result,
    });
  } catch (error) {
    console.error("API Error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to download file",
      error: error.message,
    });
  }
});

// Modify batch download endpoint
app.post("/api/batch-download", async (req, res) => {
  try {
    const { urls } = req.body;

    if (!Array.isArray(urls) || urls.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Please provide an array of URLs",
      });
    }

    if (urls.length > 10) {
      return res.status(400).json({
        success: false,
        message: "Maximum 10 URLs allowed per batch",
      });
    }

    const batchId = generateBatchId();

    // Start sequential downloads in background
    (async () => {
      for (const url of urls) {
        try {
          updateBatchStatus(batchId, url, { status: "downloading" });
          const result = await downloadFile(url);
          updateBatchStatus(batchId, url, {
            status: "completed",
            ...result,
          });
        } catch (error) {
          updateBatchStatus(batchId, url, {
            status: "failed",
            error: error.message,
          });
        }
      }
    })();

    res.json({
      success: true,
      message: "Batch download started",
      batchId,
      totalFiles: urls.length,
    });
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
