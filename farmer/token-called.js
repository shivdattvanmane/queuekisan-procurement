/**
 * KrushiDarpan - Token Called Logic
 */

document.addEventListener('DOMContentLoaded', async () => {
  const booking = await readBookingData();

  document.getElementById('tcToken').textContent = booking.tokenNumber;
  document.getElementById('tcCentre').textContent = booking.centre;
  const payload = window.QueueKisanQR.makePayload(booking);
  window.QueueKisanQR.draw(document.getElementById('tcQrCanvas'), payload, 200);

  document.getElementById('backBtn').addEventListener('click', () => {
    window.location.href = 'live-queue.html';
  });

  document.getElementById('proceedBtn').addEventListener('click', () => {
    window.location.href = 'farmer-checkin.html';
  });
});

async function readBookingData() {
  const booking = await window.KrushiAPI.getActiveBooking();
  return booking || { tokenNumber: '—', centre: '—' };
}

function drawQR(canvas, data) {
  if (!canvas) return;

  const size = 200;
  const cells = 15;
  const cellSize = size / cells;
  const context = canvas.getContext('2d');
  let seed = hashString(data);

  canvas.width = size;
  canvas.height = size;
  context.fillStyle = '#FFFFFF';
  context.fillRect(0, 0, size, size);

  context.fillStyle = '#1A1A1A';
  drawFinderPattern(context, 0, 0, cellSize);
  drawFinderPattern(context, (cells - 3) * cellSize, 0, cellSize);
  drawFinderPattern(context, 0, (cells - 3) * cellSize, cellSize);

  for (let row = 0; row < cells; row += 1) {
    for (let column = 0; column < cells; column += 1) {
      const isFinder = (row < 3 && column < 3)
        || (row < 3 && column >= cells - 3)
        || (row >= cells - 3 && column < 3);
      if (isFinder) continue;

      seed = (seed * 16807 + 12345) & 0x7fffffff;
      if (seed % 2 !== 0) {
        context.fillRect(column * cellSize + 0.5, row * cellSize + 0.5, cellSize - 1, cellSize - 1);
      }
    }
  }
}

function drawFinderPattern(context, x, y, cellSize) {
  context.fillStyle = '#1A1A1A';
  context.fillRect(x, y, cellSize * 3, cellSize * 3);
  context.fillStyle = '#FFFFFF';
  context.fillRect(x + cellSize * 0.5, y + cellSize * 0.5, cellSize * 2, cellSize * 2);
  context.fillStyle = '#1A1A1A';
  context.fillRect(x + cellSize, y + cellSize, cellSize, cellSize);
}

function hashString(value) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) - hash) + value.charCodeAt(index);
    hash |= 0;
  }
  return Math.abs(hash) || 1;
}
