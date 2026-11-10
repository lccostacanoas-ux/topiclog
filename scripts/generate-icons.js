const sharp = require('../apps/web/node_modules/sharp');
const fs = require('fs');
const path = require('path');

async function main() {
  const publicDir = path.resolve(__dirname, '../apps/web/public');
  const iconsDir = path.join(publicDir, 'icons');
  const resDir = path.resolve(__dirname, '../apps/web/android/app/src/main/res');
  const iosAppIconDir = path.resolve(__dirname, '../apps/web/ios/App/App/Assets.xcassets/AppIcon.appiconset');

  const svg192 = fs.readFileSync(path.join(iconsDir, 'icon-192.svg'));
  const svg512 = fs.readFileSync(path.join(iconsDir, 'icon-512.svg'));
  const svgMaskable = fs.readFileSync(path.join(iconsDir, 'icon-maskable.svg'));

  // 1. Web & PWA Icons
  await sharp(svg192).resize(192, 192).png().toFile(path.join(iconsDir, 'icon-192.png'));
  await sharp(svg512).resize(512, 512).png().toFile(path.join(iconsDir, 'icon-512.png'));
  await sharp(svgMaskable).resize(512, 512).png().toFile(path.join(iconsDir, 'icon-maskable.png'));
  await sharp(svg192).resize(180, 180).png().toFile(path.join(publicDir, 'apple-touch-icon.png'));
  await sharp(svg192).resize(32, 32).png().toFile(path.join(iconsDir, 'icon-32.png'));
  await sharp(svg192).resize(16, 16).png().toFile(path.join(iconsDir, 'icon-16.png'));
  console.log('Web & PWA icons generated!');

  // 2. Android Mipmap Icons
  const androidDensities = [
    { folder: 'mipmap-mdpi', size: 48 },
    { folder: 'mipmap-hdpi', size: 72 },
    { folder: 'mipmap-xhdpi', size: 96 },
    { folder: 'mipmap-xxhdpi', size: 144 },
    { folder: 'mipmap-xxxhdpi', size: 192 }
  ];

  for (const { folder, size } of androidDensities) {
    const targetFolder = path.join(resDir, folder);
    if (fs.existsSync(targetFolder)) {
      await sharp(svg192).resize(size, size).png().toFile(path.join(targetFolder, 'ic_launcher.png'));
      await sharp(svgMaskable).resize(size, size).png().toFile(path.join(targetFolder, 'ic_launcher_round.png'));
      await sharp(svg192).resize(size, size).png().toFile(path.join(targetFolder, 'ic_launcher_foreground.png'));
      console.log(`Generated Android icons for ${folder} (${size}x${size})`);
    }
  }

  // 3. iOS Xcode AppIcon (1024x1024)
  if (fs.existsSync(iosAppIconDir)) {
    await sharp(svg512).resize(1024, 1024).png().toFile(path.join(iosAppIconDir, 'AppIcon-512@2x.png'));
    console.log('Generated iOS AppIcon (1024x1024 px)!');
  }
}

main().catch(err => {
  console.error('Error generating icons:', err);
  process.exit(1);
});
