const selectionBox = document.getElementById('selection-box');
let isDrawing = false;
let startX, startY;

document.addEventListener('mousedown', (e) => {
  isDrawing = true;
  startX = e.clientX;
  startY = e.clientY;
  selectionBox.style.left = `${startX}px`;
  selectionBox.style.top = `${startY}px`;
  selectionBox.style.width = '0px';
  selectionBox.style.height = '0px';
});

document.addEventListener('mousemove', (e) => {
  if (!isDrawing) return;

  const currentX = e.clientX;
  const currentY = e.clientY;

  const width = Math.abs(currentX - startX);
  const height = Math.abs(currentY - startY);

  const left = Math.min(startX, currentX);
  const top = Math.min(startY, currentY);

  selectionBox.style.left = `${left}px`;
  selectionBox.style.top = `${top}px`;
  selectionBox.style.width = `${width}px`;
  selectionBox.style.height = `${height}px`;
});

document.addEventListener('mouseup', (e) => {
  if (!isDrawing) return;
  isDrawing = false;

  const rect = {
    x: parseInt(selectionBox.style.left),
    y: parseInt(selectionBox.style.top),
    width: parseInt(selectionBox.style.width),
    height: parseInt(selectionBox.style.height),
  };

  if (rect.width > 0 && rect.height > 0) {
    window.electronAPI.selectionComplete(rect);
  } else {
    // If no selection was made, close the window without sending data
    window.electronAPI.selectionComplete(null);
  }
});