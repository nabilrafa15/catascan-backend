const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const nodemailer = require('nodemailer');
const { Op } = require('sequelize');
const User = require('../models/User');
const TokenBlacklist = require('../models/TokenBlacklist');
require('dotenv').config();

const router = express.Router();
const upload = multer({ dest: 'uploads/' });

// =================== TOKEN MIDDLEWARE ===================
async function verifyToken(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Token tidak ditemukan' });

  const blacklisted = await TokenBlacklist.findOne({ where: { token } });
  if (blacklisted) return res.status(401).json({ error: 'Token sudah logout' });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.userId = decoded.id;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Token tidak valid', details: err.message });
  }
}

// =================== REGISTER ===================
router.post('/register', async (req, res) => {
  try {
    const { username, email, password, retype_password } = req.body;
    if (!username || !email || !password || !retype_password)
      return res.status(400).json({ error: 'Semua field wajib diisi' });

    if (password !== retype_password)
      return res.status(400).json({ error: 'Password dan konfirmasi tidak sama' });

    const existingUser = await User.findOne({
      where: { [Op.or]: [{ username }, { email }] }
    });

    if (existingUser)
      return res.status(409).json({ error: 'Username atau email sudah digunakan' });

    const hashed = await bcrypt.hash(password, 10);
    const user = await User.create({ username, email, password: hashed });

    res.status(201).json({
      message: '✅ Register berhasil',
      user: { id: user.id, username: user.username, email: user.email }
    });
  } catch (err) {
    res.status(500).json({ error: 'Server error', details: err.message });
  }
});

// =================== LOGIN ===================
router.post('/login', async (req, res) => {
  try {
    const { login, password } = req.body;
    if (!login || !password)
      return res.status(400).json({ error: 'Login dan password wajib diisi' });

    const user = await User.findOne({
      where: { [Op.or]: [{ username: login }, { email: login }] }
    });

    if (!user)
      return res.status(404).json({ error: 'User tidak ditemukan' });

    const valid = await bcrypt.compare(password, user.password);
    if (!valid)
      return res.status(401).json({ error: 'Password salah' });

    const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET);
    res.status(200).json({
      message: '✅ Login berhasil',
      greeting: `Halo, ${user.username}!`,
      token
    });
  } catch (err) {
    res.status(500).json({ error: 'Server error', details: err.message });
  }
});
// =================== GET USER INFO (username + image_link) ===================
router.get('/user', verifyToken, async (req, res) => {
  try {
    const user = await User.findByPk(req.userId);
    if (!user) return res.status(404).json({ error: 'User tidak ditemukan' });

    const imageLink = user.image ? `${req.protocol}://${req.get('host')}/${user.image}` : null;

    res.status(200).json({
      message: '✅ Info user berhasil diambil',
      user: {
        username: user.username,
        username_copy: user.username,
        image_link: imageLink,
        email:user.email
      }
    });
  } catch (err) {
    res.status(500).json({ error: 'Gagal mengambil info user', details: err.message });
  }
});

// =================== EDIT PROFILE (GAMBAR) ===================
router.patch('/profile/edit', verifyToken, upload.single('image'), async (req, res) => {
  try {
    const user = await User.findByPk(req.userId);
    if (!user) return res.status(404).json({ error: 'User tidak ditemukan' });

    if (req.file) {
      user.image = `uploads/${req.file.filename}`;
      await user.save();
    }

    const imageLink = user.image ? `${req.protocol}://${req.get('host')}/${user.image}` : null;

    res.status(200).json({
      message: '✅ Gambar profil berhasil diperbarui',
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        image_link: imageLink,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt
      }
    });
  } catch (err) {
    res.status(500).json({ error: 'Gagal update gambar', details: err.message });
  }
});

// =================== CHANGE PASSWORD (TANPA password lama) ===================
router.patch('/change-password', verifyToken, async (req, res) => {
  try {
    const { newPassword, retypePassword } = req.body;
    if (!newPassword || !retypePassword) return res.status(400).json({ error: 'Semua field wajib diisi' });
    if (newPassword !== retypePassword) return res.status(400).json({ error: 'Konfirmasi password tidak cocok' });

    const user = await User.findByPk(req.userId);
    if (!user) return res.status(404).json({ error: 'User tidak ditemukan' });

    user.password = await bcrypt.hash(newPassword, 10);
    await user.save();

    res.status(200).json({ message: '✅ Password berhasil diubah' });
  } catch (err) {
    res.status(500).json({ error: 'Gagal ubah password', details: err.message });
  }
});


// =================== FORGOT PASSWORD (KIRIM EMAIL) ===================
router.post('/forgot-password', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email wajib diisi' });

  try {
    const user = await User.findOne({ where: { email } });
    if (!user) return res.status(404).json({ error: 'Email tidak ditemukan' });

    const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET, { expiresIn: '10m' });
    const resetLink = `http://localhost:3000/auth/reset-password/${user.id}?token=${token}`;

    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_PASS,
      }
    });

    await transporter.sendMail({
      from: process.env.GMAIL_USER,
      to: email,
      subject: 'Reset Password Catascan',
      html: `
        <p>Hai <b>${user.username}</b>,</p>
        <p>Kami menerima permintaan untuk mengganti password akunmu.</p>
        <p><a href="${resetLink}">Klik di sini untuk reset password</a> (berlaku 10 menit)</p>
      `
    });

    res.status(200).json({ message: '✅ Email reset password berhasil dikirim', resetLink });
  } catch (err) {
    res.status(500).json({ error: 'Gagal kirim email', details: err.message });
  }
});

// =================== FORM RESET PASSWORD (GET) ===================
router.get('/reset-password/:id', (req, res) => {
  const { token } = req.query;
  const { id } = req.params;

  if (!token) {
    return res.status(400).send('<h2>Token tidak tersedia</h2>');
  }

  res.send(`
    <h2>Ganti Password</h2>
    <form method="POST" action="/auth/reset-password/${id}?token=${token}">
      <input type="password" name="newPassword" placeholder="Password Baru" required />
      <input type="password" name="retypePassword" placeholder="Ulangi Password" required />
      <button type="submit">Reset Password</button>
    </form>
  `);
});

// =================== RESET PASSWORD (POST) ===================
router.post('/reset-password/:id', express.urlencoded({ extended: true }), async (req, res) => {
  const { token } = req.query;
  const { newPassword, retypePassword } = req.body;

  if (!token) return res.status(400).send('<h3>Token tidak ditemukan</h3>');
  if (!newPassword || !retypePassword) return res.status(400).send('<h3>Field tidak boleh kosong</h3>');
  if (newPassword !== retypePassword) return res.status(400).send('<h3>Password tidak cocok</h3>');

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findByPk(decoded.id);
    if (!user) return res.status(404).send('<h3>User tidak ditemukan</h3>');

    const hashed = await bcrypt.hash(newPassword, 10);
    user.password = hashed;
    await user.save();

    res.send('<h2>Password berhasil direset. Silakan login kembali.</h2>');
  } catch (err) {
    res.status(400).send(`<h3>Token error: ${err.message}</h3>`);
  }
});

// =================== LOGOUT ===================
router.post('/logout', verifyToken, async (req, res) => {
  const token = req.headers.authorization.split(' ')[1];
  try {
    await TokenBlacklist.create({ token });
    res.status(200).json({ message: '✅ Logout berhasil dan token diblacklist.' });
  } catch (err) {
    res.status(500).json({ error: 'Gagal logout', details: err.message });
  }
});

module.exports = router;