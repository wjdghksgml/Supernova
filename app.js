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
app.get("/", (req, res) => {
  res.render("index", {
    name: req.session.userName || "",
    isAdmin: req.session.isAdmin || false
  });
});
app.get("/register", (req, res) => res.render("register", { error: null, name: "", studentId: "" }));
app.get("/login", (req, res) => res.render("login", { error: null, name: "", studentId: "" }));
app.get("/index", (req, res) => {
  if (!req.session.userId) {
    return res.redirect("/login");
  }

  // ✅ 여기서 isAdmin을 명시적으로 전달
  res.render("index", {
    name: req.session.userName || "",
    isAdmin: req.session.isAdmin || false, // <- 이게 꼭 있어야 함!
  });
});


app.get("/logout", (req, res) => {
  req.session.destroy(() => res.redirect("/login"));
});

// 회원가입 처리
app.post("/register", async (req, res) => {
	const { name, studentId, email } = req.body;

	if (!name || !studentId || !email) {
		return res.render("register", {
			error: "이름, 학번, 이메일을 모두 입력해주세요.",
			name,
			studentId,
			email,
		});
	}

	try {
		const db = await connectDB();
		const existing = await db.collection("users").findOne({ studentId });
		if (existing) {
			return res.render("register", {
				error: "이미 등록된 학번입니다.",
				name: "",
				studentId: "",
				email: "",
			});
		}
		await db.collection("users").insertOne({
			name,
			studentId,
			email,
			createdAt: new Date(),
		});
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
    return res.render("login", {
      error: "이름과 학번을 모두 입력해주세요.",
      name,
      studentId
    });

  // [1] 어드민 로그인
  if (name === "admin" && studentId === "password") {
    req.session.userId = "admin";
    req.session.userName = "관리자";
    req.session.isAdmin = true; // ✅ 관리자 여부 저장
    return res.redirect("/index"); // ✅ admin도 index로 감
  }

  try {
    // [2] 일반 사용자 로그인
    const db = await connectDB();
    const user = await db.collection("users").findOne({ studentId });

    if (!user || user.name !== name)
      return res.render("login", {
        error: "이름 또는 학번이 일치하지 않습니다.",
        name: "",
        studentId: ""
      });

    req.session.userId = user._id.toString();
    req.session.userName = user.name;
    req.session.isAdmin = false; // ✅ 일반 사용자
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
    const user = await db.collection("users").findOne({ _id: new ObjectId(req.session.userId) });
    if (!user) return res.status(403).send("사용자 인증 오류");

    await db.collection("reservations").insertOne({
      studentId: user.studentId,
      name: user.name,
      email,
      date,
      timeSlot,
      status: "대기중",
      createdAt: new Date(),
    });

    // 이메일 전송
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });

    const mailOptions = {
      from: `헤이븐 아카데믹팀 <${process.env.EMAIL_USER}>`,
      to: email,
      subject: `[신청 완료] ${date} 노트북 대여 신청이 접수되었습니다`,
      text: `안녕하세요, ${user.name}님!

${date}(${timeSlot}) 노트북 대여 신청이 접수되었습니다.
대여는 당일 오피스에서 진행되며, 수령/반납 시간은 운영시간에 따라 달라질 수 있습니다.

감사합니다.
헤이븐 아카데믹팀`,
    };

    transporter.sendMail(mailOptions, (error, info) => {
      if (error) {
        console.error("이메일 전송 실패:", error);
      } else {
        console.log("이메일 전송 성공:", info.response);
      }
    });

    res.redirect("/status");
  } catch (err) {
    console.error("예약 등록 오류:", err);
    res.status(500).send("서버 오류");
  }
});

