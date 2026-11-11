// CK Pressure Washing — builds a small, clean PDF of an invoice, receipt or
// estimate on demand. Opened from a link (works on phones and desktops, no
// print dialog needed) and meant to be shared by link instead of as an email
// attachment: it is only a few KB, and it never includes job photos (those are
// what make a "Print > Save as PDF" file huge).
//
//   GET /api/invoice-pdf?token=<public_token>            -> opens in the browser
//   GET /api/invoice-pdf?token=<public_token>&download=1 -> forces a download
//
// Env vars (same ones the other functions use): SUPABASE_URL, SUPABASE_ANON_KEY.
// Looks the job up through the same narrow get_estimate_by_token RPC as the
// public invoice page, so the link only ever reveals the one job it belongs to.

const { PDFDocument, StandardFonts, rgb, degrees } = require('pdf-lib');
const { createClient } = require('@supabase/supabase-js');

function env(name){ return String(process.env[name] || '').trim().replace(/^["']+|["']+$/g, ''); }

const NAVY = rgb(0.078, 0.188, 0.373);   // #14305F
const GOLD = rgb(0.831, 0.655, 0.173);   // #D4A72C
const INK = rgb(0.11, 0.14, 0.2);
const MUTED = rgb(0.36, 0.4, 0.47);
const LINE = rgb(0.89, 0.91, 0.93);
const GREEN = rgb(0.12, 0.5, 0.29);

// The built-in PDF fonts only know Latin-1; swap or drop anything else so a
// stray emoji or curly quote can never crash the file.
function clean(s){
  return String(s == null ? '' : s)
    .replace(/[‘’]/g, "'").replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-').replace(/…/g, '...').replace(/•/g, '*')
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, '');
}
const money = (n) => {
  const v = Math.round(Number(n || 0) * 100) / 100;
  return (v < 0 ? '-$' : '$') + Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};
function fmtDate(ymd){
  if (!ymd) return '';
  const d = new Date(String(ymd).slice(0, 10) + 'T12:00:00Z');
  if (isNaN(d)) return '';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}

// Same math as the dashboard's invoiceTotal()/amountReceived()/jobBalanceDue().
function compute(job){
  const items = (job.line_items && job.line_items.length)
    ? job.line_items.map((li) => ({ description: li.description, quantity: Number(li.quantity), unit_price: Number(li.unit_price) }))
    : [{ description: job.service_type || 'Service', quantity: 1, unit_price: Number(job.price) || 0 }];
  const total = items.reduce((s, li) => s + li.quantity * li.unit_price, 0);
  let received = 0;
  if (job.status === 'paid') received = (job.amount_paid != null && job.amount_paid !== '') ? Number(job.amount_paid) : total;
  else if (job.status === 'completed') received = Number(job.amount_paid || 0);
  let balance = Math.round((total - received) * 100) / 100;
  if (balance < 0.005) balance = 0;
  return { items, total, received, balance };
}

function wrap(font, text, size, maxWidth){
  const words = clean(text).split(/\s+/).filter(Boolean);
  const lines = [];
  let cur = '';
  for (const w of words) {
    const test = cur ? cur + ' ' + w : w;
    if (font.widthOfTextAtSize(test, size) <= maxWidth) cur = test;
    else { if (cur) lines.push(cur); cur = w; }
  }
  if (cur) lines.push(cur);
  return lines.length ? lines : [''];
}

async function buildPdf(job){
  const profile = job.profile || {};
  const { items, total, received, balance } = compute(job);
  const isEstimate = job.status === 'quoted' || job.status === 'declined';
  const isReceipt = !isEstimate && job.status === 'paid' && balance === 0 && received > 0;
  const title = isEstimate ? 'ESTIMATE' : (isReceipt ? 'RECEIPT' : 'INVOICE');

  const pdf = await PDFDocument.create();
  const bizName = clean(profile.business_name || 'CK Pressure Washing');
  pdf.setTitle(`${title} #${job.id} - ${bizName}`);
  pdf.setAuthor(bizName);
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const W = 612, H = 792, M = 48;
  let page = pdf.addPage([W, H]);
  const text = (t, x, y, o = {}) => page.drawText(clean(t), { x, y, size: o.size || 10.5, font: o.bold ? bold : regular, color: o.color || INK });
  const right = (t, xr, y, o = {}) => {
    const f = o.bold ? bold : regular; const s = o.size || 10.5;
    text(t, xr - f.widthOfTextAtSize(clean(t), s), y, o);
  };

  // Header band
  page.drawRectangle({ x: 0, y: H - 108, width: W, height: 108, color: NAVY });
  page.drawRectangle({ x: 0, y: H - 112, width: W, height: 4, color: GOLD });
  text(bizName, M, H - 52, { size: 20, bold: true, color: rgb(1, 1, 1) });
  const contact = [profile.phone, profile.email].filter(Boolean).join('   |   ');
  if (contact) text(contact, M, H - 72, { size: 10, color: rgb(0.85, 0.89, 0.96) });
  if (profile.address) text(profile.address, M, H - 87, { size: 10, color: rgb(0.85, 0.89, 0.96) });
  right(title, W - M, H - 54, { size: 26, bold: true, color: GOLD });
  right(`#${job.id}`, W - M, H - 74, { size: 11, color: rgb(1, 1, 1) });
  right(fmtDate(job.job_date), W - M, H - 89, { size: 10, color: rgb(0.85, 0.89, 0.96) });

  // Bill to
  let y = H - 150;
  text(isEstimate ? 'PREPARED FOR' : 'BILL TO', M, y, { size: 9, bold: true, color: MUTED });
  y -= 16;
  text(job.client_name || '', M, y, { size: 12, bold: true });
  y -= 15;
  for (const l of wrap(regular, job.address || '', 10.5, 300)) { text(l, M, y); y -= 14; }

  // Line items table
  y -= 14;
  const colQty = 380, colRate = 460, colAmt = W - M;
  page.drawLine({ start: { x: M, y: y + 14 }, end: { x: W - M, y: y + 14 }, thickness: 0 , color: LINE });
  text('DESCRIPTION', M, y, { size: 9, bold: true, color: MUTED });
  right('QTY', colQty, y, { size: 9, bold: true, color: MUTED });
  right('RATE', colRate, y, { size: 9, bold: true, color: MUTED });
  right('AMOUNT', colAmt, y, { size: 9, bold: true, color: MUTED });
  y -= 8;
  page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 1.5, color: INK });
  y -= 18;

  const newPage = () => { page = pdf.addPage([W, H]); y = H - 60; };
  for (const li of items) {
    const lines = wrap(regular, li.description || '', 10.5, 300);
    if (y - lines.length * 14 < 150) newPage();
    const top = y;
    lines.forEach((l, i) => text(l, M, top - i * 14));
    right(String(li.quantity), colQty, top);
    right(money(li.unit_price), colRate, top);
    right(money(li.quantity * li.unit_price), colAmt, top);
    y = top - lines.length * 14 - 4;
    page.drawLine({ start: { x: M, y: y + 6 }, end: { x: W - M, y: y + 6 }, thickness: 0.5, color: LINE });
    y -= 8;
  }

  // Totals
  if (y < 230) newPage();
  y -= 10;
  const lblX = 360;
  const row = (label, value, o = {}) => {
    text(label, lblX, y, { size: o.size || 10.5, bold: o.bold, color: o.color });
    right(value, colAmt, y, { size: o.size || 10.5, bold: o.bold, color: o.color });
    y -= o.gap || 18;
  };
  const hasSubtotal = items.length > 1;
  if (hasSubtotal) row('Subtotal', money(total));
  page.drawLine({ start: { x: lblX, y: y + 12 }, end: { x: W - M, y: y + 12 }, thickness: 1.5, color: INK });
  row('Total', money(total), { size: 15, bold: true, gap: 22, color: NAVY });
  if (!isEstimate && received > 0) {
    const how = [job.payment_method, fmtDate(job.paid_date)].filter(Boolean).join(', ');
    row('Paid' + (how ? ` (${how})` : ''), money(received), { color: GREEN });
  }
  if (!isEstimate && balance > 0) row('Balance Due', money(balance), { bold: true, size: 13 });

  // PAID stamp
  if (isReceipt) {
    page.drawRectangle({ x: M + 6, y: y + 34, width: 120, height: 40, borderColor: GREEN, borderWidth: 3, rotate: degrees(0), opacity: 0, borderOpacity: 0.85 });
    text('PAID IN FULL', M + 16, y + 48, { size: 16, bold: true, color: GREEN });
  }

  // Footer
  const fy = 56;
  page.drawLine({ start: { x: M, y: fy + 20 }, end: { x: W - M, y: fy + 20 }, thickness: 0.5, color: LINE });
  const foot = isReceipt ? 'Thank you for your payment! We appreciate your business.'
    : isEstimate ? 'This estimate is based on the work described above. Thank you for considering us.'
    : 'Thank you for your business!';
  text(foot, M, fy, { size: 10, color: MUTED });
  if (profile.phone) right(`Questions? ${profile.phone}`, W - M, fy, { size: 10, color: MUTED });

  return { bytes: await pdf.save(), title };
}

module.exports = async (req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.status(405).end('Method not allowed');
    return;
  }
  try {
    const token = String((req.query && req.query.token) || '').trim();
    if (!/^[0-9a-fA-F-]{32,40}$/.test(token)) {
      res.status(400).end('Missing or invalid link.');
      return;
    }
    if (!env('SUPABASE_URL') || !env('SUPABASE_ANON_KEY')) {
      res.status(500).end('Not configured.');
      return;
    }
    const supabase = createClient(env('SUPABASE_URL'), env('SUPABASE_ANON_KEY'));
    const { data: job, error } = await supabase.rpc('get_estimate_by_token', { p_token: token });
    if (error || !job) {
      res.status(404).end("This link isn't valid.");
      return;
    }
    const { bytes, title } = await buildPdf(job);
    const name = `${title.charAt(0)}${title.slice(1).toLowerCase()}-${job.id}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `${req.query.download ? 'attachment' : 'inline'}; filename="${name}"`);
    res.setHeader('Cache-Control', 'private, no-store');
    res.status(200).send(Buffer.from(bytes));
  } catch (err) {
    console.error('invoice-pdf error:', err);
    res.status(500).end('Could not build the PDF. Please try again.');
  }
};

module.exports.buildPdf = buildPdf;
