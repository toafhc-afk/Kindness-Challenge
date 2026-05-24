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
  
  const filePath = path.resolve(__dirname, 'guide.html');
  await page.goto(`file://${filePath}`, { waitUntil: 'networkidle0' });
  
  // Set viewport width to 750, height to 1200 as base
  await page.setViewport({
    width: 750,
    height: 1200,
    deviceScaleFactor: 2 // Double density for crisp mobile reading
  });
  
  // Wait a short moment to ensure fonts and API QR codes are loaded
  await new Promise(resolve => setTimeout(resolve, 1500));
  
  // 1. Take full page screenshot (PNG)
  const pngPath = path.resolve(__dirname, '永續大挑戰_遊玩指南.png');
  await page.screenshot({
    path: pngPath,
    fullPage: true
  });
  console.log(`PNG screenshot generated at: ${pngPath}`);

  // 2. Generate PDF
  const pdfPath = path.resolve(__dirname, '永續大挑戰_遊玩指南.pdf');
  await page.pdf({
    path: pdfPath,
    printBackground: true,
    width: '750px',
    height: '2400px', // Set high custom height so the whole infographic fits on a single continuous page
    margin: {
      top: '0px',
      bottom: '0px',
      left: '0px',
      right: '0px'
    }
  });
  console.log(`PDF generated at: ${pdfPath}`);
  
  await browser.close();
}

run().catch(console.error);
