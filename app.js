const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const sequelize = require('./config/db');
require('dotenv').config();

const authRoutes = require('./routes/auth');
const dashboardRoutes = require('./routes/dashboard');
const TokenBlacklist = require('./models/TokenBlacklist'); // Opsional jika dipakai

const app = express();

app.use(cors());
app.use(express.json());
app.use(morgan('dev'));
app.use('/uploads', express.static('uploads'));

app.use('/auth', authRoutes);
app.use('/:username/dashboard', dashboardRoutes);

app.get('/', (req, res) => {
  res.json({ message: '✅ Welcome to Catascan! Backend is running.' });
});

sequelize.sync({ alter: true })
  .then(() => {
    app.listen(3000, '0.0.0.0', () => {
      console.log('✅ Server berjalan di http://0.0.0.0:3000 (akses publik jika port terbuka)');
    });
  })
  .catch(err => console.error(err));
