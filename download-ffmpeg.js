const fs = require('fs');
const path = require('path');
const https = require('https');

const binDir = path.join(__dirname, 'api', 'bin');
const ffmpegPath = path.join(binDir, 'ffmpeg');

if (!fs.existsSync(binDir)) {
  fs.mkdirSync(binDir, { recursive: true });
}

if (fs.existsSync(ffmpegPath)) {
  console.log('✓ FFmpeg đã tồn tại trong build artifact.');
  process.exit(0);
}

console.log('⏳ Đang tải FFmpeg static binary cho Linux x64 (Build-time)...');
const url = 'https://github.com/eugeneware/ffmpeg-static/releases/download/b4.2.2/linux-x64';

const file = fs.createWriteStream(ffmpegPath);
https.get(url, (response) => {
  // Handle redirects if any
  if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
    console.log(`⏳ Redirecting to: ${response.headers.location}`);
    https.get(response.headers.location, (redirectResponse) => {
      redirectResponse.pipe(file);
      file.on('finish', () => {
        file.close();
        try {
          fs.chmodSync(ffmpegPath, 0o755); // Cấp quyền thực thi
          console.log('✓ Tải và cấp quyền FFmpeg thành công tại:', ffmpegPath);
        } catch (e) {
          console.error('⚠️ Lỗi cấp quyền thực thi:', e.message);
        }
      });
    });
  } else {
    response.pipe(file);
    file.on('finish', () => {
      file.close();
      try {
        fs.chmodSync(ffmpegPath, 0o755); // Cấp quyền thực thi
        console.log('✓ Tải và cấp quyền FFmpeg thành công tại:', ffmpegPath);
      } catch (e) {
        console.error('⚠️ Lỗi cấp quyền thực thi:', e.message);
      }
    });
  }
}).on('error', (err) => {
  fs.unlink(ffmpegPath, () => {});
  console.error('✗ Lỗi tải FFmpeg:', err.message);
  process.exit(1);
});
