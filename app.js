// app.js

const express = require("express");
const session = require("express-session");
const path = require("path");
const fs = require("fs");
require("dotenv").config();
const connectDB = require("./db"); // 본인의 DB 연결 모듈 경로 맞춰주세요
const nodemailer = require("nodemailer");

const app = express();
const PORT = process.env.PORT || 3000;

// 미들웨어
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(
	session({
		secret: "your_secret_key",
		resave: false,
		saveUninitialized: true,
		cookie: { secure: false }, // HTTPS 배포 시 true로 변경하세요
	})
);

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.use("/public", express.static(path.join(__dirname, "public")));

// 세션 사용자 정보 전역 변수로 전달
app.use((req, res, next) => {
	res.locals.sessionId = req.session.userId || "none";
	res.locals.sessionUserName = req.session.userName || "none";
	next();
});

// 메인 페이지
app.get("/", (req, res) => {
	res.render("index");
});

// 회원가입 페이지
app.get("/register", (req, res) => {
	res.render("register", { error: null, name: "", studentId: "" });
});

// 회원가입 처리
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

// 로그인 후 대시보드
app.get("/index", (req, res) => {
	if (!req.session.userId) return res.redirect("/login");
	res.render("index");
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

		await db.collection("reservations").insertOne({
			name,
			studentId,
			email,
			date,
			timeSlot,
			createdAt: new Date(),
		});

		const transporter = nodemailer.createTransport({
			service: "gmail",
			auth: {
				user: process.env.EMAIL_USER,
				pass: process.env.EMAIL_PASS,
			},
		});

		const receiveTime = timeSlot === "오전" ? "오프닝 전" : "점심시간";
		const returnTime = timeSlot === "오전" ? "점심시간" : "클로징 후";

		const mailOptions = {
			from: `"헤이븐 아카데믹팀" <${process.env.EMAIL_USER}>`,
			to: email,
			subject: `${date} 노트북 신청 확인`,
			text: `안녕하세요! ${name}님!
${date} 노트북 신청이 확인되었습니다.
${receiveTime}에 오피스 옆 로비에서 노트북을 수령해주시면 되겠습니다!
${returnTime}까지 노트북 대여한 곳에 반납해주시면 됩니다.

감사합니다.

헤이븐 아카데믹팀`,
		};

		transporter.sendMail(mailOptions, (error, info) => {
			if (error) {
				console.error("❌ 이메일 전송 실패:", error);
			} else {
				console.log("✅ 이메일 전송 성공:", info.response);
			}
		});

		res.redirect("/status");
	} catch (err) {
		console.error("대여 신청 오류:", err);
		res.status(500).send("서버 오류");
	}
});

app.get("/status", async (req, res) => {
	try {
		const db = await connectDB();
		const reservations = await db.collection("reservations").find({}).toArray();

		const borrowData = {};

		for (const r of reservations) {
			const dateKey = r.date; // YYYY-MM-DD
			const time = r.timeSlot; // 오전 or 오후

			if (!borrowData[dateKey]) borrowData[dateKey] = { 오전: [], 오후: [] };
			borrowData[dateKey][time].push(r.name);
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
		const reservations = await db.collection("reservations").find({}).sort({ createdAt: -1 }).toArray();

		// 이 부분 중요! reservations를 넘겨줘야 에러 안남
		res.render("admin", { reservations });
	} catch (err) {
		console.error("관리자 페이지 오류:", err);
		console.log("어드민 페이지 예약 목록:", reservations);
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

// 서버 실행
app.listen(PORT, () => {
	console.log(`✅ Server running: http://localhost:${PORT}`);
});
