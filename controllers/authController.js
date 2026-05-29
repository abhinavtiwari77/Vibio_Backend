const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const UserModel = require('../models/User');

const JWT_SECRET = process.env.JWT_SECRET || 'devsecret';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

function signToken(user) {
  const payload = {
    id: user._id.toString(),
    isAdmin: !!user.isAdmin
  };
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

exports.register = async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ msg: 'Name, email and password are required' });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const existing = await UserModel.findOne({ email: normalizedEmail });
    if (existing) {
      return res.status(400).json({ msg: 'Email already in use' });
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    // Create user
    const user = await UserModel.create({
      name: String(name).trim(),
      email: normalizedEmail,
      passwordHash
    });

    const token = signToken(user);

    return res.status(201).json({
      token,
      user: user.toJSON()
    });
  } catch (err) {
    console.error('Register error', err);

    if (err.code === 11000 && err.keyPattern && err.keyPattern.email) {
      return res.status(400).json({ msg: 'Email already in use' });
    }

    return res.status(500).json({ msg: 'Server error' });
  }
};

exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ msg: 'Email and password are required' });

    const normalizedEmail = String(email).trim().toLowerCase();

    const user = await UserModel.findOne({ email: normalizedEmail });

    if (!user) {
      if (process.env.NODE_ENV !== 'production') console.warn(`Login attempt for unknown email: ${normalizedEmail}`);
      return res.status(400).json({ msg: 'Invalid credentials' });
    }

    // Support legacy documents that might have stored the hash under `password`.
    const storedHash = user.passwordHash || user.password || null;
    if (!storedHash) {
      if (process.env.NODE_ENV !== 'production') console.warn(`User ${normalizedEmail} has no password hash stored`);
      return res.status(400).json({ msg: 'Invalid credentials' });
    }

    let isMatch = false;
    try {
      isMatch = await bcrypt.compare(password, storedHash);
    } catch (compareErr) {
      console.error('bcrypt compare error', compareErr);
      return res.status(500).json({ msg: 'Server error' });
    }

    if (!isMatch) {
      if (process.env.NODE_ENV !== 'production') console.warn(`Invalid password for email: ${normalizedEmail}`);
      return res.status(400).json({ msg: 'Invalid credentials' });
    }

    const token = signToken(user);

    return res.json({
      token,
      user: user.toJSON()
    });
  } catch (err) {
    console.error('Login error', err);
    return res.status(500).json({ msg: 'Server error' });
  }
};

exports.getMe = async (req, res) => {
  try {
    if (!req.user || !req.user.id) return res.status(401).json({ msg: 'Not authorized' });

    const user = await UserModel.findById(req.user.id).select('-passwordHash').lean();
    if (!user) return res.status(404).json({ msg: 'UserModel not found' });

    return res.json({ user });
  } catch (err) {
    console.error('GetMe error', err);
    return res.status(500).json({ msg: 'Server error' });
  }
};
