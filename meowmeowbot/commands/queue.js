const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const { MongoClient } = require("mongodb");
const axios = require("axios");
const path = require("path");
require("dotenv").config({
  path: path.resolve(__dirname, "../../meowmeowapi/.env"),
});


const MONGO_URI = process.env.MONGO_URI;
const CHANNEL_ID = "1395779865696796693";
const COOKIE = process.env.ROBLOX_COOKIE;

const mongoClient = new MongoClient(MONGO_URI);
let dropCollection;

function userHasRole(interaction) {
  return interaction.member?.roles.cache.has("1397899730943479930");
}

function formatDuration(seconds) {
  if (seconds % 86400 === 0) return `${seconds / 86400}d`;
  if (seconds % 3600 === 0) return `${seconds / 3600}h`;
  if (seconds % 60 === 0) return `${seconds / 60}m`;
  return `${seconds}s`;
}

function parseDuration(str) {
  const match = str.match(/^(-?\d+)([hdmM])?$/);
  if (!match) return null;
  const num = parseInt(match[1]);
  const unit = match[2];
  switch (unit) {
    case "h": return num * 3600;
    case "d": return num * 86400;
    case "m": return num * 60;
    case "M": return num * 2592000;
    default: return num;
  }
}

async function connectDb() {
  if (!mongoClient.topology || !mongoClient.topology.isConnected()) {
    await mongoClient.connect();
  }
  const db = mongoClient.db("ArcadeHaven");
  dropCollection = db.collection("dropQueue");
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("queue")
    .setDescription("Add an item drop to the queue")
    .addIntegerOption(option =>
      option.setName("itemid").setDescription("ID of the item").setRequired(true))
    .addIntegerOption(option =>
      option.setName("price").setDescription("Price of the item").setRequired(true))
    .addIntegerOption(option =>
      option.setName("quantity").setDescription("Quantity to drop").setRequired(true))
    .addStringOption(option =>
      option.setName("duration")
        .setDescription("Duration (e.g. '1h', '30m', '0' for unique)")
        .setRequired(true))
    .addStringOption(option =>
      option.setName("type")
        .setDescription("Type of item (nonlimited, limited, unique)")
        .setRequired(true)),

  async execute(interaction) {
    if (!userHasRole(interaction)) {
      return interaction.reply({
        content: "❌ You don't have permission to use this command.",
        ephemeral: true,
      });
    }

    await connectDb();

    const itemId = interaction.options.getInteger("itemid");
    const price = interaction.options.getInteger("price");
    const quantity = interaction.options.getInteger("quantity");
    const durationStr = interaction.options.getString("duration");
    const delay = 900; // 15 minutes
    const type = interaction.options.getString("type");

    const duration = parseDuration(durationStr);

    if ([itemId, price, quantity, delay].some(v => v <= 0) || duration === null || duration < 0) {
      return interaction.reply({ content: "❌ Invalid numeric values or duration.", ephemeral: true });
    }

    // ✅ Get name + description from Roblox API
    let name = "Unknown Item";
    let description = "No description available.";
    try {
      const res = await axios.get(`https://economy.roblox.com/v2/assets/${itemId}/details`, {
        headers: {
          Cookie: `.ROBLOSECURITY=${COOKIE}`,
        },
      });
      name = res.data?.Name || name;
      description = res.data?.Description || description;
    } catch (e) {
      console.warn("⚠️ Failed to fetch item info from Roblox:", e.message);
    }

    const lastDrop = await dropCollection.find().sort({ scheduledAt: -1 }).limit(1).toArray();
    const lastTime = lastDrop.length > 0 ? lastDrop[0].scheduledAt : Math.floor(Date.now() / 1000);
    const now = Math.floor(Date.now() / 1000);
    const scheduledAt = Math.max(lastTime, now) + delay;
    const offsaleTime = (type === "nonlimited" || type === "limited") ? scheduledAt + duration : 0;

    const validTypes = ["nonlimited", "limited", "unique"];
    if (!validTypes.includes(type)) {
      return interaction.reply({ content: "❌ Invalid type provided.", ephemeral: true });
    }

    const drop = {
      itemId,
      name,
      description,
      price,
      quantity,
      duration,
      scheduledAt,
      offsaleTime,
      addedBy: interaction.user.id,
      addedAt: Date.now(),
      done: false,
      type,
    };

    await dropCollection.insertOne(drop);

    const embed = new EmbedBuilder()
    .setTitle("✅ Drop Scheduled")
    .setDescription(`Drop for **${name}** (ID: ${itemId}) has been scheduled.`)
    .addFields(
      { name: "Scheduled At", value: `<t:${scheduledAt}:F>`, inline: false },
      { name: "Type", value: type, inline: true },
      { name: "Quantity", value: quantity.toString(), inline: true },
      { name: "Duration", value: `${duration}s`, inline: true },
    )
    .setColor(0x45dd3c)
    .setTimestamp();

    await interaction.reply({
      embeds: [embed],
      ephemeral: false,
    });
  },

  async startDropper(client) {
    await connectDb();

    const dropChannel = await client.channels.fetch(CHANNEL_ID);
    if (!dropChannel) throw new Error("❌ Drop channel not found");

    setInterval(async () => {
      try {
        const now = Math.floor(Date.now() / 1000);
        const nextDrop = await dropCollection.findOne({
          done: false,
          scheduledAt: { $lte: now },
        });
        if (!nextDrop) return;

        // ✅ Fetch thumbnail
        let thumbnailUrl = null;
        try {
          const thumbRes = await axios.get(
            `https://thumbnails.roproxy.com/v1/assets?assetIds=${nextDrop.itemId}&returnPolicy=PlaceHolder&size=150x150&format=Png&isCircular=false`
          );
          thumbnailUrl = thumbRes.data?.data?.[0]?.imageUrl || null;
        } catch (err) {
          console.warn("⚠️ Thumbnail fetch failed:", err.message);
        }

        // ✅ Construct embed
        const embed = new EmbedBuilder()
          .setTitle(`🎉 New Drop: ${nextDrop.name}`)
          .setDescription(nextDrop.description || "No description available.")
          .addFields(
            { name: "Item ID", value: `${nextDrop.itemId}`, inline: true },
            { name: "Price", value: `${nextDrop.price} R$`, inline: true },
            { name: "Quantity", value: `${nextDrop.quantity}`, inline: true },
            { name: "Duration", value: formatDuration(nextDrop.duration), inline: true },
          )
          .setColor(0x45dd3c)
          .setTimestamp(new Date());

        if (thumbnailUrl) embed.setThumbnail(thumbnailUrl);

        await dropChannel.send({ embeds: [embed] });

        // ✅ Prevent duplicates in items
        const itemsCollection = mongoClient.db("ArcadeHaven").collection("items");
        const exists = await itemsCollection.findOne({ itemId: nextDrop.itemId });

        if (!exists) {
          const newItem = {
            itemId: nextDrop.itemId,
            name: nextDrop.name,
            creator: "ROBLOX",
            description: nextDrop.description,
            type: nextDrop.type,
            originalPrice: nextDrop.price,
            rap: nextDrop.price,
            value: 0,
            quantitySold: 0,
            totalQuantity: nextDrop.type === "unique" ? nextDrop.quantity : 0,
            offsaleTime: nextDrop.type === "limited" ? nextDrop.offsaleTime : 0,
            releaseTime: nextDrop.scheduledAt,
            projected: false,
            tradeable: true,
            reselling: [],
            history: [],
            serials: [],
          };

          await itemsCollection.insertOne(newItem);
          console.log(`✅ Inserted item ${nextDrop.name} (${nextDrop.itemId})`);
        } else {
          console.log(`ℹ️ Item ${nextDrop.itemId} already exists. Skipping insert.`);
        }

        await dropCollection.updateOne(
          { _id: nextDrop._id },
          { $set: { done: true } }
        );
      } catch (err) {
        console.error("❌ Dropper error:", err);
      }
    }, 15 * 1000);
  }

};
