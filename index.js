const puppeteer = require("puppeteer");
const fs = require("fs");
const path = require("path");
require("dotenv").config();

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
  } catch (error) {
    console.error("❌ Error occurred:", error.message);
    if (browser) {
      await browser.close();
    }
    process.exit(1);
  }
}

// Execute the download function
downloadFile().catch(console.error);
