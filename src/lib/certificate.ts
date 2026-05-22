/**
 * Client-side certificate generator using HTML5 Canvas
 */
export async function generateCertificate(
  track: 'veg' | 'plastic' | 'dual',
  playerName: string,
  dateString: string
): Promise<string> {
  const canvas = document.createElement('canvas');
  canvas.width = 1200;
  canvas.height = 1700;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Could not get 2D context');
  }

  // 1. Draw Cream Background Gradient
  const grad = ctx.createLinearGradient(0, 0, 1200, 1700);
  grad.addColorStop(0, '#FFFDF9');
  grad.addColorStop(1, '#F7F2E8');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 1200, 1700);

  // 2. Draw Borders
  // Outer gold double frame
  ctx.strokeStyle = '#FFD166';
  ctx.lineWidth = 12;
  ctx.strokeRect(40, 40, 1120, 1620);

  ctx.strokeStyle = '#FFB703';
  ctx.lineWidth = 4;
  ctx.strokeRect(60, 60, 1080, 1580);

  // Inner thin border
  ctx.strokeStyle = 'rgba(218, 165, 32, 0.2)';
  ctx.lineWidth = 2;
  ctx.strokeRect(80, 80, 1040, 1540);

  // Decorative corners
  const drawCorner = (x: number, y: number, xDir: number, yDir: number) => {
    ctx.strokeStyle = '#FF9F1C';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(x, y + yDir * 50);
    ctx.lineTo(x, y);
    ctx.lineTo(x + xDir * 50, y);
    ctx.stroke();
  };
  drawCorner(95, 95, 1, 1);
  drawCorner(1105, 95, -1, 1);
  drawCorner(95, 1605, 1, -1);
  drawCorner(1105, 1605, -1, -1);

  // 3. Load and Draw Track Badge Image
  let badgePath = '';
  if (track === 'veg') {
    badgePath = '/badges/Veg_5.png';
  } else if (track === 'plastic') {
    badgePath = '/badges/Plastic_5.png';
  } else {
    badgePath = '/badges/Dual_5.png';
  }

  try {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = badgePath;
    await new Promise<void>((resolve, reject) => {
      img.onload = () => {
        // Draw badge image in center
        ctx.save();
        // Add subtle shadow to badge
        ctx.shadowColor = 'rgba(0, 0, 0, 0.15)';
        ctx.shadowBlur = 30;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 15;
        ctx.drawImage(img, 600 - 150, 200, 300, 300);
        ctx.restore();
        resolve();
      };
      img.onerror = () => {
        // Draw backup circle if image fails to load
        ctx.fillStyle = '#FFD166';
        ctx.beginPath();
        ctx.arc(600, 350, 120, 0, Math.PI * 2);
        ctx.fill();
        ctx.font = '72px sans-serif';
        ctx.fillText('🏅', 564, 375);
        resolve();
      };
    });
  } catch (e) {
    console.error('Error loading badge image:', e);
  }

  // 4. Draw Header Texts
  ctx.textAlign = 'center';
  ctx.fillStyle = '#1D2A44'; // Navy

  // "永續大挑戰 榮譽證書"
  ctx.font = "bold 56px 'Noto Sans TC', 'Microsoft JhengHei', sans-serif";
  ctx.fillText('永續大挑戰 榮譽證書', 600, 600);

  // "CERTIFICATE OF HONOR"
  ctx.fillStyle = '#5E6E8D';
  ctx.font = "bold 24px 'Nunito', sans-serif";
  ctx.fillText('CERTIFICATE OF HONOR', 600, 650);

  // Gold divider line
  ctx.strokeStyle = '#FFD166';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(450, 690);
  ctx.lineTo(750, 690);
  ctx.stroke();

  // 5. Draw Recipient Name
  ctx.fillStyle = '#7D8DAA';
  ctx.font = "500 28px 'Noto Sans TC', sans-serif";
  ctx.fillText('頒發給探險家', 600, 770);

  ctx.fillStyle = '#1D2A44';
  ctx.font = "bold 68px 'Noto Sans TC', sans-serif";
  const nameText = playerName || '訪客探險家';
  ctx.fillText(nameText, 600, 880);

  // Underline for name
  const nameWidth = ctx.measureText(nameText).width;
  ctx.strokeStyle = 'rgba(29, 42, 68, 0.2)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(600 - nameWidth / 2 - 30, 910);
  ctx.lineTo(600 + nameWidth / 2 + 30, 910);
  ctx.stroke();

  // 6. Draw Description Text
  ctx.fillStyle = '#3A4B6B';
  ctx.font = "500 30px 'Noto Sans TC', sans-serif";
  
  let descText = '';
  if (track === 'dual') {
    descText = '恭喜完成最高難度的【雙軌挑戰】任務！您已成功集滿所有軌道的徽章（蔬食、減塑、雙軌整合），在日常生活中實踐永續行動，展現無比的毅力與愛心，特頒此證，以茲表揚其為守護地球做出的卓越貢獻！';
  } else if (track === 'veg') {
    descText = '恭喜完成【蔬食行動】任務！您已成功解鎖所有蔬食關卡，為地球減少碳排放做出實際行動，特頒此證，以茲表揚其優異表現！';
  } else {
    descText = '恭喜完成【減塑行動】任務！您已成功解鎖所有減塑關卡，為保護海洋與生態做出實際行動，特頒此證，以茲表揚其優異表現！';
  }

  wrapText(ctx, descText, 600, 990, 860, 48);

  // 7. Draw Signatures and Stamps
  // Left side signature
  ctx.textAlign = 'left';
  ctx.fillStyle = '#7D8DAA';
  ctx.font = "bold 24px 'Noto Sans TC', sans-serif";
  ctx.fillText('慈心大挑戰小組', 180, 1420);

  // Signature line
  ctx.strokeStyle = '#D1D5DB';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(180, 1370);
  ctx.lineTo(380, 1370);
  ctx.stroke();

  // Simulated handwritten signature
  ctx.fillStyle = '#1D2A44';
  ctx.font = "italic 40px 'Nunito', 'Brush Script MT', cursive, sans-serif";
  ctx.fillText('toafhc team', 190, 1350);

  // Right side date
  ctx.textAlign = 'left';
  ctx.fillStyle = '#7D8DAA';
  ctx.font = "bold 24px 'Noto Sans TC', sans-serif";
  ctx.fillText('頒發日期', 820, 1420);

  // Date line
  ctx.strokeStyle = '#D1D5DB';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(820, 1370);
  ctx.lineTo(1020, 1370);
  ctx.stroke();

  ctx.fillStyle = '#1D2A44';
  ctx.font = "bold 32px 'Nunito', sans-serif";
  ctx.fillText(dateString, 830, 1350);

  // Middle Approved Stamp
  ctx.save();
  ctx.translate(600, 1360);
  ctx.rotate((12 * Math.PI) / 180); // Rotate 12 degrees
  
  // Outer circle of stamp
  ctx.strokeStyle = 'rgba(239, 68, 68, 0.45)';
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.arc(0, 0, 75, 0, Math.PI * 2);
  ctx.stroke();
  
  // Inner circle of stamp
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(0, 0, 68, 0, Math.PI * 2);
  ctx.stroke();

  // Text inside stamp
  ctx.fillStyle = 'rgba(239, 68, 68, 0.45)';
  ctx.textAlign = 'center';
  ctx.font = "900 24px 'Nunito', sans-serif";
  ctx.fillText('APPROVED', 0, 8);
  
  ctx.restore();

  return canvas.toDataURL('image/png');
}

// Helper function to wrap text on canvas
function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number
) {
  const chars = text.split('');
  let line = '';
  let currentY = y;

  for (let n = 0; n < chars.length; n++) {
    const testLine = line + chars[n];
    const metrics = ctx.measureText(testLine);
    const testWidth = metrics.width;
    if (testWidth > maxWidth && n > 0) {
      ctx.fillText(line, x, currentY);
      line = chars[n];
      currentY += lineHeight;
    } else {
      line = testLine;
    }
  }
  ctx.fillText(line, x, currentY);
}
