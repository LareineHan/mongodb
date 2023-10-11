/////////////////////////////////////////////////
//////// 1. Importing Express ///////////////////
/////////////////////////////////////////////////
const express = require('express'); // import express
const app = express(); // create express app
const { MongoClient, ObjectId, BSON } = require('mongodb');
const session = require('express-session');
const passport = require('passport');
const LocalStrategy = require('passport-local');
const bcrypt = require('bcrypt');
const configDotenv = require('dotenv').config();
const { S3Client } = require('@aws-sdk/client-s3');
const multer = require('multer');
const multerS3 = require('multer-s3');
const s3 = new S3Client({
	region: 'us-west-1',
	credentials: {
		accessKeyId: process.env.S3_KEY,
		secretAccessKey: process.env.S3_SECRET,
	},
});
const upload = multer({
	storage: multerS3({
		s3: s3,
		bucket: 'practiceatlund',
		key: function (요청, file, cb) {
			cb(null, Date.now().toString()); //업로드시 파일명 변경가능
		},
	}),
});

app.use(passport.initialize());
app.use(
	session({
		secret: process.env.SESSION_SECRET,
		resave: false,
		saveUninitialized: false,
		cookie: { maxAge: 60 * 60 * 1000 }, // 1 hour for session
	})
);

let connectDB = require('./database.js');

let db;
const url = process.env.DB_URL;
connectDB
	.then((client) => {
		console.log('DB연결성공: from Server.js');
		db = client.db('forum');
		app.listen(process.env.PORT, function () {
			console.log('Yay, listening on 8080 port!');
		}); // listen for incoming connections
	})
	.catch((err) => {
		console.log(err);
	});

app.use(passport.session());
const methodOverride = require('method-override');
app.use(methodOverride('_method'));

app.set('view engine', 'ejs'); // set up ejs to be the view engine
app.use(express.static(__dirname + '/public')); // serve static files
// what could be in public folder? css, js, images, etc.
// 8080 is the port number,
// function is what to do when server is running (callback)
app.use(express.json());
app.use(express.urlencoded({ extended: true })); // hashing password 할때 필요한 미들웨어임
// 위 두줄은 유저가 입력한 값을 꺼내쓰는 코드를 도와주는 필수 코드

function loginRequired(req, res, next) {
	if (!req.user) {
		res.redirect('/login');
	} else {
		console.log(req.user.username, 'just logged in');
		next();
	}
}

app.get('/', loginRequired, function (req, res) {
	res.sendFile(__dirname + '/index.html');
});

app.get('/about', function (req, res) {
	res.sendFile(__dirname + '/about.html');
});

app.get('/list', async (req, res) => {
	let result = await db.collection('post').find().toArray();
	res.render('list.ejs', { posts: result });
});

app.get('/time', function (req, res) {
	res.render('time.ejs', { time: new Date() });
});

app.get('/write', function (req, res) {
	res.render('write.ejs');
});

app.get('/search', async (req, res) => {
	res.render('search.ejs');
});

function imageErrorCatcher(req, res, next) {
	upload.single('img1')(req, res, (err) => {
		if (err) return res.send('Error on uploading image');
		else console.log('이미지 업로드 성공!');
		next();
	});
}
app.post('/add-post', imageErrorCatcher, async (req, res) => {
	console.log('New data requested on the form: ', req.body);
	console.log('이미지 url:', req.file.location);
	let data = req.body;

	try {
		if (data.title === '' || data.content === '') {
			res.send('빈칸을 채워주세요');
			console.log('Not Added due to empty field');
		} else {
			await db.collection('post').insertOne({
				title: data.title,
				content: data.content,
				img: req.file.location,
			});
			res.redirect('/list');
			console.log('데이터베이스에 저장되었습니다');
		}
	} catch (e) {
		console.log(e);
		res.status(500).send('Server Error');
	}
});

app.get('/detail/:id', async (req, res) => {
	const id = req.params.id;
	if (id.length !== 24 || !/^[0-9a-fA-F]{24}$/.test(id)) {
		return res.status(404).send('Please check the id');
	}
	try {
		let result = await db.collection('post').findOne({ _id: new ObjectId(id) });
		if (!result) {
			res.status(404).send('Post is not exist');
		}
		res.render('detail.ejs', { result: result });
	} catch (e) {
		console.log(e);
		req.status(404).send('Not available url id');
	}
});

app.get('/edit/:id', async (req, res) => {
	const id = req.params.id;
	if (id.length !== 24 || !/^[0-9a-fA-F]{24}$/.test(id)) {
		return res.status(404).send('Please check the id');
	}
	try {
		let result = await db.collection('post').findOne({ _id: new ObjectId(id) });
		if (!result) {
			res.status(404).send('Post is not exist');
		}
		res.render('edit.ejs', { result: result });
	} catch (e) {
		console.log(e);
		req.status(404).send('Not available url id');
	}
});

