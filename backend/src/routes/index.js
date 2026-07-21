const express = require('express');
const router = express.Router();
const shopifyRoutes = require('./shopify');
const hmrcRoutes = require('./hmrc');
const taxRoutes = require('./tax');
const bankingRoutes = require('./banking');
const companiesHouseRoutes = require('./companiesHouse');
const { requireAuth } = require('../middleware/auth');

router.use('/shopify', shopifyRoutes);
router.use('/hmrc', requireAuth, hmrcRoutes);
router.use('/tax', requireAuth, taxRoutes);
router.use('/banking', requireAuth, bankingRoutes);
router.use('/companies-house', requireAuth, companiesHouseRoutes);

module.exports = router;
