const express = require("express");
const app = express();
const cors = require("cors");
const pg = require("pg");
const bodyParser = require("body-parser");
require("dotenv").config();

const db = new pg.Client({
  user: process.env.PG_USER,
  host: process.env.PG_HOST,
  database: process.env.PG_DATABASE,
  port: process.env.PG_PORT,
  password: process.env.PG_PASSWORD,
});

db.connect();
app.use(cors());
app.use(express.static("public"));
app.use(bodyParser.urlencoded({ extended: true }));

app.get("/", (req, res) => {
  res.sendFile(__dirname + "/views/index.html");
});

app.get("/api/users", async (req, res) => {
  try {
    const result = await db.query("SELECT * FROM users");
    //map returns an array of user objects
    const users = result.rows.map((row) => ({
      _id: row.id,
      username: row.username,
    }));
    res.json(users);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Database error" });
  }
});
app.post("/api/users", async (req, res) => {
  const username = req.body.username;
  try {
    const result = await db.query(
      "INSERT INTO users (username) VALUES ($1) RETURNING user_id, username",
      [username]
    );
    console.log(result.rows);

    res.json({
      _id: result.rows[0].user_id,
      username: result.rows[0].username,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Database error" });
  }
});

app.post("/api/users/:_id/exercises", (req, res) => {
  const id = req.params._id;
  const description = req.body.description;
  const duration = req.body.duration;
  const date = req.body.date;
});

const listener = app.listen(process.env.PORT || 3000, () => {
  console.log("Your app is listening on port " + listener.address().port);
});
