const logger = require('../utils/logger');

// UK Tax Year: 6 April to 5 April
// Tax rates for 2025/26

const INCOME_TAX_BANDS = [
  { name: 'Personal Allowance', upTo: 12570, rate: 0 },
  { name: 'Basic Rate', upTo: 50270, rate: 0.20 },
  { name: 'Higher Rate', upTo: 125140, rate: 0.40 },
  { name: 'Additional Rate', upTo: Infinity, rate: 0.45 }
];

const NI_RATES = {
  employee: [
    { upTo: 12570, rate: 0 },
    { upTo: 50270, rate: 0.08 },
    { upTo: Infinity, rate: 0.02 }
  ],
  selfEmployed: {
    class2Weekly: 3.45,
    class4: [
      { upTo: 12570, rate: 0 },
      { upTo: 50270, rate: 0.06 },
      { upTo: Infinity, rate: 0.02 }
    ]
  }
};

const CORPORATION_TAX_RATES = {
  smallProfits: { threshold: 50000, rate: 0.19 },
  main: { threshold: 250000, rate: 0.25 },
  marginalRelief: { fraction: 3 / 200 }
};

class TaxCalculator {
  calculateSelfAssessment(income, expenses = 0, allowances = {}) {
    const taxableIncome = Math.max(0, income - expenses - (allowances.personalAllowance || 12570));
    let taxDue = 0;
    let prevBand = 0;
    const breakdown = [];

    for (const band of INCOME_TAX_BANDS) {
      if (taxableIncome <= prevBand) break;
      const taxableInBand = Math.min(taxableIncome, band.upTo) - prevBand;
      const taxInBand = taxableInBand * band.rate;
      taxDue += taxInBand;
      breakdown.push({ band: band.name, taxable: taxableInBand, rate: band.rate, tax: taxInBand });
      prevBand = band.upTo;
    }

    const niDue = this.calculateClass4NI(taxableIncome);

    return {
      grossIncome: income,
      totalExpenses: expenses,
      taxableIncome,
      incomeTax: Math.round(taxDue * 100) / 100,
      nationalInsurance: niDue,
      totalTaxDue: Math.round((taxDue + niDue.total) * 100) / 100,
      breakdown,
      taxYear: this.getCurrentTaxYear()
    };
  }

  calculateClass4NI(profits) {
    let class4 = 0;
    let prevBand = 0;
    for (const band of NI_RATES.selfEmployed.class4) {
      if (profits <= prevBand) break;
      const taxableInBand = Math.min(profits, band.upTo) - prevBand;
      class4 += taxableInBand * band.rate;
      prevBand = band.upTo;
    }
    const class2 = profits > 6725 ? NI_RATES.selfEmployed.class2Weekly * 52 : 0;
    return {
      class2: Math.round(class2 * 100) / 100,
      class4: Math.round(class4 * 100) / 100,
      total: Math.round((class2 + class4) * 100) / 100
    };
  }

  calculateCorporationTax(profits, periodStart, periodEnd) {
    let rate, effectiveRate;
    if (profits <= CORPORATION_TAX_RATES.smallProfits.threshold) {
      rate = CORPORATION_TAX_RATES.smallProfits.rate;
      effectiveRate = rate;
    } else if (profits >= CORPORATION_TAX_RATES.main.threshold) {
      rate = CORPORATION_TAX_RATES.main.rate;
      effectiveRate = rate;
    } else {
      rate = CORPORATION_TAX_RATES.main.rate;
      const marginalRelief = (CORPORATION_TAX_RATES.main.threshold - profits)
        * CORPORATION_TAX_RATES.marginalRelief.fraction;
      const mainTax = profits * rate;
      effectiveRate = (mainTax - marginalRelief) / profits;
    }

    const taxDue = profits * effectiveRate;
    return {
      profits,
      rate,
      effectiveRate: Math.round(effectiveRate * 10000) / 10000,
      taxDue: Math.round(taxDue * 100) / 100,
      periodStart,
      periodEnd,
      paymentDeadline: this.getCorporationTaxDeadline(periodEnd)
    };
  }

  async getTaxSummary(merchantId) {
    // Aggregate from database
    return {
      merchantId,
      currentTaxYear: this.getCurrentTaxYear(),
      vatOwed: 0,
      incomeTaxEstimate: 0,
      corporationTaxEstimate: 0,
      nextVatDeadline: null,
      nextSADeadline: this.getNextSADeadline(),
      filingStatus: 'pending'
    };
  }

  getCurrentTaxYear() {
    const now = new Date();
    const year = now.getMonth() >= 3 && now.getDate() >= 6 ? now.getFullYear() : now.getFullYear() - 1;
    return `${year}/${String(year + 1).slice(2)}`;
  }

  getNextSADeadline() {
    return '2027-01-31';
  }

  getCorporationTaxDeadline(periodEnd) {
    const d = new Date(periodEnd);
    d.setMonth(d.getMonth() + 9);
    d.setDate(d.getDate() + 1);
    return d.toISOString().split('T')[0];
  }
}

module.exports = new TaxCalculator();
