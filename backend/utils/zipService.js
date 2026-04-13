const fs = require('fs');
const path = require('path');
const archiver = require('archiver');

const TMP_DIR = path.join(__dirname, '..', 'tmp');
fs.mkdirSync(TMP_DIR, { recursive: true });

async function createZip(docs, downloadDocument) {
  const zipPath = path.join(TMP_DIR, `documentos_${Date.now()}.zip`);

  const output = fs.createWriteStream(zipPath);
  const archive = archiver('zip', { zlib: { level: 9 } });

  archive.pipe(output);

  for (const doc of docs) {
    if (!doc?.url) continue;

    try {
      const result = await downloadDocument(doc);
      archive.file(result.filePath, { name: result.downloadName });
    } catch (err) {
      console.error('No se pudo añadir al ZIP:', doc?.name, err.message);
    }
  }

  await archive.finalize();

  await new Promise((resolve, reject) => {
    output.on('close', resolve);
    output.on('error', reject);
    archive.on('error', reject);
  });

  return zipPath;
}

module.exports = {
  createZip,
};