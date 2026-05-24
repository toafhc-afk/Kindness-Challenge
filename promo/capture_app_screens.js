import puppeteer from 'puppeteer-core';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function run() {
  console.log('Launching browser to capture app screenshots...');
  const browser = await puppeteer.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();
  
  // Set viewport to mobile size (iPhone standard)
  await page.setViewport({
    width: 390,
    height: 844,
    deviceScaleFactor: 2 // High-density for beautiful rendering
  });

  // Enable dialog / confirm override
  await page.evaluateOnNewDocument(() => {
    window.confirm = () => true;
  });

  // 1. Open Welcome page
  console.log('Navigating to http://localhost:3001/...');
  await page.goto('http://localhost:3001/', { waitUntil: 'networkidle0' });
  await sleep(2000);

  // Take screenshot of Welcome Page
  const welcomePath = path.resolve(__dirname, 'screenshot_welcome.png');
  await page.screenshot({ path: welcomePath });
  console.log(`1. Welcome screenshot saved to: ${welcomePath}`);

  // 2. Click guest play to log in
  console.log('Clicking guest play button...');
  const guestButtonClicked = await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const guestBtn = buttons.find(b => b.textContent.includes('免登入') || b.textContent.includes('訪客'));
    if (guestBtn) {
      guestBtn.click();
      return true;
    }
    return false;
  });

  if (!guestButtonClicked) {
    console.error('Could not find Guest Login button on page!');
  }
  
  await sleep(3000); // Wait for anonymous authentication and redirection

  // 3. Take screenshot of Track Selection page
  const selectPath = path.resolve(__dirname, 'screenshot_select.png');
  await page.screenshot({ path: selectPath });
  console.log(`2. Track selection screenshot saved to: ${selectPath}`);

  // 4. Click Veg track selection card
  console.log('Selecting Veg track...');
  await page.evaluate(() => {
    const clickableElements = Array.from(document.querySelectorAll('button, div'));
    const vegCard = clickableElements.find(c => c.textContent && (c.textContent.includes('蔬食') || c.textContent.includes('Veg')));
    if (vegCard) {
      vegCard.click();
    }
  });

  await sleep(2000); // Wait for redirection to dashboard

  // 5. Handle tutorial dialog if visible
  console.log('Checking for tutorial modal to skip...');
  await page.evaluate(() => {
    const skipBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('跳過教學'));
    if (skipBtn) {
      skipBtn.click();
      console.log('Tutorial skipped');
    }
  });
  await sleep(1000);

  // 6. Navigate to Home View
  console.log('Navigating to Home View...');
  await page.evaluate(() => {
    const navItems = Array.from(document.querySelectorAll('#bottom-nav span'));
    const homeNavItem = navItems.find(item => item.textContent.includes('首頁'));
    if (homeNavItem) {
      homeNavItem.parentElement.click();
    }
  });
  await sleep(2000);

  const dashboardPath = path.resolve(__dirname, 'screenshot_dashboard.png');
  await page.screenshot({ path: dashboardPath });
  console.log(`3a. Dashboard screenshot saved to: ${dashboardPath}`);

  // 6b. Navigate to Map View
  console.log('Navigating to Map View...');
  await page.evaluate(() => {
    const navItems = Array.from(document.querySelectorAll('#bottom-nav span'));
    const mapNavItem = navItems.find(item => item.textContent.includes('地圖'));
    if (mapNavItem) {
      mapNavItem.parentElement.click();
    }
  });
  await sleep(2000);

  const mapPath = path.resolve(__dirname, 'screenshot_map.png');
  await page.screenshot({ path: mapPath });
  console.log(`3b. Map screenshot saved to: ${mapPath}`);

  // 7. Click Check-in button (Camera icon button)
  console.log('Opening Check-in View...');
  await page.evaluate(() => {
    // Find the middle checkin button (it has absolute or Camera icon)
    const cameraIcon = document.querySelector('svg.lucide-camera');
    if (cameraIcon) {
      const btn = cameraIcon.closest('div') || cameraIcon.parentElement;
      if (btn) btn.click();
    } else {
      // Fallback: look for click on text "打卡"
      const cta = Array.from(document.querySelectorAll('#bottom-nav div')).find(div => div.textContent.includes('打卡'));
      if (cta) cta.click();
    }
  });
  await sleep(2000);

  const checkinPath = path.resolve(__dirname, 'screenshot_checkin.png');
  await page.screenshot({ path: checkinPath });
  console.log(`4. Check-in screenshot saved to: ${checkinPath}`);

  // Close check-in modal if overlay is present by clicking close/X or directly switching tab
  console.log('Navigating to Profile View...');
  await page.evaluate(() => {
    const navItems = Array.from(document.querySelectorAll('#bottom-nav span'));
    const profileNavItem = navItems.find(item => item.textContent.includes('我的'));
    if (profileNavItem) {
      profileNavItem.parentElement.click();
    }
  });
  await sleep(2000);

  const badgesPath = path.resolve(__dirname, 'screenshot_badges.png');
  await page.screenshot({ path: badgesPath });
  console.log(`5. Profile/Badges screenshot saved to: ${badgesPath}`);

  await browser.close();
  console.log('All app screenshots captured successfully!');
}

run().catch(console.error);
