const express = require("express");
const session = require("express-session");
const path = require("path");
const fs = require("fs");
require("dotenv").config();
const connectDB = require("./db");
const nodemailer = require("nodemailer");
const { ObjectId } = require("mongodb");

const app = express();
const PORT = process.env.PORT || 3000;

// 미들웨어
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(
  session({
    secret: process.env.SESSION_SECRET || "your_secret_key",
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false },
  })
);

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.use("/public", express.static(path.join(__dirname, "public")));

// 세션 전역 변수
app.use((req, res, next) => {
  res.locals.sessionId = req.session.userId || "none";
  res.locals.sessionUserName = req.session.userName || "none";
  next();
});

// 🔒 관리자 인증 미들웨어
function requireAdmin(req, res, next) {
  if (req.session.isAdmin) {
    next();
  } else {
    res.redirect("/admin/login");
  }
}

// 기본 라우트
app.get("/", (req, res) => res.render("index"));
app.get("/register", (req, res) => res.render("register", { error: null, name: "", studentId: "" }));
app.get("/login", (req, res) => res.render("login", { error: null, name: "", studentId: "" }));
app.get("/index", (req, res) => {
  if (!req.session.userId) return res.redirect("/login");
  res.render("index");
});
app.get("/logout", (req, res) => {
  req.session.destroy(() => res.redirect("/login"));
});

// 회원가입
app.post("/register", async (req, res) => {
  const { name, studentId } = req.body;
  if (!name || !studentId)
    return res.render("register", { error: "이름과 학번을 모두 입력해주세요.", name, studentId });

  try {
    const db = await connectDB();
    const existing = await db.collection("users").findOne({ studentId });
    if (existing)
      return res.render("register", { error: "이미 등록된 학번입니다.", name: "", studentId: "" });

    await db.collection("users").insertOne({ name, studentId, createdAt: new Date() });
    res.redirect("/login");
  } catch (err) {
    console.error("회원가입 오류:", err);
    res.status(500).send("서버 오류");
  }
});

// 로그인
// 로그인 처리
app.post("/login", async (req, res) => {
  const { name, studentId } = req.body;
  if (!name || !studentId)
    return res.render("login", { error: "이름과 학번을 모두 입력해주세요.", name, studentId });

  try {
    const db = await connectDB();
    const user = await db.collection("users").findOne({ studentId });

    if (!user || user.name !== name)
      return res.render("login", { error: "이름 또는 학번이 일치하지 않습니다.", name: "", studentId: "" });

    req.session.userId = user._id.toString();
    req.session.userName = user.name;
    res.redirect("/index");
  } catch (err) {
    console.error("로그인 오류:", err);
    res.status(500).send("서버 오류");
  }
});


app.post("/borrow", async (req, res) => {
  if (!req.session.userId) return res.redirect("/login");

  const { date, timeSlot, email } = req.body;

  if (!date || !timeSlot || !email) {
    return res.status(400).send("모든 필드를 입력해주세요.");
  }

  try {
    const db = await connectDB();

    // 사용자 정보 확인
    const user = await db.collection("users").findOne({ _id: new ObjectId(req.session.userId) });

    if (!user) return res.status(403).send("사용자 인증 오류");

    // 예약 저장
    await db.collection("reservations").insertOne({
      studentId: user.studentId,
      name: user.name,
      email,
      date,
      timeSlot,
      status: "대기중",
      createdAt: new Date()
    });

    res.redirect("/status"); // 또는 /index 등
  } catch (err) {
    console.error("예약 등록 오류:", err);
    res.status(500).send("서버 오류");
  }
});

// 대여 폼 페이지
app.get("/borrow", (req, res) => {
  if (!req.session.userId) return res.redirect("/login");
  res.render("borrow");
});

// 🔐 관리자 로그인
app.get("/admin/login", (req, res) => {
  res.render("admin-login", { error: null });
});

app.post("/admin/login", (req, res) => {
  const { id, password } = req.body;

  if (id === process.env.ADMIN_ID && password === process.env.ADMIN_PASS) {
    req.session.isAdmin = true;
    res.redirect("/admin");
  } else {
    res.render("admin-login", { error: "아이디 또는 비밀번호가 잘못되었습니다." });
  }
});

app.get("/admin/logout", (req, res) => {
  req.session.destroy(() => res.redirect("/admin/login"));
});

app.get("/admin", requireAdmin, async (req, res) => {
  try {
    const db = await connectDB();

    const limit = parseInt(req.query.limit, 10) || 10; // 페이지당 개수
    const currentPage = parseInt(req.query.page, 10) || 1;

    const totalCount = await db.collection("reservations").countDocuments();
    const totalPages = Math.ceil(totalCount / limit);

    const reservations = await db
      .collection("reservations")
      .find({})
      .sort({ createdAt: -1 })
      .skip((currentPage - 1) * limit)
      .limit(limit)
      .toArray();

    res.render("admin", {
      reservations,
      currentPage,
      totalPages,
      limit
    });
  } catch (err) {
    console.error("관리자 페이지 오류:", err);
    res.status(500).send("서버 오류");
  }
});


