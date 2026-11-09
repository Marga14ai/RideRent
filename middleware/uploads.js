const multer = require('multer');
const path = require('path');
const fs = require('fs');

function uploader(subdir, prefix) {
  const target = path.join(__dirname, '..', ...(subdir==='registrations'?['private',subdir]:['public','uploads',subdir]));
  fs.mkdirSync(target, { recursive: true });
  const storage = multer.diskStorage({
    destination: (_, __, cb) => cb(null, target),
    filename: (_, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      cb(null, `${prefix}-${Date.now()}-${Math.round(Math.random() * 1e6)}${ext}`);
    }
  });
  return multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (_, file, cb) => {
      const ok = ['.jpg', '.jpeg', '.png', '.webp', '.pdf'].includes(path.extname(file.originalname).toLowerCase());
      cb(ok ? null : new Error('Only JPG, PNG, WEBP, or PDF files are allowed.'), ok);
    }
  });
}

module.exports = { uploader };
