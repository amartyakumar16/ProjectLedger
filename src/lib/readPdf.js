import { ocrTextToLines, textItemsToLines } from './pdfTables.js';

export async function readPdfFile(file, { ocrMode, signal, onProgress }) {
  let document;
  let loading;
  let worker;
  let workerPromise;
  let currentPage = 1;
  let total = 1;
  const check = () => { if (signal.aborted) throw new DOMException('Reading cancelled', 'AbortError'); };
  const abortable = (promise) => new Promise((resolve, reject) => {
    const cancel = () => reject(new DOMException('Reading cancelled', 'AbortError'));
    signal.addEventListener('abort', cancel, { once: true });
    if (signal.aborted) cancel();
    Promise.resolve(promise).then(resolve, reject).finally(() => signal.removeEventListener('abort', cancel));
  });
  const stop = () => { worker?.terminate().catch(() => {}); loading?.destroy().catch(() => {}); };
  signal.addEventListener('abort', stop);
  const recognize = async (canvas) => {
    check();
    if (!workerPromise) {
      onProgress({ page: currentPage, total, message: 'Loading OCR (first use downloads recognition files)…' });
      workerPromise = (async () => {
        const [{ createWorker }, { default: workerPath }] = await Promise.all([
          import('tesseract.js'), import('tesseract.js/dist/worker.min.js?url'),
        ]);
        return createWorker('eng', 1, { workerPath, errorHandler: () => {}, logger: (event) => {
          if (!signal.aborted && event.status === 'recognizing text') onProgress({ page: currentPage, total, message: `Reading scanned text: ${Math.round(event.progress * 100)}%` });
        } });
      })();
      workerPromise.then((w) => { if (signal.aborted) w.terminate().catch(() => {}); }, () => {});
    }
    worker = await abortable(workerPromise);
    check();
    const result = await abortable(worker.recognize(canvas));
    check();
    return ocrTextToLines(result.data.text, currentPage);
  };
  try {
    check();
    const lines = [];
    const pageInfo = [];
    if (file.type.startsWith('image/')) {
      const bitmap = await createImageBitmap(file);
      const canvas = window.document.createElement('canvas');
      const scale = Math.min(2, 2200 / bitmap.width);
      canvas.width = Math.round(bitmap.width * scale);
      canvas.height = Math.round(bitmap.height * scale);
      canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      bitmap.close();
      try { lines.push(...await recognize(canvas)); }
      finally { canvas.width = canvas.height = 0; }
      pageInfo.push({ page: 1, method: 'OCR' });
    } else {
      const [pdfjs, { default: workerUrl }] = await Promise.all([import('pdfjs-dist'), import('pdfjs-dist/build/pdf.worker.min.mjs?url')]);
      check();
      pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
      loading = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()), cMapUrl: `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjs.version}/cmaps/`, cMapPacked: true, standardFontDataUrl: `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjs.version}/standard_fonts/` });
      document = await abortable(loading.promise);
      total = document.numPages;
      for (currentPage = 1; currentPage <= total; currentPage++) {
        check();
        onProgress({ page: currentPage, total, message: 'Reading PDF text…' });
        const page = await document.getPage(currentPage);
        const content = await page.getTextContent();
        let pageLines = textItemsToLines(content.items, currentPage);
        let method = 'PDF text';
        if (ocrMode === 'always' || (ocrMode === 'auto' && pageLines.map((l) => l.text).join('').length < 40)) {
          const base = page.getViewport({ scale: 1 });
          const viewport = page.getViewport({ scale: Math.min(2.5, 2200 / base.width, 3500 / base.height) });
          const canvas = window.document.createElement('canvas');
          canvas.width = Math.ceil(viewport.width);
          canvas.height = Math.ceil(viewport.height);
          try {
            await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
            pageLines = await recognize(canvas);
          } finally { canvas.width = canvas.height = 0; }
          method = 'OCR';
        }
        check();
        lines.push(...pageLines);
        pageInfo.push({ page: currentPage, method, empty: !pageLines.length });
        page.cleanup();
      }
    }
    return { lines, pageInfo };
  } finally {
    signal.removeEventListener('abort', stop);
    if (workerPromise && !signal.aborted) { try { const w = await workerPromise; await w.terminate(); } catch { /* failed to initialize */ } }
    if (loading) { try { await loading.destroy(); } catch { /* already cancelled */ } }
  }
}
