const connectDB = require('./db');

async function test() {
  const db = await connectDB();
  if (!db) {
    console.error('DB 연결 안 됨');
    process.exit(1);
  }
  const serverStatus = await db.command({ serverStatus: 1 });
  console.log('서버 상태:', serverStatus.ok === 1 ? '정상' : '비정상');
  process.exit(0);
}

test();
