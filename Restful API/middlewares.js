const jwt = require('jsonwebtoken');

function verifyToken(req, res, next) {
  const auth = req.headers['authorization'] || req.headers['Authorization'];
  if (!auth) return res.status(401).json({ error: 'Missing token' });
  const parts = auth.split(' ');
  const token = parts.length === 2 ? parts[1] : parts[0];
  try {
    const tokenData = jwt.verify(token, process.env.TOKEN_SECRET);
    req.tokenData = tokenData;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

module.exports = { verifyToken };