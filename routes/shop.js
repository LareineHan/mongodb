const router = require('express').Router();
let connectDB = require('./../database.js');

let db;
const url = process.env.DB_URL;
connectDB
	.then((client) => {
		console.log('DB연결성공 from shop.js');
		db = client.db('forum');
	})
	.catch((err) => {
		console.log(err);
	});

router.get('/', (req, res) => {
	res.send('Flag Shop');
});

router.get('/coffee', async (req, res) => {
	await db.collection('post').find().toArray();
	res.send('Coffee shop');
});

router.get('/goods', (req, res) => {
	res.send('Goods shop');
});

module.exports = router;
