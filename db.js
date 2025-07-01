// db.js
require('dotenv').config();
const { MongoClient } = require('mongodb');

const uri = process.env.MONGO_URI;
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true });

let db;

async function connectDB() {
  if (db) return db;  // 이미 연결돼있으면 재사용
  try {
    await client.connect();
    db = client.db(); // 기본 DB 사용 (connection string에 DB명 지정)
    console.log('✅ MongoDB 연결 성공!');
    return db;
  } catch (error) {
    console.error('MongoDB 연결 실패:', error);
  }
}

module.exports = connectDB;
