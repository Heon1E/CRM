/**
 * Compress base64 image before upload
 * - Max dimension: 1024px
 * - JPEG quality: 0.6
 */
const compressImage = (base64Str) => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.src = base64Str;

    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');

      const MAX_DIM = 1024;
      let { width, height } = img;

      // Scale while preserving ratio
      if (width > height && width > MAX_DIM) {
        height = Math.round((height * MAX_DIM) / width);
        width = MAX_DIM;
      } else if (height > MAX_DIM) {
        width = Math.round((width * MAX_DIM) / height);
        height = MAX_DIM;
      }

      canvas.width = width;
      canvas.height = height;
      ctx.drawImage(img, 0, 0, width, height);

      const compressed = canvas.toDataURL('image/jpeg', 0.6);

      console.log('[Image Compression]');
      console.log('Original:', Math.round(base64Str.length / 1024), 'KB');
      console.log('Compressed:', Math.round(compressed.length / 1024), 'KB');

      resolve(compressed);
    };

    img.onerror = () => reject(new Error('Image compression failed'));
  });
};

export const extractBusinessCardInfo = async (base64Image) => {
  // 1. Compress BEFORE sending to Vercel
  const compressedImage = await compressImage(base64Image);

  // 2. Call backend
  const res = await fetch('/api/analyze-card', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ imageBase64: compressedImage }),
  });

  if (!res.ok) {
    const err = await res.json();
    console.error('[Gemini API Error]', err);
    throw err;
  }

  return res.json();
};
