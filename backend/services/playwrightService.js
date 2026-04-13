const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const axios = require('axios');

const SEARCH_LICITACIONES =
  'https://contrataciondelestado.es/wps/portal/plataforma/buscadores/busqueda/!ut/p/z1/jY9LT8MwEIR_C4dcvVvnARzTPF0VNRCcNL5UbgnIKK5DHvx-DOq1oXub1TczuyBgD-Isv9WHnJQ5y87qRgQHL9lFUZpTfCjdGOk25jzIrcx8qP8A3428alMVQckyRJan8ZavfMxoAOIWP16ZEG_zLwBiOb4GsVxBL8DSi_-VNPbI-0NYJc8he3Rxt36xFZvi6bXI6ArRg_I342Q0UUdN3uWpHUlvhqlrJ1KxpGYxNA5-jr2Dx3n8mts36WBqBj13clBmfdkRS0CvOd-jKrQO734AYHmecg!!/dz/d5/L2dBISEvZ0FBIS9nQSEh/';

const SEARCH_MENORES =
  'https://contrataciondelestado.es/wps/portal/plataforma/buscadores/busqueda/!ut/p/z1/04_Sj9CPykssy0xPLMnMz0vMAfIjo8ziTVz9nZ3dPIwMLIKNXQyMfFxCQ808gFx3U_1wsAJTY2eTMK-wALNgT3cDA08PNxefUENTA3cjM_0oYvQb4ACOBsTpx6MgCr_x4fpR-K0wgirA50VClhTkhoZGGGR6AgA3hHJw/dz/d5/L2dBISEvZ0FBIS9nQSEh/p0/IZ7_AVEQAI930OBRD02JPMTPG21004=CZ6_4EOCCFH208S3D02LDUU6HH20G5=LA0=Ecom.ibm.faces.portlet.VIEWID!QCPjspQCPbusquedaQCPMainBusqueda.jsp==/#Z7_AVEQAI930OBRD02JPMTPG21004';

const TMP_DIR = path.join(__dirname, '..', 'tmp');
fs.mkdirSync(TMP_DIR, { recursive: true });

function isUrl(input) {
  try {
    const parsed = new URL(input);
    return ['http:', 'https:'].includes(parsed.protocol);
  } catch {
    return false;
  }
}

