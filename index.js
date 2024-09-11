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

app.post("/api/users/:_id/exercises", async (req, res) => {
  const id = req.params._id;
  const description = req.body.description;
  const duration = req.body.duration;
  const date = req.body.date;

  const exerciseDate = date ? new Date(date) : new Date();

  try {
    const result = await db.query(
      "INSERT INTO exercises (user_id, description, duration, date) VALUES ($1, $2, $3, $4) RETURNING *",
      [id, description, duration, exerciseDate]
    );
    const queryUsername = await db.query(
      "SELECT username FROM users WHERE user_id = $1",
      [id]
    );
    res.json({
      id: result.rows[0].user_id,
      username: queryUsername.rows[0].username,
      date: exerciseDate.toDateString(),
      duration: result.rows[0].duration,
      description: result.rows[0].description,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Database error" });
  }
});

app.get("/api/users/:_id/logs", async (req, res) => {
  const id = req.params._id;
  const from = req.query.from;
  const to = req.query.to;
  const limit = req.query.limit ? parseInt(req.query.limit) : null;

  /*   let query = `
    WITH filtered_logs AS (
      SELECT 
        u.user_id, 
        u.username, 
        COUNT(e.exercise_id) AS count,
        JSON_AGG(
          json_build_object(
            'description', e.description,
            'duration', e.duration,
            'date', to_char(e.date, 'Dy Mon DD YYYY')
          )
          ORDER BY e.date DESC
        ) AS log
      FROM users u
      LEFT JOIN exercises e ON u.user_id = e.user_id
      WHERE u.user_id = $1
        ${from ? "AND e.date >= $2::date" : ""}
        ${to ? `AND e.date <= $${from ? "3" : "2"}::date` : ""}
      GROUP BY u.user_id, u.username
    )
    SELECT 
      user_id AS "_id", 
      username, 
      count,
      CASE 
        WHEN $${from && to ? "4" : from || to ? "3" : "2"}::int IS NOT NULL THEN 
          (SELECT COALESCE(JSON_AGG(t), '[]'::json) 
           FROM (SELECT (t->>'description') as description,
                        (t->>'duration')::int as duration,
                        (t->>'date') as date
                 FROM JSON_ARRAY_ELEMENTS(log::json) t
                 LIMIT $${from && to ? "4" : from || to ? "3" : "2"}::int) t)
        ELSE 
          log
      END AS log
    FROM filtered_logs;
  `; */

  /* let query = `
    WITH filtered_logs AS (
      SELECT *
      FROM logs
      WHERE user_id = $1
    )
    SELECT 
      user_id AS "_id", 
      username, 
      CASE 
        WHEN $2::int IS NOT NULL THEN 
          LEAST(count, $2::int)
        ELSE 
          count
      END AS count,
      CASE 
        WHEN $2::int IS NOT NULL THEN 
          (SELECT COALESCE(JSON_AGG(t), '[]'::json) 
           FROM (SELECT (t->>'description') as description,
                        (t->>'duration')::int as duration,
                        (t->>'date') as date
                 FROM JSON_ARRAY_ELEMENTS(log::json) t
                 ${from ? "WHERE (t->>'date')::date >= $3::date" : ""}
                 ${to ? `${from ? "AND" : "WHERE"} (t->>'date')::date <= $${from ? "4" : "3"}::date` : ""}
                 LIMIT $2::int) t)
        ELSE 
          (SELECT COALESCE(JSON_AGG(t), '[]'::json)
           FROM JSON_ARRAY_ELEMENTS(log::json) t
           ${from ? "WHERE (t->>'date')::date >= $3::date" : ""}
           ${to ? `${from ? "AND" : "WHERE"} (t->>'date')::date <= $${from ? "4" : "3"}::date` : ""})
      END AS log
    FROM filtered_logs;
  `;*/

  let query = `
    WITH filtered_logs AS (
      SELECT *
      FROM logs
      WHERE user_id = $1
    ),
    processed_logs AS (
      SELECT 
        user_id,
        username,
        count,
        CASE 
          WHEN $2::int IS NOT NULL THEN 
            (SELECT COALESCE(JSON_AGG(filtered_log ORDER BY (filtered_log->>'date')::date DESC), '[]'::json)
             FROM (
               SELECT filtered_log
               FROM JSON_ARRAY_ELEMENTS(log::json) filtered_log
               WHERE ($3::date IS NULL OR (filtered_log->>'date')::date >= $3::date)
                 AND ($4::date IS NULL OR (filtered_log->>'date')::date <= $4::date)
               LIMIT $2
             ) subquery)
          ELSE 
            COALESCE(
              (SELECT JSON_AGG(filtered_log ORDER BY (filtered_log->>'date')::date DESC)
               FROM JSON_ARRAY_ELEMENTS(log::json) filtered_log
               WHERE ($3::date IS NULL OR (filtered_log->>'date')::date >= $3::date)
                 AND ($4::date IS NULL OR (filtered_log->>'date')::date <= $4::date)
              ), '[]'::json
            )
        END AS filtered_log
      FROM filtered_logs
    )
    SELECT 
      user_id AS "_id",
      username,
      count,
      filtered_log AS log
    FROM processed_logs;
  `;

  let queryParams = [id, limit, from, to];

  try {
    const result = await db.query(query, queryParams);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    res.json({
      _id: result.rows[0]._id,
      username: result.rows[0].username,
      count: parseInt(result.rows[0].count),
      log: result.rows[0].log,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Database error" });
  }
});
const listener = app.listen(process.env.PORT || 3000, () => {
  console.log("Your app is listening on port " + listener.address().port);
});