// 대여 폼 페이지
app.get("/borrow", async (req, res) => {
  if (!req.session.userId) return res.redirect("/login");

  try {
    const db = await connectDB();
    const user = await db.collection("users").findOne({ _id: new ObjectId(req.session.userId) });

    res.render("borrow", {
      name: user?.name || "",
      studentId: user?.studentId || "",
      email: user?.email || ""
    });
  } catch (err) {
    console.error("대여 페이지 오류:", err);
    res.status(500).send("서버 오류");
  }
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

// 관리자 보호 미들웨어
function requireAdmin(req, res, next) {
  if (req.session.userId === 'admin') {
    return next();
  }
  return res.status(403).send('접근 권한이 없습니다.');
}

// 관리자 페이지
app.get("/admin", requireAdmin, async (req, res) => {
  try {
    const db = await connectDB();

    const limit = parseInt(req.query.limit, 10) || 10;
    const currentPage = parseInt(req.query.page, 10) || 1;
    const totalCount = await db.collection("reservations").countDocuments();
    const totalPages = Math.ceil(totalCount / limit);

    const reservationsRaw = await db
      .collection("reservations")
      .find({})
      .sort({ createdAt: -1 })
      .skip((currentPage - 1) * limit)
      .limit(limit)
      .toArray();

    // 상태 표시 함수
    function getStatusDisplay(r) {
      const now = new Date();
      const reservationDate = new Date(r.date + "T00:00:00");
      const status = r.status;

      if (status === "반납완료") return "반납완료";

      const isToday = now.toDateString() === reservationDate.toDateString();
      const isFuture = reservationDate > now;
      const hour = now.getHours();

      if (isFuture) return "대기중";

      if (r.timeSlot === "오전") {
        if (isToday) {
          return hour < 9 ? "대기중" : "대출중";
        } else if (now > reservationDate) {
          return "반납요망";
        }
      }

      if (r.timeSlot === "오후") {
        const nextDay = new Date(reservationDate);
        nextDay.setDate(nextDay.getDate() + 1);

        if (isToday) {
          return hour < 13 ? "대기중" : "대출중";
        } else if (now > nextDay) {
          return "반납요망";
        }
      }

      return "대출중";
    }

    // 상태 포함한 예약 데이터
    const reservations = reservationsRaw.map(r => ({
      ...r,
      statusDisplay: getStatusDisplay(r)
    }));

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




app.post("/admin/overdue", requireAdmin, async (req, res) => {
  const reservationId = req.body.id;

  try {
    const db = await connectDB();
    const { ObjectId } = require("mongodb");

    const reservation = await db.collection("reservations").findOne({ _id: new ObjectId(reservationId) });
    if (!reservation) {
      return res.status(404).send("예약 정보를 찾을 수 없습니다.");
    }

    await db.collection("reservations").updateOne(
      { _id: new ObjectId(reservationId) },
      {
        $set: {
          status: "반납완료",
          returnedAt: new Date(),
          overdue: true,
          overdueCount: (reservation.overdueCount || 0) + 1,
        },
      }
    );

    res.redirect(req.get('referer') || "/admin");
  } catch (err) {
    console.error(err);
    res.status(500).send("서버 오류");
  }
});

// 반납 완료 처리
app.post("/admin/return", requireAdmin, async (req, res) => {
  const { reservationId } = req.body;

  try {
    const db = await connectDB();
    const result = await db.collection("reservations").updateOne(
      { _id: new ObjectId(reservationId) },
      { $set: { status: "반납완료" } }
    );

    if (result.modifiedCount === 1) {
      console.log("반납 완료 처리됨:", reservationId);
    }

    res.redirect("/admin");
  } catch (err) {
    console.error("반납 처리 오류:", err);
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


app.post("/contact", async (req, res) => {
  const { name, studentId, type, message } = req.body;

  const recipients =
    type === "program"
      ? ["2027.hwanhee.joung@haven.or.kr", "2027.sangyul.lee@haven.or.kr"]
      : ["2027.bokyung.kang@haven.or.kr", "2027.yusul.shin@haven.or.kr"];

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });

  const mailOptions = {
    from: `"노트북 시스템 문의" <${process.env.EMAIL_USER}>`,
    to: recipients.join(","),
    subject: `[문의] ${type === "program" ? "프로그램 오류" : "신청 문의"} - ${name}`,
    text: `이름: ${name}\n학번: ${studentId}\n\n문의 내용:\n${message}`,
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`문의 이메일 제출이 완료되었습니다!`);
    res.send("<script>alert('문의 제출이 완료되었습니다!'); window.location.href = '/';</script>");
  } catch (err) {
    console.error("문의 전송 실패:", err);
    res.status(500).send("메일 전송 실패");
  }
});


// 서버 시작
app.listen(PORT, () => {
  console.log(`✅ Server running: http://localhost:${PORT}`);
});