function sanitizeFileName(name) {
  return String(name || 'documento')
    .replace(/[<>:"/\\|?*]+/g, '_')
    .replace(/\s+/g, ' ')
    .trim();
}

function detectType(name, url, meta = '') {
  const txt = `${name} ${url} ${meta}`.toLowerCase();

  if (txt.includes('.pdf') || txt.includes('documento pdf') || txt.includes(' pdf')) return 'pdf';
  if (txt.includes('.xml') || txt.includes('documento xml') || txt.includes(' xml')) return 'xml';
  if (txt.includes('.html') || txt.includes('documento html') || txt.includes(' html')) return 'html';
  if (txt.includes('.docx') || txt.includes(' docx')) return 'docx';
  if (txt.includes('.doc') || txt.includes(' doc')) return 'doc';
  if (txt.includes('.xlsx') || txt.includes(' xlsx')) return 'xlsx';
  if (txt.includes('.xls') || txt.includes(' xls')) return 'xls';
  if (txt.includes('.zip') || txt.includes(' zip')) return 'zip';
  if (txt.includes('sello de tiempo') || txt.includes('sello tiempo')) return 'stamp';
  if (txt.includes('visual') || txt.includes('ver documento')) return 'visualizable';

  return 'desconocido';
}

function getExtensionForDownload(type, url = '') {
  const safeType = String(type || '').toLowerCase();
  const lowUrl = String(url || '').toLowerCase();

  if (safeType === 'pdf' || lowUrl.includes('.pdf')) return 'pdf';
  if (safeType === 'xml' || lowUrl.includes('.xml')) return 'xml';
  if (safeType === 'html' || lowUrl.includes('.html')) return 'html';
  if (safeType === 'docx' || lowUrl.includes('.docx')) return 'docx';
  if (safeType === 'doc' || lowUrl.includes('.doc')) return 'doc';
  if (safeType === 'xlsx' || lowUrl.includes('.xlsx')) return 'xlsx';
  if (safeType === 'xls' || lowUrl.includes('.xls')) return 'xls';
  if (safeType === 'zip' || lowUrl.includes('.zip')) return 'zip';

  return 'bin';
}

function buildDownloadName(doc) {
  const ext = getExtensionForDownload(doc.type, doc.url);
  const baseName = sanitizeFileName(doc.baseName || doc.name || 'documento');
  return `${baseName}.${ext}`;
}

function uniqueBy(arr, keyFn) {
  const seen = new Set();
  const out = [];

  for (const item of arr) {
    const key = keyFn(item);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }

  return out;
}

async function withBrowser(fn) {
  const browser = await chromium.launch({ headless: true });

  try {
    const context = await browser.newContext({
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      viewport: { width: 1600, height: 1200 },
      acceptDownloads: true,
    });

    const page = await context.newPage();
    return await fn({ page, context, browser });
  } finally {
    await browser.close();
  }
}

async function acceptCookiesIfPresent(page) {
  const selectors = [
    '#onetrust-accept-btn-handler',
    'button:has-text("Aceptar")',
    'button:has-text("Accept")',
    'button:has-text("OK")',
  ];

  for (const selector of selectors) {
    try {
      const locator = page.locator(selector).first();
      if (await locator.count()) {
        await locator.click({ timeout: 1500 });
        return;
      }
    } catch {}
  }
}

async function fillInput(page, locator, value) {
  try {
    await locator.scrollIntoViewIfNeeded().catch(() => {});
    await locator.click({ timeout: 2000 });
    await locator.fill('');
    await locator.fill(value, { timeout: 5000 });
    const current = await locator.inputValue().catch(() => '');
    return current.trim() === value.trim();
  } catch {
    return false;
  }
}

async function fillLicitacionesInput(page, query) {
  const selectors = [
    'input[name*="exped"]:visible',
    'input[id*="exped"]:visible',
    'input[name*="file"]:visible',
    'input[id*="file"]:visible',
    'input[aria-label*="File" i]:visible',
    'input[placeholder*="File" i]:visible',
    'input:visible',
  ];

  for (const selector of selectors) {
    try {
      const input = page.locator(selector).first();
      if (await input.count()) {
        if (await fillInput(page, input, query)) return true;
      }
    } catch {}
  }

  return false;
}

async function openMinorContractsForm(page) {
  const selectors = [
    '#viewns_Z7_AVEQAI930OBRD02JPMTPG21004_:form1:linkFormularioBusquedaContratosMenores',
    'a[id*="linkFormularioBusquedaContratosMenores"]',
    'a:has-text("Minor Contracts")',
    'article a:has-text("Minor Contracts")',
  ];

  for (const selector of selectors) {
    try {
      const link = page.locator(selector).first();
      if (await link.count()) {
        await Promise.all([
          page.waitForLoadState('domcontentloaded', { timeout: 15000 }).catch(() => {}),
          link.click({ timeout: 5000 }),
        ]);
        await page.waitForTimeout(3000);
        return true;
      }
    } catch {}
  }

  return false;
}

async function fillMinorExpedienteInput(page, query) {
  const htmlBefore = await page.content().catch(() => '');
  if (htmlBefore.toLowerCase().includes('searchers') && htmlBefore.toLowerCase().includes('minor contracts')) {
    const opened = await openMinorContractsForm(page);
    if (!opened) return false;
  }

  try {
    const byLabel = page.getByLabel('File', { exact: true }).first();
    if (await byLabel.count()) {
      if (await fillInput(page, byLabel, query)) return true;
    }
  } catch {}

  const xpathCandidates = [
    'xpath=(//*[normalize-space(text())="File"])[1]/following::input[1]',
    'xpath=(//*[contains(normalize-space(.),"Search form Minor Contracts")])[1]/following::input[1]',
    'xpath=(//input[contains(@id,"text71ExpMAQ")])[1]',
    'xpath=(//input[not(@type="hidden")])[1]',
  ];

  for (const selector of xpathCandidates) {
    try {
      const input = page.locator(selector).first();
      if (await input.count()) {
        if (await fillInput(page, input, query)) return true;
      }
    } catch {}
  }

  try {
    const visibleInputs = page.locator('input:visible');
    const count = await visibleInputs.count();

    for (let i = 0; i < Math.min(count, 6); i++) {
      const input = visibleInputs.nth(i);
      const type = ((await input.getAttribute('type')) || '').toLowerCase();
      if (['hidden', 'submit', 'button', 'checkbox', 'radio'].includes(type)) continue;

      if (await fillInput(page, input, query)) return true;
    }
  } catch {}

  return false;
}

async function submitSearch(page) {
  const selectors = [
    'button:has-text("Buscar")',
    'button:has-text("Search")',
    'input[type="submit"]:visible',
    'button[type="submit"]:visible',
  ];

  for (const selector of selectors) {
    try {
      const locator = page.locator(selector).first();
      if (await locator.count()) {
        await locator.click({ timeout: 3000 });
        return;
      }
    } catch {}
  }

  await page.keyboard.press('Enter');
}

async function waitForResultsTable(page) {
  const selectors = ['table', '.table', 'tbody tr', 'table tr'];

  for (const selector of selectors) {
    try {
      await page.locator(selector).first().waitFor({ timeout: 10000 });
      return;
    } catch {}
  }

  await page.waitForTimeout(3000);
}

async function looksLikeDetailPage(page) {
  const html = await page.content().catch(() => '');
  const low = html.toLowerCase();

  return (
    low.includes('advertisements and documents') ||
    low.includes('anuncios y documentos') ||
    low.includes('otros documentos') ||
    low.includes('mytabladetallevisuoe') ||
    low.includes('tableex1_aux') ||
    low.includes('getdocumentbyidservlet')
  );
}

async function saveMinorResultsDebug(page, query) {
  const ts = Date.now();
  const htmlPath = path.join(TMP_DIR, `minor-results-${sanitizeFileName(query)}-${ts}.html`);
  const pngPath = path.join(TMP_DIR, `minor-results-${sanitizeFileName(query)}-${ts}.png`);

  try {
    fs.writeFileSync(htmlPath, await page.content(), 'utf8');
  } catch {}

  try {
    await page.screenshot({ path: pngPath, fullPage: true });
  } catch {}

  return { htmlPath, pngPath };
}

async function clickExpedienteResultLicitaciones(page, query) {
  await waitForResultsTable(page);
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(1500);

  const rows = page.locator('table tr, tbody tr');
  const rowCount = await rows.count();

  for (let i = 0; i < rowCount; i++) {
    const row = rows.nth(i);

    let rowText = '';
    try {
      rowText = await row.innerText();
    } catch {
      continue;
    }

    if (!rowText.toLowerCase().includes(query.toLowerCase())) continue;

    const links = row.locator('a[href]');
    const linkCount = await links.count();

    for (let j = 0; j < linkCount; j++) {
      const link = links.nth(j);

      try {
        const linkText = ((await link.innerText()) || '').trim();
        const href = ((await link.getAttribute('href')) || '').trim();
        const combined = `${linkText} ${href}`.toLowerCase();

        if (
          linkText.toLowerCase() === query.toLowerCase() ||
          combined.includes(query.toLowerCase()) ||
          combined.includes('detalle') ||
          combined.includes('deeplink') ||
          combined.includes('idevl=') ||
          combined.includes('detalle_licitacion')
        ) {
          await Promise.all([
            page.waitForLoadState('domcontentloaded', { timeout: 20000 }).catch(() => {}),
            link.click({ timeout: 5000 }),
          ]);

          await page.waitForTimeout(5000);

          if (await looksLikeDetailPage(page)) return true;
        }
      } catch {}
    }
  }

  return false;
}

async function openMinorDetailFromResults(page, query) {
  await waitForResultsTable(page);
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(1500);

  const detailInfo = await page.evaluate((expediente) => {
    function abs(href) {
      if (!href) return '';
      if (href.startsWith('http://') || href.startsWith('https://')) return href;
      if (href.startsWith('/')) return `${location.origin}${href}`;
      return new URL(href, location.href).href;
    }

    const normalized = String(expediente).trim().toLowerCase();
    const rows = Array.from(document.querySelectorAll('table tr, tbody tr'));

    for (const row of rows) {
      const rowText = (row.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase();
      if (!rowText.includes(normalized)) continue;

      // 1) Prioridad total: link deeplink visible en nueva ventana
      const anchors = Array.from(row.querySelectorAll('a'));
      for (const a of anchors) {
        const href = a.getAttribute('href') || a.href || '';
        const lowHref = href.toLowerCase();
        if (lowHref.includes('deeplink:detalle_licitacion') || lowHref.includes('idevl=')) {
          return { mode: 'url', value: abs(href) };
        }
      }

      // 2) Si no hay deeplink, usar submitForm del enlace del expediente
      for (const a of anchors) {
        const text = (a.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase();
        if (text !== normalized) continue;

        const href = a.getAttribute('href') || '';
        if (href && href !== '#') {
          return { mode: 'url', value: abs(href) };
        }

        const onclick = a.getAttribute('onclick') || '';
        if (onclick) {
          return { mode: 'click', elementId: a.id || '' };
        }
      }
    }

    return null;
  }, query);

  if (!detailInfo) {
    const debug = await saveMinorResultsDebug(page, query);
    throw new Error(
      `No se pudo obtener la URL del detalle del contrato menor. Depuración: ${debug.htmlPath} y ${debug.pngPath}`
    );
  }

  if (detailInfo.mode === 'url') {
    await page.goto(detailInfo.value, {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });

    await page.waitForTimeout(5000);
  } else if (detailInfo.mode === 'click' && detailInfo.elementId) {
    const clicked = page.locator(`#${CSS.escape(detailInfo.elementId)}`).first();

    await Promise.all([
      page.waitForLoadState('domcontentloaded', { timeout: 20000 }).catch(() => {}),
      clicked.click({ timeout: 5000 }),
    ]);

    await page.waitForTimeout(5000);
  }

  if (!(await looksLikeDetailPage(page))) {
    const debug = await saveMinorResultsDebug(page, query);
    throw new Error(
      `Se obtuvo un acceso al resultado, pero no abrió el detalle real del contrato menor. Depuración: ${debug.htmlPath} y ${debug.pngPath}`
    );
  }

  return true;
}

async function searchLicitaciones(page, query) {
  await page.goto(SEARCH_LICITACIONES, {
    waitUntil: 'domcontentloaded',
    timeout: 60000,
  });

  await page.waitForTimeout(3000);
  await acceptCookiesIfPresent(page);

  const filled = await fillLicitacionesInput(page, query);
  if (!filled) {
    throw new Error('No se encontró un campo visible y editable para buscar el expediente.');
  }

  await submitSearch(page);
  return await clickExpedienteResultLicitaciones(page, query);
}

async function searchMenores(page, query) {
  await page.goto(SEARCH_MENORES, {
    waitUntil: 'domcontentloaded',
    timeout: 60000,
  });

  await page.waitForTimeout(3000);
  await acceptCookiesIfPresent(page);

  const filled = await fillMinorExpedienteInput(page, query);
  if (!filled) {
    const debug = await saveMinorResultsDebug(page, query);
    throw new Error(
      `No se encontró el campo Expediente del buscador de contratos menores. Depuración: ${debug.htmlPath} y ${debug.pngPath}`
    );
  }

  await submitSearch(page);
  return await openMinorDetailFromResults(page, query);
}

async function extractStructuredDocuments(page) {
  return page.evaluate(() => {
    function clean(text) {
      return (text || '').replace(/\s+/g, ' ').trim();
    }

    function abs(href) {
      if (!href) return '';
      if (href.startsWith('http://') || href.startsWith('https://')) return href;
      if (href.startsWith('/')) return `${location.origin}${href}`;
      return new URL(href, location.href).href;
    }

    function buildDocsFromTable(tableSelector, sectionName) {
      const table = document.querySelector(tableSelector);
      if (!table) return [];

      const rows = Array.from(table.querySelectorAll('tbody tr'));
      const docs = [];

      for (const row of rows) {
        const tds = Array.from(row.querySelectorAll('td'));
        if (tds.length < 3) continue;

        const rawTexts = tds.map((td) => clean(td.textContent));
        const dateText = rawTexts[0] || '';
        const nameText = rawTexts[1] || 'Documento';
        const actionCell = tds[2];

        const anchors = Array.from(actionCell.querySelectorAll('a'));
        if (!anchors.length) {
          docs.push({
            section: sectionName,
            postDate: dateText,
            name: nameText,
            url: '',
            type: 'visualizable',
            status: 'sin_enlace_directo',
            meta: ''
          });
          continue;
        }

        for (const a of anchors) {
          const href = abs(a.getAttribute('href') || a.href || '');
          const title = clean(a.getAttribute('title') || '');
          const aria = clean(a.getAttribute('aria-label') || '');
          const img = a.querySelector('img');
          const alt = clean(img?.getAttribute('alt') || '');
          const text = clean(a.textContent || '');

          const meta = `${title} ${aria} ${alt} ${text} ${href}`.toLowerCase();

          let type = 'desconocido';
          if (meta.includes('documento html') || meta.includes('.html')) type = 'html';
          else if (meta.includes('documento xml') || meta.includes('.xml')) type = 'xml';
          else if (meta.includes('documento pdf') || meta.includes('.pdf')) type = 'pdf';
          else if (meta.includes('sello de tiempo') || meta.includes('sello tiempo')) type = 'stamp';
          else if (meta.includes('ver')) type = 'visualizable';

          docs.push({
            section: sectionName,
            postDate: dateText,
            name: nameText,
            url: href,
            type,
            status: href ? 'detectado' : 'sin_enlace_directo',
            meta
          });
        }
      }

      return docs;
    }

    return [
      ...buildDocsFromTable('#myTablaDetalleVISUOE', 'Advertisements and documents'),
      ...buildDocsFromTable('table[id*="TableEx1_Aux"]', 'Otros Documentos'),
    ];
  });
}

async function extractDocumentsFromCurrentPage(page) {
  const bodyText = await page.locator('body').innerText().catch(() => '');
  if (bodyText.toLowerCase().includes('debe rellenar los criterios')) {
    throw new Error(
      'La URL abre una pantalla genérica de la plataforma y no el detalle real del expediente.'
    );
  }

  const docs = await extractStructuredDocuments(page);

  let allDocs = docs.map((doc) => {
    const finalType = detectType(doc.name, doc.url, doc.meta);

    const suffix =
      finalType === 'pdf' || finalType === 'xml' || finalType === 'html'
        ? ` (${finalType.toUpperCase()})`
        : finalType === 'stamp'
          ? ' (Sello de tiempo)'
          : '';

    return {
      id: `${doc.section}__${doc.name}__${doc.url || doc.type}`,
      section: doc.section,
      postDate: doc.postDate,
      name: `${doc.name}${suffix}`,
      baseName: doc.name,
      url: doc.url || '',
      type: finalType,
      status: doc.status || (doc.url ? 'detectado' : 'sin_enlace_directo'),
    };
  });

  allDocs = allDocs.filter((doc) => {
    const low = `${doc.name} ${doc.url}`.toLowerCase();
    return !low.includes('deferred modules');
  });

  allDocs = uniqueBy(allDocs, (doc) => `${doc.baseName}__${doc.url}__${doc.type}`);

  if (!allDocs.length) {
    const htmlPath = path.join(TMP_DIR, `debug-${Date.now()}.html`);
    fs.writeFileSync(htmlPath, await page.content(), 'utf8');

    throw new Error(
      `No se detectaron documentos útiles. Se ha guardado una copia HTML para depuración en: ${htmlPath}`
    );
  }

  return allDocs;
}

async function processQuery(query) {
  if (!query || !String(query).trim()) {
    throw new Error('Debes introducir un número de expediente o una URL.');
  }

  const trimmed = String(query).trim();

  return withBrowser(async ({ page }) => {
    if (isUrl(trimmed)) {
      await page.goto(trimmed, {
        waitUntil: 'domcontentloaded',
        timeout: 60000,
      });
      await page.waitForTimeout(7000);

      const docs = await extractDocumentsFromCurrentPage(page);

      return {
        mode: 'url',
        expediente: '',
        documents: docs,
      };
    }

    let found = false;

    try {
      found = await searchLicitaciones(page, trimmed);
    } catch {}

    if (!found) {
      found = await searchMenores(page, trimmed);
    }

    if (!found) {
      throw new Error(
        'No se pudo abrir el detalle real del expediente desde la tabla de resultados.'
      );
    }

    await page.waitForTimeout(5000);

    const docs = await extractDocumentsFromCurrentPage(page);

    return {
      mode: 'search',
      expediente: trimmed,
      documents: docs,
    };
  });
}

async function downloadDocument(doc) {
  if (!doc || !doc.url) {
    throw new Error('Este documento no tiene enlace directo de descarga.');
  }

  const ext = getExtensionForDownload(doc.type, doc.url);
  const downloadName = buildDownloadName(doc);

  const filePath = path.join(
    TMP_DIR,
    `${Date.now()}_${sanitizeFileName(doc.baseName || doc.name)}.${ext}`
  );

  const res = await axios.get(doc.url, {
    responseType: 'arraybuffer',
    timeout: 60000,
    maxRedirects: 5,
    validateStatus: (status) => status >= 200 && status < 400,
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    },
  });

  fs.writeFileSync(filePath, res.data);

  return {
    filePath,
    downloadName,
  };
}

module.exports = {
  processQuery,
  downloadDocument,
};