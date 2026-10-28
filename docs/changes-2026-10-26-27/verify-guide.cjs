const { chromium } = require(require('path').join(require('os').tmpdir(), 'projectledger-document-tools/node_modules/playwright-core'));
const path = require('path');
const fs = require('fs');
(async () => {
  const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1300, height: 930 }, deviceScaleFactor: 1 });
    await page.goto('http://localhost:5173/');
    const meta = await page.evaluate(async () => {
      const lib = await import('/node_modules/pdfjs-dist/build/pdf.mjs');
      lib.GlobalWorkerOptions.workerSrc = '/node_modules/pdfjs-dist/build/pdf.worker.mjs';
      const data = await fetch('/docs/changes-2026-10-26-27/Phoenix-Engineers-Changes-and-User-Guide-26-27-Oct-2026.pdf').then(r => r.arrayBuffer());
      const pdf = await lib.getDocument({ data: new Uint8Array(data) }).promise;
      window.guidePdf = pdf;
      const pages = [];
      for (let n=1;n<=pdf.numPages;n++) {
        const p=await pdf.getPage(n), c=await p.getTextContent();
        pages.push({ page:n, text:c.items.map(i=>i.str).join(' ') });
      }
      return { pageCount: pdf.numPages, pages };
    });
    fs.writeFileSync(path.join(__dirname,'pdf-verification.json'),JSON.stringify(meta,null,2));
    for (const n of [1,3,4,6,7,8]) {
      await page.evaluate(async n => {
        const p=await window.guidePdf.getPage(n), v=p.getViewport({scale:1.5});
        document.body.innerHTML='<canvas id="preview"></canvas>';
        document.body.style.cssText='margin:0;background:white';
        const c=document.getElementById('preview');c.width=v.width;c.height=v.height;
        await p.render({canvasContext:c.getContext('2d'),viewport:v}).promise;
      }, n);
      await page.locator('canvas').screenshot({path:path.join(__dirname,`preview-page-${n}.png`)});
    }
    console.log(JSON.stringify({pageCount:meta.pageCount,pageStarts:meta.pages.map(p=>p.text.slice(0,115))},null,2));
    if(meta.pageCount!==8) throw new Error('Expected eight guide pages');
  } finally { await browser.close(); }
})().catch(e=>{console.error(e);process.exitCode=1});