app.get('/admin/user/:studentId', requireAdmin, async (req, res) => {
  try {
    const db = await connectDB();
    const { studentId } = req.params;

    const limit = parseInt(req.query.limit, 10) || 10;
    const currentPage = parseInt(req.query.page, 10) || 1;

    const totalCount = await db.collection('reservations').countDocuments({ studentId });
    const totalPages = Math.ceil(totalCount / limit);

    const reservations = await db.collection('reservations')
      .find({ studentId })
      .sort({ createdAt: -1 })
      .skip((currentPage - 1) * limit)
      .limit(limit)
      .toArray();

    const user = await db.collection('users').findOne({ studentId });
    if (!user) return res.status(404).send('사용자를 찾을 수 없습니다.');

    res.render('admin-user', {
      user,
      reservations,
      limit,
      currentPage,
      totalPages
    });
  } catch (err) {
    console.error(err);
    res.status(500).send('서버 오류');
  }
});

// 🔐 관리자 승인/거절 처리
app.post("/admin/approve", requireAdmin, async (req, res) => {
  const { id, action, reason } = req.body;
  try {
    const db = await connectDB();
    const reservation = await db.collection("reservations").findOne({ _id: new ObjectId(id) });

    if (!reservation) return res.status(404).send("예약을 찾을 수 없습니다.");

    let statusText = "";
    let emailSubject = "";
    let emailText = "";

    if (action === "approve") {
      statusText = "승인";
      emailSubject = `[승인] ${reservation.date} 노트북 대여 신청이 승인되었습니다`;
      const receiveTime = reservation.timeSlot === "오전" ? "오프닝 전" : "점심시간";
      const returnTime = reservation.timeSlot === "오전" ? "점심시간" : "클로징 후";

      emailText = `안녕하세요, ${reservation.name}님!

${reservation.date}에 신청하신 노트북 대여가 승인되었습니다.
오전/오후: ${reservation.timeSlot}

${receiveTime}에 오피스 옆 로비에서 노트북을 수령해주시고, ${returnTime}까지 반납해주세요.
감사합니다.

헤이븐 아카데믹팀`;
    } else if (action === "reject") {
      statusText = "거절";
      emailSubject = `[거절] ${reservation.date} 노트북 대여 신청이 거절되었습니다`;
      emailText = `안녕하세요, ${reservation.name}님.

${reservation.date}에 신청하신 노트북 대여가 거절되었습니다.
사유: ${reason || "사유 미제공"}

문의가 있으시면 운영팀에 연락주시기 바랍니다.
감사합니다.

헤이븐 아카데믹팀`;
    }

    const updateFields = {
      status: statusText
    };

    if (action === "reject") {
      updateFields.rejectedAt = new Date();
      updateFields.rejectReason = reason || "";
    }

    await db.collection("reservations").updateOne(
      { _id: new ObjectId(id) },
      { $set: updateFields }
    );

    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });

    const mailOptions = {
      from: `"헤이븐 아카데믹팀" <${process.env.EMAIL_USER}>`,
      to: reservation.email,
      subject: emailSubject,
      text: emailText,
    };

    transporter.sendMail(mailOptions, (error, info) => {
      if (error) {
        console.error("❌ 이메일 전송 실패:", error);
      } else {
        console.log("✅ 이메일 전송 성공:", info.response);
      }
    });

    res.redirect("/admin");
  } catch (err) {
    console.error("신청 상태 업데이트 실패:", err);
    res.status(500).send("서버 오류");
  }
});

// 📅 대여 현황 페이지
app.get("/status", async (req, res) => {
  try {
    const db = await connectDB();
    const reservations = await db.collection("reservations").find({}).toArray();

    const borrowData = {};
    for (const r of reservations) {
      const dateKey = r.date;
      const time = r.timeSlot;
      if (!borrowData[dateKey]) borrowData[dateKey] = { 오전: [], 오후: [] };

      borrowData[dateKey][time].push({
        name: r.name,
        status: r.status || "대기중"
      });
    }

    res.render("status", { borrowData: JSON.stringify(borrowData) });
  } catch (err) {
    console.error("예약 목록 오류:", err);
    res.status(500).send("서버 오류");
  }
});

// 404 처리
const viewsDir = path.join(__dirname, "views");
const allowedPages = fs
  .readdirSync(viewsDir)
  .filter((file) => path.extname(file) === ".ejs")
  .map((file) => path.basename(file, ".ejs"));

app.get("/:page", (req, res) => {
  const pageName = req.params.page;
  if (allowedPages.includes(pageName)) {
    res.render(pageName);
  } else {
    res.status(404).render("404");
  }
});

// 서버 시작
app.listen(PORT, () => {
  console.log(`✅ Server running: http://localhost:${PORT}`);
});
