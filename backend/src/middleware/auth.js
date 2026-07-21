const logger = require('../utils/logger');

const requireAuth = (req, res, next) => {
  if (!req.session || !req.session.shopify || !req.session.shopify.accessToken) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Please connect your Shopify store first'
    });
  }
  req.merchantId = req.session.shopify.shop;
  next();
};

const requireHmrcAuth = (req, res, next) => {
  if (!req.session || !req.session.hmrcTokens) {
    return res.status(401).json({
      error: 'HMRC Not Connected',
      message: 'Please connect your HMRC account to file taxes'
    });
  }
  next();
};

const requirePlan = (requiredPlan) => {
  const planHierarchy = { 'sole-trader': 1, 'small-business': 2, 'growth': 3 };
  return (req, res, next) => {
    const merchantPlan = req.session.plan || 'sole-trader';
    if ((planHierarchy[merchantPlan] || 0) < (planHierarchy[requiredPlan] || 0)) {
      return res.status(403).json({
        error: 'Plan Upgrade Required',
        message: `This feature requires the ${requiredPlan} plan or above`,
        currentPlan: merchantPlan,
        requiredPlan: requiredPlan
      });
    }
    next();
  };
};

module.exports = { requireAuth, requireHmrcAuth, requirePlan };
