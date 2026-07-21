const crypto = require('crypto');

// HMRC Fraud Prevention Headers (required for MTD API calls)
// See: https://developer.service.hmrc.gov.uk/guides/fraud-prevention

const getConnectionHeaders = (req) => {
  const headers = {
    'Gov-Client-Connection-Method': 'WEB_APP_VIA_SERVER',
    'Gov-Client-Public-IP': req.ip || '127.0.0.1',
    'Gov-Client-Public-Port': String(req.socket?.remotePort || 443),
    'Gov-Client-Device-ID': generateDeviceId(req),
    'Gov-Client-User-IDs': `os=${encodeURIComponent(process.platform)}`,
    'Gov-Client-Timezone': `UTC${new Date().getTimezoneOffset() <= 0 ? '+' : '-'}${Math.abs(new Date().getTimezoneOffset() / 60)}`,
    'Gov-Client-User-Agent': formatUserAgent(req.headers['user-agent']),
    'Gov-Client-Local-IPs': '127.0.0.1',
    'Gov-Vendor-Public-IP': `${getServerPublicIP()}`,
    'Gov-Vendor-Forwarded': 'false',
    'Gov-Vendor-Product-Name': 'TaxEasy',
    'Gov-Vendor-Version': '2.0.0',
    'Gov-Vendor-License-IDs': crypto.createHash('md5').update('taxeasy-license').digest('hex'),
    'Gov-Vendor-Certificates': crypto.createHash('sha256').update('taxeasy-cert').digest('hex')
  };
  return headers;
};

const generateDeviceId = (req) => {
  const raw = `${req.headers['user-agent']}-${req.ip}`;
  return crypto.createHash('sha256').update(raw).digest('hex');
};

const formatUserAgent = (ua) => {
  if (!ua) return 'os=unknown&browser=unknown';
  return encodeURIComponent(ua).replace(/[,;]/g, '');
};

const getServerPublicIP = () => {
  return process.env.SERVER_PUBLIC_IP || '127.0.0.1';
};

module.exports = { getConnectionHeaders };
