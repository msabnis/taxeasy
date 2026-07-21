const TaxCalculator = require('../../src/services/taxCalculator');

describe('TaxCalculator', () => {
  describe('calculateSelfAssessment', () => {
    test('calculates tax for basic rate taxpayer', () => {
      const result = TaxCalculator.calculateSelfAssessment(45000, 5000);
      // Taxable: 45000 - 5000 - 12570 = 27430
      expect(result.taxableIncome).toBe(27430);
      expect(result.incomeTax).toBeGreaterThan(0);
      expect(result.totalTaxDue).toBeGreaterThan(result.incomeTax);
    });

    test('no tax for income below personal allowance', () => {
      const result = TaxCalculator.calculateSelfAssessment(10000, 0);
      expect(result.taxableIncome).toBe(0);
      expect(result.incomeTax).toBe(0);
    });

    test('calculates higher rate tax correctly', () => {
      const result = TaxCalculator.calculateSelfAssessment(80000, 0);
      // Taxable: 80000 - 12570 = 67430
      expect(result.taxableIncome).toBe(67430);
      expect(result.breakdown.length).toBeGreaterThanOrEqual(3);
    });

    test('handles zero income', () => {
      const result = TaxCalculator.calculateSelfAssessment(0, 0);
      expect(result.taxableIncome).toBe(0);
      expect(result.incomeTax).toBe(0);
      expect(result.totalTaxDue).toBe(0);
    });
  });

  describe('calculateClass4NI', () => {
    test('no NI below threshold', () => {
      const result = TaxCalculator.calculateClass4NI(10000);
      expect(result.class4).toBe(0);
    });

    test('calculates NI for profits above threshold', () => {
      const result = TaxCalculator.calculateClass4NI(50000);
      expect(result.class4).toBeGreaterThan(0);
      expect(result.class2).toBeGreaterThan(0);
      expect(result.total).toBe(result.class2 + result.class4);
    });
  });

  describe('calculateCorporationTax', () => {
    test('small profits rate (19%) for profits under 50k', () => {
      const result = TaxCalculator.calculateCorporationTax(40000, '2026-01-01', '2026-12-31');
      expect(result.rate).toBe(0.19);
      expect(result.taxDue).toBe(7600);
    });

    test('main rate (25%) for profits over 250k', () => {
      const result = TaxCalculator.calculateCorporationTax(300000, '2026-01-01', '2026-12-31');
      expect(result.rate).toBe(0.25);
      expect(result.taxDue).toBe(75000);
    });

    test('marginal relief for profits between 50k and 250k', () => {
      const result = TaxCalculator.calculateCorporationTax(100000, '2026-01-01', '2026-12-31');
      expect(result.effectiveRate).toBeLessThan(0.25);
      expect(result.effectiveRate).toBeGreaterThan(0.19);
    });
  });

  describe('getCurrentTaxYear', () => {
    test('returns correct format', () => {
      const year = TaxCalculator.getCurrentTaxYear();
      expect(year).toMatch(/^\d{4}\/\d{2}$/);
    });
  });

  describe('getCorporationTaxDeadline', () => {
    test('returns 9 months and 1 day after period end', () => {
      const deadline = TaxCalculator.getCorporationTaxDeadline('2026-03-31');
      expect(deadline).toBe('2027-01-01');
    });
  });
});
