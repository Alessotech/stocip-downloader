const puppeteer = require("puppeteer");
const fs = require("fs");
const path = require("path");
const express = require("express");
const cors = require("cors");
const rateLimit = require("express-rate-limit");
require("dotenv").config();

const app = express();
const port = process.env.PORT || 3000;

// Rate limiting configuration
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // limit each IP to 5 requests per windowMs
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(limiter);

async function downloadFile() {
  let browser;
  try {
    console.log("🚀 Launching browser in private mode...");
    browser = await puppeteer.launch({
      headless: false,
      args: ["--incognito", "--disable-extensions"],
    });

    const pages = await browser.pages();
    const page = pages[0] || (await browser.newPage());

    // Set viewport to a reasonable size
    await page.setViewport({ width: 1280, height: 800 });

    // First navigate to login page
    console.log("🔑 Navigating to login page...");
    await page.goto("https://stocip.com/login", {
      waitUntil: "networkidle2",
      timeout: 60000,
    });

    // Wait for login form and fill credentials
    console.log("👤 Filling login credentials...");

    // Wait for email field using multiple possible selectors
    await page.waitForSelector('input[type="text"], input[type="email"]');
    await page.type(
      'input[type="text"], input[type="email"]',
      process.env.STOCIP_EMAIL
    );

    // Wait for password field
    await page.waitForSelector('input[type="password"]');
    await page.type('input[type="password"]', process.env.STOCIP_PASSWORD);

    // Click login button
    console.log("🔓 Logging in...");

    // Find the login button
    const loginButton = await page.evaluate(() => {
      // Try different ways to find the login button
      const button =
        document.querySelector("button.login-button") ||
        document.querySelector('button[type="submit"]') ||
        document.querySelector('input[type="submit"]') ||
        Array.from(document.querySelectorAll("button")).find((el) =>
          el.textContent.toLowerCase().includes("login")
        );
      return button;
    });

    if (!loginButton) {
      throw new Error("Could not find login button");
    }

    await Promise.all([
      page.waitForNavigation({ waitUntil: "networkidle2" }),
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
    return downloadUrl;
  } catch (error) {
    console.error("❌ Error occurred:", error.message);
    if (browser) {
      await browser.close();
    }
    throw error;
  }
}

// API Endpoints
app.get("/api/download", async (req, res) => {
  try {
    const downloadUrl = await downloadFile();
    res.json({
      success: true,
      message: "Download URL retrieved successfully",
      data: {
        downloadUrl,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to retrieve download URL",
      error: error.message,
    });
  }
});

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

// Start server
app.listen(port, () => {
  console.log(`🚀 Server is running on port ${port}`);
});
