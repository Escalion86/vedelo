#!/usr/bin/env node
/**
 * Image optimization script for the Vedelo homepage
 * Uses sharp for fast WebP/AVIF generation
 */

const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const results = [];

async function optimize({ input, outputs, label }) {
  const inputPath = path.join(PUBLIC_DIR, input);
  if (!fs.existsSync(inputPath)) {
    console.log(`  SKIP: ${input} not found`);
    return;
  }

  const inputSize = fs.statSync(inputPath).size;
  console.log(`\nProcessing: ${label || input} (${fmt(inputSize)})`);

  const pipeline = sharp(inputPath);

  for (const output of outputs) {
    const outputPath = path.join(PUBLIC_DIR, output.path);
    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    let p = pipeline.clone();

    if (output.width || output.height) {
      p = p.resize(output.width || null, output.height || null, {
        fit: output.fit || 'inside',
        withoutEnlargement: true,
      });
    }

    const format = output.format;
    const opts = output.options || {};

    switch (format) {
      case 'webp':
        p = p.webp({ effort: 4, ...opts });
        break;
      case 'avif':
        p = p.avif({ effort: 4, ...opts });
        break;
      case 'png':
        p = p.png({ compressionLevel: 9, ...opts });
        break;
    }

    await p.toFile(outputPath);
    const outputSize = fs.statSync(outputPath).size;
    const savings = ((1 - outputSize / inputSize) * 100).toFixed(1);
    const arrow = Number(savings) > 0 ? 'smaller' : 'LARGER';
    console.log(`  -> ${output.path}: ${fmt(outputSize)} (${savings}% ${arrow})`);

    results.push({ input, inputSize, output: output.path, outputSize, format, savings: Number(savings) });
  }
}

function fmt(bytes) {
  if (bytes < 1024) return bytes + ' B';
  return (bytes / 1024).toFixed(1) + ' KB';
}

async function main() {
  console.log('=== Vedelo Image Optimization ===\n');

  // 1. Logo - the main homepage image (43KB PNG displayed at 36x36)
  // Generate properly sized WebP/AVIF versions
  await optimize({
    input: 'img/logo.png',
    label: 'Logo (43KB, displayed at 36x36)',
    outputs: [
      { path: 'img/logo-36.webp', format: 'webp', width: 36, height: 36, options: { quality: 85 } },
      { path: 'img/logo-36.avif', format: 'avif', width: 36, height: 36, options: { quality: 70 } },
      { path: 'img/logo-72.webp', format: 'webp', width: 72, height: 72, options: { quality: 85 } },
      { path: 'img/logo-72.avif', format: 'avif', width: 72, height: 72, options: { quality: 70 } },
    ],
  });

  // 2. OG Image (9.3KB PNG, 1200x630)
  await optimize({
    input: 'og-image.png',
    label: 'OG Image (9.3KB, 1200x630)',
    outputs: [
      { path: 'og-image-1200.webp', format: 'webp', width: 1200, options: { quality: 75 } },
      { path: 'og-image-1200.avif', format: 'avif', width: 1200, options: { quality: 60 } },
    ],
  });

  // 3. Root logo.png (10.6KB)
  await optimize({
    input: 'logo.png',
    label: 'Root Logo (10.6KB)',
    outputs: [
      { path: 'logo.webp', format: 'webp', options: { quality: 80 } },
      { path: 'logo.avif', format: 'avif', options: { quality: 65 } },
    ],
  });

  // Summary
  console.log('\n=== Summary ===');
  const totalOriginal = results.reduce((sum, r) => sum + r.inputSize, 0);
  const totalOptimized = results.reduce((sum, r) => sum + r.outputSize, 0);
  console.log(`Total original: ${fmt(totalOriginal)}`);
  console.log(`Total optimized outputs: ${fmt(totalOptimized)}`);
  console.log(`Files generated: ${results.length}`);

  // Legacy files
  console.log('\n=== Legacy/duplicate files safe to remove ===');
  const legacyFiles = [
    'og-image-old.png', 'og-image-original.png', 'og-image.jpg',
    'og-image-optimized.webp', 'og-image-optimized.avif',
    'img/logo-original.png', 'img/logo-lossless.webp',
    'img/logo-opt2.avif', 'img/logo-optimized.avif', 'img/logo-optimized.webp',
  ];
  let legacyTotal = 0;
  for (const f of legacyFiles) {
    const p = path.join(PUBLIC_DIR, f);
    if (fs.existsSync(p)) {
      const s = fs.statSync(p).size;
      legacyTotal += s;
      console.log(`  ${f} (${fmt(s)})`);
    }
  }
  console.log(`Total legacy: ${fmt(legacyTotal)}`);
}

main().catch(console.error);
