const puppeteer = require("puppeteer");
const fs = require("fs");
const path = require("path");
const express = require("express");
const cors = require("cors");
const rateLimit = require("express-rate-limit");
const fetch = require("node-fetch");
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

async function downloadFile(url) {
  let browser;
  try {
    // Set up download path
    const downloadsDir = path.join(__dirname, "downloads");
    if (!fs.existsSync(downloadsDir)) {
      fs.mkdirSync(downloadsDir);
    }

    console.log("🚀 Launching browser in private mode...");
    browser = await puppeteer.launch({
      headless: false,
      args: ["--incognito", "--disable-extensions"],
      defaultViewport: { width: 1280, height: 800 },
    });

    const pages = await browser.pages();
    const page = pages[0] || (await browser.newPage());

    // Add this right after getting the page
    const client = await page.target().createCDPSession();
    await client.send("Page.setDownloadBehavior", {
      behavior: "allow",
      downloadPath: path.join(__dirname, "downloads"),
    });

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

    // Now navigate to download page with the provided URL
    console.log("📄 Navigating to download page...");
    await page.goto("https://stocip.com/product/envato-file-download/", {
      waitUntil: "networkidle2",
      timeout: 120000,
    });

    console.log("🔍 Looking for download input...");
    await page.waitForSelector(".download-input", { timeout: 120000 });

    // Fill in the URL
    await page.type(".download-input", url);

    // Wait for and click the download button
    console.log("📥 Starting download...");
    await page.waitForSelector('button[type="submit"]');

    // Click the download button and wait for the download to start
    await page.click('button[type="submit"]');

    // Wait for the download link to appear
    console.log("⏳ Waiting for download link...");
    await page.waitForSelector("[data-download]", { timeout: 180000 });

    // Get the download link
    const downloadLink = await page.$eval("[data-download]", (el) => el.href);

    // Download the file using fetch with a longer timeout
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 300000); // 5 minutes timeout

    try {
      const response = await fetch(downloadLink, {
        signal: controller.signal,
        timeout: 300000,
      });

      clearTimeout(timeout);

      // Check if response is OK
      if (!response.ok) {
        throw new Error(`Download failed with status: ${response.status}`);
      }

      const buffer = await response.buffer();

      // Get file size before saving
      const fileSize = buffer.length;

      // Create a unique filename
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const fileExtension = downloadLink.split(".").pop();
      const fileName = path.join(
        downloadsDir,
        `download_${timestamp}.${fileExtension}`
      );

      // Save the file
      fs.writeFileSync(fileName, buffer);

      // Verify file exists and size matches
      const savedFile = fs.statSync(fileName);
      if (!fs.existsSync(fileName)) {
        throw new Error("File was not saved successfully");
      }

      if (savedFile.size !== fileSize) {
        throw new Error(
          `File size mismatch. Expected: ${fileSize}, Got: ${savedFile.size}`
        );
      }

      console.log(`💾 File downloaded successfully to: ${fileName}`);
      console.log(
        `📦 File size: ${(savedFile.size / 1024 / 1024).toFixed(2)} MB`
      );

      // Close the browser after saving
      console.log("🔒 Closing browser...");
      await browser.close();

      console.log("✅ Done! Check the downloads folder for your file.");
      return true;
    } catch (error) {
      console.error("❌ Error occurred:", error.message);
      if (browser) {
        await browser.close();
      }
      throw error;
    }
  } catch (error) {
    console.error("❌ Error occurred:", error.message);
    if (browser) {
      await browser.close();
    }
    throw error;
  }
}

// API Endpoints
app.post("/api/download", async (req, res) => {
  try {
    const { url } = req.body;

    if (!url) {
      return res.status(400).json({
        success: false,
        message: "URL is required in the request body",
      });
    }

    await downloadFile(url);
    res.json({
      success: true,
      message: "Download completed successfully",
      data: {
        url,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to download file",
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
