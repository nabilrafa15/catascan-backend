const express = require('express');
const multer = require('multer');
const fs = require('fs');
const FormData = require('form-data');
const axios = require('axios');
const jwt = require('jsonwebtoken');
const moment = require('moment-timezone');

const Article = require('../models/Article');
const Result = require('../models/Result');
const User = require('../models/User');
const TokenBlacklist = require('../models/TokenBlacklist'); // Tambahan

const router = express.Router();

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'uploads/'),
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = file.originalname.split('.').pop();
    cb(null, `${file.fieldname}-${uniqueSuffix}.${ext}`);
  }
});
const upload = multer({ storage });

// ✅ Middleware: Validasi token & user
router.use(async (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Token tidak ditemukan' });

  try {
    const blacklisted = await TokenBlacklist.findOne({ where: { token } });
    if (blacklisted) return res.status(401).json({ error: 'Token sudah logout, silakan login ulang' });

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findByPk(decoded.id);
    if (!user) return res.status(401).json({ error: 'User tidak valid' });

    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Token tidak valid', details: err.message });
  }
});

// ==================== GET /:username/dashboard ====================
router.get('/dashboard', async (req, res) => {
  try {
    const articles = await Article.findAll({ where: { UserId: req.user.id } });
    const results = await Result.findAll({ where: { UserId: req.user.id } });

    res.status(200).json({
      message: `Halo, ${req.user.username}!`,
      all_articles: articles,
      your_predictions: results
    });
  } catch (err) {
    res.status(500).json({ error: 'Dashboard gagal dimuat', details: err.message });
  }
});

// ==================== POST /insert_article ====================
router.post('/insert_article', async (req, res) => {
  try {
    const { title, content } = req.body;
    if (!title || !content) return res.status(400).json({ error: 'Judul dan konten wajib diisi' });

    const article = await Article.create({
      title,
      content,
      UserId: req.user.id
    });

    res.status(201).json({ message: '✅ Artikel berhasil ditambahkan', article });
  } catch (err) {
    res.status(500).json({ error: 'Gagal menyimpan artikel', details: err.message });
  }
});

// ==================== POST /predict ====================
router.post('/predict', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Gambar wajib diunggah' });
    }

    const form = new FormData();
    form.append('image', fs.createReadStream(req.file.path));

    const flaskRes = await axios.post('http://localhost:5000/predict', form, {
      headers: form.getHeaders()
    });

    let { prediction, explanation, confidence_scores, photoUrl } = flaskRes.data;

    // Urutkan confidence_scores agar konsisten
    const orderedConfidenceScores = {
      immature: confidence_scores.immature,
      mature: confidence_scores.mature,
      normal: confidence_scores.normal
    };

    // Simpan ke database
    const result = await Result.create({
      image_path: req.file.path,
      prediction,
      explanation,
      confidence_scores: orderedConfidenceScores,
      UserId: req.user.id
    });

    res.status(200).json({
      message: '✅ Prediksi berhasil disimpan',
      prediction,
      explanation,
      confidence_scores: orderedConfidenceScores,
      photoUrl
    });
  } catch (err) {
    res.status(500).json({ error: 'Gagal memproses prediksi', details: err.message });
  }
});

// ==================== GET /history ====================
router.get('/history', async (req, res) => {
  try {
    const results = await Result.findAll({
      where: { UserId: req.user.id },
      order: [['createdAt', 'DESC']],
    });

    const history = results.map(r => {
      // Urutkan ulang confidence_scores saat dibaca
      const scores = r.confidence_scores || {};
      const orderedScores = {
        immature: scores.immature,
        mature: scores.mature,
        normal: scores.normal
      };

      return {
        id: r.id,
        prediction: r.prediction,
        explanation: r.explanation,
        confidence_scores: orderedScores,
        createdAt: moment(r.createdAt).tz('Asia/Jakarta').format('YYYY-MMM-DD HH:mm:ss'),
        updatedAt: moment(r.updatedAt).tz('Asia/Jakarta').format('YYYY-MMM-DD HH:mm:ss'),
        photoUrl: `${req.protocol}://${req.get('host')}/${r.image_path.replace(/\\/g, '/')}`
      };
    });

    res.status(200).json({
      message: `Riwayat prediksi milik ${req.user.username}`,
      history
    });
  } catch (err) {
    res.status(500).json({
      error: 'Gagal mengambil history',
      details: err.message
    });
  }
});


module.exports = router;
