require('dotenv').config();
const { MongoClient } = require('mongodb');

const uri = process.env.MONGO_URI;
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true });

async function connectDB() {
  try {
    await client.connect();
    console.log('✅ MongoDB 연결 성공!');
    return client.db(); // 기본 DB 반환
  } catch (error) {
    console.error('MongoDB 연결 실패:', error);
  }
}

module.exports = connectDB;
