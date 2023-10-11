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

app.use(passport.initialize());
app.use(
	session({
		secret: '00',
		resave: false,
		saveUninitialized: false,
		cookie: { maxAge: 60 * 60 * 1000 }, // 1 hour for session
	})
);

let db;
const url =
	'mongodb+srv://user1:12345@cluster0.3ii0yjh.mongodb.net/?retryWrites=true&w=majority&appName=AtlasApp';
new MongoClient(url)
	.connect()
	.then((client) => {
		console.log('DB연결성공');
		db = client.db('forum');
		app.listen(8080, function () {
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
app.use(express.urlencoded({ extended: true }));
// 위 두줄은 유저가 입력한 값을 꺼내쓰는 코드를 도와주는 필수 코드

app.get('/', function (req, res) {
	res.sendFile(__dirname + '/index.html');
});

app.get('/about', function (req, res) {
	res.sendFile(__dirname + '/about.html');
});

app.get('/list', async (req, res) => {
	let result = await db.collection('post').find().toArray();
	// console.log(result[0]);
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

app.post('/add-post', async (req, res) => {
	console.log('New data requested on the form: ', req.body);
	let data = req.body;
	try {
		if (data.title === '' || data.content === '') {
			res.send('빈칸을 채워주세요');
			console.log('Not Added due to empty field');
		} else {
			await db
				.collection('post')
				.insertOne({ title: data.title, content: data.content });
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
			if (result.password == 입력한비번) {
				return cb(null, result);
			} else {
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

app.get('/login', async (req, res) => {
	res.render('login.ejs');
});
app.post('/login', async (req, res, next) => {
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
// app.post('/register', async (req, res) => {
// 	await bcrypt.hash('strings');
// 	await db.collection('user').insertOne({
// 		username: req.body.username,
// 		password: req.body.password,
// 	});
// 	res.redirect('/');
// });
