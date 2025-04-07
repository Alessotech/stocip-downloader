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
let browser = null;

async function initializeBrowser() {
  if (!browser) {
    browser = await chromium.launch({
      headless: process.env.ENVIRONMENT === "production" ? true : false,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
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

    // console.log("📄 Navigating to download page...");
    // await page.goto("https://stocip.com/", {
    //   waitUntil: "networkidle",
    // });

    await page.waitForSelector(".download-input", { timeout: 60000 }); // زيادة الوقت لـ 60 ثانية
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

    console.log("🔒 Closing browser...");
    await browser.close();
    return {
      success: true,
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
// async function downloadMultipleFiles(urls) {
//   console.log("🔗 Starting batch download process for", urls.length, "files");

//   if (!browser) {
//     browser = await initializeBrowser();
//   }

//   const context = await browser.newContext({
//     acceptDownloads: true,
//     viewport: { width: 1280, height: 720 },
//   });
//   const page = await context.newPage();

//   try {
//     // Login only once
//     console.log("🔑 Navigating to login page...");
//     await page.goto("https://stocip.com/login", { waitUntil: "networkidle" });
//     await page.waitForSelector('input[type="text"], input[type="email"]');
//     await page.fill(
//       'input[type="text"], input[type="email"]',
//       process.env.STOCIP_EMAIL
//     );
//     await page.fill('input[type="password"]', process.env.STOCIP_PASSWORD);

//     console.log("🔓 Attempting to log in...");
//     await Promise.all([
//       page.waitForNavigation({ waitUntil: "networkidle" }),
//       page.click('button[type="submit"]'),
//     ]);

//     // Now navigate to download page
//     console.log("📄 Navigating to download page...");
//     await page.goto("https://stocip.com/product/envato-file-download/", {
//       waitUntil: "networkidle2",
//       timeout: 60000,
//     });

//     console.log("🔍 Looking for download link...");
//     await page.waitForSelector(".download-input", { timeout: 60000 });

//     const downloadUrl = await page.evaluate(() => {
//       const inputElement = document.querySelector(".download-input");
//       return inputElement ? inputElement.getAttribute("placeholder") : null;
//     });

//     if (!downloadUrl) {
//       throw new Error("❌ Could not find download URL on the page");
//     }

//     console.log("📥 Found download URL:", downloadUrl);

//     // Create downloads directory if it doesn't exist
//     const downloadsDir = path.join(__dirname, "downloads");
//     if (!fs.existsSync(downloadsDir)) {
//       fs.mkdirSync(downloadsDir);
//     }

//     // Save URL to file in downloads directory
//     const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
//     const fileName = path.join(downloadsDir, `download_url_${timestamp}.txt`);

//     fs.writeFileSync(fileName, downloadUrl);
//     console.log(`💾 Saved download URL to ${fileName}`);

//     // Close the browser after saving
//     console.log("🔒 Closing browser...");
//     await browser.close();

//     console.log("✅ Done! Check the downloads folder for your URL.");
//   } catch (error) {
//     console.error("Batch API Error:", error);
//     return {
//       success: false,
//       message: "Failed to start batch download",
//       error: error.message,
//     };
//   } finally {
//     await context.close();
//   }
// }

// Batch download endpoint
// app.post("/api/batch-download", async (req, res) => {
//   try {
//     const { urls } = req.body;
//     if (!urls || !Array.isArray(urls) || urls.length === 0) {
//       return res.status(400).json({
//         success: false,
//         message: "Please provide an array of URLs",
//       });
//     }

//     const batchId = generateBatchId();
//     const result = await downloadMultipleFiles(urls);

//     res.json({
//       success: true,
//       batchId,
//       message: "Batch download started",
//     });
//   } catch (error) {
//     console.error("Batch API Error:", error);
//     res.status(500).json({
//       success: false,
//       message: "Failed to start batch download",
//       error: error.message,
//     });
//   }
// });

// Add endpoint to check batch status
// app.get("/api/batch-status/:batchId", (req, res) => {
//   const { batchId } = req.params;

//   if (!downloadStatus.has(batchId)) {
//     return res.status(404).json({
//       success: false,
//       message: "Batch ID not found",
//     });
//   }

//   const batchMap = downloadStatus.get(batchId);
//   const status = Object.fromEntries(batchMap);

//   // Clean up completed/failed batches after 1 hour
//   const isCompleted = Array.from(batchMap.values()).every(
//     (s) => s.status === "completed" || s.status === "failed"
//   );

//   if (isCompleted) {
//     setTimeout(() => {
//       downloadStatus.delete(batchId);
//     }, 60 * 60 * 1000);
//   }

//   res.json({
//     success: true,
//     batchId,
//     isCompleted,
//     status,
//   });
// });

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

    // Return only the generated text (direct download URL)
    res.json({
      success: true,
      generatedText: result.generatedText,
    });
  } catch (error) {
    console.error("Download URL generation error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to generate download URL",
      error: error.message,
    });
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
