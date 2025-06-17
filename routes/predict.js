// routes/predict.js
const express = require('express');
const multer = require('multer');
const fs = require('fs');
const FormData = require('form-data');
const axios = require('axios');
const Result = require('../models/Result');
const User = require('../models/User');

const router = express.Router();

// Middleware: Validasi username
router.use(async (req, res, next) => {
  const username = req.baseUrl.slice(1); // contoh /admin
  try {
    const user = await User.findOne({ where: { username } });
    if (!user) return res.status(404).json({ error: 'User tidak ditemukan' });
    req.user = user;
    next();
  } catch (err) {
    console.error(`[500] Gagal ambil user: ${err.message}`);
    res.status(500).json({ error: 'Server error', details: err.message });
  }
});

// POST /:username/dashboard/predict
router.post('/dashboard/predict', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Gambar wajib diunggah' });

    const form = new FormData();
    form.append('image', fs.createReadStream(req.file.path));
    form.append('user_id', req.user.id); // kirim juga user_id ke Flask

    const flaskRes = await axios.post('http://localhost:5000/predict', form, {
      headers: form.getHeaders()
    });

    const { prediction, explanation, confidence_scores, photoUrl } = flaskRes.data;

    const result = await Result.create({
      image_path: req.file.path,
      prediction,
      explanation,
      UserId: req.user.id
    });

    console.log(`[200] Prediksi ${prediction} disimpan untuk ${req.user.username}`);
    res.status(200).json({
      message: '✅ Prediksi berhasil disimpan',
      result: {
        ...result.toJSON(),
        confidence_scores,
        photoUrl,
      }
    });
  } catch (err) {
    console.error(`[500] Prediksi error: ${err.message}`);
    res.status(500).json({ error: 'Gagal memproses prediksi', details: err.message });
  }
});

module.exports = router;
