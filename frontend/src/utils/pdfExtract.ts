/**
 * PDF text extraction for the File Import tab — runs entirely client-side
 * via pdfjs-dist (lazy-loaded so the main bundle stays small).
 */

/** Extract the text of every page, joined with page breaks. */
export async function extractPdfText(file: File): Promise<string> {
  const pdfjs = await import('pdfjs-dist');
  const worker = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')) as { default: string };
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;

  const data = new Uint8Array(await file.arrayBuffer());
  const doc = await pdfjs.getDocument({ data }).promise;

  const pages: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    pages.push(
      content.items
        .map(item => (item as { str?: string }).str ?? '')
        .join(' ')
        .trim(),
    );
  }

  await doc.cleanup();
  return pages.join('\n').trim();
}
