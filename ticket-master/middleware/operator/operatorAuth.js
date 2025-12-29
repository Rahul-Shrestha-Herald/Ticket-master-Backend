import jwt from 'jsonwebtoken';

const operatorAuth = (req, res, next) => {
  const token = req.cookies.operatorToken;
  if (!token) {
    return res.status(401).json({ success: false, message: 'Authorization required' });
  }
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.operator = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ success: false, message: 'Invalid token' });
  }
};

export default operatorAuth;
