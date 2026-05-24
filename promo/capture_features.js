import puppeteer from 'puppeteer-core';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function run() {
  console.log('Launching browser to capture features and badges guide...');
  const browser = await puppeteer.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();
  
  const filePath = path.resolve(__dirname, 'guide_features.html');
  await page.goto(`file://${filePath}`, { waitUntil: 'networkidle0' });
  
  // 9:16 layout dimensions (1080 x 1920)
  const width = 1080;
  const height = 1920;
  
  await page.setViewport({
    width: width,
    height: height,
    deviceScaleFactor: 2 // High-res density
  });

  // Delay to make sure images load
  await new Promise(resolve => setTimeout(resolve, 2000));

  // Capture slide 1
  const slide1Path = path.resolve(__dirname, '永續大挑戰_功能徽章指南_第1頁.png');
  await page.screenshot({
    path: slide1Path,
    clip: { x: 0, y: 0, width, height }
  });
  console.log(`Saved Slide 1 to: ${slide1Path}`);

  // Capture slide 2
  const slide2Path = path.resolve(__dirname, '永續大挑戰_功能徽章指南_第2頁.png');
  await page.screenshot({
    path: slide2Path,
    clip: { x: 0, y: height, width, height }
  });
  console.log(`Saved Slide 2 to: ${slide2Path}`);

  // Capture slide 3
  const slide3Path = path.resolve(__dirname, '永續大挑戰_功能徽章指南_第3頁.png');
  await page.screenshot({
    path: slide3Path,
    clip: { x: 0, y: height * 2, width, height }
  });
  console.log(`Saved Slide 3 to: ${slide3Path}`);

  // Generate multi-page PDF
  const pdfPath = path.resolve(__dirname, '永續大挑戰_功能徽章指南_9_16.pdf');
  await page.pdf({
    path: pdfPath,
    printBackground: true,
    width: '1080px',
    height: '1920px',
    margin: { top: '0px', bottom: '0px', left: '0px', right: '0px' }
  });
  console.log(`Saved PDF to: ${pdfPath}`);

  await browser.close();
}

run().catch(console.error);
