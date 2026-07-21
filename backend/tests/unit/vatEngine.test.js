const VatEngine = require('../../src/services/vatEngine');

describe('VatEngine', () => {
  describe('classifyVatRate', () => {
    test('classifies adult clothing as standard rate', () => {
      const result = VatEngine.classifyVatRate('clothing-adult');
      expect(result.category).toBe('standard');
      expect(result.rate).toBe(0.20);
    });

    test('classifies children clothing as zero rate', () => {
      const result = VatEngine.classifyVatRate('clothing-children');
      expect(result.category).toBe('zero');
      expect(result.rate).toBe(0.00);
    });

    test('classifies food groceries as zero rate', () => {
      const result = VatEngine.classifyVatRate('food-groceries');
      expect(result.category).toBe('zero');
      expect(result.rate).toBe(0.00);
    });

    test('classifies domestic energy as reduced rate', () => {
      const result = VatEngine.classifyVatRate('energy-domestic');
      expect(result.category).toBe('reduced');
      expect(result.rate).toBe(0.05);
    });

    test('classifies financial services as exempt', () => {
      const result = VatEngine.classifyVatRate('financial-services');
      expect(result.category).toBe('exempt');
      expect(result.isExempt).toBe(true);
    });

    test('defaults to standard rate for unknown products', () => {
      const result = VatEngine.classifyVatRate('unknown-product');
      expect(result.category).toBe('standard');
      expect(result.rate).toBe(0.20);
    });
  });

  describe('calculateVAT', () => {
    test('calculates standard VAT correctly', () => {
      const result = VatEngine.calculateVAT(100, 'standard');
      expect(result.netAmount).toBe(100);
      expect(result.vatAmount).toBe(20);
      expect(result.grossAmount).toBe(120);
    });

    test('calculates reduced VAT correctly', () => {
      const result = VatEngine.calculateVAT(100, 'reduced');
      expect(result.vatAmount).toBe(5);
      expect(result.grossAmount).toBe(105);
    });

    test('calculates zero VAT correctly', () => {
      const result = VatEngine.calculateVAT(100, 'zero');
      expect(result.vatAmount).toBe(0);
      expect(result.grossAmount).toBe(100);
    });
  });

  describe('extractVAT', () => {
    test('extracts VAT from gross amount', () => {
      const result = VatEngine.extractVAT(120, 'standard');
      expect(result.netAmount).toBe(100);
      expect(result.vatAmount).toBe(20);
      expect(result.grossAmount).toBe(120);
    });

    test('handles zero rate extraction', () => {
      const result = VatEngine.extractVAT(100, 'zero');
      expect(result.netAmount).toBe(100);
      expect(result.vatAmount).toBe(0);
    });
  });

  describe('calculateFlatRateVAT', () => {
    test('calculates flat rate for IT consultancy', () => {
      const result = VatEngine.calculateFlatRateVAT(10000, 'it-consultancy');
      expect(result.flatRatePercent).toBe(14.5);
      expect(result.vatDue).toBe(1450);
    });

    test('uses default rate for unknown category', () => {
      const result = VatEngine.calculateFlatRateVAT(10000, 'unknown');
      expect(result.flatRatePercent).toBe(16.5);
      expect(result.vatDue).toBe(1650);
    });
  });

  describe('validateVatNumber', () => {
    test('accepts valid 9-digit VRN format', () => {
      expect(VatEngine.validateVatNumber('123456789')).toBe(true);
    });

    test('rejects too-short VRN', () => {
      expect(VatEngine.validateVatNumber('12345')).toBe(false);
    });

    test('handles VRN with spaces', () => {
      expect(VatEngine.validateVatNumber('123 4567 89')).toBe(true);
    });
  });
});
