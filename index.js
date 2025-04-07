const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");
const express = require("express");
const cors = require("cors");
const rateLimit = require("express-rate-limit");
require("dotenv").config();

const app = express();
const port = process.env.PORT || 3000;

// Add trust proxy setting
app.set("trust proxy", 1);

const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20 });
app.use(cors());
app.use(express.json());
app.use(limiter);

// Add new function for batch status tracking
let browser = null;
let lastBrowserInitTime = null;

// Function to periodically clean up browser resources
async function cleanupBrowserResources() {
  try {
    if (browser && lastBrowserInitTime) {
      const currentTime = new Date();
      const hoursSinceInit =
        (currentTime - lastBrowserInitTime) / (1000 * 60 * 60);

      // Close and reinitialize browser after 1 hour of usage
      if (hoursSinceInit >= 1) {
        console.log("🧹 Performing periodic browser cleanup");
        await browser.close();
        browser = null;
        lastBrowserInitTime = null;
      }
    }
  } catch (error) {
    console.error("Browser cleanup error:", error);
  }
}

// Run cleanup every 15 minutes
setInterval(cleanupBrowserResources, 15 * 60 * 1000);

async function initializeBrowser() {
  if (!browser) {
    browser = await chromium.launch({
      headless: process.env.ENVIRONMENT === "production" ? true : false,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
    lastBrowserInitTime = new Date();
  }
  return browser;
}

async function downloadFile(url) {
  console.log("🔗 Processing URL:", url);

  if (!browser) {
    browser = await initializeBrowser();
  }

  let context = null;
  let page = null;
  let shouldCloseContext = true;

  try {
    context = await browser.newContext({
      acceptDownloads: true,
      viewport: { width: 1280, height: 720 },
    });
    page = await context.newPage();

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

    await page.waitForSelector(".download-input", { timeout: 60000 });
    await page.fill(".download-input", url);

    console.log("⏳ Initiating download process...");
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.press(".download-input", "Enter"),
    ]);

    console.log("✅ Download initiated by pressing Enter key");

    // Wait for the input to be updated with the download link
    await page.waitForTimeout(3000);

    console.log("🔍 Waiting for download to complete...");
    // Now get the final placeholder text that contains the direct download URL
    const finalPlaceholderText = await page.$eval(
      ".download-input",
      (el) => el.value || el.getAttribute("placeholder") || ""
    );
    console.log("📋 Generated placeholder text:", finalPlaceholderText);

    return {
      success: true,
      generatedText: finalPlaceholderText,
    };
  } catch (error) {
    console.error("❌ Download failed:", error);
    throw error;
  } finally {
    if (shouldCloseContext && context) {
      await context.close();
    }
  }
}

// Function to process multiple URLs in sequence
async function processBatchDownload(urls) {
  const results = [];

  try {
    if (!browser) {
      browser = await initializeBrowser();
    }

    const context = await browser.newContext({
      acceptDownloads: true,
      viewport: { width: 1280, height: 720 },
    });

    const page = await context.newPage();

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

    // Process each URL
    for (const url of urls) {
      try {
        await page.waitForSelector(".download-input", { timeout: 60000 });
        await page.fill(".download-input", url);

        console.log("⏳ Initiating download process for URL:", url);
        const [download] = await Promise.all([
          page.waitForEvent("download"),
          page.press(".download-input", "Enter"),
        ]);

        console.log("✅ Download initiated by pressing Enter key");

        // Wait for the input to be updated with the download link
        await page.waitForTimeout(3000);

        console.log("🔍 Waiting for download to complete...");
        // Now get the final placeholder text that contains the direct download URL
        const finalPlaceholderText = await page.$eval(
          ".download-input",
          (el) => el.value || el.getAttribute("placeholder") || ""
        );
        console.log("📋 Generated placeholder text:", finalPlaceholderText);

        results.push({
          url,
          success: true,
          generatedText: finalPlaceholderText,
        });

        // Click the reset button before processing the next URL
        if (urls.indexOf(url) < urls.length - 1) {
          console.log("🔄 Clicking reset button for next URL");
          await page.click("#resetButton");
          await page.waitForTimeout(1000); // Wait for reset to complete
        }
      } catch (error) {
        console.error(`Error processing URL ${url}:`, error);
        results.push({
          url,
          success: false,
          error: error.message,
        });
      }
    }

    await context.close();
  } catch (error) {
    console.error("Batch processing error:", error);
  }

  return results;
}

// Batch download endpoint
app.post("/api/batch-download", async (req, res) => {
  try {
    const { urls } = req.body;

    if (!urls || !Array.isArray(urls) || urls.length === 0) {
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

    console.log(`🔄 Starting batch download process for ${urls.length} URLs`);
    const results = await processBatchDownload(urls);

    res.json({
      success: true,
      message: "Batch download completed",
      results,
    });
  } catch (error) {
    console.error("Batch download error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to process batch download",
      error: error.message,
    });
  }
});

app.get("/", (req, res) => {
  res.json({
    message: "Welcome to Stocip Downloader API",
  });
});

app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

// New endpoint that returns only the generated text
app.post("/api/get-download-url", async (req, res) => {
  try {
    const { url } = req.body;

    if (!url || typeof url !== "string") {
      return res.status(400).json({
        success: false,
        message: "Please provide a valid URL string",
      });
    }

    const result = await downloadFile(url);

    // Check if we have a valid generated text
    if (!result.generatedText) {
      return res.status(400).json({
        success: false,
        message: "Failed to generate download URL - no text was generated",
      });
    }

    // Return only the generated text (direct download URL)
    res.json({
      success: true,
      generatedText: result.generatedText,
    });
  } catch (error) {
    console.error("Download URL generation error:", error);
    // Make sure we respond even if there's an error
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        message: "Failed to generate download URL",
        error: error.message,
      });
    }
  }
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