app.put('/edit', async (req, res) => {
	await db
		.collection('post')
		.updateOne(
			{ _id: new ObjectId(req.body.id) },
			{ $set: { title: req.body.title, content: req.body.content } }
		);
	console.log('데이터베이스에 수정되었습니다');
	res.redirect('/list');
});

app.delete('/delete/:id', async (req, res) => {
	try {
		await db.collection('post').deleteOne({ _id: new ObjectId(req.params.id) });
		console.log(req.params, '해당 데이터가 삭제됨');
		res.status(200).json({ success: true });
	} catch (error) {
		console.log(error);
		res.status(500).json({ success: false });
	}
});

app.get('/list/:id', async (req, res) => {
	let result = await db
		.collection('post')
		.find()
		.skip(5 * (req.params.id - 1))
		.limit(5)
		.toArray();
	res.render('list.ejs', { posts: result });
});

app.get('/list/next/:id', async (req, res) => {
	try {
		let result = await db
			.collection('post')
			.find({ _id: { $gt: new ObjectId(req.params.id) } })
			.limit(5)
			.toArray();

		res.render('list.ejs', { posts: result });
	} catch (e) {
		console.log(e);
		res.send('Error fetching posts.');
	}
});

passport.use(
	new LocalStrategy(async (입력한아이디, 입력한비번, cb) => {
		try {
			let result = await db
				.collection('user')
				.findOne({ username: 입력한아이디 });
			if (!result) {
				return cb(null, false, { message: '아이디 DB에 없음' });
			}
			const isMatch = await bcrypt.compare(입력한비번, result.password);
			if (isMatch) {
				return cb(null, result);
			} else {
				console.log('입력한 비밀번호: ', 입력한비번, result.password);
				return cb(null, false, { message: '비번불일치' });
			}
		} catch (error) {
			console.log(error);
		}
	})
);

///////////쿠키를 유저에게 보내주는 코드//////////////
passport.serializeUser((user, done) => {
	console.log(user, '로그인 시도');
	process.nextTick(() => {
		done(null, { id: user._id, username: user.username });
	});
});
///////////유저가 DB와 일치하는지 확인하는 코드//////////////
passport.deserializeUser(async (user, done) => {
	let result = await db
		.collection('user')
		.findOne({ _id: new ObjectId(user.id) });
	delete result.password;
	process.nextTick(() => {
		done(null, result);
		// console.log(result, 'result');
	});
});
/////////////////////////////////////////

///////////////////////////////////////////////////
//////////////////////LOG IN///////////////////////
///////////////////////////////////////////////////

function usernameAndPasswordChecker(req, res, next) {
	let username = req.body.username ? req.body.username.toString() : '';
	let password = req.body.password ? req.body.password.toString() : '';

	if (!username || !password) {
		res.send('값을 입력하세요');
		console.log('유저네임, 비번 비었음');
	} else if (username.includes(' ') || password.includes(' ')) {
		console.log('유저네임, 비번 사이에 공백 발견');
		res.send('공백이 있습니다. 허용되지 않는 값입니다.');
	} else if (password.length < 5 || password.length > 10) {
		res.send('비밀번호는 5자 이상 10자 이하로 설정해주세요.');
		console.log('비밀번호 길이 제한 위반');
		console.log(`Password: '${password}', Length: ${password.length}`);
	} else {
		next();
	}
}

function confirmPassword(req, res, next) {
	let confirmPassword = req.body.confirmPassword
		? req.body.confirmPassword.toString()
		: '';
	let password = req.body.password ? req.body.password.toString() : ''; // Add this line
	if (confirmPassword !== password) {
		res.send('확인 비밀번호가 일치하지 않습니다.');
		console.log('비밀번호 확인 불일치');
	} else {
		next();
	}
}

app.get('/login', async (req, res) => {
	res.render('login.ejs');
});
app.post('/login', usernameAndPasswordChecker, async (req, res, next) => {
	passport.authenticate('local', (error, user, info) => {
		if (error) return res.status(500).json(error);
		if (!user) return res.status(401).json(info.message);

		req.logIn(user, (err) => {
			if (err) return next(err);
			res.redirect('/');
			console.log(req.user.username, 'req.user @ passport authenticate');
		});
	})(req, res, next); // 'next' is built-in function of express
});

app.get('/register', async (req, res) => {
	res.render('register.ejs');
});
app.post(
	'/register',
	usernameAndPasswordChecker,
	confirmPassword,
	async (req, res) => {
		try {
			const hashedPassword = await bcrypt.hash(req.body.password, 10); // 10 is a commonly used salt rounds value
			await db.collection('user').insertOne({
				username: req.body.username,
				password: hashedPassword,
			});
			console.log('new user added');
			res.redirect('/');
		} catch (e) {
			console.error(e);
			res.status(500).send('Server Error on register');
		}
	}
);

app.use('/shop', require('./routes/shop.js'));
