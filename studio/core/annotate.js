// Photo marks drawn into the picture (decision 0016): each mark is a box with its number, so the
// report copy carries them and the caption lists what each number shows. Drawn on a canvas, so
// the marks look the same on screen, in the PDF and on paper, whatever the page layout.

// Draws numbered boxes onto a JPEG data address; resolves a new JPEG data address. `marks` are
// {x, y, w, h} as fractions of the image; `style(i)` may return {dashed} for a mark.
export async function drawMarks(src, marks, style = () => ({})) {
  const img = new Image();
  img.src = src;
  await img.decode();
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
  const g = canvas.getContext('2d');
  g.drawImage(img, 0, 0);
  const unit = Math.max(2, Math.round(Math.max(canvas.width, canvas.height) / 300));
  marks.forEach((m, i) => {
    const [x, y, w, h] = [m.x * canvas.width, m.y * canvas.height, m.w * canvas.width, m.h * canvas.height];
    g.setLineDash(style(i).dashed ? [unit * 4, unit * 3] : []);
    g.lineWidth = unit * 2; g.strokeStyle = 'rgba(0,0,0,.65)'; g.strokeRect(x, y, w, h);
    g.lineWidth = unit; g.strokeStyle = '#ffd60a'; g.strokeRect(x, y, w, h);
    // The number, in a disc at the box's top-left corner, kept inside the picture.
    const r = unit * 7, cx = Math.min(Math.max(x, r), canvas.width - r), cy = Math.min(Math.max(y, r), canvas.height - r);
    g.setLineDash([]);
    g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.fillStyle = '#ffd60a'; g.fill();
    g.lineWidth = unit / 2; g.strokeStyle = 'rgba(0,0,0,.65)'; g.stroke();
    g.fillStyle = '#111'; g.font = `bold ${Math.round(r * 1.2)}px sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(String(i + 1), cx, cy + unit / 2);
  });
  return canvas.toDataURL('image/jpeg', 0.85);
}

// True where a canvas is available to draw marks (the apps; not the Node tests).
export const canDrawMarks = () => typeof document !== 'undefined' && typeof Image !== 'undefined';
