/**
 * TaxEase UK — VAT Calculator
 * Handles UK VAT rates: Standard (20%), Reduced (5%), Zero (0%)
 */

const VAT_RATES = {
  STANDARD: 0.20,   // 20% — most goods & services
  REDUCED: 0.05,    // 5%  — home energy, children's car seats, etc.
  ZERO: 0.00,       // 0%  — food, children's clothes, books
  EXEMPT: null      // Exempt — financial services, insurance
};

/**
 * Calculate VAT from net (ex-VAT) amount
 * @param {number} netAmount - Amount before VAT
 * @param {string} rateType - 'STANDARD' | 'REDUCED' | 'ZERO'
 * @returns {{ net, vat, gross, rate }}
 */
function addVAT(netAmount, rateType = 'STANDARD') {
  const rate = VAT_RATES[rateType];
  if (rate === null) throw new Error('Cannot calculate VAT for exempt supplies');
  const vat = parseFloat((netAmount * rate).toFixed(2));
  const gross = parseFloat((netAmount + vat).toFixed(2));
  return { net: netAmount, vat, gross, rate, rateType };
}

/**
 * Extract VAT from gross (inc-VAT) amount
 * @param {number} grossAmount - Amount including VAT
 * @param {string} rateType - 'STANDARD' | 'REDUCED' | 'ZERO'
 * @returns {{ net, vat, gross, rate }}
 */
function removeVAT(grossAmount, rateType = 'STANDARD') {
  const rate = VAT_RATES[rateType];
  if (rate === null) throw new Error('Cannot calculate VAT for exempt supplies');
  const net = parseFloat((grossAmount / (1 + rate)).toFixed(2));
  const vat = parseFloat((grossAmount - net).toFixed(2));
  return { net, vat, gross: grossAmount, rate, rateType };
}

/**
 * Generate HMRC 9-box VAT return from transactions
 * @param {Array} transactions - Array of transaction objects
 * @param {Date} periodStart
 * @param {Date} periodEnd
 * @returns {Object} 9-box VAT return
 */
function generate9BoxReturn(transactions, periodStart, periodEnd) {
  const filtered = transactions.filter(t => {
    const date = new Date(t.date);
    return date >= periodStart && date <= periodEnd;
  });

  let box1 = 0; // VAT due on sales
  let box2 = 0; // VAT due on acquisitions from EC (post-Brexit: usually 0)
  let box4 = 0; // VAT reclaimed on purchases
  let box6 = 0; // Total value of sales (ex-VAT)
  let box7 = 0; // Total value of purchases (ex-VAT)
  let box8 = 0; // Total value of EC supplies (post-Brexit: usually 0)
  let box9 = 0; // Total value of EC acquisitions (post-Brexit: usually 0)

  for (const t of filtered) {
    if (t.type === 'sale') {
      box1 += t.vatAmount || 0;
      box6 += t.netAmount || 0;
    } else if (t.type === 'purchase') {
      box4 += t.vatAmount || 0;
      box7 += t.netAmount || 0;
    }
  }

  const box3 = parseFloat((box1 + box2).toFixed(2));
  const box5 = parseFloat(Math.abs(box3 - box4).toFixed(2)); // Net VAT payable/reclaimable

  return {
    periodStart: periodStart.toISOString().split('T')[0],
    periodEnd: periodEnd.toISOString().split('T')[0],
    box1: parseFloat(box1.toFixed(2)),
    box2: parseFloat(box2.toFixed(2)),
    box3,
    box4: parseFloat(box4.toFixed(2)),
    box5,
    box6: parseFloat(box6.toFixed(2)),
    box7: parseFloat(box7.toFixed(2)),
    box8: parseFloat(box8.toFixed(2)),
    box9: parseFloat(box9.toFixed(2)),
    isPayable: box3 > box4
  };
}

module.exports = { VAT_RATES, addVAT, removeVAT, generate9BoxReturn };
