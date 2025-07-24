const express = require("express");
const axios = require("axios");
require("dotenv").config({ path: require("path").resolve(__dirname, "../meowmeowapi/.env") });

const app = express();
const PORT = 3003;

app.use(express.json());

app.post("/", async (req, res) => {
  const { channel_id, msg } = req.body;

    console.log("Received request to send message to Discord:", { channel_id, msg });

  if (!channel_id || !msg) {
    return res.status(400).json({ error: "Missing channel_id or msg" });
  }

  try {
    const response = await axios.post(
      `https://discord.com/api/v10/channels/${channel_id}/messages`,
      msg,
      {
        headers: {
          Authorization: `Bot ${process.env.DISCORD_TOKEN}`,
          "Content-Type": "application/json",
        },
      }
    );

    console.log("✔️ Message sent to Discord successfully:", response.data);

    res.json({ status: "sent", data: response.data });
  } catch (err) {
    console.error("❌ Error sending to Discord:", err.response?.data || err.message);
    res.status(500).json({ error: err.response?.data || err.message });
  }
});

app.get("/", (_, res) => res.send("Bot server up."));

app.listen(PORT, "127.0.0.1", () =>
  console.log(`🌐 Bot HTTP server listening on 127.0.0.1:${PORT}`)
);


/*
curl -X POST http://localhost:3003/ \
  -H "Content-Type: application/json" \
  -d '{
    "channel_id": "1386700874805411960",
    "msg": {
      "content": null,
      "embeds": [
        {
          "title": "✨ Al Capwn #42",
          "author": {
            "name": "7.53% Increase"
          },
          "color": 16763931,
          "fields": [
            {
              "name": "Old RAP",
              "value": "123,000",
              "inline": true
            },
            {
              "name": "New RAP",
              "value": "132,260",
              "inline": true
            },
            {
              "name": "Sale Price",
              "value": "210,000",
              "inline": true
            },
            {
              "name": "Buyer",
              "value": "[@PlayerName](https://www.roblox.com/users/12345678/profile)",
              "inline": true
            },
            {
              "name": "Seller",
              "value": "[@SellerName](https://www.roblox.com/users/87654321/profile)",
              "inline": true
            }
          ],
          "description": "",
          "thumbnail": {
            "url": "https://tr.rbxcdn.com/someimage.png"
          }
        }
      ]
    }
  }'

*/