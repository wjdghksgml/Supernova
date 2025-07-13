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

// 회원가입 페이지
app.get("/register", (req, res) => {
	res.render("register", { error: null, name: "", studentId: "" });
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

// 로그인 페이지
app.get("/login", (req, res) => {
	res.render("login", { error: null, name: "", studentId: "" });
});

// 로그인 처리
app.post("/login", async (req, res) => {
	const { name, studentId } = req.body;
	if (!name || !studentId) {
		return res.render("login", {
			error: "이름과 학번을 모두 입력해주세요.",
			name,
			studentId,
		});
	}

	try {
		const db = await connectDB();
		const user = await db.collection("users").findOne({ studentId });
		if (!user) {
			return res.render("login", {
				error: "등록되지 않은 학번입니다.",
				name: "",
				studentId: "",
			});
		}
		if (user.name !== name) {
			return res.render("login", {
				error: "이름이 일치하지 않습니다.",
				name: "",
				studentId: "",
			});
		}

		req.session.userId = user._id.toString();
		req.session.userName = user.name;
		req.session.userStudentId = user.studentId; // 추가
		req.session.userEmail = user.email; // 추가

		res.redirect("/index");
	} catch (err) {
		console.error("로그인 오류:", err);
		res.status(500).send("서버 오류");
	}
});

// 로그아웃
app.get("/logout", (req, res) => {
	req.session.destroy(() => {
		res.redirect("/login");
	});
});

// 예약 대여 신청 폼 페이지
app.get("/borrow", (req, res) => {
	if (!req.session.userId) return res.redirect("/login");
	res.render("borrow", {
		name: req.session.userName || "",
		studentId: req.session.userStudentId || "",
		email: req.session.userEmail || "",
	});
});

// 대여 신청 처리
app.post("/borrow", async (req, res) => {
	if (!req.session.userId) return res.redirect("/login");

	const name = req.session.userName;
	const studentId = req.session.userStudentId || req.body.studentId || "";
	const email = req.session.userEmail || req.body.email || "";
	const date = req.body.date;
	const timeSlot = req.body.timeSlot;

	if (!date || !timeSlot) {
		// 필요한 경우 유효성 검사 및 에러 처리 추가
		return res.status(400).send("날짜와 시간대를 선택해주세요.");
	}

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
			limit,
		});
	} catch (err) {
		console.error("관리자 페이지 오류:", err);
		res.status(500).send("서버 오류");
	}
});

app.get("/admin/user/:studentId", requireAdmin, async (req, res) => {
	try {
		const db = await connectDB();
		const { studentId } = req.params;

		const limit = parseInt(req.query.limit, 10) || 10;
		const currentPage = parseInt(req.query.page, 10) || 1;

		const totalCount = await db.collection("reservations").countDocuments({ studentId });
		const totalPages = Math.ceil(totalCount / limit);

		const reservations = await db
			.collection("reservations")
			.find({ studentId })
			.sort({ createdAt: -1 })
			.skip((currentPage - 1) * limit)
			.limit(limit)
			.toArray();

		const user = await db.collection("users").findOne({ studentId });
		if (!user) return res.status(404).send("사용자를 찾을 수 없습니다.");

		res.render("admin-user", {
			user,
			reservations,
			limit,
			currentPage,
			totalPages,
		});
	} catch (err) {
		console.error(err);
		res.status(500).send("서버 오류");
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
			status: statusText,
		};

		if (action === "reject") {
			updateFields.rejectedAt = new Date();
			updateFields.rejectReason = reason || "";
		}

		await db.collection("reservations").updateOne({ _id: new ObjectId(id) }, { $set: updateFields });

		const transporter = nodemailer.createTransport({
			service: "gmail",
			auth: {
				user: process.env.EMAIL_USER,
				pass: process.env.EMAIL_PASS,
			},
		});
		await db.collection("reservations").insertOne({
			name,
			studentId,
			email,
			date,
			timeSlot,
			createdAt: new Date(),
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
				status: r.status || "대기중",
			});
		}

		res.render("status", { borrowData: JSON.stringify(borrowData) });
	} catch (err) {
		console.error("예약 목록 불러오기 오류:", err);
		res.status(500).send("서버 오류");
	}
});

app.get("/admin", async (req, res) => {
	if (req.session.userName !== "admin") {
		return res.status(403).redirect("/404");
	}

	try {
		const db = await connectDB();

		// 쿼리에서 페이지와 limit 파라미터 가져오기 (기본값 설정)
		const limit = parseInt(req.query.limit) || 10;
		const currentPage = parseInt(req.query.page) || 1;
		const skip = (currentPage - 1) * limit;

		// 전체 문서 수
		const totalCount = await db.collection("reservations").countDocuments();

		// 전체 페이지 수 계산
		const totalPages = Math.ceil(totalCount / limit);

		// 현재 페이지에 해당하는 데이터만 가져오기
		const reservations = await db.collection("reservations").find({}).sort({ createdAt: -1 }).skip(skip).limit(limit).toArray();

		// EJS로 전달
		res.render("admin", {
			reservations,
			limit,
			currentPage,
			totalPages,
			totalCount,
		});
	} catch (err) {
		console.error("관리자 페이지 오류:", err);
		res.status(500).send("서버 오류");
	}
});

// views 폴더 내 .ejs 파일 이름을 자동으로 읽어서 allowedPages에 저장 (404 처리용)
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
