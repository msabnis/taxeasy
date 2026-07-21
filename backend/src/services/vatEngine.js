const logger = require('../utils/logger');

const VAT_RATES = {
  standard: { rate: 0.20, label: 'Standard (20%)' },
  reduced: { rate: 0.05, label: 'Reduced (5%)' },
  zero: { rate: 0.00, label: 'Zero (0%)' },
  exempt: { rate: 0.00, label: 'Exempt', isExempt: true }
};

const FLAT_RATE_SCHEMES = {
  'it-consultancy': 0.145,
  'general-retail': 0.04,
  'food-retail': 0.04,
  'hairdressing': 0.13,
  'transport': 0.10,
  'business-services': 0.12,
  'default': 0.165
};

const VAT_CATEGORY_MAP = {
  'clothing-adult': 'standard',
  'clothing-children': 'zero',
  'food-groceries': 'zero',
  'food-catering': 'standard',
  'books': 'zero',
  'electronics': 'standard',
  'energy-domestic': 'reduced',
  'financial-services': 'exempt',
  'healthcare': 'exempt',
  'education': 'exempt',
  'default': 'standard'
};

class VatEngine {
  classifyVatRate(productType) {
    const category = VAT_CATEGORY_MAP[productType] || VAT_CATEGORY_MAP['default'];
    const rateInfo = VAT_RATES[category];
    return {
      category,
      rate: rateInfo.rate,
      label: rateInfo.label,
      isExempt: rateInfo.isExempt || false
    };
  }

  calculateVAT(amount, rateType = 'standard') {
    const rate = VAT_RATES[rateType]?.rate ?? 0.20;
    const vatAmount = Math.round(amount * rate * 100) / 100;
    const grossAmount = Math.round((amount + vatAmount) * 100) / 100;
    return {
      netAmount: amount,
      vatRate: rate,
      vatAmount,
      grossAmount,
      rateType
    };
  }

  extractVAT(grossAmount, rateType = 'standard') {
    const rate = VAT_RATES[rateType]?.rate ?? 0.20;
    const netAmount = Math.round((grossAmount / (1 + rate)) * 100) / 100;
    const vatAmount = Math.round((grossAmount - netAmount) * 100) / 100;
    return { netAmount, vatAmount, grossAmount, rateType, vatRate: rate };
  }

  calculateFlatRateVAT(grossTurnover, businessCategory) {
    const flatRate = FLAT_RATE_SCHEMES[businessCategory] || FLAT_RATE_SCHEMES['default'];
    const vatDue = Math.round(grossTurnover * flatRate * 100) / 100;
    return {
      grossTurnover,
      flatRatePercent: flatRate * 100,
      businessCategory,
      vatDue
    };
  }

  async calculatePeriodVAT(merchantId, periodStart, periodEnd) {
    // Fetch orders from database for the period
    const orders = []; // await db.getOrders(merchantId, periodStart, periodEnd)

    let totalSalesExVAT = 0;
    let totalVATDue = 0;
    let totalPurchasesExVAT = 0;
    let totalVATReclaimed = 0;

    for (const order of orders) {
      const vatResult = this.extractVAT(order.total_price, order.vat_category || 'standard');
      totalSalesExVAT += vatResult.netAmount;
      totalVATDue += vatResult.vatAmount;
    }

    const netVatDue = Math.round((totalVATDue - totalVATReclaimed) * 100) / 100;

    return {
      merchantId,
      periodStart,
      periodEnd,
      box1: Math.round(totalVATDue * 100) / 100,
      box2: 0,
      box3: Math.round(totalVATDue * 100) / 100,
      box4: Math.round(totalVATReclaimed * 100) / 100,
      box5: netVatDue,
      box6: Math.round(totalSalesExVAT),
      box7: Math.round(totalPurchasesExVAT),
      box8: 0,
      box9: 0,
      orderCount: orders.length,
      calculatedAt: new Date().toISOString()
    };
  }

  validateVatNumber(vrn) {
    const cleaned = vrn.replace(/[^0-9]/g, '');
    if (cleaned.length !== 9 && cleaned.length !== 12) return false;
    // Modulus 97 check for 9-digit VRNs
    if (cleaned.length === 9) {
      const code = parseInt(cleaned.substring(0, 7), 10);
      const checkDigits = parseInt(cleaned.substring(7, 9), 10);
      let remainder = code;
      let multiplier = 8;
      const digits = cleaned.substring(0, 7).split('').map(Number);
      let sum = 0;
      for (let i = 0; i < 7; i++) {
        sum += digits[i] * (8 - i);
      }
      remainder = sum % 97;
      const expected = 97 - remainder;
      return expected === checkDigits || (expected - 55) === checkDigits;
    }
    return true;
  }
}

module.exports = new VatEngine();
