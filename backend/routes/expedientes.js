const express = require('express');
const router = express.Router();

const {
  processQuery,
  downloadDocument
} = require('../services/playwrightService');

const { createZip } = require('../utils/zipService');

router.post('/search', async (req, res) => {
  try {
    const { query } = req.body;

    const result = await processQuery(query);
    return res.json(result);
  } catch (err) {
    console.error('ERROR /search:', err);
    return res.status(500).json({
      error: err.message || 'Error interno al buscar el expediente.',
    });
  }
});

router.post('/download', async (req, res) => {
  try {
    const { doc } = req.body;

    if (!doc || !doc.url) {
      return res.status(400).json({ error: 'Documento no válido.' });
    }

    const result = await downloadDocument(doc);
    return res.download(result.filePath, result.downloadName);
  } catch (err) {
    console.error('ERROR /download:', err);
    return res.status(500).json({
      error: err.message || 'Error al descargar el documento.',
    });
  }
});

router.post('/download-zip', async (req, res) => {
  try {
    const { docs, expediente } = req.body;

    if (!Array.isArray(docs) || docs.length === 0) {
      return res.status(400).json({ error: 'No has seleccionado documentos.' });
    }

    const zipPath = await createZip(docs, downloadDocument);
    const zipName = expediente
      ? `expediente_${String(expediente).trim()}.zip`
      : 'documentos.zip';

    return res.download(zipPath, zipName);
  } catch (err) {
    console.error('ERROR /download-zip:', err);
    return res.status(500).json({
      error: err.message || 'Error al generar el ZIP.',
    });
  }
});

module.exports = router;