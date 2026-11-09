import { chromium } from 'playwright';
const browser = await chromium.connectOverCDP('http://127.0.0.1:9225');
for (const page of browser.contexts().flatMap(c => c.pages())) {
  console.log('PAGE', page.url(), await page.title());
  console.log('BUTTONS', (await page.getByRole('button').allTextContents()).join(' | ').slice(0, 1800));
  console.log('LATEX', await page.getByText('LaTeX Studio', { exact: true }).count());
}
await browser.close();
