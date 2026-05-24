import puppeteer from 'puppeteer-core';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function run() {
  const browser = await puppeteer.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();
  
  const filePath = path.resolve(__dirname, 'guide_pages.html');
  await page.goto(`file://${filePath}`, { waitUntil: 'networkidle0' });
  
  // Set viewport to 1080x1920
  await page.setViewport({
    width: 1080,
    height: 1920,
    deviceScaleFactor: 1 // Generate exactly 1080x1920 pixel images
  });
  
  // Wait a short moment to ensure fonts, assets, and QR code are loaded
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  // 1. Capture each page element separately
  const pageElements = await page.$$('.page');
  console.log(`Found ${pageElements.length} pages to render.`);
  
  for (let i = 0; i < pageElements.length; i++) {
    const pngPath = path.resolve(__dirname, `永續大挑戰_遊玩指南_第${i + 1}頁.png`);
    await pageElements[i].screenshot({
      path: pngPath
    });
    console.log(`Saved Slide ${i + 1} to: ${pngPath}`);
  }

  // 2. Generate multi-page PDF with exactly 1080px x 1920px page boundaries
  const pdfPath = path.resolve(__dirname, '永續大挑戰_遊玩指南_9_16.pdf');
  await page.pdf({
    path: pdfPath,
    printBackground: true,
    width: '1080px',
    height: '1920px',
    margin: {
      top: '0px',
      bottom: '0px',
      left: '0px',
      right: '0px'
    }
  });
  console.log(`Saved PDF to: ${pdfPath}`);
  
  await browser.close();
}

run().catch(console.error);
